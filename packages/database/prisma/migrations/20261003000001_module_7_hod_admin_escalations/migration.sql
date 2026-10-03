-- DropForeignKey
ALTER TABLE "EscalationCase" DROP CONSTRAINT "EscalationCase_createdById_fkey";

-- AlterTable
ALTER TABLE "EscalationCase" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "dispatchedById" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "triggerChannels" JSONB,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "caseId" TEXT;

-- CreateTable
CREATE TABLE "DispatchJob" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "estimatedMs" INTEGER NOT NULL DEFAULT 1500,
    "notificationsCount" INTEGER NOT NULL DEFAULT 0,
    "calendarHoldCreated" BOOLEAN NOT NULL DEFAULT false,
    "interventionId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatchJob_caseId_idx" ON "DispatchJob"("caseId");

-- CreateIndex
CREATE INDEX "DispatchJob_status_idx" ON "DispatchJob"("status");

-- CreateIndex
CREATE INDEX "EscalationCase_status_tier_idx" ON "EscalationCase"("status", "tier");

-- CreateIndex
CREATE INDEX "Notification_caseId_idx" ON "Notification"("caseId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EscalationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationCase" ADD CONSTRAINT "EscalationCase_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationCase" ADD CONSTRAINT "EscalationCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationCase" ADD CONSTRAINT "EscalationCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EscalationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
