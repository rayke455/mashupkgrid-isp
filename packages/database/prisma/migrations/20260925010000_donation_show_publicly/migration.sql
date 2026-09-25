-- Donors choose whether their name and message appear on the public supporters wall.
ALTER TABLE "donations" ADD COLUMN "showPublicly" BOOLEAN NOT NULL DEFAULT false;
