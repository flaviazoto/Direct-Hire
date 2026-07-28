// backend/src/services/growth/agents/analytics-agent.ts
// Analytics Agent — read-only weekly (or any N-day) marketplace funnel
// snapshot. No external APIs, no Anthropic calls (pure data, not generated
// content). Reads the same tables admin-revenue.controller.ts and
// admin.controller.ts's getStats() already read, following their exact
// aggregation convention (Promise.all of independent count/aggregate/
// findMany calls, day-bucketing/window math done in JS, no groupBy, no raw
// SQL) — this file does not modify or import from either of those
// controllers, it just mirrors their pattern.

import type { GrowthAgentTask, GrowthTaskStatus } from "@prisma/client";

const DEFAULT_WINDOW_DAYS = 7;
const PAYMENT_TYPES = ["SUBSCRIPTION", "WORKER_LOCK", "APPLICATION_FEE"] as const;
const JOB_STATUSES = ["DRAFT", "PENDING_MODERATION", "APPROVED", "REJECTED", "ARCHIVED"] as const;

interface WindowComparison {
  thisWindow:     number;
  previousWindow: number;
  pctChange:      number;
}

interface AnalyticsSnapshotOutput {
  windowDays:  number;
  windowStart: string;
  registrations: {
    workers:   WindowComparison;
    employers: WindowComparison;
  };
  jobModeration: {
    createdInWindow: Record<typeof JOB_STATUSES[number], number>;
    avgApprovalTimeHours: number | null;
    approvedSampleSize: number;
  };
  applicationFunnel: {
    created:     number;
    viewed:      { count: number; pct: number };
    shortlisted: { count: number; pct: number };
    interviewed: { count: number; pct: number };
    accepted:    { count: number; pct: number };
    rejected:    { count: number; pct: number };
    hired:       { count: number; pct: number };
  };
  revenue: {
    byType: Record<typeof PAYMENT_TYPES[number], WindowComparison>;
    workerLocks: { createdCount: number; totalBilledCents: number };
  };
}

// Matches admin-revenue.controller.ts's own mrrGrowth convention exactly:
// 0 (not null) when there's no previous-window baseline to compare against.
function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

export async function runAnalyticsAgent(
  task: GrowthAgentTask,
): Promise<{ summary: string; outputData: AnalyticsSnapshotOutput; taskStatus?: GrowthTaskStatus }> {
  const prisma = (await import("../../../lib/prisma")).default;

  const inputData = task.inputData as { days?: number } | null;
  const days = inputData?.days && inputData.days > 0 ? inputData.days : DEFAULT_WINDOW_DAYS;

  const now              = new Date();
  const windowStart      = new Date(now.getTime() - days * 86400000);
  const prevWindowStart  = new Date(windowStart.getTime() - days * 86400000);

  const [
    // a) Registrations
    workersThis, workersPrev, employersThis, employersPrev,
    // b) Job moderation
    jobsDraft, jobsPending, jobsApproved, jobsRejected, jobsArchived, approvedJobsForTiming,
    // c) Application funnel
    appsCreated, appsViewed, appsShortlisted, appsInterviewed, appsAccepted, appsRejected, appsHired,
    // d) Revenue
    subThis, subPrev, lockThis, lockPrev, feeThis, feePrev, locksCreated,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "WORKER",   createdAt: { gte: windowStart } } }),
    prisma.user.count({ where: { role: "WORKER",   createdAt: { gte: prevWindowStart, lt: windowStart } } }),
    prisma.user.count({ where: { role: "EMPLOYER", createdAt: { gte: windowStart } } }),
    prisma.user.count({ where: { role: "EMPLOYER", createdAt: { gte: prevWindowStart, lt: windowStart } } }),

    prisma.jobPost.count({ where: { status: "DRAFT",              createdAt: { gte: windowStart } } }),
    prisma.jobPost.count({ where: { status: "PENDING_MODERATION", createdAt: { gte: windowStart } } }),
    prisma.jobPost.count({ where: { status: "APPROVED",           createdAt: { gte: windowStart } } }),
    prisma.jobPost.count({ where: { status: "REJECTED",           createdAt: { gte: windowStart } } }),
    prisma.jobPost.count({ where: { status: "ARCHIVED",           createdAt: { gte: windowStart } } }),
    prisma.jobPost.findMany({
      where:  { status: "APPROVED", createdAt: { gte: windowStart }, approvedAt: { not: null } },
      select: { createdAt: true, approvedAt: true },
    }),

    prisma.application.count({ where: { createdAt: { gte: windowStart } } }),
    prisma.application.count({ where: { createdAt: { gte: windowStart }, viewedAt:      { not: null } } }),
    prisma.application.count({ where: { createdAt: { gte: windowStart }, shortlistedAt: { not: null } } }),
    prisma.application.count({ where: { createdAt: { gte: windowStart }, interviewedAt: { not: null } } }),
    prisma.application.count({ where: { createdAt: { gte: windowStart }, acceptedAt:    { not: null } } }),
    prisma.application.count({ where: { createdAt: { gte: windowStart }, rejectedAt:    { not: null } } }),
    prisma.application.count({ where: { createdAt: { gte: windowStart }, hireConfirmedAt: { not: null } } }),

    prisma.payment.aggregate({ where: { type: "SUBSCRIPTION",     status: "SUCCEEDED", createdAt: { gte: windowStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { type: "SUBSCRIPTION",     status: "SUCCEEDED", createdAt: { gte: prevWindowStart, lt: windowStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { type: "WORKER_LOCK",      status: "SUCCEEDED", createdAt: { gte: windowStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { type: "WORKER_LOCK",      status: "SUCCEEDED", createdAt: { gte: prevWindowStart, lt: windowStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { type: "APPLICATION_FEE",  status: "SUCCEEDED", createdAt: { gte: windowStart } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { type: "APPLICATION_FEE",  status: "SUCCEEDED", createdAt: { gte: prevWindowStart, lt: windowStart } }, _sum: { amount: true } }),
    prisma.workerLock.aggregate({ where: { createdAt: { gte: windowStart } }, _count: { _all: true }, _sum: { totalBilled: true } }),
  ]);

  // Average createdAt -> approvedAt gap, in hours — simple JS reduction over
  // the findMany result, not a SQL window function.
  const approvalGapsHours = approvedJobsForTiming.map(j =>
    (j.approvedAt!.getTime() - j.createdAt.getTime()) / 3600000,
  );
  const avgApprovalTimeHours = approvalGapsHours.length === 0
    ? null
    : Math.round((approvalGapsHours.reduce((a, b) => a + b, 0) / approvalGapsHours.length) * 10) / 10;

  const outputData: AnalyticsSnapshotOutput = {
    windowDays:  days,
    windowStart: windowStart.toISOString(),
    registrations: {
      workers:   { thisWindow: workersThis,   previousWindow: workersPrev,   pctChange: pctChange(workersThis, workersPrev) },
      employers: { thisWindow: employersThis, previousWindow: employersPrev, pctChange: pctChange(employersThis, employersPrev) },
    },
    jobModeration: {
      createdInWindow: {
        DRAFT: jobsDraft, PENDING_MODERATION: jobsPending, APPROVED: jobsApproved,
        REJECTED: jobsRejected, ARCHIVED: jobsArchived,
      },
      avgApprovalTimeHours,
      approvedSampleSize: approvedJobsForTiming.length,
    },
    applicationFunnel: {
      created:     appsCreated,
      viewed:      { count: appsViewed,      pct: pct(appsViewed, appsCreated) },
      shortlisted: { count: appsShortlisted, pct: pct(appsShortlisted, appsCreated) },
      interviewed: { count: appsInterviewed, pct: pct(appsInterviewed, appsCreated) },
      accepted:    { count: appsAccepted,    pct: pct(appsAccepted, appsCreated) },
      rejected:    { count: appsRejected,    pct: pct(appsRejected, appsCreated) },
      hired:       { count: appsHired,       pct: pct(appsHired, appsCreated) },
    },
    revenue: {
      byType: {
        SUBSCRIPTION:     { thisWindow: subThis._sum.amount  ?? 0, previousWindow: subPrev._sum.amount  ?? 0, pctChange: pctChange(subThis._sum.amount ?? 0, subPrev._sum.amount ?? 0) },
        WORKER_LOCK:      { thisWindow: lockThis._sum.amount ?? 0, previousWindow: lockPrev._sum.amount ?? 0, pctChange: pctChange(lockThis._sum.amount ?? 0, lockPrev._sum.amount ?? 0) },
        APPLICATION_FEE:  { thisWindow: feeThis._sum.amount  ?? 0, previousWindow: feePrev._sum.amount  ?? 0, pctChange: pctChange(feeThis._sum.amount ?? 0, feePrev._sum.amount ?? 0) },
      },
      workerLocks: {
        createdCount:     locksCreated._count._all,
        totalBilledCents: Number(locksCreated._sum.totalBilled ?? 0),
      },
    },
  };

  const periodLabel = days === 7 ? "week" : `${days}-day period`;
  const totalRegs = workersThis + employersThis;
  const regsPct = pctChange(totalRegs, workersPrev + employersPrev);
  const subRevenueDollars = (outputData.revenue.byType.SUBSCRIPTION.thisWindow / 100).toFixed(0);

  const summary =
    `Registrations ${regsPct >= 0 ? "up" : "down"} ${Math.abs(regsPct)}% this ${periodLabel} ` +
    `(${workersThis} workers, ${employersThis} employers). ` +
    `Application-to-hire conversion at ${outputData.applicationFunnel.hired.pct}% ` +
    `(${outputData.applicationFunnel.created} applications created, ${outputData.applicationFunnel.accepted.pct}% accepted). ` +
    `Job approval time averaging ${avgApprovalTimeHours !== null ? `${(avgApprovalTimeHours / 24).toFixed(1)} days` : "n/a (no approvals in window)"}. ` +
    `Subscription revenue $${subRevenueDollars}, ${outputData.revenue.byType.SUBSCRIPTION.pctChange >= 0 ? "up" : "down"} ${Math.abs(outputData.revenue.byType.SUBSCRIPTION.pctChange)}% vs. the previous ${periodLabel}.`;

  return { summary, outputData };
}
