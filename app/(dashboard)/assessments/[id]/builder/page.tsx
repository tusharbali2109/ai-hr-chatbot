import { notFound } from "next/navigation";
import { getAssessment, listAssessmentQuestions } from "@/lib/services/assessments";
import { getJob } from "@/lib/services/jobs";
import { AssessmentBuilder } from "./AssessmentBuilder";

export default async function AssessmentBuilderPage({ params }: PageProps<"/assessments/[id]/builder">) {
  const { id } = await params;

  const assessment = await getAssessment(id);
  if (!assessment) notFound();

  const [job, questions] = await Promise.all([getJob(assessment.job_id), listAssessmentQuestions(id)]);
  if (!job) notFound();

  return <AssessmentBuilder assessment={assessment} jobTitle={job.title} initialQuestions={questions} />;
}
