"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { getAIProvider } from "@/lib/ai";
import { computeOverallScore, decideWorkdayRecommendation, type TaskScoreInput } from "@/lib/workday/logic";
import type { EvaluationConfidence } from "@/lib/types/database";

export async function createWorkdaySimulationAction(jobId:string){
  const {companyId,userId}=await getAuthedCompanyId(); await assertJobOwnership(jobId,companyId); const s=await createClient();
  const {data:job,error:jobError}=await s.from("jobs").select("title,jd_status").eq("id",jobId).single();if(jobError)throw jobError;if(job.jd_status!=="APPROVED")throw new Error("Approve the JD before creating a Digital Workday.");
  const {data:simulation,error}=await s.from("workday_simulations").insert({job_id:jobId,company_id:companyId,title:`${job.title} Digital Workday`,description:"A realistic sequence of job-relevant decisions, prioritization and communication tasks.",duration_minutes:60,status:"READY",created_by:userId}).select("id").single();if(error?.code==="PGRST205")throw new Error("Phase 9 database migration is not installed. Run the Digital Workday SQL migration in Supabase first.");if(error)throw error;
  const tasks=[
    {sequence:1,task_type:"INBOX",title:"Morning inbox triage",scenario:"You start with three urgent messages: a customer reports a production issue, your manager needs an estimate by noon, and a teammate is blocked waiting for review. Explain your order of action and draft the first response.",deliverable:"Prioritized action plan and first message",time_budget_minutes:12,rubric:["prioritization","clarity","risk awareness"]},
    {sequence:2,task_type:"CUSTOMER_ESCALATION",title:"Customer escalation",scenario:"The customer says the issue is affecting revenue but the root cause is not yet confirmed. Respond without overpromising and outline the investigation.",deliverable:"Customer response and investigation steps",time_budget_minutes:15,rubric:["empathy","ownership","technical judgment"]},
    {sequence:3,task_type:"DECISION",title:"Changing requirements",scenario:"Halfway through delivery, a stakeholder asks for a major scope change while keeping the deadline. Decide what to do, what to clarify, and what trade-offs to present.",deliverable:"Decision memo with questions and trade-offs",time_budget_minutes:18,rubric:["decision quality","clarification","trade-off reasoning"]},
    {sequence:4,task_type:"REFLECTION",title:"End-of-day reflection",scenario:"Review your earlier decisions. Identify one assumption you would verify and one decision you might change with more information.",deliverable:"Concise reflection",time_budget_minutes:15,rubric:["self-correction","learning agility","evidence use"]}
  ]; const{error:taskError}=await s.from("workday_tasks").insert(tasks.map(t=>({...t,simulation_id:simulation.id})));if(taskError)throw taskError;revalidatePath("/workday");return simulation.id;
}
export async function assignWorkdayAction(simulationId:string,applicationId:string,candidateId:string){const s=await createClient();const deadline=new Date(Date.now()+3*86400000).toISOString();const{error}=await s.from("workday_assignments").upsert({simulation_id:simulationId,application_id:applicationId,candidate_id:candidateId,status:"ASSIGNED",deadline},{onConflict:"simulation_id,application_id"});if(error)throw error;revalidatePath(`/workday/${simulationId}`);}
export async function saveWorkdayResponseAction(assignmentId:string,taskId:string,responseText:string,assumptions:string,aiUsageDisclosure:string,confidence:number){const s=await createClient();const{error}=await s.from("workday_responses").upsert({assignment_id:assignmentId,task_id:taskId,response_text:responseText,assumptions,ai_usage_disclosure:aiUsageDisclosure,confidence,auto_saved_at:new Date().toISOString()},{onConflict:"assignment_id,task_id"});if(error)throw error;await s.from("workday_events").insert({assignment_id:assignmentId,task_id:taskId,event_type:"RESPONSE_SAVED"});}
/**
 * Real AI evaluation, one call per task (mirrors evaluateAssessmentSubmission
 * in lib/assessment/evaluation-agent.ts) — replaces the earlier heuristic
 * that only checked response length and whether two fields were non-empty,
 * which could rubber-stamp a candidate who pasted gibberish into every task.
 * lib/workday/logic.ts aggregates the per-task AI scores into a
 * deterministic overall score and ADVANCE/REJECT/NEEDS_REVIEW recommendation
 * — the AI never emits a whole-session verdict directly.
 */
export async function submitWorkdayAction(assignmentId: string) {
  const s = await createClient();

  const { data: assignment, error: assignmentError } = await s
    .from("workday_assignments")
    .select("simulation_id, workday_simulations(job_id, jobs(title))")
    .eq("id", assignmentId)
    .single();
  if (assignmentError) throw assignmentError;
  const jobTitle =
    (assignment as unknown as { workday_simulations: { jobs: { title: string } } }).workday_simulations?.jobs?.title ?? "this role";

  const { data: responses, error: rError } = await s
    .from("workday_responses")
    .select("id, task_id, response_text, assumptions, ai_usage_disclosure, workday_tasks(task_type, title, scenario, deliverable, rubric)")
    .eq("assignment_id", assignmentId);
  if (rError) throw rError;
  if (!responses?.length) throw new Error("Complete at least one task before submitting.");

  const provider = getAIProvider();
  const evaluations: { taskScore: TaskScoreInput; confidence: EvaluationConfidence }[] = [];

  for (const response of responses) {
    const task = (response as unknown as { workday_tasks: { task_type: string; title: string; scenario: string; deliverable: string; rubric: string[] } })
      .workday_tasks;

    const result = await provider.evaluateWorkdayTask({
      jobTitle,
      taskType: task.task_type,
      taskTitle: task.title,
      scenario: task.scenario,
      deliverable: task.deliverable,
      rubric: task.rubric ?? [],
      candidateResponse: response.response_text,
      candidateAssumptions: response.assumptions,
      candidateAiDisclosure: response.ai_usage_disclosure,
    });

    await s
      .from("workday_responses")
      .update({ score: result.score, evaluator_feedback: result.feedback })
      .eq("id", response.id);

    evaluations.push({ taskScore: { score: result.score }, confidence: result.confidence });
  }

  const overallScore = computeOverallScore(evaluations.map((e) => e.taskScore));
  const { recommendation, reason } = decideWorkdayRecommendation(
    overallScore,
    evaluations.map((e) => e.confidence)
  );

  const { error } = await s
    .from("workday_assignments")
    .update({
      status: "EVALUATED",
      submitted_at: new Date().toISOString(),
      overall_score: overallScore,
      recommendation,
      evaluation_summary: reason,
      dimension_scores: { average_task_score: overallScore, tasks_evaluated: evaluations.length },
    })
    .eq("id", assignmentId);
  if (error) throw error;

  await s.from("workday_events").insert({ assignment_id: assignmentId, event_type: "SESSION_SUBMITTED" });
  revalidatePath("/candidate/workday");
}
