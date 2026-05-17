// backend/src/matching/skill-vector.service.ts
import prisma from "../lib/prisma";
import { redis } from "../lib/redis";

const SKILL_INDEX_KEY = "skills:index";
const SKILL_INDEX_TTL = 6 * 60 * 60; // 6 hours

/**
 * Returns a Map of { skill_id → vector index } ordered by created_at ASC.
 * Cached in Redis under 'skills:index' for 6 hours.
 */
export async function getSkillIndex(): Promise<Map<string, number>> {
  const cached = await redis.get(SKILL_INDEX_KEY);
  if (cached) {
    const obj = JSON.parse(cached) as Record<string, number>;
    return new Map(Object.entries(obj));
  }

  const skills = await prisma.skill.findMany({
    where: { is_active: true },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });

  const index = new Map<string, number>();
  skills.forEach((s, i) => index.set(s.id, i));

  const serialisable: Record<string, number> = {};
  index.forEach((v, k) => { serialisable[k] = v; });
  await redis.set(SKILL_INDEX_KEY, JSON.stringify(serialisable), "EX", SKILL_INDEX_TTL);

  return index;
}

/**
 * Encodes a list of skill IDs as a sparse binary vector aligned to the
 * full skill index. Unknown IDs are silently ignored.
 */
async function encodeSkills(skillIds: string[]): Promise<number[]> {
  const index = await getSkillIndex();
  const vector = new Float32Array(index.size); // zero-filled
  for (const id of skillIds) {
    const idx = index.get(id);
    if (idx !== undefined) vector[idx] = 1;
  }
  return Array.from(vector);
}

export async function encodeWorkerSkills(workerSkillIds: string[]): Promise<number[]> {
  return encodeSkills(workerSkillIds);
}

export async function encodeJobSkills(jobSkillIds: string[]): Promise<number[]> {
  return encodeSkills(jobSkillIds);
}

/**
 * Pure cosine similarity between two numeric vectors.
 * Returns 0 if either vector is all zeros (avoids division by zero).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot  = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Encodes worker and job skill ID lists, computes cosine similarity,
 * and returns a score in [0, 100].
 */
export async function computeSkillScore(
  workerSkillIds: string[],
  jobSkillIds: string[],
): Promise<number> {
  const [workerVec, jobVec] = await Promise.all([
    encodeWorkerSkills(workerSkillIds),
    encodeJobSkills(jobSkillIds),
  ]);

  const similarity = cosineSimilarity(workerVec, jobVec);
  return Math.min(100, Math.max(0, Math.round(similarity * 100)));
}
