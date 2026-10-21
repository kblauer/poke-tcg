-- A consumable used from the Inventory with no run under way, waiting to take effect when the next run starts.
ALTER TABLE "User" ADD COLUMN "pendingConsumable" TEXT;
