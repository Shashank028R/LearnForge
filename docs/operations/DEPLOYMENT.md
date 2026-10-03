# Deployment & Operations

## 1. Environments

Use at least:

- local development;
- staging/preview where practical;
- production.

## 2. Frontend Deployment

The React app can be deployed on a static/edge-capable frontend platform compatible with the chosen Vite build.

## 3. Backend Deployment

The Node/Express API should be deployed on a service that supports long-running HTTP workloads, secure environment variables, logs, and the eventual need for background jobs.

## 4. Database

Use a managed MongoDB deployment for production.

## 5. External Services

Potential production services:

- Google identity;
- transactional email;
- AI providers;
- object storage;
- monitoring.

All external services must be configurable by environment.

## 6. Environment Variables

Maintain a documented `.env.example` with names but no secrets.

Examples of categories:

- server port;
- database URI;
- authentication provider configuration;
- AI provider keys;
- email provider keys;
- storage configuration;
- application URLs.

## 7. Logging

Log:

- request ID;
- useful error context;
- external provider failures;
- background job state.

Do not log passwords, OTPs, raw access tokens, or unnecessary private user content.

## 8. Monitoring

Production should eventually track:

- API error rate;
- AI provider failures;
- latency;
- import failures;
- authentication failures;
- background job failures;
- database errors.

## 9. Backups

Production database backups and restoration procedures must be validated.

## 10. Deployment Checklist

- production environment variables configured;
- CORS/allowed origins reviewed;
- authentication callback URLs verified;
- database connectivity verified;
- migrations/index changes reviewed;
- health endpoint works;
- logs visible;
- critical E2E tests pass;
- no secrets in repository.
