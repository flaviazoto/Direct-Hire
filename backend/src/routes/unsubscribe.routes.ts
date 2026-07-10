// backend/src/routes/unsubscribe.routes.ts
import { Router } from "express";
import { unsubscribe } from "../controllers/unsubscribe.controller";

export const unsubscribeRouter = Router();

unsubscribeRouter.get("/", unsubscribe);
