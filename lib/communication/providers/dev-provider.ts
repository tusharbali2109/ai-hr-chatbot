import type { EmailProvider, SendEmailInput, SendEmailResult, DeliveryStatusResult } from "@/lib/communication/provider";

/**
 * Default provider when no real email SDK is configured. Logs the rendered
 * email to the server console and returns success so the calling agent
 * still records the attempt — but callers MUST persist this as `provider:
 * "dev"` and status `SENT` only, NEVER `DELIVERED` (delivery is a real
 * downstream confirmation this provider cannot make). The Communications
 * Center UI flags every `provider === "dev"` row as "Dev Mode — not
 * actually delivered".
 */
export const devEmailProvider: EmailProvider = {
  name: "dev",
  configured: false,
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    console.log(`[DEV EMAIL] To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}\n`);
    return { success: true, externalMessageId: `dev-${Date.now()}`, error: null };
  },
  async getDeliveryStatus(): Promise<DeliveryStatusResult> {
    return { status: "UNKNOWN" };
  },
};
