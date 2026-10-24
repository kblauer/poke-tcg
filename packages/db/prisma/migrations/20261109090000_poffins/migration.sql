-- The Extras page's Poffin cooking: the Poffins an account has cooked.
CREATE TABLE "Poffin" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" INTEGER NOT NULL,
    "flavors" INTEGER[],
    "smoothness" INTEGER NOT NULL,
    "berries" TEXT[],
    "frames" INTEGER NOT NULL,
    "spills" INTEGER NOT NULL,
    "burns" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poffin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Poffin_userId_idx" ON "Poffin"("userId");

ALTER TABLE "Poffin" ADD CONSTRAINT "Poffin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
