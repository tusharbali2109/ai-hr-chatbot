import { listApplications } from "@/lib/services/applications";
import { ApplicationsTable } from "./ApplicationsTable";

export default async function ApplicationsPage() {
  const applications = await listApplications();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">{applications.length} applications. Update a stage to record it in history.</p>
      </div>

      <ApplicationsTable applications={applications} />
    </div>
  );
}
