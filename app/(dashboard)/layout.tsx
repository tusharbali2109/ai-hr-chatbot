import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("name, email, company:companies(name)")
    .eq("id", user.id)
    .maybeSingle();

  const userName = profile?.name ?? user.email?.split("@")[0] ?? "User";
  const userEmail = profile?.email ?? user.email ?? "";
  const companyName =
    (profile?.company as unknown as { name: string } | null)?.name ?? "Your Company";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={userName} userEmail={userEmail} companyName={companyName} />
        {/* pb-24 clears the fixed mobile bottom nav (~64px) + safe-area inset so content is never hidden underneath it. */}
        <main className="flex-1 overflow-y-auto scrollbar-thin pb-24 md:pb-0">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
