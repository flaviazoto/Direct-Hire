"use client";
// src/app/(app)/admin/fraud/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api-client";
import {
  LoadingPage, PageHeader, Card, CardContent, Badge, Button, Avatar,
  StatCard, EmptyState, Input, Pagination, ToastDisplay, type ToastData,
} from "@/components/ui";

interface User {
  id: string;
  email: string;
  role: string;
  status: string;
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export default function AdminFraudPage() {
  const router = useRouter();
  const [users, setUsers]     = useState<User[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState("");
  const [acting, setActing]   = useState<string | null>(null);
  const [toast, setToast]     = useState<ToastData>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20", status: "SUSPENDED" };
    const res = await adminApi.getUsers(params);
    if (!res.success) { router.push("/login"); return; }
    const all = (res.data as unknown as User[]) ?? [];
    setUsers(search ? all.filter(u => u.email.toLowerCase().includes(search.toLowerCase())) : all);
    setTotal((res as unknown as { total: number }).total ?? 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleActivate = async (id: string) => {
    setActing(id);
    const res = await adminApi.activateUser(id);
    setActing(null);
    if (res.success) { showToast("User reinstated", "ok"); load(); }
    else showToast(res.error ?? "Failed", "err");
  };

  if (loading) return <LoadingPage color="amber" />;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ToastDisplay toast={toast} />
      <PageHeader
        title="Fraud & Risk Console"
        description="Review suspended accounts and risk signals"
      />

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Suspended Accounts" value={total}          icon="🚫" iconBg="#FEF2F2" valueColor="#DC2626" />
        <StatCard label="Risk Monitoring"     value="Active"        icon="🛡" iconBg="#FFF7ED" valueColor="#EA580C" />
        <StatCard label="Review Queue"        value={users.length}  icon="⚠" iconBg="#FFFBEB" valueColor="#D97706" />
      </div>

      <div className="mb-6 max-w-sm">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email…"
        />
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No suspended accounts"
          description="All accounts are in good standing."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["User", "Role", "Status", "Joined", "Actions"].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.email} size="sm" />
                        <div>
                          <div className="font-semibold text-slate-900 text-xs truncate max-w-[180px]">{u.email}</div>
                          <div className="text-[11px] font-mono text-slate-300">{u.id.slice(0,10)}…</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={u.role === "WORKER" ? "blue" : "teal"}>{u.role}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="red">{u.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-4">
                      <Button size="xs" variant="outline" loading={acting === u.id} onClick={() => handleActivate(u.id)}>
                        Reinstate
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} total={total} pageSize={20} onChange={setPage} className="mt-6" />
    </div>
  );
}
