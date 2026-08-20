export default function NoVideoInterviewPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">No interview found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We couldn&apos;t find an AI video interview linked to this email address. If you were told to expect one, check that you
          signed in with the same email you applied with, or contact the recruiter who invited you.
        </p>
      </div>
    </div>
  );
}
