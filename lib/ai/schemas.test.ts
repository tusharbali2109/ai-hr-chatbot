import { describe, it, expect } from "vitest";
import {
  RequirementSchema,
  JDGenerationSchema,
  CandidateEvaluationSchema,
  InterviewPlanSchema,
  InterviewQuestionGenerationSchema,
  AnswerEvaluationSchema,
  FollowUpDecisionSchema,
  InterviewEvaluationSchema,
} from "@/lib/ai/schemas";

const VALID_REQUIREMENT = {
  role: "Senior Python Backend Engineer",
  experience_min: 4,
  experience_max: 7,
  mandatory_skills: ["Python", "FastAPI", "AWS"],
  preferred_skills: ["AI", "LLM"],
  work_mode: "Not specified",
  location: "Not specified",
  employment_type: "Not specified",
  education: "Not specified",
  clarification_needed: false,
  clarification_question: null,
  clarification_options: [],
};

const VALID_JD = {
  title: "Senior Python Backend Engineer",
  description: "A well-written role narrative.",
  responsibilities: ["Design and own backend services", "Collaborate with the platform team"],
  required_skills: ["Python", "FastAPI", "AWS"],
  preferred_skills: ["AI", "LLM"],
  education: "Not specified",
  screening_criteria: {
    mandatory: [
      { skill: "Python", importance: 10 },
      { skill: "FastAPI", importance: 9 },
      { skill: "AWS", importance: 8 },
    ],
    preferred: [{ skill: "LLM", importance: 6 }],
    experience: { min_years: 4, max_years: 7 },
  },
};

describe("RequirementSchema (Requirement Agent structured output)", () => {
  it("accepts a well-formed AI response", () => {
    expect(() => RequirementSchema.parse(VALID_REQUIREMENT)).not.toThrow();
  });

  it("accepts the clarification-needed shape (point 15: missing information handling)", () => {
    const clarifying = {
      ...VALID_REQUIREMENT,
      role: "",
      clarification_needed: true,
      clarification_question: "What type of developer?",
      clarification_options: ["Frontend", "Backend", "Full Stack", "Mobile", "DevOps", "Data"],
    };
    const parsed = RequirementSchema.parse(clarifying);
    expect(parsed.clarification_needed).toBe(true);
    expect(parsed.clarification_options).toHaveLength(6);
  });

  it("rejects a malformed AI response missing required fields", () => {
    const malformed = { role: "Backend Engineer" };
    expect(() => RequirementSchema.parse(malformed)).toThrow();
  });

  it("rejects wrong types (e.g. skills as a string instead of an array)", () => {
    const malformed = { ...VALID_REQUIREMENT, mandatory_skills: "Python, FastAPI" };
    expect(() => RequirementSchema.parse(malformed)).toThrow();
  });

  it("rejects non-integer experience values", () => {
    const malformed = { ...VALID_REQUIREMENT, experience_min: "four" };
    expect(() => RequirementSchema.parse(malformed)).toThrow();
  });
});

describe("JDGenerationSchema (JD Generation Agent structured output)", () => {
  it("accepts a well-formed AI response", () => {
    expect(() => JDGenerationSchema.parse(VALID_JD)).not.toThrow();
  });

  it("rejects a JD with no responsibilities", () => {
    const malformed = { ...VALID_JD, responsibilities: [] };
    expect(() => JDGenerationSchema.parse(malformed)).toThrow();
  });

  it("rejects an empty title", () => {
    const malformed = { ...VALID_JD, title: "" };
    expect(() => JDGenerationSchema.parse(malformed)).toThrow();
  });

  it("rejects screening criteria with out-of-range importance", () => {
    const malformed = {
      ...VALID_JD,
      screening_criteria: {
        ...VALID_JD.screening_criteria,
        mandatory: [{ skill: "Python", importance: 15 }],
      },
    };
    expect(() => JDGenerationSchema.parse(malformed)).toThrow();
  });

  it("rejects a completely malformed AI response (e.g. plain string instead of JSON object)", () => {
    expect(() => JDGenerationSchema.parse("this is not a job description")).toThrow();
  });

  it("rejects null and undefined", () => {
    expect(() => JDGenerationSchema.parse(null)).toThrow();
    expect(() => JDGenerationSchema.parse(undefined)).toThrow();
  });
});

const VALID_CANDIDATE_EVALUATION = {
  mandatory_assessments: [
    { requirement: "Python", status: "MATCH", evidence: "4 years backend development experience using Python." },
    { requirement: "AWS", status: "UNKNOWN", evidence: "No clear AWS experience found in the provided information." },
  ],
  preferred_assessments: [{ requirement: "Docker", status: "NO_MATCH", evidence: "Resume does not mention Docker or containerization." }],
  component_scores: {
    required_skills: 92,
    experience: 90,
    relevant_experience: 85,
    jd_semantic_match: 88,
    preferred_skills: 70,
    education_other: 60,
  },
  strengths: ["Strong Python experience", "Relevant backend projects"],
  gaps: ["AWS experience not clearly documented"],
  concerns: [],
  summary: "Strong backend candidate with relevant Python experience.",
  confidence: "HIGH",
};

describe("CandidateEvaluationSchema (Screening Agent structured output)", () => {
  it("accepts a well-formed AI response", () => {
    expect(() => CandidateEvaluationSchema.parse(VALID_CANDIDATE_EVALUATION)).not.toThrow();
  });

  it("accepts UNKNOWN status for ambiguous mandatory requirements", () => {
    const parsed = CandidateEvaluationSchema.parse(VALID_CANDIDATE_EVALUATION);
    expect(parsed.mandatory_assessments.find((a) => a.requirement === "AWS")?.status).toBe("UNKNOWN");
  });

  it("rejects a missing required field", () => {
    const malformed: Record<string, unknown> = { ...VALID_CANDIDATE_EVALUATION };
    delete malformed.summary;
    expect(() => CandidateEvaluationSchema.parse(malformed)).toThrow();
  });

  it("rejects an invalid status enum value", () => {
    const malformed = {
      ...VALID_CANDIDATE_EVALUATION,
      mandatory_assessments: [{ requirement: "Python", status: "PROBABLY", evidence: "..." }],
    };
    expect(() => CandidateEvaluationSchema.parse(malformed)).toThrow();
  });

  it("rejects an out-of-range component score", () => {
    const malformed = { ...VALID_CANDIDATE_EVALUATION, component_scores: { ...VALID_CANDIDATE_EVALUATION.component_scores, required_skills: 140 } };
    expect(() => CandidateEvaluationSchema.parse(malformed)).toThrow();
  });

  it("rejects a completely malformed AI response", () => {
    expect(() => CandidateEvaluationSchema.parse("not an evaluation")).toThrow();
    expect(() => CandidateEvaluationSchema.parse(null)).toThrow();
  });
});

const VALID_INTERVIEW_PLAN = {
  sections: [
    { name: "Introduction", target_minutes: 2, target_questions: 0 },
    { name: "Python", target_minutes: 5, target_questions: 2 },
  ],
  opening_script: "Hi, I'm an AI interview assistant. Are you comfortable continuing?",
  closing_script: "Thank you for your time — we'll be in touch about next steps.",
};

describe("InterviewPlanSchema (Interview Agent structured output)", () => {
  it("accepts a well-formed AI response", () => {
    expect(() => InterviewPlanSchema.parse(VALID_INTERVIEW_PLAN)).not.toThrow();
  });

  it("rejects a section missing required fields", () => {
    const malformed = { ...VALID_INTERVIEW_PLAN, sections: [{ name: "Introduction" }] };
    expect(() => InterviewPlanSchema.parse(malformed)).toThrow();
  });

  it("rejects a completely malformed response", () => {
    expect(() => InterviewPlanSchema.parse(null)).toThrow();
  });
});

describe("InterviewQuestionGenerationSchema", () => {
  it("accepts a well-formed question", () => {
    expect(() => InterviewQuestionGenerationSchema.parse({ question: "Tell me about your Python experience.", category: "Python" })).not.toThrow();
  });
  it("rejects a missing category", () => {
    expect(() => InterviewQuestionGenerationSchema.parse({ question: "Tell me about your Python experience." })).toThrow();
  });
});

const VALID_ANSWER_EVALUATION = {
  relevance_score: 90,
  technical_score: 85,
  clarity_score: 80,
  sufficiency: "SUFFICIENT",
  evaluation: "Candidate described building REST APIs with FastAPI, including dependency injection.",
};

describe("AnswerEvaluationSchema", () => {
  it("accepts a well-formed evaluation", () => {
    expect(() => AnswerEvaluationSchema.parse(VALID_ANSWER_EVALUATION)).not.toThrow();
  });
  it("accepts INSUFFICIENT and PARTIAL sufficiency", () => {
    expect(() => AnswerEvaluationSchema.parse({ ...VALID_ANSWER_EVALUATION, sufficiency: "PARTIAL" })).not.toThrow();
    expect(() => AnswerEvaluationSchema.parse({ ...VALID_ANSWER_EVALUATION, sufficiency: "INSUFFICIENT" })).not.toThrow();
  });
  it("rejects an invalid sufficiency enum value", () => {
    expect(() => AnswerEvaluationSchema.parse({ ...VALID_ANSWER_EVALUATION, sufficiency: "MAYBE" })).toThrow();
  });
  it("rejects an out-of-range score", () => {
    expect(() => AnswerEvaluationSchema.parse({ ...VALID_ANSWER_EVALUATION, technical_score: 500 })).toThrow();
  });
});

describe("FollowUpDecisionSchema", () => {
  it("accepts a decision to follow up", () => {
    expect(() =>
      FollowUpDecisionSchema.parse({ should_follow_up: true, follow_up_question: "Can you say more about that?", reason: "Answer was vague." })
    ).not.toThrow();
  });
  it("accepts a decision to move on with a null follow-up question", () => {
    expect(() =>
      FollowUpDecisionSchema.parse({ should_follow_up: false, follow_up_question: null, reason: "Answer was sufficient." })
    ).not.toThrow();
  });
  it("rejects a missing reason", () => {
    expect(() => FollowUpDecisionSchema.parse({ should_follow_up: false, follow_up_question: null })).toThrow();
  });
});

const VALID_INTERVIEW_EVALUATION = {
  component_scores: {
    technical_knowledge: 88,
    problem_solving: 82,
    relevant_experience: 90,
    role_specific_skills: 86,
    communication_clarity: 80,
  },
  strengths: ["Strong FastAPI experience"],
  gaps: ["Limited AWS depth"],
  concerns: [],
  summary: "Strong technical candidate with clear communication.",
  confidence: "HIGH",
};

describe("InterviewEvaluationSchema", () => {
  it("accepts a well-formed AI response", () => {
    expect(() => InterviewEvaluationSchema.parse(VALID_INTERVIEW_EVALUATION)).not.toThrow();
  });
  it("rejects a missing component score dimension", () => {
    const malformed = {
      ...VALID_INTERVIEW_EVALUATION,
      component_scores: { ...VALID_INTERVIEW_EVALUATION.component_scores, communication_clarity: undefined },
    };
    expect(() => InterviewEvaluationSchema.parse(malformed)).toThrow();
  });
  it("rejects a completely malformed response", () => {
    expect(() => InterviewEvaluationSchema.parse("not an evaluation")).toThrow();
    expect(() => InterviewEvaluationSchema.parse(undefined)).toThrow();
  });
});
