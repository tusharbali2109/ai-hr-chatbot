import { redirect } from "next/navigation";
import { getCurrentBrowserInterviewForCandidate } from "@/lib/services/interviews";
import { getCandidateInterviewTurnAction } from "@/lib/actions/candidate-interview";
import { VideoInterviewRunner } from "./VideoInterviewRunner";

export default async function CandidateVideoInterviewPage() {
  const interview = await getCurrentBrowserInterviewForCandidate();
  if (!interview) redirect("/candidate/video-interview/none");

  if (interview.status === "PROCTORING_TERMINATED") {
    redirect("/candidate/video-interview/rejected");
  }
  if (interview.status === "COMPLETED" || interview.status === "NEEDS_REVIEW") {
    redirect("/candidate/video-interview/completed");
  }

  const turn = await getCandidateInterviewTurnAction(interview.id);
  if (turn.status === "NOT_FOUND") redirect("/candidate/video-interview/none");
  if (turn.status === "DONE") redirect("/candidate/video-interview/completed");

  return <VideoInterviewRunner interviewId={interview.id} initialQuestion={turn.question ?? ""} initialQuestionId={turn.questionId ?? ""} />;
}
