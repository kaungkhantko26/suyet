-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REGISTRATION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'REGISTRATION_REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RegistrationStatus" ADD VALUE 'APPROVED';
ALTER TYPE "RegistrationStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" UUID,
ADD COLUMN     "decisionNote" TEXT;

-- AlterTable
ALTER TABLE "RegistrationForm" ADD COLUMN     "requireApproval" BOOLEAN NOT NULL DEFAULT false;
