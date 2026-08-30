/**
 * Provider-agnostic payment gateway contract (docs/architecture/04-billing-and-payments.md
 * §12). Billing services depend only on this interface, never on a concrete gateway — Phase 3
 * ships exactly one implementation (`MpesaAdapter`); Pesapal/Stripe/PayPal/Flutterwave are
 * documented, not built (project instruction §20/§78: never claim an unbuilt integration works).
 */

export interface PaymentInitRequest {
  tenantId: string;
  customerId: string;
  invoiceId?: string | null;
  amountMinor: number;
  currency: string;
  /** Payer's phone number in gateway-specific format (M-Pesa: 2547XXXXXXXX). */
  phone: string;
  description?: string;
}

export interface PaymentInitResult {
  /** Gateway's identifier for this initiation (M-Pesa: CheckoutRequestID). */
  providerReference: string;
  /** Human-readable message the gateway wants shown to the payer (e.g. "Enter your M-Pesa PIN"). */
  customerMessage?: string;
}

export type ProviderPaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface PaymentStatusResult {
  status: ProviderPaymentStatus;
  providerReceiptNumber?: string;
  resultCode?: number;
  resultDescription?: string;
}

export interface VerifiedCallback {
  providerReference: string;
  status: ProviderPaymentStatus;
  amountMinor?: number;
  providerReceiptNumber?: string;
  phone?: string;
  resultCode: number;
  resultDescription: string;
  raw: unknown;
}

export interface RefundResult {
  success: boolean;
  providerReference?: string;
}

export interface PaymentProviderAdapter {
  initialize(request: PaymentInitRequest): Promise<PaymentInitResult>;
  verify(providerReference: string): Promise<PaymentStatusResult>;
  handleCallback(rawPayload: unknown): Promise<VerifiedCallback>;
  refund(paymentId: string, amountMinor: number): Promise<RefundResult>;
}
