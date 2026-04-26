// backend/src/routes/auth.routes.ts
import { Router } from "express";
import * as ctrl from "../controllers/auth.controller";
import { authLimiter, otpLimiter } from "../middleware/ratelimit.middleware";
import { requireAnyAuth } from "../middleware/auth.middleware";
import { googleCallback, linkedinCallback, googleInitiate, linkedinInitiate } from "./oauth.handler";

export const authRouter = Router();

authRouter.post("/register",               authLimiter, ctrl.register);
authRouter.post("/login",                  authLimiter, ctrl.login);
authRouter.post("/logout",                 ctrl.logout);
authRouter.post("/refresh",                ctrl.refresh);
authRouter.post("/forgot-password",        authLimiter, ctrl.forgotPassword);
authRouter.post("/reset-password",         authLimiter, ctrl.resetPassword);
authRouter.post("/verify-email",           ctrl.verifyEmail);
authRouter.post("/send-verification-code", otpLimiter,          ctrl.sendVerificationCode);
authRouter.post("/verify-email-code",      otpLimiter,          ctrl.verifyEmailCode);
authRouter.post("/oauth/complete",         authLimiter, ctrl.oauthComplete);
authRouter.delete("/account",              requireAnyAuth, ctrl.deleteAccount);

// OAuth initiate — rate-limited to prevent abuse
authRouter.get("/linkedin",          authLimiter, linkedinInitiate);
authRouter.get("/google",            authLimiter, googleInitiate);

// OAuth callbacks — NO auth middleware (these are the endpoints that create the token)
authRouter.get("/google/callback",   googleCallback);
authRouter.get("/linkedin/callback", linkedinCallback);
