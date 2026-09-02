-- Allow a payment with no customer.
--
-- A guest who buys a Wi-Fi voucher on the captive portal never becomes a Customer row — they pay
-- and receive a code. Because payments.customerId was NOT NULL, those sales could not be recorded
-- as payments at all, so every revenue figure (getRevenueByDay, the dashboard's 30-day total, the
-- revenue chart) silently excluded hotspot income. On a hotspot-first ISP that is most of it.
--
-- Widening a column to nullable is backward compatible: every existing row keeps its customer.
ALTER TABLE "payments" ALTER COLUMN "customerId" DROP NOT NULL;
