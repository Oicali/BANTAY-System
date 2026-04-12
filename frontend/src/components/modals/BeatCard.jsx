import { useRef, useCallback, useState, useEffect } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./BeatCard.css";

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
              <span className="bc-unit">🚓 {patrol.mobile_unit_name}</span>
            </div>
          </div>
          <div className="bc-header-actions">
            <button className="bc-btn bc-btn-edit"   onClick={onEdit}>Edit</button>
            <button className="bc-btn bc-btn-delete" onClick={onDelete}>Delete</button>
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

            {/* Patrollers — table form */}
            <div className="bc-section">
              <div className="bc-section-title">Assigned Patrollers</div>
              {patrol.patrollers?.length > 0 ? (
                <div className="bc-patroller-table-wrap">
                  <table className="bc-patroller-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Rank &amp; Name</th>
                        <th>Contact Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateRange.map((date) =>
                        patrol.patrollers.map((p, pi) => (
                          <tr key={`${date}-${p.active_patroller_id}`}>
                            {pi === 0 && (
                              <td rowSpan={patrol.patrollers.length} className="bc-pt-date">
                                {formatFullDate(date)}
                              </td>
                            )}
                            <td className="bc-pt-name">{p.rank ? `${p.rank} ${p.officer_name}` : p.officer_name}</td>
                            <td className="bc-pt-contact">{p.contact_number || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : <p className="bc-empty">No patrollers assigned.</p>}
            </div>

            {/* Timetable — date tabs + AM/PM shift tabs */}
            <div className="bc-section bc-section-grow">

              {/* Date tabs */}
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

              {/* AM/PM shift tabs */}
              <div className="bc-timetable-header">
                <div className="bc-section-title">Time Table</div>
                <div className="bc-shift-tabs">
                  <button className={`bc-shift-tab ${activeShift === "AM" ? "bc-shift-active" : ""}`} onClick={() => setActiveShift("AM")}>AM Shift</button>
                  <button className={`bc-shift-tab ${activeShift === "PM" ? "bc-shift-active" : ""}`} onClick={() => setActiveShift("PM")}>PM Shift</button>
                </div>
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
    </div>
  );
};

export default BeatCard;