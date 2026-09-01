-- Per-router PPPoE server settings.
--
-- Until now the provisioning script pointed PPP authentication at RADIUS but never created a
-- PPPoE server, so a freshly provisioned router could authenticate subscribers it had no way of
-- hearing from -- the same gap the hotspot had. These columns let each router carry its own
-- answer to "which interface faces subscribers, and what addresses do they get", because that
-- differs per site and hardcoding one plan would collide with live networks.
--
-- All nullable: a hotspot-only router leaves them empty and its script emits no PPPoE section.
ALTER TABLE "routers"
  ADD COLUMN "pppoeInterface" TEXT,
  ADD COLUMN "pppoeGatewayIp" TEXT,
  ADD COLUMN "pppoePoolRange" TEXT;
