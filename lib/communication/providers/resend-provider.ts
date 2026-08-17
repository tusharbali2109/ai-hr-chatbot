import type { EmailProvider, SendEmailInput, SendEmailResult, DeliveryStatusResult } from "@/lib/communication/provider";

const RESEND_API_URL = "https://api.resend.com/emails";

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
}

/** Real provider — plain fetch against Resend's REST API, no SDK dependency. */
export const resendEmailProvider: EmailProvider = {
  name: "resend",
  get configured() {
    return Boolean(process.env.RESEND_API_KEY);
  },
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, externalMessageId: null, error: "RESEND_API_KEY is not configured." };
    }

    try {
      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [input.to],
          subject: input.subject,
          text: input.body,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, externalMessageId: null, error: body.message ?? `Resend API error (${res.status}).` };
      }
      return { success: true, externalMessageId: body.id ?? null, error: null };
    } catch (err) {
      return { success: false, externalMessageId: null, error: err instanceof Error ? err.message : "Unknown network error." };
    }
  },
  async getDeliveryStatus(externalMessageId: string): Promise<DeliveryStatusResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { status: "UNKNOWN" };

    try {
      const res = await fetch(`${RESEND_API_URL}/${externalMessageId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return { status: "UNKNOWN" };
      const body = await res.json();
      const lastEvent = body.last_event as string | undefined;
      if (lastEvent === "delivered") return { status: "DELIVERED" };
      if (lastEvent === "bounced") return { status: "BOUNCED" };
      if (lastEvent === "sent") return { status: "SENT" };
      return { status: "UNKNOWN" };
    } catch {
      return { status: "UNKNOWN" };
    }
  },
};
