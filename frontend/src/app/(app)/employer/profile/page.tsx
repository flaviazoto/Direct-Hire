"use client";
// src/app/(app)/employer/profile/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authApi, userApi } from "@/lib/api-client";
import {
  LoadingPage, PageHeader, Card, CardHeader, CardContent, CardFooter,
  Button, Input, Textarea, SelectInput, Tag, Badge,
  ToastDisplay, type ToastData,
} from "@/components/ui";

interface ProfileData {
  user:    { email: string; status: string };
  profile: {
    companyName?: string; contactPersonName?: string; industry?: string;
    companySize?: string; website?: string; country?: string; city?: string;
    businessDescription?: string; subscriptionPlan?: string; isVerified?: boolean;
    hiringCountries?: { country: string }[];
    requiredSkills?:  { skill: string }[];
  } | null;
}

const INDUSTRY_OPTIONS = [
  { value: "Technology",     label: "Technology" },
  { value: "Healthcare",     label: "Healthcare" },
  { value: "Construction",   label: "Construction" },
  { value: "Hospitality",    label: "Hospitality" },
  { value: "Manufacturing",  label: "Manufacturing" },
  { value: "Retail",         label: "Retail" },
  { value: "Finance",        label: "Finance" },
  { value: "Education",      label: "Education" },
  { value: "Agriculture",    label: "Agriculture" },
  { value: "Transportation", label: "Transportation" },
  { value: "Other",          label: "Other" },
];

const SIZE_OPTIONS = [
  { value: "1-10",     label: "1–10 employees" },
  { value: "11-50",    label: "11–50 employees" },
  { value: "51-200",   label: "51–200 employees" },
  { value: "201-1000", label: "201–1,000 employees" },
  { value: "1000+",    label: "1,000+ employees" },
];

export default function EmployerProfilePage() {
  const router = useRouter();
  const [data, setData]                   = useState<ProfileData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState<ToastData>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null);
  const [form, setForm]       = useState({
    companyName: "", contactPersonName: "", industry: "",
    companySize: "", website: "", country: "", city: "", businessDescription: "",
  });

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    userApi.getProfile().then(res => {
      if (!res.success) { router.push("/login"); return; }
      const d = res.data as ProfileData;
      setData(d);
      if (d.profile) {
        setForm({
          companyName:         d.profile.companyName ?? "",
          contactPersonName:   d.profile.contactPersonName ?? "",
          industry:            d.profile.industry ?? "",
          companySize:         d.profile.companySize ?? "",
          website:             d.profile.website ?? "",
          country:             d.profile.country ?? "",
          city:                d.profile.city ?? "",
          businessDescription: d.profile.businessDescription ?? "",
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await userApi.updateProfile(form);
    setSaving(false);
    if (res.success) {
      showToast("Profile updated successfully", "ok");
    } else {
      showToast(res.error ?? "Failed to save", "err");
    }
  };

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleDeleteAccount = useCallback(async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    const res = await authApi.deleteAccount();
    if (!res.success) {
      setDeleteError(res.error ?? "Failed to delete account");
      setDeleteLoading(false);
      return;
    }
    localStorage.removeItem("dh_token");
    localStorage.removeItem("dh_role");
    router.replace("/");
  }, [router]);

  if (loading) return <LoadingPage color="teal" />;
  if (!data)   return null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <ToastDisplay toast={toast} />
      <PageHeader
        title="Company Profile"
        description="Update your company details and hiring preferences"
        actions={
          <Button variant="teal" loading={saving} onClick={handleSave}>
            Save Changes
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Company Details */}
        <Card>
          <CardHeader title="Company Information" />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Company Name"   value={form.companyName}       onChange={e => set("companyName", e.target.value)}      placeholder="Acme Corp" />
              <Input label="Contact Person" value={form.contactPersonName} onChange={e => set("contactPersonName", e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectInput label="Industry"     value={form.industry}    onChange={e => set("industry", e.target.value)}    options={INDUSTRY_OPTIONS} placeholder="Select industry" />
              <SelectInput label="Company Size" value={form.companySize} onChange={e => set("companySize", e.target.value)} options={SIZE_OPTIONS}     placeholder="Select size" />
            </div>
            <Input label="Website" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://company.com" type="url" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Country" value={form.country} onChange={e => set("country", e.target.value)} placeholder="Germany" />
              <Input label="City"    value={form.city}    onChange={e => set("city", e.target.value)}    placeholder="Berlin" />
            </div>
            <Textarea label="Business Description" value={form.businessDescription} onChange={e => set("businessDescription", e.target.value)} rows={4} placeholder="Describe your company and what you do…" />
          </CardContent>
          <CardFooter>
            <div className="flex justify-end">
              <Button variant="teal" loading={saving} onClick={handleSave}>Save Changes</Button>
            </div>
          </CardFooter>
        </Card>

        {/* Account Status */}
        <Card>
          <CardHeader title="Account" />
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-600">Email</span>
              <span className="text-sm font-semibold text-slate-800">{data.user.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <span className="text-sm text-slate-600">Status</span>
              <Badge variant={data.user.status === "ACTIVE" ? "green" : "amber"}>
                {data.user.status.replace(/_/g, " ")}
              </Badge>
            </div>
            {data.profile?.subscriptionPlan && (
              <div className="flex items-center justify-between py-2 border-t border-slate-100">
                <span className="text-sm text-slate-600">Plan</span>
                <Badge variant="teal" className="capitalize">{data.profile.subscriptionPlan}</Badge>
              </div>
            )}
            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <span className="text-sm text-slate-600">Verified</span>
              <Badge variant={data.profile?.isVerified ? "green" : "slate"}>
                {data.profile?.isVerified ? "Verified" : "Pending"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Hiring Countries */}
        {data.profile?.hiringCountries && data.profile.hiringCountries.length > 0 && (
          <Card>
            <CardHeader title="Hiring Countries" />
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.profile.hiringCountries.map(c => (
                  <Tag key={c.country}>🌍 {c.country}</Tag>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Danger Zone */}
        <div style={{
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 12,
          padding: 20,
          background: "rgba(239,68,68,0.04)",
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>Danger Zone</p>
          <p style={{ fontSize: 12, color: "rgba(15,23,42,0.55)", marginBottom: 16 }}>
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
            Delete my account
          </Button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.7)", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: "#ffffff", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 16, padding: 32, maxWidth: 420, width: "100%",
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
              Delete account?
            </p>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
              All your company data, job posts, and applications will be permanently removed.
              This action <strong style={{ color: "#0f172a" }}>cannot be undone</strong>.
            </p>
            {deleteError && (
              <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 16 }}>{deleteError}</p>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm" onClick={() => { setShowDeleteModal(false); setDeleteError(null); }} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteAccount} disabled={deleteLoading}>
                {deleteLoading ? "Deleting…" : "Yes, delete my account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
