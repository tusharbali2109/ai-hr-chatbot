export default function AssessmentExpiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deadline passed</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The deadline for this assessment has passed. If you believe this is a mistake, contact the recruiter who invited you.
        </p>
      </div>
    </div>
  );
}
