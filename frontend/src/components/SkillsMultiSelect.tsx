"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkillValue {
  skill_id: string;
  label: string;
  years_experience?: number;
}

interface SkillGroup { category: string; skills: { id: string; name: string }[] }
interface SearchResult { id: string; name: string; category: string }
interface DropdownOption { id: string; name: string; category: string }

interface Props {
  value: SkillValue[];
  onChange: (v: SkillValue[]) => void;
  mode: "worker" | "employer";
  error?: string;
  placeholder?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SkillsMultiSelect({
  value,
  onChange,
  mode,
  error,
  placeholder = "Search skills…",
}: Props) {
  const [groups, setGroups]         = useState<SkillGroup[]>([]);
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen]         = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [searching, setSearching]   = useState(false);

  const containerRef  = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout>>();

  const selectedIds = new Set(value.map(v => v.skill_id));

  // Load all skills on mount
  useEffect(() => {
    fetch("/api/skills")
      .then(r => r.json())
      .then((d: { success: boolean; data: SkillGroup[] }) => {
        if (d.success) setGroups(d.data);
      })
      .catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); setSearching(false); return; }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/skills/search?q=${encodeURIComponent(query.trim())}`);
        const d = await r.json() as { success: boolean; data: SearchResult[] };
        setResults(d.success ? d.data : []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFocusedIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build dropdown groups
  const displayGroups: { category: string; options: DropdownOption[] }[] = query.trim()
    ? (results.length
        ? [{ category: "Results", options: results.filter(o => !selectedIds.has(o.id)) }]
        : [])
    : groups
        .map(g => ({
          category: g.category,
          options: g.skills
            .filter(s => !selectedIds.has(s.id))
            .map(s => ({ id: s.id, name: s.name, category: g.category })),
        }))
        .filter(g => g.options.length > 0);

  // Flat list for keyboard navigation
  const flat = displayGroups.flatMap(g => g.options);
  const idxMap = new Map(flat.map((o, i) => [o.id, i]));

  function select(opt: DropdownOption) {
    if (selectedIds.has(opt.id)) return;
    onChange([...value, {
      skill_id: opt.id,
      label: opt.name,
      ...(mode === "worker" ? { years_experience: 1 } : {}),
    }]);
    setQuery("");
    setResults([]);
    setFocusedIdx(-1);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter(v => v.skill_id !== id));
  }

  function updateYears(id: string, years: number) {
    onChange(value.map(v => v.skill_id === id ? { ...v, years_experience: years } : v));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setIsOpen(false); setFocusedIdx(-1); return; }
    if (!isOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      setIsOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx(i => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedIdx >= 0 && flat[focusedIdx]) {
      e.preventDefault();
      select(flat[focusedIdx]);
    }
  }

  const isEmpty = displayGroups.length === 0;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* ── Selected chips ──────────────────────────────────────── */}
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {value.map(v => (
            <span
              key={v.skill_id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.28)",
                borderRadius: 8, padding: "3px 6px 3px 10px",
                fontSize: 12, color: "#a5b4fc", fontFamily: "inherit",
              }}
            >
              <span>{v.label}</span>

              {mode === "worker" && (
                <>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={v.years_experience ?? 1}
                    onChange={e =>
                      updateYears(v.skill_id, Math.max(1, Math.min(40, parseInt(e.target.value) || 1)))
                    }
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      width: 38, padding: "1px 4px", borderRadius: 4, textAlign: "center",
                      background: "rgba(99,102,241,0.18)",
                      border: "1px solid rgba(99,102,241,0.3)",
                      color: "#c7d2fe", fontSize: 11, outline: "none", fontFamily: "inherit",
                    }}
                    aria-label={`Years of experience for ${v.label}`}
                  />
                  <span style={{ fontSize: 10, color: "#818cf8" }}>yr</span>
                </>
              )}

              <button
                type="button"
                onMouseDown={e => { e.stopPropagation(); remove(v.skill_id); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#818cf8", padding: "0 2px", lineHeight: 1, fontSize: 14,
                  display: "flex", alignItems: "center",
                }}
                aria-label={`Remove ${v.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Combobox input ──────────────────────────────────────── */}
      <div
        style={{
          display: "flex", alignItems: "center",
          background: "#111", borderRadius: 10, padding: "8px 12px",
          border: `1px solid ${error ? "#ef4444" : isOpen ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
          transition: "border-color 0.15s",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); setFocusedIdx(-1); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            color: "#e4e4e7", fontSize: 13, fontFamily: "inherit",
          }}
        />
        {searching && (
          <span style={{
            width: 13, height: 13, flexShrink: 0,
            border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "#6366f1",
            borderRadius: "50%", animation: "sms-spin 0.7s linear infinite",
            display: "inline-block",
          }} />
        )}
      </div>

      {/* ── Dropdown ────────────────────────────────────────────── */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
            background: "#181818", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            maxHeight: 260, overflowY: "auto",
          }}
        >
          {isEmpty ? (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "#555" }}>
              {query.trim() && !searching
                ? "No matching skills"
                : searching
                ? "Searching…"
                : "All skills already selected"}
            </div>
          ) : (
            displayGroups.map(group => (
              <div key={group.category}>
                <div style={{
                  padding: "7px 14px 3px",
                  fontSize: 10, fontWeight: 700, color: "#4b5563",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  background: "#131313", position: "sticky", top: 0,
                }}>
                  {group.category}
                </div>
                {group.options.map(opt => {
                  const idx     = idxMap.get(opt.id) ?? -1;
                  const focused = idx === focusedIdx;
                  return (
                    <div
                      key={opt.id}
                      role="option"
                      aria-selected={focused}
                      onMouseEnter={() => setFocusedIdx(idx)}
                      onMouseDown={e => { e.preventDefault(); select(opt); }}
                      style={{
                        padding: "9px 16px", fontSize: 13, cursor: "pointer",
                        color: focused ? "#e4e4e7" : "#a1a1aa",
                        background: focused ? "rgba(99,102,241,0.12)" : "transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      {opt.name}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      <style>{`@keyframes sms-spin { to { transform: rotate(360deg); } }`}</style>

      {error && (
        <p style={{ fontSize: 12, color: "#f87171", margin: "5px 0 0", fontWeight: 500 }}>
          {error}
        </p>
      )}
    </div>
  );
}
