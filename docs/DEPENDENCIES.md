# LearnForge — Audited Dependency Registry

Every package added to the project must be documented in this registry before the phase is marked complete.

> **Registry Accuracy Standard**: This registry strictly distinguishes between the **Declared Version/Range** in `package.json` (e.g. `^18.3.1` allowing compatible minor updates) and the **Resolved Exact Version** locked in `package-lock.json` (e.g. `18.3.1`). Packages with caret ranges are not falsely described as pinned exact versions.

---

## Workspace Root Dependencies

### Development Tooling

| Package | Declared in `package.json` | Resolved in `package-lock.json` | Purpose | Selection Rationale | Alternatives Considered | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `concurrently` | `^9.1.2` | `9.2.4` | Orchestrate running client and server concurrently via single `npm run dev` script | Simple cross-platform npm script runner with zero configuration | `npm-run-all`, `turborepo` (overkill for Phase 00) | Development |

---

## Client Dependencies (`/client`)

### Production Runtime Dependencies

| Package | Declared in `package.json` | Resolved in `package-lock.json` | Purpose | Selection Rationale | Alternatives Considered | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `react` | `^18.3.1` | `18.3.1` | Core UI component model and declarative rendering engine | Industry standard, robust ecosystem, matches owner skills | Preact, Vue, Svelte | Runtime |
| `react-dom` | `^18.3.1` | `18.3.1` | DOM renderer for React components | Required companion for React web rendering | Native DOM manipulation | Runtime |
| `react-router-dom` | `^6.29.0` | `6.30.6` | Client-side routing, protected routes, and URL synchronization | Standard declarative routing for React SPAs | TanStack Router, custom state router | Runtime |

### Development & Build Dependencies

| Package | Declared in `package.json` | Resolved in `package-lock.json` | Purpose | Selection Rationale | Alternatives Considered | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `vite` | `^6.2.0` | `6.4.3` | Frontend dev server and Rollup production bundler | Instant HMR, native ESM support, minimal config | Webpack, Parcel | Development |
| `@vitejs/plugin-react` | `^4.3.4` | `4.7.0` | Babel/Fast Refresh integration for React in Vite | Official Vite plugin for React JSX compilation and HMR | `@vitejs/plugin-react-swc` | Development |
| `tailwindcss` | `^3.4.17` | `3.4.19` | Utility-first CSS framework for layout, spacing, and design tokens | Fast styling iteration, zero unused CSS in production bundle, strict token control | Plain CSS, styled-components | Development |
| `postcss` | `^8.5.3` | `8.5.28` | CSS post-processing pipeline for Tailwind and Autoprefixer | Required engine for Tailwind CSS processing | None (required by Tailwind) | Development |
| `autoprefixer` | `^10.4.20` | `10.6.1` | Adds vendor prefixes to CSS rules automatically based on CanIUse | Ensures cross-browser CSS compatibility | Manual prefixing | Development |
| `vitest` | `^3.0.7` | `3.2.7` | Blazing fast ESM-native test runner compatible with Vite | Uses exact same Vite transform pipeline, instant test feedback | Jest | Development |
| `jsdom` | `^26.0.0` | `26.1.0` | Headless DOM implementation for Node.js test environment | Enables testing React DOM components without real browser | Happy-DOM | Development |
| `@testing-library/react`| `^16.2.0` | `16.3.3` | User-centric React component testing utilities | Encourages testing actual DOM output rather than implementation details | Enzyme | Development |

---

## Server Dependencies (`/server`)

### Production Runtime Dependencies

| Package | Declared in `package.json` | Resolved in `package-lock.json` | Purpose | Selection Rationale | Alternatives Considered | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `express` | `^4.21.2` | `4.22.3` | HTTP API framework, routing, and middleware pipeline | Lightweight, ubiquitous, robust middleware ecosystem | Fastify, Koa, NestJS | Runtime |
| `cors` | `^2.8.5` | `2.8.6` | Configures Cross-Origin Resource Sharing headers for API security | Standard, reliable Express CORS middleware | Custom header middleware | Runtime |
| `cookie-parser` | `^1.4.7` | `1.4.7` | Parse and sign HTTP-only session cookies (`learnforge_session`) | De facto standard for cookie parsing in Express, zero dependencies | Manual cookie string splitting | Runtime |
| `dotenv` | `^16.4.7` | `16.6.1` | Loads environment variables from `.env` into `process.env` | Industry standard for 12-factor application configuration | Node native `--env-file` | Runtime |
| `express-rate-limit` | `^8.7.0` | `8.7.0` | IP-based request throttling on OTP request/verify and auth endpoints | Standard Express rate limiter, battle-tested, flexible error handler | Custom in-memory rate limiter | Runtime |
| `google-auth-library` | `^11.1.0` | `11.1.0` | Cryptographic verification of Google OpenID Connect ID tokens | Official Google SDK, caches Google public JWKS keys, handles rotation | Custom JWT verification via `jsonwebtoken` | Runtime |
| `mongoose` | `^8.12.1` | `8.24.4` | MongoDB Object Data Modeling (ODM), schema validation, indexes | Schema integrity, middleware hooks, rich query builder for document model | Native MongoDB driver, Prisma | Runtime |
| `morgan` | `^1.10.0` | `1.12.1` | HTTP request logging middleware with response time and correlation IDs | Standard, lightweight logging for developer observability | Pino, Winston | Runtime |
| `nodemailer` | `^10.0.14` | `10.0.14` | Real SMTP email transport for delivering 6-digit OTP verification codes | Standard, battle-tested, zero-native-dependency SMTP library for Node.js | `@sendgrid/mail`, `@resend/node`, AWS SES SDK | Runtime |

### Development & Testing Dependencies

| Package | Declared in `package.json` | Resolved in `package-lock.json` | Purpose | Selection Rationale | Alternatives Considered | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `vitest` | `^3.0.7` | `3.2.7` | Test runner for API integration and unit tests | Fast ESM-native execution, unified testing syntax across monorepo | Jest, Mocha | Development |
| `supertest` | `^7.0.0` | `7.3.1` | HTTP assertion library for testing Express endpoints without binding live ports | De facto standard for Express integration testing | Axios, native fetch against live port | Development |

---

## Phase 02 — Design System & UI Evaluation

During Phase 02 (Professional UI Shell & Design System), a deliberate architectural decision was made to **avoid introducing external component libraries** (such as Shadcn/Radix, MUI, Chakra, or Lucide icons):

| Candidate / Considered | Decision | Rationale | Alternatives Evaluated |
| :--- | :--- | :--- | :--- |
| `lucide-react` / `@heroicons/react` | **Rejected** | Introducing a 1,000+ icon package increases dependency surface area, bundle bloat, and version churn. Instead, LearnForge implemented a native, high-performance SVG vector icon primitive (`client/src/components/ui/Icon.jsx`) utilizing a unified 1.5-stroke aesthetic with exactly 24 tailored icons and zero runtime dependencies. | External icon packages |
| `@radix-ui/*` / `headlessui` | **Rejected** | LearnForge requirements prioritized custom design system control, calm low-distraction styling, keyboard trap control, and zero glassmorphism. Hand-crafted primitives (`Dialog`, `Dropdown`, `Tabs`, `Button`, `Input`) in Tailwind CSS fulfilled all accessibility requirements (WCAG AA, ARIA roles, Escape dismiss, focus trap) with zero third-party packages. | Radix Primitives, Headless UI |

---

## Dependency Management Rules
1. **Never install unvetted libraries**: Trivial one-line helpers or packages with heavy transitive dependencies must be avoided.
2. **Lockfile Enforcement**: `package-lock.json` is strictly committed and maintained.
3. **No Unnecessary Upgrades**: Package versions must remain stable within a phase unless a documented bug or security advisory requires a change.
4. **Regular Security Auditing**: Every phase validates package hygiene via `npm audit`.
