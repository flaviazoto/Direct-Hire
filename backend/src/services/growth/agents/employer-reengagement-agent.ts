// backend/src/services/growth/agents/employer-reengagement-agent.ts
// Employer Re-engagement Agent — given one lapsed (subscriptionStatus
// INACTIVE) EmployerProfile, drafts ONE personalized re-engagement email
// and stores it as a GrowthContentDraft row awaiting admin review. Same
// shape as content-agent.ts: one target per run (not a batch), no auto-send
// ever, task ends AWAITING_APPROVAL rather than COMPLETED since a human
// still has to act on the draft. This pass only drafts and stores the
// email — nothing here sends it (see the file header note on
// EMPLOYER_OUTREACH below).
//
// Deliberately no cold outreach to unregistered companies here — per the
// prior audit, that needs either manual admin-provided input or a real
// external business-research API, neither of which this pass builds.

import type { GrowthAgentTask } from "@prisma/client";
import { getAnthropicClient, ANTHROPIC_MODEL } from "../../ai/anthropic-client";

// Same reasoning as content-agent.ts's own override: a 150-250 word email
// plus its JSON wrapper fits comfortably under 1000 tokens, but still well
// above the shared ANTHROPIC_MAX_TOKENS=500 sized for the short
// SEO-metadata call in queue/index.ts.
const REENGAGEMENT_MAX_TOKENS = 1000;

interface EmployerReengagementOutput {
  draftId:          string;
  employerProfileId: string;
  companyName:      string;
  recipientEmail:   string;
}

export async function runEmployerReengagementAgent(
  task: GrowthAgentTask,
): Promise<{ summary: string; outputData: EmployerReengagementOutput; taskStatus: "AWAITING_APPROVAL" }> {
  const prisma = (await import("../../../lib/prisma")).default;

  const inputData = task.inputData as { employerProfileId?: string } | null;
  const employerProfileId = inputData?.employerProfileId;
  if (!employerProfileId) throw new Error("task.inputData.employerProfileId is required for employer-reengagement-agent");

  const employer = await prisma.employerProfile.findUnique({
    where:  { id: employerProfileId },
    include: {
      user:            { select: { email: true } },
      hiringCountries: { select: { country: true } },
    },
  });
  if (!employer) throw new Error(`EmployerProfile ${employerProfileId} not found`);

  if (employer.subscriptionStatus !== "INACTIVE") {
    throw new Error(`Employer is not in a re-engagement-eligible state: ${employer.subscriptionStatus}`);
  }

  const companyName = employer.companyName ?? "your company";
  // updatedAt, not createdAt — same field the eligible-employers endpoint
  // sorts by, since it's the moment subscriptionStatus actually flipped to
  // INACTIVE (webhook.controller.ts's updateMany still bumps @updatedAt).
  // createdAt is registration date, unrelated to when they lapsed. Caveat
  // (same as that endpoint): updatedAt is a general last-modified field, not
  // a dedicated inactivity timestamp — if the row were touched again for an
  // unrelated reason this would drift, but nothing here does that today.
  const daysSinceInactive = Math.floor((Date.now() - employer.updatedAt.getTime()) / 86400000);
  const hiringCountries = employer.hiringCountries.map(c => c.country).join(", ") || "not specified";

  const prompt = `Write a short, warm, non-pushy re-engagement email to an employer who registered on DirectHire (an international job marketplace) but let their account lapse. This is NOT a hard-sell — acknowledge they signed up before, briefly mention what's available now, and give one clear call-to-action to log back in. Do not use aggressive sales language, urgency tactics, or guilt.

Company name: ${companyName}
Industry: ${employer.industry ?? "not specified"}
Country: ${employer.country ?? "not specified"}
Countries they were hiring in: ${hiringCountries}
Business description: ${employer.businessDescription ?? "not specified"}
Account has been inactive for approximately ${daysSinceInactive} days.

Return ONLY valid JSON — no markdown code fences, no preamble, no explanation — with exactly these keys:
"subject" (a string, 80 characters or fewer)
"body" (a string, PLAIN TEXT — not markdown, this is an email — 150-250 words)`;

  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: REENGAGEMENT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error(`Unexpected response block type: ${block.type}`);

  let parsed: { subject: string; body: string };
  try {
    // Safety net only — the prompt already asks for no fences, but models
    // don't always comply.
    const cleaned = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const json = JSON.parse(cleaned) as Record<string, unknown>;

    if (typeof json.subject !== "string" || typeof json.body !== "string") {
      throw new Error(`Response missing required string key(s): ${JSON.stringify(json)}`);
    }
    parsed = { subject: json.subject, body: json.body };
  } catch (e) {
    throw new Error(`Failed to parse employer-reengagement-agent response as JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const slug = `outreach-${employerProfileId}-${Date.now()}`;

  const draft = await prisma.growthContentDraft.create({
    data: {
      contentType:     "employer-outreach",
      title:           parsed.subject,
      slug,
      body:            parsed.body,
      metaTitle:       null,
      metaDescription: null,
      targetKeyword:   null,
      sourceTaskId:    task.id,
      status:          "AWAITING_APPROVAL",
    },
  });

  return {
    summary: `Drafted re-engagement email for ${companyName} (${daysSinceInactive} days inactive).`,
    outputData: {
      draftId:           draft.id,
      employerProfileId,
      companyName,
      recipientEmail:    employer.user.email,
    },
    taskStatus: "AWAITING_APPROVAL",
  };
}
