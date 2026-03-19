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

const API      = `${import.meta.env.VITE_API_URL}/crime-dashboard`;
const getToken = () => localStorage.getItem("token");

const formatBarangayLabel = (name) => {
  const ROMAN = new Set([
    "I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII",
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
  "MURDER","HOMICIDE","PHYSICAL INJURIES","RAPE",
  "ROBBERY","THEFT","CARNAPPING - MC","CARNAPPING - MV","SPECIAL COMPLEX CRIME",
];
const CRIME_DISPLAY = {
  MURDER: "Murder", HOMICIDE: "Homicide", "PHYSICAL INJURIES": "Physical Injuries",
  RAPE: "Rape", ROBBERY: "Robbery", THEFT: "Theft",
  "CARNAPPING - MC": "Carnapping - MC", "CARNAPPING - MV": "Carnapping - MV",
  "SPECIAL COMPLEX CRIME": "Special Complex Crime",
};
const CRIME_SHORT = {
  MURDER: "Murder", HOMICIDE: "Homicide", "PHYSICAL INJURIES": "Phys. Inj.",
  RAPE: "Rape", ROBBERY: "Robbery", THEFT: "Theft",
  "CARNAPPING - MC": "Carnap MC", "CARNAPPING - MV": "Carnap MV",
  "SPECIAL COMPLEX CRIME": "Spec. Cmplx",
};
const CRIME_LABEL = {
  Total: "Total", MURDER: "Murder", HOMICIDE: "Homicide",
  "PHYSICAL INJURIES": "Phys. Inj.", RAPE: "Rape", ROBBERY: "Robbery",
  THEFT: "Theft", "CARNAPPING - MC": "Carnap MC", "CARNAPPING - MV": "Carnap MV",
  "SPECIAL COMPLEX CRIME": "Spec. Cmplx",
};
const CRIME_COLORS = {
  Total: "#0a1628", MURDER: "#ef4444", HOMICIDE: "#f97316",
  "PHYSICAL INJURIES": "#eab308", RAPE: "#a855f7", ROBBERY: "#ec4899",
  THEFT: "#14b8a6", "CARNAPPING - MC": "#3b82f6", "CARNAPPING - MV": "#6366f1",
  "SPECIAL COMPLEX CRIME": "#84cc16",
};

const PLACE_PAGE_SIZE  = 10;
const BRGY_PAGE_SIZE   = 10;
const MODUS_PAGE_SIZE  = 10;
const CHART_ROW_HEIGHT = 480;

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString().slice(0, 10);
const offsetDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const PRESETS = [
  { label: "Last 7 days",   key: "7d"     },
  { label: "Last 30 days",  key: "30d"    },
  { label: "Last 3 months", key: "3m"     },
  { label: "Last 365 days", key: "365d"   },
  { label: "Custom",        key: "custom" },
];

const getPresetRange = (key) => {
  const t = todayIso();
  if (key === "7d")   return { from: offsetDate(-6),   to: t };
  if (key === "30d")  return { from: offsetDate(-29),  to: t };
  if (key === "3m")   return { from: offsetDate(-90),  to: t }; // 91 days = 13 weekly points
  if (key === "365d") return { from: offsetDate(-364), to: t };
  return null;
};

const getGranularity = (preset, dateFrom, dateTo) => {
  if (preset === "7d")   return "daily";
  if (preset === "30d")  return "bidaily";  // every 2 days → 15 points
  if (preset === "3m")   return "weekly";
  if (preset === "365d") return "monthly";
  // Custom: pick granularity that keeps point count between 7 and 16
  const days = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
  if (days <= 16)  return "daily";          // 7–16 days   → 7–16 daily points
  if (days <= 112) return "weekly";         // 17–112 days → 3–16 weekly points
  return "monthly";                         // 113+ days   → monthly
};

const granularityLabel = (g) =>
  g === "daily"   ? "Daily"
  : g === "bidaily" ? "Every 2 Days"
  : g === "weekly"  ? "Weekly"
  : "Monthly";

// ─── MISC HELPERS ─────────────────────────────────────────────────────────────
const pct     = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "0.0");
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};

/**
 * Builds the query string for /overview from a filters object.
 * Passes granularity so the backend uses the right date truncation.
 */
const buildParams = (filters) => {
  const granularity = getGranularity(filters.preset, filters.dateFrom, filters.dateTo);
  const p = new URLSearchParams();
  if (filters.dateFrom)       p.set("date_from",   filters.dateFrom);
  if (filters.dateTo)         p.set("date_to",     filters.dateTo);
  if (filters.crimeTypes?.length) p.set("crime_types", filters.crimeTypes.join(","));
  if (filters.barangays?.length)  p.set("barangays",   filters.barangays.join(","));
  p.set("granularity", granularity);
  p.set("preset",      filters.preset);  // backend uses this to thin 30d to 15 pts
  return `?${p}`;
};

const BLANK_FILTERS = () => {
  const range = getPresetRange("365d");
  return {
    preset:     "365d",
    dateFrom:   range.from,
    dateTo:     range.to,
    crimeTypes: [],
    barangays:  [],
  };
};

const EMPTY_DASHBOARD = () => ({
  summary:  [],
  trends:   [],
  hourly:   [],
  byDay:    [],
  place:    [],
  barangay: [],
  modus:    [],
});

// ─── SMALL LABEL COMPONENTS ───────────────────────────────────────────────────
const HBarLabel = ({ x, y, width, height, value }) => {
  if (!value) return null;
  return (
    <text x={x + width + 5} y={y + height / 2 + 4}
      fill="#374151" fontSize={11} fontWeight={600}>{value}</text>
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

  const toggle    = (c) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const removeOne = (c, e) => { e.stopPropagation(); onChange(selected.filter((x) => x !== c)); };
  const toggleAll = () => onChange(selected.length === INDEX_CRIMES.length ? [] : [...INDEX_CRIMES]);
  const isAll       = selected.length === 0;
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
                <span className="cd-pill-x" onClick={(e) => removeOne(c, e)}>×</span>
              </span>
            ))}
            {selected.length > 2 && (
              <span className="cd-brgy-pill cd-pill-more">+{selected.length - 2} more</span>
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
              <button onClick={() => onChange([])} className="cd-brgy-ms-action-btn cd-brgy-ms-clear">
                Clear ({selected.length})
              </button>
            )}
          </div>
          <div className="cd-brgy-ms-list">
            {INDEX_CRIMES.map((c) => (
              <label key={c} className="cd-brgy-ms-item">
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} />
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
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered    = CURRENT_BARANGAYS.filter((b) => b.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === CURRENT_BARANGAYS.length;
  const toggle      = (b) => onChange(selected.includes(b) ? selected.filter((x) => x !== b) : [...selected, b]);
  const removeOne   = (b, e) => { e.stopPropagation(); onChange(selected.filter((x) => x !== b)); };
  const toggleAll   = () => onChange(allSelected ? [] : [...CURRENT_BARANGAYS]);
  const isAll       = selected.length === 0;

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
                <span className="cd-pill-x" onClick={(e) => removeOne(b, e)}>×</span>
              </span>
            ))}
            {selected.length > 3 && (
              <span className="cd-brgy-pill cd-pill-more">+{selected.length - 3} more</span>
            )}
          </div>
        )}
        <span className="cd-brgy-ms-arrow">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="cd-brgy-ms-dropdown">
          <div className="cd-brgy-ms-search-row">
            <input className="cd-brgy-ms-search" placeholder="Search barangay…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()} />
          </div>
          <div className="cd-brgy-ms-actions">
            <button onClick={toggleAll} className="cd-brgy-ms-action-btn">
              {allSelected ? "Clear all" : "Select all"}
            </button>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="cd-brgy-ms-action-btn cd-brgy-ms-clear">
                Clear ({selected.length})
              </button>
            )}
          </div>
          <div className="cd-brgy-ms-list">
            {filtered.map((b) => (
              <label key={b} className="cd-brgy-ms-item">
                <input type="checkbox" checked={selected.includes(b)} onChange={() => toggle(b)} />
                <span>{formatBarangayLabel(b)}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className="cd-brgy-ms-empty">No results</div>}
            <div className="cd-brgy-ms-group-label">── Pre-2023 Names (Auto-resolved) ──</div>
            {LEGACY_BARANGAY_OPTIONS
              .filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
              .map((o, idx) => (
                <label key={`legacy-${idx}`} className="cd-brgy-ms-item cd-brgy-ms-item-legacy">
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
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
/**
 * FilterBar owns its own draft state.
 * - Clicking "Apply Filters" calls onApply(draft) — parent fetches.
 * - Clicking reset calls onApply(BLANK_FILTERS()) — parent fetches.
 * - draft never escapes to the parent until the user explicitly commits it.
 */
const FilterBar = ({ appliedFilters, onApply }) => {
  const [expanded,  setExpanded]  = useState(true);
  const [draft,     setDraft]     = useState(() => ({ ...appliedFilters }));
  const [dateError, setDateError] = useState("");

  // Sync draft when parent resets (reference identity change signals a reset)
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
      setDraft((f) => ({ ...f, preset: key, dateFrom: range.from, dateTo: range.to }));
      setDateError("");
    }
  };

  const validateDates = (from, to) => {
    if (!from || !to)  return "Please select both start and end dates.";
    if (from >= to)    return "Start date must be before end date.";
    const days = Math.round((new Date(to) - new Date(from)) / 86400000);
    if (days < 7)      return "Custom range must be at least 7 days.";
    return "";
  };

  const handleDateFrom = (val) => {
    setDraft((f) => ({ ...f, dateFrom: val }));
    setDateError(validateDates(val, draft.dateTo));
  };
  const handleDateTo = (val) => {
    setDraft((f) => ({ ...f, dateTo: val }));
    setDateError(validateDates(draft.dateFrom, val));
  };

  const handleApply = () => {
    if (draft.preset === "custom") {
      const err = validateDates(draft.dateFrom, draft.dateTo);
      if (err) { setDateError(err); return; }
    }
    setDateError("");
    onApply({ ...draft });
  };

  const handleReset = () => {
    setDateError("");
    onApply(BLANK_FILTERS()); // pass fresh object directly — parent fetches immediately
  };

  const isDirty   = JSON.stringify(draft) !== JSON.stringify(appliedFilters);
  const isDefault = draft.preset === "365d" && !draft.crimeTypes.length && !draft.barangays.length;

  return (
    <div className={`cd-filter-bar ${expanded ? "cd-expanded" : "cd-collapsed"}`}>
      <div className="cd-filter-bar-header" onClick={() => setExpanded((v) => !v)}>
        <div className="cd-filter-bar-title">
          <span className="cd-filter-icon">⚙</span>
          <span>Filters &amp; Options</span>
          {!expanded && !isDefault && (
            <span className="cd-filter-active-count">filtered</span>
          )}
        </div>
        <button
          className="cd-filter-toggle-btn"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
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
                <button key={p.key}
                  className={`cd-preset-btn ${draft.preset === p.key ? "cd-preset-btn-active" : ""}`}
                  onClick={() => handlePreset(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            {draft.preset === "custom" && (
              <div className="cd-custom-range-wrap">
                <div className="cd-custom-range">
                  <input type="date" value={draft.dateFrom}
                    max={draft.dateTo ? (() => {
                      const d = new Date(draft.dateTo);
                      d.setDate(d.getDate() - 7);
                      return d.toISOString().slice(0, 10);
                    })() : todayIso()}
                    onChange={(e) => handleDateFrom(e.target.value)} />
                  <span className="cd-range-sep">→</span>
                  <input type="date" value={draft.dateTo}
                    min={draft.dateFrom ? (() => {
                      const d = new Date(draft.dateFrom);
                      d.setDate(d.getDate() + 7);
                      return d.toISOString().slice(0, 10);
                    })() : undefined}
                    max={todayIso()}
                    onChange={(e) => handleDateTo(e.target.value)} />
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
              <label>Incident Type</label>
              <CrimeTypeMultiSelect
                selected={draft.crimeTypes}
                onChange={(val) => setDraft((f) => ({ ...f, crimeTypes: val }))}
              />
            </div>
            <div className="cd-filter-group">
              <label>Barangay</label>
              <BarangayMultiSelect
                selected={draft.barangays}
                onChange={(val) => setDraft((f) => ({ ...f, barangays: val }))}
              />
            </div>
            <div className="cd-filter-group-actions">
              <button
                className={`cd-apply-btn ${isDirty ? "cd-apply-btn-dirty" : ""}`}
                onClick={handleApply}>
                Apply Filters
              </button>
              <button className="cd-reset-btn" onClick={handleReset} title="Reset to defaults">
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
const CARD_ICONS = { blue: FileText, green: Unlock, teal: CheckSquare, amber: Search };

const SummaryCards = ({ data }) => {
  const t = {
    total:   data.reduce((s, d) => s + d.total,              0),
    cleared: data.reduce((s, d) => s + d.cleared,            0),
    solved:  data.reduce((s, d) => s + d.solved,             0),
    ui:      data.reduce((s, d) => s + d.underInvestigation, 0),
  };
  const cards = [
    { label: "Total Incidents",     value: t.total,                       color: "blue",  sub: "Index crimes"         },
    { label: "CCE %",               value: `${pct(t.cleared, t.total)}%`, color: "green", sub: `${t.cleared} cleared` },
    { label: "CSE %",               value: `${pct(t.solved,  t.total)}%`, color: "teal",  sub: `${t.solved} solved`   },
    { label: "Under Investigation", value: t.ui,                          color: "amber", sub: "Pending resolution"   },
  ];
  return (
    <div className="cd-summary-cards">
      {cards.map((c, i) => {
        const Icon = CARD_ICONS[c.color];
        return (
          <div key={i} className={`cd-summary-card cd-card-${c.color}`}>
            <div className="cd-summary-card-top">
              <div className="cd-summary-icon-wrap"><Icon size={20} strokeWidth={2} /></div>
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
    () => selectedCrimes.length > 0 ? data.filter((d) => selectedCrimes.includes(d.crime)) : data,
    [data, selectedCrimes],
  );

  const rows = useMemo(
    () => [...visibleData].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    }),
    [visibleData, sortCol, sortDir],
  );

  const tot = visibleData.reduce(
    (acc, d) => ({
      total:   acc.total   + d.total,
      cleared: acc.cleared + d.cleared,
      solved:  acc.solved  + d.solved,
      ui:      acc.ui      + d.underInvestigation,
    }),
    { total: 0, cleared: 0, solved: 0, ui: 0 },
  );

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
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
          {selectedCrimes.length > 0 ? `${rows.length} of 9 crimes shown` : "All 9 index crimes"}{" "}
          · CCE = Cleared / Total · CSE = Solved / Total
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
              <th className="cd-num-cell">CCE %</th>
              <th className="cd-num-cell">CSE %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cceVal = parseFloat(pct(row.cleared, row.total));
              const cseVal = parseFloat(pct(row.solved,  row.total));
              return (
                <tr key={i}>
                  <td className="cd-crime-name">{CRIME_DISPLAY[row.crime] || row.crime}</td>
                  <td className="cd-num-cell">{row.total}</td>
                  <td className="cd-num-cell cd-cleared">{row.cleared}</td>
                  <td className="cd-num-cell cd-solved">{row.solved}</td>
                  <td className="cd-num-cell cd-ui">{row.underInvestigation}</td>
                  <td className="cd-num-cell">
                    <span className={`cd-badge ${cceVal >= 50 ? "cd-badge-green" : "cd-badge-red"}`}>
                      {cceVal.toFixed(1)}%
                    </span>
                  </td>
                  <td className="cd-num-cell">
                    <span className={`cd-badge ${cseVal >= 50 ? "cd-badge-green" : "cd-badge-amber"}`}>
                      {cseVal.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>TOTAL</strong></td>
              <td className="cd-num-cell"><strong>{tot.total}</strong></td>
              <td className="cd-num-cell cd-cleared"><strong>{tot.cleared}</strong></td>
              <td className="cd-num-cell cd-solved"><strong>{tot.solved}</strong></td>
              <td className="cd-num-cell cd-ui"><strong>{tot.ui}</strong></td>
              <td className="cd-num-cell">
                <span className="cd-badge cd-badge-green">{pct(tot.cleared, tot.total)}%</span>
              </td>
              <td className="cd-num-cell">
                <span className="cd-badge cd-badge-green">{pct(tot.solved, tot.total)}%</span>
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
  const visibleData = selectedCrimes.length > 0
    ? data.filter((d) => selectedCrimes.includes(d.crime))
    : data;

  const rows = visibleData.map((d) => ({
    crime:        CRIME_SHORT[d.crime] || d.crime,
    Cleared:      d.cleared,
    Solved:       d.solved,
    "Under Inv.": d.underInvestigation,
    _total:       d.cleared + d.solved + d.underInvestigation,
  }));

  const TopLabelBar = (props) => {
    const { x, y, width, height, fill, radius, index } = props;
    const total = rows[index]?._total;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill}
          rx={radius?.[0] || 0} ry={radius?.[0] || 0} />
        {total > 0 && (
          <text x={x + width / 2} y={y - 6} textAnchor="middle"
            fill="#111827" fontSize={11} fontWeight={700}>{total}</text>
        )}
      </g>
    );
  };

  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header">
        <h3>Case Status per Index Crime</h3>
        <div className="cd-cs-legend">
          <span className="cd-legend-dot" style={{ background: "#22c55e" }} /> Cleared &nbsp;
          <span className="cd-legend-dot" style={{ background: "#3b82f6" }} /> Solved &nbsp;
          <span className="cd-legend-dot" style={{ background: "#f59e0b" }} /> Under Inv.
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 28, right: 16, left: 0, bottom: 52 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="crime" tick={{ fontSize: 11, fill: "#374151" }} angle={-28} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          <Bar dataKey="Cleared"    stackId="a" fill="#22c55e" maxBarSize={48} />
          <Bar dataKey="Solved"     stackId="a" fill="#3b82f6" maxBarSize={48} />
          <Bar dataKey="Under Inv." stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={48}
            shape={<TopLabelBar fill="#f59e0b" radius={[3, 3, 0, 0]} />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── CRIME TRENDS ─────────────────────────────────────────────────────────────
const TrendsTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const visible = [...payload].filter((p) => p.value !== undefined).sort((a, b) => b.value - a.value);
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
      padding: "10px 14px", fontSize: 12, maxWidth: 240,
      boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#1e3a5f",
        borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>{label}</div>
      {visible.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: p.name === "Total" ? 10 : 8, height: p.name === "Total" ? 10 : 8,
              borderRadius: "50%", background: p.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ color: "#374151", fontWeight: p.name === "Total" ? 700 : 400 }}>
              {CRIME_LABEL[p.name] || p.name}
            </span>
          </span>
          <strong style={{ color: p.name === "Total" ? "#0a1628" : "#1e3a5f" }}>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const CrimeTrends = ({ appliedFilters, data }) => {
  const granularity = useMemo(
    () => getGranularity(appliedFilters.preset, appliedFilters.dateFrom, appliedFilters.dateTo),
    [appliedFilters.preset, appliedFilters.dateFrom, appliedFilters.dateTo],
  );

  const activeCrimes = appliedFilters.crimeTypes.length > 0 ? appliedFilters.crimeTypes : INDEX_CRIMES;
  const [mode,         setMode]         = useState("total");
  const [hiddenCrimes, setHiddenCrimes] = useState(new Set());

  const handleModeSwitch = (m) => { setMode(m); setHiddenCrimes(new Set()); };
  const toggleCrime = (key) => setHiddenCrimes((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const allCrimesVisible = activeCrimes.every((c) => !hiddenCrimes.has(c));
  const toggleAllCrimes  = () => setHiddenCrimes(allCrimesVisible ? new Set(activeCrimes) : new Set());

  const dayCount = Math.round(
    (new Date(appliedFilters.dateTo) - new Date(appliedFilters.dateFrom)) / 86400000,
  ) + 1;

  const tickInterval = (() => {
    const n = data.length;
    // All standard presets have ≤ 30 points — show every label
    // 7d=7, 30d=30, 3m=13, 365d=12
    if (n <= 30) return 0;
    // Custom ranges with many points — thin out labels to avoid crowding
    if (n <= 52) return Math.floor(n / 12);
    return Math.floor(n / 12);
  })();

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Detect if the data spans multiple years so we always show the year
  const years = new Set(data.map((d) => d.label?.slice(0, 4)).filter(Boolean));
  const multiYear = years.size > 1;

  const fmtLabel = (iso) => {
    if (!iso) return "";
    if (granularity === "monthly" || granularity === "weekly") {
      const [y, m] = iso.split("-");
      const monthStr = MONTHS[parseInt(m) - 1];
      // Always show year if range spans multiple years
      return multiYear ? `${monthStr} ${y}` : monthStr;
    }
    // daily / bidaily — show MM/DD, add year if multi-year
    const [y, m, d] = iso.split("-");
    return multiYear ? `${m}/${d}/${y.slice(2)}` : `${m}/${d}`;
  };

  const chartData = data.map((d) => ({ ...d, label: fmtLabel(d.label) }));

  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header">
        <h3>Crime Trends</h3>
        <span className="cd-chart-subtitle">
          {granularityLabel(granularity)} · {data.length} points · {dayCount} day{dayCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="cd-trends-modebar">
        <div className="cd-trends-segment">
          <button className={`cd-trends-seg-btn ${mode === "total" ? "cd-trends-seg-btn-active" : ""}`}
            onClick={() => handleModeSwitch("total")}>Total</button>
          <button className={`cd-trends-seg-btn ${mode === "crime" ? "cd-trends-seg-btn-active" : ""}`}
            onClick={() => handleModeSwitch("crime")}>By Crime</button>
        </div>
        {mode === "crime" && (
          <div className="cd-trends-crime-pills">
            <button className="cd-trends-showall-btn" onClick={toggleAllCrimes}>
              {allCrimesVisible ? "Hide All" : "Show All"}
            </button>
            {activeCrimes.map((key) => {
              const hidden = hiddenCrimes.has(key);
              return (
                <button key={key}
                  className={`cd-trends-crime-pill ${hidden ? "cd-trends-crime-pill-off" : ""}`}
                  onClick={() => toggleCrime(key)}>
                  <span className="cd-trends-pill-dot"
                    style={{ background: hidden ? "#d1d5db" : CRIME_COLORS[key] }} />
                  {CRIME_LABEL[key]}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={tickInterval} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
          <Tooltip content={<TrendsTooltip />} />
          <Line type="linear" dataKey="Total" stroke={CRIME_COLORS["Total"]} strokeWidth={3}
            dot={{ r: 5, fill: CRIME_COLORS["Total"], strokeWidth: 0 }} activeDot={{ r: 5 }}
            hide={mode !== "total"} />
          {activeCrimes.map((key) => (
            <Line key={key} type="linear" dataKey={key} stroke={CRIME_COLORS[key]} strokeWidth={1.8}
              dot={{ r: 3, fill: CRIME_COLORS[key], strokeWidth: 0 }}
              activeDot={{ r: 4, fill: CRIME_COLORS[key] }}
              hide={mode !== "crime" || hiddenCrimes.has(key)} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── CRIME CLOCK ──────────────────────────────────────────────────────────────
const ClockTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
      padding: "7px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 2, color: "#1e3a5f" }}>{label}</div>
      <div>Reported: <strong>{payload[0].value}</strong></div>
    </div>
  );
};

const CrimeClock = ({ data }) => (
  <div className="cd-chart-card cd-full-width">
    <div className="cd-chart-card-header"><h3>Crime Clock — Hourly Distribution</h3></div>
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#6b7280" }} interval={1} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
        <Tooltip content={<ClockTooltip />} />
        <Line type="linear" dataKey="count" stroke="#1e3a5f" strokeWidth={2.5}
          dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

// ─── CRIME BY DAY ─────────────────────────────────────────────────────────────
const CrimeByDay = ({ data }) => {
  const chartH = CHART_ROW_HEIGHT - 64 - 40;
  return (
    <div className="cd-chart-card cd-chart-fixed-height">
      <div className="cd-chart-card-header"><h3>Crime by Day of Week</h3></div>
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 10 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 13, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={(v) => [v, "Reported"]} />
          <Bar dataKey="count" name="Reported" fill="#1e3a5f" radius={[4, 4, 0, 0]} maxBarSize={64}>
            <LabelList dataKey="count" position="top"
              style={{ fontSize: 11, fontWeight: 700, fill: "#1e3a5f" }} />
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
    const filtered = crimeTypes.length > 0
      ? data.filter((r) => crimeTypes.includes(r.crime))
      : data;
    return filtered.map((r) => ({
      ...r,
      label: crimeTypes.length === 1 ? r.modus : `${r.modus} (${CRIME_SHORT[r.crime] || r.crime})`,
    }));
  }, [data, crimeTypes]);

  useEffect(() => setPage(0), [allData]);

  const totalPages  = Math.ceil(allData.length / MODUS_PAGE_SIZE);
  const pageData    = allData.slice(page * MODUS_PAGE_SIZE, (page + 1) * MODUS_PAGE_SIZE);
  const maxLabelLen = pageData.length ? Math.max(...pageData.map((d) => d.label.length)) : 10;
  const yWidth      = Math.min(Math.max(Math.ceil(maxLabelLen * 7.0), 90), 230);
  const chartH      = CHART_ROW_HEIGHT - 64 - 45 - 40;

  return (
    <div className="cd-chart-card cd-chart-fixed-height cd-flex-col">
      <div className="cd-chart-card-header">
        <h3>Modus Operandi</h3>
        <span className="cd-chart-subtitle">
          {crimeTypes.length === 0 ? "All crimes"
            : crimeTypes.length === 1 ? CRIME_DISPLAY[crimeTypes[0]]
            : `${crimeTypes.length} crimes`}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart data={pageData} layout="vertical"
            margin={{ top: 4, right: 56, left: 0, bottom: 4 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 13, fill: "#6b7280" }} />
            <YAxis dataKey="label" type="category" tick={{ fontSize: 13, fill: "#374151" }} width={yWidth} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={(v) => [v, "Incidents"]} />
            <Bar dataKey="count" name="Incidents" radius={[0, 4, 4, 0]} maxBarSize={30}>
              {pageData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? "#1e3a5f" : "#2d4a6f"} />)}
              <LabelList content={<HBarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {totalPages > 1 && (
        <div className="cd-brgy-pagination">
          <span className="cd-brgy-page-info">
            {page * MODUS_PAGE_SIZE + 1}–{Math.min((page + 1) * MODUS_PAGE_SIZE, allData.length)} of {allData.length}
          </span>
          <div className="cd-brgy-page-btns">
            <button className="cd-page-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} className={`cd-page-btn ${page === i ? "cd-page-btn-active" : ""}`}
                onClick={() => setPage(i)}>{i + 1}</button>
            ))}
            <button className="cd-page-btn" disabled={page === totalPages - 1}
              onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PLACE OF COMMISSION ──────────────────────────────────────────────────────
const PlaceOfCommission = ({ data }) => {
  const [sortDir, setSortDir] = useState("desc");
  const [page,    setPage]    = useState(0);

  const sorted = useMemo(
    () => [...data]
      .sort((a, b) => sortDir === "desc" ? b.count - a.count : a.count - b.count)
      .map((d, i) => ({ ...d, rank: i + 1 })),
    [data, sortDir],
  );

  useEffect(() => setPage(0), [sortDir, data]);
  const totalPages = Math.ceil(sorted.length / PLACE_PAGE_SIZE);
  const pageData   = sorted.slice(page * PLACE_PAGE_SIZE, (page + 1) * PLACE_PAGE_SIZE);

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
            <th className="cd-num-cell cd-sortable"
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}>
              Count <span className="cd-sort-icon" style={{ color: "rgba(255,255,255,0.7)" }}>
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
          {page * PLACE_PAGE_SIZE + 1}–{Math.min((page + 1) * PLACE_PAGE_SIZE, sorted.length)} of {sorted.length}
        </span>
        <div className="cd-brgy-page-btns">
          <button className="cd-page-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} className={`cd-page-btn ${page === i ? "cd-page-btn-active" : ""}`}
              onClick={() => setPage(i)}>{i + 1}</button>
          ))}
          <button className="cd-page-btn" disabled={page === totalPages - 1}
            onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
        </div>
      </div>
    </div>
  );
};

// ─── BARANGAY TABLE ───────────────────────────────────────────────────────────
const BarangayTable = ({ data }) => {
  const [sortCol, setSortCol] = useState("count");
  const [sortDir, setSortDir] = useState("desc");
  const [page,    setPage]    = useState(0);

  const sorted = useMemo(
    () => [...data]
      .sort((a, b) => {
        if (sortCol === "barangay")
          return sortDir === "desc"
            ? b.barangay.localeCompare(a.barangay)
            : a.barangay.localeCompare(b.barangay);
        return sortDir === "desc" ? b.count - a.count : a.count - b.count;
      })
      .map((d, i) => ({ ...d, rank: i + 1 })),
    [data, sortCol, sortDir],
  );

  const totalPages = Math.ceil(sorted.length / BRGY_PAGE_SIZE);
  const pageData   = sorted.slice(page * BRGY_PAGE_SIZE, (page + 1) * BRGY_PAGE_SIZE);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); setPage(0); }
  };

  const SortIcon = ({ col }) => (
    <span className="cd-sort-icon" style={{ color: "rgba(255,255,255,0.7)", marginLeft: 3 }}>
      {sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : "⇅"}
    </span>
  );

  return (
    <div className="cd-chart-card cd-flex-col cd-table-fixed-height">
      <div className="cd-chart-card-header">
        <h3>Barangay Incidents</h3>
        <span className="cd-chart-subtitle">
          {data.length} barangay{data.length !== 1 ? "s" : ""} with incidents · Click column to sort
        </span>
      </div>
      <table className="cd-brgy-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="cd-sortable" onClick={() => handleSort("barangay")} style={{ textAlign: "left" }}>
              Barangay <SortIcon col="barangay" />
            </th>
            <th className="cd-num-cell cd-sortable" onClick={() => handleSort("count")}>
              Count <SortIcon col="count" />
            </th>
          </tr>
        </thead>
        <tbody>
          {pageData.map((row, i) => (
            <tr key={i}>
              <td className="cd-brgy-rank">{row.rank}</td>
              <td className="cd-brgy-name">{formatBarangayLabel(row.barangay)}</td>
              <td className="cd-num-cell cd-brgy-primary">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cd-brgy-pagination">
        <span className="cd-brgy-page-info">
          {page * BRGY_PAGE_SIZE + 1}–{Math.min((page + 1) * BRGY_PAGE_SIZE, sorted.length)} of {sorted.length}
        </span>
        <div className="cd-brgy-page-btns">
          <button className="cd-page-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} className={`cd-page-btn ${page === i ? "cd-page-btn-active" : ""}`}
              onClick={() => setPage(i)}>{i + 1}</button>
          ))}
          <button className="cd-page-btn" disabled={page === totalPages - 1}
            onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
        </div>
      </div>
    </div>
  );
};

// ─── MODULE-LEVEL CACHE ───────────────────────────────────────────────────────
// Lives outside the component so it survives unmount/remount (tab switching).
// Structure: { key: string, data: object, fetchedAt: number }
// key = serialized filters — if filters haven't changed, return cached data.
// CACHE_TTL = how long (ms) before a re-fetch is forced even with same filters.
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let _cache = null;

const getCacheKey = (filters) => JSON.stringify(filters);
const isCacheValid = (filters) =>
  _cache !== null &&
  _cache.key === getCacheKey(filters) &&
  Date.now() - _cache.fetchedAt < CACHE_TTL;

// ─── MAIN ─────────────────────────────────────────────────────────────────────
/**
 * Single fetch to GET /crime-dashboard/overview with all filter params.
 * One HTTP request → one JSON body → one setState → one render.
 * All 7 panels are always in sync because they come from the same response.
 *
 * Module-level cache prevents re-fetching on tab switch — data is reused
 * until filters change or CACHE_TTL (5 min) expires.
 */
const CrimeDashboard = () => {
  const [appliedFilters, setAppliedFilters] = useState(() => BLANK_FILTERS());
  const [dashData,       setDashData]       = useState(() =>
    // Rehydrate from cache immediately on mount so there's no flash of empty state
    _cache ? _cache.data : EMPTY_DASHBOARD()
  );
  const [isLoading, setIsLoading] = useState(() =>
    // Only show loading on mount if there's no valid cached data
    !isCacheValid(BLANK_FILTERS())
  );

  const fetchIdRef = useRef(0);

  const fetchOverview = (filters, force = false) => {
    // Return cached data immediately if valid and not forced
    if (!force && isCacheValid(filters)) {
      setDashData(_cache.data);
      setAppliedFilters(filters);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    const headers = { Authorization: `Bearer ${getToken()}` };
    const q       = buildParams(filters);

    setIsLoading(true);

    fetch(`${API}/overview${q}`, { headers })
      .then((r) => r.json())
      .then((json) => {
        if (fetchId !== fetchIdRef.current) return; // stale — discard
        if (json.success) {
          const data = {
            summary:  json.summary  ?? [],
            trends:   json.trends   ?? [],
            hourly:   json.hourly   ?? [],
            byDay:    json.byDay    ?? [],
            place:    json.place    ?? [],
            barangay: json.barangay ?? [],
            modus:    json.modus    ?? [],
          };
          // Store in module-level cache
          _cache = { key: getCacheKey(filters), data, fetchedAt: Date.now() };
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

  // On mount — use cache if valid, otherwise fetch
  useEffect(() => {
    const defaults = BLANK_FILTERS();
    if (isCacheValid(defaults)) {
      setDashData(_cache.data);
      setIsLoading(false);
    } else {
      fetchOverview(defaults);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply/Reset: always force a real fetch, bypassing cache
  const handleApply = (newFilters) => {
    setAppliedFilters(newFilters);
    fetchOverview(newFilters, true); // force = true — never use cache on explicit apply
  };

  return (
    <div className="content-area">
      <LoadingModal isOpen={isLoading} message="Loading crime data..." />

      <div className="cd-page-header">
        <div className="cd-page-header-left">
          <h1>Crime Dashboard</h1>
          <p>
            Index Crime Statistics &nbsp;·&nbsp;
            <span className="cd-date-range-label">
              {fmtDate(appliedFilters.dateFrom)} — {fmtDate(appliedFilters.dateTo)}
            </span>
          </p>
        </div>
      </div>

      <FilterBar appliedFilters={appliedFilters} onApply={handleApply} />

      <SummaryCards data={dashData.summary} />
      <IndexCrimeTable data={dashData.summary} selectedCrimes={appliedFilters.crimeTypes} />
      <CaseStatusChart data={dashData.summary} selectedCrimes={appliedFilters.crimeTypes} />
      <CrimeTrends appliedFilters={appliedFilters} data={dashData.trends} />
      <CrimeClock data={dashData.hourly} />

      <div className="cd-charts-two-col cd-charts-row-modus">
        <CrimeByDay data={dashData.byDay} />
        <ModusChart data={dashData.modus} crimeTypes={appliedFilters.crimeTypes} />
      </div>

      <div className="cd-charts-two-col">
        <PlaceOfCommission data={dashData.place} />
        <BarangayTable data={dashData.barangay} />
      </div>
    </div>
  );
};

export default CrimeDashboard;