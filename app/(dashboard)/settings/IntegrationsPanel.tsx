import { CheckCircle2, XCircle, AlertTriangle, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { JobBoardCapabilities } from "@/lib/jobboards/connector";

const PLATFORM_LABEL: Record<string, string> = {
  mock: "Mock Job Board",
  linkedin: "LinkedIn",
  naukri: "Naukri",
  indeed: "Indeed",
};

export interface IntegrationCardData {
  platform: string;
  connected: boolean;
  available: boolean;
  connectionError: string | null;
  capabilities: JobBoardCapabilities | null;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
}

const CAPABILITY_LABEL: Record<keyof JobBoardCapabilities, string> = {
  canCreateJob: "Create job",
  canUpdateJob: "Update job",
  canCloseJob: "Close job",
  canFetchApplications: "Fetch applications",
  canReceiveWebhooks: "Receive webhooks",
};

export function IntegrationsPanel({
  integrations,
  googleCalendar,
}: {
  integrations: IntegrationCardData[];
  googleCalendar?: { connectedCount: number; total: number };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {googleCalendar && <GoogleCalendarSummaryCard connectedCount={googleCalendar.connectedCount} total={googleCalendar.total} />}
      {integrations.map((integration) => (
        <IntegrationCard key={integration.platform} integration={integration} />
      ))}
    </div>
  );
}

/**
 * Google Calendar is connected per-interviewer (see lib/actions/interviewers.ts
 * startCalendarConnectAction), not once for the whole company — this card is
 * a status summary linking to the Interviewers section below, where the
 * actual per-interviewer connect action lives.
 */
function GoogleCalendarSummaryCard({ connectedCount, total }: { connectedCount: number; total: number }) {
  const allConnected = total > 0 && connectedCount === total;
  const tone = total === 0 ? "neutral" : allConnected ? "success" : connectedCount > 0 ? "warning" : "danger";
  const StatusIcon = total === 0 ? AlertTriangle : allConnected ? CheckCircle2 : connectedCount > 0 ? AlertTriangle : XCircle;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4" />
          Google Calendar
        </h3>
        <Badge tone={tone}>
          <StatusIcon className="h-3 w-3" />
          {total === 0 ? "No interviewers" : `${connectedCount} of ${total} connected`}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Each interviewer connects their own Google account so their real calendar availability is used when scheduling. Manage
        connections in the Interviewers section below.
      </p>
    </div>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationCardData }) {
  const isMock = integration.platform === "mock";
  const statusTone = !integration.available ? "neutral" : integration.connected ? "success" : "danger";
  const statusLabel = !integration.available ? "Unavailable" : integration.connected ? "Connected" : "Error";
  const StatusIcon = !integration.available ? AlertTriangle : integration.connected ? CheckCircle2 : XCircle;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 transition-colors duration-[var(--duration-fast)] hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{PLATFORM_LABEL[integration.platform] ?? integration.platform}</h3>
        <Badge tone={statusTone}>
          <StatusIcon className="h-3 w-3" />
          {statusLabel}
        </Badge>
      </div>

      {isMock && (
        <div className="rounded-[var(--radius-md)] border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
          MOCK / DEVELOPMENT ONLY — simulates a job board for local testing. Never presented as a real
          production integration; no live traffic ever leaves this app for this connector.
        </div>
      )}

      {!integration.available && (
        <p className="text-sm text-muted-foreground">
          Not available in this environment — no official API credentials or documentation are configured
          for this platform yet.
        </p>
      )}

      {integration.connectionError && integration.available && (
        <p className="text-sm text-danger">{integration.connectionError}</p>
      )}

      {integration.capabilities && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Capabilities</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(integration.capabilities) as (keyof JobBoardCapabilities)[])
              .filter((cap) => integration.capabilities![cap])
              .map((cap) => (
                <Badge key={cap} tone="info">
                  {CAPABILITY_LABEL[cap]}
                </Badge>
              ))}
          </div>
        </div>
      )}

      <dl className="mt-auto flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <dt>Last sync</dt>
          <dd>{integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : "Never"}</dd>
        </div>
        {integration.lastError && (
          <div className="flex justify-between gap-2">
            <dt>Last error</dt>
            <dd className="text-right text-danger">{integration.lastError}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
