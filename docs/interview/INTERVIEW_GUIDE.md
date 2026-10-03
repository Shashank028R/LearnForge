# LearnForge — Technical Interview Preparation Guide

This living guide is continuously synchronized with the actual implementation of LearnForge. Every answer reflects concrete engineering decisions and codebase artifacts.

---

## 1. Project High-Level Overview

### Q1: What problem does LearnForge solve?
**Answer**:  
Standard AI chatbots (like ChatGPT or Claude) provide immediate, helpful answers, but insights remain trapped in ephemeral chat logs. When a session ends, the learning disappears, misconceptions go undetected, retention is unverified, and notes must be manually written.  
LearnForge treats **chat as the interaction layer and structured knowledge as the durable product**. It automatically extracts concepts, evaluates student comprehension in a strict pedagogical loop, updates structured block-based notes, and generates targeted quizzes directly from studied concepts.

### Q2: How does LearnForge differ from a generic "AI wrapper"?
**Answer**:  
A generic AI wrapper simply proxies chat prompts to an LLM with a system message. LearnForge introduces:
1. **A Canonical Knowledge Engine**: Decouples the chat transcript from the user's actual mastery state (ADR-004).
2. **Pedagogical Strictness**: Study Mode doesn't passively validate vague answers; it challenges reasoning, detects misconceptions, and requires active recall.
3. **Safe Note Automation**: AI updates are subject to risk policies (ADR-007) and immutable version snapshots (ADR-005) so user-authored notes are never silently overwritten.
4. **Provider-Agnostic Gateway**: Task-based model routing isolates business logic from vendor SDKs (ADR-002).

---

## 2. Phase 00 — Foundation & Repository Architecture

### Q3: Why did you choose a decoupled monorepo (`/client` and `/server`) with npm workspaces instead of heavy tools like Turborepo or Nx?
**Answer**:  
For Phase 00, introducing Turborepo, Nx, or Lerna would add speculative tooling complexity, unnecessary config, and build-cache overhead without immediate benefit. Native **npm workspaces** provides clean package separation, hoisted dependency management, unified scripts (`npm test`, `npm run dev`), and strict boundaries between frontend and backend while maintaining lightweight simplicity. If monorepo build times or caching ever become a bottleneck in future phases, migrating from npm workspaces to Turborepo is trivial.

### Q4: Why use standard JavaScript (ES Modules) instead of TypeScript?
**Answer**:  
The choice was deliberate to reduce language transpilation overhead, eliminate type-wrangling friction during rapid domain modeling, and align directly with the project owner's core development velocity. Clean ES Modules with Node 20+, JSDoc annotations, and runtime schema validation (e.g. Zod in later phases) give robust architectural clarity and fast iteration without build friction.

### Q5: Why did you choose Vitest across both frontend and backend instead of Jest?
**Answer**:  
1. **Unified Tooling**: Vitest shares the exact same transformation pipeline and config as Vite on the frontend, avoiding duplicated Babel/Webpack configs.
2. **ESM-Native**: Jest requires complex Babel transforms or experimental flags to handle native ES modules (`import`/`export`), whereas Vitest is ESM-native by default.
3. **Execution Speed**: Vitest uses worker threads and Vite's fast esbuild transform, running the backend integration tests and frontend component tests in under 2 seconds.
4. **Supertest Compatibility**: Supertest integrates seamlessly with Vitest to test Express HTTP endpoints without binding live TCP ports.

### Q6: How does the server handle database connectivity gracefully during development or outages?
**Answer**:  
In `server/src/config/database.js`, connection attempts to MongoDB are managed with a 3-second timeout (`serverSelectionTimeoutMS: 3000`). If MongoDB is offline or unreachable during local development, the server logs a clear diagnostic warning and continues in degraded mode rather than crashing the Node.js process. The runtime database state (`connected`, `disconnected`, `connecting`) is exposed in the `GET /api/v1/health` endpoint, making system health observable to monitoring tools and UI health probes.

### Q7: Why did you introduce `X-Request-ID` correlation IDs in Phase 00?
**Answer**:  
In a distributed or multi-service architecture (and especially when coordinating requests with external AI providers), request tracing is critical. The `requestIdMiddleware` in `server/src/middleware/requestId.js` checks for an incoming `x-request-id` header or generates a cryptographically secure UUID (`crypto.randomUUID()`). This ID is:
- Attached to the response header (`X-Request-Id`).
- Logged with every HTTP request via Morgan.
- Returned in every API error envelope (`{ success: false, error: {...}, requestId }`).  
This ensures that any client error or AI provider timeout can be immediately correlated to server logs.

### Q8: During your architecture review, what major contradiction or risk did you identify regarding chat latency and knowledge extraction?
**Answer**:  
The initial specification described an event flow where a user chat message triggered conversation persistence, AI concept detection, knowledge state updates, and note change diffs. If this entire pipeline executed synchronously within the `POST /chats/:chatId/messages` HTTP request, user-perceived chat latency would exceed 10–15 seconds.  
I resolved this by architecting the pipeline as **decoupled and asynchronous**: the chat response generates and streams/responds to the user immediately, while a domain event is dispatched to trigger the knowledge analysis and note proposal jobs in the background.

---

## 3. General Architecture & System Design Questions

### Q9: Explain the high-level layered architecture.
**Answer**:  
LearnForge follows a 4-tier layered architecture:
1. **Client Layer**: React SPA (web) and future mobile clients consuming standard `/api/v1` REST APIs.
2. **API & Middleware Layer**: Express HTTP routes, correlation ID tracking, rate limiting, and session authentication.
3. **Domain Services Layer**: Discrete domain boundaries—Auth, Study, Conversation, Knowledge Engine, Notes Engine, Quiz Engine, Import Engine, and the AI Gateway.
4. **Persistence & External Adapter Layer**: MongoDB (Mongoose ODM), object storage, external AI providers (Gemini, OpenAI, Anthropic), and transactional email.

### Q10: Why does LearnForge have an AI Gateway rather than calling provider SDKs directly from controllers?
**Answer**:  
Coupling controllers to specific AI SDKs causes vendor lock-in, scatters prompt templates across the codebase, makes testing difficult, and complicates fallback handling. The AI Gateway (ADR-002) abstracts providers behind capability contracts (`aiGateway.generate({ taskType, input, outputSchema })`). The task router automatically selects the optimal model based on reasoning complexity, latency, and cost, while normalizing provider errors and tracking token telemetry.

---

## 4. Documentation & Engineering Discipline

### Q11: What is the "Definition of Done" for LearnForge features?
**Answer**:  
Under ADR-008, a feature is **not** done merely because code was written. A feature is complete only when:
1. Requirements are implemented.
2. Automated unit/integration tests pass.
3. Standard error envelopes and edge cases are handled.
4. Relevant documentation is updated (`PROJECT_CONTEXT.md`, `CHANGELOG.md`, `DEPENDENCIES.md`, `INTERVIEW_GUIDE.md`).
5. A dedicated Phase Report is authored.
6. The implementation can be defended and explained in a technical interview.

---

## 5. Phase 01 — Authentication & User Identity Architecture

### Q12: Why did you choose self-managed sessions instead of managed services like Clerk, Supabase, or Auth0?
**Answer**:  
While managed providers like Clerk or Supabase offer out-of-the-box UI and auth workflows, LearnForge chose self-managed authentication for specific architectural reasons:
1. **Direct Data Co-location & Domain Integrity**: LearnForge's core domain models (`User`, `UserPreferences`, `Subject`, `StudySession`) live in MongoDB. With managed auth, the primary identity lives in an external cloud database or PostgreSQL (in Supabase's case), requiring fragile webhook syncing or dual-write distributed transactions to keep user records synchronized with MongoDB.
2. **Pedagogical Session Control**: LearnForge requires absolute programmatic control over session invalidation (such as revoking all active sessions upon security incidents or resetting study states) without paying per-MAU tier jumps or vendor lock-in fees.
3. **Portability & Cost**: Self-managed auth eliminates recurring third-party auth subscriptions, running directly on our Express backend and MongoDB infrastructure while remaining fully portable across hosting environments.

### Q13: Why not Clerk or Supabase specifically?
**Answer**:  
1. **Clerk**: While Clerk provides polished widgets and supports email OTP + Google OAuth, it operates as a hosted identity silo. User identity webhooks must be received, verified, and mapped into MongoDB. Furthermore, Clerk pricing escalates rapidly with monthly active users ($0.02+/MAU after free tier), penalizing high-volume student usage.
2. **Supabase**: Supabase Auth (GoTrue) is tightly coupled to PostgreSQL row-level security (RLS). Using Supabase solely for authentication while running LearnForge’s document graphs and hierarchical study trees in MongoDB introduces architectural dissonance—managing both Postgres and MongoDB databases simultaneously without leveraging Supabase's core RLS or Postgres ecosystem.

### Q14: How does Google authentication work in LearnForge, and why MUST credentials be validated on the server?
**Answer**:  
1. **Workflow**: The frontend uses Google Identity Services to authenticate the user and obtain an OpenID Connect (OIDC) ID token (JWT) signed by Google's private keys. The frontend posts this credential to `POST /api/v1/auth/google`.
2. **Server-Side Validation**: In `GoogleAuthService.js`, the server uses `google-auth-library` (`OAuth2Client.verifyIdToken`) to fetch Google's public certificates (via JWKS) and cryptographically verify:
   - **Signature**: Verified using Google's asymmetric public keys.
   - **Audience (`aud`)**: Must strictly match our configured `GOOGLE_CLIENT_ID`.
   - **Issuer (`iss`)**: Must be `accounts.google.com` or `https://accounts.google.com`.
   - **Expiration (`exp`)**: Token must not be expired (`exp > now`).
3. **Why Server-Side**: If the server trusted client-supplied claims (e.g. `{ email: "victim@example.com", name: "Victim" }`), an attacker could simply send any JSON payload with an arbitrary user's email and take over their account. Server-side cryptographic signature and audience verification guarantees that Google attested to that specific user's identity for our application.

### Q15: Why use opaque database-backed sessions instead of stateless JWTs stored in the browser?
**Answer**:  
Stateless JWTs stored in browser localStorage or cookies cannot be revoked instantly without maintaining a distributed denylist (which defeats the "stateless" benefit). If a user's laptop is stolen, an attacker can use a leaked JWT until its expiration time expires.  
In LearnForge:
- **Instant Revocation**: When a user clicks "Log out" or "Log out all devices", the server updates or deletes the `UserSession` document in MongoDB. The next incoming request is immediately rejected.
- **Opaque Entropy**: The client receives a 256-bit high-entropy random hex token (`crypto.randomBytes(32)`). It contains zero user data, no metadata, and no claims.
- **Security Posture**: No client-side decoding or signature tampering risk.

### Q16: Why do you hash session tokens before storing them in MongoDB?
**Answer**:  
If the MongoDB database is ever compromised, read via SQL/NoSQL injection, or exposed in an unencrypted backup snapshot, raw session tokens stored in plaintext would allow attackers to impersonate every active user on the platform.  
By storing only the cryptographic SHA-256 hash of the session token (`crypto.createHash('sha256').update(rawToken).digest('hex')`):
- The token behaves like a password: the server hashes the incoming token and looks up `sessionTokenHash`.
- An attacker with read access to MongoDB cannot derive the raw 256-bit bearer token because SHA-256 is a one-way cryptographic hash function with $2^{256}$ search complexity.

### Q17: Why use HTTP-only, SameSite, Secure cookies for web sessions?
**Answer**:  
1. **`HttpOnly: true`**: Prevents browser JavaScript from accessing the cookie (`document.cookie`). Even if an XSS vulnerability exists on the frontend, malicious scripts cannot extract or exfiltrate the session token.
2. **`Secure: true`**: In production, forces cookies to be transmitted only over encrypted TLS/HTTPS connections, preventing cleartext sniffing on untrusted networks.
3. **`SameSite: 'lax'`** (or `'strict'`): Prevents Cross-Site Request Forgery (CSRF). The browser refuses to send the cookie on cross-site state-changing requests (like cross-origin POSTs), neutralizing classic CSRF attacks without requiring complex token exchanges.

### Q18: How does "Logout from all devices" work?
**Answer**:  
When a user calls `POST /api/v1/auth/logout-all`:
1. The authentication middleware validates the caller's active session and extracts `req.user._id`.
2. The controller executes:
   ```javascript
   await UserSession.updateMany(
     { userId: req.user._id, revokedAt: null },
     { $set: { revokedAt: new Date() } }
   );
   ```
3. The server clears the active session cookie in the client response.
4. Any other browser or mobile client attempting a request with an existing session token is immediately rejected because `revokedAt` is no longer `null`.

### Q19: How do you prevent brute-force attacks against 6-digit email OTPs?
**Answer**:  
A 6-digit OTP has only $10^6$ (1,000,000) possible combinations. Without protection, an attacker could iterate all codes in minutes. We implement multi-layered defenses:
1. **Strict Attempt Counter**: Each OTP document tracks `attempts`. After 5 incorrect attempts, the token is permanently invalidated and deleted. 5 attempts out of $1,000,000$ represents a $0.0005\%$ probability of guessing correctly.
2. **Short Time-to-Live (TTL)**: OTPs expire in 10 minutes (`expiresAt`).
3. **Resend Throttling**: A 60-second cooldown is enforced between requests for the same email.
4. **IP Rate Limiting**: `express-rate-limit` caps OTP verification requests to 10 per 15 minutes per IP address, preventing distributed brute-force.
5. **HMAC-SHA-256 with Server Pepper**: OTPs are hashed at rest using HMAC-SHA-256 with a secret server-side pepper (`OTP_HMAC_SECRET`). Even if the database is leaked, an offline brute-force attack cannot succeed without the application server's pepper.
6. **Constant-Time Comparison**: Verification uses `crypto.timingSafeEqual` to prevent timing side-channel attacks.

### Q20: How do you prevent account enumeration on the OTP request endpoint?
**Answer**:  
When a user submits `POST /api/v1/auth/otp/request` with an email address:
- If the email belongs to an existing user: an OTP is generated and emailed.
- If the email does NOT belong to an existing user: an OTP is still generated, stored, and emailed (as LearnForge allows passwordless onboarding).
- If any internal condition occurs, the HTTP response envelope **always** returns the exact same payload:
  ```json
  {
    "success": true,
    "data": {
      "message": "If the email is valid, a verification code has been sent.",
      "expiresIn": 600,
      "resendCooldown": 60
    }
  }
  ```
The response reveals zero difference in timing or structure between registered and unregistered accounts, completely eliminating account enumeration.

### Q21: How do you safely and deterministically link Google and Email identities (ADR-010)?
**Answer**:  
1. **Rule**: External OAuth accounts are linked to existing users **only if** the OAuth provider cryptographically certifies that the email is verified (`email_verified === true`) and matches an existing `User.normalizedEmail`.
2. **Deterministic Lookup**:
   - First, query `AuthIdentity` by `provider: 'google'` and `providerSubject: payload.sub`. If found, authenticate that user immediately.
   - If not found, query `User` by `normalizedEmail`.
   - If an existing user exists and Google asserts `email_verified: true`, create a new `AuthIdentity` linked to that `existingUser._id`.
   - If no user exists, bootstrap a new `User` and create the `AuthIdentity` inside an idempotent creation flow.
3. **Security Boundary**: We never allow client-initiated linking or unverified emails (`email_verified: false`) to merge into existing accounts, preventing account hijacking.

### Q22: How will future mobile authentication work without breaking web cookie security?
**Answer**:  
In `server/src/middleware/auth.js`, the authentication middleware employs a dual-credential extraction strategy with strict precedence:
1. **Cookie Inspection**: Checks `req.cookies[SESSION_COOKIE_NAME]` (first-class for browsers).
2. **Bearer Token Inspection**: If no cookie is present, checks `Authorization: Bearer <session-token>`.
3. Both extraction paths pass the extracted token into the identical SHA-256 hash resolver and MongoDB lookup.
4. Mobile clients can safely store the raw token in secure platform storage (iOS Keychain, Android Keystore) and attach it as a Bearer header, while web clients benefit from HttpOnly cookies immune to XSS.

### Q23: How do you handle concurrent signup/login requests and race conditions?
**Answer**:  
1. **Compound Unique Indexes**: `AuthIdentity` enforces `{ provider: 1, providerSubject: 1 }` with `{ unique: true }`. `User` enforces `{ normalizedEmail: 1 }` with `{ unique: true }`.
2. **MongoDB Duplicate Key Handling**: If two concurrent Google sign-in requests for the same new user hit the server simultaneously, both will attempt creation. One succeeds; the second hits MongoDB duplicate key error code `11000`. The catch block intercepts error code 11000 and recovers by re-querying the existing record rather than failing with a 500 error.

### Q24: What are the engineering trade-offs of your authentication design?
**Answer**:  
- **Trade-off 1: Database Trip on Authenticated Requests vs. Stateless JWT**:  
  *Cost*: Every protected API call performs an indexed query on `UserSession` and `User`.  
  *Benefit*: Instant session revocation, real-time user status checks (active/suspended), and zero JWT stale claim risks. MongoDB indexed lookups take <1ms.
- **Trade-off 2: Self-Managed Auth vs. Turnkey SaaS**:  
  *Cost*: We wrote ~1,500 lines of robust auth code, tests, and crypto utilities.  
  *Benefit*: Zero recurring SaaS cost, complete architectural control, zero cross-database sync webhooks, and identical local/offline development velocity.

### Q25: Why don't you store the session token in localStorage?
**Answer**:  
Because the web application uses an `HttpOnly` cookie so JavaScript cannot directly read the authentication credential (`document.cookie`). Storing the raw session token in `localStorage` would unnecessarily expose a bearer credential to JavaScript and dramatically increase the blast radius of any Cross-Site Scripting (XSS) vulnerability. Mobile bearer-token support is retained at the backend boundary without exposing the token through normal browser authentication responses.

### Q26: How will mobile authentication work?
**Answer**:  
The backend authentication middleware (`authenticateUser`) retains first-class Bearer token resolution (`Authorization: Bearer <session-token>`). Future mobile clients will obtain this token through a dedicated mobile authentication flow (such as an explicit mobile token-issuance endpoint or OAuth PKCE flow), rather than leaking the web session token to browser JavaScript. Mobile clients will securely store the token in hardware-backed storage (iOS Keychain or Android Keystore) and attach it to subsequent requests.

---

## 6. Phase 02 — Professional UI Shell & Design System

### Q27: Why did you avoid a component library (e.g. Radix, MUI, Chakra) and build a controlled design system?
**Answer**:  
1. **Zero Bundle Bloat & Zero Version Churn**: External UI component libraries bring extensive runtime code, complex styling abstractions, and frequent breaking changes.
2. **Strict Aesthetic & Brand Control**: Prebuilt component libraries tend to look like generic SaaS templates. LearnForge requires a calm, information-dense, distraction-free environment tailored for hours of intense academic study.
3. **Targeted Accessibility Without Indirection**: By crafting atomic primitives (`Button`, `Input`, `Dialog`, `Dropdown`, `EmptyState`, `Skeleton`) directly in React with Tailwind semantic tokens, we maintain 100% control over ARIA attributes, focus management, keyboard handlers (Escape, Tab), and touch targets without wrapper overhead.

### Q28: How did you structure reusable React components?
**Answer**:  
Components follow a strict atomic separation of concerns:
- `client/src/components/ui/`: Micro-primitives (`Button`, `IconButton`, `Input`, `Badge`, `Avatar`, `Dialog`, `Dropdown`, `EmptyState`, `Skeleton`, `LoadingState`, `ErrorState`, `Tabs`, `Divider`, `Icon`). These contain zero domain-specific or API business logic; they operate purely on props and accessible callbacks.
- `client/src/components/layout/`: Structural frame components (`Sidebar`, `TopBar`, `UserNav`, `AppShell`) that manage application navigation state, breadcrumbs, responsive drawer behavior, and user account actions.
- `client/src/components/auth/`: Specialized authentication views (`AuthModal`) refactored to consume UI primitives while integrating with the `useAuth()` context.
- `client/src/pages/`: Route-level views consuming layout context and rendering authentic empty states without fake data.

### Q29: How does the authenticated shell know whether the user is logged in?
**Answer**:  
On application mount, `AuthProvider` (`client/src/context/AuthContext.jsx`) executes a session hydration probe: `GET /api/v1/auth/me` with `credentials: 'include'`.
- If the browser holds a valid `HttpOnly` session cookie (`learnforge_session`), the backend verifies the SHA-256 hash in MongoDB and returns `{ user, session }`. The client sets `user`, `session`, `isAuthenticated = true`, and `loading = false`.
- If no cookie exists or the session is expired/revoked, the server returns 401. The client sets `user = null`, `session = null`, `isAuthenticated = false`, and `loading = false`.
- The shell re-renders reactively without storing any credentials in JavaScript `localStorage` or `sessionStorage`.

### Q30: How do protected routes work?
**Answer**:  
In `client/src/routes/ProtectedRoute.jsx`:
1. It queries `const { isAuthenticated, loading } = useAuth();`.
2. While `loading === true`, it renders a calm `<LoadingState type="route" message="Validating secure session..." />`.
3. If `loading === false` and `isAuthenticated === false`, rather than abruptly bouncing the user with jarring URL redirects, it renders an accessible `<EmptyState>` with a shield icon, explanation ("This section of your workspace requires an active, authenticated LearnForge session"), and a direct `[Sign In]` button that opens `AuthModal`.
4. If authenticated, it renders `children`.

### Q31: How did you make the application responsive?
**Answer**:  
1. **Desktop (>= 768px)**: The `<Sidebar>` is a persistent, sticky 240px (`w-60`) vertical rail. The main workspace frame scrolls independently without horizontal overflow.
2. **Mobile (< 768px)**:
   - The desktop sidebar is hidden (`hidden md:block`).
   - The `<TopBar>` dynamically exposes an accessible hamburger icon button (`IconButton` with `aria-label="Open navigation menu"`).
   - Clicking the hamburger opens an off-canvas drawer overlay (`fixed inset-0 z-50`) with a dark backdrop. Clicking the backdrop or navigating to any link automatically closes the drawer.
   - Touch targets for buttons, inputs, and tabs meet the minimum 44x44px ergonomic standard.

### Q32: How did you handle loading and empty states?
**Answer**:  
- **Loading States**: Full-screen spinners were eliminated. Instead, `Skeleton.jsx` provides animated pulse placeholders matching the exact physical layout of future cards, list rows, or text blocks. For initial route boot, `LoadingState.jsx` provides a subtle indicator.
- **Empty States**: Generic or decorative illustrations were replaced with clean, calm `<EmptyState>` components. Each empty state communicates:
  1. What is currently missing (e.g. "No subjects yet.").
  2. Why it is empty and how it will populate (e.g. "Create your first subject to organize study material...").
  3. A clear, single primary action button (e.g. `[Create Subject]`).
  Crucially, zero fake data, mock streak counters, or synthetic activity graphs were fabricated.

### Q33: How did you approach accessibility (A11y)?
**Answer**:  
- **Keyboard Navigation**: Universal focus ring (`*:focus-visible` with `ring-2 ring-brand-500 ring-offset-1`). All interactive elements are native semantic HTML `<button>`, `<a>`, `<input>` elements. No unsemantic `<div onClick>` elements.
- **Accessible Names**: All icon buttons enforce explicit `aria-label` attributes.
- **Form Controls**: Inputs link labels via `htmlFor`, errors via `role="alert"`, and inputs via `aria-invalid="true"` and `aria-describedby`.
- **Dialogs**: `Dialog.jsx` and `AuthModal.jsx` implement `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`, Escape-key listeners, and focus traps.
- **Contrast Ratios**: Color tokens pass WCAG AA contrast standards (minimum 4.5:1 for standard text against light and dark surfaces).

### Q34: Why avoid glassmorphism and heavy visual effects?
**Answer**:  
Glassmorphism (translucent cards with `backdrop-filter: blur()`, glowing borders, and floating colorful gradient blobs) is a fleeting visual gimmick popular in AI demos that actively harms serious productivity:
1. **Visual Fatigue**: Excessive blur and glow distract the human eye, increasing cognitive strain during long reading and study sessions.
2. **Accessibility Failure**: Transparent and translucent backgrounds make text contrast unpredictable across varied backgrounds.
3. **GPU Performance Overhead**: Heavy `backdrop-filter` triggers continuous GPU composition layers, causing frame drops and battery drain on laptops and mobile devices.
LearnForge uses solid surfaces, crisp 1px neutral borders (`var(--color-border-default)`), and deliberate typography hierarchy to establish quality.

### Q35: How would the same design system evolve when Chat, Notes, and Study Mode are introduced?
**Answer**:  
Because the design system is decoupled from feature logic and built on foundational tokens:
1. **Chat (Phase 04)**: The main workspace container will host the conversational thread, utilizing `Avatar` for user/assistant messages, `Input`/`Textarea` for the message prompt, and `Skeleton` for streaming chunk placeholders.
2. **Notes (Phase 07)**: The structured block note editor will use the typography scale (`.text-title`, `.text-body`, `font-mono`) and 1px border dividers without needing custom CSS overrides.
3. **Study Mode (Phase 08)**: The distraction-free mode will cleanly collapse the `<Sidebar>`, centering the active recall card within the max-width content container while preserving dark/light mode tokens.

