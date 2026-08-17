import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginForm next={next} />
    </div>
  );
}
