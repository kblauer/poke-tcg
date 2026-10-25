-- The Idle Adventure (README: Idle Adventure): its runs (each one's state, played up to `simulatedAt`), the account's
-- Pokédex (each species' best IVs and EVs) and the mode's settings.
CREATE TYPE "IdleStatus" AS ENUM ('ACTIVE', 'BEATEN', 'GIVEN_UP');

ALTER TABLE "User" ADD COLUMN "idleSettings" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "IdleRun" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "status" "IdleStatus" NOT NULL DEFAULT 'ACTIVE',
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "banked" BOOLEAN NOT NULL DEFAULT false,
    "simulatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdleRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IdleRun_ownerId_status_idx" ON "IdleRun"("ownerId", "status");

ALTER TABLE "IdleRun" ADD CONSTRAINT "IdleRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IdleDex" (
    "userId" UUID NOT NULL,
    "species" INTEGER NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "caught" BOOLEAN NOT NULL DEFAULT false,
    "bestIv" INTEGER[] DEFAULT ARRAY[0, 0, 0, 0, 0, 0]::INTEGER[],
    "bestEv" INTEGER[] DEFAULT ARRAY[0, 0, 0, 0, 0, 0]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdleDex_pkey" PRIMARY KEY ("userId", "species")
);

ALTER TABLE "IdleDex" ADD CONSTRAINT "IdleDex_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
