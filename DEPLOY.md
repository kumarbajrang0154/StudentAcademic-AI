# Deployment Guide: Vercel (Web) + Render (API) + Neon (Postgres)

This guide documents the exact configuration and environment variables required to deploy **Student Academic AI** to production on **Vercel** and **Render** with **Neon Cloud PostgreSQL**.

---

## Architecture Overview

```
                                         ┌───────────────────────────┐
                                         │  Next.js 15 Web (Vercel)  │
                                         │  apps/web                 │
                                         └─────────────┬─────────────┘
                                                       │
                                  Next.js Rewrite (/api/:path* -> Render)
                                  First-party HttpOnly cookies preserved
                                                       │
                                                       ▼
                                         ┌───────────────────────────┐
                                         │ Fastify Node API (Render) │
                                         │ apps/api (Port 4000)      │
                                         └─────────────┬─────────────┘
                                                       │
                                      Prisma Pooler / Direct Connections
                                                       │
                                                       ▼
                                         ┌───────────────────────────┐
                                         │   PostgreSQL 16 (Neon)    │
                                         │   Serverless Postgres     │
                                         └───────────────────────────┘
```

---

## 1. Vercel Configuration (`apps/web`)

Configure the Vercel project settings:
- **Root Directory**: `apps/web` (or monorepo root `.` with "Include files outside root directory" enabled)
- **Framework Preset**: `Next.js`
- **Node.js Version**: `20.x` or `22.x`
- **Install Command**: `npm install` (executed at the monorepo root to link workspace packages)
- **Build Command**: `npm run build -w @student-academic-ai/web` (invokes Turbo to build required packages `@student-academic-ai/core`, `@student-academic-ai/types` first, then compiles the Next.js bundle)
- **Output Directory**: `.next` (or `apps/web/.next` if root directory is `.`)

> [!NOTE]
> All proxy rewrites (`/api/:path*` -> `${API_URL}/api/:path*`) are handled strictly inside [apps/web/next.config.ts](file:///c:/Users/rajan/OneDrive/Desktop/StudentAcademic-AI/apps/web/next.config.ts). A root `vercel.json` is intentionally **not** used to eliminate any conflicting rewrites or hardcoded destinations.

### Vercel Environment Variables

| Variable Name | Required | Example / Format | Purpose |
|---|---|---|---|
| `API_URL` | **Yes** | `https://student-academic-ai-api.onrender.com` | Target URL for the Next.js `/api/:path*` rewrite proxy. **Must be a public https URL without trailing slash**. Set ONLY via Vercel dashboard environment variables. Never commit `.env.production`. |
| `NEXT_PUBLIC_API_URL` | No | `https://student-academic-ai-api.onrender.com` | Client-side fallback if any direct client requests are made. |
| `NEXT_PUBLIC_ML_URL` | No | `http://localhost:8000` | Optional predictive ML service URL. |

> [!IMPORTANT]
> - `apps/web/next.config.ts` validates `API_URL` during production builds. If `API_URL` is missing or points to `localhost`/`127.0.0.1`/private IP, the build will immediately fail with `"API_URL must be a public https URL"`. This prevents deploying builds that trigger Vercel's `404 DNS_HOSTNAME_RESOLVED_PRIVATE` error.
> - When `API_URL` is set to your public Render URL, Vercel proxies all `/api/*` requests directly to Render. Browsers maintain first-party HttpOnly session cookies without cross-site cookie restrictions.

---

## 2. Render Configuration (`apps/api`)

Deploy the Fastify API server as a Web Service on Render:
- **Root Directory**: `.` (monorepo root)
- **Environment**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start -w @student-academic-ai/api`
- **Health Check Path**: `/health`

### Render Environment Variables

| Variable Name | Required | Example / Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://user:****@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15` (Neon connection-pooled URL). Masked as `****`. |
| `DIRECT_URL` | **Yes** | `postgresql://user:****@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15` (Neon unpooled direct URL for Prisma migrations). Masked as `****`. |
| `JWT_SECRET` | **Yes** | `****` (Random 32+ character secret for Fastify JWT signing). |
| `DEMO_MODE` | **Yes** | `true` (Enables quick demo role logins for `STUDENT`, `FACULTY`, `MENTOR`, `HOD`, `ADMIN` at `/api/v1/auth/demo-login`). |
| `WEB_ORIGIN` | **Yes** | `https://student-academic-ai.vercel.app` (The Vercel domain; allows credentials and CORS headers). |
| `NODE_ENV` | **Yes** | `production` |
| `FAIL_PROVIDER` | No | `none` (Optional failure injection provider flag). |
| `REDIS_URL` | No | Optional Redis connection string. If unset, Redis probe is marked `disabled` and does not block `/health`. |

---

## 3. Cold Starts & Infrastructure Notes

### Render Free Tier Sleep
- Free instances on Render spin down after 15 minutes of inactivity.
- The first incoming request triggers a cold start, which may take **30 to 60 seconds**.
- **Hardened Web Client**: The frontend auth client in `apps/web/src/lib/auth.tsx` does not blindly parse responses as JSON. If Render is still waking up and returns a 502/503 HTML page, the client catches it and gracefully alerts:
  > *"Cannot reach the server. Please try again in a moment."*

### Neon Serverless Postgres Sleep
- Inactive Neon compute endpoints suspend automatically to save resources.
- Connection strings include `connect_timeout=15` and retry tolerance so that cold starts do not drop incoming queries.

---

## 4. Verification Checklist

1. **Database Migrations & Seed**:
   Run against Neon once before launch:
   ```bash
   npm run db:migrate
   npm run db:seed
   npm run db:verify
   ```

2. **Verify API Health on Render**:
   ```bash
   curl -i https://<your-render-url>/health
   # Expected: 200 {"status":"ok","db":"up","redis":"disabled"}
   ```

3. **Verify Vercel Rewrites**:
   ```bash
   curl -i https://<your-vercel-url>/api/v1/auth/me
   # Expected: 401 {"statusCode":401,"error":"Unauthorized","message":"Authorization header missing"}
   ```

4. **Demo Authentication on Vercel**:
   - Open `https://<your-vercel-url>/login`.
   - Click **Student Demo** $\rightarrow$ verifies student dashboard redirection.
   - Click **Faculty Demo**, **Mentor Demo**, **HOD Demo**, **Admin Demo**.
   - Test manual login with `student01@demo.edu` / `Demo@1234`.

---

## 5. Troubleshooting Matrix

| Error / Symptom | Likely Cause | Exact Resolution / Fix |
|---|---|---|
| **Vercel 404 `DNS_HOSTNAME_RESOLVED_PRIVATE`** | The Next.js rewrite target (`API_URL`) resolved to a private/loopback IP address (`localhost`, `127.0.0.1`, `0.0.0.0`, or RFC1918 private range). Occurs when `API_URL` was unset or defaulted to localhost during the Vercel production build. | 1. Go to **Vercel Dashboard $\rightarrow$ Project Settings $\rightarrow$ Environment Variables**.<br>2. Set `API_URL` to your public Render service URL: `https://<your-api>.onrender.com` (no trailing slash).<br>3. Trigger a fresh deployment (`Redeploy`). The build guard in `next.config.ts` prevents future builds from succeeding if `API_URL` is private or unset. |
| **`DNS_HOSTNAME_NOT_FOUND`** | `API_URL` in Vercel environment variables contains a typo, a deleted service domain, or a non-existent subdomain. | 1. Open the Render dashboard and copy the exact Web Service URL.<br>2. Update `API_URL` in Vercel Project Settings.<br>3. Redeploy the Vercel web project.<br>4. Test hostname resolution directly: `curl -i https://<your-api>.onrender.com/health`. |
| **`502 Bad Gateway` / `503 Service Unavailable`** | 1. Render free instance is cold sleeping (first request takes 30–60s to wake up).<br>2. The Fastify API process crashed on boot (e.g. database connection failed or missing `DATABASE_URL`). | 1. Allow up to 60 seconds for Render compute to start. The UI displays: *"Server is waking up (can take up to 60s). Please retry."*<br>2. Check Render service logs for runtime exceptions or failed DB migrations.<br>3. Ensure `DATABASE_URL` and `DIRECT_URL` are valid Neon PostgreSQL strings. |
| **`CORS error` (Cross-Origin Request Blocked)** | Direct client-side fetch bypassed the Next.js rewrite proxy, or Render's `WEB_ORIGIN` does not match the Vercel domain. | 1. In Render Web Service Environment, set `WEB_ORIGIN` to your exact Vercel frontend URL: `https://<your-app>.vercel.app` (no trailing slash).<br>2. Ensure all frontend API calls use relative paths (e.g. `/api/v1/auth/login`) so they are routed through Next.js rewrites on the same origin. |
| **`403 Demo login is disabled`** | The backend received a demo login request at `/api/v1/auth/demo-login` but `DEMO_MODE` on Render is not set to `"true"`. | 1. In Render Dashboard $\rightarrow$ Environment, set `DEMO_MODE=true`.<br>2. Wait for the service to redeploy.<br>3. The login page automatically queries `/api/v1/auth/demo-status` and displays the quick demo role buttons only when demo mode is active. |

