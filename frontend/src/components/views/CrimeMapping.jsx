import React, { useState, useEffect, useCallback } from "react";
// import Map, { Source, Layer, Marker, Popup } from "react-map-gl";
// ✅ Fix:
import Map, { Source, Layer, Marker, Popup } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./CrimeMapping.css";

const API = "http://localhost:5000/crime-map";
const getToken = () => localStorage.getItem("token");

const INCIDENT_COLORS = {
  "ROBBERY": "#ef4444",
  "THEFT": "#f97316",
  "PHYSICAL INJURIES": "#eab308",
  "HOMICIDE": "#8b5cf6",
  "MURDER": "#7c3aed",
  "RAPE": "#ec4899",
  "NEW ANTI-CARNAPPING ACT OF 2016 - MC": "#3b82f6",
  "CARNAPPING": "#3b82f6",
  "SPECIAL COMPLEX CRIME": "#14b8a6",
};

const LEGEND_ITEMS = [
  { label: "Robbery", color: "#ef4444" },
  { label: "Theft", color: "#f97316" },
  { label: "Physical Injuries", color: "#eab308" },
  { label: "Homicide", color: "#8b5cf6" },
  { label: "Murder", color: "#7c3aed" },
  { label: "Rape", color: "#ec4899" },
  { label: "Carnapping", color: "#3b82f6" },
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
  const [filters, setFilters] = useState({ incident_type: "", date_from: "", date_to: "" });
  const [geoJSONData, setGeoJSONData] = useState(null);
  const [activeTab, setActiveTab] = useState("legend");

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
    try {
      const params = new URLSearchParams();
      if (filters.incident_type) params.append("incident_type", filters.incident_type);
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      const q = params.toString() ? `?${params}` : "";
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [bRes, pRes, sRes] = await Promise.all([
        fetch(`${API}/boundaries${q}`, { headers }),
        fetch(`${API}/pins${q}`, { headers }),
        fetch(`${API}/statistics`, { headers }),
      ]);
      const [bData, pData, sData] = await Promise.all([bRes.json(), pRes.json(), sRes.json()]);
      if (bData.success) setBoundaries(bData.data);
      if (pData.success) setPins(pData.data);
      if (sData.success) setStats(sData.data);
    } catch (err) {
      console.error("CrimeMap fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAll();
    fetch("/bacoor_barangays.geojson")
      .then(r => r.json())
      .then(data => setGeoJSONData(data))
      .catch(err => console.error("GeoJSON load error:", err));
  }, [fetchAll]);

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
            { val: stats?.hotspot_count ?? "—", lbl: "Hotspots", red: true },
            { val: boundaries.filter(b => b.crime_count > 0).length, lbl: "Barangays", red: false },
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
            <option value="NEW ANTI-CARNAPPING ACT OF 2016 - MC">Carnapping</option>
            <option value="SPECIAL COMPLEX CRIME">Special Complex Crime</option>
          </select>
          <div className="crmap-date-range">
            <input type="date" className="crmap-fsel crmap-fsel-date" value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
            <span className="crmap-date-arrow">→</span>
            <input type="date" className="crmap-fsel crmap-fsel-date" value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
          </div>
          <button className="crmap-apply-btn" onClick={fetchAll}>Apply Filters</button>
          <button className="crmap-clear-btn" onClick={() => setFilters({ incident_type: "", date_from: "", date_to: "" })}>Clear</button>
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

      {/* BODY */}
      <div className="crmap-body">

        {/* MAP */}
        <div className="crmap-map-wrap">
          {loading && <div className="crmap-loader"><div className="crmap-loader-bar" /></div>}
          <Map
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
            initialViewState={{ longitude: 120.9640, latitude: 14.4341, zoom: 12 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            onZoom={e => setZoom(e.viewState.zoom)}
          >
            {geoJSON && (
              <Source id="barangays" type="geojson" data={geoJSON}>
                <Layer {...fillLayer} />
                <Layer {...outlineLayer} />
                <Layer {...labelLayer} />
              </Source>
            )}

            {zoom >= 13 && pins.map(pin => (
              <Marker key={pin.blotter_id} longitude={pin.lng} latitude={pin.lat} anchor="bottom"
                onClick={e => { e.originalEvent.stopPropagation(); setSelectedPin(pin); }}>
                <div className="crmap-pin"
                  style={{ background: INCIDENT_COLORS[pin.incident_type?.toUpperCase()] || "#6b7280" }}
                  title={pin.incident_type} />
              </Marker>
            ))}

            {selectedPin && (
              <Popup longitude={selectedPin.lng} latitude={selectedPin.lat} anchor="bottom"
                onClose={() => setSelectedPin(null)} closeOnClick={false} maxWidth="290px">
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
                      ["Street", selectedPin.place_street || "N/A"],
                      ["Modus", selectedPin.modus || "N/A"],
                      ["Date", formatDate(selectedPin.date_time_commission)],
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

          {zoom < 13 && (
            <div className="crmap-zoom-hint">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              Zoom in to see individual crime pins
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <div className="crmap-sidebar">
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
                    { lbl: "Total Incidents", val: stats?.total_pins ?? 0, color: "#1e3a5f" },
                    { lbl: "Hotspot Areas", val: stats?.hotspot_count ?? 0, color: "#c1272d" },
                    { lbl: "Brgy. Affected", val: boundaries.filter(b => b.crime_count > 0).length, color: "#f97316" },
                    { lbl: "Crime Types", val: stats?.by_incident_type?.length ?? 0, color: "#22c55e" },
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
  );
}

export default CrimeMapping;