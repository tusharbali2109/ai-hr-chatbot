import type { RecruitmentStage } from "@/lib/stages";
import type { ScreeningCriteria } from "@/lib/ai/schemas";

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = "owner" | "admin" | "recruiter" | "hiring_manager" | "interviewer" | "viewer";

export interface AppUser {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type JobStatus = "draft" | "open" | "paused" | "closed";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";
export type WorkMode = "remote" | "hybrid" | "onsite";
export type JdStatus = "DRAFT" | "GENERATING" | "READY_FOR_REVIEW" | "APPROVED";

export interface Job {
  id: string;
  company_id: string;
  title: string;
  description: string;
  status: JobStatus;
  location: string;
  employment_type: EmploymentType;
  experience_min: number;
  experience_max: number;
  responsibilities: string[];
  required_skills: string[];
  preferred_skills: string[];
  education: string | null;
  work_mode: WorkMode | null;
  salary_range: string | null;
  number_of_openings: number;
  screening_criteria: ScreeningCriteria | null;
  jd_status: JdStatus;
  created_at: string;
  updated_at: string;
}

export interface JobJdVersion {
  id: string;
  job_id: string;
  version_number: number;
  title: string;
  description: string;
  responsibilities: string[];
  required_skills: string[];
  preferred_skills: string[];
  screening_criteria: ScreeningCriteria | null;
  is_approved: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ApplicationSource = "career_site" | "linkedin" | "referral" | "job_board" | "agency";

export interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  current_stage: RecruitmentStage;
  overall_score: number | null;
  source: ApplicationSource;
  source_platform: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
}

export type DecisionSource = "AI" | "HUMAN" | "SYSTEM" | "CANDIDATE";

export interface StageHistory {
  id: string;
  application_id: string;
  from_stage: RecruitmentStage | null;
  to_stage: RecruitmentStage;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  decision_source: DecisionSource | null;
  created_at: string;
}

export type JobPostingStatus = "DRAFT" | "QUEUED" | "PUBLISHING" | "PUBLISHED" | "PAUSED" | "CLOSED" | "FAILED";

export interface JobPosting {
  id: string;
  job_id: string;
  platform: string;
  external_job_id: string | null;
  external_url: string | null;
  status: JobPostingStatus;
  published_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  sync_cursor: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type JobBoardConnectionStatus = "not_connected" | "connected" | "error" | "unavailable";

/** Client-facing shape only — never includes the `credentials` column. */
export interface JobBoardConnectionSummary {
  id: string;
  company_id: string;
  platform: string;
  status: JobBoardConnectionStatus;
  capabilities: Record<string, boolean>;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobBoardCredential extends JobBoardConnectionSummary {
  credentials: Record<string, unknown> | null;
}

export interface ExternalEvent {
  id: string;
  platform: string;
  external_event_id: string;
  event_type: string;
  job_posting_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

export interface InternalEvent {
  id: string;
  event_type: string;
  application_id: string | null;
  candidate_id: string | null;
  job_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export type DuplicateFlagStatus = "pending" | "confirmed_duplicate" | "confirmed_distinct";

export interface CandidateDuplicateFlag {
  id: string;
  candidate_id: string;
  possible_match_candidate_id: string;
  application_id: string | null;
  match_signal: string;
  status: DuplicateFlagStatus;
  created_at: string;
  updated_at: string;
}

export type AgentType = "SCREENING" | "INTERVIEW" | "ASSESSMENT_GENERATION" | "ASSESSMENT_EVALUATION";
export type AgentRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "NEEDS_REVIEW";

export interface AgentRun {
  id: string;
  agent_type: AgentType;
  application_id: string | null;
  job_id: string | null;
  status: AgentRunStatus;
  model: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ScreeningStatus = "COMPLETED" | "FAILED";
export type ScreeningRecommendation = "SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW";
export type ScreeningConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ComponentScores {
  required_skills: number;
  experience: number;
  relevant_experience: number;
  jd_semantic_match: number;
  preferred_skills: number;
  education_other: number;
}

export type ScoringWeights = ComponentScores;

export interface Screening {
  id: string;
  application_id: string;
  agent_run_id: string | null;
  jd_version_id: string | null;
  screening_version: number;
  status: ScreeningStatus;
  overall_score: number | null;
  recommendation: ScreeningRecommendation | null;
  confidence: ScreeningConfidence | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  concerns: string[];
  component_scores: Partial<ComponentScores>;
  scoring_weights: Partial<ScoringWeights>;
  is_latest: boolean;
  model_name: string | null;
  model_version: string | null;
  created_at: string;
  updated_at: string;
}

export type RequirementType = "MANDATORY" | "PREFERRED";
export type RequirementStatus = "MATCH" | "NO_MATCH" | "UNKNOWN";

export interface ScreeningRequirement {
  id: string;
  screening_id: string;
  requirement_type: RequirementType;
  requirement: string;
  status: RequirementStatus;
  score: number | null;
  evidence: string;
  created_at: string;
}

export type InterviewStatus =
  | "QUEUED"
  | "DIALING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "NO_ANSWER"
  | "BUSY"
  | "CALL_FAILED"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "CANDIDATE_DISCONNECTED"
  | "CONSENT_DECLINED"
  | "NEEDS_REVIEW"
  | "PROCTORING_TERMINATED";

export type InterviewProvider = "mock" | "twilio" | "browser";
export type ConsentStatus = "PENDING" | "GRANTED" | "DECLINED";
export type InterviewRecommendation = "INTERVIEW_SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW";
export type InterviewConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface InterviewComponentScores {
  technicalKnowledge: number;
  problemSolving: number;
  relevantExperience: number;
  roleSpecificSkills: number;
  communicationClarity: number;
}

export interface Interview {
  id: string;
  application_id: string;
  agent_run_id: string | null;
  jd_version_id: string | null;
  screening_version_id: string | null;
  interview_version: number;
  status: InterviewStatus;
  provider: InterviewProvider;
  external_call_id: string | null;
  attempt_number: number;
  max_attempts: number;
  consent_status: ConsentStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  overall_score: number | null;
  recommendation: InterviewRecommendation | null;
  confidence: InterviewConfidence | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  concerns: string[];
  component_scores: Partial<InterviewComponentScores>;
  scoring_weights: Partial<InterviewComponentScores>;
  is_latest: boolean;
  model_name: string | null;
  model_version: string | null;
  recording_enabled: boolean;
  recording_url: string | null;
  recording_provider: string | null;
  retention_policy: string | null;
  current_section: string | null;
  current_question_index: number;
  created_at: string;
  updated_at: string;
}

export type InterviewQuestionType = "PRIMARY" | "FOLLOWUP";

export interface InterviewQuestion {
  id: string;
  interview_id: string;
  sequence: number;
  section: string;
  category: string | null;
  question: string;
  question_type: InterviewQuestionType;
  parent_question_id: string | null;
  created_at: string;
}

export type AnswerSufficiency = "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";

export interface InterviewAnswer {
  id: string;
  interview_id: string;
  question_id: string;
  transcript: string;
  duration_seconds: number | null;
  relevance_score: number | null;
  technical_score: number | null;
  clarity_score: number | null;
  evidence_quality: string | null;
  sufficiency: AnswerSufficiency | null;
  evaluation: string | null;
  created_at: string;
}

export type InterviewEventType =
  | "CALL_STARTED"
  | "AI_INTRO"
  | "CONSENT_RECEIVED"
  | "CONSENT_DECLINED"
  | "QUESTION_ASKED"
  | "ANSWER_RECEIVED"
  | "FOLLOWUP_GENERATED"
  | "SECTION_COMPLETED"
  | "CALL_ENDED"
  | "EVALUATION_COMPLETED"
  | "CALL_FAILED"
  | "HUMAN_OVERRIDE"
  | "CAMERA_ENABLED"
  | "PROCTORING_WARNING"
  | "PROCTORING_REJECTED";

export interface InterviewEvent {
  id: string;
  interview_id: string;
  event_type: InterviewEventType;
  event_timestamp: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AssessmentType = "TECHNICAL" | "CODING" | "CASE_STUDY" | "WRITTEN" | "MCQ" | "SCENARIO" | "ROLE_SPECIFIC" | "CUSTOM";
export type AssessmentStatus = "DRAFT" | "READY" | "SENT" | "IN_PROGRESS" | "SUBMITTED" | "EVALUATING" | "EVALUATED" | "EXPIRED" | "CANCELLED";
export type DeadlineUnit = "HOURS" | "DAYS";

export type AssessmentMode = "STRUCTURED" | "OPEN_ENDED";

export interface Assessment {
  id: string;
  job_id: string;
  created_by: string | null;
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  duration_minutes: number | null;
  passing_score: number;
  status: AssessmentStatus;
  assessment_version: number;
  is_latest: boolean;
  deadline_unit: DeadlineUnit;
  deadline_value: number;
  auto_submit_on_expiry: boolean;
  assessment_type: AssessmentMode;
  brief_file_path: string | null;
  brief_text: string | null;
  created_at: string;
  updated_at: string;
}

/** Client-facing shape for candidate reads — matches assessment_questions_public,
 * never includes expected_answer/evaluation_criteria. */
export interface AssessmentPublic {
  id: string;
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  duration_minutes: number | null;
}

export type AssessmentQuestionType = "MCQ" | "SHORT_ANSWER" | "LONG_ANSWER" | "CODING" | "CASE_STUDY" | "FILE_UPLOAD";
export type QuestionDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface AssessmentQuestion {
  id: string;
  assessment_id: string;
  sequence: number;
  type: AssessmentQuestionType;
  question: string;
  instructions: string | null;
  points: number;
  difficulty: QuestionDifficulty;
  options: string[] | null;
  expected_answer: string | null;
  evaluation_criteria: string | null;
  created_at: string;
}

/** Client-facing shape for candidate reads — matches assessment_questions_public. */
export interface AssessmentQuestionPublic {
  id: string;
  assessment_id: string;
  sequence: number;
  type: AssessmentQuestionType;
  question: string;
  instructions: string | null;
  points: number;
  difficulty: QuestionDifficulty;
  options: string[] | null;
}

export type AssignmentStatus = "ASSIGNED" | "STARTED" | "SUBMITTED" | "EVALUATING" | "COMPLETED" | "EXPIRED" | "CANCELLED";
export type AssessmentRecommendation = "SHORTLIST" | "REJECT" | "NEEDS_REVIEW";

export interface OpenEndedReviewResult {
  strengths: string[];
  weaknesses: string[];
  focus_areas: string[];
  gaps: string[];
  interviewer_questions: string[];
  stuck_points: string[];
  authenticity_notes: string;
}

export interface AssessmentAssignment {
  id: string;
  assessment_id: string;
  application_id: string;
  candidate_id: string;
  status: AssignmentStatus;
  assigned_at: string;
  started_at: string | null;
  submitted_at: string | null;
  deadline: string;
  score: number | null;
  recommendation: AssessmentRecommendation | null;
  submission_file_path: string | null;
  submission_text: string | null;
  ai_review: OpenEndedReviewResult | null;
  ai_review_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssessmentAnswer {
  id: string;
  assignment_id: string;
  question_id: string;
  answer_text: string | null;
  selected_option: string | null;
  code: string | null;
  file_url: string | null;
  auto_saved_at: string;
  submitted_at: string | null;
}

export type EvaluationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface AssessmentQuestionEvaluation {
  id: string;
  assignment_id: string;
  question_id: string;
  score: number;
  max_score: number;
  evaluation: string;
  evidence: string | null;
  confidence: EvaluationConfidence;
  created_at: string;
}

export type AssessmentEventType =
  | "SESSION_OPENED"
  | "STARTED"
  | "ANSWER_SAVED"
  | "ANSWER_CHANGED"
  | "SECTION_VIEWED"
  | "SUBMITTED"
  | "AUTO_SUBMITTED"
  | "EXPIRED"
  | "EVALUATION_COMPLETED"
  | "HUMAN_OVERRIDE";

export interface AssessmentEvent {
  id: string;
  assignment_id: string;
  event_type: AssessmentEventType;
  event_timestamp: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type EmailTemplateName =
  | "ASSESSMENT_INVITATION"
  | "ASSESSMENT_REMINDER"
  | "ASSESSMENT_SUBMITTED"
  | "INTERVIEW_INVITATION"
  | "INTERVIEW_RESCHEDULE"
  | "INTERVIEW_REMINDER"
  | "NEXT_STEP"
  | "REJECTION"
  | "NEEDS_REVIEW"
  | "FINAL_SELECTION"
  | "OFFER_NEXT_STEP";

export interface EmailTemplate {
  id: string;
  template_name: EmailTemplateName;
  version: number;
  subject: string;
  body: string;
  variables: string[];
  is_latest: boolean;
  created_at: string;
}

export type EmailMessageStatus = "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "FAILED" | "BOUNCED" | "CANCELLED";

export interface EmailMessage {
  id: string;
  company_id: string;
  candidate_id: string | null;
  application_id: string | null;
  template: string;
  template_version: number;
  event_type: string;
  idempotency_key: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailMessageStatus;
  provider: string | null;
  external_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkingHoursBlock {
  day_of_week: number;
  start: string;
  end: string;
}

export interface Interviewer {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  email: string;
  timezone: string;
  calendar_provider: "google";
  calendar_id: string | null;
  active: boolean;
  interview_types: string[];
  working_hours: WorkingHoursBlock[];
  created_at: string;
  updated_at: string;
}

export type CalendarConnectionStatus = "not_connected" | "connected" | "error";

export interface CalendarConnection {
  id: string;
  interviewer_id: string;
  company_id: string;
  provider: "google";
  status: CalendarConnectionStatus;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Client-facing shape — never includes access_token/refresh_token. */
export interface CalendarConnectionSummary {
  id: string;
  interviewer_id: string;
  status: CalendarConnectionStatus;
  connected_at: string | null;
  last_error: string | null;
}

export interface OAuthState {
  id: string;
  state: string;
  interviewer_id: string;
  company_id: string;
  purpose: string;
  expires_at: string;
  created_at: string;
}

export interface CandidateAvailability {
  id: string;
  application_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  created_at: string;
}

export type ScheduledInterviewStatus = "PROPOSED" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW" | "RESCHEDULED";
export type CancelledBy = "CANDIDATE" | "INTERVIEWER" | "RECRUITER" | "SYSTEM";

export interface ScheduledInterview {
  id: string;
  application_id: string;
  candidate_id: string;
  interviewer_id: string;
  interview_type: string;
  provider: "google";
  external_event_id: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  status: ScheduledInterviewStatus;
  meeting_url: string | null;
  rescheduled_from_id: string | null;
  cancelled_by: CancelledBy | null;
  cancellation_reason: string | null;
  reminder_24h_sent_at: string | null;
  reminder_2h_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SlotLockStatus = "HELD" | "RELEASED";

export interface InterviewSlotLock {
  id: string;
  interviewer_id: string;
  start_time: string;
  end_time: string;
  status: SlotLockStatus;
  expires_at: string;
  created_at: string;
}

export type AutomationRuleKey =
  | "auto_send_assessment_email"
  | "auto_send_assessment_reminder"
  | "auto_schedule_interview"
  | "auto_send_interview_reminders"
  | "auto_notify_interviewer"
  | "auto_send_status_emails";

export interface AutomationRule {
  id: string;
  company_id: string;
  rule_key: AutomationRuleKey;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type FinalReviewRecommendation = "SELECT" | "REJECT" | "NEEDS_REVIEW";
export type FinalReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_REVIEW";

export interface FinalReview {
  id: string;
  application_id: string;
  screening_score: number | null;
  interview_score: number | null;
  assessment_score: number | null;
  overall_score: number;
  weights: Record<string, number>;
  criteria_version_id: string | null;
  recommendation: FinalReviewRecommendation;
  confidence: EvaluationConfidence;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  concerns: string[];
  model_name: string | null;
  model_version: string | null;
  status: FinalReviewStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  is_latest: boolean;
  created_at: string;
  updated_at: string;
}

export type WorkflowMode = "MANUAL" | "ASSISTED" | "AUTONOMOUS";

export interface WorkflowSettings {
  id: string;
  company_id: string;
  job_id: string | null;
  workflow_mode: WorkflowMode;
  ai_screening_enabled: boolean;
  ai_interview_enabled: boolean;
  assessment_enabled: boolean;
  auto_email_enabled: boolean;
  auto_scheduling_enabled: boolean;
  human_approval_required: boolean;
  final_decision_automation: boolean;
  scoring_weights: { screening: number; interview: number; assessment: number };
  created_at: string;
  updated_at: string;
}

export type WorkflowRunStatus = "QUEUED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED" | "PAUSED";

export interface WorkflowRun {
  id: string;
  workflow_type: string;
  application_id: string;
  status: WorkflowRunStatus;
  current_stage: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type WorkflowStepStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "RETRYING";

export interface WorkflowStep {
  id: string;
  workflow_run_id: string;
  agent_type: string;
  event_type: string;
  status: WorkflowStepStatus;
  retry_count: number;
  max_retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowEvent {
  id: string;
  event_id: string;
  event_type: string;
  application_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
}

export type OfferStatus = "NOT_STARTED" | "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENT" | "ACCEPTED" | "DECLINED";

export interface Offer {
  id: string;
  application_id: string;
  candidate_id: string;
  job_id: string;
  status: OfferStatus;
  salary_details: Record<string, unknown> | null;
  start_date: string | null;
  employment_type: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Client-facing shape for non-privileged reads — never includes salary_details. */
export interface OfferSummary {
  id: string;
  application_id: string;
  candidate_id: string;
  job_id: string;
  status: OfferStatus;
  start_date: string | null;
  employment_type: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AuditActorType = "HUMAN" | "AI" | "SYSTEM";

export interface AuditLogEntry {
  id: string;
  company_id: string;
  actor_id: string | null;
  actor_type: AuditActorType;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface AiUsageLogEntry {
  id: string;
  company_id: string | null;
  application_id: string | null;
  agent_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      companies: { Row: Company; Insert: Partial<Company>; Update: Partial<Company> };
      users: { Row: AppUser; Insert: Partial<AppUser>; Update: Partial<AppUser> };
      jobs: { Row: Job; Insert: Partial<Job>; Update: Partial<Job> };
      job_jd_versions: { Row: JobJdVersion; Insert: Partial<JobJdVersion>; Update: Partial<JobJdVersion> };
      candidates: { Row: Candidate; Insert: Partial<Candidate>; Update: Partial<Candidate> };
      applications: { Row: Application; Insert: Partial<Application>; Update: Partial<Application> };
      stage_history: { Row: StageHistory; Insert: Partial<StageHistory>; Update: Partial<StageHistory> };
      job_postings: { Row: JobPosting; Insert: Partial<JobPosting>; Update: Partial<JobPosting> };
      job_board_credentials: { Row: JobBoardCredential; Insert: Partial<JobBoardCredential>; Update: Partial<JobBoardCredential> };
      external_events: { Row: ExternalEvent; Insert: Partial<ExternalEvent>; Update: Partial<ExternalEvent> };
      internal_events: { Row: InternalEvent; Insert: Partial<InternalEvent>; Update: Partial<InternalEvent> };
      candidate_duplicate_flags: {
        Row: CandidateDuplicateFlag;
        Insert: Partial<CandidateDuplicateFlag>;
        Update: Partial<CandidateDuplicateFlag>;
      };
      agent_runs: { Row: AgentRun; Insert: Partial<AgentRun>; Update: Partial<AgentRun> };
      screenings: { Row: Screening; Insert: Partial<Screening>; Update: Partial<Screening> };
      screening_requirements: {
        Row: ScreeningRequirement;
        Insert: Partial<ScreeningRequirement>;
        Update: Partial<ScreeningRequirement>;
      };
      interviews: { Row: Interview; Insert: Partial<Interview>; Update: Partial<Interview> };
      interview_questions: {
        Row: InterviewQuestion;
        Insert: Partial<InterviewQuestion>;
        Update: Partial<InterviewQuestion>;
      };
      interview_answers: {
        Row: InterviewAnswer;
        Insert: Partial<InterviewAnswer>;
        Update: Partial<InterviewAnswer>;
      };
      interview_events: { Row: InterviewEvent; Insert: Partial<InterviewEvent>; Update: Partial<InterviewEvent> };
      assessments: { Row: Assessment; Insert: Partial<Assessment>; Update: Partial<Assessment> };
      assessment_questions: { Row: AssessmentQuestion; Insert: Partial<AssessmentQuestion>; Update: Partial<AssessmentQuestion> };
      assessment_questions_public: { Row: AssessmentQuestionPublic; Insert: never; Update: never };
      assessment_assignments: { Row: AssessmentAssignment; Insert: Partial<AssessmentAssignment>; Update: Partial<AssessmentAssignment> };
      assessment_answers: { Row: AssessmentAnswer; Insert: Partial<AssessmentAnswer>; Update: Partial<AssessmentAnswer> };
      assessment_question_evaluations: {
        Row: AssessmentQuestionEvaluation;
        Insert: Partial<AssessmentQuestionEvaluation>;
        Update: Partial<AssessmentQuestionEvaluation>;
      };
      assessment_events: { Row: AssessmentEvent; Insert: Partial<AssessmentEvent>; Update: Partial<AssessmentEvent> };
      email_templates: { Row: EmailTemplate; Insert: Partial<EmailTemplate>; Update: Partial<EmailTemplate> };
      email_messages: { Row: EmailMessage; Insert: Partial<EmailMessage>; Update: Partial<EmailMessage> };
      interviewers: { Row: Interviewer; Insert: Partial<Interviewer>; Update: Partial<Interviewer> };
      calendar_connections: { Row: CalendarConnection; Insert: Partial<CalendarConnection>; Update: Partial<CalendarConnection> };
      oauth_states: { Row: OAuthState; Insert: Partial<OAuthState>; Update: Partial<OAuthState> };
      candidate_availability: { Row: CandidateAvailability; Insert: Partial<CandidateAvailability>; Update: Partial<CandidateAvailability> };
      scheduled_interviews: { Row: ScheduledInterview; Insert: Partial<ScheduledInterview>; Update: Partial<ScheduledInterview> };
      interview_slot_locks: { Row: InterviewSlotLock; Insert: Partial<InterviewSlotLock>; Update: Partial<InterviewSlotLock> };
      automation_rules: { Row: AutomationRule; Insert: Partial<AutomationRule>; Update: Partial<AutomationRule> };
      final_reviews: { Row: FinalReview; Insert: Partial<FinalReview>; Update: Partial<FinalReview> };
      workflow_settings: { Row: WorkflowSettings; Insert: Partial<WorkflowSettings>; Update: Partial<WorkflowSettings> };
      workflow_runs: { Row: WorkflowRun; Insert: Partial<WorkflowRun>; Update: Partial<WorkflowRun> };
      workflow_steps: { Row: WorkflowStep; Insert: Partial<WorkflowStep>; Update: Partial<WorkflowStep> };
      workflow_events: { Row: WorkflowEvent; Insert: Partial<WorkflowEvent>; Update: Partial<WorkflowEvent> };
      offers: { Row: Offer; Insert: Partial<Offer>; Update: Partial<Offer> };
      offers_summary: { Row: OfferSummary; Insert: never; Update: never };
      audit_log: { Row: AuditLogEntry; Insert: Partial<AuditLogEntry>; Update: Partial<AuditLogEntry> };
      ai_usage_log: { Row: AiUsageLogEntry; Insert: Partial<AiUsageLogEntry>; Update: Partial<AiUsageLogEntry> };
    };
  };
}
