import type { JobBoardCapabilities, JobBoardConnector, ConnectionCheckResult } from "@/lib/jobboards/connector";
import { mockJobBoardConnector } from "@/lib/jobboards/connectors/mock";

/**
 * Every usable connector is registered here. To add a real platform (e.g.
 * LinkedIn, Naukri, Indeed) once official API credentials/docs are
 * available: implement JobBoardConnector in lib/jobboards/connectors/<name>.ts
 * and add it to this map. Nothing else in the app (agent, services, actions,
 * UI) needs to change — they all go through getConnector()/registry below.
 */
const connectors: Record<string, JobBoardConnector> = {
  mock: mockJobBoardConnector,
};

/** Platforms the product intends to support eventually, even before a real
 * connector exists — shown in Settings so recruiters see the full roadmap,
 * distinct from "not connected" (which implies a connect flow exists). */
export const PLANNED_PLATFORMS = ["linkedin", "naukri", "indeed"] as const;

export interface PlatformListing {
  platform: string;
  available: boolean;
  connector: JobBoardConnector | null;
}

export function listPlatforms(): PlatformListing[] {
  const registered = Object.keys(connectors).map((platform) => ({
    platform,
    available: true,
    connector: connectors[platform],
  }));
  const planned = PLANNED_PLATFORMS.filter((p) => !connectors[p]).map((platform) => ({
    platform,
    available: false,
    connector: null,
  }));
  return [...registered, ...planned];
}

export function getConnector(platform: string): JobBoardConnector | null {
  return connectors[platform.toLowerCase()] ?? null;
}

export function checkCapabilities(platform: string): JobBoardCapabilities | null {
  return getConnector(platform)?.capabilities ?? null;
}

export async function checkConnection(platform: string, companyId: string): Promise<ConnectionCheckResult> {
  const connector = getConnector(platform);
  if (!connector) {
    return { connected: false, error: "Integration not configured: no connector registered for this platform." };
  }
  return connector.checkConnection(companyId);
}
