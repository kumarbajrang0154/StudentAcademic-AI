-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rollNumber" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");

-- AlterTable Department
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "headId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Department_headId_key" ON "Department"("headId");

-- AlterTable Course
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "facultyId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Course_facultyId_idx" ON "Course"("facultyId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Department_headId_fkey'
  ) THEN
    ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Course_facultyId_fkey'
  ) THEN
    ALTER TABLE "Course" ADD CONSTRAINT "Course_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
