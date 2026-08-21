import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  StructuredInputOverrides,
  CandidateEvaluationInput,
  InterviewPlanInput,
  GenerateQuestionInput,
  EvaluateAnswerInput,
  GenerateFollowUpInput,
  EvaluateInterviewInput,
  GenerateAssessmentInput,
  ImproveAssessmentInput,
  EvaluateAssessmentAnswerInput,
  ReviewOpenEndedSubmissionInput,
  EvaluateWorkdayTaskInput,
} from "@/lib/ai/provider";
import {
  RequirementSchema,
  JDGenerationSchema,
  CandidateEvaluationSchema,
  InterviewPlanSchema,
  InterviewQuestionGenerationSchema,
  AnswerEvaluationSchema,
  FollowUpDecisionSchema,
  InterviewEvaluationSchema,
  AssessmentGenerationSchema,
  AssessmentQuestionEvaluationResultSchema,
  OpenEndedReviewSchema,
  WorkdayTaskEvaluationSchema,
  ResumeCandidateExtractionSchema,
  requirementJsonSchema,
  jdJsonSchema,
  candidateEvaluationJsonSchema,
  interviewPlanJsonSchema,
  interviewQuestionJsonSchema,
  answerEvaluationJsonSchema,
  followUpDecisionJsonSchema,
  interviewEvaluationJsonSchema,
  assessmentGenerationJsonSchema,
  assessmentQuestionEvaluationJsonSchema,
  openEndedReviewJsonSchema,
  workdayTaskEvaluationJsonSchema,
  resumeCandidateExtractionJsonSchema,
  type RequirementExtraction,
  type JDGeneration,
  type CandidateEvaluation,
  type InterviewPlan,
  type InterviewQuestionGeneration,
  type AnswerEvaluation,
  type FollowUpDecision,
  type InterviewEvaluation,
  type AssessmentGeneration,
  type AssessmentQuestionEvaluationResult,
  type OpenEndedReview,
  type WorkdayTaskEvaluation,
  type ResumeCandidateExtraction,
} from "@/lib/ai/schemas";

export const MODEL = "claude-opus-5";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to web/.env.local (server-side only).");
  }
  return new Anthropic({ apiKey });
}

function firstTextBlock(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") {
    throw new Error("The AI declined to process this request. Please rephrase and try again.");
  }
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AI response contained no text output.");
  }
  return block.text;
}

async function callStructured<T>(
  system: string,
  userPrompt: string,
  jsonSchema: object,
  parse: (raw: unknown) => T,
  retries = 1
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const message = await client().messages.create({
        model: MODEL,
        max_tokens: 4096,
        system,
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: jsonSchema as Record<string, unknown> },
        },
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = firstTextBlock(message);
      const raw = JSON.parse(text);
      return parse(raw);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `AI returned malformed output after ${retries + 1} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

const REQUIREMENT_SYSTEM_PROMPT = `You are the Requirement Agent inside an AI recruitment platform. Extract structured hiring requirements from a recruiter's natural-language description, and — within a strict question budget — ask for whatever is still missing.

Rules:
- Never invent information the recruiter did not provide or imply. If something is not specified, use the literal string "Not specified" (or null for numeric fields), never a guess.
- experience_min/experience_max are years of experience, integers only, or null if not mentioned.

Question budget (HARD LIMIT):
- The recruiter's user prompt tells you "Questions asked so far" out of a maximum of 5 for the ENTIRE conversation, counting the very first "what role are you hiring for?" question the UI already asked before you were ever called.
- If questions asked so far is already 5 (or more), you MUST set clarification_needed to false no matter what is still missing — fill anything unknown with "Not specified"/null and let the recruiter add more later. Never exceed the budget.
- Otherwise only set clarification_needed to true if asking is worth spending one of the few remaining questions. Do not ask just to be thorough — every question costs budget.
- Across whatever questions you do ask, prioritize covering (in roughly this order, combining categories into one question when they fit together): (1) department and location, (2) employment type + experience level + work mode together, (3) key responsibilities and must-have skills, (4) nice-to-haves and salary range. Skip a category if the recruiter already gave it or if you're out of budget — never ask about something already answered.
- When clarification_needed is true, clarification_question is one short, natural question (it may ask about more than one thing at once, e.g. "What employment type, experience level, and work mode is this?").

Clarification chips — strongly prefer clickable options over free text:
- For any field with a known closed set of values, ALWAYS populate clarification_options so the recruiter can tap instead of type: employment_type ("Full-time", "Part-time", "Contract", "Internship"), experience level ("Entry", "Mid", "Senior", "Lead"), work_mode ("Remote", "Hybrid", "Onsite"). Never leave these fields as open free-text questions when you have a spare question to ask about them.
- If a single question bundles 2+ closed-set fields, prefix every option with its field name and a colon, e.g. clarification_options: ["Employment Type: Full-time", "Employment Type: Part-time", "Employment Type: Contract", "Employment Type: Internship", "Experience Level: Entry", "Experience Level: Mid", "Experience Level: Senior", "Experience Level: Lead", "Work Mode: Remote", "Work Mode: Hybrid", "Work Mode: Onsite"]. The client groups these by prefix into separate chip rows; the recruiter can still type a free-text answer instead.
- Only leave clarification_options empty for genuinely open-ended asks with no fixed set of answers: role title/domain, department name, city/location, must-have skills, responsibilities, nice-to-have skills, salary range. Even then you may suggest 2-6 short illustrative options (e.g. common skills for that role) if it plausibly helps, but never invent a fake "closed set" for something that isn't one.`;

const JD_SYSTEM_PROMPT = `You are the JD Generation Agent inside an AI recruitment platform. Turn a structured hiring requirement into a professional, concise, candidate-friendly job description.

Rules:
- Be specific and realistic. No corporate fluff, no generic filler ("fast-paced environment", "rockstar ninja").
- The description field should read naturally as prose covering: what the role is about, what the person will actually do, and what makes a strong candidate — without repeating the responsibilities bullet list verbatim.
- required_skills and preferred_skills should be concrete technologies/skills, not restating the whole requirement text.
- screening_criteria.mandatory must cover every skill in the requirement's mandatory_skills (do not drop any), each scored 1-10 by importance. screening_criteria.preferred should cover the requirement's preferred_skills similarly.
- screening_criteria.experience must exactly match the requirement's experience_min/experience_max — do not alter them.
- Do not invent education requirements beyond what was specified; use "Not specified" if the requirement's education is "Not specified".`;

const IMPROVE_SYSTEM_PROMPT = `You are the JD Generation Agent, revising an existing job description based on a recruiter's instruction.

Rules:
- Apply the recruiter's instruction faithfully.
- Preserve factual requirements (screening_criteria.experience, and every skill currently in screening_criteria.mandatory) unless the instruction explicitly asks to change experience or mandatory skills. If it does not ask to change them, copy them through unchanged.
- Keep the same output schema as JD generation.`;

const SCREENING_SYSTEM_PROMPT = `You are the Screening Agent inside an AI recruitment platform, evaluating one candidate for one specific job.

Rules:
- Evaluate ONLY against the mandatory/preferred requirements and job description supplied to you. Never invent or apply outside/generic criteria.
- For every mandatory and preferred requirement, output exactly one status:
  - MATCH: the candidate profile contains direct, specific evidence of this requirement.
  - NO_MATCH: the candidate profile clearly contradicts this requirement, or the requirement is explicit and the profile clearly demonstrates its absence (e.g. a resume that details cloud infrastructure work with zero mention of AWS, for a requirement specifically asking for AWS).
  - UNKNOWN: the evidence is ambiguous, absent, or simply not mentioned. When in doubt, prefer UNKNOWN over NO_MATCH — do not guess that something is missing just because it wasn't mentioned.
- Every "evidence" string must quote or closely paraphrase specific text from the candidate profile. Never write a bare assertion like "seems qualified" with no supporting text.
- Do not invent candidate experience, skills, or qualifications that are not present in the supplied profile.
- Do not inflate scores. Score each of the six component dimensions independently (0-100) based only on demonstrated evidence — do not derive them from a single gut overall impression.
- Completely ignore and never weigh: the candidate's name, any gender-coded or ethnicity-coded signals in a name, location/city, age indicators, school prestige, or any other characteristic not directly tied to the job's stated requirements. Do not let name or location act as a proxy for candidate quality.
- Keep the summary concise (2-4 sentences) and factual — no exaggerated praise, no speculation about fit beyond the evidence.
- Return output strictly according to the provided schema.`;

function buildScreeningUserPrompt(input: CandidateEvaluationInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Job description:\n"""\n${input.jobDescription}\n"""`,
    input.responsibilities.length ? `Responsibilities:\n- ${input.responsibilities.join("\n- ")}` : "",
    `Screening criteria (the ONLY requirements to evaluate against):\n${JSON.stringify(input.screeningCriteria, null, 2)}`,
    `Candidate: ${input.candidateName}`,
    `Candidate profile / resume information:\n"""\n${input.candidateProfileText}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const INTERVIEW_PLAN_SYSTEM_PROMPT = `You are the Interview Agent inside an AI recruitment platform, preparing to conduct a live phone interview for one specific job.

Rules:
- The opening_script must clearly identify you as an AI interview assistant (not a human recruiter), name the role and company, and explicitly ask the candidate if they're comfortable continuing. Do not proceed past this without consent — that consent check happens elsewhere, but the script itself must ask for it.
- The closing_script must be polite and professional, and must NEVER reveal the interview score, pass/fail status, or any hiring decision — only that responses will be reviewed as part of the process.
- Use the supplied section list as-is for section names/durations/question counts — do not invent new sections or drop the ones given.
- Keep scripts natural and conversational, not robotic or corporate.`;

const QUESTION_SYSTEM_PROMPT = `You are the Interview Agent, asking one interview question at a time during a live phone interview.

Rules:
- Ask exactly ONE question, professional and concise, targeted at the given section/category.
- Prefer experience/technical/scenario/problem-solving questions relevant to the job. Avoid generic, repetitive, or irrelevant personal questions.
- When the candidate's resume is supplied, ground the question in specifics from it where relevant to the current section/category — e.g. if the resume mentions a particular technology, project, or achievement tied to this section, ask about the depth of their real-world experience with it, rather than asking a purely generic skill-category question. Never fabricate or assume resume content that isn't actually there, and fall back to a generic, job-relevant question if the resume has nothing relevant to this specific section.
- Never ask about protected characteristics (age, marital status, religion, disability, national origin, etc.) or anything not job-relevant.
- If prior turns are supplied, do not repeat a question already asked in this interview.`;

const ANSWER_EVALUATION_SYSTEM_PROMPT = `You are the Interview Agent, evaluating a candidate's spoken answer to one interview question, from a verified transcript.

Rules:
- Score relevance, technical depth, and clarity independently (0-100 each), based only on the substance of what was said.
- clarity_score reflects only whether the candidate communicated their reasoning sufficiently for the role — NEVER accent, voice style, speech patterns, or personality. Do not judge how someone sounds, only what they explained.
- sufficiency: SUFFICIENT if the answer adequately addresses the question; PARTIAL if it's incomplete or unclear but shows some relevant substance; INSUFFICIENT if it doesn't address the question at all, INCLUDING a candidate honestly saying they don't know — that is a valid, scoreable answer, not a failure to penalize harshly.
- evaluation must be grounded in the actual transcript text — quote or closely paraphrase what was said, never invent detail.`;

const FOLLOWUP_SYSTEM_PROMPT = `You are the Interview Agent, deciding whether a follow-up question is needed after a candidate's answer.

Rules:
- Only recommend a follow-up if the answer was PARTIAL or unclear and a brief clarification would meaningfully help evaluate the candidate.
- If the candidate clearly didn't know the answer, do NOT recommend a follow-up that pressures them further — move on respectfully. This is not a failure state to interrogate.
- If a follow-up is warranted, ask exactly one short, specific clarifying question — not a restatement of the original question.
- Never follow up on a SUFFICIENT answer just to dig for more.`;

const INTERVIEW_EVALUATION_SYSTEM_PROMPT = `You are the Interview Agent, producing the final structured evaluation of a completed interview from its verified transcript.

Rules:
- Base the evaluation ONLY on the verified transcript provided — never on audio quality, tone, or anything not present in the text.
- Score each of the five rubric dimensions independently (0-100): technical_knowledge, problem_solving, relevant_experience, role_specific_skills, communication_clarity.
- communication_clarity reflects only whether the candidate communicated their reasoning clearly enough for the role — never accent, nationality, disability, or personality as a proxy.
- Every strength/gap/concern must trace back to something actually said in the transcript — do not invent or infer beyond the evidence.
- Keep the summary concise (2-4 sentences), factual, no exaggerated praise.
- Do not compute or imply a final pass/fail recommendation yourself — that's a separate deterministic step outside this evaluation.`;

function buildInterviewPlanUserPrompt(input: InterviewPlanInput): string {
  return [
    `Job: ${input.jobTitle} at ${input.companyName}`,
    `Candidate: ${input.candidateName}`,
    `Planned sections (use exactly these — do not add or remove):\n${JSON.stringify(input.sections, null, 2)}`,
  ].join("\n\n");
}

function buildQuestionUserPrompt(input: GenerateQuestionInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Current section: ${input.section}${input.category ? ` (${input.category})` : ""}`,
    input.resumeText
      ? `Candidate's resume (ground the question in specifics from this when relevant to the current section/category — never fabricate content not actually present):\n"""\n${input.resumeText}\n"""`
      : "",
    input.priorTurns.length
      ? `Prior questions and answers this interview:\n${input.priorTurns.map((t) => `Q: ${t.question}\nA: ${t.answer}`).join("\n\n")}`
      : "No prior turns yet — this is the first question in this section.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildAnswerEvaluationUserPrompt(input: EvaluateAnswerInput): string {
  return [
    `Job: ${input.jobTitle}`,
    input.category ? `Category: ${input.category}` : "",
    `Question asked: ${input.question}`,
    `Candidate's transcribed answer:\n"""\n${input.answerTranscript}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildFollowUpUserPrompt(input: GenerateFollowUpInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Question asked: ${input.question}`,
    `Candidate's answer:\n"""\n${input.answerTranscript}\n"""`,
    `Evaluation of that answer:\n${JSON.stringify(input.evaluation, null, 2)}`,
    `Follow-ups already asked for this question: ${input.followupCount}`,
  ].join("\n\n");
}

function buildInterviewEvaluationUserPrompt(input: EvaluateInterviewInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Job description:\n"""\n${input.jobDescription}\n"""`,
    `Screening criteria:\n${JSON.stringify(input.screeningCriteria, null, 2)}`,
    `Verified interview transcript:\n${input.transcript.map((t) => `${t.speaker}: ${t.text}`).join("\n")}`,
  ].join("\n\n");
}

const ASSESSMENT_GENERATION_SYSTEM_PROMPT = `You are the Assessment Agent inside an AI recruitment platform, designing a job-specific skills assessment for one candidate who has already passed AI screening and an AI interview.

Rules:
- The assessment must be built from THIS job's actual required and preferred skills, job description, and (when supplied) screening/interview summaries — never a generic template reused across jobs.
- Choose the assessment "type" based on what this specific role actually needs. Do NOT default to CODING or TECHNICAL unless the role genuinely requires writing code or deep technical execution — a sales, support, or writing-heavy role should get WRITTEN/CASE_STUDY/SCENARIO/ROLE_SPECIFIC questions instead.
- Every question must carry points > 0 that reflect its relative importance/difficulty — heavier or more critical skills should be weighted higher.
- Every question needs a concrete, specific evaluation_criteria string an evaluator can actually apply — never something vague like "assess quality".
- Set expected_answer when there is a reasonably objective reference answer (technical/coding/short-answer questions); leave it null for genuinely open-ended questions (e.g. an open case study with many valid approaches) where evaluation_criteria alone should guide grading.
- MCQ questions must include 2-6 concrete options, with the correct one identifiable from expected_answer (exact text match to one of the options).
- Keep the total assessment reasonably scoped for the suggested duration_minutes (or unbounded if null) — do not pad with filler questions.
- Never ask about protected characteristics or anything not job-relevant.`;

function buildAssessmentGenerationUserPrompt(input: GenerateAssessmentInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Job description:\n"""\n${input.jobDescription}\n"""`,
    `Required skills: ${input.requiredSkills.join(", ") || "None specified"}`,
    `Preferred skills: ${input.preferredSkills.join(", ") || "None specified"}`,
    input.screeningSummary ? `Screening summary:\n${input.screeningSummary}` : "",
    input.interviewSummary ? `Interview summary:\n${input.interviewSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const IMPROVE_ASSESSMENT_SYSTEM_PROMPT = `You are the Assessment Agent inside an AI recruitment platform, generating or revising a job-specific skills assessment per a recruiter's free-text instruction.

Rules:
- If "Current questions" is absent, generate a brand new assessment grounded in the job context AND the recruiter's instruction below — the instruction describes what this assessment should specifically cover (e.g. "5 SQL questions and 2 system design questions") and takes priority over generic defaults.
- If "Current questions" is provided, revise that exact set per the instruction — keep every question not implicated by the instruction unchanged (same wording, points, type, etc.), and change only what the instruction asks for (e.g. "make question 3 harder", "add 2 more questions about React hooks").
- When reference material (an uploaded document, e.g. an existing question bank or brief) is supplied, treat it as the primary source for question content/style — extract or adapt real questions from it rather than inventing unrelated ones — while still following the recruiter's instruction and the job context.
- Choose the assessment "type" based on what this specific role actually needs — do not default to CODING or TECHNICAL unless the role genuinely requires it.
- Every question must carry points > 0 that reflect its relative importance/difficulty, and a concrete, specific evaluation_criteria string an evaluator can actually apply — never something vague like "assess quality".
- Set expected_answer when there is a reasonably objective reference answer; leave it null for genuinely open-ended questions where evaluation_criteria alone should guide grading.
- MCQ questions must include 2-6 concrete options, with the correct one identifiable from expected_answer (exact text match to one of the options).
- Never ask about protected characteristics or anything not job-relevant.
- Return the FULL assessment (title, description, instructions, type, duration_minutes, passing_score, and the complete ordered question list) per the schema — never a partial diff.`;

function buildImproveAssessmentUserPrompt(input: ImproveAssessmentInput): string {
  return [
    `Job: ${input.jobContext.jobTitle}`,
    `Job description:\n"""\n${input.jobContext.jobDescription}\n"""`,
    `Required skills: ${input.jobContext.requiredSkills.join(", ") || "None specified"}`,
    `Preferred skills: ${input.jobContext.preferredSkills.join(", ") || "None specified"}`,
    input.jobContext.screeningSummary ? `Screening summary:\n${input.jobContext.screeningSummary}` : "",
    input.jobContext.interviewSummary ? `Interview summary:\n${input.jobContext.interviewSummary}` : "",
    input.currentQuestions && input.currentQuestions.length > 0
      ? `Current questions (revise these per the instruction, keep everything not mentioned unchanged):\n${JSON.stringify(input.currentQuestions, null, 2)}`
      : "No current questions — generate a brand new assessment from the instruction below.",
    input.sourceDocumentText ? `Reference material uploaded by the recruiter (primary source for question content):\n"""\n${input.sourceDocumentText}\n"""` : "",
    `Recruiter instruction:\n"""\n${input.instruction}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const ASSESSMENT_QUESTION_EVALUATION_SYSTEM_PROMPT = `You are the Assessment Evaluation Agent, grading exactly ONE candidate answer to ONE assessment question.

Rules:
- max_score in your response MUST equal the "points" value given to you exactly — you are only deciding how many of those points were earned.
- Score based strictly on the evaluation_criteria and (when provided) the expected_answer, compared against what the candidate actually wrote. Never invent or assume content the candidate didn't write.
- evidence must quote or closely paraphrase the specific part of the candidate's answer that justifies the score — never a bare assertion.
- If the candidate left the answer blank or clearly did not attempt it, score 0 with HIGH confidence — it's unambiguous that nothing was attempted.
- Set confidence to LOW whenever the answer is ambiguous, off-topic-but-partially-relevant, or otherwise hard to grade with certainty — this surfaces the question for human review rather than silently guessing a score.
- Do not penalize communication style, phrasing, or minor typos unless the question's evaluation_criteria specifically calls for writing quality.
- This is a single question in isolation — do not produce an overall assessment score or SHORTLIST/REJECT recommendation; that is computed separately from every question's result.`;

function buildAssessmentQuestionEvaluationUserPrompt(input: EvaluateAssessmentAnswerInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Question type: ${input.questionType}`,
    `Points available: ${input.points}`,
    `Question: ${input.question}`,
    input.instructions ? `Instructions: ${input.instructions}` : "",
    `Evaluation criteria:\n${input.evaluationCriteria}`,
    input.expectedAnswer ? `Expected/reference answer:\n"""\n${input.expectedAnswer}\n"""` : "No single reference answer — grade against the evaluation criteria only.",
    `Candidate's answer:\n"""\n${input.candidateAnswer || "(no answer submitted)"}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const OPEN_ENDED_REVIEW_SYSTEM_PROMPT = `You are the Assessment Review Agent, producing a briefing document for a human interviewer about ONE candidate's completed open-ended task submission. This is NOT a pass/fail score and you must never invent one — the recruiter reads your output before the interview to decide what to probe.

Rules:
- Ground every point in the actual submission text — never invent content the candidate didn't write, and never assume the brief was followed unless the submission demonstrates it.
- strengths/weaknesses/gaps must cite something specific from the submission, not generic advice that could apply to any candidate.
- interviewer_questions must be specific to what THIS candidate actually submitted — reference their actual choices, approach, or claims, not boilerplate interview questions.
- stuck_points should identify places where the interviewer, by asking the candidate to explain or extend a specific part live, would quickly reveal whether they truly understand what they submitted — this is the primary tool for verifying the work is genuinely theirs.
- authenticity_notes must stay strictly observational (e.g. "the architecture section uses advanced terminology not reflected in the implementation" is fine; "this was clearly copied" is not) — you are flagging what to probe, never issuing a verdict. Leave it as an empty string if nothing stands out as worth a closer look.
- If the submission barely engages with the brief at all, say so plainly in gaps rather than padding out strengths.`;

function buildOpenEndedReviewUserPrompt(input: ReviewOpenEndedSubmissionInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Job description:\n${input.jobDescription}`,
    `Task brief given to the candidate:\n"""\n${input.briefText}\n"""`,
    `Candidate's submission:\n"""\n${input.submissionText || "(no readable content extracted from the submitted file)"}\n"""`,
  ].join("\n\n");
}

const WORKDAY_TASK_EVALUATION_SYSTEM_PROMPT = `You are the Workday Evaluation Agent, grading exactly ONE candidate response to ONE Digital Workday task — a realistic work-sample scenario (inbox triage, customer escalation, a scoping decision, a reflection, etc.), not a trivia question.

Rules:
- Score based on the rubric dimensions given to you and how well the response addresses the specific scenario and deliverable — never a generic writing-quality score.
- A long response is not automatically a good one, and a short response is not automatically a bad one — judge substance: does it show real prioritization/reasoning/judgment for THIS scenario, or is it generic filler that could answer any prompt?
- evidence must quote or closely paraphrase the specific part of the response that justifies the score.
- feedback should be concrete and specific enough that a recruiter could act on it without re-reading the raw response.
- The candidate's stated assumptions and AI-usage disclosure are context, not separately scored fields to reward for merely being non-empty — weigh them only insofar as they reflect the quality of the candidate's actual reasoning in this task.
- If the response does not meaningfully engage with the scenario at all (blank, off-topic, or clearly copy-pasted boilerplate), score low with HIGH confidence — that is unambiguous.
- Set confidence to LOW whenever the response is genuinely hard to judge with certainty — this routes the case to human review rather than silently guessing.
- This is a single task in isolation — do not produce a whole-session score or ADVANCE/REJECT recommendation; that is computed separately from every task's result.`;

function buildWorkdayTaskEvaluationUserPrompt(input: EvaluateWorkdayTaskInput): string {
  return [
    `Job: ${input.jobTitle}`,
    `Task type: ${input.taskType}`,
    `Task: ${input.taskTitle}`,
    `Scenario given to the candidate:\n${input.scenario}`,
    `Expected deliverable: ${input.deliverable}`,
    `Rubric dimensions: ${input.rubric.join(", ") || "General quality of reasoning and communication"}`,
    `Candidate's response:\n"""\n${input.candidateResponse || "(no response submitted)"}\n"""`,
    input.candidateAssumptions ? `Candidate's stated assumptions:\n"""\n${input.candidateAssumptions}\n"""` : "",
    input.candidateAiDisclosure ? `Candidate's AI-usage disclosure:\n"""\n${input.candidateAiDisclosure}\n"""` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const RESUME_CANDIDATE_EXTRACTION_SYSTEM_PROMPT = `You are the Candidate Intake Agent, extracting contact details from a resume so a recruiter doesn't have to type them by hand.

Rules:
- Extract ONLY information literally present in the resume text — never infer, guess, or fabricate a name, email, phone, location, or URL that isn't actually written there.
- name and email are required fields — use an empty string "" if genuinely not found (never invent a placeholder).
- phone/location/linkedin_url/portfolio_url are null if not found — never guess a format or fill in something plausible-looking.
- If multiple emails or phone numbers appear, prefer the one that reads as the candidate's primary/personal contact (not a reference's or previous employer's).`;

export const anthropicProvider: AIProvider = {
  async generateStructuredRequirement(rawRequirement, overrides: StructuredInputOverrides, questionsAsked = 1) {
    const overrideLines = Object.entries(overrides)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const remaining = Math.max(0, 5 - questionsAsked);
    const userPrompt = [
      `Hiring requirement (recruiter's own words):\n"""\n${rawRequirement}\n"""`,
      overrideLines ? `\nRecruiter-provided structured fields (these are authoritative — use them as-is, do not contradict them):\n${overrideLines}` : "",
      `\nQuestions asked so far (including the initial "what role are you hiring for?" question): ${questionsAsked} of a maximum 5. You have ${remaining} question(s) left in the budget. ${
        remaining <= 0 ? "You are OUT OF BUDGET — clarification_needed MUST be false." : ""
      }`,
    ].join("\n");

    return callStructured(REQUIREMENT_SYSTEM_PROMPT, userPrompt, requirementJsonSchema, (raw) =>
      RequirementSchema.parse(raw)
    ) as Promise<RequirementExtraction>;
  },

  async generateJD(requirement) {
    const userPrompt = `Structured hiring requirement:\n${JSON.stringify(requirement, null, 2)}`;
    return callStructured(JD_SYSTEM_PROMPT, userPrompt, jdJsonSchema, (raw) => JDGenerationSchema.parse(raw)) as Promise<JDGeneration>;
  },

  async improveJD(currentJD, instruction) {
    const userPrompt = `Current job description:\n${JSON.stringify(currentJD, null, 2)}\n\nRecruiter instruction:\n"""\n${instruction}\n"""`;
    return callStructured(IMPROVE_SYSTEM_PROMPT, userPrompt, jdJsonSchema, (raw) => JDGenerationSchema.parse(raw)) as Promise<JDGeneration>;
  },

  async evaluateCandidate(input) {
    const userPrompt = buildScreeningUserPrompt(input);
    return callStructured(SCREENING_SYSTEM_PROMPT, userPrompt, candidateEvaluationJsonSchema, (raw) =>
      CandidateEvaluationSchema.parse(raw)
    ) as Promise<CandidateEvaluation>;
  },

  async generateInterviewPlan(input) {
    const userPrompt = buildInterviewPlanUserPrompt(input);
    return callStructured(INTERVIEW_PLAN_SYSTEM_PROMPT, userPrompt, interviewPlanJsonSchema, (raw) =>
      InterviewPlanSchema.parse(raw)
    ) as Promise<InterviewPlan>;
  },

  async generateQuestion(input) {
    const userPrompt = buildQuestionUserPrompt(input);
    return callStructured(QUESTION_SYSTEM_PROMPT, userPrompt, interviewQuestionJsonSchema, (raw) =>
      InterviewQuestionGenerationSchema.parse(raw)
    ) as Promise<InterviewQuestionGeneration>;
  },

  async evaluateAnswer(input) {
    const userPrompt = buildAnswerEvaluationUserPrompt(input);
    return callStructured(ANSWER_EVALUATION_SYSTEM_PROMPT, userPrompt, answerEvaluationJsonSchema, (raw) =>
      AnswerEvaluationSchema.parse(raw)
    ) as Promise<AnswerEvaluation>;
  },

  async generateFollowUp(input) {
    const userPrompt = buildFollowUpUserPrompt(input);
    return callStructured(FOLLOWUP_SYSTEM_PROMPT, userPrompt, followUpDecisionJsonSchema, (raw) =>
      FollowUpDecisionSchema.parse(raw)
    ) as Promise<FollowUpDecision>;
  },

  async evaluateInterview(input) {
    const userPrompt = buildInterviewEvaluationUserPrompt(input);
    return callStructured(INTERVIEW_EVALUATION_SYSTEM_PROMPT, userPrompt, interviewEvaluationJsonSchema, (raw) =>
      InterviewEvaluationSchema.parse(raw)
    ) as Promise<InterviewEvaluation>;
  },

  async generateAssessment(input) {
    const userPrompt = buildAssessmentGenerationUserPrompt(input);
    return callStructured(ASSESSMENT_GENERATION_SYSTEM_PROMPT, userPrompt, assessmentGenerationJsonSchema, (raw) =>
      AssessmentGenerationSchema.parse(raw)
    ) as Promise<AssessmentGeneration>;
  },

  async improveAssessment(input) {
    const userPrompt = buildImproveAssessmentUserPrompt(input);
    return callStructured(IMPROVE_ASSESSMENT_SYSTEM_PROMPT, userPrompt, assessmentGenerationJsonSchema, (raw) =>
      AssessmentGenerationSchema.parse(raw)
    ) as Promise<AssessmentGeneration>;
  },

  async evaluateAssessmentAnswer(input) {
    const userPrompt = buildAssessmentQuestionEvaluationUserPrompt(input);
    return callStructured(ASSESSMENT_QUESTION_EVALUATION_SYSTEM_PROMPT, userPrompt, assessmentQuestionEvaluationJsonSchema, (raw) =>
      AssessmentQuestionEvaluationResultSchema.parse(raw)
    ) as Promise<AssessmentQuestionEvaluationResult>;
  },

  async reviewOpenEndedSubmission(input) {
    const userPrompt = buildOpenEndedReviewUserPrompt(input);
    return callStructured(OPEN_ENDED_REVIEW_SYSTEM_PROMPT, userPrompt, openEndedReviewJsonSchema, (raw) =>
      OpenEndedReviewSchema.parse(raw)
    ) as Promise<OpenEndedReview>;
  },

  async evaluateWorkdayTask(input) {
    const userPrompt = buildWorkdayTaskEvaluationUserPrompt(input);
    return callStructured(WORKDAY_TASK_EVALUATION_SYSTEM_PROMPT, userPrompt, workdayTaskEvaluationJsonSchema, (raw) =>
      WorkdayTaskEvaluationSchema.parse(raw)
    ) as Promise<WorkdayTaskEvaluation>;
  },

  async extractCandidateFromResume(resumeText) {
    const userPrompt = `Resume text:\n"""\n${resumeText}\n"""`;
    return callStructured(RESUME_CANDIDATE_EXTRACTION_SYSTEM_PROMPT, userPrompt, resumeCandidateExtractionJsonSchema, (raw) =>
      ResumeCandidateExtractionSchema.parse(raw)
    ) as Promise<ResumeCandidateExtraction>;
  },
};
