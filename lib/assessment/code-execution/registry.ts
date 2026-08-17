import type { CodeExecutionProvider } from "@/lib/assessment/code-execution/provider";
import { unconfiguredCodeExecutionProvider } from "@/lib/assessment/code-execution/unconfigured-provider";

const providers: Record<string, CodeExecutionProvider> = {
  unconfigured: unconfiguredCodeExecutionProvider,
};

/** Mirrors lib/interview/registry.ts's getVoiceProvider() shape. Defaults
 * to the unconfigured provider so nothing ever silently pretends to run
 * candidate code — CODE_EXECUTION_PROVIDER would need to be set to a real
 * provider name AND that provider implemented + registered here. */
export function getCodeExecutionProvider(): CodeExecutionProvider {
  const name = (process.env.CODE_EXECUTION_PROVIDER ?? "unconfigured").toLowerCase();
  return providers[name] ?? unconfiguredCodeExecutionProvider;
}
