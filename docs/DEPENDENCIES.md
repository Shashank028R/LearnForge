# LearnForge — Dependency Registry

Every package added to the project must be documented in this registry before the phase is marked complete.

---

## Workspace Root Dependencies

### Development Tooling

| Package | Version | Purpose | Selection Rationale | Alternatives Considered | Runtime / Dev |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `concurrently` | `9.2.4` | Orchestrate running client and server processes concurrently via single `npm run dev` script | Simple, cross-platform npm script runner with zero config | `npm-run-all`, `turborepo` (overkill for Phase 00) | Development |

---

## Client Dependencies (`/client`)

### Production Runtime Dependencies

| Package | Version | Purpose | Selection Rationale | Alternatives Considered | Runtime / Dev |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `react` | `18.3.1` | Core UI component model and declarative rendering engine | Industry standard, robust ecosystem, matches owner skills | Preact, Vue, Svelte | Runtime |
| `react-dom` | `18.3.1` | DOM renderer for React components | Required companion for React web rendering | Native DOM manipulation | Runtime |
| `react-router-dom` | `6.30.6` | Client-side routing, protected routes, and URL synchronization | Standard declarative routing for React SPAs | TanStack Router, custom state router | Runtime |

### Development & Build Dependencies

| Package | Version | Purpose | Selection Rationale | Alternatives Considered | Runtime / Dev |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `vite` | `6.4.3` | Modern, lightning-fast frontend dev server and Rollup production bundler | Instant HMR, native ESM support, minimal config | Webpack, Parcel | Development |
| `@vitejs/plugin-react` | `4.7.0` | Babel/Fast Refresh integration for React in Vite | Official Vite plugin for React JSX compilation and HMR | `@vitejs/plugin-react-swc` | Development |
| `tailwindcss` | `3.4.19` | Utility-first CSS framework for layout, spacing, and typography design tokens | Fast styling iteration, zero unused CSS in production bundle, strict token control | Plain CSS, styled-components | Development |
| `postcss` | `8.5.28` | CSS post-processing pipeline for Tailwind and Autoprefixer | Required engine for Tailwind CSS processing | None (required by Tailwind) | Development |
| `autoprefixer` | `10.6.1` | Adds vendor prefixes to CSS rules automatically based on CanIUse | Ensures cross-browser CSS compatibility | Manual prefixing | Development |
| `vitest` | `3.2.7` | Blazing fast ESM-native test runner compatible with Vite | Uses exact same Vite transform pipeline, instant test feedback | Jest | Development |
| `jsdom` | `26.1.0` | Headless DOM implementation for Node.js test environment | Enables testing React DOM components without real browser | Happy-DOM | Development |
| `@testing-library/react`| `16.3.3` | User-centric React component testing utilities | Encourages testing actual DOM output rather than implementation details | Enzyme | Development |

---

## Server Dependencies (`/server`)

### Production Runtime Dependencies

| Package | Version | Purpose | Selection Rationale | Alternatives Considered | Runtime / Dev |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `express` | `4.22.3` | HTTP API framework, routing, and middleware pipeline | Lightweight, ubiquitous, robust middleware ecosystem | Fastify, Koa, NestJS | Runtime |
| `cors` | `2.8.6` | Configures Cross-Origin Resource Sharing headers for API security | Standard, reliable Express CORS middleware | Custom header middleware | Runtime |
| `dotenv` | `16.6.1` | Loads environment variables from `.env` into `process.env` | Industry standard for 12-factor application configuration | Node native `--env-file` (less portable across package scripts) | Runtime |
| `mongoose` | `8.24.4` | MongoDB Object Data Modeling (ODM), schema validation, indexes | Schema integrity, middleware hooks, rich query builder for document model | Native MongoDB driver, Prisma | Runtime |
| `morgan` | `1.12.1` | HTTP request logging middleware with response time and status | Standard, lightweight logging for developer observability | Pino, Winston (can upgrade in Phase 14) | Runtime |

### Development & Testing Dependencies

| Package | Version | Purpose | Selection Rationale | Alternatives Considered | Runtime / Dev |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `vitest` | `3.2.7` | Test runner for API and unit tests | Fast ESM-native execution, unified testing syntax across monorepo | Jest, Mocha | Development |
| `supertest` | `7.3.1` | HTTP assertion library for testing Express endpoints without binding live ports | De facto standard for Express integration testing | Axios, native fetch against live port | Development |

---

## Dependency Hygiene Rules
1. **Never install unvetted libraries**: Trivial one-line helpers or packages with heavy transitive dependencies must be avoided.
2. **Lockfile Enforcement**: `package-lock.json` is committed and maintained strictly.
3. **Audit**: Regular `npm audit` checks before every phase completion.
