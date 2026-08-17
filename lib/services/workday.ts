import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

async function client(provided?: SupabaseClient) { return provided ?? await createServerClient() as unknown as SupabaseClient; }
export function isWorkdaySchemaMissing(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as {code?:string}).code === "PGRST205"); }

export interface WorkdayTask { id:string; simulation_id:string; sequence:number; task_type:string; title:string; scenario:string; deliverable:string; time_budget_minutes:number; rubric:string[]; }
export interface WorkdaySimulation { id:string; job_id:string; company_id:string; title:string; description:string; duration_minutes:number; status:"DRAFT"|"READY"|"ARCHIVED"; created_at:string; }
export interface WorkdayAssignment { id:string; simulation_id:string; application_id:string; candidate_id:string; status:string; deadline:string; started_at:string|null; submitted_at:string|null; overall_score:number|null; recommendation:string|null; evaluation_summary:string|null; dimension_scores:Record<string,number>; }

export async function listSimulations(provided?: SupabaseClient) {
  const supabase=await client(provided); const {data,error}=await supabase.from("workday_simulations").select("*,job:jobs(title)").order("created_at",{ascending:false}); if(isWorkdaySchemaMissing(error)) return []; if(error) throw error; return data??[];
}
export async function getSimulation(id:string, provided?: SupabaseClient):Promise<WorkdaySimulation|null>{const s=await client(provided);const {data,error}=await s.from("workday_simulations").select("*").eq("id",id).maybeSingle();if(error)throw error;return data as WorkdaySimulation|null;}
export async function listTasks(simulationId:string, provided?:SupabaseClient):Promise<WorkdayTask[]>{const s=await client(provided);const {data,error}=await s.from("workday_tasks").select("id,simulation_id,sequence,task_type,title,scenario,deliverable,time_budget_minutes").eq("simulation_id",simulationId).order("sequence");if(error)throw error;return (data??[]) as WorkdayTask[];}
export async function getCandidateAssignment(provided?:SupabaseClient):Promise<WorkdayAssignment|null>{const s=await client(provided);const {data,error}=await s.from("workday_assignments").select("*").in("status",["ASSIGNED","IN_PROGRESS"]).order("created_at",{ascending:false}).limit(1).maybeSingle();if(isWorkdaySchemaMissing(error))return null;if(error)throw error;return data as WorkdayAssignment|null;}
export async function listResponses(assignmentId:string,provided?:SupabaseClient){const s=await client(provided);const{data,error}=await s.from("workday_responses").select("*").eq("assignment_id",assignmentId);if(error)throw error;return data??[];}
