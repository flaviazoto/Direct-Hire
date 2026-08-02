// backend/src/controllers/worker-applications.controller.ts
// Worker application endpoints — all require role = WORKER + accountStatus = VERIFIED.
// Workers can only access their own applications (always filtered by workerId = JWT sub).

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";
import {
  sendNewApplicationEmail,
  sendApplicationConfirmationEmail,
  sendApplicationWithdrawnEmail,
  sendInterviewResponseEmployerEmail,
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";
import { decrypt } from "../lib/encrypt";
import { calculateMatchScore } from "../services/matching";
import { calculateApplicationFeeAsync } from "../services/pricing";
import stripe from "../services/stripe";
import { generateInvoice } from "../services/invoices";
import { uploadRawBuffer, getSignedUrlForPath } from "../services/storage";

// ── Shared select for list + detail ──────────────────────────────────────────

const APPLICATION_LIST_SELECT = {
  id:                       true,
  status:                   true,
  createdAt:                true,
  updatedAt:                true,
  coverLetter:              true,
  interviewContactUnlocked: true,
  interviewInstructions:    true,
  interviewResponse:        true,
  interviewResponseMessage: true,
  interviewRespondedAt:     true,
  matchScore:               true,
  job: {
    select: {
      id:             true,
      title:          true,
      companyName:    true,
      country:        true,
      city:           true,
      salaryMin:      true,
      salaryMax:      true,
      salaryCurrency: true,
      contractType:   true,
    },
  },
} as const;

// ── Validation ────────────────────────────────────────────────────────────────

const ApplySchema = z.object({
  cover_letter: z.string().max(5000).optional(),
  worker_note:  z.string().max(2000).optional(),
});

const VALID_STATUSES = [
  "APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEWED",
  "ACCEPTED", "REJECTED", "WITHDRAWN",
] as const;

// ── Shared job select for apply + fee + confirm (avoids repetition) ───────────

const JOB_APPLY_SELECT = {
  id:                 true,
  title:              true,
  companyName:        true,
  employerId:         true,
  status:             true,
  country:            true,
  salaryMin:          true,
  salaryMax:          true,
  experienceRequired: true,
  requiredSkills:     true,
  employer: {
    select: {
      id:    true,
      email: true,
      employerProfile: { select: { subscriptionStatus: true, trialEndsAt: true } },
    },
  },
} as const;

const WORKER_SCORE_SELECT = {
  email: true,
  workerProfile: {
    select: {
      firstName:          true,
      lastName:           true,
      yearsExperience:    true,
      expectedSalary:     true,
      trustScore:         true,
      countryOfResidence: true,
      skills:          { select: { skill: true } },
      targetCountries: { select: { country: true } },
    },
  },
} as const;

// Same ACTIVE-or-unexpired-TRIAL rule as requireSubscription (subscription.middleware.ts)
// and lockWorker's inline gate — an employer mid-trial can post jobs (createJob
// goes through that same middleware), so workers must be able to apply to them.
function isEmployerSubscriptionValid(ep?: { subscriptionStatus: string | null; trialEndsAt: Date | null } | null) {
  const isActive   = ep?.subscriptionStatus === "ACTIVE";
  const isTrialing = ep?.subscriptionStatus === "TRIAL" && ep?.trialEndsAt != null && ep.trialEndsAt.getTime() > Date.now();
  return isActive || isTrialing;
}

// Shared: validate job, compute matchScore + feeCents. Called from multiple endpoints.
async function resolveJobAndFee(jobId: string, workerId: string) {
  const [job, worker] = await Promise.all([
    prisma.jobPost.findUnique({ where: { id: jobId }, select: JOB_APPLY_SELECT }),
    prisma.user.findUnique({ where: { id: workerId }, select: WORKER_SCORE_SELECT }),
  ]);
  return { job, worker };
}

async function buildScoringInputs(
  worker:   Awaited<ReturnType<typeof resolveJobAndFee>>["worker"],
  job:      NonNullable<Awaited<ReturnType<typeof resolveJobAndFee>>["job"]>,
  workerId: string,
) {
  const wp = worker?.workerProfile;
  const matchScore = calculateMatchScore(
    {
      skills:             wp?.skills             ?? [],
      yearsExperience:    wp?.yearsExperience    ?? null,
      expectedSalary:     wp?.expectedSalary     ?? null,
      targetCountries:    wp?.targetCountries    ?? [],
      countryOfResidence: wp?.countryOfResidence ?? null,
      trustScore:         wp?.trustScore         ?? null,
    },
    {
      requiredSkills:     job.requiredSkills,
      salaryMin:          job.salaryMin,
      salaryMax:          job.salaryMax,
      country:            job.country,
      experienceRequired: job.experienceRequired,
    },
  );
  const { feeCents, feeDisplay, breakdown } = await calculateApplicationFeeAsync({
    jobId:      job.id,
    workerId,
    jobCountry: job.country,
    salaryMax:  Number(job.salaryMax),
    matchScore,
    trustScore: wp?.trustScore ?? null,
  });
  return { matchScore, feeCents, feeDisplay, breakdown };
}

// Shared: create application + run all post-apply side effects.
async function createApplicationRecord(opts: {
  workerId:             string;
  jobId:                string;
  employerId:           string;
  coverLetter:          string | null;
  workerNote:           string | null;
  matchScore:           number;
  feeCents:             number;
  stripePaymentIntentId?: string;
  worker:               Awaited<ReturnType<typeof resolveJobAndFee>>["worker"];
  job:                  NonNullable<Awaited<ReturnType<typeof resolveJobAndFee>>["job"]>;
}) {
  const { workerId, jobId, employerId, coverLetter, workerNote, matchScore,
          feeCents, stripePaymentIntentId, worker, job } = opts;

  // Phase 2 correction: every application enters the admin-mediated workflow
  // immediately on creation, independent of the employer-controlled hiring-
  // pipeline status above. This function is only ever reached post-payment —
  // either there's no fee (feeCents === 0, nothing to collect) or the caller
  // (confirmApplication) already verified the Stripe PaymentIntent succeeded
  // — so there's no unpaid/abandoned path into this create call.
  const application = await prisma.application.create({
    data: {
      workerId,
      jobId,
      employerId,
      status:      "APPLIED",
      coverLetter: coverLetter ?? null,
      workerNote:  workerNote  ?? null,
      matchScore,
      applicationFeeCents:   feeCents > 0 ? feeCents : null,
      applicationFeePaid:    feeCents > 0,
      stripePaymentIntentId: stripePaymentIntentId ?? null,
      workflowStatus:        "PENDING_ADMIN_REVIEW",
    },
  });

  await prisma.jobPost.update({
    where: { id: jobId },
    data:  { applicationCount: { increment: 1 } },
  });

  // Payment + invoice — pulled out of the fire-and-forget batch below (rather
  // than left inside it) specifically so the created row's id is available
  // to pass to generateInvoice. Still non-blocking relative to the response:
  // awaited here so a signed invoice is more reliably queued before this
  // function returns, but generateInvoice itself is fire-and-forget and can
  // never fail this request (internal try/catch, see services/invoices).
  if (feeCents > 0 && stripePaymentIntentId) {
    const feeDescription = `Application fee — ${job.title} at ${job.companyName}`;
    const feePayment = await prisma.payment.create({
      data: {
        userId:          workerId,
        stripePaymentId: stripePaymentIntentId,
        amount:          feeCents,
        currency:        "USD",
        status:          "SUCCEEDED",
        type:            "APPLICATION_FEE",
        description:     feeDescription,
      },
    });

    const workerName = [worker?.workerProfile?.firstName, worker?.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "Worker";

    generateInvoice({
      paymentId:       feePayment.id,
      userId:          workerId,
      type:            "APPLICATION_FEE",
      amountCents:     feeCents,
      currency:        "USD",
      description:     feeDescription,
      stripeReference: stripePaymentIntentId,
      payer:           { name: workerName },
    }).catch(console.error);
  }

  // Fire-and-forget side effects — failures logged, never crash the response
  Promise.all([
    insertAdminAuditLog({
      actorId:  workerId,
      targetId: workerId,
      action:   "APPLICATION_SUBMITTED",
      metadata: { job_id: jobId, employer_id: employerId, application_id: application.id,
                  fee_cents: feeCents, paid: feeCents > 0 },
    }),
    sendNewApplicationEmail(job.employer.id, job.employer.email,
      job.title, job.companyName, application.id, job.id),
    prisma.notification.create({
      data: {
        userId: employerId,
        title:  `New applicant for ${job.title}`,
        body:   `A new candidate has applied for ${job.title} at ${job.companyName}.`,
        type:   "GENERAL",
        link:   `/employer/jobs/${job.id}/applicants`,
      },
    }),
    ...(worker
      ? [sendApplicationConfirmationEmail({
          workerUserId:    workerId,
          workerEmail:     worker.email,
          workerFirstName: worker.workerProfile?.firstName ?? "there",
          jobTitle:        job.title,
          companyName:     job.companyName,
          applicationId:   application.id,
        })]
      : []),
    prisma.notification.create({
      data: {
        userId:   workerId,
        type:     "APPLICATION_SUBMITTED",
        title:    "Application submitted",
        body:     `Your application for ${job.title} at ${job.companyName} has been submitted.`,
        metadata: { applicationId: application.id, jobId: job.id },
      },
    }),
  ]).catch(console.error);

  return application;
}

// ── GET /worker/jobs/:jobId/application-fee ───────────────────────────────────

export async function getApplicationFee(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { jobId } = req.params;

    const { job, worker } = await resolveJobAndFee(jobId, workerId);
    if (!job)                      return err(res, "Job not found", 404);
    if (job.status !== "APPROVED") return err(res, "This job is not available", 400);

    const { matchScore, feeCents, feeDisplay, breakdown } = await buildScoringInputs(worker, job, workerId);

    return ok(res, { feeCents, feeDisplay, breakdown: { ...breakdown, matchScore } });
  } catch (e) { next(e); }
}

// ── POST /worker/jobs/:jobId/apply ────────────────────────────────────────────
// If fee = 0 → creates application immediately and returns applicationId.
// If fee > 0 → creates Stripe Checkout Session and returns checkoutUrl.
//              Application is NOT created yet — created by /apply/confirm after payment.

export async function applyToJob(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const jobId    = req.params.jobId;

    const parsed = ApplySchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { cover_letter, worker_note } = parsed.data;

    const { job, worker } = await resolveJobAndFee(jobId, workerId);
    if (!job)                      return err(res, "Job not found", 404);
    if (job.status !== "APPROVED") return err(res, "This job is not accepting applications", 400);

    if (!isEmployerSubscriptionValid(job.employer.employerProfile)) {
      return res.status(403).json({
        success: false,
        error:   "This job is no longer accepting applications.",
        code:    "EMPLOYER_SUBSCRIPTION_INACTIVE",
      });
    }

    const existing = await prisma.application.findUnique({
      where:  { workerId_jobId: { workerId, jobId } },
      select: { id: true },
    });
    if (existing) return err(res, "Already applied", 409);

    const { matchScore, feeCents, feeDisplay } = await buildScoringInputs(worker, job, workerId);

    // ── Fee = 0: create application immediately ────────────────────────────────
    if (feeCents === 0) {
      const application = await createApplicationRecord({
        workerId, jobId, employerId: job.employerId,
        coverLetter: cover_letter ?? null,
        workerNote:  worker_note  ?? null,
        matchScore, feeCents: 0, worker, job,
      });
      return ok(res, { requiresPayment: false, applicationId: application.id },
        "Application submitted", 201);
    }

    // ── Fee > 0: create Stripe PaymentIntent (inline payment, no redirect) ────
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   feeCents,
      currency: "usd",
      metadata: { workerId, jobId },
      automatic_payment_methods: { enabled: true },
      ...(worker?.email ? { receipt_email: worker.email } : {}),
    });

    return ok(res, {
      requiresPayment: true,
      clientSecret:    paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      feeCents,
      feeDisplay,
    });
  } catch (e) { next(e); }
}

// ── POST /worker/jobs/:jobId/apply/confirm ────────────────────────────────────
// Called after Stripe redirects the worker back. Verifies payment and creates
// the Application record. Frontend sends: { sessionId, coverLetter? }

const ConfirmSchema = z.object({
  paymentIntentId: z.string().min(1),
  coverLetter:     z.string().max(5000).optional(),
  workerNote:      z.string().max(2000).optional(),
});

export async function confirmApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const jobId    = req.params.jobId;

    const parsed = ConfirmSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { paymentIntentId, coverLetter, workerNote } = parsed.data;

    // Retrieve and verify the Stripe PaymentIntent
    type PaymentIntent = Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
    let paymentIntent: PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return err(res, "Invalid payment session", 400);
    }

    if (paymentIntent.status !== "succeeded") {
      return err(res, "Payment not completed — please try again", 402);
    }

    if (paymentIntent.metadata?.workerId !== workerId) return err(res, "Forbidden", 403);
    if (paymentIntent.metadata?.jobId    !== jobId)    return err(res, "Job mismatch", 400);

    // Idempotency: if application already created (double-submit), return it
    const existing = await prisma.application.findUnique({
      where:  { workerId_jobId: { workerId, jobId } },
      select: { id: true },
    });
    if (existing) return ok(res, { applicationId: existing.id }, "Already applied");

    // Re-fetch job + worker and recompute scores (authoritative, not from client)
    const { job, worker } = await resolveJobAndFee(jobId, workerId);
    if (!job)                      return err(res, "Job not found", 404);
    if (job.status !== "APPROVED") return err(res, "Job no longer available", 400);

    if (!isEmployerSubscriptionValid(job.employer.employerProfile)) {
      return res.status(403).json({
        success: false,
        error:   "This job is no longer accepting applications.",
        code:    "EMPLOYER_SUBSCRIPTION_INACTIVE",
      });
    }

    const { matchScore, feeCents } = await buildScoringInputs(worker, job, workerId);

    const application = await createApplicationRecord({
      workerId, jobId, employerId: job.employerId,
      coverLetter: coverLetter ?? null,
      workerNote:  workerNote  ?? null,
      matchScore, feeCents,
      stripePaymentIntentId: paymentIntentId,
      worker, job,
    });

    return ok(res, { applicationId: application.id }, "Application submitted", 201);
  } catch (e) { next(e); }
}

// ── GET /worker/applications ──────────────────────────────────────────────────

export async function getMyApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const { status } = req.query as Record<string, string>;

    const where: Record<string, unknown> = { workerId };
    if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
      where.status = status;
    }

    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { updatedAt: "desc" },
        select:  APPLICATION_LIST_SELECT,
      }),
      prisma.application.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// ── GET /worker/applications/:id ──────────────────────────────────────────────

export async function getApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id:             true,
            title:          true,
            companyName:    true,
            country:        true,
            city:           true,
            salaryMin:      true,
            salaryMax:      true,
            salaryCurrency: true,
            contractType:   true,
          },
        },
        employer: {
          select: {
            email:          true,
            employerProfile: { select: { contactPersonName: true, phone: true } },
          },
        },
      },
    });

    if (!app)                       return err(res, "Application not found", 404);
    if (app.workerId !== workerId)  return err(res, "Forbidden", 403);

    // Build company_contact only when unlocked — never expose employer PII before that
    let companyContact: Record<string, unknown> | null = null;
    if (app.interviewContactUnlocked) {
      // try/catch-null — same guard used everywhere else this field is read
      // (malformed/legacy ciphertext must never 500 the whole endpoint).
      let contactPhone: string | null = null;
      if (app.employer.employerProfile?.phone) {
        try { contactPhone = decrypt(app.employer.employerProfile.phone); } catch { contactPhone = null; }
      }
      companyContact = {
        contact_name:           app.employer.employerProfile?.contactPersonName ?? null,
        contact_email:          app.employer.email,
        contact_phone:          contactPhone,
        company_name:           app.job.companyName,
        interview_instructions: app.interviewInstructions,
      };
    }

    // Strip internal employer relation from the response payload
    const { employer: _employer, ...rest } = app;
    return ok(res, { ...rest, company_contact: companyContact });
  } catch (e) { next(e); }
}

// ── POST /applications/:id/interview-response ────────────────────────────────
// Worker accepts or declines an interview invitation. This is independent of
// `status`, which stays INTERVIEWED regardless — the employer still decides
// ACCEPTED/REJECTED separately based on how the interview actually goes.

const InterviewResponseSchema = z.object({
  response: z.enum(["ACCEPTED", "DECLINED"]),
  message:  z.string().max(500, "Message must be 500 characters or fewer").optional(),
});

export async function respondToInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const parsed = InterviewResponseSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { response, message } = parsed.data;

    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        job:      { select: { title: true, companyName: true } },
        worker:   { select: { workerProfile: { select: { firstName: true, lastName: true } } } },
        employer: { select: { id: true, email: true } },
      },
    });

    if (!app)                      return err(res, "Application not found", 404);
    if (app.workerId !== workerId) return err(res, "Forbidden", 403);
    if (app.status !== "INTERVIEWED") {
      return err(res, `Cannot respond to an interview invitation while status is ${app.status}`, 400);
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        interviewResponse:        response,
        interviewResponseMessage: message ?? null,
        interviewRespondedAt:     new Date(),
      },
    });

    const workerName = [
      app.worker.workerProfile?.firstName,
      app.worker.workerProfile?.lastName,
    ].filter(Boolean).join(" ") || "The candidate";

    // Fire-and-forget: notify employer — non-fatal, same pattern used everywhere
    // else in this codebase (failures logged, never affect the response already sent).
    Promise.all([
      sendInterviewResponseEmployerEmail(
        app.employer.id, app.employer.email, workerName, app.job.title, response, message, app.jobId,
      ).catch((e: unknown) => console.error("[interview response email]", e)),
      prisma.notification.create({
        data: {
          userId: app.employer.id,
          type:   "APPLICATION_UPDATE",
          title:  response === "ACCEPTED"
            ? `${workerName} accepted your interview invitation`
            : `${workerName} declined your interview invitation`,
          body:   message
            ? `Re: "${app.job.title}" — ${message}`
            : `Re: "${app.job.title}"`,
          link:   `/employer/jobs/${app.jobId}/applicants`,
        },
      }).catch((e: unknown) => console.error("[interview response notif]", e)),
    ]).catch(console.error);

    return ok(res, updated, "Response recorded");
  } catch (e) { next(e); }
}

// ── POST /worker/applications/:id/withdraw ────────────────────────────────────

export async function withdrawApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const app = await prisma.application.findUnique({
      where: { id },
      select: {
        id:         true,
        workerId:   true,
        employerId: true,
        status:     true,
        jobId:      true,
        job:        { select: { title: true, companyName: true } },
        employer:   { select: { email: true } },
        worker:     { select: { workerProfile: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!app)                      return err(res, "Application not found", 404);
    if (app.workerId !== workerId) return err(res, "Forbidden", 403);
    if (app.status !== "APPLIED" && app.status !== "VIEWED") {
      return err(
        res,
        "Cannot withdraw after shortlisting — contact support@directhire.io",
        400,
      );
    }

    await prisma.application.update({
      where: { id },
      data:  { status: "WITHDRAWN" },
    });

    // Decrement applicationCount (floor at 0 — guard against accidental negatives)
    await prisma.$executeRaw`
      UPDATE "job_posts"
      SET    "application_count" = GREATEST(0, "application_count" - 1)
      WHERE  "id" = ${app.jobId}
    `;

    const wName = [
      app.worker.workerProfile?.firstName,
      app.worker.workerProfile?.lastName,
    ].filter(Boolean).join(" ") || "A candidate";

    // Fire-and-forget: notify employer — email + in-app, same non-fatal
    // pattern used at every other status-change site in this file.
    Promise.all([
      sendApplicationWithdrawnEmail(
        app.employerId, app.employer.email,
        wName, app.job.title, app.job.companyName,
      ).catch((e: unknown) => console.error("[withdraw email]", e)),
      prisma.notification.create({
        data: {
          userId: app.employerId,
          type:   "APPLICATION_UPDATE",
          title:  `${wName} withdrew their application`,
          body:   `${wName} withdrew their application for "${app.job.title}".`,
          link:   `/employer/jobs/${app.jobId}/applicants`,
        },
      }).catch((e: unknown) => console.error("[withdraw notif]", e)),
    ]).catch(console.error);

    return ok(res, { success: true });
  } catch (e) { next(e); }
}

// ── GET /worker/applications/:id/contact ─────────────────────────────────────
// Critical security endpoint — only returns employer contact when ALL guards pass.

export async function getContactDetails(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id }   = req.params;

    const app = await prisma.application.findUnique({
      where: { id },
      select: {
        id:                      true,
        workerId:                true,
        employerId:              true,
        status:                  true,
        interviewContactUnlocked: true,
        interviewInstructions:   true,
        companyContactVisibleAt: true,
        job:      { select: { companyName: true } },
        employer: {
          select: {
            email:          true,
            employerProfile: { select: { contactPersonName: true, phone: true } },
          },
        },
      },
    });

    if (!app)                           return err(res, "Application not found", 404);
    if (app.workerId !== workerId)      return err(res, "Forbidden", 403);
    if (!app.interviewContactUnlocked)  return err(res, "Contact details not available", 403);
    if (app.status !== "INTERVIEWED")   return err(res, "Contact details not available for this application status", 403);

    const now = new Date();

    // Fire-and-forget: audit + first-access timestamp
    Promise.all([
      insertAdminAuditLog({
        actorId:  workerId,
        targetId: workerId,
        action:   "CONTACT_DETAILS_ACCESSED",
        metadata: {
          application_id: id,
          employer_id:    app.employerId,
          accessed_at:    now.toISOString(),
        },
      }),
      // Record first access only — don't overwrite subsequent visits
      ...(!app.companyContactVisibleAt
        ? [prisma.application.update({
            where: { id },
            data:  { companyContactVisibleAt: now },
          })]
        : []),
    ]).catch(console.error);

    let contactPhone: string | null = null;
    if (app.employer.employerProfile?.phone) {
      try { contactPhone = decrypt(app.employer.employerProfile.phone); } catch { contactPhone = null; }
    }

    return ok(res, {
      contact_name:           app.employer.employerProfile?.contactPersonName ?? null,
      contact_email:          app.employer.email,
      contact_phone:          contactPhone,
      company_name:           app.job.companyName,
      interview_instructions: app.interviewInstructions,
    });
  } catch (e) { next(e); }
}

// ── GET /worker/applications/:id/documents ────────────────────────────────────
// Phase 4, Step 1 — the blocking gap Phase 3 found: ApplicationDocument had
// admin request/approve but no worker-facing view or submit path at all, so
// no application could progress past APPROVED_QUEUED in practice.

// Reuses FileType.OTHER's bounds from services/storage (pdf/jpeg/png, 20MB) —
// these are arbitrary admin-requested documents (passport scans, medical
// certs, visa forms), not one of the profile-level Upload fileTypes, so
// there's no single existing type to inherit from; OTHER is the closest.
const DOC_ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const DOC_MAX_SIZE = 20 * 1024 * 1024;
const DOC_MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg":       "jpg",
  "image/png":        "png",
};

// ── GET /worker/document-requests ─────────────────────────────────────────────
// Standalone aggregate view across every one of this worker's applications —
// built instead of adding an entry point on worker/applications/page.tsx
// (one of Phase 1's exhaustiveness-surface files, off-limits this phase per
// the Phase 4 prompt's cross-cutting section), matching Step 1's own
// fallback ("your call if a dedicated sub-page reads better"). Mirrors the
// existing standalone /worker/documents (profile-level Upload) page's role
// in the nav — this is the application-level equivalent.

export async function getMyDocumentRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;

    const applications = await prisma.application.findMany({
      where:   { workerId, documents: { some: {} } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        job: { select: { title: true, companyName: true } },
        documents: { orderBy: { createdAt: "asc" } },
      },
    });

    const withFreshUrls = await Promise.all(applications.map(async (app) => ({
      ...app,
      documents: await Promise.all(app.documents.map(async (d) => {
        if (!d.filePath) return d;
        try { return { ...d, fileUrl: await getSignedUrlForPath(d.filePath) }; }
        catch { return d; }
      })),
    })));

    return ok(res, withFreshUrls.map(app => ({
      ...app,
      documents: app.documents.map(({ filePath: _filePath, ...rest }) => rest),
    })));
  } catch (e) { next(e); }
}

export async function getApplicationDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id } = req.params;

    const app = await prisma.application.findUnique({ where: { id }, select: { id: true, workerId: true } });
    if (!app) return err(res, "Application not found", 404);
    if (app.workerId !== workerId) return err(res, "Forbidden", 403);

    const documents = await prisma.applicationDocument.findMany({
      where:   { applicationId: id },
      orderBy: { createdAt: "asc" },
      select:  { id: true, documentType: true, fileUrl: true, filePath: true, status: true, submittedAt: true, reviewedAt: true, createdAt: true },
    });

    // Fresh signed URL on every read (filePath present) rather than trusting
    // the possibly-expired fileUrl captured at submit time — same convention
    // Upload.filePath/isPrivate already uses elsewhere in this codebase.
    const withFreshUrls = await Promise.all(documents.map(async (d) => {
      if (!d.filePath) return d;
      try {
        const url = await getSignedUrlForPath(d.filePath);
        return { ...d, fileUrl: url };
      } catch {
        return d; // fall back to the stored (possibly stale) fileUrl
      }
    }));

    return ok(res, withFreshUrls.map(({ filePath: _filePath, ...rest }) => rest));
  } catch (e) { next(e); }
}

// ── POST /worker/applications/:id/documents/:documentId/submit ───────────────

export async function submitApplicationDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { id, documentId } = req.params;
    const file = req.file;

    if (!file) return err(res, "No file provided", 400);
    if (!DOC_ALLOWED_MIME.includes(file.mimetype)) {
      return err(res, `Invalid file type. Allowed: ${DOC_ALLOWED_MIME.join(", ")}`, 422);
    }
    if (file.size > DOC_MAX_SIZE) {
      return err(res, `File too large. Max ${Math.round(DOC_MAX_SIZE / 1024 / 1024)} MB`, 422);
    }

    const app = await prisma.application.findUnique({ where: { id }, select: { id: true, workerId: true } });
    if (!app) return err(res, "Application not found", 404);
    if (app.workerId !== workerId) return err(res, "Forbidden", 403);

    const doc = await prisma.applicationDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.applicationId !== id) return err(res, "Document request not found", 404);
    if (doc.status !== "REQUESTED") {
      return err(res, `This document is already ${doc.status.toLowerCase()} — nothing to submit.`, 400);
    }

    const ext = DOC_MIME_TO_EXT[file.mimetype] ?? "bin";
    const filePath = `${workerId}/application-documents/${documentId}.${ext}`;
    const fileUrl = await uploadRawBuffer(filePath, file.buffer, file.mimetype, true);

    const now = new Date();
    const updated = await prisma.applicationDocument.update({
      where: { id: documentId },
      data:  { fileUrl, filePath, status: "SUBMITTED", submittedAt: now },
    });

    // In-app admin notification only — no email. Same reasoning as the
    // existing "verified worker re-uploaded a document" notice in
    // uploads.controller.ts: this is a queue-freshness nudge for admins who
    // are already checking the document-verification tab regularly, not an
    // event any individual admin is specifically owed an email for.
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length > 0) {
      prisma.notification.createMany({
        data: admins.map(a => ({
          userId: a.id,
          type:   "DOCUMENT_PENDING",
          title:  "Worker submitted a requested document",
          body:   `${doc.documentType} was submitted and is ready for review.`,
          link:   "/admin/hiring/review",
          metadata: { applicationId: id, documentId },
        })),
      }).catch((e: unknown) => console.error("[submitApplicationDocument admin notif]", e));
    }

    const { filePath: _filePath, ...responseDoc } = updated;
    return ok(res, responseDoc, "Document submitted");
  } catch (e) { next(e); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4, Step 3 — worker side of EmployerDocumentRequest (employer-
// initiated, employer-reviewed; separate from ApplicationDocument above,
// which is admin-initiated/admin-reviewed). Same upload mechanics reused —
// filePath/uploadRawBuffer/getSignedUrlForPath, DOC_ALLOWED_MIME/DOC_MAX_SIZE.
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /worker/employer-document-requests ────────────────────────────────────

export async function getMyEmployerDocumentRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;

    const applications = await prisma.application.findMany({
      where:   { workerId, documentRequests: { some: {} } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        job: { select: { title: true, companyName: true } },
        documentRequests: { orderBy: { createdAt: "asc" } },
      },
    });

    const withFreshUrls = await Promise.all(applications.map(async (app) => ({
      ...app,
      documentRequests: await Promise.all(app.documentRequests.map(async (r) => {
        if (!r.filePath) return r;
        try { return { ...r, fileUrl: await getSignedUrlForPath(r.filePath) }; }
        catch { return r; }
      })),
    })));

    return ok(res, withFreshUrls.map(app => ({
      ...app,
      documentRequests: app.documentRequests.map(({ filePath: _filePath, ...rest }) => rest),
    })));
  } catch (e) { next(e); }
}

// ── POST /worker/employer-document-requests/:requestId/submit ────────────────

export async function submitEmployerDocumentRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { requestId } = req.params;
    const file = req.file;

    if (!file) return err(res, "No file provided", 400);
    if (!DOC_ALLOWED_MIME.includes(file.mimetype)) {
      return err(res, `Invalid file type. Allowed: ${DOC_ALLOWED_MIME.join(", ")}`, 422);
    }
    if (file.size > DOC_MAX_SIZE) {
      return err(res, `File too large. Max ${Math.round(DOC_MAX_SIZE / 1024 / 1024)} MB`, 422);
    }

    const request = await prisma.employerDocumentRequest.findUnique({
      where:  { id: requestId },
      include: { application: { select: { id: true, workerId: true, employerId: true } } },
    });
    if (!request || !request.application) return err(res, "Document request not found", 404);
    if (request.application.workerId !== workerId) return err(res, "Forbidden", 403);
    if (request.status !== "REQUESTED") {
      return err(res, `This document is already ${request.status.toLowerCase()} — nothing to submit.`, 400);
    }

    const ext = DOC_MIME_TO_EXT[file.mimetype] ?? "bin";
    const filePath = `${workerId}/employer-document-requests/${requestId}.${ext}`;
    const fileUrl = await uploadRawBuffer(filePath, file.buffer, file.mimetype, true);

    const now = new Date();
    const updated = await prisma.employerDocumentRequest.update({
      where: { id: requestId },
      data:  { fileUrl, filePath, status: "SUBMITTED", submittedAt: now, notifiedEmployerAt: now },
    });

    // notifiedEmployerAt (Phase 1 field, unused until now) tracks this
    // notification, not the original request-created one — the employer is
    // who needs to know their request was fulfilled.
    prisma.notification.create({
      data: {
        userId: request.application.employerId,
        type:   "DOCUMENT_PENDING",
        title:  "Worker submitted a requested document",
        body:   `${request.label} was submitted and is ready for your review.`,
        link:   `/employer/workers/${workerId}`,
        metadata: { applicationId: request.application.id, requestId },
      },
    }).catch((e: unknown) => console.error("[submitEmployerDocumentRequest employer notif]", e));

    const { filePath: _filePath, ...responseDoc } = updated;
    return ok(res, responseDoc, "Document submitted");
  } catch (e) { next(e); }
}
