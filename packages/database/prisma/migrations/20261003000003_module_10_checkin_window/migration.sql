-- Module 10: QR / Code Self Check-in
-- Additive only: new table + new nullable column

-- 1. Add nullable source column to AttendanceRecord
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- 2. Create CheckinWindow table
CREATE TABLE IF NOT EXISTS "CheckinWindow" (
    "id"          TEXT NOT NULL,
    "courseId"    TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "secret"      TEXT NOT NULL,
    "startsAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt"      TIMESTAMP(3) NOT NULL,
    "closedAt"    TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckinWindow_pkey" PRIMARY KEY ("id")
);

-- 3. Foreign keys
ALTER TABLE "CheckinWindow"
    ADD CONSTRAINT "CheckinWindow_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckinWindow"
    ADD CONSTRAINT "CheckinWindow_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckinWindow"
    ADD CONSTRAINT "CheckinWindow_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS "CheckinWindow_courseId_idx"    ON "CheckinWindow"("courseId");
CREATE INDEX IF NOT EXISTS "CheckinWindow_sessionId_idx"   ON "CheckinWindow"("sessionId");
CREATE INDEX IF NOT EXISTS "CheckinWindow_endsAt_idx"      ON "CheckinWindow"("endsAt");
CREATE INDEX IF NOT EXISTS "CheckinWindow_createdById_idx" ON "CheckinWindow"("createdById");
