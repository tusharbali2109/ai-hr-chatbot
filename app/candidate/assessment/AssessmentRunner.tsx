"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import type { AssessmentPublic, AssessmentQuestionPublic, AssessmentAnswer } from "@/lib/types/database";

interface AnswerState {
  answerText: string;
  selectedOption: string;
  code: string;
  fileUrl: string | null;
}

function emptyAnswer(): AnswerState {
  return { answerText: "", selectedOption: "", code: "", fileUrl: null };
}

function toAnswerState(answer: AssessmentAnswer | undefined): AnswerState {
  return {
    answerText: answer?.answer_text ?? "",
    selectedOption: answer?.selected_option ?? "",
    code: answer?.code ?? "",
    fileUrl: answer?.file_url ?? null,
  };
}

function isAnswered(question: AssessmentQuestionPublic, state: AnswerState): boolean {
  if (question.type === "MCQ") return state.selectedOption.trim().length > 0;
  if (question.type === "CODING") return state.code.trim().length > 0;
  if (question.type === "FILE_UPLOAD") return Boolean(state.fileUrl);
  return state.answerText.trim().length > 0;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

export function AssessmentRunner({
  assignmentId,
  assessment,
  questions,
  initialAnswers,
  deadline,
}: {
  assignmentId: string;
  assessment: AssessmentPublic;
  questions: AssessmentQuestionPublic[];
  initialAnswers: AssessmentAnswer[];
  deadline: string;
  startedAt: string;
}) {
  const router = useRouter();
  const sortedQuestions = useMemo(() => [...questions].sort((a, b) => a.sequence - b.sequence), [questions]);

  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const byQuestion = new Map(initialAnswers.map((a) => [a.question_id, a]));
    const initial: Record<string, AnswerState> = {};
    for (const q of sortedQuestions) initial[q.id] = toAnswerState(byQuestion.get(q.id));
    return initial;
  });
  const [savingState, setSavingState] = useState<Record<string, "idle" | "saving" | "saved">>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(() => new Date(deadline).getTime() - Date.now());
  const [uploadError, setUploadError] = useState<string | null>(null);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submittedRef = useRef(false);

  const currentQuestion = sortedQuestions[currentIndex];
  const answeredCount = sortedQuestions.filter((q) => isAnswered(q, answers[q.id] ?? emptyAnswer())).length;

  async function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/assessment/${assignmentId}/submit`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Submission failed." }));
        throw new Error(body.error ?? "Submission failed.");
      }
      router.push("/candidate/assessment/submitted");
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    }
  }

  // Server-aware countdown: local tick every second, reconciled against the
  // server's clock/status every 30s (spec §10 — never trust only the
  // client). Auto-submits once time is fully up.
  useEffect(() => {
    const tick = setInterval(() => {
      setRemainingMs(new Date(deadline).getTime() - Date.now());
    }, 1000);

    const reconcile = setInterval(async () => {
      try {
        const res = await fetch(`/api/assessment/${assignmentId}/status`);
        if (!res.ok) return;
        const body = await res.json();
        if (["SUBMITTED", "EVALUATING", "COMPLETED", "EXPIRED"].includes(body.status)) {
          router.push(body.status === "EXPIRED" ? "/candidate/assessment/expired" : "/candidate/assessment/submitted");
          return;
        }
        setRemainingMs(new Date(body.deadline).getTime() - new Date(body.serverNow).getTime());
      } catch {
        // network hiccup — next tick/reconcile will catch up
      }
    }, 30000);

    return () => {
      clearInterval(tick);
      clearInterval(reconcile);
    };
  }, [assignmentId, deadline, router]);

  useEffect(() => {
    if (remainingMs <= 0 && !submittedRef.current) {
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs]);

  function scheduleAutosave(questionId: string, next: AnswerState) {
    setSavingState((s) => ({ ...s, [questionId]: "saving" }));
    if (debounceTimers.current[questionId]) clearTimeout(debounceTimers.current[questionId]);
    debounceTimers.current[questionId] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/assessment/${assignmentId}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            answerText: next.answerText || null,
            selectedOption: next.selectedOption || null,
            code: next.code || null,
          }),
        });
        setSavingState((s) => ({ ...s, [questionId]: res.ok ? "saved" : "idle" }));
      } catch {
        setSavingState((s) => ({ ...s, [questionId]: "idle" }));
      }
    }, 1500);
  }

  function updateAnswer(questionId: string, partial: Partial<AnswerState>) {
    setAnswers((prev) => {
      const next = { ...prev[questionId], ...partial };
      scheduleAutosave(questionId, next);
      return { ...prev, [questionId]: next };
    });
  }

  async function handleFileChange(questionId: string, file: File | null) {
    if (!file) return;
    setUploadError(null);
    setSavingState((s) => ({ ...s, [questionId]: "saving" }));
    const formData = new FormData();
    formData.append("questionId", questionId);
    formData.append("file", file);
    try {
      const res = await fetch(`/api/assessment/${assignmentId}/upload`, { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], fileUrl: body.path } }));
      setSavingState((s) => ({ ...s, [questionId]: "saved" }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
      setSavingState((s) => ({ ...s, [questionId]: "idle" }));
    }
  }

  if (!currentQuestion) {
    return <div className="p-8 text-sm text-muted-foreground">This assessment has no questions yet.</div>;
  }

  const state = answers[currentQuestion.id] ?? emptyAnswer();
  const saveStatus = savingState[currentQuestion.id] ?? "idle";
  const lowTime = remainingMs > 0 && remainingMs < 5 * 60 * 1000;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assessment</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{assessment.title}</h1>
            {assessment.description && <p className="mt-2 text-sm text-muted-foreground">{assessment.description}</p>}
          </div>
          {assessment.duration_minutes != null && (
            <Badge tone={lowTime ? "danger" : "info"} className="text-sm">
              {formatRemaining(remainingMs)} remaining
            </Badge>
          )}
        </div>
        {assessment.instructions && <p className="mt-4 text-sm text-muted-foreground">{assessment.instructions}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${(answeredCount / sortedQuestions.length) * 100}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          Progress: {answeredCount} / {sortedQuestions.length}
        </span>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            Question {currentIndex + 1} of {sortedQuestions.length}
          </p>
          <span className="text-xs text-muted-foreground">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}
          </span>
        </div>

        <p className="mt-3 text-base text-foreground">{currentQuestion.question}</p>
        {currentQuestion.instructions && <p className="mt-1 text-sm text-muted-foreground">{currentQuestion.instructions}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{currentQuestion.points} point{currentQuestion.points === 1 ? "" : "s"}</p>

        <div className="mt-5">
          {currentQuestion.type === "MCQ" && (
            <div className="flex flex-col gap-2">
              {(currentQuestion.options ?? []).map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                >
                  <input
                    type="radio"
                    name={currentQuestion.id}
                    checked={state.selectedOption === option}
                    onChange={() => updateAnswer(currentQuestion.id, { selectedOption: option })}
                  />
                  {option}
                </label>
              ))}
            </div>
          )}

          {(currentQuestion.type === "SHORT_ANSWER" || currentQuestion.type === "LONG_ANSWER" || currentQuestion.type === "CASE_STUDY") && (
            <textarea
              className="min-h-[160px] w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
              value={state.answerText}
              onChange={(e) => updateAnswer(currentQuestion.id, { answerText: e.target.value })}
              placeholder="Type your answer…"
            />
          )}

          {currentQuestion.type === "CODING" && (
            <div>
              <p className="mb-2 text-xs text-warning">
                Code execution is not available in this environment — your submission is reviewed by AI as written code, not run
                against test cases.
              </p>
              <textarea
                className="min-h-[240px] w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                value={state.code}
                onChange={(e) => updateAnswer(currentQuestion.id, { code: e.target.value })}
                placeholder="Write your code…"
                spellCheck={false}
              />
            </div>
          )}

          {currentQuestion.type === "FILE_UPLOAD" && (
            <div>
              <Input type="file" onChange={(e) => handleFileChange(currentQuestion.id, e.target.files?.[0] ?? null)} />
              {state.fileUrl && <p className="mt-2 text-sm text-success">File uploaded.</p>}
              {uploadError && <p className="mt-2 text-sm text-danger">{uploadError}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}>
          Previous
        </Button>
        <div className="flex gap-2">
          {currentIndex < sortedQuestions.length - 1 ? (
            <Button onClick={() => setCurrentIndex((i) => Math.min(sortedQuestions.length - 1, i + 1))}>Next</Button>
          ) : (
            <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit assessment"}
            </Button>
          )}
        </div>
      </div>

      {submitError && <p className="text-sm text-danger">{submitError}</p>}

      <ConfirmationDialog
        open={confirmOpen}
        title="Submit assessment?"
        description={`You've answered ${answeredCount} of ${sortedQuestions.length} questions. Once submitted, you won't be able to change your answers.`}
        confirmLabel="Submit"
        onConfirm={() => {
          setConfirmOpen(false);
          submit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
