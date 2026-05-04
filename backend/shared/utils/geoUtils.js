// backend/shared/utils/geoUtils.js
const fs = require('fs');
const path = require('path');

let barangayGeoJSON = null;

const loadBarangayGeoJSON = () => {
  if (barangayGeoJSON) return barangayGeoJSON;
  
  // Path to your GeoJSON file in frontend public folder
  const geojsonPath = path.join(__dirname, "../../../frontend/public/bacoor_barangays.geojson");
  
  try {
    if (fs.existsSync(geojsonPath)) {
      barangayGeoJSON = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
      console.log(`Loaded GeoJSON from: ${geojsonPath}`);
    } else {
      console.error(`GeoJSON file not found at: ${geojsonPath}`);
      return null;
    }
  } catch (error) {
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
      const barangayName = feature.properties.name_db;
      
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

module.exports = { getBarangayFromCoordinates };