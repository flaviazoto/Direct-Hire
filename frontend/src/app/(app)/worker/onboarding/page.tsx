"use client";
// src/app/(app)/worker/onboarding/page.tsx
// Full worker onboarding wizard — connected to backend APIs

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useOnboardingStore } from "@/lib/stores/onboarding.store";

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

// ── Skill and country constants ───────────────────────────────
const SKILLS = [
  "Nursing", "Care Assistant", "Elderly Care", "First Aid", "Childcare",
  "Teaching", "Civil Engineering", "Construction", "Electrical", "IT Support",
  "Software Dev", "Accounting", "Hospitality", "Hotel Management", "Cooking",
  "Driving", "Security", "Cleaning", "Agriculture", "Welding",
];
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
  { key: "PROFILE_PHOTO",       label: "Profile Photo",          icon: "📷", hint: "JPG/PNG, max 5MB" },
  { key: "WORK_VIDEO",          label: "30s Work Video",         icon: "🎥", hint: "MP4/MOV, max 50MB" },
  { key: "INTRO_VIDEO",         label: "30s Intro Video",        icon: "🎬", hint: "MP4/MOV, max 50MB" },
  { key: "MEDICAL_CERTIFICATE", label: "Medical Certificate",    icon: "📄", hint: "PDF/JPG, max 10MB" },
];

// ── Component ─────────────────────────────────────────────────
export default function WorkerOnboardingPage() {
  const router = useRouter();
  const store  = useOnboardingStore();
  const [uiStep, setUiStep] = useState(0);
  const [direction, setDirection] = useState<"fwd" | "bwd">("fwd");
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  // Step-level local state
  const [selectedSkills, setSelectedSkills]           = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries]     = useState<string[]>([]);
  const [languages, setLanguages]                     = useState([{ language: "English", proficiencyLevel: "B2 – Upper Intermediate" }]);
  const [hasSpouse, setHasSpouse]                     = useState(false);
  const [children, setChildren]                       = useState(0);

  const { register, handleSubmit, watch, getValues, formState: { errors } } = useForm({ mode: "onChange" });

  // Load server progress on mount
  useEffect(() => {
    if (!store.isLoaded) {
      store.loadProgress().then(() => {
        const saved = store.currentStep;
        setUiStep(Math.min(saved, TOTAL_STEPS - 1));

        // Restore step data
        const s1 = store.stepData[1] ?? {};
        const s2 = store.stepData[2] ?? {};
        const s3 = store.stepData[3] ?? {};
        const s4 = store.stepData[4] ?? {};
        if (s3.skills)          setSelectedSkills(s3.skills as string[]);
        if (s4.targetCountries) setSelectedCountries(s4.targetCountries as string[]);
        if (s3.languages)       setLanguages(s3.languages as typeof languages);
        if (s2.hasSpouse)       setHasSpouse(s2.hasSpouse as boolean);
        if (s2.numberOfChildren) setChildren(s2.numberOfChildren as number);
      });
    } else {
      setUiStep(Math.min(store.currentStep, TOTAL_STEPS - 1));
    }
  }, []);

  // Auto-save indicator
  const SaveIndicator = () =>
    store.isSaving ? (
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
        Saving…
      </div>
    ) : store.lastSavedAt ? (
      <div className="text-xs text-emerald-500 font-medium">✓ Saved</div>
    ) : null;

  // Validate and advance
  const goNext = async () => {
    const vals = getValues();
    const errs: Record<string, string> = {};

    // Per-step validation
    if (uiStep === 1) {
      if (!vals.firstName?.trim())    errs.firstName = "First name required";
      if (!vals.lastName?.trim())     errs.lastName  = "Last name required";
      if (!vals.dateOfBirth)          errs.dateOfBirth = "Date of birth required";
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

    // Build step payload
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
      stepPayload = { skills: selectedSkills, yearsExperience: vals.yearsExperience, languages };
    } else if (uiStep === 4) {
      stepPayload = {
        expectedSalary: vals.expectedSalary, targetCountries: selectedCountries,
        visaTypePreference: vals.visaTypePreference,
        availabilityDate: vals.availabilityDate, additionalNotes: vals.additionalNotes,
      };
    } else if (uiStep === 5) {
      // Uploads step — just advance
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
    if (ok) router.push("/worker/dashboard?submitted=1");
  };

  const handleFileUpload = async (fileType: string, file: File) => {
    await store.uploadFile(fileType, file);
  };

  const completedUploads = Object.values(store.uploads).filter(u => u.status === "done").length;

  // ── Render current step content ───────────────────────────
  const renderStep = () => {
    const E = (f: string) => stepErrors[f] ? (
      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">⚠ {stepErrors[f]}</p>
    ) : null;

    const inputClass = (f: string) =>
      `w-full border rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${stepErrors[f] ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`;

    switch (uiStep) {
      case 0:
        return (
          <div className="space-y-5 px-6 pb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">Create your account</h2>
              <p className="text-sm text-slate-500 mt-1.5">Your login details are already set — let's continue with your profile.</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800 font-medium">
                ✓ Account created. Complete the steps below to get matched with global employers.
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Your onboarding checklist:</p>
              {STEP_LABELS.slice(1).map((l, i) => (
                <div key={l} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${store.completedSteps.includes(i + 1) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {store.completedSteps.includes(i + 1) ? "✓" : i + 1}
                  </div>
                  <span className="text-sm text-slate-700">{l}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4 px-6 pb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Personal information</h2>
              <p className="text-sm text-slate-500 mt-1.5">All data is securely stored and used only for employment matching.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">First Name <span className="text-red-500">*</span></label>
                <input {...register("firstName")} className={inputClass("firstName")} placeholder="Ana" />
                {E("firstName")}
              </div>
              <div>
                <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Last Name <span className="text-red-500">*</span></label>
                <input {...register("lastName")} className={inputClass("lastName")} placeholder="Koci" />
                {E("lastName")}
              </div>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Date of Birth <span className="text-red-500">*</span></label>
              <input type="date" {...register("dateOfBirth")} className={inputClass("dateOfBirth")} />
              {E("dateOfBirth")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Phone Number <span className="text-red-500">*</span></label>
              <input type="tel" {...register("phone")} className={inputClass("phone")} placeholder="+355 69 123 4567" />
              {E("phone")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Country of Residence <span className="text-red-500">*</span></label>
              <select {...register("countryOfResidence")} className={inputClass("countryOfResidence")}>
                <option value="">Select country…</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {E("countryOfResidence")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">City <span className="text-red-500">*</span></label>
              <input {...register("city")} className={inputClass("city")} placeholder="Tirana" />
              {E("city")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">
                Passport Number <span className="text-red-500">*</span>
              </label>
              <input {...register("passportNumber")} className={inputClass("passportNumber")} placeholder="AB1234567" maxLength={20}
                onChange={e => { e.target.value = e.target.value.toUpperCase(); }} />
              <p className="text-xs text-slate-400 mt-1">📝 Text entry only — no document scan required</p>
              {E("passportNumber")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Marital Status</label>
              <select {...register("maritalStatus")} className={inputClass("maritalStatus")}>
                <option value="">Select…</option>
                {["Single","Married","Divorced","Widowed"].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4 px-6 pb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Family details</h2>
              <p className="text-sm text-slate-500 mt-1.5">Required for visa applications and employment documentation.</p>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Father's Full Name <span className="text-red-500">*</span></label>
              <input {...register("fatherName")} className={inputClass("fatherName")} placeholder="Arben Koci" />
              {E("fatherName")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Mother's Full Name <span className="text-red-500">*</span></label>
              <input {...register("motherName")} className={inputClass("motherName")} placeholder="Erjola Koci" />
              {E("motherName")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Do you have a spouse/partner?</label>
              <div className="flex gap-3">
                {[["No", false], ["Yes", true]].map(([label, val]) => (
                  <button key={String(label)} type="button"
                    onClick={() => setHasSpouse(val as boolean)}
                    className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${hasSpouse === val ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                    {String(label)}
                  </button>
                ))}
              </div>
            </div>
            {hasSpouse && (
              <div>
                <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Spouse's Full Name <span className="text-red-500">*</span></label>
                <input {...register("spouseName")} className={inputClass("spouseName")} placeholder="Full name" />
                {E("spouseName")}
              </div>
            )}
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Number of Children</label>
              <div className="flex items-center gap-4 border-2 border-slate-200 rounded-xl px-4 py-3">
                <button type="button" onClick={() => setChildren(c => Math.max(0, c - 1))}
                  className="w-8 h-8 rounded-full bg-slate-100 font-bold text-slate-700 flex items-center justify-center">−</button>
                <span className="flex-1 text-center text-lg font-bold text-slate-900">{children}</span>
                <button type="button" onClick={() => setChildren(c => Math.min(20, c + 1))}
                  className="w-8 h-8 rounded-full bg-blue-100 font-bold text-blue-700 flex items-center justify-center">+</button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-5 px-6 pb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Skills & experience</h2>
              <p className="text-sm text-slate-500 mt-1.5">Your skills power the AI matching engine.</p>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-3 block">Your Skills <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-2">
                {SKILLS.map(skill => (
                  <button key={skill} type="button"
                    onClick={() => setSelectedSkills(s => s.includes(skill) ? s.filter(x => x !== skill) : [...s, skill])}
                    className={`px-3 py-2 rounded-full border-2 text-[13px] font-semibold transition-all ${selectedSkills.includes(skill) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 bg-white"}`}>
                    {selectedSkills.includes(skill) && "✓ "}{skill}
                  </button>
                ))}
              </div>
              {E("skills")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Years of Experience <span className="text-red-500">*</span></label>
              <select {...register("yearsExperience")} className={inputClass("yearsExperience")}>
                <option value="">Select…</option>
                {["Less than 1 year","1–2 years","3–5 years","5–8 years","8–12 years","12+ years"].map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              {E("yearsExperience")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-3 block">Languages Spoken</label>
              {languages.map((entry, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select value={entry.language}
                    onChange={e => setLanguages(l => l.map((x, j) => j === i ? { ...x, language: e.target.value } : x))}
                    className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-blue-500">
                    {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                  </select>
                  <select value={entry.proficiencyLevel}
                    onChange={e => setLanguages(l => l.map((x, j) => j === i ? { ...x, proficiencyLevel: e.target.value } : x))}
                    className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-blue-500">
                    {LANG_LEVELS.map(l => <option key={l}>{l}</option>)}
                  </select>
                  {i > 0 && (
                    <button type="button" onClick={() => setLanguages(l => l.filter((_, j) => j !== i))}
                      className="w-11 h-11 rounded-xl bg-red-50 text-red-500 font-bold flex items-center justify-center">✕</button>
                  )}
                </div>
              ))}
              <button type="button"
                onClick={() => setLanguages(l => [...l, { language: "French", proficiencyLevel: "A2 – Elementary" }])}
                className="w-full py-2.5 border-2 border-dashed border-blue-200 rounded-xl text-blue-600 text-sm font-semibold mt-1">
                + Add language
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-5 px-6 pb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Work preferences</h2>
              <p className="text-sm text-slate-500 mt-1.5">Tell us where and how you want to work.</p>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Expected Monthly Salary <span className="text-red-500">*</span></label>
              <select {...register("expectedSalary")} className={inputClass("expectedSalary")}>
                <option value="">Select range…</option>
                {SALARY_RANGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {E("expectedSalary")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-3 block">Target Countries <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-2">
                {TARGET_COUNTRIES.map(c => (
                  <button key={c} type="button"
                    onClick={() => setSelectedCountries(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c])}
                    className={`px-3 py-2 rounded-full border-2 text-[13px] font-semibold transition-all ${selectedCountries.includes(c) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                    {selectedCountries.includes(c) && "✓ "}{c}
                  </button>
                ))}
              </div>
              {E("targetCountries")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Preferred Visa Type <span className="text-red-500">*</span></label>
              <select {...register("visaTypePreference")} className={inputClass("visaTypePreference")}>
                <option value="">Select…</option>
                {VISA_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              {E("visaTypePreference")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Earliest Availability</label>
              <input type="date" {...register("availabilityDate")} className={inputClass("availabilityDate")} />
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Additional Notes</label>
              <textarea {...register("additionalNotes")} rows={3}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-[15px] outline-none focus:border-blue-500 resize-none"
                placeholder="Driving licence, immediate availability, etc." />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4 px-6 pb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Upload documents</h2>
              <p className="text-sm text-slate-500 mt-1.5">Files are encrypted and stored securely.</p>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">{completedUploads} of 4 uploaded</span>
              <span className="text-sm font-bold text-blue-600">{Math.round((completedUploads / 4) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full transition-all duration-500"
                style={{ width: `${(completedUploads / 4) * 100}%` }} />
            </div>
            {FILE_TYPES.map(({ key, label, icon, hint }) => {
              const entry = store.uploads[key];
              const isDone = entry?.status === "done";
              const isLoading = entry?.status === "uploading";
              const isError = entry?.status === "error";

              return (
                <div key={key} className={`border-2 rounded-2xl p-4 transition-all ${isDone ? "border-emerald-400 bg-emerald-50" : isError ? "border-red-300 bg-red-50" : "border-dashed border-slate-200 bg-white"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{isDone ? "✅" : icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900">{label}</div>
                      {isDone ? (
                        <div className="text-xs text-emerald-600 font-medium truncate">{entry.fileName}</div>
                      ) : isError ? (
                        <div className="text-xs text-red-500">{entry.errorMsg}</div>
                      ) : isLoading ? (
                        <div>
                          <div className="text-xs text-blue-500 mb-1">Uploading… {entry.progress}%</div>
                          <div className="h-1 bg-blue-100 rounded-full">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${entry.progress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">{hint}</div>
                      )}
                    </div>
                    {isDone ? (
                      <button type="button" onClick={() => store.removeUpload(key)}
                        className="text-xs text-red-400 font-medium hover:text-red-600">Remove</button>
                    ) : !isLoading && (
                      <label className="cursor-pointer">
                        <input type="file" className="hidden"
                          accept={key === "PROFILE_PHOTO" ? "image/jpeg,image/png,image/webp" : key.includes("VIDEO") ? "video/mp4,video/quicktime" : "application/pdf,image/jpeg,image/png"}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(key, f); }} />
                        <span className="text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">Upload</span>
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs text-blue-800">
                📸 Profile photo and at least one video are required before your profile becomes searchable. Other documents can be added later.
              </p>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4 px-6 pb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Review & submit</h2>
              <p className="text-sm text-slate-500 mt-1.5">Check your details. Tap any section to edit.</p>
            </div>
            {store.submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠ {store.submitError}</div>
            )}
            {[
              { label: "Personal Info", step: 1, rows: [
                { k: "Name", v: `${store.stepData[1]?.firstName ?? ""} ${store.stepData[1]?.lastName ?? ""}`.trim() || "—" },
                { k: "Country", v: (store.stepData[1]?.countryOfResidence as string) || "—" },
                { k: "City", v: (store.stepData[1]?.city as string) || "—" },
                { k: "Passport", v: store.stepData[1]?.passportNumber ? "••••••" + String(store.stepData[1].passportNumber).slice(-3) : "—" },
              ]},
              { label: "Family", step: 2, rows: [
                { k: "Father", v: (store.stepData[2]?.fatherName as string) || "—" },
                { k: "Mother", v: (store.stepData[2]?.motherName as string) || "—" },
                { k: "Children", v: String(store.stepData[2]?.numberOfChildren ?? 0) },
              ]},
              { label: "Skills", step: 3, rows: [
                { k: "Skills", v: selectedSkills.slice(0, 4).join(", ") + (selectedSkills.length > 4 ? ` +${selectedSkills.length - 4}` : "") || "—" },
                { k: "Experience", v: (store.stepData[3]?.yearsExperience as string) || "—" },
              ]},
              { label: "Preferences", step: 4, rows: [
                { k: "Salary", v: (store.stepData[4]?.expectedSalary as string) || "—" },
                { k: "Countries", v: selectedCountries.slice(0, 2).join(", ") + (selectedCountries.length > 2 ? ` +${selectedCountries.length - 2}` : "") || "—" },
              ]},
              { label: "Documents", step: 5, rows: FILE_TYPES.map(f => ({
                k: f.label, v: store.uploads[f.key]?.status === "done" ? "✓ Uploaded" : "— Not uploaded",
              }))},
            ].map(({ label, step, rows }) => (
              <div key={label} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <span className="font-bold text-sm text-slate-800">{label}</span>
                  <button type="button" onClick={() => { setDirection("bwd"); setUiStep(step); }}
                    className="text-blue-600 text-sm font-semibold">Edit</button>
                </div>
                <div className="px-4 py-2">
                  {rows.map(({ k, v }) => (
                    <div key={k} className="flex justify-between py-2.5 border-b last:border-0 border-slate-100">
                      <span className="text-[13px] text-slate-500 w-28 flex-shrink-0">{k}</span>
                      <span className={`text-[13px] font-semibold text-right flex-1 ${v.includes("✓") ? "text-emerald-600" : v === "—" ? "text-slate-400" : "text-slate-900"}`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs text-emerald-800 font-medium">
                ✓ By submitting you confirm all information is accurate and consent to secure data processing for employment matching.
              </p>
            </div>
          </div>
        );
    }
  };

  const isLastStep = uiStep === TOTAL_STEPS - 1;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-[430px] mx-auto">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#1848CC" opacity="0.9"/>
              <path d="M2 17l10 5 10-5" stroke="#1848CC" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-extrabold text-[15px] text-slate-900">Direct Hire</span>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator />
          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">Worker</span>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 pt-4 pb-2 bg-white border-b border-slate-100">
        <div className="flex justify-between text-xs mb-2">
          <span className="font-bold text-blue-600 uppercase tracking-wide">Step {uiStep + 1} / {TOTAL_STEPS}</span>
          <span className="text-slate-400">{STEP_LABELS[uiStep]}</span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-600 to-sky-400 rounded-full transition-all duration-500"
            style={{ width: `${((uiStep + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto pt-6">
        {renderStep()}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 px-5 py-4 safe-area-bottom">
        {stepErrors._form && (
          <div className="text-xs text-red-500 mb-2 font-medium">⚠ {stepErrors._form}</div>
        )}
        <div className="flex gap-3">
          {uiStep > 0 && (
            <button type="button" onClick={goBack}
              className="px-5 py-4 border-2 border-slate-200 rounded-2xl text-slate-600 font-semibold text-sm flex items-center gap-1.5 active:scale-95 transition-transform">
              ← Back
            </button>
          )}
          <button
            type="button"
            onClick={isLastStep ? handleFinalSubmit : goNext}
            disabled={store.isSaving || store.isSubmitting}
            className="flex-1 py-4 rounded-2xl font-bold text-[16px] bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50">
            {store.isSaving || store.isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : isLastStep ? "Submit Application" : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
