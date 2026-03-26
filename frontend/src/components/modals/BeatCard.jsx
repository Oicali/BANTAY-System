import { useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./BeatCard.css";

// ── Map layer styles ───────────────────────────────────────
const fillLayer = {
  id: "bc-brgy-fill",
  type: "fill",
  paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 },
};

const outlineLayer = {
  id: "bc-brgy-outline",
  type: "line",
  paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 },
};

const labelLayer = {
  id: "bc-brgy-labels",
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

const SHIFT_LABELS = {
  Morning:   "Morning (6AM - 2PM)",
  Afternoon: "Afternoon (2PM - 10PM)",
  Night:     "Night (10PM - 6AM)",
};

const BeatCard = ({ patrol, geoJSONData, onClose, onEdit, onDelete }) => {
  const mapRef = useRef(null);

  // ── Build GeoJSON — highlight assigned barangays ───────
  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData || !patrol) return null;
    const assignedBrgys = [...new Set(
      (patrol.routes || []).map((r) => r.barangay).filter(Boolean)
    )];

    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: assignedBrgys.includes(f.properties.name_db)
            ? "#1e3a5f"
            : "#e9ecef",
        },
      })),
    };
  }, [geoJSONData, patrol]);

  // ── Helpers ────────────────────────────────────────────
  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";
  const formatDate  = (d)    => d
    ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
    : "—";
  const formatTime  = (t)    => t ? t.substring(0, 5) : "—";

  const mapGeoJSON = buildGeoJSON();

  if (!patrol) return null;

  const uniqueRoutes = (patrol.routes || []).filter(
    (r, i, arr) => arr.findIndex((x) => x.barangay === r.barangay) === i
  );

  return (
    <div className="bc-overlay" onClick={onClose}>
      <div className="bc-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── HEADER ── */}
        <div className="bc-header">
          <div className="bc-header-left">
            <h2 className="bc-patrol-name">{patrol.patrol_name}</h2>
            <div className="bc-header-meta">
              <span className={`bc-shift-badge bc-shift-${patrol.shift?.toLowerCase()}`}>
                {SHIFT_LABELS[patrol.shift] || patrol.shift}
              </span>
              <span className="bc-duration">
                {formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}
              </span>
              <span className="bc-unit">
                {patrol.mobile_unit_name}
              </span>
            </div>
          </div>
          <div className="bc-header-actions">
            <button className="bc-btn bc-btn-edit" onClick={onEdit}>Edit</button>
            <button className="bc-btn bc-btn-delete" onClick={onDelete}>Delete</button>
            <button className="bc-btn bc-btn-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── BODY ── */}
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
              {mapGeoJSON && (
                <Source id="bc-barangays" type="geojson" data={mapGeoJSON}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}
            </Map>
          </div>

          {/* RIGHT — Info panels */}
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
              ) : (
                <p className="bc-empty">No patrollers assigned.</p>
              )}
            </div>

            {/* Time Table */}
            <div className="bc-section bc-section-grow">
              <div className="bc-section-title">Time Table</div>
              {uniqueRoutes.length > 0 ? (
                <div className="bc-timetable">
                  {uniqueRoutes.map((r, i) => (
                    <div key={i} className="bc-timetable-row">
                      <div className="bc-timetable-time">
                        {formatTime(r.time_start)} — {formatTime(r.time_end)}
                      </div>
                      <div className="bc-timetable-info">
                        <span className="bc-timetable-brgy">{r.barangay}</span>
                        {r.notes && <span className="bc-timetable-notes">{r.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="bc-empty">No route stops set.</p>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default BeatCard;