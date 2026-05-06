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
} from "../services/email";
import { insertAdminAuditLog } from "../lib/audit";
import { calculateMatchScore } from "../services/matching";
import { calculateApplicationFeeAsync } from "../services/pricing";
import stripe from "../services/stripe";

// ── Shared select for list + detail ──────────────────────────────────────────

const APPLICATION_LIST_SELECT = {
  id:                       true,
  status:                   true,
  createdAt:                true,
  updatedAt:                true,
  coverLetter:              true,
  interviewContactUnlocked: true,
  interviewInstructions:    true,
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
      employerProfile: { select: { subscriptionStatus: true } },
    },
  },
} as const;

const WORKER_SCORE_SELECT = {
  email: true,
  workerProfile: {
    select: {
      firstName:          true,
      yearsExperience:    true,
      expectedSalary:     true,
      trustScore:         true,
      countryOfResidence: true,
      skills:          { select: { skill: true } },
      targetCountries: { select: { country: true } },
    },
  },
} as const;

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
    },
  });

  await prisma.jobPost.update({
    where: { id: jobId },
    data:  { applicationCount: { increment: 1 } },
  });

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
    // Create Payment record when fee was charged
    ...(feeCents > 0 && stripePaymentIntentId
      ? [prisma.payment.create({
          data: {
            userId:          workerId,
            stripePaymentId: stripePaymentIntentId,
            amount:          feeCents,
            currency:        "USD",
            status:          "SUCCEEDED",
            type:            "APPLICATION_FEE",
            description:     `Application fee — ${job.title} at ${job.companyName}`,
          },
        })]
      : []),
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

    if (job.employer.employerProfile?.subscriptionStatus !== "ACTIVE") {
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

    if (job.employer.employerProfile?.subscriptionStatus !== "ACTIVE") {
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
            phone:          true,
            employerProfile: { select: { contactPersonName: true } },
          },
        },
      },
    });

    if (!app)                       return err(res, "Application not found", 404);
    if (app.workerId !== workerId)  return err(res, "Forbidden", 403);

    // Build company_contact only when unlocked — never expose employer PII before that
    let companyContact: Record<string, unknown> | null = null;
    if (app.interviewContactUnlocked) {
      companyContact = {
        contact_name:           app.employer.employerProfile?.contactPersonName ?? null,
        contact_email:          app.employer.email,
        contact_phone:          app.employer.phone ?? null,
        company_name:           app.job.companyName,
        interview_instructions: app.interviewInstructions,
      };
    }

    // Strip internal employer relation from the response payload
    const { employer: _employer, ...rest } = app;
    return ok(res, { ...rest, company_contact: companyContact });
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

    // Fire-and-forget: notify employer
    sendApplicationWithdrawnEmail(
      app.employerId, app.employer.email,
      wName, app.job.title, app.job.companyName,
    ).catch(console.error);

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
            phone:          true,
            employerProfile: { select: { contactPersonName: true } },
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

    return ok(res, {
      contact_name:           app.employer.employerProfile?.contactPersonName ?? null,
      contact_email:          app.employer.email,
      contact_phone:          app.employer.phone ?? null,
      company_name:           app.job.companyName,
      interview_instructions: app.interviewInstructions,
    });
  } catch (e) { next(e); }
}
