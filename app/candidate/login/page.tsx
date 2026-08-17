import { CandidateLoginForm } from "./CandidateLoginForm";

export default async function CandidateLoginPage({ searchParams }: PageProps<"/candidate/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/candidate/assessment";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <CandidateLoginForm next={next} />
    </div>
  );
}
