# Student Academic AI

Predictive academic monitoring platform for universities built as a high-performance monorepo using **Turborepo** and **npm workspaces**.

---

## Architecture Overview

```
student-academic-ai/
├── apps/
│   ├── api/             # Fastify + TypeScript (Node LTS), Zod validation, health checks
│   ├── web/             # Next.js 15 (App Router, React 19), Tailwind CSS, Radix UI primitives
│   └── ml-service/      # Python FastAPI predictive microservice placeholder (/health)
├── packages/
│   ├── core/            # Pure TypeScript academic math engine (no framework dependencies)
│   ├── database/        # Prisma ORM + PostgreSQL 16 schema, migrations, seed script
│   ├── types/           # Shared TypeScript domain types and Zod runtime schemas
│   └── config/          # Shared ESLint flat config, Prettier config, base TSConfigs
├── docker-compose.yml   # PostgreSQL 16 & Redis 7 services with healthchecks and volumes
└── turbo.json           # Turborepo task pipeline (build, test, lint, typecheck)
```

---

## Prerequisites

1. **Node.js**: v20+ LTS (Tested on Node v24)
2. **npm**: v10+ (Tested on npm v11.17.0)
3. **Docker & Docker Compose**: For local PostgreSQL 16 and Redis 7 services
4. **Python**: 3.10+ (for `apps/ml-service`)

---

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in the root and in each package/app:

```bash
# Root & packages
cp .env.example .env
cp packages/database/.env.example packages/database/.env
apps/api/.env.example apps/api/.env
apps/web/.env.example apps/web/.env
apps/ml-service/.env.example apps/ml-service/.env
```

### 3. Start Infrastructure Services

Start PostgreSQL 16 and Redis 7 containers:

```bash
docker compose up -d
```

Verify health:

```bash
docker compose ps
```

### 4. Database Migration & Seeding

Generate the Prisma Client, run migrations, and execute the realistic academic seed script:

```bash
# Generate Prisma Client
npm run db:generate

# Apply PostgreSQL migrations
npm run db:migrate

# Seed database (1 department, 1 HOD, 2 faculty, 1 mentor, 40 students, 3 courses, 20 sessions/course, 3 assessments/course with scores)
npm run db:seed
```

---

## Development & Quality Gate Verification

All quality gates are enforced across the workspace:

```bash
# 1. Run all unit tests (packages/core math engine, apps/api health check, apps/web)
npm test

# 2. Compile production bundles across all apps and packages
npm run build

# 3. Static type check (strict TypeScript, zero `any`)
npm run typecheck

# 4. ESLint verification (ESLint 9 flat config)
npm run lint

# 5. Prettier style verification
npx prettier --check "**/*.{ts,tsx,json,md}"
```

---

## Core Math Engine (`packages/core`)

The math engine contains pure TypeScript functions with comprehensive test coverage:

1. **`attendancePercent(P, OD, T)`**:
   Returns percentage $\frac{P + OD}{T} \times 100$. Returns `100` when $T = 0$.
2. **`safeBunks(P, OD, T, theta=0.75)`**:
   Max classes $k$ student can miss such that $\frac{P + OD}{T + k} \ge \theta$. Returns `0` if already below $\theta$.
   _Worked example verified:_ $P + OD = 35$, $T = 42 \implies \text{safeBunks} = 4$ ($35/46 = 76.09\% \ge 75\%$).
3. **`classesToRecover(P, OD, T, theta=0.75)`**:
   Min consecutive classes $m$ student must attend such that $\frac{P + OD + m}{T + m} \ge \theta$. Returns `0` if already above.
4. **`predictedAttendance(P, OD, T, N, attending: boolean)`**:
   Forecasts future attendance after $N$ upcoming classes.
5. **`courseMastery(components)`**:
   $\sum \frac{\text{score}}{\text{max}} \times \text{weight}$. Excludes pending and zero-max components. Normalizes proportionally if total evaluated weight $< 100$. Throws error if $> 100$.
6. **`velocity(m1, m2, days)` & `velocityBand(v)`**:
   Rate of change in mastery points/day. Categorizes into `RAPID_IMPROVEMENT`, `IMPROVING`, `STABLE`, `DECLINING`, or `RAPID_DECLINE`.
7. **`percentile(score, cohort)`**:
   Percentile rank within a cohort. Requires minimum cohort size of 15 (returns `null` with reason if smaller).
8. **`riskScore(inputs, weights)`**:
   Multi-factor weighted risk engine ($[0, 100]$): Safe ($< 30$), Moderate ($30 - 64.99$), Critical ($\ge 65$).

---

## Module 1: Auth & RBAC

### Demo Accounts
All seeded accounts share the demo password `****`:

| Role | Email | Password | Default Redirect |
|---|---|---|---|
| ADMIN | `admin@demo.edu` | `****` | `/admin/dashboard` |
| HOD | `hod@demo.edu` | `****` | `/admin/dashboard` |
| FACULTY | `faculty1@demo.edu`, `faculty2@demo.edu` | `****` | `/faculty/dashboard` |
| MENTOR | `mentor1@demo.edu` | `****` | `/faculty/dashboard` |
| STUDENT | `student01@demo.edu` .. `student40@demo.edu` | `****` | `/student/dashboard` |

### Auth API Endpoints (`/api/v1/auth`)
- `POST /api/v1/auth/login`: Email & password login. Returns access token (15m) and sets HttpOnly refresh cookie. Rate limited to 10 req/min.
- `POST /api/v1/auth/demo-login`: Quick role-based login when `DEMO_MODE=true`.
- `POST /api/v1/auth/refresh`: Rotates refresh token (48 random bytes, SHA-256 hashed). Enforces token reuse detection (revokes all user tokens if reused).
- `POST /api/v1/auth/logout`: Revokes refresh token and clears cookie.
- `GET /api/v1/auth/me`: Returns profile of authenticated user.
- `GET /api/v1/_whoami-scope`: Scope inspection based on RBAC matrix.
- `GET /api/v1/faculty/courses`: Protected route requiring `FACULTY`, `HOD`, or `ADMIN` role.

