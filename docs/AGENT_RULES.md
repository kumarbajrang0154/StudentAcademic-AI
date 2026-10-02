# Agent Rules & Engineering Principles

These rules apply to all tasks and code additions in the **Student Academic AI** project:

1. **Security & Credentials**:
   - Never print, log, or commit any credentials, passwords, tokens, or full connection strings anywhere (including logs, READMEs, test reports, or terminal output).
   - Always mask sensitive values as `****`.

2. **Schema & Database Migrations**:
   - All database schema changes are additive only.
   - Never edit already-applied migrations.
   - Always create a new migration folder (e.g. using `prisma migrate diff` or Prisma migrations).
   - Apply migrations using `prisma migrate deploy`.
   - Maintain idempotent seeding and ensure `npm run db:verify` passes.

3. **Architecture & Separation of Concerns**:
   - Pure academic calculations and math logic live in `packages/core` with 100% test coverage.
   - Orchestration and database-backed business logic live in `apps/api/src/services`.
   - Route handlers in `apps/api/src/routes` stay thin, delegating to services and library helpers.
   - Validate every request body and query parameter using **Zod**.
   - Every protected route must use `authenticate` and enforce granular role and scope checks (`canViewStudent`, `canAccessCourse`, `requireRole`).

4. **Verification & Quality Gates**:
   - Every task must end with `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck` all passing cleanly.
   - Always perform manual / smoke testing on newly created endpoints.
   - Never claim a test or check passed without actually executing it. Report failures honestly.
