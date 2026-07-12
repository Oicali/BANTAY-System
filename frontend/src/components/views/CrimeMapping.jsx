import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Map, { Source, Layer, Marker, Popup } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./CrimeMapping.css";
import {
  CURRENT_BARANGAYS,
  LEGACY_BARANGAY_OPTIONS,
} from "../../utils/barangayOptions";
import LoadingModal from "../modals/LoadingModal";

const API = `${import.meta.env.VITE_API_URL}/crime-map`;
const getToken = () => localStorage.getItem("token");

const INCIDENT_COLORS = {
  ROBBERY: "#ef4444",
  THEFT: "#f97316",
  "PHYSICAL INJURY": "#eab308",
  HOMICIDE: "#8b5cf6",
  MURDER: "#7c3aed",
  RAPE: "#ec4899",
  "CARNAPPING - MC": "#3b82f6",
  "CARNAPPING - MV": "#0ea5e9",
  "SPECIAL COMPLEX CRIME": "#14b8a6",
};

const CRIME_ICONS = {
  MURDER: ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2 L15 8 L12 22 L9 8 Z" fill={color} fillOpacity="0.25" />
      <line x1="12" y1="2" x2="12" y2="18" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <path d="M10 5 L12 2 L14 5" />
    </svg>
  ),
  HOMICIDE: ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a7 7 0 0 1 7 7c0 3.5-2 5.5-2.5 7H7.5C7 17.5 5 15.5 5 10a7 7 0 0 1 7-7z" />
      <line x1="9" y1="21" x2="9" y2="17" />
      <line x1="15" y1="21" x2="15" y2="17" />
      <line x1="9" y1="21" x2="15" y2="21" />
      <circle cx="9.5" cy="11" r="1" fill={color} />
      <circle cx="14.5" cy="11" r="1" fill={color} />
    </svg>
  ),
  "PHYSICAL INJURY": ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  RAPE: ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3L4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  ),
  ROBBERY: ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  THEFT: ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9V7a6 6 0 0 1 12 0v2" />
      <rect x="3" y="9" width="18" height="12" rx="3" />
      <circle cx="12" cy="15" r="2" />
    </svg>
  ),
  "CARNAPPING - MC": ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Motorcycle side view */}
      <circle cx="5.5" cy="17" r="2.5" />
      <circle cx="18.5" cy="17" r="2.5" />
      {/* Body */}
      <path d="M8 17h7" />
      <path d="M5.5 14.5L8 10h5l3 4.5" />
      {/* Handlebars */}
      <path d="M13 10l1-3h3" />
      {/* Seat */}
      <path d="M9 10h4" />
    </svg>
  ),
  "CARNAPPING - MV": ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Car side view */}
      <path d="M3 11l2-5h14l2 5" />
      <rect x="2" y="11" width="20" height="5" rx="1" />
      <circle cx="6.5" cy="16" r="2" />
      <circle cx="17.5" cy="16" r="2" />
      {/* Windows */}
      <path d="M5.5 11l1.5-3h10l1.5 3" />
      <line x1="12" y1="8" x2="12" y2="11" />
    </svg>
  ),
  "SPECIAL COMPLEX CRIME": ({ color, size = 22 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

const CRIME_WEIGHTS = {
  MURDER: 1.0,
  HOMICIDE: 1.0,
  "SPECIAL COMPLEX CRIME": 1.0,
  RAPE: 0.7,
  ROBBERY: 0.5,
  "CARNAPPING - MV": 0.3,
  "CARNAPPING - MC": 0.3,
  "PHYSICAL INJURY": 0.2,
  THEFT: 0.1,
};

const LEGEND_ITEMS = [
  { label: "Murder" },
  { label: "Homicide" },
  { label: "Special Complex Crime" },
  { label: "Rape" },
  { label: "Robbery" },
  { label: "Carnapping - MV" },
  { label: "Carnapping - MC" },
  { label: "Physical Injury" },
  { label: "Theft" },
];

const HEATMAP_LAYER = {
  id: "crime-heat",
  type: "heatmap",
  paint: {
    "heatmap-weight": [
      "interpolate",
      ["linear"],
      ["get", "weight"],
      0,
      0,
      0.1,
      0.2, // Theft — was 0.05, now more visible
      0.2,
      0.35, // Physical Injury
      0.3,
      0.45, // Carnapping
      0.5,
      0.6, // Robbery
      0.7,
      0.8, // Rape
      1.0,
      1.0, // Murder/Homicide/SCC
    ],
    "heatmap-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      10,
      12,
      18,
      14,
      30,
      16,
      45,
    ],
    "heatmap-intensity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      1.0,
      13,
      1.3,
      15,
      1.8, // was 2.5 — too high, washes out weight differences
    ],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(0,0,0,0)",
      0.05,
      "rgba(255,255,180,0.7)", // light yellow — even single low-weight crimes visible
      0.2,
      "rgba(255,210,80,0.80)", // yellow-orange
      0.4,
      "rgba(255,140,30,0.88)", // orange
      0.6,
      "rgba(220,50,20,0.92)", // red-orange
      0.8,
      "rgba(160,10,10,0.95)", // dark red
      1.0,
      "rgba(80,0,0,0.97)", // near black-red for dense clusters
    ],
    "heatmap-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      11,
      0.9,
      14,
      0.85,
      16,
      0.8, // was 0 — kept visible when zoomed in
      18,
      0.75,
    ],
  },
};

const WORLD_MASK_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        // A large bounding box — Mapbox will fill everything outside Bacoor
        // We rely on the barangay fill layer to paint over the Bacoor interior
        coordinates: [
          [
            [-180, -90],
            [180, -90],
            [180, 90],
            [-180, 90],
            [-180, -90],
          ],
        ],
      },
      properties: {},
    },
  ],
};
const CLUSTER_CIRCLE_LAYER = {
  id: "cluster-circles",
  type: "circle",
  filter: ["==", ["get", "cluster"], true],
  paint: {
    "circle-radius": [
      "interpolate",
      ["exponential", 2],
      ["zoom"],
      10,
      ["/", ["get", "radius_m"], 12],
      12,
      ["/", ["get", "radius_m"], 5],
      14,
      ["/", ["get", "radius_m"], 1.8],
      16,
      ["/", ["get", "radius_m"], 0.45],
      18,
      ["/", ["get", "radius_m"], 0.11],
    ],
    "circle-color": "rgba(255,255,255,0.0)",
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ff2020",
    "circle-opacity": 0.9,
  },
};

const getIncidenceThresholds = (dateFrom, dateTo) => {
  const days =
    Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;

  if (days <= 29)
    return {
      low: { min: 1, max: 1 },
      medium: { min: 2, max: 2 },
      high: { min: 3 },
      days,
    };
  if (days <= 91)
    return {
      low: { min: 1, max: 1 },
      medium: { min: 2, max: 3 },
      high: { min: 4 },
      days,
    };
  if (days <= 364)
    return {
      low: { min: 1, max: 2 },
      medium: { min: 3, max: 5 },
      high: { min: 6 },
      days,
    };
  return {
    low: { min: 1, max: 3 },
    medium: { min: 4, max: 8 },
    high: { min: 9 },
    days,
  };
};

// ADD near the top of CrimeMapping.jsx, after the LEGEND_ITEMS constant:

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

// ADD this component before function CrimeMapping():
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

  const isAll = selected.length === 0;
  const allSelected = selected.length === INDEX_CRIMES.length;

  return (
    <div
      className="crmap-multisel-wrap"
      ref={ref}
      style={{ position: "relative" }}
    >
      <div
        className="crmap-multisel-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {isAll ? (
          <span style={{ color: "#6b7280", fontSize: 14 }}>
            All Crime Types
          </span>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "nowrap",
              flex: "0 0 auto", // ← fixed, no stretch
              minWidth: 0,
              overflow: "hidden",
              alignItems: "center",
            }}
          >
            {selected.slice(0, 2).map((c) => (
              <span
                key={c}
                className="crmap-multisel-pill"
                title={CRIME_DISPLAY[c] || c}
              >
                <span className="crmap-multisel-pill-label">
                  {CRIME_SHORT[c] || c}
                </span>
                <span
                  style={{
                    marginLeft: 3,
                    cursor: "pointer",
                    opacity: 0.7,
                    flexShrink: 0,
                  }}
                  onClick={(e) => removeOne(c, e)}
                >
                  ×
                </span>
              </span>
            ))}
            {selected.length > 2 && (
              <span
                className="crmap-multisel-pill"
                style={{ background: "#e5e7eb" }}
              >
                +{selected.length - 2}
              </span>
            )}
          </div>
        )}
        <span style={{ fontSize: 10, color: "#6b7280", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div className="crmap-multisel-dropdown">
          <div className="crmap-multisel-actions">
            <button
              className="crmap-multisel-action-btn"
              onClick={() => onChange(allSelected ? [] : [...INDEX_CRIMES])}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
            {selected.length > 0 && (
              <button
                className="crmap-multisel-action-btn clear"
                onClick={() => onChange([])}
              >
                Clear ({selected.length})
              </button>
            )}
          </div>
          {INDEX_CRIMES.map((c) => (
            <label key={c} className="crmap-multisel-item">
              <input
                type="checkbox"
                checked={selected.includes(c)}
                onChange={() => toggle(c)}
              />
              <span>{CRIME_DISPLAY[c]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
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

  const toggle = (b) => {
    onChange(
      selected.includes(b) ? selected.filter((x) => x !== b) : [...selected, b],
    );
  };

  const removeOne = (b, e) => {
    e.stopPropagation();
    onChange(selected.filter((x) => x !== b));
  };

  const isAll = selected.length === 0;
  const allSelected = selected.length === CURRENT_BARANGAYS.length;

  return (
    <div
      className="crmap-multisel-wrap"
      ref={ref}
      style={{ position: "relative" }}
    >
      <div
        className="crmap-multisel-trigger"
        style={{ cursor: "text" }}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {/* Pills + input in a flex row that can grow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {selected.slice(0, 2).map((b) => (
            <span
              key={b}
              className="crmap-multisel-pill"
              title={formatBarangayLabel(b)}
            >
              <span className="crmap-multisel-pill-label">
                {formatBarangayLabel(b)}
              </span>
              <span
                style={{
                  marginLeft: 3,
                  cursor: "pointer",
                  opacity: 0.7,
                  flexShrink: 0,
                }}
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
            <span
              className="crmap-multisel-pill"
              style={{ background: "#e5e7eb", flexShrink: 0 }}
            >
              +{selected.length - 2}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={search}
            placeholder={selected.length === 0 ? "All Barangays" : ""}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              minWidth: 40,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              fontFamily: "inherit",
              color: "#212529",
              padding: 0,
            }}
          />
        </div>

        {/* Arrow always pinned to the right, never moves */}
        <span
          style={{
            fontSize: 10,
            color: "#6b7280",
            flexShrink: 0,
            marginLeft: 6,
          }}
        >
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div className="crmap-multisel-dropdown">
          {/* FIX 2: Select All / Clear All — matches CrimeTypeMultiSelect */}
          <div className="crmap-multisel-actions">
            <button
              className="crmap-multisel-action-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onChange(allSelected ? [] : [...CURRENT_BARANGAYS])
              }
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
            {selected.length > 0 && (
              <button
                className="crmap-multisel-action-btn clear"
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

          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.map((b) => (
              <label
                key={b}
                className="crmap-multisel-item"
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
            {filteredLegacy.length > 0 && (
              <div
                style={{
                  padding: "4px 12px 2px",
                  fontSize: 11,
                  color: "#9ca3af",
                  fontWeight: 600,
                }}
              >
                ── Pre-2023 Names (Auto-resolved) ──
              </div>
            )}
            {filteredLegacy.map((o, idx) => (
              <label
                key={`legacy-${idx}`}
                className="crmap-multisel-item"
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
            {filtered.length === 0 && (
              <div
                style={{ padding: "8px 12px", fontSize: 12, color: "#9ca3af" }}
              >
                {search ? `No results for "${search}"` : "No barangays found"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
function CrimeMapping() {
  const rawUser = localStorage.getItem("user");
  const currentUser = rawUser ? JSON.parse(rawUser) : null;
  const isBarangayUser = currentUser?.user_type === "barangay";
  const isInvestigator =
    currentUser?.role_name === "Investigator" ||
    currentUser?.role === "Investigator";
  const userBarangay = currentUser?.assigned_barangay_code ?? null;
  const isPatrol =
    currentUser?.role_name === "Patrol" || currentUser?.role === "Patrol";

  const [boundaries, setBoundaries] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [pins, setPins] = useState([]);
  const [stats, setStats] = useState(null);
  const [geoJSONData, setGeoJSONData] = useState(null);

  const [heatmapMode, setHeatmapMode] = useState(false);
  const [heatGeoJSON, setHeatGeoJSON] = useState(null);
  const [clusterGeoJSON, setClusterGeoJSON] = useState(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);

  const [officers, setOfficers] = useState([]);
  const [showOfficers, setShowOfficers] = useState(true);
  const [hoveredOfficer, setHoveredOfficer] = useState(null);
  const officerPollRef = useRef(null);
  const hoveredOfficerRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [selectedPin, setSelectedPin] = useState(null);
  const [zoom, setZoom] = useState(12);
  const [error, setError] = useState(null);

  // Add this state:
  const [hasPatrolAssignment, setHasPatrolAssignment] = useState(false);
  const [patrolAssignedBarangays, setPatrolAssignedBarangays] = useState([]);

  const getPHTDate = (offsetDays = 0) => {
    const now = new Date();
    const phtMs = now.getTime() + 8 * 60 * 60 * 1000 + offsetDays * 86400000;
    return new Date(phtMs).toISOString().slice(0, 10);
  };

  const getPHTToday = () => getPHTDate(0);

const getPHTOneYearAgo = () => {
  const now = new Date();
  const phtMs = now.getTime() + 8 * 60 * 60 * 1000;
  const phtToday = new Date(phtMs);

  // Same month, one year back, pinned to the 1st
  const year = phtToday.getUTCFullYear() - 1;
  const month = phtToday.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));

  return firstOfMonth.toISOString().slice(0, 10);
};

  const defaultDateTo = getPHTToday();
  const defaultDateFrom = getPHTOneYearAgo();

  // Single state
  // Single state
  const [filters, setFilters] = useState({
    incident_types: [],
    date_from: defaultDateFrom,
    date_to: defaultDateTo,
    // Start with empty array for patrol - will be overridden after check
    barangays: isBarangayUser && userBarangay ? [userBarangay] : [],
  });

  const [appliedFilters, setAppliedFilters] = useState({
    incident_types: [],
    date_from: defaultDateFrom,
    date_to: defaultDateTo,
    barangays: isBarangayUser && userBarangay ? [userBarangay] : [],
  });

  // Fetch trigger — only runs when this ref changes
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const [activeTab, setActiveTab] = useState("legend");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMorePopup, setShowMorePopup] = useState(false);
  const [hoveredBarangay, setHoveredBarangay] = useState(null);
  const [showBrgyTooltip, setShowBrgyTooltip] = useState(true);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [showPinIcons, setShowPinIcons] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [incidenceTooltip, setIncidenceTooltip] = useState({
    visible: false,
    top: 0,
    left: 0,
    type: "choropleth",
  });
  const [patrolAssignmentLoading, setPatrolAssignmentLoading] = useState(true);

  const mapRef = useRef(null);
  const incidenceTooltipTimerRef = useRef(null);

  // Helper to avoid repetition — define once above your return()
  const LegendPin = ({ color, incidentType }) => {
    const IconComp = showPinIcons && CRIME_ICONS[incidentType?.toUpperCase()];
    if (IconComp) return <IconComp color={color} size={16} />;
    return (
      <div className="crmap-legend-pin-wrap">
        <div className="crmap-legend-pin-body" style={{ background: color }}>
          <div className="crmap-legend-pin-inner" />
        </div>
        <div
          className="crmap-legend-pin-tip"
          style={{ borderTopColor: color }}
        />
      </div>
    );
  };

  const totalBarangays = geoJSONData
    ? new Set(geoJSONData.features.map((f) => f.properties.name_db)).size
    : 47;

  const formatDate = (d) => {
    if (!d) return "N/A";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const closeIncidenceTooltip = useCallback(() => {
    if (incidenceTooltipTimerRef.current) {
      clearTimeout(incidenceTooltipTimerRef.current);
    }
    incidenceTooltipTimerRef.current = setTimeout(() => {
      setIncidenceTooltip((prev) => ({ ...prev, visible: false }));
    }, 150);
  }, []);

  const openIncidenceTooltip = useCallback((e, type) => {
    if (incidenceTooltipTimerRef.current) {
      clearTimeout(incidenceTooltipTimerRef.current);
      incidenceTooltipTimerRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 260;
    const viewportPadding = 8;

    const left = Math.min(
      Math.max(viewportPadding, rect.right - tooltipWidth),
      window.innerWidth - tooltipWidth - viewportPadding,
    );

    const estimatedHeight = type === "choropleth" ? 220 : 180;
    const top = Math.min(
      rect.bottom + 8,
      window.innerHeight - estimatedHeight - viewportPadding,
    );

    setIncidenceTooltip({
      visible: true,
      top,
      left,
      type,
    });
  }, []);

  useEffect(() => {
    fetch("/bacoor_barangays.geojson")
      .then((r) => r.json())
      .then(setGeoJSONData)
      .catch((err) => console.error("GeoJSON load error:", err));
  }, []);

  useEffect(() => {
    if (!isBarangayUser || !userBarangay || !geoJSONData || !mapReady) {
      return;
    }

    const feature = geoJSONData.features.find(
      (f) => f.properties.name_db === userBarangay,
    );

    if (feature) {
      const coords =
        feature.geometry.type === "Polygon"
          ? feature.geometry.coordinates[0]
          : feature.geometry.coordinates[0][0];
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);

      mapRef.current.flyTo({
        center: [
          (Math.min(...lngs) + Math.max(...lngs)) / 2,
          (Math.min(...lats) + Math.max(...lats)) / 2,
        ],
        zoom: 15,
        duration: 1200,
      });
    }
  }, [geoJSONData, isBarangayUser, userBarangay, mapReady]); // ← added mapReady

  // REPLACE the entire fetchAll useCallback:
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.incident_types?.length)
        params.append("incident_type", appliedFilters.incident_types.join(","));
      if (appliedFilters.date_from)
        params.append("date_from", appliedFilters.date_from);
      if (appliedFilters.date_to)
        params.append("date_to", appliedFilters.date_to);
      if (appliedFilters.barangays?.length)
        params.append(
          "barangays",
          appliedFilters.barangays.map((b) => b.toUpperCase()).join(","),
        );

      const q = params.toString() ? `?${params}` : "";
      const headers = { Authorization: `Bearer ${getToken()}` };

      const [bRes, pRes, sRes] = await Promise.all([
        fetch(`${API}/boundaries${q}`, { headers }),
        fetch(`${API}/pins${q}`, { headers }),
        fetch(`${API}/statistics${q}`, { headers }),
      ]);

      const [bData, pData, sData] = await Promise.all([
        bRes.json(),
        pRes.json(),
        sRes.json(),
      ]);

      if (bData.success) setBoundaries(bData.data);
      if (pData.success) setPins(pData.data);
      if (sData.success) setStats(sData.data);
    } catch (err) {
      console.error("CrimeMap fetch error:", err);
      setError(
        "Failed to load map data. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]); // ← depends on appliedFilters directly

  // REPLACE the entire fetchHeatmap useCallback:
  const fetchHeatmap = useCallback(async () => {
    setHeatLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.incident_types?.length)
        params.append("incident_type", appliedFilters.incident_types.join(","));
      if (appliedFilters.date_from)
        params.append("date_from", appliedFilters.date_from);
      if (appliedFilters.date_to)
        params.append("date_to", appliedFilters.date_to);
      if (appliedFilters.barangays?.length)
        params.append(
          "barangays",
          appliedFilters.barangays.map((b) => b.toUpperCase()).join(","),
        );

      const q = params.toString() ? `?${params}` : "";

      const res = await fetch(`${API}/heatmap${q}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      const data = await res.json();
      if (data.success) {
        setHeatGeoJSON(data.points);
        setClusterGeoJSON(data.clusters);
      }
    } catch (err) {
      console.error("Heatmap fetch error:", err);
      setError("Failed to load heatmap data.");
    } finally {
      setHeatLoading(false);
    }
  }, [appliedFilters]); // ← depends on appliedFilters directly

  const fetchOfficers = useCallback(async () => {
    if (isBarangayUser || isInvestigator) return; // early exit still fine

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/gps/officers`, {
        // no ?platform param — web always shows all visible officers
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setOfficers(data.data);
    } catch (err) {
      console.warn("[Map] fetchOfficers error:", err.message);
    }
  }, [isBarangayUser]);

  useEffect(() => {
    fetchOfficers();

    const startPoll = () => {
      if (officerPollRef.current) clearInterval(officerPollRef.current);
      officerPollRef.current = setInterval(fetchOfficers, 5000);
    };

    const stopPoll = () => {
      if (officerPollRef.current) {
        clearInterval(officerPollRef.current);
        officerPollRef.current = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopPoll(); // nobody watching → stop completely
      } else {
        fetchOfficers(); // tab back → immediate refresh
        startPoll(); // restart polling
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    startPoll();

    return () => {
      stopPoll(); // component unmounts (navigates away) → stop
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOfficers]);

  // Fetch data on trigger or mode change — but wait for patrol assignment first
  // Fetch data on trigger or mode change
  // Fetch data on trigger or mode change — but wait for patrol assignment first
  // Fetch data on trigger or mode change
  // Fetch data on trigger or mode change — wait for patrol assignment to load first
  useEffect(() => {
    // For patrol users, wait for patrol status to be determined
    if (isPatrol && patrolAssignmentLoading) {
      return;
    }

    if (heatmapMode) {
      fetchHeatmap();
      fetchAll();
    } else {
      fetchAll();
    }
  }, [fetchTrigger, heatmapMode, isPatrol, patrolAssignmentLoading]);

  const handleModeToggle = useCallback(() => {
    setHeatmapMode((m) => !m);
    setSelectedPin(null);
    setSelectedCluster(null);
  }, []);

  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData) return null;

    const selectedBarangay = appliedFilters.barangays?.[0];

    // Patrol user with ongoing schedule → only show assigned barangays
    if (isPatrol && hasPatrolAssignment && patrolAssignedBarangays.length > 0) {
      return {
        ...geoJSONData,
        features: geoJSONData.features
          .filter((f) => patrolAssignedBarangays.includes(f.properties.name_db))
          .map((f) => {
            const boundary = boundaries.find(
              (b) => b.name_db === f.properties.name_db,
            );
            return {
              ...f,
              properties: {
                ...f.properties,
                fillColor: boundary?.color || "#ffffff",
                isSelected: true,
                isLocked: false,
              },
            };
          }),
      };
    }

    if (isBarangayUser && userBarangay) {
      const ownFeature = geoJSONData.features.find(
        (f) => f.properties.name_db === userBarangay,
      );
      if (!ownFeature) return null;

      const colorLookup = {};
      boundaries.forEach((b) => {
        colorLookup[b.name_kml] = b.color;
      });

      return {
        ...geoJSONData,
        features: [
          {
            ...ownFeature,
            properties: {
              ...ownFeature.properties,
              fillColor: heatmapMode
                ? "rgba(255,255,255,0.0)"
                : colorLookup[ownFeature.properties.name_kml] || "#ffffff",
              isLocked: false,
            },
          },
        ],
      };
    }

    if (heatmapMode) {
      return {
        ...geoJSONData,
        features: geoJSONData.features.map((f) => {
          const isSelected =
            !appliedFilters.barangays?.length ||
            appliedFilters.barangays.includes(f.properties.name_db);
          return {
            ...f,
            properties: {
              ...f.properties,
              fillColor: "rgba(255,255,255,0.0)",
              isSelected,
              isLocked: false,
            },
          };
        }),
      };
    }

    if (!boundaries.length) return null;

    const colorLookup = {};
    boundaries.forEach((b) => {
      colorLookup[b.name_kml] = b.color;
    });

    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => {
        const isSelected =
          !appliedFilters.barangays?.length ||
          appliedFilters.barangays.includes(f.properties.name_db);
        return {
          ...f,
          properties: {
            ...f.properties,
            fillColor: isSelected
              ? colorLookup[f.properties.name_kml] || "#ffffff"
              : "#e5e7eb",
            isSelected,
            isLocked: false,
          },
        };
      }),
    };
  }, [
    boundaries,
    geoJSONData,
    heatmapMode,
    isBarangayUser,
    userBarangay,
    appliedFilters,
    isPatrol,
    hasPatrolAssignment,
    patrolAssignedBarangays,
  ]);

  const handleMapDblClick = useCallback(
    (e) => {
      if (!geoJSONData) return;

      if (isBarangayUser && userBarangay) {
        const { lng, lat } = e.lngLat;
        const inside = (point, vs) => {
          let x = point[0];
          let y = point[1];
          let isInside = false;

          for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0];
            const yi = vs[i][1];
            const xj = vs[j][0];
            const yj = vs[j][1];

            if (
              yi > y !== yj > y &&
              x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            ) {
              isInside = !isInside;
            }
          }
          return isInside;
        };

        for (const feature of geoJSONData.features) {
          if (feature.properties.name_db !== userBarangay) continue;

          const geom = feature.geometry;
          const rings =
            geom.type === "Polygon"
              ? [geom.coordinates[0]]
              : geom.coordinates.map((p) => p[0]);

          for (const ring of rings) {
            if (inside([lng, lat], ring)) {
              const allCoords =
                geom.type === "Polygon"
                  ? geom.coordinates[0]
                  : geom.coordinates.flat(1);
              const lngs = allCoords.map((c) => c[0]);
              const lats = allCoords.map((c) => c[1]);

              mapRef.current?.flyTo({
                center: [
                  (Math.min(...lngs) + Math.max(...lngs)) / 2,
                  (Math.min(...lats) + Math.max(...lats)) / 2,
                ],
                zoom: 15,
                duration: 1000,
              });
              return;
            }
          }
        }
        return;
      }

      const { lng, lat } = e.lngLat;
      const inside = (point, vs) => {
        let x = point[0];
        let y = point[1];
        let isInside = false;

        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          const xi = vs[i][0];
          const yi = vs[i][1];
          const xj = vs[j][0];
          const yj = vs[j][1];

          if (
            yi > y !== yj > y &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
          ) {
            isInside = !isInside;
          }
        }
        return isInside;
      };

      for (const feature of geoJSONData.features) {
        const geom = feature.geometry;
        const rings =
          geom.type === "Polygon"
            ? [geom.coordinates[0]]
            : geom.coordinates.map((p) => p[0]);

        for (const ring of rings) {
          if (inside([lng, lat], ring)) {
            const allCoords =
              geom.type === "Polygon"
                ? geom.coordinates[0]
                : geom.coordinates.flat(1);
            const lngs = allCoords.map((c) => c[0]);
            const lats = allCoords.map((c) => c[1]);

            mapRef.current?.flyTo({
              center: [
                (Math.min(...lngs) + Math.max(...lngs)) / 2,
                (Math.min(...lats) + Math.max(...lats)) / 2,
              ],
              zoom: 15,
              duration: 1000,
            });
            return;
          }
        }
      }
    },
    [geoJSONData, isBarangayUser, userBarangay],
  );

  const handleMapClick = useCallback(
    (e) => {
      if (!heatmapMode || !mapRef.current) return;

      const features = mapRef.current.queryRenderedFeatures(e.point, {
        layers: ["cluster-circles"],
      });

      if (features.length > 0) {
        const f = features[0];
        setSelectedCluster({
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          count: f.properties.count,
          crime: f.properties.dominant_crime,
          barangay: f.properties.dominant_barangay,
          rank: f.properties.rank,
          modus: f.properties.dominant_modus,
          crime_types: f.properties.crime_types,
        });
      } else {
        setSelectedCluster(null);
      }
    },
    [heatmapMode],
  );

  const geoJSON = buildGeoJSON();

  const fillLayer = {
    id: "barangay-fill",
    type: "fill",
    paint: {
      "fill-color": ["get", "fillColor"],
      "fill-opacity": heatmapMode
        ? ["case", ["==", ["get", "isLocked"], true], 0.35, 0]
        : ["case", ["==", ["get", "isSelected"], false], 0, 0.5],
    },
  };

  const outlineLayer = {
    id: "barangay-outline",
    type: "line",
    paint: {
      "line-color": heatmapMode ? "#96c8ff" : "#1e3a5f",
      "line-width": ["case", ["==", ["get", "isSelected"], false], 0.4, 1.2],
      "line-opacity": [
        "case",
        ["==", ["get", "isSelected"], false],
        0.08, // ← was 0.18, nearly invisible for unselected
        heatmapMode ? 0.6 : 0.8,
      ],
    },
  };

  const labelLayer = {
    id: "barangay-labels",
    type: "symbol",
    layout: {
      "text-field": showLabels ? ["get", "name_db"] : "",
      "text-size": 10,
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-max-width": 8,
      "text-anchor": "center",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": heatmapMode ? "rgba(220,235,255,0.9)" : "#0a1628",
      "text-halo-color": heatmapMode
        ? "rgba(0,0,0,0.7)"
        : "rgba(255,255,255,0.85)",
      "text-halo-width": 1.5,
    },
  };

  const clusterCount = clusterGeoJSON?.features?.length ?? 0;

  const sidebarTabs = [
    { key: "legend", label: "Legend" },
    { key: "recent", label: "Recent" },
    ...(!isBarangayUser
      ? [{ key: "at_risk", label: heatmapMode ? "Clusters" : "Incidence" }]
      : []),
    ...(!isBarangayUser && !isInvestigator
      ? [{ key: "officers", label: "Patrol" }]
      : []),
  ];

  // ADD this useEffect to check patrol assignment on mount:
  // ADD this useEffect to check patrol assignment on mount:
  useEffect(() => {
    if (!isPatrol) {
      setPatrolAssignmentLoading(false);
      return;
    }

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
            // ✅ HAS schedule - extract barangays from routes
            const assignedBarangays = [
              ...new Set(
                (ongoingPatrol.routes || [])
                  .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
                  .map((r) => r.barangay),
              ),
            ];
            setHasPatrolAssignment(true);
            setPatrolAssignedBarangays(assignedBarangays);

            // Auto-set barangay filter for patrol user
            setFilters((prev) => ({ ...prev, barangays: assignedBarangays }));
            setAppliedFilters((prev) => ({
              ...prev,
              barangays: assignedBarangays,
            }));

            // Trigger data fetch with new barangay filter
            setFetchTrigger((t) => t + 1);
          } else {
            // ✅ NO schedule - show all data like admin
            setHasPatrolAssignment(false);
            setPatrolAssignedBarangays([]);

            // Clear any barangay filters to show all data
            setFilters((prev) => ({ ...prev, barangays: [] }));
            setAppliedFilters((prev) => ({ ...prev, barangays: [] }));
            setFetchTrigger((t) => t + 1);
          }
        }
      } catch (err) {
        console.warn("Failed to check patrol assignment:", err);
        // On error, show all data with no restrictions
        setHasPatrolAssignment(false);
        setPatrolAssignedBarangays([]);
        setFetchTrigger((t) => t + 1);
      } finally {
        setPatrolAssignmentLoading(false);
      }
    };

    checkPatrolAssignment();
  }, [isPatrol]);

  // AND add this effect to auto-reset active tab if user lands on a hidden tab:
  useEffect(() => {
    if (isBarangayUser && activeTab === "at_risk") {
      setActiveTab("legend");
    }
    if ((isBarangayUser || isInvestigator) && activeTab === "officers") {
      setActiveTab("legend");
    }
  }, [isBarangayUser, isInvestigator, activeTab]);

  return (
    <div className="crmap-wrapper">
      <div className="crmap-header">
        <div className="crmap-header-left">
          <div>
            <h1 className="crmap-title">Crime Mapping</h1>
            <p className="crmap-subtitle">
              Geographic visualization of crime incidents in Bacoor City
            </p>
          </div>
        </div>

        <div className="crmap-stat-pills">
          {[
            { val: stats?.total_pins ?? "—", lbl: "Total Pins" },
            !isBarangayUser
              ? heatmapMode
                ? { val: clusterCount, lbl: "Clusters Found" }
                : {
                    val: (() => {
                      if (appliedFilters.barangays?.length > 0) {
                        const affected = boundaries.filter(
                          (b) =>
                            appliedFilters.barangays.includes(b.name_db) &&
                            b.crime_count > 0,
                        ).length;
                        return `${affected}/${appliedFilters.barangays.length}`;
                      }
                      return `${boundaries.filter((b) => b.crime_count > 0).length}/${totalBarangays}`;
                    })(),
                    lbl: "Brgy. Affected",
                  }
              : null,
            {
              val: (() => {
                const days =
                  Math.round(
                    (new Date(appliedFilters.date_to) -
                      new Date(appliedFilters.date_from)) /
                      86400000,
                  ) + 1;
                return `${days}`;
              })(),
              lbl: "Days",
            },
          ]
            .filter(Boolean)
            .map((s) => (
              <div key={s.lbl} className="crmap-pill">
                <span className="crmap-pill-val">{s.val}</span>
                <span className="crmap-pill-lbl">{s.lbl}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="crmap-filterbar">
        <div className="crmap-filterbar-inner">
          <div className="crmap-filter-icon">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </div>

          <CrimeTypeMultiSelect
            selected={filters.incident_types}
            onChange={(val) =>
              setFilters((f) => ({ ...f, incident_types: val }))
            }
          />

          {isPatrol && hasPatrolAssignment ? (
            <div className="crmap-fsel crmap-fsel-locked">
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
              {formatBarangayLabel(userBarangay)}
              <span className="crmap-locked-icon"></span>
            </div>
          ) : (
            <BarangayMultiSelect
              selected={filters.barangays}
              onChange={(val) => setFilters((f) => ({ ...f, barangays: val }))}
            />
          )}

          <div className="crmap-date-range">
            <input
              type="date"
              className="crmap-fsel crmap-fsel-date"
              value={filters.date_from}
              max={(() => {
                if (!filters.date_to) return getPHTDate(0);
                const d = new Date(filters.date_to);
                d.setDate(d.getDate() - 1);
                return d.toISOString().slice(0, 10);
              })()}
              onChange={(e) => {
                const from = e.target.value;
                const autoTo =
                  filters.date_to && filters.date_to > from
                    ? filters.date_to
                    : getPHTToday();
                setFilters((f) => ({ ...f, date_from: from, date_to: autoTo }));
              }}
            />
            <span className="crmap-date-arrow">→</span>
            <input
              type="date"
              className="crmap-fsel crmap-fsel-date"
              value={filters.date_to}
              min={(() => {
                if (!filters.date_from) return undefined;
                const d = new Date(filters.date_from);
                d.setDate(d.getDate() + 1);
                return d.toISOString().slice(0, 10);
              })()}
              max={getPHTDate(0)}
              onChange={(e) =>
                setFilters((f) => ({ ...f, date_to: e.target.value }))
              }
            />
          </div>

          <button
            className="crmap-apply-btn"
            onClick={() => {
              // For patrol users, always use assigned barangays
              const filtersToApply =
                isPatrol && hasPatrolAssignment
                  ? { ...filters, barangays: patrolAssignedBarangays }
                  : filters;

              setAppliedFilters(filtersToApply);
              setFetchTrigger((t) => t + 1);

              const selectedBarangays = filtersToApply.barangays;
              if (selectedBarangays?.length > 0 && geoJSONData) {
                const allCoords = [];
                for (const brgy of selectedBarangays) {
                  const feature = geoJSONData.features.find(
                    (f) => f.properties.name_db === brgy,
                  );
                  if (!feature) continue;
                  const coords =
                    feature.geometry.type === "Polygon"
                      ? feature.geometry.coordinates[0]
                      : feature.geometry.coordinates[0][0];
                  allCoords.push(...coords);
                }
                if (allCoords.length > 0 && mapRef.current) {
                  const lngs = allCoords.map((c) => c[0]);
                  const lats = allCoords.map((c) => c[1]);
                  mapRef.current.fitBounds(
                    [
                      [Math.min(...lngs), Math.min(...lats)],
                      [Math.max(...lngs), Math.max(...lats)],
                    ],
                    { padding: 60, duration: 1200 },
                  );
                }
              } else if (!selectedBarangays?.length && mapRef.current) {
                mapRef.current.flyTo({
                  center: [120.964, 14.4341],
                  zoom: 12,
                  duration: 1200,
                });
              }
            }}
          >
            Apply Filters
          </button>

          {/* // REPLACE the entire crmap-clear-btn onClick: */}
          <button
            className="crmap-clear-btn"
            onClick={() => {
              const clearTo = getPHTToday();
              const clearFrom = getPHTOneYearAgo();
              const cleared = {
                incident_types: [],
                date_from: clearFrom,
                date_to: clearTo,
                barangays:
                  isPatrol && hasPatrolAssignment
                    ? patrolAssignedBarangays
                    : isBarangayUser && userBarangay
                      ? [userBarangay]
                      : [],
              };
              setFilters(cleared);
              setAppliedFilters(cleared);
              if (!isBarangayUser && !(isPatrol && hasPatrolAssignment)) {
                mapRef.current?.flyTo({
                  center: [120.964, 14.4341],
                  zoom: 12,
                  duration: 800,
                });
              }
              setFetchTrigger((t) => t + 1);
            }}
          >
            ↺
          </button>
        </div>
      </div>

      <div className="crmap-body">
        <div className="crmap-map-wrap">
          {(loading || heatLoading) && (
            <LoadingModal isOpen={true} message={"Loading map data..."} />
          )}

          {error && (
            <div className="crmap-error-banner">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
              <button
                onClick={() => (heatmapMode ? fetchHeatmap() : fetchAll())}
              >
                Retry
              </button>
            </div>
          )}

          {/* {!loading &&
            !heatLoading &&
            !error &&
            pins.length === 0 &&
            boundaries.every((b) => b.crime_count === 0) &&
            fetchTrigger > 0 && (
              <div className="crmap-empty-state">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
                <div className="crmap-empty-title">No incidents found</div>
                <div className="crmap-empty-sub">
                  Try adjusting your filters or clearing them to see all data.
                </div>
              </div>
            )} */}

          <div
            className="crmap-map-inner"
            onMouseLeave={() => {
              // ADD THIS
              setHoveredBarangay(null);
              if (mapRef.current?.getCanvas()) {
                mapRef.current.getCanvas().style.cursor = "";
              }
            }}
          >
            <Map
              ref={mapRef}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              onLoad={() => setMapReady(true)}
              initialViewState={{
                longitude: 120.964,
                latitude: 14.4341,
                zoom: 12,
              }}
              minZoom={11.5}
              maxZoom={18}
              style={{ width: "100%", height: "100%" }}
              mapStyle={
                heatmapMode
                  ? "mapbox://styles/mapbox/dark-v11"
                  : "mapbox://styles/mapbox/light-v11"
              }
              attributionControl={false}
              onZoom={(e) => setZoom(e.viewState.zoom)}
              onDblClick={handleMapDblClick}
              onClick={handleMapClick}
              doubleClickZoom={false}
              onMouseMove={(e) => {
                if (hoveredOfficerRef.current) return; // ← reads ref, always current value
                if (heatmapMode) {
                  setHoveredBarangay(null);
                  return;
                }

                if (!geoJSONData || !boundaries.length) {
                  setHoveredBarangay(null); // ADD THIS
                  return;
                }

                const features = e.target.queryRenderedFeatures(e.point, {
                  layers: ["barangay-fill"],
                });

                if (features.length > 0) {
                  const name = features[0].properties.name_db;

                  if (isBarangayUser && userBarangay && name !== userBarangay) {
                    e.target.getCanvas().style.cursor = "not-allowed";
                    setHoveredBarangay(null);
                    return;
                  }

                  e.target.getCanvas().style.cursor = "pointer";
                  const boundary = boundaries.find((b) => b.name_db === name);

                  setHoveredBarangay({
                    name,
                    count: boundary?.crime_count ?? 0,
                    risk: boundary?.risk ?? "None",
                    x: e.point.x,
                    y: e.point.y,
                  });
                } else {
                  e.target.getCanvas().style.cursor = "";
                  setHoveredBarangay(null);
                }
              }}
              onMouseLeave={() => {
                setHoveredBarangay(null);
              }}
            >
              <Source id="world-mask" type="geojson" data={WORLD_MASK_GEOJSON}>
                <Layer
                  id="world-mask-fill"
                  type="fill"
                  paint={{
                    "fill-color": heatmapMode ? "#000000" : "#e5e7eb",
                    "fill-opacity": heatmapMode ? 0.6 : 0.55,
                  }}
                />
              </Source>

              {/* Use this if lighter mask for heatmap */}
              {/* from #e5e7eb to #e5e7eb */}
              {/* {!heatmapMode && (
  <Source id="world-mask" type="geojson" data={WORLD_MASK_GEOJSON}>
    <Layer
      id="world-mask-fill"
      type="fill"
      paint={{
        "fill-color": "#e5e7eb",
        "fill-opacity": 0.55,
      }}
    />
  </Source>
)} */}

              {geoJSON && (
                <Source id="barangays" type="geojson" data={geoJSON}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}

              {heatmapMode && heatGeoJSON && (
                <Source id="heat-points" type="geojson" data={heatGeoJSON}>
                  <Layer {...HEATMAP_LAYER} beforeId="barangay-labels" />
                </Source>
              )}

              {heatmapMode && clusterGeoJSON && showClusters && (
                <Source id="heat-clusters" type="geojson" data={clusterGeoJSON}>
                  <Layer {...CLUSTER_CIRCLE_LAYER} />
                </Source>
              )}

              {!heatmapMode &&
                showPins &&
                zoom >= 13 &&
                pins.map((pin) => (
                  <Marker
                    key={pin.blotter_id}
                    longitude={pin.lng}
                    latitude={pin.lat}
                    anchor="bottom"
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      setSelectedPin(pin);
                    }}
                  >
                    <div
                      className="crmap-pin-wrap"
                      title={pin.incident_type}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          background:
                            INCIDENT_COLORS[pin.incident_type?.toUpperCase()] ||
                            "#6b7280",
                          borderRadius: "50% 50% 50% 0",
                          transform: "rotate(-45deg)",
                          width: 27, // was 28
                          height: 27, // was 28
                          border: "2.5px solid rgba(255,255,255,0.9)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 3px 6px rgba(0,0,0,0.3)",
                        }}
                      >
                        <div
                          style={{
                            transform: "rotate(45deg)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {(() => {
                            const IconComp =
                              showPinIcons &&
                              CRIME_ICONS[pin.incident_type?.toUpperCase()];
                            return IconComp ? (
                              <IconComp
                                color="rgba(255,255,255,0.9)"
                                size={16}
                              />
                            ) : (
                              <div className="crmap-pin-inner" />
                            );
                          })()}
                        </div>
                      </div>
                      <div
                        className="crmap-pin-tip"
                        style={{
                          borderTopColor:
                            INCIDENT_COLORS[pin.incident_type?.toUpperCase()] ||
                            "#6b7280",
                        }}
                      />
                    </div>
                  </Marker>
                ))}

              {!heatmapMode && selectedPin && (
                <Popup
                  longitude={selectedPin.lng}
                  latitude={selectedPin.lat}
                  anchor="bottom"
                  onClose={() => {
                    setSelectedPin(null);
                    setShowMorePopup(false);
                  }}
                  closeOnClick={false}
                  maxWidth="290px"
                >
                  <div className="crmap-popup">
                    <div
                      className="crmap-popup-header"
                      style={{
                        background:
                          INCIDENT_COLORS[
                            selectedPin.incident_type?.toUpperCase()
                          ] || "#495057",
                      }}
                    >
                      <span className="crmap-popup-type">
                        {selectedPin.incident_type}
                      </span>
                      <span className="crmap-popup-status-badge">
                        {selectedPin.status}
                      </span>
                    </div>

                    <div className="crmap-popup-body">
                      {[
                        ["Blotter #", selectedPin.blotter_entry_number],
                        ["Barangay", selectedPin.place_barangay],
                        ["Date", formatDate(selectedPin.date_time_commission)],
                        ["Status", selectedPin.status || "N/A"],
                      ].map(([lbl, val]) => (
                        <div className="crmap-popup-row" key={lbl}>
                          <span className="crmap-popup-lbl">{lbl}</span>
                          <span className="crmap-popup-val">{val}</span>
                        </div>
                      ))}

                      {showMorePopup &&
                        [
                          ["Street", selectedPin.place_street || "N/A"],
                          ["Modus", selectedPin.modus || "N/A"],
                          ["Time", selectedPin.time || "N/A"],
                          ["Day", selectedPin.day_of_week || "N/A"],
                          ["Place Type", selectedPin.type_of_place || "N/A"],
                        ].map(([lbl, val]) => (
                          <div className="crmap-popup-row" key={lbl}>
                            <span className="crmap-popup-lbl">{lbl}</span>
                            <span className="crmap-popup-val">{val}</span>
                          </div>
                        ))}

                      <button
                        className="crmap-popup-toggle"
                        onClick={() => setShowMorePopup((v) => !v)}
                      >
                        {showMorePopup ? "▲ View Less" : "▼ View More"}
                      </button>

                      {!isBarangayUser && (
                        <button
                          className="crmap-popup-view-btn"
                          onClick={() => {
                            sessionStorage.setItem(
                              "openBlotterId",
                              selectedPin.blotter_id,
                            );
                            window.location.href = "/e-blotter";
                          }}
                        >
                          View Full Case
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              )}

              {showOfficers &&
                officers.map((officer) => (
                  <Marker
                    key={`officer-${officer.user_id}`}
                    longitude={parseFloat(officer.longitude)}
                    latitude={parseFloat(officer.latitude)}
                    anchor="bottom"
                  >
                    <div
                      className="crmap-officer-marker"
                      onMouseEnter={(e) => {
                        hoveredOfficerRef.current = true; // ← sync, immediate
                        const el = e.currentTarget;
                        const rect = el.getBoundingClientRect();
                        const mapRect = mapRef.current
                          ?.getContainer()
                          ?.getBoundingClientRect();
                        if (!mapRect) return;
                        setHoveredOfficer({
                          officer,
                          x: rect.left - mapRect.left + rect.width / 2,
                          y: rect.top - mapRect.top,
                        });
                        setHoveredBarangay(null);
                      }}
                      onMouseLeave={() => {
                        hoveredOfficerRef.current = false; // ← sync, immediate
                        setHoveredOfficer(null);
                      }}
                    >
                      <div className="crmap-officer-avatar">
                        {officer.profile_picture ? (
                          <img
                            src={
                              officer.profile_picture.startsWith("http")
                                ? officer.profile_picture
                                : `${import.meta.env.VITE_API_URL}${officer.profile_picture}`
                            }
                            alt={officer.full_name}
                            className="crmap-officer-avatar-img"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="crmap-officer-avatar-initials">
                            {(
                              (officer.first_name?.[0] || "") +
                              (officer.last_name?.[0] || "")
                            ).toUpperCase() || "?"}
                          </span>
                        )}
                      </div>
                      <div className="crmap-officer-pulse" />
                      <div className="crmap-officer-bubble-tail" />
                    </div>
                  </Marker>
                ))}

              {heatmapMode && selectedCluster && (
                <Popup
                  longitude={selectedCluster.lng}
                  latitude={selectedCluster.lat}
                  anchor="bottom"
                  onClose={() => setSelectedCluster(null)}
                  closeOnClick={false}
                  maxWidth="240px"
                >
                  <div className="crmap-popup">
                    <div
                      className="crmap-popup-header"
                      style={{
                        background:
                          INCIDENT_COLORS[selectedCluster.crime] || "#1e3a5f",
                      }}
                    >
                      <span className="crmap-popup-type">
                        Cluster #{selectedCluster.rank}
                      </span>
                      <span className="crmap-popup-status-badge">
                        {selectedCluster.count} incidents
                      </span>
                    </div>

                    <div className="crmap-popup-body">
                      {[
                        ["Top crime", selectedCluster.crime || "N/A"],
                        ["Barangay", selectedCluster.barangay || "N/A"],
                        ["Incidents", selectedCluster.count],
                        ["Modus", selectedCluster.modus || "N/A"],
                        [
                          "Crime types",
                          Array.isArray(selectedCluster.crime_types)
                            ? selectedCluster.crime_types.length
                            : 1,
                        ],
                      ].map(([lbl, val]) => (
                        <div className="crmap-popup-row" key={lbl}>
                          <span className="crmap-popup-lbl">{lbl}</span>
                          <span className="crmap-popup-val">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Popup>
              )}
            </Map>

            {hoveredOfficer && (
              <div
                className="crmap-officer-tooltip"
                style={{
                  left: hoveredOfficer.x,
                  top: hoveredOfficer.y,
                }}
              >
                <div className="crmap-officer-tooltip-name">
                  👮{" "}
                  {`${hoveredOfficer.officer.abbreviation ?? ""}. ${hoveredOfficer.officer.first_name ?? ""} ${hoveredOfficer.officer.last_name ?? ""}`.trim() ||
                    hoveredOfficer.officer.username ||
                    "Officer"}
                </div>
                {/* <div className="crmap-officer-tooltip-detail">
                  {hoveredOfficer.officer.abbreviation ||
                    hoveredOfficer.officer.role_name ||
                    "PNP"}{" "}
                  · Online
                </div> */}
              </div>
            )}

            {showBrgyTooltip && hoveredBarangay && (
              <div
                className="crmap-brgy-tooltip"
                style={{
                  left: hoveredBarangay.x + 12,
                  top: hoveredBarangay.y - 10,
                }}
              >
                <div className="crmap-brgy-tooltip-name">
                  {hoveredBarangay.name}
                </div>
                <div className="crmap-brgy-tooltip-count">
                  {hoveredBarangay.count === 0
                    ? "No recorded incidents"
                    : `${hoveredBarangay.count} incident${
                        hoveredBarangay.count > 1 ? "s" : ""
                      } · ${hoveredBarangay.risk}`}
                </div>
              </div>
            )}

            {/* {heatmapMode && (
              <div className="crmap-heat-legend">
                <span className="crmap-heat-legend-label">Low</span>
                <div className="crmap-heat-legend-bar" />
                <span className="crmap-heat-legend-label">High density</span>
              </div>
            )} */}
          </div>

          <div className="crmap-controls">
            <button
              className="crmap-ctrl-btn"
              title="Zoom in"
              onClick={() => mapRef.current?.zoomIn({ duration: 300 })}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <div className="crmap-ctrl-divider" />

            <button
              className="crmap-ctrl-btn"
              title="Zoom out"
              onClick={() => mapRef.current?.zoomOut({ duration: 300 })}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <div className="crmap-ctrl-divider" />

            <button
              className="crmap-ctrl-btn"
              title="Reset view"
              onClick={() => {
                if (isBarangayUser && userBarangay && geoJSONData) {
                  const feature = geoJSONData.features.find(
                    (f) => f.properties.name_db === userBarangay,
                  );

                  if (feature) {
                    const coords =
                      feature.geometry.type === "Polygon"
                        ? feature.geometry.coordinates[0]
                        : feature.geometry.coordinates[0][0];
                    const lngs = coords.map((c) => c[0]);
                    const lats = coords.map((c) => c[1]);

                    mapRef.current?.flyTo({
                      center: [
                        (Math.min(...lngs) + Math.max(...lngs)) / 2,
                        (Math.min(...lats) + Math.max(...lats)) / 2,
                      ],
                      zoom: 15,
                      duration: 800,
                    });
                    return;
                  }
                }

                mapRef.current?.flyTo({
                  center: [120.964, 14.4341],
                  zoom: 12,
                  duration: 800,
                });
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            <div className="crmap-ctrl-divider" />

            <button
              className="crmap-ctrl-btn"
              title="Fullscreen"
              onClick={() => {
                const el = document.querySelector(".crmap-map-wrap");
                if (!document.fullscreenElement) el?.requestFullscreen();
                else document.exitFullscreen();
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>

            <div className="crmap-ctrl-divider" />

            <div className="crmap-options-wrap">
              <button
                className="crmap-ctrl-btn crmap-options-btn"
                title="Map Options"
                onClick={() => setShowMapOptions((v) => !v)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              {showMapOptions && (
                <div className="crmap-options-popover">
                  <div className="crmap-options-title">Map Options</div>

                  {!isBarangayUser && !isInvestigator && (
                    <div className="crmap-map-option">
                      <span className="crmap-map-option-lbl">
                        Officer Locations
                      </span>
                      <button
                        className={`crmap-toggle ${showOfficers ? "on" : ""}`}
                        onClick={() => setShowOfficers((v) => !v)}
                      >
                        <span className="crmap-toggle-knob" />
                      </button>
                    </div>
                  )}

                  {heatmapMode ? (
                    <>
                      <div className="crmap-map-option">
                        <span className="crmap-map-option-lbl">
                          Barangay Labels
                        </span>
                        <button
                          className={`crmap-toggle ${showLabels ? "on" : ""}`}
                          onClick={() => setShowLabels((v) => !v)}
                        >
                          <span className="crmap-toggle-knob" />
                        </button>
                      </div>
                      <div className="crmap-map-option">
                        <span className="crmap-map-option-lbl">
                          Cluster Rings
                        </span>
                        <button
                          className={`crmap-toggle ${showClusters ? "on" : ""}`}
                          onClick={() => setShowClusters((v) => !v)}
                        >
                          <span className="crmap-toggle-knob" />
                        </button>
                      </div>
                    </>
                  ) : (
                    [
                      {
                        label: "Barangay Tooltip",
                        state: showBrgyTooltip,
                        toggle: () => setShowBrgyTooltip((v) => !v),
                      },
                      {
                        label: "Crime Pins",
                        state: showPins,
                        toggle: () => setShowPins((v) => !v),
                      },
                      {
                        label: "Pin Icons",
                        state: showPinIcons,
                        toggle: () => setShowPinIcons((v) => !v),
                      },
                      {
                        label: "Barangay Labels",
                        state: showLabels,
                        toggle: () => setShowLabels((v) => !v),
                      },
                    ].map((o) => (
                      <div key={o.label} className="crmap-map-option">
                        <span className="crmap-map-option-lbl">{o.label}</span>
                        <button
                          className={`crmap-toggle ${o.state ? "on" : ""}`}
                          onClick={o.toggle}
                        >
                          <span className="crmap-toggle-knob" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            className={`crmap-heatmap-toggle ${heatmapMode ? "active" : ""}`}
            onClick={handleModeToggle}
            title={
              heatmapMode
                ? "Switch to choropleth view"
                : "Switch to heatmap view"
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2c0 6-8 8-8 14a8 8 0 0 0 16 0c0-4-2-7-4-9 0 3-1.5 4-3 4 1-3 0-6-1-9z" />
            </svg>
            {heatmapMode ? "Choropleth" : "Heatmap"}
          </button>

          {!heatmapMode && zoom < 13 && (
            <div className="crmap-zoom-hint">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              Zoom in to see individual crime pins
            </div>
          )}

          <button
            className="crmap-sidebar-toggle"
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            style={{ right: sidebarOpen ? "344px" : "14px" }}
          >
            <span />
            <span />
            <span />
          </button>

          <div
            className={`crmap-sidebar ${!sidebarOpen ? "hidden" : ""} ${
              heatmapMode ? "heatmap" : ""
            }`}
          >
            <div
              className={`crmap-tabs ${
                sidebarTabs.length === 2
                  ? "two-tabs"
                  : sidebarTabs.length === 3
                    ? "three-tabs"
                    : "four-tabs"
              }`}
            >
              {sidebarTabs.map((t) => (
                <button
                  key={t.key}
                  className={`crmap-tab ${activeTab === t.key ? "active" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="crmap-panel-body">
              {activeTab === "legend" && (
                <div className="crmap-panel-section">
                  {heatmapMode ? (
                    <div className="crmap-heat-sidebar-legend">
                      <div className="crmap-sidebar-title-row">
                        <div className="crmap-heat-sidebar-title">
                          Crime Density
                        </div>
                        <button
                          type="button"
                          className="crmap-incidence-info-icon"
                          aria-label="Show density scale info"
                          onMouseEnter={(e) =>
                            openIncidenceTooltip(e, "heatmap")
                          }
                          onMouseLeave={closeIncidenceTooltip}
                        >
                          i
                        </button>
                      </div>

                      <div className="crmap-heat-scale-bar" />
                      <div className="crmap-heat-scale-labels">
                        <span>Low</span>
                        <span>Medium</span>
                        <span>High</span>
                      </div>

                      <div
                        className="crmap-heat-sidebar-title"
                        style={{ marginTop: 16 }}
                      >
                        Crime Types Description
                      </div>

                      {LEGEND_ITEMS.filter(
                        (item) =>
                          !appliedFilters.incident_types.length ||
                          appliedFilters.incident_types.includes(
                            item.label.toUpperCase(),
                          ),
                      ).map((item) => {
                        const name = item.label;
                        const color =
                          INCIDENT_COLORS[name?.toUpperCase()] || "#6b7280";
                        const statsEntry = stats?.by_incident_type?.find(
                          (s) =>
                            s.incident_type?.toUpperCase() ===
                            name.toUpperCase(),
                        );
                        const count = parseInt(statsEntry?.count) || 0;
                        const weight =
                          CRIME_WEIGHTS[name?.toUpperCase()] ?? 0.1;

                        return (
                          <div className="crmap-severity-row" key={name}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {/* <LegendPin color={color} /> */}
                              <span className="crmap-severity-crime">
                                {name}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {/* just using css style  */}
                              {(() => {
                                const tier =
                                  weight >= 0.9
                                    ? { label: "High", color: "#7c3aed" }
                                    : weight >= 0.4
                                      ? { label: "Medium", color: "#f97316" }
                                      : { label: "Low", color: "#6b7280" };
                                return (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 500,

                                      padding: "1px 7px",
                                      borderRadius: 8,
                                    }}
                                  >
                                    {tier.label}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="crmap-heat-sidebar-legend">
                      <div className="crmap-sidebar-title-row">
                        <div className="crmap-heat-sidebar-title">
                          Barangay Crime Incidence
                        </div>
                        <button
                          type="button"
                          className="crmap-incidence-info-icon"
                          aria-label="Show Barangay Crime Incidence info"
                          onMouseEnter={(e) =>
                            openIncidenceTooltip(e, "choropleth")
                          }
                          onMouseLeave={closeIncidenceTooltip}
                        >
                          i
                        </button>
                      </div>

                      {(() => {
                        // In the legend section:
                        const t = getIncidenceThresholds(
                          appliedFilters.date_from,
                          appliedFilters.date_to,
                        );

                        const levels = [
                          {
                            color: "#ffffff",
                            label: "No crimes",
                            range: "0",
                            opacity: 1,
                          },
                          {
                            color: "#eab308",
                            label: "Low Incidence",
                            range:
                              t.low.min === t.low.max
                                ? `${t.low.min}`
                                : `${t.low.min}–${t.low.max}`,
                            opacity: 0.55,
                          },
                          {
                            color: "#f97316",
                            label: "Moderate Incidence",
                            range:
                              t.medium.min === t.medium.max
                                ? `${t.medium.min}`
                                : `${t.medium.min}–${t.medium.max}`,
                            opacity: 0.55,
                          },
                          {
                            color: "#b91c1c",
                            label: "High Incidence",
                            range: `${t.high.min}+`,
                            opacity: 0.55,
                          },
                        ];

                        return levels.map((lvl) => (
                          <div
                            key={lvl.label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            <div
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                background: lvl.color,
                                opacity: lvl.opacity,
                                flexShrink: 0,
                                border:
                                  lvl.color === "#ffffff"
                                    ? "1px solid #ced4da"
                                    : "none",
                              }}
                            />
                            <span
                              style={{
                                flex: 1,
                                fontSize: 12,
                                color: "var(--gray-900)",
                              }}
                            >
                              {lvl.label}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--gray-600)",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {lvl.range} crimes
                            </span>
                          </div>
                        ));
                      })()}

                      <div style={{ marginTop: 16 }}>
                        <div className="crmap-heat-sidebar-title">
                          Crime Types
                        </div>

                        {/* Not heatmap mode */}
                        {LEGEND_ITEMS.filter(
                          (item) =>
                            !appliedFilters.incident_types.length ||
                            appliedFilters.incident_types.includes(
                              item.label.toUpperCase(),
                            ),
                        ).map((item) => {
                          const name = item.label;
                          const color =
                            INCIDENT_COLORS[name?.toUpperCase()] || "#6b7280";
                          const statsEntry = stats?.by_incident_type?.find(
                            (s) =>
                              s.incident_type?.toUpperCase() ===
                              name.toUpperCase(),
                          );
                          const count = parseInt(statsEntry?.count) || 0;
                          const weight =
                            CRIME_WEIGHTS[name?.toUpperCase()] ?? 0.1;

                          return (
                            <div className="crmap-legend-row" key={name}>
                              <div className="crmap-legend-top">
                                <div className="crmap-legend-left">
                                  <LegendPin
                                    color={color}
                                    incidentType={name}
                                  />
                                  <span className="crmap-legend-name">
                                    {name}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <span className="crmap-legend-count">
                                    {count}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "recent" && (
                <div className="crmap-panel-section">
                  {stats?.recent_incidents?.length > 0 ? (
                    stats.recent_incidents.map((r, i) => (
                      <div className="crmap-recent-item" key={i}>
                        <div
                          className="crmap-recent-bar"
                          style={{
                            background:
                              INCIDENT_COLORS[r.incident_type?.toUpperCase()] ||
                              "#6b7280",
                          }}
                        />
                        <div className="crmap-recent-info">
                          <div className="crmap-recent-type">
                            {r.incident_type}
                          </div>
                          <div className="crmap-recent-brgy">
                            📍 {r.place_barangay}
                          </div>
                          <div className="crmap-recent-date">
                            {formatDate(r.date_time_commission)}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="crmap-empty">
                      No recent incidents found.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "at_risk" && (
                <div className="crmap-panel-section">
                  {heatmapMode ? (
                    clusterGeoJSON?.features?.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {clusterGeoJSON.features.map((f, i) => {
                          const p = f.properties;
                          const crimeTypes = Array.isArray(p.crime_types)
                            ? p.crime_types
                            : typeof p.crime_types === "string"
                              ? (() => {
                                  try {
                                    return JSON.parse(p.crime_types);
                                  } catch {
                                    return [];
                                  }
                                })()
                              : [];

                          return (
                            <div
                              key={`cluster-${i}`}
                              style={{
                                cursor: "pointer",
                                padding: "8px 10px",
                                background: "rgba(239,68,68,0.04)",
                                borderRadius: 6,
                                border: "1px solid rgba(239,68,68,0.15)",
                                borderLeft: "3px solid #ef4444",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                  "rgba(239,68,68,0.10)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "rgba(239,68,68,0.04)")
                              }
                              onClick={() => {
                                const [lng, lat] = f.geometry.coordinates;
                                mapRef.current?.flyTo({
                                  center: [lng, lat],
                                  zoom: 14,
                                  duration: 800,
                                });
                                setSelectedCluster(null);
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#111",
                                  }}
                                >
                                  Hotspot Cluster {p.rank}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9,
                                    background: "#ef4444",
                                    color: "#fff",
                                    borderRadius: 4,
                                    padding: "1px 5px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.count} incidents
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: 9,
                                  color: "#ef4444",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 3,
                                  fontWeight: 500,
                                  marginTop: 6,
                                }}
                              >
                                <svg
                                  width="9"
                                  height="9"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                Click to locate on map
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="crmap-empty">
                        No clusters detected for this filter.
                      </div>
                    )
                  ) : (
                    (() => {
                      const incidenceList = boundaries
                        .filter((b) => b.crime_count >= 1)
                        .sort((a, b) => b.crime_count - a.crime_count);
                      const maxCount = incidenceList[0]?.crime_count ?? 1;

                      return incidenceList.length > 0 ? (
                        incidenceList.map((h, i) => {
                          const barColor =
                            h.risk === "High Incidence"
                              ? "#b91c1c"
                              : h.risk === "Moderate Incidence"
                                ? "#f97316"
                                : "#eab308";

                          return (
                            <div className="crmap-hotspot-row" key={h.name_db}>
                              <div className="crmap-hotspot-rank">#{i + 1}</div>
                              <div className="crmap-hotspot-info">
                                <div className="crmap-hotspot-name">
                                  {h.name_db}
                                </div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    marginBottom: 4,
                                    color: barColor,
                                    fontWeight: 600,
                                  }}
                                >
                                  {h.risk}
                                </div>
                                <div className="crmap-hotspot-bar-bg">
                                  <div
                                    className="crmap-hotspot-bar-fill"
                                    style={{
                                      width: `${Math.min(100, (h.crime_count / maxCount) * 100)}%`,
                                      background: barColor,
                                      opacity: 0.5,
                                    }}
                                  />
                                </div>
                              </div>
                              <div
                                className="crmap-hotspot-count"
                                style={{ color: barColor }}
                              >
                                {h.crime_count}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="crmap-empty">
                          No barangays with recorded incidents for this period.
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {activeTab === "officers" && (
                <div className="crmap-panel-section">
                  {officers.length === 0 ? (
                    <div className="crmap-empty">
                      No officers currently online.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {officers.map((officer) => (
                        <div
                          key={officer.user_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 10px",
                            background: "rgba(29,78,216,0.04)",
                            borderRadius: 6,
                            border: "1px solid rgba(29,78,216,0.15)",
                            borderLeft: "3px solid #1d4ed8",
                            cursor: "pointer",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(29,78,216,0.10)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(29,78,216,0.04)")
                          }
                          onClick={() => {
                            mapRef.current?.flyTo({
                              center: [
                                parseFloat(officer.longitude),
                                parseFloat(officer.latitude),
                              ],
                              zoom: 16,
                              duration: 800,
                            });
                          }}
                        >
                          {/* Avatar */}
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              border: "2px solid #1d4ed8",
                              background: "#dbeafe",
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {officer.profile_picture ? (
                              <img
                                src={officer.profile_picture}
                                alt={officer.full_name}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  borderRadius: "50%",
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "#1d4ed8",
                                  userSelect: "none",
                                  letterSpacing: "0.3px",
                                }}
                              >
                                {officer.initials || "??"}
                              </span>
                            )}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#111",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {officer.abbreviation
                                ? `${officer.abbreviation}. ${officer.first_name || ""} ${officer.last_name || ""}`.trim()
                                : `${officer.first_name || ""} ${officer.last_name || ""}`.trim() ||
                                  officer.username}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#6b7280",
                                marginTop: 2,
                              }}
                            >
                              {officer.role_name}
                            </div>
                          </div>

                          {/* Online badge + seconds ago */}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: 3,
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                background: "rgba(34,197,94,0.12)",
                                borderRadius: 10,
                                padding: "2px 6px",
                              }}
                            >
                              <div
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: "#22c55e",
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 9,
                                  color: "#16a34a",
                                  fontWeight: 600,
                                }}
                              >
                                ONLINE
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {incidenceTooltip.visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="crmap-incidence-info-tooltip crmap-incidence-info-tooltip--portal"
            style={{
              top: incidenceTooltip.top,
              left: incidenceTooltip.left,
              opacity: 1,
              transform: "translateY(0)",
              pointerEvents: "auto",
            }}
            onMouseEnter={() => {
              if (incidenceTooltipTimerRef.current) {
                clearTimeout(incidenceTooltipTimerRef.current);
                incidenceTooltipTimerRef.current = null;
              }
            }}
            onMouseLeave={closeIncidenceTooltip}
          >
            {incidenceTooltip.type === "choropleth" ? (
              <>
                <div className="crmap-incidence-tooltip-title">
                  Thresholds change by date range
                </div>
                <div className="crmap-incidence-tooltip-body">
                  Thresholds are calibrated from Bacoor City's actual crime
                  baseline averaging 180–200 incidents annually across 47
                  barangays.
                </div>

                <table className="crmap-incidence-tooltip-table">
                  <thead>
                    <tr>
                      <th>Window</th>
                      <th>Low</th>
                      <th>Moderate</th>
                      <th>High</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>≤ 29 days</td>
                      <td>1</td>
                      <td>2</td>
                      <td>3+</td>
                    </tr>
                    <tr>
                      <td>30–91 days</td>
                      <td>1</td>
                      <td>2–3</td>
                      <td>4+</td>
                    </tr>
                    <tr>
                      <td>92–364 days</td>
                      <td>1–2</td>
                      <td>3–5</td>
                      <td>6+</td>
                    </tr>
                    <tr>
                      <td>365+ days</td>
                      <td>1–3</td>
                      <td>4–8</td>
                      <td>9+</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : (
              <>
                <div className="crmap-incidence-tooltip-title">
                  How the heatmap works
                </div>
                <div className="crmap-incidence-tooltip-body">
                  Each incident is a weighted point — overlapping points build
                  intensity. DBSCAN rings mark dense cluster zones.
                </div>
              </>
            )}
          </div>,
          document.fullscreenElement ?? document.body,
        )}
    </div>
  );
}

export default CrimeMapping;
