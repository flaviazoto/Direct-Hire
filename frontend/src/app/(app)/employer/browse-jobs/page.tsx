"use client";
// frontend/src/app/(app)/employer/browse-jobs/page.tsx
// Employer job browse — view platform jobs & external listings

import { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  MapPin,
  Clock,
  DollarSign,
  ExternalLink,
  Search,
  Filter,
  X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlatformJob {
  id: string;
  title: string;
  companyName: string;
  city: string;
  country: string;
  category: string;
  contractType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  description: string;
  viewCount: number;
  applicationCount: number;
}

interface ExternalJob {
  id: string;
  title: string;
  company: string;
  location: string;
  country: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  jobType: string;
  description: string | null;
  externalUrl: string;
  source: string | null;
  isActive: boolean;
  isPinned: boolean;
  skills: string[];
  views: number;
  createdAt: string;
}

type Job = (PlatformJob & { type: "platform" }) | (ExternalJob & { type: "external" });

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EmployerBrowseJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [platformJobs, setPlatformJobs] = useState<PlatformJob[]>([]);
  const [externalJobs, setExternalJobs] = useState<ExternalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

  // ── Fetch Platform Jobs ────────────────────────────────────────────────────

  const fetchPlatformJobs = useCallback(async () => {
    try {
      const token = localStorage.getItem("dh_token");
      const res = await fetch(`${API_BASE}/jobs?status=APPROVED&limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Failed to fetch platform jobs");
      const resData = await res.json();
      setPlatformJobs(resData.data?.jobs || resData.jobs || []);
    } catch (e) {
      console.error("Failed to fetch platform jobs:", e);
    }
  }, [API_BASE]);

  // ── Fetch External Jobs ────────────────────────────────────────────────────

  const fetchExternalJobs = useCallback(async () => {
    try {
      const token = localStorage.getItem("dh_token");
      const res = await fetch(`${API_BASE}/external-jobs/browse`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Failed to fetch external jobs");
      const resData = await res.json();
      setExternalJobs(resData.data?.jobs || resData.jobs || []);
    } catch (e) {
      console.error("Failed to fetch external jobs:", e);
    }
  }, [API_BASE]);

  // ── Fetch all jobs on mount ────────────────────────────────────────────────

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchPlatformJobs(), fetchExternalJobs()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [fetchPlatformJobs, fetchExternalJobs]);

  // ── Merge and sort jobs ────────────────────────────────────────────────────

  useEffect(() => {
    const merged: Job[] = [];

    // 1. Pinned external jobs first
    externalJobs
      .filter((j) => j.isPinned && j.isActive)
      .forEach((j) => merged.push({ ...j, type: "external" }));

    // 2. Platform jobs
    platformJobs.forEach((j) => merged.push({ ...j, type: "platform" }));

    // 3. Non-pinned external jobs
    externalJobs
      .filter((j) => !j.isPinned && j.isActive)
      .forEach((j) => merged.push({ ...j, type: "external" }));

    // Apply filters
    let filtered = merged;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.type === "platform" && j.companyName?.toLowerCase().includes(q)) ||
          (j.type === "external" && j.company?.toLowerCase().includes(q))
      );
    }

    if (filterCountry.trim()) {
      filtered = filtered.filter((j) => j.country === filterCountry);
    }

    setJobs(filtered);
  }, [platformJobs, externalJobs, searchQuery, filterCountry]);

  // ── Get unique countries ───────────────────────────────────────────────────

  const countries = Array.from(
    new Set([
      ...platformJobs.map((j) => j.country),
      ...externalJobs.map((j) => j.country),
    ].filter(Boolean))
  ).sort();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 sm:px-6 pt-6 pb-12 md:px-8 md:pt-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Browse Jobs
          </h1>
          <p className="text-sm text-muted-foreground">
            Explore available positions on the platform and featured external listings
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search jobs, companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              style={{ fontSize: "16px" }}
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-border bg-background text-foreground hover:bg-muted transition-colors"
          >
            <Filter size={18} />
            <span>Filter</span>
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-6 p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-semibold text-foreground">Filters</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1 hover:bg-muted rounded-lg transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Country Filter */}
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                  Country
                </label>
                <select
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  style={{ fontSize: "16px" }}
                >
                  <option value="">All Countries</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset Filters */}
              {(filterCountry || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterCountry("");
                    setSearchQuery("");
                  }}
                  className="w-full px-4 py-2 rounded-xl border border-border text-foreground hover:bg-muted transition-colors text-sm font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading jobs...
          </div>
        ) : jobs.length === 0 ? (
          /* Empty State */
          <div className="flex items-center justify-center py-12">
            <div className="text-center border-2 border-dashed border-border rounded-2xl p-12">
              <p className="text-foreground font-medium mb-2">No jobs found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your filters or search terms
              </p>
            </div>
          </div>
        ) : (
          /* Jobs Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-4 sm:p-5 rounded-2xl border border-border bg-card hover:bg-muted transition-colors relative"
              >
                {/* Pinned indicator (external only) */}
                {job.type === "external" && job.isPinned && (
                  <div className="absolute top-3 right-3">
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                      Featured
                    </span>
                  </div>
                )}

                {/* Header row */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <Briefcase size={18} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">
                        {job.title}
                      </h3>
                      {job.type === "external" && (
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                          External
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {job.type === "platform" ? job.companyName : job.company}
                      {job.type === "external" &&
                        job.source &&
                        ` via ${job.source}`}
                    </p>
                  </div>
                </div>

                {/* Details row */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin size={11} /> {job.location || job.city}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock size={11} />
                    {job.type === "platform" ? job.contractType : job.jobType}
                  </span>
                  {((job.type === "platform" &&
                    (job.salaryMin || job.salaryMax)) ||
                    (job.type === "external" &&
                      (job.salaryMin || job.salaryMax))) && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign size={11} />
                      {job.type === "platform"
                        ? job.salaryMin && job.salaryMax
                          ? `${job.salaryCurrency} ${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()}`
                          : `${job.salaryCurrency} ${(job.salaryMin || job.salaryMax)?.toLocaleString()}`
                        : job.salaryMin && job.salaryMax
                          ? `${job.currency} ${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()}`
                          : `${job.currency} ${(job.salaryMin || job.salaryMax)?.toLocaleString()}`}
                    </span>
                  )}
                </div>

                {/* Skills (external only) */}
                {job.type === "external" && job.skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {job.skills.slice(0, 4).map((skill: string) => (
                      <span
                        key={skill}
                        className="text-xs bg-muted px-2 py-0.5 rounded-lg"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {/* CTA */}
                {job.type === "external" ? (
                  <a
                    href={job.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <ExternalLink size={14} />
                    View Original Post
                  </a>
                ) : (
                  <button className="w-full h-10 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors">
                    View Details
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Job Count */}
        {!loading && jobs.length > 0 && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Showing {jobs.length} of {platformJobs.length + externalJobs.length}{" "}
            jobs
          </div>
        )}
      </div>
    </div>
  );
}
