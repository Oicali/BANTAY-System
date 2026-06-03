// src/components/views/PatrollerDashboardView.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import "./PatrollerDashboardView.css";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import BeatCard from "../modals/BeatCard";
import Notification from "../modals/Notification";

const API_BASE = import.meta.env.VITE_API_URL;

// ── Map layers ────────────────────────────────────────────
const fillLayer = {
  id: "pdv-fill",
  type: "fill",
  paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 },
};
const outlineLayer = {
  id: "pdv-outline",
  type: "line",
  paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 },
};
const labelLayer = {
  id: "pdv-labels",
  type: "symbol",
  layout: {
    "text-field": ["get", "name_db"],
    "text-size": 10,
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-max-width": 8,
    "text-anchor": "center",
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#0a1628",
    "text-halo-color": "rgba(255,255,255,0.85)",
    "text-halo-width": 1.5,
  },
};

// ── Helpers ───────────────────────────────────────────────
const token = () => localStorage.getItem("token");

const getMyUserId = () => {
  const raw = localStorage.getItem("token");
  if (!raw) return null;
  try {
    const b64 = raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    return json.sub ?? json.user_id ?? json.id ?? json.userId ?? null;
  } catch {
    return null;
  }
};

const getMyRole = () => {
  const raw = localStorage.getItem("token");
  if (!raw) return null;
  try {
    const b64 = raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    return json.role ?? json.user_role ?? json.roles ?? null;
  } catch {
    return null;
  }
};

const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const toLocalDateStr = (d) => {
  const dt = parseLocalDate(d);
  if (!dt) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const todayStr = () => toLocalDateStr(new Date());

const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const dates = [];
  const cur = parseLocalDate(start);
  const last = parseLocalDate(end);
  if (!cur || !last) return [];
  while (cur <= last) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const formatDate = (d) => {
  const dt = parseLocalDate(d);
  return dt
    ? dt.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
};

const formatTabDate = (d) => {
  const dt = parseLocalDate(d);
  return dt
    ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" })
    : "—";
};

const formatTime = (t) => (t ? t.substring(0, 5) : "—");

const getPatrolStatus = (patrol) => {
  const t = parseLocalDate(new Date());
  const start = parseLocalDate(patrol.start_date);
  const end = parseLocalDate(patrol.end_date);
  if (!start || !end) return "unknown";
  if (t < start) return "upcoming";
  if (t > end) return "completed";
  return "active";
};

const getMyShiftsForPatrol = (patrol) => {
  const myId = getMyUserId();
  if (!myId || !patrol?.patrollers) return [];
  const shifts = [
    ...new Set(
      patrol.patrollers
        .filter((p) => String(p.officer_id) === String(myId) && p.shift)
        .map((p) => p.shift),
    ),
  ].sort();
  return shifts;
};

// ── Status Badge ──────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    active: { cls: "pdv-badge-active", label: "Active" },
    upcoming: { cls: "pdv-badge-upcoming", label: "Upcoming" },
    completed: { cls: "pdv-badge-completed", label: "Completed" },
  };
  const { cls, label } = map[status] || map.completed;
  return <span className={`pdv-status-badge ${cls}`}>{label}</span>;
};

// ── Shift Badge ───────────────────────────────────────────
const ShiftBadge = ({ shift }) => {
  if (!shift) return null;
  const isAM = shift === "AM";
  return (
    <span
      className={`pdv-shift-badge ${isAM ? "pdv-shift-am" : "pdv-shift-pm"}`}
    >
      {shift}
    </span>
  );
};

// ── Ongoing / Upcoming Shift Card ─────────────────────────
const OngoingShiftCard = ({ patrol, geoJSONData, myShifts, isUpcoming }) => {
  const mapRef = useRef(null);
  const dateRange = generateDateRange(patrol?.start_date, patrol?.end_date);

  // For upcoming patrols, default to the first date; for active, default to today
  const defaultDate = isUpcoming
    ? dateRange[0] || null
    : dateRange.includes(todayStr())
      ? todayStr()
      : dateRange[0] || null;

  const [activeDate, setActiveDate] = useState(defaultDate);
  const [activeShift, setActiveShift] = useState(myShifts[0] || "AM");

  // Routes for this date + shift
  const routesForDateShift = (patrol?.routes || [])
    .filter(
      (r) =>
        toLocalDateStr(r.route_date) === activeDate &&
        r.shift === activeShift &&
        (r.stop_order || 0) > 0,
    )
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  const barangays = [
    ...new Set(
      (patrol?.routes || [])
        .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
        .map((r) => r.barangay),
    ),
  ];

  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData || !patrol) return null;
    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: barangays.includes(f.properties.name_db)
            ? "#1e3a5f"
            : "#e9ecef",
        },
      })),
    };
  }, [geoJSONData, patrol, barangays]);

  const fitToBounds = (mapInstance) => {
    if (!mapInstance || barangays.length === 0 || !geoJSONData) return;
    const coords = [];
    for (const f of geoJSONData.features) {
      if (barangays.includes(f.properties.name_db)) {
        const rings =
          f.geometry.type === "Polygon"
            ? [f.geometry.coordinates[0]]
            : f.geometry.coordinates.map((p) => p[0]);
        for (const ring of rings) coords.push(...ring);
      }
    }
    if (coords.length === 0) return;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    mapInstance.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 40, duration: 600 },
    );
  };

  return (
    <div className="pdv-ongoing-card">
      {/* Card header */}
      <div className="pdv-ongoing-header">
        <div className="pdv-ongoing-header-left">
          <div className="pdv-ongoing-name">{patrol.patrol_name}</div>
          <div className="pdv-ongoing-meta">
            <span className="pdv-ongoing-dates">
              {formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}
            </span>
            <span className="pdv-ongoing-unit">{patrol.mobile_unit_name}</span>
            <div className="pdv-ongoing-shifts">
              {myShifts.map((s) => (
                <ShiftBadge key={s} shift={s} />
              ))}
            </div>
          </div>
        </div>

        {/* Status pill */}
        {isUpcoming ? (
          <div className="pdv-upcoming-pill">
            <span className="pdv-upcoming-dot" />
            UPCOMING
          </div>
        ) : (
          <div className="pdv-ongoing-live-pill">
            <span className="pdv-live-dot" />
            LIVE
          </div>
        )}
      </div>

      {/* Card body: map + schedule */}
      <div className="pdv-ongoing-body">
        {/* Map */}
        <div className="pdv-ongoing-map">
          <Map
            ref={mapRef}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
            initialViewState={{
              longitude: 120.964,
              latitude: 14.4341,
              zoom: 11.5,
            }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            onLoad={(e) => fitToBounds(e.target)}
          >
            {buildGeoJSON() && (
              <Source id="pdv-barangays" type="geojson" data={buildGeoJSON()}>
                <Layer {...fillLayer} />
                <Layer {...outlineLayer} />
                <Layer {...labelLayer} />
              </Source>
            )}
          </Map>
          <div className="pdv-map-controls">
            <button
              className="pdv-map-ctrl-btn"
              title="Zoom in"
              onClick={() =>
                mapRef.current?.getMap?.().zoomIn({ duration: 300 })
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <div className="pdv-map-ctrl-divider" />
            <button
              className="pdv-map-ctrl-btn"
              title="Zoom out"
              onClick={() =>
                mapRef.current?.getMap?.().zoomOut({ duration: 300 })
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <div className="pdv-map-ctrl-divider" />
            <button
              className="pdv-map-ctrl-btn"
              title="Fit to area"
              onClick={() => fitToBounds(mapRef.current?.getMap?.())}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Schedule panel */}
        <div className="pdv-schedule-panel">
          {/* Date tabs */}
          <div className="pdv-date-tabs">
            {dateRange.map((d) => (
              <button
                key={d}
                className={`pdv-date-tab ${activeDate === d ? "pdv-date-tab-active" : ""}`}
                onClick={() => setActiveDate(d)}
              >
                {formatTabDate(d)}
                {d === todayStr() && <span className="pdv-today-dot" />}
              </button>
            ))}
          </div>

          {/* Shift tabs — only show shifts the patroller is assigned to */}
          <div className="pdv-shift-tabs">
            {myShifts.map((s) => (
              <button
                key={s}
                className={`pdv-shift-tab ${activeShift === s ? "pdv-shift-tab-active" : ""}`}
                onClick={() => setActiveShift(s)}
              >
                {s} Shift
              </button>
            ))}
          </div>

          {/* Timetable */}
          <div className="pdv-timetable-label">
            {activeShift} SHIFT — {formatTabDate(activeDate)}
          </div>
          <div className="pdv-timetable-wrap">
            {routesForDateShift.length === 0 ? (
              <div className="pdv-timetable-empty">
                No tasks scheduled for this shift.
              </div>
            ) : (
              <table className="pdv-timetable">
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>TASK / COMMENT</th>
                  </tr>
                </thead>
                <tbody>
                  {routesForDateShift.map((r) => (
                    <tr key={r.route_id}>
                      <td className="pdv-tt-time">
                        {formatTime(r.time_start)} — {formatTime(r.time_end)}
                      </td>
                      <td className="pdv-tt-task">
                        {r.notes || <em className="pdv-no-task">No task</em>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────
const PatrollerDashboardView = () => {
  const [patrols, setPatrols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geoJSONData, setGeoJSON] = useState(null);
  const [notif, setNotif] = useState(null);
  const [selectedBeat, setSelectedBeat] = useState(null);

  // Role detection
  const isPatroller = getMyRole() !== "Administrator";

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [barangayFilter, setBarangay] = useState("");
  const [appliedFilters, setApplied] = useState({
    search: "",
    status: "",
    dateFrom: "",
    dateTo: "",
    barangay: "",
  });
  const [filtersActive, setFiltersActive] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Load patrols
  const fetchPatrols = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/my-patrols`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setPatrols(data.data);
    } catch (err) {
      console.error("PatrollerDashboardView fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatrols();
    fetch("/bacoor_barangays.geojson")
      .then((r) => r.json())
      .then(setGeoJSON)
      .catch((err) => console.error("GeoJSON error:", err));
  }, []);

  // Active patrol first, then fallback to soonest upcoming
  const ongoingPatrol = patrols.find((p) => getPatrolStatus(p) === "active");
  const upcomingPatrol = !ongoingPatrol
    ? patrols
        .filter((p) => getPatrolStatus(p) === "upcoming")
        .sort(
          (a, b) => parseLocalDate(a.start_date) - parseLocalDate(b.start_date),
        )[0] || null
    : null;

  const featuredPatrol = ongoingPatrol || upcomingPatrol;
  const isUpcoming = !ongoingPatrol && !!upcomingPatrol;
  const myShifts = featuredPatrol ? getMyShiftsForPatrol(featuredPatrol) : [];

  // ── Section label ─────────────────────────────────────
  const sectionLabel = ongoingPatrol
    ? "ONGOING SHIFT"
    : upcomingPatrol
      ? "UPCOMING SHIFT"
      : "ONGOING SHIFT";

  // ── Filter logic ──────────────────────────────────────
  const STATUS_ORDER = { active: 0, upcoming: 1, completed: 2, unknown: 3 };

  const applyFilters = () => {
    setApplied({
      search,
      status: statusFilter,
      dateFrom,
      dateTo,
      barangay: barangayFilter,
    });
    setFiltersActive(
      search !== "" ||
        statusFilter !== "" ||
        dateFrom !== "" ||
        dateTo !== "" ||
        barangayFilter !== "",
    );
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setBarangay("");
    setApplied({
      search: "",
      status: "",
      dateFrom: "",
      dateTo: "",
      barangay: "",
    });
    setFiltersActive(false);
    setPage(1);
  };

  const filtered = patrols
    .filter((p) => {
      const status = getPatrolStatus(p);
      const {
        search: s,
        status: st,
        dateFrom: df,
        dateTo: dt,
        barangay: bg,
      } = appliedFilters;
      if (
        s &&
        !(p.patrol_name || "").toLowerCase().includes(s.toLowerCase()) &&
        !(p.mobile_unit_name || "").toLowerCase().includes(s.toLowerCase())
      )
        return false;
      if (st && status !== st) return false;
      if (df && new Date(p.start_date) < new Date(df)) return false;
      if (dt && new Date(p.end_date) > new Date(dt)) return false;
      if (bg) {
        const bgs = (p.routes || [])
          .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
          .map((r) => r.barangay.toLowerCase());
        if (!bgs.some((b) => b.includes(bg.toLowerCase()))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const sa = STATUS_ORDER[getPatrolStatus(a)] ?? 3;
      const sb = STATUS_ORDER[getPatrolStatus(b)] ?? 3;
      if (sa !== sb) return sa - sb;
      return new Date(b.start_date) - new Date(a.start_date);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="pdv-wrap">
      {/* ── PAGE HEADER ── */}
      <div className="pdv-page-header">
        <div>
          <h1 className="pdv-page-title">
            {isPatroller ? "Patrol Assignment" : "Patrol Scheduling"}
          </h1>
          <p className="pdv-page-sub">
            {isPatroller
              ? "View your patrol schedules and assignments"
              : "Real-time Patroller status and monitoring"}
          </p>
        </div>
      </div>

      {/* ── ONGOING / UPCOMING SHIFT ── */}
      <section className="pdv-section">
        <div className="pdv-section-heading">
          <span className="pdv-section-label">{sectionLabel}</span>
        </div>

        {loading ? (
          <div className="pdv-loading-card">Loading patrol data…</div>
        ) : featuredPatrol ? (
          <OngoingShiftCard
            patrol={featuredPatrol}
            geoJSONData={geoJSONData}
            myShifts={myShifts.length > 0 ? myShifts : ["AM"]}
            isUpcoming={isUpcoming}
          />
        ) : (
          <div className="pdv-no-ongoing">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#adb5bd"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div>
              <div className="pdv-no-ongoing-title">
                No active or upcoming patrol
              </div>
              <div className="pdv-no-ongoing-sub">
                You have no patrol assignment scheduled.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── ASSIGNED PATROLS ── */}
      <section className="pdv-section">
        <div className="pdv-section-heading">
          <span className="pdv-section-label">ASSIGNED PATROLS</span>
        </div>

        {/* Filter bar */}
        <div className="pdv-filterbar">
          <div className="pdv-filterbar-icon">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </div>
          <input
            className="pdv-filter-input"
            type="text"
            placeholder="Search patrol or unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
          <select
            className="pdv-filter-select"
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </select>
          <div className="pdv-filter-date-group">
            <input
              type="date"
              className="pdv-filter-date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="pdv-filter-arrow">→</span>
            <input
              type="date"
              className="pdv-filter-date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <input
            className="pdv-filter-input pdv-filter-barangay"
            type="text"
            placeholder="Filter by barangay..."
            value={barangayFilter}
            onChange={(e) => setBarangay(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
          <button className="pdv-filter-apply" onClick={applyFilters}>
            Apply Filters
          </button>
          {filtersActive && (
            <button
              className="pdv-filter-reset"
              onClick={clearFilters}
              title="Clear filters"
            >
              ↺
            </button>
          )}
        </div>

        {/* Table */}
        <div className="pdv-table-card">
          <div className="pdv-table-container">
            <table className="pdv-table">
              <thead>
                <tr>
                  <th>PATROL NAME</th>
                  <th>STATUS</th>
                  <th>MOBILE UNIT</th>
                  <th>DURATION</th>
                  {isPatroller ? (
                    <th>MY SHIFT</th>
                  ) : (
                    <th>ASSIGNED PATROLLERS</th>
                  )}
                  <th>AREA OF RESPONSIBILITY</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="pdv-table-empty">
                      Loading…
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="pdv-table-empty">
                      No patrol assignments found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((patrol) => {
                    const status = getPatrolStatus(patrol);
                    const patrollers = patrol.patrollers || [];
                    const amCount = patrollers.filter(
                      (p) => p.shift === "AM",
                    ).length;
                    const pmCount = patrollers.filter(
                      (p) => p.shift === "PM",
                    ).length;
                    const myShiftsForRow = getMyShiftsForPatrol(patrol);
                    const barangays = [
                      ...new Set(
                        (patrol.routes || [])
                          .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
                          .map((r) => r.barangay),
                      ),
                    ];

                    return (
                      <tr key={patrol.patrol_id}>
                        <td>
                          <span className="pdv-patrol-name">
                            {patrol.patrol_name}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={status} />
                        </td>
                        <td>
                          <span className="pdv-unit-text">
                            {patrol.mobile_unit_name || "—"}
                          </span>
                        </td>
                        <td>
                          <span className="pdv-duration-text">
                            {formatDate(patrol.start_date)} —{" "}
                            {formatDate(patrol.end_date)}
                          </span>
                        </td>

                        {/* My Shift (patroller) OR Assigned Patrollers (admin) */}
                        {isPatroller ? (
                          <td>
                            {myShiftsForRow.length > 0 ? (
                              <div className="pdv-my-shifts-cell">
                                {myShiftsForRow.map((s) => (
                                  <ShiftBadge key={s} shift={s} />
                                ))}
                              </div>
                            ) : (
                              <span className="pdv-empty-cell">—</span>
                            )}
                          </td>
                        ) : (
                          <td>
                            {patrollers.length > 0 ? (
                              <div className="pdv-patroller-pills">
                                {amCount > 0 && (
                                  <span className="pdv-count-pill pdv-count-am">
                                    <svg
                                      width="11"
                                      height="11"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                    >
                                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                    </svg>
                                    {amCount} AM
                                  </span>
                                )}
                                {pmCount > 0 && (
                                  <span className="pdv-count-pill pdv-count-pm">
                                    <svg
                                      width="11"
                                      height="11"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                    >
                                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                    </svg>
                                    {pmCount} PM
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="pdv-empty-cell">—</span>
                            )}
                          </td>
                        )}

                        <td>
                          {barangays.length > 0 ? (
                            <div className="pdv-brgy-pills">
                              {barangays.slice(0, 2).map((b) => (
                                <span key={b} className="pdv-brgy-pill">
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  {b}
                                </span>
                              ))}
                              {barangays.length > 2 && (
                                <span className="pdv-brgy-more">
                                  +{barangays.length - 2} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="pdv-empty-cell">—</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="pdv-view-btn"
                            onClick={() => setSelectedBeat(patrol)}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="pdv-table-footer">
              <span className="pdv-footer-info">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} records
                {filtersActive && (
                  <span className="pdv-filtered-tag"> (filtered)</span>
                )}
              </span>
              <div className="pdv-pagination">
                <button
                  className="pdv-pg-btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="pdv-pg-current">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="pdv-pg-btn"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* BeatCard modal */}
      {selectedBeat && geoJSONData && (
        <BeatCard
          patrol={selectedBeat}
          geoJSONData={geoJSONData}
          onClose={() => setSelectedBeat(null)}
          onEdit={() => {}}
          onDelete={() => {}}
          hideEdit
          hideDelete
        />
      )}

      {notif && (
        <Notification
          message={notif.message}
          type={notif.type}
          onClose={() => setNotif(null)}
          duration={3500}
        />
      )}
    </div>
  );
};

export default PatrollerDashboardView;