"use client";

import { useState } from "react";
import type { RequirementExtraction, JDGeneration } from "@/lib/ai/schemas";
import type { StructuredInputOverrides } from "@/lib/ai/provider";
import { extractRequirementAction, generateJdAction } from "@/lib/actions/jd";
import { useToast } from "@/components/ui/Toast";
import { Stepper, type WizardStep } from "./Stepper";
import { RequirementStep } from "./RequirementStep";
import { UnderstandingStep } from "./UnderstandingStep";
import { GeneratingStep } from "./GeneratingStep";
import { ReviewStep } from "./ReviewStep";

export function JobWizard() {
  const { showToast } = useToast();

  const [step, setStep] = useState<WizardStep>("requirement");
  const [rawRequirement, setRawRequirement] = useState("");
  const [overrides, setOverrides] = useState<StructuredInputOverrides>({});
  const [requirement, setRequirement] = useState<RequirementExtraction | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generatingDone, setGeneratingDone] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jd, setJd] = useState<JDGeneration | null>(null);

  async function submitRequirement(raw: string, nextOverrides: StructuredInputOverrides) {
    setExtracting(true);
    setExtractError(null);
    try {
      const result = await extractRequirementAction(raw, nextOverrides);
      setRawRequirement(raw);
      setOverrides(nextOverrides);
      setRequirement(result);
      setStep("understanding");
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Failed to understand this requirement.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleGenerate() {
    if (!requirement) return;
    setStep("generating");
    setGenerating(true);
    setGeneratingDone(false);
    try {
      const result = await generateJdAction(requirement, overrides);
      setJobId(result.jobId);
      setJd(result.jd);
      setGeneratingDone(true);
      setTimeout(() => setStep("review"), 700);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to generate the job description.", "danger");
      setStep("understanding");
    } finally {
      setGenerating(false);
    }
  }

  function pickClarification(option: string) {
    const enriched = `${rawRequirement}\n\nRole type: ${option}`;
    submitRequirement(enriched, overrides);
  }

  return (
    <div>
      <Stepper current={step} />

      {step === "requirement" && (
        <RequirementStep
          onSubmit={submitRequirement}
          submitting={extracting}
          error={extractError}
          initialRawRequirement={rawRequirement}
        />
      )}

      {step === "understanding" && requirement && (
        <UnderstandingStep
          requirement={requirement}
          onConfirm={handleGenerate}
          onBack={() => setStep("requirement")}
          onPickClarification={pickClarification}
          generating={generating}
        />
      )}

      {step === "generating" && <GeneratingStep done={generatingDone} />}

      {step === "review" && jobId && jd && requirement && (
        <ReviewStep jobId={jobId} initialJd={jd} requirement={requirement} />
      )}
    </div>
  );
}
