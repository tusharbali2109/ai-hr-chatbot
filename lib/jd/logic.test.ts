import { describe, it, expect } from "vitest";
import {
  buildUnderstandingFields,
  validateJdForApproval,
  diffCriticalFields,
  isJobOwnedByCompany,
  computeNextVersionNumber,
  mapEmploymentType,
  mapWorkMode,
  isRequirementTextValid,
  NOT_SPECIFIED,
} from "@/lib/jd/logic";
import type { RequirementExtraction, JDGeneration } from "@/lib/ai/schemas";

function requirement(overrides: Partial<RequirementExtraction> = {}): RequirementExtraction {
  return {
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
    ...overrides,
  };
}

function jd(overrides: Partial<JDGeneration> = {}): JDGeneration {
  return {
    title: "Senior Python Backend Engineer",
    description: "About the role...",
    responsibilities: ["Build APIs", "Own the backend"],
    required_skills: ["Python", "FastAPI", "AWS"],
    preferred_skills: ["AI", "LLM"],
    education: NOT_SPECIFIED,
    screening_criteria: {
      mandatory: [
        { skill: "Python", importance: 10 },
        { skill: "FastAPI", importance: 9 },
        { skill: "AWS", importance: 8 },
      ],
      preferred: [{ skill: "LLM", importance: 6 }],
      experience: { min_years: 4, max_years: 7 },
    },
    ...overrides,
  };
}

describe("isRequirementTextValid", () => {
  it("rejects empty and whitespace-only requirements", () => {
    expect(isRequirementTextValid("")).toBe(false);
    expect(isRequirementTextValid("   \n\t")).toBe(false);
  });

  it("accepts non-empty requirements", () => {
    expect(isRequirementTextValid("Need a backend engineer")).toBe(true);
  });
});

describe("buildUnderstandingFields", () => {
  it("marks provided fields as clear and missing fields as not specified", () => {
    const fields = buildUnderstandingFields(requirement());
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f]));

    expect(byLabel.Role.clear).toBe(true);
    expect(byLabel.Experience.value).toBe("4–7 years");
    expect(byLabel.Location.clear).toBe(false);
    expect(byLabel.Location.value).toBe(NOT_SPECIFIED);
  });

  it("does not invent missing information (point 15)", () => {
    const vague = requirement({
      role: "",
      experience_min: null,
      experience_max: null,
      mandatory_skills: [],
      location: NOT_SPECIFIED,
    });
    const fields = buildUnderstandingFields(vague);
    const role = fields.find((f) => f.label === "Role")!;
    expect(role.value).toBe(NOT_SPECIFIED);
    expect(role.clear).toBe(false);
  });
});

describe("validateJdForApproval", () => {
  it("passes for a complete JD", () => {
    const result = validateJdForApproval({ ...jd(), companyId: "company-1" });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when title is missing", () => {
    const result = validateJdForApproval({ ...jd({ title: "" }), companyId: "company-1" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Job title is required.");
  });

  it("fails when there are no responsibilities", () => {
    const result = validateJdForApproval({ ...jd({ responsibilities: [] }), companyId: "company-1" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least one responsibility is required.");
  });

  it("fails when the job has no associated company (authorization gate)", () => {
    const result = validateJdForApproval({ ...jd(), companyId: null });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("This job is not associated with a company.");
  });

  it("accumulates multiple errors at once", () => {
    const result = validateJdForApproval({
      title: "",
      description: "",
      responsibilities: [],
      required_skills: [],
      preferred_skills: [],
      companyId: null,
    });
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe("diffCriticalFields", () => {
  it("reports no critical changes when experience and mandatory skills match", () => {
    const diff = diffCriticalFields(jd(), jd());
    expect(diff.hasCriticalChanges).toBe(false);
  });

  it("flags an experience range change", () => {
    const next = jd({
      screening_criteria: {
        ...jd().screening_criteria,
        experience: { min_years: 2, max_years: 5 },
      },
    });
    const diff = diffCriticalFields(jd(), next);
    expect(diff.experienceChanged).toBe(true);
    expect(diff.hasCriticalChanges).toBe(true);
  });

  it("flags added and removed mandatory skills without touching unrelated ones", () => {
    const next = jd({
      screening_criteria: {
        ...jd().screening_criteria,
        mandatory: [
          { skill: "Python", importance: 10 },
          { skill: "Docker", importance: 7 },
        ],
      },
    });
    const diff = diffCriticalFields(jd(), next);
    expect(diff.mandatorySkillsAdded).toEqual(["Docker"]);
    expect(diff.mandatorySkillsRemoved.sort()).toEqual(["AWS", "FastAPI"].sort());
    expect(diff.hasCriticalChanges).toBe(true);
  });
});

describe("isJobOwnedByCompany (authorization)", () => {
  it("allows access when company ids match", () => {
    expect(isJobOwnedByCompany("company-1", "company-1")).toBe(true);
  });

  it("denies access across different companies", () => {
    expect(isJobOwnedByCompany("company-1", "company-2")).toBe(false);
  });

  it("denies access when the job has no company", () => {
    expect(isJobOwnedByCompany(null, "company-1")).toBe(false);
    expect(isJobOwnedByCompany(undefined, "company-1")).toBe(false);
  });
});

describe("computeNextVersionNumber", () => {
  it("starts at 1 when there is no prior version", () => {
    expect(computeNextVersionNumber(null)).toBe(1);
    expect(computeNextVersionNumber(undefined)).toBe(1);
  });

  it("increments from the latest version — repeated saves never collide", () => {
    let version = computeNextVersionNumber(null);
    version = computeNextVersionNumber(version);
    version = computeNextVersionNumber(version);
    expect(version).toBe(3);
  });
});

describe("mapEmploymentType", () => {
  it("normalizes known variants", () => {
    expect(mapEmploymentType("Full-time")).toBe("full_time");
    expect(mapEmploymentType("full time")).toBe("full_time");
    expect(mapEmploymentType("Contract")).toBe("contract");
  });

  it("falls back to full_time for unrecognized input rather than inventing a value", () => {
    expect(mapEmploymentType("Not specified")).toBe("full_time");
    expect(mapEmploymentType("")).toBe("full_time");
  });
});

describe("mapWorkMode", () => {
  it("normalizes known variants", () => {
    expect(mapWorkMode("Remote")).toBe("remote");
    expect(mapWorkMode("HYBRID")).toBe("hybrid");
  });

  it("returns null for not-specified rather than guessing", () => {
    expect(mapWorkMode("Not specified")).toBeNull();
    expect(mapWorkMode("")).toBeNull();
  });
});
