import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList
} from "recharts";
import { FileText, Unlock, CheckSquare, Search, ChevronLeft, ChevronRight } from "lucide-react";
import "./CrimeDashboard.css";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const INDEX_CRIMES = [
  "Murder","Homicide","Physical Injuries","Rape",
  "Robbery","Theft","Carnap MC","Carnap MV","Special Complex Crime"
];
const CRIME_SHORT = {
  "Murder":"Murder","Homicide":"Homicide","Physical Injuries":"Phys. Inj.",
  "Rape":"Rape","Robbery":"Robbery","Theft":"Theft",
  "Carnap MC":"Carnap MC","Carnap MV":"Carnap MV","Special Complex Crime":"Spec. Cmplx",
};
const CRIME_ABBR = {
  "Murder":"Mur","Homicide":"Hom","Physical Injuries":"PI","Rape":"Rape",
  "Robbery":"Rob","Theft":"Thft","Carnap MC":"CMC","Carnap MV":"CMV","Special Complex Crime":"SCC",
};
const CRIME_LABEL = {
  "Total":"Total","Murder":"Murder","Homicide":"Homicide",
  "Physical Injuries":"Phys. Inj.","Rape":"Rape","Robbery":"Robbery","Theft":"Theft",
  "Carnap MC":"Carnap MC","Carnap MV":"Carnap MV","Special Complex Crime":"Spec. Cmplx",
};
const BARANGAYS = Array.from({ length: 47 }, (_, i) => `Barangay ${i + 1}`);
const PLACE_TYPES = [
  "Abandoned Structure","Along the street","Commercial/Business Estab.",
  "Construction/Industrial Barracks","Farm/Ricefield","Government Office",
  "Onboard a vehicle","Parking Area","Recreational Place","Residential",
  "River/Lake","School","Transportation Terminals","Vacant Lot"
];
const MODUS_BY_CRIME = {
  "Physical Injuries":    ["Chemicals","Choking","Hitting with hard object","Mauling","Punching","Stabbing"],
  "Homicide":             ["Mauling","Punching","Stabbing","Strangulation"],
  "Murder":               ["Burning","Hacking","Hitting with hard object","Mauling","Shooting","Stabbing"],
  "Rape":                 ["Deprived of Reason/Unconscious","Force/threat/intimidation"],
  "Robbery":              ["Akyat Bahay","Baklas bubong/dingding","Bolt cutter","Hold-up w/ gun","Hold-up w/ knife"],
  "Theft":                ["Akyat Bahay","Applied as helper","Pickpocketing","Salisi","Shoplifting","Stolen while unattended"],
  "Carnap MC":            ["Applied as helper","Taken w/o owner's consent"],
  "Carnap MV":            ["Stolen While Parked (SWPU)"],
  "Special Complex Crime":["Akyat Bahay","Hold-up w/ gun"],
};

const CRIME_COLORS = {
  "Total":               "#0a1628",
  "Murder":              "#ef4444",
  "Homicide":            "#f97316",
  "Physical Injuries":   "#eab308",
  "Rape":                "#a855f7",
  "Robbery":             "#ec4899",
  "Theft":               "#14b8a6",
  "Carnap MC":           "#3b82f6",
  "Carnap MV":           "#6366f1",
  "Special Complex Crime":"#84cc16",
};

const PLACE_PAGE_SIZE = 10;
const BRGY_PAGE_SIZE  = 10;
const MODUS_PAGE_SIZE = 10;
const CHART_ROW_HEIGHT = 480;

// ─── DATE PRESETS ─────────────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString().slice(0, 10);
const offsetDate = (days) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const startOfYear = (y) => `${y}-01-01`;
const endOfYear   = (y) => `${y}-12-31`;

const PRESETS = [
  { label: "Last 7 days",   key: "7d" },
  { label: "Last 30 days",  key: "30d" },
  { label: "Last 6 months", key: "6m" },
  { label: "This year",     key: "year" },
  { label: "Custom",        key: "custom" },
];

const getPresetRange = (key) => {
  const t = todayIso();
  if (key === "7d")   return { from: offsetDate(-6), to: t };
  if (key === "30d")  return { from: offsetDate(-29), to: t };
  if (key === "6m") {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return { from: d.toISOString().slice(0, 10), to: t };
  }
  if (key === "year") {
    const yr = new Date().getFullYear();
    return { from: startOfYear(yr), to: endOfYear(yr) };
  }
  return null;
};

// ─── GRANULARITY ─────────────────────────────────────────────────────────────
const getGranularity = (preset, dateFrom, dateTo) => {
  if (preset === "7d")   return "daily";
  if (preset === "30d")  return "daily";
  if (preset === "6m")   return "weekly";
  if (preset === "year") return "monthly";
  const days = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000);
  if (days <= 31)  return "daily";
  if (days <= 90)  return "weekly";
  return "monthly";
};
const granularityLabel = (g) =>
  g === "daily" ? "Daily" : g === "weekly" ? "Weekly" : "Monthly";

// ─── SEEDED RNG ───────────────────────────────────────────────────────────────
const seededRng = (seed) => {
  let s = seed;
  return (min, max) => { s = (s * 16807) % 2147483647; return min + (s % (max - min + 1)); };
};
const dateSeed = (from, to) => {
  let h = 0;
  for (const ch of (from + to)) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  return h || 42;
};

// ─── DATA GENERATORS ─────────────────────────────────────────────────────────
const generateCrimeData = (from, to) => {
  const rng = seededRng(dateSeed(from, to));
  return INDEX_CRIMES.map(crime => {
    const total   = rng(10, 70);
    const cleared = rng(2, Math.floor(total * 0.6));
    const solved  = rng(1, Math.floor((total - cleared) * 0.7));
    return { crime, total, cleared, solved, underInvestigation: Math.max(0, total - cleared - solved) };
  });
};
const generateHourlyData = (from, to) => {
  const rng = seededRng(dateSeed(from, to) + 100);
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
    count: rng(0, 12),
  }));
};
const generateDayData = (from, to) => {
  const rng = seededRng(dateSeed(from, to) + 200);
  return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => ({ day, count: rng(2, 20) }));
};
const generatePlaceData = (from, to) => {
  const rng = seededRng(dateSeed(from, to) + 300);
  return PLACE_TYPES.map(place => ({ place, count: rng(1, 25) }));
};
const generateAllModusData = (crimeFilter, from, to) => {
  const rng    = seededRng(dateSeed(from, to) + 400);
  const crimes = crimeFilter === "All" ? INDEX_CRIMES : [crimeFilter];
  const entries = [];
  crimes.forEach(crime =>
    (MODUS_BY_CRIME[crime] || []).forEach(modus => {
      const count = rng(1, 12);
      const existing = entries.find(e => e.modus === modus);
      if (existing) { if (count > existing.count) { existing.count = count; existing.crime = crime; } }
      else entries.push({ modus, count, crime });
    })
  );
  return entries
    .sort((a, b) => b.count - a.count)
    .map(e => ({
      ...e,
      label: crimeFilter === "All" ? `${e.modus} (${CRIME_ABBR[e.crime]})` : e.modus,
    }));
};
const generateBarangayData = (from, to) => {
  const rng = seededRng(dateSeed(from, to) + 500);
  return BARANGAYS.map(b => ({ barangay: b, count: rng(1, 50) }));
};

const generateTrendsData = (from, to, granularity) => {
  const start = new Date(from);
  const end   = new Date(to);
  const points = [];

  if (granularity === "daily") {
    const cur = new Date(start);
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      const rng = seededRng(dateSeed(iso, iso) + 999);
      const point = { label: iso.slice(5).replace("-", "/") };
      let total = 0;
      INDEX_CRIMES.forEach(c => { const v = rng(0, 5); point[c] = v; total += v; });
      point["Total"] = total;
      points.push(point);
      cur.setDate(cur.getDate() + 1);
    }
  } else if (granularity === "weekly") {
    const cur = new Date(start);
    while (cur <= end) {
      const weekEnd = new Date(cur); weekEnd.setDate(weekEnd.getDate() + 6);
      const label = cur.toISOString().slice(5, 10).replace("-", "/");
      const rng = seededRng(dateSeed(cur.toISOString().slice(0,10), weekEnd.toISOString().slice(0,10)) + 888);
      const point = { label };
      let total = 0;
      INDEX_CRIMES.forEach(c => { const v = rng(2, 20); point[c] = v; total += v; });
      point["Total"] = total;
      points.push(point);
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    while (cur <= endMonth) {
      const yr = cur.getFullYear(); const mo = cur.getMonth();
      const label = `${MONTHS[mo]}${yr !== new Date().getFullYear() ? ` ${yr}` : ""}`;
      const rng = seededRng(dateSeed(`${yr}-${String(mo+1).padStart(2,"0")}-01`, "mo") + 777);
      const point = { label };
      let total = 0;
      INDEX_CRIMES.forEach(c => { const v = rng(5, 60); point[c] = v; total += v; });
      point["Total"] = total;
      points.push(point);
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  return points;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "0.0");
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};

const HBarLabel = ({ x, y, width, height, value }) => {
  if (!value) return null;
  return <text x={x + width + 5} y={y + height / 2 + 4} fill="#374151" fontSize={11} fontWeight={600}>{value}</text>;
};
const VBarLabel = ({ x, y, width, value }) => {
  if (!value || value < 2) return null;
  return <text x={x + width / 2} y={y - 4} textAnchor="middle" fill="#374151" fontSize={9} fontWeight={700}>{value}</text>;
};

// ─── BARANGAY MULTI-SELECT ────────────────────────────────────────────────────
const BarangayMultiSelect = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = BARANGAYS.filter(b => b.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === BARANGAYS.length;
  const toggle = (b) => onChange(selected.includes(b) ? selected.filter(x => x !== b) : [...selected, b]);
  const removeOne = (b, e) => { e.stopPropagation(); onChange(selected.filter(x => x !== b)); };
  const toggleAll = () => onChange(allSelected ? [] : [...BARANGAYS]);
  const isAll = selected.length === 0;

  return (
    <div className="cd-brgy-ms-wrap" ref={ref}>
      <div className="cd-brgy-ms-trigger" onClick={() => setOpen(v => !v)}>
        {isAll ? (
          <span className="cd-brgy-ms-placeholder">All Barangays</span>
        ) : (
          <div className="cd-brgy-ms-pills">
            {selected.slice(0, 3).map(b => (
              <span key={b} className="cd-brgy-pill">
                {b.replace("Barangay ", "Brgy. ")}
                <span className="cd-pill-x" onClick={(e) => removeOne(b, e)}>×</span>
              </span>
            ))}
            {selected.length > 3 && <span className="cd-brgy-pill cd-pill-more">+{selected.length - 3} more</span>}
          </div>
        )}
        <span className="cd-brgy-ms-arrow">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="cd-brgy-ms-dropdown">
          <div className="cd-brgy-ms-search-row">
            <input className="cd-brgy-ms-search" placeholder="Search barangay…"
              value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()} />
          </div>
          <div className="cd-brgy-ms-actions">
            <button onClick={toggleAll} className="cd-brgy-ms-action-btn">{allSelected ? "Clear all" : "Select all"}</button>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="cd-brgy-ms-action-btn cd-brgy-ms-clear">Clear ({selected.length})</button>
            )}
          </div>
          <div className="cd-brgy-ms-list">
            {filtered.map(b => (
              <label key={b} className="cd-brgy-ms-item">
                <input type="checkbox" checked={selected.includes(b)} onChange={() => toggle(b)} />
                <span>{b}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className="cd-brgy-ms-empty">No results</div>}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── FILTER BAR ───────────────────────────────────────────────────────────────
const BLANK_FILTERS = (preset = "year") => {
  const range = getPresetRange(preset) || getPresetRange("year");
  return { preset, dateFrom: range.from, dateTo: range.to, timeFrom: "00:00", timeTo: "23:59", crimeType: "All", modus: "All", barangays: [] };
};

const FilterBar = ({ filters, onApply }) => {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState(() => ({ ...filters }));
  const [dateError, setDateError] = useState("");

  useEffect(() => { setDraft({ ...filters }); setDateError(""); }, [filters]);

  const modusOptions = useMemo(() => {
    if (draft.crimeType === "All") {
      const set = new Set();
      Object.values(MODUS_BY_CRIME).flat().forEach(m => set.add(m));
      return ["All", ...Array.from(set).sort()];
    }
    return ["All", ...(MODUS_BY_CRIME[draft.crimeType] || [])];
  }, [draft.crimeType]);

  const handlePreset = (key) => {
    if (key === "custom") { setDraft(f => ({ ...f, preset: "custom" })); setDateError(""); return; }
    const range = getPresetRange(key);
    if (range) { setDraft(f => ({ ...f, preset: key, dateFrom: range.from, dateTo: range.to })); setDateError(""); }
  };

  const handleCrimeType = val => setDraft(f => ({ ...f, crimeType: val, modus: "All" }));

  const validateDates = (from, to) => {
    if (!from || !to) return "Please select both start and end dates.";
    if (from === to)  return "Start and end date cannot be the same day.";
    if (from > to)    return "Start date must be before end date.";
    return "";
  };

  const handleDateFrom = (val) => { setDraft(f => ({ ...f, dateFrom: val })); setDateError(validateDates(val, draft.dateTo)); };
  const handleDateTo   = (val) => { setDraft(f => ({ ...f, dateTo: val }));   setDateError(validateDates(draft.dateFrom, val)); };

  const handleApply = () => {
    if (draft.preset === "custom") {
      const err = validateDates(draft.dateFrom, draft.dateTo);
      if (err) { setDateError(err); return; }
    }
    setDateError(""); onApply({ ...draft });
  };

  const handleReset = () => {
    const fresh = BLANK_FILTERS("year");
    setDraft(fresh); setDateError(""); onApply(fresh);
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const isDefault = (
    draft.preset === "year" && draft.timeFrom === "00:00" && draft.timeTo === "23:59" &&
    draft.crimeType === "All" && draft.modus === "All" && draft.barangays.length === 0
  );

  return (
    <div className={`cd-filter-bar ${expanded ? "cd-expanded" : "cd-collapsed"}`}>
      <div className="cd-filter-bar-header" onClick={() => setExpanded(v => !v)}>
        <div className="cd-filter-bar-title">
          <span className="cd-filter-icon">⚙</span>
          <span>Filters &amp; Options</span>
          {!expanded && !isDefault && <span className="cd-filter-active-count">active</span>}
        </div>
        <button className="cd-filter-toggle-btn" onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}>
          {expanded ? "▲ Collapse" : "▼ Expand"}
        </button>
      </div>
      {expanded && (
        <div className="cd-filter-body">
          <div className="cd-preset-row">
            <span className="cd-preset-label">Date Range</span>
            <div className="cd-preset-btns">
              {PRESETS.map(p => (
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
                  <input type="date" value={draft.dateFrom} onChange={e => handleDateFrom(e.target.value)} />
                  <span className="cd-range-sep">→</span>
                  <input type="date" value={draft.dateTo} onChange={e => handleDateTo(e.target.value)} />
                </div>
                {dateError && <div className="cd-date-error"><span className="cd-date-error-icon">⚠</span> {dateError}</div>}
              </div>
            )}
            {draft.preset !== "custom" && (
              <span className="cd-preset-range-display">{fmtDate(draft.dateFrom)} — {fmtDate(draft.dateTo)}</span>
            )}
          </div>
          <div className="cd-filter-grid">
            <div className="cd-filter-group">
              <label>Time Range</label>
              <div className="cd-date-range-row">
                <input type="time" value={draft.timeFrom} onChange={e => setDraft(f => ({ ...f, timeFrom: e.target.value }))} />
                <span>to</span>
                <input type="time" value={draft.timeTo} onChange={e => setDraft(f => ({ ...f, timeTo: e.target.value }))} />
              </div>
            </div>
            <div className="cd-filter-group">
              <label>Crime Type</label>
              <select value={draft.crimeType} onChange={e => handleCrimeType(e.target.value)}>
                <option value="All">All Crimes</option>
                {INDEX_CRIMES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="cd-filter-group">
              <label>Modus Operandi</label>
              <select value={draft.modus} onChange={e => setDraft(f => ({ ...f, modus: e.target.value }))}>
                {modusOptions.map(m => <option key={m} value={m}>{m === "All" ? "All Modus" : m}</option>)}
              </select>
            </div>
            <div className="cd-filter-group">
              <label>Barangay</label>
              <BarangayMultiSelect selected={draft.barangays} onChange={val => setDraft(f => ({ ...f, barangays: val }))} />
            </div>
            <div className="cd-filter-group-actions">
              <button className={`cd-apply-btn ${isDirty ? "cd-apply-btn-dirty" : ""}`} onClick={handleApply}>Apply Filters</button>
              <button className="cd-reset-btn" onClick={handleReset} title="Reset to defaults">↺</button>
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
    total:   data.reduce((s, d) => s + d.total, 0),
    cleared: data.reduce((s, d) => s + d.cleared, 0),
    solved:  data.reduce((s, d) => s + d.solved, 0),
    ui:      data.reduce((s, d) => s + d.underInvestigation, 0),
  };
  const cards = [
    { label:"Total Incidents",     value: t.total,                       color:"blue",  sub:"All index crimes" },
    { label:"CCE %",               value: `${pct(t.cleared, t.total)}%`, color:"green", sub:`${t.cleared} cleared` },
    { label:"CSE %",               value: `${pct(t.solved,  t.total)}%`, color:"teal",  sub:`${t.solved} solved` },
    { label:"Under Investigation", value: t.ui,                          color:"amber", sub:"Pending resolution" },
  ];
  return (
    <div className="cd-summary-cards">
      {cards.map((c, i) => {
        const Icon = CARD_ICONS[c.color];
        return (
          <div key={i} className={`cd-summary-card cd-card-${c.color}`}>
            <div className="cd-summary-card-top">
              <div className="cd-summary-icon-wrap"><Icon size={20} strokeWidth={2}/></div>
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
const IndexCrimeTable = ({ data }) => {
  const [sortCol, setSortCol] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

  const rows = useMemo(() =>
    [...data].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    }), [data, sortCol, sortDir]);

  const tot = data.reduce(
    (acc, d) => ({ total: acc.total+d.total, cleared: acc.cleared+d.cleared, solved: acc.solved+d.solved, ui: acc.ui+d.underInvestigation }),
    { total:0, cleared:0, solved:0, ui:0 }
  );

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortTh = ({ col, children }) => (
    <th className="cd-sortable cd-num-cell" onClick={() => handleSort(col)}>
      {children}<span className="cd-sort-icon">{sortCol===col ? (sortDir==="desc"?"▼":"▲") : "⇅"}</span>
    </th>
  );

  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header">
        <h3>Index Crime Summary Table</h3>
        <span className="cd-chart-subtitle">CCE = Cleared / Total · CSE = Solved / Total</span>
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
              const cseVal = parseFloat(pct(row.solved, row.total));
              return (
                <tr key={i}>
                  <td className="cd-crime-name">{row.crime}</td>
                  <td className="cd-num-cell">{row.total}</td>
                  <td className="cd-num-cell cd-cleared">{row.cleared}</td>
                  <td className="cd-num-cell cd-solved">{row.solved}</td>
                  <td className="cd-num-cell cd-ui">{row.underInvestigation}</td>
                  <td className="cd-num-cell">
                    <span className={`cd-badge ${cceVal>=50?"cd-badge-green":"cd-badge-red"}`}>{cceVal.toFixed(1)}%</span>
                  </td>
                  <td className="cd-num-cell">
                    <span className={`cd-badge ${cseVal>=50?"cd-badge-green":"cd-badge-amber"}`}>{cseVal.toFixed(1)}%</span>
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
              <td className="cd-num-cell"><span className="cd-badge cd-badge-green">{pct(tot.cleared,tot.total)}%</span></td>
              <td className="cd-num-cell"><span className="cd-badge cd-badge-green">{pct(tot.solved,tot.total)}%</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// ─── CASE STATUS ──────────────────────────────────────────────────────────────
const CaseStatusChart = ({ data }) => {
  const rows = data.map(d => ({
    crime: CRIME_SHORT[d.crime] || d.crime,
    Cleared: d.cleared, Solved: d.solved, "Under Inv.": d.underInvestigation,
  }));
  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header">
        <h3>Case Status per Index Crime</h3>
        <div className="cd-cs-legend">
          <span className="cd-legend-dot" style={{ background:"#22c55e" }}/> Cleared &nbsp;
          <span className="cd-legend-dot" style={{ background:"#3b82f6" }}/> Solved &nbsp;
          <span className="cd-legend-dot" style={{ background:"#f59e0b" }}/> Under Inv.
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top:18, right:16, left:0, bottom:52 }} barCategoryGap="22%" barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
          <XAxis dataKey="crime" tick={{ fontSize:11, fill:"#374151" }} angle={-28} textAnchor="end" interval={0}/>
          <YAxis tick={{ fontSize:11, fill:"#6b7280" }}/>
          <Tooltip contentStyle={{ fontSize:12, borderRadius:6 }}/>
          <Bar dataKey="Cleared"    fill="#22c55e" radius={[3,3,0,0]} maxBarSize={30}><LabelList content={<VBarLabel/>}/></Bar>
          <Bar dataKey="Solved"     fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={30}><LabelList content={<VBarLabel/>}/></Bar>
          <Bar dataKey="Under Inv." fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={30}><LabelList content={<VBarLabel/>}/></Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── CRIME TRENDS ─────────────────────────────────────────────────────────────
const TrendsTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const visible = [...payload].filter(p => p.value !== undefined).sort((a, b) => b.value - a.value);
  return (
    <div style={{
      background:"#fff", border:"1px solid #e5e7eb", borderRadius:8,
      padding:"10px 14px", fontSize:12, maxWidth:240,
      boxShadow:"0 4px 16px rgba(0,0,0,0.10)"
    }}>
      <div style={{ fontWeight:700, marginBottom:6, color:"#1e3a5f", borderBottom:"1px solid #e5e7eb", paddingBottom:4 }}>
        {label}
      </div>
      {visible.map((p, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:16, marginBottom:2 }}>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:p.name==="Total"?10:8, height:p.name==="Total"?10:8,
              borderRadius:"50%", background:p.color, display:"inline-block", flexShrink:0 }}/>
            <span style={{ color:"#374151", fontWeight:p.name==="Total"?700:400 }}>
              {CRIME_LABEL[p.name] || p.name}
            </span>
          </span>
          <strong style={{ color:p.name==="Total"?"#0a1628":"#1e3a5f" }}>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const CrimeTrends = ({ preset, dateFrom, dateTo }) => {
  const granularity = useMemo(() => getGranularity(preset, dateFrom, dateTo), [preset, dateFrom, dateTo]);
  const data = useMemo(() => generateTrendsData(dateFrom, dateTo, granularity), [dateFrom, dateTo, granularity]);

  // "total" = show only Total line | "crime" = show individual crime lines
  const [mode, setMode] = useState("total");
  // In crime mode: crimes that are individually hidden (empty = all shown)
  const [hiddenCrimes, setHiddenCrimes] = useState(new Set());

  const handleModeSwitch = (m) => { setMode(m); setHiddenCrimes(new Set()); };

  const toggleCrime = (key) => {
    setHiddenCrimes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allCrimesVisible = INDEX_CRIMES.every(c => !hiddenCrimes.has(c));
  const toggleAllCrimes  = () => setHiddenCrimes(allCrimesVisible ? new Set(INDEX_CRIMES) : new Set());

  const dayCount = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
  const tickInterval = (() => {
    const n = data.length;
    if (n <= 14) return 0;
    if (n <= 31) return Math.floor(n / 10);
    if (n <= 52) return Math.floor(n / 12);
    return Math.floor(n / 12);
  })();

  return (
    <div className="cd-chart-card cd-full-width">

      {/* Header */}
      <div className="cd-chart-card-header">
        <h3>Crime Trends</h3>
        <span className="cd-chart-subtitle">
          {granularityLabel(granularity)} · {data.length} points · {dayCount} day{dayCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Mode bar ── */}
      <div className="cd-trends-modebar">

        {/* Segmented control */}
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

        {/* Individual crime pills — only visible in crime mode */}
        {mode === "crime" && (
          <div className="cd-trends-crime-pills">
            <button className="cd-trends-showall-btn" onClick={toggleAllCrimes}>
              {allCrimesVisible ? "Hide All" : "Show All"}
            </button>
            {INDEX_CRIMES.map(key => {
              const hidden = hiddenCrimes.has(key);
              return (
                <button
                  key={key}
                  className={`cd-trends-crime-pill ${hidden ? "cd-trends-crime-pill-off" : ""}`}
                  onClick={() => toggleCrime(key)}
                  title={hidden ? `Show ${key}` : `Hide ${key}`}
                >
                  <span className="cd-trends-pill-dot" style={{ background: hidden ? "#d1d5db" : CRIME_COLORS[key] }}/>
                  {CRIME_LABEL[key]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top:10, right:24, left:0, bottom:10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
          <XAxis dataKey="label" tick={{ fontSize:11, fill:"#6b7280" }} interval={tickInterval}/>
          <YAxis tick={{ fontSize:11, fill:"#6b7280" }}/>
          <Tooltip content={<TrendsTooltip/>}/>

          {/* Total line — shown only in "total" mode */}
          <Line
            type="monotone"
            dataKey="Total"
            stroke={CRIME_COLORS["Total"]}
            strokeWidth={3}
            dot={false}
            activeDot={{ r:5 }}
            hide={mode !== "total"}
          />

          {/* Per-crime lines — shown only in "crime" mode, individually toggleable */}
          {INDEX_CRIMES.map(key => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CRIME_COLORS[key]}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r:3 }}
              hide={mode !== "crime" || hiddenCrimes.has(key)}
            />
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
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, padding:"7px 12px", fontSize:12 }}>
      <div style={{ fontWeight:600, marginBottom:2, color:"#1e3a5f" }}>{label}</div>
      <div>Reported: <strong>{payload[0].value}</strong></div>
    </div>
  );
};

const CrimeClock = ({ dateFrom, dateTo }) => {
  const data = useMemo(() => generateHourlyData(dateFrom, dateTo), [dateFrom, dateTo]);
  return (
    <div className="cd-chart-card cd-full-width">
      <div className="cd-chart-card-header"><h3>Crime Clock — Hourly Distribution</h3></div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top:10, right:20, left:0, bottom:10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
          <XAxis dataKey="hour" tick={{ fontSize:10, fill:"#6b7280" }} interval={1}/>
          <YAxis tick={{ fontSize:11, fill:"#6b7280" }}/>
          <Tooltip content={<ClockTooltip/>}/>
          <Line type="monotone" dataKey="count" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r:3 }} activeDot={{ r:5 }}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── CRIME BY DAY ─────────────────────────────────────────────────────────────
const CrimeByDay = ({ dateFrom, dateTo }) => {
  const data = useMemo(() => generateDayData(dateFrom, dateTo), [dateFrom, dateTo]);
  const chartH = CHART_ROW_HEIGHT - 64 - 40;
  return (
    <div className="cd-chart-card cd-chart-fixed-height">
      <div className="cd-chart-card-header"><h3>Crime by Day of Week</h3></div>
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} margin={{ top:20, right:20, left:0, bottom:10 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
          <XAxis dataKey="day" tick={{ fontSize:13, fill:"#6b7280" }}/>
          <YAxis tick={{ fontSize:11, fill:"#6b7280" }}/>
          <Tooltip contentStyle={{ fontSize:12, borderRadius:6 }} formatter={v => [v, "Reported"]}/>
          <Bar dataKey="count" name="Reported" fill="#1e3a5f" radius={[4,4,0,0]} maxBarSize={64}>
            <LabelList dataKey="count" position="top" style={{ fontSize:11, fontWeight:700, fill:"#1e3a5f" }}/>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── MODUS OPERANDI ───────────────────────────────────────────────────────────
const ModusChart = ({ crimeFilter, dateFrom, dateTo }) => {
  const [page, setPage] = useState(0);

  const allData = useMemo(
    () => generateAllModusData(crimeFilter, dateFrom, dateTo),
    [crimeFilter, dateFrom, dateTo]
  );

  useEffect(() => setPage(0), [allData]);

  const totalPages = Math.ceil(allData.length / MODUS_PAGE_SIZE);
  const data       = allData.slice(page*MODUS_PAGE_SIZE, (page+1)*MODUS_PAGE_SIZE);
  const maxLabelLen = data.length ? Math.max(...data.map(d => d.label.length)) : 10;
  const yWidth      = Math.min(Math.max(Math.ceil(maxLabelLen * 7.0), 90), 230);
  const chartH = CHART_ROW_HEIGHT - 64 - 45 - 40;

  return (
    <div className="cd-chart-card cd-chart-fixed-height cd-flex-col">
      <div className="cd-chart-card-header">
        <h3>Modus Operandi</h3>
        <span className="cd-chart-subtitle">{crimeFilter==="All" ? "All crimes — crime in (abbr)" : crimeFilter}</span>
      </div>
      <div style={{ flex:1, minHeight:0 }}>
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart data={data} layout="vertical" margin={{ top:4, right:56, left:0, bottom:4 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false}/>
            <XAxis type="number" tick={{ fontSize:13, fill:"#6b7280" }}/>
            <YAxis dataKey="label" type="category" tick={{ fontSize:13, fill:"#374151" }} width={yWidth}/>
            <Tooltip contentStyle={{ fontSize:12, borderRadius:6 }} formatter={v => [v, "Incidents"]}/>
            <Bar dataKey="count" name="Incidents" radius={[0,4,4,0]} maxBarSize={30}>
              {data.map((_, i) => <Cell key={i} fill={i%2===0 ? "#1e3a5f" : "#2d4a6f"}/>)}
              <LabelList content={<HBarLabel/>}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {totalPages > 1 && (
        <div className="cd-brgy-pagination">
          <span className="cd-brgy-page-info">{page*MODUS_PAGE_SIZE+1}–{Math.min((page+1)*MODUS_PAGE_SIZE, allData.length)} of {allData.length}</span>
          <div className="cd-brgy-page-btns">
            <button className="cd-page-btn" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/></button>
            {Array.from({ length:totalPages }, (_,i) => (
              <button key={i} className={`cd-page-btn ${page===i?"cd-page-btn-active":""}`} onClick={()=>setPage(i)}>{i+1}</button>
            ))}
            <button className="cd-page-btn" disabled={page===totalPages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight size={14}/></button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PLACE OF COMMISSION ──────────────────────────────────────────────────────
const PlaceOfCommission = ({ dateFrom, dateTo }) => {
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

  const data = useMemo(() => {
    const raw = generatePlaceData(dateFrom, dateTo);
    return [...raw].sort((a,b) => sortDir==="desc" ? b.count-a.count : a.count-b.count).map((d,i) => ({ ...d, rank:i+1 }));
  }, [dateFrom, dateTo, sortDir]);

  useEffect(() => setPage(0), [sortDir, dateFrom, dateTo]);
  const totalPages = Math.ceil(data.length / PLACE_PAGE_SIZE);
  const pageData   = data.slice(page*PLACE_PAGE_SIZE, (page+1)*PLACE_PAGE_SIZE);

  return (
    <div className="cd-chart-card cd-flex-col cd-table-fixed-height">
      <div className="cd-chart-card-header">
        <h3>Place of Commission</h3>
        <span className="cd-chart-subtitle">Click count to sort</span>
      </div>
      <table className="cd-brgy-table">
        <thead>
          <tr>
            <th>#</th><th>Location</th>
            <th className="cd-num-cell cd-sortable" onClick={() => setSortDir(d => d==="desc"?"asc":"desc")}>
              Count <span className="cd-sort-icon" style={{ color:"rgba(255,255,255,0.7)" }}>{sortDir==="desc"?"▼":"▲"}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pageData.map((row,i) => (
            <tr key={i}>
              <td className="cd-brgy-rank">{row.rank}</td>
              <td className="cd-brgy-name">{row.place}</td>
              <td className="cd-num-cell cd-brgy-primary">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cd-brgy-pagination">
        <span className="cd-brgy-page-info">{page*PLACE_PAGE_SIZE+1}–{Math.min((page+1)*PLACE_PAGE_SIZE, data.length)} of {data.length}</span>
        <div className="cd-brgy-page-btns">
          <button className="cd-page-btn" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/></button>
          {Array.from({ length:totalPages }, (_,i) => (
            <button key={i} className={`cd-page-btn ${page===i?"cd-page-btn-active":""}`} onClick={()=>setPage(i)}>{i+1}</button>
          ))}
          <button className="cd-page-btn" disabled={page===totalPages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight size={14}/></button>
        </div>
      </div>
    </div>
  );
};

// ─── BARANGAY TABLE ───────────────────────────────────────────────────────────
const BarangayTable = ({ dateFrom, dateTo }) => {
  const [sortCol, setSortCol] = useState("count");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

  const baseData = useMemo(() => generateBarangayData(dateFrom, dateTo), [dateFrom, dateTo]);
  const sorted = useMemo(() =>
    [...baseData].sort((a,b) => {
      if (sortCol==="barangay") return sortDir==="desc" ? b.barangay.localeCompare(a.barangay) : a.barangay.localeCompare(b.barangay);
      return sortDir==="desc" ? b.count-a.count : a.count-b.count;
    }).map((d,i) => ({ ...d, rank:i+1 })),
    [baseData, sortCol, sortDir]
  );

  const totalPages = Math.ceil(sorted.length / BRGY_PAGE_SIZE);
  const pageData   = sorted.slice(page*BRGY_PAGE_SIZE, (page+1)*BRGY_PAGE_SIZE);

  const handleSort = col => {
    if (sortCol===col) setSortDir(d => d==="desc"?"asc":"desc");
    else { setSortCol(col); setSortDir("desc"); setPage(0); }
  };

  const SortIcon = ({ col }) => (
    <span className="cd-sort-icon" style={{ color:"rgba(255,255,255,0.7)", marginLeft:3 }}>
      {sortCol===col ? (sortDir==="desc"?"▼":"▲") : "⇅"}
    </span>
  );

  return (
    <div className="cd-chart-card cd-flex-col cd-table-fixed-height">
      <div className="cd-chart-card-header">
        <h3>Barangay Incidents</h3>
        <span className="cd-chart-subtitle">All 47 barangays · Click column to sort</span>
      </div>
      <table className="cd-brgy-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="cd-sortable" onClick={() => handleSort("barangay")} style={{ textAlign:"left" }}>
              Barangay <SortIcon col="barangay"/>
            </th>
            <th className="cd-num-cell cd-sortable" onClick={() => handleSort("count")}>
              Count <SortIcon col="count"/>
            </th>
          </tr>
        </thead>
        <tbody>
          {pageData.map((row,i) => (
            <tr key={i}>
              <td className="cd-brgy-rank">{row.rank}</td>
              <td className="cd-brgy-name">{row.barangay}</td>
              <td className="cd-num-cell cd-brgy-primary">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cd-brgy-pagination">
        <span className="cd-brgy-page-info">{page*BRGY_PAGE_SIZE+1}–{Math.min((page+1)*BRGY_PAGE_SIZE, sorted.length)} of {sorted.length}</span>
        <div className="cd-brgy-page-btns">
          <button className="cd-page-btn" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/></button>
          {Array.from({ length:totalPages }, (_,i) => (
            <button key={i} className={`cd-page-btn ${page===i?"cd-page-btn-active":""}`} onClick={()=>setPage(i)}>{i+1}</button>
          ))}
          <button className="cd-page-btn" disabled={page===totalPages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight size={14}/></button>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const CrimeDashboard = () => {
  const [filters, setFilters] = useState(() => BLANK_FILTERS("year"));

  const crimeData = useMemo(
    () => generateCrimeData(filters.dateFrom, filters.dateTo),
    [filters.dateFrom, filters.dateTo]
  );

  return (
    <div className="content-area">
      <div className="cd-page-header">
        <div className="cd-page-header-left">
          <h1>Crime Dashboard</h1>
          <p>
            Index Crime Statistics &nbsp;·&nbsp;
            <span className="cd-date-range-label">{fmtDate(filters.dateFrom)} — {fmtDate(filters.dateTo)}</span>
          </p>
        </div>
      </div>

      <FilterBar filters={filters} onApply={setFilters} />
      <SummaryCards data={crimeData}/>
      <IndexCrimeTable data={crimeData}/>
      <CaseStatusChart data={crimeData}/>
      <CrimeTrends preset={filters.preset} dateFrom={filters.dateFrom} dateTo={filters.dateTo}/>
      <CrimeClock dateFrom={filters.dateFrom} dateTo={filters.dateTo}/>

      <div className="cd-charts-two-col cd-charts-row-modus">
        <CrimeByDay dateFrom={filters.dateFrom} dateTo={filters.dateTo}/>
        <ModusChart crimeFilter={filters.crimeType} dateFrom={filters.dateFrom} dateTo={filters.dateTo}/>
      </div>

      <div className="cd-charts-two-col">
        <PlaceOfCommission dateFrom={filters.dateFrom} dateTo={filters.dateTo}/>
        <BarangayTable dateFrom={filters.dateFrom} dateTo={filters.dateTo}/>
      </div>
    </div>
  );
};

export default CrimeDashboard;