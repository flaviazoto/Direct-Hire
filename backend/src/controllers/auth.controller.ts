// backend/src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  setAuthCookies, clearAuthCookies, generateSecureToken,
  tokenExpiresAt, verifyHandoffToken, freshAuthPayload, isRecentAuth,
  readRefreshTokens, type Role,
} from "../lib/auth";
import { zEmail, userEmailWhere } from "../lib/email-normalize";
import { ok, err } from "../lib/response";
import { enqueue } from "../services/queue";
import { z } from "zod";
import { generateOTP, hashOTP, verifyOTP } from "../common/utils/otp.util";
import { sendOtpVerification, sendEmailVerified } from "../services/email";
import { insertAuditLog } from "../lib/audit";

// GDPR consent — bump whenever /terms or /privacy changes materially
// (both currently show "Last updated: January 2025").
const CURRENT_CONSENT_POLICY_VERSION = "2025-01";

// ── Schemas ───────────────────────────────────────────────────
const RegisterSchema = z.object({
  firstName:       z.string().trim().min(1).max(100),
  lastName:        z.string().trim().min(1).max(100),
  email:           zEmail(),
  password:        z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirmPassword: z.string(),
  role:            z.enum(["WORKER", "EMPLOYER"]),
  acceptedTerms:   z.boolean().refine(v => v === true, {
    message: "You must accept the Terms of Service and Privacy Policy",
  }),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});

const LoginSchema = z.object({
  email:    zEmail(),
  password: z.string().min(1),
});

const ForgotSchema = z.object({ email: zEmail() });

const ResetSchema = z.object({
  token:           z.string().min(1),
  password:        z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

// ── register ──────────────────────────────────────────────────
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = RegisterSchema.parse(req.body);

    const existing = await prisma.user.findFirst({ where: userEmailWhere(input.email) });
    if (existing) return err(res, "An account with this email already exists", 409);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const totalSteps   = input.role === "WORKER" ? 7 : 6;

    // Create user + profile + onboarding in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          role:   input.role,
          status: "PENDING_VERIFICATION",
          isEmailVerified: false,
          consentAcceptedAt:    new Date(),
          consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION,
        },
      });

      if (input.role === "WORKER") {
        await tx.workerProfile.create({
          data: {
            userId: user.id,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });
      } else {
        await tx.employerProfile.create({
          data: {
            userId: user.id,
            contactPersonName: `${input.firstName} ${input.lastName}`.trim(),
          },
        });
      }

      await tx.onboardingProgress.create({
        data: {
          userId:          user.id,
          role:            input.role,
          currentStep:     0,
          completedSteps:  [],
          draftData:       {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
          },
          totalSteps,
          onboardingStatus: "DRAFT",
        },
      });

      await tx.verificationRecord.create({ data: { userId: user.id, reviewStatus: "PENDING" } });

      return { user };
    });

    // No tokens or session here: the account can't be used until the email
    // is verified and the user signs in.

    // Generate OTP and store it (replaces token-based email verification)
    const code      = generateOTP();
    const hash      = await hashOTP(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.$transaction([
      prisma.verificationCode.deleteMany({
        where: { userId: result.user.id, type: "EMAIL_VERIFICATION", usedAt: null },
      }),
      prisma.verificationCode.create({
        data: { userId: result.user.id, type: "EMAIL_VERIFICATION", codeHash: hash, expiresAt, attempts: 0 },
      }),
      prisma.user.update({
        where: { id: result.user.id },
        data:  { emailVerificationSentAt: new Date() },
      }),
    ]);

    await enqueue("email.welcome", {
      userId: result.user.id, to: input.email,
      firstName: input.firstName, role: input.role,
    });

    sendOtpVerification(result.user.id, input.email, code, 10).catch((e) =>
      console.error("[register] OTP email error:", e)
    );

    return ok(res, {
      user:  { id: result.user.id, email: result.user.email, role: result.user.role },
      email: result.user.email,
      role: result.user.role,
    }, "Check your email for a verification code", 201);
  } catch (e) { next(e); }
}

// ── login ─────────────────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = LoginSchema.parse(req.body);

    const user = await prisma.user.findFirst({ where: userEmailWhere(input.email) });
    if (!user) return err(res, "Invalid email or password", 401);

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid)  return err(res, "Invalid email or password", 401);

    if (user.status === "SUSPENDED") return err(res, "Your account has been suspended. Contact support.", 403, { accountStatus: "SUSPENDED" });
    if (user.status === "BANNED")    return err(res, "Account permanently disabled.", 403);
    if (user.accountStatus === "SUSPENDED") return err(res, "Your account has been suspended. Contact support.", 403, { accountStatus: "SUSPENDED" });

    // Account status gate — ADMIN role bypasses this (seeded accounts skip OTP flow)
    if (user.role !== "ADMIN") {
      if (user.accountStatus === "PENDING_EMAIL_VERIFICATION") {
        return err(res, "Please verify your email before signing in.", 403, { accountStatus: "PENDING_EMAIL_VERIFICATION" });
      }
      if (user.accountStatus === "PENDING_REVIEW") {
        return err(res, "Your account is under review.", 403, { accountStatus: "PENDING_REVIEW" });
      }
      if (user.accountStatus === "REJECTED") {
        return err(res, "Your account application was not approved.", 403, { accountStatus: "REJECTED" });
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokenPayload = freshAuthPayload(user);
    const accessToken  = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    await prisma.session.create({
      data: { userId: user.id, refreshToken, expiresAt: tokenExpiresAt(24 * 30) },
    });

    // Redirect logic
    const progress = await prisma.onboardingProgress.findUnique({ where: { userId: user.id } });
    const redirectTo = (progress && !progress.isSubmitted)
      ? `/${user.role.toLowerCase()}/onboarding`
      : `/${user.role.toLowerCase()}/dashboard`;

    setAuthCookies(res, accessToken, refreshToken);
    return ok(res, {
      user: { id: user.id, email: user.email, role: user.role },
      redirectTo,
      accessToken,
      token: accessToken,
      role: user.role,
    });
  } catch (e) { next(e); }
}

// ── logout ────────────────────────────────────────────────────
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const tokens = readRefreshTokens(req);
    let userId: string | undefined;
    if (tokens.length) {
      const session = await prisma.session
        .findFirst({ where: { refreshToken: { in: tokens } }, select: { userId: true } })
        .catch(() => undefined);
      userId = session?.userId ?? undefined;
      await prisma.session.deleteMany({ where: { refreshToken: { in: tokens } } }).catch(() => {});
    }
    if (userId) {
      insertAuditLog({ actorId: userId, targetId: userId, action: "LOGOUT", entity: "Session" }).catch(() => {});
    }
    clearAuthCookies(res);
    return ok(res, null, "Logged out successfully");
  } catch (e) { next(e); }
}

// ── refresh ───────────────────────────────────────────────────
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const candidates = readRefreshTokens(req);
    if (candidates.length === 0) {
      clearAuthCookies(res);
      return err(res, "No refresh token", 401);
    }

    // A browser may send a stale legacy-path cookie alongside the current one;
    // use the first candidate that verifies and still has a live session.
    let token:   string | undefined;
    let payload: Awaited<ReturnType<typeof verifyRefreshToken>> | undefined;
    for (const candidate of candidates) {
      try {
        const verified = await verifyRefreshToken(candidate);
        const session  = await prisma.session.findUnique({ where: { refreshToken: candidate } });
        if (session && session.expiresAt >= new Date() && session.userId === verified.sub) {
          token = candidate; payload = verified;
          break;
        }
      } catch { /* try the next candidate */ }
    }
    if (!token || !payload) {
      await prisma.session.deleteMany({ where: { refreshToken: { in: candidates } } }).catch(() => {});
      clearAuthCookies(res);
      return err(res, "Session expired", 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (
      !user || user.status === "BANNED" || user.status === "SUSPENDED" ||
      user.accountStatus === "SUSPENDED" ||
      (user.accountStatus === "PENDING_EMAIL_VERIFICATION" && user.role !== "ADMIN")
    ) {
      await prisma.session.deleteMany({ where: { refreshToken: token } }).catch(() => {});
      clearAuthCookies(res);
      return err(res, "Account unavailable", 403);
    }

    // authTime is carried forward: refreshing is not a fresh sign-in.
    const newPayload      = { sub: user.id, email: user.email, role: user.role as Role, authTime: payload.authTime };
    const newAccessToken  = await signAccessToken(newPayload);
    const newRefreshToken = await signRefreshToken(newPayload);

    await prisma.$transaction([
      prisma.session.deleteMany({ where: { refreshToken: token } }),
      prisma.session.create({
        data: { userId: user.id, refreshToken: newRefreshToken, expiresAt: tokenExpiresAt(24 * 30) },
      }),
    ]);

    setAuthCookies(res, newAccessToken, newRefreshToken);
    return ok(res, { role: user.role, accessToken: newAccessToken, token: newAccessToken });
  } catch (e) { next(e); }
}

// ── forgotPassword ────────────────────────────────────────────
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = ForgotSchema.parse(req.body);
    const user = await prisma.user.findFirst({ where: userEmailWhere(email) });

    if (user) {
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data:  { usedAt: new Date() },
      });
      const token    = generateSecureToken();
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: tokenExpiresAt(1) },
      });
      await enqueue("email.passwordReset", { userId: user.id, to: user.email, resetUrl });
    }

    // Always return success (prevents email enumeration)
    return ok(res, null, "If an account exists, a reset link has been sent.");
  } catch (e) { next(e); }
}

// ── resetPassword ─────────────────────────────────────────────
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const input  = ResetSchema.parse(req.body);
    const record = await prisma.passwordResetToken.findUnique({
      where: { token: input.token },
    });

    if (!record)                       return err(res, "Invalid or expired reset token", 400);
    if (record.usedAt)                 return err(res, "Reset link already used", 400);
    if (record.expiresAt < new Date()) return err(res, "Reset link has expired", 400);

    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);

    return ok(res, null, "Password reset successfully. Please log in.");
  } catch (e) { next(e); }
}

// ── verifyEmail ───────────────────────────────────────────────
export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = VerifyEmailSchema.parse(req.body);

    const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
    if (!record)                       return err(res, "Invalid or expired token", 400);
    if (record.usedAt)                 return err(res, "Token already used", 400);
    if (record.expiresAt < new Date()) return err(res, "Token expired", 400);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data:  { isEmailVerified: true, accountStatus: "PENDING_REVIEW" },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data:  { usedAt: new Date() },
      }),
    ]);

    return ok(res, { verified: true, accountStatus: "PENDING_REVIEW" }, "Email verified successfully.");
  } catch (e) { next(e); }
}


// ── Schemas for OTP endpoints ─────────────────────────────────
// Compared against when there is no real code, so failures take as long as
// a genuine check. Hash of a random value that is not a 6-digit code.
const DUMMY_OTP_HASH = "$2a$10$PpYH/ZumCgm4ORfSAw7lmOhn6lkvcPe/Uc7L/NavZrqPa4qggYcKO";
const SendCodeSchema   = z.object({ email: zEmail() });
const VerifyCodeSchema = z.object({ email: zEmail(), code: z.string().length(6) });

// ── sendVerificationCode ──────────────────────────────────────
export async function sendVerificationCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = SendCodeSchema.parse(req.body);

    const user = await prisma.user.findFirst({ where: userEmailWhere(email) });

    // Same response for unknown, already-verified and rate-limited addresses,
    // so the endpoint can't be used to discover which emails have accounts.
    const GENERIC = "If this email needs verifying, a code has been sent.";
    if (!user || user.isEmailVerified) return ok(res, null, GENERIC);

    // Per-user rate limit: max 3 codes in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.verificationCode.count({
      where: {
        userId:    user.id,
        type:      "EMAIL_VERIFICATION",
        createdAt: { gt: oneHourAgo },
      },
    });
    if (recentCount >= 3) return ok(res, null, GENERIC);

    const code = generateOTP();
    const hash = await hashOTP(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.$transaction([
      // Delete any existing unused codes for this user+type
      prisma.verificationCode.deleteMany({
        where: { userId: user.id, type: "EMAIL_VERIFICATION", usedAt: null },
      }),
      // Insert new code
      prisma.verificationCode.create({
        data: {
          userId:   user.id,
          type:     "EMAIL_VERIFICATION",
          codeHash: hash,
          expiresAt,
          attempts: 0,
        },
      }),
      // Stamp sent time on user
      prisma.user.update({
        where: { id: user.id },
        data:  { emailVerificationSentAt: new Date() },
      }),
    ]);

    // Fire-and-forget — email failure must not fail the request
    sendOtpVerification(user.id, user.email, code, 10).catch((e) =>
      console.error("[sendVerificationCode] email error:", e)
    );

    return ok(res, null, GENERIC);
  } catch (e) { next(e); }
}

// ── verifyEmailCode ───────────────────────────────────────────
export async function verifyEmailCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code } = VerifyCodeSchema.parse(req.body);

    // One response for every failure (unknown email, no code, expired, too
    // many attempts, wrong code) and one bcrypt comparison on every path, so
    // status, body and timing don't reveal whether the account exists.
    const fail = () => err(res, "Invalid or expired code. Request a new code if needed.", 400);

    const user = await prisma.user.findFirst({
      where: userEmailWhere(email),
      include: { workerProfile: true, employerProfile: true },
    });
    const record = user
      ? await prisma.verificationCode.findFirst({
          where:   { userId: user.id, type: "EMAIL_VERIFICATION", usedAt: null },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const valid = await verifyOTP(code, record?.codeHash ?? DUMMY_OTP_HASH);
    if (!user || !record || record.expiresAt < new Date()) return fail();

    // Count the attempt atomically; concurrent guesses can't exceed the cap.
    const counted = await prisma.verificationCode.updateMany({
      where: { id: record.id, usedAt: null, attempts: { lt: 5 } },
      data:  { attempts: { increment: 1 } },
    });
    if (counted.count === 0 || !valid) return fail();

    // Success — mark code used (only once) and update user
    const claimed = await prisma.verificationCode.updateMany({
      where: { id: record.id, usedAt: null },
      data:  { usedAt: new Date() },
    });
    if (claimed.count === 0) return fail();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified:             true,
          accountStatus:               "PENDING_REVIEW",
          emailVerificationCodeHash:   null,
          emailVerificationExpiresAt:  null,
        },
      }),
    ]);

    // Notify user — fire-and-forget
    sendEmailVerified(user.id, user.email, user.workerProfile?.firstName ?? user.employerProfile?.contactPersonName?.split(" ")[0] ?? "there", user.role as "WORKER" | "EMPLOYER")
      .catch((e) => console.error("[verifyEmailCode] email error:", e));

    return ok(res, { accountStatus: "PENDING_REVIEW" }, "Email verified. Your account is under review.");
  } catch (e) { next(e); }
}

// ── deleteAccount ─────────────────────────────────────────────
const REAUTH_WINDOW_SECONDS = 10 * 60;
const DeleteAccountSchema   = z.object({ password: z.string().max(200).optional() });

export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return err(res, "User not found", 404);

    // Require recent authentication: the current password, or a sign-in within
    // the last 10 minutes (covers Google accounts, which have no usable password).
    const { password } = DeleteAccountSchema.parse(req.body ?? {});
    const passwordOk = password ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!passwordOk && !isRecentAuth(req.user!, REAUTH_WINDOW_SECONDS)) {
      return err(res, password ? "Incorrect password." : "Please confirm your password to delete your account.", 401, { code: "REAUTH_REQUIRED" });
    }

    // Write audit log BEFORE deleting the user (FK would prevent it after)
    await insertAuditLog({
      actorId:  userId,
      targetId: userId,
      action:   "ACCOUNT_DELETED",
      entity:   "User",
      entityId: userId,
      metadata: { email: user.email, role, deletedAt: new Date().toISOString() },
    });

    // Anonymize existing AuditLog entries (actorId is a plain string — no FK)
    await prisma.auditLog.updateMany({
      where: { actorId: userId },
      data:  { actorId: "DELETED_USER" },
    });

    // Remove AdminAuditLog rows (NOT NULL FKs with no onDelete — Restrict)
    await prisma.adminAuditLog.deleteMany({
      where: { OR: [{ adminId: userId }, { targetUserId: userId }] },
    });

    // A worker's applications cascade away with the user; keep each job's
    // applicationCount (non-withdrawn applications) in step.
    if (role === "WORKER") {
      const open = await prisma.application.groupBy({
        by:    ["jobId"],
        where: { workerId: userId, status: { not: "WITHDRAWN" } },
        _count: { _all: true },
      });
      for (const g of open) {
        await prisma.jobPost.updateMany({
          where: { id: g.jobId, applicationCount: { gte: g._count._all } },
          data:  { applicationCount: { decrement: g._count._all } },
        });
      }
    }

    // Remove applications where user is the employer (no cascade for employer relation)
    if (role === "EMPLOYER") {
      await prisma.application.deleteMany({ where: { employerId: userId } });
    }

    // Phase 2 sub-step 1: two more restrict-by-default FKs from the Phase 1
    // admin-mediated-hiring-workflow schema, same "no cascade" reasoning as
    // the Application.employerId case above. Every other new FK from that
    // migration already resolves itself automatically on user deletion:
    // WorkerGroup.employerId/WorkerGroupMember.workerId/
    // EmployerDocumentRequest.employerId all cascade, and every nullable
    // "reviewed/updated/prepared by admin" FK already defaults to SET NULL —
    // confirmed directly against the applied migration SQL, not assumed.
    if (role === "WORKER") {
      await prisma.adminFeeCharge.deleteMany({ where: { workerId: userId } });
    }
    if (role === "EMPLOYER") {
      await prisma.bulkQuoteRequest.deleteMany({ where: { employerId: userId } });
    }

    // Invalidate all sessions explicitly
    await prisma.session.deleteMany({ where: { userId } });

    // Delete the user — cascades handle everything else
    await prisma.user.delete({ where: { id: userId } });

    clearAuthCookies(res);
    return ok(res, null, "Account deleted");
  } catch (e) { next(e); }
}

// ── oauthComplete ─────────────────────────────────────────────
export async function oauthComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);

    let payload;
    try { payload = await verifyHandoffToken(token); }
    catch { return err(res, "Invalid or expired OAuth token", 401); }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return err(res, "User not found", 404);
    if (user.status === "BANNED" || user.status === "SUSPENDED" || user.accountStatus === "SUSPENDED") {
      return err(res, "Account unavailable", 403);
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokenPayload = freshAuthPayload(user);
    const accessToken  = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    await prisma.session.create({
      data: { userId: user.id, refreshToken, expiresAt: tokenExpiresAt(24 * 30) },
    });

    setAuthCookies(res, accessToken, refreshToken);
    return ok(res, {
      user: { id: user.id, email: user.email, role: user.role },
      role: user.role,
      accessToken,
      token: accessToken,
    });
  } catch (e) { next(e); }
}
