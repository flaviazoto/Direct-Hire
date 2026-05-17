// backend/src/workers/trust.controller.ts
// GET /api/worker/trust — compute and return the authenticated worker's trust score.
//
// Formula (bounded [0, 100]):
//   completeness_score  × 0.30
//   hire_success_rate   × 0.30  (ACCEPTED / total_applications × 100)
//   employer_rating_avg × 0.25  (avg of employer ratings; 0 until model exists)
//   document_verification × 0.15 (100 if documentsVerified, else 0)
//
// Recalculates and persists on every GET; appends to trust_score_history.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";

// ── Tier logic ────────────────────────────────────────────────────────────────

const TIER_THRESHOLDS = { verified: 40, trusted: 70, elite: 90 } as const;

type Tier = "new" | "verified" | "trusted" | "elite";

function toTier(score: number): Tier {
  if (score >= TIER_THRESHOLDS.elite)    return "elite";
  if (score >= TIER_THRESHOLDS.trusted)  return "trusted";
  if (score >= TIER_THRESHOLDS.verified) return "verified";
  return "new";
}

// ── GET /api/worker/trust ─────────────────────────────────────────────────────

export async function getWorkerTrust(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const workerId = req.user!.sub;

    // ── 1. Fetch everything in parallel ──────────────────────────────────────
    const [profile, applications, uploads, history] = await Promise.all([
      prisma.workerProfile.findUnique({
        where:  { userId: workerId },
        select: {
          id:               true,
          documentsVerified: true,
          fatherName:       true,
          motherName:       true,
          hasSpouse:        true,
          spouseName:       true,
          numberOfChildren: true,
          expectedSalary:   true,
          skills:           { select: { id: true } },
          languages:        { select: { id: true } },
          targetCountries:  { select: { id: true } },
        },
      }),
      // All applications for hire rate
      prisma.application.findMany({
        where:  { workerId },
        select: { status: true },
      }),
      // Uploads for photo / video / certificate checks
      prisma.upload.findMany({
        where:   { userId: workerId, deletedAt: null },
        select:  { fileType: true },
      }),
      // Last 12 history entries
      prisma.trustScoreHistory.findMany({
        where:   { workerId },
        orderBy: { createdAt: "desc" },
        take:    12,
        select:  { score: true, reason: true, createdAt: true },
      }),
    ]);

    if (!profile) return err(res, "Worker profile not found", 404);

    // ── 2. Completeness items ─────────────────────────────────────────────────

    const uploadTypes = new Set(uploads.map(u => u.fileType));

    const hasFamily =
      !!profile.fatherName ||
      !!profile.motherName ||
      profile.hasSpouse    ||
      !!profile.spouseName ||
      profile.numberOfChildren > 0;

    const completenessItems = [
      { label: "Profile photo uploaded",     field: "profile_photo_url",        done: uploadTypes.has("PROFILE_PHOTO")        },
      { label: "Work video uploaded",        field: "work_video_url",            done: uploadTypes.has("WORK_VIDEO")           },
      { label: "Intro video uploaded",       field: "intro_video_url",           done: uploadTypes.has("INTRO_VIDEO")          },
      { label: "Skills added",               field: "worker_skills",             done: profile.skills.length >= 1              },
      { label: "Languages added",            field: "worker_languages",          done: profile.languages.length >= 1           },
      { label: "Target countries set",       field: "worker_target_countries",   done: profile.targetCountries.length >= 1     },
      { label: "Expected salary set",        field: "expected_salary",           done: profile.expectedSalary !== null         },
      { label: "Family details added",       field: "worker_family",             done: hasFamily                               },
      { label: "Medical certificate uploaded", field: "medical_certificate_url", done: uploadTypes.has("MEDICAL_CERTIFICATE")  },
    ];

    const doneCount       = completenessItems.filter(i => i.done).length;
    const completenessScore = Math.round((doneCount / completenessItems.length) * 100);

    // ── 3. Hire success rate ──────────────────────────────────────────────────

    const totalApps  = applications.length;
    const hiredCount = applications.filter(a => a.status === "ACCEPTED").length;
    const hireSuccessRate = totalApps > 0
      ? Math.round((hiredCount / totalApps) * 100)
      : 0;

    // ── 4. Employer rating avg (placeholder — no EmployerRating model yet) ────
    const employerRatingAvg = 0;

    // ── 5. Document verification ──────────────────────────────────────────────
    const documentVerification = profile.documentsVerified ? 100 : 0;

    // ── 6. Weighted trust score ───────────────────────────────────────────────
    const rawScore =
      completenessScore  * 0.30 +
      hireSuccessRate    * 0.30 +
      employerRatingAvg  * 0.25 +
      documentVerification * 0.15;

    const trustScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    // ── 7. Persist — update WorkerProfile.trustScore + append history ─────────
    await Promise.all([
      prisma.workerProfile.update({
        where: { userId: workerId },
        data:  { trustScore },
      }),
      prisma.trustScoreHistory.create({
        data: {
          workerId,
          score:  trustScore,
          reason: "auto_recalc",
        },
      }),
    ]);

    // ── 8. Build response ─────────────────────────────────────────────────────

    return ok(res, {
      trust_score:  trustScore,
      tier:         toTier(trustScore),
      tier_thresholds: TIER_THRESHOLDS,
      completeness_score: completenessScore,
      completeness_items: completenessItems,
      score_breakdown: {
        profile_completeness:   completenessScore,
        hire_success_rate:      hireSuccessRate,
        employer_rating_avg:    employerRatingAvg,
        document_verification:  documentVerification,
      },
      history: history.map(h => ({
        score:      h.score,
        reason:     h.reason,
        created_at: h.createdAt,
      })),
    });
  } catch (e) { next(e); }
}
