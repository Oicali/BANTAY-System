// frontend/src/components/views/CrimeDashboard.jsx
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import {
  FileText,
  Unlock,
  CheckSquare,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import "./CrimeDashboard.css";
import {
  CURRENT_BARANGAYS,
  LEGACY_BARANGAY_OPTIONS,
} from "../../utils/barangayOptions";
import LoadingModal from "../modals/LoadingModal";
import { useExportDashboard } from "../../hooks/useExportDashboard";
import ShortRangeWarningModal from "../modals/ShortRangeWarningModal";
import PdfPreviewModal from "../modals/PdfPreviewModal";

// ─── FEATURE FLAGS ────────────────────────────────────────────────────────────
const SHOW_MONTHLY_DELTAS = false; // Set to false to hide all "vs last month" deltas

const API = `${import.meta.env.VITE_API_URL}/crime-dashboard`;
const AI_API = `${import.meta.env.VITE_API_URL}/ai-assessment`;
const getToken = () => localStorage.getItem("token");

const STATUS_COLORS = {
  solved: "#22c55e",
  cleared: "#4f46e5",
  underInvestigation: "#f59e0b",
};

const formatBarangayLabel = (name) => {
  const ROMAN = new Set([
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
  ]);

  return name.toLowerCase().replace(/\b\w+/g, (word) => {
    const upper = word.toUpperCase();
    if (ROMAN.has(upper)) return upper;
    if (upper === "P" || upper === "F") return upper;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const INDEX_CRIMES = [
  "MURDER",
  "HOMICIDE",
  "PHYSICAL INJURY",
  "RAPE",
  "ROBBERY",
  "THEFT",
  "CARNAPPING - MC",
  "CARNAPPING - MV",
  "SPECIAL COMPLEX CRIME",
];

const CRIME_DISPLAY = {
  MURDER: "Murder",
  HOMICIDE: "Homicide",
  "PHYSICAL INJURY": "Physical Injury",
  RAPE: "Rape",
  ROBBERY: "Robbery",
  THEFT: "Theft",
  "CARNAPPING - MC": "Carnapping - MC",
  "CARNAPPING - MV": "Carnapping - MV",
  "SPECIAL COMPLEX CRIME": "Special Complex Crime",
};

const CRIME_SHORT = {
  MURDER: "Murder",
  HOMICIDE: "Homicide",
  "PHYSICAL INJURY": "Phys. Inj.",
  RAPE: "Rape",
  ROBBERY: "Robbery",
  THEFT: "Theft",
  "CARNAPPING - MC": "Carnap MC",
  "CARNAPPING - MV": "Carnap MV",
  "SPECIAL COMPLEX CRIME": "Spec. Cmplx",
};

const CRIME_LABEL = {
  Total: "Total",
  MURDER: "Murder",
  HOMICIDE: "Homicide",
  "PHYSICAL INJURY": "Phys. Inj.",
  RAPE: "Rape",
  ROBBERY: "Robbery",
  THEFT: "Theft",
  "CARNAPPING - MC": "Carnap MC",
  "CARNAPPING - MV": "Carnap MV",
  "SPECIAL COMPLEX CRIME": "Spec. Cmplx",
};

const CRIME_COLORS = {
  Total: "#0a1628",
  MURDER: "#ef4444",
  HOMICIDE: "#f97316",
  "PHYSICAL INJURY": "#eab308",
  RAPE: "#a855f7",
  ROBBERY: "#ec4899",
  THEFT: "#14b8a6",
  "CARNAPPING - MC": "#3b82f6",
  "CARNAPPING - MV": "#6366f1",
  "SPECIAL COMPLEX CRIME": "#84cc16",
};

const PLACE_PAGE_SIZE = 10;
const BRGY_PAGE_SIZE = 10;
const MODUS_PAGE_SIZE = 10;
const CHART_ROW_HEIGHT = 480;

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const getPhtDateParts = () => {
  const now = new Date();
  // PHT is UTC+8, so add 8 hours worth of ms
  const phtMs = now.getTime() + 8 * 60 * 60 * 1000;
  const pht = new Date(phtMs);
  return pht.toISOString().slice(0, 10); // always "YYYY-MM-DD" in PHT
};

const todayIso = () => getPhtDateParts();

const offsetDate = (days) => {
  const now = new Date();
  const phtMs = now.getTime() + 8 * 60 * 60 * 1000 + days * 86400000;
  const pht = new Date(phtMs);
  return pht.toISOString().slice(0, 10);
};

const PRESETS = [
  { label: "This Month", key: "this_month" },
  { label: "1 Week", key: "7d" },
  { label: "3 Months", key: "3m" },
  { label: "1 Year", key: "365d" },
  { label: "Custom", key: "custom" },
];

const getPresetRange = (key) => {
  const now = new Date();
  const phtMs = now.getTime() + 8 * 60 * 60 * 1000;
  const phtToday = new Date(phtMs);
  const t = phtToday.toISOString().slice(0, 10);

  if (key === "this_month") {
    const from = `${phtToday.getFullYear()}-${String(phtToday.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: t };
  }
  if (key === "7d") return { from: offsetDate(-6), to: t };
  if (key === "3m") {
    // 3-month range: start from 2 months ago (1st), so Mar 1 → today
    const from = new Date(phtToday.getFullYear(), phtToday.getMonth() - 2, 1);
    return {
      from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`,
      to: t,
    };
  }
  if (key === "365d") {
    // Snap to 1 year ago, 1st of that month
    const from = new Date(phtToday.getFullYear() - 1, phtToday.getMonth(), 1);
    return {
      from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`,
      to: t,
    };
  }
  return null;
};

const getGranularity = (preset, dateFrom, dateTo) => {
  if (preset === "this_month") return "daily";
  if (preset === "7d") return "daily";
  if (preset === "3m") return "monthly";
  if (preset === "365d") return "monthly";

  if (!dateFrom || !dateTo) return "monthly";

  const from = new Date(dateFrom + "T00:00:00");
  const to = new Date(dateTo + "T00:00:00");
  const diffDays = Math.round((to - from) / 86400000) + 1;

  if (diffDays <= 31) return "daily";
  return "monthly";
};

const granularityLabel = (g) =>
  g === "daily"
    ? "Daily"
    : g === "weekly"
      ? "Weekly"
      : g === "quarterly"
        ? "Quarterly"
        : "Monthly";

// ─── MISC HELPERS ─────────────────────────────────────────────────────────────
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const buildParams = (filters) => {
  const granularity = getGranularity(
    filters.preset,
    filters.dateFrom,
    filters.dateTo,
  );
  const p = new URLSearchParams();
  if (filters.dateFrom) p.set("date_from", filters.dateFrom);
  if (filters.dateTo) p.set("date_to", filters.dateTo);
  if (filters.crimeTypes?.length) {
    p.set("crime_types", filters.crimeTypes.join(","));
  }
  if (filters.barangays?.length) {
    p.set("barangays", filters.barangays.join(","));
  }
  p.set("granularity", granularity);
  p.set("preset", filters.preset); // ← already exists, just confirm it's here
  return `?${p}`;
};

const BLANK_FILTERS = () => {
  const range = getPresetRange("this_month");
  return {
    preset: "this_month",
    dateFrom: range.from,
    dateTo: range.to,
    crimeTypes: [],
    barangays: [],
  };
};

const EMPTY_DASHBOARD = () => ({
  summary: [],
  trends: [],
  hourly: [],
  byDay: [],
  place: [],
  barangay: [],
  modus: [],
  completeData: [],
  prevSummary: null,
});

// ─── SMALL LABEL COMPONENTS ───────────────────────────────────────────────────
const HBarLabel = ({ x, y, width, height, value }) => {
  if (!value) return null;

  return (
    <text
      x={x + width + 5}
      y={y + height / 2 + 4}
      fill="#374151"
      fontSize={11}
      fontWeight={600}
    >
      {value}
    </text>
  );
};

// ─── CRIME TYPE MULTI-SELECT ──────────────────────────────────────────────────
const CrimeTypeMultiSelect = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (c) =>
    onChange(
      selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c],
    );

  const removeOne = (c, e) => {
    e.stopPropagation();
    onChange(selected.filter((x) => x !== c));
  };

  const toggleAll = () =>
    onChange(selected.length === INDEX_CRIMES.length ? [] : [...INDEX_CRIMES]);

  const isAll = selected.length === 0;
  const allSelected = selected.length === INDEX_CRIMES.length;

  return (
    <div className="cd-brgy-ms-wrap" ref={ref}>
      <div className="cd-brgy-ms-trigger" onClick={() => setOpen((v) => !v)}>
        {isAll ? (
          <span className="cd-brgy-ms-placeholder">All Crimes Types</span>
        ) : (
          <div className="cd-brgy-ms-pills">
            {selected.slice(0, 2).map((c) => (
              <span key={c} className="cd-brgy-pill">
                {CRIME_SHORT[c] || c}
                <span className="cd-pill-x" onClick={(e) => removeOne(c, e)}>
                  ×
                </span>
              </span>
            ))}
            {selected.length > 2 && (
              <span className="cd-brgy-pill cd-pill-more">
                +{selected.length - 2}
              </span>
            )}
          </div>
        )}
        <span className="cd-brgy-ms-arrow">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="cd-brgy-ms-dropdown">
          <div className="cd-brgy-ms-actions">
            <button onClick={toggleAll} className="cd-brgy-ms-action-btn">
              {allSelected ? "Clear all" : "Select all"}
            </button>
            {selected.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="cd-brgy-ms-action-btn cd-brgy-ms-clear"
              >
                Clear ({selected.length})
              </button>
            )}
          </div>

          <div className="cd-brgy-ms-list">
            {INDEX_CRIMES.map((c) => (
              <label key={c} className="cd-brgy-ms-item">
                <input
                  type="checkbox"
                  checked={selected.includes(c)}
                  onChange={() => toggle(c)}
                />
                <span>{CRIME_DISPLAY[c]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── BARANGAY MULTI-SELECT ────────────────────────────────────────────────────
const BarangayMultiSelect = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = CURRENT_BARANGAYS.filter((b) =>
    b.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredLegacy = LEGACY_BARANGAY_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const allSelected = selected.length === CURRENT_BARANGAYS.length;
  const isAll = selected.length === 0;

  const toggle = (b) => {
    onChange(
      selected.includes(b) ? selected.filter((x) => x !== b) : [...selected, b],
    );
    setSearch("");
    inputRef.current?.focus();
  };

  const removeOne = (b, e) => {
    e.stopPropagation();
    onChange(selected.filter((x) => x !== b));
  };

  return (
    <div className="cd-brgy-ms-wrap" ref={ref}>
      {/* ── TRIGGER: pills + inline search input ── */}
      <div
        className="cd-brgy-ms-trigger"
        style={{ cursor: "text" }}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {/* Selected pills */}
        {selected.slice(0, 2).map((b) => (
          <span key={b} className="cd-brgy-pill">
            {formatBarangayLabel(b)}
            <span
              className="cd-pill-x"
              onMouseDown={(e) => {
                e.stopPropagation();
                removeOne(b, e);
              }}
            >
              ×
            </span>
          </span>
        ))}
        {selected.length > 2 && (
          <span className="cd-brgy-pill cd-pill-more">
            +{selected.length - 2}
          </span>
        )}

        {/* Inline search input */}
        <input
          ref={inputRef}
          type="text"
          value={search}
          placeholder={isAll ? "All Barangays" : ""}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            minWidth: 80,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13,
            fontFamily: "DM Sans, sans-serif",
            color: "#212529",
            padding: 0,
          }}
        />

        {/* Arrow */}
        <span className="cd-brgy-ms-arrow">{open ? "▲" : "▼"}</span>
      </div>

      {/* ── DROPDOWN ── */}
      {open && (
        <div className="cd-brgy-ms-dropdown">
          <div className="cd-brgy-ms-actions">
            <button
              className="cd-brgy-ms-action-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onChange(allSelected ? [] : [...CURRENT_BARANGAYS])
              }
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
            {selected.length > 0 && (
              <button
                className="cd-brgy-ms-action-btn cd-brgy-ms-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange([]);
                  setSearch("");
                }}
              >
                Clear ({selected.length})
              </button>
            )}
          </div>

          <div className="cd-brgy-ms-list">
            {filtered.map((b) => (
              <label
                key={b}
                className="cd-brgy-ms-item"
                onMouseDown={(e) => e.preventDefault()}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(b)}
                  onChange={() => toggle(b)}
                />
                <span>{formatBarangayLabel(b)}</span>
              </label>
            ))}

            {filtered.length === 0 && filteredLegacy.length === 0 && (
              <div className="cd-brgy-ms-empty">No results for "{search}"</div>
            )}

            {filteredLegacy.length > 0 && (
              <div className="cd-brgy-ms-group-label">
                ── Pre-2023 Names (Auto-resolved) ──
              </div>
            )}
            {filteredLegacy.map((o, idx) => (
              <label
                key={`legacy-${idx}`}
                className="cd-brgy-ms-item"
                onMouseDown={(e) => e.preventDefault()}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── FILTER BAR ───────────────────────────────────────────────────────────────
const FilterBar = ({
  appliedFilters,
  onApply,
  isBarangayUser = false,
  userBarangay = null,
  isPatrol = false,
  hasPatrolAssignment = false,
  patrolAssignedBarangays = [],
}) => {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState(() => ({ ...appliedFilters }));
  const [dateError, setDateError] = useState("");

  const prevAppliedRef = useRef(appliedFilters);

  useEffect(() => {
    if (prevAppliedRef.current !== appliedFilters) {
      prevAppliedRef.current = appliedFilters;
      setDraft({ ...appliedFilters });
      setDateError("");
    }
  }, [appliedFilters]);

  const handlePreset = (key) => {
    if (key === "custom") {
      setDraft((f) => ({ ...f, preset: "custom" }));
      setDateError("");
      return;
    }

    const range = getPresetRange(key);
    if (range) {
      setDraft((f) => ({
        ...f,
        preset: key,
        dateFrom: range.from,
        dateTo: range.to,
      }));
      setDateError("");
    }
  };

  const validateDates = (from, to) => {
    if (!from || !to) return "Please select both start and end dates.";
    if (from >= to) return "Start date must be before end date.";
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    if (days < 7) return "Custom range must be at least 7 days.";
    return "";
  };

  const handleDateFrom = (val) => {
    const autoTo =
      draft.dateTo && draft.dateTo > val ? draft.dateTo : todayIso();
    setDraft((f) => ({ ...f, dateFrom: val, dateTo: autoTo }));
    setDateError(validateDates(val, autoTo));
  };

  const handleDateTo = (val) => {
    setDraft((f) => ({ ...f, dateTo: val }));
    setDateError(validateDates(draft.dateFrom, val));
  };

  const handleApply = () => {
    if (draft.preset === "custom") {
      const err = validateDates(draft.dateFrom, draft.dateTo);
      if (err) {
        setDateError(err);
        return;
      }
    }
    setDateError("");
    onApply({ ...draft });
  };

  const handleReset = () => {
    setDateError("");
    const base = BLANK_FILTERS();
    if (isBarangayUser && userBarangay) {
      base.barangays = [userBarangay];
    }
    // For patrol users with active assignment, restrict to their barangays
    if (isPatrol && hasPatrolAssignment && patrolAssignedBarangays.length > 0) {
      base.barangays = patrolAssignedBarangays;
    }
    // For patrol users without assignment, base.barangays stays empty (all barangays)
    onApply(base);
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(appliedFilters);
  const isDefault =
    draft.preset === "this_month" &&
    !draft.crimeTypes.length &&
    !draft.barangays.length;

  return (
    <div
      className={`cd-filter-bar ${expanded ? "cd-expanded" : "cd-collapsed"}`}
    >
      <div
        className="cd-filter-bar-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="cd-filter-bar-title">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            stroke="var(--navy-primary)"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>Filters &amp; Options</span>
          {!expanded && !isDefault && (
            <span className="cd-filter-active-count">filtered</span>
          )}
        </div>

        <button
          className="cd-filter-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "▲ Collapse" : "▼ Expand"}
        </button>
      </div>

      {expanded && (
        <div className="cd-filter-body">
          <div className="cd-preset-row">
            <span className="cd-preset-label">Date Range</span>

            <div className="cd-preset-btns">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  className={`cd-preset-btn ${draft.preset === p.key ? "cd-preset-btn-active" : ""}`}
                  onClick={() => handlePreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {draft.preset === "custom" && (
              <div className="cd-custom-range-wrap">
                <div className="cd-custom-range">
                  <input
                    type="date"
                    value={draft.dateFrom}
                    max={
                      draft.dateTo
                        ? (() => {
                            const d = new Date(draft.dateTo);
                            d.setDate(d.getDate() - 6);
                            return d.toISOString().slice(0, 10);
                          })()
                        : todayIso()
                    }
                    onChange={(e) => handleDateFrom(e.target.value)}
                  />
                  <span className="cd-range-sep">→</span>
                  <input
                    type="date"
                    value={draft.dateTo}
                    min={
                      draft.dateFrom
                        ? (() => {
                            const d = new Date(draft.dateFrom);
                            d.setDate(d.getDate() + 6);
                            return d.toISOString().slice(0, 10);
                          })()
                        : undefined
                    }
                    max={todayIso()}
                    onChange={(e) => handleDateTo(e.target.value)}
                  />
                </div>

                {dateError && (
                  <div className="cd-date-error">
                    <span className="cd-date-error-icon">⚠</span> {dateError}
                  </div>
                )}
              </div>
            )}

            {draft.preset !== "custom" && (
              <span className="cd-preset-range-display">
                {fmtDate(draft.dateFrom)} — {fmtDate(draft.dateTo)}
              </span>
            )}
          </div>

          <div className="cd-filter-grid">
            <div className="cd-filter-group">
              <label>Crime Type</label>
              <CrimeTypeMultiSelect
                selected={draft.crimeTypes}
                onChange={(val) => setDraft((f) => ({ ...f, crimeTypes: val }))}
              />
            </div>

            <div className="cd-filter-group">
              <label>Barangay</label>
              {isPatrol && hasPatrolAssignment ? (
                <div
                  className="crmap-fsel crmap-fsel-locked"
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  {patrolAssignedBarangays.length === 1
                    ? formatBarangayLabel(patrolAssignedBarangays[0])
                    : `${patrolAssignedBarangays.length} Assigned Barangays`}
                  <span
                    className="crmap-locked-icon"
                    title="Auto-filtered to your patrol assignment"
                  ></span>
                </div>
              ) : isBarangayUser && userBarangay ? (
                <div className="crmap-fsel crmap-fsel-locked">
                  <span className="crmap-locked-value">
                    {formatBarangayLabel(userBarangay)}
                  </span>
                  <span
                    className="crmap-locked-icon"
                    title="Auto-filtered to your assigned barangay"
                  ></span>
                </div>
              ) : (
                <BarangayMultiSelect
                  selected={draft.barangays}
                  onChange={(val) =>
                    setDraft((f) => ({ ...f, barangays: val }))
                  }
                />
              )}
            </div>

            <div className="cd-filter-group-actions">
              <button
                className={`cd-apply-btn ${isDirty ? "cd-apply-btn-dirty" : ""}`}
                onClick={handleApply}
              >
                Apply Filters
              </button>
              <button
                className="cd-reset-btn"
                onClick={handleReset}
                title="Reset to defaults"
              >
                ↺
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SUMMARY CARDS ────────────────────────────────────────────────────────────
const CARD_ICONS = {
  blue: FileText,
  green: Unlock,
  indigo: CheckSquare,
  amber: Search,
};

const Delta = ({ curr, prevVal, isPercent = false, goodWhenUp = false }) => {
  if (prevVal === null || prevVal === undefined) return null;
  const diff = isPercent
    ? parseFloat(curr) - parseFloat(prevVal)
    : curr - prevVal;
  if (diff === 0) return <span className="cd-delta cd-delta-neutral">→ 0</span>;
  const up = diff > 0;
  const label = isPercent
    ? `${up ? "↑" : "↓"} ${Math.abs(diff).toFixed(1)}%`
    : `${up ? "↑" : "↓"} ${Math.abs(diff)}`;
  const isGood = goodWhenUp ? up : !up;
  return (
    <span className={`cd-delta ${isGood ? "cd-delta-down" : "cd-delta-up"}`}>
      {label}
    </span>
  );
};

const SummaryCards = ({ data, prevSummary, isThisMonth }) => {
  const t = {
    total: data.reduce((s, d) => s + d.total, 0),
    cleared: data.reduce((s, d) => s + d.cleared, 0),
    solved: data.reduce((s, d) => s + d.solved, 0),
    ui: data.reduce((s, d) => s + d.underInvestigation, 0),
  };

  const prev =
    isThisMonth && prevSummary
      ? {
          total: prevSummary.reduce((s, d) => s + d.total, 0),
          cleared: prevSummary.reduce((s, d) => s + d.cleared, 0),
          solved: prevSummary.reduce((s, d) => s + d.solved, 0),
          ui: prevSummary.reduce((s, d) => s + d.underInvestigation, 0),
        }
      : null;

  const currCCE = parseFloat(pct(t.cleared + t.solved, t.total));
  const prevCCE = prev
    ? parseFloat(pct(prev.cleared + prev.solved, prev.total))
    : null;
  const currCSE = parseFloat(pct(t.solved, t.total));
  const prevCSE = prev ? parseFloat(pct(prev.solved, prev.total)) : null;

  const cards = [
    {
      label: "Total Incidents",
      value: t.total,
      color: "blue",
      sub: "Index crimes",
      delta: <Delta curr={t.total} prevVal={prev?.total} goodWhenUp={false} />,
    },
    {
      label: "CCE %",
      value: `${currCCE.toFixed(1)}%`,
      color: "indigo",
      sub: `${t.cleared} cleared`,
      delta: (
        <Delta curr={currCCE} prevVal={prevCCE} isPercent goodWhenUp={true} />
      ),
    },
    {
      label: "CSE %",
      value: `${currCSE.toFixed(1)}%`,
      color: "green",
      sub: `${t.solved} solved`,
      delta: (
        <Delta curr={currCSE} prevVal={prevCSE} isPercent goodWhenUp={true} />
      ),
    },
    {
      label: "Under Investigation",
      value: t.ui,
      color: "amber",
      sub: "Pending resolution",
      delta: <Delta curr={t.ui} prevVal={prev?.ui} goodWhenUp={false} />,
    },
  ];

  return (
    <div className="cd-summary-cards">
      {cards.map((c, i) => {
        const Icon = CARD_ICONS[c.color];
        return (
          <div key={i} className={`cd-summary-card cd-card-${c.color}`}>
            <div className="cd-summary-card-top">
              <div className="cd-summary-icon-wrap">
                <Icon size={20} strokeWidth={2} />
              </div>
              <span className="cd-summary-sub">{c.sub}</span>
            </div>
            <div className="cd-summary-value">{c.value}</div>
            <div className="cd-summary-label">{c.label}</div>
            {isThisMonth && SHOW_MONTHLY_DELTAS && (
              <div className="cd-delta-row">
                {c.delta}
                {prev !== null && (
                  <span className="cd-delta-label">vs last month</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── INDEX CRIME TABLE ────────────────────────────────────────────────────────
const IndexCrimeTable = ({
  data,
  selectedCrimes,
  prevSummary,
  isThisMonth,
}) => {
  const [sortCol, setSortCol] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

  const prevMap = useMemo(() => {
    if (!isThisMonth || !prevSummary) return {};
    const m = {};
    prevSummary.forEach((r) => {
      m[r.crime] = r;
    });
    return m;
  }, [prevSummary, isThisMonth]);

  const visibleData = useMemo(
    () =>
      selectedCrimes.length > 0
        ? data.filter((d) => selectedCrimes.includes(d.crime))
        : data,
    [data, selectedCrimes],
  );

  const rows = useMemo(
    () =>
      [...visibleData].sort((a, b) => {
        const av = a[sortCol] ?? 0;
        const bv = b[sortCol] ?? 0;
        return sortDir === "desc" ? bv - av : av - bv;
      }),
    [visibleData, sortCol, sortDir],
  );

  const tot = visibleData.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      cleared: acc.cleared + d.cleared,
      solved: acc.solved + d.solved,
      ui: acc.ui + d.underInvestigation,
    }),
    { total: 0, cleared: 0, solved: 0, ui: 0 },
  );

  const prevTot =
    isThisMonth && prevSummary
      ? prevSummary
          .filter(
            (r) =>
              selectedCrimes.length === 0 || selectedCrimes.includes(r.crime),
          )
          .reduce((acc, d) => ({ total: acc.total + d.total }), { total: 0 })
      : null;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const SortTh = ({ col, children }) => (
    <th className="cd-sortable cd-num-cell" onClick={() => handleSort(col)}>
      {children}
      <span className="cd-sort-icon">
        {sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : "⇅"}
      </span>
    </th>
  );

  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header">
        <h3>Index Crime Summary Table</h3>
        <span className="cd-chart-subtitle">
          {selectedCrimes.length > 0
            ? `${rows.length} crimes shown`
            : "All index crimes"}
          {isThisMonth && prevSummary && SHOW_MONTHLY_DELTAS && (
            <span className="cd-table-delta-hint"> · ↕ vs last month</span>
          )}
        </span>
      </div>

      <div className="cd-table-wrapper">
        <table className="cd-crime-table">
          <thead>
            <tr>
              <th>Index Crime</th>
              <SortTh col="total">Total</SortTh>
              {isThisMonth && prevSummary && SHOW_MONTHLY_DELTAS && (
                <th className="cd-num-cell">vs Last Month</th>
              )}
              <SortTh col="cleared">Cleared</SortTh>
              <SortTh col="solved">Solved</SortTh>
              <SortTh col="underInvestigation">Under Inv.</SortTh>
              <th
                className="cd-num-cell cd-th-tooltip-wrap"
                style={{ textAlign: "right" }}
              >
                CCE %
                <div className="cd-th-tooltip">
                  <div className="cd-th-tooltip-title">
                    Crime Clearance Efficiency
                  </div>
                  <div className="cd-th-tooltip-formula">
                    (Cleared + Solved) ÷ Total × 100
                  </div>
                </div>
              </th>
              <th
                className="cd-num-cell cd-th-tooltip-wrap"
                style={{ textAlign: "right" }}
              >
                CSE %
                <div className="cd-th-tooltip">
                  <div className="cd-th-tooltip-title">
                    Crime Solution Efficiency
                  </div>
                  <div className="cd-th-tooltip-formula">
                    Solved ÷ Total × 100
                  </div>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => {
              const cceVal = parseFloat(
                pct(row.cleared + row.solved, row.total),
              );
              const cseVal = parseFloat(pct(row.solved, row.total));
              const prevRow = prevMap[row.crime];
              const diff =
                isThisMonth && prevRow !== undefined
                  ? row.total - prevRow.total
                  : null;

              return (
                <tr key={i}>
                  <td className="cd-crime-name">
                    {CRIME_DISPLAY[row.crime] || row.crime}
                  </td>
                  <td className="cd-num-cell">{row.total}</td>
                  {isThisMonth && prevSummary && SHOW_MONTHLY_DELTAS && (
                    <td className="cd-num-cell">
                      {diff === null ? (
                        <span className="cd-delta cd-delta-neutral">—</span>
                      ) : diff === 0 ? (
                        <span className="cd-delta cd-delta-neutral">→ 0</span>
                      ) : (
                        <span
                          className={`cd-delta ${diff > 0 ? "cd-delta-up" : "cd-delta-down"}`}
                        >
                          {diff > 0 ? "↑" : "↓"} {Math.abs(diff)}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="cd-num-cell cd-cleared">{row.cleared}</td>
                  <td className="cd-num-cell cd-solved">{row.solved}</td>
                  <td className="cd-num-cell cd-ui">
                    {row.underInvestigation}
                  </td>
                  <td className="cd-num-cell">
                    <span
                      className={`cd-badge ${cceVal >= 50 ? "cd-badge-green" : "cd-badge-red"}`}
                    >
                      {cceVal.toFixed(1)}%
                    </span>
                  </td>
                  <td className="cd-num-cell">
                    <span
                      className={`cd-badge ${cseVal >= 50 ? "cd-badge-green" : "cd-badge-amber"}`}
                    >
                      {cseVal.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td>
                <strong>TOTAL</strong>
              </td>
              <td className="cd-num-cell">
                <strong>{tot.total}</strong>
              </td>
              {isThisMonth &&
                prevSummary &&
                SHOW_MONTHLY_DELTAS &&
                (() => {
                  const totalDiff = tot.total - (prevTot?.total ?? 0);
                  return (
                    <td className="cd-num-cell">
                      {totalDiff === 0 ? (
                        <span className="cd-delta cd-delta-neutral">→ 0</span>
                      ) : (
                        <span
                          className={`cd-delta ${totalDiff > 0 ? "cd-delta-up" : "cd-delta-down"}`}
                        >
                          <strong>
                            {totalDiff > 0 ? "↑" : "↓"} {Math.abs(totalDiff)}
                          </strong>
                        </span>
                      )}
                    </td>
                  );
                })()}
              <td className="cd-num-cell cd-cleared">
                <strong>{tot.cleared}</strong>
              </td>
              <td className="cd-num-cell cd-solved">
                <strong>{tot.solved}</strong>
              </td>
              <td className="cd-num-cell cd-ui">
                <strong>{tot.ui}</strong>
              </td>
              <td className="cd-num-cell">
                <span className="cd-badge cd-badge-green">
                  {pct(tot.cleared + tot.solved, tot.total)}%
                </span>
              </td>
              <td className="cd-num-cell">
                <span className="cd-badge cd-badge-green">
                  {pct(tot.solved, tot.total)}%
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// ─── CASE STATUS CHART ────────────────────────────────────────────────────────
const CaseStatusChart = ({ data, selectedCrimes }) => {
  const visibleData =
    selectedCrimes.length > 0
      ? data.filter((d) => selectedCrimes.includes(d.crime))
      : data;

  const rows = visibleData.map((d) => ({
    crime: CRIME_SHORT[d.crime] || d.crime,
    Cleared: d.cleared,
    Solved: d.solved,
    "Under Inv.": d.underInvestigation,
    _total: d.cleared + d.solved + d.underInvestigation,
  }));

  const TopLabelBar = (props) => {
    const { x, y, width, height, fill, radius, index } = props;
    const total = rows[index]?._total;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          rx={radius?.[0] || 0}
          ry={radius?.[0] || 0}
        />
        {total > 0 && (
          <text
            x={x + width / 2}
            y={y - 6}
            textAnchor="middle"
            fill="#111827"
            fontSize={11}
            fontWeight={700}
          >
            {total}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header">
        <h3>Case Status per Index Crime</h3>
        <div className="cd-cs-legend">
          <span
            className="cd-legend-dot"
            style={{ background: STATUS_COLORS.cleared }}
          />{" "}
          Cleared &nbsp;
          <span
            className="cd-legend-dot"
            style={{ background: STATUS_COLORS.solved }}
          />{" "}
          Solved &nbsp;
          <span
            className="cd-legend-dot"
            style={{ background: STATUS_COLORS.underInvestigation }}
          />{" "}
          Under Inv.
        </div>
      </div>

      <div style={{ overflowX: "auto", overflowY: "hidden" }}>
        <ResponsiveContainer
          width="100%"
          minWidth={rows.length * 80}
          height={320}
        >
          <BarChart
            data={rows}
            margin={{ top: 28, right: 16, left: 0, bottom: 16 }}
            barCategoryGap="22%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              vertical={false}
            />
            <XAxis
              dataKey="crime"
              tick={{
                fontSize: Math.max(
                  9,
                  Math.min(11, Math.floor(200 / rows.length)),
                ),
                fill: "#6b7280",
              }}
              angle={0}
              textAnchor="middle"
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              allowDecimals={false}
            />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Bar
              dataKey="Cleared"
              stackId="a"
              fill={STATUS_COLORS.cleared}
              maxBarSize={48}
            />
            <Bar
              dataKey="Solved"
              stackId="a"
              fill={STATUS_COLORS.solved}
              maxBarSize={48}
            />
            <Bar
              dataKey="Under Inv."
              stackId="a"
              fill={STATUS_COLORS.underInvestigation}
              radius={[3, 3, 0, 0]}
              maxBarSize={48}
              shape={
                <TopLabelBar
                  fill={STATUS_COLORS.underInvestigation}
                  radius={[3, 3, 0, 0]}
                />
              }
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─── CRIME TRENDS ─────────────────────────────────────────────────────────────
const TrendsTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const visible = [...payload]
  .filter((p) => p.name === "Total" || (p.value !== undefined && p.value !== 0))
  .sort((a, b) => {
    if (a.name === "Total") return -1;
    if (b.name === "Total") return 1;
    return b.value - a.value;
  });

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        maxWidth: 240,
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          color: "#1e3a5f",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 4,
        }}
      >
        {label}
      </div>
      {visible.map((p, i) => (
  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
    <span style={{ color: "#374151", fontWeight: p.name === "Total" ? 700 : 400 }}>
      {CRIME_LABEL[p.name] || p.name}
    </span>
    <span style={{ color: "#0a1628", fontWeight: p.name === "Total" ? 700 : 400 }}>
      {p.value}
    </span>
  </div>
))}
    </div>
  );
};

const CrimeTrends = ({ appliedFilters, data }) => {
  const granularity = useMemo(
    () =>
      getGranularity(
        appliedFilters.preset,
        appliedFilters.dateFrom,
        appliedFilters.dateTo,
      ),
    [appliedFilters.preset, appliedFilters.dateFrom, appliedFilters.dateTo],
  );

  const activeCrimes =
    appliedFilters.crimeTypes.length > 0
      ? appliedFilters.crimeTypes
      : INDEX_CRIMES;

  const dayCount =
    Math.round(
      (new Date(appliedFilters.dateTo) - new Date(appliedFilters.dateFrom)) /
        86400000,
    ) + 1;

  const tickInterval = (() => {
    const n = data.length;
    if (n <= 16) return 0;
    return Math.ceil(n / 16) - 1;
  })();

  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const years = new Set(data.map((d) => d.label?.slice(0, 4)).filter(Boolean));
  const multiYear = years.size > 1;

  const fmtLabel = (iso) => {
    if (!iso) return "";
    if (granularity === "monthly") {
      const [y, m] = iso.split("-");
      const monthStr = MONTHS[parseInt(m, 10) - 1];
      return multiYear ? `${monthStr} ${y}` : monthStr;
    }
    if (granularity === "quarterly") {
      const [y, m] = iso.split("-");
      const month = parseInt(m, 10);
      const quarter = Math.ceil(month / 3);
      return `Q${quarter} ${y}`;
    }
    const [y, m, d] = iso.split("-");
    return multiYear ? `${m}/${d}/${y.slice(2)}` : `${m}/${d}`;
  };

  const chartData = data.map((d) => ({ ...d, label: fmtLabel(d.label) }));

  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header">
        <h3>Crime Trends</h3>
        <span className="cd-chart-subtitle">
          {granularityLabel(granularity)} · {data.length} points · {dayCount}{" "}
          day{dayCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ overflowX: "auto", overflowY: "hidden" }}>
        <ResponsiveContainer
          width="100%"
          minWidth={
            data.length *
            (granularity === "monthly" && multiYear
              ? 80
              : granularity === "daily"
                ? 30
                : 50)
          }
          height={320}
        >
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 24, left: 0, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              interval={tickInterval}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              allowDecimals={false}
            />
            <Tooltip content={<TrendsTooltip />} />

            <Line
              type="linear"
              dataKey="Total"
              stroke={CRIME_COLORS.Total}
              strokeWidth={3}
              dot={
                data.length <= 24
                  ? { r: 5, fill: CRIME_COLORS.Total, strokeWidth: 0 }
                  : false
              }
              activeDot={{ r: 5, fill: CRIME_COLORS.Total }}
            />

            {activeCrimes.map((key) => (
              <Line
                key={key}
                type="linear"
                dataKey={key}
                stroke={CRIME_COLORS[key]}
                strokeWidth={0}
                dot={false}
                activeDot={false}
                hide={false}
                legendType="none"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─── CRIME CLOCK ──────────────────────────────────────────────────────────────
const ClockTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const crimes = INDEX_CRIMES.filter((c) => data[c] > 0).sort(
    (a, b) => data[b] - data[a],
  );

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          color: "#1e3a5f",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: crimes.length ? 4 : 0,
        }}
      >
        <span style={{ fontWeight: 700, color: "#374151" }}>Total</span>
        <span style={{ fontWeight: 700, color: "#0a1628" }}>{data.count}</span>
      </div>
      {crimes.map((c) => (
        <div
          key={c}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 2,
          }}
        >
          <span style={{ color: "#374151", fontWeight: 400 }}>
            {CRIME_LABEL[c]}
          </span>
          <span style={{ color: "#0a1628", fontWeight: 400 }}>{data[c]}</span>
        </div>
      ))}
    </div>
  );
};

const CrimeClock = ({ data }) => (
  <div className="cd-chart-card cd-full-width">
    <div className="cd-chart-card-header">
      <h3>Crime Clock — Hourly Distribution</h3>
    </div>
    <ResponsiveContainer width="100%" height={240}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          interval={1}
        />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
        <Tooltip content={<ClockTooltip />} />
        <Line
          type="linear"
          dataKey="count"
          stroke="#1e3a5f"
          strokeWidth={2.5}
          dot={(props) => {
            const { cx, cy, value } = props;
            if (!value)
              return (
                <circle
                  key={props.key}
                  cx={cx}
                  cy={cy}
                  r={2}
                  fill="#1e3a5f"
                  stroke="none"
                />
              );
            return (
              <circle
                key={props.key}
                cx={cx}
                cy={cy}
                r={3.5}
                fill="#1e3a5f"
                stroke="none"
              />
            );
          }}
          activeDot={{ r: 5 }}
          connectNulls={true}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

// ─── CRIME BY DAY ─────────────────────────────────────────────────────────────
const CrimeByDay = ({ data }) => {
  const chartH = CHART_ROW_HEIGHT - 64 - 40;

  return (
    <div className="cd-chart-card cd-chart-fixed-height">
      <div className="cd-chart-card-header">
        <h3>Crime by Day of Week</h3>
      </div>
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
          barCategoryGap="30%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e5e7eb"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickFormatter={(d) => d.slice(0, 3)}
            tick={{ fontSize: 13, fill: "#6b7280" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const data = payload[0].payload;
              const crimes = INDEX_CRIMES.filter((c) => data[c] > 0).sort(
                (a, b) => data[b] - data[a],
              );
              return (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: 6,
                      color: "#1e3a5f",
                      borderBottom: "1px solid #e5e7eb",
                      paddingBottom: 4,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      marginBottom: crimes.length ? 4 : 0,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#374151" }}>
                      Total
                    </span>
                    <span style={{ fontWeight: 700, color: "#0a1628" }}>
                      {data.count}
                    </span>
                  </div>
                  {crimes.map((c) => (
                    <div
                      key={c}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ color: "#374151", fontWeight: 400 }}>
                        {CRIME_LABEL[c]}
                      </span>
                      <span style={{ color: "#0a1628", fontWeight: 400 }}>
                        {data[c]}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Bar
            dataKey="count"
            name="Reported"
            fill="#1e3a5f"
            radius={[4, 4, 0, 0]}
            maxBarSize={64}
          >
            <LabelList
              dataKey="count"
              position="top"
              style={{
                fontSize: 11,
                fontWeight: 700,
                fill: "#1e3a5f",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── MODUS OPERANDI ───────────────────────────────────────────────────────────
const ModusChart = ({ data, crimeTypes }) => {
  const [page, setPage] = useState(0);

  const allData = useMemo(() => {
    const filtered =
      crimeTypes.length > 0
        ? data.filter((r) => crimeTypes.includes(r.crime))
        : data;

    return filtered.map((r) => ({
      ...r,
      label:
        crimeTypes.length === 1
          ? r.modus
          : `${r.modus} (${CRIME_SHORT[r.crime] || r.crime})`,
    }));
  }, [data, crimeTypes]);

  useEffect(() => setPage(0), [allData]);

  const totalPages = Math.ceil(allData.length / MODUS_PAGE_SIZE);
  const pageData = allData.slice(
    page * MODUS_PAGE_SIZE,
    (page + 1) * MODUS_PAGE_SIZE,
  );

  const maxLabelLen = pageData.length
    ? Math.max(...pageData.map((d) => d.label.length))
    : 10;

  const yWidth = Math.min(Math.max(Math.ceil(maxLabelLen * 7.0), 90), 230);
  const chartH = CHART_ROW_HEIGHT - 64 - 45 - 40;

  return (
    <div className="cd-chart-card cd-chart-fixed-height cd-flex-col">
      <div className="cd-chart-card-header">
        <h3>Modus Operandi</h3>
        <span className="cd-chart-subtitle">
          {crimeTypes.length === 0
            ? "All crimes"
            : crimeTypes.length === 1
              ? CRIME_DISPLAY[crimeTypes[0]]
              : `${crimeTypes.length} crimes`}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart
            data={pageData}
            layout="vertical"
            margin={{ top: 4, right: 56, left: 0, bottom: 4 }}
            barCategoryGap="28%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              horizontal={false}
            />
            <XAxis type="number" tick={{ fontSize: 13, fill: "#6b7280" }} />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fontSize: 13, fill: "#374151" }}
              width={yWidth}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || payload[0].value === 0)
                  return null;
                return (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      padding: "7px 12px",
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 2,
                        color: "#1e3a5f",
                      }}
                    >
                      {label}
                    </div>
                    <div>
                      Incidents: <strong>{payload[0].value}</strong>
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="count"
              name="Incidents"
              radius={[0, 4, 4, 0]}
              maxBarSize={30}
            >
              {pageData.map((_, i) => (
                <Cell key={i} fill={i % 2 === 0 ? "#1e3a5f" : "#2d4a6f"} />
              ))}
              <LabelList content={<HBarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {totalPages > 1 && (
        <div className="cd-brgy-pagination">
          <span className="cd-brgy-page-info">
            {page * MODUS_PAGE_SIZE + 1}–
            {Math.min((page + 1) * MODUS_PAGE_SIZE, allData.length)} of{" "}
            {allData.length}
          </span>

          <div className="cd-brgy-page-btns">
            <button
              className="cd-page-btn"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                className={`cd-page-btn ${page === i ? "cd-page-btn-active" : ""}`}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}

            <button
              className="cd-page-btn"
              disabled={page === totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── CRIME BREAKDOWN TOOLTIP ──────────────────────────────────────────────────
const CrimeBreakdownTooltip = ({ row, nameKey }) => {
  if (!row) return null;
  const crimes = INDEX_CRIMES.filter((c) => row[c] > 0).sort(
    (a, b) => row[b] - row[a],
  );

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 500,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        minWidth: 180,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          color: "#1e3a5f",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 220,
        }}
      >
        {row[nameKey]}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: crimes.length ? 4 : 0,
        }}
      >
        <span style={{ fontWeight: 700, color: "#374151" }}>Total</span>
        <span style={{ fontWeight: 700, color: "#0a1628" }}>{row.count}</span>
      </div>
      {crimes.map((c) => (
        <div
          key={c}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 2,
          }}
        >
          <span style={{ color: "#374151", fontWeight: 400 }}>
            {CRIME_LABEL[c]}
          </span>
          <span style={{ color: "#0a1628", fontWeight: 400 }}>{row[c]}</span>
        </div>
      ))}
    </div>
  );
};

// ─── PLACE OF COMMISSION ──────────────────────────────────────────────────────
const PlaceOfCommission = ({ data }) => {
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const sorted = useMemo(
    () =>
      [...data]
        .sort((a, b) =>
          sortDir === "desc" ? b.count - a.count : a.count - b.count,
        )
        .map((d, i) => ({ ...d, rank: i + 1 })),
    [data, sortDir],
  );

  useEffect(() => setPage(0), [sortDir, data]);

  const totalPages = Math.ceil(sorted.length / PLACE_PAGE_SIZE);
  const pageData = sorted.slice(
    page * PLACE_PAGE_SIZE,
    (page + 1) * PLACE_PAGE_SIZE,
  );

  const handleMouseEnter = (row, e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const rowRect = e.currentTarget.getBoundingClientRect();
    setHoveredRow(row);
    setTooltipPos({
      x: rowRect.left - (rect?.left || 0) ,
      y: rowRect.top - (rect?.top || 0),
    });
  };
  return (
    <div
      ref={containerRef}
      className="cd-chart-card cd-flex-col cd-table-fixed-height"
      style={{ position: "relative" }}
    >
      <div className="cd-chart-card-header">
        <h3>Place of Commission</h3>
        <span className="cd-chart-subtitle">
          Click count to sort · Hover row for breakdown
        </span>
      </div>

      {hoveredRow && (
        <div
          style={{
            position: "absolute",
            left: tooltipPos.x,
            top: tooltipPos.y,
          }}
        >
          <CrimeBreakdownTooltip row={hoveredRow} nameKey="place" />
        </div>
      )}

      <table className="cd-brgy-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Location</th>
            <th
              className="cd-num-cell cd-sortable"
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            >
              Count{" "}
              <span
                className="cd-sort-icon"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {sortDir === "desc" ? "▼" : "▲"}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pageData.map((row, i) => (
            <tr
              key={i}
              onMouseEnter={(e) => handleMouseEnter(row, e)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{ cursor: "default" }}
            >
              <td className="cd-brgy-rank">{row.rank}</td>
              <td className="cd-brgy-name">{row.place}</td>
              <td className="cd-num-cell cd-brgy-primary">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cd-brgy-pagination">
        <span className="cd-brgy-page-info">
          {page * PLACE_PAGE_SIZE + 1}–
          {Math.min((page + 1) * PLACE_PAGE_SIZE, sorted.length)} of{" "}
          {sorted.length}
        </span>
        <div className="cd-brgy-page-btns">
          <button
            className="cd-page-btn"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              className={`cd-page-btn ${page === i ? "cd-page-btn-active" : ""}`}
              onClick={() => setPage(i)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="cd-page-btn"
            disabled={page === totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── BARANGAY TABLE ───────────────────────────────────────────────────────────
const BarangayTable = ({ data }) => {
  const [sortCol, setSortCol] = useState("count");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const sorted = useMemo(
    () =>
      [...data]
        .sort((a, b) => {
          if (sortCol === "barangay") {
            return sortDir === "desc"
              ? b.barangay.localeCompare(a.barangay)
              : a.barangay.localeCompare(b.barangay);
          }
          return sortDir === "desc" ? b.count - a.count : a.count - b.count;
        })
        .map((d, i) => ({ ...d, rank: i + 1 })),
    [data, sortCol, sortDir],
  );

  const totalPages = Math.ceil(sorted.length / BRGY_PAGE_SIZE);
  const pageData = sorted.slice(
    page * BRGY_PAGE_SIZE,
    (page + 1) * BRGY_PAGE_SIZE,
  );

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortCol(col);
      setSortDir("desc");
      setPage(0);
    }
  };

  const handleMouseEnter = (row, e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const rowRect = e.currentTarget.getBoundingClientRect();
    setHoveredRow(row);
    setTooltipPos({
      x: rowRect.left - (rect?.left || 0), // show LEFT of the row, 210px wide
      y: rowRect.top - (rect?.top || 0),
    });
  };

  const SortIcon = ({ col }) => (
    <span
      className="cd-sort-icon"
      style={{ color: "rgba(255,255,255,0.7)", marginLeft: 3 }}
    >
      {sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : "⇅"}
    </span>
  );

  return (
    <div
      ref={containerRef}
      className="cd-chart-card cd-flex-col cd-table-fixed-height"
      style={{ position: "relative" }}
    >
      <div className="cd-chart-card-header">
        <h3>Barangay Incidents</h3>
        <span className="cd-chart-subtitle">
          {data.length} barangay{data.length !== 1 ? "s" : ""} with incidents ·
          Hover row for breakdown
        </span>
      </div>

      {hoveredRow && (
        <div
          style={{
            position: "absolute",
            left: tooltipPos.x,
            top: tooltipPos.y,
          }}
        >
          <CrimeBreakdownTooltip row={hoveredRow} nameKey="barangay" />
        </div>
      )}

      <table className="cd-brgy-table">
        <thead>
          <tr>
            <th>#</th>
            <th
              className="cd-sortable"
              onClick={() => handleSort("barangay")}
              style={{ textAlign: "left" }}
            >
              Barangay <SortIcon col="barangay" />
            </th>
            <th
              className="cd-num-cell cd-sortable"
              onClick={() => handleSort("count")}
            >
              Count <SortIcon col="count" />
            </th>
          </tr>
        </thead>
        <tbody>
          {pageData.map((row, i) => (
            <tr
              key={i}
              onMouseEnter={(e) => handleMouseEnter(row, e)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{ cursor: "default" }}
            >
              <td className="cd-brgy-rank">{row.rank}</td>
              <td className="cd-brgy-name">
                {formatBarangayLabel(row.barangay)}
              </td>
              <td className="cd-num-cell cd-brgy-primary">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cd-brgy-pagination">
        <span className="cd-brgy-page-info">
          {page * BRGY_PAGE_SIZE + 1}–
          {Math.min((page + 1) * BRGY_PAGE_SIZE, sorted.length)} of{" "}
          {sorted.length}
        </span>
        <div className="cd-brgy-page-btns">
          <button
            className="cd-page-btn"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              className={`cd-page-btn ${page === i ? "cd-page-btn-active" : ""}`}
              onClick={() => setPage(i)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="cd-page-btn"
            disabled={page === totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── TREND SPARKLINE ──────────────────────────────────────────────────────────
const TrendSparkline = ({
  crimeType,
  weeklyRows,
  linregData,
  mode,
  forecastState = "full",
}) => {
  const crimeRows = useMemo(() => {
    if (!weeklyRows?.length) return [];
    return weeklyRows
      .filter((r) => r.incident_type === crimeType)
      .sort((a, b) => new Date(a.week_start) - new Date(b.week_start))
      .map((r, i) => ({ index: i, week: r.week_start, count: r.count }));
  }, [weeklyRows, crimeType]);

  const lr = useMemo(() => {
    if (!linregData?.per_crime) return null;
    return linregData.per_crime.find((l) => l.crime === crimeType) || null;
  }, [linregData, crimeType]);

  // Croston has no slope — use trend from moving average comparison
  // lr.trend is already set correctly from compute_croston
  // lr.predicted_next_week comes from Croston rate
  // lr.confidence replaces the old confidence_level

  if (!crimeRows.length) return null;

  const regressionData = useMemo(() => {
    if (!lr || lr.smoothed_demand === undefined) return [];
    // Croston rate = smoothed_demand / smoothed_interval
    const rate = lr.smoothed_demand / Math.max(lr.smoothed_interval || 1, 1);
    return crimeRows.map((r) => ({
      ...r,
      regression: Math.max(0, parseFloat(rate.toFixed(2))),
    }));
  }, [crimeRows, lr]);

  const chartData = useMemo(() => {
    if (!regressionData.length) return crimeRows;
    const rate = lr.smoothed_demand / Math.max(lr.smoothed_interval || 1, 1);
    const forecastVal = Math.max(0, parseFloat(rate.toFixed(2)));

    return [
      ...regressionData,
      {
        index: regressionData.length,
        week: "Forecast",
        count: null,
        regression: forecastVal,
        predicted: lr.predicted_next_week ?? forecastVal,
      },
    ];
  }, [regressionData, lr, crimeRows]);

  const trendColor =
    lr?.trend === "increasing"
      ? "#ef4444"
      : lr?.trend === "decreasing"
        ? "#22c55e"
        : "#6b7280";

  const trendLabel =
    lr?.trend === "increasing"
      ? "↑ Increasing"
      : lr?.trend === "decreasing"
        ? "↓ Decreasing"
        : "→ Stable";

  const isRetrospective = mode === "retrospective";
  const hasEnoughData =
    typeof lr?.confidence === "number" && lr.confidence >= 50;
  const insufficientForecast =
    !lr ||
    lr?.predicted_next_week === null ||
    lr?.confidence === 0 ||
    forecastState === "insufficient";

  const isLimitedForecast = forecastState === "limited";

  const tickInterval =
    crimeRows.length <= 8
      ? 0
      : crimeRows.length <= 20
        ? 1
        : crimeRows.length <= 40
          ? 3
          : 5;

  const fmtWeek = (iso) => {
    if (!iso || iso === "Forecast") return iso;
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y.slice(2)}`;
  };

  return (
    <div className="cd-ai-sparkline-wrap">
      <div className="cd-ai-sparkline-header">
        <span className="cd-ai-sparkline-title">Weekly Trend</span>
        <span className="cd-ai-sparkline-badge" style={{ color: trendColor }}>
          {trendLabel}
        </span>
        {!hasEnoughData && (
          <span className="cd-ai-sparkline-warning">
            ⚠ Only {crimeRows.length} incident week
            {crimeRows.length !== 1 ? "s" : ""} recorded — trend and forecast
            may not be reliable
          </span>
        )}
        {!insufficientForecast &&
          lr?.predicted_next_week !== null &&
          lr?.predicted_next_week !== undefined && (
            <span className="cd-ai-sparkline-forecast">
              {isRetrospective ? (
                <>
                  Historical projection:{" "}
                  <strong>{lr.predicted_next_week}</strong> (period ended)
                </>
              ) : isLimitedForecast ? (
                <>
                  Forecast: <strong>{lr.predicted_next_week}</strong> next week
                  · {lr.confidence}% confidence{" "}
                  <span style={{ color: "#f59e0b" }}>⚠ Limited data</span>
                </>
              ) : (
                <>
                  Forecast: <strong>{lr.predicted_next_week}</strong> next week
                  · {lr.confidence}% confidence
                </>
              )}
            </span>
          )}
        {insufficientForecast && (
          <span className="cd-ai-sparkline-warning">
            ⚠ Insufficient data for forecast
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 0, bottom: 28 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f3f4f6"
            vertical={false}
          />
          <XAxis
            dataKey="week"
            tickFormatter={fmtWeek}
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            interval={tickInterval}
            angle={-35}
            textAnchor="end"
            height={32}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            width={20}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 4 }}
            formatter={(val, name) => {
              if (name === "count") return [val, "Actual"];
              if (name === "regression") return [val, "Trend line"];
              if (name === "predicted")
                return [
                  val,
                  isRetrospective ? "Historical projection" : "Forecast",
                ];
              return [val, name];
            }}
            labelFormatter={(label) =>
              label === "Forecast"
                ? isRetrospective
                  ? "Week Following Assessment Period"
                  : "Next Week (Forecast)"
                : `Week of ${label}`
            }
          />
          <Line
            type="linear"
            dataKey="count"
            stroke="#1e3a5f"
            strokeWidth={2}
            dot={{ r: 3, fill: "#1e3a5f", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
          <Line
            type="linear"
            dataKey="regression"
            stroke={trendColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
          />
          {!isLimitedForecast && (
            <Line
              type="linear"
              dataKey="predicted"
              stroke="#f59e0b"
              strokeWidth={0}
              dot={{ r: 5, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      <div className="cd-ai-sparkline-legend">
        <span>
          <span
            className="cd-sparkline-dot"
            style={{ background: "#1e3a5f" }}
          />
          Actual
        </span>
        <span>
          <span
            className="cd-sparkline-dash"
            style={{ borderColor: trendColor }}
          />
          Smoothed Rate
        </span>
        <span>
          <span
            className="cd-sparkline-dot"
            style={{ background: "#f59e0b" }}
          />
          {isRetrospective ? "Historical Projection" : "Forecast"}
        </span>
        {!hasEnoughData && lr?.confidence > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#f59e0b" }}>
            {lr.confidence}% confidence
          </span>
        )}
      </div>
    </div>
  );
};

// ─── MODULE-LEVEL CACHE ───────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;
let _cache = null;

const getCacheKey = (filters) => JSON.stringify(filters);

const isCacheValid = (filters) =>
  _cache !== null &&
  _cache.key === getCacheKey(filters) &&
  Date.now() - _cache.fetchedAt < CACHE_TTL;

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const CrimeDashboard = () => {
  const rawUser = localStorage.getItem("user");
  const currentUser = rawUser ? JSON.parse(rawUser) : null;
  const isBarangayUser = currentUser?.user_type === "barangay";
  const isPatrol =
    currentUser?.role_name === "Patrol" || currentUser?.role === "Patrol";
  const userBarangay = currentUser?.assigned_barangay_code ?? null;

  const role = localStorage.getItem("role");
  const isAdmin =
    role === "Administrator" || role === "Technical Administrator";

  const [hasPatrolAssignment, setHasPatrolAssignment] = useState(false);
  const [patrolAssignedBarangays, setPatrolAssignedBarangays] = useState([]);

  const BLANK_FILTERS_FOR_USER = () => {
    const base = BLANK_FILTERS();
    // Only apply automatic barangay restriction if:
    // 1. It's a patrol user WITH an ongoing assignment, OR
    // 2. It's a barangay user
    if (isPatrol && hasPatrolAssignment && patrolAssignedBarangays.length > 0) {
      base.barangays = patrolAssignedBarangays;
    } else if (isBarangayUser && userBarangay) {
      base.barangays = [userBarangay];
    }
    // For patrol users without assignment, keep barangays as empty array (all barangays)
    return base;
  };

  const [appliedFilters, setAppliedFilters] = useState(() =>
    BLANK_FILTERS_FOR_USER(),
  );

  const [dashData, setDashData] = useState(() =>
    _cache ? _cache.data : EMPTY_DASHBOARD(),
  );
  const [isLoading, setIsLoading] = useState(
    () => !isCacheValid(BLANK_FILTERS()),
  );

  const [assessment, setAssessment] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isGeneratingAssessment, setIsGeneratingAssessment] = useState(false);
  const [assessmentPhase, setAssessmentPhase] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showAiErrorModal, setShowAiErrorModal] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState("");
  const [showShortRangeModal, setShowShortRangeModal] = useState(false);
  const [pendingDayCount, setPendingDayCount] = useState(0);

  const fetchIdRef = useRef(0);

  // Check patrol assignment on mount
  // Check patrol assignment on mount
  // Check patrol assignment on mount
  useEffect(() => {
    if (!isPatrol) return;

    const checkPatrolAssignment = async () => {
      try {
        const token = getToken();
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/patrol/my-patrols`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();

        if (data.success) {
          const today = new Date().toISOString().split("T")[0];
          const ongoingPatrol = data.data.find(
            (p) => p.start_date <= today && p.end_date >= today,
          );

          if (ongoingPatrol) {
            const barangays = [
              ...new Set(
                (ongoingPatrol.routes || [])
                  .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
                  .map((r) => r.barangay),
              ),
            ];

            setHasPatrolAssignment(true);
            setPatrolAssignedBarangays(barangays);

            // Update filters with patrol barangays and re-fetch
            const updatedFilters = {
              ...BLANK_FILTERS(),
              barangays,
            };
            setAppliedFilters(updatedFilters);
            fetchOverview(updatedFilters, true);
          } else {
            // NO ongoing patrol - use default filters (all barangays)
            setHasPatrolAssignment(false);
            setPatrolAssignedBarangays([]);

            // Fetch with default filters (no barangay restriction)
            const defaultFilters = BLANK_FILTERS();
            setAppliedFilters(defaultFilters);
            fetchOverview(defaultFilters, true);
          }
        }
      } catch (err) {
        console.warn("Failed to check patrol assignment:", err);
        // On error, still fetch with default filters
        const defaultFilters = BLANK_FILTERS();
        setAppliedFilters(defaultFilters);
        fetchOverview(defaultFilters, true);
      }
    };

    checkPatrolAssignment();
  }, [isPatrol]);

  const refCaseStatus = useRef(null);
  const refTrends = useRef(null);
  const refClock = useRef(null);
  const refByDay = useRef(null);
  const refModus = useRef(null);
  const refPlace = useRef(null);
  const refBarangay = useRef(null);

  const chartRefs = {
    caseStatus: refCaseStatus,
    trends: refTrends,
    clock: refClock,
    byDay: refByDay,
    modus: refModus,
    place: refPlace,
    barangay: refBarangay,
  };

  const [isExportLoading, setIsExportLoading] = useState(false);
  const { exportDoc, isExporting, pdfPreview, closePreview } =
    useExportDashboard(
      dashData,
      appliedFilters,
      chartRefs,
      setIsExportLoading,
      assessment,
      analysisData,
    );

  const fetchOverview = (filters, force = false) => {
    if (!force && isCacheValid(filters)) {
      setDashData(_cache.data);
      setAppliedFilters(filters);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    const headers = { Authorization: `Bearer ${getToken()}` };
    const q = buildParams(filters);

    setIsLoading(true);

    fetch(`${API}/overview${q}`, { headers })
      .then((r) => r.json())
      .then((json) => {
        if (fetchId !== fetchIdRef.current) return;

        if (json.success) {
          const data = {
            summary: json.summary ?? [],
            trends: json.trends ?? [],
            hourly: json.hourly ?? [],
            byDay: json.byDay ?? [],
            place: json.place ?? [],
            barangay: json.barangay ?? [],
            modus: json.modus ?? [],
            completeData: json.completeData ?? [],
            prevSummary: json.prevSummary ?? null,
          };

          _cache = {
            key: getCacheKey(filters),
            data,
            fetchedAt: Date.now(),
          };

          setDashData(data);
        } else {
          console.error("[CrimeDashboard] API error:", json.message);
        }
      })
      .catch((err) => {
        if (fetchId !== fetchIdRef.current) return;
        console.error("[CrimeDashboard] fetch error:", err);
      })
      .finally(() => {
        if (fetchId !== fetchIdRef.current) return;
        setIsLoading(false);
      });
  };

  useEffect(() => {
    // For patrol users, the patrol check useEffect handles the initial fetch
    // For non-patrol users (Admin, Barangay, Investigator), fetch here
    if (isPatrol) return;

    const defaults = BLANK_FILTERS_FOR_USER();

    if (isCacheValid(defaults)) {
      setDashData(_cache.data);
      setIsLoading(false);
    } else {
      fetchOverview(defaults);
    }
  }, [isPatrol]);

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(""), 5000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  const getAssessmentMode = (dateTo) => {
    if (!dateTo) return "current";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const end = new Date(dateTo);
    end.setHours(0, 0, 0, 0);

    return end < today ? "retrospective" : "current";
  };

  const handleApply = (newFilters) => {
    // Only override barangays if patrol user HAS an active assignment
    if (isPatrol && hasPatrolAssignment && patrolAssignedBarangays.length > 0) {
      newFilters.barangays = patrolAssignedBarangays;
    } else if (isBarangayUser && userBarangay) {
      newFilters.barangays = [userBarangay];
    }
    // For patrol users without assignment, respect their manual selection
    setAssessment(null);
    setAppliedFilters(newFilters);
    fetchOverview(newFilters, true);
  };

  // const ASSESSMENT_PHASES = [
  //   "Querying blotter records...",
  //   "Running DBSCAN spatial clustering...",
  //   "Analyzing peak hours and days...",
  //   "Computing Croston crime forecasts...",
  //   "Calculating CCE and CSE...",
  //   "Preparing assessment data...",
  //   "AI is writing general assessment...",
  //   "AI is writing EMPO QUAD recommendations...",
  //   "Finalizing assessment...",
  // ];

  const runAssessment = async () => {
    const crimes =
      appliedFilters.crimeTypes.length > 0
        ? appliedFilters.crimeTypes
        : INDEX_CRIMES;

    const phases = [
      "Querying blotter records...",
      "Running spatial clustering...",
      "Computing forecasts...",
      ...crimes.map((c) => `Assessing ${CRIME_DISPLAY[c] || c}...`),
      "Finalizing assessment...",
    ];

    let phaseIndex = 0;
    setAssessmentPhase(phases[0]);
    const phaseInterval = setInterval(() => {
      phaseIndex = Math.min(phaseIndex + 1, phases.length - 1);
      setAssessmentPhase(phases[phaseIndex]);
    }, 3200);

    try {
      setIsGeneratingAssessment(true);

      const payload = {
        barangays: appliedFilters.barangays || [],
        crime_types: appliedFilters.crimeTypes || [],
        date_from: appliedFilters.dateFrom,
        date_to: appliedFilters.dateTo,
        mode: getAssessmentMode(appliedFilters.dateTo),
      };

      const response = await fetch(`${AI_API}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || "Failed to generate assessment");
      }

      setAssessment(json.assessment);
      setAnalysisData(json.analysis);
      console.log("AI assessment response:", json);
    } catch (err) {
      console.error("Generate assessment error:", err);
      const msg = err.message || "";
      const isRateLimit =
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("quota") ||
        msg.includes("limit");
      setAiErrorMessage(
        isRateLimit
          ? "The AI service has reached its daily request limit. Please try again tomorrow (resets at 8:00 AM Philippine Time)."
          : "Something went wrong while generating the assessment. Please try again in a few moments.",
      );
      setShowAiErrorModal(true);
    } finally {
      clearInterval(phaseInterval);
      setAssessmentPhase("");
      setIsGeneratingAssessment(false);
    }
  };

  const handleGenerateAssessment = () => {
    if (isLoading || !dashData.summary.length) return;

    const dayCount = Math.round(
      (new Date(appliedFilters.dateTo) - new Date(appliedFilters.dateFrom)) /
        86400000,
    );

    if (dayCount < 180) {
      setPendingDayCount(dayCount);
      setShowShortRangeModal(true);
      return;
    }

    runAssessment();
  };

  return (
    <div className="content-area">
      {/* PDF Preview Modal */}
      {pdfPreview && (
        <PdfPreviewModal
          blobUrl={pdfPreview.blobUrl}
          onDownload={() => {
            pdfPreview.download();
            closePreview();
          }}
          onClose={closePreview}
        />
      )}

      <LoadingModal isOpen={isLoading} message="Loading crime data..." />
      <LoadingModal isOpen={isExportLoading} message="Preparing export..." />

      <div className="cd-page-header">
        <div className="cd-page-header-left">
          <h1>Crime Dashboard</h1>
          <p>
            Index Crime Statistics &nbsp;·&nbsp;
            <span className="cd-date-range-label">
              {fmtDate(appliedFilters.dateFrom)} —{" "}
              {fmtDate(appliedFilters.dateTo)}
            </span>
          </p>
        </div>
        {!isBarangayUser && (
          <button
            className="cd-export-btn"
            onClick={exportDoc}
            disabled={isExporting || isLoading}
          >
            {isExporting ? (
              <>
                {/* <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="psch-btn-icon psch-spin"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg> */}
                Exporting…
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="psch-btn-icon"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export PDF
              </>
            )}
          </button>
        )}
      </div>

      <FilterBar
        appliedFilters={appliedFilters}
        onApply={handleApply}
        isBarangayUser={isBarangayUser}
        userBarangay={userBarangay}
        isPatrol={isPatrol}
        hasPatrolAssignment={hasPatrolAssignment}
        patrolAssignedBarangays={patrolAssignedBarangays}
      />

      <SummaryCards
        data={dashData.summary}
        prevSummary={dashData.prevSummary}
        isThisMonth={appliedFilters.preset === "this_month"}
      />

      <IndexCrimeTable
        data={dashData.summary}
        selectedCrimes={appliedFilters.crimeTypes}
        prevSummary={dashData.prevSummary}
        isThisMonth={appliedFilters.preset === "this_month"}
      />

      <div ref={chartRefs.caseStatus}>
        <CaseStatusChart
          data={dashData.summary}
          selectedCrimes={appliedFilters.crimeTypes}
        />
      </div>

      <div ref={chartRefs.trends}>
        <CrimeTrends appliedFilters={appliedFilters} data={dashData.trends} />
      </div>

      <div ref={chartRefs.clock}>
        <CrimeClock data={dashData.hourly} />
      </div>

      <div className="cd-charts-two-col cd-charts-row-modus">
        <div ref={chartRefs.byDay}>
          <CrimeByDay data={dashData.byDay} />
        </div>
        <div ref={chartRefs.modus}>
          <ModusChart
            data={dashData.modus}
            crimeTypes={appliedFilters.crimeTypes}
          />
        </div>
      </div>

      <div className="cd-charts-two-col">
        <div ref={chartRefs.place}>
          <PlaceOfCommission data={dashData.place} />
        </div>
        {!isBarangayUser && (
          <div ref={chartRefs.barangay}>
            <BarangayTable data={dashData.barangay} />
          </div>
        )}
      </div>

      <div
        className="cd-ai-section"
        style={{ display: isAdmin ? undefined : "none" }}
      >
        {!assessment && (
          <div className="cd-ai-generate-wrap">
            {!isGeneratingAssessment ? (
              <>
                <button
                  className="cd-generate-btn"
                  onClick={handleGenerateAssessment}
                  disabled={isLoading || !dashData.summary.length}
                >
                  Generate Assessment
                </button>
                <p className="cd-ai-helper-text">
                  Generates an AI-powered EMPO QUAD assessment based on current
                  filters.{" "}
                  <b>
                    More historical data improves forecast confidence and trend
                    accuracy.
                  </b>
                  <br />
                  <span className="cd-ai-forecast-note">
                    ⓘ Trend sparklines and forecasts use all available
                    historical weekly data — not just the selected date range —
                    to ensure reliable Croston forecast predictions.
                  </span>
                </p>
              </>
            ) : (
              <div className="cd-ai-loading-wrap">
                <div className="cd-ai-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <p className="cd-ai-phase-text">{assessmentPhase}</p>
              </div>
            )}
          </div>
        )}

        {assessment && (
          <div className="cd-ai-card">
            <div className="cd-ai-card-header">
              <div>
                <h3>{assessment.title || "AI Crime Assessment"}</h3>
                <p>
                  Generated:{" "}
                  {assessment.generatedAt
                    ? new Date(assessment.generatedAt).toLocaleString()
                    : "Just now"}
                </p>
              </div>
              <span className="cd-ai-badge">AI Output</span>
            </div>

            {assessment.scope && (
              <div className="cd-ai-scope">
                <div className="cd-ai-scope-item">
                  <span className="cd-ai-scope-label">Date Range</span>
                  <span className="cd-ai-scope-value">
                    {assessment.scope.dateRange || "-"}
                  </span>
                </div>
                <div className="cd-ai-scope-item">
                  <span className="cd-ai-scope-label">Crime Type</span>
                  <span className="cd-ai-scope-value">
                    {assessment.scope.crimes || "-"}
                  </span>
                </div>
                <div className="cd-ai-scope-item">
                  <span className="cd-ai-scope-label">Barangay</span>
                  <span className="cd-ai-scope-value">
                    {assessment.scope.barangays || "-"}
                  </span>
                </div>
              </div>
            )}

            {assessment.stats && (
              <div className="cd-ai-stat-row">
                <div className="cd-ai-stat-box">
                  <strong>{assessment.stats.total ?? 0}</strong>
                  <span>Total Incidents</span>
                </div>
                <div className="cd-ai-stat-box">
                  <strong>{assessment.stats.cce ?? "0.0"}%</strong>
                  <span>CCE</span>
                </div>
                <div className="cd-ai-stat-box">
                  <strong>{assessment.stats.cse ?? "0.0"}%</strong>
                  <span>CSE</span>
                </div>
                <div className="cd-ai-stat-box">
                  <strong>{assessment.stats.ui ?? 0}</strong>
                  <span>Under Investigation</span>
                </div>
              </div>
            )}

            <div className="cd-ai-block">
              <h4>Overall Assessment</h4>
              <p>
                {assessment.overall_assessment || "No assessment generated."}
              </p>
            </div>

            {(assessment.per_crime || []).map((crime, idx) => (
              <div key={idx} className="cd-ai-block cd-ai-crime-block">
                <h4>{crime.crime_type}</h4>

                {(() => {
                  const crimeForecast = analysisData?.croston?.per_crime?.find(
                    (c) => c.crime === crime.crime_type,
                  );
                  const forecastState =
                    crimeForecast?.forecast_state || "insufficient";
                  if (forecastState === "insufficient") return null;
                  return (
                    <TrendSparkline
                      crimeType={crime.crime_type}
                      weeklyRows={analysisData?.historical_weekly_rows}
                      linregData={analysisData?.croston}
                      mode={analysisData?.mode}
                      forecastState={forecastState}
                    />
                  );
                })()}

                <div className="cd-ai-quad-item">
                  <span className="cd-ai-quad-label">Crime Assessment</span>
                  <p>{crime.crime_assessment}</p>
                </div>

                <div className="cd-ai-quad-item">
                  <span className="cd-ai-quad-label">Operations</span>
                  <p>
                    {crime.operations
                      .split("\n")
                      .filter(Boolean)
                      .map((line, i) => (
                        <span
                          key={i}
                          style={{ display: "block", marginBottom: "6px" }}
                        >
                          {line.replace(/\*\*/g, "")}
                        </span>
                      ))}
                  </p>
                </div>

                <div className="cd-ai-quad-item">
                  <span className="cd-ai-quad-label">Intelligence</span>
                  <p>{crime.intelligence}</p>
                </div>

                <div className="cd-ai-quad-item">
                  <span className="cd-ai-quad-label">Investigations</span>
                  <p>{crime.investigations}</p>
                </div>

                <div className="cd-ai-quad-item">
                  <span className="cd-ai-quad-label">
                    Police Community Relations
                  </span>
                  <p>{crime.police_community_relations}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showAiErrorModal && (
        <div className="cd-ai-error-overlay">
          <div className="cd-ai-error-modal">
            <div className="cd-ai-error-icon">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3>Assessment Unavailable</h3>
            <p>{aiErrorMessage}</p>
            <button onClick={() => setShowAiErrorModal(false)}>Got it</button>
          </div>
        </div>
      )}

      {showShortRangeModal && (
        <ShortRangeWarningModal
          dayCount={pendingDayCount}
          onCancel={() => setShowShortRangeModal(false)}
          onConfirm={() => {
            setShowShortRangeModal(false);
            runAssessment();
          }}
        />
      )}

      {errorMessage && (
        <div className="cd-toast cd-toast-error">
          <div className="cd-toast-content">
            <svg
              className="cd-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrimeDashboard;
