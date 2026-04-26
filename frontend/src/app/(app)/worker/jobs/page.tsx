"use client";
// src/app/(app)/worker/jobs/page.tsx

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { userApi, workerApi } from "@/lib/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  LoadingPage,
  PageHeader,
  Pagination,
  SelectInput,
  Spinner,
  Tag,
  ToastDisplay,
  type ToastData,
} from "@/components/ui";

type SortOption = "match" | "newest" | "salary_high" | "salary_low";

interface Job {
  id: string;
  title: string;
  description: string;
  country: string;
  city?: string | null;
  category?: string | null;
  workType?: string | null;
  visaType?: string | null;
  visaSupport?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  aiMatchScore?: number;
  isSaved?: boolean;
  employerProfile?: { companyName?: string | null; country?: string | null };
  requiredSkills?: { skill: string }[];
}

interface CountryCardData {
  country: string;
  code: string;
  count: number;
}

interface JobFilterOptions {
  countries: string[];
  categories: string[];
  workTypes: string[];
  visaTypes: string[];
  companies: string[];
  salaryRange?: { min: number | null; max: number | null };
}

interface FiltersState {
  country: string;
  category: string;
  workType: string;
  visaType: string;
  company: string;
  location: string;
  minSalary: string;
  maxSalary: string;
  visaSupport: boolean;
  savedOnly: boolean;
  sort: SortOption;
}

const PAGE_SIZE = 10;

const INITIAL_FILTERS: FiltersState = {
  country: "",
  category: "",
  workType: "",
  visaType: "",
  company: "",
  location: "",
  minSalary: "",
  maxSalary: "",
  visaSupport: false,
  savedOnly: false,
  sort: "match",
};

function safeCountryCode(country: string): string {
  const chunks = country.trim().split(/\s+/).filter(Boolean);
  if (chunks.length >= 2) return `${chunks[0][0]}${chunks[1][0]}`.toUpperCase();
  return country.slice(0, 2).toUpperCase();
}

function WorkerJobsContent() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FiltersState>(INITIAL_FILTERS);
  const [countries, setCountries] = useState<CountryCardData[]>([]);
  const [options, setOptions] = useState<JobFilterOptions>({
    countries: [],
    categories: [],
    workTypes: [],
    visaTypes: [],
    companies: [],
    salaryRange: { min: null, max: null },
  });
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSearchable, setIsSearchable] = useState(false);
  const [toast, setToast] = useState<ToastData>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    userApi.getProfile().then((res) => {
      if (!res.success) {
        router.push("/login");
        return;
      }
      const payload = res.data as { profile?: { isSearchable?: boolean } | null };
      setIsSearchable(payload.profile?.isSearchable ?? false);
    });
  }, [router]);

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: filters.sort,
    };

    if (search.trim()) params.search = search.trim();
    if (filters.country) params.country = filters.country;
    if (filters.category) params.category = filters.category;
    if (filters.workType) params.workType = filters.workType;
    if (filters.visaType) params.visaType = filters.visaType;
    if (filters.company) params.company = filters.company;
    if (filters.location) params.location = filters.location;
    if (filters.minSalary) params.minSalary = filters.minSalary;
    if (filters.maxSalary) params.maxSalary = filters.maxSalary;
    if (filters.visaSupport) params.visaSupport = "true";
    if (filters.savedOnly) params.savedOnly = "true";
    return params;
  }, [filters, page, search]);

  const metaParams = useMemo(() => {
    const { page: _page, limit: _limit, sort: _sort, ...rest } = queryParams;
    return rest;
  }, [queryParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [jobsRes, countriesRes, optionsRes] = await Promise.all([
      workerApi.getJobs(queryParams),
      workerApi.getJobCountries(metaParams),
      workerApi.getJobFilterOptions(metaParams),
    ]);

    if (!jobsRes.success) {
      setError(jobsRes.error ?? "Could not load jobs");
      setJobs([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setJobs((jobsRes.data as Job[]) ?? []);
    setTotal((jobsRes as { total?: number }).total ?? 0);

    if (countriesRes.success) {
      const rawCountries = (countriesRes.data as CountryCardData[]) ?? [];
      setCountries(
        rawCountries.map((entry) => ({
          ...entry,
          code: entry.code || safeCountryCode(entry.country),
        }))
      );
    }

    if (optionsRes.success) {
      const data = optionsRes.data as JobFilterOptions;
      setOptions({
        countries: data.countries ?? [],
        categories: data.categories ?? [],
        workTypes: data.workTypes ?? [],
        visaTypes: data.visaTypes ?? [],
        companies: data.companies ?? [],
        salaryRange: data.salaryRange ?? { min: null, max: null },
      });
    }

    setLoading(false);
  }, [metaParams, queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (filters.country) count += 1;
    if (filters.category) count += 1;
    if (filters.workType) count += 1;
    if (filters.visaType) count += 1;
    if (filters.company) count += 1;
    if (filters.location) count += 1;
    if (filters.minSalary) count += 1;
    if (filters.maxSalary) count += 1;
    if (filters.visaSupport) count += 1;
    if (filters.savedOnly) count += 1;
    if (filters.sort !== "match") count += 1;
    return count;
  }, [filters, search]);

  const setFilter = <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const runSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearAllFilters = () => {
    setPage(1);
    setSearch("");
    setSearchInput("");
    setFilters(INITIAL_FILTERS);
  };

  const handleApply = async (jobId: string) => {
    setApplyingId(jobId);
    const res = await workerApi.applyToJob(jobId);
    setApplyingId(null);
    if (!res.success) {
      showToast(res.error ?? "Could not apply to this job", "err");
      return;
    }
    showToast("Application submitted successfully", "ok");
  };

  const handleToggleSave = async (job: Job) => {
    setSavingId(job.id);
    const res = job.isSaved ? await workerApi.unsaveJob(job.id) : await workerApi.saveJob(job.id);
    setSavingId(null);

    if (!res.success) {
      showToast(res.error ?? "Could not update saved jobs", "err");
      return;
    }

    setJobs((prev) =>
      prev.map((row) =>
        row.id === job.id
          ? {
              ...row,
              isSaved: !job.isSaved,
            }
          : row
      )
    );

    if (filters.savedOnly && job.isSaved) {
      setJobs((prev) => prev.filter((row) => row.id !== job.id));
      setTotal((prev) => Math.max(0, prev - 1));
    }

    showToast(job.isSaved ? "Removed from saved jobs" : "Saved job", "ok");
  };

  if (loading) return <LoadingPage color="blue" />;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      <PageHeader
        title="Global Job Explorer"
        description={total > 0 ? `${total} matching opportunities` : "Discover jobs by country and preferences"}
      />

      {!isSearchable && (
        <div
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.22)",
            borderRadius: 14,
            padding: "16px 20px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>
            Complete onboarding to become searchable
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#a1a1aa" }}>
            You can browse and apply now, but your profile will rank better after approval.
          </p>
          <div style={{ marginTop: 8 }}>
            <Link href="/worker/onboarding" style={{ fontSize: 13, color: "#f59e0b", textDecoration: "underline" }}>
              Continue onboarding
            </Link>
          </div>
        </div>
      )}

      <Card style={{ marginBottom: 20 }}>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search title, skill, visa type, or company"
            />
            <SelectInput
              value={filters.sort}
              onChange={(e) => setFilter("sort", e.target.value as SortOption)}
              options={[
                { value: "match", label: "Best match" },
                { value: "newest", label: "Newest first" },
                { value: "salary_high", label: "Salary high-low" },
                { value: "salary_low", label: "Salary low-high" },
              ]}
            />
            <Button onClick={runSearch} className="w-full">
              Search jobs
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant={filters.savedOnly ? "teal" : "outline"}
              size="sm"
              onClick={() => setFilter("savedOnly", !filters.savedOnly)}
            >
              {filters.savedOnly ? "Saved only" : "Show saved jobs"}
            </Button>
            <Button
              variant={filters.visaSupport ? "teal" : "outline"}
              size="sm"
              onClick={() => setFilter("visaSupport", !filters.visaSupport)}
            >
              Visa support
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="secondary" size="sm" onClick={clearAllFilters}>
                Clear filters ({activeFilterCount})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardContent>
          <div className="mb-3 flex items-center justify-between">
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e4e4e7", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Jobs by country
            </div>
            {filters.country && (
              <button
                onClick={() => setFilter("country", "")}
                style={{
                  fontSize: 12,
                  color: "#71717a",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Reset country
              </button>
            )}
          </div>

          {countries.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#71717a" }}>No country data available for current filters.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {countries.slice(0, 12).map((entry) => {
                const active = filters.country === entry.country;
                return (
                  <button
                    key={entry.country}
                    onClick={() => setFilter("country", active ? "" : entry.country)}
                    style={{
                      background: active ? "rgba(0,144,255,0.14)" : "rgba(255,255,255,0.02)",
                      border: active ? "1px solid rgba(0,144,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: "12px 14px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ fontSize: 11, color: active ? "#93c5fd" : "#71717a", marginBottom: 4 }}>{entry.code}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", marginBottom: 2 }}>{entry.country}</div>
                    <div style={{ fontSize: 12, color: active ? "#60a5fa" : "#a1a1aa" }}>{entry.count.toLocaleString()} jobs</div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <SelectInput
              value={filters.category}
              onChange={(e) => setFilter("category", e.target.value)}
              options={options.categories.map((option) => ({ value: option, label: option }))}
              placeholder="Category"
            />
            <SelectInput
              value={filters.workType}
              onChange={(e) => setFilter("workType", e.target.value)}
              options={options.workTypes.map((option) => ({ value: option, label: option }))}
              placeholder="Work type"
            />
            <SelectInput
              value={filters.visaType}
              onChange={(e) => setFilter("visaType", e.target.value)}
              options={options.visaTypes.map((option) => ({ value: option, label: option }))}
              placeholder="Visa type"
            />
            <Input
              value={filters.company}
              onChange={(e) => setFilter("company", e.target.value)}
              placeholder={options.companies.length > 0 ? `Company (e.g. ${options.companies[0]})` : "Company name"}
            />
            <Input
              value={filters.location}
              onChange={(e) => setFilter("location", e.target.value)}
              placeholder="City or location keyword"
            />
            <Input
              value={filters.minSalary}
              onChange={(e) => setFilter("minSalary", e.target.value)}
              placeholder={
                options.salaryRange?.min !== null && options.salaryRange?.min !== undefined
                  ? `Min salary (${Math.round(options.salaryRange.min).toLocaleString()})`
                  : "Min salary"
              }
              type="number"
            />
            <Input
              value={filters.maxSalary}
              onChange={(e) => setFilter("maxSalary", e.target.value)}
              placeholder={
                options.salaryRange?.max !== null && options.salaryRange?.max !== undefined
                  ? `Max salary (${Math.round(options.salaryRange.max).toLocaleString()})`
                  : "Max salary"
              }
              type="number"
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <EmptyState icon="!" title="Could not load jobs" description={error} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="?"
          title="No jobs found"
          description="Try broader filters or clear your search criteria."
          action={
            <Button variant="primary" size="sm" onClick={clearAllFilters}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {jobs.map((job) => {
            const matchColor =
              job.aiMatchScore === undefined
                ? "#71717a"
                : job.aiMatchScore >= 80
                ? "#22c55e"
                : job.aiMatchScore >= 60
                ? "#0090FF"
                : "#f59e0b";

            return (
              <Card key={job.id}>
                <CardContent>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>{job.title}</div>
                      <div style={{ fontSize: 13, color: "#a1a1aa" }}>
                        {(job.employerProfile?.companyName ?? "Company")} · {job.city ? `${job.city}, ` : ""}
                        {job.country}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {job.aiMatchScore !== undefined && (
                        <div
                          style={{
                            fontFamily: "'Courier New', monospace",
                            fontWeight: 800,
                            fontSize: 28,
                            lineHeight: 1,
                            color: matchColor,
                          }}
                        >
                          {job.aiMatchScore}%
                        </div>
                      )}
                      <button
                        onClick={() => handleToggleSave(job)}
                        disabled={savingId === job.id}
                        style={{
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: job.isSaved ? "rgba(0,144,255,0.2)" : "transparent",
                          color: job.isSaved ? "#2dd4bf" : "#a1a1aa",
                          borderRadius: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "7px 10px",
                          cursor: "pointer",
                        }}
                      >
                        {savingId === job.id ? "..." : job.isSaved ? "Saved" : "Save"}
                      </button>
                    </div>
                  </div>

                  <p
                    style={{
                      marginTop: 12,
                      marginBottom: 12,
                      fontSize: 13,
                      color: "#888",
                      lineHeight: 1.6,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {job.description}
                  </p>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {job.category && <Badge variant="cyan">{job.category}</Badge>}
                    {job.workType && <Badge variant="purple">{job.workType}</Badge>}
                    {job.visaType && <Badge variant="blue">{job.visaType}</Badge>}
                    {job.visaSupport && <Badge variant="teal">Visa support</Badge>}
                    {typeof job.salaryMin === "number" && (
                      <Badge variant="green">
                        {job.currency ?? "EUR"} {Math.round(job.salaryMin).toLocaleString()}
                        {typeof job.salaryMax === "number" ? `-${Math.round(job.salaryMax).toLocaleString()}` : "+"}
                      </Badge>
                    )}
                    {job.requiredSkills?.slice(0, 4).map((skill) => (
                      <Tag key={skill.skill}>{skill.skill}</Tag>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="primary"
                      onClick={() => handleApply(job.id)}
                      disabled={applyingId === job.id}
                      loading={applyingId === job.id}
                    >
                      {applyingId === job.id ? <Spinner size="xs" /> : "Apply now"}
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/worker/applications">Track applications</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} className="mt-6" />
    </div>
  );
}

function Fallback() {
  return <LoadingPage color="blue" />;
}

export default function WorkerJobsPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <WorkerJobsContent />
    </Suspense>
  );
}
