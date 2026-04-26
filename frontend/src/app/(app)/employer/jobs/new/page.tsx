"use client";
// src/app/(app)/employer/jobs/new/page.tsx

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

// ── Constants ──────────────────────────────────────────────────────────────────

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

// A curated list of countries for the select
const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda",
  "Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain",
  "Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia",
  "Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso",
  "Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic",
  "Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba",
  "Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini",
  "Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana",
  "Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras",
  "Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy",
  "Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan",
  "Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania",
  "Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands",
  "Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia",
  "Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands",
  "New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway",
  "Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru",
  "Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda",
  "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa",
  "San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles",
  "Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname",
  "Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste",
  "Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay",
  "Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

// ── Form state type ────────────────────────────────────────────────────────────

interface FormData {
  // Step 1
  title: string;
  companyName: string;
  category: string;
  contractType: string;
  country: string;
  city: string;
  remoteAllowed: boolean;
  positionsAvailable: number;
  applicationDeadline: string;
  // Step 2
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  experienceRequired: number;
  skills: string[];
  languages: string[];
  visaSupport: boolean;
  accommodation: boolean;
  description: string;
  requirements: string;
  benefits: string;
}

function emptyForm(): FormData {
  return {
    title: "", companyName: "", category: "", contractType: "", country: "",
    city: "", remoteAllowed: false, positionsAvailable: 1, applicationDeadline: "",
    salaryMin: "", salaryMax: "", salaryCurrency: "USD", experienceRequired: 0,
    skills: [], languages: [], visaSupport: false, accommodation: false,
    description: "", requirements: "", benefits: "",
  };
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center", flex: step < total ? 1 : undefined }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
              ...(done   ? { background: "linear-gradient(135deg,#14b8a6,#0d9488)", color: "#fff", boxShadow: "0 0 10px rgba(0,144,255,0.4)" }
                : active ? { background: "rgba(0,144,255,0.15)", border: "2px solid #14b8a6", color: "#14b8a6" }
                          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#555" }),
            }}>
              {done ? "✓" : step}
            </div>
            {step < total && (
              <div style={{ flex: 1, height: 2, margin: "0 8px", background: done ? "linear-gradient(90deg,#14b8a6,#0d9488)" : "rgba(255,255,255,0.06)", borderRadius: 2 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12, padding: "12px 16px", cursor: "pointer", width: "100%", textAlign: "left",
      }}
    >
      <div style={{
        width: 42, height: 24, borderRadius: 12, flexShrink: 0, position: "relative",
        background: checked ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "rgba(255,255,255,0.08)",
        transition: "background 0.2s",
        boxShadow: checked ? "0 0 10px rgba(0,144,255,0.35)" : "none",
      }}>
        <div style={{
          position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          left: checked ? 21 : 3,
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }} />
      </div>
      <span style={{ fontSize: 13, color: checked ? "#e4e4e7" : "#71717a", fontWeight: 500 }}>{label}</span>
    </button>
  );
}

// ── Tag input ──────────────────────────────────────────────────────────────────

function TagInput({
  label, tags, onChange, placeholder, max = 20, error,
}: {
  label: string; tags: string[]; onChange: (tags: string[]) => void;
  placeholder?: string; max?: number; error?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag() {
    const val = input.trim();
    if (!val || tags.length >= max || tags.some(t => t.toLowerCase() === val.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...tags, val]);
    setInput("");
  }

  function removeTag(idx: number) {
    onChange(tags.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: "#a1a1aa" }}>{label}</label>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          background: "#111", border: `1px solid ${error ? "#ef4444" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 10, padding: "8px 12px", cursor: "text",
          display: "flex", flexWrap: "wrap", gap: 6, minHeight: 44,
        }}
      >
        {tags.map((tag, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(0,144,255,0.12)", border: "1px solid rgba(0,144,255,0.25)",
            borderRadius: 6, padding: "2px 8px", fontSize: 12, color: "#5eead4",
          }}>
            {tag}
            <button
              type="button" onClick={() => removeTag(i)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#5eead4", padding: 0, lineHeight: 1, fontSize: 13 }}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } if (e.key === "," ) { e.preventDefault(); addTag(); } }}
          placeholder={tags.length < max ? placeholder : `Max ${max} reached`}
          disabled={tags.length >= max}
          style={{
            background: "none", border: "none", outline: "none", color: "#fff",
            fontSize: 13, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            minWidth: 120, flex: 1,
          }}
        />
      </div>
      <p style={{ fontSize: 11, color: "#555", margin: 0 }}>Press Enter or comma to add · {tags.length}/{max}</p>
      {error && <p style={{ fontSize: 12, color: "#f87171", margin: 0, fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function FullRow({ children }: { children: React.ReactNode }) {
  return <div style={{ gridColumn: "1 / -1" }}>{children}</div>;
}

// ── Review row ─────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0 && value !== false) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 13, color: "#e4e4e7", lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function NewJobContent() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [errors, setErrors] = useState<Partial<Record<keyof FormData | "salaryRange", string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastData>(null);

  // Pre-fill company name from profile
  useEffect(() => {
    employerApi.getProfile().then(res => {
      if (res.success) {
        const profile = (res.data as { profile?: { companyName?: string } })?.profile;
        if (profile?.companyName) {
          setForm(f => ({ ...f, companyName: profile.companyName! }));
        }
      }
    });
  }, []);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const e: typeof errors = {};
    if (!form.title.trim())       e.title = "Job title is required";
    if (!form.companyName.trim()) e.companyName = "Company name is required";
    if (!form.category)           e.category = "Please select a category";
    if (!form.contractType)       e.contractType = "Please select a contract type";
    if (!form.country)            e.country = "Please select a country";
    if (!form.city.trim())        e.city = "City is required";
    if (form.positionsAvailable < 1 || form.positionsAvailable > 100) e.positionsAvailable = "Must be 1–100";
    if (form.applicationDeadline) {
      if (new Date(form.applicationDeadline) <= new Date()) e.applicationDeadline = "Deadline must be in the future";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: typeof errors = {};
    const min = form.salaryMin ? parseFloat(form.salaryMin) : null;
    const max = form.salaryMax ? parseFloat(form.salaryMax) : null;
    if (!form.salaryMin || min === null || min <= 0)  e.salaryMin = "Salary min must be greater than 0";
    if (!form.salaryMax || max === null || max <= 0)  e.salaryMax = "Salary max must be greater than 0";
    if (min !== null && max !== null && max < min)    e.salaryRange = "Salary max must be ≥ salary min";
    if (form.skills.length === 0)                     e.skills = "Add at least one required skill";
    if (form.description.trim().length < 100)         e.description = `Description must be at least 100 characters (currently ${form.description.trim().length})`;
    if (form.requirements.trim().length < 50)         e.requirements = `Requirements must be at least 50 characters (currently ${form.requirements.trim().length})`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  function buildPayload() {
    return {
      title:               form.title.trim(),
      companyName:         form.companyName.trim(),
      category:            form.category,
      contractType:        form.contractType,
      country:             form.country,
      city:                form.city.trim(),
      remoteAllowed:       form.remoteAllowed,
      positionsAvailable:  form.positionsAvailable,
      applicationDeadline: form.applicationDeadline ? new Date(form.applicationDeadline).toISOString() : undefined,
      salaryMin:           parseFloat(form.salaryMin),
      salaryMax:           parseFloat(form.salaryMax),
      salaryCurrency:      form.salaryCurrency,
      experienceRequired:  form.experienceRequired,
      requiredSkills:      form.skills,
      languagesRequired:   form.languages,
      visaSupport:         form.visaSupport,
      accommodation:       form.accommodation,
      description:         form.description.trim(),
      requirements:        form.requirements.trim(),
      benefits:            form.benefits.trim() || undefined,
    };
  }

  async function handleSaveDraft() {
    setSubmitting(true);
    const res = await employerApi.createJob(buildPayload());
    setSubmitting(false);
    if (!res.success) { showToast((res as { error?: string }).error ?? "Failed to save draft", "err"); return; }
    router.push("/employer/jobs");
  }

  async function handleSubmit() {
    setSubmitting(true);
    const res = await employerApi.createAndSubmitJob(buildPayload());
    setSubmitting(false);
    if (!res.success) { showToast((res as { error?: string }).error ?? "Failed to submit job", "err"); return; }
    router.push("/employer/jobs?submitted=1");
  }

  // ── Step labels ──────────────────────────────────────────────────────────────

  const STEP_LABELS = ["Job Basics", "Requirements & Pay", "Review & Submit"];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={() => step > 1 ? setStep(step - 1) : router.push("/employer/jobs")}
          style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← {step > 1 ? "Back" : "Back to jobs"}
        </button>
        <div style={{ color: "#ffffff", fontSize: 24, fontWeight: 800 }}>Post a New Job</div>
        <div style={{ color: "#71717a", fontSize: 14, marginTop: 4 }}>
          Step {step} of 3 — {STEP_LABELS[step - 1]}
        </div>
      </div>

      <StepIndicator current={step} total={3} />

      {/* Card */}
      <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, overflow: "hidden" }}>

        {/* ── STEP 1 ─────────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ padding: 32 }}>
            <Section title="Job Details">
              <FullRow>
                <Input
                  label="Job title *"
                  value={form.title}
                  onChange={e => set("title", e.target.value)}
                  placeholder="e.g. Senior Care Assistant"
                  error={errors.title}
                />
              </FullRow>
              <Input
                label="Company name *"
                value={form.companyName}
                onChange={e => set("companyName", e.target.value)}
                placeholder="e.g. Acme Corp"
                error={errors.companyName}
              />
              <SelectInput
                label="Category *"
                value={form.category}
                onChange={e => set("category", e.target.value)}
                options={[{ value: "", label: "Select category" }, ...CATEGORIES.map(c => ({ value: c, label: c }))]}
                error={errors.category}
              />
              <SelectInput
                label="Contract type *"
                value={form.contractType}
                onChange={e => set("contractType", e.target.value)}
                options={[{ value: "", label: "Select contract type" }, ...CONTRACT_TYPES]}
                error={errors.contractType}
              />
              <SelectInput
                label="Country *"
                value={form.country}
                onChange={e => set("country", e.target.value)}
                options={[{ value: "", label: "Select country" }, ...COUNTRIES.map(c => ({ value: c, label: c }))]}
                error={errors.country}
              />
              <Input
                label="City *"
                value={form.city}
                onChange={e => set("city", e.target.value)}
                placeholder="e.g. Berlin"
                error={errors.city}
              />
              <Input
                label="Positions available"
                type="number"
                value={String(form.positionsAvailable)}
                onChange={e => set("positionsAvailable", Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                min={1} max={100}
                error={errors.positionsAvailable}
              />
              <Input
                label="Application deadline (optional)"
                type="date"
                value={form.applicationDeadline}
                onChange={e => set("applicationDeadline", e.target.value)}
                error={errors.applicationDeadline}
              />
              <FullRow>
                <Toggle
                  checked={form.remoteAllowed}
                  onChange={v => set("remoteAllowed", v)}
                  label="Remote work allowed"
                />
              </FullRow>
            </Section>
          </div>
        )}

        {/* ── STEP 2 ─────────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ padding: 32 }}>
            <Section title="Compensation">
              <Input
                label="Salary min *"
                type="number"
                value={form.salaryMin}
                onChange={e => { set("salaryMin", e.target.value); setErrors(er => ({ ...er, salaryRange: undefined })); }}
                placeholder="e.g. 2000"
                error={errors.salaryMin}
              />
              <Input
                label="Salary max *"
                type="number"
                value={form.salaryMax}
                onChange={e => { set("salaryMax", e.target.value); setErrors(er => ({ ...er, salaryRange: undefined })); }}
                placeholder="e.g. 3500"
                error={errors.salaryMax}
              />
              {errors.salaryRange && (
                <FullRow>
                  <p style={{ fontSize: 12, color: "#f87171", margin: 0, fontWeight: 500 }}>{errors.salaryRange}</p>
                </FullRow>
              )}
              <SelectInput
                label="Currency"
                value={form.salaryCurrency}
                onChange={e => set("salaryCurrency", e.target.value)}
                options={CURRENCIES.map(c => ({ value: c, label: c }))}
              />
              <SelectInput
                label="Experience required"
                value={String(form.experienceRequired)}
                onChange={e => set("experienceRequired", parseInt(e.target.value))}
                options={EXP_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))}
              />
            </Section>

            <Section title="Skills & Languages">
              <FullRow>
                <TagInput
                  label="Required skills *"
                  tags={form.skills}
                  onChange={v => { set("skills", v); setErrors(er => ({ ...er, skills: undefined })); }}
                  placeholder="Type a skill + Enter"
                  error={errors.skills}
                />
              </FullRow>
              <FullRow>
                <TagInput
                  label="Languages required"
                  tags={form.languages}
                  onChange={v => set("languages", v)}
                  placeholder="Type a language + Enter"
                />
              </FullRow>
            </Section>

            <Section title="Perks & Support">
              <Toggle checked={form.visaSupport} onChange={v => set("visaSupport", v)} label="Visa support provided" />
              <Toggle checked={form.accommodation} onChange={v => set("accommodation", v)} label="Accommodation provided" />
            </Section>

            <Section title="Job Description">
              <FullRow>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Textarea
                    label="Job description * (min 100 chars)"
                    value={form.description}
                    onChange={e => { set("description", e.target.value); }}
                    rows={7}
                    placeholder="Describe the role, day-to-day responsibilities, team, and working conditions."
                    error={errors.description}
                    style={{ minHeight: 160 }}
                  />
                  <div style={{ fontSize: 11, color: form.description.trim().length < 100 ? "#f87171" : "#555", textAlign: "right" }}>
                    {form.description.trim().length} / 100 min chars
                  </div>
                </div>
              </FullRow>
              <FullRow>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Textarea
                    label="Requirements * (min 50 chars)"
                    value={form.requirements}
                    onChange={e => set("requirements", e.target.value)}
                    rows={5}
                    placeholder="List qualifications, experience, certifications, and expectations."
                    error={errors.requirements}
                    style={{ minHeight: 120 }}
                  />
                  <div style={{ fontSize: 11, color: form.requirements.trim().length < 50 ? "#f87171" : "#555", textAlign: "right" }}>
                    {form.requirements.trim().length} / 50 min chars
                  </div>
                </div>
              </FullRow>
              <FullRow>
                <Textarea
                  label="Benefits (optional)"
                  value={form.benefits}
                  onChange={e => set("benefits", e.target.value)}
                  rows={3}
                  placeholder="Health insurance, annual leave, travel allowance, bonuses…"
                  style={{ minHeight: 80 }}
                />
              </FullRow>
            </Section>
          </div>
        )}

        {/* ── STEP 3 ─────────────────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ padding: 32 }}>
            <div style={{ color: "#ffffff", fontSize: 16, fontWeight: 700, marginBottom: 24 }}>Review your job post</div>

            {/* Summary grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
              <ReviewRow label="Job title" value={form.title} />
              <ReviewRow label="Company" value={form.companyName} />
              <ReviewRow label="Category" value={form.category} />
              <ReviewRow label="Contract type" value={CONTRACT_TYPES.find(c => c.value === form.contractType)?.label} />
              <ReviewRow label="Location" value={`${form.city}, ${form.country}${form.remoteAllowed ? " · Remote allowed" : ""}`} />
              <ReviewRow label="Positions" value={form.positionsAvailable} />
              <ReviewRow label="Salary" value={`${form.salaryCurrency} ${Number(form.salaryMin).toLocaleString()} – ${Number(form.salaryMax).toLocaleString()}`} />
              <ReviewRow label="Experience" value={EXP_OPTIONS.find(o => o.value === form.experienceRequired)?.label} />
              <ReviewRow label="Application deadline" value={form.applicationDeadline ? new Date(form.applicationDeadline).toLocaleDateString() : "None"} />
              <ReviewRow label="Visa support" value={form.visaSupport ? "Yes" : "No"} />
              <ReviewRow label="Accommodation" value={form.accommodation ? "Yes" : "No"} />
            </div>

            {form.skills.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Required Skills</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {form.skills.map(s => (
                    <span key={s} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.25)", color: "#5eead4" }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {form.languages.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Languages Required</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {form.languages.map(l => (
                    <span key={l} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#93c5fd" }}>{l}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
              {[
                { label: "Job description", value: form.description },
                { label: "Requirements",    value: form.requirements },
                ...(form.benefits ? [{ label: "Benefits", value: form.benefits }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
                  <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Review note */}
            <div style={{ marginTop: 28, background: "rgba(0,144,255,0.06)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, color: "#5eead4", lineHeight: 1.6 }}>
                <strong>Note:</strong> Submitted jobs go through a quick review before going live (usually within 24 hours). You can save as a draft and submit later.
              </div>
            </div>
          </div>
        )}

        {/* ── Footer nav ─────────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => step > 1 ? setStep(step - 1) : router.push("/employer/jobs")}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 20px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600 }}
          >
            {step === 1 ? "Cancel" : "← Back"}
          </button>

          {step < 3 ? (
            <Button variant="teal" onClick={handleNext}>
              Next: {STEP_LABELS[step]} →
            </Button>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" loading={submitting} onClick={handleSaveDraft}>
                Save as draft
              </Button>
              <Button variant="teal" loading={submitting} onClick={handleSubmit}>
                Submit for review
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewJobPage() {
  return (
    <Suspense fallback={<LoadingPage color="teal" />}>
      <NewJobContent />
    </Suspense>
  );
}
