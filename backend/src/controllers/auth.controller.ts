// backend/src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  setAuthCookies, clearAuthCookies, generateSecureToken,
  tokenExpiresAt, COOKIE_REFRESH, verifyHandoffToken,
  type Role,
} from "../lib/auth";
import { ok, err } from "../lib/response";
import { enqueue } from "../services/queue";
import { z } from "zod";
import { generateOTP, hashOTP, verifyOTP } from "../common/utils/otp.util";
import { sendEmail, sendOtpVerification } from "../services/email";
import { insertAuditLog } from "../lib/audit";

// ── Schemas ───────────────────────────────────────────────────
const RegisterSchema = z.object({
  firstName:       z.string().trim().min(1).max(100),
  lastName:        z.string().trim().min(1).max(100),
  email:           z.string().email(),
  password:        z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirmPassword: z.string(),
  role:            z.enum(["WORKER", "EMPLOYER"]),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const ForgotSchema = z.object({ email: z.string().email() });

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

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
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

    // Issue tokens
    const tokenPayload = { sub: result.user.id, email: result.user.email, role: result.user.role as Role };
    const accessToken  = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    await prisma.session.create({
      data: { userId: result.user.id, refreshToken, expiresAt: tokenExpiresAt(24 * 30) },
    });

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

    setAuthCookies(res, accessToken, refreshToken);
    return ok(res, {
      user:  { id: result.user.id, email: result.user.email, role: result.user.role },
      email: result.user.email,
      accessToken,
      token: accessToken,
      role: result.user.role,
    }, "Check your email for a verification code", 201);
  } catch (e) { next(e); }
}

// ── login ─────────────────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) return err(res, "Invalid email or password", 401);

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid)  return err(res, "Invalid email or password", 401);

    if (user.status === "SUSPENDED") return err(res, "Your account has been suspended. Contact support.", 403, { accountStatus: "SUSPENDED" });
    if (user.status === "BANNED")    return err(res, "Account permanently disabled.", 403);

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

    const tokenPayload = { sub: user.id, email: user.email, role: user.role as Role };
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
    const token = req.cookies?.[COOKIE_REFRESH];
    let userId: string | undefined;
    if (token) {
      const session = await prisma.session
        .findUnique({ where: { refreshToken: token }, select: { userId: true } })
        .catch(() => undefined);
      userId = session?.userId;
      await prisma.session.deleteMany({ where: { refreshToken: token } }).catch(() => {});
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
    const token = req.cookies?.[COOKIE_REFRESH];
    if (!token) {
      clearAuthCookies(res);
      return err(res, "No refresh token", 401);
    }

    let payload;
    try { payload = await verifyRefreshToken(token); }
    catch {
      clearAuthCookies(res);
      return err(res, "Invalid or expired refresh token", 401);
    }

    const session = await prisma.session.findUnique({ where: { refreshToken: token } });
    if (!session || session.expiresAt < new Date()) {
      await prisma.session.deleteMany({ where: { refreshToken: token } }).catch(() => {});
      clearAuthCookies(res);
      return err(res, "Session expired", 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === "BANNED" || user.status === "SUSPENDED") {
      await prisma.session.deleteMany({ where: { refreshToken: token } }).catch(() => {});
      clearAuthCookies(res);
      return err(res, "Account unavailable", 403);
    }

    const newPayload      = { sub: user.id, email: user.email, role: user.role as Role };
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
    const user = await prisma.user.findUnique({ where: { email } });

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
      await enqueue("email.passwordReset", { userId: user.id, to: email, resetUrl });
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
const SendCodeSchema   = z.object({ email: z.string().email() });
const VerifyCodeSchema = z.object({ email: z.string().email(), code: z.string().length(6) });

// ── sendVerificationCode ──────────────────────────────────────
export async function sendVerificationCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = SendCodeSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    // Generic success even when user not found — prevents email enumeration
    if (!user) return ok(res, null, "Verification code sent");

    if (user.isEmailVerified) return err(res, "Email already verified", 400);

    // Per-user rate limit: max 3 codes in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.verificationCode.count({
      where: {
        userId:    user.id,
        type:      "EMAIL_VERIFICATION",
        createdAt: { gt: oneHourAgo },
      },
    });
    if (recentCount >= 3) {
      return err(res, "Too many requests. Try again in an hour.", 429);
    }

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
    sendOtpVerification(user.id, email, code, 10).catch((e) =>
      console.error("[sendVerificationCode] email error:", e)
    );

    return ok(res, null, "Verification code sent");
  } catch (e) { next(e); }
}

// ── verifyEmailCode ───────────────────────────────────────────
export async function verifyEmailCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code } = VerifyCodeSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return err(res, "User not found", 404);

    // Latest unused code for this user
    const record = await prisma.verificationCode.findFirst({
      where:   { userId: user.id, type: "EMAIL_VERIFICATION", usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!record) return err(res, "No pending verification. Request a new code.", 400);

    if (record.expiresAt < new Date()) {
      return err(res, "Code expired. Request a new one.", 400);
    }

    if (record.attempts >= 5) {
      return err(res, "Too many failed attempts. Request a new code.", 429);
    }

    // Increment attempts before verifying (counts this attempt)
    await prisma.verificationCode.update({
      where: { id: record.id },
      data:  { attempts: { increment: 1 } },
    });

    const valid = await verifyOTP(code, record.codeHash);
    if (!valid) return err(res, "Invalid code.", 400);

    // Success — mark code used and update user
    await prisma.$transaction([
      prisma.verificationCode.update({
        where: { id: record.id },
        data:  { usedAt: new Date() },
      }),
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
    sendEmail({
      userId:    user.id,
      to:        email,
      emailType: "EMAIL_VERIFICATION",
      subject:   "Your email has been verified",
      html: `<p>Your email has been verified. Your account is now under review. We'll notify you once approved.</p>`,
      text: "Your email has been verified. Your account is now under review.",
    }).catch((e) => console.error("[verifyEmailCode] email error:", e));

    return ok(res, { accountStatus: "PENDING_REVIEW" }, "Email verified. Your account is under review.");
  } catch (e) { next(e); }
}

// ── deleteAccount ─────────────────────────────────────────────
export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return err(res, "User not found", 404);

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

    // Remove applications where user is the employer (no cascade for employer relation)
    if (role === "EMPLOYER") {
      await prisma.application.deleteMany({ where: { employerId: userId } });
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
    if (user.status === "BANNED" || user.status === "SUSPENDED") {
      return err(res, "Account unavailable", 403);
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokenPayload = { sub: user.id, email: user.email, role: user.role as Role };
    const accessToken  = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    await prisma.session.create({
      data: { userId: user.id, refreshToken, expiresAt: tokenExpiresAt(24 * 30) },
    });

    setAuthCookies(res, accessToken, refreshToken);
    return ok(res, { role: user.role, accessToken, token: accessToken });
  } catch (e) { next(e); }
}
