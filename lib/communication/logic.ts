import type { AutomationRule, AutomationRuleKey } from "@/lib/types/database";

export class MissingTemplateVariableError extends Error {
  constructor(variable: string) {
    super(`Template is missing a value for required variable "${variable}".`);
    this.name = "MissingTemplateVariableError";
  }
}

/** Renders `{{key}}` placeholders. Throws on a missing variable rather than
 * silently leaving a literal `{{key}}` in a sent email. */
export function renderTemplate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined) throw new MissingTemplateVariableError(key);
    return value;
  });
}

/** Spec §5 — application_id + event_type + template_version. */
export function computeIdempotencyKey(applicationId: string, eventType: string, templateVersion: number): string {
  return `${applicationId}:${eventType}:v${templateVersion}`;
}

/** Absence of a row for a rule is enabled-by-default (spec §30 — automation
 * rules only need to store explicit overrides). */
export function isAutomationEnabled(rules: Pick<AutomationRule, "rule_key" | "enabled">[], key: AutomationRuleKey): boolean {
  const rule = rules.find((r) => r.rule_key === key);
  return rule ? rule.enabled : true;
}
