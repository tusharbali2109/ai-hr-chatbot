import { getAuthedCompanyId } from "@/lib/services/jd";
import { listConnections } from "@/lib/services/jobboards";
import { listPlatforms, checkConnection } from "@/lib/jobboards/registry";
import { listInterviewersForCompany, listCalendarConnectionSummariesForCompany, listAutomationRulesForCompany } from "@/lib/services/scheduling";
import { IntegrationsPanel, type IntegrationCardData } from "./IntegrationsPanel";
import { InterviewersPanel } from "./InterviewersPanel";
import { AutomationRulesPanel } from "./AutomationRulesPanel";

export default async function SettingsPage() {
  const { companyId } = await getAuthedCompanyId();
  const [platforms, connections, interviewers, calendarConnections, automationRules] = await Promise.all([
    listPlatforms(),
    listConnections(),
    listInterviewersForCompany(),
    listCalendarConnectionSummariesForCompany(),
    listAutomationRulesForCompany(companyId),
  ]);
  const connectionByPlatform = new Map(connections.map((c) => [c.platform, c]));

  const integrations: IntegrationCardData[] = await Promise.all(
    platforms.map(async (listing) => {
      const stored = connectionByPlatform.get(listing.platform);
      if (!listing.available) {
        return {
          platform: listing.platform,
          available: false,
          connected: false,
          connectionError: null,
          capabilities: null,
          lastSyncAt: stored?.last_sync_at ?? null,
          lastError: stored?.last_error ?? null,
          connectedAt: stored?.connected_at ?? null,
        };
      }
      const result = await checkConnection(listing.platform, companyId);
      return {
        platform: listing.platform,
        available: true,
        connected: result.connected,
        connectionError: result.error ?? null,
        capabilities: listing.connector!.capabilities,
        lastSyncAt: stored?.last_sync_at ?? null,
        lastError: stored?.last_error ?? null,
        connectedAt: stored?.connected_at ?? null,
      };
    })
  );

  const connectedCalendarCount = calendarConnections.filter((c) => c.status === "connected").length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Integrations, interviewers, and automation for this company.</p>
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Job Board Integrations</h2>
        <IntegrationsPanel integrations={integrations} googleCalendar={{ connectedCount: connectedCalendarCount, total: interviewers.length }} />
      </div>

      <div className="mb-6">
        <InterviewersPanel interviewers={interviewers} connections={calendarConnections} />
      </div>

      <div>
        <AutomationRulesPanel rules={automationRules} />
      </div>
    </div>
  );
}
