-- Remote WinBox through the platform: the public port the worker's relay listens on for this router.
ALTER TABLE "routers" ADD COLUMN "winboxRelayPort" INTEGER;
CREATE UNIQUE INDEX "routers_winboxRelayPort_key" ON "routers"("winboxRelayPort");
