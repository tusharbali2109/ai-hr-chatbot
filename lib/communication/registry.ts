import type { EmailProvider } from "@/lib/communication/provider";
import { devEmailProvider } from "@/lib/communication/providers/dev-provider";
import { resendEmailProvider } from "@/lib/communication/providers/resend-provider";

/** Real provider only when RESEND_API_KEY is set — otherwise dev mode,
 * mirrors getVoiceProvider()/getCodeExecutionProvider()'s default-safe
 * two-gate shape (no email is ever "sent" for real without explicit
 * configuration). */
export function getEmailProvider(): EmailProvider {
  return resendEmailProvider.configured ? resendEmailProvider : devEmailProvider;
}
