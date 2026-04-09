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

const SHIFT_LABELS = { Morning: "Morning", Night: "Night" };

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

const BeatCard = ({ patrol, geoJSONData, onClose, onEdit, onDelete }) => {
  const mapRef = useRef(null);

  const dateRange = generateDateRange(patrol?.start_date, patrol?.end_date);
  const [activeDate, setActiveDate] = useState(dateRange[0] || null);

  useEffect(() => {
    if (dateRange.length > 0) setActiveDate(dateRange[0]);
  }, [patrol]);

  const routesForDate = (patrol?.routes || [])
    .filter((r) => toLocalDateStr(r.route_date) === activeDate)
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData || !patrol) return null;
    const assigned = [...new Set((patrol.routes || []).map((r) => r.barangay).filter(Boolean))];
    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: assigned.includes(f.properties.name_db) ? "#1e3a5f" : "#e9ecef",
        },
      })),
    };
  }, [geoJSONData, patrol]);

  const getInitials   = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";
  const formatDate    = (d) => { const dt = parseLocalDate(d); return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"; };
  const formatTabDate = (d) => { const dt = parseLocalDate(d); return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"; };
  const formatTime    = (t) => t ? t.substring(0, 5) : "—";

  if (!patrol) return null;

  return (
    <div className="bc-overlay" onClick={onClose}>
      <div className="bc-modal" onClick={(e) => e.stopPropagation()}>

        {/* HEADER */}
        <div className="bc-header">
          <div className="bc-header-left">
            <h2 className="bc-patrol-name">{patrol.patrol_name}</h2>
            <div className="bc-header-meta">
              <span className={`bc-shift-badge bc-shift-${patrol.shift?.toLowerCase()}`}>
                {SHIFT_LABELS[patrol.shift] || patrol.shift}
              </span>
              <span className="bc-duration">{formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}</span>
              <span className="bc-unit">{patrol.mobile_unit_name}</span>
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

          {/* RIGHT — Patrollers + Timetable */}
          <div className="bc-info-panel">

            {/* Patrollers */}
            <div className="bc-section">
              <div className="bc-section-title">Assigned Patrollers</div>
              {patrol.patrollers?.length > 0 ? (
                <div className="bc-patroller-list">
                  {patrol.patrollers.map((p) => (
                    <div key={p.active_patroller_id} className="bc-patroller-row">
                      <div className="bc-avatar">{getInitials(p.officer_name)}</div>
                      <span className="bc-patroller-name">{p.officer_name}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="bc-empty">No patrollers assigned.</p>}
            </div>

            {/* Time Table — read only */}
            <div className="bc-section bc-section-grow">
              <div className="bc-section-title">Time Table</div>

              {dateRange.length > 0 && (
                <div className="bc-date-tabs">
                  {dateRange.map((date) => (
                    <button
                      key={date}
                      className={`bc-date-tab ${activeDate === date ? "bc-date-tab-active" : ""}`}
                      onClick={() => setActiveDate(date)}
                    >
                      {formatTabDate(date)}
                    </button>
                  ))}
                </div>
              )}

              {routesForDate.length > 0 ? (
                <div className="bc-timetable-wrap">
                  <table className="bc-timetable">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Notes</th>
                        <th>Barangay Area</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routesForDate.map((r) => (
                        <tr key={r.route_id}>
                          <td className="bc-tt-time">{formatTime(r.time_start)} — {formatTime(r.time_end)}</td>
                          <td className="bc-tt-notes">
                            <span className="bc-notes-text">{r.notes || <em className="bc-notes-empty">No notes</em>}</span>
                          </td>
                          <td className="bc-tt-brgy">{r.barangay}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="bc-empty">No stops for this date.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeatCard;