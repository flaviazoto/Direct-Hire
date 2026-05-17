"use client";
// src/app/(app)/worker/onboarding/page.tsx
// Full worker onboarding wizard — connected to backend APIs

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useOnboardingStore } from "@/lib/stores/onboarding.store";
import { SkillsMultiSelect, type SkillValue } from "@/components/SkillsMultiSelect";

// ── Step count for workers ────────────────────────────────────
const TOTAL_STEPS = 7;
const STEP_LABELS = [
  "Account",
  "Personal Info",
  "Family",
  "Skills",
  "Preferences",
  "Documents",
  "Review",
];

// ── Country constants ─────────────────────────────────────────
const COUNTRIES = [
  "Albania", "Algeria", "Bangladesh", "Brazil", "Egypt", "Ethiopia",
  "Ghana", "India", "Indonesia", "Kenya", "Morocco", "Nepal",
  "Nigeria", "Pakistan", "Philippines", "Romania", "Vietnam",
];
const TARGET_COUNTRIES = [
  "United Kingdom 🇬🇧", "Germany 🇩🇪", "Italy 🇮🇹", "France 🇫🇷",
  "UAE 🇦🇪", "Canada 🇨🇦", "Qatar 🇶🇦", "Australia 🇦🇺",
  "Malta 🇲🇹", "Cyprus 🇨🇾", "Netherlands 🇳🇱", "Greece 🇬🇷",
];
const LANGUAGES = [
  "English", "French", "German", "Italian", "Spanish",
  "Arabic", "Portuguese", "Albanian", "Romanian", "Turkish",
];
const LANG_LEVELS = [
  "A1 – Beginner", "A2 – Elementary", "B1 – Intermediate",
  "B2 – Upper Intermediate", "C1 – Advanced", "C2 – Mastery", "Native",
];
const SALARY_RANGES = [
  "€500–€999/mo", "€1,000–€1,499/mo", "€1,500–€1,999/mo",
  "€2,000–€2,999/mo", "€3,000–€3,999/mo", "€4,000+/mo",
];
const VISA_TYPES = [
  "Work Visa", "Working Holiday", "Intra-company Transfer",
  "Seasonal Work", "Domestic Worker", "Any available",
];
const FILE_TYPES = [
  { key: "PROFILE_PHOTO",       label: "Profile Photo",       icon: "📷", hint: "JPG/PNG, max 5MB" },
  { key: "WORK_VIDEO",          label: "30s Work Video",      icon: "🎥", hint: "MP4/MOV, max 50MB" },
  { key: "INTRO_VIDEO",         label: "30s Intro Video",     icon: "🎬", hint: "MP4/MOV, max 50MB" },
  { key: "MEDICAL_CERTIFICATE", label: "Medical Certificate", icon: "📄", hint: "PDF/JPG, max 10MB" },
];

// ── Component ─────────────────────────────────────────────────
export default function WorkerOnboardingPage() {
  const router = useRouter();
  const store  = useOnboardingStore();
  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/worker/dashboard';
  const [uiStep, setUiStep] = useState(0);
  const [direction, setDirection] = useState<"fwd" | "bwd">("fwd");
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  const [selectedSkills, setSelectedSkills]       = useState<SkillValue[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [languages, setLanguages]                 = useState([{ language: "English", proficiencyLevel: "B2 – Upper Intermediate" }]);
  const [hasSpouse, setHasSpouse]                 = useState(false);
  const [children, setChildren]                   = useState(0);

  const { register, handleSubmit, watch, getValues, formState: { errors } } = useForm({ mode: "onChange" });

  useEffect(() => {
    if (!store.isLoaded) {
      store.loadProgress().then(() => {
        const saved = store.currentStep;
        setUiStep(Math.min(saved, TOTAL_STEPS - 1));
        const s1 = store.stepData[1] ?? {};
        const s2 = store.stepData[2] ?? {};
        const s3 = store.stepData[3] ?? {};
        const s4 = store.stepData[4] ?? {};
        if (s3.skills)          setSelectedSkills(s3.skills as SkillValue[]);
        if (s4.targetCountries) setSelectedCountries(s4.targetCountries as string[]);
        if (s3.languages)       setLanguages(s3.languages as typeof languages);
        if (s2.hasSpouse)       setHasSpouse(s2.hasSpouse as boolean);
        if (s2.numberOfChildren) setChildren(s2.numberOfChildren as number);
      });
    } else {
      setUiStep(Math.min(store.currentStep, TOTAL_STEPS - 1));
    }
  }, []);

  const SaveIndicator = () =>
    store.isSaving ? (
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "rgba(255,255,255,0.6)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
        Saving…
      </span>
    ) : store.lastSavedAt ? (
      <span style={{ fontSize: 12, color: "#60A5FA", fontWeight: 600 }}>✓ Saved</span>
    ) : null;

  const goNext = async () => {
    const vals = getValues();
    const errs: Record<string, string> = {};

    if (uiStep === 1) {
      if (!vals.firstName?.trim())     errs.firstName = "First name required";
      if (!vals.lastName?.trim())      errs.lastName  = "Last name required";
      if (!vals.dateOfBirth)           errs.dateOfBirth = "Date of birth required";
      else {
        const age = (Date.now() - new Date(vals.dateOfBirth).getTime()) / (365.25 * 86400000);
        if (age < 18) errs.dateOfBirth = "Must be at least 18 years old";
      }
      if (!vals.phone?.trim())         errs.phone   = "Phone required";
      if (!vals.countryOfResidence)    errs.countryOfResidence = "Country required";
      if (!vals.city?.trim())          errs.city    = "City required";
      if (!vals.passportNumber?.trim()) errs.passportNumber = "Passport number required";
      else if (vals.passportNumber.length < 6) errs.passportNumber = "Minimum 6 characters";
    }
    if (uiStep === 2) {
      if (!vals.fatherName?.trim()) errs.fatherName = "Father's name required";
      if (!vals.motherName?.trim()) errs.motherName = "Mother's name required";
      if (hasSpouse && !vals.spouseName?.trim()) errs.spouseName = "Spouse name required";
    }
    if (uiStep === 3) {
      if (selectedSkills.length === 0) errs.skills = "Select at least one skill";
      if (!vals.yearsExperience)       errs.yearsExperience = "Experience level required";
    }
    if (uiStep === 4) {
      if (!vals.expectedSalary)           errs.expectedSalary = "Salary range required";
      if (selectedCountries.length === 0) errs.targetCountries = "Select at least one country";
      if (!vals.visaTypePreference)       errs.visaTypePreference = "Visa type required";
    }

    if (Object.keys(errs).length > 0) {
      setStepErrors(errs);
      return;
    }
    setStepErrors({});

    let stepPayload: Record<string, unknown> = {};
    if (uiStep === 1) {
      stepPayload = {
        firstName: vals.firstName, lastName: vals.lastName,
        dateOfBirth: vals.dateOfBirth, phone: vals.phone,
        countryOfResidence: vals.countryOfResidence, city: vals.city,
        passportNumber: vals.passportNumber, maritalStatus: vals.maritalStatus,
      };
    } else if (uiStep === 2) {
      stepPayload = {
        fatherName: vals.fatherName, motherName: vals.motherName,
        hasSpouse, spouseName: vals.spouseName, numberOfChildren: children,
      };
    } else if (uiStep === 3) {
      stepPayload = {
        skills: selectedSkills.map(s => ({ skill_id: s.skill_id, years_experience: s.years_experience ?? 1 })),
        _skillsDisplay: selectedSkills,
        yearsExperience: vals.yearsExperience,
        languages,
      };
    } else if (uiStep === 4) {
      stepPayload = {
        expectedSalary: vals.expectedSalary, targetCountries: selectedCountries,
        visaTypePreference: vals.visaTypePreference,
        availabilityDate: vals.availabilityDate, additionalNotes: vals.additionalNotes,
      };
    } else if (uiStep === 5) {
      stepPayload = { uploads: Object.keys(store.uploads) };
    }

    if (uiStep > 0 && uiStep < 6) {
      const saved = await store.saveStep(uiStep, stepPayload);
      if (!saved && store.saveError) {
        setStepErrors({ _form: store.saveError });
        return;
      }
    }

    setDirection("fwd");
    setUiStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStepErrors({});
    setDirection("bwd");
    setUiStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinalSubmit = async () => {
    const ok = await store.submitOnboarding();
    if (ok) {
      const sp = new URLSearchParams(window.location.search);
      const dest = sp.get('returnTo') ?? '/worker/dashboard';
      router.push(`${dest}?saved=1`);
    }
  };

  const handleFileUpload = async (fileType: string, file: File) => {
    await store.uploadFile(fileType, file);
  };

  const completedUploads = Object.values(store.uploads).filter(u => u.status === "done").length;

  // ── Style helpers ─────────────────────────────────────────────
  const inputClass = (f: string) =>
    `worker-input w-full rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all ${
      stepErrors[f]
        ? "border-2 border-red-500 bg-red-500/10 text-white placeholder-red-300"
        : "border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] text-white placeholder-[rgba(255,255,255,0.25)] focus:border-[#0090FF] focus:bg-[rgba(0,144,255,0.06)]"
    }`;

  const E = (f: string) => stepErrors[f]
    ? <p style={{ fontSize: 12, color: "#f87171", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>⚠ {stepErrors[f]}</p>
    : null;

  const labelSt: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 6 };
  const helperSt: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 };

  const pillSel: React.CSSProperties  = { padding: "8px 14px", borderRadius: 99, border: "2px solid #0090FF", background: "rgba(0,144,255,0.15)", color: "#60A5FA",  fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" };
  const pillOff: React.CSSProperties  = { padding: "8px 14px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" };

  const headingSt: React.CSSProperties = { paddingBottom: "1.25rem", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)" };

  // ── Render current step content ───────────────────────────────
  const renderStep = () => {
    switch (uiStep) {

      // ── Step 0: Welcome ──────────────────────────────────────────
      case 0:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={headingSt}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Create your account</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Your login details are already set — let&apos;s continue with your profile.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "rgba(0,144,255,0.08)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 14, padding: "14px 16px" }}>
                <p style={{ fontSize: 13, color: "#60A5FA", fontWeight: 600 }}>
                  ✓ Account created. Complete the steps below to get matched with global employers.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Your onboarding checklist:</p>
                {STEP_LABELS.slice(1).map((l, i) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                      ...(store.completedSteps.includes(i + 1)
                        ? { background: "linear-gradient(135deg, #0090FF, #6366F1)", color: "white" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }),
                    }}>
                      {store.completedSteps.includes(i + 1) ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 14, color: store.completedSteps.includes(i + 1) ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)" }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // ── Step 1: Personal Info ────────────────────────────────────
      case 1:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={headingSt}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Personal information</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>All data is securely stored and used only for employment matching.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="onboarding-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelSt}>First Name <span style={{ color: "#f87171" }}>*</span></label>
                  <input {...register("firstName")} className={inputClass("firstName")} placeholder="Ana" />
                  {E("firstName")}
                </div>
                <div>
                  <label style={labelSt}>Last Name <span style={{ color: "#f87171" }}>*</span></label>
                  <input {...register("lastName")} className={inputClass("lastName")} placeholder="Koci" />
                  {E("lastName")}
                </div>
              </div>
              <div>
                <label style={labelSt}>Date of Birth <span style={{ color: "#f87171" }}>*</span></label>
                <input type="date" {...register("dateOfBirth")} className={inputClass("dateOfBirth")} />
                {E("dateOfBirth")}
              </div>
              <div>
                <label style={labelSt}>Phone Number <span style={{ color: "#f87171" }}>*</span></label>
                <input type="tel" {...register("phone")} className={inputClass("phone")} placeholder="+355 69 123 4567" />
                {E("phone")}
              </div>
              <div>
                <label style={labelSt}>Country of Residence <span style={{ color: "#f87171" }}>*</span></label>
                <select {...register("countryOfResidence")} className={inputClass("countryOfResidence")} style={{ color: "#fff", background: "#0a1628" }}>
                  <option value="">Select country…</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {E("countryOfResidence")}
              </div>
              <div>
                <label style={labelSt}>City <span style={{ color: "#f87171" }}>*</span></label>
                <input {...register("city")} className={inputClass("city")} placeholder="Tirana" />
                {E("city")}
              </div>
              <div>
                <label style={labelSt}>Passport Number <span style={{ color: "#f87171" }}>*</span></label>
                <input {...register("passportNumber")} className={inputClass("passportNumber")} placeholder="AB1234567" maxLength={20}
                  onChange={e => { e.target.value = e.target.value.toUpperCase(); }} />
                <p style={helperSt}>📝 Text entry only — no document scan required</p>
                {E("passportNumber")}
              </div>
              <div>
                <label style={labelSt}>Marital Status</label>
                <select {...register("maritalStatus")} className={inputClass("maritalStatus")} style={{ color: "#fff", background: "#0a1628" }}>
                  <option value="">Select…</option>
                  {["Single","Married","Divorced","Widowed"].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>
        );

      // ── Step 2: Family ───────────────────────────────────────────
      case 2:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={headingSt}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Family details</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Required for visa applications and employment documentation.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelSt}>Father&apos;s Full Name <span style={{ color: "#f87171" }}>*</span></label>
                <input {...register("fatherName")} className={inputClass("fatherName")} placeholder="Arben Koci" />
                {E("fatherName")}
              </div>
              <div>
                <label style={labelSt}>Mother&apos;s Full Name <span style={{ color: "#f87171" }}>*</span></label>
                <input {...register("motherName")} className={inputClass("motherName")} placeholder="Erjola Koci" />
                {E("motherName")}
              </div>
              <div>
                <label style={labelSt}>Do you have a spouse/partner?</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {[["No", false], ["Yes", true]].map(([label, val]) => (
                    <button key={String(label)} type="button"
                      onClick={() => setHasSpouse(val as boolean)}
                      style={{
                        flex: 1, padding: "12px", borderRadius: 12,
                        fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s",
                        ...(hasSpouse === val
                          ? { border: "2px solid #0090FF", background: "rgba(0,144,255,0.15)", color: "#60A5FA" }
                          : { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)" }),
                      }}>
                      {String(label)}
                    </button>
                  ))}
                </div>
              </div>
              {hasSpouse && (
                <div>
                  <label style={labelSt}>Spouse&apos;s Full Name <span style={{ color: "#f87171" }}>*</span></label>
                  <input {...register("spouseName")} className={inputClass("spouseName")} placeholder="Full name" />
                  {E("spouseName")}
                </div>
              )}
              <div>
                <label style={labelSt}>Number of Children</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 16px" }}>
                  <button type="button" onClick={() => setChildren(c => Math.max(0, c - 1))}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.08)", fontWeight: 700, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", fontSize: 18 }}>−</button>
                  <span style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 700, color: "white" }}>{children}</span>
                  <button type="button" onClick={() => setChildren(c => Math.min(20, c + 1))}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,144,255,0.15)", fontWeight: 700, color: "#60A5FA", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", fontSize: 18 }}>+</button>
                </div>
              </div>
            </div>
          </div>
        );

      // ── Step 3: Skills ───────────────────────────────────────────
      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={headingSt}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Skills & experience</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Your skills power the AI matching engine.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ ...labelSt, marginBottom: 8 }}>Your Skills <span style={{ color: "#f87171" }}>*</span></label>
                <p style={{ ...helperSt, marginBottom: 8, marginTop: 0 }}>
                  Search and select skills — enter years of experience per skill
                </p>
                <SkillsMultiSelect
                  mode="worker"
                  value={selectedSkills}
                  onChange={setSelectedSkills}
                  error={stepErrors.skills}
                  placeholder="Search skills (e.g. Nursing, Welding, Python)…"
                />
              </div>
              <div>
                <label style={labelSt}>Years of Experience <span style={{ color: "#f87171" }}>*</span></label>
                <select {...register("yearsExperience")} className={inputClass("yearsExperience")} style={{ color: "#fff", background: "#0a1628" }}>
                  <option value="">Select…</option>
                  {["Less than 1 year","1–2 years","3–5 years","5–8 years","8–12 years","12+ years"].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                {E("yearsExperience")}
              </div>
              <div>
                <label style={{ ...labelSt, marginBottom: 10 }}>Languages Spoken</label>
                {languages.map((entry, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <select value={entry.language}
                      onChange={e => setLanguages(l => l.map((x, j) => j === i ? { ...x, language: e.target.value } : x))}
                      style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", fontSize: 14, color: "white", outline: "none" }}>
                      {LANGUAGES.map(l => <option key={l} style={{ background: "#0a1628" }}>{l}</option>)}
                    </select>
                    <select value={entry.proficiencyLevel}
                      onChange={e => setLanguages(l => l.map((x, j) => j === i ? { ...x, proficiencyLevel: e.target.value } : x))}
                      style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", fontSize: 14, color: "white", outline: "none" }}>
                      {LANG_LEVELS.map(l => <option key={l} style={{ background: "#0a1628" }}>{l}</option>)}
                    </select>
                    {i > 0 && (
                      <button type="button" onClick={() => setLanguages(l => l.filter((_, j) => j !== i))}
                        style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button"
                  onClick={() => setLanguages(l => [...l, { language: "French", proficiencyLevel: "A2 – Elementary" }])}
                  style={{ width: "100%", padding: "10px", border: "2px dashed rgba(0,144,255,0.3)", borderRadius: 12, background: "transparent", color: "#60A5FA", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                  + Add language
                </button>
              </div>
            </div>
          </div>
        );

      // ── Step 4: Preferences ──────────────────────────────────────
      case 4:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={headingSt}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Work preferences</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Tell us where and how you want to work.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelSt}>Expected Monthly Salary <span style={{ color: "#f87171" }}>*</span></label>
                <select {...register("expectedSalary")} className={inputClass("expectedSalary")} style={{ color: "#fff", background: "#0a1628" }}>
                  <option value="">Select range…</option>
                  {SALARY_RANGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {E("expectedSalary")}
              </div>
              <div>
                <label style={{ ...labelSt, marginBottom: 10 }}>Target Countries <span style={{ color: "#f87171" }}>*</span></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {TARGET_COUNTRIES.map(c => (
                    <button key={c} type="button"
                      onClick={() => setSelectedCountries(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c])}
                      style={selectedCountries.includes(c) ? pillSel : pillOff}>
                      {selectedCountries.includes(c) && "✓ "}{c}
                    </button>
                  ))}
                </div>
                {E("targetCountries")}
              </div>
              <div>
                <label style={labelSt}>Preferred Visa Type <span style={{ color: "#f87171" }}>*</span></label>
                <select {...register("visaTypePreference")} className={inputClass("visaTypePreference")} style={{ color: "#fff", background: "#0a1628" }}>
                  <option value="">Select…</option>
                  {VISA_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {E("visaTypePreference")}
              </div>
              <div>
                <label style={labelSt}>Earliest Availability</label>
                <input type="date" {...register("availabilityDate")} className={inputClass("availabilityDate")} />
              </div>
              <div>
                <label style={labelSt}>Additional Notes</label>
                <textarea {...register("additionalNotes")} rows={3}
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px", fontSize: 15, color: "white", outline: "none", resize: "none", boxSizing: "border-box" }}
                  className="worker-textarea"
                  placeholder="Driving licence, immediate availability, etc." />
              </div>
            </div>
          </div>
        );

      // ── Step 5: Documents ────────────────────────────────────────
      case 5:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={headingSt}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Upload documents</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Files are encrypted and stored securely.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{completedUploads} of 4 uploaded</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#60A5FA" }}>{Math.round((completedUploads / 4) * 100)}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "linear-gradient(90deg, #0090FF, #6366F1)", borderRadius: 2, transition: "width 0.5s", width: `${(completedUploads / 4) * 100}%` }} />
              </div>
              {FILE_TYPES.map(({ key, label, icon, hint }) => {
                const entry    = store.uploads[key];
                const isDone   = entry?.status === "done";
                const isLoading = entry?.status === "uploading";
                const isError  = entry?.status === "error";

                return (
                  <div key={key} style={{
                    border: isDone
                      ? "2px solid rgba(0,144,255,0.3)"
                      : isError
                      ? "2px solid rgba(239,68,68,0.3)"
                      : "2px dashed rgba(255,255,255,0.1)",
                    background: isDone
                      ? "rgba(0,144,255,0.08)"
                      : isError
                      ? "rgba(239,68,68,0.08)"
                      : "rgba(255,255,255,0.03)",
                    borderRadius: 16,
                    padding: 16,
                    transition: "all 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 24 }}>{isDone ? "✅" : icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{label}</div>
                        {isDone ? (
                          <div style={{ fontSize: 12, color: "#60A5FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.fileName}</div>
                        ) : isError ? (
                          <div style={{ fontSize: 12, color: "#f87171" }}>{entry.errorMsg}</div>
                        ) : isLoading ? (
                          <div>
                            <div style={{ fontSize: 12, color: "#60A5FA", marginBottom: 4 }}>Uploading… {entry.progress}%</div>
                            <div style={{ height: 3, background: "rgba(0,144,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", background: "linear-gradient(90deg, #0090FF, #6366F1)", borderRadius: 2, transition: "width 0.3s", width: `${entry.progress}%` }} />
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{hint}</div>
                        )}
                      </div>
                      {isDone ? (
                        <button type="button" onClick={() => store.removeUpload(key)}
                          style={{ fontSize: 12, color: "#f87171", fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                      ) : !isLoading && (
                        <label style={{ cursor: "pointer" }}>
                          <input type="file" className="hidden"
                            accept={key === "PROFILE_PHOTO" ? "image/jpeg,image/png,image/webp" : key.includes("VIDEO") ? "video/mp4,video/quicktime" : "application/pdf,image/jpeg,image/png"}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(key, f); }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#60A5FA", background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 8, padding: "5px 12px" }}>Upload</span>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ background: "rgba(0,144,255,0.08)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 12, padding: "12px 14px" }}>
                <p style={{ fontSize: 12, color: "#60A5FA" }}>
                  📸 Profile photo and at least one video are required before your profile becomes searchable. Other documents can be added later.
                </p>
              </div>
            </div>
          </div>
        );

      // ── Step 6: Review ───────────────────────────────────────────
      case 6:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={headingSt}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Review & submit</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Check your details. Tap any section to edit.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {store.submitError && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#f87171" }}>⚠ {store.submitError}</div>
              )}
              {[
                { label: "Personal Info", step: 1, rows: [
                  { k: "Name",     v: `${store.stepData[1]?.firstName ?? ""} ${store.stepData[1]?.lastName ?? ""}`.trim() || "—" },
                  { k: "Country",  v: (store.stepData[1]?.countryOfResidence as string) || "—" },
                  { k: "City",     v: (store.stepData[1]?.city as string) || "—" },
                  { k: "Passport", v: store.stepData[1]?.passportNumber ? "••••••" + String(store.stepData[1].passportNumber).slice(-3) : "—" },
                ]},
                { label: "Family", step: 2, rows: [
                  { k: "Father",   v: (store.stepData[2]?.fatherName as string) || "—" },
                  { k: "Mother",   v: (store.stepData[2]?.motherName as string) || "—" },
                  { k: "Children", v: String(store.stepData[2]?.numberOfChildren ?? 0) },
                ]},
                { label: "Skills", step: 3, rows: [
                  { k: "Skills",     v: selectedSkills.map(s => s.label).slice(0, 4).join(", ") + (selectedSkills.length > 4 ? ` +${selectedSkills.length - 4}` : "") || "—" },
                  { k: "Experience", v: (store.stepData[3]?.yearsExperience as string) || "—" },
                ]},
                { label: "Preferences", step: 4, rows: [
                  { k: "Salary",    v: (store.stepData[4]?.expectedSalary as string) || "—" },
                  { k: "Countries", v: selectedCountries.slice(0, 2).join(", ") + (selectedCountries.length > 2 ? ` +${selectedCountries.length - 2}` : "") || "—" },
                ]},
                { label: "Documents", step: 5, rows: FILE_TYPES.map(f => ({
                  k: f.label, v: store.uploads[f.key]?.status === "done" ? "✓ Uploaded" : "— Not uploaded",
                }))},
              ].map(({ label, step, rows }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{label}</span>
                    <button type="button" onClick={() => { setDirection("bwd"); setUiStep(step); }}
                      style={{ background: "none", border: "none", fontSize: 13, color: "#60A5FA", fontWeight: 600, cursor: "pointer", padding: 0 }}>Edit</button>
                  </div>
                  <div style={{ padding: "4px 16px" }}>
                    {rows.map(({ k, v }, ri) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: ri < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", width: 100, flexShrink: 0 }}>{k}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", flex: 1, color: v.includes("✓") ? "#60A5FA" : v === "—" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: "12px 14px" }}>
                <p style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>
                  ✓ By submitting you confirm all information is accurate and consent to secure data processing for employment matching.
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  const isLastStep = uiStep === TOTAL_STEPS - 1;

  return (
    <>
      <style>{`
        @media (min-width: 640px) { .step-label { display: block !important; } }
        @media (max-width: 640px) {
          .onboarding-topbar {
            padding: 0 1rem !important;
          }
          .onboarding-topbar > span {
            display: none !important;
          }
          .onboarding-stepper {
            padding: 1rem !important;
            overflow-x: hidden !important;
          }
          .onboarding-scroll {
            padding: 1rem 0.75rem !important;
          }
          .onboarding-card {
            border-radius: 16px !important;
          }
          .onboarding-card-body {
            padding: 1.25rem 1rem 1.5rem !important;
          }
          .onboarding-actions {
            padding: 0.85rem 0.75rem calc(0.85rem + env(safe-area-inset-bottom)) !important;
          }
          .onboarding-actions-inner {
            flex-direction: column-reverse !important;
            gap: 10px !important;
          }
          .onboarding-actions-inner button {
            width: 100% !important;
            justify-content: center !important;
          }
          .onboarding-grid-2 {
            grid-template-columns: 1fr !important;
          }
          .worker-input,
          .worker-textarea {
            font-size: 16px !important;
          }
        }
        .worker-input::placeholder { color: rgba(255,255,255,0.25) !important; }
        .worker-input:focus { border-color: #0090FF !important; background: rgba(0,144,255,0.06) !important; }
        .worker-input option { background: #0a1628; color: #ffffff; }
        .worker-input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.35); }
        .worker-textarea:focus { border-color: #0090FF !important; outline: none; }
        .worker-textarea::placeholder { color: rgba(255,255,255,0.25); }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#010913", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="onboarding-topbar" style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(5,13,26,0.95)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "0 2rem",
          height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #0090FF, #6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "#fff" }}>DH</div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: "-0.3px" }}>DirectHire</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>
            Worker Onboarding — {STEP_LABELS[uiStep]}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SaveIndicator />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#60A5FA", background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.2)", borderRadius: 20, padding: "3px 10px", letterSpacing: "0.04em" }}>Worker</span>
          </div>
        </header>

        {/* ── Premium Stepper ──────────────────────────────────────── */}
        <div className="onboarding-stepper" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1.25rem 2rem" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: "1rem" }}>
              {STEP_LABELS.map((label, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" }}>
                  {i < STEP_LABELS.length - 1 && (
                    <div style={{
                      position: "absolute", top: 16, left: "60%", right: "-40%",
                      height: 2, zIndex: 0,
                      background: i < uiStep
                        ? "linear-gradient(90deg, #0090FF, #6366F1)"
                        : "rgba(255,255,255,0.08)",
                      transition: "background 0.3s",
                    }} />
                  )}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", zIndex: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    background: i < uiStep
                      ? "linear-gradient(135deg, #0090FF, #6366F1)"
                      : i === uiStep
                      ? "rgba(0,144,255,0.15)"
                      : "rgba(255,255,255,0.05)",
                    border: i === uiStep
                      ? "2px solid #0090FF"
                      : i < uiStep
                      ? "none"
                      : "2px solid rgba(255,255,255,0.1)",
                    color: i <= uiStep ? "#fff" : "rgba(255,255,255,0.3)",
                    transition: "all 0.3s",
                    boxShadow: i === uiStep ? "0 0 12px rgba(0,144,255,0.4)" : i < uiStep ? "0 2px 8px rgba(0,144,255,0.3)" : "none",
                  }}>
                    {i < uiStep ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : i + 1}
                  </div>
                  <span className="step-label" style={{
                    fontSize: 10, fontWeight: i === uiStep ? 600 : 400,
                    color: i === uiStep ? "#60A5FA" : i < uiStep ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
                    marginTop: 6, textAlign: "center", whiteSpace: "nowrap",
                    display: "none",
                  }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: "linear-gradient(90deg, #0090FF, #6366F1)",
                width: `${((uiStep + 1) / TOTAL_STEPS) * 100}%`,
                transition: "width 0.5s ease",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Step {uiStep + 1} of {TOTAL_STEPS}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{Math.round(((uiStep + 1) / TOTAL_STEPS) * 100)}% complete</span>
            </div>
          </div>
        </div>

        {/* ── Step Content ─────────────────────────────────────────── */}
        <div className="onboarding-scroll" style={{ flex: 1, overflowY: "auto", padding: "2rem 1rem" }}>
          <div className="onboarding-card" style={{
            maxWidth: 680, margin: "0 auto",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            overflow: "hidden",
          }}>
            <div className="onboarding-card-body" style={{ padding: "1.75rem 2rem 2rem" }}>
              {renderStep()}
            </div>
          </div>
        </div>

        {/* ── Sticky Footer ────────────────────────────────────────── */}
        <div className="onboarding-actions" style={{
          position: "sticky", bottom: 0,
          background: "rgba(5,13,26,0.95)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "1rem 1.5rem",
        }}>
          {stepErrors._form && (
            <div style={{ maxWidth: 680, margin: "0 auto 8px", fontSize: 12, color: "#f87171" }}>⚠ {stepErrors._form}</div>
          )}
          <div className="onboarding-actions-inner" style={{ maxWidth: 680, margin: "0 auto", display: "flex", gap: 12 }}>
            {uiStep > 0 && (
              <button type="button" onClick={goBack} style={{
                padding: "14px 24px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12, color: "rgba(255,255,255,0.7)",
                fontWeight: 600, fontSize: 14,
                cursor: "pointer", transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 6,
              }}>← Back</button>
            )}
            <button type="button" onClick={isLastStep ? handleFinalSubmit : goNext}
              disabled={store.isSaving || store.isSubmitting}
              style={{
                flex: 1, padding: "14px 24px",
                background: "linear-gradient(135deg, #0090FF, #6366F1)",
                border: "none", borderRadius: 12, color: "#fff",
                fontWeight: 700, fontSize: 15,
                cursor: "pointer", transition: "all 0.2s",
                boxShadow: "0 0 32px rgba(0,144,255,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: store.isSaving || store.isSubmitting ? 0.6 : 1,
              }}>
              {store.isSaving || store.isSubmitting
                ? <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                : isLastStep ? "Submit Application →" : "Continue →"}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
