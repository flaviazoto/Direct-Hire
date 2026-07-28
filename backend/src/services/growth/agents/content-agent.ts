// backend/src/services/growth/agents/content-agent.ts
// First content-generating growth agent — given a JobPost, drafts ONE
// career-guide article aimed at workers considering that role/country, and
// stores it as a GrowthContentDraft row awaiting admin review. Makes no
// publish decision itself: the draft's own status is AWAITING_APPROVAL, and
// (per agent-runner.ts's optional taskStatus override) the GrowthAgentTask
// that triggered this run ALSO ends as AWAITING_APPROVAL rather than
// COMPLETED, since a human still needs to act on the resulting draft.

import type { GrowthAgentTask } from "@prisma/client";
import { getAnthropicClient, ANTHROPIC_MODEL } from "../../ai/anthropic-client";

// Higher than the shared ANTHROPIC_MAX_TOKENS (500, sized for the short
// SEO-metadata call in queue/index.ts) — a 600-800 word article plus its
// JSON wrapper needs more headroom. max_tokens is a per-call param on
// anthropic.messages.create(), not baked into getAnthropicClient() itself,
// so overriding it here doesn't require touching the shared client file.
const CONTENT_AGENT_MAX_TOKENS = 2500;

interface ContentAgentOutput {
  draftId:   string;
  slug:      string;
  wordCount: number;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function runContentAgent(
  task: GrowthAgentTask,
): Promise<{ summary: string; outputData: ContentAgentOutput; taskStatus: "AWAITING_APPROVAL" }> {
  const prisma = (await import("../../../lib/prisma")).default;

  const inputData = task.inputData as { jobPostId?: string } | null;
  const jobPostId = inputData?.jobPostId;
  if (!jobPostId) throw new Error("task.inputData.jobPostId is required for content-agent");

  const job = await prisma.jobPost.findUnique({
    where:  { id: jobPostId },
    select: {
      id: true, title: true, category: true, country: true,
      requiredSkills: true, contractType: true, experienceRequired: true,
    },
  });
  if (!job) throw new Error(`JobPost ${jobPostId} not found`);

  const prompt = `Write a career-guide article for job seekers (workers), NOT for employers. The article should help someone considering a "${job.title}" role in ${job.country} decide whether it's a good fit and what to expect — think "Hospitality Jobs in Germany: What to Expect" style, generalized to this role/category/country rather than about this one specific job posting.

Role category: ${job.category}
Country: ${job.country}
Contract type: ${job.contractType}
Typical required skills: ${job.requiredSkills.join(", ") || "none specified"}
Experience level: ${job.experienceRequired}+ years

Return ONLY valid JSON — no markdown code fences, no preamble, no explanation — with exactly these keys:
"title" (a string, the article's headline)
"slug" (a string, URL-friendly kebab-case, lowercase, no special characters)
"metaTitle" (a string, 70 characters or fewer)
"metaDescription" (a string, 200 characters or fewer)
"body" (a string, markdown-formatted, 600-800 words, written for the worker audience described above)`;

  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: CONTENT_AGENT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error(`Unexpected response block type: ${block.type}`);

  let parsed: { title: string; slug: string; metaTitle: string; metaDescription: string; body: string };
  try {
    // Safety net only — the prompt already asks for no fences, but models
    // don't always comply.
    const cleaned = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const json = JSON.parse(cleaned) as Record<string, unknown>;

    if (
      typeof json.title !== "string" || typeof json.slug !== "string" ||
      typeof json.metaTitle !== "string" || typeof json.metaDescription !== "string" ||
      typeof json.body !== "string"
    ) {
      throw new Error(`Response missing required string key(s): ${JSON.stringify(json)}`);
    }
    parsed = {
      title: json.title, slug: json.slug, metaTitle: json.metaTitle,
      metaDescription: json.metaDescription, body: json.body,
    };
  } catch (e) {
    throw new Error(`Failed to parse content-agent response as JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Slug uniqueness — collision resolved by suffixing the job's short id
  // rather than re-prompting Claude for a new one.
  let slug = parsed.slug;
  const existing = await prisma.growthContentDraft.findUnique({ where: { slug } });
  if (existing) slug = `${parsed.slug}-${job.id.slice(-6)}`;

  const targetKeyword = `${job.category} jobs ${job.country}`.toLowerCase();

  const draft = await prisma.growthContentDraft.create({
    data: {
      contentType:     "career-guide",
      title:           parsed.title,
      slug,
      body:            parsed.body,
      metaTitle:       parsed.metaTitle,
      metaDescription: parsed.metaDescription,
      targetKeyword,
      sourceTaskId:    task.id,
      status:          "AWAITING_APPROVAL",
    },
  });

  const words = wordCount(parsed.body);

  return {
    summary: `Generated career-guide draft '${draft.title}' (${words} words) for review.`,
    outputData: { draftId: draft.id, slug: draft.slug, wordCount: words },
    taskStatus: "AWAITING_APPROVAL",
  };
}
