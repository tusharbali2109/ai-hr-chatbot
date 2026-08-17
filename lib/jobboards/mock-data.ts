import type { RawApplicantPayload } from "@/lib/ingestion/logic";

/**
 * Deterministic fake applicant fixtures for MockJobBoardConnector.getApplications,
 * so pagination/sync behavior is real and repeatable in tests — only the data
 * source is fake, the mechanism (cursor paging, per-page slicing) is not.
 */
export const MOCK_APPLICANTS: RawApplicantPayload[] = [
  {
    external_application_id: "mock-app-1",
    first_name: "Asha",
    last_name: "Verma",
    email: "asha.verma@example.com",
    phone: "+91 98765 43210",
    location: "Bengaluru",
    resume_url: "https://mock-jobboard.local/resumes/asha-verma.pdf",
  },
  {
    external_application_id: "mock-app-2",
    name: "Rahul Sharma",
    email_address: "rahul.sharma@example.com",
    mobile: "9123456780",
    location: "Pune",
    cv_url: "https://mock-jobboard.local/resumes/rahul-sharma.pdf",
    linkedin_url: "https://linkedin.com/in/rahul-sharma-mock",
  },
  {
    external_application_id: "mock-app-3",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    phone: "9988776655",
    location: "Remote",
    resumeUrl: "https://mock-jobboard.local/resumes/priya-nair.pdf",
  },
  {
    external_application_id: "mock-app-4",
    first_name: "Vikram",
    last_name: "Rao",
    email: "vikram.rao@example.com",
    location: "Hyderabad",
    cv_url: "https://mock-jobboard.local/resumes/vikram-rao.pdf",
  },
  {
    external_application_id: "mock-app-5",
    name: "Sana Sheikh",
    email: "sana.sheikh@example.com",
    phone: "9012345678",
    location: "Mumbai",
    portfolio_url: "https://sanasheikh.dev",
  },
];

export const MOCK_PAGE_SIZE = 2;

export interface MockPage {
  applications: RawApplicantPayload[];
  nextCursor: string | null;
}

/** cursor is the string index to resume from; null/undefined starts at 0. */
export function paginateMockApplicants(cursor: string | null | undefined): MockPage {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
  const page = MOCK_APPLICANTS.slice(safeStart, safeStart + MOCK_PAGE_SIZE);
  const nextIndex = safeStart + MOCK_PAGE_SIZE;
  return {
    applications: page,
    nextCursor: nextIndex < MOCK_APPLICANTS.length ? String(nextIndex) : null,
  };
}
