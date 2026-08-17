import type { CodeExecutionProvider, ExecutionResult } from "@/lib/assessment/code-execution/provider";
import { CodeExecutionNotConfiguredError } from "@/lib/assessment/code-execution/provider";

/** The only provider registered today — always throws. Callers must catch
 * CodeExecutionNotConfiguredError and fall back to text-only AI evaluation
 * of the submitted code rather than claiming a test-case run happened. */
export const unconfiguredCodeExecutionProvider: CodeExecutionProvider = {
  name: "unconfigured",
  configured: false,
  async execute(): Promise<ExecutionResult> {
    throw new CodeExecutionNotConfiguredError();
  },
};
