"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { authApi } from "@/lib/api-client";

type Role = "worker" | "employer" | "admin";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("dh_token") : null;
    if (!token) router.push("/login");
  }, [router]);

  const role: Role = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/employer")
      ? "employer"
      : "worker";

  if (pathname.includes("/onboarding")) return <>{children}</>;

  const handleLogout = () => {
    localStorage.removeItem("dh_token");
    localStorage.removeItem("dh_role");
    authApi.logout().catch(() => {});
    router.push("/login");
  };

  return (
    <div className="app-shell" style={{ minHeight: "100dvh", background: "var(--glass-base)" }}>
      <DashboardHeader role={role} onLogout={handleLogout} />
      <main
        className="app-main pt-14 lg:pt-0 lg:pl-64"
        style={{ minWidth: 0, minHeight: "100dvh", background: "var(--glass-base)", overflowX: "hidden" }}
      >
        <div key={pathname} data-page-root style={{ minWidth: 0, width: "100%" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
