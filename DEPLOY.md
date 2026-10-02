# Deployment Guide: Vercel (Unified Single Deployment) + Neon (Postgres)

This guide documents the architecture, configuration, and environment variables required to deploy **Student Academic AI** to production on **Vercel** with **Neon Cloud PostgreSQL**.

---

## Architecture Overview

```
                                          ┌──────────────────────────────────────────────┐
                                          │      Vercel Serverless (apps/web)            │
                                          │                                              │
                                          │  ┌────────────────────┐                      │
                                          │  │ React / Next.js 15 │ (Browser UI)         │
                                          │  └─────────┬──────────┘                      │
                                          │            │ same-origin /api/v1/*           │
                                          │            ▼                                 │
                                          │  ┌────────────────────┐                      │
                                          │  │ Catch-All Route    │ (/api/[...path])     │
                                          │  │ (app.inject())     │                      │
                                          │  └─────────┬──────────┘                      │
                                          │            │ in-memory fast dispatch         │
                                          │            ▼                                 │
                                          │  ┌────────────────────┐                      │
                                          │  │ Fastify Instance   │ (Cached on global)   │
                                          │  │ (Full RBAC + Core) │                      │
                                          │  └─────────┬──────────┘                      │
                                          └────────────┼─────────────────────────────────┘
                                                       │
                                        Prisma Pooled Connection (TLS)
                                                       │
                                                       ▼
                                          ┌───────────────────────────┐
                                          │   PostgreSQL 16 (Neon)    │
                                          │   Serverless Postgres     │
                                          └───────────────────────────┘
```

The entire system runs as a **single unified deployment on Vercel**:
- The Next.js App Router catches all API requests via [`src/app/api/[...path]/route.ts`](file:///c:/Users/rajan/OneDrive/Desktop/StudentAcademic-AI/apps/web/src/app/api/[...path]/route.ts) and forwards them directly to the compiled Fastify instance using `app.inject()` (in-process, zero network hop, zero external proxy).
- Authentication cookies (`refreshToken`) are first-party and same-origin (`HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`).
- No separate backend server or hosting provider is needed.

---

## 1. Vercel Project Settings

Configure the project settings in the Vercel Dashboard:

- **Root Directory**: `apps/web`
- **Include source files outside of the Root Directory**: **Enabled** (Required so workspace packages `@student-academic-ai/core`, `@student-academic-ai/database`, `@student-academic-ai/types`, and `@student-academic-ai/api` are accessible during build).
- **Framework Preset**: `Next.js`
- **Node.js Version**: `20.x` or `22.x`
- **Install Command**: `npm install` (executed from the monorepo root)
- **Build Command**: `npm run build -w @student-academic-ai/web` (invokes Turbo to compile workspace dependencies and generate Prisma client before building Next.js)
- **Output Directory**: `.next`

---

## 2. Vercel Environment Variables

Set the following variables in **Vercel Project Settings $\rightarrow$ Environment Variables** (for Production, Preview, and Development):

| Variable Name | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | Neon connection-pooled URL (`sslmode=require&pgbouncer=true&connect_timeout=15`). |
| `DIRECT_URL` | **Yes** | Neon unpooled direct URL (`sslmode=require&connect_timeout=15`) for Prisma migrations and schema operations. |
| `JWT_SECRET` | **Yes** | 32+ character random secret used for Fastify JWT token generation and verification. |
| `DEMO_MODE` | **Yes** | Set to `true` to enable quick demo role logins on `/login`. |
| `FAIL_PROVIDER` | No | Optional failure injection flag (`none` by default). |
| `NODE_ENV` | Auto | Automatically managed by Vercel (`production` during live deployments). |

> [!NOTE]
> All credentials must remain confidential. Never print or commit real connection strings or secrets to source control.

---

## 3. Database Initialization & Seed

Run database migrations and seed from your local development environment once before launch:

```bash
npm run db:migrate
npm run db:seed
npm run db:verify
```

---

## 4. Verification Checklist

1. **Verify Unified API Health**:
   ```bash
   curl -i https://<your-vercel-domain>/api/health
   # Expected: 200 {"status":"ok","db":"up","redis":"disabled"}
   ```

2. **Verify Demo Status**:
   ```bash
   curl -i https://<your-vercel-domain>/api/v1/auth/demo-status
   # Expected: 200 {"demoMode":true}
   ```

3. **Verify Demo Authentication on Vercel**:
   - Navigate to `https://<your-vercel-domain>/login`.
   - Click **Student Demo** $\rightarrow$ verifies student dashboard redirection.
   - Click **Faculty Demo**, **Mentor Demo**, **HOD Demo**, **Admin Demo**.
   - Test manual login with seeded credentials.
   - Test logout $\rightarrow$ clears session and redirects to `/login`.

---

## 5. Troubleshooting Matrix

| Error / Symptom | Likely Cause | Exact Resolution / Fix |
|---|---|---|
| **Database connection timeout / error** | `DATABASE_URL` or `DIRECT_URL` environment variables are incorrect or Neon compute is suspended. | 1. Verify `DATABASE_URL` and `DIRECT_URL` in Vercel Environment Variables.<br>2. Confirm connection string contains `connect_timeout=15&sslmode=require`.<br>3. Check Neon console to ensure compute endpoint is active. |
| **Prisma Client engine not found on Vercel** | Missing query engine binary targets for AWS Lambda/Vercel runtime environment. | 1. Ensure `packages/database/prisma/schema.prisma` specifies `binaryTargets = ["native", "rhel-openssl-3.0.x"]`.<br>2. Ensure `apps/web/next.config.ts` includes `serverExternalPackages: ["@prisma/client", "prisma"]`. |
| **`403 Demo login is disabled`** | `DEMO_MODE` environment variable on Vercel is unset, `false`, or not equal to `"true"`. | Set `DEMO_MODE=true` in Vercel Project Settings $\rightarrow$ Environment Variables, and trigger a redeployment. |
| **`500 Internal Server Error` on API routes** | Database connection failure or unhandled exception in Fastify route handler. | Check Vercel Function logs under the **Logs** tab. Fastify inject errors will display route execution details without leaking secrets. |
