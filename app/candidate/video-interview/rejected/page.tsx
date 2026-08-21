import { AlertTriangle } from "lucide-react";

export default function VideoInterviewRejectedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Interview ended</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your AI video interview was ended early after multiple proctoring warnings (leaving the interview tab, pasted text, or not staying
          visible on camera). Your application has been marked accordingly. If you believe this was a mistake, please contact the recruiting
          team directly.
        </p>
      </div>
    </div>
  );
}
