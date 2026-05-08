"use client";
// src/app/(app)/employer/onboarding/page.tsx

import { useEffect, useState, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useOnboardingStore } from "@/lib/stores/onboarding.store";

const TOTAL_STEPS = 6;
const STEP_LABELS = ["Account", "Company ID", "Details", "Hiring Needs", "Plan", "Review"];

const INDUSTRIES = [
  "Healthcare & Social Care","Construction & Engineering","Information Technology",
  "Hospitality & Tourism","Manufacturing","Agriculture","Education",
  "Domestic Services","Transportation & Logistics","Finance & Accounting",
  "Retail & Sales","Security Services",
];
const COMPANY_SIZES = [
  "1–10 employees","11–50 employees","51–200 employees","201–500 employees","500+ employees",
];
const HIRING_COUNTRIES = [
  "United Kingdom 🇬🇧","Germany 🇩🇪","Italy 🇮🇹","France 🇫🇷","UAE 🇦🇪",
  "Canada 🇨🇦","Qatar 🇶🇦","Australia 🇦🇺","Malta 🇲🇹","Cyprus 🇨🇾","Netherlands 🇳🇱","Greece 🇬🇷",
];
const SKILLS = [
  "Nursing","Care Assistant","Elderly Care","First Aid","Childcare","Teaching",
  "Civil Engineering","Construction","Electrical","IT Support","Software Dev",
  "Accounting","Hospitality","Hotel Management","Cooking","Driving","Security","Cleaning",
];
const WORKER_COUNTS = ["1–3 workers","4–10 workers","11–25 workers","26–50 workers","50+ workers"];
const URGENCY_OPTIONS = ["Immediately","Within 1 month","1–3 months","3–6 months","Ongoing / no rush"];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "€149",
    period: "/month",
    features: ["5 active job posts","Up to 10 AI matches/job","Basic analytics","Email support"],
    color: "#64748B",
    highlight: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: "€349",
    period: "/month",
    features: ["20 active job posts","Unlimited AI matches","Worker Lock™ (3 concurrent)","Priority support","Advanced analytics"],
    color: "#1848CC",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Unlimited job posts","Dedicated account manager","Worker Lock™ (unlimited)","API access","White-glove onboarding"],
    color: "#0E7490",
    highlight: false,
  },
];

export default function EmployerOnboardingPage() {
  const router = useRouter();
  const store  = useOnboardingStore();

  const [uiStep, setUiStep]                   = useState(0);
  const [stepErrors, setStepErrors]           = useState<Record<string, string>>({});
  const [hiringCountries, setHiringCountries] = useState<string[]>([]);
  const [requiredSkills, setRequiredSkills]   = useState<string[]>([]);
  const [urgency, setUrgency]                 = useState("");
  const [selectedPlan, setSelectedPlan]       = useState("growth");
  const [logoUploaded, setLogoUploaded]       = useState(false);
  const [docUploaded, setDocUploaded]         = useState(false);
  const [logoUploading, setLogoUploading]     = useState(false);
  const [docUploading, setDocUploading]       = useState(false);

  const { register, getValues, watch } = useForm({ mode: "onChange" });
  const descValue = watch("businessDescription") ?? "";

  useEffect(() => {
    if (!store.isLoaded) {
      store.loadProgress().then(() => {
        setUiStep(Math.min(store.currentStep, TOTAL_STEPS - 1));
        const s3 = store.stepData[3] ?? {};
        if (s3.hiringCountries)  setHiringCountries(s3.hiringCountries as string[]);
        if (s3.requiredSkills)   setRequiredSkills(s3.requiredSkills as string[]);
        if (s3.urgency)          setUrgency(s3.urgency as string);
        if (s3.subscriptionPlan || store.stepData[4]?.subscriptionPlan)
          setSelectedPlan((store.stepData[4]?.subscriptionPlan as string) ?? "growth");
      });
    }
  }, []);

  const E = (f: string) => stepErrors[f]
    ? <p style={{ fontSize: 12, color: "#f87171", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>⚠ {stepErrors[f]}</p>
    : null;

  const inputCls = (f: string) =>
    `employer-input w-full rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all ${
      stepErrors[f]
        ? "border-2 border-red-500 bg-red-500/10 text-white placeholder-red-300"
        : "border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] text-white placeholder-[rgba(255,255,255,0.25)] focus:border-[#0E7490] focus:bg-[rgba(14,116,144,0.06)]"
    }`;

  const SaveIndicator = () =>
    store.isSaving ? (
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "rgba(255,255,255,0.6)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
        Saving…
      </span>
    ) : store.lastSavedAt ? (
      <span style={{ fontSize: 12, color: "#2DD4BF", fontWeight: 600 }}>✓ Saved</span>
    ) : null;

  const goNext = async () => {
    const vals = getValues();
    const errs: Record<string, string> = {};

    if (uiStep === 1) {
      if (!vals.companyName?.trim())     errs.companyName     = "Company name required";
      if (!vals.nipt?.trim())            errs.nipt            = "NIPT required";
      else if (vals.nipt.length < 6)     errs.nipt            = "Minimum 6 characters";
      if (!vals.administratorId?.trim()) errs.administratorId = "Administrator ID required";
      if (vals.website && !/^https?:\/\//.test(vals.website)) errs.website = "Must start with https://";
    }
    if (uiStep === 2) {
      if (!vals.industry)                     errs.industry            = "Industry required";
      if (!vals.companySize)                  errs.companySize         = "Company size required";
      if (!vals.address?.trim())              errs.address             = "Address required";
      if (!vals.contactPhone?.trim())         errs.contactPhone        = "Phone required";
      if (!vals.businessDescription?.trim())  errs.businessDescription = "Description required";
      else if (vals.businessDescription.length < 30) errs.businessDescription = "Minimum 30 characters";
    }
    if (uiStep === 3) {
      if (hiringCountries.length === 0) errs.hiringCountries = "Select at least one country";
      if (requiredSkills.length === 0)  errs.requiredSkills  = "Select at least one skill";
      if (!vals.workerCount)            errs.workerCount     = "Worker count required";
    }

    if (Object.keys(errs).length > 0) { setStepErrors(errs); return; }
    setStepErrors({});

    let payload: Record<string, unknown> = {};
    if (uiStep === 1) {
      payload = {
        companyName:     vals.companyName,
        nipt:            vals.nipt,
        qkr:             vals.qkr,
        administratorId: vals.administratorId,
        website:         vals.website,
      };
    } else if (uiStep === 2) {
      payload = {
        industry:            vals.industry,
        companySize:         vals.companySize,
        address:             vals.address,
        phone:               vals.contactPhone,
        businessDescription: vals.businessDescription,
      };
    } else if (uiStep === 3) {
      payload = {
        hiringCountries,
        requiredSkills,
        workerCount: vals.workerCount,
        urgency,
        additionalNotes: vals.additionalNotes,
      };
    } else if (uiStep === 4) {
      payload = { subscriptionPlan: selectedPlan };
    }

    if (uiStep >= 1 && uiStep <= 4) {
      const saved = await store.saveStep(uiStep, payload);
      if (!saved) { setStepErrors({ _form: store.saveError ?? "Failed to save. Please try again." }); return; }
    }

    setUiStep(s => Math.min(s + 1, TOTAL_STEPS - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStepErrors({});
    setUiStep(s => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    const ok = await store.submitOnboarding();
    if (ok) router.push("/employer/dashboard?submitted=1");
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    await store.uploadFile("COMPANY_LOGO", file);
    setLogoUploaded(true);
    setLogoUploading(false);
  };

  const handleDocUpload = async (file: File) => {
    setDocUploading(true);
    await store.uploadFile("BUSINESS_DOCUMENT", file);
    setDocUploaded(true);
    setDocUploading(false);
  };

  const labelSt: React.CSSProperties = {
    fontSize: 13, fontWeight: 600,
    color: "rgba(255,255,255,0.7)",
    display: "block", marginBottom: 6,
  };
  const helperSt: React.CSSProperties = {
    fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4,
  };
  const pillSelected: React.CSSProperties = {
    background: "rgba(14,116,144,0.15)",
    border: "2px solid #0E7490",
    color: "#2DD4BF",
    padding: "8px 14px", borderRadius: 99,
    fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
  };
  const pillUnselected: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.6)",
    padding: "8px 14px", borderRadius: 99,
    fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
  };
  const textareaSt = (hasErr: boolean): React.CSSProperties => ({
    width: "100%", borderRadius: 12, padding: "12px 16px",
    fontSize: 15, color: "white", outline: "none", resize: "none",
    transition: "border-color 0.2s, background 0.2s",
    boxSizing: "border-box",
    background: hasErr ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
    border: hasErr ? "2px solid #ef4444" : "1px solid rgba(255,255,255,0.1)",
  });

  const renderStep = () => {
    switch (uiStep) {

      // ── Step 0: Account ──────────────────────────────────────────
      case 0:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Employer account created</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Complete your company profile to access AI-ranked global talent.</p>
            </div>
            <div style={{ background: "rgba(14,116,144,0.08)", border: "1px solid rgba(14,116,144,0.25)", borderRadius: 14, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, color: "#2DD4BF", fontWeight: 600 }}>✓ Account active. Complete 5 steps to start hiring.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {STEP_LABELS.slice(1).map((label, i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    ...(store.completedSteps.includes(i + 1)
                      ? { background: "linear-gradient(135deg, #0E7490, #0891b2)", color: "white" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.1)" }),
                  }}>
                    {store.completedSteps.includes(i + 1) ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 14, color: store.completedSteps.includes(i + 1) ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)" }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12 }}>What you get</p>
              {["AI-ranked global candidates","Worker Lock™ exclusive hiring","Automated matching & scoring","24h verification"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ color: "#2DD4BF", fontWeight: 700, fontSize: 13 }}>✓</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        );

      // ── Step 1: Company Identity ─────────────────────────────────
      case 1:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Company identity</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Legal registration details for verification.</p>
            </div>
            <div>
              <label style={labelSt}>Company Name <span style={{ color: "#f87171" }}>*</span></label>
              <input {...register("companyName")} className={inputCls("companyName")} placeholder="TechCorp Ltd." />
              {E("companyName")}
            </div>
            <div>
              <label style={labelSt}>NIPT (Tax ID) <span style={{ color: "#f87171" }}>*</span></label>
              <input {...register("nipt")} className={inputCls("nipt")} placeholder="e.g. J81234567K"
                onChange={e => { e.target.value = e.target.value.toUpperCase(); }} />
              <p style={helperSt}>Your national business registration/tax number</p>
              {E("nipt")}
            </div>
            <div>
              <label style={labelSt}>QKR Number <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(optional)</span></label>
              <input {...register("qkr")} className={inputCls("qkr")} placeholder="Chamber of Commerce number" />
            </div>
            <div>
              <label style={labelSt}>Administrator ID <span style={{ color: "#f87171" }}>*</span></label>
              <input {...register("administratorId")} className={inputCls("administratorId")} placeholder="National ID of registered representative" />
              <p style={helperSt}>🔒 Stored encrypted — used for verification only</p>
              {E("administratorId")}
            </div>
            <div>
              <label style={labelSt}>Company Website <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(optional)</span></label>
              <input type="url" {...register("website")} className={inputCls("website")} placeholder="https://www.company.com" />
              {E("website")}
            </div>
            <div>
              <label style={labelSt}>Company Logo <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(optional)</span></label>
              <label style={{
                display: "flex", alignItems: "center", gap: 12,
                border: logoUploaded ? "2px solid rgba(14,116,144,0.3)" : "2px dashed rgba(255,255,255,0.1)",
                background: logoUploaded ? "rgba(14,116,144,0.08)" : "rgba(255,255,255,0.03)",
                borderRadius: 16, padding: "14px 16px",
                cursor: "pointer", transition: "all 0.2s",
              }}>
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/svg+xml,image/webp"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
                <span style={{ fontSize: 22 }}>{logoUploaded ? "✅" : "🏢"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{logoUploaded ? "Logo uploaded" : "Upload Logo"}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{logoUploaded ? "Tap to replace" : "PNG, SVG or JPG · max 2MB"}</div>
                </div>
                {logoUploading && <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(45,212,191,0.3)", borderTopColor: "#2DD4BF", animation: "spin 0.7s linear infinite" }} />}
              </label>
            </div>
          </div>
        );

      // ── Step 2: Company Details ──────────────────────────────────
      case 2:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Company details</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Help workers understand who they&apos;d be working for.</p>
            </div>
            <div>
              <label style={labelSt}>Industry <span style={{ color: "#f87171" }}>*</span></label>
              <select {...register("industry")} className={inputCls("industry")}>
                <option value="">Select industry…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              {E("industry")}
            </div>
            <div>
              <label style={labelSt}>Company Size <span style={{ color: "#f87171" }}>*</span></label>
              <select {...register("companySize")} className={inputCls("companySize")}>
                <option value="">Select size…</option>
                {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {E("companySize")}
            </div>
            <div>
              <label style={labelSt}>Business Address <span style={{ color: "#f87171" }}>*</span></label>
              <input {...register("address")} className={inputCls("address")} placeholder="Full registered address" />
              {E("address")}
            </div>
            <div>
              <label style={labelSt}>Contact Phone <span style={{ color: "#f87171" }}>*</span></label>
              <input type="tel" {...register("contactPhone")} className={inputCls("contactPhone")} placeholder="+44 20 1234 5678" />
              {E("contactPhone")}
            </div>
            <div>
              <label style={labelSt}>Business Description <span style={{ color: "#f87171" }}>*</span></label>
              <textarea {...register("businessDescription")} rows={5}
                className="employer-textarea"
                style={textareaSt(!!stepErrors.businessDescription)}
                placeholder="What does your company do? What type of workers do you hire and why?" />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                {E("businessDescription")}
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{descValue.length}/2000</span>
              </div>
            </div>
            <div>
              <label style={labelSt}>Business Registration Document <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(optional)</span></label>
              <label style={{
                display: "flex", alignItems: "center", gap: 12,
                border: docUploaded ? "2px solid rgba(14,116,144,0.3)" : "2px dashed rgba(255,255,255,0.1)",
                background: docUploaded ? "rgba(14,116,144,0.08)" : "rgba(255,255,255,0.03)",
                borderRadius: 16, padding: "14px 16px",
                cursor: "pointer", transition: "all 0.2s",
              }}>
                <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); }} />
                <span style={{ fontSize: 22 }}>{docUploaded ? "✅" : "📄"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{docUploaded ? "Document uploaded" : "Upload Registration Doc"}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>PDF or image · max 10MB · encrypted</div>
                </div>
                {docUploading && <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(45,212,191,0.3)", borderTopColor: "#2DD4BF", animation: "spin 0.7s linear infinite" }} />}
              </label>
            </div>
          </div>
        );

      // ── Step 3: Hiring Needs ─────────────────────────────────────
      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Hiring needs</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>This trains the AI to surface your ideal candidates.</p>
            </div>
            <div>
              <label style={{ ...labelSt, marginBottom: 10 }}>Countries You Hire From <span style={{ color: "#f87171" }}>*</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {HIRING_COUNTRIES.map(c => (
                  <button key={c} type="button"
                    onClick={() => setHiringCountries(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c])}
                    style={hiringCountries.includes(c) ? pillSelected : pillUnselected}>
                    {hiringCountries.includes(c) && "✓ "}{c}
                  </button>
                ))}
              </div>
              {E("hiringCountries")}
            </div>
            <div>
              <label style={{ ...labelSt, marginBottom: 10 }}>Required Skills <span style={{ color: "#f87171" }}>*</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SKILLS.map(s => (
                  <button key={s} type="button"
                    onClick={() => setRequiredSkills(sk => sk.includes(s) ? sk.filter(x => x !== s) : [...sk, s])}
                    style={requiredSkills.includes(s) ? pillSelected : pillUnselected}>
                    {requiredSkills.includes(s) && "✓ "}{s}
                  </button>
                ))}
              </div>
              {E("requiredSkills")}
            </div>
            <div>
              <label style={labelSt}>How many workers do you need? <span style={{ color: "#f87171" }}>*</span></label>
              <select {...register("workerCount")} className={inputCls("workerCount")}>
                <option value="">Select count…</option>
                {WORKER_COUNTS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              {E("workerCount")}
            </div>
            <div>
              <label style={{ ...labelSt, marginBottom: 10 }}>Hiring Urgency</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {URGENCY_OPTIONS.map(u => (
                  <button key={u} type="button"
                    onClick={() => setUrgency(v => v === u ? "" : u)}
                    style={urgency === u ? pillSelected : pillUnselected}>
                    {urgency === u && "✓ "}{u}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelSt}>Additional Requirements <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>(optional)</span></label>
              <textarea {...register("additionalNotes")} rows={3}
                className="employer-textarea"
                style={textareaSt(false)}
                placeholder="Driving licence required, English B2+, etc." />
            </div>
          </div>
        );

      // ── Step 4: Plan ─────────────────────────────────────────────
      case 4:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Choose your plan</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>14-day free trial on all plans. Cancel anytime.</p>
            </div>
            {PLANS.map(plan => (
              <button key={plan.id} type="button"
                onClick={() => setSelectedPlan(plan.id)}
                style={{
                  width: "100%", textAlign: "left", borderRadius: 16, padding: 20,
                  cursor: "pointer", transition: "all 0.2s", position: "relative",
                  background: selectedPlan === plan.id ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
                  borderWidth: selectedPlan === plan.id ? 2 : 1,
                  borderStyle: "solid",
                  borderColor: selectedPlan === plan.id ? plan.color : "rgba(255,255,255,0.08)",
                  boxShadow: selectedPlan === plan.id ? `0 4px 20px ${plan.color}20` : "none",
                }}>
                {plan.highlight && (
                  <div style={{
                    position: "absolute", top: -12, left: 16,
                    padding: "2px 12px", borderRadius: 99,
                    fontSize: 11, fontWeight: 700, color: "white",
                    background: plan.color,
                  }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: 17, color: "rgba(255,255,255,0.9)" }}>{plan.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 20, color: selectedPlan === plan.id ? plan.color : "rgba(255,255,255,0.85)" }}>
                      {plan.price}
                    </span>
                    {plan.period && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{plan.period}</span>}
                    {selectedPlan === plan.id && (
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontSize: 11, fontWeight: 700,
                        background: plan.color,
                      }}>✓</div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                      <span style={{ fontWeight: 700, color: plan.color }}>✓</span> {f}
                    </div>
                  ))}
                </div>
              </button>
            ))}
            <div style={{ background: "rgba(14,116,144,0.08)", border: "1px solid rgba(14,116,144,0.2)", borderRadius: 12, padding: "12px 14px" }}>
              <p style={{ fontSize: 12, color: "#2DD4BF" }}>
                💳 <strong>14-day free trial</strong> — no charge until trial ends. You can upgrade or cancel any time.
              </p>
            </div>
          </div>
        );

      // ── Step 5: Review ───────────────────────────────────────────
      case 5: {
        const d1 = store.stepData[1] ?? {};
        const d2 = store.stepData[2] ?? {};
        const d3 = store.stepData[3] ?? {};
        const plan = PLANS.find(p => p.id === selectedPlan);
        const sections = [
          {
            label: "Company Identity", step: 1,
            rows: [
              { k: "Company",  v: (d1.companyName as string) || "—" },
              { k: "NIPT",     v: (d1.nipt as string) || "—" },
              { k: "QKR",      v: (d1.qkr as string) || "—" },
              { k: "Admin ID", v: d1.administratorId ? "••••••" + String(d1.administratorId).slice(-3) : "—" },
              { k: "Logo",     v: logoUploaded ? "✓ Uploaded" : "Not uploaded" },
            ],
          },
          {
            label: "Company Details", step: 2,
            rows: [
              { k: "Industry", v: (d2.industry as string) || "—" },
              { k: "Size",     v: (d2.companySize as string) || "—" },
              { k: "Address",  v: (d2.address as string) || "—" },
              { k: "Reg. Doc", v: docUploaded ? "✓ Uploaded" : "Not uploaded" },
            ],
          },
          {
            label: "Hiring Needs", step: 3,
            rows: [
              { k: "Countries",       v: hiringCountries.slice(0, 2).join(", ") + (hiringCountries.length > 2 ? ` +${hiringCountries.length - 2}` : "") || "—" },
              { k: "Skills",          v: requiredSkills.slice(0, 3).join(", ") + (requiredSkills.length > 3 ? ` +${requiredSkills.length - 3}` : "") || "—" },
              { k: "Workers needed",  v: (d3.workerCount as string) || "—" },
              { k: "Urgency",         v: urgency || "—" },
            ],
          },
          {
            label: "Plan", step: 4,
            rows: [
              { k: "Plan",  v: plan?.name ?? "—" },
              { k: "Price", v: plan ? `${plan.price}${plan.period}` : "—" },
              { k: "Trial", v: "14 days free" },
            ],
          },
        ];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>Review & submit</h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65 }}>Check everything before activating your account.</p>
            </div>
            {store.submitError && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#f87171" }}>
                ⚠ {store.submitError}
              </div>
            )}
            {sections.map(({ label, step, rows }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{label}</span>
                  <button type="button" onClick={() => setUiStep(step)}
                    style={{ background: "none", border: "none", fontSize: 13, color: "#2DD4BF", fontWeight: 600, cursor: "pointer", padding: 0 }}>Edit</button>
                </div>
                <div style={{ padding: "4px 16px" }}>
                  {rows.map(({ k, v }, ri) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: ri < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", width: 110, flexShrink: 0 }}>{k}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", flex: 1, color: v.includes("✓") ? "#2DD4BF" : v === "—" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ background: "rgba(14,116,144,0.08)", border: "1px solid rgba(14,116,144,0.2)", borderRadius: 12, padding: "12px 14px" }}>
              <p style={{ fontSize: 12, color: "#2DD4BF", fontWeight: 600 }}>
                ✓ By submitting you confirm all information is accurate and agree to comply with Direct Hire employer terms and applicable labor law.
              </p>
            </div>
          </div>
        );
      }
    }
  };

  const isLast = uiStep === TOTAL_STEPS - 1;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .employer-input::placeholder { color: rgba(255,255,255,0.25) !important; }
        .employer-input:focus { border-color: #0E7490 !important; background: rgba(14,116,144,0.06) !important; }
        .employer-input option { background: #0a1628; color: #ffffff; }
        .employer-input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.35); }
        .employer-textarea:focus { border-color: #0E7490 !important; outline: none; }
        .employer-textarea::placeholder { color: rgba(255,255,255,0.25); }
        .employer-onboarding-card,
        .employer-onboarding-card * {
          max-width: 100%;
        }
        @media (max-width: 640px) {
          .employer-onboarding-topbar {
            padding: 12px 1rem !important;
          }
          .employer-onboarding-topbar > div:last-child {
            gap: 8px !important;
          }
          .employer-onboarding-stepper {
            padding: 14px 1rem 12px !important;
          }
          .employer-onboarding-scroll {
            padding: 1rem 0.75rem 0.5rem !important;
          }
          .employer-onboarding-card {
            border-radius: 16px !important;
            padding: 1.25rem 1rem !important;
          }
          .employer-onboarding-actions {
            padding: 0.85rem 0.75rem calc(0.85rem + env(safe-area-inset-bottom)) !important;
          }
          .employer-onboarding-actions-inner {
            flex-direction: column-reverse !important;
            gap: 10px !important;
          }
          .employer-onboarding-actions-inner button {
            width: 100% !important;
            justify-content: center !important;
          }
          .employer-input,
          .employer-textarea {
            font-size: 16px !important;
          }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#010913", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="employer-onboarding-topbar" style={{
          background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 20, backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg, #0090FF, #6366F1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,144,255,0.3)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95" />
                <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#fff", letterSpacing: "-0.03em" }}>
              Direct<span style={{ color: "#0090FF" }}>Hire</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SaveIndicator />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#2DD4BF", background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.2)", padding: "4px 10px", borderRadius: 99, letterSpacing: "0.04em" }}>Employer</span>
          </div>
        </div>

        {/* ── Premium Stepper ──────────────────────────────────────── */}
        <div className="employer-onboarding-stepper" style={{ padding: "16px 20px 14px", background: "rgba(255,255,255,0.015)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", maxWidth: 380, margin: "0 auto" }}>
            {STEP_LABELS.map((_, i) => {
              const isCompleted = i < uiStep;
              const isActive    = i === uiStep;
              return (
                <Fragment key={i}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    transition: "all 0.3s",
                    ...(isCompleted
                      ? { background: "linear-gradient(135deg, #0E7490, #0891b2)", color: "white", boxShadow: "0 2px 8px rgba(14,116,144,0.4)" }
                      : isActive
                      ? { border: "2px solid #0E7490", background: "rgba(14,116,144,0.15)", color: "#2DD4BF", boxShadow: "0 0 12px rgba(14,116,144,0.3)" }
                      : { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.2)" }),
                  }}>
                    {isCompleted ? "✓" : i + 1}
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div style={{
                      flex: 1, height: 1, margin: "0 3px",
                      transition: "background 0.3s",
                      background: i < uiStep
                        ? "linear-gradient(90deg, #0E7490, #0891b2)"
                        : "rgba(255,255,255,0.07)",
                    }} />
                  )}
                </Fragment>
              );
            })}
          </div>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Step {uiStep + 1} — {STEP_LABELS[uiStep]}
            </span>
          </div>
        </div>

        {/* ── Step Content ─────────────────────────────────────────── */}
        <div className="employer-onboarding-scroll" style={{ flex: 1, overflowY: "auto", padding: "24px 16px 8px" }}>
          <div className="employer-onboarding-card" style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: "28px 24px",
            marginBottom: 8,
          }}>
            {renderStep()}
          </div>
        </div>

        {/* ── Sticky Footer ────────────────────────────────────────── */}
        <div className="employer-onboarding-actions" style={{ position: "sticky", bottom: 0, background: "rgba(1,9,19,0.96)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 16px 20px" }}>
          {stepErrors._form && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8, fontWeight: 500 }}>⚠ {stepErrors._form}</div>}
          <div className="employer-onboarding-actions-inner" style={{ display: "flex", gap: 10 }}>
            {uiStep > 0 && (
              <button type="button" onClick={goBack}
                style={{ padding: "14px 20px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, color: "rgba(255,255,255,0.6)", fontWeight: 600, fontSize: 14, background: "rgba(255,255,255,0.04)", cursor: "pointer" }}>
                ← Back
              </button>
            )}
            <button type="button" onClick={isLast ? handleSubmit : goNext}
              disabled={store.isSaving || store.isSubmitting}
              style={{
                flex: 1, padding: "14px 20px", borderRadius: 14,
                fontWeight: 700, fontSize: 16, color: "white", border: "none",
                cursor: store.isSaving || store.isSubmitting ? "not-allowed" : "pointer",
                opacity: store.isSaving || store.isSubmitting ? 0.7 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.2s",
                background: "linear-gradient(135deg, #0E7490, #0891b2)",
                boxShadow: "0 0 32px rgba(14,116,144,0.35)",
              }}>
              {store.isSaving || store.isSubmitting
                ? <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin 0.7s linear infinite" }} />
                : isLast ? "Submit & Activate →" : "Continue →"}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
