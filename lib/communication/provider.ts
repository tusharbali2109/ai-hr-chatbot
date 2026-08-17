export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  success: boolean;
  externalMessageId: string | null;
  error: string | null;
}

export interface DeliveryStatusResult {
  status: "SENT" | "DELIVERED" | "BOUNCED" | "FAILED" | "UNKNOWN";
}

/**
 * Deliberately thin — template rendering, idempotency, and persistence all
 * live one layer up in lib/communication/agent.ts, not here, mirroring how
 * AIProvider (lib/ai/provider.ts) stays a thin LLM wrapper while the
 * decision/orchestration logic lives outside it.
 */
export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  getDeliveryStatus(externalMessageId: string): Promise<DeliveryStatusResult>;
}
