import { Badge } from "@/components/ui/Badge";
import type { InterviewAnswer, InterviewQuestion } from "@/lib/types/database";

const SUFFICIENCY_TONE: Record<string, "success" | "warning" | "danger"> = {
  SUFFICIENT: "success",
  PARTIAL: "warning",
  INSUFFICIENT: "danger",
};

/** Native <details>/<summary> gives collapsible sections with zero client
 * JS — the transcript is reconstructed from interview_questions +
 * interview_answers (no separate transcript blob table), ordered by
 * sequence, one collapsible entry per question/follow-up pair. */
export function InterviewTranscript({ questions, answers }: { questions: InterviewQuestion[]; answers: InterviewAnswer[] }) {
  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">No transcript available.</p>;
  }

  const answersByQuestion = new Map(answers.map((a) => [a.question_id, a]));
  const ordered = [...questions].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((question) => {
        const answer = answersByQuestion.get(question.id);
        return (
          <details key={question.id} className="group rounded-[var(--radius-md)] border border-border p-3 open:bg-surface-elevated">
            <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                {question.question_type === "FOLLOWUP" && (
                  <Badge tone="info" className="text-[10px]">
                    Follow-up
                  </Badge>
                )}
                {question.question}
              </span>
              {answer?.sufficiency && <Badge tone={SUFFICIENCY_TONE[answer.sufficiency] ?? "neutral"}>{answer.sufficiency}</Badge>}
            </summary>
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI</p>
                <p className="text-foreground">{question.question}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Candidate</p>
                <p className="text-foreground">{answer?.transcript ?? "No answer recorded."}</p>
              </div>
              {answer?.evaluation && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evaluation</p>
                  <p className="text-muted-foreground">{answer.evaluation}</p>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
