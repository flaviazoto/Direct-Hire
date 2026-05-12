// backend/src/routes/contact.routes.ts
import { Router } from "express";
import { submitContact } from "../controllers/contact.controller";

export const contactRouter = Router();

contactRouter.post("/", submitContact);
