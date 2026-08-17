import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  FileText,
  Bot,
  Sparkles,
  ClipboardCheck,
  MessagesSquare,
  Calendar,
  Settings,
  Send,
  CircleHelp,
  BriefcaseBusiness,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Candidates", href: "/candidates", icon: Users },
  { label: "Applications", href: "/applications", icon: FileText },
  { label: "AI Interview", href: "/ai-interview", icon: Sparkles },
  { label: "AI Agents", href: "/ai-agents", icon: Bot },
  { label: "Assessments", href: "/assessments", icon: ClipboardCheck },
  { label: "Digital Workday", href: "/workday", icon: BriefcaseBusiness },
  { label: "Communications", href: "/communications", icon: Send },
  { label: "Interviews", href: "/interviews", icon: MessagesSquare },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "How to Run", href: "/instructions", icon: CircleHelp },
];
