-- Text hotspot buyers their voucher code after an M-Pesa purchase (on by default, per tenant).
ALTER TABLE "sms_provider_configs" ADD COLUMN "sendVoucherSms" BOOLEAN NOT NULL DEFAULT true;
