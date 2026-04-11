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
  { label: "Last 7 days", key: "7d" },
  { label: "Last 30 days", key: "30d" },
  { label: "Last 3 months", key: "3m" },
  { label: "Last 1 year", key: "365d" },
  { label: "Custom", key: "custom" },
];

const getPresetRange = (key) => {
  const t = todayIso();
  if (key === "7d") return { from: offsetDate(-6), to: t };
  if (key === "30d") return { from: offsetDate(-29), to: t };
  if (key === "3m") {
    const now = new Date();
    const phtMs = now.getTime() + 8 * 60 * 60 * 1000;
    const phtToday = new Date(phtMs);
    const threeMonthsAgo = new Date(phtToday);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return { from: threeMonthsAgo.toISOString().slice(0, 10), to: t };
  }
  if (key === "365d") {
    const now = new Date();
    const phtMs = now.getTime() + 8 * 60 * 60 * 1000;
    const phtToday = new Date(phtMs);
    const from = new Date(phtToday);
    from.setFullYear(from.getFullYear() - 1);
    from.setDate(from.getDate() + 1); // fix off-by-one
    return { from: from.toISOString().slice(0, 10), to: t };
  }
  // if (key === "365d") return { from: offsetDate(-364), to: t };
  return null;
};

const getGranularity = (preset, dateFrom, dateTo) => {
  if (preset === "7d") return "daily";
  if (preset === "30d") return "weekly";
  if (preset === "3m") return "weekly";
  if (preset === "365d") return "monthly";

  const days =
    Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;

  if (days <= 16) return "daily";
  if (days <= 112) return "weekly";
  return "monthly";
};

const granularityLabel = (g) =>
  g === "daily"
    ? "Daily"
    : g === "bidaily"
      ? "Every 2 Days"
      : g === "weekly"
        ? "Weekly"
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
  p.set("preset", filters.preset);
  return `?${p}`;
};

const BLANK_FILTERS = () => {
  const range = getPresetRange("365d");
  return {
    preset: "365d",
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
  completeData: [], // ← add this
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
          <span className="cd-brgy-ms-placeholder">All Crimes</span>
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
                +{selected.length - 2} more
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

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = CURRENT_BARANGAYS.filter((b) =>
    b.toLowerCase().includes(search.toLowerCase()),
  );

  const allSelected = selected.length === CURRENT_BARANGAYS.length;

  const toggle = (b) =>
    onChange(
      selected.includes(b) ? selected.filter((x) => x !== b) : [...selected, b],
    );

  const removeOne = (b, e) => {
    e.stopPropagation();
    onChange(selected.filter((x) => x !== b));
  };

  const toggleAll = () => onChange(allSelected ? [] : [...CURRENT_BARANGAYS]);
  const isAll = selected.length === 0;

  return (
    <div className="cd-brgy-ms-wrap" ref={ref}>
      <div className="cd-brgy-ms-trigger" onClick={() => setOpen((v) => !v)}>
        {isAll ? (
          <span className="cd-brgy-ms-placeholder">All Barangays</span>
        ) : (
          <div className="cd-brgy-ms-pills">
            {selected.slice(0, 3).map((b) => (
              <span key={b} className="cd-brgy-pill">
                {formatBarangayLabel(b)}
                <span className="cd-pill-x" onClick={(e) => removeOne(b, e)}>
                  ×
                </span>
              </span>
            ))}
            {selected.length > 3 && (
              <span className="cd-brgy-pill cd-pill-more">
                +{selected.length - 3} more
              </span>
            )}
          </div>
        )}
        <span className="cd-brgy-ms-arrow">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="cd-brgy-ms-dropdown">
          <div className="cd-brgy-ms-search-row">
            <input
              className="cd-brgy-ms-search"
              placeholder="Search barangay…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

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
            {filtered.map((b) => (
              <label key={b} className="cd-brgy-ms-item">
                <input
                  type="checkbox"
                  checked={selected.includes(b)}
                  onChange={() => toggle(b)}
                />
                <span>{formatBarangayLabel(b)}</span>
              </label>
            ))}

            {filtered.length === 0 && (
              <div className="cd-brgy-ms-empty">No results</div>
            )}

            <div className="cd-brgy-ms-group-label">
              ── Pre-2023 Names (Auto-resolved) ──
            </div>

            {LEGACY_BARANGAY_OPTIONS.filter((o) =>
              o.label.toLowerCase().includes(search.toLowerCase()),
            ).map((o, idx) => (
              <label
                key={`legacy-${idx}`}
                className="cd-brgy-ms-item cd-brgy-ms-item-legacy"
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
    onApply(base);
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(appliedFilters);
  const isDefault =
    draft.preset === "365d" &&
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
          <span className="cd-filter-icon">⚙</span>
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
              {isBarangayUser && userBarangay ? (
                <div className="cd-brgy-locked">
                  <span className="cd-brgy-pill">
                    {formatBarangayLabel(userBarangay)}
                  </span>
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

const SummaryCards = ({ data }) => {
  const t = {
    total: data.reduce((s, d) => s + d.total, 0),
    cleared: data.reduce((s, d) => s + d.cleared, 0),
    solved: data.reduce((s, d) => s + d.solved, 0),
    ui: data.reduce((s, d) => s + d.underInvestigation, 0),
  };

  const cards = [
    {
      label: "Total Incidents",
      value: t.total,
      color: "blue",
      sub: "Index crimes",
    },
    {
      label: "CCE %",
      value: `${pct(t.cleared + t.solved, t.total)}%`,
      color: "indigo",
      sub: `${t.cleared} cleared`,
    },
    {
      label: "CSE %",
      value: `${pct(t.solved, t.total)}%`,
      color: "green",
      sub: `${t.solved} solved`,
    },
    {
      label: "Under Investigation",
      value: t.ui,
      color: "amber",
      sub: "Pending resolution",
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
          </div>
        );
      })}
    </div>
  );
};

// ─── INDEX CRIME TABLE ────────────────────────────────────────────────────────
const IndexCrimeTable = ({ data, selectedCrimes }) => {
  const [sortCol, setSortCol] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

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
            : "All index crimes"}{" "}
        </span>
      </div>

      <div className="cd-table-wrapper">
        <table className="cd-crime-table">
          <thead>
            <tr>
              <th>Index Crime</th>
              <SortTh col="total">Total</SortTh>
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
              return (
                <tr key={i}>
                  <td className="cd-crime-name">
                    {CRIME_DISPLAY[row.crime] || row.crime}
                  </td>
                  <td className="cd-num-cell">{row.total}</td>
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
    .filter((p) => p.value !== undefined)
    .sort((a, b) => b.value - a.value);

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
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 2,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: p.name === "Total" ? 10 : 8,
                height: p.name === "Total" ? 10 : 8,
                borderRadius: "50%",
                background: p.color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: "#374151",
                fontWeight: p.name === "Total" ? 700 : 400,
              }}
            >
              {CRIME_LABEL[p.name] || p.name}
            </span>
          </span>
          <strong
            style={{
              color: p.name === "Total" ? "#0a1628" : "#1e3a5f",
            }}
          >
            {p.value}
          </strong>
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

  const [mode, setMode] = useState("total");
  const [hiddenCrimes, setHiddenCrimes] = useState(new Set());

  const handleModeSwitch = (m) => {
    setMode(m);
    setHiddenCrimes(new Set());
  };

  const toggleCrime = (key) =>
    setHiddenCrimes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allCrimesVisible = activeCrimes.every((c) => !hiddenCrimes.has(c));
  const toggleAllCrimes = () =>
    setHiddenCrimes(allCrimesVisible ? new Set(activeCrimes) : new Set());

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

      <div className="cd-trends-modebar">
        <div className="cd-trends-segment">
          <button
            className={`cd-trends-seg-btn ${mode === "total" ? "cd-trends-seg-btn-active" : ""}`}
            onClick={() => handleModeSwitch("total")}
          >
            Total
          </button>
          <button
            className={`cd-trends-seg-btn ${mode === "crime" ? "cd-trends-seg-btn-active" : ""}`}
            onClick={() => handleModeSwitch("crime")}
          >
            By Crime
          </button>
        </div>

        {mode === "crime" && (
          <div className="cd-trends-crime-pills">
            <button className="cd-trends-showall-btn" onClick={toggleAllCrimes}>
              {allCrimesVisible ? "Hide All" : "Show All"}
            </button>
            {activeCrimes.map((key) => {
              const hidden = hiddenCrimes.has(key);
              return (
                <button
                  key={key}
                  className={`cd-trends-crime-pill ${hidden ? "cd-trends-crime-pill-off" : ""}`}
                  onClick={() => toggleCrime(key)}
                >
                  <span
                    className="cd-trends-pill-dot"
                    style={{
                      background: hidden ? "#d1d5db" : CRIME_COLORS[key],
                    }}
                  />
                  {CRIME_LABEL[key]}
                </button>
              );
            })}
          </div>
        )}
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
              hide={mode !== "total"}
            />

            {activeCrimes.map((key) => (
              <Line
                key={key}
                type="linear"
                dataKey={key}
                stroke={CRIME_COLORS[key]}
                strokeWidth={1.8}
                dot={
                  data.length <= 24
                    ? { r: 3, fill: CRIME_COLORS[key], strokeWidth: 0 }
                    : false
                }
                activeDot={{ r: 4, fill: CRIME_COLORS[key] }}
                hide={mode !== "crime" || hiddenCrimes.has(key)}
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
        Reported: <strong>{payload[0].value}</strong>
      </div>
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
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            formatter={(v) => [v, "Reported"]}
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
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
              formatter={(v) => [v, "Incidents"]}
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

// ─── PLACE OF COMMISSION ──────────────────────────────────────────────────────
const PlaceOfCommission = ({ data }) => {
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

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

  return (
    <div className="cd-chart-card cd-flex-col cd-table-fixed-height">
      <div className="cd-chart-card-header">
        <h3>Place of Commission</h3>
        <span className="cd-chart-subtitle">Click count to sort</span>
      </div>

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
            <tr key={i}>
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

  const SortIcon = ({ col }) => (
    <span
      className="cd-sort-icon"
      style={{ color: "rgba(255,255,255,0.7)", marginLeft: 3 }}
    >
      {sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : "⇅"}
    </span>
  );

  return (
    <div className="cd-chart-card cd-flex-col cd-table-fixed-height">
      <div className="cd-chart-card-header">
        <h3>Barangay Incidents</h3>
        <span className="cd-chart-subtitle">
          {data.length} barangay{data.length !== 1 ? "s" : ""} with incidents ·
          Click column to sort
        </span>
      </div>

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
            <tr key={i}>
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
const TrendSparkline = ({ crimeType, weeklyRows, linregData, mode }) => {
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
    !lr || lr?.predicted_next_week === null || lr?.confidence === 0;

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
            ⚠ Only {crimeRows.length} incident week{crimeRows.length !== 1 ? "s" : ""} recorded — trend and forecast may not be reliable
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
          <Line
            type="linear"
            dataKey="predicted"
            stroke="#f59e0b"
            strokeWidth={0}
            dot={{ r: 5, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 6 }}
          />
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
  const userBarangay = currentUser?.assigned_barangay_code ?? null;

  const BLANK_FILTERS_FOR_USER = () => {
    const base = BLANK_FILTERS();
    if (isBarangayUser && userBarangay) {
      base.barangays = [userBarangay];
    }
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

  const fetchIdRef = useRef(0);

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
  const { exportDoc, isExporting } = useExportDashboard(
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
            completeData: json.completeData ?? [], // ← add this
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
    const defaults = BLANK_FILTERS_FOR_USER();

    if (isCacheValid(defaults)) {
      setDashData(_cache.data);
      setIsLoading(false);
    } else {
      fetchOverview(defaults);
    }
  }, []);

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
    if (isBarangayUser && userBarangay) {
      newFilters.barangays = [userBarangay];
    }
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

  const handleGenerateAssessment = async () => {
    if (isLoading || !dashData.summary.length) return;

    // Warn if date range is short — but don't block
    const dayCount = Math.round(
      (new Date(appliedFilters.dateTo) - new Date(appliedFilters.dateFrom)) /
        86400000,
    );
    if (dayCount < 180) {
      const proceed = window.confirm(
        `Your selected range is only ${dayCount} days.\n\n` +
          `Short ranges may result in low forecast confidence for some crime types.\n\n` +
          `The EMPO QUAD recommendations will still work, but trend forecasts may show "insufficient data" warnings per crime type.\n\n` +
          `Continue anyway?`,
      );
      if (!proceed) return;
    }

    // Start phase cycling
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

  return (
    <div className="content-area">
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
            {isExporting ? "Exporting..." : "Export"}
          </button>
        )}
      </div>

      <FilterBar
        appliedFilters={appliedFilters}
        onApply={handleApply}
        isBarangayUser={isBarangayUser}
        userBarangay={userBarangay}
      />

      <SummaryCards data={dashData.summary} />

      <IndexCrimeTable
        data={dashData.summary}
        selectedCrimes={appliedFilters.crimeTypes}
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
        style={{ display: isBarangayUser ? "none" : undefined }}
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
              <h4>General Assessment</h4>
              <p>
                {assessment.general_assessment || "No assessment generated."}
              </p>
            </div>

            {(assessment.per_crime || []).map((crime, idx) => (
              <div key={idx} className="cd-ai-block cd-ai-crime-block">
                <h4>{crime.crime_type}</h4>

                <TrendSparkline
                  crimeType={crime.crime_type}
                  weeklyRows={analysisData?.historical_weekly_rows}
                  linregData={analysisData?.croston}
                  mode={analysisData?.mode}
                />

                <div className="cd-ai-quad-item">
                  <span className="cd-ai-quad-label">Crime Assessment</span>
                  <p>{crime.general_assessment}</p>
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
