export interface CodeExecutionTestCase {
  input: string;
  expectedOutput: string;
}

export interface ExecuteCodeInput {
  language: string;
  code: string;
  testCases: CodeExecutionTestCase[];
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface TestCaseResult {
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
  durationMs: number;
}

export interface ExecutionResult {
  testResults: TestCaseResult[];
  allPassed: boolean;
  compileError: string | null;
  runtimeError: string | null;
}

/**
 * Contract for a secure, isolated code-execution sandbox (spec §17 —
 * candidate code must never run directly on the application server). No
 * provider is configured in this codebase yet; see unconfigured-provider.ts.
 * A real integration (e.g. Judge0, Piston, E2B) implements this interface
 * and gets registered in registry.ts — nothing else in the app needs to
 * change.
 */
export interface CodeExecutionProvider {
  readonly name: string;
  readonly configured: boolean;
  execute(input: ExecuteCodeInput): Promise<ExecutionResult>;
}

export class CodeExecutionNotConfiguredError extends Error {
  constructor() {
    super(
      "No secure code-execution sandbox is configured for this environment. CODING questions are evaluated by AI reading the submitted code as text only — no test cases are run, and this must not be presented to recruiters as autograded/production-ready code execution."
    );
    this.name = "CodeExecutionNotConfiguredError";
  }
}
