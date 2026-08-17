import { createClient } from "@/lib/supabase/server";
import { CommunicationsCenter, type EmailRow, type InterviewRow } from "./CommunicationsCenter";

export default async function CommunicationsPage() {
  const supabase = await createClient();

  const [{ data: emails }, { data: interviews }] = await Promise.all([
    supabase
      .from("email_messages")
      .select("*, candidate:candidates(name), application:applications(job:jobs(title))")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("scheduled_interviews")
      .select("*, candidate:candidates(name), interviewer:interviewers(name), application:applications(job:jobs(title))")
      .order("start_time", { ascending: false })
      .limit(200),
  ]);

  const emailRows: EmailRow[] = (emails ?? []).map((e) => ({
    id: e.id as string,
    template: e.template as string,
    recipient: e.recipient as string,
    subject: e.subject as string,
    status: e.status as string,
    provider: e.provider as string | null,
    error: e.error as string | null,
    createdAt: e.created_at as string,
    candidateName: (e.candidate as unknown as { name: string } | null)?.name ?? null,
    jobTitle: (e.application as unknown as { job: { title: string } | null } | null)?.job?.title ?? null,
  }));

  const interviewRows: InterviewRow[] = (interviews ?? []).map((i) => ({
    id: i.id as string,
    status: i.status as string,
    startTime: i.start_time as string,
    timezone: i.timezone as string,
    interviewType: i.interview_type as string,
    reminder24hSentAt: i.reminder_24h_sent_at as string | null,
    reminder2hSentAt: i.reminder_2h_sent_at as string | null,
    candidateName: (i.candidate as unknown as { name: string } | null)?.name ?? null,
    interviewerName: (i.interviewer as unknown as { name: string } | null)?.name ?? null,
    jobTitle: (i.application as unknown as { job: { title: string } | null } | null)?.job?.title ?? null,
  }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Communications Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every automated email and scheduled interview, in one timeline.</p>
      </div>
      <CommunicationsCenter emails={emailRows} interviews={interviewRows} />
    </div>
  );
}
