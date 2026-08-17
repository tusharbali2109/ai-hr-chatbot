"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { updateAutomationRuleAction } from "@/lib/actions/automation";
import { isAutomationEnabled } from "@/lib/communication/logic";
import type { AutomationRule, AutomationRuleKey } from "@/lib/types/database";

const RULES: { key: AutomationRuleKey; label: string; description: string }[] = [
  { key: "auto_send_assessment_email", label: "Send assessment invitation", description: "Email the candidate automatically when an assessment is assigned." },
  { key: "auto_send_assessment_reminder", label: "Send assessment reminders", description: "Remind candidates 24 hours before their assessment deadline." },
  { key: "auto_schedule_interview", label: "Auto-schedule interviews", description: "Automatically propose and book interview slots when calendars are configured." },
  { key: "auto_send_interview_reminders", label: "Send interview reminders", description: "Remind candidates and interviewers 24h and 2h before a scheduled interview." },
  { key: "auto_notify_interviewer", label: "Notify interviewer", description: "Send the interviewer their own confirmation and reminder emails." },
  { key: "auto_send_status_emails", label: "Send status update emails", description: "Submission confirmation, next-step, rejection, and needs-review emails after assessment evaluation." },
];

export function AutomationRulesPanel({ rules }: { rules: AutomationRule[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState<AutomationRuleKey | null>(null);

  async function handleToggle(key: AutomationRuleKey, next: boolean) {
    setPending(key);
    try {
      await updateAutomationRuleAction(key, next);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update automation rule.", "danger");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h3 className="mb-1 text-sm font-semibold text-foreground">Automation Rules</h3>
      <p className="mb-4 text-xs text-muted-foreground">Turn individual automations on or off for this company.</p>

      <div className="flex flex-col divide-y divide-border">
        {RULES.map((rule) => {
          const enabled = isAutomationEnabled(rules, rule.key);
          return (
            <div key={rule.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-foreground">{rule.label}</p>
                <p className="text-xs text-muted-foreground">{rule.description}</p>
              </div>
              <button
                role="switch"
                aria-checked={enabled}
                disabled={pending === rule.key}
                onClick={() => handleToggle(rule.key, !enabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[var(--duration-fast)] disabled:opacity-50 ${
                  enabled ? "bg-accent" : "bg-surface-elevated"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-[var(--duration-fast)] ${
                    enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
