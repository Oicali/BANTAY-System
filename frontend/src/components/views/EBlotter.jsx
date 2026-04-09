// frontend\src\components\views\EBlotter.jsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePSGC } from "../../utils/usePSGC";
import "./EBlotter.css";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  CURRENT_BARANGAYS,
  LEGACY_BARANGAY_OPTIONS,
} from "../../utils/barangayOptions";
import ImportBlotterModal from "../modals/ImportBlotterModal";
import LoadingModal from "../modals/LoadingModal";

const OFFENSE_TO_CRIME_TYPE = {
  Murder: "MURDER",
  Homicide: "HOMICIDE",
  "Physical Injury": "PHYSICAL INJURIES",
  Rape: "RAPE",
  Robbery: "ROBBERY",
  Theft: "THEFT",
  "Carnapping - MC": "CARNAPPING - MC",
  "Carnapping - MV": "CARNAPPING - MV",
  "Special Complex Crime": "SPECIAL COMPLEX CRIME",
};
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
    // Handle P.F. — keep dots
    if (upper === "P" || upper === "F") return upper;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
};
const BARANGAY_MIGRATION_MAP = {
  // Roman numeral variants → GeoJSON exact names
  "ANIBAN 1": "ANIBAN I",
  "ANIBAN 2": "ANIBAN II",
  "HABAY 1": "HABAY I",
  "HABAY 2": "HABAY II",
  "LIGAS 1": "LIGAS I",
  "LIGAS 2": "LIGAS II",
  "MABOLO 1": "MABOLO",
  "MABOLO 2": "MABOLO",
  "MABOLO 3": "MABOLO",
  "MALIKSI 1": "MALIKSI I",
  "MALIKSI 2": "MALIKSI II",
  "MALIKSI 3": "MALIKSI II",
  "MAMBOG 1": "MAMBOG I",
  "MAMBOG 2": "MAMBOG II",
  "MAMBOG 3": "MAMBOG III",
  "MAMBOG 4": "MAMBOG IV",
  "MAMBOG 5": "MAMBOG II",
  "MOLINO 1": "MOLINO I",
  "MOLINO 2": "MOLINO II",
  "MOLINO 3": "MOLINO III",
  "MOLINO 4": "MOLINO IV",
  "MOLINO 5": "MOLINO V",
  "MOLINO 6": "MOLINO VI",
  "MOLINO 7": "MOLINO VII",
  "NIOG 1": "NIOG",
  "NIOG 2": "NIOG",
  "NIOG 3": "NIOG",
  "REAL 1": "REAL",
  "REAL 2": "REAL",
  "SALINAS 1": "SALINAS I",
  "SALINAS 2": "SALINAS II",
  "SALINAS 3": "SALINAS II",
  "SALINAS 4": "SALINAS II",
  "SAN NICOLAS 1": "SAN NICOLAS I",
  "SAN NICOLAS 2": "SAN NICOLAS II",
  "SAN NICOLAS 3": "SAN NICOLAS III",
  "TALABA 1": "TALABA I",
  "TALABA 2": "TALABA II",
  "TALABA 3": "TALABA III",
  "TALABA 4": "TALABA III",
  "TALABA 5": "TALABA III",
  "TALABA 6": "TALABA III",
  "TALABA 7": "TALABA I",
  "ZAPOTE 1": "ZAPOTE I",
  "ZAPOTE 2": "ZAPOTE II",
  "ZAPOTE 3": "ZAPOTE III",
  "ZAPOTE 4": "ZAPOTE II",
  "QUEENS ROW CENTRAL": "QUEENS ROW CENTRAL",
  "QUEENS ROW EAST": "QUEENS ROW EAST",
  "QUEENS ROW WEST": "QUEENS ROW WEST",
  // Old names that were merged/renamed
  BANALO: "SINEGUELASAN",
  ALIMA: "SINEGUELASAN",
  SINBANALI: "SINEGUELASAN",
  CAMPOSANTO: "KAINGIN (POB.)",
  "DAANG BUKID": "KAINGIN (POB.)",
  "TABING DAGAT": "KAINGIN (POB.)",
  DIGMAN: "KAINGIN DIGMAN",
  KAINGIN: "KAINGIN DIGMAN",
  "KAINGIN DIGMAN": "KAINGIN DIGMAN",
  PANAPAAN: "P.F. ESPIRITU I (PANAPAAN)",
  "PANAPAAN 1": "P.F. ESPIRITU I (PANAPAAN)",
  "PANAPAAN 2": "P.F. ESPIRITU II",
  "PANAPAAN 3": "P.F. ESPIRITU II",
  "PANAPAAN 4": "P.F. ESPIRITU IV",
  "PANAPAAN 5": "P.F. ESPIRITU V",
  "PANAPAAN 6": "P.F. ESPIRITU VI",
  "P.F. ESPIRITU 1 (PANAPAAN)": "P.F. ESPIRITU I (PANAPAAN)",
  "P.F. ESPIRITU 2": "P.F. ESPIRITU II",
  "P.F. ESPIRITU 3": "P.F. ESPIRITU III",
  "P.F. ESPIRITU 4": "P.F. ESPIRITU IV",
  "P.F. ESPIRITU 5": "P.F. ESPIRITU V",
  "P.F. ESPIRITU 6": "P.F. ESPIRITU VI",
};

const FieldError = ({ error }) => {
  if (!error) return null;
  return <span className="eb-field-error">{error}</span>;
};

const ViewIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const DeleteIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

function EBlotter() {
  const [showModal, setShowModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [blotters, setBlotters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeReportTab, setActiveReportTab] = useState("reports");
  const ITEMS_PER_PAGE = 15;
  const [originalData, setOriginalData] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [deletedBlotters, setDeletedBlotters] = useState([]);
  const [acceptMode, setAcceptMode] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [hasSuspect, setHasSuspect] = useState(false);
  const [isImportedRecord, setIsImportedRecord] = useState(false);
  const [offenseModus, setOffenseModus] = useState({});
  const [offenseSelectedModus, setOffenseSelectedModus] = useState({});
  const [typeOfPlace, setTypeOfPlace] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [deletedPage, setDeletedPage] = useState(1);
  const DELETED_PER_PAGE = 15;
  const [reactToast, setReactToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showReactToast = (message, type = "success") => {
    setReactToast({ show: true, message, type });
    setTimeout(
      () => setReactToast({ show: false, message: "", type: "success" }),
      3000,
    );
  };
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    incident_type: "",
    date_from: "",
    date_to: "",
    barangay: "",
    data_source: "",
  });
  const [editMode, setEditMode] = useState(false);
  const [editingBlotterId, setEditingBlotterId] = useState(null);
  const [fetchingEdit, setFetchingEdit] = useState(false);
  const [fetchingView, setFetchingView] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    type: "",
    id: null,
    message: "",
  });
  const [complainants, setComplainants] = useState([
    {
      first_name: "",
      middle_name: "",
      last_name: "",
      qualifier: "",
      alias: "",
      gender: "Male",
      nationality: "FILIPINO",
      contact_number: "",
      region_code: "",
      province_code: "",
      municipality_code: "",
      barangay_code: "",
      house_street: "",
      info_obtained: "PERSONAL",
      occupation: "",
    },
  ]);
  const {
    regions,
    loadingRegions,
    fetchProvinces,
    fetchCities,
    fetchCitiesByRegion,
    fetchBarangays,
  } = usePSGC();

  const [cProvinces, setCProvinces] = useState({});
  const [cCities, setCCities] = useState({});
  const [cBarangays, setCBarangays] = useState({});
  const [cLoadingProv, setCLoadingProv] = useState({});
  const [cLoadingCity, setCLoadingCity] = useState({});
  const [cLoadingBrgy, setCLoadingBrgy] = useState({});

  const [sProvinces, setSProvinces] = useState({});
  const [sCities, setSCities] = useState({});
  const [sBarangays, setSBarangays] = useState({});
  const [sLoadingProv, setSLoadingProv] = useState({});
  const [sLoadingCity, setSLoadingCity] = useState({});
  const [sLoadingBrgy, setSLoadingBrgy] = useState({});
  const [caseProvinces, setCaseProvinces] = useState([]);
  const [caseCities, setCaseCities] = useState([]);
  const [bacoorBarangays, setBacoorBarangays] = useState([]);
  const [loadingBacoorBrgy, setLoadingBacoorBrgy] = useState(false);
  const [barangayGeoJSON, setBarangayGeoJSON] = useState(null);
  const [selectedBrgyFeature, setSelectedBrgyFeature] = useState(null);
  const mapRef = React.useRef(null);

  const [suspects, setSuspects] = useState([
    {
      first_name: "",
      middle_name: "",
      last_name: "",
      qualifier: "",
      alias: "",
      gender: "Male",
      birthday: "",
      age: "",
      birth_place: "",
      nationality: "FILIPINO",
      region_code: "",
      province_code: "",
      municipality_code: "",
      barangay_code: "",
      house_street: "",
      status: "At Large",
      location_if_arrested: "",
      degree_participation: "Principal",
      relation_to_victim: "",
      educational_attainment: "",
      height_cm: "",
      drug_used: false,
      motive: "",
      occupation: "",
    },
  ]);

  const [offenses, setOffenses] = useState([
    {
      is_principal_offense: true,
      offense_type: "",
      offense_name: "",
      stage_of_felony: "",
      index_type: "Non-Index",
      investigator_on_case: "",
      most_investigator: "",
    },
  ]);

  const [caseDetail, setCaseDetail] = useState({
    incident_type: "",
    cop: "",
    date_time_commission: "",
    date_time_reported: "",
    is_crime: true,
    place_region: "Region IV-A (CALABARZON)",
    place_district_province: "Cavite",
    place_city_municipality: "Bacoor City",
    place_barangay: "",
    place_barangay_other: "",
    place_street: "",
    is_private_place: "",
    narrative: "",
    amount_involved: "",
    lat: "",
    lng: "",
  });

  const totalSteps = 3;
  const API_URL = `${import.meta.env.VITE_API_URL}/blotters`;

  useEffect(() => {
    fetchBlotters();
    // Auto-open from Crime Mapping "View Full Case"
    const targetId = sessionStorage.getItem("openBlotterId");
    if (targetId) {
      sessionStorage.removeItem("openBlotterId");
      setTimeout(() => handleView(targetId), 800);
    }

    const CALABARZON_CODE = "040000000";
    const CAVITE_CODE = "042100000";
    const BACOOR_CODE = "042103000";

    fetchProvinces(CALABARZON_CODE).then((data) => setCaseProvinces(data));
    fetchCities(CAVITE_CODE).then((data) => setCaseCities(data));
    fetch("/bacoor_barangays.geojson")
      .then((r) => r.json())
      .then((data) => {
        setBarangayGeoJSON(data);
        const brgyList = data.features
          .map((f) => f.properties.name_db)
          .filter(Boolean)
          .filter((name, index, self) => self.indexOf(name) === index) // removes duplicate KAINGIN
          .sort();
        setBacoorBarangays(brgyList);
      })
      .catch((err) => console.error("Failed to load barangay GeoJSON:", err));
  }, [activeReportTab]);

  const fetchBlotters = async () => {
    try {
      setLoading(true);
      setBlotters([]);
      const queryParams = new URLSearchParams();
      if (filters.search) queryParams.append("search", filters.search);
      if (filters.status) queryParams.append("status", filters.status);
      // if (filters.incident_type)
      //   queryParams.append("incident_type", filters.incident_type);
      if (filters.date_from) queryParams.append("date_from", filters.date_from);
      if (filters.date_to) queryParams.append("date_to", filters.date_to);
      if (filters.barangay) queryParams.append("barangay", filters.barangay);

      if (activeReportTab === "referred") {
        queryParams.append("referred", "true");
      } else if (filters.data_source !== "brgy_referral") {
        queryParams.append("referred", "false");
      }

      const rawResponse = await fetch(`${API_URL}?${queryParams}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const response = handleApiResponse(rawResponse);
      if (!response) return;
      const data = await response.json();
      if (data.success) {
        let results = data.data;
        if (filters.incident_type) {
          results = results.filter(
            (b) =>
              b.incident_type.toLowerCase() ===
              filters.incident_type.toLowerCase(),
          );
        }
        if (filters.data_source === "brgy_referral") {
          results = results.filter((b) =>
            (b.blotter_entry_number || "").toUpperCase().startsWith("BRGY"),
          );
        } else if (filters.data_source === "bantay_import") {
          results = results.filter((b) =>
            (b.blotter_entry_number || "").toUpperCase().startsWith("BLT"),
          );
        } else if (filters.data_source === "manual") {
          results = results.filter((b) =>
            /^\d{4}/.test(b.blotter_entry_number || ""),
          );
        }
        setBlotters(results);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };
  const fetchDeletedBlotters = async () => {
    try {
      setTrashLoading(true);
      const response = await fetch(`${API_URL}/deleted/all`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      if (data.success) setDeletedBlotters(data.data);
    } catch (error) {
      console.error("Error fetching deleted reports:", error);
    } finally {
      setTrashLoading(false);
    }
  };

  const handleRestore = (blotterId) => {
    showConfirm(
      "restore",
      blotterId,
      "Restore this report entry? It will be moved back to active records.",
    );
  };
  const showConfirm = (type, id, message) => {
    setConfirmModal({ show: true, type, id, message });
  };

  const handleConfirmAction = async () => {
    const { type, id } = confirmModal;
    setConfirmModal({ show: false, type: "", id: null, message: "" });

    if (type === "delete") {
      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const data = await response.json();
        if (data.success) {
          showReactToast("Report deleted successfully.");
          fetchBlotters();
        }
      } catch (error) {
        alert("Error deleting report.");
      }
    }

    if (type === "restore") {
      try {
        const response = await fetch(`${API_URL}/${id}/restore`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const data = await response.json();
        if (data.success) {
          showReactToast("Report restored successfully.");
          fetchDeletedBlotters();
          fetchBlotters();
        }
      } catch (error) {
        alert("Error restoring report.");
      }
    }
  };
  const fetchModusForIncidentType = async (
    incidentType,
    preserveSelection = false,
  ) => {
    const crimeType = OFFENSE_TO_CRIME_TYPE[incidentType];
    if (!crimeType) {
      setOffenseModus((prev) => ({ ...prev, [0]: [] }));
      if (!preserveSelection) {
        setOffenseSelectedModus((prev) => ({ ...prev, [0]: [] }));
      }
      return;
    }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/blotters/modus/${encodeURIComponent(crimeType)}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );
      const data = await res.json();
      if (data.success) {
        setOffenseModus((prev) => ({ ...prev, [0]: data.data }));
        if (!preserveSelection) {
          setOffenseSelectedModus((prev) => ({ ...prev, [0]: [] }));
        }
      }
    } catch (err) {
      console.error("Modus fetch error:", err);
    }
  };

  useEffect(() => {
    if (currentStep === 3) {
      // Sync offense_name with incident_type if empty
      if (!offenses[0]?.offense_name && caseDetail.incident_type) {
        updateOffense(0, "offense_name", caseDetail.incident_type);
        updateOffense(0, "index_type", "Index");
      }
      if (
        caseDetail.incident_type &&
        (!offenseModus[0] || offenseModus[0].length === 0)
      ) {
        fetchModusForIncidentType(caseDetail.incident_type, true);
      }
    }
  }, [currentStep]);

  const handleEdit = async (blotterId) => {
    setFetchingEdit(true);
    try {
      const response = await fetch(`${API_URL}/${blotterId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setComplainants(data.data.complainants);
        setSuspects(data.data.suspects);
        setHasSuspect(data.data.suspects && data.data.suspects.length > 0);
        const hasNoPsgcCodes = data.data.complainants.every(
          (c) => !c.region_code && !c.province_code && !c.municipality_code,
        );
        setIsImportedRecord(hasNoPsgcCodes);

        const OFFENSE_NORMALIZE = {
          "carnapping - mc": "Carnapping - MC",
          "carnapping - mv": "Carnapping - MV",
          "special complex crime": "Special Complex Crime",
        };
        const normalizedOffenses = data.data.offenses.map((o) => ({
          ...o,
          offense_name:
            OFFENSE_NORMALIZE[o.offense_name?.toLowerCase()] || o.offense_name,
        }));
        setOffenses(normalizedOffenses);
        // Load modus for edit mode
        setTypeOfPlace(data.data.type_of_place || "");

        const newOffenseModus = {};
        const newOffenseSelectedModus = {};
        const crimeType = OFFENSE_TO_CRIME_TYPE[data.data.incident_type];
        if (crimeType) {
          try {
            const modusRes = await fetch(
              `${import.meta.env.VITE_API_URL}/blotters/modus/${encodeURIComponent(crimeType)}`,
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
              },
            );
            const modusData = await modusRes.json();
            if (modusData.success) {
              newOffenseModus[0] = modusData.data;
              newOffenseSelectedModus[0] = data.data.modus_refs
                ? data.data.modus_refs.map((m) => m.modus_reference_id)
                : [];
            }
          } catch (e) {
            console.error(e);
          }
        } else {
          newOffenseModus[0] = [];
          newOffenseSelectedModus[0] = [];
        }
        setOffenseModus(newOffenseModus);
        setOffenseSelectedModus(newOffenseSelectedModus);
        const isCustomBarangay = false;
        const rawBrgy = data.data.place_barangay || "";
        const resolvedBrgy =
          BARANGAY_MIGRATION_MAP[rawBrgy.toUpperCase()] || rawBrgy;
        setCaseDetail({
          incident_type: data.data.incident_type,
          cop: data.data.cop,
          date_time_commission: data.data.date_time_commission || "",
          date_time_reported: data.data.date_time_reported || "",
          is_crime: data.data.is_crime,
          place_region: "Region IV-A (CALABARZON)",
          place_district_province: "Cavite",
          place_city_municipality: "Bacoor City",
          place_barangay: resolvedBrgy,
          place_barangay_other: "",
          place_street: data.data.place_street,
          is_private_place: data.data.is_private_place,
          narrative: data.data.narrative,
          amount_involved: data.data.amount_involved,
          referred_by_barangay: data.data.referred_by_barangay,
          referred_to_barangay: data.data.referred_to_barangay,
          referred_by_dilg: data.data.referred_by_dilg,
          lat: data.data.lat != null ? String(data.data.lat) : "",
          lng: data.data.lng != null ? String(data.data.lng) : "",
          modus: data.data.modus_text || "",
        });

        // Restore barangay boundary feature when editing
        if (resolvedBrgy && barangayGeoJSON) {
          const feature = barangayGeoJSON.features.find(
            (f) => f.properties.name_db === resolvedBrgy,
          );
          setSelectedBrgyFeature(feature || null);
        }
        // Store original data for change detection
        setOriginalData({
          complainants: data.data.complainants,
          suspects: data.data.suspects,
          offenses: data.data.offenses,
          caseDetail: {
            incident_type: data.data.incident_type,
            cop: data.data.cop,
            date_time_commission: data.data.date_time_commission || "",
            date_time_reported: data.data.date_time_reported || "",
            is_crime: data.data.is_crime,
            place_region: data.data.place_region,
            place_district_province: data.data.place_district_province,
            place_city_municipality: data.data.place_city_municipality,
            place_barangay: isCustomBarangay
              ? "Other"
              : data.data.place_barangay,
            place_barangay_other: isCustomBarangay
              ? data.data.place_barangay
              : "",
            place_street: data.data.place_street,
            is_private_place: data.data.is_private_place,
            narrative: data.data.narrative,
            amount_involved: data.data.amount_involved,
            referred_by_barangay: data.data.referred_by_barangay,
            referred_to_barangay: data.data.referred_to_barangay,
            referred_by_dilg: data.data.referred_by_dilg,
            lat: data.data.lat != null ? String(data.data.lat) : "",
            lng: data.data.lng != null ? String(data.data.lng) : "",
            modus: data.data.modus_text || "",
          },
        });
        const newCProvinces = {},
          newCCities = {},
          newCBarangays = {};
        const updatedComplainants = data.data.complainants.map((c) => ({
          ...c,
          region_code: c.region_code || "",
          province_code: c.province_code || "",
          municipality_code: c.municipality_code || "",
          barangay_code: c.barangay_code || "",
        }));

        try {
          await Promise.all(
            updatedComplainants.map(async (c, i) => {
              const [provs, cities, brgys] = await Promise.all([
                c.region_code
                  ? fetchProvinces(c.region_code)
                  : Promise.resolve([]),
                c.province_code
                  ? fetchCities(c.province_code)
                  : Promise.resolve([]),
                c.municipality_code
                  ? fetchBarangays(c.municipality_code)
                  : Promise.resolve([]),
              ]);
              newCProvinces[i] = provs;
              newCCities[i] = cities;
              newCBarangays[i] = brgys;
            }),
          );
        } catch (e) {
          showReactToast(
            "Some address dropdowns failed to load. Please re-select.",
            "warning",
          );
        }
        setComplainants(updatedComplainants);
        setCProvinces(newCProvinces);
        setCCities(newCCities);
        setCBarangays(newCBarangays);

        const newSProvinces = {},
          newSCities = {},
          newSBarangays = {};
        const updatedSuspects = data.data.suspects.map((s) => ({
          ...s,
          region_code: s.region_code || "",
          province_code: s.province_code || "",
          municipality_code: s.municipality_code || "",
          barangay_code: s.barangay_code || "",
        }));

        try {
          await Promise.all(
            updatedSuspects.map(async (s, i) => {
              const [provs, cities, brgys] = await Promise.all([
                s.region_code
                  ? fetchProvinces(s.region_code)
                  : Promise.resolve([]),
                s.province_code
                  ? fetchCities(s.province_code)
                  : Promise.resolve([]),
                s.municipality_code
                  ? fetchBarangays(s.municipality_code)
                  : Promise.resolve([]),
              ]);
              newSProvinces[i] = provs;
              newSCities[i] = cities;
              newSBarangays[i] = brgys;
            }),
          );
        } catch (e) {
          showReactToast(
            "Some address dropdowns failed to load. Please re-select.",
            "warning",
          );
        }
        setSuspects(updatedSuspects);
        setSProvinces(newSProvinces);
        setSCities(newSCities);
        setSBarangays(newSBarangays);
        setEditMode(true);
        setViewMode(false);
        setEditingBlotterId(blotterId);
        setShowModal(true);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to load blotter data");
    } finally {
      setFetchingEdit(false);
    }
  };
  const handleView = async (blotterId) => {
    setFetchingView(true);
    try {
      const response = await fetch(`${API_URL}/${blotterId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setComplainants(data.data.complainants);
        setSuspects(data.data.suspects);
        setHasSuspect(data.data.suspects && data.data.suspects.length > 0);
        const OFFENSE_NORMALIZE = {
          "carnapping - mc": "Carnapping - MC",
          "carnapping - mv": "Carnapping - MV",
          "special complex crime": "Special Complex Crime",
        };
        const normalizedOffenses = data.data.offenses.map((o) => ({
          ...o,
          offense_name:
            OFFENSE_NORMALIZE[o.offense_name?.toLowerCase()] || o.offense_name,
        }));
        setOffenses(normalizedOffenses);
        setTypeOfPlace(data.data.type_of_place || "");

        // Load per-offense modus
        const newOffenseModus = {};
        const newOffenseSelectedModus = {};
        const crimeType = OFFENSE_TO_CRIME_TYPE[data.data.incident_type];
        if (crimeType) {
          try {
            const modusRes = await fetch(
              `${import.meta.env.VITE_API_URL}/blotters/modus/${encodeURIComponent(crimeType)}`,
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
              },
            );
            const modusData = await modusRes.json();
            if (modusData.success) {
              newOffenseModus[0] = modusData.data;
              newOffenseSelectedModus[0] = data.data.modus_refs
                ? data.data.modus_refs.map((m) => m.modus_reference_id)
                : [];
            }
          } catch (e) {
            console.error(e);
          }
        } else {
          newOffenseModus[0] = [];
          newOffenseSelectedModus[0] = [];
        }
        setOffenseModus(newOffenseModus);
        setOffenseSelectedModus(newOffenseSelectedModus);
        const isCustomBarangay = false;
        const rawBrgy = data.data.place_barangay || "";
        const resolvedBrgy =
          BARANGAY_MIGRATION_MAP[rawBrgy.toUpperCase()] || rawBrgy;

        setCaseDetail({
          incident_type: data.data.incident_type,
          cop: data.data.cop,
          date_time_commission: data.data.date_time_commission || "",
          date_time_reported: data.data.date_time_reported || "",
          is_crime: data.data.is_crime,
          place_region: "Region IV-A (CALABARZON)",
          place_district_province: "Cavite",
          place_city_municipality: "Bacoor City",
          place_barangay: resolvedBrgy,
          place_barangay_other: "",
          place_street: data.data.place_street,
          is_private_place: data.data.is_private_place,
          narrative: data.data.narrative,
          amount_involved: data.data.amount_involved,
          referred_by_barangay: data.data.referred_by_barangay,
          referred_to_barangay: data.data.referred_to_barangay,
          referred_by_dilg: data.data.referred_by_dilg,
          lat: data.data.lat != null ? String(data.data.lat) : "",
          lng: data.data.lng != null ? String(data.data.lng) : "",
          modus: data.data.modus_text || "",
        });
        if (resolvedBrgy && barangayGeoJSON) {
          const feature = barangayGeoJSON.features.find(
            (f) => f.properties.name_db === resolvedBrgy,
          );
          setSelectedBrgyFeature(feature || null);
        }
        setViewMode(true);
        setEditMode(false);
        setEditingBlotterId(null);
        setShowModal(true);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to load blotter data");
    } finally {
      setFetchingView(false);
    }
  };
  const handleAcceptReferral = async (blotterId) => {
    try {
      const response = await fetch(`${API_URL}/${blotterId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setComplainants(data.data.complainants);
        setSuspects(data.data.suspects);
        setHasSuspect(data.data.suspects && data.data.suspects.length > 0);

        const OFFENSE_NORMALIZE = {
          "carnapping - mc": "Carnapping - MC",
          "carnapping - mv": "Carnapping - MV",
          "special complex crime": "Special Complex Crime",
        };
        const normalizedOffenses = data.data.offenses.map((o) => ({
          ...o,
          offense_name:
            OFFENSE_NORMALIZE[o.offense_name?.toLowerCase()] || o.offense_name,
        }));
        setOffenses(normalizedOffenses);
        setTypeOfPlace(data.data.type_of_place || "");

        const newOffenseModus = {};
        const newOffenseSelectedModus = {};
        const crimeType = OFFENSE_TO_CRIME_TYPE[data.data.incident_type];
        if (crimeType) {
          try {
            const modusRes = await fetch(
              `${import.meta.env.VITE_API_URL}/blotters/modus/${encodeURIComponent(crimeType)}`,
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
              },
            );
            const modusData = await modusRes.json();
            if (modusData.success) {
              newOffenseModus[0] = modusData.data;
              newOffenseSelectedModus[0] = data.data.modus_refs
                ? data.data.modus_refs.map((m) => m.modus_reference_id)
                : [];
            }
          } catch (e) {
            console.error(e);
          }
        } else {
          newOffenseModus[0] = [];
          newOffenseSelectedModus[0] = [];
        }
        setOffenseModus(newOffenseModus);
        setOffenseSelectedModus(newOffenseSelectedModus);

        const rawBrgy = data.data.place_barangay || "";
        const resolvedBrgy =
          BARANGAY_MIGRATION_MAP[rawBrgy.toUpperCase()] || rawBrgy;

        setCaseDetail({
          incident_type: data.data.incident_type,
          cop: data.data.cop || "",
          date_time_commission: data.data.date_time_commission || "",
          date_time_reported: data.data.date_time_reported || "",
          is_crime: data.data.is_crime,
          place_region: "Region IV-A (CALABARZON)",
          place_district_province: "Cavite",
          place_city_municipality: "Bacoor City",
          place_barangay: resolvedBrgy,
          place_barangay_other: "",
          place_street: data.data.place_street,
          is_private_place: data.data.is_private_place,
          narrative: data.data.narrative,
          amount_involved: data.data.amount_involved,
          referred_by_barangay: data.data.referred_by_barangay,
          referred_to_barangay: data.data.referred_to_barangay,
          referred_by_dilg: data.data.referred_by_dilg,
          lat: data.data.lat != null ? String(data.data.lat) : "",
          lng: data.data.lng != null ? String(data.data.lng) : "",
          modus: data.data.modus_text || "",
        });

        if (resolvedBrgy && barangayGeoJSON) {
          const feature = barangayGeoJSON.features.find(
            (f) => f.properties.name_db === resolvedBrgy,
          );
          setSelectedBrgyFeature(feature || null);
        }

        setAcceptMode(true);
        setEditMode(false);
        setViewMode(false);
        setEditingBlotterId(blotterId);
        setCurrentStep(1);
        setShowModal(true);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to load blotter data");
    }
  };
  const handleApiResponse = (response) => {
    if (response.status === 401) {
      alert("Your session has expired. Please log in again.");
      localStorage.removeItem("token");
      window.location.href = "/login";
      return null;
    }
    return response;
  };

  const handleDelete = (blotterId) => {
    showConfirm(
      "delete",
      blotterId,
      "Are you sure you want to delete this report entry? This will move it to Deleted Records.",
    );
  };

  const handleFilterChange = (e) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const clearFilters = async () => {
    setFilters({
      search: "",
      status: "",
      incident_type: "",
      date_from: "",
      date_to: "",
      barangay: "",
      data_source: "",
    });

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setBlotters(data.data);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Input helpers
  const handleLettersOnly = (value) => value.replace(/[^A-Za-zÑñ\s'-]/g, "");
  const handleNumbersOnly = (value) => value.replace(/\D/g, "");

  const validateCurrentStep = () => {
    const errors = {};

    if (currentStep === 1) {
      complainants.forEach((c, i) => {
        const p = `complainant_${i}`;

        // First Name validation
        if (!c.first_name || c.first_name.trim().length === 0) {
          errors[`${p}_first_name`] = "Required";
        } else if (c.first_name.trim().length < 2) {
          errors[`${p}_first_name`] = "Must be at least 2 characters";
        } else if (c.first_name.trim().length > 50) {
          errors[`${p}_first_name`] = "Maximum 50 characters";
        } else if (!/^[A-Za-zÑñ\s'-]+$/.test(c.first_name.trim())) {
          errors[`${p}_first_name`] = "Letters only";
        }

        // Middle Name validation (optional)
        if (c.middle_name && c.middle_name.trim().length > 0) {
          if (c.middle_name.trim().length < 2) {
            errors[`${p}_middle_name`] = "Must be at least 2 characters";
          } else if (c.middle_name.trim().length > 50) {
            errors[`${p}_middle_name`] = "Maximum 50 characters";
          } else if (!/^[A-Za-zÑñ\s'-]+$/.test(c.middle_name.trim())) {
            errors[`${p}_middle_name`] = "Letters only";
          }
        }

        // Last Name validation
        if (!c.last_name || c.last_name.trim().length === 0) {
          errors[`${p}_last_name`] = "Required";
        } else if (c.last_name.trim().length < 2) {
          errors[`${p}_last_name`] = "Must be at least 2 characters";
        } else if (c.last_name.trim().length > 50) {
          errors[`${p}_last_name`] = "Maximum 50 characters";
        } else if (!/^[A-Za-zÑñ\s'-]+$/.test(c.last_name.trim())) {
          errors[`${p}_last_name`] = "Letters only";
        }
        if (c.house_street && c.house_street.trim().length > 0) {
          if (c.house_street.trim().length < 2) {
            errors[`${p}_house_street`] = "Must be at least 2 characters";
          } else if (c.house_street.trim().length > 200) {
            errors[`${p}_house_street`] = "Maximum 200 characters";
          }
        }

        // Contact Number validation (optional)
        if (
          c.contact_number &&
          c.contact_number.length > 0 &&
          !isImportedRecord
        ) {
          if (c.contact_number.length !== 11) {
            errors[`${p}_contact_number`] = "Must be exactly 11 digits";
          } else if (!c.contact_number.startsWith("09")) {
            errors[`${p}_contact_number`] = "Must start with 09";
          }
        }

        // Gender validation
        if (!c.gender) {
          errors[`${p}_gender`] = "Please select gender";
        }

        // Nationality validation
        if (!c.nationality) {
          errors[`${p}_nationality`] = "Please select nationality";
        }

        // Info Obtained validation
        if (!c.info_obtained) {
          errors[`${p}_info_obtained`] = "Required";
        }
      });
    }

    if (currentStep === 2) {
      // If suspect was removed, skip ALL validation
      if (!hasSuspect) return errors;

      suspects.forEach((s, i) => {
        const p = `suspect_${i}`;

        // First Name — required
        // First Name — optional, validate only if provided
        if (s.first_name && s.first_name.trim().length > 0) {
          if (s.first_name.trim().length < 2) {
            errors[`${p}_first_name`] = "At least 2 characters";
          } else if (s.first_name.trim().length > 50) {
            errors[`${p}_first_name`] = "Maximum 50 characters";
          }
        }

        // Middle Name — optional, validate only if provided
        if (s.middle_name && s.middle_name.trim().length > 0) {
          if (s.middle_name.trim().length < 2) {
            errors[`${p}_middle_name`] = "At least 2 characters";
          } else if (s.middle_name.trim().length > 50) {
            errors[`${p}_middle_name`] = "Maximum 50 characters";
          } else if (!/^[A-Za-zÑñ\s'-]+$/.test(s.middle_name.trim())) {
            errors[`${p}_middle_name`] = "Letters only";
          }
        }

        // Last Name — required
        // Last Name — optional, validate only if provided
        if (s.last_name && s.last_name.trim().length > 0) {
          if (s.last_name.trim().length < 2) {
            errors[`${p}_last_name`] = "At least 2 characters";
          } else if (s.last_name.trim().length > 50) {
            errors[`${p}_last_name`] = "Maximum 50 characters";
          }
        }

        // Location if arrested — required only when status is arrested/custody/detained
        if (
          (s.status === "Arrested" ||
            s.status === "In Custody" ||
            s.status === "Detained") &&
          (!s.location_if_arrested ||
            s.location_if_arrested.trim().length === 0)
        ) {
          errors[`${p}_location_if_arrested`] = "Required when arrested";
        } else if (
          s.location_if_arrested &&
          s.location_if_arrested.trim().length > 0
        ) {
          if (s.location_if_arrested.trim().length < 5) {
            errors[`${p}_location_if_arrested`] = "At least 5 characters";
          } else if (s.location_if_arrested.trim().length > 200) {
            errors[`${p}_location_if_arrested`] = "Maximum 200 characters";
          }
        }

        // Gender — optional, validate only if provided
        if (s.gender && s.gender.trim().length > 0) {
          if (!["Male", "Female"].includes(s.gender)) {
            errors[`${p}_gender`] = "Invalid gender";
          }
        }

        // House/Street — optional, validate length only if provided
        if (s.house_street && s.house_street.trim().length > 0) {
          if (s.house_street.trim().length < 2) {
            errors[`${p}_house_street`] = "At least 2 characters";
          } else if (s.house_street.trim().length > 200) {
            errors[`${p}_house_street`] = "Maximum 200 characters";
          }
        }

        // Nationality — optional, validate only if provided
        if (s.nationality && s.nationality.trim().length > 0) {
          if (s.nationality.trim().length < 2) {
            errors[`${p}_nationality`] = "At least 2 characters";
          }
        }

        // Age — optional, validate only if provided
        if (s.age && String(s.age).trim().length > 0) {
          const age = parseInt(s.age);
          if (isNaN(age) || age < 10 || age > 120) {
            errors[`${p}_age`] = "Must be 10-120";
          }
        }

        // Height — optional, validate only if provided
        if (s.height_cm && String(s.height_cm).trim().length > 0) {
          const height = parseInt(s.height_cm);
          if (isNaN(height) || height < 50 || height > 250) {
            errors[`${p}_height_cm`] = "Must be 50-250 cm";
          }
        }

        // Birthday — optional, validate only if provided
        if (s.birthday) {
          const birthDate = new Date(s.birthday);
          const today = new Date();
          const age = today.getFullYear() - birthDate.getFullYear();
          if (birthDate > today) {
            errors[`${p}_birthday`] = "Cannot be future date";
          } else if (age < 10) {
            errors[`${p}_birthday`] = "Must be at least 10 years old";
          }
        }
      });
    }

    if (currentStep === 3) {
      // Incident Type
      if (!caseDetail.incident_type || caseDetail.incident_type === "") {
        errors.incident_type = "Required";
      }

      // COP — optional
      if (caseDetail.cop && caseDetail.cop.trim().length > 0) {
        if (caseDetail.cop.trim().length < 2) {
          errors.cop = "At least 2 characters";
        } else if (caseDetail.cop.trim().length > 100) {
          errors.cop = "Maximum 100 characters";
        }
      }

      // Date & Time of Commission
      if (!caseDetail.date_time_commission) {
        errors.date_time_commission = "Required";
      } else {
        const commission = new Date(caseDetail.date_time_commission);
        const now = new Date();

        if (commission > now) {
          errors.date_time_commission = "Cannot be future date";
        }

        if (caseDetail.date_time_reported) {
          const reported = new Date(caseDetail.date_time_reported);
          if (commission > reported) {
            errors.date_time_commission = "Must be before report date";
          }
        }
      }

      // Date & Time Reported
      if (!caseDetail.date_time_reported) {
        errors.date_time_reported = "Required";
      } else {
        const reported = new Date(caseDetail.date_time_reported);
        const now = new Date();

        if (reported > now) {
          errors.date_time_reported = "Cannot be future date";
        }

        if (caseDetail.date_time_commission) {
          const commission = new Date(caseDetail.date_time_commission);
          if (reported < commission) {
            errors.date_time_reported = "Cannot be before commission";
          }
        }
      }

      // Place - Region
      if (!caseDetail.place_region || caseDetail.place_region === "") {
        errors.place_region = "Required";
      }

      // District/Province
      if (
        !caseDetail.place_district_province ||
        caseDetail.place_district_province.trim().length === 0
      ) {
        errors.place_district_province = "Required";
      } else if (caseDetail.place_district_province.trim().length < 3) {
        errors.place_district_province = "At least 3 characters";
      } else if (caseDetail.place_district_province.trim().length > 100) {
        errors.place_district_province = "Maximum 100 characters";
      }

      // City/Municipality
      if (
        !caseDetail.place_city_municipality ||
        caseDetail.place_city_municipality.trim().length === 0
      ) {
        errors.place_city_municipality = "Required";
      } else if (caseDetail.place_city_municipality.trim().length < 3) {
        errors.place_city_municipality = "At least 3 characters";
      } else if (caseDetail.place_city_municipality.trim().length > 100) {
        errors.place_city_municipality = "Maximum 100 characters";
      }

      // Barangay
      if (
        !caseDetail.place_barangay ||
        caseDetail.place_barangay.trim().length === 0
      ) {
        errors.place_barangay = "Required";
      } else if (
        caseDetail.place_barangay === "Other" &&
        (!caseDetail.place_barangay_other ||
          caseDetail.place_barangay_other.trim().length === 0)
      ) {
        errors.place_barangay_other = "Please specify location";
      }

      // Street
      if (
        !caseDetail.place_street ||
        caseDetail.place_street.trim().length === 0
      ) {
        errors.place_street = "Required";
      } else if (caseDetail.place_street.trim().length < 2) {
        errors.place_street = "At least 2 characters";
      } else if (caseDetail.place_street.trim().length > 200) {
        errors.place_street = "Maximum 200 characters";
      }

      // Narrative
      if (!caseDetail.narrative || caseDetail.narrative.trim().length === 0) {
        errors.narrative = "Required";
      } else if (caseDetail.narrative.trim().length < 20) {
        errors.narrative = "At least 20 characters";
      } else if (caseDetail.narrative.trim().length > 5000) {
        errors.narrative = "Maximum 5000 characters";
      }

      if (!caseDetail.lat || !caseDetail.lng) {
        errors.pin_location =
          "Please drop a pin on the map to mark the exact location";
      }
      if (
        caseDetail.amount_involved &&
        caseDetail.amount_involved.trim().length > 0
      ) {
        const cleanAmount = caseDetail.amount_involved.replace(/[₱,]/g, "");
        const amount = parseFloat(cleanAmount);

        if (isNaN(amount)) {
          errors.amount_involved = "Invalid amount";
        } else if (amount < 0.01) {
          errors.amount_involved = "Must be at least ₱0.01";
        } else if (amount > 999999999.99) {
          errors.amount_involved = "Amount too large";
        }
      }

      // Offense validations (merged into case detail)
      // Offense validations (merged into case detail)
      if (
        !offenses[0] ||
        !offenses[0].stage_of_felony ||
        offenses[0].stage_of_felony === ""
      ) {
        errors.stage_of_felony = "Stage of Felony is required";
      }
      if (!typeOfPlace || typeOfPlace === "") {
        errors.type_of_place = "Type of Place is required";
      }
      const hasModus = offenseModus[0] && offenseModus[0].length > 0;
      // const noOffense =
      //   !offenses[0] ||
      //   !offenses[0].offense_name ||
      //   offenses[0].offense_name === "";
      // if (noOffense) {
      //   errors.modus = "Please select an Incident Type first";
      // } else if (
      //   hasModus &&
      //   (!offenseSelectedModus[0] || offenseSelectedModus[0].length === 0)
      // ) {
      //   errors.modus = "At least one modus is required";
      // }
    }

    return errors;
  };
  const showWarningToast = (message) => {
    const toast = document.createElement("div");
    toast.className = "eb-toast-success";
    toast.textContent = message;
    toast.style.borderLeftColor = "#f59e0b";
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };
  const changeStep = (direction) => {
    if (direction === 1) {
      const errors = validateCurrentStep();
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setTimeout(() => {
          const firstError = document.querySelector(".eb-modal-input.error");
          if (firstError) {
            firstError.scrollIntoView({ behavior: "smooth", block: "center" });
            firstError.focus();
          }
        }, 100);
        return;
      }
    }
    setFieldErrors({});
    let newStep = currentStep + direction;
    if (newStep < 1) newStep = 1;
    if (newStep > totalSteps) newStep = totalSteps;
    setCurrentStep(newStep);
  };

  const addComplainant = () =>
    setComplainants([
      ...complainants,
      {
        first_name: "",
        middle_name: "",
        last_name: "",
        qualifier: "",
        alias: "",
        gender: "Male",
        nationality: "FILIPINO",
        contact_number: "",
        region_code: "",
        province_code: "",
        municipality_code: "",
        barangay_code: "",
        house_street: "",
        info_obtained: "PERSONAL",
        occupation: "",
      },
    ]);

  const removeComplainant = (i) =>
    complainants.length > 1 &&
    setComplainants(complainants.filter((_, idx) => idx !== i));

  const updateComplainant = (i, field, value) => {
    const updated = [...complainants];
    updated[i][field] = value;
    setComplainants(updated);
  };

  const addSuspect = () =>
    setSuspects([
      ...suspects,
      {
        first_name: "",
        middle_name: "",
        last_name: "",
        qualifier: "",
        alias: "",
        gender: "Male",
        birthday: "",
        age: "",
        birth_place: "",
        nationality: "FILIPINO",
        region_code: "",
        province_code: "",
        municipality_code: "",
        barangay_code: "",
        house_street: "",
        status: "At Large",
        location_if_arrested: "",
        degree_participation: "Principal",
        category_drug_case: "",
        relation_to_victim: "",
        educational_attainment: "",
        height_cm: "",
        drug_used: false,
        motive: "",
        occupation: "",
      },
    ]);

  const removeSuspect = (i) =>
    suspects.length > 1 && setSuspects(suspects.filter((_, idx) => idx !== i));

  const updateSuspect = (i, field, value) => {
    const updated = [...suspects];
    updated[i][field] = value;
    setSuspects(updated);
  };

  const addOffense = () => {
    const newIndex = offenses.length;
    setOffenses([
      ...offenses,
      {
        is_principal_offense: false,
        offense_type: "",
        offense_name: "",
        stage_of_felony: "",
        index_type: "Non-Index",
        investigator_on_case: "",
        most_investigator: "",
        // NO modus field
      },
    ]);
    setOffenseModus((prev) => ({ ...prev, [newIndex]: [] }));
    setOffenseSelectedModus((prev) => ({ ...prev, [newIndex]: [] }));
  };

  const removeOffense = (i) => {
    if (offenses.length > 1) {
      setOffenses(offenses.filter((_, idx) => idx !== i));
      // Re-index modus state
      const newModus = {},
        newSelected = {};
      offenses.forEach((_, idx) => {
        if (idx !== i) {
          const newIdx = idx > i ? idx - 1 : idx;
          newModus[newIdx] = offenseModus[idx] || [];
          newSelected[newIdx] = offenseSelectedModus[idx] || [];
        }
      });
      setOffenseModus(newModus);
      setOffenseSelectedModus(newSelected);
    }
  };

  const updateOffense = (i, field, value) => {
    const updated = [...offenses];
    if (!updated[i]) return;
    updated[i][field] = value;
    setOffenses(updated);
  };

  const updateCaseDetail = (field, value) =>
    setCaseDetail((prev) => ({ ...prev, [field]: value }));
  const resetForm = () => {
    setComplainants([
      {
        first_name: "",
        middle_name: "",
        last_name: "",
        qualifier: "",
        alias: "",
        gender: "Male",
        nationality: "FILIPINO",
        contact_number: "",
        region_code: "",
        province_code: "",
        municipality_code: "",
        barangay_code: "",
        house_street: "",
        info_obtained: "PERSONAL",
        occupation: "",
      },
    ]);

    setSuspects([
      {
        first_name: "",
        middle_name: "",
        last_name: "",
        qualifier: "",
        alias: "",
        gender: "Male",
        birthday: "",
        age: "",
        birth_place: "",
        nationality: "FILIPINO",
        region_code: "",
        province_code: "",
        municipality_code: "",
        barangay_code: "",
        house_street: "",
        status: "At Large",
        location_if_arrested: "",
        degree_participation: "Principal",
        category_drug_case: "",
        relation_to_victim: "",
        educational_attainment: "",
        height_cm: "",
        drug_used: false,
        motive: "",
        occupation: "",
      },
    ]);

    setOffenses([
      {
        is_principal_offense: true,
        offense_type: "",
        offense_name: "",
        stage_of_felony: "",
        index_type: "Non-Index",
        investigator_on_case: "",
        most_investigator: "",
      },
    ]);
    setOffenseModus({});
    setOffenseSelectedModus({});
    setTypeOfPlace("");

    setCaseDetail({
      incident_type: "",
      cop: "",
      date_time_commission: "",
      date_time_reported: "",
      is_crime: true,
      place_region: "Region IV-A (CALABARZON)",
      place_district_province: "Cavite",
      place_city_municipality: "Bacoor City",
      place_barangay: "",
      place_barangay_other: "",
      place_street: "",
      is_private_place: "",
      narrative: "",
      amount_involved: "",
      lat: "",
      lng: "",
    });
    setSelectedBrgyFeature(null);
  };
  const handleModalClose = () => {
    if (editMode && originalData) {
      // Deep comparison for actual changes
      const hasChanges =
        JSON.stringify(complainants) !==
          JSON.stringify(originalData.complainants) ||
        JSON.stringify(suspects) !== JSON.stringify(originalData.suspects) ||
        JSON.stringify(offenses) !== JSON.stringify(originalData.offenses) ||
        caseDetail.incident_type !== originalData.caseDetail.incident_type ||
        caseDetail.cop !== originalData.caseDetail.cop ||
        caseDetail.date_time_commission !==
          originalData.caseDetail.date_time_commission ||
        caseDetail.date_time_reported !==
          originalData.caseDetail.date_time_reported ||
        caseDetail.is_crime !== originalData.caseDetail.is_crime ||
        caseDetail.place_barangay !== originalData.caseDetail.place_barangay ||
        caseDetail.place_barangay_other !==
          originalData.caseDetail.place_barangay_other ||
        caseDetail.place_street !== originalData.caseDetail.place_street ||
        caseDetail.is_private_place !==
          originalData.caseDetail.is_private_place ||
        caseDetail.narrative !== originalData.caseDetail.narrative ||
        caseDetail.amount_involved !==
          originalData.caseDetail.amount_involved ||
        caseDetail.referred_by_barangay !==
          originalData.caseDetail.referred_by_barangay ||
        caseDetail.referred_to_barangay !==
          originalData.caseDetail.referred_to_barangay ||
        caseDetail.referred_by_dilg !==
          originalData.caseDetail.referred_by_dilg;

      if (hasChanges) {
        setShowConfirmClose(true);
        return;
      } else {
        closeModal();
        return;
      }
    }

    if (viewMode) {
      closeModal();
      return;
    }

    const hasData =
      complainants.some(
        (c) =>
          c.first_name ||
          c.middle_name ||
          c.last_name ||
          c.contact_number ||
          c.alias ||
          c.qualifier ||
          (c.region && c.region !== "NCR") ||
          c.district_province ||
          c.city_municipality ||
          c.barangay ||
          c.house_street,
      ) ||
      suspects.some(
        (s) =>
          s.first_name ||
          s.middle_name ||
          s.last_name ||
          s.birthday ||
          s.age ||
          s.alias ||
          s.qualifier ||
          s.birth_place ||
          s.relation_to_victim ||
          s.height_cm ||
          s.motive ||
          (s.region && s.region !== "NCR") ||
          s.district_province ||
          s.city_municipality ||
          s.barangay ||
          s.house_street ||
          s.location_if_arrested ||
          s.educational_attainment,
      ) ||
      (caseDetail.incident_type && caseDetail.incident_type !== "Theft") ||
      caseDetail.cop ||
      caseDetail.date_time_commission ||
      caseDetail.place_barangay ||
      caseDetail.place_street ||
      caseDetail.narrative ||
      caseDetail.amount_involved ||
      caseDetail.is_private_place ||
      offenses.some(
        (o) =>
          (o.offense_type && o.offense_type !== "PROPERTY") ||
          (o.offense_name && o.offense_name !== "ESTAFA") ||
          (o.stage_of_felony && o.stage_of_felony !== "COMPLETED") ||
          o.investigator_on_case ||
          o.most_investigator,
      );

    if (hasData) {
      setShowConfirmClose(true);
    } else {
      closeModal();
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setShowConfirmClose(false);
    setCurrentStep(1);
    setFieldErrors({});
    setEditMode(false);
    setViewMode(false);
    setFetchingEdit(false);
    setFetchingView(false);
    setAcceptMode(false);
    setEditingBlotterId(null);
    setOriginalData(null);
    resetForm();
    setHasSuspect(false);
    setIsImportedRecord(false);
    setSelectedBrgyFeature(null);
  };

  const cancelClose = () => {
    setShowConfirmClose(false);
  };

  const handleSubmit = async () => {
    // Validate Step 3 before submitting
    const errors = validateCurrentStep();

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setTimeout(() => {
        const firstError = document.querySelector(
          ".eb-modal-input.error, .eb-gender-buttons + .eb-field-error, .eb-pin-location-error",
        );
        if (firstError) {
          firstError.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      return;
    }

    try {
      setIsSubmitting(true);

      // ACCEPT MODE: Use different endpoint
      if (acceptMode) {
        // First update the blotter with current form data
        const finalCaseDetail = { ...caseDetail };
        if (finalCaseDetail.amount_involved) {
          finalCaseDetail.amount_involved =
            finalCaseDetail.amount_involved.replace(/,/g, "");
        }
        if (
          finalCaseDetail.place_barangay === "Other" &&
          finalCaseDetail.place_barangay_other
        ) {
          finalCaseDetail.place_barangay = finalCaseDetail.place_barangay_other;
        }
        delete finalCaseDetail.place_barangay_other;
        finalCaseDetail.lat = caseDetail.lat
          ? parseFloat(caseDetail.lat)
          : null;
        finalCaseDetail.lng = caseDetail.lng
          ? parseFloat(caseDetail.lng)
          : null;
        finalCaseDetail.type_of_place = typeOfPlace;
        finalCaseDetail.modus_reference_ids =
          Object.values(offenseSelectedModus).flat();

        const offensesWithModus = offenses.map((o, i) => ({
          ...o,
          modus_reference_ids: offenseSelectedModus[i] || [],
        }));

        const resolvedComplainants = complainants.map((c, i) => {
          const regionName =
            (regions.find((r) => r.code === c.region_code) || {}).name ||
            c.region_code;
          const provinceName =
            (
              (cProvinces[i] || []).find((p) => p.code === c.province_code) ||
              {}
            ).name || c.province_code;
          const cityName =
            (
              (cCities[i] || []).find((x) => x.code === c.municipality_code) ||
              {}
            ).name || c.municipality_code;
          const barangayName =
            (
              (cBarangays[i] || []).find((b) => b.code === c.barangay_code) ||
              {}
            ).name || c.barangay_code;
          return {
            ...c,
            region: regionName || c.region,
            district_province: provinceName || c.district_province,
            city_municipality: cityName || c.city_municipality,
            barangay: barangayName || c.barangay,
          };
        });

        const resolvedSuspects = suspects.map((s, i) => {
          const regionName =
            (regions.find((r) => r.code === s.region_code) || {}).name ||
            s.region_code;
          const provinceName =
            (
              (sProvinces[i] || []).find((p) => p.code === s.province_code) ||
              {}
            ).name || s.province_code;
          const cityName =
            (
              (sCities[i] || []).find((x) => x.code === s.municipality_code) ||
              {}
            ).name || s.municipality_code;
          const barangayName =
            (
              (sBarangays[i] || []).find((b) => b.code === s.barangay_code) ||
              {}
            ).name || s.barangay_code;
          return {
            ...s,
            region: regionName || s.region,
            district_province: provinceName || s.district_province,
            city_municipality: cityName || s.city_municipality,
            barangay: barangayName || s.barangay,
          };
        });
        console.log(
          "Accept PUT - lat:",
          finalCaseDetail.lat,
          "lng:",
          finalCaseDetail.lng,
          "type_of_place:",
          finalCaseDetail.type_of_place,
        );
        // Update blotter first
        const updateRes = await fetch(`${API_URL}/${editingBlotterId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            blotterData: finalCaseDetail,
            complainants: resolvedComplainants,
            suspects: resolvedSuspects,
            offenses: offensesWithModus,
          }),
        });
        const updateData = await updateRes.json();
        if (!updateData.success) {
          alert(
            "Update failed:\n" +
              (updateData.errors?.join("\n") || updateData.message),
          );
          setLoading(false);
          return;
        }

        // Then accept (which creates case)
        const res = await fetch(`${API_URL}/${editingBlotterId}/accept`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        const data = await res.json();
        if (data.success) {
          showReactToast("Referral accepted! Case created automatically.");
          closeModal();
          fetchBlotters();
        } else {
          alert(data.message || "Failed to accept referral");
        }
        setLoading(false);
        return;
      }

      // NORMAL EDIT/CREATE MODE
      const finalCaseDetail = { ...caseDetail };
      if (finalCaseDetail.amount_involved) {
        finalCaseDetail.amount_involved =
          finalCaseDetail.amount_involved.replace(/,/g, "");
      }
      if (
        finalCaseDetail.place_barangay === "Other" &&
        finalCaseDetail.place_barangay_other
      ) {
        finalCaseDetail.place_barangay = finalCaseDetail.place_barangay_other;
      }
      delete finalCaseDetail.place_barangay_other;

      finalCaseDetail.lat = caseDetail.lat ? parseFloat(caseDetail.lat) : null;
      finalCaseDetail.lng = caseDetail.lng ? parseFloat(caseDetail.lng) : null;

      finalCaseDetail.type_of_place = typeOfPlace;
      finalCaseDetail.modus_reference_ids =
        Object.values(offenseSelectedModus).flat();

      const offensesWithModus = offenses.map((o, i) => ({
        ...o,
        modus_reference_ids: offenseSelectedModus[i] || [],
      }));

      // Resolve PSGC codes to names for complainants
      const resolvedComplainants = complainants.map((c, i) => {
        const regionName =
          (regions.find((r) => r.code === c.region_code) || {}).name ||
          c.region_code;
        const provinceName =
          ((cProvinces[i] || []).find((p) => p.code === c.province_code) || {})
            .name || c.province_code;
        const cityName =
          ((cCities[i] || []).find((x) => x.code === c.municipality_code) || {})
            .name || c.municipality_code;
        const barangayName =
          ((cBarangays[i] || []).find((b) => b.code === c.barangay_code) || {})
            .name || c.barangay_code;
        return {
          ...c,
          region: regionName || c.region,
          district_province: provinceName || c.district_province,
          city_municipality: cityName || c.city_municipality,
          barangay: barangayName || c.barangay,
        };
      });

      const resolvedSuspects = suspects.map((s, i) => {
        const regionName =
          (regions.find((r) => r.code === s.region_code) || {}).name ||
          s.region_code;
        const provinceName =
          ((sProvinces[i] || []).find((p) => p.code === s.province_code) || {})
            .name || s.province_code;
        const cityName =
          ((sCities[i] || []).find((x) => x.code === s.municipality_code) || {})
            .name || s.municipality_code;
        const barangayName =
          ((sBarangays[i] || []).find((b) => b.code === s.barangay_code) || {})
            .name || s.barangay_code;
        return {
          ...s,
          region: regionName || s.region,
          district_province: provinceName || s.district_province,
          city_municipality: cityName || s.city_municipality,
          barangay: barangayName || s.barangay,
        };
      });

      const payload = {
        blotterData: finalCaseDetail,
        complainants: resolvedComplainants,
        suspects: resolvedSuspects,
        offenses: offensesWithModus,
      };

      const url = editMode ? `${API_URL}/${editingBlotterId}` : API_URL;
      const method = editMode ? "PUT" : "POST";

      const rawResponse = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      const response = handleApiResponse(rawResponse);
      if (!response) return;
      const data = await response.json();
      if (data.success) {
        const message = editMode
          ? "Report updated successfully!"
          : `Report created successfully!\nReport ID: ${data.data.blotter_entry_number}`;

        // Show toast notification
        showReactToast(message);
        setOriginalData(null);
        closeModal();
        fetchBlotters();
      } else {
        let errorMsg = "Submission Failed:\n\n";
        if (data.errors) errorMsg += data.errors.join("\n");
        else if (data.error) errorMsg += data.error;
        alert(errorMsg);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  };

  const getStatusClass = (status) => {
    const map = {
      Pending: "eb-status-pending",
      "Under Investigation": "eb-status-investigating",
      Resolved: "eb-status-resolved",
      Solved: "eb-status-resolved",
      Cleared: "eb-status-cleared",
      "Referred to Case": "eb-status-pending",
      Urgent: "eb-status-urgent",
    };
    return map[status] || "eb-status-pending";
  };
  const isPinOutsideBoundary = () => {
    if (!caseDetail.lat || !caseDetail.lng || !selectedBrgyFeature)
      return false;
    const lat = parseFloat(caseDetail.lat);
    const lng = parseFloat(caseDetail.lng);
    const rings =
      selectedBrgyFeature.geometry.type === "Polygon"
        ? selectedBrgyFeature.geometry.coordinates
        : selectedBrgyFeature.geometry.coordinates.flat(1);
    let inside = false;
    for (const ring of rings) {
      const n = ring.length;
      let j = n - 1;
      for (let i = 0; i < n; i++) {
        const xi = ring[i][0],
          yi = ring[i][1];
        const xj = ring[j][0],
          yj = ring[j][1];
        const intersect =
          yi > lat !== yj > lat &&
          lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
        j = i;
      }
    }
    return !inside;
  };
  const totalDeletedPages = Math.ceil(
    deletedBlotters.length / DELETED_PER_PAGE,
  );
  const paginatedDeleted = deletedBlotters.slice(
    (deletedPage - 1) * DELETED_PER_PAGE,
    deletedPage * DELETED_PER_PAGE,
  );
  const totalPages = Math.ceil(blotters.length / ITEMS_PER_PAGE);
  const paginatedBlotters = blotters.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  return (
    <div className="eb-content-area">
      <LoadingModal
        isOpen={loading && blotters.length === 0}
        message="Loading records..."
      />
      <LoadingModal isOpen={fetchingEdit} message="Loading blotter data..." />
      <LoadingModal isOpen={fetchingView} message="Loading blotter data..." />
      <LoadingModal
        isOpen={isSubmitting}
        message={
          acceptMode
            ? "Accepting referral..."
            : editMode
              ? "Updating report..."
              : "Submitting report..."
        }
      />
      <div className="eb-page-header">
        <div className="eb-page-header-left">
          <h1>Reporting Records</h1>
          <p>Digital incident and reporting system</p>
        </div>
        <div className="eb-page-header-right">
          <button
            className="eb-btn eb-btn-deleted"
            onClick={() => {
              setShowTrash(true);
              setDeletedPage(1);
              fetchDeletedBlotters();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: "8px", verticalAlign: "middle" }}
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Deleted Records
          </button>
          <button
            className="eb-btn eb-btn-secondary"
            onClick={() => setShowImport(true)}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
          <button
            className="eb-btn eb-btn-primary"
            onClick={() => setShowModal(true)}
          >
            + New Report
          </button>
        </div>
      </div>

      {showModal && (
        <div className="eb-modal">
          <div className="eb-modal-content">
            <div className="eb-modal-header">
              <div
                style={{ display: "flex", alignItems: "center", gap: "14px" }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {viewMode ? (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    ) : acceptMode ? (
                      <>
                        <polyline points="20 6 9 17 4 12" />
                      </>
                    ) : editMode ? (
                      <>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </>
                    ) : (
                      <>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </>
                    )}
                  </svg>
                </div>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "white",
                    }}
                  >
                    {viewMode
                      ? "View Blotter Entry"
                      : acceptMode
                        ? "Accept Barangay Report"
                        : editMode
                          ? "Edit Blotter Entry"
                          : "New Blotter Entry"}
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.6)",
                      marginTop: "3px",
                    }}
                  >
                    {viewMode
                      ? "Read-only view of incident record"
                      : acceptMode
                        ? "Review and accept referred barangay report"
                        : editMode
                          ? "Modify existing blotter entry details"
                          : "Record a new incident report entry"}
                  </p>
                </div>
              </div>
              <span className="eb-modal-close" onClick={handleModalClose}>
                &times;
              </span>
            </div>

            {viewMode ? (
              // ========== VIEW MODE - READ ONLY DISPLAY ==========
              <div className="eb-view-content">
                {/* Complainants */}
                <div className="eb-view-section">
                  <h3 className="eb-view-section-title">Victim Information</h3>
                  <div className="eb-view-section-body">
                    {complainants.map((c, i) => (
                      <div className="eb-view-card" key={i}>
                        <h4 className="eb-view-card-title">Victim #{i + 1}</h4>
                        <div className="eb-view-grid">
                          <div className="eb-view-item">
                            <span className="eb-view-label">Name:</span>
                            <span className="eb-view-value">
                              {`${c.first_name} ${c.middle_name || ""} ${c.last_name} ${c.qualifier || ""}`.trim()}
                            </span>
                          </div>
                          <div className="eb-view-item">
                            <span className="eb-view-label">Gender:</span>
                            <span className="eb-view-value">{c.gender}</span>
                          </div>
                          <div className="eb-view-item">
                            <span className="eb-view-label">Nationality:</span>
                            <span className="eb-view-value">
                              {c.nationality}
                            </span>
                          </div>
                          <div className="eb-view-item">
                            <span className="eb-view-label">Contact:</span>
                            <span className="eb-view-value">
                              {c.contact_number || "N/A"}
                            </span>
                          </div>
                          <div className="eb-view-item">
                            <span className="eb-view-label">Alias:</span>
                            <span className="eb-view-value">
                              {c.alias || "N/A"}
                            </span>
                          </div>
                          <div className="eb-view-item">
                            <span className="eb-view-label">Occupation:</span>
                            <span className="eb-view-value">
                              {c.occupation || "N/A"}
                            </span>
                          </div>
                          <div className="eb-view-item eb-view-full">
                            <span className="eb-view-label">Address:</span>
                            <span className="eb-view-value">
                              {(() => {
                                const parts = [
                                  c.house_street,
                                  c.barangay,
                                  c.city_municipality,
                                  c.district_province,
                                  c.region,
                                ].filter((v) => v && v.trim() !== "");
                                return parts.length > 0
                                  ? parts.join(", ")
                                  : "N/A";
                              })()}
                            </span>
                          </div>
                          <div className="eb-view-item">
                            <span className="eb-view-label">
                              Info Obtained:
                            </span>
                            <span className="eb-view-value">
                              {c.info_obtained}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Suspects */}
                <div className="eb-view-section">
                  <h3 className="eb-view-section-title">Suspect Information</h3>
                  <div className="eb-view-section-body">
                    {suspects.length === 0 ||
                    suspects.every((s) => !s.first_name && !s.last_name) ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "28px",
                          color: "#9ca3af",
                          background: "rgba(30,58,95,0.03)",
                          borderRadius: "8px",
                          border: "1px dashed #e5e7eb",
                          fontSize: "13px",
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#d1d5db"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ marginBottom: "8px" }}
                        >
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <line x1="23" y1="11" x2="17" y2="11" />
                        </svg>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#6b7280",
                            marginBottom: "2px",
                          }}
                        >
                          No Suspect Identified
                        </div>
                        <div style={{ fontSize: "12px" }}>
                          Suspect information was not provided for this report
                        </div>
                      </div>
                    ) : (
                      suspects.map((s, i) => (
                        <div className="eb-view-card" key={i}>
                          <h4 className="eb-view-card-title">
                            Suspect #{i + 1}
                          </h4>
                          <div className="eb-view-grid">
                            <div className="eb-view-item">
                              <span className="eb-view-label">Name:</span>
                              <span className="eb-view-value">
                                {(() => {
                                  const isUnknown =
                                    (!s.first_name ||
                                      s.first_name.toUpperCase() ===
                                        "UNKNOWN") &&
                                    (!s.last_name ||
                                      s.last_name.toUpperCase() === "UNKNOWN");
                                  if (isUnknown) return "Unknown";
                                  return `${s.first_name || ""} ${s.middle_name || ""} ${s.last_name || ""} ${s.qualifier || ""}`
                                    .replace(/\s+/g, " ")
                                    .trim();
                                })()}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Gender:</span>
                              <span className="eb-view-value">{s.gender}</span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Status:</span>
                              <span className="eb-view-value">{s.status}</span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">
                                Degree of Participation:
                              </span>
                              <span className="eb-view-value">
                                {s.degree_participation}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Birthday:</span>
                              <span className="eb-view-value">
                                {s.birthday || "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Age:</span>
                              <span className="eb-view-value">
                                {s.age || "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">
                                Nationality:
                              </span>
                              <span className="eb-view-value">
                                {s.nationality}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Alias:</span>
                              <span className="eb-view-value">
                                {s.alias || "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Occupation:</span>
                              <span className="eb-view-value">
                                {s.occupation || "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item eb-view-full">
                              <span className="eb-view-label">Address:</span>
                              <span className="eb-view-value">
                                {(() => {
                                  const parts = [
                                    s.house_street,
                                    s.barangay,
                                    s.city_municipality,
                                    s.district_province,
                                    s.region,
                                  ].filter((v) => v && v.trim() !== "");
                                  return parts.length > 0
                                    ? parts.join(", ")
                                    : "N/A";
                                })()}
                              </span>
                            </div>
                            {s.location_if_arrested && (
                              <div className="eb-view-item">
                                <span className="eb-view-label">
                                  Arrest Location:
                                </span>
                                <span className="eb-view-value">
                                  {s.location_if_arrested}
                                </span>
                              </div>
                            )}
                            <div className="eb-view-item">
                              <span className="eb-view-label">
                                Birth Place:
                              </span>
                              <span className="eb-view-value">
                                {s.birth_place || "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">
                                Relation to Victim:
                              </span>
                              <span className="eb-view-value">
                                {s.relation_to_victim || "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">
                                Educational Attainment:
                              </span>
                              <span className="eb-view-value">
                                {s.educational_attainment || "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Height:</span>
                              <span className="eb-view-value">
                                {s.height_cm ? `${s.height_cm} cm` : "N/A"}
                              </span>
                            </div>
                            <div className="eb-view-item">
                              <span className="eb-view-label">Drug Used:</span>
                              <span className="eb-view-value">
                                {s.drug_used ? "Yes" : "No"}
                              </span>
                            </div>

                            <div className="eb-view-item eb-view-full">
                              <span className="eb-view-label">Motive:</span>
                              <span className="eb-view-value">
                                {s.motive || "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Case Details */}
                <div className="eb-view-section">
                  <h3 className="eb-view-section-title">Case Details</h3>
                  <div className="eb-view-section-body">
                    <div className="eb-view-card">
                      <div className="eb-view-grid">
                        <div className="eb-view-item">
                          <span className="eb-view-label">Crime Type:</span>
                          <span className="eb-view-value">
                            {caseDetail.incident_type}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">COP:</span>
                          <span className="eb-view-value">
                            {caseDetail.cop || "N/A"}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">
                            Date & Time of Commission:
                          </span>
                          <span className="eb-view-value">
                            {formatDate(caseDetail.date_time_commission)}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">
                            Date & Time Reported:
                          </span>
                          <span className="eb-view-value">
                            {formatDate(caseDetail.date_time_reported)}
                          </span>
                        </div>
                        <div className="eb-view-item eb-view-full">
                          <span className="eb-view-label">
                            Place of Commission:
                          </span>
                          <span className="eb-view-value">{`${caseDetail.place_street}, ${caseDetail.place_barangay === "Other" && caseDetail.place_barangay_other ? caseDetail.place_barangay_other : caseDetail.place_barangay}, ${caseDetail.place_city_municipality}, ${caseDetail.place_district_province}, ${caseDetail.place_region}`}</span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">Type of Place:</span>
                          <span className="eb-view-value">
                            {typeOfPlace || "N/A"}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">Private Place?</span>
                          <span className="eb-view-value">
                            {caseDetail.is_private_place || "N/A"}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">
                            Amount Involved:
                          </span>
                          <span className="eb-view-value">
                            {caseDetail.amount_involved
                              ? `₱${caseDetail.amount_involved}`
                              : "N/A"}
                          </span>
                        </div>

                        <div className="eb-view-item eb-view-full">
                          <span className="eb-view-label">Narrative:</span>
                          <span className="eb-view-value">
                            {caseDetail.narrative}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">Offense:</span>
                          <span className="eb-view-value">
                            {offenses[0]?.offense_name || "N/A"}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">
                            Stage of Felony:
                          </span>
                          <span className="eb-view-value">
                            {offenses[0]?.stage_of_felony || "N/A"}
                          </span>
                        </div>
                        <div className="eb-view-item">
                          <span className="eb-view-label">Index Type:</span>
                          <span className="eb-view-value">
                            {offenses[0]?.index_type || "N/A"}
                          </span>
                        </div>
                        <div className="eb-view-item eb-view-full">
                          <span className="eb-view-label">Modus Operandi:</span>
                          <span className="eb-view-value">
                            {(() => {
                              const ids = offenseSelectedModus[0] || [];
                              const names = (offenseModus[0] || [])
                                .filter((m) => ids.includes(m.id))
                                .map((m) => m.modus_name);
                              if (names.length > 0) return names.join(", ");
                              if (caseDetail.modus) return caseDetail.modus;
                              return "N/A";
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* View Mode Footer */}
                  <div className="eb-modal-footer">
                    <button
                      type="button"
                      className="eb-btn eb-btn-secondary"
                      onClick={closeModal}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // ========== EDIT/CREATE MODE - ORIGINAL FORM ==========
              <>
                <div className="eb-step-indicator">
                  <div
                    className={`eb-step ${currentStep === 1 ? "active" : ""}`}
                  >
                    <div className="eb-step-number">1</div>
                    <div className="eb-step-label">Victim</div>
                  </div>
                  <div
                    className={`eb-step ${currentStep === 2 ? "active" : ""}`}
                  >
                    <div className="eb-step-number">2</div>
                    <div className="eb-step-label">Suspect</div>
                  </div>
                  <div
                    className={`eb-step ${currentStep === 3 ? "active" : ""}`}
                  >
                    <div className="eb-step-number">3</div>
                    <div className="eb-step-label">Case Detail & Offense</div>
                  </div>
                </div>

                {currentStep === 1 && (
                  <div className="eb-step-content">
                    <h3 className="eb-section-title">1. Victim Information</h3>
                    {complainants.map((c, i) => (
                      <div className="eb-complainant-entry" key={i}>
                        <div className="eb-entry-header">
                          <h4 className="eb-entry-title">Victim #{i + 1}</h4>
                          {complainants.length > 1 && (
                            <button
                              type="button"
                              className="eb-btn-remove-entry"
                              onClick={() => removeComplainant(i)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="eb-modal-form-grid">
                          {/* Row 1 - Name */}
                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">
                              First Name *
                            </label>
                            <input
                              type="text"
                              className={`eb-modal-input ${fieldErrors[`complainant_${i}_first_name`] ? "error" : ""}`}
                              placeholder="First Name"
                              value={c.first_name}
                              maxLength="50"
                              onChange={(e) => {
                                const value = handleLettersOnly(e.target.value);
                                updateComplainant(i, "first_name", value);
                                if (
                                  value.trim().length > 0 &&
                                  fieldErrors[`complainant_${i}_first_name`]
                                ) {
                                  const newErrors = { ...fieldErrors };
                                  delete newErrors[
                                    `complainant_${i}_first_name`
                                  ];
                                  setFieldErrors(newErrors);
                                }
                              }}
                            />
                            <FieldError
                              error={fieldErrors[`complainant_${i}_first_name`]}
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">
                              Middle Name
                            </label>
                            <input
                              type="text"
                              className={`eb-modal-input ${fieldErrors[`complainant_${i}_middle_name`] ? "error" : ""}`}
                              placeholder="Middle Name"
                              value={c.middle_name}
                              maxLength="50"
                              onChange={(e) => {
                                const value = handleLettersOnly(e.target.value);
                                updateComplainant(i, "middle_name", value);
                                if (
                                  value.trim().length > 0 &&
                                  fieldErrors[`complainant_${i}_middle_name`]
                                ) {
                                  const newErrors = { ...fieldErrors };
                                  delete newErrors[
                                    `complainant_${i}_middle_name`
                                  ];
                                  setFieldErrors(newErrors);
                                }
                              }}
                            />
                            <FieldError
                              error={
                                fieldErrors[`complainant_${i}_middle_name`]
                              }
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">
                              Last Name *
                            </label>
                            <input
                              type="text"
                              className={`eb-modal-input ${fieldErrors[`complainant_${i}_last_name`] ? "error" : ""}`}
                              placeholder="Last Name"
                              value={c.last_name}
                              maxLength="50"
                              onChange={(e) => {
                                const value = handleLettersOnly(e.target.value);
                                updateComplainant(i, "last_name", value);
                                if (
                                  value.trim().length > 0 &&
                                  fieldErrors[`complainant_${i}_last_name`]
                                ) {
                                  const newErrors = { ...fieldErrors };
                                  delete newErrors[
                                    `complainant_${i}_last_name`
                                  ];
                                  setFieldErrors(newErrors);
                                }
                              }}
                            />
                            <FieldError
                              error={fieldErrors[`complainant_${i}_last_name`]}
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">Qualifier</label>
                            <select
                              className="eb-modal-input"
                              value={c.qualifier}
                              onChange={(e) =>
                                updateComplainant(
                                  i,
                                  "qualifier",
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">None</option>
                              <option>Jr.</option>
                              <option>Sr.</option>
                              <option>II</option>
                              <option>III</option>
                              <option>IV</option>
                              <option>V</option>
                            </select>
                          </div>

                          {/* Row 2 - Personal Info */}
                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">Alias</label>
                            <input
                              type="text"
                              className="eb-modal-input"
                              placeholder="Alias"
                              value={c.alias}
                              maxLength="50"
                              onChange={(e) => {
                                const value = e.target.value.replace(
                                  /[^A-Za-z0-9ÑñĆ\s'-]/g,
                                  "",
                                );
                                updateComplainant(i, "alias", value);
                              }}
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">Gender *</label>
                            <div className="eb-gender-buttons">
                              <button
                                type="button"
                                className={`eb-gender-btn ${c.gender === "Male" ? "active" : ""}`}
                                onClick={() => {
                                  updateComplainant(i, "gender", "Male");
                                  if (fieldErrors[`complainant_${i}_gender`]) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[`complainant_${i}_gender`];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              >
                                Male
                              </button>
                              <button
                                type="button"
                                className={`eb-gender-btn ${c.gender === "Female" ? "active" : ""}`}
                                onClick={() => {
                                  updateComplainant(i, "gender", "Female");
                                  if (fieldErrors[`complainant_${i}_gender`]) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[`complainant_${i}_gender`];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              >
                                Female
                              </button>
                            </div>
                            <FieldError
                              error={fieldErrors[`complainant_${i}_gender`]}
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">
                              Nationality *
                            </label>
                            <select
                              className={`eb-modal-input ${fieldErrors[`complainant_${i}_nationality`] ? "error" : ""}`}
                              value={c.nationality}
                              onChange={(e) => {
                                updateComplainant(
                                  i,
                                  "nationality",
                                  e.target.value,
                                );
                                if (
                                  e.target.value &&
                                  fieldErrors[`complainant_${i}_nationality`]
                                ) {
                                  const newErrors = { ...fieldErrors };
                                  delete newErrors[
                                    `complainant_${i}_nationality`
                                  ];
                                  setFieldErrors(newErrors);
                                }
                              }}
                            >
                              <option value="">Select Nationality</option>
                              <option>FILIPINO</option>
                              <option>AMERICAN</option>
                              <option>CHINESE</option>
                              <option>JAPANESE</option>
                              <option>KOREAN</option>
                              <option>INDIAN</option>
                              <option>BRITISH</option>
                              <option>AUSTRALIAN</option>
                              <option>CANADIAN</option>
                              <option>GERMAN</option>
                              <option>FRENCH</option>
                              <option>SPANISH</option>
                              <option>INDONESIAN</option>
                              <option>MALAYSIAN</option>
                              <option>SINGAPOREAN</option>
                              <option>THAI</option>
                              <option>VIETNAMESE</option>
                              <option>Other</option>
                            </select>
                            <FieldError
                              error={
                                fieldErrors[`complainant_${i}_nationality`]
                              }
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">
                              Contact Number
                            </label>
                            <input
                              type="text"
                              className={`eb-modal-input ${fieldErrors[`complainant_${i}_contact_number`] ? "error" : ""}`}
                              placeholder="09XXXXXXXXX"
                              maxLength="11"
                              value={c.contact_number}
                              onChange={(e) => {
                                const value = handleNumbersOnly(e.target.value);
                                updateComplainant(i, "contact_number", value);
                                if (
                                  value.length > 0 &&
                                  fieldErrors[`complainant_${i}_contact_number`]
                                ) {
                                  const newErrors = { ...fieldErrors };
                                  delete newErrors[
                                    `complainant_${i}_contact_number`
                                  ];
                                  setFieldErrors(newErrors);
                                }
                              }}
                            />
                            <FieldError
                              error={
                                fieldErrors[`complainant_${i}_contact_number`]
                              }
                            />
                          </div>

                          {isImportedRecord &&
                          (c.region ||
                            c.district_province ||
                            c.city_municipality ||
                            c.barangay) ? (
                            <div
                              className="eb-modal-form-group"
                              style={{ gridColumn: "span 4" }}
                            >
                              <label className="eb-modal-label">
                                Address (Imported)
                              </label>
                              <input
                                type="text"
                                className="eb-modal-input"
                                value={[
                                  c.house_street,
                                  c.barangay,
                                  c.city_municipality,
                                  c.district_province,
                                  c.region,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                                disabled
                                style={{
                                  background: "#f3f4f6",
                                  cursor: "not-allowed",
                                  color: "#6b7280",
                                }}
                              />
                              <small
                                style={{ color: "#9ca3af", fontSize: "11px" }}
                              >
                                Address from imported record — read only
                              </small>
                            </div>
                          ) : (
                            <>
                              {/* Row 3 - Address */}
                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">Region</label>
                                <select
                                  className={`eb-modal-input ${fieldErrors[`complainant_${i}_region_code`] ? "error" : ""}`}
                                  value={c.region_code}
                                  disabled={loadingRegions}
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    updateComplainant(i, "region_code", val);
                                    updateComplainant(i, "province_code", "");
                                    updateComplainant(
                                      i,
                                      "municipality_code",
                                      "",
                                    );
                                    updateComplainant(i, "barangay_code", "");
                                    setCProvinces((p) => ({ ...p, [i]: [] }));
                                    setCCities((p) => ({ ...p, [i]: [] }));
                                    setCBarangays((p) => ({ ...p, [i]: [] }));
                                    if (val) {
                                      const newErrors = { ...fieldErrors };
                                      delete newErrors[
                                        `complainant_${i}_region_code`
                                      ];
                                      setFieldErrors(newErrors);
                                      if (val === "130000000") {
                                        setCLoadingCity((p) => ({
                                          ...p,
                                          [i]: true,
                                        }));
                                        const cities =
                                          await fetchCitiesByRegion(val);
                                        setCCities((p) => ({
                                          ...p,
                                          [i]: cities,
                                        }));
                                        setCLoadingCity((p) => ({
                                          ...p,
                                          [i]: false,
                                        }));
                                      } else {
                                        setCLoadingProv((p) => ({
                                          ...p,
                                          [i]: true,
                                        }));
                                        const data = await fetchProvinces(val);
                                        setCProvinces((p) => ({
                                          ...p,
                                          [i]: data,
                                        }));
                                        setCLoadingProv((p) => ({
                                          ...p,
                                          [i]: false,
                                        }));
                                      }
                                    }
                                  }}
                                >
                                  <option value="">
                                    {loadingRegions
                                      ? "Loading..."
                                      : "Select Region"}
                                  </option>
                                  {regions.map((r) => (
                                    <option key={r.code} value={r.code}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                                <FieldError
                                  error={
                                    fieldErrors[`complainant_${i}_region_code`]
                                  }
                                />
                              </div>

                              {/* PROVINCE */}
                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">
                                  Province
                                </label>
                                <select
                                  className={`eb-modal-input ${fieldErrors[`complainant_${i}_province_code`] ? "error" : ""}`}
                                  value={c.province_code}
                                  disabled={
                                    !c.region_code ||
                                    cLoadingProv[i] ||
                                    c.region_code === "130000000"
                                  }
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    updateComplainant(i, "province_code", val);
                                    updateComplainant(
                                      i,
                                      "municipality_code",
                                      "",
                                    );
                                    updateComplainant(i, "barangay_code", "");
                                    setCCities((p) => ({ ...p, [i]: [] }));
                                    setCBarangays((p) => ({ ...p, [i]: [] }));
                                    if (val) {
                                      const newErrors = { ...fieldErrors };
                                      delete newErrors[
                                        `complainant_${i}_province_code`
                                      ];
                                      setFieldErrors(newErrors);
                                      setCLoadingCity((p) => ({
                                        ...p,
                                        [i]: true,
                                      }));
                                      const data = await fetchCities(val);
                                      setCCities((p) => ({ ...p, [i]: data }));
                                      setCLoadingCity((p) => ({
                                        ...p,
                                        [i]: false,
                                      }));
                                    }
                                  }}
                                >
                                  <option value="">
                                    {cLoadingProv[i]
                                      ? "Loading..."
                                      : c.region_code === "130000000"
                                        ? "N/A (NCR has no province)"
                                        : "Select Province"}
                                  </option>
                                  {(cProvinces[i] || []).map((p) => (
                                    <option key={p.code} value={p.code}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                                <FieldError
                                  error={
                                    fieldErrors[
                                      `complainant_${i}_province_code`
                                    ]
                                  }
                                />
                              </div>

                              {/* CITY/MUNICIPALITY */}
                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">
                                  City/Municipality
                                </label>
                                <select
                                  className={`eb-modal-input ${fieldErrors[`complainant_${i}_municipality_code`] ? "error" : ""}`}
                                  value={c.municipality_code}
                                  disabled={
                                    (!c.province_code &&
                                      c.region_code !== "130000000") ||
                                    cLoadingCity[i]
                                  }
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    updateComplainant(
                                      i,
                                      "municipality_code",
                                      val,
                                    );
                                    updateComplainant(i, "barangay_code", "");
                                    setCBarangays((p) => ({ ...p, [i]: [] }));
                                    if (val) {
                                      const newErrors = { ...fieldErrors };
                                      delete newErrors[
                                        `complainant_${i}_municipality_code`
                                      ];
                                      setFieldErrors(newErrors);
                                      setCLoadingBrgy((p) => ({
                                        ...p,
                                        [i]: true,
                                      }));
                                      const data = await fetchBarangays(val);
                                      setCBarangays((p) => ({
                                        ...p,
                                        [i]: data,
                                      }));
                                      setCLoadingBrgy((p) => ({
                                        ...p,
                                        [i]: false,
                                      }));
                                    }
                                  }}
                                >
                                  <option value="">
                                    {cLoadingCity[i]
                                      ? "Loading..."
                                      : "Select City/Municipality"}
                                  </option>
                                  {(cCities[i] || []).map((c) => (
                                    <option key={c.code} value={c.code}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <FieldError
                                  error={
                                    fieldErrors[
                                      `complainant_${i}_municipality_code`
                                    ]
                                  }
                                />
                              </div>

                              {/* BARANGAY */}
                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">
                                  Barangay
                                </label>
                                <select
                                  className={`eb-modal-input ${fieldErrors[`complainant_${i}_barangay_code`] ? "error" : ""}`}
                                  value={c.barangay_code}
                                  disabled={
                                    !c.municipality_code || cLoadingBrgy[i]
                                  }
                                  onChange={(e) => {
                                    updateComplainant(
                                      i,
                                      "barangay_code",
                                      e.target.value,
                                    );
                                    if (e.target.value) {
                                      const newErrors = { ...fieldErrors };
                                      delete newErrors[
                                        `complainant_${i}_barangay_code`
                                      ];
                                      setFieldErrors(newErrors);
                                    }
                                  }}
                                >
                                  <option value="">
                                    {cLoadingBrgy[i]
                                      ? "Loading..."
                                      : "Select Barangay"}
                                  </option>
                                  {(cBarangays[i] || []).map((b) => (
                                    <option key={b.code} value={b.code}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                                <FieldError
                                  error={
                                    fieldErrors[
                                      `complainant_${i}_barangay_code`
                                    ]
                                  }
                                />
                              </div>
                            </>
                          )}

                          {/* Row 4 */}
                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">
                              House No./Street
                            </label>
                            <input
                              type="text"
                              className={`eb-modal-input ${fieldErrors[`complainant_${i}_house_street`] ? "error" : ""}`}
                              placeholder="Complete Address"
                              value={c.house_street}
                              maxLength="200"
                              onChange={(e) => {
                                const value = e.target.value.replace(
                                  /[^A-Za-z0-9ÑñĆ.,\s-]/g,
                                  "",
                                );
                                updateComplainant(i, "house_street", value);
                                if (
                                  value.trim().length > 0 &&
                                  fieldErrors[`complainant_${i}_house_street`]
                                ) {
                                  const newErrors = { ...fieldErrors };
                                  delete newErrors[
                                    `complainant_${i}_house_street`
                                  ];
                                  setFieldErrors(newErrors);
                                }
                              }}
                            />
                            <FieldError
                              error={
                                fieldErrors[`complainant_${i}_house_street`]
                              }
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">Occupation</label>
                            <input
                              type="text"
                              className="eb-modal-input"
                              placeholder="e.g., Teacher, Driver, Student"
                              value={c.occupation || ""}
                              maxLength="100"
                              onChange={(e) => {
                                const value = e.target.value.replace(
                                  /[^A-Za-zÑñ0-9\s-]/g,
                                  "",
                                );
                                updateComplainant(i, "occupation", value);
                              }}
                            />
                          </div>

                          <div className="eb-modal-form-group">
                            <label className="eb-modal-label">
                              Info Obtained *
                            </label>
                            <select
                              className={`eb-modal-input ${fieldErrors[`complainant_${i}_info_obtained`] ? "error" : ""}`}
                              value={c.info_obtained}
                              onChange={(e) => {
                                updateComplainant(
                                  i,
                                  "info_obtained",
                                  e.target.value,
                                );
                                if (
                                  e.target.value &&
                                  fieldErrors[`complainant_${i}_info_obtained`]
                                ) {
                                  const newErrors = { ...fieldErrors };
                                  delete newErrors[
                                    `complainant_${i}_info_obtained`
                                  ];
                                  setFieldErrors(newErrors);
                                }
                              }}
                            >
                              <option>Personal</option>
                              <option>Telephone</option>
                              <option>Walk-in</option>
                              <option>Online</option>
                              <option>Email</option>
                              <option>Third Party</option>
                            </select>
                            <FieldError
                              error={
                                fieldErrors[`complainant_${i}_info_obtained`]
                              }
                            />
                          </div>

                          <div className="eb-modal-form-group"></div>
                          <div className="eb-modal-form-group"></div>
                        </div>
                      </div>
                    ))}
                    <div className="eb-add-more-section">
                      <button
                        type="button"
                        className="eb-btn-add-more"
                        onClick={addComplainant}
                      >
                        Add Victim
                      </button>
                      <p className="eb-add-more-text">
                        Click to add another victim.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="eb-step-content">
                    <div style={{ marginBottom: "16px" }}>
                      <h3 className="eb-section-title">
                        2. Suspect Information
                      </h3>
                    </div>

                    {hasSuspect &&
                      suspects.map((s, i) => (
                        <div className="eb-suspect-entry" key={i}>
                          <div className="eb-entry-header">
                            <h4 className="eb-entry-title">Suspect #{i + 1}</h4>
                            {suspects.length > 1 && (
                              <button
                                type="button"
                                className="eb-btn-remove-entry"
                                onClick={() => removeSuspect(i)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="eb-modal-form-grid">
                            {/* Row 1 - Name */}
                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                First Name
                              </label>
                              <input
                                type="text"
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_first_name`] ? "error" : ""}`}
                                placeholder="First Name"
                                value={s.first_name}
                                maxLength="50"
                                onChange={(e) => {
                                  const value = handleLettersOnly(
                                    e.target.value,
                                  );
                                  updateSuspect(i, "first_name", value);
                                  if (
                                    value.trim().length > 0 &&
                                    fieldErrors[`suspect_${i}_first_name`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[`suspect_${i}_first_name`];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              />
                              <FieldError
                                error={fieldErrors[`suspect_${i}_first_name`]}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Middle Name
                              </label>
                              <input
                                type="text"
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_middle_name`] ? "error" : ""}`}
                                placeholder="Middle Name"
                                value={s.middle_name}
                                maxLength="50"
                                onChange={(e) => {
                                  const value = handleLettersOnly(
                                    e.target.value,
                                  );
                                  updateSuspect(i, "middle_name", value);
                                  if (
                                    value.trim().length > 0 &&
                                    fieldErrors[`suspect_${i}_middle_name`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[
                                      `suspect_${i}_middle_name`
                                    ];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              />
                              <FieldError
                                error={fieldErrors[`suspect_${i}_middle_name`]}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Last Name
                              </label>
                              <input
                                type="text"
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_last_name`] ? "error" : ""}`}
                                placeholder="Last Name"
                                value={s.last_name}
                                maxLength="50"
                                onChange={(e) => {
                                  const value = handleLettersOnly(
                                    e.target.value,
                                  );
                                  updateSuspect(i, "last_name", value);
                                  if (
                                    value.trim().length > 0 &&
                                    fieldErrors[`suspect_${i}_last_name`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[`suspect_${i}_last_name`];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              />
                              <FieldError
                                error={fieldErrors[`suspect_${i}_last_name`]}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Qualifier
                              </label>
                              <select
                                className="eb-modal-input"
                                value={s.qualifier}
                                onChange={(e) =>
                                  updateSuspect(i, "qualifier", e.target.value)
                                }
                              >
                                <option value="">None</option>
                                <option>Jr.</option>
                                <option>Sr.</option>
                                <option>II</option>
                                <option>III</option>
                                <option>IV</option>
                                <option>V</option>
                              </select>
                            </div>

                            {/* Row 2 - Personal Info */}
                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">Alias</label>
                              <input
                                type="text"
                                className="eb-modal-input"
                                placeholder="Alias"
                                value={s.alias}
                                maxLength="50"
                                onChange={(e) => {
                                  const value = e.target.value.replace(
                                    /[^A-Za-z0-9ÑñĆ\s'-]/g,
                                    "",
                                  );
                                  updateSuspect(i, "alias", value);
                                }}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">Gender</label>
                              <div className="eb-gender-buttons">
                                <button
                                  type="button"
                                  className={`eb-gender-btn ${s.gender === "Male" ? "active" : ""}`}
                                  onClick={() => {
                                    updateSuspect(i, "gender", "Male");
                                    if (fieldErrors[`suspect_${i}_gender`]) {
                                      const newErrors = { ...fieldErrors };
                                      delete newErrors[`suspect_${i}_gender`];
                                      setFieldErrors(newErrors);
                                    }
                                  }}
                                >
                                  Male
                                </button>
                                <button
                                  type="button"
                                  className={`eb-gender-btn ${s.gender === "Female" ? "active" : ""}`}
                                  onClick={() => {
                                    updateSuspect(i, "gender", "Female");
                                    if (fieldErrors[`suspect_${i}_gender`]) {
                                      const newErrors = { ...fieldErrors };
                                      delete newErrors[`suspect_${i}_gender`];
                                      setFieldErrors(newErrors);
                                    }
                                  }}
                                >
                                  Female
                                </button>
                              </div>
                              <FieldError
                                error={fieldErrors[`suspect_${i}_gender`]}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">Birthday</label>
                              <input
                                type="date"
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_birthday`] ? "error" : ""}`}
                                value={s.birthday}
                                max={
                                  new Date(
                                    new Date().getTime() + 24 * 60 * 60 * 1000,
                                  )
                                    .toISOString()
                                    .split("T")[0]
                                }
                                onKeyDown={(e) => e.preventDefault()}
                                onChange={(e) => {
                                  updateSuspect(i, "birthday", e.target.value);
                                  if (
                                    e.target.value &&
                                    fieldErrors[`suspect_${i}_birthday`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[`suspect_${i}_birthday`];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              />
                              <FieldError
                                error={fieldErrors[`suspect_${i}_birthday`]}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">Age</label>
                              <input
                                type="text"
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_age`] ? "error" : ""}`}
                                placeholder="Age"
                                maxLength="3"
                                value={s.age}
                                onChange={(e) => {
                                  const value = handleNumbersOnly(
                                    e.target.value,
                                  );
                                  updateSuspect(i, "age", value);
                                  if (
                                    value.length > 0 &&
                                    fieldErrors[`suspect_${i}_age`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[`suspect_${i}_age`];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              />
                              <FieldError
                                error={fieldErrors[`suspect_${i}_age`]}
                              />
                            </div>

                            {/* Row 3 - Case Info */}
                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">Status</label>
                              <select
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_status`] ? "error" : ""}`}
                                value={s.status}
                                onChange={(e) => {
                                  updateSuspect(i, "status", e.target.value);
                                  if (
                                    e.target.value &&
                                    fieldErrors[`suspect_${i}_status`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[`suspect_${i}_status`];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              >
                                <option value="">Select Status</option>
                                <option>At Large</option>
                                <option>In Custody</option>
                                <option>Arrested</option>
                                <option>Detained</option>
                                <option>Released on Bail</option>
                                <option>Deceased</option>
                                <option>Unknown</option>
                              </select>
                              <FieldError
                                error={fieldErrors[`suspect_${i}_status`]}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Location (if arrested)
                              </label>
                              <input
                                type="text"
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_location_if_arrested`] ? "error" : ""}`}
                                placeholder="Arrest Location"
                                value={s.location_if_arrested}
                                maxLength="200"
                                onChange={(e) => {
                                  const value = e.target.value.replace(
                                    /[^A-Za-z0-9ÑñĆ.,\s-]/g,
                                    "",
                                  );
                                  updateSuspect(
                                    i,
                                    "location_if_arrested",
                                    value,
                                  );
                                  if (
                                    value.trim().length > 0 &&
                                    fieldErrors[
                                      `suspect_${i}_location_if_arrested`
                                    ]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[
                                      `suspect_${i}_location_if_arrested`
                                    ];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              />
                              <FieldError
                                error={
                                  fieldErrors[
                                    `suspect_${i}_location_if_arrested`
                                  ]
                                }
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Degree of Participation
                              </label>
                              <select
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_degree_participation`] ? "error" : ""}`}
                                value={s.degree_participation}
                                onChange={(e) => {
                                  updateSuspect(
                                    i,
                                    "degree_participation",
                                    e.target.value,
                                  );
                                  if (
                                    e.target.value &&
                                    fieldErrors[
                                      `suspect_${i}_degree_participation`
                                    ]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[
                                      `suspect_${i}_degree_participation`
                                    ];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              >
                                <option value="">Select Degree</option>
                                <option>Principal</option>
                                <option>Accomplice</option>
                                <option>Accessory</option>
                              </select>
                              <FieldError
                                error={
                                  fieldErrors[
                                    `suspect_${i}_degree_participation`
                                  ]
                                }
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Occupation
                              </label>
                              <input
                                type="text"
                                className="eb-modal-input"
                                placeholder="e.g., Teacher, Driver, Student"
                                value={s.occupation || ""}
                                maxLength="100"
                                onChange={(e) => {
                                  const value = e.target.value.replace(
                                    /[^A-Za-zÑñ0-9\s-]/g,
                                    "",
                                  );
                                  updateSuspect(i, "occupation", value);
                                }}
                              />
                            </div>

                            {isImportedRecord &&
                            (s.region ||
                              s.district_province ||
                              s.city_municipality ||
                              s.barangay) ? (
                              <div
                                className="eb-modal-form-group"
                                style={{ gridColumn: "span 4" }}
                              >
                                <label className="eb-modal-label">
                                  Address (Imported)
                                </label>
                                <input
                                  type="text"
                                  className="eb-modal-input"
                                  value={[
                                    s.house_street,
                                    s.barangay,
                                    s.city_municipality,
                                    s.district_province,
                                    s.region,
                                  ]
                                    .filter(Boolean)
                                    .join(", ")}
                                  disabled
                                  style={{
                                    background: "#f3f4f6",
                                    cursor: "not-allowed",
                                    color: "#6b7280",
                                  }}
                                />
                                <small
                                  style={{ color: "#9ca3af", fontSize: "11px" }}
                                >
                                  Address from imported record — read only
                                </small>
                              </div>
                            ) : (
                              <>
                                {/* Row 4 - Address */}
                                {/* REGION */}
                                <div className="eb-modal-form-group">
                                  <label className="eb-modal-label">
                                    Region
                                  </label>
                                  <select
                                    className={`eb-modal-input ${fieldErrors[`suspect_${i}_region_code`] ? "error" : ""}`}
                                    value={s.region_code}
                                    disabled={loadingRegions}
                                    onChange={async (e) => {
                                      const val = e.target.value;
                                      updateSuspect(i, "region_code", val);
                                      updateSuspect(i, "province_code", "");
                                      updateSuspect(i, "municipality_code", "");
                                      updateSuspect(i, "barangay_code", "");
                                      setSProvinces((p) => ({ ...p, [i]: [] }));
                                      setSCities((p) => ({ ...p, [i]: [] }));
                                      setSBarangays((p) => ({ ...p, [i]: [] }));
                                      if (val) {
                                        const newErrors = { ...fieldErrors };
                                        delete newErrors[
                                          `suspect_${i}_region_code`
                                        ];
                                        setFieldErrors(newErrors);
                                        if (val === "130000000") {
                                          setSLoadingCity((p) => ({
                                            ...p,
                                            [i]: true,
                                          }));
                                          const cities =
                                            await fetchCitiesByRegion(val);
                                          setSCities((p) => ({
                                            ...p,
                                            [i]: cities,
                                          }));
                                          setSLoadingCity((p) => ({
                                            ...p,
                                            [i]: false,
                                          }));
                                        } else {
                                          setSLoadingProv((p) => ({
                                            ...p,
                                            [i]: true,
                                          }));
                                          const data =
                                            await fetchProvinces(val);
                                          setSProvinces((p) => ({
                                            ...p,
                                            [i]: data,
                                          }));
                                          setSLoadingProv((p) => ({
                                            ...p,
                                            [i]: false,
                                          }));
                                        }
                                      }
                                    }}
                                  >
                                    <option value="">
                                      {loadingRegions
                                        ? "Loading..."
                                        : "Select Region"}
                                    </option>
                                    {regions.map((r) => (
                                      <option key={r.code} value={r.code}>
                                        {r.name}
                                      </option>
                                    ))}
                                  </select>
                                  <FieldError
                                    error={
                                      fieldErrors[`suspect_${i}_region_code`]
                                    }
                                  />
                                </div>

                                <div className="eb-modal-form-group">
                                  <label className="eb-modal-label">
                                    Province
                                  </label>
                                  <select
                                    className={`eb-modal-input ${fieldErrors[`suspect_${i}_province_code`] ? "error" : ""}`}
                                    value={s.province_code}
                                    disabled={
                                      !s.region_code ||
                                      sLoadingProv[i] ||
                                      s.region_code === "130000000"
                                    }
                                    onChange={async (e) => {
                                      const val = e.target.value;
                                      updateSuspect(i, "province_code", val);
                                      updateSuspect(i, "municipality_code", "");
                                      updateSuspect(i, "barangay_code", "");
                                      setSCities((p) => ({ ...p, [i]: [] }));
                                      setSBarangays((p) => ({ ...p, [i]: [] }));
                                      if (val) {
                                        const newErrors = { ...fieldErrors };
                                        delete newErrors[
                                          `suspect_${i}_province_code`
                                        ];
                                        setFieldErrors(newErrors);
                                        setSLoadingCity((p) => ({
                                          ...p,
                                          [i]: true,
                                        }));
                                        const data = await fetchCities(val);
                                        setSCities((p) => ({
                                          ...p,
                                          [i]: data,
                                        }));
                                        setSLoadingCity((p) => ({
                                          ...p,
                                          [i]: false,
                                        }));
                                      }
                                    }}
                                  >
                                    <option value="">
                                      {sLoadingProv[i]
                                        ? "Loading..."
                                        : s.region_code === "130000000"
                                          ? "N/A (NCR has no province)"
                                          : "Select Province"}
                                    </option>
                                    {(sProvinces[i] || []).map((p) => (
                                      <option key={p.code} value={p.code}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                  <FieldError
                                    error={
                                      fieldErrors[`suspect_${i}_province_code`]
                                    }
                                  />
                                </div>

                                {/* CITY/MUNICIPALITY */}
                                <div className="eb-modal-form-group">
                                  <label className="eb-modal-label">
                                    City/Municipality
                                  </label>
                                  <select
                                    className={`eb-modal-input ${fieldErrors[`suspect_${i}_municipality_code`] ? "error" : ""}`}
                                    value={s.municipality_code}
                                    disabled={
                                      (!s.province_code &&
                                        s.region_code !== "130000000") ||
                                      sLoadingCity[i]
                                    }
                                    onChange={async (e) => {
                                      const val = e.target.value;
                                      updateSuspect(
                                        i,
                                        "municipality_code",
                                        val,
                                      );
                                      updateSuspect(i, "barangay_code", "");
                                      setSBarangays((p) => ({ ...p, [i]: [] }));
                                      if (val) {
                                        const newErrors = { ...fieldErrors };
                                        delete newErrors[
                                          `suspect_${i}_municipality_code`
                                        ];
                                        setFieldErrors(newErrors);
                                        setSLoadingBrgy((p) => ({
                                          ...p,
                                          [i]: true,
                                        }));
                                        const data = await fetchBarangays(val);
                                        setSBarangays((p) => ({
                                          ...p,
                                          [i]: data,
                                        }));
                                        setSLoadingBrgy((p) => ({
                                          ...p,
                                          [i]: false,
                                        }));
                                      }
                                    }}
                                  >
                                    <option value="">
                                      {sLoadingCity[i]
                                        ? "Loading..."
                                        : "Select City/Municipality"}
                                    </option>
                                    {(sCities[i] || []).map((c) => (
                                      <option key={c.code} value={c.code}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                  <FieldError
                                    error={
                                      fieldErrors[
                                        `suspect_${i}_municipality_code`
                                      ]
                                    }
                                  />
                                </div>

                                <div className="eb-modal-form-group">
                                  <label className="eb-modal-label">
                                    Barangay
                                  </label>
                                  <select
                                    className={`eb-modal-input ${fieldErrors[`suspect_${i}_barangay_code`] ? "error" : ""}`}
                                    value={s.barangay_code}
                                    disabled={
                                      !s.municipality_code || sLoadingBrgy[i]
                                    }
                                    onChange={(e) => {
                                      updateSuspect(
                                        i,
                                        "barangay_code",
                                        e.target.value,
                                      );
                                      if (e.target.value) {
                                        const newErrors = { ...fieldErrors };
                                        delete newErrors[
                                          `suspect_${i}_barangay_code`
                                        ];
                                        setFieldErrors(newErrors);
                                      }
                                    }}
                                  >
                                    <option value="">
                                      {sLoadingBrgy[i]
                                        ? "Loading..."
                                        : "Select Barangay"}
                                    </option>
                                    {(sBarangays[i] || []).map((b) => (
                                      <option key={b.code} value={b.code}>
                                        {b.name}
                                      </option>
                                    ))}
                                  </select>
                                  <FieldError
                                    error={
                                      fieldErrors[`suspect_${i}_barangay_code`]
                                    }
                                  />
                                </div>
                              </>
                            )}

                            {/* Row 5 - Remaining */}
                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                House No./Street
                              </label>
                              <input
                                type="text"
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_house_street`] ? "error" : ""}`}
                                placeholder="Complete Address"
                                value={s.house_street}
                                maxLength="200"
                                onChange={(e) => {
                                  const value = e.target.value.replace(
                                    /[^A-Za-z0-9ÑñĆ.,\s-]/g,
                                    "",
                                  );
                                  updateSuspect(i, "house_street", value);
                                  if (
                                    value.trim().length > 0 &&
                                    fieldErrors[`suspect_${i}_house_street`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[
                                      `suspect_${i}_house_street`
                                    ];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              />
                              <FieldError
                                error={fieldErrors[`suspect_${i}_house_street`]}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Birth Place
                              </label>
                              <input
                                type="text"
                                className="eb-modal-input"
                                placeholder="Birth Place"
                                value={s.birth_place}
                                maxLength="100"
                                onChange={(e) => {
                                  const value = e.target.value.replace(
                                    /[^A-Za-zÑñ,\s-]/g,
                                    "",
                                  );
                                  updateSuspect(i, "birth_place", value);
                                }}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Relation to Victim
                              </label>
                              <input
                                type="text"
                                className="eb-modal-input"
                                placeholder="Relation"
                                value={s.relation_to_victim}
                                maxLength="100"
                                onChange={(e) => {
                                  const value = e.target.value.replace(
                                    /[^A-Za-zÑñ\s-]/g,
                                    "",
                                  );
                                  updateSuspect(i, "relation_to_victim", value);
                                }}
                              />
                            </div>

                            <div className="eb-modal-form-group">
                              <label className="eb-modal-label">
                                Nationality
                              </label>
                              <select
                                className={`eb-modal-input ${fieldErrors[`suspect_${i}_nationality`] ? "error" : ""}`}
                                value={s.nationality}
                                onChange={(e) => {
                                  updateSuspect(
                                    i,
                                    "nationality",
                                    e.target.value,
                                  );
                                  if (
                                    e.target.value &&
                                    fieldErrors[`suspect_${i}_nationality`]
                                  ) {
                                    const newErrors = { ...fieldErrors };
                                    delete newErrors[
                                      `suspect_${i}_nationality`
                                    ];
                                    setFieldErrors(newErrors);
                                  }
                                }}
                              >
                                <option value="">Select Nationality</option>
                                <option>FILIPINO</option>
                                <option>AMERICAN</option>
                                <option>CHINESE</option>
                                <option>JAPANESE</option>
                                <option>KOREAN</option>
                                <option>INDIAN</option>
                                <option>BRITISH</option>
                                <option>AUSTRALIAN</option>
                                <option>CANADIAN</option>
                                <option>GERMAN</option>
                                <option>FRENCH</option>
                                <option>SPANISH</option>
                                <option>INDONESIAN</option>
                                <option>MALAYSIAN</option>
                                <option>SINGAPOREAN</option>
                                <option>THAI</option>
                                <option>VIETNAMESE</option>
                                <option>Other</option>
                              </select>
                              <FieldError
                                error={fieldErrors[`suspect_${i}_nationality`]}
                              />
                            </div>
                          </div>

                          {/* Other Information Section */}
                          <div className="eb-other-info-section">
                            <h4 className="eb-subsection-title">
                              Other Information
                            </h4>
                            <div className="eb-modal-form-grid">
                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">
                                  Educational Attainment
                                </label>
                                <select
                                  className="eb-modal-input"
                                  value={s.educational_attainment}
                                  onChange={(e) =>
                                    updateSuspect(
                                      i,
                                      "educational_attainment",
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="">Select...</option>
                                  <option>No Formal Education</option>
                                  <option>Elementary Undergraduate</option>
                                  <option>Elementary Graduate</option>
                                  <option>High School Undergraduate</option>
                                  <option>High School Graduate</option>
                                  <option>Vocational</option>
                                  <option>College Undergraduate</option>
                                  <option>College Graduate</option>
                                  <option>Post Graduate</option>
                                </select>
                              </div>

                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">
                                  Height (cm)
                                </label>
                                <input
                                  type="text"
                                  className={`eb-modal-input ${fieldErrors[`suspect_${i}_height_cm`] ? "error" : ""}`}
                                  placeholder="Height in cm"
                                  maxLength="3"
                                  value={s.height_cm}
                                  onChange={(e) => {
                                    const value = handleNumbersOnly(
                                      e.target.value,
                                    );
                                    updateSuspect(i, "height_cm", value);
                                    if (
                                      value.length > 0 &&
                                      fieldErrors[`suspect_${i}_height_cm`]
                                    ) {
                                      const newErrors = { ...fieldErrors };
                                      delete newErrors[
                                        `suspect_${i}_height_cm`
                                      ];
                                      setFieldErrors(newErrors);
                                    }
                                  }}
                                />
                                <FieldError
                                  error={fieldErrors[`suspect_${i}_height_cm`]}
                                />
                              </div>

                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">
                                  Drug Used
                                </label>
                                <div className="eb-gender-buttons">
                                  <button
                                    type="button"
                                    className={`eb-gender-btn ${s.drug_used === true ? "active" : ""}`}
                                    onClick={() => {
                                      updateSuspect(i, "drug_used", true);
                                      if (
                                        fieldErrors[`suspect_${i}_drug_used`]
                                      ) {
                                        const newErrors = { ...fieldErrors };
                                        delete newErrors[
                                          `suspect_${i}_drug_used`
                                        ];
                                        setFieldErrors(newErrors);
                                      }
                                    }}
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    className={`eb-gender-btn ${s.drug_used === false ? "active" : ""}`}
                                    onClick={() => {
                                      updateSuspect(i, "drug_used", false);
                                      if (
                                        fieldErrors[`suspect_${i}_drug_used`]
                                      ) {
                                        const newErrors = { ...fieldErrors };
                                        delete newErrors[
                                          `suspect_${i}_drug_used`
                                        ];
                                        setFieldErrors(newErrors);
                                      }
                                    }}
                                  >
                                    No
                                  </button>
                                </div>
                                <FieldError
                                  error={fieldErrors[`suspect_${i}_drug_used`]}
                                />
                              </div>

                              <div className="eb-modal-form-group">
                                <label className="eb-modal-label">Motive</label>
                                <input
                                  type="text"
                                  className="eb-modal-input"
                                  placeholder="Motive"
                                  value={s.motive}
                                  maxLength="500"
                                  onChange={(e) => {
                                    const value = e.target.value.replace(
                                      /[^A-Za-z0-9ÑñĆ.,;:()\s-]/g,
                                      "",
                                    );
                                    updateSuspect(i, "motive", value);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                    <div className="eb-add-more-section">
                      <button
                        type="button"
                        className="eb-btn-add-more"
                        onClick={() => {
                          setHasSuspect(true);
                        }}
                      >
                        Add Suspect
                      </button>
                      <p className="eb-add-more-text">
                        Click to add another suspect.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="eb-step-content">
                    <h3 className="eb-section-title">3. Case Detail</h3>
                    <div className="eb-modal-form-grid">
                      {/* ── ROW 1: OFFENSE CLASSIFICATION ── */}
                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">Crime Type *</label>
                        <select
                          className={`eb-modal-input ${fieldErrors.incident_type ? "error" : ""}`}
                          value={caseDetail.incident_type}
                          onChange={(e) => {
                            updateCaseDetail("incident_type", e.target.value);
                            updateOffense(0, "offense_name", e.target.value);
                            updateOffense(0, "index_type", "Index");
                            fetchModusForIncidentType(e.target.value);
                            if (e.target.value && fieldErrors.incident_type) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.incident_type;
                              setFieldErrors(newErrors);
                            }
                          }}
                        >
                          <option value="">Select Crime Type</option>
                          <option value="Carnapping - MC">
                            Carnapping - MC
                          </option>
                          <option value="Carnapping - MV">
                            Carnapping - MV
                          </option>
                          <option>Homicide</option>
                          <option>Murder</option>
                          <option>Physical Injury</option>
                          <option>Rape</option>
                          <option>Robbery</option>
                          <option>Special Complex Crime</option>
                          <option>Theft</option>
                        </select>
                        <FieldError error={fieldErrors.incident_type} />
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          Stage of Felony *
                        </label>
                        <select
                          className={`eb-modal-input ${fieldErrors.stage_of_felony ? "error" : ""}`}
                          value={offenses[0]?.stage_of_felony || ""}
                          onChange={(e) => {
                            updateOffense(0, "stage_of_felony", e.target.value);
                            if (e.target.value && fieldErrors.stage_of_felony) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.stage_of_felony;
                              setFieldErrors(newErrors);
                            }
                          }}
                        >
                          <option value="">Select Stage</option>
                          <option>COMPLETED</option>
                          <option>ATTEMPTED</option>
                          <option>FRUSTRATED</option>
                        </select>
                        <FieldError error={fieldErrors.stage_of_felony} />
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">Index Type</label>
                        <input
                          type="text"
                          className="eb-modal-input"
                          value={offenses[0]?.index_type || "Non-Index"}
                          disabled
                          style={{
                            background: "#f3f4f6",
                            cursor: "not-allowed",
                          }}
                        />
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">Modus Operandi</label>
                        {offenseModus[0] && offenseModus[0].length > 0 ? (
                          <>
                            <select
                              className={`eb-modal-input ${fieldErrors.modus ? "error" : ""}`}
                              value={String(offenseSelectedModus[0]?.[0] || "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                setOffenseSelectedModus((prev) => ({
                                  ...prev,
                                  [0]: val ? [parseInt(val)] : [],
                                }));
                                if (fieldErrors.modus) {
                                  const n = { ...fieldErrors };
                                  delete n.modus;
                                  setFieldErrors(n);
                                }
                              }}
                            >
                              <option value="">Select Modus</option>
                              {offenseModus[0].map((m) => (
                                <option key={m.id} value={String(m.id)}>
                                  {m.modus_name}
                                </option>
                              ))}
                            </select>
                            <FieldError error={fieldErrors.modus} />
                          </>
                        ) : (
                          <input
                            type="text"
                            className="eb-modal-input"
                            value="Select Crime Type first"
                            disabled
                            style={{
                              background: "#f3f4f6",
                              cursor: "not-allowed",
                              color: "#9ca3af",
                            }}
                          />
                        )}
                      </div>

                      {/* ── ROW 2: CASE ADMIN ── */}
                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          COP (Officer on Case)
                        </label>
                        <input
                          type="text"
                          className={`eb-modal-input ${fieldErrors.cop ? "error" : ""}`}
                          placeholder="Officer Name"
                          value={caseDetail.cop}
                          maxLength="100"
                          onChange={(e) => {
                            const value = e.target.value.replace(
                              /[^A-Za-zÑñ.\s-]/g,
                              "",
                            );
                            updateCaseDetail("cop", value);
                            if (value.trim().length > 0 && fieldErrors.cop) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.cop;
                              setFieldErrors(newErrors);
                            }
                          }}
                        />
                        <FieldError error={fieldErrors.cop} />
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          Date & Time of Commission *
                        </label>
                        <input
                          type="datetime-local"
                          className={`eb-modal-input ${fieldErrors.date_time_commission ? "error" : ""}`}
                          value={caseDetail.date_time_commission}
                          max={new Date(
                            new Date().getTime() + 24 * 60 * 60 * 1000,
                          )
                            .toISOString()
                            .slice(0, 16)}
                          onKeyDown={(e) => e.preventDefault()}
                          onChange={(e) => {
                            updateCaseDetail(
                              "date_time_commission",
                              e.target.value,
                            );
                            if (
                              e.target.value &&
                              fieldErrors.date_time_commission
                            ) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.date_time_commission;
                              setFieldErrors(newErrors);
                            }
                          }}
                        />
                        <FieldError error={fieldErrors.date_time_commission} />
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          Date & Time Reported *
                        </label>
                        <input
                          type="datetime-local"
                          className={`eb-modal-input ${fieldErrors.date_time_reported ? "error" : ""}`}
                          value={caseDetail.date_time_reported}
                          max={new Date(
                            new Date().getTime() + 24 * 60 * 60 * 1000,
                          )
                            .toISOString()
                            .slice(0, 16)}
                          onKeyDown={(e) => e.preventDefault()}
                          onChange={(e) => {
                            updateCaseDetail(
                              "date_time_reported",
                              e.target.value,
                            );
                            if (
                              e.target.value &&
                              fieldErrors.date_time_reported
                            ) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.date_time_reported;
                              setFieldErrors(newErrors);
                            }
                          }}
                        />
                        <FieldError error={fieldErrors.date_time_reported} />
                      </div>

                      <div className="eb-modal-form-group"></div>

                      {/* ── LOCATION DIVIDER ── */}
                      <div
                        className="eb-group-divider"
                        style={{ margin: "4px 0 8px 0" }}
                      >
                        Place of Commission
                      </div>

                      {/* ── ROW 3: LOCATION ── */}
                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">Region *</label>
                        <select
                          className="eb-modal-input"
                          value="040000000"
                          disabled
                          style={{
                            background: "#f3f4f6",
                            cursor: "not-allowed",
                            color: "#6b7280",
                          }}
                        >
                          <option value="040000000">CALABARZON</option>
                        </select>
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          District/Province *
                        </label>
                        <select
                          className="eb-modal-input"
                          value="042100000"
                          disabled
                          style={{
                            background: "#f3f4f6",
                            cursor: "not-allowed",
                            color: "#6b7280",
                          }}
                        >
                          <option value="042100000">Cavite</option>
                        </select>
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          City/Municipality *
                        </label>
                        <select
                          className="eb-modal-input"
                          value="042103000"
                          disabled
                          style={{
                            background: "#f3f4f6",
                            cursor: "not-allowed",
                            color: "#6b7280",
                          }}
                        >
                          <option value="042103000">City of Bacoor</option>
                        </select>
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">Barangay *</label>
                        <select
                          className={`eb-modal-input ${fieldErrors.place_barangay ? "error" : ""}`}
                          value={caseDetail.place_barangay}
                          disabled={loadingBacoorBrgy}
                          onChange={(e) => {
                            const selectedName = e.target.value;
                            updateCaseDetail("place_barangay", selectedName);
                            updateCaseDetail("lat", "");
                            updateCaseDetail("lng", "");
                            if (selectedName && fieldErrors.place_barangay) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.place_barangay;
                              setFieldErrors(newErrors);
                            }
                            if (selectedName && barangayGeoJSON) {
                              const feature = barangayGeoJSON.features.find(
                                (f) => f.properties.name_db === selectedName,
                              );
                              if (feature) {
                                setSelectedBrgyFeature(feature);
                                const { centroid_lat, centroid_lng } =
                                  feature.properties;
                                if (
                                  mapRef.current &&
                                  centroid_lat &&
                                  centroid_lng
                                ) {
                                  mapRef.current.flyTo({
                                    center: [
                                      parseFloat(centroid_lng),
                                      parseFloat(centroid_lat),
                                    ],
                                    zoom: 15,
                                    duration: 1000,
                                  });
                                }
                              } else {
                                setSelectedBrgyFeature(null);
                              }
                            } else {
                              setSelectedBrgyFeature(null);
                            }
                          }}
                        >
                          <option value="">
                            {loadingBacoorBrgy
                              ? "Loading..."
                              : "Select Barangay"}
                          </option>
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
                        <FieldError error={fieldErrors.place_barangay} />
                      </div>

                      {/* ── ROW 4: ADDRESS DETAILS ── */}
                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          House No./Street *
                        </label>
                        <input
                          type="text"
                          className={`eb-modal-input ${fieldErrors.place_street ? "error" : ""}`}
                          placeholder="Street Name"
                          value={caseDetail.place_street}
                          maxLength="200"
                          onChange={(e) => {
                            const value = e.target.value.replace(
                              /[^A-Za-z0-9ÑñĆ.,\s-]/g,
                              "",
                            );
                            updateCaseDetail("place_street", value);
                            if (
                              value.trim().length > 0 &&
                              fieldErrors.place_street
                            ) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.place_street;
                              setFieldErrors(newErrors);
                            }
                          }}
                        />
                        <FieldError error={fieldErrors.place_street} />
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          Type of Place *
                        </label>
                        <select
                          className={`eb-modal-input ${fieldErrors.type_of_place ? "error" : ""}`}
                          value={typeOfPlace}
                          onChange={(e) => {
                            setTypeOfPlace(e.target.value);
                            if (fieldErrors.type_of_place) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.type_of_place;
                              setFieldErrors(newErrors);
                            }
                          }}
                        >
                          <option value="">Select Type of Place</option>
                          <option>
                            Abandoned Structure (house, bldg, apartment/condo)
                          </option>
                          <option>Along the street</option>
                          <option>Commercial/Business Establishment</option>
                          <option>Construction/Industrial Barracks</option>
                          <option>Farm/Ricefield</option>
                          <option>Government Office/Establishment</option>
                          <option>Onboard a vehicle (riding in/on)</option>
                          <option>
                            Parking Area (vacant lot, in bldg/structure, open
                            parking)
                          </option>
                          <option>Recreational Place (resorts/parks)</option>
                          <option>Residential (house/condo)</option>
                          <option>River/Lake</option>
                          <option>
                            School (Grade/High School/College/University)
                          </option>
                          <option>
                            Transportation Terminals (Tricycle, Jeep, FX, Bus,
                            Train Station)
                          </option>
                          <option>
                            Vacant Lot (unused/unoccupied open area)
                          </option>
                        </select>
                        <FieldError error={fieldErrors.type_of_place} />
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          Is it a private place?
                        </label>
                        <select
                          className="eb-modal-input"
                          value={caseDetail.is_private_place}
                          onChange={(e) =>
                            updateCaseDetail("is_private_place", e.target.value)
                          }
                        >
                          <option value="">Select...</option>
                          <option>Yes</option>
                          <option>No</option>
                          <option>Unknown</option>
                        </select>
                      </div>

                      <div className="eb-modal-form-group">
                        <label className="eb-modal-label">
                          Amount Involved
                        </label>
                        <input
                          type="text"
                          className={`eb-modal-input ${fieldErrors.amount_involved ? "error" : ""}`}
                          placeholder="0.00"
                          value={caseDetail.amount_involved}
                          maxLength="15"
                          onChange={(e) => {
                            const value = e.target.value
                              .replace(/[^0-9.]/g, "")
                              .replace(/(\..*)\./g, "$1")
                              .replace(/(\.\d{2})\d+/g, "$1");
                            updateCaseDetail("amount_involved", value);
                            if (
                              value.length > 0 &&
                              fieldErrors.amount_involved
                            ) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.amount_involved;
                              setFieldErrors(newErrors);
                            }
                          }}
                        />
                        <FieldError error={fieldErrors.amount_involved} />
                      </div>

                      {/* ── ROW 5: NARRATIVE ── */}
                      <div
                        className="eb-modal-form-group"
                        style={{ gridColumn: "span 4" }}
                      >
                        <label className="eb-modal-label">Narrative *</label>
                        <textarea
                          className={`eb-modal-input ${fieldErrors.narrative ? "error" : ""}`}
                          rows="6"
                          placeholder="Provide detailed narrative (minimum 20 characters, maximum 5000 characters)"
                          value={caseDetail.narrative}
                          maxLength="5000"
                          onChange={(e) => {
                            const value = e.target.value.replace(
                              /[^A-Za-z0-9ÑñĆ.,;:()\s-]/g,
                              "",
                            );
                            updateCaseDetail("narrative", value);
                            if (
                              value.trim().length > 0 &&
                              fieldErrors.narrative
                            ) {
                              const newErrors = { ...fieldErrors };
                              delete newErrors.narrative;
                              setFieldErrors(newErrors);
                            }
                          }}
                        ></textarea>
                        <FieldError error={fieldErrors.narrative} />
                        <small style={{ color: "#6b7280", fontSize: "12px" }}>
                          {caseDetail.narrative.length}/5000 characters
                        </small>
                      </div>

                      {/* ── ROW 6: MAP ── */}
                      <div
                        className="eb-modal-form-group"
                        style={{ gridColumn: "span 4" }}
                      >
                        <div
                          style={{
                            background:
                              "linear-gradient(135deg, var(--navy-dark), var(--navy-primary))",
                            padding: "10px 16px",
                            borderRadius: "6px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                          }}
                        >
                          <span
                            style={{
                              color: "white",
                              fontWeight: 700,
                              fontSize: "12px",
                              textTransform: "uppercase",
                              letterSpacing: "0.8px",
                            }}
                          >
                            Crime Location Pin
                          </span>
                          <span
                            style={{
                              color: "rgba(255,255,255,0.6)",
                              fontSize: "11px",
                            }}
                          >
                            {caseDetail.place_barangay
                              ? `Restricted to ${caseDetail.place_barangay} boundary`
                              : "Select a barangay first"}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            marginBottom: "10px",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <label
                              style={{
                                fontSize: "11px",
                                color: "#6b7280",
                                display: "block",
                                marginBottom: "3px",
                              }}
                            >
                              Latitude
                            </label>
                            <input
                              type="text"
                              className="eb-modal-input"
                              placeholder="Set by clicking the map"
                              value={caseDetail.lat}
                              disabled
                              style={{
                                background: "#f3f4f6",
                                cursor: "not-allowed",
                                color: "#6b7280",
                              }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label
                              style={{
                                fontSize: "11px",
                                color: "#6b7280",
                                display: "block",
                                marginBottom: "3px",
                              }}
                            >
                              Longitude
                            </label>
                            <input
                              type="text"
                              className="eb-modal-input"
                              placeholder="Set by clicking the map"
                              value={caseDetail.lng}
                              disabled
                              style={{
                                background: "#f3f4f6",
                                cursor: "not-allowed",
                                color: "#6b7280",
                              }}
                            />
                          </div>
                          {(caseDetail.lat || caseDetail.lng) && (
                            <button
                              type="button"
                              style={{
                                alignSelf: "flex-end",
                                padding: "8px 14px",
                                background: "#fee2e2",
                                color: "#dc2626",
                                border: "1px solid #fca5a5",
                                borderRadius: "6px",
                                fontSize: "12px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                              onClick={() => {
                                updateCaseDetail("lat", "");
                                updateCaseDetail("lng", "");
                              }}
                            >
                              Clear Pin
                            </button>
                          )}
                        </div>

                        <div
                          style={{
                            position: "relative",
                            height: "600px",
                            borderRadius: "8px",
                            overflow: "hidden",
                            border: "1px solid #d1d5db",
                          }}
                        >
                          {!caseDetail.place_barangay && (
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                zIndex: 10,
                                background: "rgba(243,244,246,0.85)",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "10px",
                                pointerEvents: "all",
                                cursor: "not-allowed",
                                borderRadius: "8px",
                              }}
                            >
                              <div
                                style={{
                                  width: "48px",
                                  height: "48px",
                                  borderRadius: "50%",
                                  background: "#e5e7eb",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="22"
                                  height="22"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#9ca3af"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                  <circle cx="12" cy="10" r="3" />
                                </svg>
                              </div>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  color: "#6b7280",
                                }}
                              >
                                Select a barangay to enable the map
                              </p>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "12px",
                                  color: "#9ca3af",
                                }}
                              >
                                The pin will be restricted to the selected
                                barangay boundary
                              </p>
                            </div>
                          )}

                          <Map
                            ref={mapRef}
                            mapboxAccessToken={
                              import.meta.env.VITE_MAPBOX_TOKEN
                            }
                            key={`map-${editingBlotterId || "new"}`}
                            initialViewState={{
                              longitude: caseDetail.lng
                                ? parseFloat(caseDetail.lng)
                                : 120.964,
                              latitude: caseDetail.lat
                                ? parseFloat(caseDetail.lat)
                                : 14.4341,
                              zoom: caseDetail.lat ? 15 : 12,
                            }}
                            style={{ width: "100%", height: "100%" }}
                            mapStyle="mapbox://styles/mapbox/streets-v12"
                            onClick={(e) => {
                              if (viewMode || !caseDetail.place_barangay)
                                return;
                              const { lng, lat } = e.lngLat;
                              if (selectedBrgyFeature) {
                                const rings =
                                  selectedBrgyFeature.geometry.type ===
                                  "Polygon"
                                    ? selectedBrgyFeature.geometry.coordinates
                                    : selectedBrgyFeature.geometry.coordinates.flat(
                                        1,
                                      );
                                let inside = false;
                                for (const ring of rings) {
                                  const n = ring.length;
                                  let j = n - 1;
                                  for (let i = 0; i < n; i++) {
                                    const xi = ring[i][0],
                                      yi = ring[i][1];
                                    const xj = ring[j][0],
                                      yj = ring[j][1];
                                    const intersect =
                                      yi > lat !== yj > lat &&
                                      lng <
                                        ((xj - xi) * (lat - yi)) / (yj - yi) +
                                          xi;
                                    if (intersect) inside = !inside;
                                    j = i;
                                  }
                                }
                                if (!inside) {
                                  showWarningToast(
                                    `Pin must be placed inside ${caseDetail.place_barangay}`,
                                  );
                                  return;
                                }
                              }
                              updateCaseDetail("lat", lat.toFixed(6));
                              updateCaseDetail("lng", lng.toFixed(6));
                              if (fieldErrors.pin_location) {
                                const newErrors = { ...fieldErrors };
                                delete newErrors.pin_location;
                                setFieldErrors(newErrors);
                              }
                            }}
                            cursor={
                              !caseDetail.place_barangay || viewMode
                                ? "default"
                                : "crosshair"
                            }
                          >
                            {selectedBrgyFeature && (
                              <Source
                                id="brgy-boundary"
                                type="geojson"
                                data={selectedBrgyFeature}
                              >
                                <Layer
                                  id="brgy-fill"
                                  type="fill"
                                  paint={{
                                    "fill-color": "#1e3a5f",
                                    "fill-opacity": 0.08,
                                  }}
                                />
                                <Layer
                                  id="brgy-outline"
                                  type="line"
                                  paint={{
                                    "line-color": "#1e3a5f",
                                    "line-width": 2.5,
                                    "line-dasharray": [2, 1],
                                  }}
                                />
                              </Source>
                            )}
                            {caseDetail.lat && caseDetail.lng && (
                              <Marker
                                longitude={parseFloat(caseDetail.lng)}
                                latitude={parseFloat(caseDetail.lat)}
                                anchor="bottom"
                              >
                                <div
                                  style={{
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "50% 50% 50% 0",
                                    background: (() => {
                                      const colors = {
                                        Murder: "#7c3aed",
                                        Homicide: "#8b5cf6",
                                        Rape: "#ec4899",
                                        Robbery: "#ef4444",
                                        Theft: "#f97316",
                                        "Physical Injury": "#eab308",
                                        "Carnapping - MC": "#3b82f6",
                                        "Carnapping - MV": "#0ea5e9",
                                        "Special Complex Crime": "#14b8a6",
                                      };
                                      return (
                                        colors[caseDetail.incident_type] ||
                                        "#c1272d"
                                      );
                                    })(),
                                    border: "2px solid white",
                                    transform: "rotate(-45deg)",
                                    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                                  }}
                                />
                              </Marker>
                            )}
                          </Map>
                        </div>

                        <small
                          style={{
                            color: "#6b7280",
                            fontSize: "11px",
                            display: "block",
                            marginTop: "5px",
                          }}
                        >
                          {caseDetail.place_barangay
                            ? `Pinning inside ${caseDetail.place_barangay}. Click the map to drop a pin.`
                            : "Select a barangay above to activate the map."}
                        </small>
                        {fieldErrors.pin_location && (
                          <span
                            className="eb-field-error eb-pin-location-error"
                            style={{ marginTop: "6px", display: "block" }}
                          >
                            {fieldErrors.pin_location}
                          </span>
                        )}
                        {caseDetail.lat &&
                          caseDetail.lng &&
                          isPinOutsideBoundary() && (
                            <div
                              style={{
                                marginTop: "8px",
                                padding: "10px 14px",
                                background: "#fef3c7",
                                border: "1px solid #f59e0b",
                                borderRadius: "6px",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "8px",
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#d97706"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ flexShrink: 0, marginTop: "1px" }}
                              >
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              <div>
                                <div
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    color: "#92400e",
                                  }}
                                >
                                  Pin Location Warning
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#b45309",
                                    marginTop: "2px",
                                  }}
                                >
                                  The pinned location appears to be outside the
                                  selected barangay boundary (
                                  {caseDetail.place_barangay}). This may be due
                                  to an imported record with inaccurate
                                  coordinates. Please verify and re-pin on the
                                  map if needed.
                                </div>
                              </div>
                            </div>
                          )}
                      </div>

                      {caseDetail.place_barangay === "Other" && (
                        <div
                          className="eb-modal-form-group"
                          style={{ gridColumn: "span 4" }}
                        >
                          <label className="eb-modal-label">
                            Specify Location *
                          </label>
                          <input
                            type="text"
                            className={`eb-modal-input ${fieldErrors.place_barangay_other ? "error" : ""}`}
                            placeholder="e.g., Highway, Open Area"
                            value={caseDetail.place_barangay_other || ""}
                            maxLength="100"
                            onChange={(e) => {
                              updateCaseDetail(
                                "place_barangay_other",
                                e.target.value,
                              );
                              if (
                                e.target.value.trim().length > 0 &&
                                fieldErrors.place_barangay_other
                              ) {
                                const newErrors = { ...fieldErrors };
                                delete newErrors.place_barangay_other;
                                setFieldErrors(newErrors);
                              }
                            }}
                          />
                          <FieldError
                            error={fieldErrors.place_barangay_other}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="eb-modal-footer">
                  {!viewMode && currentStep > 1 && (
                    <button
                      type="button"
                      className="eb-btn eb-btn-secondary"
                      onClick={() => changeStep(-1)}
                    >
                      Previous
                    </button>
                  )}
                  {!viewMode && currentStep < totalSteps && (
                    <button
                      type="button"
                      className="eb-btn eb-btn-primary"
                      onClick={() => changeStep(1)}
                    >
                      Next
                    </button>
                  )}
                  {!viewMode && currentStep === totalSteps && (
                    <button
                      type="button"
                      className="eb-btn eb-btn-primary"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      style={acceptMode ? { background: "#16a34a" } : {}}
                    >
                      {isSubmitting
                        ? "Submitting..."
                        : acceptMode
                          ? "Accept & Create Case"
                          : editMode
                            ? "Update Report Entry"
                            : "Submit Report Entry"}
                    </button>
                  )}
                  {viewMode && (
                    <button
                      type="button"
                      className="eb-btn eb-btn-secondary"
                      onClick={closeModal}
                    >
                      Close
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showTrash && (
        <div
          className="eb-modal"
          style={{ zIndex: 10001, alignItems: "flex-start" }}
        >
          <div
            className="eb-modal-content"
            style={{
              maxWidth: "95vw",
              width: "95vw",
              margin: "20px auto",
              maxHeight: "95vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 32px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background:
                  "linear-gradient(135deg, var(--navy-dark) 0%, var(--navy-primary) 100%)",
                borderBottom: "3px solid var(--red-primary)",
                borderRadius: "8px 8px 0 0",
                flexShrink: 0,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </div>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "white",
                    }}
                  >
                    Deleted Records
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.7)",
                      marginTop: "2px",
                    }}
                  >
                    Soft-deleted report entries — restore to recover
                  </p>
                </div>
              </div>
              <span
                onClick={() => setShowTrash(false)}
                style={{
                  color: "white",
                  fontSize: "24px",
                  cursor: "pointer",
                  opacity: 0.8,
                  lineHeight: 1,
                }}
              >
                &times;
              </span>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: "28px 32px",
                background: "var(--gray-50)",
                minHeight: "200px",
                flex: 1,
                overflowY: "auto",
              }}
            >
              {trashLoading ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <div style={{ color: "var(--gray-400)", fontSize: "14px" }}>
                    Loading deleted records...
                  </div>
                </div>
              ) : deletedBlotters.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: "var(--gray-100)",
                      margin: "0 auto 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--gray-400)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </div>
                  <p
                    style={{
                      color: "var(--gray-400)",
                      fontSize: "14px",
                      margin: 0,
                    }}
                  >
                    No deleted records found
                  </p>
                  <p
                    style={{
                      color: "var(--gray-300)",
                      fontSize: "12px",
                      marginTop: "4px",
                    }}
                  >
                    Deleted report entries will appear here
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: "white",
                    borderRadius: "8px",
                    border: "1px solid var(--gray-200)",
                    overflow: "hidden",
                  }}
                >
                  <table className="eb-data-table">
                    <thead>
                      <tr style={{ background: "var(--gray-50)" }}>
                        <th>Report ID</th>
                        <th>Crime Type</th>
                        <th>Location</th>
                        <th>Date of Incident</th>
                        <th>Date Deleted</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDeleted.map((b) => (
                        <tr key={b.blotter_id}>
                          <td>
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 600,
                                color: "var(--navy-primary)",
                                fontSize: "13px",
                              }}
                            >
                              {b.blotter_entry_number}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: "14px",
                                color: "#374151",
                                fontWeight: 500,
                              }}
                            >
                              {b.incident_type}
                            </span>
                          </td>
                          <td
                            style={{
                              color: "var(--gray-600)",
                              fontSize: "13px",
                            }}
                          >
                            {`${b.place_barangay}, ${b.place_city_municipality}`}
                          </td>
                          <td
                            style={{
                              color: "var(--gray-600)",
                              fontSize: "13px",
                            }}
                          >
                            {formatDate(b.date_time_reported)}
                          </td>
                          <td
                            style={{
                              color: "var(--gray-600)",
                              fontSize: "13px",
                            }}
                          >
                            {formatDate(b.deleted_at)}
                          </td>
                          <td>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                handleRestore(b.blotter_id);
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                color: "white",
                                background: "#16a34a",
                                border: "none",
                                borderRadius: "6px",
                                padding: "7px 14px",
                                fontWeight: 600,
                                fontSize: "13px",
                                cursor: "pointer",
                                fontFamily: "DM Sans, sans-serif",
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                              </svg>
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 32px",
                borderTop: "1px solid var(--gray-200)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "white",
                borderRadius: "0 0 8px 8px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--gray-400)" }}>
                {deletedBlotters.length} deleted{" "}
                {deletedBlotters.length === 1 ? "record" : "records"}
              </span>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <button
                  className="eb-pagination-btn"
                  disabled={deletedPage === 1}
                  onClick={() => setDeletedPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--navy-primary)",
                    padding: "0 8px",
                  }}
                >
                  Page {deletedPage} of{" "}
                  {Math.ceil(deletedBlotters.length / DELETED_PER_PAGE) || 1}
                </span>
                <button
                  className="eb-pagination-btn"
                  disabled={
                    deletedPage >=
                    Math.ceil(deletedBlotters.length / DELETED_PER_PAGE)
                  }
                  onClick={() => setDeletedPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div
          className="eb-modal"
          style={{ zIndex: 10002, alignItems: "center" }}
        >
          <div
            className="eb-modal-content"
            style={{ maxWidth: "420px", padding: 0 }}
          >
            <div
              style={{
                padding: "20px 24px",
                background:
                  confirmModal.type === "delete"
                    ? "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)"
                    : "linear-gradient(135deg, var(--navy-dark) 0%, var(--navy-primary) 100%)",
                borderBottom: "3px solid rgba(255,255,255,0.2)",
                borderRadius: "8px 8px 0 0",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {confirmModal.type === "delete" ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                )}
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {confirmModal.type === "delete"
                    ? "Delete Record"
                    : "Restore Record"}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.7)",
                    marginTop: "2px",
                  }}
                >
                  {confirmModal.type === "delete"
                    ? "This action cannot be undone"
                    : "Record will be moved to active"}
                </p>
              </div>
              <span
                onClick={() =>
                  setConfirmModal({
                    show: false,
                    type: "",
                    id: null,
                    message: "",
                  })
                }
                style={{
                  marginLeft: "auto",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "22px",
                  cursor: "pointer",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                &times;
              </span>
            </div>

            <div style={{ padding: "24px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "var(--gray-700)",
                  lineHeight: "1.6",
                }}
              >
                {confirmModal.message}
              </p>
            </div>

            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--gray-200)",
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
                background: "var(--gray-50)",
                borderRadius: "0 0 8px 8px",
              }}
            >
              <button
                className="eb-btn eb-btn-secondary"
                onClick={() =>
                  setConfirmModal({
                    show: false,
                    type: "",
                    id: null,
                    message: "",
                  })
                }
              >
                Cancel
              </button>
              <button
                className="eb-btn"
                style={{
                  background:
                    confirmModal.type === "delete"
                      ? "#dc2626"
                      : "var(--navy-primary)",
                  color: "white",
                }}
                onClick={handleConfirmAction}
              >
                {confirmModal.type === "delete"
                  ? "Yes, Delete"
                  : "Yes, Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmClose && (
        <div
          className="eb-modal"
          style={{ zIndex: 10001, alignItems: "center" }}
        >
          <div
            className="eb-modal-content"
            style={{ maxWidth: "420px", padding: 0 }}
          >
            <div
              style={{
                padding: "20px 24px",
                background:
                  "linear-gradient(135deg, var(--navy-dark) 0%, var(--navy-primary) 100%)",
                borderBottom: "3px solid var(--red-primary)",
                borderRadius: "8px 8px 0 0",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  Confirm Close
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.6)",
                    marginTop: "2px",
                  }}
                >
                  Unsaved changes will be lost
                </p>
              </div>
              <span
                onClick={cancelClose}
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "22px",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                &times;
              </span>
            </div>
            <div style={{ padding: "24px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#374151",
                  lineHeight: "1.6",
                }}
              >
                Are you sure you want to close? All unsaved data will be lost
                and cannot be recovered.
              </p>
            </div>
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
                background: "var(--gray-50)",
                borderRadius: "0 0 8px 8px",
              }}
            >
              <button className="eb-btn eb-btn-secondary" onClick={cancelClose}>
                Cancel
              </button>
              <button
                className="eb-btn eb-btn-primary"
                onClick={closeModal}
                style={{ background: "#dc2626" }}
              >
                Yes, Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="eb-filter-bar">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            stroke="var(--navy-primary)"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: "var(--navy-primary)",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Filter Records
          </span>
        </div>
        <div className="eb-filter-single-row">
          <div className="eb-filter-group">
            <label className="eb-filter-label">Search</label>
            <input
              type="text"
              className="eb-filter-input"
              placeholder="Search by Report ID"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
            />
          </div>
          <div className="eb-filter-group">
            <label className="eb-filter-label">Status</label>
            <select
              className="eb-filter-input"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Status</option>
              <option>Under Investigation</option>
              <option>Cleared</option>
              <option>Solved</option>
            </select>
          </div>
          <div className="eb-filter-group">
            <label className="eb-filter-label">Crime Type</label>
            <select
              className="eb-filter-input"
              name="incident_type"
              value={filters.incident_type}
              onChange={handleFilterChange}
            >
              <option value="">All Crime Types</option>
              <option value="Carnapping - MC">Carnapping - MC</option>
              <option value="Carnapping - MV">Carnapping - MV</option>
              <option>Homicide</option>
              <option>Murder</option>
              <option>Physical Injury</option>
              <option>Rape</option>
              <option>Robbery</option>
              <option>Special Complex Crime</option>
              <option>Theft</option>
            </select>
          </div>
          <div className="eb-filter-group">
            <label className="eb-filter-label">Barangay</label>
            <select
              className="eb-filter-input"
              name="barangay"
              value={filters.barangay}
              onChange={handleFilterChange}
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
          </div>
          <div className="eb-filter-group">
            <label className="eb-filter-label">Source</label>
            <select
              className="eb-filter-input"
              name="data_source"
              value={filters.data_source}
              onChange={handleFilterChange}
            >
              <option value="">All Records</option>
              <option value="manual">Manual Entry</option>
              <option value="bantay_import">Imported</option>
              <option value="brgy_referral">Barangay Referred</option>
            </select>
          </div>
          <div className="eb-filter-group">
            <label className="eb-filter-label">Date From</label>
            <input
              type="date"
              className="eb-filter-input"
              name="date_from"
              value={filters.date_from}
              max={new Date().toISOString().split("T")[0]}
              onChange={handleFilterChange}
              onKeyDown={(e) => e.preventDefault()}
            />
          </div>
          <div className="eb-filter-group">
            <label className="eb-filter-label">Date To</label>
            <input
              type="date"
              className="eb-filter-input"
              name="date_to"
              value={filters.date_to}
              max={new Date().toISOString().split("T")[0]}
              onChange={handleFilterChange}
              onKeyDown={(e) => e.preventDefault()}
            />
          </div>
          <div
            className="eb-filter-group"
            style={{ justifyContent: "flex-end" }}
          >
            <label className="eb-filter-label">&nbsp;</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="eb-btn eb-btn-primary eb-filter-apply-btn"
                onClick={fetchBlotters}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Apply
              </button>
              <button
                className="eb-btn eb-btn-clear"
                onClick={clearFilters}
                title="Clear filters"
              >
                <span className="eb-restart-icon">↻</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="eb-report-tabs">
        <button
          className={`eb-report-tab ${activeReportTab === "reports" ? "active" : ""}`}
          onClick={() => {
            setActiveReportTab("reports");
            setCurrentPage(1);
          }}
        >
          Reports
        </button>
        <button
          className={`eb-report-tab ${activeReportTab === "referred" ? "active" : ""}`}
          onClick={() => {
            setActiveReportTab("referred");
            setCurrentPage(1);
          }}
        >
          Referred (Brgy)
        </button>
      </div>

      <div className="eb-table-card">
        <div className="eb-table-container">
          <table className="eb-data-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Crime Type</th>
                <th>Location</th>
                <th>Date Reported</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      textAlign: "center",
                      padding: "32px",
                      color: "#9ca3af",
                    }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : blotters.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center" }}>
                    No records found
                  </td>
                </tr>
              ) : (
                paginatedBlotters.map((b) => (
                  <tr key={b.blotter_id}>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: "700",
                          color: "var(--navy-primary)",
                          fontSize: "13px",
                          background: "rgba(30,58,95,0.07)",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          display: "inline-block",
                        }}
                      >
                        {b.blotter_entry_number}
                      </span>
                      {b.data_source === "ciras_import" && (
                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "10px",
                            fontWeight: 700,
                            background: "#e0f2fe",
                            color: "#0369a1",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            verticalAlign: "middle",
                          }}
                        >
                          CIRAS
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "14px",
                          color: "#374151",
                          fontWeight: 500,
                        }}
                      >
                        {b.incident_type}
                      </span>
                    </td>
                    <td>{`${b.place_barangay}, ${b.place_city_municipality}`}</td>
                    <td>{formatDate(b.date_time_reported)}</td>
                    <td>
                      <span
                        className={`eb-status-badge ${getStatusClass(b.status)}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div className="eb-table-actions">
                        {activeReportTab === "referred" ? (
                          <>
                            <button
                              className="eb-action-btn"
                              style={{ background: "#16a34a", color: "white" }}
                              onClick={() => handleAcceptReferral(b.blotter_id)}
                            >
                              ✓ Accept
                            </button>
                            <button
                              className="eb-action-btn eb-action-btn-danger"
                              onClick={(e) => {
                                e.preventDefault();
                                handleDelete(b.blotter_id);
                              }}
                            >
                              <DeleteIcon /> Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="eb-action-btn eb-action-btn-view"
                              onClick={(e) => {
                                e.preventDefault();
                                handleView(b.blotter_id);
                              }}
                            >
                              <ViewIcon /> View
                            </button>
                            <button
                              className="eb-action-btn eb-action-btn-edit"
                              onClick={(e) => {
                                e.preventDefault();
                                handleEdit(b.blotter_id);
                              }}
                            >
                              <EditIcon /> Edit
                            </button>
                            <button
                              className="eb-action-btn eb-action-btn-danger"
                              onClick={(e) => {
                                e.preventDefault();
                                handleDelete(b.blotter_id);
                              }}
                            >
                              <DeleteIcon /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="eb-pagination">
          <div className="eb-pagination-info">
            Showing{" "}
            {blotters.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}
            –{Math.min(currentPage * ITEMS_PER_PAGE, blotters.length)} of{" "}
            {blotters.length} records
          </div>
          <div className="eb-pagination-controls">
            <button
              className="eb-pagination-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="eb-pagination-current">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              className="eb-pagination-btn"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showImport && (
        <ImportBlotterModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            fetchBlotters();
            setShowImport(false);
            showReactToast("Records imported successfully!");
          }}
        />
      )}

      {reactToast.show && (
        <div
          className={`um-toast ${reactToast.type === "success" ? "um-toast-success" : "um-toast-error"}`}
          style={{ zIndex: 99999 }}
        >
          <div className="um-toast-content">
            <svg
              className="um-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              {reactToast.type === "success" ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              )}
            </svg>
            <span>{reactToast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default EBlotter;
