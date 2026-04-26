"use client";
// src/app/(app)/worker/profile/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { userApi } from "@/lib/api-client";
import {
  LoadingPage, PageHeader, Card, CardHeader, CardContent, Badge,
  Button, Avatar, Tag, ProgressBar,
} from "@/components/ui";

interface ProfileData {
  user: { email: string; status: string; isEmailVerified: boolean };
  profile: {
    firstName?: string; lastName?: string; dateOfBirth?: string;
    nationality?: string; countryOfResidence?: string; city?: string;
    profession?: string; yearsExperience?: string; expectedSalary?: string;
    maritalStatus?: string; hasSpouse?: boolean; numberOfChildren?: number;
    additionalNotes?: string; trustScore?: number; riskScore?: number;
    isSearchable?: boolean;
    skills?: { skill: string }[];
    languages?: { language: string; proficiencyLevel: string }[];
    targetCountries?: { country: string }[];
  } | null;
  onboarding: { onboardingStatus: string; completedSteps: number[]; totalSteps: number } | null;
  verification: { reviewStatus: string } | null;
}

const Field = ({ label, value }: { label: string; value?: string | number | boolean | null }) =>
  value !== undefined && value !== null && value !== "" ? (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ fontSize: 12, color: "#555" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#e4e4e7", textAlign: "right" }}>{String(value)}</span>
    </div>
  ) : null;

export default function WorkerProfilePage() {
  const router = useRouter();
  const [data, setData]                   = useState<ProfileData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  useEffect(() => {
    userApi.getProfile().then(res => {
      if (res.success) setData(res.data as ProfileData);
      else router.push("/login");
      setLoading(false);
    });
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError((body as { message?: string }).message ?? "Failed to delete account");
        setDeleteLoading(false);
        return;
      }
      localStorage.removeItem("dh_token");
      localStorage.removeItem("dh_role");
      router.replace("/");
    } catch {
      setDeleteError("Network error. Please try again.");
      setDeleteLoading(false);
    }
  }, [router]);

  if (loading) return <LoadingPage color="blue" />;
  if (!data) return null;

  const { user, profile, onboarding, verification } = data;
  const firstName    = profile?.firstName ?? user.email.split("@")[0];
  const fullName     = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || user.email;
  const completionPct = onboarding
    ? Math.round((onboarding.completedSteps.length / onboarding.totalSteps) * 100)
    : 0;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        title="My Profile"
        actions={
          <Button variant="primary" size="md" onClick={() => router.push("/worker/onboarding")}>
            Edit Profile
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Hero card */}
          <div style={{
            background: "linear-gradient(135deg, #0d0d0d 0%, #111827 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: 24,
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Glow orb */}
            <div style={{
              position: "absolute",
              top: -50,
              right: -50,
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "rgba(0,144,255,0.08)",
              filter: "blur(60px)",
              pointerEvents: "none",
            }} />

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, position: "relative" }}>
              {/* Avatar with gradient ring */}
              <div style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0090FF, #7C3AED)",
                padding: 2,
                flexShrink: 0,
              }}>
                <div style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: "#1a1a1a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "white",
                }}>
                  {firstName[0]?.toUpperCase() ?? "?"}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: "white", fontSize: 18, lineHeight: 1.2 }}>{fullName}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{user.email}</div>
                {profile?.profession && (
                  <div style={{ fontSize: 12, color: "#0090FF", fontWeight: 600, marginTop: 4 }}>{profile.profession}</div>
                )}
              </div>

              {profile?.trustScore !== undefined && (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{
                    fontFamily: "'Courier New', monospace",
                    fontWeight: 800,
                    fontSize: 28,
                    color: "#0090FF",
                  }}>
                    {profile.trustScore}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>trust</div>
                </div>
              )}
            </div>

            {/* Searchable / hidden pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap", position: "relative" }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 20,
                background: profile?.isSearchable ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
                color: profile?.isSearchable ? "#4ade80" : "#555",
                border: profile?.isSearchable ? "1px solid rgba(34,197,94,0.2)" : "1px solid transparent",
                boxShadow: profile?.isSearchable ? "0 0 8px rgba(34,197,94,0.3)" : "none",
              }}>
                {profile?.isSearchable ? "🌐 Searchable" : "🔒 Hidden"}
              </span>
              {verification?.reviewStatus && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: "rgba(0,144,255,0.15)",
                  color: "#60a5fa",
                }}>
                  {verification.reviewStatus.replace(/_/g, " ")}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                <span>Profile completion</span>
                <span style={{ fontWeight: 700, color: "#0090FF" }}>{completionPct}%</span>
              </div>
              <ProgressBar value={completionPct} color="#0090FF" />
            </div>
          </div>

          {/* Continue onboarding CTA */}
          {completionPct < 100 && (
            <Link
              href="/worker/onboarding"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(135deg, rgba(0,144,255,0.15), rgba(124,58,237,0.15))",
                border: "1px solid rgba(0,144,255,0.2)",
                color: "white",
                borderRadius: 16,
                padding: "16px 20px",
                textDecoration: "none",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Continue Onboarding</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{completionPct}% complete — keep going!</div>
              </div>
              <span style={{ fontSize: 20, color: "#0090FF" }}>→</span>
            </Link>
          )}

          {/* Personal information */}
          {profile && (
            <Card>
              <CardHeader title="Personal Information" />
              <CardContent>
                <Field label="Full Name"      value={fullName} />
                <Field label="Date of Birth"  value={profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString("en-GB") : null} />
                <Field label="Nationality"    value={profile.nationality} />
                <Field label="Country"        value={profile.countryOfResidence} />
                <Field label="City"           value={profile.city} />
                <Field label="Marital Status" value={profile.maritalStatus} />
                <Field label="Children"       value={profile.numberOfChildren} />
              </CardContent>
            </Card>
          )}

          {/* Professional details */}
          {profile && (
            <Card>
              <CardHeader title="Professional Details" />
              <CardContent>
                <Field label="Profession"       value={profile.profession} />
                <Field label="Years Experience" value={profile.yearsExperience} />
                <Field label="Expected Salary"  value={profile.expectedSalary} />
                {profile.additionalNotes && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Notes</div>
                    <p style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.6 }}>{profile.additionalNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Skills */}
          {profile?.skills && profile.skills.length > 0 && (
            <Card>
              <CardHeader title={`Skills (${profile.skills.length})`} />
              <CardContent>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {profile.skills.map(s => (
                    <Tag key={s.skill} variant="blue">{s.skill}</Tag>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Languages */}
          {profile?.languages && profile.languages.length > 0 && (
            <Card>
              <CardHeader title={`Languages (${profile.languages.length})`} />
              <CardContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {profile.languages.map(l => (
                    <div
                      key={l.language}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{l.language}</span>
                      <Badge variant="slate">{l.proficiencyLevel}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Target countries */}
          {profile?.targetCountries && profile.targetCountries.length > 0 && (
            <Card>
              <CardHeader title={`Target Countries (${profile.targetCountries.length})`} />
              <CardContent>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {profile.targetCountries.map(c => (
                    <Tag key={c.country}>🌍 {c.country}</Tag>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account */}
          <Card>
            <CardHeader title="Account" />
            <CardContent>
              <Field label="Email"          value={user.email} />
              <Field label="Status"         value={user.status.replace(/_/g, " ")} />
              <Field label="Email Verified" value={user.isEmailVerified ? "Yes" : "No"} />
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <div style={{
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 12,
            padding: 20,
            background: "rgba(239,68,68,0.04)",
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>Danger Zone</p>
            <p style={{ fontSize: 12, color: "rgba(248,250,252,0.45)", marginBottom: 16 }}>
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
              Delete my account
            </Button>
          </div>
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
            background: "#0d0d0d", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 16, padding: 32, maxWidth: 420, width: "100%",
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>
              Delete account?
            </p>
            <p style={{ fontSize: 13, color: "rgba(248,250,252,0.55)", marginBottom: 24 }}>
              All your profile data, applications, and documents will be permanently removed.
              This action <strong style={{ color: "#f8fafc" }}>cannot be undone</strong>.
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
