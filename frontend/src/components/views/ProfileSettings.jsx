import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Lock, Camera, ChevronDown } from "lucide-react";
import { logout, getUserFromToken } from "../../utils/auth";
import ChangePasswordModal from "../modals/ChangePasswordModal";
import "./ProfileSettings.css";
import LoadingModal from "../modals/LoadingModal";

const PSGC = "https://psgc.gitlab.io/api";
const POLL_MS = 15000;
const API_URL = import.meta.env.VITE_API_URL; // ← add here

export default function ProfileSettings() {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    middle_name: "",
    suffix: "",
    date_of_birth: "",
    gender: "Male",
    phone: "",
    alternate_phone: "",
    email: "",
    region_code: "",
    province_code: "",
    municipality_code: "",
    barangay_code: "",
    address_line: "",
  });
  const [originalFormData, setOriginalFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingEditSetup, setLoadingEditSetup] = useState(false);
  const [resolvedAddr, setResolvedAddr] = useState({
    region: "",
    province: "",
    municipality: "",
    barangay: "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [usernameVisible, setUsernameVisible] = useState(false);
  const usernameTimerRef = useRef(null);
  const showUsername = () => {
    setUsernameVisible(true);
    clearTimeout(usernameTimerRef.current);
    usernameTimerRef.current = setTimeout(
      () => setUsernameVisible(false),
      10000,
    );
  };
  const toggleUsername = () => {
    if (usernameVisible) {
      clearTimeout(usernameTimerRef.current);
      setUsernameVisible(false);
    } else showUsername();
  };
  useEffect(() => () => clearTimeout(usernameTimerRef.current), []);

  const [phoneChanged, setPhoneChanged] = useState(false);
  const [altPhoneChanged, setAltPhoneChanged] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

  // ── Secure email change modal state ─────────────────────────────────────────
  const [emailModal, setEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState("password");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailPasswordShow, setEmailPasswordShow] = useState(false);
  const [emailPasswordErr, setEmailPasswordErr] = useState("");
  const [emailPwAttemptsLeft, setEmailPwAttemptsLeft] = useState(5);
  const [emailPwLocked, setEmailPwLocked] = useState(false);
  const [emailOldMasked, setEmailOldMasked] = useState("");
  const [emailOldOtp, setEmailOldOtp] = useState(["", "", "", "", "", ""]);
  const [emailOldOtpState, setEmailOldOtpState] = useState("active");
  const [emailOldResendsLeft, setEmailOldResendsLeft] = useState(3);
  const [emailCooldown, setEmailCooldown] = useState(false);
  const [emailCooldownHours, setEmailCooldownHours] = useState(0);
  const [emailBlockedUntilTs, setEmailBlockedUntilTs] = useState(null);
  const [emailCooldownCountdown, setEmailCooldownCountdown] = useState("");
  const emailCooldownTimerRef = useRef(null);

  const [emailNewInput, setEmailNewInput] = useState("");
  const [emailNewOtp, setEmailNewOtp] = useState(["", "", "", "", "", ""]);
  const [emailNewOtpMasked, setEmailNewOtpMasked] = useState("");
  const [emailNewOtpState, setEmailNewOtpState] = useState("active");
  const [emailNewResendsLeft, setEmailNewResendsLeft] = useState(3);
  const [emailModalErr, setEmailModalErr] = useState("");
  const [emailModalLoading, setEmailModalLoading] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(null);
  const [emailSessionLocked, setEmailSessionLocked] = useState(false);
  const [emailSessionLockMins, setEmailSessionLockMins] = useState(0);
  const [emailOldOtpTimer, setEmailOldOtpTimer] = useState(0);
  const [emailNewOtpTimer, setEmailNewOtpTimer] = useState(0);
  const emailOldTimerRef = useRef(null);
  const emailNewTimerRef = useRef(null);
  const emailOtpOldRefs = [
    useRef(),
    useRef(),
    useRef(),
    useRef(),
    useRef(),
    useRef(),
  ];
  const emailOtpNewRefs = [
    useRef(),
    useRef(),
    useRef(),
    useRef(),
    useRef(),
    useRef(),
  ];
  const isResendingOldRef = useRef(false);
  const isResendingNewRef = useRef(false);

  // Refs that mirror state — readable synchronously inside timer interval callbacks
  const emailOldResendsLeftRef = useRef(3);
  const emailNewResendsLeftRef = useRef(3);
  const emailStepRef = useRef("password");

  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [psgcLoading, setPsgcLoading] = useState({});

  const regionsRef = useRef([]);
  const provincesRef = useRef([]);
  const municipalitiesRef = useRef([]);
  const barangaysRef = useRef([]);

  const [shouldScrollToError, setShouldScrollToError] = useState(false);
  const errorRefs = useRef({});
  const FIELD_ORDER = [
    "first_name",
    "last_name",
    "middle_name",
    "suffix",
    "phone",
    "alternate_phone",
    "email",
    "region_code",
    "province_code",
    "municipality_code",
    "barangay_code",
    "address_line",
  ];

  const pollTimer = useRef(null);
  const lastEtag = useRef(null);
  const isEditingRef = useRef(false);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);
  // Keep refs in sync so timer callbacks can read current values synchronously
  useEffect(() => {
    emailStepRef.current = emailStep;
  }, [emailStep]);
  useEffect(() => {
    emailOldResendsLeftRef.current = emailOldResendsLeft;
  }, [emailOldResendsLeft]);
  useEffect(() => {
    emailNewResendsLeftRef.current = emailNewResendsLeft;
  }, [emailNewResendsLeft]);
  useEffect(() => {
    clearInterval(emailCooldownTimerRef.current);
    if (emailStep !== "cooldown" || !emailBlockedUntilTs) return;
    const tick = () => {
      const msLeft = emailBlockedUntilTs - Date.now();
      if (msLeft <= 0) {
        setEmailCooldownCountdown("0m 00s");
        clearInterval(emailCooldownTimerRef.current);
        return;
      }
      const totalSecs = Math.ceil(msLeft / 1000);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      setEmailCooldownCountdown(
        h > 0
          ? `${h}h ${String(m).padStart(2, "0")}m`
          : `${m}m ${String(s).padStart(2, "0")}s`,
      );
    };
    tick();
    emailCooldownTimerRef.current = setInterval(tick, 1000);
    return () => clearInterval(emailCooldownTimerRef.current);
  }, [emailStep, emailBlockedUntilTs]);
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(""), 5000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);
  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(""), 5000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (!shouldScrollToError || Object.keys(validationErrors).length === 0)
      return;
    const firstField = FIELD_ORDER.find((f) => validationErrors[f]);
    if (firstField && errorRefs.current[firstField]) {
      const el = errorRefs.current[firstField];
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          const input = el.querySelector("input, select, textarea");
          if (input) input.focus();
        }, 300);
      }, 100);
    }
    setShouldScrollToError(false);
  }, [shouldScrollToError, validationErrors]);

  const fetchRegions = useCallback(async () => {
    setPsgcLoading((p) => ({ ...p, regions: true }));
    try {
      const d = await (await fetch(`${PSGC}/regions/`)).json();
      const arr = Array.isArray(d)
        ? d.sort((a, b) => a.name.localeCompare(b.name))
        : [];
      regionsRef.current = arr;
      setRegions(arr);
      return arr;
    } catch {
      setRegions([]);
      return [];
    } finally {
      setPsgcLoading((p) => ({ ...p, regions: false }));
    }
  }, []);

  const fetchProvinces = useCallback(async (regionCode) => {
    if (!regionCode) {
      setProvinces([]);
      provincesRef.current = [];
      return [];
    }
    setPsgcLoading((p) => ({ ...p, provinces: true }));
    try {
      const d = await (
        await fetch(`${PSGC}/regions/${regionCode}/provinces/`)
      ).json();
      const arr = Array.isArray(d)
        ? d.sort((a, b) => a.name.localeCompare(b.name))
        : [];
      provincesRef.current = arr;
      setProvinces(arr);
      return arr;
    } catch {
      setProvinces([]);
      return [];
    } finally {
      setPsgcLoading((p) => ({ ...p, provinces: false }));
    }
  }, []);

  const fetchMunicipalities = useCallback(async (provinceCode) => {
    if (!provinceCode) {
      setMunicipalities([]);
      municipalitiesRef.current = [];
      return [];
    }
    setPsgcLoading((p) => ({ ...p, municipalities: true }));
    try {
      const d = await (
        await fetch(`${PSGC}/provinces/${provinceCode}/cities-municipalities/`)
      ).json();
      const arr = Array.isArray(d)
        ? d.sort((a, b) => a.name.localeCompare(b.name))
        : [];
      municipalitiesRef.current = arr;
      setMunicipalities(arr);
      return arr;
    } catch {
      setMunicipalities([]);
      return [];
    } finally {
      setPsgcLoading((p) => ({ ...p, municipalities: false }));
    }
  }, []);

  const fetchBarangays = useCallback(async (munCode) => {
    if (!munCode) {
      setBarangays([]);
      barangaysRef.current = [];
      return [];
    }
    setPsgcLoading((p) => ({ ...p, barangays: true }));
    try {
      const d = await (
        await fetch(`${PSGC}/cities-municipalities/${munCode}/barangays/`)
      ).json();
      const arr = Array.isArray(d)
        ? d.sort((a, b) => a.name.localeCompare(b.name))
        : [];
      barangaysRef.current = arr;
      setBarangays(arr);
      return arr;
    } catch {
      setBarangays([]);
      return [];
    } finally {
      setPsgcLoading((p) => ({ ...p, barangays: false }));
    }
  }, []);

  const fetchAllBarangays = useCallback(async () => {
    setPsgcLoading((p) => ({ ...p, barangays: true }));
    try {
      const d = await (await fetch(`${PSGC}/barangays/`)).json();
      const arr = Array.isArray(d)
        ? d.sort((a, b) => a.name.localeCompare(b.name))
        : [];
      barangaysRef.current = arr;
      setBarangays(arr);
    } catch {
      setBarangays([]);
    }
    setPsgcLoading((p) => ({ ...p, barangays: false }));
  }, []);

  const applyUserData = useCallback((ud) => {
    setProfileData({
      ...ud,
      date_of_birth: ud.date_of_birth ? ud.date_of_birth.split("T")[0] : "",
    });
    const cleanPhone = ud.phone ? ud.phone.replace(/^\+63/, "") : "";
    const cleanAltPhone = ud.alternate_phone
      ? ud.alternate_phone.replace(/^\+63/, "")
      : "";
    const fv = {
      first_name: ud.first_name || "",
      last_name: ud.last_name || "",
      middle_name: ud.middle_name || "",
      suffix: ud.suffix || "",
      date_of_birth: ud.date_of_birth ? ud.date_of_birth.split("T")[0] : "",
      gender: ud.gender || "Male",
      phone: cleanPhone,
      alternate_phone: cleanAltPhone,
      email: ud.email || "",
      region_code: ud.region_code || "",
      province_code: ud.province_code || "",
      municipality_code: ud.municipality_code || "",
      barangay_code: ud.assigned_barangay_code || ud.barangay_code || "",
      address_line: ud.address_line || "",
    };
    setFormData(fv);
    setOriginalFormData(fv);
    setProfilePicturePreview(ud.profile_picture || null);
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_URL}/users/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        if (res.status === 401) logout();
        return;
      }
      const data = await res.json();
      if (data.success && data.user) {
        lastEtag.current = JSON.stringify(data.user);
        applyUserData(data.user);
        const ud = data.user;
        if (ud.user_type === "barangay") {
          fetchAllBarangays();
        } else if (ud.region_code) {
          await fetchRegions();
          await fetchProvinces(ud.region_code);
          if (ud.province_code) await fetchMunicipalities(ud.province_code);
          if (ud.municipality_code) await fetchBarangays(ud.municipality_code);
        } else {
          fetchRegions();
        }
      }
    } catch (err) {
      console.error("fetchProfile:", err);
    } finally {
      setLoading(false);
    }
  }, [
    applyUserData,
    fetchAllBarangays,
    fetchRegions,
    fetchProvinces,
    fetchMunicipalities,
    fetchBarangays,
  ]);

  const silentRefresh = useCallback(async () => {
    if (isEditingRef.current) return;
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API_URL}/users/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.user) return;
      const newStr = JSON.stringify(data.user);
      if (newStr === lastEtag.current) return;
      lastEtag.current = newStr;
      applyUserData(data.user);
      const ud = data.user;
      if (ud.region_code) {
        const munChanged = !municipalitiesRef.current.find(
          (o) => o.code === ud.municipality_code,
        );
        const bgyChanged = !barangaysRef.current.find(
          (o) => o.code === ud.barangay_code,
        );
        if (munChanged || bgyChanged) {
          await fetchRegions();
          await fetchProvinces(ud.region_code);
          if (ud.province_code) await fetchMunicipalities(ud.province_code);
          if (ud.municipality_code) await fetchBarangays(ud.municipality_code);
        }
      }
    } catch (_) {
      /* silent */
    }
  }, [
    applyUserData,
    fetchRegions,
    fetchProvinces,
    fetchMunicipalities,
    fetchBarangays,
  ]);

  const startPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(silentRefresh, POLL_MS);
  }, [silentRefresh]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") silentRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [silentRefresh]);

  useEffect(() => {
    const onUpdate = () => silentRefresh();
    window.addEventListener("profileUpdated", onUpdate);
    return () => window.removeEventListener("profileUpdated", onUpdate);
  }, [silentRefresh]);

  useEffect(() => {
    const userData = getUserFromToken();
    if (!userData) {
      setLoading(false);
      return;
    }
    setUser(userData);
    fetchProfile().then(() => startPolling());
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (isEditing) stopPolling();
    else startPolling();
  }, [isEditing]);

  const isPoliceRole = () => profileData?.user_type === "police";
  const isBarangayRole = () => profileData?.user_type === "barangay";

  const handleEditClick = async () => {
    setLoadingEditSetup(true);
    setFormData((prev) => ({
      ...prev,
      // phone: "",
      // alternate_phone: "", // FIX: clear phone fields on edit to avoid accidental exposure of sensitive info, and show placeholders instead to indicate required format (primary) or optionality (alternate)
      email: "",
      region_code: originalFormData.region_code || "",
      province_code: originalFormData.province_code || "",
      municipality_code: originalFormData.municipality_code || "",
      barangay_code: originalFormData.barangay_code || "",
    }));
    setPhoneChanged(false);
    setAltPhoneChanged(false);
    setEmailChanged(false);
    setIsEditing(true);
    setValidationErrors({});
    setShouldScrollToError(false);
    setSuccessMessage("");
    setErrorMessage("");
    if (isPoliceRole()) {
      await fetchRegions();
      if (originalFormData.region_code)
        await fetchProvinces(originalFormData.region_code);
      if (originalFormData.province_code)
        await fetchMunicipalities(originalFormData.province_code);
      if (originalFormData.municipality_code)
        await fetchBarangays(originalFormData.municipality_code);
    } else if (isBarangayRole()) {
      await fetchAllBarangays();
    }
    setLoadingEditSetup(false);
  };

  const handleCancelClick = () => {
    setFormData(originalFormData);
    setValidationErrors({});
    setPhoneChanged(false);
    setAltPhoneChanged(false);
    setEmailChanged(false);
    setIsEditing(false);
    setShouldScrollToError(false);
    setSuccessMessage("");
    setErrorMessage("");
  };

  const handleProfilePictureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const previousPreview = profilePicturePreview;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Image size must be less than 5MB");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setErrorMessage("Only JPG and PNG images are allowed");
      return;
    }
    setIsUploadingPhoto(true);
    setErrorMessage("");
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("profilePicture", file);
      const res = await fetch(`${API_URL}/users/profile/picture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.message || "Failed to upload photo");
        setProfilePicturePreview(previousPreview);
      } else {
        setSuccessMessage("Profile picture updated!");
        lastEtag.current = null;
        await fetchProfile();
        window.dispatchEvent(new CustomEvent("profileUpdated"));
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("An error occurred while uploading photo");
      setProfilePicturePreview(previousPreview);
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const formatDateAdded = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "—";

  const getInitials = () => {
    if (!profileData) return "?";
    return (
      (
        (profileData.first_name?.[0] || "") + (profileData.last_name?.[0] || "")
      ).toUpperCase() || "?"
    );
  };

  const getFullName = () => {
    if (!profileData) return "Loading...";
    const {
      first_name = "",
      middle_name = "",
      last_name = "",
      suffix = "",
    } = profileData;
    const fn =
      first_name.length > 15 ? first_name.substring(0, 12) + "..." : first_name;
    const ln =
      last_name.length > 15 ? last_name.substring(0, 12) + "..." : last_name;
    let name = fn;
    if (middle_name) name += " " + middle_name.charAt(0) + ".";
    if (ln) name += " " + ln;
    if (suffix) name += " " + suffix;
    return name.trim();
  };

  const getRegionName = (code) =>
    regionsRef.current.find((o) => o.code === code)?.name ||
    regions.find((o) => o.code === code)?.name ||
    "—";
  const getProvinceName = (code) =>
    provincesRef.current.find((o) => o.code === code)?.name ||
    provinces.find((o) => o.code === code)?.name ||
    "—";
  const getMunicipalityName = (code) =>
    municipalitiesRef.current.find((o) => o.code === code)?.name ||
    municipalities.find((o) => o.code === code)?.name ||
    (psgcLoading.municipalities ? "Loading..." : "—");
  const getBarangayName = (code) => {
    if (!code) return "—";
    // If it's already a name string (not a numeric PSGC code), return as-is
    if (!/^\d+$/.test(code)) return code;
    return (
      barangaysRef.current.find((o) => o.code === code)?.name ||
      barangays.find((o) => o.code === code)?.name ||
      (psgcLoading.barangays ? "Loading..." : code)
    );
  };

  const validateName = (name, fieldName, maxLength = 50, required = true) => {
    if (!name || name.trim() === "")
      return required ? `${fieldName} is required` : null;
    if (name.length > maxLength)
      return `${fieldName} must not exceed ${maxLength} characters`;
    if (!/^[a-zA-Z\s'\-.]+$/.test(name.trim()))
      return `${fieldName} can only contain letters, spaces, hyphens, apostrophes, and periods`;
    return null;
  };
  const validateSuffix = (suffix) => {
    if (!suffix || suffix.trim() === "") return null;
    const t = suffix.trim().toLowerCase();
    if (t.length > 5) return "Suffix must not exceed 5 characters";
    if (t === "sr." || t === "jr." || /^[ivxlcdm]+$/.test(t)) return null;
    return "Suffix must be Sr., Jr., or a Roman Numeral (e.g., III)";
  };
  const validatePhone = async (phone, fieldName, origPhone) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length !== 10) return `${fieldName} must be exactly 10 digits`;
    if (!clean.startsWith("9")) return `${fieldName} must start with 9`;
    if (origPhone && clean === origPhone.replace(/\D/g, "")) return null;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/check-phone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: `+63${clean}`, excludeCurrent: true }),
      });
      const d = await res.json();
      if (!d.available)
        return `${fieldName} is already registered to another user`;
    } catch {
      /* skip */
    }
    return null;
  };
  const validateEmailFmt = (email) => {
    if (!email || email.trim() === "") return "Email is required";
    if (email.length > 255) return "Email must not exceed 255 characters";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Invalid email format";
    return null;
  };
  const validateForm = async () => {
    const errors = {};
    const fnErr = validateName(formData.first_name, "First name");
    if (fnErr) errors.first_name = fnErr;
    const lnErr = validateName(formData.last_name, "Last name");
    if (lnErr) errors.last_name = lnErr;
    if (formData.middle_name) {
      const mnErr = validateName(
        formData.middle_name,
        "Middle name",
        50,
        false,
      );
      if (mnErr) errors.middle_name = mnErr;
    }
    const sufErr = validateSuffix(formData.suffix);
    if (sufErr) errors.suffix = sufErr;
    if (phoneChanged && formData.phone) {
      const e = await validatePhone(
        formData.phone,
        "Phone number",
        originalFormData.phone,
      );
      if (e) errors.phone = e;
    }
    if (altPhoneChanged && formData.alternate_phone) {
      const e = await validatePhone(
        formData.alternate_phone,
        "Alternate phone",
        originalFormData.alternate_phone,
      );
      if (e) errors.alternate_phone = e;
    }
    const effectivePhone =
      phoneChanged && formData.phone
        ? formData.phone.replace(/\D/g, "")
        : (originalFormData.phone || "").replace(/\D/g, "");
    const effectiveAltPhone =
      altPhoneChanged && formData.alternate_phone
        ? formData.alternate_phone.replace(/\D/g, "")
        : (originalFormData.alternate_phone || "").replace(/\D/g, "");
    if (
      effectivePhone &&
      effectiveAltPhone &&
      effectivePhone === effectiveAltPhone
    )
      errors.alternate_phone =
        "Alternate phone cannot be the same as primary phone";
    if (emailChanged && formData.email) {
      const emailErr = validateEmailFmt(formData.email);
      if (emailErr) errors.email = emailErr;
    }
    if (formData.address_line?.length > 255)
      errors.address_line = "Address line must not exceed 255 characters";
    if (isPoliceRole()) {
      if (!formData.region_code) errors.region_code = "Region is required";
      if (!formData.province_code)
        errors.province_code = "Province is required";
      if (!formData.municipality_code)
        errors.municipality_code = "City / Municipality is required";
      if (!formData.barangay_code)
        errors.barangay_code = "Barangay is required";
    }
    if (isBarangayRole() && !formData.barangay_code)
      errors.barangay_code = "Barangay is required";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (["first_name", "last_name", "middle_name"].includes(name))
      setFormData((p) => ({
        ...p,
        [name]: value.replace(/[^a-zA-Z\s'\-.]/g, "").slice(0, 50),
      }));
    else if (name === "suffix")
      setFormData((p) => ({
        ...p,
        [name]: value.replace(/[^ivxlcdmjrsr.\s]/gi, "").slice(0, 5),
      }));
    else if (name === "address_line")
      setFormData((p) => ({ ...p, [name]: value.slice(0, 255) }));
    else if (name === "email") {
      setFormData((p) => ({ ...p, email: value.slice(0, 255) }));
      setEmailChanged(value.length > 0);
    } else {
      setFormData((p) => ({ ...p, [name]: value }));
    }
    if (validationErrors[name])
      setValidationErrors((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
    setSuccessMessage("");
    setErrorMessage("");
  };
  const handlePhoneInput = (e) => {
    const { name, value } = e.target;
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setFormData((p) => ({ ...p, [name]: digits }));
    if (name === "phone") setPhoneChanged(digits.length > 0);
    if (name === "alternate_phone") setAltPhoneChanged(digits.length > 0);
    if (validationErrors[name])
      setValidationErrors((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
  };
  const handleRegionChange = (e) => {
    const code = e.target.value;
    setFormData((p) => ({
      ...p,
      region_code: code,
      province_code: "",
      municipality_code: "",
      barangay_code: "",
    }));
    setProvinces([]);
    setMunicipalities([]);
    setBarangays([]);
    provincesRef.current = [];
    municipalitiesRef.current = [];
    barangaysRef.current = [];
    fetchProvinces(code);
  };
  const handleProvinceChange = (e) => {
    const code = e.target.value;
    setFormData((p) => ({
      ...p,
      province_code: code,
      municipality_code: "",
      barangay_code: "",
    }));
    setMunicipalities([]);
    setBarangays([]);
    municipalitiesRef.current = [];
    barangaysRef.current = [];
    fetchMunicipalities(code);
  };
  const handleMunicipalityChange = (e) => {
    const code = e.target.value;
    setFormData((p) => ({ ...p, municipality_code: code, barangay_code: "" }));
    setBarangays([]);
    barangaysRef.current = [];
    fetchBarangays(code);
  };
  const handleBarangayChange = (e) =>
    setFormData((p) => ({ ...p, barangay_code: e.target.value }));

  // ── Email OTP timer helpers ────────────────────────────────────────────────
  // resendsLeftRef: ref that mirrors the resend count for THIS otp flow (old or new)
  // so the interval callback can read it synchronously without stale closures.
  const startEmailOtpTimer = (
    expiresAt,
    setTimer,
    setOtpState,
    timerRef,
    resendsLeftRef,
    whichOtp,
  ) => {
    clearInterval(timerRef.current);
    setOtpState("active");
    const update = () => {
      const secs = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimer(secs);
      if (secs <= 0) {
        clearInterval(timerRef.current);

        const resendsRemaining = resendsLeftRef.current;
        const currentStep = emailStepRef.current;

        if (
          resendsRemaining <= 0 &&
          (currentStep === "old-otp" || currentStep === "new-otp")
        ) {
          const lockMins = 15;
          localStorage.setItem(
            "cem_session_locked",
            JSON.stringify({ until: Date.now() + lockMins * 60_000 }),
          );
          // FIX: Persist lock to backend so it survives logout/re-login
          const token = localStorage.getItem("token");
          fetch(`${API_URL}/users/email/force-lock`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ which: whichOtp }),
          }).catch(() => {});
          // FIX: Clear stale error before showing lock screen
          setEmailModalErr("");
          setEmailSessionLockMins(lockMins);
          setEmailStep("session-locked");
          return;
        }

        setOtpState((prev) =>
          prev === "attempts-exceeded" ? "attempts-exceeded" : "expired",
        );
      }
    };
    update();
    timerRef.current = setInterval(update, 1000);
  };

  const formatEmailOtpTimer = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ── FIX: openEmailModal — backend is always the source of truth ───────────
  // localStorage is belt-and-suspenders only; backend status wins.
  const openEmailModal = async () => {
    setEmailModal(true);
    setEmailStep("checking");
    setEmailPassword("");
    setEmailPasswordErr("");
    setEmailPasswordShow(false);
    setEmailPwAttemptsLeft(5);
    setEmailPwLocked(false);
    setEmailOldOtp(["", "", "", "", "", ""]);
    setEmailOldMasked("");
    setEmailOldOtpState("active");
    setEmailOldOtpTimer(0);
    setEmailOldResendsLeft(3);
    setEmailCooldown(false);
    setEmailCooldownHours(0);
    setEmailSessionLocked(false);
    setEmailSessionLockMins(0);
    setEmailNewInput("");
    setEmailNewOtp(["", "", "", "", "", ""]);
    setEmailNewOtpMasked("");
    setEmailNewOtpState("active");
    setEmailNewOtpTimer(0);
    setEmailNewResendsLeft(3);
    setEmailModalErr("");
    setEmailModalLoading(false);
    clearInterval(emailOldTimerRef.current);
    clearInterval(emailNewTimerRef.current);
    isResendingOldRef.current = false;
    isResendingNewRef.current = false;
    // Reset resend refs to initial values
    emailOldResendsLeftRef.current = 3;
    emailNewResendsLeftRef.current = 3;
    emailStepRef.current = "checking";

    // ── Always call backend first — it persists the lock by userId ──────────
    // The in-memory session store on the backend survives logout/re-login
    // because it is keyed by userId, not by browser session.
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/email/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (d.blocked) {
        const hrs = d.hoursLeft ?? 24;
        setEmailCooldownHours(hrs);
        setEmailBlockedUntilTs(Date.now() + (d.msLeft ?? hrs * 3_600_000));
        setEmailStep("cooldown");
        return; // ← THIS was the missing line causing email cooldown to not show
      }
      if (d.sessionLocked) {
        const lockMins = d.minsLeft || 15;
        setEmailSessionLockMins(lockMins);
        // Also write to localStorage so re-opens before backend clears it are instant
        localStorage.setItem(
          "cem_session_locked",
          JSON.stringify({ until: Date.now() + lockMins * 60_000 }),
        );
        setEmailStep("session-locked");
        return;
      }
      if (d.pwLocked) {
        setEmailPwLocked(d.minsLeft || 15);
        setEmailStep("pw-locked");
        return;
      }
      // Backend says clear — also double-check localStorage fast-path
      try {
        const stored = localStorage.getItem("cem_session_locked");
        if (stored) {
          const { until } = JSON.parse(stored);
          if (Date.now() < until) {
            const minsLeft = Math.ceil((until - Date.now()) / 60_000);
            setEmailSessionLockMins(minsLeft);
            setEmailStep("session-locked");
            return;
          } else {
            localStorage.removeItem("cem_session_locked");
          }
        }
      } catch {
        localStorage.removeItem("cem_session_locked");
      }

      setEmailStep("password");
    } catch {
      // Network error — fall back to localStorage check then show form
      try {
        const stored = localStorage.getItem("cem_session_locked");
        if (stored) {
          const { until } = JSON.parse(stored);
          if (Date.now() < until) {
            const minsLeft = Math.ceil((until - Date.now()) / 60_000);
            setEmailSessionLockMins(minsLeft);
            setEmailStep("session-locked");
            return;
          } else {
            localStorage.removeItem("cem_session_locked");
          }
        }
      } catch {
        localStorage.removeItem("cem_session_locked");
      }
      setEmailStep("password");
    }
  };

  const closeEmailModal = () => {
    setEmailModal(false);
    clearInterval(emailOldTimerRef.current);
    clearInterval(emailNewTimerRef.current);
    clearInterval(emailCooldownTimerRef.current);
  };

  const handleOtpKeyDown = (e, idx, otpArr, setOtp, refs) => {
    if (e.key === "Backspace") {
      if (!otpArr[idx] && idx > 0) refs[idx - 1].current?.focus();
      setOtp((prev) => {
        const n = [...prev];
        n[idx] = "";
        return n;
      });
    }
  };
  const handleOtpChange = (val, idx, otpArr, setOtp, refs) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return;
    if (digits.length > 1) {
      const arr = digits.slice(0, 6).split("");
      setOtp((prev) => {
        const n = [...prev];
        arr.forEach((d, i) => {
          if (i < 6) n[i] = d;
        });
        return n;
      });
      refs[Math.min(5, arr.length - 1)].current?.focus();
      return;
    }
    setOtp((prev) => {
      const n = [...prev];
      n[idx] = digits;
      return n;
    });
    setEmailModalErr("");
    if (idx < 5) refs[idx + 1].current?.focus();
  };

  const handleVerifyPassword = async () => {
    if (!emailPassword) {
      setEmailPasswordErr("Please enter your current password");
      return;
    }
    setEmailModalLoading(true);
    setEmailModalErr("");
    setEmailPasswordErr("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/email/verify-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: emailPassword }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.cooldown) {
          setEmailCooldownHours(d.hoursLeft || 24);
          setEmailStep("cooldown");
          return;
        }
        if (d.locked) {
          setEmailPwLocked(d.minutesLeft || 15);
          setEmailStep("pw-locked");
          return;
        }
        if (d.sessionLocked) {
          const lm = d.minutesLeft || 15;
          setEmailSessionLockMins(lm);
          localStorage.setItem(
            "cem_session_locked",
            JSON.stringify({ until: Date.now() + lm * 60_000 }),
          );
          setEmailStep("session-locked");
          return;
        }
        setEmailPwAttemptsLeft(d.attemptsLeft ?? emailPwAttemptsLeft - 1);
        setEmailPasswordErr(d.message || "Incorrect password");
        setEmailPassword("");
        return;
      }
      setEmailPwAttemptsLeft(5);
      setEmailPwLocked(false);
      setEmailStep("old-send");
    } catch {
      setEmailModalErr("Network error. Please try again.");
    } finally {
      setEmailModalLoading(false);
    }
  };

  const handleSendOldOtp = async () => {
    if (isResendingOldRef.current) return;
    isResendingOldRef.current = true;
    setEmailModalLoading(true);
    setEmailModalErr("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/email/request-old-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.sessionLocked) {
          const lm = d.minutesLeft || 15;
          setEmailSessionLockMins(lm);
          localStorage.setItem(
            "cem_session_locked",
            JSON.stringify({ until: Date.now() + lm * 60_000 }),
          );
          setEmailStep("session-locked");
          return;
        }
        if (d.resendLocked || res.status === 429) {
          setEmailModalErr("");
          if (emailStep !== "old-otp") setEmailStep("old-otp");
          return;
        }
        setEmailModalErr(d.message || "Failed to send code");
        return;
      }
      setEmailOldMasked(d.maskedEmail || originalFormData.email || "");
      const oldResendsLeft = d.resendsLeft ?? 2;
      setEmailOldResendsLeft(oldResendsLeft);
      emailOldResendsLeftRef.current = oldResendsLeft; // sync ref immediately — timer needs this
      setEmailOldOtp(["", "", "", "", "", ""]);
      if (emailStep !== "old-otp") setEmailStep("old-otp");
      if (d.otpExpiresAt)
        startEmailOtpTimer(
          d.otpExpiresAt,
          setEmailOldOtpTimer,
          setEmailOldOtpState,
          emailOldTimerRef,
          emailOldResendsLeftRef,
          "old",
        );
      setTimeout(() => emailOtpOldRefs[0].current?.focus(), 100);
    } catch {
      setEmailModalErr("Network error. Please try again.");
    } finally {
      setEmailModalLoading(false);
      isResendingOldRef.current = false;
    }
  };

  const handleVerifyOldOtp = async () => {
    const code = emailOldOtp.join("");
    if (code.length !== 6) {
      setEmailModalErr("Please enter all 6 digits");
      return;
    }
    setEmailModalLoading(true);
    setEmailModalErr("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/email/verify-old-otp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otp: code }),
      });
      const d = await res.json();
      if (!res.ok) {
        // ── FIX: Show lock screen immediately, no auto-close delay ──────────
        // In handleVerifyOldOtp, change the sessionLocked block:
        if (d.sessionLocked || d.autoClose) {
          const lm = d.minutesLeft || 15;
          setEmailSessionLockMins(lm);
          localStorage.setItem(
            "cem_session_locked",
            JSON.stringify({ until: Date.now() + lm * 60_000 }),
          );
          clearInterval(emailOldTimerRef.current);
          setEmailModalErr(""); // FIX: clear stale "Incorrect code" error
          setEmailStep("session-locked");
          return;
        }

        if (d.forceResend || d.attemptLocked || res.status === 429) {
          setEmailOldOtpState("attempts-exceeded");
          setEmailOldOtp(["", "", "", "", "", ""]);
          clearInterval(emailOldTimerRef.current);
          setEmailOldOtpTimer(0);
          if (d.resendsLeft !== undefined) {
            setEmailOldResendsLeft(d.resendsLeft);
            emailOldResendsLeftRef.current = d.resendsLeft; // sync ref immediately
          }
          setEmailModalErr(
            "You have entered too many incorrect codes. For your security, please request a new one.",
          );
          return;
        }
        setEmailModalErr(d.message || "Incorrect code");
        setEmailOldOtp(["", "", "", "", "", ""]);
        setTimeout(() => emailOtpOldRefs[0].current?.focus(), 60);
        return;
      }
      clearInterval(emailOldTimerRef.current);
      setEmailStep("new-email");
      setEmailNewInput("");
    } catch {
      setEmailModalErr("Network error. Please try again.");
    } finally {
      setEmailModalLoading(false);
    }
  };

  const handleSendNewOtp = async () => {
    if (!emailNewInput.trim()) {
      setEmailModalErr("Please enter the new email address");
      return;
    }
    if (isResendingNewRef.current) return;
    isResendingNewRef.current = true;
    setEmailModalLoading(true);
    setEmailModalErr("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/email/request-new-otp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newEmail: emailNewInput.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.sessionLocked) {
          const lm = d.minutesLeft || 15;
          setEmailSessionLockMins(lm);
          localStorage.setItem(
            "cem_session_locked",
            JSON.stringify({ until: Date.now() + lm * 60_000 }),
          );
          setEmailStep("session-locked");
          return;
        }
        if (d.resendLocked || res.status === 429) {
          setEmailModalErr("");
          if (emailStep !== "new-otp") setEmailStep("new-otp");
          return;
        }
        setEmailModalErr(d.message || "Failed to send code");
        return;
      }
      setEmailNewOtpMasked(d.maskedEmail || emailNewInput);
      const newResendsLeft = d.resendsLeft ?? 2;
      setEmailNewResendsLeft(newResendsLeft);
      emailNewResendsLeftRef.current = newResendsLeft; // sync ref immediately — timer needs this
      setEmailNewOtp(["", "", "", "", "", ""]);
      if (emailStep !== "new-otp") setEmailStep("new-otp");
      if (d.otpExpiresAt)
        startEmailOtpTimer(
          d.otpExpiresAt,
          setEmailNewOtpTimer,
          setEmailNewOtpState,
          emailNewTimerRef,
          emailNewResendsLeftRef,
          "new",
        );

      setTimeout(() => emailOtpNewRefs[0].current?.focus(), 100);
    } catch {
      setEmailModalErr("Network error. Please try again.");
    } finally {
      setEmailModalLoading(false);
      isResendingNewRef.current = false;
    }
  };

  const handleVerifyNewOtp = async () => {
    const code = emailNewOtp.join("");
    if (code.length !== 6) {
      setEmailModalErr("Please enter all 6 digits");
      return;
    }
    setEmailModalLoading(true);
    setEmailModalErr("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/email/verify-new-otp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otp: code }),
      });
      const d = await res.json();
      if (!res.ok) {
        // ── FIX: Show lock screen immediately, no auto-close delay ──────────
        if (d.sessionLocked || d.autoClose) {
          const lm = d.minutesLeft || 15;
          setEmailSessionLockMins(lm);
          localStorage.setItem(
            "cem_session_locked",
            JSON.stringify({ until: Date.now() + lm * 60_000 }),
          );
          clearInterval(emailNewTimerRef.current);
          setEmailModalErr(""); // FIX: clear stale "Incorrect code" error
          setEmailStep("session-locked");
          return;
        }

        if (d.forceResend || d.attemptLocked || res.status === 429) {
          setEmailNewOtpState("attempts-exceeded");
          setEmailNewOtp(["", "", "", "", "", ""]);
          clearInterval(emailNewTimerRef.current);
          setEmailNewOtpTimer(0);
          if (d.resendsLeft !== undefined) {
            setEmailNewResendsLeft(d.resendsLeft);
            emailNewResendsLeftRef.current = d.resendsLeft; // sync ref immediately
          }
          setEmailModalErr(
            "You have entered too many incorrect codes. For your security, please request a new one.",
          );
          return;
        }
        setEmailModalErr(d.message || "Incorrect code");
        setEmailNewOtp(["", "", "", "", "", ""]);
        setTimeout(() => emailOtpNewRefs[0].current?.focus(), 60);
        return;
      }
      clearInterval(emailNewTimerRef.current);
      setVerifiedEmail(d.verifiedEmail);
      setEmailStep("done");
    } catch {
      setEmailModalErr("Network error. Please try again.");
    } finally {
      setEmailModalLoading(false);
    }
  };

  const handleEmailModalDone = () => {
    closeEmailModal();
    setSuccessMessage('Email verified! Click "Save Changes" to apply.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isValid = await validateForm();
    if (!isValid) {
      setShouldScrollToError(true);
      return;
    }

    setIsSaving(true);
    setSuccessMessage("");
    setErrorMessage("");
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setErrorMessage("Authentication token not found.");
        setIsSaving(false);
        return;
      }
      const capWords = (str) =>
        str
          ?.trim()
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      let fmt = { ...formData };
      if (fmt.first_name) fmt.first_name = capWords(fmt.first_name);
      if (fmt.last_name) fmt.last_name = capWords(fmt.last_name);
      if (fmt.middle_name) fmt.middle_name = capWords(fmt.middle_name);
      if (fmt.suffix) {
        const t = fmt.suffix.trim();
        if (t.toLowerCase() === "sr.") fmt.suffix = "Sr.";
        else if (t.toLowerCase() === "jr.") fmt.suffix = "Jr.";
        else if (/^[ivxlcdm]+$/i.test(t)) fmt.suffix = t.toUpperCase();
      }
      if (phoneChanged && fmt.phone) fmt.phone = `+63${fmt.phone.trim()}`;
      else
        fmt.phone = originalFormData.phone
          ? `+63${originalFormData.phone}`
          : null;
      if (altPhoneChanged && fmt.alternate_phone)
        fmt.alternate_phone = `+63${fmt.alternate_phone.trim()}`;
      else
        fmt.alternate_phone = originalFormData.alternate_phone
          ? `+63${originalFormData.alternate_phone}`
          : null;
      if (!emailChanged || !fmt.email) fmt.email = originalFormData.email || "";
      const fd = new FormData();
      [
        "first_name",
        "last_name",
        "middle_name",
        "suffix",
        "gender",
        "phone",
        "alternate_phone",
        "region_code",
        "province_code",
        "municipality_code",
        "barangay_code",
        "address_line",
      ].forEach((k) => {
        if (
          fmt[k] !== null &&
          fmt[k] !== undefined &&
          fmt[k].toString().trim() !== ""
        )
          fd.append(k, fmt[k]);
      });
      const res = await fetch(
        `${API_URL}/users/profile/${profileData.user_id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        },
      );
      const d = await res.json();
      if (!res.ok) {
        setErrorMessage(d.message || "Failed to update profile");
        setIsSaving(false);
        return;
      }
      if (d.success) {
        setSuccessMessage("Profile updated successfully!");
        setIsEditing(false);
        setPhoneChanged(false);
        setAltPhoneChanged(false);
        setEmailChanged(false);
        setVerifiedEmail(null);
        lastEtag.current = null;
        await fetchProfile();
        window.dispatchEvent(new CustomEvent("profileUpdated"));
      } else {
        setErrorMessage(d.message || "Failed to update profile");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("An error occurred while updating your profile");
    } finally {
      setIsSaving(false);
    }
  };

  const PsgcSelect = ({
    label,
    name,
    value,
    onChange,
    options,
    isLoading,
    disabled,
    placeholder,
  }) => (
    <div className="ps-form-group" ref={(el) => (errorRefs.current[name] = el)}>
      <label className="ps-form-label">{label}</label>
      <div className="ps-select-wrapper">
        <select
          name={name}
          className={`ps-form-input ps-select ${validationErrors[name] ? "ps-input-error" : ""}`}
          value={value}
          onChange={onChange}
          disabled={disabled || isLoading}
        >
          <option value="">{isLoading ? "Loading…" : placeholder}</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="ps-select-chevron" />
      </div>
      {validationErrors[name] && (
        <span className="ps-field-error">{validationErrors[name]}</span>
      )}
    </div>
  );

  const FieldError = ({ name }) =>
    validationErrors[name] ? (
      <span className="ps-field-error">{validationErrors[name]}</span>
    ) : null;

  const renderPersonalInfoReadOnly = () => (
    <div className="ps-form-section">
      <h3 className="ps-form-section-title">Personal Information</h3>
      <div className="ps-form-grid">
        {[
          { label: "First Name", val: formData.first_name },
          { label: "Last Name", val: formData.last_name },
          { label: "Middle Name", val: formData.middle_name },
          { label: "Suffix", val: formData.suffix },
          { label: "Date of Birth", val: formData.date_of_birth, type: "date" },
        ].map(({ label, val, type }) => (
          <div className="ps-form-group" key={label}>
            <label className="ps-form-label">{label}</label>
            <input
              type={type || "text"}
              className="ps-form-input"
              value={val}
              disabled
            />
          </div>
        ))}
        <div className="ps-form-group">
          <label className="ps-form-label">Gender</label>
          <input
            type="text"
            className="ps-form-input"
            value={formData.gender}
            disabled
          />
        </div>
      </div>
    </div>
  );

  const renderContactInfoReadOnly = () => (
    <div className="ps-form-section">
      <h3 className="ps-form-section-title">Contact Information</h3>
      <div className="ps-form-grid">
        <div className="ps-form-group">
          <label className="ps-form-label">Phone Number</label>
          <div className="ps-phone-input-wrapper">
            <span className="ps-phone-prefix">+63</span>
            <input
              type="text"
              className="ps-form-input ps-phone-input"
              value={originalFormData.phone ? `${originalFormData.phone}` : ""}
              disabled
            />
          </div>
        </div>
        <div className="ps-form-group">
          <label className="ps-form-label">Alternate Phone</label>
          <div className="ps-phone-input-wrapper">
            <span className="ps-phone-prefix">+63</span>
            <input
              type="text"
              className="ps-form-input ps-phone-input"
              value={
                originalFormData.alternate_phone
                  ? `${originalFormData.alternate_phone}`
                  : ""
              }
              disabled
            />
          </div>
        </div>
        <div className="ps-form-group ps-full-width">
          <label className="ps-form-label">Email Address</label>
          <input
            type="text"
            className="ps-form-input"
            value={originalFormData.email || ""}
            disabled
          />
        </div>
        {isPoliceRole() && (
          <div className="ps-form-group ps-full-width">
            <div className="ps-address-quad-grid">
              {[
                {
                  label: "Region",
                  val: getRegionName(originalFormData.region_code),
                },
                {
                  label: "Province",
                  val: getProvinceName(originalFormData.province_code),
                },
                {
                  label: "City / Municipality",
                  val: getMunicipalityName(originalFormData.municipality_code),
                },
                {
                  label: "Barangay",
                  val: getBarangayName(originalFormData.barangay_code),
                },
              ].map(({ label, val }) => (
                <div className="ps-form-group" key={label}>
                  <label className="ps-form-label">{label}</label>
                  <input
                    type="text"
                    className="ps-form-input"
                    value={val}
                    disabled
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {isBarangayRole() && (
          <div className="ps-form-group">
            <label className="ps-form-label">Barangay</label>
            <input
              type="text"
              className="ps-form-input"
              value={getBarangayName(originalFormData.barangay_code)}
              disabled
            />
          </div>
        )}
        <div className="ps-form-group ps-full-width">
          <label className="ps-form-label">Address Line</label>
          <input
            type="text"
            className="ps-form-input"
            value={originalFormData.address_line || "—"}
            disabled
          />
        </div>
      </div>
    </div>
  );

  const renderOfficialInfoReadOnly = () => {
    if (!isPoliceRole() && !isBarangayRole()) return null;
    return (
      <div className="ps-form-section">
        <h3 className="ps-form-section-title">Official Information</h3>
        <div className="ps-official-info-list">
          {isPoliceRole() && (
            <>
              <div className="ps-official-row">
                <span className="ps-official-key">Role</span>
                <span className="ps-official-value">
                  {profileData?.role || "—"}
                </span>
              </div>
              <div className="ps-official-row">
                <span className="ps-official-key">Rank</span>
                <span className="ps-official-value">
                  {profileData?.rank || "—"}
                </span>
              </div>
            </>
          )}
          {isBarangayRole() && (
            <div className="ps-official-row">
              <span className="ps-official-key">Role</span>
              <span className="ps-official-value">
                {profileData?.role || "—"}
              </span>
            </div>
          )}
          <div className="ps-official-row">
            <span className="ps-official-key">Date Joined</span>
            <span className="ps-official-value">
              {formatDateAdded(profileData?.created_at)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (loading)
    return <LoadingModal isOpen={true} message={"Loading your profile..."} />;
  if (!user || !profileData) {
    return (
      <div className="ps-content-area">
        <div className="ps-error-container">
          <h2>Access Denied</h2>
          <p>Please log in to view your profile.</p>
          <Link to="/login">Return to Login</Link>
        </div>
      </div>
    );
  }

  const isBusy = isSaving || isUploadingPhoto;

  const emStepNum = () => {
    if (emailStep === "password" || emailStep === "old-send") return 1;
    if (emailStep === "old-otp") return 2;
    if (emailStep === "new-email") return 3;
    if (emailStep === "new-otp") return 4;
    if (emailStep === "done") return 4;
    return 0;
  };
  const emTitle = () => {
    if (emailStep === "checking") return "Update Email";
    if (emailStep === "password" || emailStep === "old-send")
      return "Update Email";
    if (emailStep === "old-otp") return "Verify Current Email";
    if (emailStep === "new-email") return "Enter New Email";
    if (emailStep === "new-otp") return "Verify New Email";
    if (emailStep === "done") return "Email Updated ✓";
    if (emailStep === "cooldown") return "Update Email Unavailable";
    if (emailStep === "pw-locked") return "Update Email Unavailable";
    if (emailStep === "session-locked") return "Update Email Unavailable";
    return "Update Email";
  };
  const emSubtitle = () => {
    if (emailStep === "checking") return "Please wait…";
    if (emailStep === "password")
      return "Step 1 of 4 — Confirm your current password";
    if (emailStep === "old-send")
      return "Step 2 of 4 — Confirm access to your current email";
    if (emailStep === "old-otp")
      return "Step 2 of 4 — Code sent to your current email";
    if (emailStep === "new-email")
      return "Step 3 of 4 — Where should we send the verification?";
    if (emailStep === "new-otp")
      return "Step 4 of 4 — Code sent to your new email";
    if (emailStep === "done") return "Save your profile to apply the new email";
    if (emailStep === "cooldown") return "Daily limit reached";
    if (emailStep === "pw-locked") return "Too many incorrect attempts";
    if (emailStep === "session-locked")
      return "Temporarily locked for security";
    return "";
  };
  const n = emStepNum();

  return (
    <>
      <LoadingModal isOpen={loadingEditSetup} message="Preparing form..." />
      <LoadingModal
        isOpen={isBusy}
        message={
          isUploadingPhoto ? "Uploading photo..." : "Saving your profile..."
        }
      />

      <div className="ps-content-area">
        <div className="ps-page-header">
          <div className="ps-page-header-left">
            <h1>Profile Settings</h1>
            <p>Manage your personal information and account settings</p>
          </div>
          <div className="ps-page-header-right">
            {isEditing && (
              <button
                onClick={handleCancelClick}
                className="ps-header-button ps-header-button-secondary"
                disabled={isBusy}
              >
                Cancel
              </button>
            )}
            {isEditing ? (
              <button
                onClick={handleSubmit}
                className="ps-header-button ps-header-button-primary"
                disabled={isBusy}
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            ) : (
              <button
                onClick={handleEditClick}
                className="ps-header-button ps-header-button-primary"
                disabled={isBusy}
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        <div className="ps-profile-layout">
          <div className="ps-profile-card">
            <div className="ps-profile-avatar-large">
              {profilePicturePreview ? (
                <img
                  src={profilePicturePreview}
                  alt="Profile"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                getInitials()
              )}
            </div>
            <h2 className="ps-profile-name">
              {profileData.rank_abbreviation}. {getFullName()}
            </h2>
            <div className="ps-profile-badge">{profileData.role || "N/A"}</div>

            <div className="ps-username-display">
              <div className="ps-username-label">Username</div>
              <div className="ps-username-row">
                <span className="ps-username-value">
                  {usernameVisible
                    ? profileData.username
                    : "•".repeat(
                        Math.min(profileData.username?.length || 8, 12),
                      )}
                </span>
                <button
                  className="ps-username-toggle"
                  onClick={toggleUsername}
                  title={usernameVisible ? "Hide username" : "Reveal username"}
                >
                  {usernameVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </div>
            </div>

            <div className="ps-card-actions">
              <button
                className="ps-card-action-btn"
                onClick={() => setShowPasswordModal(true)}
                disabled={isBusy}
              >
                <Lock size={15} /> Change Password
              </button>
              <label
                className={`ps-card-action-btn ps-card-action-upload ${isBusy ? "ps-btn-disabled" : ""}`}
                htmlFor="profilePictureCard"
                style={{
                  pointerEvents: isBusy ? "none" : "auto",
                  opacity: isBusy ? 0.6 : 1,
                  cursor: isBusy ? "not-allowed" : "pointer",
                }}
              >
                <Camera size={15} />{" "}
                {isUploadingPhoto ? "Uploading…" : "Update Photo"}
                <input
                  id="profilePictureCard"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleProfilePictureChange}
                  style={{ display: "none" }}
                  disabled={isBusy}
                />
              </label>
            </div>
          </div>

          <div className={`ps-form-card ${isEditing ? "editing" : ""}`}>
            {!isEditing && (
              <form>
                {renderPersonalInfoReadOnly()}
                {renderContactInfoReadOnly()}
                {renderOfficialInfoReadOnly()}
              </form>
            )}
            {isEditing && (
              // FIX: autoComplete="off" on the main form suppresses browser autofill suggestions
              <form onSubmit={handleSubmit} autoComplete="off">
                {/* Hidden honeypot fields trick browsers into not injecting saved data */}
                <input
                  type="text"
                  name="fake_username"
                  style={{ display: "none" }}
                  autoComplete="username"
                  readOnly
                  tabIndex={-1}
                />
                <input
                  type="password"
                  name="fake_password"
                  style={{ display: "none" }}
                  autoComplete="new-password"
                  readOnly
                  tabIndex={-1}
                />

                <div className="ps-form-section">
                  <h3 className="ps-form-section-title">
                    Personal Information
                  </h3>
                  <div className="ps-form-grid">
                    {[
                      {
                        name: "first_name",
                        label: "First Name *",
                        ph: "Enter first name",
                        max: 50,
                      },
                      {
                        name: "last_name",
                        label: "Last Name *",
                        ph: "Enter last name",
                        max: 50,
                      },
                      {
                        name: "middle_name",
                        label: "Middle Name",
                        ph: "Enter middle name (optional)",
                        max: 50,
                      },
                      {
                        name: "suffix",
                        label: "Suffix",
                        ph: "Sr., Jr., III (optional)",
                        max: 5,
                      },
                    ].map(({ name, label, ph, max }) => (
                      <div
                        className="ps-form-group"
                        key={name}
                        ref={(el) => (errorRefs.current[name] = el)}
                      >
                        <label className="ps-form-label">{label}</label>
                        <input
                          type="text"
                          name={name}
                          autoComplete="off"
                          className={`ps-form-input ${validationErrors[name] ? "ps-input-error" : ""}`}
                          value={formData[name]}
                          onChange={handleInputChange}
                          placeholder={ph}
                          maxLength={max}
                          disabled={isBusy}
                        />
                        <FieldError name={name} />
                      </div>
                    ))}
                    <div className="ps-form-group">
                      <label className="ps-form-label">Date of Birth</label>
                      <input
                        type="date"
                        className="ps-form-input"
                        value={formData.date_of_birth}
                        disabled
                      />
                    </div>
                    <div className="ps-form-group">
                      <label className="ps-form-label">Gender *</label>
                      <select
                        name="gender"
                        className="ps-form-input"
                        value={formData.gender}
                        onChange={handleInputChange}
                        disabled={isBusy}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="ps-form-section">
                  <h3 className="ps-form-section-title">Contact Information</h3>
                  <div className="ps-form-grid">
                    <div
                      className="ps-form-group"
                      ref={(el) => (errorRefs.current["phone"] = el)}
                    >
                      <label className="ps-form-label">Phone Number *</label>
                      <div
                        // className={`ps-phone-input-wrapper ${validationErrors.phone ? "ps-phone-wrapper-error" : ""} ${!phoneChanged ? "ps-sensitive-idle" : "ps-sensitive-active"}`} // FIX: only apply sensitive styling when there's an existing number and it hasn't been changed yet
                        className={`ps-phone-input-wrapper ${validationErrors.phone ? "ps-phone-wrapper-error" : ""}`}
                      >
                        <span className="ps-phone-prefix">+63</span>
                        <input
                          type="tel"
                          name="phone"
                          autoComplete="off"
                          className="ps-form-input ps-phone-input"
                          value={formData.phone}
                          onChange={handlePhoneInput}
                          maxLength="10"
                          // placeholder={originalFormData.phone || "9XXXXXXXXX"} FIX: always show "9XXXXXXXXX" placeholder to indicate required format, even if there's no existing number
                          placeholder="9XXXXXXXXX"
                          disabled={isBusy}
                        />
                      </div>
                      {!validationErrors.phone && (
                        <div
                          className={`ps-keep-hint ${phoneChanged ? "ps-keep-hint-changed" : ""}`}
                        >
                          {/* <span className="ps-keep-dot" />
                          {phoneChanged
                            ? "New number will replace the current one on save"
                            : "Leave blank to keep current primary phone number"} */}
                        </div>
                      )}
                      <FieldError name="phone" />
                    </div>
                    <div
                      className="ps-form-group"
                      ref={(el) => (errorRefs.current["alternate_phone"] = el)}
                    >
                      <label className="ps-form-label">Alternate Phone</label>
                      <div
                        // className={`ps-phone-input-wrapper ${validationErrors.alternate_phone ? "ps-phone-wrapper-error" : ""} ${!altPhoneChanged && originalFormData.alternate_phone ? "ps-sensitive-idle" : altPhoneChanged ? "ps-sensitive-active" : ""}`} FIX: only apply sensitive styling when there's an existing number and it hasn't been changed yet
                        className={`ps-phone-input-wrapper ${validationErrors.alternate_phone ? "ps-phone-wrapper-error" : ""}`}
                      >
                        <span className="ps-phone-prefix">+63</span>
                        <input
                          type="tel"
                          name="alternate_phone"
                          autoComplete="off"
                          className="ps-form-input ps-phone-input"
                          value={formData.alternate_phone}
                          onChange={handlePhoneInput}
                          maxLength="10"
                          // placeholder={
                          //   originalFormData.alternate_phone
                          //     ? originalFormData.alternate_phone
                          //     : "Optional"
                          // } FIX: always show "Optional" placeholder for alternate phone to indicate it's not required, even if there's no existing number
                          placeholder="Optional"
                          disabled={isBusy}
                        />
                      </div>
                      {originalFormData.alternate_phone &&
                        !validationErrors.alternate_phone && (
                          <div
                            className={`ps-keep-hint ${altPhoneChanged ? "ps-keep-hint-changed" : ""}`}
                          >
                            {/* <span className="ps-keep-dot" />
                            {altPhoneChanged
                              ? "New number will replace the current one on save"
                              : "Leave blank to keep current alternate phone number"} */}
                          </div>
                        )}
                      <FieldError name="alternate_phone" />
                    </div>
                    <div
                      className="ps-form-group ps-full-width"
                      ref={(el) => (errorRefs.current["email"] = el)}
                    >
                      <label className="ps-form-label">Email Address *</label>
                      <div className="ps-email-row">
                        <input
                          type="text"
                          name="email"
                          readOnly
                          autoComplete="off"
                          className={`ps-form-input ps-email-readonly ${validationErrors.email ? "ps-input-error" : ""}`}
                          value={
                            verifiedEmail
                              ? verifiedEmail
                              : originalFormData.email || ""
                          }
                          placeholder="No email on file"
                        />
                        <button
                          type="button"
                          className={`ps-email-change-btn ${verifiedEmail ? "ps-email-change-btn-verified" : ""}`}
                          onClick={verifiedEmail ? undefined : openEmailModal}
                          disabled={isBusy || !!verifiedEmail}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          {verifiedEmail ? "✓ Verified" : "Change Email"}
                        </button>
                      </div>
                      {verifiedEmail && (
                        <div className="ps-keep-hint ps-keep-hint-changed">
                          <span className="ps-keep-dot" />
                          New email <strong>{verifiedEmail}</strong> will be
                          saved when you click Save Changes
                        </div>
                      )}
                      <FieldError name="email" />
                    </div>
                    {isPoliceRole() && (
                      <div className="ps-form-group ps-full-width">
                        <div className="ps-address-quad-grid">
                          <PsgcSelect
                            label="Region"
                            name="region_code"
                            value={formData.region_code}
                            onChange={handleRegionChange}
                            options={regions}
                            isLoading={psgcLoading.regions}
                            placeholder="— Region —"
                          />
                          <PsgcSelect
                            label="Province"
                            name="province_code"
                            value={formData.province_code}
                            onChange={handleProvinceChange}
                            options={provinces}
                            isLoading={psgcLoading.provinces}
                            disabled={!formData.region_code}
                            placeholder="— Province —"
                          />
                          <PsgcSelect
                            label="City / Municipality"
                            name="municipality_code"
                            value={formData.municipality_code}
                            onChange={handleMunicipalityChange}
                            options={municipalities}
                            isLoading={psgcLoading.municipalities}
                            disabled={!formData.province_code}
                            placeholder="— City / Mun. —"
                          />
                          <PsgcSelect
                            label="Barangay"
                            name="barangay_code"
                            value={formData.barangay_code}
                            onChange={handleBarangayChange}
                            options={barangays}
                            isLoading={psgcLoading.barangays}
                            disabled={!formData.municipality_code}
                            placeholder="— Barangay —"
                          />
                        </div>
                      </div>
                    )}
                    {isBarangayRole() && (
                      <div className="ps-form-group">
                        <label className="ps-form-label">Barangay</label>
                        <input
                          type="text"
                          className="ps-form-input"
                          value={getBarangayName(formData.barangay_code)}
                          disabled
                          style={{
                            background: "#f9fafb",
                            cursor: "not-allowed",
                          }}
                        />
                        <span
                          className="ps-input-hint"
                          style={{
                            color: "#9ca3af",
                            fontSize: "12px",
                            marginTop: "4px",
                            display: "block",
                          }}
                        >
                          Your barangay assignment cannot be changed. Contact an
                          administrator if this needs updating.
                        </span>
                      </div>
                    )}
                    <div className="ps-form-group ps-full-width">
                      <label className="ps-form-label">Address Line</label>
                      <textarea
                        name="address_line"
                        autoComplete="off"
                        className={`ps-form-input ps-form-textarea ${validationErrors.address_line ? "ps-input-error" : ""}`}
                        value={formData.address_line}
                        onChange={handleInputChange}
                        placeholder="House/Unit No., Street, Subdivision, etc. (optional)"
                        maxLength="255"
                        disabled={isBusy}
                      />
                      <span className="ps-input-hint">
                        {formData.address_line.length}/255 characters
                      </span>
                    </div>
                  </div>
                </div>

                {(isPoliceRole() || isBarangayRole()) && (
                  <div className="ps-form-section">
                    <h3 className="ps-form-section-title">
                      Official Information
                    </h3>
                    <div className="ps-official-info-list">
                      {isPoliceRole() && (
                        <>
                          <div className="ps-official-row">
                            <span className="ps-official-key">Role</span>
                            <span className="ps-official-value">
                              {profileData?.role || "—"}
                            </span>
                          </div>
                          <div className="ps-official-row">
                            <span className="ps-official-key">Rank</span>
                            <span className="ps-official-value">
                              {profileData?.rank_abbreviation &&
                              profileData?.rank
                                ? `${profileData.rank_abbreviation}. — ${profileData.rank}`
                                : profileData?.rank || "—"}
                            </span>
                          </div>
                        </>
                      )}
                      {isBarangayRole() && (
                        <div className="ps-official-row">
                          <span className="ps-official-key">Role</span>
                          <span className="ps-official-value">
                            {profileData?.role || "—"}
                          </span>
                        </div>
                      )}
                      <div className="ps-official-row">
                        <span className="ps-official-key">Date Joined</span>
                        <span className="ps-official-value">
                          {formatDateAdded(profileData?.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      {successMessage && (
        <div className="ps-toast ps-toast-success">
          <div className="ps-toast-content">
            <svg
              className="ps-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>{successMessage}</span>
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="ps-toast ps-toast-error">
          <div className="ps-toast-content">
            <svg
              className="ps-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={(msg) => setSuccessMessage(msg)}
        onError={(msg) => setErrorMessage(msg)}
      />

      {/* ── Update Email Modal ─────────────────────────────────────────────── */}
      {emailModal && (
        <div className="em-overlay">
          <div className="em-modal">
            {/* Header */}
            <div className="em-header">
              <div className="em-header-icon">
                {emailStep === "done" ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                )}
              </div>
              <div className="em-header-text">
                <h2>{emTitle()}</h2>
                <p>{emSubtitle()}</p>
              </div>
              <button
                className="em-close"
                onClick={closeEmailModal}
                disabled={emailModalLoading}
              >
                ✕
              </button>
            </div>

            {/* 4-step progress bars */}
            {[
              "password",
              "old-send",
              "old-otp",
              "new-email",
              "new-otp",
              "done",
            ].includes(emailStep) && (
              <div className="em-steps">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`em-step-bar ${n > i ? "em-step-done" : n === i ? "em-step-active" : ""}`}
                  />
                ))}
              </div>
            )}

            <div className="em-body">
              {/* Global error alert */}
              {emailModalErr && !["old-otp", "new-otp"].includes(emailStep) && (
                <div className="em-alert em-alert-danger">{emailModalErr}</div>
              )}

              {/* CHECKING */}
              {emailStep === "checking" && (
                <div className="em-center">
                  {/* <div className="em-checking-spinner" /> */}
                  <p
                    style={{
                      color: "#6c757d",
                      fontSize: "14px",
                      margin: "16px 0 0",
                    }}
                  >
                    Checking availability…
                  </p>
                </div>
              )}

              {/* COOLDOWN */}
              {emailStep === "cooldown" && (
                <div className="em-blocked-body">
                  <div className="em-blocked-icon">
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <h3 className="em-blocked-title">Email Change Unavailable</h3>
                  <p className="em-blocked-msg">
                    Your email was already changed today.
                  </p>
                  <p
                    className="em-blocked-msg"
                    style={{ color: "#6b7280", fontSize: "13px", marginTop: 4 }}
                  >
                    For security, email updates are limited to once every 24
                    hours.
                  </p>
                  <p
                    className="em-blocked-msg"
                    style={{
                      marginTop: 12,
                      marginBottom: 4,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    You can update your email again in:
                  </p>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#fef3c7",
                      border: "1px solid #fcd34d",
                      borderRadius: 8,
                      padding: "8px 20px",
                      margin: "4px 0 12px",
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#92400e",
                      letterSpacing: 1,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#92400e"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {emailCooldownCountdown || "Calculating…"}
                  </div>
                  <button
                    className="em-btn em-btn-secondary em-btn-full"
                    onClick={closeEmailModal}
                    style={{ marginTop: "12px" }}
                  >
                    Got it, Close
                  </button>
                </div>
              )}

              {/* PW-LOCKED */}
              {emailStep === "pw-locked" && (
                <div className="em-blocked-body">
                  <div
                    className="em-blocked-icon"
                    style={{ background: "#fff3cd" }}
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#c2410c"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <h3 className="em-blocked-title">Update Email Unavailable</h3>
                  <p className="em-blocked-msg">
                    Too many incorrect password attempts.
                  </p>
                  <p className="em-blocked-time">
                    Please try again after{" "}
                    <strong>
                      {emailPwLocked} minute{emailPwLocked !== 1 ? "s" : ""}
                    </strong>
                    .
                  </p>
                  <button
                    className="em-btn em-btn-secondary em-btn-full"
                    onClick={closeEmailModal}
                    style={{ marginTop: "24px" }}
                  >
                    Close
                  </button>
                </div>
              )}

              {/* SESSION-LOCKED */}
              {emailStep === "session-locked" && (
                <div className="em-blocked-body">
                  <div
                    className="em-blocked-icon"
                    style={{ background: "#fff3cd" }}
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#c2410c"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <h3 className="em-blocked-title">Update Email Unavailable</h3>
                  <p className="em-blocked-msg">
                    For security reasons, this process has been temporarily
                    locked.
                  </p>
                  <p className="em-blocked-time">
                    Please try again after{" "}
                    <strong>
                      {emailSessionLockMins} minute
                      {emailSessionLockMins !== 1 ? "s" : ""}
                    </strong>
                    .
                  </p>
                  <button
                    className="em-btn em-btn-secondary em-btn-full"
                    onClick={closeEmailModal}
                    style={{ marginTop: "24px" }}
                  >
                    Close
                  </button>
                </div>
              )}

              {/* STEP 1: Password */}
              {emailStep === "password" && (
                <>
                  {/* FIX: dummy hidden fields stop browser from injecting saved passwords */}
                  <input
                    type="text"
                    name="em_fake_user"
                    style={{ display: "none" }}
                    autoComplete="username"
                    readOnly
                    tabIndex={-1}
                  />
                  <input
                    type="password"
                    name="em_fake_pass"
                    style={{ display: "none" }}
                    autoComplete="new-password"
                    readOnly
                    tabIndex={-1}
                  />
                  <div className="em-step-intro">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1e3a5f"
                      strokeWidth="2"
                      style={{ flexShrink: 0, marginTop: "1px" }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4m0-4h.01" />
                    </svg>
                    <p>
                      To protect your account, please confirm your current
                      password before changing your email.
                    </p>
                  </div>
                  <div className="em-form-group">
                    <label className="em-form-label">Current Password *</label>
                    <div className="em-pw-wrap">
                      <input
                        type={emailPasswordShow ? "text" : "password"}
                        name="em_current_password"
                        autoComplete="off"
                        className={`em-form-input ${emailPasswordErr ? "em-input-error" : ""}`}
                        placeholder="Enter your current password"
                        value={emailPassword}
                        onChange={(e) => {
                          setEmailPassword(e.target.value);
                          setEmailPasswordErr("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleVerifyPassword();
                        }}
                        disabled={emailModalLoading}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="em-eye-btn"
                        tabIndex={-1}
                        onClick={() => setEmailPasswordShow((v) => !v)}
                      >
                        {emailPasswordShow ? (
                          <Eye size={17} />
                        ) : (
                          <EyeOff size={17} />
                        )}
                      </button>
                    </div>
                    {emailPasswordErr && (
                      <span
                        className={`em-error-text ${emailPwAttemptsLeft !== null && emailPwAttemptsLeft <= 2 ? "em-error-warning" : ""}`}
                      >
                        {emailPasswordErr}
                      </span>
                    )}
                  </div>
                  <div className="em-footer">
                    <button
                      className="em-btn em-btn-secondary"
                      onClick={closeEmailModal}
                      disabled={emailModalLoading}
                    >
                      Cancel
                    </button>
                    <button
                      className="em-btn em-btn-primary"
                      onClick={handleVerifyPassword}
                      disabled={emailModalLoading || !emailPassword}
                    >
                      {emailModalLoading ? (
                        <>
                          {/* <span className="em-spinner" /> */}
                          Verifying…
                        </>
                      ) : (
                        "Verify & Continue"
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* STEP 2a: Send old OTP prompt */}
              {emailStep === "old-send" && (
                <>
                  <div className="em-step-intro">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1e3a5f"
                      strokeWidth="2"
                      style={{ flexShrink: 0, marginTop: "1px" }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4m0-4h.01" />
                    </svg>
                    <p>
                      We'll send a one-time code to your{" "}
                      <strong>current</strong> registered email to confirm you
                      still have access.
                    </p>
                  </div>
                  <div className="em-email-preview">
                    <span className="em-email-preview-label">
                      Current email
                    </span>
                    <span className="em-email-preview-value">
                      {originalFormData.email || ""}
                    </span>
                  </div>
                  <div className="em-footer">
                    <button
                      className="em-btn em-btn-primary em-btn-full"
                      onClick={handleSendOldOtp}
                      disabled={emailModalLoading}
                    >
                      {emailModalLoading ? (
                        <>
                          {/* <span className="em-spinner" /> */}
                          Sending…
                        </>
                      ) : (
                        "Send Verification Code"
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* STEP 2b: Verify old email OTP */}
              {emailStep === "old-otp" && (
                <>
                  <div className="em-otp-info-box">
                    <div className="em-otp-info-icon">✉</div>
                    <div>
                      <p className="em-otp-info-title">
                        Code sent to <strong>{originalFormData.email}</strong>
                      </p>
                      <p className="em-otp-info-sub">
                        This code expires in <strong>2 minutes</strong>. Do not
                        share it with anyone.
                      </p>
                    </div>
                  </div>

                  {emailOldOtpState !== "attempts-exceeded" && (
                    <div
                      className={`em-otp-timer ${emailOldOtpTimer <= 60 && emailOldOtpTimer > 0 ? "em-otp-timer-warn" : ""} ${emailOldOtpTimer === 0 ? "em-otp-timer-expired" : ""}`}
                    >
                      {emailOldOtpTimer > 0 ? (
                        <>
                          ⏱ Expires in{" "}
                          <strong>
                            {formatEmailOtpTimer(emailOldOtpTimer)}
                          </strong>
                        </>
                      ) : (
                        "⏱ This code is no longer valid. Please request a new one to continue."
                      )}
                    </div>
                  )}

                  {emailModalErr && (
                    <div
                      className={`em-alert ${emailOldOtpState === "attempts-exceeded" ? "em-alert-lockout" : "em-alert-danger"}`}
                    >
                      {emailModalErr}
                    </div>
                  )}

                  <div className="em-otp-boxes">
                    {emailOldOtp.map((v, i) => (
                      <input
                        key={i}
                        ref={emailOtpOldRefs[i]}
                        className={`em-otp-box ${emailOldOtpState !== "active" || emailOldOtpTimer === 0 ? "em-otp-box-locked" : ""}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={v}
                        autoComplete="one-time-code"
                        onChange={(e) =>
                          handleOtpChange(
                            e.target.value,
                            i,
                            emailOldOtp,
                            setEmailOldOtp,
                            emailOtpOldRefs,
                          )
                        }
                        onKeyDown={(e) =>
                          handleOtpKeyDown(
                            e,
                            i,
                            emailOldOtp,
                            setEmailOldOtp,
                            emailOtpOldRefs,
                          )
                        }
                        disabled={
                          emailOldOtpState !== "active" ||
                          emailModalLoading ||
                          emailOldOtpTimer === 0
                        }
                      />
                    ))}
                  </div>

                  {emailOldOtpState === "active" && emailOldOtpTimer > 0 && (
                    <button
                      className="em-btn em-btn-primary em-btn-full"
                      onClick={handleVerifyOldOtp}
                      disabled={
                        emailModalLoading || emailOldOtp.join("").length !== 6
                      }
                    >
                      {emailModalLoading ? (
                        <>
                          {/* <span className="em-spinner" /> */}
                          Verifying…
                        </>
                      ) : (
                        "Confirm"
                      )}
                    </button>
                  )}

                  {(() => {
                    const canResend =
                      emailOldResendsLeft > 0 &&
                      (emailOldOtpTimer === 0 ||
                        emailOldOtpState === "attempts-exceeded");
                    return (
                      <div className="em-otp-resend">
                        {emailOldResendsLeft <= 0 ? (
                          <span className="em-resend-exhausted">
                            No more resends available for this session
                          </span>
                        ) : canResend ? (
                          <button
                            className="em-link-btn"
                            onClick={handleSendOldOtp}
                            disabled={emailModalLoading}
                          >
                            {emailModalLoading
                              ? "Sending…"
                              : `Resend Code (${emailOldResendsLeft} left)`}
                          </button>
                        ) : null}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* STEP 3: Enter new email */}
              {emailStep === "new-email" && (
                <>
                  <div className="em-step-intro">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1e3a5f"
                      strokeWidth="2"
                      style={{ flexShrink: 0, marginTop: "1px" }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4m0-4h.01" />
                    </svg>
                    <p>
                      Enter the new email address you want to link to your
                      account.
                    </p>
                  </div>
                  <div className="em-form-group">
                    <label className="em-form-label">New Email Address *</label>
                    <input
                      type="email"
                      name="em_new_email"
                      autoComplete="off"
                      className="em-form-input"
                      placeholder="Enter your new email address"
                      value={emailNewInput}
                      onChange={(e) => {
                        setEmailNewInput(e.target.value);
                        setEmailModalErr("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSendNewOtp();
                      }}
                      disabled={emailModalLoading}
                      autoFocus
                    />
                  </div>
                  <div className="em-footer">
                    <button
                      className="em-btn em-btn-primary em-btn-full"
                      onClick={handleSendNewOtp}
                      disabled={emailModalLoading || !emailNewInput.trim()}
                    >
                      {emailModalLoading ? (
                        <>
                          {/* <span className="em-spinner" /> */}
                          Sending…
                        </>
                      ) : (
                        "Send Verification Code"
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* STEP 4: Verify new email OTP */}
              {emailStep === "new-otp" && (
                <>
                  <div className="em-otp-info-box">
                    <div className="em-otp-info-icon">✉</div>
                    <div>
                      <p className="em-otp-info-title">
                        Code sent to <strong>{emailNewInput}</strong>
                      </p>
                      <p className="em-otp-info-sub">
                        This code expires in <strong>2 minutes</strong>. Do not
                        share it with anyone.
                      </p>
                    </div>
                  </div>

                  {emailNewOtpState !== "attempts-exceeded" && (
                    <div
                      className={`em-otp-timer ${emailNewOtpTimer <= 60 && emailNewOtpTimer > 0 ? "em-otp-timer-warn" : ""} ${emailNewOtpTimer === 0 ? "em-otp-timer-expired" : ""}`}
                    >
                      {emailNewOtpTimer > 0 ? (
                        <>
                          ⏱ Expires in{" "}
                          <strong>
                            {formatEmailOtpTimer(emailNewOtpTimer)}
                          </strong>
                        </>
                      ) : (
                        "⏱ This code is no longer valid. Please request a new one to continue."
                      )}
                    </div>
                  )}

                  {emailModalErr && (
                    <div
                      className={`em-alert ${emailNewOtpState === "attempts-exceeded" ? "em-alert-lockout" : "em-alert-danger"}`}
                    >
                      {emailModalErr}
                    </div>
                  )}

                  <div className="em-otp-boxes">
                    {emailNewOtp.map((v, i) => (
                      <input
                        key={i}
                        ref={emailOtpNewRefs[i]}
                        className={`em-otp-box ${emailNewOtpState !== "active" || emailNewOtpTimer === 0 ? "em-otp-box-locked" : ""}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={v}
                        autoComplete="one-time-code"
                        onChange={(e) =>
                          handleOtpChange(
                            e.target.value,
                            i,
                            emailNewOtp,
                            setEmailNewOtp,
                            emailOtpNewRefs,
                          )
                        }
                        onKeyDown={(e) =>
                          handleOtpKeyDown(
                            e,
                            i,
                            emailNewOtp,
                            setEmailNewOtp,
                            emailOtpNewRefs,
                          )
                        }
                        disabled={
                          emailNewOtpState !== "active" ||
                          emailModalLoading ||
                          emailNewOtpTimer === 0
                        }
                      />
                    ))}
                  </div>

                  {emailNewOtpState === "active" && emailNewOtpTimer > 0 && (
                    <button
                      className="em-btn em-btn-primary em-btn-full"
                      onClick={handleVerifyNewOtp}
                      disabled={
                        emailModalLoading || emailNewOtp.join("").length !== 6
                      }
                    >
                      {emailModalLoading ? (
                        <>
                          {/* <span className="em-spinner" /> */}
                          Verifying…
                        </>
                      ) : (
                        "Confirm New Email"
                      )}
                    </button>
                  )}

                  {(() => {
                    const canResend =
                      emailNewResendsLeft > 0 &&
                      (emailNewOtpTimer === 0 ||
                        emailNewOtpState === "attempts-exceeded");
                    return (
                      <div className="em-otp-resend">
                        {emailNewResendsLeft <= 0 ? (
                          <span className="em-resend-exhausted">
                            No more resends available for this session
                          </span>
                        ) : canResend ? (
                          <button
                            className="em-link-btn"
                            onClick={handleSendNewOtp}
                            disabled={emailModalLoading}
                          >
                            {emailModalLoading
                              ? "Sending…"
                              : `Resend Code (${emailNewResendsLeft} left)`}
                          </button>
                        ) : null}
                      </div>
                    );
                  })()}

                  <button
                    className="em-back-btn"
                    onClick={() => {
                      setEmailStep("new-email");
                      setEmailModalErr("");
                    }}
                    disabled={emailModalLoading}
                  >
                    Try a different email
                  </button>
                </>
              )}

              {/* DONE */}
              {emailStep === "done" && (
                <div className="em-done-body">
                  <div className="em-done-icon">✓</div>
                  <h3 className="em-done-title">Verification Complete!</h3>
                  <p className="em-done-sub">
                    Your new email <strong>{verifiedEmail}</strong> has been
                    verified successfully.
                  </p>
                  <p className="em-done-save">
                    Click <strong>"Save Changes"</strong> on the profile form to
                    apply your new email address.
                  </p>
                  <button
                    className="em-btn em-btn-primary em-btn-full"
                    onClick={handleEmailModalDone}
                    style={{ marginTop: "20px" }}
                  >
                    Got it, Save Now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
