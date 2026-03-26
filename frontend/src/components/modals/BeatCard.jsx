import { useRef, useCallback, useState, useEffect } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./BeatCard.css";

const API_BASE = import.meta.env.VITE_API_URL;

const fillLayer    = { id: "bc-brgy-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 } };
const outlineLayer = { id: "bc-brgy-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 } };
const labelLayer   = {
  id: "bc-brgy-labels", type: "symbol",
  layout: { "text-field": ["get", "name_db"], "text-size": 10, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-max-width": 8, "text-anchor": "center", "text-allow-overlap": false },
  paint: { "text-color": "#0a1628", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 },
};

const SHIFT_LABELS = {
  Morning:   "Morning (6AM - 2PM)",
  Afternoon: "Afternoon (2PM - 10PM)",
  Night:     "Night (10PM - 6AM)",
};

const parseLocalDate = (d) => {
  if (!d) return null;

  const date = new Date(d);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
};

const toLocalDateStr = (d) => {
  const date = parseLocalDate(d);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const generateDateRange = (start, end) => {
  if (!start || !end) return [];

  const dates = [];
  let cur  = new Date(parseLocalDate(start));
  const last = parseLocalDate(end);

  while (cur <= last) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
};

const BeatCard = ({ patrol, geoJSONData, onClose, onEdit, onDelete }) => {
  const token  = () => localStorage.getItem("token");
  const mapRef = useRef(null);

  const dateRange  = generateDateRange(patrol?.start_date, patrol?.end_date);
  const [activeDate, setActiveDate] = useState(dateRange[0] || null);

  // ✅ FIX: ensure activeDate updates when patrol changes
  useEffect(() => {
    if (dateRange.length > 0) {
      setActiveDate(dateRange[0]);
    }
  }, [patrol]);

  const [localRoutes, setLocalRoutes] = useState([]);
  const saveTimers = useRef({});

  useEffect(() => {
    if (patrol?.routes) setLocalRoutes(patrol.routes);
  }, [patrol]);

  const routesForDate = localRoutes
    .filter((r) => toLocalDateStr(r.route_date) === activeDate)
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  const handleNotesChange = (routeId, value) => {
    setLocalRoutes((prev) =>
      prev.map((r) => r.route_id === routeId ? { ...r, notes: value } : r)
    );
    clearTimeout(saveTimers.current[routeId]);
    saveTimers.current[routeId] = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/patrol/routes/${routeId}/notes`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body:    JSON.stringify({ notes: value }),
        });
      } catch (err) { console.error("Auto-save error:", err); }
    }, 800);
  };

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
  const formatDate    = (d)    => {
    const date = parseLocalDate(d);
    if (!date) return "—";
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  };
  const formatTabDate = (d)    => {
    const date = parseLocalDate(d);
    if (!date) return "—";
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };
  const formatTime    = (t)    => t ? t.substring(0, 5) : "—";

  if (!patrol) return null;

  return (
    <div className="bc-overlay" onClick={onClose}>
      <div className="bc-modal" onClick={(e) => e.stopPropagation()}>

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

        <div className="bc-body">

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

          <div className="bc-info-panel">

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
                            <textarea
  className="bc-notes-input"
  value={r.notes || ""}
  placeholder="Add notes..."
  onChange={(e) => {
    handleNotesChange(r.route_id, e.target.value);

    // 🔥 auto expand
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  }}
  rows={1}
/>
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