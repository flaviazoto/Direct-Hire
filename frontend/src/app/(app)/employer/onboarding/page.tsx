"use client";
// src/app/(app)/employer/onboarding/page.tsx

import { useEffect, useState, useCallback } from "react";
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

  const [uiStep, setUiStep]           = useState(0);
  const [stepErrors, setStepErrors]   = useState<Record<string, string>>({});
  const [hiringCountries, setHiringCountries] = useState<string[]>([]);
  const [requiredSkills, setRequiredSkills]   = useState<string[]>([]);
  const [urgency, setUrgency]         = useState("");
  const [selectedPlan, setSelectedPlan] = useState("growth");
  const [logoUploaded, setLogoUploaded] = useState(false);
  const [docUploaded, setDocUploaded]  = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [docUploading, setDocUploading]  = useState(false);

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
    ? <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">⚠ {stepErrors[f]}</p>
    : null;

  const inputCls = (f: string) =>
    `w-full border-2 rounded-xl px-4 py-3.5 text-[15px] outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-100 ${stepErrors[f] ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"}`;

  const SaveIndicator = () =>
    store.isSaving ? (
      <span className="text-xs text-slate-400 flex items-center gap-1.5">
        <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin block" />
        Saving…
      </span>
    ) : store.lastSavedAt ? (
      <span className="text-xs text-teal-600 font-medium">✓ Saved</span>
    ) : null;

  const goNext = async () => {
    const vals = getValues();
    const errs: Record<string, string> = {};

    if (uiStep === 1) {
      if (!vals.companyName?.trim())    errs.companyName    = "Company name required";
      if (!vals.nipt?.trim())           errs.nipt           = "NIPT required";
      else if (vals.nipt.length < 6)    errs.nipt           = "Minimum 6 characters";
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

    // Build payload for this step
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

  const renderStep = () => {
    switch (uiStep) {
      case 0:
        return (
          <div className="px-6 pb-6 space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Employer account created</h2>
              <p className="text-sm text-slate-500 mt-1.5">Complete your company profile to access AI-ranked global talent.</p>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
              <p className="text-sm text-teal-800 font-semibold">✓ Account active. Complete 5 steps to start hiring.</p>
            </div>
            {STEP_LABELS.slice(1).map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${store.completedSteps.includes(i + 1) ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {store.completedSteps.includes(i + 1) ? "✓" : i + 1}
                </div>
                <span className="text-sm text-slate-700">{label}</span>
              </div>
            ))}
            <div className="border-2 border-slate-100 rounded-2xl p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3">What you get</p>
              {["AI-ranked global candidates","Worker Lock™ exclusive hiring","Automated matching & scoring","24h verification"].map(f => (
                <div key={f} className="flex items-center gap-2 mb-2">
                  <span className="text-teal-500 font-bold text-sm">✓</span>
                  <span className="text-sm text-slate-700">{f}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="px-6 pb-6 space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Company identity</h2>
              <p className="text-sm text-slate-500 mt-1.5">Legal registration details for verification.</p>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Company Name <span className="text-red-500">*</span></label>
              <input {...register("companyName")} className={inputCls("companyName")} placeholder="TechCorp Ltd." />
              {E("companyName")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">NIPT (Tax ID) <span className="text-red-500">*</span></label>
              <input {...register("nipt")} className={inputCls("nipt")} placeholder="e.g. J81234567K"
                onChange={e => { e.target.value = e.target.value.toUpperCase(); }} />
              <p className="text-xs text-slate-400 mt-1">Your national business registration/tax number</p>
              {E("nipt")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">QKR Number <span className="text-slate-400 font-normal">(optional)</span></label>
              <input {...register("qkr")} className={inputCls("qkr")} placeholder="Chamber of Commerce number" />
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Administrator ID <span className="text-red-500">*</span></label>
              <input {...register("administratorId")} className={inputCls("administratorId")} placeholder="National ID of registered representative" />
              <p className="text-xs text-slate-400 mt-1">🔒 Stored encrypted — used for verification only</p>
              {E("administratorId")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Company Website <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="url" {...register("website")} className={inputCls("website")} placeholder="https://www.company.com" />
              {E("website")}
            </div>
            {/* Logo upload */}
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-2 block">Company Logo <span className="text-slate-400 font-normal">(optional)</span></label>
              <label className={`flex items-center gap-3 border-2 rounded-2xl p-4 cursor-pointer transition-all ${logoUploaded ? "border-teal-400 bg-teal-50" : "border-dashed border-slate-200 hover:border-teal-300"}`}>
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/svg+xml,image/webp"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
                <span className="text-2xl">{logoUploaded ? "✅" : "🏢"}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{logoUploaded ? "Logo uploaded" : "Upload Logo"}</div>
                  <div className="text-xs text-slate-400">{logoUploaded ? "Tap to replace" : "PNG, SVG or JPG · max 2MB"}</div>
                </div>
                {logoUploading && <div className="w-5 h-5 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />}
              </label>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="px-6 pb-6 space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Company details</h2>
              <p className="text-sm text-slate-500 mt-1.5">Help workers understand who they'd be working for.</p>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Industry <span className="text-red-500">*</span></label>
              <select {...register("industry")} className={inputCls("industry")}>
                <option value="">Select industry…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              {E("industry")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Company Size <span className="text-red-500">*</span></label>
              <select {...register("companySize")} className={inputCls("companySize")}>
                <option value="">Select size…</option>
                {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {E("companySize")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Business Address <span className="text-red-500">*</span></label>
              <input {...register("address")} className={inputCls("address")} placeholder="Full registered address" />
              {E("address")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Contact Phone <span className="text-red-500">*</span></label>
              <input type="tel" {...register("contactPhone")} className={inputCls("contactPhone")} placeholder="+44 20 1234 5678" />
              {E("contactPhone")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Business Description <span className="text-red-500">*</span></label>
              <textarea {...register("businessDescription")} rows={5}
                className={`w-full border-2 rounded-xl px-4 py-3 text-[15px] outline-none transition-all focus:border-teal-500 resize-none ${stepErrors.businessDescription ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                placeholder="What does your company do? What type of workers do you hire and why?" />
              <div className="flex justify-between mt-1">
                {E("businessDescription")}
                <span className="text-xs text-slate-400 ml-auto">{descValue.length}/2000</span>
              </div>
            </div>
            {/* Business document upload */}
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-2 block">Business Registration Document <span className="text-slate-400 font-normal">(optional)</span></label>
              <label className={`flex items-center gap-3 border-2 rounded-2xl p-4 cursor-pointer transition-all ${docUploaded ? "border-teal-400 bg-teal-50" : "border-dashed border-slate-200 hover:border-teal-300"}`}>
                <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); }} />
                <span className="text-2xl">{docUploaded ? "✅" : "📄"}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{docUploaded ? "Document uploaded" : "Upload Registration Doc"}</div>
                  <div className="text-xs text-slate-400">PDF or image · max 10MB · encrypted</div>
                </div>
                {docUploading && <div className="w-5 h-5 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />}
              </label>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="px-6 pb-6 space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Hiring needs</h2>
              <p className="text-sm text-slate-500 mt-1.5">This trains the AI to surface your ideal candidates.</p>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-2 block">Countries You Hire From <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-2">
                {HIRING_COUNTRIES.map(c => (
                  <button key={c} type="button"
                    onClick={() => setHiringCountries(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c])}
                    className={`px-3 py-2 rounded-full border-2 text-[13px] font-semibold transition-all ${hiringCountries.includes(c) ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 bg-white"}`}>
                    {hiringCountries.includes(c) && "✓ "}{c}
                  </button>
                ))}
              </div>
              {E("hiringCountries")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-2 block">Required Skills <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-2">
                {SKILLS.map(s => (
                  <button key={s} type="button"
                    onClick={() => setRequiredSkills(sk => sk.includes(s) ? sk.filter(x => x !== s) : [...sk, s])}
                    className={`px-3 py-2 rounded-full border-2 text-[13px] font-semibold transition-all ${requiredSkills.includes(s) ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 bg-white"}`}>
                    {requiredSkills.includes(s) && "✓ "}{s}
                  </button>
                ))}
              </div>
              {E("requiredSkills")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">How many workers do you need? <span className="text-red-500">*</span></label>
              <select {...register("workerCount")} className={inputCls("workerCount")}>
                <option value="">Select count…</option>
                {WORKER_COUNTS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              {E("workerCount")}
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-2 block">Hiring Urgency</label>
              <div className="flex flex-wrap gap-2">
                {URGENCY_OPTIONS.map(u => (
                  <button key={u} type="button"
                    onClick={() => setUrgency(v => v === u ? "" : u)}
                    className={`px-3 py-2 rounded-full border-2 text-[13px] font-semibold transition-all ${urgency === u ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600"}`}>
                    {urgency === u && "✓ "}{u}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-slate-700 mb-1.5 block">Additional Requirements <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea {...register("additionalNotes")} rows={3}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-[15px] outline-none focus:border-teal-500 resize-none"
                placeholder="Driving licence required, English B2+, etc." />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="px-6 pb-6 space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Choose your plan</h2>
              <p className="text-sm text-slate-500 mt-1.5">14-day free trial on all plans. Cancel anytime.</p>
            </div>
            {PLANS.map(plan => (
              <button key={plan.id} type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full text-left rounded-2xl border-2 p-5 transition-all relative ${selectedPlan === plan.id ? `border-[${plan.color}] shadow-lg` : "border-slate-200"}`}
                style={{ borderColor: selectedPlan === plan.id ? plan.color : undefined, boxShadow: selectedPlan === plan.id ? `0 4px 20px ${plan.color}20` : undefined }}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-5 px-3 py-0.5 rounded-full text-[11px] font-bold text-white"
                    style={{ background: plan.color }}>
                    MOST POPULAR
                  </div>
                )}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="font-extrabold text-lg text-slate-900">{plan.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xl" style={{ color: selectedPlan === plan.id ? plan.color : "#0F172A" }}>
                      {plan.price}
                    </span>
                    {plan.period && <span className="text-sm text-slate-400">{plan.period}</span>}
                    {selectedPlan === plan.id && (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: plan.color }}>✓</div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="font-bold" style={{ color: plan.color }}>✓</span> {f}
                    </div>
                  ))}
                </div>
              </button>
            ))}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
              <p className="text-xs text-teal-800">
                💳 <strong>14-day free trial</strong> — no charge until trial ends. You can upgrade or cancel any time.
              </p>
            </div>
          </div>
        );

      case 5: {
        const d1 = store.stepData[1] ?? {};
        const d2 = store.stepData[2] ?? {};
        const d3 = store.stepData[3] ?? {};
        const plan = PLANS.find(p => p.id === selectedPlan);
        const sections = [
          {
            label: "Company Identity", step: 1,
            rows: [
              { k: "Company", v: (d1.companyName as string) || "—" },
              { k: "NIPT", v: (d1.nipt as string) || "—" },
              { k: "QKR", v: (d1.qkr as string) || "—" },
              { k: "Admin ID", v: d1.administratorId ? "••••••" + String(d1.administratorId).slice(-3) : "—" },
              { k: "Logo", v: logoUploaded ? "✓ Uploaded" : "Not uploaded" },
            ],
          },
          {
            label: "Company Details", step: 2,
            rows: [
              { k: "Industry", v: (d2.industry as string) || "—" },
              { k: "Size", v: (d2.companySize as string) || "—" },
              { k: "Address", v: (d2.address as string) || "—" },
              { k: "Reg. Doc", v: docUploaded ? "✓ Uploaded" : "Not uploaded" },
            ],
          },
          {
            label: "Hiring Needs", step: 3,
            rows: [
              { k: "Countries", v: hiringCountries.slice(0, 2).join(", ") + (hiringCountries.length > 2 ? ` +${hiringCountries.length - 2}` : "") || "—" },
              { k: "Skills", v: requiredSkills.slice(0, 3).join(", ") + (requiredSkills.length > 3 ? ` +${requiredSkills.length - 3}` : "") || "—" },
              { k: "Workers needed", v: (d3.workerCount as string) || "—" },
              { k: "Urgency", v: urgency || "—" },
            ],
          },
          {
            label: "Plan", step: 4,
            rows: [
              { k: "Plan", v: plan?.name ?? "—" },
              { k: "Price", v: plan ? `${plan.price}${plan.period}` : "—" },
              { k: "Trial", v: "14 days free" },
            ],
          },
        ];
        return (
          <div className="px-6 pb-6 space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Review & submit</h2>
              <p className="text-sm text-slate-500 mt-1.5">Check everything before activating your account.</p>
            </div>
            {store.submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                ⚠ {store.submitError}
              </div>
            )}
            {sections.map(({ label, step, rows }) => (
              <div key={label} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <span className="text-sm font-bold text-slate-800">{label}</span>
                  <button type="button" onClick={() => setUiStep(step)}
                    className="text-teal-600 text-sm font-semibold">Edit</button>
                </div>
                <div className="px-4 py-2">
                  {rows.map(({ k, v }) => (
                    <div key={k} className="flex justify-between py-2.5 border-b last:border-0 border-slate-100">
                      <span className="text-[13px] text-slate-500 w-32 flex-shrink-0">{k}</span>
                      <span className={`text-[13px] font-semibold text-right flex-1 ${v.includes("✓") ? "text-teal-600" : v === "—" ? "text-slate-400" : "text-slate-900"}`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
              <p className="text-xs text-teal-800 font-medium">
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
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-[430px] mx-auto">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#0E7490" opacity="0.9"/>
              <path d="M2 17l10 5 10-5" stroke="#0E7490" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-extrabold text-[15px] text-slate-900">Direct Hire</span>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator />
          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">Employer</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-4 pb-2 bg-white border-b border-slate-100">
        <div className="flex justify-between text-xs mb-2">
          <span className="font-bold text-teal-600 uppercase tracking-wide">Step {uiStep + 1} / {TOTAL_STEPS}</span>
          <span className="text-slate-400">{STEP_LABELS[uiStep]}</span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-teal-600 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${((uiStep + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pt-6">{renderStep()}</div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 px-5 py-4">
        {stepErrors._form && <div className="text-xs text-red-500 mb-2">⚠ {stepErrors._form}</div>}
        <div className="flex gap-3">
          {uiStep > 0 && (
            <button type="button" onClick={goBack}
              className="px-5 py-4 border-2 border-slate-200 rounded-2xl text-slate-600 font-semibold text-sm active:scale-95 transition-transform">
              ← Back
            </button>
          )}
          <button type="button" onClick={isLast ? handleSubmit : goNext}
            disabled={store.isSaving || store.isSubmitting}
            className="flex-1 py-4 rounded-2xl font-bold text-[16px] text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #0E7490, #0891b2)", boxShadow: "0 6px 20px rgba(14,116,144,0.3)" }}>
            {store.isSaving || store.isSubmitting
              ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : isLast ? "Submit & Activate →" : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
