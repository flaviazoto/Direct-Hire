// frontend/src/lib/api-client.ts
// Uses same-origin /api requests so auth cookies work reliably through Next rewrites.

const API_PREFIX = "/api";

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
};

function shouldHandleUnauthorized(path: string) {
  return !path.startsWith("/auth/");
}

let _isRefreshing = false;
let _refreshPromise: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  if (_isRefreshing) return _refreshPromise!;
  _isRefreshing = true;
  _refreshPromise = fetch(`${API_PREFIX}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { _isRefreshing = false; _refreshPromise = null; });
  return _refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, _retry = false): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_PREFIX}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    let json: ApiResult<T>;
    try {
      json = (await res.json()) as ApiResult<T>;
    } catch {
      json = { success: false, error: "Unexpected server response" };
    }

    if (res.status === 401 && shouldHandleUnauthorized(path) && typeof window !== "undefined") {
      if (!_retry) {
        const refreshed = await silentRefresh();
        if (refreshed) return request<T>(path, options, true);
      }
      window.location.href = "/login?session=expired";
    }

    return json;
  } catch (err) {
    console.error("[API Error]", path, err);
    return { success: false, error: "Network error - check your connection." };
  }
}

function get<T>(path: string) {
  return request<T>(path, { method: "GET" });
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function patch<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function put<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function del<T>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

function upload<T>(path: string, formData: FormData, onProgress?: (pct: number) => void) {
  return new Promise<{ success: boolean; data?: T; error?: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_PREFIX}${path}`);
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ success: false, error: "Upload failed" });
      }
    };

    xhr.onerror = () => resolve({ success: false, error: "Upload failed" });
    xhr.send(formData);
  });
}

// ── Public auth check (no 401 redirect) ──────────────────────────────────────
// Use this on public pages so an unauthenticated visitor is NOT redirected to
// /login?session=expired. Returns { isLoggedIn: false } on any failure.

export async function checkAuth(): Promise<{
  isLoggedIn:    boolean;
  role?:         string;
  accountStatus?: string;
  firstName?:    string;
}> {
  try {
    const res = await fetch(`${API_PREFIX}/user/profile`, {
      method:      "GET",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
    });
    if (!res.ok) return { isLoggedIn: false };
    const json = (await res.json()) as { success: boolean; data?: unknown };
    if (!json.success) return { isLoggedIn: false };
    const d = (json.data ?? {}) as {
      user?:    { role?: string; accountStatus?: string };
      profile?: { firstName?: string };
    };
    return {
      isLoggedIn:    true,
      role:          d.user?.role,
      accountStatus: d.user?.accountStatus,
      firstName:     d.profile?.firstName ?? undefined,
    };
  } catch {
    return { isLoggedIn: false };
  }
}

export const authApi = {
  register: (body: unknown) => post("/auth/register", body),
  login: (body: unknown) => post("/auth/login", body),
  logout: () => post("/auth/logout"),
  forgotPassword: (body: unknown) => post("/auth/forgot-password", body),
  resetPassword: (body: unknown) => post("/auth/reset-password", body),
  verifyEmail: (token: string) => post("/auth/verify-email", { token }),
  refresh: () => post("/auth/refresh"),
  sendVerificationCode: (email: string) => post("/auth/send-verification-code", { email }),
  verifyEmailCode: (email: string, code: string) => post("/auth/verify-email-code", { email, code }),
};

export const onboardingApi = {
  getProgress: () => get("/onboarding/progress"),
  saveStep: (step: number, data: unknown) => post("/onboarding/save-step", { step, data }),
  submit: () => post("/onboarding/submit"),
};

export const uploadApi = {
  list: () => get("/uploads"),
  getUrl: (id: string) => get(`/uploads/${id}/url`),
  delete: (id: string) => del(`/uploads/${id}`),
  upload: (fileType: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("fileType", fileType);
    return upload("/uploads", fd, onProgress);
  },
};

export const userApi = {
  getProfile: () => get("/user/profile"),
  updateProfile: (body: unknown) => patch("/user/profile", body),
  getNotifications: () => get("/user/notifications"),
  markNotificationRead: (id: string) => patch(`/user/notifications/${id}/read`),
};

export const adminApi = {
  getStats: () => get("/admin/stats"),
  getSubmissions: (params?: Record<string, string>) =>
    get(`/admin/submissions${params ? "?" + new URLSearchParams(params) : ""}`),
  review: (body: unknown) => post("/admin/review", body),
  getJobs: (params?: Record<string, string>) =>
    get(`/admin/jobs${params ? "?" + new URLSearchParams(params) : ""}`),
  updateJobStatus: (id: string, body: { status: "ACTIVE" | "PAUSED" | "CLOSED" | "DRAFT"; notes?: string }) =>
    patch(`/admin/jobs/${id}/status`, body),
  getAuditLog: (params?: Record<string, string>) =>
    get(`/admin/audit-log${params ? "?" + new URLSearchParams(params) : ""}`),
  getUsers: (params?: Record<string, string>) =>
    get(`/admin/users${params ? "?" + new URLSearchParams(params) : ""}`),
  suspendUser: (id: string) => patch(`/admin/users/${id}/suspend`),
  activateUser: (id: string) => patch(`/admin/users/${id}/activate`),
  getUserDetail: (id: string) => get(`/admin/users/${id}`),
  reviewDocument: (id: string, body: { decision: "PENDING" | "APPROVED" | "REJECTED"; notes?: string }) =>
    patch(`/admin/documents/${id}/review`, body),
  getUserCounts: () => get("/admin/users/counts"),
  getPendingUsers: () => get("/admin/users/pending"),
  approveUser: (id: string, notes?: string) => post(`/admin/users/${id}/approve`, { notes }),
  rejectUser: (id: string, reason: string) => post(`/admin/users/${id}/reject`, { reason }),
  suspendUserAccount: (id: string, reason?: string) => post(`/admin/users/${id}/suspend`, { reason }),
  reinstateUser: (id: string) => post(`/admin/users/${id}/reinstate`),
  // ── Job moderation ──────────────────────────────────────────────
  getJobCounts: () => get("/admin/jobs/counts"),
  getPendingJobs: (params?: Record<string, string>) =>
    get(`/admin/jobs/pending${params ? "?" + new URLSearchParams(params) : ""}`),
  getAdminJobDetail: (id: string) => get(`/admin/jobs/${id}/detail`),
  approveJob: (id: string) => post(`/admin/jobs/${id}/approve`),
  rejectJob: (id: string, reason: string) => post(`/admin/jobs/${id}/reject`, { reason }),
  requestJobChanges: (id: string, notes: string) => post(`/admin/jobs/${id}/request-changes`, { notes }),
  archiveJobAdmin: (id: string) => post(`/admin/jobs/${id}/archive`),
  getJobModerationHistory: (params?: Record<string, string>) =>
    get(`/admin/jobs/moderation-history${params ? "?" + new URLSearchParams(params) : ""}`),
  restoreJob: (id: string) => patch(`/admin/jobs/${id}/status`, { status: "APPROVED" }),
  // ── Employer posting rights ─────────────────────────────────────
  revokePostingRights: (id: string, reason: string) =>
    post(`/admin/employers/${id}/revoke-posting-rights`, { reason }),
  restorePostingRights: (id: string) => post(`/admin/employers/${id}/restore-posting-rights`),
};

// Public job search — no auth required, hits /api/public/jobs/*
export const publicJobsApi = {
  getJobs: (params?: Record<string, string>) =>
    get(`/public/jobs${params ? "?" + new URLSearchParams(params) : ""}`),
  getJob: (id: string) => get(`/public/jobs/${id}`),
  getCategories: () => get("/public/jobs/categories"),
  getCountries:  () => get("/public/jobs/countries"),
};

export const workerApi = {
  getJobs: (params?: Record<string, string>) =>
    get(`/jobs${params ? "?" + new URLSearchParams(params) : ""}`),
  getJobCountries: (params?: Record<string, string>) =>
    get(`/jobs/countries${params ? "?" + new URLSearchParams(params) : ""}`),
  getJobFilterOptions: (params?: Record<string, string>) =>
    get(`/jobs/filter-options${params ? "?" + new URLSearchParams(params) : ""}`),
  saveJob: (jobId: string) => post(`/jobs/${jobId}/save`),
  unsaveJob: (jobId: string) => del(`/saved-jobs/${jobId}`),
  getSavedJobs: (params?: Record<string, string>) =>
    get(`/saved-jobs${params ? "?" + new URLSearchParams(params) : ""}`),
  applyToJob: (jobId: string, body?: { cover_letter?: string; worker_note?: string }) =>
    post(`/jobs/${jobId}/apply`, body),
  getApplications: (params?: Record<string, string>) =>
    get(`/applications${params ? "?" + new URLSearchParams(params) : ""}`),
  getApplication: (id: string) => get(`/applications/${id}`),
  withdrawApplication: (id: string) => post(`/applications/${id}/withdraw`),
  getApplicationContact: (id: string) => get(`/applications/${id}/contact`),
  getDocuments: () => get("/uploads"),
  deleteDocument: (id: string) => del(`/uploads/${id}`),
  getLockStatus: () => get("/worker/lock-status"),
  getLockHistory: (params?: Record<string, string>) =>
    get(`/worker/lock-history${params ? "?" + new URLSearchParams(params) : ""}`),
  getLockDetail: (lockId: string) => get(`/worker/lock-history/${lockId}`),
};

export const employerApi = {
  // Primary worker search endpoint (replaced /candidates)
  getWorkers: (params?: Record<string, string>) =>
    get(`/employer/workers${params ? "?" + new URLSearchParams(params) : ""}`),
  // Kept for any in-flight code that still calls getCandidates
  getCandidates: (params?: Record<string, string>) =>
    get(`/employer/workers${params ? "?" + new URLSearchParams(params) : ""}`),
  getJobs: (params?: Record<string, string>) =>
    get(`/employer/jobs${params ? "?" + new URLSearchParams(params) : ""}`),
  createJob: (body: unknown) => post("/employer/jobs", body),
  createAndSubmitJob: (body: unknown) => post("/employer/jobs?submit=true", body),
  getJob: (id: string) => get(`/employer/jobs/${id}`),
  updateJob: (id: string, body: unknown) => put(`/employer/jobs/${id}`, body),
  submitJob: (id: string) => post(`/employer/jobs/${id}/submit`),
  archiveJob: (id: string) => post(`/employer/jobs/${id}/archive`),
  deleteJob: (id: string) => del(`/employer/jobs/${id}`),
  getLocks: (params?: Record<string, string>) =>
    get(`/employer/locks${params ? "?" + new URLSearchParams(params) : ""}`),
  releaseLock: (id: string) => patch(`/employer/locks/${id}/release`),
  getBilling: () => get("/employer/billing"),
  getJobApplications: (jobId: string, params?: Record<string, string>) =>
    get(`/employer/jobs/${jobId}/applications${params ? "?" + new URLSearchParams(params) : ""}`),
  getApplications: (params?: Record<string, string>) =>
    get(`/employer/applications${params ? "?" + new URLSearchParams(params) : ""}`),
  updateApplicationStatus: (
    id: string,
    status: string,
    extra?: { reason?: string; interview_instructions?: string },
  ) => put(`/employer/applications/${id}/status`, { status, ...extra }),
  getProfile: () => get("/user/profile"),
  updateProfile: (body: unknown) => patch("/user/profile", body),
  getWorkerDetail: (workerId: string) => get(`/employer/workers/${workerId}`),
  getWorkerLockStatus: (workerId: string) => get(`/employer/workers/${workerId}/lock-status`),
  lockWorker: (workerId: string, body: { lock_days: number; daily_fee: number; currency: string }) =>
    post(`/employer/workers/${workerId}/lock`, body),
  extendWorkerLock: (workerId: string, body: { additional_days: number }) =>
    post(`/employer/workers/${workerId}/extend-lock`, body),
  releaseWorkerLock: (workerId: string, body?: { reason?: string }) =>
    post(`/employer/workers/${workerId}/release-lock`, body ?? {}),
  getWorkerApplications: (workerId: string) => get(`/employer/workers/${workerId}/applications`),
};

/* ─── Shared action helpers ──────────────────────────────────────────────────── */

export const reservationApi = {
  accept:           (id: string)                    => post(`/worker/lock-history/${id}/accept`),
  decline:          (id: string)                    => del(`/worker/lock-history/${id}`),
  requestInterview: (id: string, body?: object)     => post(`/worker/lock-history/${id}/request-interview`, body ?? {}),
  create:           (body: object)                  => post("/employer/locks", body),
};

export const applicationActionApi = {
  patchStatus: (id: string, data: object) =>
    put(`/employer/applications/${id}/status`, data),
};

export const adminActionApi = {
  approve: (id: string, notes?: string) =>
    post(`/admin/users/${id}/approve`, { notes }),
  reject:  (id: string, reason: string) =>
    post(`/admin/users/${id}/reject`, { reason }),
  suspend: (id: string, reason?: string) =>
    post(`/admin/users/${id}/suspend`, { reason }),
  reinstate: (id: string) =>
    post(`/admin/users/${id}/reinstate`),
};
