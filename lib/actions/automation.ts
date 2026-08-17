"use server";

import { revalidatePath } from "next/cache";
import { getAuthedCompanyId } from "@/lib/services/jd";
import { upsertAutomationRule } from "@/lib/services/scheduling";
import type { AutomationRuleKey, AutomationRule } from "@/lib/types/database";

export async function updateAutomationRuleAction(ruleKey: AutomationRuleKey, enabled: boolean): Promise<AutomationRule> {
  const { companyId } = await getAuthedCompanyId();
  const rule = await upsertAutomationRule(companyId, ruleKey, enabled);
  revalidatePath("/settings");
  return rule;
}
