# LearnForge — Pre-Phase-03 Integration, API & Credential Audit

This document establishes the canonical pre-Phase-03 audit of the LearnForge codebase, detailing all currently implemented API endpoints, external service integrations, credential requirements, security verification results, and live integration statuses.

---

## 1. Inventory of Currently Implemented API Endpoints

A comprehensive audit of `server/src/routes/` and Express routers reveals **exactly seven (7)** implemented backend endpoints. No other endpoints exist in the repository at this phase.

| Method | Full Route Path | Purpose | Visibility / Protection | Auth Mechanism | Request Payload / Params | Successful Response | Error Responses | Rate Limits | Dependencies | Automated Test Coverage | Live Verification State |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service liveness & database status | Public | None | None | `200 OK`<br>`{ status: 'healthy', database: 'connected'/'disconnected', ... }` | `500` (server fault) | None | Node process, MongoDB connection status | Unit/Integration (`health.test.js`) | ✅ Live verified |
| `POST` | `/api/v1/auth/otp/request` | Initiate passwordless email OTP verification | Public | None | JSON: `{ "email": string }` | `200 OK`<br>`{ message: "...", cooldownSeconds: 60, expiresInMinutes: 10 }` | `400` (malformed email),<br>`429` (cooldown active / IP limit),<br>`503` (DB offline) | 5 req / 15 min per IP; 60s per-email cooldown | MongoDB (`EmailOtpToken`), `EmailService` | Integration (`auth.test.js`, 21 tests) | ⚠️ **BLOCKED / NOT LIVE-VERIFIED** (Awaiting SMTP / Mongo credentials) |
| `POST` | `/api/v1/auth/otp/verify` | Verify 6-digit OTP, bootstrap user, issue session | Public | None | JSON: `{ "email": string, "code": "123456" }` | `200 OK`<br>`{ user: {...}, session: { id, expiresAt, authMethod } }`<br>+ `Set-Cookie: learnforge_session` | `400` (invalid OTP / expired),<br>`429` (5 attempts exceeded),<br>`503` (DB offline) | 10 req / 15 min per IP; max 5 attempts per token | MongoDB (`EmailOtpToken`, `User`, `AuthIdentity`, `UserSession`) | Integration (`auth.test.js`) | ⚠️ **BLOCKED / NOT LIVE-VERIFIED** (Awaiting SMTP / Mongo credentials) |
| `POST` | `/api/v1/auth/google` | Verify Google ID token, link identity, issue session | Public | None | JSON: `{ "idToken": string }` | `200 OK`<br>`{ user: {...}, session: { id, expiresAt, authMethod } }`<br>+ `Set-Cookie: learnforge_session` | `400` (missing/invalid token),<br>`401` (invalid Google token),<br>`403` (unverified email / disabled),<br>`503` (DB offline) | 15 req / 15 min per IP | Google Auth Library, Google JWKS, MongoDB (`User`, `AuthIdentity`, `UserSession`) | Integration (`googleAuthService.test.js`, `auth.test.js`) | ⚠️ **BLOCKED / NOT LIVE-VERIFIED** (Awaiting Google Client ID & Mongo credentials) |
| `GET` | `/api/v1/auth/me` | Hydrate active user identity & session metadata | Protected | `learnforge_session` cookie (or `Bearer <token>`) | Cookie or `Authorization` header | `200 OK`<br>`{ user: {...}, session: {...} }` | `401` (missing credentials / expired / revoked / inactive user),<br>`503` (DB offline) | Standard Express pipeline | MongoDB (`UserSession`, `User`) | Integration (`auth.test.js`) | ⚠️ **BLOCKED / NOT LIVE-VERIFIED** (Requires active live session & Mongo) |
| `POST` | `/api/v1/auth/logout` | Revoke active session and clear cookie | Protected | `learnforge_session` cookie (or `Bearer <token>`) | Cookie or `Authorization` header | `200 OK`<br>`{ message: "Logged out successfully." }`<br>+ `Clear-Cookie: learnforge_session` | `401` (unauthenticated),<br>`503` (DB offline) | Standard Express pipeline | MongoDB (`UserSession`) | Integration (`auth.test.js`) | ⚠️ **BLOCKED / NOT LIVE-VERIFIED** (Requires active live session & Mongo) |
| `POST` | `/api/v1/auth/logout-all` | Revoke all active sessions across all devices | Protected | `learnforge_session` cookie (or `Bearer <token>`) | Cookie or `Authorization` header | `200 OK`<br>`{ message: "All active sessions across all devices have been revoked." }` | `401` (unauthenticated),<br>`503` (DB offline) | Standard Express pipeline | MongoDB (`UserSession`) | Integration (`auth.test.js`) | ⚠️ **BLOCKED / NOT LIVE-VERIFIED** (Requires active live session & Mongo) |

---

## 2. External Integration Discovery & Status

A full scan across all source code, dependencies, and environment files classifies external services into **Currently Required** versus **Future Phase Requirements**:

| Service / Integration | Used by Current Code? | Required Now for Live Verification? | Credential / Config Required | Classification | Status |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **Google Identity Services (OIDC)** | **YES** | **YES** | `VITE_GOOGLE_CLIENT_ID` (client)<br>`GOOGLE_CLIENT_ID` (server) | Public Client ID (both) | **IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED** |
| **Email SMTP Transport (`nodemailer`)** | **YES** | **YES** | `EMAIL_PROVIDER=smtp`<br>`SMTP_HOST`<br>`SMTP_PORT`<br>`SMTP_USER`<br>`SMTP_PASS`<br>`EMAIL_FROM` | Config (host, port, from)<br>Secret (`SMTP_USER`, `SMTP_PASS`) | **IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED** |
| **MongoDB Database** | **YES** | **YES** | `MONGODB_URI` (local or Atlas) | Connection String / Secret (if Atlas) | **IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED** (Local MongoDB port 27017 inactive) |
| **Google OAuth Client Secret** | **NO** | **NO** | `GOOGLE_CLIENT_SECRET` | Secret | **NOT USED** (GIS client-side ID token verification does not require a client secret) |
| **Transactional SaaS APIs (Resend, SendGrid, Mailgun)** | **NO** | **NO** | API Keys | Secret | **NOT USED IN CODE** (Only standard SMTP is implemented in `EmailService.js`) |
| **AI Providers (Gemini, OpenAI, Anthropic)** | **NO** | **NO** | API Keys | Secret | **FUTURE PHASE REQUIREMENT (Phase 05 AI Gateway)** — Do not configure now |
| **Payment Gateways (Stripe)** | **NO** | **NO** | Stripe Secret Key / Webhook | Secret | **FUTURE PHASE REQUIREMENT** — Do not configure now |
| **SMS Gateways (Twilio)** | **NO** | **NO** | Twilio Auth Token | Secret | **NOT IN ARCHITECTURE** |

---

## 3. Important Implementation Corrections Applied

### 3.1 Email Transport Implementation (`EmailService.js`)
- **Blocker Identified**: `EmailService.js` previously logged to `console` in development and contained an unimplemented stub (`return { success: true, messageId }`) for SMTP in production. No real SMTP delivery library was present.
- **Correction Applied**: Integrated `nodemailer` (v10.0.14) into `EmailService.js`. When `EMAIL_PROVIDER=smtp`, the service now creates a persistent transporter and sends an HTML/plaintext email containing the 6-digit OTP and expiration notice. Local `console` logging remains available for development environments without an active SMTP server.
- **Dependency Registry Updated**: `nodemailer` documented in `docs/DEPENDENCIES.md` as an audited runtime dependency.

### 3.2 Removal of `GOOGLE_CLIENT_SECRET`
- **Correction Applied**: Purged `GOOGLE_CLIENT_SECRET` from `server/.env.example`. Clarified that the current LearnForge architecture uses Google Identity Services (GIS) on the frontend and verifies the cryptographically signed OpenID Connect ID token using Google's public JWKS via `google-auth-library`. Server-side client secrets are not required by this flow.

### 3.3 Security Documentation Realism
- **Correction Applied**: Corrected misleading phrasing in `SECURITY.md`, `INTERVIEW_GUIDE.md`, and `ADR-009` that claimed `HttpOnly` "completely neutralizes XSS". Accurately documented that `HttpOnly` protects against **direct token extraction and exfiltration via JavaScript (`document.cookie`)**, while overall XSS defense requires defense-in-depth (input sanitization, context-aware output encoding, and CSP).

---

## 4. Credential Gates & Setup Instructions

To transition the three active integrations to **LIVE VERIFIED**, the following configurations are required:

### Credential Gate 1 — Google Identity Services (GIS)

**Purpose:**  
Allows students to sign in with Google OpenID Connect and links their verified Google identity to their LearnForge account.

**Required Values:**

| Variable | Location | Classification | Where to Obtain |
| :--- | :--- | :--- | :--- |
| `VITE_GOOGLE_CLIENT_ID` | `client/.env` | Public Client Identifier | Google Cloud Console |
| `GOOGLE_CLIENT_ID` | `server/.env` | Public Application Identifier | Must match `VITE_GOOGLE_CLIENT_ID` |

**Configuration Steps:**
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a project (e.g., `learnforge-dev`).
3. Under **APIs & Services** > **OAuth consent screen**:
   - User Type: **External** (or Internal if using Google Workspace).
   - App Name: `LearnForge`.
   - User support email & Developer contact info: your email.
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
4. Under **APIs & Services** > **Credentials**:
   - Click **Create Credentials** > **OAuth client ID**.
   - Application type: **Web application**.
   - Name: `LearnForge Web Client`.
   - **Authorized JavaScript origins**: Add `http://localhost:5173`.
   - *(Authorized redirect URIs are not required for Google Identity Services popup/button flows)*.
5. Click **Create** and copy the generated **Client ID** (format: `xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com`).
6. Add the Client ID:
   - In `client/.env`: `VITE_GOOGLE_CLIENT_ID=<your-client-id>`
   - In `server/.env`: `GOOGLE_CLIENT_ID=<your-client-id>`
7. **Never commit `.env` or paste values into chat.**

---

### Credential Gate 2 — SMTP Transactional Email

**Purpose:**  
Delivers 6-digit one-time password (OTP) verification emails to real student inboxes for passwordless authentication.

**Required Values:**

| Variable | Location | Classification | Example Values |
| :--- | :--- | :--- | :--- |
| `EMAIL_PROVIDER` | `server/.env` | Configuration | `smtp` |
| `SMTP_HOST` | `server/.env` | Configuration | e.g. `smtp.gmail.com`, `smtp.mailgun.org`, `smtp.sendgrid.net` |
| `SMTP_PORT` | `server/.env` | Configuration | `587` (TLS) or `465` (SSL) |
| `SMTP_SECURE` | `server/.env` | Configuration | `false` (for 587) or `true` (for 465) |
| `SMTP_USER` | `server/.env` | Secret | Your SMTP account username or API key user |
| `SMTP_PASS` | `server/.env` | Secret | Your SMTP account password or API key secret |
| `EMAIL_FROM` | `server/.env` | Configuration | `LearnForge <no-reply@yourdomain.com>` |

**Configuration Steps:**
1. Select an SMTP provider (e.g., Mailgun, SendGrid, Amazon SES, Brevo, or a Gmail App Password for testing).
2. Generate an SMTP credential (API Key or App Password).
3. Set the variables in `server/.env`.
4. Ensure the `EMAIL_FROM` address is verified with your provider.
5. **Never paste passwords or SMTP keys into chat.**

---

### Credential Gate 3 — MongoDB Database

**Purpose:**  
Persists users, authentication identities, hashed sessions, and OTP tokens. The server's `requireDatabase` middleware rejects all authentication requests with `503 Service Unavailable` if MongoDB is not connected.

**Required Values:**

| Variable | Location | Classification | Notes |
| :--- | :--- | :--- | :--- |
| `MONGODB_URI` | `server/.env` | Configuration / Secret | Local: `mongodb://127.0.0.1:27017/learnforge`<br>Atlas: `mongodb+srv://<user>:<password>@cluster.mongodb.net/learnforge` |

**Configuration Steps:**
- **Option A (Local MongoDB)**: Start a local MongoDB service or Docker container (`docker run -d -p 27017:27017 --name learnforge-mongo mongo:7`).
- **Option B (MongoDB Atlas Free Tier)**: Create a free M0 cluster at [MongoDB Atlas](https://www.mongodb.com/atlas), create a database user, allow network access from your current IP (or `0.0.0.0/0` for dev), and paste the connection URI into `server/.env`.

---

## 5. Security & Secret Leakage Verification

During this pre-Phase-03 audit, the repository was verified against all security requirements:
- **No Client Secrets in Bundles**: `client/src` contains zero API keys, secrets, or session tokens. `VITE_GOOGLE_CLIENT_ID` is strictly a public identifier.
- **No Raw Session Tokens in JSON**: Both `/api/v1/auth/otp/verify` and `/api/v1/auth/google` omit raw session tokens from response payloads.
- **No Browser Storage Leakage**: `localStorage` and `sessionStorage` contain zero authentication tokens or user credentials.
- **Git Hygiene**: `.env` is confirmed in `.gitignore`. No private keys, passwords, or tokens are committed to git history.
- **Placeholder Hygiene**: `server/.env.example` and `client/.env.example` contain only safe placeholders.

---

## 6. Monorepo Verification Summary

- **Automated Server Tests**: 38 / 38 passing (`vitest run` in `/server`)
- **Automated Client Tests**: 30 / 30 passing (`vitest run` in `/client`)
- **Total Automated Tests**: 68 / 68 passing
- **Client Production Build**: Succeeded cleanly (`vite build`, zero warnings/errors)
- **Live Verification State**:
  - `Health API`: **LIVE VERIFIED**
  - `Google Identity Services`: **IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED**
  - `Email OTP Delivery`: **IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED**
  - `MongoDB Storage`: **IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED**

---

## 7. Phase Gate Determination

### **PHASE 03 BLOCKED**

Phase 03 implementation (Subjects, Topics & Knowledge Structure) is **BLOCKED** until external credentials are provided for live verification or explicit approval is given to proceed with mock-verified status.
