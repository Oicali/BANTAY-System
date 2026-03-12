import { useState, useEffect } from "react";
const BASE = "https://psgc.gitlab.io/api";

export function usePSGC() {
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);

  useEffect(() => {
    setLoadingRegions(true);
    fetch(`${BASE}/regions/`)
      .then(r => r.json())
      .then(d => setRegions(d.sort((a,b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingRegions(false));
  }, []);

  const fetchProvinces = async (regionCode) => {
    try {
      const res = await fetch(`${BASE}/regions/${regionCode}/provinces/`);
      const data = await res.json();
      return data.sort((a,b) => a.name.localeCompare(b.name));
    } catch { return []; }
  };

  const fetchCities = async (provinceCode) => {
    try {
      const res = await fetch(`${BASE}/provinces/${provinceCode}/cities-municipalities/`);
      const data = await res.json();
      return data.sort((a,b) => a.name.localeCompare(b.name));
    } catch { return []; }
  };

  const fetchBarangays = async (cityCode) => {
    try {
      const res = await fetch(`${BASE}/cities-municipalities/${cityCode}/barangays/`);
      const data = await res.json();
      return data.sort((a,b) => a.name.localeCompare(b.name));
    } catch { return []; }
  };

  return { regions, loadingRegions, fetchProvinces, fetchCities, fetchBarangays };
}