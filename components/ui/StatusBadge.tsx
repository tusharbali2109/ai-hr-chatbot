import { STAGE_META, type RecruitmentStage } from "@/lib/stages";
import { Badge } from "@/components/ui/Badge";

export function StatusBadge({ stage }: { stage: RecruitmentStage }) {
  const meta = STAGE_META[stage];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
