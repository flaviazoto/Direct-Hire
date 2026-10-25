// backend/src/lib/worker-visibility.ts
// What an employer may see about a worker. One place, so the directory,
// worker detail and messaging endpoints can't drift apart.
//
// - Directory: only approved, searchable, active workers.
// - Detail: those workers, plus any worker the employer already has a
//   recruitment relationship with: an application the worker made, or an
//   active reservation (which itself required the worker to be viewable).
//   Group membership is NOT a relationship: employers add members themselves.
// - Contact details (email, phone): only once an application between them has
//   reached CLEARED_FOR_EMPLOYER. Before that, hiring is admin-mediated and
//   the platform doesn't share contact details in either direction.
// - Documents: only presentation media. Medical certificates, identity
//   documents and anything uncategorised stay with verification staff.

import type { FileType, Prisma } from "@prisma/client";
import prisma from "./prisma";

export const EMPLOYER_VISIBLE_FILE_TYPES: FileType[] = ["PROFILE_PHOTO", "INTRO_VIDEO", "WORK_VIDEO"];

/** Workers any verified employer may discover in the directory. */
export const DISCOVERABLE_WORKER_WHERE: Prisma.UserWhereInput = {
  role:          "WORKER",
  status:        "ACTIVE",
  accountStatus: "VERIFIED",
  workerProfile: { is: { isSearchable: true } },
};

/** True when this employer and worker already have a recruitment relationship. */
export async function hasRecruitmentRelationship(employerId: string, workerId: string): Promise<boolean> {
  const [applications, locks] = await Promise.all([
    prisma.application.count({ where: { employerId, workerId, status: { not: "WITHDRAWN" } } }),
    prisma.workerLock.count({ where: { employerId, workerId, lockStatus: "ACTIVE" } }),
  ]);
  return applications + locks > 0;
}

/** May this employer open the worker's profile? */
export async function employerCanViewWorker(employerId: string, workerId: string): Promise<boolean> {
  const discoverable = await prisma.user.count({ where: { ...DISCOVERABLE_WORKER_WHERE, id: workerId } });
  if (discoverable > 0) return true;
  // Relationship access never covers suspended or banned workers.
  const active = await prisma.user.count({
    where: { id: workerId, role: "WORKER", status: "ACTIVE", accountStatus: { not: "SUSPENDED" } },
  });
  return active > 0 && hasRecruitmentRelationship(employerId, workerId);
}

/** Has the hiring process released the worker's contact details to this employer? */
export async function employerContactReleased(employerId: string, workerId: string): Promise<boolean> {
  const cleared = await prisma.application.count({
    where: { employerId, workerId, workflowStatus: "CLEARED_FOR_EMPLOYER" },
  });
  return cleared > 0;
}
