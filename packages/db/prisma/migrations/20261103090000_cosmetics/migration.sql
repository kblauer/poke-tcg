-- Cosmetics: the card back and playmat in use (null: the default), and the ones an account has bought.
ALTER TABLE "User" ADD COLUMN "cardBack" TEXT;
ALTER TABLE "User" ADD COLUMN "playmat" TEXT;

CREATE TABLE "CosmeticUnlock" (
    "userId" UUID NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticUnlock_pkey" PRIMARY KEY ("userId","cosmeticId")
);

ALTER TABLE "CosmeticUnlock" ADD CONSTRAINT "CosmeticUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
