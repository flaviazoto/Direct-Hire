import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { eraseWorker } from "./erasure.service";

// POST /api/admin/workers/:id/erase
export async function eraseWorkerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.headers["x-confirm-erase"] !== "true") {
      return err(res, "Missing required header: X-Confirm-Erase: true", 400);
    }

    const { id: workerId } = req.params;
    const adminId = req.user!.sub;

    const user = await prisma.user.findUnique({
      where:  { id: workerId, role: "WORKER" },
      select: { id: true },
    });
    if (!user) return err(res, "Worker not found", 404);

    await eraseWorker(workerId, adminId);

    return ok(res, null, "Worker data erased");
  } catch (e) { next(e); }
}
