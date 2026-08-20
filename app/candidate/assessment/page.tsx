import { redirect } from "next/navigation";
import {
  getCurrentAssignmentForCandidate,
  getAssessment,
  listAssessmentQuestionsPublic,
  listAnswersForAssignment,
  markAssignmentStarted,
  logAssessmentEvent,
} from "@/lib/services/assessments";
import { isExpired } from "@/lib/assessment/logic";
import { AssessmentRunner } from "./AssessmentRunner";
import type { AssessmentPublic } from "@/lib/types/database";

export default async function CandidateAssessmentPage() {
  const assignment = await getCurrentAssignmentForCandidate();
  if (!assignment) {
    redirect("/candidate/no-assessment");
  }

  if (assignment.status === "SUBMITTED" || assignment.status === "EVALUATING" || assignment.status === "COMPLETED") {
    redirect("/candidate/assessment/submitted");
  }

  if (assignment.status === "EXPIRED" || (assignment.status !== "ASSIGNED" && assignment.status !== "STARTED" && isExpired(assignment.deadline))) {
    redirect("/candidate/assessment/expired");
  }

  const assessment = await getAssessment(assignment.assessment_id);
  if (!assessment) redirect("/candidate/no-assessment");

  await markAssignmentStarted(assignment.id);
  await logAssessmentEvent(assignment.id, "SESSION_OPENED", {});

  // Open-ended assessments have no in-platform questions — the candidate
  // completes the task outside the platform and the recruiter uploads their
  // finished submission manually, so this just shows the brief rather than
  // an empty question runner.
  if (assessment.assessment_type === "OPEN_ENDED") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground">{assessment.title}</h1>
        {assessment.description && <p className="mt-2 text-sm text-muted-foreground">{assessment.description}</p>}
        <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Your task</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {assessment.brief_text || "Your recruiter will share the task details with you directly."}
          </p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Complete this in your own time and reply to the recruiter&apos;s email with your finished work before the deadline.
          There&apos;s nothing to submit here.
        </p>
      </div>
    );
  }

  const [questions, answers] = await Promise.all([
    listAssessmentQuestionsPublic(assignment.assessment_id),
    listAnswersForAssignment(assignment.id),
  ]);

  // Column-level projection — never forward passing_score/status/deadline
  // config to the browser (spec §27: no exposure of grading-bar info).
  const assessmentPublic: AssessmentPublic = {
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    instructions: assessment.instructions,
    type: assessment.type,
    duration_minutes: assessment.duration_minutes,
  };

  return (
    <AssessmentRunner
      assignmentId={assignment.id}
      assessment={assessmentPublic}
      questions={questions}
      initialAnswers={answers}
      deadline={assignment.deadline}
      startedAt={assignment.started_at ?? new Date().toISOString()}
    />
  );
}
