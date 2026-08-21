import type {
  RequirementExtraction,
  JDGeneration,
  CandidateEvaluation,
  ScreeningCriteria,
  InterviewPlan,
  InterviewQuestionGeneration,
  AnswerEvaluation,
  FollowUpDecision,
  InterviewEvaluation,
  AssessmentGeneration,
  AssessmentQuestionGeneration,
  AssessmentQuestionEvaluationResult,
  OpenEndedReview,
  WorkdayTaskEvaluation,
  ResumeCandidateExtraction,
} from "@/lib/ai/schemas";

export interface StructuredInputOverrides {
  title?: string;
  department?: string;
  location?: string;
  employment_type?: string;
  experience_min?: number;
  experience_max?: number;
  salary_range?: string;
  work_mode?: string;
  number_of_openings?: number;
}

/**
 * Deliberately minimal — only job-relevant fields. No protected
 * characteristics are collected on candidates to begin with, but this
 * shape is also the enforcement point: never widen it to include fields
 * that could act as proxies for candidate quality (name/photo/address/
 * school prestige, etc. — see the screening system prompt).
 */
export interface CandidateEvaluationInput {
  candidateName: string;
  candidateProfileText: string;
  jobTitle: string;
  jobDescription: string;
  responsibilities: string[];
  screeningCriteria: ScreeningCriteria;
}

export interface InterviewPlanSectionInput {
  name: string;
  targetMinutes: number;
  targetQuestions: number;
  category?: "MANDATORY" | "PREFERRED";
}

export interface InterviewPlanInput {
  jobTitle: string;
  companyName: string;
  candidateName: string;
  sections: InterviewPlanSectionInput[];
}

export interface QuestionAndAnswer {
  question: string;
  answer: string;
}

export interface GenerateQuestionInput {
  jobTitle: string;
  section: string;
  category: string | null;
  priorTurns: QuestionAndAnswer[];
  /** Optional extracted text of the candidate's resume, used to ground the
   * question in specifics (a named technology, project, or achievement)
   * rather than a purely generic skill-category question. Undefined when
   * no resume could be read — callers fall back to generic questions. */
  resumeText?: string;
}

export interface EvaluateAnswerInput {
  jobTitle: string;
  category: string | null;
  question: string;
  answerTranscript: string;
}

export interface GenerateFollowUpInput {
  jobTitle: string;
  question: string;
  answerTranscript: string;
  evaluation: AnswerEvaluation;
  followupCount: number;
}

export interface InterviewTranscriptTurn {
  speaker: "AI" | "CANDIDATE";
  text: string;
}

export interface EvaluateInterviewInput {
  jobTitle: string;
  jobDescription: string;
  screeningCriteria: ScreeningCriteria;
  transcript: InterviewTranscriptTurn[];
}

export interface GenerateAssessmentInput {
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  screeningSummary: string | null;
  interviewSummary: string | null;
}

/**
 * Free-text-instruction-driven assessment generation/revision — the
 * assessment analog of improveJD(currentJD, instruction). When
 * currentQuestions is null this generates a brand new draft grounded in the
 * recruiter's instruction (and optional uploaded reference material)
 * instead of the job facts alone; when currentQuestions is supplied it
 * revises that existing question set per the instruction (e.g. "make
 * question 3 harder").
 */
export interface ImproveAssessmentInput {
  jobContext: GenerateAssessmentInput;
  currentQuestions: AssessmentQuestionGeneration[] | null;
  instruction: string;
  sourceDocumentText?: string | null;
}

export interface EvaluateAssessmentAnswerInput {
  jobTitle: string;
  questionType: string;
  question: string;
  instructions: string | null;
  points: number;
  expectedAnswer: string | null;
  evaluationCriteria: string;
  candidateAnswer: string;
}

export interface ReviewOpenEndedSubmissionInput {
  jobTitle: string;
  jobDescription: string;
  briefText: string;
  submissionText: string;
}

export interface EvaluateWorkdayTaskInput {
  jobTitle: string;
  taskType: string;
  taskTitle: string;
  scenario: string;
  deliverable: string;
  rubric: string[];
  candidateResponse: string;
  candidateAssumptions: string;
  candidateAiDisclosure: string;
}

export interface ExplainCandidateChatTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Everything the "Explain this candidate" chat is allowed to reason from —
 * assembled once per question from the exact same data already fetched for
 * the candidate detail page (screening, interview, assessment, stage
 * history). Any field genuinely unavailable is simply omitted/null, never
 * backfilled with a guess — the system prompt instructs the model to say so
 * rather than invent an answer, same "UNKNOWN not assumed" discipline as
 * lib/screening/candidate-data-provider.ts.
 */
export interface ExplainCandidateInput {
  candidateName: string;
  jobTitle: string;
  currentStage: string;
  screening: {
    recommendation: string | null;
    overallScore: number | null;
    summary: string | null;
    strengths: string[];
    gaps: string[];
    concerns: string[];
    requirements: { type: "MANDATORY" | "PREFERRED"; requirement: string; status: string; evidence: string }[];
  } | null;
  interview: {
    status: string;
    recommendation: string | null;
    overallScore: number | null;
    summary: string | null;
    strengths: string[];
    gaps: string[];
    concerns: string[];
    transcript: { question: string; answer: string; sufficiency: string | null; evaluation: string | null }[];
  } | null;
  assessment: {
    assessmentTitle: string | null;
    status: string;
    score: number | null;
    passingScore: number | null;
    recommendation: string | null;
    questionEvaluations: { question: string; score: number; maxScore: number; evaluation: string }[];
  } | null;
  stageHistory: { toStage: string; reason: string | null; createdAt: string }[];
  question: string;
  priorTurns: ExplainCandidateChatTurn[];
}

export interface AIProvider {
  /**
   * questionsAsked: how many clarifying questions the recruiter has already been asked in this
   * session, INCLUDING the fixed opening "what role are you hiring for?" question the UI shows
   * before this is ever called (so the first call passes 1). The whole conversation is capped at
   * 5 questions total — the client enforces this as a hard backstop, but the prompt is told the
   * count so it stops asking (clarification_needed: false) once the budget is spent.
   */
  generateStructuredRequirement(
    rawRequirement: string,
    overrides: StructuredInputOverrides,
    questionsAsked: number
  ): Promise<RequirementExtraction>;
  generateJD(requirement: RequirementExtraction): Promise<JDGeneration>;
  improveJD(currentJD: JDGeneration, instruction: string): Promise<JDGeneration>;
  evaluateCandidate(input: CandidateEvaluationInput): Promise<CandidateEvaluation>;
  generateInterviewPlan(input: InterviewPlanInput): Promise<InterviewPlan>;
  generateQuestion(input: GenerateQuestionInput): Promise<InterviewQuestionGeneration>;
  evaluateAnswer(input: EvaluateAnswerInput): Promise<AnswerEvaluation>;
  generateFollowUp(input: GenerateFollowUpInput): Promise<FollowUpDecision>;
  evaluateInterview(input: EvaluateInterviewInput): Promise<InterviewEvaluation>;
  generateAssessment(input: GenerateAssessmentInput): Promise<AssessmentGeneration>;
  improveAssessment(input: ImproveAssessmentInput): Promise<AssessmentGeneration>;
  evaluateAssessmentAnswer(input: EvaluateAssessmentAnswerInput): Promise<AssessmentQuestionEvaluationResult>;
  reviewOpenEndedSubmission(input: ReviewOpenEndedSubmissionInput): Promise<OpenEndedReview>;
  evaluateWorkdayTask(input: EvaluateWorkdayTaskInput): Promise<WorkdayTaskEvaluation>;
  extractCandidateFromResume(resumeText: string): Promise<ResumeCandidateExtraction>;
  /** Freeform, recruiter-facing prose answer for the "Explain this candidate"
   * chat — deliberately NOT structured output (conversational, not a form
   * to fill in). Grounded only in the supplied per-candidate data. */
  explainCandidate(input: ExplainCandidateInput): Promise<string>;
}
