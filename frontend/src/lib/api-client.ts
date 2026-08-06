// frontend/src/lib/api-client.ts
// Uses same-origin /api requests so auth cookies work reliably through Next rewrites.

const API_PREFIX = "/api";

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  redirectTo?: string;
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
    .then(async (r) => {
      if (!r.ok) return false;
      try {
        const rd = await r.json() as Record<string, unknown>;
        const d  = (rd.data ?? rd) as Record<string, unknown>;
        const newToken = (d.accessToken ?? d.token) as string | undefined;
        if (newToken && typeof window !== "undefined") {
          localStorage.setItem("dh_token", newToken);
          if (d.role) localStorage.setItem("dh_role", d.role as string);
        }
      } catch { /* non-fatal */ }
      return true;
    })
    .catch(() => false)
    .finally(() => { _isRefreshing = false; _refreshPromise = null; });
  return _refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, _retry = false): Promise<ApiResult<T>> {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("dh_token") : null;
    const res = await fetch(`${API_PREFIX}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      // Never resolve — same reasoning as the 403 SUBSCRIPTION_REQUIRED branch
      // below: falling through to `return json` here hands the caller the
      // failed-request body (e.g. { success: false }, or a queue endpoint's
      // empty/error shape) while the browser is still navigating away. Any
      // component that doesn't defensively re-check `success` before reading
      // nested fields off the response (e.g. selected.employer.employerProfile
      // on the admin hiring queues) crashes with a client-side exception
      // instead of the page just redirecting to login.
      return new Promise<ApiResult<T>>(() => {});
    }

    // Employer subscription gate (backend/src/middleware/subscription.middleware.ts):
    // 403 responses carry code: "SUBSCRIPTION_REQUIRED" (not error, which holds the
    // human-readable message) — send the employer to billing instead of surfacing
    // a generic error.
    if (res.status === 403 && json.code === "SUBSCRIPTION_REQUIRED" && typeof window !== "undefined") {
      window.location.href = json.redirectTo ?? "/employer/subscription";
      // Never resolve — the page's .then() callback (which would otherwise
      // set loading=false and render an empty/generic state) simply never
      // runs while the browser navigates away. Prevents the empty-state
      // flash / redirect-race that Finding #9 flagged.
      return new Promise<ApiResult<T>>(() => {});
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

export function upload<T>(path: string, formData: FormData, onProgress?: (pct: number) => void) {
  return new Promise<{ success: boolean; data?: T; error?: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_PREFIX}${path}`);
    xhr.withCredentials = true;
    const token = typeof window !== "undefined" ? localStorage.getItem("dh_token") : null;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

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
    const token = typeof window !== "undefined" ? localStorage.getItem("dh_token") : null;
    const res = await fetch(`${API_PREFIX}/user/profile`, {
      method:      "GET",
      credentials: "include",
      headers:     { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  deleteAccount: () => del("/auth/account"),
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
  // ── Platform config ───────────────────────────────────────────────────────────
  getAllConfig: () => get("/admin/config"),
  getPricingConfig: () => get("/admin/config/application-fee"),
  updatePricingConfig: (body: { baseCents?: number; enabled?: boolean }) =>
    patch("/admin/config/application-fee", body),
  updateLockRateConfig: (body: { dailyRateCents?: number; maxConcurrentLocks?: number; maxDurationDays?: number }) =>
    patch("/admin/config/lock-rate", body),
  // ── Revenue dashboard ───────────────────────────────────────────────────────
  getRevenueSummary: () => get("/admin/revenue/summary"),
  getRevenueChart: (period = "30d", type = "all") =>
    get(`/admin/revenue/chart?period=${period}&type=${type}`),
  getPaymentLog: (params?: Record<string, string>) =>
    get(`/admin/revenue/payments${params ? "?" + new URLSearchParams(params) : ""}`),
  // ── Email logs ──────────────────────────────────────────────────────────────
  getEmailLogs: (params?: Record<string, string>) =>
    get(`/admin/email-logs${params ? "?" + new URLSearchParams(params) : ""}`),
  getEmailStats: () => get("/admin/email-stats"),
  // ── Document review ─────────────────────────────────────────────────────────
  getPendingDocumentWorkers: (params?: Record<string, string>) =>
    get(`/admin/workers/pending-documents${params ? "?" + new URLSearchParams(params) : ""}`),
  getWorkerDocuments: (id: string) => get(`/admin/workers/${id}/documents`),
  reviewWorkerDocuments: (id: string, body: { photoStatus: string; videoStatus: string; passportStatus: string; notes?: string }) =>
    patch(`/admin/workers/${id}/documents/review`, body),
  // ── Lock monitor ─────────────────────────────────────────────────────────────
  getAllLocks: (params?: Record<string, string>) =>
    get(`/admin/locks${params ? "?" + new URLSearchParams(params) : ""}`),
  getLocksSummary: () => get("/admin/locks/summary"),
  getLockDetail: (lockId: string) => get(`/admin/locks/${lockId}`),
  overrideLock: (lockId: string, note: string) => post(`/admin/locks/${lockId}/override`, { note }),
  // ── System health (scheduled-job monitor) ────────────────────────────────────
  getSystemHealth: (params?: Record<string, string>) =>
    get(`/admin/system-health${params ? "?" + new URLSearchParams(params) : ""}`),
  // ── Notifications ────────────────────────────────────────────────────────────
  getNotifications: (params?: Record<string, string>) =>
    get(`/admin/notifications${params ? "?" + new URLSearchParams(params) : ""}`),
  getUnreadCount: () => get("/admin/notifications/unread-count"),
  markNotificationRead: (id: string) => patch(`/admin/notifications/${id}/read`),
  markAllNotificationsRead: () => patch("/admin/notifications/read-all"),
  // ── External jobs ────────────────────────────────────────────────────────────
  getExternalJobs: (params?: Record<string, string>) =>
    get(`/admin/external-jobs${params ? "?" + new URLSearchParams(params) : ""}`),
  createExternalJob: (body: Record<string, unknown>) => post("/admin/external-jobs", body),
  updateExternalJob: (id: string, body: Record<string, unknown>) => patch(`/admin/external-jobs/${id}`, body),
  archiveExternalJob: (id: string) => post(`/admin/external-jobs/${id}/archive`),
  deleteExternalJob: (id: string) => del(`/admin/external-jobs/${id}`),
  // ── Growth / Marketing agents ───────────────────────────────────────────────
  runGrowthTask: (body: { agentName: string; taskType: string; inputData?: Record<string, unknown> }) =>
    post("/admin/growth/tasks/run", body),
  getEligibleJobs: () => get("/admin/growth/eligible-jobs"),
  getEligibleEmployers: () => get("/admin/growth/eligible-employers"),
  getGrowthTasks: (params?: Record<string, string>) =>
    get(`/admin/growth/tasks${params ? "?" + new URLSearchParams(params) : ""}`),
  getGrowthTaskDetail: (id: string) => get(`/admin/growth/tasks/${id}`),
  approveGrowthTask: (id: string) => post(`/admin/growth/tasks/${id}/approve`),
  rejectGrowthTask: (id: string, reason: string) => post(`/admin/growth/tasks/${id}/reject`, { reason }),
  getGrowthContentDrafts: (params?: Record<string, string>) =>
    get(`/admin/growth/content${params ? "?" + new URLSearchParams(params) : ""}`),
  // ── Admin-mediated hiring workflow (Phase 2 backend, Phase 3 frontend) ───────
  getHiringReviewQueue: (params?: Record<string, string>) =>
    get(`/admin/hiring/review-queue${params ? "?" + new URLSearchParams(params) : ""}`),
  approveApplicationReview: (applicationId: string, body?: { noteToWorker?: string }) =>
    post(`/admin/hiring/applications/${applicationId}/review/approve`, body),
  updateApplicationReviewNotes: (applicationId: string, body: { decisionNotes?: string; noteToWorker?: string }) =>
    patch(`/admin/hiring/applications/${applicationId}/review/notes`, body),
  getDocumentQueue: (params?: Record<string, string>) =>
    get(`/admin/hiring/document-queue${params ? "?" + new URLSearchParams(params) : ""}`),
  requestApplicationDocument: (applicationId: string, documentType: string) =>
    post(`/admin/hiring/applications/${applicationId}/documents`, { documentType }),
  approveApplicationDocument: (documentId: string) =>
    patch(`/admin/hiring/documents/${documentId}/approve`),
  skipDocumentVerification: (applicationId: string) =>
    post(`/admin/hiring/applications/${applicationId}/documents/skip`),
  getFeeQueue: (params?: Record<string, string>) =>
    get(`/admin/hiring/fee-queue${params ? "?" + new URLSearchParams(params) : ""}`),
  createFeeCharge: (applicationId: string, visaType: string) =>
    post(`/admin/hiring/applications/${applicationId}/fee/create`, { visaType }),
  getInterviewHireQueue: (params?: Record<string, string>) =>
    get(`/admin/hiring/interview-hire-queue${params ? "?" + new URLSearchParams(params) : ""}`),
  // ── Screening interview (Part B redesign) ───────────────────────────────
  recordInterviewNotes: (applicationId: string, body: { adminNotes?: string; recommendation?: "RECOMMEND" | "DOES_NOT_MEET_REQUIREMENTS" | "NEEDS_FOLLOW_UP" }) =>
    patch(`/admin/hiring/applications/${applicationId}/interview`, body),
  markInterviewRelayed: (applicationId: string) =>
    post(`/admin/hiring/applications/${applicationId}/interview/relay`, {}),
  markApplicationNotSelected: (applicationId: string) =>
    post(`/admin/hiring/applications/${applicationId}/not-selected`, {}),
  confirmHire: (applicationId: string, body: { offeredSalary?: string; offeredCurrency?: string; startDate?: string; contractType?: string }) =>
    post(`/admin/hiring/applications/${applicationId}/hire`, body),
  // ── Message visibility (Phase 5, Step 2/4) ────────────────────────────────
  getMessagesForUser: (userId: string, otherUserId?: string) =>
    get(`/admin/messages?userId=${userId}${otherUserId ? `&otherUserId=${otherUserId}` : ""}`),
};

// Public job search — no auth required, hits /api/public/jobs/*
export const publicJobsApi = {
  getJobs: (params?: Record<string, string>) =>
    get(`/public/jobs${params ? "?" + new URLSearchParams(params) : ""}`),
  getJob: (id: string) => get(`/public/jobs/${id}`),
  getCategories: () => get("/public/jobs/categories"),
  getCountries:  () => get("/public/jobs/countries"),
};

// Public pricing-display config — no auth required, hits /api/public/config/*
export const publicConfigApi = {
  getPricing: () => get("/public/config/pricing"),
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
  getApplicationFee: (jobId: string) => get(`/jobs/${jobId}/application-fee`),
  confirmApplication: (jobId: string, body: { paymentIntentId: string; coverLetter?: string }) =>
    post(`/jobs/${jobId}/apply/confirm`, body),
  respondToInterview: (id: string, body: { response: "ACCEPTED" | "DECLINED"; message?: string }) =>
    post(`/applications/${id}/interview-response`, body),
  replyToMessage: (otherUserId: string, body: string) =>
    post(`/worker/messages/${otherUserId}/reply`, { body }),
  getLockStatus: () => get("/worker/lock-status"),
  getLockHistory: (params?: Record<string, string>) =>
    get(`/worker/lock-history${params ? "?" + new URLSearchParams(params) : ""}`),
  getLockDetail: (lockId: string) =>
    get(`/worker/lock-history/${lockId}`),
  // ── Notifications ───────────────────────────────────────────────────────────
  getNotifications: (params?: Record<string, string>) =>
    get(`/worker/notifications${params ? "?" + new URLSearchParams(params) : ""}`),
  getUnreadCount: () => get("/worker/notifications/unread-count"),
  markNotificationRead: (id: string) => patch(`/worker/notifications/${id}/read`),
  markAllNotificationsRead: () => patch("/worker/notifications/read-all"),
  // ── Messages ────────────────────────────────────────────────────────────────
  getMessages: (params?: Record<string, string>) =>
    get(`/worker/messages${params ? "?" + new URLSearchParams(params) : ""}`),
  markMessageRead: (id: string) => patch(`/worker/messages/${id}/read`),
  getPayments: (params?: Record<string, string>) =>
    get(`/payments${params ? "?" + new URLSearchParams(params) : ""}`),
  getInvoiceUrl: (invoiceId: string) => get(`/invoices/${invoiceId}/url`),
  // ── Admin-mediated hiring workflow document requests (Phase 4, Step 1) ───────
  getMyDocumentRequests: () => get("/document-requests"),
  getApplicationDocuments: (applicationId: string) => get(`/applications/${applicationId}/documents`),
  submitApplicationDocument: (applicationId: string, documentId: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append("file", file);
    return upload(`/applications/${applicationId}/documents/${documentId}/submit`, fd, onProgress);
  },
  // ── Employer custom document requests (Phase 4, Step 3) ──────────────────────
  getMyEmployerDocumentRequests: () => get("/employer-document-requests"),
  submitEmployerDocumentRequest: (requestId: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append("file", file);
    return upload(`/employer-document-requests/${requestId}/submit`, fd, onProgress);
  },
  // ── Hire confirmation (major resequencing) ────────────────────────────────
  getMyHireRequests: () => get("/worker/hire-requests"),
  confirmHire: (applicationId: string) => post(`/worker/hire-requests/${applicationId}/confirm`),
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
  // NOTE: was patch(`/employer/locks/${id}/release`) — that endpoint never
  // existed (dead code, no callers). Repointed at the real, already-working
  // release route (same one releaseWorkerLock below uses).
  releaseLock: (workerId: string) => post(`/employer/workers/${workerId}/release-lock`, {}),
  getBilling: () => get("/employer/billing"),
  getInvoiceUrl: (invoiceId: string) => get(`/invoices/${invoiceId}/url`),
  getJobApplications: (jobId: string, params?: Record<string, string>) =>
    get(`/employer/jobs/${jobId}/applications${params ? "?" + new URLSearchParams(params) : ""}`),
  getApplications: (params?: Record<string, string>) =>
    get(`/employer/applications${params ? "?" + new URLSearchParams(params) : ""}`),
  // interview_instructions/offeredSalary/offeredCurrency/startDate/contractType
  // removed (Phase 4, Step 4) — the backend no longer accepts INTERVIEWED/
  // ACCEPTED as settable targets here at all (Phase 2), so no caller ever
  // passes anything but `reason` anymore.
  updateApplicationStatus: (
    id: string,
    status: string,
    extra?: { reason?: string },
  ) => put(`/employer/applications/${id}/status`, { status, ...extra }),
  getProfile: () => get("/user/profile"),
  updateProfile: (body: unknown) => patch("/user/profile", body),
  getWorkerDetail: (workerId: string) => get(`/employer/workers/${workerId}`),
  getLockRate: () => get("/employer/lock-rate"),
  getWorkerLockStatus: (workerId: string) => get(`/employer/workers/${workerId}/lock-status`),
  lockWorker: (workerId: string, body: { lock_days: number }) =>
    post(`/employer/workers/${workerId}/lock`, body),
  confirmLock: (workerId: string, body: { paymentIntentId: string }) =>
    post(`/employer/workers/${workerId}/lock/confirm`, body),
  extendWorkerLock: (workerId: string, body: { additional_days: number }) =>
    post(`/employer/workers/${workerId}/extend-lock`, body),
  confirmExtendWorkerLock: (workerId: string, body: { paymentIntentId: string }) =>
    post(`/employer/workers/${workerId}/extend-lock/confirm`, body),
  releaseWorkerLock: (workerId: string, body?: { reason?: string }) =>
    post(`/employer/workers/${workerId}/release-lock`, body ?? {}),
  getWorkerApplications: (workerId: string) => get(`/employer/workers/${workerId}/applications`),
  messageWorker: (workerId: string, message: string) =>
    post("/employer/message-worker", { workerId, message }),
  // ── Subscription (Stripe) ───────────────────────────────────────────────────
  getSubscriptionStatus: () => get("/employer/subscription/status"),
  createSubscriptionCheckout: () => post("/employer/subscription/checkout"),
  cancelSubscription: () => post("/employer/subscription/cancel"),
  getPortalSession: () => post("/employer/subscription/portal"),
  // ── Notifications ───────────────────────────────────────────────────────────
  getNotifications: (params?: Record<string, string>) =>
    get(`/employer/notifications${params ? "?" + new URLSearchParams(params) : ""}`),
  getUnreadCount: () => get("/employer/notifications/unread-count"),
  markNotificationRead: (id: string) => patch(`/employer/notifications/${id}/read`),
  markAllNotificationsRead: () => patch("/employer/notifications/read-all"),
  // ── Messages ─────────────────────────────────────────────────────────────────
  getMessages: (params?: Record<string, string>) =>
    get(`/employer/messages${params ? "?" + new URLSearchParams(params) : ""}`),
  markMessageRead: (id: string) => post(`/employer/messages/${id}/read`),
  // ── Worker groups / bulk quotes (Phase 2 sub-step 5 backend, Phase 4 Step 2 frontend) ──
  getMyWorkerGroup: () => get("/employer/worker-groups/me"),
  addWorkerToGroup: (workerId: string) => post("/employer/worker-groups/members", { workerId }),
  removeWorkerFromGroup: (workerId: string) => del(`/employer/worker-groups/members/${workerId}`),
  requestBulkQuote: () => post("/employer/worker-groups/request-quote"),
  // ── Custom document requests (Phase 4, Step 3) ────────────────────────────────
  getEmployerDocumentRequests: (params?: Record<string, string>) =>
    get(`/employer/document-requests${params ? "?" + new URLSearchParams(params) : ""}`),
  createEmployerDocumentRequest: (body: { applicationId: string; label: string; description?: string; isRequired?: boolean }) =>
    post("/employer/document-requests", body),
  approveEmployerDocumentRequest: (id: string) => patch(`/employer/document-requests/${id}/approve`),
  // ── Screening interview requests (Part B redesign) ────────────────────────
  getMyInterviews: () => get("/employer/interviews"),
  requestInterview: (applicationId: string, notes?: string) =>
    post(`/employer/applications/${applicationId}/interview-request`, { notes }),
  requestBulkInterviews: (notes?: string) =>
    post("/employer/worker-groups/interview-requests", { notes }),
  // ── Hire (major resequencing) ─────────────────────────────────────────────
  requestHire: (applicationId: string, body: { offeredSalary?: string; offeredCurrency?: string; startDate?: string; contractType?: string }) =>
    post(`/employer/applications/${applicationId}/hire-request`, body),
};

/* ─── Shared action helpers ──────────────────────────────────────────────────── */

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
