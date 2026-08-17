import type { EmploymentType, JobStatus, ApplicationSource } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";

export interface JobFixture {
  title: string;
  description: string;
  status: JobStatus;
  location: string;
  employment_type: EmploymentType;
  experience_min: number;
  experience_max: number;
}

export const JOB_FIXTURES: JobFixture[] = [
  {
    title: "Senior Frontend Engineer",
    description:
      "Own the candidate-facing product surface — build fast, accessible React/TypeScript interfaces and help define our design system.",
    status: "open",
    location: "Bengaluru, India (Hybrid)",
    employment_type: "full_time",
    experience_min: 4,
    experience_max: 8,
  },
  {
    title: "Backend Engineer — Node.js",
    description:
      "Design and scale the services powering our applications and stage pipeline, with a focus on data integrity and API performance.",
    status: "open",
    location: "Remote (India)",
    employment_type: "full_time",
    experience_min: 3,
    experience_max: 7,
  },
  {
    title: "AI/ML Engineer",
    description:
      "Build and evaluate the models behind resume screening, interview scoring, and candidate matching.",
    status: "open",
    location: "Bengaluru, India",
    employment_type: "full_time",
    experience_min: 2,
    experience_max: 6,
  },
  {
    title: "Product Designer — UI/UX",
    description:
      "Shape the end-to-end recruiter and candidate experience, from research through polished, production-ready UI.",
    status: "open",
    location: "Pune, India (Hybrid)",
    employment_type: "full_time",
    experience_min: 3,
    experience_max: 6,
  },
  {
    title: "DevOps Engineer",
    description:
      "Own CI/CD, infrastructure-as-code, and observability for a fast-moving product team shipping weekly.",
    status: "open",
    location: "Remote (India)",
    employment_type: "full_time",
    experience_min: 4,
    experience_max: 9,
  },
  {
    title: "Data Analyst",
    description:
      "Turn recruitment funnel data into insight — build dashboards and analyses that guide hiring decisions.",
    status: "paused",
    location: "Gurugram, India",
    employment_type: "full_time",
    experience_min: 1,
    experience_max: 4,
  },
  {
    title: "Customer Success Manager",
    description:
      "Be the primary relationship owner for our enterprise recruiting customers, driving adoption and renewal.",
    status: "open",
    location: "Mumbai, India (Hybrid)",
    employment_type: "full_time",
    experience_min: 3,
    experience_max: 7,
  },
  {
    title: "Mobile Engineer — iOS",
    description:
      "Build and ship the iOS companion app recruiters use to review candidates and conduct interviews on the go.",
    status: "draft",
    location: "Remote (India)",
    employment_type: "contract",
    experience_min: 3,
    experience_max: 6,
  },
];

export interface CandidateFixture {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  portfolio_url: string | null;
  skills: string[];
  experienceYears: number;
}

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Diya", "Ananya", "Kabir", "Ishaan", "Meera", "Rohan",
  "Priya", "Arjun", "Sanya", "Vikram", "Neha", "Karan", "Tanvi", "Aditya",
  "Riya", "Siddharth", "Pooja", "Nikhil", "Kavya", "Rahul", "Simran", "Aman",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Iyer", "Nair", "Reddy", "Gupta", "Mehta", "Kapoor",
  "Joshi", "Chawla", "Menon", "Rao", "Bhatt", "Kulkarni", "Chatterjee", "Desai",
  "Malhotra", "Bose", "Sen", "Pillai", "Agarwal", "Chopra", "Das", "Rane",
];
const CITIES = [
  "Bengaluru", "Pune", "Hyderabad", "Mumbai", "Gurugram", "Chennai", "Noida", "Kolkata",
];
const SKILL_POOLS: Record<string, string[]> = {
  frontend: ["React", "TypeScript", "Next.js", "Tailwind CSS", "Redux", "Vite"],
  backend: ["Node.js", "PostgreSQL", "Express", "GraphQL", "Redis", "Docker"],
  ml: ["Python", "PyTorch", "scikit-learn", "LangChain", "Pandas", "MLOps"],
  design: ["Figma", "Design Systems", "User Research", "Prototyping", "Accessibility"],
  devops: ["Kubernetes", "Terraform", "AWS", "CI/CD", "Prometheus", "Ansible"],
  data: ["SQL", "Looker", "Python", "dbt", "A/B Testing", "Excel"],
  success: ["Account Management", "Onboarding", "Salesforce", "Stakeholder Comms"],
  mobile: ["Swift", "SwiftUI", "Combine", "Xcode", "REST APIs"],
};

const SKILL_GROUPS = Object.values(SKILL_POOLS);

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function pickSkills(seed: number): string[] {
  const pool = pick(SKILL_GROUPS, seed);
  const count = 3 + (seed % 3);
  return Array.from(new Set(Array.from({ length: count }, (_, i) => pool[(seed + i) % pool.length])));
}

export const CANDIDATE_FIXTURES: CandidateFixture[] = Array.from({ length: 26 }, (_, i) => {
  const first = pick(FIRST_NAMES, i);
  const last = pick(LAST_NAMES, i * 3 + 1);
  const city = pick(CITIES, i * 5 + 2);
  const name = `${first} ${last}`;
  const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`;

  return {
    name,
    email,
    phone: `+91 9${(800000000 + i * 37129).toString().slice(0, 9)}`,
    location: `${city}, India`,
    linkedin_url: `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${i}`,
    portfolio_url: i % 3 === 0 ? `https://${first.toLowerCase()}${last.toLowerCase()}.dev` : null,
    skills: pickSkills(i),
    experienceYears: 1 + (i % 9),
  };
});

export const SOURCES: ApplicationSource[] = ["career_site", "linkedin", "referral", "job_board", "agency"];

export const STAGE_DISTRIBUTION: RecruitmentStage[] = [
  "APPLIED",
  "APPLIED",
  "AI_SCREENING",
  "AI_SCREENING",
  "SHORTLISTED",
  "SKILL_VERIFICATION",
  "AI_INTERVIEW",
  "AI_INTERVIEW",
  "INTERVIEW_SHORTLISTED",
  "ASSESSMENT_SENT",
  "ASSESSMENT_SUBMITTED",
  "ASSESSMENT_EVALUATED",
  "FINAL_SHORTLISTED",
  "INTERVIEW_SCHEDULED",
  "FINAL_INTERVIEW",
  "SELECTED",
  "REJECTED",
];
