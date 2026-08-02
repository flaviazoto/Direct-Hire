"use client";
// src/app/(app)/worker/document-requests/page.tsx
// Phase 4, Step 1 — worker-facing view/submit for ApplicationDocument rows
// (admin requests these on /admin/hiring/review's Document Verification tab).
// Phase 4, Step 3 extends this same page to also cover EmployerDocumentRequest
// rows (employer-initiated, employer-reviewed) rather than building a third
// worker-facing document page — the two are different backing models but the
// exact same worker-facing concept ("someone requested a document from you"),
// so one unified list is the more natural fit than splitting them.
//
// Built as its own standalone route rather than as an addition to
// worker/applications/page.tsx: that file is one of Phase 1's exhaustiveness-
// surface files, off-limits this phase per the Phase 4 prompt's cross-cutting
// section (no exception carved out for it, unlike the two Step 4 files) —
// so this follows the same "your call if a dedicated sub-page reads better"
// escape hatch Step 1 itself offered. Mirrors /worker/documents (the
// profile-level Upload equivalent) as this route's closest existing sibling.

import { useCallback, useEffect, useRef, useState } from "react";
import { workerApi } from "@/lib/api-client";
import {
  LoadingPage, PageHeader, Card, CardContent, Badge, Button,
  EmptyState, ToastDisplay, type ToastData, ProgressBar, ErrorState,
} from "@/components/ui";

type DocStatus = "REQUESTED" | "SUBMITTED" | "APPROVED";
type Source = "admin" | "employer";

interface NormalizedDoc {
  id: string;
  source: Source;
  name: string;
  description: string | null;
  fileUrl: string | null;
  status: DocStatus;
}
interface AppGroup {
  id: string;
  job: { title: string; companyName: string };
  documents: NormalizedDoc[];
}

interface RawAppDocument { id: string; documentType: string; fileUrl: string | null; status: DocStatus }
interface RawAppDocGroup { id: string; job: { title: string; companyName: string }; documents: RawAppDocument[] }
interface RawEmployerDocRequest { id: string; label: string; description: string | null; fileUrl: string | null; status: DocStatus }
interface RawEmployerDocGroup { id: string; job: { title: string; companyName: string }; documentRequests: RawEmployerDocRequest[] }

function statusBadge(status: DocStatus) {
  if (status === "APPROVED") return <Badge variant="green">✓ Approved</Badge>;
  if (status === "SUBMITTED") return <Badge variant="amber">Awaiting review</Badge>;
  return <Badge variant="red">Upload needed</Badge>;
}

function DocumentRow({
  appId, doc, onUploaded,
}: { appId: string; doc: NormalizedDoc; onUploaded: (appId: string, docId: string, source: Source, updated: Partial<NormalizedDoc>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setProgress(0);
    setError(null);
    const res = doc.source === "admin"
      ? await workerApi.submitApplicationDocument(appId, doc.id, file, setProgress)
      : await workerApi.submitEmployerDocumentRequest(doc.id, file, setProgress);
    setUploading(false);
    if (!res.success) {
      setError(res.error ?? "Upload failed");
      return;
    }
    const data = res.data as { fileUrl?: string } | undefined;
    onUploaded(appId, doc.id, doc.source, { status: "SUBMITTED", fileUrl: data?.fileUrl ?? null });
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "14px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{doc.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: doc.source === "admin" ? "#E0B020" : "#60a5fa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {doc.source === "admin" ? "DirectHire" : "Employer"}
            </span>
          </div>
          {doc.description && <div style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>{doc.description}</div>}
          <div style={{ marginTop: 6 }}>{statusBadge(doc.status)}</div>
        </div>

        {doc.status === "REQUESTED" && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <Button variant="secondary" size="sm" loading={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </>
        )}

        {doc.status !== "REQUESTED" && doc.fileUrl && (
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none", fontWeight: 600 }}>
            View ↗
          </a>
        )}
      </div>

      {uploading && (
        <div style={{ marginTop: 10 }}>
          <ProgressBar value={progress} color="#0090FF" />
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function mergeGroups(adminGroups: RawAppDocGroup[], employerGroups: RawEmployerDocGroup[]): AppGroup[] {
  const byApp = new Map<string, AppGroup>();

  for (const g of adminGroups) {
    byApp.set(g.id, {
      id: g.id, job: g.job,
      documents: g.documents.map(d => ({ id: d.id, source: "admin", name: d.documentType, description: null, fileUrl: d.fileUrl, status: d.status })),
    });
  }
  for (const g of employerGroups) {
    const existing = byApp.get(g.id);
    const docs: NormalizedDoc[] = g.documentRequests.map(r => ({ id: r.id, source: "employer", name: r.label, description: r.description, fileUrl: r.fileUrl, status: r.status }));
    if (existing) existing.documents.push(...docs);
    else byApp.set(g.id, { id: g.id, job: g.job, documents: docs });
  }

  return Array.from(byApp.values());
}

export default function WorkerDocumentRequestsPage() {
  const [groups, setGroups] = useState<AppGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [adminRes, employerRes] = await Promise.all([
      workerApi.getMyDocumentRequests(),
      workerApi.getMyEmployerDocumentRequests(),
    ]);
    if (!adminRes.success) { setError(adminRes.error ?? "Could not load document requests."); setLoading(false); return; }
    const adminGroups = (adminRes.data as unknown as RawAppDocGroup[]) ?? [];
    const employerGroups = employerRes.success ? (employerRes.data as unknown as RawEmployerDocGroup[]) ?? [] : [];
    setGroups(mergeGroups(adminGroups, employerGroups));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleUploaded(appId: string, docId: string, source: Source, updated: Partial<NormalizedDoc>) {
    setGroups(prev => prev.map(g => g.id !== appId ? g : {
      ...g,
      documents: g.documents.map(d => (d.id === docId && d.source === source) ? { ...d, ...updated } : d),
    }));
    setToast({ msg: "Document submitted — awaiting review", type: "ok" });
    setTimeout(() => setToast(null), 4000);
  }

  if (loading) return <LoadingPage color="blue" />;

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 860, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />
      <PageHeader
        title="Document Requests"
        description="Upload documents DirectHire or an employer requests to keep your application moving forward."
      />

      {error ? (
        <ErrorState message={error} retry={load} title="Could not load document requests" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="📄"
          title="No document requests"
          description="You'll see requests here once DirectHire or an employer needs something from you for an active application."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map(group => (
            <Card key={group.id}>
              <CardContent>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{group.job.title}</div>
                <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>{group.job.companyName}</div>
                {group.documents.map(doc => (
                  <DocumentRow key={`${doc.source}-${doc.id}`} appId={group.id} doc={doc} onUploaded={handleUploaded} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
