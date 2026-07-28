// backend/src/services/growth/agent-runner.ts
// Dispatcher for the Growth/Marketing agent system. AGENT_HANDLERS maps
// GrowthAgentTask.agentName to a handler; this file owns writing the
// task's outcome back to the DB (status + summary/outputData/errorMessage)
// so individual agents only need to return their result or throw — they
// never write to their own task row themselves.

import type { GrowthAgentTask, GrowthTaskStatus, Prisma } from "@prisma/client";
import { runTechnicalSeoAudit } from "./agents/technical-seo-agent";
import { runContentAgent } from "./agents/content-agent";
import { runAnalyticsAgent } from "./agents/analytics-agent";

// taskStatus lets a handler override what the task ends up as on success —
// defaults to COMPLETED (read-only audits like technical-seo-agent don't
// need to set it). content-agent returns AWAITING_APPROVAL instead, since
// producing a draft isn't "done" until a human reviews it.
export type AgentHandlerResult = { summary: string; outputData: object; taskStatus?: GrowthTaskStatus };
export type AgentHandler = (task: GrowthAgentTask) => Promise<AgentHandlerResult>;

// Keyed by GrowthAgentTask.agentName. Populate as real agents are built.
export const AGENT_HANDLERS: Record<string, AgentHandler> = {
  "technical-seo-agent": runTechnicalSeoAudit,
  "content-agent":       runContentAgent,
  "analytics-agent":     runAnalyticsAgent,
};

export async function runGrowthAgent(task: GrowthAgentTask): Promise<void> {
  const prisma = (await import("../../lib/prisma")).default;
  const handler = AGENT_HANDLERS[task.agentName];

  if (!handler) {
    await prisma.growthAgentTask.update({
      where: { id: task.id },
      data: {
        status:       "FAILED",
        errorMessage: `No handler registered for agent: ${task.agentName}`,
      },
    });
    return;
  }

  try {
    const { summary, outputData, taskStatus } = await handler(task);
    await prisma.growthAgentTask.update({
      where: { id: task.id },
      data: {
        status:     taskStatus ?? "COMPLETED",
        summary,
        outputData: outputData as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    await prisma.growthAgentTask.update({
      where: { id: task.id },
      data: {
        status:       "FAILED",
        errorMessage: e instanceof Error ? e.message : String(e),
      },
    });
  }
}
