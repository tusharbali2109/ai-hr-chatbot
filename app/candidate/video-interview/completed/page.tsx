export default function VideoInterviewCompletedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Interview complete</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Thanks for completing your AI video interview. The recruiting team will review your responses and follow up with next steps.
        </p>
      </div>
    </div>
  );
}
