import React, { useState, useEffect, useRef, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getUserFromToken } from "../../utils/auth";
import "./EditUserModal.css";

const PSGC_BASE = "https://psgc.gitlab.io/api";
const BACOOR_CITY_CODE = "042103000";

const EditUserModal = ({ isOpen, onClose, user, onUserUpdated }) => {
  const [currentUser, setCurrentUser] = useState(null);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    middle_name: "",
    suffix: "",
    date_of_birth: "",
    gender: "Male",
    phone: "",
    alternate_phone: "",
    region_code: "",
    province_code: "",
    municipality_code: "",
    barangay_code: "",
    address_line: "",
    role: "",
    rank: "",
    mobile_patrol: "",
    department: "",
    assigned_barangay_code: "",
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Password change
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [passwordData, setPasswordData] = useState({
    new_password: "",
    confirm_password: "",
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Profile picture
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  const fileInputRef = useRef(null);

  // Roles
  const [allRoles, setAllRoles] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);

  // PSGC — PNP address cascade
  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [addressBarangays, setAddressBarangays] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);
  const [loadingAddrBarangays, setLoadingAddrBarangays] = useState(false);

  // PSGC — Bacoor barangays for assigned barangay
  const [bacoorBarangays, setBacoorBarangays] = useState([]);
  const [loadingBacoorBarangays, setLoadingBacoorBarangays] = useState(false);

  // Lock/Unlock
  const [isLocking, setIsLocking] = useState(false);

  // Sensitive field change tracking
  const [phoneChanged, setPhoneChanged] = useState(false);
  const [altPhoneChanged, setAltPhoneChanged] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

  // Store originals for masking hints
  const [originalPhone, setOriginalPhone] = useState("");
  const [originalAltPhone, setOriginalAltPhone] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");

  // Scroll-to-error
  const [shouldScrollToError, setShouldScrollToError] = useState(false);
  const modalContentRef = useRef(null);
  const errorRefs = useRef({});

  // Field order for scroll priority
  const FIELD_ORDER = [
    "profilePicture",
    "email",
    "first_name",
    "middle_name",
    "last_name",
    "suffix",
    "date_of_birth",
    "phone",
    "alternate_phone",
    "region_code",
    "province_code",
    "municipality_code",
    "barangay_code",
    "address_line",
    "role",
    "rank",
    "mobile_patrol",
    "department",
    "assigned_barangay_code",
    "new_password",
    "confirm_password",
  ];

  useEffect(() => {
    setCurrentUser(getUserFromToken());
  }, []);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const res = await fetch("http://localhost:5000/user-management/roles", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAllRoles(data.roles || []);
        }
      } catch (err) {
        console.error("Error fetching roles:", err);
      }
    };
    fetchRoles();
  }, []);

  useEffect(() => {
    if (user && allRoles.length > 0) {
      setAvailableRoles(allRoles.filter((r) => r.user_type === user.user_type));
    }
  }, [user, allRoles]);

  useEffect(() => {
    if (!user || !isOpen) return;

    const cleanPhone    = user.phone           ? user.phone.replace(/^\+63/, "")           : "";
    const cleanAltPhone = user.alternate_phone ? user.alternate_phone.replace(/^\+63/, "") : "";

    setOriginalPhone(cleanPhone);
    setOriginalAltPhone(cleanAltPhone);
    setOriginalEmail(user.email || "");

    setFormData({
      username: user.username || "",
      email: "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      middle_name: user.middle_name || "",
      suffix: user.suffix || "",
      date_of_birth: user.date_of_birth ? user.date_of_birth.split("T")[0] : "",
      gender: user.gender || "Male",
      phone: "",
      alternate_phone: "",
      region_code: user.region_code || "",
      province_code: user.province_code || "",
      municipality_code: user.municipality_code || "",
      barangay_code: user.address_barangay_code || "",
      address_line: user.address_line || "",
      role: user.role || "",
      rank: user.rank || "",
      mobile_patrol: user.mobile_patrol != null ? String(user.mobile_patrol) : "",
      department: user.department || "",
      assigned_barangay_code: user.assigned_barangay_code || "",
    });

    setPhoneChanged(false);
    setAltPhoneChanged(false);
    setEmailChanged(false);
    setPasswordData({ new_password: "", confirm_password: "" });
    setErrors({});
    setServerError("");
    setSuccessMessage("");
    setShowPasswordFields(false);
    setShouldScrollToError(false);
    setProfilePicture(null);
    setProfilePicturePreview(user.profile_picture || null);

    if (user.user_type === "police") {
      fetchRegions();
      if (user.region_code)       fetchProvinces(user.region_code);
      if (user.province_code)     fetchMunicipalities(user.province_code);
      if (user.municipality_code) fetchAddressBarangays(user.municipality_code);
    } else if (user.user_type === "barangay") {
      fetchBacoorBarangays();
    }
  }, [user, isOpen]);

  // ── PSGC fetchers ─────────────────────────────────────────────────────
  const fetchRegions = async () => {
    try {
      setLoadingRegions(true);
      const res = await fetch(`${PSGC_BASE}/regions/`);
      const data = await res.json();
      setRegions(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch regions:", err);
      setRegions([]);
    } finally {
      setLoadingRegions(false);
    }
  };

  const fetchProvinces = async (regionCode) => {
    try {
      setLoadingProvinces(true);
      setProvinces([]);
      setMunicipalities([]);
      setAddressBarangays([]);
      const res = await fetch(`${PSGC_BASE}/regions/${regionCode}/provinces/`);
      const data = await res.json();
      setProvinces(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch provinces:", err);
    } finally {
      setLoadingProvinces(false);
    }
  };

  const fetchMunicipalities = async (provinceCode) => {
    try {
      setLoadingMunicipalities(true);
      setMunicipalities([]);
      setAddressBarangays([]);
      const res = await fetch(
        `${PSGC_BASE}/provinces/${provinceCode}/cities-municipalities/`,
      );
      const data = await res.json();
      setMunicipalities(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch municipalities:", err);
    } finally {
      setLoadingMunicipalities(false);
    }
  };

  const fetchAddressBarangays = async (municipalityCode) => {
    try {
      setLoadingAddrBarangays(true);
      setAddressBarangays([]);
      const res = await fetch(
        `${PSGC_BASE}/cities-municipalities/${municipalityCode}/barangays/`,
      );
      const data = await res.json();
      setAddressBarangays(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch address barangays:", err);
    } finally {
      setLoadingAddrBarangays(false);
    }
  };

  const fetchBacoorBarangays = async () => {
    try {
      setLoadingBacoorBarangays(true);
      setBacoorBarangays([]);
      let res = await fetch(
        `${PSGC_BASE}/cities-municipalities/${BACOOR_CITY_CODE}/barangays/`,
      );
      if (!res.ok) {
        res = await fetch(`${PSGC_BASE}/cities/${BACOOR_CITY_CODE}/barangays/`);
      }
      if (!res.ok) throw new Error(`PSGC returned ${res.status}`);
      const data = await res.json();
      setBacoorBarangays(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch Bacoor barangays:", err);
    } finally {
      setLoadingBacoorBarangays(false);
    }
  };

  useEffect(() => {
    if (serverError) {
      const t = setTimeout(() => setServerError(""), 5000);
      return () => clearTimeout(t);
    }
  }, [serverError]);

  // ── Scroll to first error field inside the modal container ─────────────
  useEffect(() => {
    if (!shouldScrollToError) return;
    const errorKeys = Object.keys(errors).filter((k) => errors[k]);
    if (errorKeys.length === 0) {
      setShouldScrollToError(false);
      return;
    }

    const firstField = FIELD_ORDER.find((f) => errors[f]);
    if (firstField && errorRefs.current[firstField]) {
      const container = modalContentRef.current;
      const el        = errorRefs.current[firstField];

      if (container && el) {
        const containerRect = container.getBoundingClientRect();
        const elRect        = el.getBoundingClientRect();
        // Calculate offset relative to the modal's own scroll position
        const scrollTarget  = elRect.top - containerRect.top + container.scrollTop - 80;
        container.scrollTo({ top: scrollTarget, behavior: "smooth" });

        setTimeout(() => {
          const input = el.querySelector("input, select, textarea");
          if (input) input.focus({ preventScroll: true });
        }, 350);
      }
    }
    setShouldScrollToError(false);
  }, [shouldScrollToError, errors]);

  if (!isOpen || !user) return null;

  const isPNP      = user.user_type === "police";
  const isBarangay = user.user_type === "barangay";
  const isLocked   = user.status === "locked";

  // ── Masking helpers ────────────────────────────────────────────────────
  const maskPhone = (phone) => {
    if (!phone) return "";
    const d = phone.replace(/\D/g, "").replace(/^63/, "");
    if (d.length < 3) return "*".repeat(d.length);
    return "*".repeat(d.length - 3) + d.slice(-3);
  };

  const maskEmail = (email) => {
    if (!email) return "";
    const at = email.indexOf("@");
    if (at < 0) return email;
    const local  = email.slice(0, at);
    const domain = email.slice(at);
    if (local.length <= 3) return "*".repeat(local.length) + domain;
    return "*".repeat(local.length - 3) + local.slice(-3) + domain;
  };

  // ── Lock / Unlock ──────────────────────────────────────────────────────
  const handleLockToggle = async () => {
    setIsLocking(true);
    setServerError("");
    try {
      const endpoint = isLocked
        ? `http://localhost:5000/user-management/users/${user.user_id}/unlock`
        : `http://localhost:5000/user-management/users/${user.user_id}/lock`;

      const res  = await fetch(endpoint, {
        method: "PUT",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();

      if (res.ok) {
        onUserUpdated();
        handleClose();
      } else {
        setServerError(data.message || `Failed to ${isLocked ? "unlock" : "lock"} user`);
      }
    } catch (err) {
      console.error("Lock/unlock error:", err);
      setServerError("Server error. Please try again.");
    } finally {
      setIsLocking(false);
    }
  };

  // ── Validation ─────────────────────────────────────────────────────────
  const validateName = (val, label, required = true) => {
    const t = val?.trim() || "";
    if (required && !t) return `${label} is required`;
    if (!t) return null;
    if (t.length > 50) return `${label} must not exceed 50 characters`;
    if (!/^[a-zA-Z\s'\-.]+$/.test(t))
      return `${label} can only contain letters, spaces, hyphens, apostrophes, and periods`;
    return null;
  };

  const validateSuffix = (val) => {
    const t = val?.trim().toLowerCase() || "";
    if (!t) return null;
    if (t.length > 5) return "Suffix must not exceed 5 characters";
    if (t === "sr." || t === "jr." || /^[ivxlcdm]+$/.test(t)) return null;
    return "Suffix must be Sr., Jr., or a Roman Numeral (e.g., III)";
  };

  const validateEmail = (val) => {
    const t = val?.trim() || "";
    if (!t) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "Invalid email format";
    return null;
  };

  const validatePhone = (val, label = "Phone number") => {
    const t = val?.trim().replace(/\D/g, "") || "";
    if (!t) return `${label} is required`;
    if (t.length !== 10) return `${label} must be exactly 10 digits`;
    if (!t.startsWith("9")) return `${label} must start with 9`;
    return null;
  };

  const validatePassword = (pw) => {
    if (!pw) return "Password is required";
    if (pw.length < 8) return "Password must be at least 8 characters";
    if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter";
    if (!/\d/.test(pw))    return "Password must contain at least one number";
    if (!/[@$!%*?&#]/.test(pw))
      return "Password must contain at least one special character (@$!%*?&#)";
    return null;
  };

  const pwChecks = {
    length:    passwordData.new_password.length >= 8,
    lowercase: /[a-z]/.test(passwordData.new_password),
    uppercase: /[A-Z]/.test(passwordData.new_password),
    number:    /\d/.test(passwordData.new_password),
    special:   /[@$!%*?&#]/.test(passwordData.new_password),
  };

  const validateForm = () => {
    const e = {};

    if (emailChanged && formData.email) {
      const emailErr = validateEmail(formData.email);
      if (emailErr) e.email = emailErr;
    }

    const fnErr = validateName(formData.first_name, "First name");
    if (fnErr) e.first_name = fnErr;

    const lnErr = validateName(formData.last_name, "Last name");
    if (lnErr) e.last_name = lnErr;

    if (formData.middle_name) {
      const mnErr = validateName(formData.middle_name, "Middle name", false);
      if (mnErr) e.middle_name = mnErr;
    }

    const sufErr = validateSuffix(formData.suffix);
    if (sufErr) e.suffix = sufErr;

    if (phoneChanged && formData.phone) {
      const phErr = validatePhone(formData.phone, "Phone number");
      if (phErr) e.phone = phErr;
    }

    if (altPhoneChanged && formData.alternate_phone) {
      const altErr = validatePhone(formData.alternate_phone, "Alternate phone number");
      if (altErr) {
        e.alternate_phone = altErr;
      } else {
        const effectivePhone = phoneChanged && formData.phone
          ? formData.phone.replace(/\D/g, "")
          : originalPhone.replace(/\D/g, "");
        if (formData.alternate_phone.replace(/\D/g, "") === effectivePhone) {
          e.alternate_phone = "Alternate phone cannot be the same as primary phone";
        }
      }
    }

    if (isPNP) {
      if (!formData.region_code)       e.region_code       = "Region is required";
      if (!formData.province_code)     e.province_code     = "Province is required";
      if (!formData.municipality_code) e.municipality_code = "City/Municipality is required";
      if (!formData.barangay_code)     e.barangay_code     = "Barangay is required";
    }

    if (isBarangay && !formData.assigned_barangay_code) {
      e.assigned_barangay_code = "Please select an assigned barangay";
    }

    if (showPasswordFields) {
      const pwErr = validatePassword(passwordData.new_password);
      if (pwErr) e.new_password = pwErr;
      if (!passwordData.confirm_password) {
        e.confirm_password = "Please confirm the password";
      } else if (passwordData.new_password !== passwordData.confirm_password) {
        e.confirm_password = "Passwords do not match";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Change handlers ────────────────────────────────────────────────────
  const clearError = (name) => setErrors((prev) => ({ ...prev, [name]: "" }));

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (["first_name", "last_name", "middle_name"].includes(name)) {
      setFormData((prev) => ({
        ...prev,
        [name]: value.replace(/[^a-zA-Z\s'\-.]/g, "").slice(0, 50),
      }));
      clearError(name);
      return;
    }
    if (name === "suffix") {
      const t = value.trim();
      let p = value;
      if (t.toLowerCase() === "sr.")      p = "Sr.";
      else if (t.toLowerCase() === "jr.") p = "Jr.";
      else if (/^[ivxlcdm]+$/i.test(t))  p = t.toUpperCase();
      else p = value.replace(/[^ivxlcdmjrsr.\s]/gi, "");
      setFormData((prev) => ({ ...prev, [name]: p.slice(0, 5) }));
      clearError(name);
      return;
    }
    if (name === "phone") {
      const digits = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({ ...prev, phone: digits }));
      setPhoneChanged(digits.length > 0);
      clearError("phone");
      return;
    }
    if (name === "alternate_phone") {
      const digits = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({ ...prev, alternate_phone: digits }));
      setAltPhoneChanged(digits.length > 0);
      clearError("alternate_phone");
      return;
    }
    if (name === "email") {
      setFormData((prev) => ({ ...prev, email: value }));
      setEmailChanged(value.length > 0);
      clearError("email");
      return;
    }
    if (name === "mobile_patrol") {
      setFormData((prev) => ({
        ...prev,
        [name]: value.replace(/\D/g, "").slice(0, 6),
      }));
      return;
    }
    if (name === "address_line") {
      setFormData((prev) => ({ ...prev, [name]: value.slice(0, 255) }));
      return;
    }
    if (name === "region_code") {
      setFormData((prev) => ({
        ...prev,
        region_code: value,
        province_code: "",
        municipality_code: "",
        barangay_code: "",
      }));
      setProvinces([]);
      setMunicipalities([]);
      setAddressBarangays([]);
      if (value) fetchProvinces(value);
      clearError("region_code");
      return;
    }
    if (name === "province_code") {
      setFormData((prev) => ({
        ...prev,
        province_code: value,
        municipality_code: "",
        barangay_code: "",
      }));
      setMunicipalities([]);
      setAddressBarangays([]);
      if (value) fetchMunicipalities(value);
      clearError("province_code");
      return;
    }
    if (name === "municipality_code") {
      setFormData((prev) => ({
        ...prev,
        municipality_code: value,
        barangay_code: "",
      }));
      setAddressBarangays([]);
      if (value) fetchAddressBarangays(value);
      clearError("municipality_code");
      return;
    }
    if (name === "barangay_code") {
      setFormData((prev) => ({ ...prev, barangay_code: value }));
      clearError("barangay_code");
      return;
    }
    if (name === "role") {
      setFormData((prev) => ({
        ...prev,
        role: value,
        mobile_patrol: value !== "Patrol" ? "" : prev.mobile_patrol,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
    clearError(name);
    setServerError("");
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    clearError(name);
  };

  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setServerError("Please select a valid image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setServerError("File size must be less than 5MB");
      return;
    }
    setProfilePicture(file);
    setProfilePicturePreview(URL.createObjectURL(file));
    setServerError("");
  };

  const handlePasswordPaste = (e) => e.preventDefault();

  const handleClose = () => {
    setErrors({});
    setServerError("");
    setSuccessMessage("");
    setShowPasswordFields(false);
    setPasswordData({ new_password: "", confirm_password: "" });
    setProfilePicture(null);
    setProfilePicturePreview(null);
    setShouldScrollToError(false);
    setPhoneChanged(false);
    setAltPhoneChanged(false);
    setEmailChanged(false);
    onClose();
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    const isValid = validateForm();
    if (!isValid) {
      // Scroll to first error — no banner message
      setShouldScrollToError(true);
      return;
    }

    setIsSubmitting(true);
    setServerError("");

    try {
      // 1. Upload profile picture first if selected
      if (profilePicture) {
        const picFd = new FormData();
        picFd.append("profilePicture", profilePicture);

        const picRes  = await fetch(
          `http://localhost:5000/users/profile/picture/${user.user_id}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
            body: picFd,
          },
        );
        const picData = await picRes.json();

        if (!picRes.ok || !picData.success) {
          setServerError(picData.message || "Failed to upload profile picture");
          setIsSubmitting(false);
          return;
        }
      }

      // 2. Save profile data
      let formattedSuffix = formData.suffix.trim();
      if (formattedSuffix) {
        const low = formattedSuffix.toLowerCase();
        if (low === "sr.")                               formattedSuffix = "Sr.";
        else if (low === "jr.")                          formattedSuffix = "Jr.";
        else if (/^[ivxlcdm]+$/i.test(formattedSuffix)) formattedSuffix = formattedSuffix.toUpperCase();
      }

      const fd = new FormData();

      fd.append(
        "email",
        emailChanged && formData.email
          ? formData.email.trim().toLowerCase()
          : originalEmail.toLowerCase(),
      );

      fd.append("first_name",  formData.first_name.trim());
      fd.append("last_name",   formData.last_name.trim());
      fd.append("middle_name", formData.middle_name?.trim() || "");
      fd.append("suffix",      formattedSuffix || "");
      fd.append("gender",      formData.gender);

      const effectivePhone = phoneChanged && formData.phone
        ? `+63${formData.phone.replace(/\D/g, "")}`
        : originalPhone ? `+63${originalPhone}` : "";
      fd.append("phone", effectivePhone);

      const effectiveAltPhone = altPhoneChanged && formData.alternate_phone
        ? `+63${formData.alternate_phone.replace(/\D/g, "")}`
        : originalAltPhone ? `+63${originalAltPhone}` : "";
      fd.append("alternate_phone", effectiveAltPhone);

      if (formData.date_of_birth) fd.append("date_of_birth", formData.date_of_birth);
      fd.append("role", formData.role);

      if (isPNP) {
        fd.append("region_code",       formData.region_code);
        fd.append("province_code",     formData.province_code);
        fd.append("municipality_code", formData.municipality_code);
        fd.append("barangay_code",     formData.barangay_code);
      } else if (isBarangay) {
        fd.append("region_code",            "040000000");
        fd.append("province_code",          "042100000");
        fd.append("municipality_code",      BACOOR_CITY_CODE);
        fd.append("barangay_code",          formData.assigned_barangay_code);
        fd.append("assigned_barangay_code", formData.assigned_barangay_code);
      }

      fd.append("address_line", formData.address_line?.trim() || "");

      if (isPNP) {
        fd.append("rank",          formData.rank?.trim() || "");
        fd.append("mobile_patrol", formData.mobile_patrol || "");
        fd.append("department",    formData.department?.trim() || "");
      }

      if (showPasswordFields && passwordData.new_password) {
        fd.append("new_password", passwordData.new_password);
      }

      const res  = await fetch(
        `http://localhost:5000/user-management/users/${user.user_id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: fd,
        },
      );
      const data = await res.json();

      if (res.ok) {
        setTimeout(() => {
          setIsSubmitting(false);
          onUserUpdated();
          handleClose();
        }, 1500);
      } else {
        const newErrors = {};
        if (data.errors?.email || data.message?.toLowerCase().includes("email"))
          newErrors.email = data.errors?.email || "This email is already registered to another user";
        if (data.errors?.phone || data.message?.toLowerCase().includes("phone"))
          newErrors.phone = data.errors?.phone || "This phone number is already registered";
        if (data.errors?.alternate_phone || data.message?.toLowerCase().includes("alternate"))
          newErrors.alternate_phone = data.errors?.alternate_phone || "This phone number is already in use";

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          setShouldScrollToError(true);
        }
        // Server errors (duplicate email/phone etc.) still show the banner
        setServerError(data.message || "Failed to update user");
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error("Error updating user:", err);
      setServerError("Server error. Please try again.");
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="eum-modal-overlay">
      <div
        className="eum-modal-container eum-modal-large"
        ref={modalContentRef}
      >
        {/* Header */}
        <div className="eum-modal-header">
          <h2>Edit {isPNP ? "PNP" : "Barangay"} User</h2>
          <button
            className="eum-modal-close"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="eum-modal-form">

          {/* ── Profile Picture ── */}
          <div
            className="eum-form-section"
            ref={(el) => (errorRefs.current["profilePicture"] = el)}
          >
            <h3 className="eum-form-section-title">Profile Picture</h3>
            <div className="eum-profile-picture-upload">
              <div className="eum-profile-picture-preview">
                {profilePicturePreview ? (
                  <img src={profilePicturePreview} alt="Profile preview" />
                ) : (
                  <div className="eum-profile-picture-placeholder">
                    <span>📷</span>
                    <p>No image</p>
                  </div>
                )}
              </div>
              <div className="eum-profile-picture-actions">
                <input
                  type="file"
                  id="editProfilePicture"
                  ref={fileInputRef}
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleProfilePictureChange}
                  disabled={isSubmitting}
                  style={{ display: "none" }}
                />
                <label
                  htmlFor="editProfilePicture"
                  className={`eum-btn eum-btn-secondary${isSubmitting ? " disabled" : ""}`}
                  style={{
                    pointerEvents: isSubmitting ? "none" : "auto",
                    opacity: isSubmitting ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <img
                    src="/images/upload.png"
                    alt="Upload"
                    style={{
                      width: 18,
                      height: 18,
                      filter: "brightness(0) saturate(0) opacity(0.5)",
                    }}
                  />
                  Choose Picture
                </label>
                <p className="eum-upload-hint">JPEG or PNG, max 5MB</p>
              </div>
            </div>
            {errors.profilePicture && (
              <span className="eum-error-text">{errors.profilePicture}</span>
            )}
          </div>

          {/* ── Account Information ── */}
          <div className="eum-form-section">
            <h3 className="eum-form-section-title">Account Information</h3>
            <div className="eum-form-row">
              <div className="eum-form-group">
                <label className="eum-form-label">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  className="eum-form-input"
                  disabled
                  style={{ background: "#f8f9fa", cursor: "not-allowed" }}
                />
              </div>

              {/* Email with masking + hint */}
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["email"] = el)}
              >
                <label className="eum-form-label">Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className={`eum-form-input${errors.email ? " eum-error" : ""}${!emailChanged ? " eum-sensitive-idle" : " eum-sensitive-active"}`}
                  placeholder={maskEmail(originalEmail) || "Enter email address"}
                />
                {!errors.email && (
                  <div className={`eum-keep-hint${emailChanged ? " eum-keep-hint-changed" : ""}`}>
                    <span className="eum-keep-dot" />
                    {emailChanged
                      ? "New email will replace the current one on save"
                      : "Leave blank to keep current email address"}
                  </div>
                )}
                {errors.email && (
                  <span className="eum-error-text">{errors.email}</span>
                )}
              </div>
            </div>

            <div className="eum-password-toggle">
              <button
                type="button"
                className="eum-toggle-password-btn"
                disabled={isSubmitting}
                onClick={() => {
                  setShowPasswordFields(!showPasswordFields);
                  if (showPasswordFields) {
                    setPasswordData({ new_password: "", confirm_password: "" });
                    setErrors((prev) => ({ ...prev, new_password: "", confirm_password: "" }));
                  }
                }}
              >
                {showPasswordFields ? "✕ Cancel Password Change" : "Change Password"}
              </button>
            </div>

            {showPasswordFields && (
              <div className="eum-password-section">
                <div className="eum-form-row">
                  <div
                    className="eum-form-group"
                    ref={(el) => (errorRefs.current["new_password"] = el)}
                  >
                    <label className="eum-form-label">New Password *</label>
                    <div className="eum-password-input-wrapper">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        name="new_password"
                        value={passwordData.new_password}
                        onChange={handlePasswordChange}
                        onPaste={handlePasswordPaste}
                        onCopy={handlePasswordPaste}
                        onCut={handlePasswordPaste}
                        disabled={isSubmitting}
                        className={`eum-form-input ${errors.new_password ? "eum-error" : ""}`}
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        className="eum-password-toggle-icon"
                        disabled={isSubmitting}
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                      </button>
                    </div>
                    {errors.new_password && (
                      <span className="eum-error-text">{errors.new_password}</span>
                    )}
                  </div>
                  <div
                    className="eum-form-group"
                    ref={(el) => (errorRefs.current["confirm_password"] = el)}
                  >
                    <label className="eum-form-label">Confirm Password *</label>
                    <div className="eum-password-input-wrapper">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirm_password"
                        value={passwordData.confirm_password}
                        onChange={handlePasswordChange}
                        onPaste={handlePasswordPaste}
                        onCopy={handlePasswordPaste}
                        onCut={handlePasswordPaste}
                        disabled={isSubmitting}
                        className={`eum-form-input ${errors.confirm_password ? "eum-error" : ""}`}
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        className="eum-password-toggle-icon"
                        disabled={isSubmitting}
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                      </button>
                    </div>
                    {errors.confirm_password && (
                      <span className="eum-error-text">{errors.confirm_password}</span>
                    )}
                  </div>
                </div>
                <div className="eum-password-requirements">
                  <p className="eum-requirements-title">Password Requirements:</p>
                  <ul className="eum-requirements-list">
                    <li className={pwChecks.length    ? "eum-valid" : ""}>At least 8 characters long</li>
                    <li className={pwChecks.uppercase ? "eum-valid" : ""}>Contains uppercase letter (A-Z)</li>
                    <li className={pwChecks.lowercase ? "eum-valid" : ""}>Contains lowercase letter (a-z)</li>
                    <li className={pwChecks.number    ? "eum-valid" : ""}>Contains at least one number (0-9)</li>
                    <li className={pwChecks.special   ? "eum-valid" : ""}>Contains special character (@$!%*?&#)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* ── Personal Information ── */}
          <div className="eum-form-section">
            <h3 className="eum-form-section-title">Personal Information</h3>
            <div className="eum-form-row-triple">
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["first_name"] = el)}
              >
                <label className="eum-form-label">First Name *</label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  maxLength="50"
                  placeholder="Enter first name"
                  className={`eum-form-input ${errors.first_name ? "eum-error" : ""}`}
                />
                {errors.first_name && (
                  <span className="eum-error-text">{errors.first_name}</span>
                )}
              </div>
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["middle_name"] = el)}
              >
                <label className="eum-form-label">Middle Name</label>
                <input
                  type="text"
                  name="middle_name"
                  value={formData.middle_name}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  maxLength="50"
                  placeholder="(optional)"
                  className={`eum-form-input ${errors.middle_name ? "eum-error" : ""}`}
                />
                {errors.middle_name && (
                  <span className="eum-error-text">{errors.middle_name}</span>
                )}
              </div>
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["last_name"] = el)}
              >
                <label className="eum-form-label">Last Name *</label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  maxLength="50"
                  placeholder="Enter last name"
                  className={`eum-form-input ${errors.last_name ? "eum-error" : ""}`}
                />
                {errors.last_name && (
                  <span className="eum-error-text">{errors.last_name}</span>
                )}
              </div>
            </div>
            <div className="eum-form-row-triple">
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["suffix"] = el)}
              >
                <label className="eum-form-label">Suffix</label>
                <input
                  type="text"
                  name="suffix"
                  value={formData.suffix}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  maxLength="5"
                  placeholder="Jr., Sr., III (optional)"
                  className={`eum-form-input ${errors.suffix ? "eum-error" : ""}`}
                />
                {errors.suffix && (
                  <span className="eum-error-text">{errors.suffix}</span>
                )}
              </div>
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["date_of_birth"] = el)}
              >
                <label className="eum-form-label">Date of Birth *</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="eum-form-input"
                  max={(() => {
                    const d = new Date();
                    return new Date(d.getFullYear() - 18, d.getMonth(), d.getDate())
                      .toISOString()
                      .split("T")[0];
                  })()}
                />
              </div>
              <div className="eum-form-group">
                <label className="eum-form-label">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="eum-form-input"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Contact Information ── */}
          <div className="eum-form-section">
            <h3 className="eum-form-section-title">Contact Information</h3>
            <div className="eum-form-row-triple">

              {/* Phone */}
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["phone"] = el)}
              >
                <label className="eum-form-label">Mobile Number *</label>
                <div
                  className={`eum-phone-input-wrapper${errors.phone ? " eum-phone-error" : ""}${!phoneChanged ? " eum-sensitive-idle-phone" : " eum-sensitive-active-phone"}`}
                >
                  <span className="eum-phone-prefix">+63</span>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    maxLength="10"
                    placeholder={maskPhone(originalPhone) || "9XXXXXXXXX"}
                    className="eum-form-input eum-phone-input"
                  />
                </div>
                {!errors.phone && (
                  <div className={`eum-keep-hint${phoneChanged ? " eum-keep-hint-changed" : ""}`}>
                    <span className="eum-keep-dot" />
                    {phoneChanged
                      ? "New number will replace the current one on save"
                      : "Leave blank to keep current phone number"}
                  </div>
                )}
                {errors.phone && (
                  <span className="eum-error-text">{errors.phone}</span>
                )}
              </div>

              {/* Alternate Phone */}
              <div
                className="eum-form-group"
                ref={(el) => (errorRefs.current["alternate_phone"] = el)}
              >
                <label className="eum-form-label">Alternate Phone</label>
                <div
                  className={`eum-phone-input-wrapper${errors.alternate_phone ? " eum-phone-error" : ""}${!altPhoneChanged && originalAltPhone ? " eum-sensitive-idle-phone" : altPhoneChanged ? " eum-sensitive-active-phone" : ""}`}
                >
                  <span className="eum-phone-prefix">+63</span>
                  <input
                    type="tel"
                    name="alternate_phone"
                    value={formData.alternate_phone}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    maxLength="10"
                    placeholder={
                      originalAltPhone ? maskPhone(originalAltPhone) : "9XXXXXXXXX (optional)"
                    }
                    className="eum-form-input eum-phone-input"
                  />
                </div>
                {originalAltPhone && !errors.alternate_phone && (
                  <div className={`eum-keep-hint${altPhoneChanged ? " eum-keep-hint-changed" : ""}`}>
                    <span className="eum-keep-dot" />
                    {altPhoneChanged
                      ? "New number will replace the current one on save"
                      : "Leave blank to keep current alt. phone number"}
                  </div>
                )}
                {errors.alternate_phone && (
                  <span className="eum-error-text">{errors.alternate_phone}</span>
                )}
              </div>

              <div className="eum-form-group">{/* spacer */}</div>
            </div>
          </div>

          {/* ── Address — PNP ── */}
          {isPNP && (
            <div className="eum-form-section">
              <h3 className="eum-form-section-title">Address</h3>
              <div className="eum-form-row-quad">
                <div
                  className="eum-form-group"
                  ref={(el) => (errorRefs.current["region_code"] = el)}
                >
                  <label className="eum-form-label">Region *</label>
                  <select
                    name="region_code"
                    value={formData.region_code}
                    onChange={handleChange}
                    disabled={isSubmitting || loadingRegions}
                    className={`eum-form-input ${errors.region_code ? "eum-error" : ""}`}
                  >
                    <option value="">{loadingRegions ? "Loading..." : "Select Region"}</option>
                    {regions.map((r) => (
                      <option key={r.code} value={r.code}>{r.name}</option>
                    ))}
                  </select>
                  {errors.region_code && (
                    <span className="eum-error-text">{errors.region_code}</span>
                  )}
                </div>
                <div
                  className="eum-form-group"
                  ref={(el) => (errorRefs.current["province_code"] = el)}
                >
                  <label className="eum-form-label">Province *</label>
                  <select
                    name="province_code"
                    value={formData.province_code}
                    onChange={handleChange}
                    disabled={isSubmitting || !formData.region_code || loadingProvinces}
                    className={`eum-form-input ${errors.province_code ? "eum-error" : ""}`}
                  >
                    <option value="">{loadingProvinces ? "Loading..." : "Select Province"}</option>
                    {provinces.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                  {errors.province_code && (
                    <span className="eum-error-text">{errors.province_code}</span>
                  )}
                </div>
                <div
                  className="eum-form-group"
                  ref={(el) => (errorRefs.current["municipality_code"] = el)}
                >
                  <label className="eum-form-label">City / Municipality *</label>
                  <select
                    name="municipality_code"
                    value={formData.municipality_code}
                    onChange={handleChange}
                    disabled={isSubmitting || !formData.province_code || loadingMunicipalities}
                    className={`eum-form-input ${errors.municipality_code ? "eum-error" : ""}`}
                  >
                    <option value="">{loadingMunicipalities ? "Loading..." : "Select City/Municipality"}</option>
                    {municipalities.map((m) => (
                      <option key={m.code} value={m.code}>{m.name}</option>
                    ))}
                  </select>
                  {errors.municipality_code && (
                    <span className="eum-error-text">{errors.municipality_code}</span>
                  )}
                </div>
                <div
                  className="eum-form-group"
                  ref={(el) => (errorRefs.current["barangay_code"] = el)}
                >
                  <label className="eum-form-label">Barangay *</label>
                  <select
                    name="barangay_code"
                    value={formData.barangay_code}
                    onChange={handleChange}
                    disabled={isSubmitting || !formData.municipality_code || loadingAddrBarangays}
                    className={`eum-form-input ${errors.barangay_code ? "eum-error" : ""}`}
                  >
                    <option value="">{loadingAddrBarangays ? "Loading..." : "Select Barangay"}</option>
                    {addressBarangays.map((b) => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                  {errors.barangay_code && (
                    <span className="eum-error-text">{errors.barangay_code}</span>
                  )}
                </div>
              </div>
              <div className="eum-form-row">
                <div
                  className="eum-form-group eum-full-width"
                  ref={(el) => (errorRefs.current["address_line"] = el)}
                >
                  <label className="eum-form-label">
                    House No. / Blk / Lot / Street / Subdivision
                  </label>
                  <input
                    type="text"
                    name="address_line"
                    value={formData.address_line}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    maxLength="255"
                    className="eum-form-input"
                    placeholder="e.g., Blk 4 Lot 12, Sunshine Subd. (optional)"
                  />
                  <span style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {formData.address_line.length}/255 characters
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Official Information — PNP ── */}
          {isPNP && (
            <div className="eum-form-section">
              <h3 className="eum-form-section-title">Official Information (PNP)</h3>
              <div className="eum-form-row">
                <div className="eum-form-group">
                  <label className="eum-form-label">Role *</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="eum-form-input"
                  >
                    {availableRoles.length > 0 ? (
                      availableRoles.map((r) => (
                        <option key={r.role_id} value={r.role_name}>{r.role_name}</option>
                      ))
                    ) : (
                      <>
                        <option value="Administrator">Administrator</option>
                        <option value="Investigator">Investigator</option>
                        <option value="Patrol">Patrol</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="eum-form-group">
                  <label className="eum-form-label">Rank</label>
                  <input
                    type="text"
                    name="rank"
                    value={formData.rank}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    maxLength="100"
                    className="eum-form-input"
                    placeholder="e.g., Police Officer III"
                  />
                </div>
              </div>
              <div className="eum-form-row">
                <div className="eum-form-group">
                  <label className="eum-form-label">
                    Mobile Patrol No.
                    {formData.role !== "Patrol" && (
                      <span style={{ fontSize: 11, fontWeight: 400, color: "#6c757d" }}>
                        {" "}(Patrol role only)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    name="mobile_patrol"
                    value={formData.mobile_patrol}
                    onChange={handleChange}
                    disabled={isSubmitting || formData.role !== "Patrol"}
                    maxLength="6"
                    className="eum-form-input"
                    placeholder="e.g., 101"
                  />
                </div>
                <div className="eum-form-group">
                  <label className="eum-form-label">Department</label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    maxLength="100"
                    className="eum-form-input"
                    placeholder="e.g., Investigation Division"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Official Information — Barangay ── */}
          {isBarangay && (
            <div className="eum-form-section">
              <h3 className="eum-form-section-title">Official Information (Barangay)</h3>
              <div className="eum-form-row">
                <div className="eum-form-group">
                  <label className="eum-form-label">Role</label>
                  <input
                    type="text"
                    value={formData.role || "Barangay"}
                    className="eum-form-input"
                    disabled
                    style={{ background: "#f8f9fa", cursor: "not-allowed" }}
                  />
                </div>
                <div
                  className="eum-form-group"
                  ref={(el) => (errorRefs.current["assigned_barangay_code"] = el)}
                >
                  <label className="eum-form-label">Assigned Barangay *</label>
                  <select
                    name="assigned_barangay_code"
                    value={formData.assigned_barangay_code}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        assigned_barangay_code: e.target.value,
                      }));
                      clearError("assigned_barangay_code");
                    }}
                    disabled={isSubmitting || loadingBacoorBarangays}
                    className={`eum-form-input ${errors.assigned_barangay_code ? "eum-error" : ""}`}
                  >
                    {!formData.assigned_barangay_code && (
                      <option value="">
                        {loadingBacoorBarangays ? "Loading barangays..." : "Select Barangay"}
                      </option>
                    )}
                    {loadingBacoorBarangays && formData.assigned_barangay_code && (
                      <option value={formData.assigned_barangay_code}>
                        Loading barangays...
                      </option>
                    )}
                    {bacoorBarangays.map((b) => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </select>
                  {errors.assigned_barangay_code && (
                    <span className="eum-error-text">{errors.assigned_barangay_code}</span>
                  )}
                </div>
              </div>
              <div className="eum-form-row">
                <div
                  className="eum-form-group eum-full-width"
                  ref={(el) => (errorRefs.current["address_line"] = el)}
                >
                  <label className="eum-form-label">
                    House No. / Blk / Lot / Street / Subdivision
                  </label>
                  <input
                    type="text"
                    name="address_line"
                    value={formData.address_line}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    maxLength="255"
                    className="eum-form-input"
                    placeholder="e.g., Blk 4 Lot 12, Sunshine Subd. (optional)"
                  />
                  <span style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {formData.address_line.length}/255 characters
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Server error banner — only shows for actual server-side errors */}
          {serverError && <div className="eum-alert-error">{serverError}</div>}

          {/* Success banner */}
          {successMessage && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(34,197,94,0.1)",
                borderLeft: "3px solid #22c55e",
                borderRadius: 4,
                color: "#15803d",
                fontSize: 14,
                marginBottom: 24,
                fontWeight: 500,
              }}
            >
              {successMessage}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="eum-modal-actions">
            {(user.status === "active" || user.status === "locked") && (
              <button
                type="button"
                className={`eum-btn ${isLocked ? "eum-btn-unlock" : "eum-btn-lock"}`}
                onClick={handleLockToggle}
                disabled={isSubmitting || isLocking}
                style={{
                  marginRight: "auto",
                  background: isLocked ? "#16a34a" : "#c76b2e",
                  color: "white",
                  border: "none",
                }}
              >
                {isLocking
                  ? isLocked ? "Unlocking..." : "Locking..."
                  : isLocked ? "🔓 Unlock Account" : "🔒 Lock Account"}
              </button>
            )}
            <button
              type="submit"
              className="eum-btn eum-btn-primary"
              disabled={isSubmitting || isLocking}
            >
              {isSubmitting ? "Updating..." : "Update User"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default EditUserModal;