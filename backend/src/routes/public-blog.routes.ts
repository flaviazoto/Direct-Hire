// backend/src/routes/public-blog.routes.ts
// Mounted at /api/public/blog — no auth required on any of these routes.
import { Router } from "express";
import * as ctrl from "../controllers/public-blog.controller";

export const publicBlogRouter = Router();

// Static routes MUST come before /:slug to avoid being swallowed by the param route
publicBlogRouter.get("/",       ctrl.getPublicBlogPosts);
publicBlogRouter.get("/:slug",  ctrl.getPublicBlogPost);
