-- Server-side storage for the captive-portal customizer's plugin state.
--
-- Every one of its ~30 modules (mascots, announcements, the WhatsApp support widget, social
-- links, custom CSS/JS, etc) previously lived only in the editing admin's own browser
-- localStorage under an unscoped key. It never reached this table, so nothing configured there
-- ever appeared to a real customer on their own device -- the editor was a preview of itself.
ALTER TABLE "captive_portal_configs" ADD COLUMN "pluginsConfig" JSONB;
