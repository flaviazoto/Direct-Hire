'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { userApi } from '@/lib/api-client'

interface WorkerForm {
  firstName:          string
  lastName:           string
  nationality:        string
  countryOfResidence: string
  city:               string
  phone:              string
  profession:         string
  yearsExperience:    string
  expectedSalary:     string
  passportNumber:     string
  additionalNotes:    string
}

const EMPTY: WorkerForm = {
  firstName: '', lastName: '', nationality: '', countryOfResidence: '',
  city: '', phone: '', profession: '', yearsExperience: '', expectedSalary: '',
  passportNumber: '', additionalNotes: '',
}

const S = {
  page:   { minHeight: '100vh', background: 'var(--navy, #05080f)', padding: '24px 16px 64px' } as React.CSSProperties,
  card:   { background: '#0d1424', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '20px 20px' } as React.CSSProperties,
  label:  { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 6, display: 'block', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  input:  { width: '100%', height: 44, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '0 14px', fontSize: 14, color: '#f0f4ff', outline: 'none', boxSizing: 'border-box' as const },
  textarea: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#f0f4ff', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, lineHeight: 1.6 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 16 },
}

export default function WorkerProfileEditPage() {
  const router = useRouter()
  const [form, setForm]     = useState<WorkerForm>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    userApi.getProfile().then(res => {
      if (!res.success) { router.push('/login'); return }
      const p = (res.data as any)?.profile ?? {}
      setForm({
        firstName:          p.firstName          ?? '',
        lastName:           p.lastName           ?? '',
        nationality:        p.nationality        ?? '',
        countryOfResidence: p.countryOfResidence ?? '',
        city:               p.city               ?? '',
        phone:              p.phone              ?? '',
        profession:         p.profession         ?? '',
        yearsExperience:    p.yearsExperience    ?? '',
        expectedSalary:     p.expectedSalary     ?? '',
        passportNumber:     p.passportNumber     ?? '',
        additionalNotes:    p.additionalNotes    ?? '',
      })
      setLoading(false)
    })
  }, [])

  const autoSave = useCallback(async (patch: Partial<WorkerForm>) => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await userApi.updateProfile(patch)
      if (res.success) setSaved(true)
      else setError('Save failed — please try again')
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }, [])

  const handleChange = (field: keyof WorkerForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => autoSave({ [field]: value }), 800)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05080f' }}>
        <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#0090ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <Link
            href="/worker/profile"
            style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f0f4ff', flexShrink: 0 }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f0f4ff', margin: 0 }}>Edit Profile</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0' }}>Changes save automatically</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {saving && <span style={{ color: 'rgba(255,255,255,0.4)' }}>Saving…</span>}
            {saved && !saving && (
              <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={13} /> Saved
              </span>
            )}
            {error && <span style={{ color: '#f87171' }}>{error}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Personal Information */}
          <div style={S.card}>
            <p style={S.sectionTitle}>Personal information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={S.label}>First name</label>
                <input style={S.input} value={form.firstName} onChange={e => handleChange('firstName', e.target.value)} placeholder="First name" />
              </div>
              <div>
                <label style={S.label}>Last name</label>
                <input style={S.input} value={form.lastName} onChange={e => handleChange('lastName', e.target.value)} placeholder="Last name" />
              </div>
              <div>
                <label style={S.label}>Nationality</label>
                <input style={S.input} value={form.nationality} onChange={e => handleChange('nationality', e.target.value)} placeholder="e.g. Filipino" />
              </div>
              <div>
                <label style={S.label}>Country of residence</label>
                <input style={S.input} value={form.countryOfResidence} onChange={e => handleChange('countryOfResidence', e.target.value)} placeholder="e.g. Saudi Arabia" />
              </div>
              <div>
                <label style={S.label}>Current city</label>
                <input style={S.input} value={form.city} onChange={e => handleChange('city', e.target.value)} placeholder="e.g. Riyadh" />
              </div>
              <div>
                <label style={S.label}>Passport number</label>
                <input style={S.input} value={form.passportNumber} onChange={e => handleChange('passportNumber', e.target.value)} placeholder="P12345678" autoComplete="off" />
              </div>
              <div>
                <label style={S.label}>Phone number</label>
                <input style={S.input} value={form.phone} onChange={e => handleChange('phone', e.target.value)} placeholder="+1 555 123 4567" autoComplete="tel" />
              </div>
            </div>
          </div>

          {/* Work Preferences */}
          <div style={S.card}>
            <p style={S.sectionTitle}>Work preferences</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={S.label}>Profession / Job title</label>
                <input style={S.input} value={form.profession} onChange={e => handleChange('profession', e.target.value)} placeholder="e.g. Domestic Worker" />
              </div>
              <div>
                <label style={S.label}>Years of experience</label>
                <input style={S.input} value={form.yearsExperience} onChange={e => handleChange('yearsExperience', e.target.value)} placeholder="e.g. 5" />
              </div>
              <div>
                <label style={S.label}>Expected salary (USD / month)</label>
                <input style={S.input} value={form.expectedSalary} onChange={e => handleChange('expectedSalary', e.target.value)} placeholder="e.g. 400" />
              </div>
            </div>
          </div>

          {/* Bio */}
          <div style={S.card}>
            <p style={S.sectionTitle}>About you</p>
            <textarea
              style={{ ...S.textarea, minHeight: 120 }}
              value={form.additionalNotes}
              onChange={e => handleChange('additionalNotes', e.target.value)}
              rows={5}
              placeholder="Tell employers about your experience, strengths, and what you're looking for…"
            />
          </div>

          {/* Back link */}
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <Link href="/worker/profile" style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
              ← Back to profile
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
