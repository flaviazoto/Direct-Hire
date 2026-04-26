"use client";
// src/app/(app)/employer/jobs/[id]/edit/page.tsx
// Edit/view an existing job post — same multi-step form as /new, pre-filled.

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { employerApi } from "@/lib/api-client";
import {
  Button,
  Input,
  LoadingPage,
  SelectInput,
  Textarea,
  ToastDisplay,
  type ToastData,
} from "@/components/ui";

// ── Constants (duplicated from /new for isolation) ─────────────────────────────

const CATEGORIES = [
  "Technology", "Healthcare", "Construction", "Hospitality",
  "Logistics", "Finance", "Education", "Manufacturing", "Domestic Work", "Other",
];

const CONTRACT_TYPES: { value: string; label: string }[] = [
  { value: "FULL_TIME",   label: "Full-time" },
  { value: "PART_TIME",   label: "Part-time" },
  { value: "CONTRACT",    label: "Contract" },
  { value: "TEMPORARY",   label: "Temporary" },
  { value: "INTERNSHIP",  label: "Internship" },
  { value: "FREELANCE",   label: "Freelance" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD"];

const EXP_OPTIONS: { value: number; label: string }[] = [
  { value: 0,  label: "0–1 years" },
  { value: 1,  label: "1–2 years" },
  { value: 2,  label: "2–5 years" },
  { value: 5,  label: "5–10 years" },
  { value: 10, label: "10+ years" },
];

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahrain","Bangladesh","Belgium","Brazil","Canada","Chile","China",
  "Colombia","Czech Republic","Denmark","Egypt","Ethiopia","Finland","France","Germany",
  "Ghana","Greece","Hungary","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy",
  "Japan","Jordan","Kazakhstan","Kenya","Kuwait","Lebanon","Malaysia","Mexico","Morocco",
  "Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan","Philippines","Poland",
  "Portugal","Qatar","Romania","Russia","Saudi Arabia","Senegal","Singapore","South Africa",
  "South Korea","Spain","Sri Lanka","Sweden","Switzerland","Tanzania","Thailand","Turkey",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Vietnam","Zimbabwe",
];

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface ModerationHistoryEntry {
  action: string;
  notes?: string | null;
  timestamp: string;
  admin_id?: string;
}

interface JobData {
  id: string;
  title: string;
  companyName: string;
  category: string;
  contractType: string;
  country: string;
  city: string;
  remoteAllowed: boolean;
  positionsAvailable: number;
  applicationDeadline?: string | null;
  salaryMin: number | string;
  salaryMax: number | string;
  salaryCurrency: string;
  experienceRequired: number;
  requiredSkills: string[];
  languagesRequired: string[];
  visaSupport: boolean;
  accommodation: boolean;
  description: string;
  requirements: string;
  benefits?: string | null;
  status: string;
  moderationNotes?: string | null;
  moderationHistory?: ModerationHistoryEntry[] | null;
  changesRequestedAt?: string | null;
}

interface FormData {
  title: string; companyName: string; category: string; contractType: string;
  country: string; city: string; remoteAllowed: boolean; positionsAvailable: number;
  applicationDeadline: string; salaryMin: string; salaryMax: string; salaryCurrency: string;
  experienceRequired: number; skills: string[]; languages: string[];
  visaSupport: boolean; accommodation: boolean; description: string; requirements: string; benefits: string;
}

// ── Small reusable components ──────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 16px", cursor: "pointer", width: "100%", textAlign: "left" }}>
      <div style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, position: "relative", background: checked ? "linear-gradient(135deg,#0090FF,#0d9488)" : "rgba(255,255,255,0.08)", transition: "background 0.2s" }}>
        <div style={{ position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", left: checked ? 21 : 3, boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
      </div>
      <span style={{ fontSize: 13, color: checked ? "#e4e4e7" : "#71717a", fontWeight: 500 }}>{label}</span>
    </button>
  );
}

function TagInput({ label, tags, onChange, placeholder, max = 20, error, disabled }: {
  label: string; tags: string[]; onChange: (tags: string[]) => void;
  placeholder?: string; max?: number; error?: string; disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  function addTag() {
    const val = input.trim();
    if (!val || tags.length >= max || tags.some(t => t.toLowerCase() === val.toLowerCase())) { setInput(""); return; }
    onChange([...tags, val]); setInput("");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: "#a1a1aa" }}>{label}</label>
      <div onClick={() => inputRef.current?.focus()} style={{ background: "#111", border: `1px solid ${error ? "#ef4444" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "8px 12px", cursor: disabled ? "default" : "text", display: "flex", flexWrap: "wrap", gap: 6, minHeight: 44, opacity: disabled ? 0.5 : 1 }}>
        {tags.map((tag, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,144,255,0.12)", border: "1px solid rgba(0,144,255,0.25)", borderRadius: 6, padding: "2px 8px", fontSize: 12, color: "#5eead4" }}>
            {tag}
            {!disabled && <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#5eead4", padding: 0, lineHeight: 1, fontSize: 13 }}>×</button>}
          </span>
        ))}
        {!disabled && (
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} placeholder={tags.length < max ? placeholder : `Max ${max}`} disabled={tags.length >= max} style={{ background: "none", border: "none", outline: "none", color: "#fff", fontSize: 13, fontFamily: "inherit", minWidth: 120, flex: 1 }} />
        )}
      </div>
      {error && <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{error}</p>}
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1; const done = step < current; const active = step === current;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center", flex: step < total ? 1 : undefined }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, ...(done ? { background: "linear-gradient(135deg,#0090FF,#0d9488)", color: "#fff" } : active ? { background: "rgba(0,144,255,0.15)", border: "2px solid #0090FF", color: "#0090FF" } : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#555" }) }}>
              {done ? "✓" : step}
            </div>
            {step < total && <div style={{ flex: 1, height: 2, margin: "0 8px", background: done ? "linear-gradient(90deg,#0090FF,#0d9488)" : "rgba(255,255,255,0.06)", borderRadius: 2 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function EditJobContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loadingJob, setLoadingJob] = useState(true);
  const [job, setJob] = useState<JobData | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastData>(null);

  const isReadOnly = job?.status === "PENDING_MODERATION" || job?.status === "APPROVED" || job?.status === "ARCHIVED";

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    employerApi.getJob(id).then(res => {
      if (!res.success) { router.push("/employer/jobs"); return; }
      const j = res.data as JobData;
      setJob(j);
      const salaryMin = typeof j.salaryMin === "string" ? j.salaryMin : String(j.salaryMin ?? "");
      const salaryMax = typeof j.salaryMax === "string" ? j.salaryMax : String(j.salaryMax ?? "");
      const deadline = j.applicationDeadline
        ? new Date(j.applicationDeadline).toISOString().split("T")[0]
        : "";
      setForm({
        title: j.title ?? "",
        companyName: j.companyName ?? "",
        category: j.category ?? "",
        contractType: j.contractType ?? "",
        country: j.country ?? "",
        city: j.city ?? "",
        remoteAllowed: j.remoteAllowed ?? false,
        positionsAvailable: j.positionsAvailable ?? 1,
        applicationDeadline: deadline,
        salaryMin,
        salaryMax,
        salaryCurrency: j.salaryCurrency ?? "USD",
        experienceRequired: j.experienceRequired ?? 0,
        skills: Array.isArray(j.requiredSkills) ? j.requiredSkills : [],
        languages: Array.isArray(j.languagesRequired) ? j.languagesRequired : [],
        visaSupport: j.visaSupport ?? false,
        accommodation: j.accommodation ?? false,
        description: j.description ?? "",
        requirements: j.requirements ?? "",
        benefits: j.benefits ?? "",
      });
      setLoadingJob(false);
    });
  }, [id, router]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => f ? { ...f, [key]: value } : f);
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function validateStep1() {
    if (!form) return false;
    const e: Record<string, string> = {};
    if (!form.title.trim())       e.title = "Required";
    if (!form.companyName.trim()) e.companyName = "Required";
    if (!form.category)           e.category = "Required";
    if (!form.contractType)       e.contractType = "Required";
    if (!form.country)            e.country = "Required";
    if (!form.city.trim())        e.city = "Required";
    if (form.applicationDeadline && new Date(form.applicationDeadline) <= new Date()) e.applicationDeadline = "Must be in the future";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2() {
    if (!form) return false;
    const e: Record<string, string> = {};
    const min = parseFloat(form.salaryMin); const max = parseFloat(form.salaryMax);
    if (!form.salaryMin || min <= 0) e.salaryMin = "Must be > 0";
    if (!form.salaryMax || max <= 0) e.salaryMax = "Must be > 0";
    if (min > 0 && max > 0 && max < min) e.salaryRange = "Max must be ≥ min";
    if (form.skills.length === 0) e.skills = "Add at least one skill";
    if (form.description.trim().length < 100) e.description = `Min 100 chars (${form.description.trim().length} now)`;
    if (form.requirements.trim().length < 50) e.requirements = `Min 50 chars (${form.requirements.trim().length} now)`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  function buildPayload() {
    if (!form) return {};
    return {
      title: form.title.trim(), companyName: form.companyName.trim(),
      category: form.category, contractType: form.contractType,
      country: form.country, city: form.city.trim(),
      remoteAllowed: form.remoteAllowed, positionsAvailable: form.positionsAvailable,
      applicationDeadline: form.applicationDeadline ? new Date(form.applicationDeadline).toISOString() : undefined,
      salaryMin: parseFloat(form.salaryMin), salaryMax: parseFloat(form.salaryMax),
      salaryCurrency: form.salaryCurrency, experienceRequired: form.experienceRequired,
      requiredSkills: form.skills, languagesRequired: form.languages,
      visaSupport: form.visaSupport, accommodation: form.accommodation,
      description: form.description.trim(), requirements: form.requirements.trim(),
      benefits: form.benefits.trim() || undefined,
    };
  }

  async function handleSaveDraft() {
    setSubmitting(true);
    const res = await employerApi.updateJob(id, buildPayload());
    setSubmitting(false);
    if (!res.success) { showToast((res as { error?: string }).error ?? "Failed to save", "err"); return; }
    showToast("Draft saved.", "ok");
    router.push("/employer/jobs");
  }

  async function handleSubmit() {
    setSubmitting(true);
    const updateRes = await employerApi.updateJob(id, buildPayload());
    if (!updateRes.success) {
      setSubmitting(false);
      showToast((updateRes as { error?: string }).error ?? "Failed to update", "err");
      return;
    }
    const submitRes = await employerApi.submitJob(id);
    setSubmitting(false);
    if (!submitRes.success) { showToast((submitRes as { error?: string }).error ?? "Failed to submit", "err"); return; }
    router.push("/employer/jobs?submitted=1");
  }

  if (loadingJob || !form) return <LoadingPage color="teal" />;

  const STEP_LABELS = ["Job Basics", "Requirements & Pay", "Review & Submit"];
  const ro = isReadOnly;

  const statusLabel: Record<string, string> = {
    DRAFT: "Draft", PENDING_MODERATION: "Under Review",
    APPROVED: "Live", REJECTED: "Rejected", ARCHIVED: "Archived",
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <ToastDisplay toast={toast} />

      <div style={{ marginBottom: 32 }}>
        <button onClick={() => step > 1 ? setStep(step - 1) : router.push("/employer/jobs")} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
          ← {step > 1 ? "Back" : "Back to jobs"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: "#ffffff", fontSize: 24, fontWeight: 800 }}>{ro ? "View job" : "Edit job"}</div>
          {job?.status && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#a1a1aa" }}>
              {statusLabel[job.status] ?? job.status}
            </span>
          )}
        </div>
        {ro && <div style={{ fontSize: 13, color: "#71717a", marginTop: 6 }}>This job is read-only while {statusLabel[job!.status!]?.toLowerCase()}.</div>}
        {!ro && <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>Step {step} of 3 — {STEP_LABELS[step - 1]}</div>}

        {/* Sticky feedback notice for rejected / changes-requested jobs */}
        {job?.status === "REJECTED" && (() => {
          // Find the latest entry with notes from moderation history
          const history = Array.isArray(job.moderationHistory) ? job.moderationHistory : [];
          const latest  = [...history].reverse().find(e => e.notes);
          const isChangesRequested = !!job.changesRequestedAt;
          const feedbackNotes = latest?.notes ?? job.moderationNotes;
          if (!feedbackNotes) return null;
          return (
            <div style={{
              marginTop: 16,
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 12,
              padding: "14px 18px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {isChangesRequested ? "Feedback from moderation team" : "Rejection reason"}
              </div>
              <div style={{
                background: "rgba(0,0,0,0.2)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: "#fcd34d",
                lineHeight: 1.6,
              }}>
                {feedbackNotes}
              </div>
              {!ro && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#92400e" }}>
                  Address this feedback then click <strong style={{ color: "#fbbf24" }}>Resubmit for review</strong>.
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {!ro && <StepIndicator current={step} total={3} />}

      <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, overflow: "hidden" }}>

        {/* ── STEP 1 ── */}
        {(step === 1 || ro) && (
          <div style={{ padding: 32, display: ro && step !== 1 ? "none" : undefined }}>
            {ro && <div style={{ fontSize: 14, fontWeight: 700, color: "#a1a1aa", marginBottom: 24, textTransform: "uppercase", letterSpacing: "0.06em" }}>Step 1 — Job Basics</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <Input label="Job title *" value={form.title} onChange={e => set("title", e.target.value)} error={errors.title} disabled={ro} />
              </div>
              <Input label="Company name *" value={form.companyName} onChange={e => set("companyName", e.target.value)} error={errors.companyName} disabled={ro} />
              <SelectInput label="Category *" value={form.category} onChange={e => set("category", e.target.value)} options={[{ value: "", label: "Select" }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} error={errors.category} disabled={ro} />
              <SelectInput label="Contract type *" value={form.contractType} onChange={e => set("contractType", e.target.value)} options={[{ value: "", label: "Select" }, ...CONTRACT_TYPES]} error={errors.contractType} disabled={ro} />
              <SelectInput label="Country *" value={form.country} onChange={e => set("country", e.target.value)} options={[{ value: "", label: "Select" }, ...COUNTRIES.map(c => ({ value: c, label: c }))]} error={errors.country} disabled={ro} />
              <Input label="City *" value={form.city} onChange={e => set("city", e.target.value)} error={errors.city} disabled={ro} />
              <Input label="Positions available" type="number" value={String(form.positionsAvailable)} onChange={e => set("positionsAvailable", parseInt(e.target.value) || 1)} min={1} max={100} disabled={ro} />
              <Input label="Application deadline (optional)" type="date" value={form.applicationDeadline} onChange={e => set("applicationDeadline", e.target.value)} error={errors.applicationDeadline} disabled={ro} />
              <div style={{ gridColumn: "1/-1" }}>
                <Toggle checked={form.remoteAllowed} onChange={v => set("remoteAllowed", v)} label="Remote work allowed" />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {(step === 2 || ro) && (
          <div style={{ padding: 32, borderTop: ro ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
            {ro && <div style={{ fontSize: 14, fontWeight: 700, color: "#a1a1aa", marginBottom: 24, textTransform: "uppercase", letterSpacing: "0.06em" }}>Step 2 — Requirements & Pay</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <Input label="Salary min *" type="number" value={form.salaryMin} onChange={e => { set("salaryMin", e.target.value); setErrors(er => ({ ...er, salaryRange: undefined })); }} error={errors.salaryMin} disabled={ro} />
              <Input label="Salary max *" type="number" value={form.salaryMax} onChange={e => { set("salaryMax", e.target.value); setErrors(er => ({ ...er, salaryRange: undefined })); }} error={errors.salaryMax} disabled={ro} />
              {errors.salaryRange && <div style={{ gridColumn: "1/-1" }}><p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{errors.salaryRange}</p></div>}
              <SelectInput label="Currency" value={form.salaryCurrency} onChange={e => set("salaryCurrency", e.target.value)} options={CURRENCIES.map(c => ({ value: c, label: c }))} disabled={ro} />
              <SelectInput label="Experience required" value={String(form.experienceRequired)} onChange={e => set("experienceRequired", parseInt(e.target.value))} options={EXP_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))} disabled={ro} />
              <div style={{ gridColumn: "1/-1" }}>
                <TagInput label="Required skills *" tags={form.skills} onChange={v => { set("skills", v); setErrors(er => ({ ...er, skills: undefined })); }} placeholder="Type + Enter" error={errors.skills} disabled={ro} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <TagInput label="Languages required" tags={form.languages} onChange={v => set("languages", v)} placeholder="Type + Enter" disabled={ro} />
              </div>
              <Toggle checked={form.visaSupport} onChange={v => set("visaSupport", v)} label="Visa support provided" />
              <Toggle checked={form.accommodation} onChange={v => set("accommodation", v)} label="Accommodation provided" />
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 6 }}>
                <Textarea label="Job description * (min 100 chars)" value={form.description} onChange={e => set("description", e.target.value)} rows={6} error={errors.description} disabled={ro} style={{ minHeight: 140 }} />
                {!ro && <div style={{ fontSize: 11, color: form.description.trim().length < 100 ? "#f87171" : "#555", textAlign: "right" }}>{form.description.trim().length}/100</div>}
              </div>
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 6 }}>
                <Textarea label="Requirements * (min 50 chars)" value={form.requirements} onChange={e => set("requirements", e.target.value)} rows={4} error={errors.requirements} disabled={ro} style={{ minHeight: 100 }} />
                {!ro && <div style={{ fontSize: 11, color: form.requirements.trim().length < 50 ? "#f87171" : "#555", textAlign: "right" }}>{form.requirements.trim().length}/50</div>}
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <Textarea label="Benefits (optional)" value={form.benefits} onChange={e => set("benefits", e.target.value)} rows={3} disabled={ro} style={{ minHeight: 80 }} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3 (edit mode only) ── */}
        {step === 3 && !ro && (
          <div style={{ padding: 32 }}>
            <div style={{ color: "#ffffff", fontSize: 16, fontWeight: 700, marginBottom: 24 }}>Review & submit</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[
                ["Job title", form.title], ["Company", form.companyName],
                ["Category", form.category], ["Contract type", CONTRACT_TYPES.find(c => c.value === form.contractType)?.label],
                ["Location", `${form.city}, ${form.country}${form.remoteAllowed ? " · Remote" : ""}`],
                ["Positions", form.positionsAvailable],
                ["Salary", `${form.salaryCurrency} ${Number(form.salaryMin).toLocaleString()} – ${Number(form.salaryMax).toLocaleString()}`],
                ["Experience", EXP_OPTIONS.find(o => o.value === form.experienceRequired)?.label],
              ].map(([label, value]) => value ? (
                <div key={String(label)}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "#e4e4e7" }}>{String(value)}</div>
                </div>
              ) : null)}
            </div>
            {form.skills.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Required Skills</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {form.skills.map(s => <span key={s} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 6, background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.25)", color: "#5eead4" }}>{s}</span>)}
                </div>
              </div>
            )}
            <div style={{ background: "rgba(0,144,255,0.06)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 12, padding: 14, marginTop: 16 }}>
              <div style={{ fontSize: 13, color: "#5eead4", lineHeight: 1.6 }}>
                <strong>Note:</strong> Submitted jobs go through a quick review before going live (usually within 24 hours).
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {ro ? (
            <>
              <button onClick={() => router.push("/employer/jobs")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 20px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
                ← Back to jobs
              </button>
              <span style={{ fontSize: 12, color: "#555" }}>Read-only view</span>
            </>
          ) : (
            <>
              <button onClick={() => step > 1 ? setStep(step - 1) : router.push("/employer/jobs")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 20px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
                {step === 1 ? "Cancel" : "← Back"}
              </button>
              {step < 3 ? (
                <Button variant="teal" onClick={handleNext}>
                  Next: {STEP_LABELS[step]} →
                </Button>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <Button variant="secondary" loading={submitting} onClick={handleSaveDraft}>Save draft</Button>
                  <Button variant="teal" loading={submitting} onClick={handleSubmit}>
                    {job?.status === "REJECTED" ? "Resubmit for review" : "Submit for review"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EditJobPage() {
  return (
    <Suspense fallback={<LoadingPage color="teal" />}>
      <EditJobContent />
    </Suspense>
  );
}
