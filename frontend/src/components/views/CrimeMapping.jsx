import React, { useState, useEffect, useCallback } from "react";
import Map, { Source, Layer, Marker, Popup } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./CrimeMapping.css";
import { CURRENT_BARANGAYS, LEGACY_BARANGAY_OPTIONS } from "../../utils/barangayOptions";

const API = `${import.meta.env.VITE_API_URL}/crime-map`;
const getToken = () => localStorage.getItem("token");

const INCIDENT_COLORS = {
  "ROBBERY": "#ef4444",
  "THEFT": "#f97316",
  "PHYSICAL INJURIES": "#eab308",
  "HOMICIDE": "#8b5cf6",
  "MURDER": "#7c3aed",
  "RAPE": "#ec4899",
  "CARNAPPING - MC": "#3b82f6",
"CARNAPPING - MV": "#0ea5e9",
  "SPECIAL COMPLEX CRIME": "#14b8a6",
};

const LEGEND_ITEMS = [
  { label: "Robbery", color: "#ef4444" },
  { label: "Theft", color: "#f97316" },
  { label: "Physical Injuries", color: "#eab308" },
  { label: "Homicide", color: "#8b5cf6" },
  { label: "Murder", color: "#7c3aed" },
  { label: "Rape", color: "#ec4899" },
  { label: "Carnapping - MC", color: "#3b82f6" },
{ label: "Carnapping - MV", color: "#0ea5e9" },
  { label: "Special Complex Crime", color: "#14b8a6" },
];

const RISK_LEVELS = [
  { color: "#ef4444", label: "High Risk (4+)" },
  { color: "#f97316", label: "Medium Risk (2–3)" },
  { color: "#22c55e", label: "Low Risk (1)" },
  { color: "#adb5bd", label: "No Crimes (0)" },
];

function CrimeMapping() {
  const [boundaries, setBoundaries] = useState([]);
  const [pins, setPins] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPin, setSelectedPin] = useState(null);
  const [zoom, setZoom] = useState(12);
  const [error, setError] = useState(null);
 const [filters, setFilters] = useState({ incident_type: "", date_from: "", date_to: "", barangay: "" });
  const formatBarangayLabel = (name) => {
  const ROMAN = new Set(['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']);
  return name
    .toLowerCase()
    .replace(/\b\w+/g, word => {
      const upper = word.toUpperCase();
      if (ROMAN.has(upper)) return upper;
      // Handle P.F. — keep dots
      if (upper === 'P' || upper === 'F') return upper;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
};
  const [geoJSONData, setGeoJSONData] = useState(null);
  const [activeTab, setActiveTab] = useState("legend");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMorePopup, setShowMorePopup] = useState(false);
  const [hoveredBarangay, setHoveredBarangay] = useState(null); 
  const [showBrgyTooltip, setShowBrgyTooltip] = useState(true);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [showPins, setShowPins] = useState(true);
const [showLabels, setShowLabels] = useState(true);
  const mapRef = React.useRef(null);
  const totalBarangays = geoJSONData ? new Set(geoJSONData.features.map(f => f.properties.name_db)).size : 47;
const buildGeoJSON = useCallback(() => {
  if (!boundaries.length || !geoJSONData) return null;

  const colorLookup = {};
  boundaries.forEach(b => { colorLookup[b.name_kml] = b.color; });

  return {
    ...geoJSONData,
    features: geoJSONData.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        fillColor: colorLookup[f.properties.name_kml] || "#adb5bd",
      }
    }))
  };
}, [boundaries, geoJSONData]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.incident_type) params.append("incident_type", filters.incident_type);
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      if (filters.barangay) params.append("barangay", filters.barangay);
      const q = params.toString() ? `?${params}` : "";
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [bRes, pRes, sRes] = await Promise.all([
        fetch(`${API}/boundaries${q}`, { headers }),
        fetch(`${API}/pins${q}`, { headers }),
        fetch(`${API}/statistics${q}`, { headers }),
      ]);
      const [bData, pData, sData] = await Promise.all([bRes.json(), pRes.json(), sRes.json()]);
      if (bData.success) setBoundaries(bData.data);
      if (pData.success) setPins(pData.data);
      if (sData.success) setStats(sData.data);
    } catch (err) {
      console.error("CrimeMap fetch error:", err);
      setError("Failed to load map data. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [filters]);
const handleMapDblClick = useCallback((e) => {
  if (!geoJSONData) return;
  const { lng, lat } = e.lngLat;

  // Check if click is inside any barangay boundary (point-in-polygon)
  const inside = (point, vs) => {
    let x = point[0], y = point[1], inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };

  for (const feature of geoJSONData.features) {
    const geom = feature.geometry;
    const rings = geom.type === "Polygon" ? [geom.coordinates[0]] : geom.coordinates.map(p => p[0]);
    for (const ring of rings) {
      if (inside([lng, lat], ring)) {
        // Found the barangay — zoom to its bounds
        const allCoords = geom.type === "Polygon"
          ? geom.coordinates[0]
          : geom.coordinates.flat(1);
        const lngs = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [centerLng, centerLat], zoom: 15, duration: 1000 });
        }
        return;
      }
    }
  }
}, [geoJSONData]);

 useEffect(() => {
    fetch("/bacoor_barangays.geojson")
      .then(r => r.json())
      .then(data => setGeoJSONData(data))
      .catch(err => console.error("GeoJSON load error:", err));
  }, []); // runs once

useEffect(() => {
  fetchAll();
}, [filters.incident_type, filters.barangay]);

  const geoJSON = buildGeoJSON();

  const fillLayer = {
    id: "barangay-fill",
    type: "fill",
    paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.4 }
  };

  const outlineLayer = {
    id: "barangay-outline",
    type: "line",
    paint: { "line-color": "#1e3a5f", "line-width": 1.2, "line-opacity": 0.5 }
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
    "text-color": "#0a1628",
    "text-halo-color": "rgba(255,255,255,0.85)",
    "text-halo-width": 1.5,
  }
};

  const formatDate = (d) => {
    if (!d) return "N/A";
    return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  };

  const topCrime = stats?.by_incident_type?.[0];

  return (
    <div className="crmap-wrapper">

      {/* HEADER */}
      <div className="crmap-header">
        <div className="crmap-header-left">
          <div className="crmap-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div>
            <h1 className="crmap-title">Crime Mapping</h1>
            <p className="crmap-subtitle">Geographic visualization of crime incidents in Bacoor City</p>
          </div>
        </div>
        <div className="crmap-stat-pills">
          {[
            { val: stats?.total_pins ?? "—", lbl: "Total Pins", red: false },
            { val: stats?.high_risk_count ?? "—", lbl: "Hotspots", red: true },
            { 
                val: `${boundaries.filter(b => b.crime_count > 0).length}/${totalBarangays}`, 
                lbl: "Brgy. Affected", 
                red: false 
              },
            { val: stats?.by_incident_type?.length ?? "—", lbl: "Crime Types", red: false },
          ].map(s => (
            <div key={s.lbl} className={`crmap-pill ${s.red ? "crmap-pill-red" : ""}`}>
              <span className="crmap-pill-val">{s.val}</span>
              <span className="crmap-pill-lbl">{s.lbl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="crmap-filterbar">
        <div className="crmap-filterbar-inner">
          <div className="crmap-filter-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
          </div>
          <select className="crmap-fsel" value={filters.incident_type}
            onChange={e => setFilters(f => ({ ...f, incident_type: e.target.value }))}>
            <option value="">All Crime Types</option>
            <option value="ROBBERY">Robbery</option>
            <option value="THEFT">Theft</option>
            <option value="PHYSICAL INJURIES">Physical Injuries</option>
            <option value="HOMICIDE">Homicide</option>
            <option value="MURDER">Murder</option>
            <option value="RAPE">Rape</option>
            <option value="CARNAPPING - MC">Carnapping - MC</option>
            <option value="CARNAPPING - MV">Carnapping - MV</option>
            <option value="SPECIAL COMPLEX CRIME">Special Complex Crime</option>
          </select>
          <select className="crmap-fsel" value={filters.barangay}
            onChange={e => {
              const selected = e.target.value;
              setFilters(f => ({ ...f, barangay: selected }));
              if (selected && geoJSONData) {
                const feature = geoJSONData.features.find(
                  f => f.properties.name_db === selected
                );
                if (feature && mapRef.current) {
                  const coords = feature.geometry.type === "Polygon"
                    ? feature.geometry.coordinates[0]
                    : feature.geometry.coordinates[0][0];
                  const lngs = coords.map(c => c[0]);
                  const lats = coords.map(c => c[1]);
                  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
                  mapRef.current.flyTo({ center: [centerLng, centerLat], zoom: 15, duration: 1200 });
                }
              } else if (!selected && mapRef.current) {
                mapRef.current.flyTo({ center: [120.9640, 14.4341], zoom: 12, duration: 1200 });
              }
            }}>
            <option value="">All Barangays</option>
          {CURRENT_BARANGAYS.map(b => (
            <option key={b} value={b}>
              {formatBarangayLabel(b)}
            </option>
          ))}
          <optgroup label="── Pre-2023 Names (Auto-resolved) ──">
            {LEGACY_BARANGAY_OPTIONS.map((b, idx) => (
              <option key={`legacy-${idx}`} value={b.value}>
                {b.label}
              </option>
            ))}
          </optgroup>
          </select>
          <div className="crmap-date-range">
            <input type="date" className="crmap-fsel crmap-fsel-date" value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
            <span className="crmap-date-arrow">→</span>
            <input type="date" className="crmap-fsel crmap-fsel-date" value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
          </div>
          <button className="crmap-apply-btn" onClick={fetchAll}>Apply Dates</button>
         <button className="crmap-clear-btn" onClick={() => {
          setFilters({ incident_type: "", date_from: "", date_to: "", barangay: "" });
          if (mapRef.current) mapRef.current.flyTo({ center: [120.9640, 14.4341], zoom: 12, duration: 800 });
        }}>Clear</button>
        </div>
        <div className="crmap-risk-row">
          {RISK_LEVELS.map(r => (
            <div key={r.label} className="crmap-risk-tag">
              <div className="crmap-risk-dot" style={{ background: r.color }} />
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BODY — just the map wrap, sidebar is INSIDE it */}
      <div className="crmap-body">
        <div className="crmap-map-wrap">

          {/* Loading overlay with spinner */}
          {loading && (
            <div className="crmap-loading-overlay">
              <div className="crmap-spinner" />
              <span className="crmap-loading-text">Loading map data...</span>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="crmap-error-banner">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
              <button onClick={fetchAll}>Retry</button>
            </div>
          )}

          {/* Empty state — filters returned nothing */}
          {!loading && !error && pins.length === 0 && boundaries.every(b => b.crime_count === 0) && (
            (filters.incident_type || filters.date_from || filters.date_to || filters.barangay) && (
              <div className="crmap-empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
                <div className="crmap-empty-title">No incidents found</div>
                <div className="crmap-empty-sub">Try adjusting your filters or clearing them to see all data.</div>
                <button onClick={() => setFilters({ incident_type: "", date_from: "", date_to: "", barangay: "" })}>
                  Clear Filters
                </button>
              </div>
            )
          )}

          {/* The actual Mapbox map */}
          <div className="crmap-map-inner">
            <Map
              ref={mapRef}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              initialViewState={{ longitude: 120.9640, latitude: 14.4341, zoom: 12 }}
              style={{ width: "100%", height: "100%" }}
              mapStyle="mapbox://styles/mapbox/light-v11"
              onZoom={e => setZoom(e.viewState.zoom)}
              onDblClick={handleMapDblClick}
              doubleClickZoom={false}
              onMouseMove={e => {
  if (!geoJSONData || !boundaries.length) return;
  const features = e.target.queryRenderedFeatures(e.point, { layers: ['barangay-fill'] });
  if (features.length > 0) {
    e.target.getCanvas().style.cursor = 'pointer';
    const name = features[0].properties.name_db;
    const boundary = boundaries.find(b => b.name_db === name);
    setHoveredBarangay({
      name,
      count: boundary?.crime_count ?? 0,
      risk: boundary?.risk ?? 'None',
      x: e.point.x,
      y: e.point.y,
    });
  } else {
    e.target.getCanvas().style.cursor = '';
    setHoveredBarangay(null);
  }
}}
onMouseLeave={() => {
  setHoveredBarangay(null);
  if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
}}
            >
              {geoJSON && (
                <Source id="barangays" type="geojson" data={geoJSON}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}

              {showPins && zoom >= 13 && pins.map(pin => (
                <Marker key={pin.blotter_id} longitude={pin.lng} latitude={pin.lat} anchor="bottom"
                  onClick={e => { e.originalEvent.stopPropagation(); setSelectedPin(pin); }}>
                  <div className="crmap-pin"
                    style={{ background: INCIDENT_COLORS[pin.incident_type?.toUpperCase()] || "#6b7280" }}
                    title={pin.incident_type} />
                </Marker>
              ))}

              {selectedPin && (
                <Popup longitude={selectedPin.lng} latitude={selectedPin.lat} anchor="bottom"
                  onClose={() => { setSelectedPin(null); setShowMorePopup(false); }} closeOnClick={false} maxWidth="290px">
                  <div className="crmap-popup">
                    <div className="crmap-popup-header"
                      style={{ background: INCIDENT_COLORS[selectedPin.incident_type?.toUpperCase()] || "#495057" }}>
                      <span className="crmap-popup-type">{selectedPin.incident_type}</span>
                      <span className="crmap-popup-status-badge">{selectedPin.status}</span>
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

                         {/* Expandable */}
                        {showMorePopup && [
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

                        <button className="crmap-popup-toggle" onClick={() => setShowMorePopup(v => !v)}>
                          {showMorePopup ? "▲ View Less" : "▼ View More"}
                        </button>
                    <button
                  className="crmap-popup-view-btn"
                  onClick={() => {
                    sessionStorage.setItem('openBlotterId', selectedPin.blotter_id);
                    window.location.href = '/e-blotter';
                  }}
                >
                  View Full Case
                </button>
              </div>
            </div>
          </Popup>
          )}
            </Map>

            
              {/* Barangay hover tooltip */}
              {showBrgyTooltip && hoveredBarangay && (
              <div className="crmap-brgy-tooltip" style={{ left: hoveredBarangay.x + 12, top: hoveredBarangay.y - 10 }}>
                  <div className="crmap-brgy-tooltip-name">{hoveredBarangay.name}</div>
                  <div className="crmap-brgy-tooltip-count">
                    {hoveredBarangay.count === 0
                      ? "No recorded incidents"
                      : `${hoveredBarangay.count} incident${hoveredBarangay.count > 1 ? "s" : ""} · ${hoveredBarangay.risk} Risk`}
                  </div>
                </div>
              )}
          </div>
          
            
          {/* Map controls */}
            {/* Map controls */}
<div className="crmap-controls">
  <button className="crmap-ctrl-btn" title="Zoom in"
    onClick={() => mapRef.current?.zoomIn({ duration: 300 })}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
  <div className="crmap-ctrl-divider"/>
  <button className="crmap-ctrl-btn" title="Zoom out"
    onClick={() => mapRef.current?.zoomOut({ duration: 300 })}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
  <div className="crmap-ctrl-divider"/>
  <button className="crmap-ctrl-btn" title="Reset view"
    onClick={() => mapRef.current?.flyTo({ center: [120.9640, 14.4341], zoom: 12, duration: 800 })}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
    </svg>
  </button>
  <div className="crmap-ctrl-divider"/>
  <button className="crmap-ctrl-btn" title="Fullscreen"
    onClick={() => {
      const el = document.querySelector(".crmap-map-wrap");
      if (!document.fullscreenElement) el?.requestFullscreen();
      else document.exitFullscreen();
    }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
    </svg>
  </button>
  <div className="crmap-ctrl-divider"/>
  <div className="crmap-options-wrap">
    <button className="crmap-ctrl-btn crmap-options-btn" title="Map Options"
      onClick={() => setShowMapOptions(v => !v)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

    {showMapOptions && (
      <div className="crmap-options-popover">
        <div className="crmap-options-title">Map Options</div>
        <div className="crmap-map-option">
          <span className="crmap-map-option-lbl">Barangay Tooltip</span>
          <button className={`crmap-toggle ${showBrgyTooltip ? "on" : ""}`}
            onClick={() => setShowBrgyTooltip(v => !v)}>
            <span className="crmap-toggle-knob" />
          </button>
        </div>
        <div className="crmap-map-option">
          <span className="crmap-map-option-lbl">Crime Pins</span>
          <button className={`crmap-toggle ${showPins ? "on" : ""}`}
            onClick={() => setShowPins(v => !v)}>
            <span className="crmap-toggle-knob" />
          </button>
        </div>
        <div className="crmap-map-option">
          <span className="crmap-map-option-lbl">Barangay Labels</span>
          <button className={`crmap-toggle ${showLabels ? "on" : ""}`}
            onClick={() => setShowLabels(v => !v)}>
            <span className="crmap-toggle-knob" />
          </button>
        </div>
      </div>
    )}
  </div>
</div>
          
          {/* Zoom hint */}
          {zoom < 13 && (
            <div className="crmap-zoom-hint">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              Zoom in to see individual crime pins
            </div>
          )}

          {/* Hamburger toggle — floats over map, moves with sidebar */}
          <button
            className="crmap-sidebar-toggle"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            style={{ right: sidebarOpen ? "314px" : "14px" }}
          >
            <span/><span/><span/>
          </button>

          {/* SIDEBAR — inside map-wrap so it truly floats over the map */}
          <div className={`crmap-sidebar ${!sidebarOpen ? "hidden" : ""}`}>
            <div className="crmap-tabs">
              {[
                { key: "legend", label: "Legend" },
                { key: "stats", label: "Stats" },
                { key: "recent", label: "Recent" },
                { key: "hotspots", label: "Hotspots" },
              ].map(t => (
                <button key={t.key}
                  className={`crmap-tab ${activeTab === t.key ? "active" : ""}`}
                  onClick={() => setActiveTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="crmap-panel-body">

              {activeTab === "legend" && (
              <div className="crmap-panel-section">
                  {(stats?.by_incident_type?.length > 0
                    ? stats.by_incident_type
                    : LEGEND_ITEMS.map(i => ({ incident_type: i.label, count: 0 }))
                  ).map(item => {
                    const name = item.incident_type || item.label;
                    const color = INCIDENT_COLORS[name?.toUpperCase()] || "#6b7280";
                    const count = parseInt(item.count) || 0;
                    const max = parseInt(stats?.by_incident_type?.[0]?.count) || 1;
                    const pct = Math.round((count / max) * 100);
                    return (
                      <div className="crmap-legend-row" key={name}>
                        <div className="crmap-legend-top">
                          <div className="crmap-legend-left">
                            <div className="crmap-legend-dot" style={{ background: color }} />
                            <span className="crmap-legend-name">{name}</span>
                          </div>
                          <span className="crmap-legend-count">{count}</span>
                        </div>
                        <div className="crmap-bar-bg">
                          <div className="crmap-bar-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "stats" && (
                <div className="crmap-panel-section">
                  <div className="crmap-stats-grid">
                    {[
                     { lbl: "Mapped Incidents", val: stats?.total_pins ?? 0, color: "#1e3a5f" },
                      { lbl: "Total Blotters", val: stats?.total_blotters ?? 0, color: "#6b7280" },
                      { lbl: "Hotspot Areas", val: stats?.high_risk_count ?? 0, color: "#c1272d" },
                      { lbl: "Brgy. Affected", val: `${boundaries.filter(b => b.crime_count > 0).length}/${totalBarangays}`, color: "#f97316" },
                    ].map(s => (
                      <div className="crmap-stat-card" key={s.lbl}>
                        <div className="crmap-stat-accent" style={{ background: s.color }} />
                        <div className="crmap-stat-val" style={{ color: s.color }}>{s.val}</div>
                        <div className="crmap-stat-lbl">{s.lbl}</div>
                      </div>
                    ))}
                  </div>
                  {topCrime && (
                    <div className="crmap-top-crime">
                      <div className="crmap-top-label">Most Reported Crime</div>
                      <div className="crmap-top-val"
                        style={{ color: INCIDENT_COLORS[topCrime.incident_type?.toUpperCase()] || "#fff" }}>
                        {topCrime.incident_type}
                      </div>
                      <div className="crmap-top-sub">{topCrime.count} incidents recorded</div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "recent" && (
                <div className="crmap-panel-section">
                  {stats?.recent_incidents?.length > 0
                    ? stats.recent_incidents.map((r, i) => (
                      <div className="crmap-recent-item" key={i}>
                        <div className="crmap-recent-bar"
                          style={{ background: INCIDENT_COLORS[r.incident_type?.toUpperCase()] || "#6b7280" }} />
                        <div className="crmap-recent-info">
                          <div className="crmap-recent-type">{r.incident_type}</div>
                          <div className="crmap-recent-brgy">📍 {r.place_barangay}</div>
                          <div className="crmap-recent-date">{formatDate(r.date_time_commission)}</div>
                        </div>
                      </div>
                    ))
                    : <div className="crmap-empty">No recent incidents found.</div>
                  }
                </div>
              )}

              {activeTab === "hotspots" && (
                <div className="crmap-panel-section">
                  {stats?.hotspots?.length > 0
                    ? stats.hotspots.map((h, i) => (
                      <div className="crmap-hotspot-row" key={i}>
                        <div className="crmap-hotspot-rank">#{i + 1}</div>
                        <div className="crmap-hotspot-info">
                          <div className="crmap-hotspot-name">{h.barangay}</div>
                          <div className="crmap-hotspot-bar-bg">
                            <div className="crmap-hotspot-bar-fill"
                              style={{ width: `${Math.min(100, (h.count / stats.hotspots[0].count) * 100)}%` }} />
                          </div>
                        </div>
                        <div className="crmap-hotspot-count">{h.count}</div>
                      </div>
                    ))
                    : <div className="crmap-empty">No hotspots detected.</div>
                  }
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default CrimeMapping;