// backend/shared/utils/geoUtils.js
const fs = require('fs');
const path = require('path');
const https = require('https');

let barangayGeoJSON = null;
let geoJSONLoadError = null;

const loadBarangayGeoJSON = () => {
  if (barangayGeoJSON) return barangayGeoJSON;
  if (geoJSONLoadError) return null;
  
  const possiblePaths = [
    path.join(__dirname, "../../src/bacoor_barangays.geojson"),
    path.join(__dirname, "../../../frontend/public/bacoor_barangays.geojson"),
    path.join(__dirname, "../../bacoor_barangays.geojson"),
    path.join(process.cwd(), "frontend/public/bacoor_barangays.geojson"),
    path.join(process.cwd(), "bacoor_barangays.geojson"),
    path.join(__dirname, "../../../public/bacoor_barangays.geojson"),
  ];
  
  let geojsonPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) { geojsonPath = p; break; }
  }
  
  if (!geojsonPath) {
    geoJSONLoadError = new Error(`GeoJSON file not found. Tried: ${possiblePaths.join(', ')}`);
    console.error(geoJSONLoadError.message);
    return null;
  }
  
  try {
    const fileContent = fs.readFileSync(geojsonPath, 'utf8');
    barangayGeoJSON = JSON.parse(fileContent);
  } catch (error) {
    geoJSONLoadError = error;
    console.error("Error loading GeoJSON:", error);
    return null;
  }
  return barangayGeoJSON;
};

const isPointInPolygon = (point, polygon) => {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
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
        if (isPointInPolygon(point, geometry.coordinates[0])) return barangayName;
      } else if (geometry.type === "MultiPolygon") {
        for (const polygon of geometry.coordinates) {
          if (isPointInPolygon(point, polygon[0])) return barangayName;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error resolving barangay:", error);
    return null;
  }
};

// ── Nominatim reverse-geocode cache ───────────────────────────────────────────
// Keyed by "lng,lat" rounded to 3 decimal places (~111m precision, good enough
// for city-level results and avoids hammering the API on every ping).
const cityCache = new Map();
const CITY_CACHE_TTL = 60 * 60 * 1000; // 1 hour — city rarely changes

/**
 * Returns a human-readable location string for coordinates that fall outside
 * Bacoor's barangay polygons, e.g. "Imus, Cavite" or "Pasay, Metro Manila".
 *
 * Uses OSM Nominatim (free, no API key).  Resolves to:
 *   city > town > municipality > county > state  — first non-null wins.
 *
 * Returns null on network failure so callers can decide the fallback label.
 */
const getCityFromCoordinates = (lng, lat) => {
  return new Promise((resolve) => {
    if (!lng || !lat || isNaN(lng) || isNaN(lat)) return resolve(null);

    // Round to 3 dp for cache key
    const rLng = Math.round(lng * 1e3) / 1e3;
    const rLat = Math.round(lat * 1e3) / 1e3;
    const key  = `${rLng},${rLat}`;

    const cached = cityCache.get(key);
    if (cached && Date.now() - cached.ts < CITY_CACHE_TTL) return resolve(cached.value);

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;

    const req = https.get(
      url,
      { headers: { 'User-Agent': 'BacoorPatrolSystem/1.0' } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const json   = JSON.parse(raw);
            const addr   = json.address || {};
            // Pick the most specific populated-place field available
            const city =
              addr.city        ||
              addr.town        ||
              addr.municipality ||
              addr.county      ||
              addr.state       ||
              null;

            // Build "City, Province/Region" string when possible
            const province = addr.state || addr.region || null;
            const label = city
              ? (province && province !== city ? `${city}, ${province}` : city)
              : null;

            cityCache.set(key, { value: label, ts: Date.now() });
            resolve(label);
          } catch {
            cityCache.set(key, { value: null, ts: Date.now() });
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => {
      cityCache.set(key, { value: null, ts: Date.now() });
      resolve(null);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      cityCache.set(key, { value: null, ts: Date.now() });
      resolve(null);
    });
  });
};

// ── Existing sync cache (for barangay lookups) ─────────────────────────────────
const barangayCache = new Map();
const CACHE_TTL = 5000;

const getBarangayWithCache = (lng, lat) => {
  if (!lng || !lat || isNaN(lng) || isNaN(lat)) return null;
  const roundedLng = Math.round(lng * 1e6) / 1e6;
  const roundedLat = Math.round(lat * 1e6) / 1e6;
  const cacheKey = `${roundedLng},${roundedLat}`;
  const cached = barangayCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.barangay;
  const barangay = getBarangayFromCoordinates(lng, lat);
  barangayCache.set(cacheKey, { barangay, timestamp: Date.now() });
  if (barangayCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of barangayCache.entries()) {
      if (now - value.timestamp > CACHE_TTL * 2) barangayCache.delete(key);
    }
  }
  return barangay;
};

// ── Spatial index ──────────────────────────────────────────────────────────────
let spatialIndex = null;

const buildSpatialIndex = () => {
  const geojson = loadBarangayGeoJSON();
  if (!geojson) return;
  spatialIndex = [];
  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    const barangayName = feature.properties?.name_db || feature.properties?.name_kml;
    if (!barangayName) continue;
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    const processRing = (ring) => {
      for (const point of ring) {
        minLng = Math.min(minLng, point[0]);
        maxLng = Math.max(maxLng, point[0]);
        minLat = Math.min(minLat, point[1]);
        maxLat = Math.max(maxLat, point[1]);
      }
    };
    if (geometry.type === "Polygon") processRing(geometry.coordinates[0]);
    else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) processRing(polygon[0]);
    }
    spatialIndex.push({ name: barangayName, bounds: { minLng, maxLng, minLat, maxLat }, geometry });
  }
};

/**
 * Synchronous barangay lookup (returns null if outside Bacoor).
 * Use getBarangayOrCityOptimized() when you need the async city fallback.
 */
const getBarangayOptimized = (lng, lat) => {
  if (!lng || !lat || isNaN(lng) || isNaN(lat)) return null;
  const roundedLng = Math.round(lng * 1e6) / 1e6;
  const roundedLat = Math.round(lat * 1e6) / 1e6;
  const cacheKey = `${roundedLng},${roundedLat}`;
  const cached = barangayCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.barangay;
  if (!spatialIndex) buildSpatialIndex();
  if (!spatialIndex) {
    const result = getBarangayFromCoordinates(lng, lat);
    barangayCache.set(cacheKey, { barangay: result, timestamp: Date.now() });
    return result;
  }
  const point = [lng, lat];
  const candidates = spatialIndex.filter(item =>
    lng >= item.bounds.minLng && lng <= item.bounds.maxLng &&
    lat >= item.bounds.minLat && lat <= item.bounds.maxLat
  );
  let result = null;
  for (const candidate of candidates) {
    const geometry = candidate.geometry;
    if (geometry.type === "Polygon") {
      if (isPointInPolygon(point, geometry.coordinates[0])) { result = candidate.name; break; }
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        if (isPointInPolygon(point, polygon[0])) { result = candidate.name; break; }
      }
    }
    if (result) break;
  }
  barangayCache.set(cacheKey, { barangay: result, timestamp: Date.now() });
  return result;
};

/**
 * Async version: returns the barangay name if inside Bacoor,
 * otherwise returns the city name from Nominatim (e.g. "Imus, Cavite"),
 * or null if everything fails.
 */
const getBarangayOrCityOptimized = async (lng, lat) => {
  const barangay = getBarangayOptimized(lng, lat);
  if (barangay) return barangay;
  // Outside Bacoor — try to resolve the city name
  const city = await getCityFromCoordinates(lng, lat);
  return city; // may be null; callers should handle that
};

module.exports = {
  getBarangayFromCoordinates,
  getBarangayWithCache,
  getBarangayOptimized,
  getBarangayOrCityOptimized,   // ← new async version
  getCityFromCoordinates,        // ← exported for direct use if needed
  loadBarangayGeoJSON,
};