import { z } from "zod";

/**
 * Requirement extraction — output of the Requirement Agent.
 * Mirrors the jobs table's "facts" columns so it can be persisted directly.
 */
export const RequirementSchema = z.object({
  role: z.string(),
  experience_min: z.number().int().nullable(),
  experience_max: z.number().int().nullable(),
  mandatory_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  work_mode: z.string(),
  location: z.string(),
  employment_type: z.string(),
  education: z.string(),
  clarification_needed: z.boolean(),
  clarification_question: z.string().nullable(),
  clarification_options: z.array(z.string()),
});
export type RequirementExtraction = z.infer<typeof RequirementSchema>;

export const requirementJsonSchema = {
  type: "object",
  properties: {
    role: { type: "string", description: "The normalized job title, e.g. 'Senior Python Backend Engineer'" },
    experience_min: { type: ["integer", "null"] },
    experience_max: { type: ["integer", "null"] },
    mandatory_skills: { type: "array", items: { type: "string" } },
    preferred_skills: { type: "array", items: { type: "string" } },
    work_mode: { type: "string", description: "'Remote', 'Hybrid', 'Onsite', or 'Not specified'" },
    location: { type: "string", description: "City/region, or 'Not specified'" },
    employment_type: { type: "string", description: "'Full-time', 'Part-time', 'Contract', 'Internship', or 'Not specified'" },
    education: { type: "string", description: "Required education level, or 'Not specified'" },
    clarification_needed: {
      type: "boolean",
      description: "true only if the requirement is too vague to safely draft a JD (e.g. missing the role entirely)",
    },
    clarification_question: { type: ["string", "null"], description: "One short clarifying question, or null" },
    clarification_options: {
      type: "array",
      items: { type: "string" },
      description: "2-6 short suggested answers to the clarification question; empty if not needed",
    },
  },
  required: [
    "role",
    "experience_min",
    "experience_max",
    "mandatory_skills",
    "preferred_skills",
    "work_mode",
    "location",
    "employment_type",
    "education",
    "clarification_needed",
    "clarification_question",
    "clarification_options",
  ],
  additionalProperties: false,
} as const;

/**
 * JD generation — output of the JD Generation Agent. Bundles the screening
 * criteria future screening agents (Phase 4) will consume directly.
 */
export const ScreeningCriterionSchema = z.object({
  skill: z.string(),
  importance: z.number().int().min(1).max(10),
});

export const ScreeningCriteriaSchema = z.object({
  mandatory: z.array(ScreeningCriterionSchema),
  preferred: z.array(ScreeningCriterionSchema),
  experience: z.object({
    min_years: z.number().int().nullable(),
    max_years: z.number().int().nullable(),
  }),
});
export type ScreeningCriteria = z.infer<typeof ScreeningCriteriaSchema>;

export const JDGenerationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  responsibilities: z.array(z.string()).min(1),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  education: z.string(),
  screening_criteria: ScreeningCriteriaSchema,
});
export type JDGeneration = z.infer<typeof JDGenerationSchema>;

const screeningCriterionJsonSchema = {
  type: "object",
  properties: {
    skill: { type: "string" },
    importance: { type: "integer", description: "1-10, how heavily this should weigh in screening" },
  },
  required: ["skill", "importance"],
  additionalProperties: false,
} as const;

/**
 * Candidate evaluation — output of the Screening Agent (Phase 4). The AI
 * only produces per-requirement assessments, per-dimension component
 * scores, and qualitative evidence; the *final* weighted score and
 * SHORTLISTED/REJECTED/NEEDS_REVIEW recommendation are computed
 * deterministically by lib/screening/logic.ts — never trusted from the AI
 * directly.
 */
export const RequirementAssessmentSchema = z.object({
  requirement: z.string(),
  status: z.enum(["MATCH", "NO_MATCH", "UNKNOWN"]),
  evidence: z.string(),
});
export type RequirementAssessment = z.infer<typeof RequirementAssessmentSchema>;

export const CandidateEvaluationComponentScoresSchema = z.object({
  required_skills: z.number().int().min(0).max(100),
  experience: z.number().int().min(0).max(100),
  relevant_experience: z.number().int().min(0).max(100),
  jd_semantic_match: z.number().int().min(0).max(100),
  preferred_skills: z.number().int().min(0).max(100),
  education_other: z.number().int().min(0).max(100),
});

export const CandidateEvaluationSchema = z.object({
  mandatory_assessments: z.array(RequirementAssessmentSchema),
  preferred_assessments: z.array(RequirementAssessmentSchema),
  component_scores: CandidateEvaluationComponentScoresSchema,
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  concerns: z.array(z.string()),
  summary: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});
export type CandidateEvaluation = z.infer<typeof CandidateEvaluationSchema>;

const requirementAssessmentJsonSchema = {
  type: "object",
  properties: {
    requirement: { type: "string" },
    status: { type: "string", enum: ["MATCH", "NO_MATCH", "UNKNOWN"] },
    evidence: {
      type: "string",
      description: "Quote or closely paraphrase the specific candidate text supporting this status. Never a bare assertion.",
    },
  },
  required: ["requirement", "status", "evidence"],
  additionalProperties: false,
} as const;

export const candidateEvaluationJsonSchema = {
  type: "object",
  properties: {
    mandatory_assessments: { type: "array", items: requirementAssessmentJsonSchema },
    preferred_assessments: { type: "array", items: requirementAssessmentJsonSchema },
    component_scores: {
      type: "object",
      properties: {
        required_skills: { type: "integer", description: "0-100" },
        experience: { type: "integer", description: "0-100" },
        relevant_experience: { type: "integer", description: "0-100" },
        jd_semantic_match: { type: "integer", description: "0-100" },
        preferred_skills: { type: "integer", description: "0-100" },
        education_other: { type: "integer", description: "0-100" },
      },
      required: [
        "required_skills",
        "experience",
        "relevant_experience",
        "jd_semantic_match",
        "preferred_skills",
        "education_other",
      ],
      additionalProperties: false,
    },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    concerns: { type: "array", items: { type: "string" } },
    summary: { type: "string", description: "2-4 sentences, concise, no exaggerated praise." },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  },
  required: [
    "mandatory_assessments",
    "preferred_assessments",
    "component_scores",
    "strengths",
    "gaps",
    "concerns",
    "summary",
    "confidence",
  ],
  additionalProperties: false,
} as const;

/**
 * Interview plan / question / answer-evaluation / follow-up / final-evaluation
 * — output of the Interview Agent (Phase 5). Same discipline as screening:
 * the AI never emits a final interview score or recommendation directly —
 * lib/interview/logic.ts computes those deterministically from these
 * structured, evidence-grounded pieces.
 */
export const InterviewPlanSectionSchema = z.object({
  name: z.string(),
  target_minutes: z.number().int().min(0),
  target_questions: z.number().int().min(0),
});

export const InterviewPlanSchema = z.object({
  sections: z.array(InterviewPlanSectionSchema),
  opening_script: z.string(),
  closing_script: z.string(),
});
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;

export const InterviewQuestionGenerationSchema = z.object({
  question: z.string(),
  category: z.string(),
});
export type InterviewQuestionGeneration = z.infer<typeof InterviewQuestionGenerationSchema>;

export const AnswerEvaluationSchema = z.object({
  relevance_score: z.number().int().min(0).max(100),
  technical_score: z.number().int().min(0).max(100),
  clarity_score: z.number().int().min(0).max(100),
  sufficiency: z.enum(["SUFFICIENT", "PARTIAL", "INSUFFICIENT"]),
  evaluation: z.string(),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const FollowUpDecisionSchema = z.object({
  should_follow_up: z.boolean(),
  follow_up_question: z.string().nullable(),
  reason: z.string(),
});
export type FollowUpDecision = z.infer<typeof FollowUpDecisionSchema>;

export const InterviewComponentScoresSchema = z.object({
  technical_knowledge: z.number().int().min(0).max(100),
  problem_solving: z.number().int().min(0).max(100),
  relevant_experience: z.number().int().min(0).max(100),
  role_specific_skills: z.number().int().min(0).max(100),
  communication_clarity: z.number().int().min(0).max(100),
});

export const InterviewEvaluationSchema = z.object({
  component_scores: InterviewComponentScoresSchema,
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  concerns: z.array(z.string()),
  summary: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});
export type InterviewEvaluation = z.infer<typeof InterviewEvaluationSchema>;

export const interviewPlanJsonSchema = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          target_minutes: { type: "integer" },
          target_questions: { type: "integer" },
        },
        required: ["name", "target_minutes", "target_questions"],
        additionalProperties: false,
      },
    },
    opening_script: { type: "string", description: "Must identify the caller as an AI interviewer and ask for explicit consent to continue." },
    closing_script: { type: "string", description: "Polite closing that never reveals the score or hiring decision." },
  },
  required: ["sections", "opening_script", "closing_script"],
  additionalProperties: false,
} as const;

export const interviewQuestionJsonSchema = {
  type: "object",
  properties: {
    question: { type: "string", description: "One single question, professional tone, no protected-characteristic topics." },
    category: { type: "string", description: "The skill/section this question targets." },
  },
  required: ["question", "category"],
  additionalProperties: false,
} as const;

export const answerEvaluationJsonSchema = {
  type: "object",
  properties: {
    relevance_score: { type: "integer", description: "0-100" },
    technical_score: { type: "integer", description: "0-100" },
    clarity_score: {
      type: "integer",
      description: "0-100. Reflects only whether reasoning was communicated sufficiently for the role — never accent, voice style, or personality.",
    },
    sufficiency: { type: "string", enum: ["SUFFICIENT", "PARTIAL", "INSUFFICIENT"] },
    evaluation: { type: "string", description: "Grounded in the transcript — quote or closely paraphrase what was actually said." },
  },
  required: ["relevance_score", "technical_score", "clarity_score", "sufficiency", "evaluation"],
  additionalProperties: false,
} as const;

export const followUpDecisionJsonSchema = {
  type: "object",
  properties: {
    should_follow_up: { type: "boolean" },
    follow_up_question: {
      type: ["string", "null"],
      description: "One short clarifying/deepening question, or null if moving on. Never repeatedly pressure a candidate who doesn't know something.",
    },
    reason: { type: "string" },
  },
  required: ["should_follow_up", "follow_up_question", "reason"],
  additionalProperties: false,
} as const;

export const interviewEvaluationJsonSchema = {
  type: "object",
  properties: {
    component_scores: {
      type: "object",
      properties: {
        technical_knowledge: { type: "integer", description: "0-100" },
        problem_solving: { type: "integer", description: "0-100" },
        relevant_experience: { type: "integer", description: "0-100" },
        role_specific_skills: { type: "integer", description: "0-100" },
        communication_clarity: { type: "integer", description: "0-100. Never a proxy for accent/nationality/disability/personality." },
      },
      required: ["technical_knowledge", "problem_solving", "relevant_experience", "role_specific_skills", "communication_clarity"],
      additionalProperties: false,
    },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    concerns: { type: "array", items: { type: "string" } },
    summary: { type: "string", description: "2-4 sentences, concise, no exaggerated praise, grounded in the transcript." },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  },
  required: ["component_scores", "strengths", "gaps", "concerns", "summary", "confidence"],
  additionalProperties: false,
} as const;

/**
 * Assessment generation — output of the Assessment Agent (Phase 6). The
 * assessment type and questions must be grounded in the job's actual
 * required/preferred skills — never a generic template, and coding is never
 * assumed unless the JD calls for it. Every question carries its own point
 * value; the AI never emits a whole-assessment score.
 */
export const AssessmentQuestionGenerationSchema = z.object({
  sequence: z.number().int().min(1),
  type: z.enum(["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "CODING", "CASE_STUDY", "FILE_UPLOAD"]),
  question: z.string(),
  instructions: z.string().nullable(),
  points: z.number().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  options: z.array(z.string()).nullable(),
  expected_answer: z.string().nullable(),
  evaluation_criteria: z.string(),
});
export type AssessmentQuestionGeneration = z.infer<typeof AssessmentQuestionGenerationSchema>;

export const AssessmentGenerationSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  instructions: z.string(),
  type: z.enum(["TECHNICAL", "CODING", "CASE_STUDY", "WRITTEN", "MCQ", "SCENARIO", "ROLE_SPECIFIC", "CUSTOM"]),
  duration_minutes: z.number().int().min(1).nullable(),
  passing_score: z.number().min(0).max(100),
  questions: z.array(AssessmentQuestionGenerationSchema).min(1),
});
export type AssessmentGeneration = z.infer<typeof AssessmentGenerationSchema>;

const assessmentQuestionJsonSchema = {
  type: "object",
  properties: {
    sequence: { type: "integer", description: "1-based order within the assessment" },
    type: { type: "string", enum: ["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "CODING", "CASE_STUDY", "FILE_UPLOAD"] },
    question: { type: "string" },
    instructions: { type: ["string", "null"], description: "Extra guidance for this specific question, or null" },
    points: { type: "number", description: "Points this question is worth, > 0. Weight harder/more important questions higher." },
    difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
    options: { type: ["array", "null"], items: { type: "string" }, description: "Answer choices — required (non-null, 2-6 items) only when type is MCQ, otherwise null" },
    expected_answer: {
      type: ["string", "null"],
      description: "The model/reference answer used to grade this question, or null when there isn't a single correct answer (e.g. open-ended CASE_STUDY).",
    },
    evaluation_criteria: {
      type: "string",
      description: "Concrete, specific criteria an evaluator (human or AI) should use to score this answer — never left vague.",
    },
  },
  required: ["sequence", "type", "question", "instructions", "points", "difficulty", "options", "expected_answer", "evaluation_criteria"],
  additionalProperties: false,
} as const;

export const assessmentGenerationJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Job-specific assessment title, e.g. 'Backend Engineering Assessment'" },
    description: { type: "string", description: "1-3 sentences describing what this assessment evaluates." },
    instructions: { type: "string", description: "Candidate-facing instructions shown before they start." },
    type: {
      type: "string",
      enum: ["TECHNICAL", "CODING", "CASE_STUDY", "WRITTEN", "MCQ", "SCENARIO", "ROLE_SPECIFIC", "CUSTOM"],
      description: "Chosen based on what this specific JD actually calls for — never default to CODING unless the role requires writing code.",
    },
    duration_minutes: { type: ["integer", "null"], description: "Suggested time limit, or null for untimed." },
    passing_score: { type: "number", description: "0-100, the recommended passing threshold for this assessment." },
    questions: { type: "array", items: assessmentQuestionJsonSchema, description: "Ordered by sequence, covering the job's required and preferred skills." },
  },
  required: ["title", "description", "instructions", "type", "duration_minutes", "passing_score", "questions"],
  additionalProperties: false,
} as const;

/**
 * Assessment question evaluation — output of the Assessment Evaluation
 * Agent (Phase 6), one call per question. The AI never emits a whole-
 * assessment score or SHORTLIST/REJECT recommendation — lib/assessment/
 * logic.ts computes the final score deterministically from these
 * per-question results, exactly like screening/interview.
 */
export const AssessmentQuestionEvaluationResultSchema = z.object({
  score: z.number().min(0),
  max_score: z.number().min(0),
  evaluation: z.string(),
  evidence: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});
export type AssessmentQuestionEvaluationResult = z.infer<typeof AssessmentQuestionEvaluationResultSchema>;

export const assessmentQuestionEvaluationJsonSchema = {
  type: "object",
  properties: {
    score: { type: "number", description: "Points earned for this answer, between 0 and max_score." },
    max_score: { type: "number", description: "Must equal the question's points value exactly, passed to you in the prompt." },
    evaluation: { type: "string", description: "Concise explanation of why this score was given, grounded in the candidate's actual answer." },
    evidence: { type: "string", description: "Quote or closely paraphrase the specific part of the candidate's answer that supports the score." },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"], description: "LOW if the answer is ambiguous, off-topic, or hard to grade confidently — surfaces for human review, never silently guessed." },
  },
  required: ["score", "max_score", "evaluation", "evidence", "confidence"],
  additionalProperties: false,
} as const;

/**
 * Open-ended assessment review — output of the Assessment Review Agent
 * (open-ended flavor). Deliberately qualitative, not a score: the recruiter
 * uploaded a free-form task brief and later a candidate's completed
 * submission received outside the platform, and this produces a briefing
 * document for the interviewer rather than a SHORTLIST/REJECT decision —
 * no stage transition or auto-recommendation is derived from it.
 */
export const OpenEndedReviewSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  focus_areas: z.array(z.string()),
  gaps: z.array(z.string()),
  interviewer_questions: z.array(z.string()),
  stuck_points: z.array(z.string()),
  authenticity_notes: z.string(),
});
export type OpenEndedReview = z.infer<typeof OpenEndedReviewSchema>;

export const openEndedReviewJsonSchema = {
  type: "object",
  properties: {
    strengths: { type: "array", items: { type: "string" }, description: "What the submission does well, grounded in specific evidence from the text." },
    weaknesses: { type: "array", items: { type: "string" }, description: "Concrete shortcomings or weak spots in the submission." },
    focus_areas: {
      type: "array",
      items: { type: "string" },
      description: "What the candidate should focus on improving, based on this submission and the role's requirements.",
    },
    gaps: { type: "array", items: { type: "string" }, description: "Requirements from the brief that the submission does not address at all." },
    interviewer_questions: {
      type: "array",
      items: { type: "string" },
      description: "5-8 specific questions the interviewer should ask about this submission — probing depth of understanding, not generic questions.",
    },
    stuck_points: {
      type: "array",
      items: { type: "string" },
      description:
        "Places the candidate is likely to struggle if asked to explain or extend their own work live — surfaces areas that separate a candidate who genuinely built this from one who copied or had heavy outside help.",
    },
    authenticity_notes: {
      type: "string",
      description:
        "Honest, evidence-based observations relevant to verifying the work is the candidate's own (e.g. inconsistent skill level across sections, unexplained sophistication, generic/templated language) — never a verdict, only what to probe for. Empty string if nothing stands out.",
    },
  },
  required: ["strengths", "weaknesses", "focus_areas", "gaps", "interviewer_questions", "stuck_points", "authenticity_notes"],
  additionalProperties: false,
} as const;

/**
 * Digital Workday task evaluation — output of the Workday Evaluation Agent
 * (Phase 9), one call per task, exactly like assessment question grading.
 * The AI never emits a whole-session score or ADVANCE/REJECT recommendation
 * directly — lib/workday/logic.ts computes those deterministically from
 * every task's score, same shape as screening/assessment.
 */
export const WorkdayTaskEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string(),
  evidence: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});
export type WorkdayTaskEvaluation = z.infer<typeof WorkdayTaskEvaluationSchema>;

export const workdayTaskEvaluationJsonSchema = {
  type: "object",
  properties: {
    score: { type: "number", description: "0-100 quality score for this one task's response, judged against the task's rubric dimensions and deliverable." },
    feedback: { type: "string", description: "Concrete, specific feedback on this response — what was strong, what was weak or missing, grounded in what the candidate actually wrote." },
    evidence: { type: "string", description: "Quote or closely paraphrase the specific part of the response that most justifies the score." },
    confidence: {
      type: "string",
      enum: ["HIGH", "MEDIUM", "LOW"],
      description: "LOW if the response is too thin, off-topic, or ambiguous to grade with certainty — surfaces for human review rather than silently guessing.",
    },
  },
  required: ["score", "feedback", "evidence", "confidence"],
  additionalProperties: false,
} as const;

/**
 * Resume-to-candidate extraction — output of the Candidate Intake Agent,
 * used when a recruiter manually adds a candidate by uploading a resume
 * instead of typing every field by hand. Purely extractive: every field
 * must come from text actually present in the resume, never inferred or
 * guessed — the recruiter reviews and edits before saving either way.
 */
export const ResumeCandidateExtractionSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  portfolio_url: z.string().nullable(),
});
export type ResumeCandidateExtraction = z.infer<typeof ResumeCandidateExtractionSchema>;

export const resumeCandidateExtractionJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Candidate's full name as it appears on the resume. Empty string if not found." },
    email: { type: "string", description: "Candidate's email address. Empty string if not found." },
    phone: { type: ["string", "null"], description: "Candidate's phone number as written, or null if not found." },
    location: { type: ["string", "null"], description: "City/region the candidate is based in, or null if not stated." },
    linkedin_url: { type: ["string", "null"], description: "LinkedIn profile URL if present, or null." },
    portfolio_url: { type: ["string", "null"], description: "Personal website/portfolio/GitHub URL if present, or null." },
  },
  required: ["name", "email", "phone", "location", "linkedin_url", "portfolio_url"],
  additionalProperties: false,
} as const;

export const jdJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Professional, candidate-facing job title" },
    description: {
      type: "string",
      description:
        "A concise, candidate-friendly narrative covering: about the role, what you'll do, and what we're looking for. Plain prose, no corporate fluff. 3-6 short paragraphs.",
    },
    responsibilities: {
      type: "array",
      items: { type: "string" },
      description: "4-8 concrete, specific responsibility bullet points",
    },
    required_skills: { type: "array", items: { type: "string" } },
    preferred_skills: { type: "array", items: { type: "string" } },
    education: { type: "string", description: "Required education level, or 'Not specified'" },
    screening_criteria: {
      type: "object",
      properties: {
        mandatory: { type: "array", items: screeningCriterionJsonSchema },
        preferred: { type: "array", items: screeningCriterionJsonSchema },
        experience: {
          type: "object",
          properties: {
            min_years: { type: ["integer", "null"] },
            max_years: { type: ["integer", "null"] },
          },
          required: ["min_years", "max_years"],
          additionalProperties: false,
        },
      },
      required: ["mandatory", "preferred", "experience"],
      additionalProperties: false,
    },
  },
  required: ["title", "description", "responsibilities", "required_skills", "preferred_skills", "education", "screening_criteria"],
  additionalProperties: false,
} as const;

/**
 * Final evaluation synthesis — output of the FinalEvaluationAgent (Phase 8).
 * Deliberately QUALITATIVE ONLY: strengths/gaps/concerns/summary/confidence.
 * The AI never picks overall_score or the SELECT/REJECT/NEEDS_REVIEW
 * recommendation — those are computed deterministically from configurable
 * weights in lib/final-evaluation/logic.ts (spec §9), exactly like every
 * other agent's evaluate/decide split (screening, interview, assessment).
 */
export const FinalEvaluationSynthesisSchema = z.object({
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  concerns: z.array(z.string()),
  summary: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});
export type FinalEvaluationSynthesis = z.infer<typeof FinalEvaluationSynthesisSchema>;

export const finalEvaluationSynthesisJsonSchema = {
  type: "object",
  properties: {
    strengths: { type: "array", items: { type: "string" }, description: "Synthesized across screening, interview, and assessment evidence — not just the most recent stage." },
    gaps: { type: "array", items: { type: "string" } },
    concerns: { type: "array", items: { type: "string" } },
    summary: {
      type: "string",
      description: "2-4 sentences, concise, factual, grounded in the supplied stage summaries — no exaggerated praise, no speculation beyond the evidence.",
    },
    confidence: {
      type: "string",
      enum: ["HIGH", "MEDIUM", "LOW"],
      description: "LOW if the available evidence across stages is thin, conflicting, or a required stage's data is missing — surfaces for human review rather than a confident-sounding guess.",
    },
  },
  required: ["strengths", "gaps", "concerns", "summary", "confidence"],
  additionalProperties: false,
} as const;
