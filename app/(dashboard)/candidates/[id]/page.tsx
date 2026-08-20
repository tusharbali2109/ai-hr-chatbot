import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Link2, Globe, FileText, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { getCandidate, listCandidateApplications } from "@/lib/services/candidates";
import { listStageHistory } from "@/lib/services/applications";
import { getLatestScreening } from "@/lib/services/screening";
import { getLatestInterview } from "@/lib/services/interviews";
import { getLatestAssessmentForJob, getLatestAssignmentForApplication } from "@/lib/services/assessments";
import { listInterviewersForCompany, getCurrentScheduledInterviewForApplication, listAvailabilityForApplication } from "@/lib/services/scheduling";
import { RECRUITMENT_STAGES, type RecruitmentStage } from "@/lib/stages";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreCard } from "@/components/recruitment/ScoreCard";
import { Timeline, type TimelineEntry } from "@/components/recruitment/Timeline";
import { ActivityFeed, type ActivityEntry } from "@/components/recruitment/ActivityFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreeningActions } from "./ScreeningActions";
import { InterviewActions } from "./InterviewActions";
import { InterviewTranscript } from "./InterviewTranscript";
import { AssessmentActions } from "./AssessmentActions";
import { InterviewSchedulingActions } from "./InterviewSchedulingActions";
import { WhatsAppButton } from "./WhatsAppButton";

const REQUIREMENT_STATUS_ICON: Record<string, typeof CheckCircle2> = {
  MATCH: CheckCircle2,
  NO_MATCH: XCircle,
  UNKNOWN: HelpCircle,
};

const REQUIREMENT_STATUS_TONE: Record<string, "success" | "danger" | "neutral"> = {
  MATCH: "success",
  NO_MATCH: "danger",
  UNKNOWN: "neutral",
};

export default async function CandidateDetailPage({ params }: PageProps<"/candidates/[id]">) {
  const { id } = await params;

  const candidate = await getCandidate(id);
  if (!candidate) notFound();

  const applications = await listCandidateApplications(id);
  const primaryApplication = applications[0] ?? null;

  const history = primaryApplication ? await listStageHistory(primaryApplication.id) : [];
  const screening = primaryApplication ? await getLatestScreening(primaryApplication.id) : null;
  const interview = primaryApplication ? await getLatestInterview(primaryApplication.id) : null;
  const jobAssessment = primaryApplication ? await getLatestAssessmentForJob(primaryApplication.job_id) : null;
  const assessmentAssignment = primaryApplication ? await getLatestAssignmentForApplication(primaryApplication.id) : null;
  const interviewers = await listInterviewersForCompany();
  const scheduledInterview = primaryApplication ? await getCurrentScheduledInterviewForApplication(primaryApplication.id) : null;
  const candidateAvailability = primaryApplication ? await listAvailabilityForApplication(primaryApplication.id) : [];

  const RETRYABLE_INTERVIEW_STATUSES = ["NO_ANSWER", "BUSY", "CALL_FAILED", "NETWORK_ERROR", "PROVIDER_ERROR", "CANDIDATE_DISCONNECTED"];
  const canRetryInterview = Boolean(
    interview && RETRYABLE_INTERVIEW_STATUSES.includes(interview.status) && interview.attempt_number < interview.max_attempts
  );

  const interviewComponentScoreLabels: { key: keyof NonNullable<typeof interview>["component_scores"]; label: string }[] = [
    { key: "technicalKnowledge", label: "Technical Knowledge" },
    { key: "problemSolving", label: "Problem Solving" },
    { key: "relevantExperience", label: "Relevant Experience" },
    { key: "roleSpecificSkills", label: "Role Skills" },
    { key: "communicationClarity", label: "Communication" },
  ];

  const componentScoreLabels: { key: keyof NonNullable<typeof screening>["component_scores"]; label: string }[] = [
    { key: "required_skills", label: "Required Skills" },
    { key: "experience", label: "Experience" },
    { key: "relevant_experience", label: "Relevant Experience" },
    { key: "jd_semantic_match", label: "JD Match" },
    { key: "preferred_skills", label: "Preferred Skills" },
    { key: "education_other", label: "Education/Other" },
  ];

  const mandatoryRequirements = screening?.requirements.filter((r) => r.requirement_type === "MANDATORY") ?? [];
  const preferredRequirements = screening?.requirements.filter((r) => r.requirement_type === "PREFERRED") ?? [];

  const reachedStages = new Set(history.map((h) => h.to_stage));
  const timelineStages: RecruitmentStage[] = primaryApplication
    ? RECRUITMENT_STAGES.slice(0, RECRUITMENT_STAGES.indexOf(primaryApplication.current_stage) + 1)
    : [];
  const timelineEntries: TimelineEntry[] = timelineStages.map((stage) => ({
    stage,
    date: history.find((h) => h.to_stage === stage)?.created_at ?? null,
    reached: reachedStages.has(stage) || stage === primaryApplication?.current_stage,
  }));

  const activity: ActivityEntry[] = history
    .slice()
    .reverse()
    .map((h) => ({
      id: h.id,
      description: h.reason ?? `Moved to ${h.to_stage.replaceAll("_", " ").toLowerCase()}`,
      toStage: h.to_stage,
      createdAt: h.created_at,
    }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/candidates" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Candidates
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-semibold text-accent">
            {candidate.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{candidate.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {primaryApplication ? `Applied for ${primaryApplication.job.title}` : "No active application"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {candidate.email}
              </span>
              {candidate.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {candidate.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {primaryApplication && <StatusBadge stage={primaryApplication.current_stage} />}
          {primaryApplication?.overall_score != null && (
            <Badge tone="accent">AI Score: {primaryApplication.overall_score}%</Badge>
          )}
          {candidate.phone && primaryApplication && (
            <WhatsAppButton
              phone={candidate.phone}
              candidateName={candidate.name}
              jobTitle={primaryApplication.job.title}
              stage={primaryApplication.current_stage}
            />
          )}
        </div>
      </div>

      {primaryApplication && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">AI Screening</h2>
          <ScreeningActions
            applicationId={primaryApplication.id}
            jobId={primaryApplication.job_id}
            currentStage={primaryApplication.current_stage}
            recommendation={screening?.recommendation ?? null}
            hasScreening={screening != null}
          />
        </div>
      )}

      {primaryApplication && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">AI Interview</h2>
          <InterviewActions
            applicationId={primaryApplication.id}
            jobId={primaryApplication.job_id}
            currentStage={primaryApplication.current_stage}
            recommendation={interview?.recommendation ?? null}
            hasInterview={interview != null}
            canRetry={canRetryInterview}
          />
          {interview && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <InterviewFact label="Status" value={interview.status.replace(/_/g, " ")} />
              <InterviewFact label="Provider" value={interview.provider === "mock" ? "Mock (dev)" : interview.provider} />
              <InterviewFact label="Attempts" value={`${interview.attempt_number} / ${interview.max_attempts}`} />
              <InterviewFact
                label="Duration"
                value={interview.duration_seconds != null ? `${Math.round(interview.duration_seconds / 60)} min` : "—"}
              />
            </dl>
          )}
        </div>
      )}

      {primaryApplication && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Assessment</h2>
          <AssessmentActions
            applicationId={primaryApplication.id}
            jobId={primaryApplication.job_id}
            currentStage={primaryApplication.current_stage}
            hasReadyAssessment={jobAssessment?.status === "READY"}
            assignment={assessmentAssignment}
            assessmentType={jobAssessment?.assessment_type ?? null}
          />
        </div>
      )}

      {primaryApplication && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Interview Scheduling</h2>
          <InterviewSchedulingActions
            applicationId={primaryApplication.id}
            currentStage={primaryApplication.current_stage}
            interviewers={interviewers}
            currentInterview={scheduledInterview}
            initialAvailability={candidateAvailability}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Section title="Profile">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Field icon={MapPin} label="Location" value={candidate.location ?? "Not specified"} />
              <Field icon={Link2} label="LinkedIn" value={candidate.linkedin_url} href={candidate.linkedin_url ?? undefined} />
              <Field icon={Globe} label="Portfolio" value={candidate.portfolio_url} href={candidate.portfolio_url ?? undefined} />
              <Field icon={FileText} label="Resume" value={candidate.resume_url ? "View resume" : "Not uploaded"} href={candidate.resume_url ?? undefined} />
            </dl>
          </Section>

          {screening ? (
            <>
              <Section title="AI Summary">
                <p className="text-sm leading-relaxed text-muted-foreground">{screening.summary}</p>
              </Section>

              <Section title="Score Breakdown">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
                  {componentScoreLabels.map(({ key, label }) => (
                    <ScoreCard key={key} label={label} score={screening.component_scores[key] ?? null} />
                  ))}
                  <ScoreCard label="Overall" score={screening.overall_score} />
                </div>
              </Section>

              <Section title="Requirement Match">
                <RequirementList title="Mandatory" requirements={mandatoryRequirements} />
                <div className="mt-4">
                  <RequirementList title="Preferred" requirements={preferredRequirements} />
                </div>
              </Section>

              <Section title="Strengths, Gaps & Concerns">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StrengthList title="Strengths" items={screening.strengths} tone="success" />
                  <StrengthList title="Gaps" items={screening.gaps} tone="warning" />
                  <StrengthList title="Concerns" items={screening.concerns} tone="danger" />
                </div>
              </Section>
            </>
          ) : (
            <Section title="AI Screening">
              <EmptyState
                title="Not screened yet"
                description="Run AI Screening above to evaluate this candidate against the job's approved JD."
              />
            </Section>
          )}

          {interview && interview.status === "COMPLETED" && (
            <>
              <Section title="Interview Summary">
                <p className="text-sm leading-relaxed text-muted-foreground">{interview.summary}</p>
              </Section>

              <Section title="Interview Score Breakdown">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {interviewComponentScoreLabels.map(({ key, label }) => (
                    <ScoreCard key={key} label={label} score={interview.component_scores[key] ?? null} />
                  ))}
                  <ScoreCard label="Overall" score={interview.overall_score} />
                </div>
              </Section>

              <Section title="Interview Strengths, Gaps & Concerns">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StrengthList title="Strengths" items={interview.strengths} tone="success" />
                  <StrengthList title="Gaps" items={interview.gaps} tone="warning" />
                  <StrengthList title="Concerns" items={interview.concerns} tone="danger" />
                </div>
              </Section>

              <Section title="Interview Transcript">
                <InterviewTranscript questions={interview.questions} answers={interview.answers} />
              </Section>
            </>
          )}

          {interview && interview.status === "CONSENT_DECLINED" && (
            <Section title="AI Interview">
              <EmptyState
                title="Candidate declined the AI interview"
                description="The candidate was not marked as rejected — decide next steps manually."
              />
            </Section>
          )}

          <Section title="Activity">
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ActivityFeed entries={activity} />
            )}
          </Section>
        </div>

        {/* Side column */}
        <div className="flex flex-col gap-6">
          <Section title="Recruitment Timeline">
            {timelineEntries.length === 0 ? (
              <EmptyState title="No application yet" />
            ) : (
              <Timeline entries={timelineEntries} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function RequirementList({
  title,
  requirements,
}: {
  title: string;
  requirements: { id: string; requirement: string; status: string; evidence: string }[];
}) {
  if (requirements.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">None specified.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {requirements.map((r) => {
          const Icon = REQUIREMENT_STATUS_ICON[r.status] ?? HelpCircle;
          return (
            <li key={r.id} className="flex items-start gap-2.5">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${r.status === "MATCH" ? "text-success" : r.status === "NO_MATCH" ? "text-danger" : "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{r.requirement}</span>
                  <Badge tone={REQUIREMENT_STATUS_TONE[r.status] ?? "neutral"} className="text-[10px]">
                    {r.status.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.evidence}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StrengthList({ title, items, tone }: { title: string; items: string[]; tone: "success" | "warning" | "danger" }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm text-foreground">
              <Badge tone={tone} className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full p-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
            {value}
          </a>
        ) : (
          <dd className="text-sm text-foreground">{value}</dd>
        )}
      </div>
    </div>
  );
}

function InterviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm capitalize text-foreground">{value}</dd>
    </div>
  );
}
