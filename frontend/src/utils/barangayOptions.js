// Ground truth: GeoJSON name_db values (47 official barangays post-2023 merger)
export const CURRENT_BARANGAYS = [
  "ANIBAN I", "ANIBAN II", "BAYANAN", "DULONG BAYAN",
  "HABAY I", "HABAY II", "KAINGIN (POB.)",
  "KAINGIN DIGMAN",
  "LIGAS I", "LIGAS II",
  "MABOLO", "MALIKSI I", "MALIKSI II",
  "MAMBOG I", "MAMBOG II", "MAMBOG III", "MAMBOG IV",
  "MOLINO I", "MOLINO II", "MOLINO III", "MOLINO IV",
  "MOLINO V", "MOLINO VI", "MOLINO VII",
  "NIOG",
  "P.F. ESPIRITU I (PANAPAAN)", "P.F. ESPIRITU II",
  "P.F. ESPIRITU III", "P.F. ESPIRITU IV",
  "P.F. ESPIRITU V", "P.F. ESPIRITU VI",
  "QUEENS ROW CENTRAL", "QUEENS ROW EAST", "QUEENS ROW WEST",
  "REAL",
  "SALINAS I", "SALINAS II",
  "SAN NICOLAS I", "SAN NICOLAS II", "SAN NICOLAS III",
  "SINEGUELASAN",
  "TALABA I", "TALABA II", "TALABA III",
  "ZAPOTE I", "ZAPOTE II", "ZAPOTE III",
];

// Old/pre-2023 names that NO LONGER EXIST as dropdown options
// These resolve to their current equivalent
// NOTE: Do NOT include names that are identical to current names
// (e.g. "Zapote 1" → "ZAPOTE I" is redundant since ZAPOTE I is already selectable)
// These are only useful for legacy Excel imports and old record resolution
export const LEGACY_BARANGAY_OPTIONS = [
  // Completely different names
  { label: "Alima (→ Sineguelasan)",        value: "SINEGUELASAN" },
  { label: "Banalo (→ Sineguelasan)",       value: "SINEGUELASAN" },
  { label: "Camposanto (→ Kaingin Pob.)",   value: "KAINGIN (POB.)" },
  { label: "Daang Bukid (→ Kaingin Pob.)",  value: "KAINGIN (POB.)" },
  { label: "Tabing Dagat (→ Kaingin Pob.)", value: "KAINGIN (POB.)" },
  { label: "Kaingin (→ Kaingin Digman)",    value: "KAINGIN DIGMAN" },
  { label: "Digman (→ Kaingin Digman)",     value: "KAINGIN DIGMAN" },
  { label: "Panapaan (→ P.F. Espiritu I)",    value: "P.F. ESPIRITU I (PANAPAAN)" },
  { label: "Panapaan 2 (→ P.F. Espiritu II)", value: "P.F. ESPIRITU II" },
  { label: "Panapaan 4 (→ P.F. Espiritu IV)", value: "P.F. ESPIRITU IV" },
  { label: "Panapaan 5 (→ P.F. Espiritu V)",  value: "P.F. ESPIRITU V" },
  { label: "Panapaan 6 (→ P.F. Espiritu VI)", value: "P.F. ESPIRITU VI" },

  // Non-obvious number mappings (number ≠ Roman numeral equivalent)
  { label: "Mabolo 1 (→ Mabolo)",      value: "MABOLO" },
  { label: "Mabolo 2 (→ Mabolo)",      value: "MABOLO" },
  { label: "Mabolo 3 (→ Mabolo)",      value: "MABOLO" },
  { label: "Aniban 3 (→ Aniban I)",    value: "ANIBAN I" },
  { label: "Aniban 4 (→ Aniban II)",   value: "ANIBAN II" },
  { label: "Aniban 5 (→ Aniban I)",    value: "ANIBAN I" },
  { label: "Maliksi 3 (→ Maliksi II)", value: "MALIKSI II" },
  { label: "Mambog 5 (→ Mambog II)",   value: "MAMBOG II" },
  { label: "Niog 2 (→ Niog)",          value: "NIOG" },
  { label: "Niog 3 (→ Niog)",          value: "NIOG" },
  { label: "Real 2 (→ Real)",          value: "REAL" },
  { label: "Salinas 3 (→ Salinas II)", value: "SALINAS II" },
  { label: "Salinas 4 (→ Salinas II)", value: "SALINAS II" },
  { label: "Talaba 4 (→ Talaba III)",  value: "TALABA III" },
  { label: "Talaba 7 (→ Talaba I)",    value: "TALABA I" },
];