import { useRef, useCallback, useState, useEffect } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./PatrolModal.css";
import { createPortal } from "react-dom";

const fillLayer    = { id: "bc-brgy-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 } };
const outlineLayer = { id: "bc-brgy-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 } };
const labelLayer   = {
  id: "bc-brgy-labels", type: "symbol",
  layout: { "text-field": ["get", "name_db"], "text-size": 10, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-max-width": 8, "text-anchor": "center", "text-allow-overlap": false },
  paint: { "text-color": "#0a1628", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 },
};

const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
const toLocalDateStr = (d) => {
  const dt = parseLocalDate(d);
  if (!dt) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};
const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const dates = [], cur = parseLocalDate(start), last = parseLocalDate(end);
  if (!cur || !last) return [];
  while (cur <= last) { dates.push(toLocalDateStr(cur)); cur.setDate(cur.getDate()+1); }
  return dates;
};
const formatTabDate  = (d) => { const dt = parseLocalDate(d); return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"; };
const formatFullDate = (d) => { const dt = parseLocalDate(d); return dt ? dt.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "—"; };
const formatDate     = (d) => { const dt = parseLocalDate(d); return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"; };
const formatTime     = (t) => t ? t.substring(0, 5) : "—";

const BeatCard = ({ patrol, geoJSONData, onClose, onEdit, onDelete }) => {
  const mapRef = useRef(null);

  const dateRange = generateDateRange(patrol?.start_date, patrol?.end_date);
  const [activeDate, setActiveDate]   = useState(dateRange[0] || null);
  const [activeShift, setActiveShift] = useState("AM");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hoveredPatroller, setHoveredPatroller]   = useState(null);
  const [hoverAnchor, setHoverAnchor]             = useState(null);

  useEffect(() => {
    if (dateRange.length > 0) setActiveDate(dateRange[0]);
  }, [patrol]);

  // Timetable routes for current date + shift (stop_order > 0)
  const routesForDateShift = (patrol?.routes || [])
    .filter((r) => toLocalDateStr(r.route_date) === activeDate && r.shift === activeShift && (r.stop_order || 0) > 0)
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  // Barangays for map (stop_order <= 0)
  const barangays = [...new Set(
    (patrol?.routes || []).filter((r) => (r.stop_order || 0) <= 0 && r.barangay).map((r) => r.barangay).filter(Boolean)
  )];

  // Patrollers split by shift
  const amPatrollers = (patrol?.patrollers_detail || patrol?.patrollers || [])
  .filter((p) => p.shift === "AM" && toLocalDateStr(p.route_date) === activeDate);
const pmPatrollers = (patrol?.patrollers_detail || patrol?.patrollers || [])
  .filter((p) => p.shift === "PM" && toLocalDateStr(p.route_date) === activeDate);
  const currentPatrollers = activeShift === "AM" ? amPatrollers : pmPatrollers;

  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData || !patrol) return null;
    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: barangays.includes(f.properties.name_db) ? "#1e3a5f" : "#e9ecef",
        },
      })),
    };
  }, [geoJSONData, patrol]);

  if (!patrol) return null;

  return (
    <div className="bc-overlay" onClick={onClose}>
      <div className="bc-modal" onClick={(e) => e.stopPropagation()}>

        {/* HEADER */}
        <div className="bc-header">
          <div className="bc-header-left">
            <h2 className="bc-patrol-name">{patrol.patrol_name}</h2>
            <div className="bc-header-meta">
              <span className="bc-duration">{formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}</span>
              <span className="bc-unit">{patrol.mobile_unit_name}</span>
            </div>
          </div>
          <div className="bc-header-actions">
            <button className="bc-btn bc-btn-edit"   onClick={onEdit}>Edit</button>
            <button className="bc-btn bc-btn-delete" onClick={() => setShowDeleteConfirm(true)}>Delete</button>
            <button className="bc-btn bc-btn-close"  onClick={onClose}>✕</button>
          </div>
        </div>

        {/* BODY */}
        <div className="bc-body">

          {/* LEFT — Map */}
          <div className="bc-map-panel">
            <Map
              ref={mapRef}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              initialViewState={{ longitude: 120.964, latitude: 14.4341, zoom: 12 }}
              style={{ width: "100%", height: "100%" }}
              mapStyle="mapbox://styles/mapbox/light-v11"
            >
              {buildGeoJSON() && (
                <Source id="bc-barangays" type="geojson" data={buildGeoJSON()}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}
            </Map>
          </div>

          {/* RIGHT */}
          <div className="bc-info-panel">

            {/* ── Date tabs — at very top of right panel ── */}
            {dateRange.length > 0 && (
              <div className="bc-date-tabs">
                {dateRange.map((date) => (
                  <button key={date}
                    className={`bc-date-tab ${activeDate === date ? "bc-date-tab-active" : ""}`}
                    onClick={() => setActiveDate(date)}>
                    {formatTabDate(date)}
                  </button>
                ))}
              </div>
            )}

            {/* ── Shift tabs — controls patrollers AND timetable ── */}
            <div className="bc-shift-tabs-top">
              <button
                className={`bc-shift-tab-top ${activeShift === "AM" ? "bc-shift-active" : ""}`}
                onClick={() => setActiveShift("AM")}
              >
                AM Shift
                {amPatrollers.length > 0 && <span className="bc-shift-badge">{amPatrollers.length}</span>}
              </button>
              <button
                className={`bc-shift-tab-top ${activeShift === "PM" ? "bc-shift-active" : ""}`}
                onClick={() => setActiveShift("PM")}
              >
                PM Shift
                {pmPatrollers.length > 0 && <span className="bc-shift-badge">{pmPatrollers.length}</span>}
              </button>
            </div>

            {/* Patrollers — filtered by active shift, shown per date */}
            <div className="bc-section">
              <div className="bc-section-title">{activeShift} Shift Patrollers</div>
              {currentPatrollers.length > 0 ? (
                <div className="bc-patroller-table-wrap">
                  <table className="bc-patroller-table">
                    <thead>
                      <tr>
                        <th>Rank &amp; Name</th>
                        <th>Contact Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPatrollers.map((p) => (
                        <tr key={p.active_patroller_id}>
                          <td
                            className="bc-pt-name"
                            onMouseEnter={(e) => { setHoveredPatroller(p); setHoverAnchor(e.currentTarget); }}
                            onMouseLeave={() => { setHoveredPatroller(null); setHoverAnchor(null); }}
                            style={{ cursor: "default" }}
                          >
                            {p.rank ? `${p.rank} ${p.officer_name}` : p.officer_name}
                          </td>
                          <td className="bc-pt-contact">{p.contact_number || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="bc-empty">No patrollers assigned to {activeShift} shift.</p>}
            </div>

            {/* Timetable — filtered by activeDate + activeShift */}
            <div className="bc-section bc-section-grow">
              <div className="bc-timetable-header">
                <div className="bc-section-title">{activeShift} Shift — {formatTabDate(activeDate)}</div>
              </div>

              {routesForDateShift.length > 0 ? (
                <div className="bc-timetable-wrap">
                  <table className="bc-timetable">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Task / Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routesForDateShift.map((r) => (
                        <tr key={r.route_id}>
                          <td className="bc-tt-time">{formatTime(r.time_start)} — {formatTime(r.time_end)}</td>
                          <td className="bc-tt-task">{r.notes || <em className="bc-empty">No task</em>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="bc-empty">No tasks for this date and shift.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          patrolName={patrol.patrol_name}
          onConfirm={() => { setShowDeleteConfirm(false); onDelete(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {hoveredPatroller && hoverAnchor && (
        <PatrollerHoverCard patroller={hoveredPatroller} anchorEl={hoverAnchor} />
      )}
    </div>
  );
};

const DeleteConfirmDialog = ({ patrolName, onConfirm, onCancel }) => {
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff", borderRadius: "12px", padding: "28px 28px 22px",
          width: "360px", boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", gap: "12px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "17px", fontWeight: 700, color: "#0a1628" }}>Delete Patrol</div>
        <div style={{ fontSize: "13px", color: "#6c757d", lineHeight: 1.6 }}>
          Are you sure you want to delete <strong style={{ color: "#212529" }}>{patrolName}</strong>?
          This action cannot be undone.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px", background: "transparent", border: "1px solid #ced4da",
              borderRadius: "7px", fontSize: "13px", fontWeight: 500, color: "#495057",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 20px", background: "#dc2626", border: "none",
              borderRadius: "7px", fontSize: "13px", fontWeight: 700, color: "#fff",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const PatrollerHoverCard = ({ patroller, anchorEl }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
  }, [anchorEl]);

  const initials = patroller.officer_name
    ? patroller.officer_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "??";

  return createPortal(
    <div
      style={{
        position: "fixed", top: pos.top, left: pos.left, zIndex: 1300,
        background: "#fff", border: "1px solid #dee2e6", borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: "16px", minWidth: "200px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "52px", height: "52px", borderRadius: "50%",
          background: "#1e3a5f", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", fontWeight: 700,
        }}
      >
        {initials}
      </div>
      <div style={{ fontWeight: 700, fontSize: "14px", color: "#0a1628", textAlign: "center" }}>
        {patroller.rank ? `${patroller.rank} ${patroller.officer_name}` : patroller.officer_name}
      </div>
      {patroller.contact_number && (
        <div style={{ fontSize: "12px", color: "#6c757d" }}>{patroller.contact_number}</div>
      )}
    </div>,
    document.body
  );
};

export default BeatCard;