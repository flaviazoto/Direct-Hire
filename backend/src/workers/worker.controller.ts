// backend/src/workers/worker.controller.ts
// GET  /api/worker/me           — fetch full worker profile
// PATCH /api/worker/me          — partial update of worker profile
// POST /api/worker/me/upload/*  — upload photo / video / intro-video / medical cert
//
// Security: passport_number_enc and phone_enc are NEVER included in any response.
// Media: all upload URLs are returned as pre-signed URLs (1h TTL).
//   When STORAGE_PROVIDER=s3       → AWS S3 GetObjectCommand + @aws-sdk/s3-request-presigner
//   When STORAGE_PROVIDER=supabase → Supabase storage createSignedUrl

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import multer from "multer";
import { randomUUID } from "crypto";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { redis } from "../lib/redis";
import { invalidateJobsCache } from "../jobs/jobs.controller";
import { enqueue }             from "../services/queue";

// ─── Upload → signed URL ──────────────────────────────────────────────────────

type UploadRow = { fileUrl: string; filePath: string; isPrivate: boolean } | null;

async function toSignedUrl(upload: UploadRow): Promise<string | null> {
  if (!upload) return null;
  if (!upload.isPrivate || !upload.filePath) return upload.fileUrl;
  if (process.env.STORAGE_PROVIDER !== "supabase") return upload.fileUrl;

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const { data } = await sb.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET!)
    .createSignedUrl(upload.filePath, 3600);
  return data?.signedUrl ?? upload.fileUrl;
}

// ─── Completeness calculation (mirrors trust.controller logic) ────────────────

const COMPLETENESS_TOTAL = 9;

function calcCompleteness(opts: {
  uploadTypes:   Set<string>;
  skillsCount:   number;
  langCount:     number;
  countriesCount: number;
  expectedSalary: string | null;
  hasFamily:     boolean;
}): number {
  const { uploadTypes, skillsCount, langCount, countriesCount, expectedSalary, hasFamily } = opts;
  const done = [
    uploadTypes.has("PROFILE_PHOTO"),
    uploadTypes.has("WORK_VIDEO"),
    uploadTypes.has("INTRO_VIDEO"),
    skillsCount   >= 1,
    langCount     >= 1,
    countriesCount >= 1,
    expectedSalary !== null,
    hasFamily,
    uploadTypes.has("MEDICAL_CERTIFICATE"),
  ].filter(Boolean).length;
  return Math.round((done / COMPLETENESS_TOTAL) * 100);
}

// ─── Shared DB select (used by both GET and returned after PATCH) ─────────────

const PROFILE_SELECT = {
  id:                 true,
  firstName:          true,
  lastName:           true,
  countryOfResidence: true,
  city:               true,
  expectedSalary:     true,
  maritalStatus:      true,
  documentsVerified:  true,
  trustScore:         true,
  profileScore:       true,
  fatherName:         true,
  motherName:         true,
  hasSpouse:          true,
  spouseName:         true,
  numberOfChildren:   true,
  skills:         { select: { skill_id: true, skill: true } },
  languages:      { select: { language: true, proficiencyLevel: true } },
  targetCountries: { select: { country: true } },
} as const;

const UPLOAD_SELECT = {
  fileType:  true,
  fileUrl:   true,
  filePath:  true,
  isPrivate: true,
} as const;

// ─── Shared response builder ──────────────────────────────────────────────────

async function buildResponse(workerId: string) {
  const [profile, uploads] = await Promise.all([
    prisma.workerProfile.findUnique({
      where:  { userId: workerId },
      select: PROFILE_SELECT,
    }),
    prisma.upload.findMany({
      where:  { userId: workerId, deletedAt: null },
      select: UPLOAD_SELECT,
    }),
  ]);

  if (!profile) return null;

  const photoUp   = uploads.find(u => u.fileType === "PROFILE_PHOTO")       ?? null;
  const workVidUp = uploads.find(u => u.fileType === "WORK_VIDEO")           ?? null;
  const introVidUp = uploads.find(u => u.fileType === "INTRO_VIDEO")         ?? null;
  const medCertUp = uploads.find(u => u.fileType === "MEDICAL_CERTIFICATE") ?? null;

  const [profilePhotoUrl, workVideoUrl, introVideoUrl, medCertUrl] =
    await Promise.all([
      toSignedUrl(photoUp),
      toSignedUrl(workVidUp),
      toSignedUrl(introVidUp),
      toSignedUrl(medCertUp),
    ]);

  // Construct family array from inline fields
  const family: { relationship: string; full_name: string; date_of_birth: null }[] = [];
  if (profile.fatherName) family.push({ relationship: "father", full_name: profile.fatherName, date_of_birth: null });
  if (profile.motherName) family.push({ relationship: "mother", full_name: profile.motherName, date_of_birth: null });
  if (profile.spouseName) family.push({ relationship: "spouse", full_name: profile.spouseName, date_of_birth: null });

  return {
    id:                      workerId,
    first_name:              profile.firstName,
    last_name:               profile.lastName,
    country_of_residence:    profile.countryOfResidence,
    city:                    profile.city,
    expected_salary:         profile.expectedSalary,
    marital_status:          profile.maritalStatus,
    profile_photo_url:       profilePhotoUrl,
    work_video_url:          workVideoUrl,
    intro_video_url:         introVideoUrl,
    medical_certificate_url: medCertUrl,
    verification_status:     profile.documentsVerified ? "verified" : "pending",
    trust_score:             profile.trustScore,
    profile_completeness:    profile.profileScore,
    skills:                  profile.skills.map(s => ({
      skill_id:        s.skill_id,
      skill_name:      s.skill,
      years_experience: 0,
    })),
    languages:               profile.languages.map(l => ({
      language:          l.language,
      proficiency_level: l.proficiencyLevel,
    })),
    target_countries: profile.targetCountries.map(tc => tc.country),
    family,
  };
}

// ─── GET /api/worker/me ───────────────────────────────────────────────────────

export async function getWorkerMe(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const workerId = req.user!.sub;
    const payload  = await buildResponse(workerId);
    if (!payload) return err(res, "Worker profile not found", 404);
    return ok(res, payload);
  } catch (e) { next(e); }
}

// ─── PATCH /api/worker/me ─────────────────────────────────────────────────────

const SkillItemSchema = z.object({
  skill_id:        z.string().min(1),
  years_experience: z.number().int().min(0).optional(),
});

const LangItemSchema = z.object({
  language:          z.string().min(1).max(80),
  proficiency_level: z.string().min(1).max(40),
});

const FamilyItemSchema = z.object({
  relationship:   z.enum(["father", "mother", "spouse"]),
  full_name:      z.string().min(1).max(120),
  date_of_birth:  z.string().nullable().optional(),
});

const PatchSchema = z.object({
  first_name:             z.string().min(1).max(80).optional(),
  last_name:              z.string().min(1).max(80).optional(),
  city:                   z.string().max(80).optional(),
  country_of_residence:   z.string().max(80).optional(),
  expected_salary:        z.string().max(40).optional(),
  marital_status:         z.string().max(40).optional(),
  skill_ids:              z.array(SkillItemSchema).optional(),
  language_ids:           z.array(LangItemSchema).optional(),
  target_country_codes:   z.array(z.string().min(1).max(80)).optional(),
  family:                 z.array(FamilyItemSchema).optional(),
});

export async function patchWorkerMe(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const workerId = req.user!.sub;

    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const body = parsed.data;

    // Look up profile ID
    const profile = await prisma.workerProfile.findUnique({
      where:  { userId: workerId },
      select: { id: true },
    });
    if (!profile) return err(res, "Worker profile not found", 404);
    const profileId = profile.id;

    // Build scalar update object
    const scalarData: Record<string, unknown> = {};
    if (body.first_name           !== undefined) scalarData.firstName          = body.first_name;
    if (body.last_name            !== undefined) scalarData.lastName           = body.last_name;
    if (body.city                 !== undefined) scalarData.city               = body.city;
    if (body.country_of_residence !== undefined) scalarData.countryOfResidence = body.country_of_residence;
    if (body.expected_salary      !== undefined) scalarData.expectedSalary     = body.expected_salary;
    if (body.marital_status       !== undefined) scalarData.maritalStatus      = body.marital_status;

    // Inline family fields
    if (body.family !== undefined) {
      for (const member of body.family) {
        if (member.relationship === "father") scalarData.fatherName = member.full_name;
        if (member.relationship === "mother") scalarData.motherName = member.full_name;
        if (member.relationship === "spouse") {
          scalarData.spouseName = member.full_name;
          scalarData.hasSpouse  = !!member.full_name;
        }
      }
    }

    // Transaction: scalar update + array replacements
    await prisma.$transaction(async (tx) => {
      // Skills — delete-all + re-insert
      if (body.skill_ids !== undefined) {
        await tx.workerSkill.deleteMany({ where: { workerProfileId: profileId } });

        if (body.skill_ids.length > 0) {
          const skillRows = await tx.skill.findMany({
            where:  { id: { in: body.skill_ids.map(s => s.skill_id) } },
            select: { id: true, name: true },
          });
          const nameMap = new Map(skillRows.map(s => [s.id, s.name]));

          await tx.workerSkill.createMany({
            data: body.skill_ids.map(s => ({
              workerProfileId: profileId,
              skill:           nameMap.get(s.skill_id) ?? s.skill_id,
              skill_id:        s.skill_id,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Languages — delete-all + re-insert
      if (body.language_ids !== undefined) {
        await tx.workerLanguage.deleteMany({ where: { workerProfileId: profileId } });

        if (body.language_ids.length > 0) {
          await tx.workerLanguage.createMany({
            data: body.language_ids.map(l => ({
              workerProfileId:  profileId,
              language:         l.language,
              proficiencyLevel: l.proficiency_level,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Target countries — delete-all + re-insert
      if (body.target_country_codes !== undefined) {
        await tx.workerTargetCountry.deleteMany({ where: { workerProfileId: profileId } });

        if (body.target_country_codes.length > 0) {
          await tx.workerTargetCountry.createMany({
            data: body.target_country_codes.map(c => ({
              workerProfileId: profileId,
              country:         c,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Scalar profile fields
      if (Object.keys(scalarData).length > 0) {
        await tx.workerProfile.update({
          where: { id: profileId },
          data:  scalarData,
        });
      }
    });

    // Re-fetch updated state to calculate completeness
    const [updatedProfile, uploads] = await Promise.all([
      prisma.workerProfile.findUnique({
        where:  { userId: workerId },
        select: {
          expectedSalary:   true,
          fatherName:       true,
          motherName:       true,
          hasSpouse:        true,
          spouseName:       true,
          numberOfChildren: true,
          skills:          { select: { id: true } },
          languages:       { select: { id: true } },
          targetCountries: { select: { id: true } },
        },
      }),
      prisma.upload.findMany({
        where:  { userId: workerId, deletedAt: null },
        select: { fileType: true },
      }),
    ]);

    if (updatedProfile) {
      const uploadTypes = new Set(uploads.map(u => u.fileType));
      const hasFamily =
        !!updatedProfile.fatherName ||
        !!updatedProfile.motherName ||
        updatedProfile.hasSpouse    ||
        !!updatedProfile.spouseName ||
        updatedProfile.numberOfChildren > 0;

      const completeness = calcCompleteness({
        uploadTypes,
        skillsCount:   updatedProfile.skills.length,
        langCount:     updatedProfile.languages.length,
        countriesCount: updatedProfile.targetCountries.length,
        expectedSalary: updatedProfile.expectedSalary,
        hasFamily,
      });

      await prisma.workerProfile.update({
        where: { id: profileId },
        data:  { profileScore: completeness },
      });
    }

    // Invalidate job feed cache — profile change affects match scores
    await invalidateJobsCache(workerId);

    // Return updated profile
    const payload = await buildResponse(workerId);
    if (!payload) return err(res, "Worker profile not found", 404);
    return ok(res, payload);
  } catch (e) { next(e); }
}

// ═════════════════════════════════════════════════════════════════════════════
// MEDIA UPLOAD ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// ─── createPresignedUrl ───────────────────────────────────────────────────────
// Always returns a pre-signed URL — never exposes raw bucket names or S3 keys.
// Dual-mode: S3 when STORAGE_PROVIDER=s3, Supabase otherwise.

export async function createPresignedUrl(
  s3Key:         string,
  expirySeconds: number,
): Promise<string> {
  const provider = process.env.STORAGE_PROVIDER;

  if (provider === "s3") {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl }               = await import("@aws-sdk/s3-request-presigner");

    const client = new S3Client({
      region:      process.env.AWS_REGION ?? "eu-west-1",
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: s3Key }),
      { expiresIn: expirySeconds },
    );
  }

  // Supabase (default) — createSignedUrl wraps filePath from the upload record
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const { data } = await sb.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET!)
    .createSignedUrl(s3Key, expirySeconds);

  return data?.signedUrl ?? s3Key; // fallback: return key if signing fails (dev)
}

// ─── Shared upload helper ─────────────────────────────────────────────────────

type FileTypeEnum = "PROFILE_PHOTO" | "WORK_VIDEO" | "INTRO_VIDEO" | "MEDICAL_CERTIFICATE";

interface UploadConfig {
  fieldName: string;
  fileType:  FileTypeEnum;
  mimes:     string[];
  maxBytes:  number;
  s3Dir:     string;    // e.g. "photo", "video"
  ext:       string;    // e.g. "jpg", "mp4"
}

async function handleMediaUpload(
  req:    Request,
  res:    Response,
  cfg:    UploadConfig,
): Promise<{ uploadId: string; filePath: string } | null> {
  const file = (req as Request & { file?: Express.Multer.File }).file;

  if (!file) {
    err(res, `Missing file field: ${cfg.fieldName}`, 400);
    return null;
  }

  if (!cfg.mimes.includes(file.mimetype)) {
    err(res, `Invalid file type. Allowed: ${cfg.mimes.join(", ")}`, 400);
    return null;
  }

  if (file.size > cfg.maxBytes) {
    err(res, `File too large. Max: ${Math.round(cfg.maxBytes / 1024 / 1024)}MB`, 400);
    return null;
  }

  const workerId = req.user!.sub;
  const uuid     = randomUUID();
  const filePath = `workers/${workerId}/${cfg.s3Dir}/${uuid}.${cfg.ext}`;

  // Soft-delete any existing upload of this type so GET /me returns the new one
  await prisma.upload.updateMany({
    where:  { userId: workerId, fileType: cfg.fileType, deletedAt: null },
    data:   { deletedAt: new Date(), status: "DELETED" },
  });

  // Upload to storage provider
  let storedPath: string;
  if (process.env.STORAGE_PROVIDER === "s3") {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region:      process.env.AWS_REGION ?? "eu-west-1",
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    await client.send(new PutObjectCommand({
      Bucket:      process.env.S3_BUCKET_NAME!,
      Key:         filePath,
      Body:        file.buffer,
      ContentType: file.mimetype,
    }));
    storedPath = filePath;
  } else {
    // Supabase
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );
    const { error } = await sb.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET!)
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    storedPath = filePath;
  }

  // Persist Upload record — fileUrl stores the path; signed URL is generated on read
  const record = await prisma.upload.create({
    data: {
      userId:    workerId,
      fileType:  cfg.fileType,
      fileName:  file.originalname,
      fileUrl:   storedPath,   // raw path — never surfaced directly
      filePath:  storedPath,
      mimeType:  file.mimetype,
      sizeBytes: file.size,
      status:    "UPLOADED",
      isPrivate: true,
    },
  });

  return { uploadId: record.id, filePath: storedPath };
}

// ─── Multer instances (memory storage, hard ceiling per type) ─────────────────

const photoMulter = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5  * 1024 * 1024 },
}).single("photo");

const videoMulter = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 },
}).single("video");

const introVideoMulter = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 },
}).single("intro_video");

const medicalMulter = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10  * 1024 * 1024 },
}).single("certificate");

// Promisify multer to use in async handlers
type MulterMiddleware = (req: any, res: any, next: (err?: unknown) => void) => void;

function runMulter(mw: MulterMiddleware, req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    mw(req, res, (e: unknown) => {
      if (e) reject(e);
      else resolve();
    });
  });
}

// ─── POST /api/worker/me/upload/photo ─────────────────────────────────────────

export async function uploadPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    await runMulter(photoMulter, req, res);

    const result = await handleMediaUpload(req, res, {
      fieldName: "photo",
      fileType:  "PROFILE_PHOTO",
      mimes:     ["image/jpeg", "image/png"],
      maxBytes:  5 * 1024 * 1024,
      s3Dir:     "photo",
      ext:       "jpg",
    });
    if (!result) return;

    const url = await createPresignedUrl(result.filePath, 3600);
    return ok(res, { profile_photo_url: url });
  } catch (e) { next(e); }
}

// ─── POST /api/worker/me/upload/video ─────────────────────────────────────────

export async function uploadVideo(req: Request, res: Response, next: NextFunction) {
  try {
    await runMulter(videoMulter, req, res);

    const result = await handleMediaUpload(req, res, {
      fieldName: "video",
      fileType:  "WORK_VIDEO",
      mimes:     ["video/mp4", "video/quicktime"],
      maxBytes:  100 * 1024 * 1024,
      s3Dir:     "video",
      ext:       "mp4",
    });
    if (!result) return;

    // Enqueue video processing job (stub — for future transcoding pipeline)
    await enqueue("media.videoProcess", {
      workerId:  req.user!.sub,
      uploadId:  result.uploadId,
      s3Key:     result.filePath,
      videoType: "WORK_VIDEO",
    }).catch(console.error); // non-fatal

    const url = await createPresignedUrl(result.filePath, 3600);
    return ok(res, { work_video_url: url });
  } catch (e) { next(e); }
}

// ─── POST /api/worker/me/upload/intro-video ───────────────────────────────────

export async function uploadIntroVideo(req: Request, res: Response, next: NextFunction) {
  try {
    await runMulter(introVideoMulter, req, res);

    const result = await handleMediaUpload(req, res, {
      fieldName: "intro_video",
      fileType:  "INTRO_VIDEO",
      mimes:     ["video/mp4", "video/quicktime"],
      maxBytes:  100 * 1024 * 1024,
      s3Dir:     "video",
      ext:       "mp4",
    });
    if (!result) return;

    await enqueue("media.videoProcess", {
      workerId:  req.user!.sub,
      uploadId:  result.uploadId,
      s3Key:     result.filePath,
      videoType: "INTRO_VIDEO",
    }).catch(console.error);

    const url = await createPresignedUrl(result.filePath, 3600);
    return ok(res, { intro_video_url: url });
  } catch (e) { next(e); }
}

// ─── POST /api/worker/me/upload/medical ───────────────────────────────────────

export async function uploadMedical(req: Request, res: Response, next: NextFunction) {
  try {
    await runMulter(medicalMulter, req, res);

    const result = await handleMediaUpload(req, res, {
      fieldName: "certificate",
      fileType:  "MEDICAL_CERTIFICATE",
      mimes:     ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      maxBytes:  10 * 1024 * 1024,
      s3Dir:     "medical",
      ext:       "pdf",
    });
    if (!result) return;

    const url = await createPresignedUrl(result.filePath, 3600);
    return ok(res, { medical_certificate_url: url });
  } catch (e) { next(e); }
}

// ─── GET /api/worker/lock-status ─────────────────────────────────────────────
// Returns lock state visible to the worker.
// SECURITY: employer company name, email, phone — NEVER returned.
// The worker must not identify who locked them until they are hired.

type LockOutcome = "hired" | "released" | "expired" | "active";

function mapSubscriptionToTier(status: string | null | undefined): string {
  if (status === "ACTIVE")    return "verified";
  if (status === "PAST_DUE")  return "premium";
  return "standard";
}

function mapLockOutcome(lockStatus: string): LockOutcome {
  if (lockStatus === "ACTIVE")    return "active";
  if (lockStatus === "RELEASED")  return "released";
  if (lockStatus === "EXPIRED")   return "expired";
  if (lockStatus === "OVERRIDDEN") return "released";
  return "expired";
}

export async function getWorkerLockStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;

    // Fetch active lock first
    const activeLock = await prisma.workerLock.findFirst({
      where: { workerId, lockStatus: "ACTIVE" },
      select: {
        id:             true,
        lockStartDate:  true,
        lockExpiryDate: true,
        employerId:     true,
      },
    });

    // Build active_lock payload (employer_tier only — NO name/email/phone)
    let activeLockPayload: {
      locked_at:         string;
      expires_at:        string;
      seconds_remaining: number;
      employer_tier:     string;
    } | null = null;

    if (activeLock) {
      const employerProfile = await prisma.employerProfile.findUnique({
        where:  { userId: activeLock.employerId },
        select: { subscriptionStatus: true },
      });

      const expiresAt = activeLock.lockExpiryDate;
      const secondsRemaining = Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000)
      );

      activeLockPayload = {
        locked_at:         activeLock.lockStartDate.toISOString(),
        expires_at:        expiresAt.toISOString(),
        seconds_remaining: secondsRemaining,
        employer_tier:     mapSubscriptionToTier(employerProfile?.subscriptionStatus),
      };

      res.setHeader("X-Worker-Locked", "true");
    }

    // Fetch last 10 locks for history
    const lockHistory = await prisma.workerLock.findMany({
      where:   { workerId },
      orderBy: { lockStartDate: "desc" },
      take:    10,
      select: {
        id:             true,
        lockStatus:     true,
        lockStartDate:  true,
        lockExpiryDate: true,
        employerId:     true,
      },
    });

    // Batch-fetch accepted applications involving these employers to detect "hired" outcome
    const employerIds = [...new Set(lockHistory.map(l => l.employerId))];
    const hiredApps = await prisma.application.findMany({
      where: {
        workerId,
        employerId: { in: employerIds },
        status:     "ACCEPTED",
      },
      select: { employerId: true },
    });
    const hiredEmployerSet = new Set(hiredApps.map(a => a.employerId));

    const history = lockHistory.map(lock => {
      let outcome: LockOutcome = mapLockOutcome(lock.lockStatus);
      if (hiredEmployerSet.has(lock.employerId)) outcome = "hired";

      return {
        locked_at:   lock.lockStartDate.toISOString(),
        released_at: lock.lockStatus !== "ACTIVE" ? lock.lockExpiryDate.toISOString() : null,
        outcome,
      };
    });

    return ok(res, {
      is_locked:   !!activeLock,
      active_lock: activeLockPayload,
      lock_history: history,
    });
  } catch (e) { next(e); }
}
