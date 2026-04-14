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

const LEGEND_ITEMS = [
  { label: "Robbery", color: "#ef4444" },
  { label: "Theft", color: "#f97316" },
  { label: "Physical Injury", color: "#eab308" },
  { label: "Homicide", color: "#8b5cf6" },
  { label: "Murder", color: "#7c3aed" },
  { label: "Rape", color: "#ec4899" },
  { label: "Carnapping - MC", color: "#3b82f6" },
  { label: "Carnapping - MV", color: "#0ea5e9" },
  { label: "Special Complex Crime", color: "#14b8a6" },
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
      1,
      1,
    ],
    "heatmap-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      18,
      13,
      32,
      15,
      48,
    ],
    "heatmap-intensity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      0.6,
      13,
      1.2,
      15,
      2.0,
    ],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(0,0,0,0)",
      0.15,
      "rgba(234,179,8,0.75)",
      0.4,
      "rgba(249,115,22,0.85)",
      0.65,
      "rgba(220,38,38,0.90)",
      0.85,
      "rgba(153,27,27,0.94)",
      1.0,
      "rgba(69,10,10,0.97)",
    ],
    "heatmap-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      12,
      0.92,
      15,
      0.55,
      16,
      0,
    ],
  },
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

const getRiskThresholds = (dateFrom, dateTo) => {
  const days =
    Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;

  if (days <= 29)
    // ≤7 days AND 8–29 days both use 7-day thresholds
    return {
      low: { min: 1, max: 1 },
      medium: { min: 2, max: 2 },
      high: { min: 3 },
      days,
    };
  if (days <= 91)
    // 30–91 days → 30-day thresholds
    return {
      low: { min: 1, max: 2 },
      medium: { min: 3, max: 4 },
      high: { min: 5 },
      days,
    };
  if (days <= 364)
    // 92–364 days → 3-month thresholds
    return {
      low: { min: 1, max: 3 },
      medium: { min: 4, max: 6 },
      high: { min: 7 },
      days,
    };
  // 365+ days → 1-year thresholds
  return {
    low: { min: 1, max: 4 },
    medium: { min: 5, max: 8 },
    high: { min: 9 },
    days,
  };
};

function CrimeMapping() {
  const rawUser = localStorage.getItem("user");
  const currentUser = rawUser ? JSON.parse(rawUser) : null;
  const isBarangayUser = currentUser?.user_type === "barangay";
  const userBarangay = currentUser?.assigned_barangay_code ?? null;

  const [boundaries, setBoundaries] = useState([]);
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

  const [loading, setLoading] = useState(true);
  const [selectedPin, setSelectedPin] = useState(null);
  const [zoom, setZoom] = useState(12);
  const [error, setError] = useState(null);

  const [selectedCrimeTypes, setSelectedCrimeTypes] = useState([]);
  const [selectedBarangays, setSelectedBarangays] = useState(
    isBarangayUser && userBarangay ? [userBarangay] : [],
  );

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
    const oneYearAgo = new Date(phtToday);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setDate(oneYearAgo.getDate() + 1);
    return oneYearAgo.toISOString().slice(0, 10);
  };

  const offsetDate = (days) => {
    const now = new Date();
    const phtMs = now.getTime() + 8 * 60 * 60 * 1000 + days * 86400000;
    return new Date(phtMs).toISOString().slice(0, 10);
  };

  const defaultDateTo = getPHTToday();
  const defaultDateFrom = getPHTOneYearAgo();

  const [filters, setFilters] = useState({
    incident_types: [],
    date_from: defaultDateFrom,
    date_to: defaultDateTo,
    barangays: isBarangayUser && userBarangay ? [userBarangay] : [],
  });

  const [appliedFilters, setAppliedFilters] = useState({
    incident_types: [],
    date_from: defaultDateFrom,
    date_to: defaultDateTo,
    barangays: isBarangayUser && userBarangay ? [userBarangay] : [],
  });

  const [activeTab, setActiveTab] = useState("legend");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMorePopup, setShowMorePopup] = useState(false);
  const [hoveredBarangay, setHoveredBarangay] = useState(null);
  const [showBrgyTooltip, setShowBrgyTooltip] = useState(true);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [riskTooltip, setRiskTooltip] = useState({
    visible: false,
    top: 0,
    left: 0,
    type: "choropleth",
  });

  const mapRef = useRef(null);
  const tooltipHideTimerRef = useRef(null);

  const totalBarangays = geoJSONData
    ? new Set(geoJSONData.features.map((f) => f.properties.name_db)).size
    : 47;

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

  const formatDate = (d) => {
    if (!d) return "N/A";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const closeRiskTooltip = useCallback(() => {
    if (tooltipHideTimerRef.current) {
      clearTimeout(tooltipHideTimerRef.current);
    }
    tooltipHideTimerRef.current = setTimeout(() => {
      setRiskTooltip((prev) => ({ ...prev, visible: false }));
    }, 150);
  }, []);

  const openRiskTooltip = useCallback((e, type) => {
    if (tooltipHideTimerRef.current) {
      clearTimeout(tooltipHideTimerRef.current);
      tooltipHideTimerRef.current = null;
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

    setRiskTooltip({
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
    if (!isBarangayUser || !userBarangay || !geoJSONData || !mapRef.current) {
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
  }, [geoJSONData, isBarangayUser, userBarangay]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (appliedFilters.incident_types?.length)
        params.append("incident_type", appliedFilters.incident_types[0]);
      if (appliedFilters.date_from)
        params.append("date_from", appliedFilters.date_from);
      if (appliedFilters.date_to)
        params.append("date_to", appliedFilters.date_to);
      if (appliedFilters.barangays?.length)
        params.append("barangay", appliedFilters.barangays[0]);

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
  }, [appliedFilters]); // <-- was [filters]

  const fetchHeatmap = useCallback(async () => {
    setHeatLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (appliedFilters.incident_types?.length)
        params.append("incident_type", appliedFilters.incident_types[0]);
      if (appliedFilters.date_from)
        params.append("date_from", appliedFilters.date_from);
      if (appliedFilters.date_to)
        params.append("date_to", appliedFilters.date_to);
      if (appliedFilters.barangays?.length)
        params.append("barangay", appliedFilters.barangays[0]);

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
  }, [appliedFilters]); // <-- was [filters]

  const fetchOfficers = useCallback(async () => {
    if (isBarangayUser) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/gps/officers`, {
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
    officerPollRef.current = setInterval(fetchOfficers, 5000);

    return () => {
      if (officerPollRef.current) clearInterval(officerPollRef.current);
    };
  }, [fetchOfficers]);

  // Watch appliedFilters instead of raw filters, and include all fields
  useEffect(() => {
    if (heatmapMode) {
      fetchHeatmap();
      fetchAll();
    } else {
      fetchAll();
    }
  }, [appliedFilters, heatmapMode]);
  const handleModeToggle = useCallback(() => {
    setHeatmapMode((m) => {
      const next = !m;
      if (next && !heatGeoJSON) fetchHeatmap();
      return next;
    });
    setSelectedPin(null);
    setSelectedCluster(null);
  }, [heatGeoJSON, fetchHeatmap]);

  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData) return null;

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
                : colorLookup[ownFeature.properties.name_kml] || "#adb5bd",
              isLocked: false,
            },
          },
        ],
      };
    }

    if (heatmapMode) {
      return {
        ...geoJSONData,
        features: geoJSONData.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            fillColor: "rgba(255,255,255,0.0)",
            isLocked: false,
          },
        })),
      };
    }

    if (!boundaries.length) return null;

    const colorLookup = {};
    boundaries.forEach((b) => {
      colorLookup[b.name_kml] = b.color;
    });

    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: colorLookup[f.properties.name_kml] || "#adb5bd",
          isLocked: false,
        },
      })),
    };
  }, [boundaries, geoJSONData, heatmapMode, isBarangayUser, userBarangay]);

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
        : 0.4,
    },
  };

  const outlineLayer = {
    id: "barangay-outline",
    type: "line",
    paint: {
      "line-color": heatmapMode ? "#96c8ff" : "#1e3a5f",
      "line-width": 1.2,
      "line-opacity": heatmapMode ? 0.6 : 0.8,
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

  const topCrime = stats?.by_incident_type?.[0];
  const clusterCount = clusterGeoJSON?.features?.length ?? 0;
  const atRiskCount = stats?.at_risk_count ?? 0;

  const sidebarTabs = [
    { key: "legend", label: "Legend" },
    { key: "recent", label: "Recent" },
    { key: "at_risk", label: heatmapMode ? "Clusters" : "At-Risk" },
  ];

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
            { val: stats?.total_pins ?? "—", lbl: "Total Pins", red: false },
            heatmapMode
              ? { val: clusterCount, lbl: "Hotspot Clusters", red: true }
              : { val: atRiskCount, lbl: "At-Risk Barangays", red: true },
            {
              val: `${boundaries.filter((b) => b.crime_count > 0).length}/${totalBarangays}`,
              lbl: "Brgy. Affected",
              red: false,
            },
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
              red: false,
            },
          ].map((s) => (
            <div
              key={s.lbl}
              className={`crmap-pill ${s.red ? "crmap-pill-red" : ""}`}
            >
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

          <select
            className="crmap-fsel"
            value={filters.incident_type}
            onChange={(e) =>
              setFilters((f) => ({ ...f, incident_type: e.target.value }))
            }
          >
            <option value="">All Crime Types</option>
            <option value="CARNAPPING - MC">Carnapping - MC</option>
            <option value="CARNAPPING - MV">Carnapping - MV</option>
            <option value="HOMICIDE">Homicide</option>
            <option value="MURDER">Murder</option>
            <option value="PHYSICAL INJURY">Physical Injury</option>
            <option value="RAPE">Rape</option>
            <option value="ROBBERY">Robbery</option>
            <option value="SPECIAL COMPLEX CRIME">Special Complex Crime</option>
            <option value="THEFT">Theft</option>
          </select>

          {isBarangayUser && userBarangay ? (
            <div className="crmap-fsel crmap-fsel-locked">
              {formatBarangayLabel(userBarangay)}
              <span className="crmap-locked-icon"></span>
            </div>
          ) : (
            <select
              className="crmap-fsel"
              value={filters.barangay}
              onChange={(e) => {
                const selected = e.target.value;
                setFilters((f) => ({ ...f, barangay: selected }));

                if (selected && geoJSONData) {
                  const feature = geoJSONData.features.find(
                    (f) => f.properties.name_db === selected,
                  );

                  if (feature && mapRef.current) {
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
                } else if (!selected && mapRef.current) {
                  mapRef.current.flyTo({
                    center: [120.964, 14.4341],
                    zoom: 12,
                    duration: 1200,
                  });
                }
              }}
            >
              <option value="">All Barangays</option>
              {CURRENT_BARANGAYS.map((b) => (
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
              setAppliedFilters({ ...filters });
              heatmapMode ? fetchHeatmap() : fetchAll();
            }}
          >
            Apply Filters
          </button>

          <button
            className="crmap-clear-btn"
            onClick={() => {
              const clearTo = getPHTToday();
              const clearFrom = getPHTOneYearAgo();
              const cleared = {
                incident_type: "",
                date_from: clearFrom,
                date_to: clearTo,
                barangay: isBarangayUser && userBarangay ? userBarangay : "",
              };
              setFilters(cleared);
              setAppliedFilters(cleared);

              // Fetch directly with cleared params, bypassing stale closure
              const params = new URLSearchParams();
              params.append("date_from", clearFrom);
              params.append("date_to", clearTo);
              const q = `?${params}`;
              const headers = { Authorization: `Bearer ${getToken()}` };

              setLoading(true);
              Promise.all([
                fetch(`${API}/boundaries${q}`, { headers }).then((r) =>
                  r.json(),
                ),
                fetch(`${API}/pins${q}`, { headers }).then((r) => r.json()),
                fetch(`${API}/statistics${q}`, { headers }).then((r) =>
                  r.json(),
                ),
              ])
                .then(([bData, pData, sData]) => {
                  if (bData.success) setBoundaries(bData.data);
                  if (pData.success) setPins(pData.data);
                  if (sData.success) setStats(sData.data);
                })
                .finally(() => setLoading(false));

              if (!isBarangayUser) {
                mapRef.current?.flyTo({
                  center: [120.964, 14.4341],
                  zoom: 12,
                  duration: 800,
                });
              }
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

          {!loading &&
            !heatLoading &&
            !error &&
            pins.length === 0 &&
            boundaries.every((b) => b.crime_count === 0) &&
            (filters.incident_type ||
              filters.date_from ||
              filters.date_to ||
              filters.barangay) && (
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
            )}

          <div className="crmap-map-inner">
            <Map
              ref={mapRef}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
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
                if (heatmapMode) {
                  setHoveredBarangay(null);
                  return;
                }

                if (!geoJSONData || !boundaries.length) return;

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
                if (mapRef.current?.getCanvas()) {
                  mapRef.current.getCanvas().style.cursor = "";
                }
              }}
            >
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

              {heatmapMode && clusterGeoJSON && (
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
                      className="crmap-pin"
                      style={{
                        background:
                          INCIDENT_COLORS[pin.incident_type?.toUpperCase()] ||
                          "#6b7280",
                      }}
                      title={pin.incident_type}
                    />
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
                    </div>
                  </div>
                </Popup>
              )}

              {showOfficers &&
                zoom >= 13 &&
                officers.map((officer) => (
                  <Marker
                    key={`officer-${officer.user_id}`}
                    longitude={parseFloat(officer.longitude)}
                    latitude={parseFloat(officer.latitude)}
                    anchor="center"
                  >
                    <div
                      className="crmap-officer-marker"
                      onMouseEnter={(e) => {
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
                      }}
                      onMouseLeave={() => setHoveredOfficer(null)}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="#1d4ed8"
                        stroke="#ffffff"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2L4 5v6c0 4.97 3.4 9.13 8 10 4.6-.87 8-5.03 8-10V5l-8-3z" />
                        <path
                          d="M9 12l2 2 4-4"
                          stroke="#ffffff"
                          strokeWidth="1.8"
                          fill="none"
                        />
                      </svg>
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
                  {hoveredOfficer.officer.full_name ||
                    hoveredOfficer.officer.name ||
                    "Officer"}
                </div>
                <div className="crmap-officer-tooltip-detail">
                  {hoveredOfficer.officer.rank || "PNP"} · Online
                </div>
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
                      } · ${hoveredBarangay.risk} Risk`}
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

                  {!isBarangayUser && (
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
            style={{ right: sidebarOpen ? "314px" : "14px" }}
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
              className={`crmap-tabs ${sidebarTabs.length === 2 ? "two-tabs" : "three-tabs"}`}
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
                          Density scale
                        </div>
                        <button
                          type="button"
                          className="crmap-risk-info-icon"
                          aria-label="Show density scale info"
                          onMouseEnter={(e) => openRiskTooltip(e, "heatmap")}
                          onMouseLeave={closeRiskTooltip}
                        >
                          i
                        </button>
                      </div>

                      <div className="crmap-heat-scale-bar" />
                      <div className="crmap-heat-scale-labels">
                        <span>Low</span>
                        <span>High</span>
                      </div>

                      <div
                        className="crmap-heat-sidebar-title"
                        style={{ marginTop: 16 }}
                      >
                        Crime Types Mapped
                      </div>

                      {(stats?.by_incident_type?.length > 0
                        ? stats.by_incident_type
                        : LEGEND_ITEMS.map((i) => ({
                            incident_type: i.label,
                            count: 0,
                          }))
                      ).map((item) => {
                        const name = item.incident_type || item.label;
                        const color =
                          INCIDENT_COLORS[name?.toUpperCase()] || "#6b7280";
                        const count = parseInt(item.count) || 0;

                        return (
                          <div className="crmap-severity-row" key={name}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: color,
                                  flexShrink: 0,
                                }}
                              />
                              <span className="crmap-severity-crime">
                                {name}
                              </span>
                            </div>
                            <span className="crmap-severity-weight">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="crmap-heat-sidebar-legend">
                      <div className="crmap-sidebar-title-row">
                        <div className="crmap-heat-sidebar-title">
                          Barangay Risk Scale
                        </div>
                        <button
                          type="button"
                          className="crmap-risk-info-icon"
                          aria-label="Show barangay risk scale info"
                          onMouseEnter={(e) => openRiskTooltip(e, "choropleth")}
                          onMouseLeave={closeRiskTooltip}
                        >
                          i
                        </button>
                      </div>

                      {(() => {
                        const t = getRiskThresholds(
                          appliedFilters.date_from,
                          appliedFilters.date_to,
                        );

                        const levels = [
                          { color: "#adb5bd", label: "No crimes", range: "0" },
                          {
                            color: "#eab308",
                            label: "Low risk",
                            range:
                              t.low.min === t.low.max
                                ? `${t.low.min}`
                                : `${t.low.min}–${t.low.max}`,
                          },
                          {
                            color: "#f97316",
                            label: "Medium risk",
                            range:
                              t.medium.min === t.medium.max
                                ? `${t.medium.min}`
                                : `${t.medium.min}–${t.medium.max}`,
                          },
                          {
                            color: "#b91c1c",
                            label: "High risk",
                            range: `${t.high.min}+`,
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
                                flexShrink: 0,
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

                        {(stats?.by_incident_type?.length > 0
                          ? stats.by_incident_type
                          : LEGEND_ITEMS.map((i) => ({
                              incident_type: i.label,
                              count: 0,
                            }))
                        ).map((item) => {
                          const name = item.incident_type || item.label;
                          const color =
                            INCIDENT_COLORS[name?.toUpperCase()] || "#6b7280";
                          const count = parseInt(item.count) || 0;

                          return (
                            <div className="crmap-legend-row" key={name}>
                              <div className="crmap-legend-top">
                                <div className="crmap-legend-left">
                                  <div
                                    className="crmap-legend-dot"
                                    style={{ background: color }}
                                  />
                                  <span className="crmap-legend-name">
                                    {name}
                                  </span>
                                </div>
                                <span className="crmap-legend-count">
                                  {count}
                                </span>
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
                  ) : // choropleth at-risk list stays exactly as it was
                  stats?.at_risk_barangays?.length > 0 ? (
                    stats.at_risk_barangays.map((h, i) => (
                      <div className="crmap-hotspot-row" key={h.barangay}>
                        <div className="crmap-hotspot-rank">#{i + 1}</div>
                        <div className="crmap-hotspot-info">
                          <div className="crmap-hotspot-name">{h.barangay}</div>
                          <div
                            style={{
                              fontSize: 10,
                              marginBottom: 4,
                              color:
                                h.risk === "High"
                                  ? "#b91c1c"
                                  : h.risk === "Medium"
                                    ? "#f97316"
                                    : "#eab308",
                              fontWeight: 600,
                            }}
                          >
                            {h.risk} Risk
                          </div>
                          <div className="crmap-hotspot-bar-bg">
                            <div
                              className="crmap-hotspot-bar-fill"
                              style={{
                                width: `${Math.min(100, (h.count / stats.at_risk_barangays[0].count) * 100)}%`,
                                background:
                                  h.risk === "High"
                                    ? "#b91c1c"
                                    : h.risk === "Medium"
                                      ? "#f97316"
                                      : "#eab308",
                              }}
                            />
                          </div>
                        </div>
                        <div className="crmap-hotspot-count">{h.count}</div>
                      </div>
                    ))
                  ) : (
                    <div className="crmap-empty">
                      No at-risk barangays detected based on timeframe.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {riskTooltip.visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="crmap-risk-info-tooltip crmap-risk-info-tooltip--portal"
            style={{
              top: riskTooltip.top,
              left: riskTooltip.left,
              opacity: 1,
              transform: "translateY(0)",
              pointerEvents: "auto",
            }}
            onMouseEnter={() => {
              if (tooltipHideTimerRef.current) {
                clearTimeout(tooltipHideTimerRef.current);
                tooltipHideTimerRef.current = null;
              }
            }}
            onMouseLeave={closeRiskTooltip}
          >
            {riskTooltip.type === "choropleth" ? (
              <>
                <div className="crmap-risk-tooltip-title">
                  Thresholds change by date range
                </div>
                <div className="crmap-risk-tooltip-body">
                  These are your updated fixed windows for barangay risk
                  scoring.
                </div>

                <table className="crmap-risk-tooltip-table">
                  <thead>
                    <tr>
                      <th>Window</th>
                      <th>Low</th>
                      <th>Medium</th>
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
                      <td>1–2</td>
                      <td>3–4</td>
                      <td>5+</td>
                    </tr>
                    <tr>
                      <td>92–364 days</td>
                      <td>1–3</td>
                      <td>4–6</td>
                      <td>7+</td>
                    </tr>
                    <tr>
                      <td>365+ days</td>
                      <td>1–4</td>
                      <td>5–8</td>
                      <td>9+</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : (
              <>
                <div className="crmap-risk-tooltip-title">
                  How the heatmap works
                </div>
                <div className="crmap-risk-tooltip-body">
                  Each incident is a weighted point — overlapping points build
                  intensity. DBSCAN rings
                  mark dense cluster zones.
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default CrimeMapping;
