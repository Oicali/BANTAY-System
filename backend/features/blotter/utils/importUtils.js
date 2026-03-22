const OFFENSE_MAP = {
  "NEW ANTI-CARNAPPING ACT OF 2016 - MC": "CARNAPPING - MC",
  "NEW ANTI-CARNAPPING ACT OF 2016 - MV": "CARNAPPING - MV",
  "CARNAPPING MC": "CARNAPPING - MC",
  "CARNAPPING MV": "CARNAPPING - MV",
  "PHYSICAL INJURIES": "Physical Injury",
  "PHYSICAL INJURY": "Physical Injury",
  "MURDER": "Murder",
  "HOMICIDE": "Homicide",
  "RAPE": "Rape",
  "ROBBERY": "Robbery",
  "THEFT": "Theft",
};

const BARANGAY_MAP = {
  "ANIBAN 1": "ANIBAN I", "ANIBAN 2": "ANIBAN II",
  "HABAY 1": "HABAY I", "HABAY 2": "HABAY II",
  "LIGAS 1": "LIGAS I", "LIGAS 2": "LIGAS II",
  "MALIKSI 1": "MALIKSI I", "MALIKSI 2": "MALIKSI II", "MALIKSI 3": "MALIKSI II",
  "MAMBOG 1": "MAMBOG I", "MAMBOG 2": "MAMBOG II", "MAMBOG 3": "MAMBOG III",
  "MAMBOG 4": "MAMBOG IV", "MAMBOG 5": "MAMBOG II",
  "MOLINO 1": "MOLINO I", "MOLINO 2": "MOLINO II", "MOLINO 3": "MOLINO III",
  "MOLINO 4": "MOLINO IV", "MOLINO 5": "MOLINO V",
  "MOLINO 6": "MOLINO VI", "MOLINO 7": "MOLINO VII",
  "NIOG 1": "NIOG", "NIOG 2": "NIOG", "NIOG 3": "NIOG",
  "REAL 1": "REAL", "REAL 2": "REAL",
  "SALINAS 1": "SALINAS I", "SALINAS 2": "SALINAS II",
  "SALINAS 3": "SALINAS II", "SALINAS 4": "SALINAS II",
  "SAN NICOLAS 1": "SAN NICOLAS I", "SAN NICOLAS 2": "SAN NICOLAS II", "SAN NICOLAS 3": "SAN NICOLAS III",
  "TALABA 1": "TALABA I", "TALABA 2": "TALABA II", "TALABA 3": "TALABA III",
  "TALABA 4": "TALABA III", "TALABA 5": "TALABA III", "TALABA 6": "TALABA III", "TALABA 7": "TALABA I",
  "ZAPOTE 1": "ZAPOTE I", "ZAPOTE 2": "ZAPOTE II", "ZAPOTE 3": "ZAPOTE III", "ZAPOTE 4": "ZAPOTE II",
  "PANAPAAN": "P.F. ESPIRITU I (PANAPAAN)", "PANAPAAN 1": "P.F. ESPIRITU I (PANAPAAN)",
  "PANAPAAN 2": "P.F. ESPIRITU II", "PANAPAAN 3": "P.F. ESPIRITU II",
  "PANAPAAN 4": "P.F. ESPIRITU IV", "PANAPAAN 5": "P.F. ESPIRITU V", "PANAPAAN 6": "P.F. ESPIRITU VI",
  "P.F. ESPIRITU 1 (PANAPAAN)": "P.F. ESPIRITU I (PANAPAAN)",
  "P.F. ESPIRITU 2": "P.F. ESPIRITU II", "P.F. ESPIRITU 3": "P.F. ESPIRITU III",
  "P.F. ESPIRITU 4": "P.F. ESPIRITU IV", "P.F. ESPIRITU 5": "P.F. ESPIRITU V",
  "P.F. ESPIRITU 6": "P.F. ESPIRITU VI",
  "BANALO": "SINEGUELASAN", "ALIMA": "SINEGUELASAN",
  "KAINGIN": "KAINGIN DIGMAN", "DIGMAN": "KAINGIN DIGMAN",
  "MABOLO 1": "MABOLO", "MABOLO 2": "MABOLO", "MABOLO 3": "MABOLO",
};

function normalizeOffense(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase();
  // Direct map check
  if (OFFENSE_MAP[cleaned]) return OFFENSE_MAP[cleaned];
  // Partial match fallback
  if (cleaned.includes("CARNAPPING") && cleaned.includes("MC")) return "CARNAPPING - MC";
  if (cleaned.includes("CARNAPPING") && cleaned.includes("MV")) return "CARNAPPING - MV";
  if (cleaned.includes("PHYSICAL INJ")) return "Physical Injury";
  if (cleaned === "MURDER") return "Murder";
  if (cleaned === "HOMICIDE") return "Homicide";
  if (cleaned === "RAPE") return "Rape";
  if (cleaned === "ROBBERY") return "Robbery";
  if (cleaned === "THEFT") return "Theft";
  return null; // unrecognized → flag
}

function normalizeBarangay(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase();
  if (BARANGAY_MAP[cleaned]) return BARANGAY_MAP[cleaned];
  return cleaned; // return as-is if already correct
}

function deriveFromDate(dateValue) {
  if (!dateValue) return { dayOfWeek: null, monthName: null };
  let date;
  // Handle Excel serial date numbers
  if (typeof dateValue === "number") {
    date = new Date((dateValue - 25569) * 86400 * 1000);
  } else {
    date = new Date(dateValue);
  }
  if (isNaN(date.getTime())) return { dayOfWeek: null, monthName: null };
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return {
    dayOfWeek: days[date.getDay()],
    monthName: months[date.getMonth()],
  };
}

module.exports = { normalizeOffense, normalizeBarangay, deriveFromDate };