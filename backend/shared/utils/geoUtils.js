// backend/shared/utils/geoUtils.js
const fs = require('fs');
const path = require('path');

let barangayGeoJSON = null;
let geoJSONLoadError = null;

const loadBarangayGeoJSON = () => {
  if (barangayGeoJSON) return barangayGeoJSON;
  if (geoJSONLoadError) return null;
  
  // Path to your GeoJSON file - try multiple possible locations
  const possiblePaths = [
    path.join(__dirname, "../../src/bacoor_barangays.geojson"),           // backend/src/  ← NEW (your file is here)
    path.join(__dirname, "../../../frontend/public/bacoor_barangays.geojson"),
    path.join(__dirname, "../../bacoor_barangays.geojson"),
    path.join(process.cwd(), "frontend/public/bacoor_barangays.geojson"),
    path.join(process.cwd(), "bacoor_barangays.geojson"),
    path.join(__dirname, "../../../public/bacoor_barangays.geojson"),
  ];
  
  let geojsonPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      geojsonPath = p;
      break;
    }
  }
  
  if (!geojsonPath) {
    geoJSONLoadError = new Error(`GeoJSON file not found. Tried: ${possiblePaths.join(', ')}`);
    console.error(geoJSONLoadError.message);
    return null;
  }
  
  try {
    const fileContent = fs.readFileSync(geojsonPath, 'utf8');
    barangayGeoJSON = JSON.parse(fileContent);
    // console.log(`✅ Loaded GeoJSON from: ${geojsonPath}`);
    
  } catch (error) {
    geoJSONLoadError = error;
    console.error("Error loading GeoJSON:", error);
    return null;
  }
  
  return barangayGeoJSON;
};

const isPointInPolygon = (point, polygon) => {
  const x = point[0];
  const y = point[1];
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const getBarangayFromCoordinates = (lng, lat) => {
  try {
    const geojson = loadBarangayGeoJSON();
    if (!geojson) return null;
    
    const point = [lng, lat];
    
    for (const feature of geojson.features) {
      const geometry = feature.geometry;
      const barangayName = feature.properties?.name_db || feature.properties?.name_kml;
      
      if (!barangayName) continue;
      
      if (geometry.type === "Polygon") {
        const polygon = geometry.coordinates[0];
        if (isPointInPolygon(point, polygon)) {
          return barangayName;
        }
      }
      else if (geometry.type === "MultiPolygon") {
        for (const polygon of geometry.coordinates) {
          if (isPointInPolygon(point, polygon[0])) {
            return barangayName;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error resolving barangay:", error);
    return null;
  }
};

// Cache implementation for better performance
const barangayCache = new Map();
const CACHE_TTL = 5000; // 5 seconds cache

const getBarangayWithCache = (lng, lat) => {
  if (!lng || !lat || isNaN(lng) || isNaN(lat)) return null;
  
  // Round to 6 decimal places (~0.1m precision)
  const roundedLng = Math.round(lng * 1e6) / 1e6;
  const roundedLat = Math.round(lat * 1e6) / 1e6;
  const cacheKey = `${roundedLng},${roundedLat}`;
  
  const cached = barangayCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.barangay;
  }
  
  const barangay = getBarangayFromCoordinates(lng, lat);
  barangayCache.set(cacheKey, {
    barangay,
    timestamp: Date.now(),
  });
  
  // Cleanup old cache entries (keep max 1000)
  if (barangayCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of barangayCache.entries()) {
      if (now - value.timestamp > CACHE_TTL * 2) {
        barangayCache.delete(key);
      }
    }
  }
  
  return barangay;
};

// Optimized version with bounding box pre-filtering
let spatialIndex = null;

const buildSpatialIndex = () => {
  const geojson = loadBarangayGeoJSON();
  if (!geojson) return;
  
  spatialIndex = [];
  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    const barangayName = feature.properties?.name_db || feature.properties?.name_kml;
    
    if (!barangayName) continue;
    
    // Calculate bounding box for quick rejection
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    
    const processRing = (ring) => {
      for (const point of ring) {
        minLng = Math.min(minLng, point[0]);
        maxLng = Math.max(maxLng, point[0]);
        minLat = Math.min(minLat, point[1]);
        maxLat = Math.max(maxLat, point[1]);
      }
    };
    
    if (geometry.type === "Polygon") {
      processRing(geometry.coordinates[0]);
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        processRing(polygon[0]);
      }
    }
    
    spatialIndex.push({
      name: barangayName,
      bounds: { minLng, maxLng, minLat, maxLat },
      geometry
    });
  }
  
  // console.log(`✅ Built spatial index with ${spatialIndex.length} barangays`);
};

const getBarangayOptimized = (lng, lat) => {
  if (!lng || !lat || isNaN(lng) || isNaN(lat)) return null;
  
  // Check cache first
  const roundedLng = Math.round(lng * 1e6) / 1e6;
  const roundedLat = Math.round(lat * 1e6) / 1e6;
  const cacheKey = `${roundedLng},${roundedLat}`;
  const cached = barangayCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.barangay;
  }
  
  // Build spatial index if not exists
  if (!spatialIndex) buildSpatialIndex();
  if (!spatialIndex) {
    const result = getBarangayFromCoordinates(lng, lat);
    barangayCache.set(cacheKey, { barangay: result, timestamp: Date.now() });
    return result;
  }
  
  const point = [lng, lat];
  
  // First filter by bounding box
  const candidates = spatialIndex.filter(item => {
    return lng >= item.bounds.minLng && lng <= item.bounds.maxLng &&
           lat >= item.bounds.minLat && lat <= item.bounds.maxLat;
  });
  
  // Then exact polygon check
  let result = null;
  for (const candidate of candidates) {
    const geometry = candidate.geometry;
    
    if (geometry.type === "Polygon") {
      if (isPointInPolygon(point, geometry.coordinates[0])) {
        result = candidate.name;
        break;
      }
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        if (isPointInPolygon(point, polygon[0])) {
          result = candidate.name;
          break;
        }
      }
    }
    if (result) break;
  }
  
  // Cache the result
  barangayCache.set(cacheKey, { barangay: result, timestamp: Date.now() });
  
  return result;
};

module.exports = { 
  getBarangayFromCoordinates, 
  getBarangayWithCache,
  getBarangayOptimized,
  loadBarangayGeoJSON 
};