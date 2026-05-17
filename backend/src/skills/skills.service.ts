// backend/src/skills/skills.service.ts
import prisma from "../lib/prisma";
import { redis } from "../lib/redis";

const CACHE_KEY = "skills:all";
const CACHE_TTL = 3600;

type SkillGroup = { category: string; skills: { id: string; name: string }[] };

export async function getAllSkillsGrouped(): Promise<SkillGroup[]> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as SkillGroup[];

  const skills = await prisma.skill.findMany({
    where: { is_active: true },
    select: { id: true, name: true, category: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const groupMap = new Map<string, { id: string; name: string }[]>();
  for (const s of skills) {
    const arr = groupMap.get(s.category) ?? [];
    arr.push({ id: s.id, name: s.name });
    groupMap.set(s.category, arr);
  }

  const grouped: SkillGroup[] = Array.from(groupMap.entries()).map(([category, skillList]) => ({
    category,
    skills: skillList,
  }));

  await redis.set(CACHE_KEY, JSON.stringify(grouped), "EX", CACHE_TTL);
  return grouped;
}

export async function searchSkills(
  term: string,
): Promise<{ id: string; name: string; category: string }[]> {
  return prisma.$queryRaw<{ id: string; name: string; category: string }[]>`
    SELECT id, name, category
    FROM "Skill"
    WHERE is_active = true
      AND (
        name ILIKE ${"%" + term + "%"}
        OR EXISTS (
          SELECT 1 FROM unnest(aliases) AS alias
          WHERE alias ILIKE ${"%" + term + "%"}
        )
      )
    ORDER BY name
    LIMIT 20
  `;
}

export async function createSkill(data: {
  name: string;
  category: string;
  aliases?: string[];
}) {
  const skill = await prisma.skill.create({
    data: {
      name: data.name,
      category: data.category,
      aliases: data.aliases ?? [],
    },
  });
  await redis.del(CACHE_KEY);
  return skill;
}

export async function updateSkill(
  id: string,
  data: { name?: string; category?: string; aliases?: string[]; is_active?: boolean },
) {
  const skill = await prisma.skill.update({ where: { id }, data });
  await redis.del(CACHE_KEY);
  return skill;
}

export async function getAllSkillsAdmin() {
  return prisma.skill.findMany({
    select: {
      id: true, name: true, category: true,
      aliases: true, is_active: true, created_at: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function softDeleteSkill(id: string) {
  const skill = await prisma.skill.update({ where: { id }, data: { is_active: false } });
  await redis.del(CACHE_KEY);
  return skill;
}
