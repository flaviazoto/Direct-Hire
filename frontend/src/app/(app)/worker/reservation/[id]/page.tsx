'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { workerApi } from '@/lib/api-client';
import { LoadingPage } from '@/components/ui';

interface LockDetail {
  id: string;
  lockStatus: string;
  lockStartDate: string | null;
  lockExpiryDate: string | null;
  lockDays: number | null;
  releaseReason?: string | null;
  createdAt: string;
  employer?: { company_name?: string | null } | null;
  timeline?: { event: string; notes: string | null; occurred_at: string }[];
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysRemaining(expiry?: string | null) {
  if (!expiry) return 0;
  const date = new Date(expiry);
  if (isNaN(date.getTime())) return 0;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (24 * 3600 * 1000)));
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE:     { label: 'Active',     color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)'  },
  EXPIRED:    { label: 'Expired',    color: '#71717a', bg: 'rgba(113,113,122,0.08)', border: 'rgba(113,113,122,0.2)' },
  RELEASED:   { label: 'Released',   color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)'   },
  OVERRIDDEN: { label: 'Overridden', color: '#71717a', bg: 'rgba(113,113,122,0.08)', border: 'rgba(113,113,122,0.2)' },
};

function ReservationDetailContent() {
  const { id } = useParams<{ id: string }>();
  const [lock, setLock] = useState<LockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workerApi.getLockDetail(id).then(res => {
      if (res.success) setLock(res.data as LockDetail);
      else setError(res.error ?? 'Could not load reservation details');
      setLoading(false);
    });
  }, [id]);

  if (loading) return <LoadingPage color="blue" />;

  if (error || !lock) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 680, margin: '0 auto', textAlign: 'center', color: '#71717a' }}>
        <p>{error ?? 'Reservation not found'}</p>
        <Link href="/worker/reservations" style={{ color: '#0090FF', fontSize: 14 }}>← Back to reservations</Link>
      </div>
    );
  }

  const cfg = STATUS_CFG[lock.lockStatus] ?? STATUS_CFG.EXPIRED;
  const daysLeft = lock.lockStatus === 'ACTIVE' ? daysRemaining(lock.lockExpiryDate) : null;
  const companyName = lock.employer?.company_name ?? 'Employer';
  const lockDays = lock.lockDays ?? 0;

  return (
    <div style={{ padding: '32px 40px', maxWidth: 680, margin: '0 auto' }}>
      <Link
        href="/worker/reservations"
        style={{ fontSize: 13, color: '#71717a', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 24 }}
      >
        ← Back to reservations
      </Link>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0 }}>Reservation detail</h1>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
            {cfg.label}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#71717a', margin: 0 }}>Reserved by {companyName}</p>
      </div>

      {/* Main info card */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `3px solid ${cfg.color}`, borderRadius: 16, padding: '24px', marginBottom: 20,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {[
            { label: 'Employer', value: companyName },
            { label: 'Status', value: cfg.label },
            { label: 'Reserved from', value: fmtDate(lock.lockStartDate) },
            { label: 'Reserved until', value: fmtDate(lock.lockExpiryDate) },
            { label: 'Duration', value: `${lockDays} day${lockDays !== 1 ? 's' : ''}` },
            { label: 'Days remaining', value: daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7' }}>{value}</div>
            </div>
          ))}
        </div>

        {lock.releaseReason && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Release reason</div>
            <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, margin: 0 }}>{lock.releaseReason}</p>
          </div>
        )}
      </div>

      {/* Active status banner */}
      {lock.lockStatus === 'ACTIVE' && daysLeft !== null && (
        <div style={{
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', marginBottom: 2 }}>
              Your profile is currently reserved
            </div>
            <div style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.5 }}>
              {companyName} has exclusive access to proceed with hiring you. This reservation expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''} on {fmtDate(lock.lockExpiryDate)}.
              You can still browse and apply to jobs freely.
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {lock.timeline && lock.timeline.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 20px' }}>
            Timeline
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {lock.timeline.map((event, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: i < lock.timeline!.length - 1 ? 20 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0090FF', border: '2px solid rgba(0,144,255,0.3)', flexShrink: 0, marginTop: 3 }} />
                  {i < lock.timeline!.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: 'rgba(255,255,255,0.08)', marginTop: 6 }} />
                  )}
                </div>
                <div style={{ flex: 1, paddingBottom: i < lock.timeline!.length - 1 ? 4 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7', marginBottom: 2 }}>
                    {event.event.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                  {event.notes && (
                    <div style={{ fontSize: 12, color: '#71717a', marginBottom: 2 }}>{event.notes}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#555' }}>{fmtDateTime(event.occurred_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReservationDetailPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <ReservationDetailContent />
    </Suspense>
  );
}
