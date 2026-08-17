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
  AssessmentQuestionEvaluationResult,
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

export interface AIProvider {
  generateStructuredRequirement(rawRequirement: string, overrides: StructuredInputOverrides): Promise<RequirementExtraction>;
  generateJD(requirement: RequirementExtraction): Promise<JDGeneration>;
  improveJD(currentJD: JDGeneration, instruction: string): Promise<JDGeneration>;
  evaluateCandidate(input: CandidateEvaluationInput): Promise<CandidateEvaluation>;
  generateInterviewPlan(input: InterviewPlanInput): Promise<InterviewPlan>;
  generateQuestion(input: GenerateQuestionInput): Promise<InterviewQuestionGeneration>;
  evaluateAnswer(input: EvaluateAnswerInput): Promise<AnswerEvaluation>;
  generateFollowUp(input: GenerateFollowUpInput): Promise<FollowUpDecision>;
  evaluateInterview(input: EvaluateInterviewInput): Promise<InterviewEvaluation>;
  generateAssessment(input: GenerateAssessmentInput): Promise<AssessmentGeneration>;
  evaluateAssessmentAnswer(input: EvaluateAssessmentAnswerInput): Promise<AssessmentQuestionEvaluationResult>;
}
