"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { STAGE_META, type RecruitmentStage } from "@/lib/stages";

/** Click-to-chat only — no WhatsApp Business API, no Meta approval needed.
 * Opens WhatsApp (web or app) with a pre-filled, stage-aware message; the
 * recruiter reviews and hits send themselves, exactly like composing any
 * other WhatsApp message. */
export function WhatsAppButton({
  phone,
  candidateName,
  jobTitle,
  stage,
}: {
  phone: string;
  candidateName: string;
  jobTitle: string;
  stage: RecruitmentStage;
}) {
  const stageLabel = STAGE_META[stage]?.label ?? stage.replace(/_/g, " ").toLowerCase();
  const message = `Hi ${candidateName}, this is regarding your application for ${jobTitle}. Quick update: you're currently at the "${stageLabel}" stage. We'll follow up with next steps shortly!`;

  const digits = phone.replace(/[^\d]/g, "");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <Button variant="secondary" size="sm">
        <MessageCircle className="h-3.5 w-3.5" />
        WhatsApp
      </Button>
    </a>
  );
}
