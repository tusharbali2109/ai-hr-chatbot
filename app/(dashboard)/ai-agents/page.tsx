import {
  FileEdit,
  Send,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  ClipboardList,
  BarChart3,
  Mail,
  CalendarClock,
} from "lucide-react";
import { AgentCard, type AgentStatus } from "@/components/recruitment/AgentCard";
import { getScreeningAgentSummary } from "@/lib/services/agent-runs";
import { getInterviewAgentSummary } from "@/lib/services/interviews";

interface AgentDefinition {
  name: string;
  description: string;
  icon: typeof FileEdit;
  status: AgentStatus;
  lastActivity: string;
  href?: string;
}

const STATIC_AGENTS: AgentDefinition[] = [
  {
    name: "JD Maker",
    description: "Chat with the JD agent to put together a job description, step by step.",
    icon: FileEdit,
    status: "Idle",
    lastActivity: "Not yet run",
    href: "/ai-agents/jd-maker",
  },
  { name: "Job Posting Agent", description: "Publishes open roles to job boards and career sites.", icon: Send, status: "Idle", lastActivity: "Not yet run" },
  { name: "Skill Verification Agent", description: "Verifies candidate-claimed skills before interview.", icon: ShieldCheck, status: "Idle", lastActivity: "Not yet run" },
  { name: "AI Interview Agent", description: "Conducts structured AI voice/chat interviews.", icon: Sparkles, status: "Idle", lastActivity: "Not yet run" },
  { name: "Assessment Agent", description: "Sends and collects skills assessments.", icon: ClipboardList, status: "Idle", lastActivity: "Not yet run" },
  { name: "Assessment Evaluation Agent", description: "Scores submitted assessments automatically.", icon: BarChart3, status: "Idle", lastActivity: "Not yet run" },
  { name: "Email Agent", description: "Sends selection, rejection, and status update emails.", icon: Mail, status: "Idle", lastActivity: "Not yet run" },
  { name: "Scheduling Agent", description: "Coordinates final interviews via Google Calendar.", icon: CalendarClock, status: "Idle", lastActivity: "Not yet run" },
];

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function AiAgentsPage() {
  const [screeningSummary, interviewSummary] = await Promise.all([getScreeningAgentSummary(), getInterviewAgentSummary()]);

  const screeningAgent: AgentDefinition = {
    name: "Screening Agent",
    description: "Screens incoming resumes against job requirements.",
    icon: ScanSearch,
    status: !screeningSummary.lastRun
      ? "Idle"
      : screeningSummary.lastRun.status === "RUNNING"
        ? "Running"
        : screeningSummary.lastRun.status === "FAILED"
          ? "Failed"
          : screeningSummary.lastRun.status === "NEEDS_REVIEW"
            ? "Needs Review"
            : "Completed",
    lastActivity: screeningSummary.lastRun
      ? `${relativeTime(screeningSummary.lastRun.completed_at ?? screeningSummary.lastRun.created_at)} · ${screeningSummary.runsLast24h} run(s) in last 24h`
      : "Not yet run",
  };

  const interviewAgent: AgentDefinition = {
    name: "AI Interview Agent",
    description: "Conducts structured AI voice interviews for shortlisted candidates.",
    icon: Sparkles,
    status: !interviewSummary.lastInterview
      ? "Idle"
      : ["QUEUED", "DIALING", "IN_PROGRESS"].includes(interviewSummary.lastInterview.status)
        ? "Running"
        : ["CALL_FAILED", "NETWORK_ERROR", "PROVIDER_ERROR"].includes(interviewSummary.lastInterview.status)
          ? "Failed"
          : interviewSummary.lastInterview.status === "NEEDS_REVIEW"
            ? "Needs Review"
            : "Completed",
    lastActivity: interviewSummary.lastInterview
      ? `${relativeTime(interviewSummary.lastInterview.ended_at ?? interviewSummary.lastInterview.created_at)} · ${interviewSummary.interviewsLast24h} call(s) in last 24h`
      : "Not yet run",
  };

  const excludedNames = new Set(["JD Maker", "Job Posting Agent", "Skill Verification Agent", "AI Interview Agent"]);
  const agents: AgentDefinition[] = [
    STATIC_AGENTS.find((a) => a.name === "JD Maker")!,
    STATIC_AGENTS.find((a) => a.name === "Job Posting Agent")!,
    screeningAgent,
    STATIC_AGENTS.find((a) => a.name === "Skill Verification Agent")!,
    interviewAgent,
    ...STATIC_AGENTS.filter((a) => !excludedNames.has(a.name)),
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Specialized agents powering the Phase 1–8 hiring pipeline. Runtime-backed agents show live activity;
          provider-backed agents remain idle until their corresponding workflow is run.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.name} {...agent} />
        ))}
      </div>
    </div>
  );
}
