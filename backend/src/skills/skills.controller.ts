// backend/src/skills/skills.controller.ts
import { Request, Response } from "express";
import { z } from "zod";
import { ok, created, err } from "../lib/response";
import * as svc from "./skills.service";

// ── Public endpoints ──────────────────────────────────────────────────────────

export async function getSkills(_req: Request, res: Response) {
  try {
    const data = await svc.getAllSkillsGrouped();
    return ok(res, data);
  } catch (e) {
    return err(res, "Failed to fetch skills", 500);
  }
}

export async function searchSkills(req: Request, res: Response) {
  const q = String(req.query.q ?? "").trim();
  if (!q) return ok(res, []);
  if (q.length > 100) return err(res, "Query too long", 400);

  try {
    const data = await svc.searchSkills(q);
    return ok(res, data);
  } catch (e) {
    return err(res, "Search failed", 500);
  }
}

export async function adminListSkills(_req: Request, res: Response) {
  try {
    const data = await svc.getAllSkillsAdmin();
    return ok(res, data);
  } catch (e) {
    return err(res, "Failed to fetch skills", 500);
  }
}

// ── Admin endpoints ───────────────────────────────────────────────────────────

const CreateSchema = z.object({
  name:     z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  aliases:  z.array(z.string()).optional(),
});

const UpdateSchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  category:  z.string().min(1).max(100).optional(),
  aliases:   z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

export async function adminCreateSkill(req: Request, res: Response) {
  const parse = CreateSchema.safeParse(req.body);
  if (!parse.success) return err(res, "Validation error", 400, { details: parse.error.flatten() });

  try {
    const skill = await svc.createSkill(parse.data);
    return created(res, skill, "Skill created");
  } catch (e: any) {
    if (e?.code === "P2002") return err(res, "A skill with that name already exists", 409);
    return err(res, "Failed to create skill", 500);
  }
}

export async function adminUpdateSkill(req: Request, res: Response) {
  const { id } = req.params;
  const parse = UpdateSchema.safeParse(req.body);
  if (!parse.success) return err(res, "Validation error", 400, { details: parse.error.flatten() });

  try {
    const skill = await svc.updateSkill(id, parse.data);
    return ok(res, skill, "Skill updated");
  } catch (e: any) {
    if (e?.code === "P2025") return err(res, "Skill not found", 404);
    return err(res, "Failed to update skill", 500);
  }
}

export async function adminDeleteSkill(req: Request, res: Response) {
  const { id } = req.params;
  try {
    await svc.softDeleteSkill(id);
    return ok(res, null, "Skill deactivated");
  } catch (e: any) {
    if (e?.code === "P2025") return err(res, "Skill not found", 404);
    return err(res, "Failed to delete skill", 500);
  }
}
