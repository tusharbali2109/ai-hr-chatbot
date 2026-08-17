import { describe, it, expect } from "vitest";
import { renderTemplate, MissingTemplateVariableError, computeIdempotencyKey, isAutomationEnabled } from "@/lib/communication/logic";

describe("renderTemplate", () => {
  it("replaces all placeholders", () => {
    expect(renderTemplate("Hi {{name}}, welcome to {{company}}.", { name: "Ada", company: "Nova" })).toBe(
      "Hi Ada, welcome to Nova."
    );
  });

  it("replaces repeated placeholders", () => {
    expect(renderTemplate("{{name}} {{name}}", { name: "Ada" })).toBe("Ada Ada");
  });

  it("throws MissingTemplateVariableError when a variable is missing", () => {
    expect(() => renderTemplate("Hi {{name}}", {})).toThrow(MissingTemplateVariableError);
  });

  it("leaves text with no placeholders untouched", () => {
    expect(renderTemplate("No variables here.", {})).toBe("No variables here.");
  });
});

describe("computeIdempotencyKey", () => {
  it("combines application id, event type, and template version", () => {
    expect(computeIdempotencyKey("app-1", "assessment.assigned", 1)).toBe("app-1:assessment.assigned:v1");
  });

  it("differs when template version changes", () => {
    expect(computeIdempotencyKey("app-1", "assessment.assigned", 1)).not.toBe(computeIdempotencyKey("app-1", "assessment.assigned", 2));
  });
});

describe("isAutomationEnabled", () => {
  it("defaults to enabled when no rule row exists", () => {
    expect(isAutomationEnabled([], "auto_send_assessment_email")).toBe(true);
  });

  it("respects an explicit disabled rule", () => {
    const rules = [{ rule_key: "auto_send_assessment_email" as const, enabled: false }];
    expect(isAutomationEnabled(rules, "auto_send_assessment_email")).toBe(false);
  });

  it("respects an explicit enabled rule", () => {
    const rules = [{ rule_key: "auto_schedule_interview" as const, enabled: true }];
    expect(isAutomationEnabled(rules, "auto_schedule_interview")).toBe(true);
  });
});
