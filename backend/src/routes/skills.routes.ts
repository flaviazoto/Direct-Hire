// backend/src/routes/skills.routes.ts
import { Router } from "express";
import * as ctrl from "../skills/skills.controller";

export const skillsRouter = Router();

// Public
skillsRouter.get("/",        ctrl.getSkills);
skillsRouter.get("/search",  ctrl.searchSkills);
