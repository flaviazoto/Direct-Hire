"use client";
// src/app/(app)/worker/documents/page.tsx

import { useCallback, useEffect, useState, useRef } from "react";
import { uploadApi } from "@/lib/api-client";
import {
  LoadingPage, PageHeader, Card, CardContent, Badge, Button,
  EmptyState, ToastDisplay, type ToastData, ProgressBar, ErrorState,
} from "@/components/ui";

interface UploadRecord {
  id: string;
  fileType: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  isPrivate: boolean;
  uploadedAt: string;
}

const FILE_TYPE_LABELS: Record<string, { label: string; icon: string; desc: string; accept: string }> = {
  PROFILE_PHOTO:       { label: "Profile Photo",       icon: "👤", desc: "JPG, PNG, WebP — max 5MB",   accept: "image/jpeg,image/png,image/webp" },
  WORK_VIDEO:          { label: "Work Video",          icon: "🎬", desc: "MP4, MOV, WebM — max 50MB",  accept: "video/mp4,video/quicktime,video/webm" },
  INTRO_VIDEO:         { label: "Introduction Video",  icon: "🎥", desc: "MP4, MOV, WebM — max 50MB",  accept: "video/mp4,video/quicktime,video/webm" },
  MEDICAL_CERTIFICATE: { label: "Medical Certificate", icon: "🏥", desc: "JPG, PNG, PDF — max 10MB",   accept: "image/jpeg,image/png,application/pdf" },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function reviewBadge(upload: UploadRecord) {
  if (upload.reviewStatus === "APPROVED") {
    return <Badge variant="green">Approved</Badge>;
  }
  if (upload.reviewStatus === "REJECTED") {
    return <Badge variant="red">Rejected</Badge>;
  }
  return <Badge variant="amber">Pending Review</Badge>;
}

function UploadArea({
  meta,
  isUploading,
  progress,
  onTrigger,
}: {
  meta: { icon: string; desc: string };
  isUploading: boolean;
  progress: number;
  onTrigger: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onTrigger}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(0,144,255,0.04)" : "rgba(255,255,255,0.02)",
        border: hovered ? "2px dashed rgba(0,144,255,0.3)" : "2px dashed rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "32px 24px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 32, color: "#555", marginBottom: 8 }}>{meta.icon}</div>
      <div style={{ color: "#888", fontSize: 13, marginBottom: 4 }}>
        {isUploading ? "Uploading…" : "Click to upload"}
      </div>
      <div style={{ color: "#555", fontSize: 11 }}>{meta.desc}</div>
      {isUploading && (
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={progress} color="#0090FF" />
          <div style={{ fontSize: 11, color: "#0090FF", marginTop: 4 }}>{progress}%</div>
        </div>
      )}
    </div>
  );
}

export default function WorkerDocumentsPage() {
  const [uploads, setUploads]     = useState<UploadRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [toast, setToast]         = useState<ToastData>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [progress, setProgress]   = useState(0);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await uploadApi.list();
    if (!res.success) { setError(res.error ?? "Could not load your documents."); setLoading(false); return; }
    setUploads((res.data as unknown as UploadRecord[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (fileType: string, file: File) => {
    setUploading(fileType);
    setProgress(0);
    const res = await uploadApi.upload(fileType, file, setProgress);
    setUploading(null);
    if (res.success) {
      showToast("File uploaded successfully", "ok");
      load();
    } else {
      showToast(res.error ?? "Upload failed", "err");
    }
  };

  const handleDelete = async (id: string) => {
    const res = await uploadApi.delete(id);
    if (res.success) {
      showToast("File deleted", "ok");
      setUploads(u => u.filter(x => x.id !== id));
    } else {
      showToast(res.error ?? "Delete failed", "err");
    }
  };

  const handleOpen = async (id: string) => {
    setResolvingId(id);
    const res = await uploadApi.getUrl(id);
    setResolvingId(null);

    if (!res.success) {
      showToast(res.error ?? "Could not open file", "err");
      return;
    }

    const payload = res.data as { url?: string };
    if (!payload?.url) {
      showToast("File URL is unavailable", "err");
      return;
    }

    window.open(payload.url, "_blank", "noopener,noreferrer");
  };

  if (loading) return <LoadingPage color="blue" />;
  if (error) {
    return (
      <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 1400, margin: "0 auto" }}>
        <ErrorState message={error} retry={load} title="Could not load your documents" />
      </div>
    );
  }

  const getUpload = (fileType: string) => uploads.find(u => u.fileType === fileType && u.status !== "DELETED");

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />
      <PageHeader
        title="My Documents"
        description="Upload and manage your verification documents"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {Object.entries(FILE_TYPE_LABELS).map(([fileType, meta]) => {
          const existing = getUpload(fileType);
          const isUploading = uploading === fileType;

          return (
            <Card key={fileType}>
              <CardContent>
                {/* File type label */}
                <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                  {meta.label}
                </div>

                {existing ? (
                  /* Uploaded state */
                  <div style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#e4e4e7",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 6,
                      }}>
                        {existing.fileName}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge variant="green">Uploaded</Badge>
                        {reviewBadge(existing)}
                        <span style={{ fontSize: 11, color: "#555" }}>{formatBytes(existing.sizeBytes)}</span>
                      </div>
                      {existing.reviewNotes && (
                        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>
                          Note: {existing.reviewNotes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <input
                        ref={el => { inputRefs.current[fileType] = el; }}
                        type="file"
                        accept={meta.accept}
                        style={{ display: "none" }}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(fileType, file);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={resolvingId === existing.id}
                        onClick={() => handleOpen(existing.id)}
                      >
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={isUploading}
                        onClick={() => inputRefs.current[fileType]?.click()}
                      >
                        {isUploading ? "Uploading…" : "Replace"}
                      </Button>
                      <button
                        onClick={() => handleDelete(existing.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#f87171",
                          fontWeight: 600,
                          padding: "4px 8px",
                          borderRadius: 6,
                          transition: "color 0.15s",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Upload area */
                  <>
                    <input
                      ref={el => { inputRefs.current[fileType] = el; }}
                      type="file"
                      accept={meta.accept}
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(fileType, file);
                        e.target.value = "";
                      }}
                    />
                    <UploadArea
                      meta={meta}
                      isUploading={isUploading}
                      progress={progress}
                      onTrigger={() => inputRefs.current[fileType]?.click()}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {uploads.length === 0 && !loading && (
        <div style={{ marginTop: 32 }}>
          <EmptyState
            icon="📁"
            title="No documents yet"
            description="Upload your profile photo, videos, and certificates to complete verification."
          />
        </div>
      )}
    </div>
  );
}
