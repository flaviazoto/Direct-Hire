// backend/src/routes/contact.routes.ts
import { Router } from "express";
import { submitContact } from "../controllers/contact.controller";
import { contactLimiter } from "../middleware/ratelimit.middleware";

export const contactRouter = Router();

contactRouter.post("/", contactLimiter, submitContact);

