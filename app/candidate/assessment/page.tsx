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
