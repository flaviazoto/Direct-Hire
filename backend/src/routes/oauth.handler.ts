// backend/src/routes/oauth.handler.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../lib/prisma";
import { issueHandoffToken, type Role } from "../lib/auth";

// ── Internal helpers ──────────────────────────────────────────

interface OAuthUserInput {
  provider:   "google" | "linkedin";
  providerId: string;
  email:      string;
  firstName:  string;
  lastName:   string;
  avatarUrl?: string;
  role?:      Role;
}

async function findOrCreateOAuthUser(input: OAuthUserInput) {
  const providerField = input.provider === "google" ? "googleId" : "linkedinId";

  // Find by provider ID first
  const byProvider = await (prisma.user as any).findFirst({
    where: { [providerField]: input.providerId },
  });
  if (byProvider) return byProvider;

  // Fall back to email — link the provider to an existing account
  const byEmail = await prisma.user.findUnique({ where: { email: input.email } });
  if (byEmail) {
    return (prisma.user as any).update({
      where: { id: byEmail.id },
      data: {
        [providerField]: input.providerId,
        ...((input.avatarUrl && !(byEmail as any).avatarUrl) ? { avatarUrl: input.avatarUrl } : {}),
      },
    });
  }

  // Create new user + profile + onboarding in one transaction
  const role       = input.role ?? "WORKER";
  const totalSteps = role === "WORKER" ? 7 : 6;
  const randomPass = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);

  return prisma.$transaction(async (tx) => {
    const newUser = await (tx.user as any).create({
      data: {
        email:           input.email,
        passwordHash:    randomPass,
        role,
        status:          "ACTIVE",
        isEmailVerified: true,
        accountStatus:   "PENDING_REVIEW",
        [providerField]: input.providerId,
        avatarUrl:       input.avatarUrl ?? null,
      },
    });

    if (role === "WORKER") {
      await tx.workerProfile.create({
        data: { userId: newUser.id, firstName: input.firstName, lastName: input.lastName },
      });
    } else {
      await tx.employerProfile.create({
        data: { userId: newUser.id, contactPersonName: `${input.firstName} ${input.lastName}`.trim() },
      });
    }

    await tx.onboardingProgress.create({
      data: {
        userId:           newUser.id,
        role,
        currentStep:      0,
        completedSteps:   [],
        draftData:        { email: input.email, firstName: input.firstName, lastName: input.lastName },
        totalSteps,
        onboardingStatus: "DRAFT",
      },
    });

    await tx.verificationRecord.create({ data: { userId: newUser.id, reviewStatus: "PENDING" } });

    return newUser;
  });
}

function encodeState(data: Record<string, string>): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

function decodeState(state: string): Record<string, string> {
  try { return JSON.parse(Buffer.from(state, "base64").toString()); }
  catch { return {}; }
}

function isSafeRedirect(path: string): boolean {
  try {
    if (!path || !path.startsWith("/")) return false;
    if (path.startsWith("//")) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(path)) return false;
    const decoded = decodeURIComponent(path);
    if (decoded.includes("://") || decoded.startsWith("//")) return false;
    return true;
  } catch { return false; }
}

function buildRedirect(user: any, fallback: string): string {
  const onboarded    = !!(user as any).onboardingComplete;
  const base         = (user.role as string).toLowerCase();
  const safeRedirect = isSafeRedirect(fallback) ? fallback : `/${base}/dashboard`;
  return onboarded ? safeRedirect : `/${base}/onboarding`;
}

// ── Initiate handlers ─────────────────────────────────────────

export function linkedinInitiate(req: Request, res: Response) {
  const role  = (req.query.role as string) || "WORKER";
  // Accept frontend-generated state (contains nonce + redirect); fall back to server-generated
  const rawState    = req.query.state as string | undefined;
  const frontendState = rawState ? decodeState(rawState) : null;
  const redirect    = frontendState
    ? (isSafeRedirect(frontendState.redirect ?? "") ? (frontendState.redirect ?? "") : "")
    : (isSafeRedirect((req.query.redirect as string) ?? "") ? (req.query.redirect as string) : "");
  const nonce = frontendState?.nonce ?? crypto.randomBytes(16).toString("hex");
  const state = encodeState({ role, redirect, nonce });

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri:  `${process.env.BACKEND_URL}/api/auth/linkedin/callback`,
    state,
    scope:         "openid profile email",
  });

  return res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
}

export function googleInitiate(req: Request, res: Response) {
  const role  = (req.query.role as string) || "WORKER";
  const rawState    = req.query.state as string | undefined;
  const frontendState = rawState ? decodeState(rawState) : null;
  const redirect    = frontendState
    ? (isSafeRedirect(frontendState.redirect ?? "") ? (frontendState.redirect ?? "") : "")
    : (isSafeRedirect((req.query.redirect as string) ?? "") ? (req.query.redirect as string) : "");
  const nonce = frontendState?.nonce ?? crypto.randomBytes(16).toString("hex");
  const state = encodeState({ role, redirect, nonce });

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  `${process.env.BACKEND_URL}/api/auth/google/callback`,
    state,
    scope:         "openid email profile",
    access_type:   "online",
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

// ── Callback handlers ─────────────────────────────────────────

export async function linkedinCallback(req: Request, res: Response) {
  const FRONTEND = process.env.FRONTEND_URL!;
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) return res.redirect(`${FRONTEND}/login?error=linkedin_failed`);

  const { role, redirect, nonce } = decodeState(state ?? "");

  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        redirect_uri:  `${process.env.BACKEND_URL}/api/auth/linkedin/callback`,
        grant_type:    "authorization_code",
      }),
    });
    const tokens = await tokenRes.json() as Record<string, string>;
    if (tokens.error) throw new Error(tokens.error_description ?? "LinkedIn auth failed");

    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as Record<string, string>;

    const user         = await findOrCreateOAuthUser({
      provider:   "linkedin",
      providerId: profile.sub,
      email:      profile.email,
      firstName:  profile.given_name  ?? "",
      lastName:   profile.family_name ?? "",
      avatarUrl:  profile.picture,
      role:       ((role ?? "WORKER").toUpperCase() as Role),
    });
    const handoffToken = await issueHandoffToken({ sub: user.id, email: user.email, role: user.role as Role });
    const dest         = buildRedirect(user, redirect);
    const nonceParam   = nonce ? `&nonce=${encodeURIComponent(nonce)}` : "";

    return res.redirect(`${FRONTEND}/auth/callback?token=${handoffToken}&role=${user.role}&redirect=${encodeURIComponent(dest)}${nonceParam}`);
  } catch (e) {
    console.error("LinkedIn OAuth error:", e);
    return res.redirect(`${FRONTEND}/login?error=linkedin_failed`);
  }
}

export async function googleCallback(req: Request, res: Response) {
  const FRONTEND = process.env.FRONTEND_URL!;
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) return res.redirect(`${FRONTEND}/login?error=google_failed`);

  const { role, redirect, nonce } = decodeState(state ?? "");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  `${process.env.BACKEND_URL}/api/auth/google/callback`,
        grant_type:    "authorization_code",
      }),
    });
    const tokens = await tokenRes.json() as Record<string, string>;
    if (tokens.error) throw new Error(tokens.error_description ?? "Google auth failed");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as Record<string, string>;

    const user         = await findOrCreateOAuthUser({
      provider:   "google",
      providerId: profile.sub,
      email:      profile.email,
      firstName:  profile.given_name  ?? "",
      lastName:   profile.family_name ?? "",
      avatarUrl:  profile.picture,
      role:       ((role ?? "WORKER").toUpperCase() as Role),
    });
    const handoffToken = await issueHandoffToken({ sub: user.id, email: user.email, role: user.role as Role });
    const dest         = buildRedirect(user, redirect);
    const nonceParam   = nonce ? `&nonce=${encodeURIComponent(nonce)}` : "";

    return res.redirect(`${FRONTEND}/auth/callback?token=${handoffToken}&role=${user.role}&redirect=${encodeURIComponent(dest)}${nonceParam}`);
  } catch (e) {
    console.error("Google OAuth error:", e);
    return res.redirect(`${FRONTEND}/login?error=google_failed`);
  }
}
