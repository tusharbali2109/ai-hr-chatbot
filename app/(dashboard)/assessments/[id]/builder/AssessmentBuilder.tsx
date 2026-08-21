"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, CheckCircle2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  saveAssessmentMetaAction,
  saveAssessmentQuestionAction,
  deleteAssessmentQuestionAction,
  reorderQuestionsAction,
  approveAssessmentAction,
  regenerateAssessmentQuestionsAction,
} from "@/lib/actions/assessment";
import { DEADLINE_PRESETS, formatDeadlineConfig } from "@/lib/assessment/logic";
import type { Assessment, AssessmentQuestion, AssessmentQuestionType, QuestionDifficulty } from "@/lib/types/database";

const QUESTION_TYPES: AssessmentQuestionType[] = ["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "CODING", "CASE_STUDY", "FILE_UPLOAD"];
const DIFFICULTIES: QuestionDifficulty[] = ["EASY", "MEDIUM", "HARD"];

interface QuestionDraft {
  id?: string;
  type: AssessmentQuestionType;
  question: string;
  instructions: string;
  points: number;
  difficulty: QuestionDifficulty;
  optionsText: string;
  expectedAnswer: string;
  evaluationCriteria: string;
}

function emptyDraft(): QuestionDraft {
  return {
    type: "SHORT_ANSWER",
    question: "",
    instructions: "",
    points: 10,
    difficulty: "MEDIUM",
    optionsText: "",
    expectedAnswer: "",
    evaluationCriteria: "",
  };
}

function draftFromQuestion(q: AssessmentQuestion): QuestionDraft {
  return {
    id: q.id,
    type: q.type,
    question: q.question,
    instructions: q.instructions ?? "",
    points: q.points,
    difficulty: q.difficulty,
    optionsText: (q.options ?? []).join("\n"),
    expectedAnswer: q.expected_answer ?? "",
    evaluationCriteria: q.evaluation_criteria ?? "",
  };
}

export function AssessmentBuilder({
  assessment,
  jobTitle,
  initialQuestions,
}: {
  assessment: Assessment;
  jobTitle: string;
  initialQuestions: AssessmentQuestion[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [questions, setQuestions] = useState(() => [...initialQuestions].sort((a, b) => a.sequence - b.sequence));
  const [title, setTitle] = useState(assessment.title);
  const [description, setDescription] = useState(assessment.description);
  const [instructions, setInstructions] = useState(assessment.instructions);
  const [durationMinutes, setDurationMinutes] = useState(assessment.duration_minutes?.toString() ?? "");
  const [passingScore, setPassingScore] = useState(assessment.passing_score.toString());
  const presetIndex = DEADLINE_PRESETS.findIndex((p) => p.config.unit === assessment.deadline_unit && p.config.value === assessment.deadline_value);
  const [deadlinePreset, setDeadlinePreset] = useState(presetIndex >= 0 ? presetIndex : 2);
  const [savingMeta, setSavingMeta] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editingDraft, setEditingDraft] = useState<QuestionDraft | null>(null);
  const [regenerateInstruction, setRegenerateInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const editable = assessment.status === "DRAFT";

  async function handleSaveMeta() {
    setSavingMeta(true);
    try {
      await saveAssessmentMetaAction(assessment.id, {
        title,
        description,
        instructions,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        passingScore: Number(passingScore),
        deadlineConfig: DEADLINE_PRESETS[deadlinePreset].config,
      });
      showToast("Assessment details saved.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save.", "danger");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveQuestion() {
    if (!editingDraft) return;
    try {
      const sequence = editingDraft.id ? questions.find((q) => q.id === editingDraft.id)?.sequence ?? questions.length + 1 : questions.length + 1;
      const saved = await saveAssessmentQuestionAction({
        id: editingDraft.id,
        assessmentId: assessment.id,
        sequence,
        type: editingDraft.type,
        question: editingDraft.question,
        instructions: editingDraft.instructions || null,
        points: editingDraft.points,
        difficulty: editingDraft.difficulty,
        options: editingDraft.type === "MCQ" ? editingDraft.optionsText.split("\n").map((o) => o.trim()).filter(Boolean) : null,
        expectedAnswer: editingDraft.expectedAnswer || null,
        evaluationCriteria: editingDraft.evaluationCriteria || null,
      });
      setQuestions((prev) => {
        const withoutOld = prev.filter((q) => q.id !== saved.id);
        return [...withoutOld, saved].sort((a, b) => a.sequence - b.sequence);
      });
      setEditingDraft(null);
      showToast("Question saved.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save question.", "danger");
    }
  }

  async function handleDelete(questionId: string) {
    try {
      await deleteAssessmentQuestionAction(assessment.id, questionId);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      showToast("Question deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete question.", "danger");
    }
  }

  async function handleReorder(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
    try {
      await reorderQuestionsAction(assessment.id, next.map((q) => q.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to reorder.", "danger");
    }
  }

  async function handleRegenerate() {
    if (!regenerateInstruction.trim()) return;
    setRegenerating(true);
    try {
      const saved = await regenerateAssessmentQuestionsAction(assessment.id, regenerateInstruction);
      setQuestions([...saved].sort((a, b) => a.sequence - b.sequence));
      setRegenerateInstruction("");
      showToast("Questions regenerated. Review the changes below before approving.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to regenerate questions.", "danger");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await approveAssessmentAction(assessment.id);
      showToast("Assessment approved — ready to assign.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to approve.", "danger");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/assessments" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Assessments
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title || "Untitled Assessment"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobTitle} · v{assessment.assessment_version}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={assessment.status === "READY" ? "success" : "neutral"}>{assessment.status}</Badge>
          {editable && (
            <Button onClick={handleApprove} disabled={approving || questions.length === 0}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {approving ? "Approving…" : "Approve"}
            </Button>
          )}
        </div>
      </div>

      {!editable && (
        <p className="mb-4 rounded-[var(--radius-md)] bg-warning/10 px-3 py-2 text-sm text-warning">
          This assessment is {assessment.status.toLowerCase()} and read-only. Generate a new version to make changes.
        </p>
      )}

      <div className="mb-6 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-foreground">Details</h3>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!editable}
            rows={2}
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-60"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Candidate instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            disabled={!editable}
            rows={2}
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-60"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Duration (minutes, blank = untimed)</label>
            <Input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} disabled={!editable} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Passing score (%)</label>
            <Input type="number" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} disabled={!editable} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Deadline</label>
            <Select value={String(deadlinePreset)} onChange={(e) => setDeadlinePreset(Number(e.target.value))} disabled={!editable}>
              {DEADLINE_PRESETS.map((preset, i) => (
                <option key={preset.label} value={i}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {editable && (
          <div>
            <Button size="sm" variant="secondary" onClick={handleSaveMeta} disabled={savingMeta}>
              {savingMeta ? "Saving…" : "Save details"}
            </Button>
            <span className="ml-3 text-xs text-muted-foreground">
              Deadline once assigned: {formatDeadlineConfig(DEADLINE_PRESETS[deadlinePreset].config)} from assignment time.
            </span>
          </div>
        )}
      </div>

      {editable && (
        <div className="mb-6 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-foreground">Regenerate with instructions</h3>
          <p className="text-xs text-muted-foreground">
            Tell the AI how to change the question set — e.g. &quot;make question 3 harder&quot; or &quot;add 2 more questions about React
            hooks&quot;. This replaces the entire question list below with the AI&apos;s revised version; review it before approving.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={regenerateInstruction}
              onChange={(e) => setRegenerateInstruction(e.target.value)}
              placeholder="e.g. Add 2 more questions about React hooks"
              className="flex-1"
            />
            <Button onClick={handleRegenerate} disabled={regenerating || !regenerateInstruction.trim()}>
              <Sparkles className="h-3.5 w-3.5" />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Questions ({questions.length})</h3>
        {editable && (
          <Button size="sm" variant="secondary" onClick={() => setEditingDraft(emptyDraft())}>
            <Plus className="h-3.5 w-3.5" />
            Add question
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{q.type.replace(/_/g, " ")}</Badge>
                  <Badge tone="info">{q.difficulty}</Badge>
                  <Badge tone="accent">{q.points} pts</Badge>
                </div>
                <p className="mt-2 text-sm text-foreground">{q.question}</p>
              </div>
              {editable && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleReorder(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleReorder(i, 1)} disabled={i === questions.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDraft(draftFromQuestion(q))}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(q.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={editingDraft != null} onClose={() => setEditingDraft(null)} title={editingDraft?.id ? "Edit question" : "Add question"} className="max-w-xl">
        {editingDraft && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={editingDraft.type} onChange={(e) => setEditingDraft({ ...editingDraft, type: e.target.value as AssessmentQuestionType })}>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
                <Select value={editingDraft.difficulty} onChange={(e) => setEditingDraft({ ...editingDraft, difficulty: e.target.value as QuestionDifficulty })}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Question</label>
              <textarea
                value={editingDraft.question}
                onChange={(e) => setEditingDraft({ ...editingDraft, question: e.target.value })}
                rows={3}
                className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Instructions (optional)</label>
              <Input value={editingDraft.instructions} onChange={(e) => setEditingDraft({ ...editingDraft, instructions: e.target.value })} />
            </div>

            {editingDraft.type === "MCQ" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Options (one per line)</label>
                <textarea
                  value={editingDraft.optionsText}
                  onChange={(e) => setEditingDraft({ ...editingDraft, optionsText: e.target.value })}
                  rows={3}
                  className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Expected / reference answer (optional)</label>
              <textarea
                value={editingDraft.expectedAnswer}
                onChange={(e) => setEditingDraft({ ...editingDraft, expectedAnswer: e.target.value })}
                rows={2}
                className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Evaluation criteria</label>
              <textarea
                value={editingDraft.evaluationCriteria}
                onChange={(e) => setEditingDraft({ ...editingDraft, evaluationCriteria: e.target.value })}
                rows={2}
                className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Points</label>
              <Input
                type="number"
                value={editingDraft.points}
                onChange={(e) => setEditingDraft({ ...editingDraft, points: Number(e.target.value) })}
              />
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingDraft(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveQuestion} disabled={!editingDraft.question.trim() || !editingDraft.points}>
                Save
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
