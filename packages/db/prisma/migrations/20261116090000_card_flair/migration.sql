-- Card flair: what an account has bought with Stardust for each card, and what each card shows (no row: its own look).
CREATE TABLE "FlairUnlock" (
    "userId" UUID NOT NULL,
    "cardId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlairUnlock_pkey" PRIMARY KEY ("userId","cardId","slot","key")
);

CREATE TABLE "CardFlair" (
    "userId" UUID NOT NULL,
    "cardId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "CardFlair_pkey" PRIMARY KEY ("userId","cardId","slot")
);

ALTER TABLE "FlairUnlock" ADD CONSTRAINT "FlairUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardFlair" ADD CONSTRAINT "CardFlair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
