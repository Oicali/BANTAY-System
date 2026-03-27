import React, { useState, useRef, useEffect } from "react";
import "./AddUserModal.css";
import LoadingModal from "../modals/LoadingModal";
import {
  CURRENT_BARANGAYS,
  LEGACY_BARANGAY_OPTIONS,
} from "../../utils/barangayOptions";

const PSGC_BASE = "https://psgc.gitlab.io/api";
const API_URL = import.meta.env.VITE_API_URL; // ← add here

// ✅ FIXED: Bacoor is a CITY with code "042103000"
// "042105" was City of Cavite — wrong code entirely
const BACOOR_CITY_CODE = "042103000";

const AddUserModal = ({ isOpen, onClose, onUserAdded }) => {
  const [step, setStep] = useState("select"); // 'select', 'pnp', 'barangay'
  const [shouldScrollToError, setShouldScrollToError] = useState(false);

  const [formData, setFormData] = useState({
    // Personal fields
    first_name: "",
    last_name: "",
    middle_name: "",
    suffix: "",
    date_of_birth: "",
    gender: "Male",
    // Contact fields
    email: "",
    phone: "",
    alternate_phone: "",
    // Address fields (PSGC)
    region_code: "",
    province_code: "",
    municipality_code: "",
    barangay_code: "",
    address_line: "",
    // Role
    role: "Patrol",
    // PNP specific fields
    rank: "",
    mobile_patrol: "",
    department: "",
    // Profile picture
    profilePicture: null,
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);

  // PSGC dropdown data
  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  // PSGC loading states
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const modalContentRef = useRef(null);
  const errorRefs = useRef({});

  // =====================================================
  // ON OPEN: fetch regions for PNP, fetch Bacoor barangays for Barangay users
  // =====================================================
  useEffect(() => {
    if (isOpen && step === "pnp") {
      fetchRegions();
    }
    if (isOpen && step === "barangay") {
      // ✅ FIXED: use /cities/ endpoint for Bacoor (it's a city, not a municipality)
      fetchBacoorBarangays();
      setFormData((prev) => ({
        ...prev,
        region_code: "040000000", // CALABARZON
        province_code: "042100000", // Cavite
        municipality_code: BACOOR_CITY_CODE,
      }));
    }
  }, [isOpen, step]);

  // =====================================================
  // PSGC API FETCHERS
  // =====================================================
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
      setBarangays([]);
      const res = await fetch(`${PSGC_BASE}/regions/${regionCode}/provinces/`);
      const data = await res.json();
      setProvinces(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch provinces:", err);
      setProvinces([]);
    } finally {
      setLoadingProvinces(false);
    }
  };

  const fetchMunicipalities = async (provinceCode) => {
    try {
      setLoadingMunicipalities(true);
      setMunicipalities([]);
      setBarangays([]);
      const res = await fetch(
        `${PSGC_BASE}/provinces/${provinceCode}/cities-municipalities/`,
      );
      const data = await res.json();
      setMunicipalities(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch municipalities:", err);
      setMunicipalities([]);
    } finally {
      setLoadingMunicipalities(false);
    }
  };

  // Generic barangay fetcher for PNP address (municipality or city)
  const fetchBarangays = async (municipalityCode) => {
    try {
      setLoadingBarangays(true);
      setBarangays([]);
      const res = await fetch(
        `${PSGC_BASE}/cities-municipalities/${municipalityCode}/barangays/`,
      );
      const data = await res.json();
      setBarangays(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch barangays:", err);
      setBarangays([]);
    } finally {
      setLoadingBarangays(false);
    }
  };

  // ✅ FIXED: Bacoor is a CITY — must use /cities/{code}/barangays/ endpoint
  const fetchBacoorBarangays = async () => {
    try {
      setLoadingBarangays(true);
      setBarangays([]);
      const res = await fetch(
        `${PSGC_BASE}/cities/${BACOOR_CITY_CODE}/barangays/`,
      );
      if (!res.ok) {
        throw new Error(`PSGC API returned ${res.status}`);
      }
      const data = await res.json();
      // Sort alphabetically by name
      setBarangays(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Failed to fetch Bacoor barangays:", err);
      setBarangays([]);
    } finally {
      setLoadingBarangays(false);
    }
  };

  // =====================================================
  // VALIDATION FUNCTIONS
  // =====================================================
  const validateName = (name, fieldName, maxLength = 50, required = true) => {
    const trimmed = name?.trim() || "";
    if (required && !trimmed) return `${fieldName} is required`;
    if (!trimmed && !required) return null;
    if (trimmed.length > maxLength)
      return `${fieldName} must not exceed ${maxLength} characters`;
    if (!/^[a-zA-Z\s'\-.]+$/.test(trimmed))
      return `${fieldName} can only contain letters, spaces, hyphens, apostrophes, and periods`;
    if (/\d/.test(trimmed)) return `${fieldName} cannot contain numbers`;
    return null;
  };

  const validateSuffix = (suffix) => {
    if (!suffix || suffix.trim() === "") return null;
    const trimmed = suffix.trim().toLowerCase();
    if (trimmed.length > 5) return "Suffix must not exceed 5 characters";
    if (trimmed === "sr." || trimmed === "jr." || /^[ivxlcdm]+$/.test(trimmed))
      return null;
    return "Suffix must be Sr., Jr., or a Roman Numeral (e.g., III)";
  };

  const validateEmail = (email) => {
    const trimmed = email?.trim() || "";
    if (!trimmed) return "Email is required";
    if (trimmed.length > 100) return "Email must not exceed 100 characters";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
      return "Invalid email format";
    return null;
  };

  const validatePhone = (phone, fieldName = "Phone number") => {
    const trimmed = phone?.trim() || "";
    if (!trimmed) return `${fieldName} is required`;
    const cleanPhone = trimmed.replace(/\D/g, "");
    if (cleanPhone.length !== 10)
      return `${fieldName} must be exactly 10 digits`;
    if (!cleanPhone.startsWith("9")) return `${fieldName} must start with 9`;
    return null;
  };

  const validateDateOfBirth = (dob) => {
    if (!dob) return "Date of birth is required";
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    )
      age--;
    if (age < 18) return "User must be at least 18 years old";
    if (age > 100) return "User must be 100 years old or younger";
    return null;
  };

  const validateProfilePicture = (file) => {
    if (!file) return null;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type))
      return "Profile picture must be a JPEG or PNG image";
    if (file.size > 5 * 1024 * 1024)
      return "Profile picture must be less than 5MB";
    return null;
  };

  const validateCommonFields = () => {
    const newErrors = {};

    const emailError = validateEmail(formData.email);
    if (emailError) newErrors.email = emailError;

    const firstNameError = validateName(formData.first_name, "First name");
    if (firstNameError) newErrors.first_name = firstNameError;

    const lastNameError = validateName(formData.last_name, "Last name");
    if (lastNameError) newErrors.last_name = lastNameError;

    if (formData.middle_name) {
      const middleNameError = validateName(
        formData.middle_name,
        "Middle name",
        50,
        false,
      );
      if (middleNameError) newErrors.middle_name = middleNameError;
    }

    const suffixError = validateSuffix(formData.suffix);
    if (suffixError) newErrors.suffix = suffixError;

    const dobError = validateDateOfBirth(formData.date_of_birth);
    if (dobError) newErrors.date_of_birth = dobError;

    const phoneError = validatePhone(formData.phone, "Phone number");
    if (phoneError) newErrors.phone = phoneError;

    if (formData.alternate_phone && formData.alternate_phone.trim()) {
      const altPhoneError = validatePhone(
        formData.alternate_phone,
        "Alternate phone number",
      );
      if (altPhoneError) {
        newErrors.alternate_phone = altPhoneError;
      } else if (
        formData.phone.replace(/\D/g, "") ===
        formData.alternate_phone.replace(/\D/g, "")
      ) {
        newErrors.alternate_phone =
          "Alternate phone cannot be the same as primary phone";
      }
    }

    // Address (PSGC) validation
    if (!formData.region_code) newErrors.region_code = "Region is required";
    if (!formData.province_code)
      newErrors.province_code = "Province is required";
    if (!formData.municipality_code)
      newErrors.municipality_code = "City/Municipality is required";
    if (!formData.barangay_code)
      newErrors.barangay_code = "Barangay is required";

    const pictureError = validateProfilePicture(formData.profilePicture);
    if (pictureError) newErrors.profilePicture = pictureError;

    return newErrors;
  };

  const validatePNPForm = () => {
    const newErrors = validateCommonFields();
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateBarangayForm = () => {
    const newErrors = validateCommonFields();
    // Region, province, municipality are pre-set for Bacoor — skip those validations
    delete newErrors.region_code;
    delete newErrors.province_code;
    delete newErrors.municipality_code;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // =====================================================
  // SCROLL TO FIRST ERROR
  // =====================================================
  useEffect(() => {
    if (shouldScrollToError && Object.keys(errors).length > 0) {
      const fieldOrder = [
        "profilePicture",
        "first_name",
        "middle_name",
        "last_name",
        "suffix",
        "date_of_birth",
        "email",
        "phone",
        "alternate_phone",
        "region_code",
        "province_code",
        "municipality_code",
        "barangay_code",
        "address_line",
      ];

      const firstErrorField = fieldOrder.find((field) => errors[field]);

      if (firstErrorField && errorRefs.current[firstErrorField]) {
        const errorElement = errorRefs.current[firstErrorField];
        setTimeout(() => {
          if (modalContentRef.current && errorElement) {
            const container = modalContentRef.current;
            errorElement.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            });
            setTimeout(() => {
              const currentScroll = container.scrollTop;
              container.scrollTo({
                top: currentScroll - 100,
                behavior: "smooth",
              });
              const inputElement = errorElement.querySelector(
                "input, select, textarea",
              );
              if (inputElement) inputElement.focus();
            }, 300);
          }
        }, 100);
      }

      setShouldScrollToError(false);
    }
  }, [shouldScrollToError, errors, step]);

  // =====================================================
  // HANDLERS
  // =====================================================
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (["first_name", "last_name", "middle_name"].includes(name)) {
      const sanitized = value.replace(/[^a-zA-Z\s'\-.]/g, "").slice(0, 50);
      setFormData((prev) => ({ ...prev, [name]: sanitized }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
      return;
    }

    if (name === "suffix") {
      const trimmed = value.trim();
      let processed = value;
      if (trimmed.toLowerCase() === "sr.") processed = "Sr.";
      else if (trimmed.toLowerCase() === "jr.") processed = "Jr.";
      else if (/^[ivxlcdm]+$/i.test(trimmed)) processed = trimmed.toUpperCase();
      else processed = value.replace(/[^ivxlcdmjrsr.\s]/gi, "");
      setFormData((prev) => ({ ...prev, [name]: processed.slice(0, 5) }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
      return;
    }

    if (name === "email") {
      setFormData((prev) => ({ ...prev, [name]: value.slice(0, 100) }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
      return;
    }

    if (name === "phone" || name === "alternate_phone") {
      const numbersOnly = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({ ...prev, [name]: numbersOnly }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
      return;
    }

    if (name === "mobile_patrol") {
      const numbersOnly = value.replace(/\D/g, "").slice(0, 6);
      setFormData((prev) => ({ ...prev, [name]: numbersOnly }));
      return;
    }

    if (name === "address_line") {
      setFormData((prev) => ({ ...prev, [name]: value.slice(0, 255) }));
      return;
    }

    // PSGC cascading selects
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
      setBarangays([]);
      if (value) fetchProvinces(value);
      if (errors.region_code)
        setErrors((prev) => ({ ...prev, region_code: "" }));
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
      setBarangays([]);
      if (value) fetchMunicipalities(value);
      if (errors.province_code)
        setErrors((prev) => ({ ...prev, province_code: "" }));
      return;
    }

    if (name === "municipality_code") {
      setFormData((prev) => ({
        ...prev,
        municipality_code: value,
        barangay_code: "",
      }));
      setBarangays([]);
      if (value) fetchBarangays(value);
      if (errors.municipality_code)
        setErrors((prev) => ({ ...prev, municipality_code: "" }));
      return;
    }

    if (name === "barangay_code") {
      setFormData((prev) => ({ ...prev, barangay_code: value }));
      if (errors.barangay_code)
        setErrors((prev) => ({ ...prev, barangay_code: "" }));
      return;
    }

    // Role change: clear mobile_patrol if switching away from Patrol
    if (name === "role") {
      setFormData((prev) => ({
        ...prev,
        role: value,
        mobile_patrol: value !== "Patrol" ? "" : prev.mobile_patrol,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleProfilePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData((prev) => ({ ...prev, profilePicture: file }));
      const reader = new FileReader();
      reader.onloadend = () => setProfilePicturePreview(reader.result);
      reader.readAsDataURL(file);
      if (errors.profilePicture)
        setErrors((prev) => ({ ...prev, profilePicture: "" }));
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      middle_name: "",
      suffix: "",
      date_of_birth: "",
      gender: "Male",
      email: "",
      phone: "",
      alternate_phone: "",
      region_code: "",
      province_code: "",
      municipality_code: "",
      barangay_code: "",
      address_line: "",
      role: "Patrol",
      rank: "",
      mobile_patrol: "",
      department: "",
      profilePicture: null,
    });
    setProvinces([]);
    setMunicipalities([]);
    setBarangays([]);
    setErrors({});
    setProfilePicturePreview(null);
    setShouldScrollToError(false);
  };

  const handleClose = () => {
    setStep("select");
    resetForm();
    onClose();
  };

  const handleUserTypeSelect = (type) => {
    if (type === "pnp") {
      setStep("pnp");
      setFormData((prev) => ({ ...prev, role: "Patrol" }));
    } else {
      setStep("barangay");
      setFormData((prev) => ({ ...prev, role: "Barangay" }));
    }
  };

  const handleBack = () => {
    setStep("select");
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isValid = step === "pnp" ? validatePNPForm() : validateBarangayForm();
    if (!isValid) {
      setShouldScrollToError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const submitData = new FormData();

      let formattedSuffix = formData.suffix.trim();
      if (formattedSuffix) {
        const lower = formattedSuffix.toLowerCase();
        if (lower === "sr.") formattedSuffix = "Sr.";
        else if (lower === "jr.") formattedSuffix = "Jr.";
        else if (/^[ivxlcdm]+$/i.test(formattedSuffix))
          formattedSuffix = formattedSuffix.toUpperCase();
      }

      // Required common fields
      submitData.append("userType", step === "pnp" ? "police" : "barangay");
      submitData.append("email", formData.email.trim());
      submitData.append("firstName", formData.first_name.trim());
      submitData.append("lastName", formData.last_name.trim());
      submitData.append("role", formData.role);
      submitData.append(
        "phone",
        `+63${formData.phone.trim().replace(/\D/g, "")}`,
      );
      submitData.append("gender", formData.gender);
      submitData.append("dateOfBirth", formData.date_of_birth);

      // Address (PSGC codes)
      submitData.append("regionCode", formData.region_code);
      submitData.append("provinceCode", formData.province_code);
      submitData.append("municipalityCode", formData.municipality_code);
      submitData.append("barangay", formData.barangay_code);
      if (formData.address_line.trim())
        submitData.append("addressLine", formData.address_line.trim());

      // Optional common fields
      if (formData.middle_name.trim())
        submitData.append("middleName", formData.middle_name.trim());
      if (formattedSuffix) submitData.append("suffix", formattedSuffix);
      if (formData.alternate_phone.trim()) {
        submitData.append(
          "alternatePhone",
          `+63${formData.alternate_phone.trim().replace(/\D/g, "")}`,
        );
      }

      // PNP-specific fields
      if (step === "pnp") {
        if (formData.rank.trim())
          submitData.append("rank", formData.rank.trim());
        if (formData.mobile_patrol)
          submitData.append("mobilePatrol", formData.mobile_patrol);
        if (formData.department.trim())
          submitData.append("department", formData.department.trim());
      }

      const response = await fetch(`${API_URL}/user-management/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: submitData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Upload profile picture to Cloudinary if one was selected
        if (formData.profilePicture && data.user?.userId) {
          try {
            const picFd = new FormData();
            picFd.append("profilePicture", formData.profilePicture);
            await fetch(
              `${API_URL}/users/profile/picture/${data.user.userId}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: picFd,
              },
            );
          } catch (picErr) {
            console.error("Profile picture upload failed:", picErr);
            // Non-fatal — user was created, photo just didn't upload
          }
        }

        const userType = step === "pnp" ? "PNP" : "Barangay";
        const emailStatus = data.user?.verificationEmailSent
          ? `A verification email has been sent.`
          : "User created but the verification email could not be delivered. Contact the user directly.";
        onUserAdded(`${userType} user added successfully! ${emailStatus}`);
        handleClose();
      } else {
        const newErrors = {};
        if (data.errors?.email || data.message?.includes("Email")) {
          newErrors.email = data.errors?.email || "Email already registered";
        }
        if (data.errors?.phone || data.message?.includes("phone")) {
          newErrors.phone =
            data.errors?.phone || "Phone number already registered";
        }
        if (
          data.errors?.alternatePhone ||
          data.message?.includes("alternate")
        ) {
          newErrors.alternate_phone =
            data.errors?.alternatePhone ||
            "Alternate phone number already registered";
        }

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          setShouldScrollToError(true);
        } else {
          alert(data.message || "Failed to add user");
        }
      }
    } catch (error) {
      console.error("Submit error:", error);
      alert("Failed to connect to server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // =====================================================
  // SHARED RENDERERS
  // =====================================================
  const renderInfoBox = () => (
    <div className="aum-info-box">
      <strong>Auto-Generated Credentials:</strong> Username and password will be
      automatically generated and sent to the user's email address.
    </div>
  );

  const renderProfilePicture = (inputId) => (
    <div
      className="aum-form-section"
      ref={(el) => (errorRefs.current["profilePicture"] = el)}
    >
      <h3 className="aum-form-section-title">Profile Picture</h3>
      <div className="aum-profile-picture-upload">
        <div className="aum-profile-picture-preview">
          {profilePicturePreview ? (
            <img src={profilePicturePreview} alt="Profile preview" />
          ) : (
            <div className="aum-profile-picture-placeholder">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="36"
                height="36"
                fill="none"
                stroke="#adb5bd"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <p>No image selected</p>
            </div>
          )}
        </div>
        <div className="aum-profile-picture-actions">
          <input
            type="file"
            id={inputId}
            accept="image/jpeg,image/jpg,image/png"
            onChange={handleProfilePictureChange}
            style={{ display: "none" }}
          />
          <label
            htmlFor={inputId}
            className="aum-btn aum-btn-secondary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#6c757d",
            }}
          >
            <img
              src="/images/upload.png"
              alt="Upload"
              style={{
                width: "18px",
                height: "18px",
                filter: "brightness(0) saturate(0) opacity(0.5)",
              }}
            />
            Choose Picture
          </label>
          <p className="aum-upload-hint">JPEG or PNG, max 5MB</p>
        </div>
      </div>
      {errors.profilePicture && (
        <span className="aum-error-text">{errors.profilePicture}</span>
      )}
    </div>
  );

  const renderPersonalInfo = () => (
    <div className="aum-form-section">
      <h3 className="aum-form-section-title">Personal Information</h3>
      <div className="aum-form-row-triple">
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["first_name"] = el)}
        >
          <label className="aum-form-label">First Name *</label>
          <input
            type="text"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            className={`aum-form-input ${errors.first_name ? "aum-error" : ""}`}
            placeholder="Enter first name"
            maxLength="50"
          />
          {errors.first_name && (
            <span className="aum-error-text">{errors.first_name}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["middle_name"] = el)}
        >
          <label className="aum-form-label">Middle Name</label>
          <input
            type="text"
            name="middle_name"
            value={formData.middle_name}
            onChange={handleChange}
            className={`aum-form-input ${errors.middle_name ? "aum-error" : ""}`}
            placeholder="Enter middle name (optional)"
            maxLength="50"
          />
          {errors.middle_name && (
            <span className="aum-error-text">{errors.middle_name}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["last_name"] = el)}
        >
          <label className="aum-form-label">Last Name *</label>
          <input
            type="text"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            className={`aum-form-input ${errors.last_name ? "aum-error" : ""}`}
            placeholder="Enter last name"
            maxLength="50"
          />
          {errors.last_name && (
            <span className="aum-error-text">{errors.last_name}</span>
          )}
        </div>
      </div>
      <div className="aum-form-row-triple">
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["suffix"] = el)}
        >
          <label className="aum-form-label">Suffix</label>
          <input
            type="text"
            name="suffix"
            value={formData.suffix}
            onChange={handleChange}
            className={`aum-form-input ${errors.suffix ? "aum-error" : ""}`}
            placeholder="Jr., Sr., III (optional)"
            maxLength="5"
          />
          {errors.suffix && (
            <span className="aum-error-text">{errors.suffix}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["date_of_birth"] = el)}
        >
          <label className="aum-form-label">Date of Birth *</label>
          <input
            type="date"
            name="date_of_birth"
            value={formData.date_of_birth}
            onChange={handleChange}
            className={`aum-form-input ${errors.date_of_birth ? "aum-error" : ""}`}
            min={(() => {
              const d = new Date();
              return new Date(d.getFullYear() - 100, d.getMonth(), d.getDate())
                .toISOString()
                .split("T")[0];
            })()}
            max={(() => {
              const d = new Date();
              return new Date(d.getFullYear() - 18, d.getMonth(), d.getDate())
                .toISOString()
                .split("T")[0];
            })()}
          />
          {errors.date_of_birth && (
            <span className="aum-error-text">{errors.date_of_birth}</span>
          )}
        </div>
        <div className="aum-form-group">
          <label className="aum-form-label">Gender *</label>
          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            className="aum-form-input"
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderContactInfo = () => (
    <div className="aum-form-section">
      <h3 className="aum-form-section-title">Contact Information</h3>
      <div className="aum-form-row-triple">
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["email"] = el)}
        >
          <label className="aum-form-label">Email Address *</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={`aum-form-input ${errors.email ? "aum-error" : ""}`}
            placeholder="user@example.com"
            maxLength="100"
          />
          {errors.email && (
            <span className="aum-error-text">{errors.email}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["phone"] = el)}
        >
          <label className="aum-form-label">Mobile Number *</label>
          <div
            className={`aum-phone-input-wrapper ${errors.phone ? "aum-phone-error" : ""}`}
          >
            <span className="aum-phone-prefix">+63</span>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`aum-form-input aum-phone-input ${errors.phone ? "aum-error" : ""}`}
              placeholder="9XXXXXXXXX"
              maxLength="10"
            />
          </div>
          {errors.phone && (
            <span className="aum-error-text">{errors.phone}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["alternate_phone"] = el)}
        >
          <label className="aum-form-label">Alternate Phone</label>
          <div
            className={`aum-phone-input-wrapper ${errors.alternate_phone ? "aum-phone-error" : ""}`}
          >
            <span className="aum-phone-prefix">+63</span>
            <input
              type="tel"
              name="alternate_phone"
              value={formData.alternate_phone}
              onChange={handleChange}
              className={`aum-form-input aum-phone-input ${errors.alternate_phone ? "aum-error" : ""}`}
              placeholder="9XXXXXXXXX (optional)"
              maxLength="10"
            />
          </div>
          {errors.alternate_phone && (
            <span className="aum-error-text">{errors.alternate_phone}</span>
          )}
        </div>
      </div>
    </div>
  );

  // Full address renderer for PNP (region → province → municipality → barangay)
  const renderAddressInfo = () => (
    <div className="aum-form-section">
      <h3 className="aum-form-section-title">Address</h3>
      <div className="aum-form-row-quad">
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["region_code"] = el)}
        >
          <label className="aum-form-label">Region *</label>
          <select
            name="region_code"
            value={formData.region_code}
            onChange={handleChange}
            className={`aum-form-input ${errors.region_code ? "aum-error" : ""}`}
            disabled={loadingRegions}
          >
            <option value="">
              {loadingRegions ? "Loading..." : "Select Region"}
            </option>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          {errors.region_code && (
            <span className="aum-error-text">{errors.region_code}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["province_code"] = el)}
        >
          <label className="aum-form-label">Province *</label>
          <select
            name="province_code"
            value={formData.province_code}
            onChange={handleChange}
            className={`aum-form-input ${errors.province_code ? "aum-error" : ""}`}
            disabled={!formData.region_code || loadingProvinces}
          >
            <option value="">
              {loadingProvinces ? "Loading..." : "Select Province"}
            </option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.province_code && (
            <span className="aum-error-text">{errors.province_code}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["municipality_code"] = el)}
        >
          <label className="aum-form-label">City / Municipality *</label>
          <select
            name="municipality_code"
            value={formData.municipality_code}
            onChange={handleChange}
            className={`aum-form-input ${errors.municipality_code ? "aum-error" : ""}`}
            disabled={!formData.province_code || loadingMunicipalities}
          >
            <option value="">
              {loadingMunicipalities
                ? "Loading..."
                : "Select City/Municipality"}
            </option>
            {municipalities.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
          {errors.municipality_code && (
            <span className="aum-error-text">{errors.municipality_code}</span>
          )}
        </div>
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["barangay_code"] = el)}
        >
          <label className="aum-form-label">Barangay *</label>
          <select
            name="barangay_code"
            value={formData.barangay_code}
            onChange={handleChange}
            className={`aum-form-input ${errors.barangay_code ? "aum-error" : ""}`}
            disabled={!formData.municipality_code || loadingBarangays}
          >
            <option value="">
              {loadingBarangays ? "Loading..." : "Select Barangay"}
            </option>
            {barangays.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          {errors.barangay_code && (
            <span className="aum-error-text">{errors.barangay_code}</span>
          )}
        </div>
      </div>
      <div className="aum-form-row">
        <div
          className="aum-form-group aum-full-width"
          ref={(el) => (errorRefs.current["address_line"] = el)}
        >
          <label className="aum-form-label">
            House No. / Blk / Lot / Street / Subdivision
          </label>
          <input
            type="text"
            name="address_line"
            value={formData.address_line}
            onChange={handleChange}
            className="aum-form-input"
            placeholder="e.g., Blk 4 Lot 12, Sunshine Subd., 123 Rizal St. (optional)"
            maxLength="255"
          />
          <span style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
            {formData.address_line.length}/255 characters
          </span>
        </div>
      </div>
    </div>
  );

  // Simplified address renderer for Barangay users
  // ✅ FIXED: barangays now loaded from correct Bacoor city endpoint, sorted A-Z
  const renderBarangayAddressInfo = () => (
    <div className="aum-form-section">
      <h3 className="aum-form-section-title">Address</h3>
      <div className="aum-form-row">
        <div
          className="aum-form-group"
          ref={(el) => (errorRefs.current["barangay_code"] = el)}
        >
          <label className="aum-form-label">Barangay *</label>
          <select
            name="barangay_code"
            value={formData.barangay_code}
            onChange={handleChange}
            className={`aum-form-input ${errors.barangay_code ? "aum-error" : ""}`}
            disabled={loadingBarangays}
          >
            <option value="">
              {loadingBarangays ? "Loading barangays..." : "Select Barangay"}
            </option>
            {/* ✅ Already sorted A-Z by fetchBacoorBarangays */}
            {CURRENT_BARANGAYS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            <optgroup label="── Pre-2023 Names (Auto-resolved) ──">
              {LEGACY_BARANGAY_OPTIONS.map((b, i) => (
                <option key={i} value={b.value}>
                  {b.label}
                </option>
              ))}
            </optgroup>
          </select>
          {errors.barangay_code && (
            <span className="aum-error-text">{errors.barangay_code}</span>
          )}
        </div>
      </div>
      <div className="aum-form-row">
        <div
          className="aum-form-group aum-full-width"
          ref={(el) => (errorRefs.current["address_line"] = el)}
        >
          <label className="aum-form-label">
            House No. / Blk / Lot / Street / Subdivision
          </label>
          <input
            type="text"
            name="address_line"
            value={formData.address_line}
            onChange={handleChange}
            className="aum-form-input"
            placeholder="e.g., Blk 4 Lot 12, Sunshine Subd., 123 Rizal St. (optional)"
            maxLength="255"
          />
          <span style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
            {formData.address_line.length}/255 characters
          </span>
        </div>
      </div>
      <div
        className="aum-info-box aum-info-box-note"
        style={{ marginTop: "12px" }}
      >
        <strong>Note:</strong> The barangay assignment is automatically taken
        from the Barangay selected above. Each barangay can only have one
        designated account.
      </div>
    </div>
  );

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <>
      <LoadingModal isOpen={isSubmitting} message="Adding user..." />
      <div className="aum-modal-overlay">
        <div
          className={`aum-modal-container ${step === "select" ? "aum-modal-select" : "aum-modal-large"}`}
          ref={modalContentRef}
        >
          {/* USER TYPE SELECTION */}
          {step === "select" && (
            <div className="aum-user-type-selection">
              <h2 className="aum-selection-title">Select User Type</h2>
              <p className="aum-selection-subtitle">
                Choose the type of user you want to add
              </p>
              <div className="aum-user-type-cards">
                <div
                  className="aum-user-type-card"
                  onClick={() => handleUserTypeSelect("pnp")}
                >
                  <div className="aum-user-type-icon">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="48"
                      height="48"
                      fill="none"
                      stroke="var(--navy-primary)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <h4>PNP User</h4>
                  <p>Add a police officer to the system</p>
                </div>
                <div
                  className="aum-user-type-card"
                  onClick={() => handleUserTypeSelect("barangay")}
                >
                  <div className="aum-user-type-icon">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="48"
                      height="48"
                      fill="none"
                      stroke="var(--navy-primary)"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <h4>Barangay User</h4>
                  <p>Add a barangay official to the system</p>
                </div>
              </div>
              <div className="aum-modal-actions">
                <button
                  className="aum-btn aum-btn-secondary"
                  onClick={handleClose}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* PNP USER FORM */}
          {step === "pnp" && (
            <>
              <div className="aum-modal-header">
                <div className="aum-header-with-back">
                  <button
                    type="button"
                    className="aum-back-button"
                    onClick={handleBack}
                  >
                    ← Back
                  </button>
                  <h2>Add PNP User</h2>
                  <button
                    type="button"
                    className="aum-modal-close"
                    onClick={handleClose}
                  >
                    ×
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="aum-modal-form">
                {renderInfoBox()}
                {renderProfilePicture("profilePicturePnp")}
                {renderPersonalInfo()}
                {renderContactInfo()}
                {renderAddressInfo()}

                {/* PNP Official Information */}
                <div className="aum-form-section">
                  <h3 className="aum-form-section-title">
                    Official Information
                  </h3>
                  <div className="aum-form-row">
                    <div className="aum-form-group">
                      <label className="aum-form-label">Role *</label>
                      <select
                        name="role"
                        value={formData.role}
                        onChange={handleChange}
                        className="aum-form-input"
                      >
                        <option value="Administrator">Administrator</option>
                        <option value="Investigator">Investigator</option>
                        <option value="Patrol">Patrol</option>
                      </select>
                    </div>
                  </div>
                  <div className="aum-form-row-triple">
                    <div className="aum-form-group">
                      <label className="aum-form-label">Rank</label>
                      <input
                        type="text"
                        name="rank"
                        value={formData.rank}
                        onChange={handleChange}
                        className="aum-form-input"
                        placeholder="e.g., Police Officer III"
                        maxLength="100"
                      />
                    </div>
                    <div className="aum-form-group">
                      <label className="aum-form-label">
                        Mobile Patrol No.
                        {formData.role !== "Patrol" && (
                          <span className="aum-field-note">
                            {" "}
                            (Patrol role only)
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        name="mobile_patrol"
                        value={formData.mobile_patrol}
                        onChange={handleChange}
                        className="aum-form-input"
                        placeholder="e.g., 101"
                        maxLength="6"
                        disabled={formData.role !== "Patrol"}
                      />
                    </div>
                    <div className="aum-form-group">
                      <label className="aum-form-label">Department</label>
                      <input
                        type="text"
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        className="aum-form-input"
                        placeholder="e.g., Investigation Division"
                        maxLength="100"
                      />
                    </div>
                  </div>
                </div>

                <div className="aum-modal-actions">
                  <button
                    type="submit"
                    className="aum-btn aum-btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Adding User..." : "Add PNP User"}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* BARANGAY USER FORM */}
          {step === "barangay" && (
            <>
              <div className="aum-modal-header">
                <div className="aum-header-with-back">
                  <button
                    type="button"
                    className="aum-back-button"
                    onClick={handleBack}
                  >
                    ← Back
                  </button>
                  <h2>Add Barangay User</h2>
                  <button
                    type="button"
                    className="aum-modal-close"
                    onClick={handleClose}
                  >
                    ×
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="aum-modal-form">
                {renderInfoBox()}
                {renderProfilePicture("profilePictureBarangay")}
                {renderPersonalInfo()}
                {renderContactInfo()}
                {renderBarangayAddressInfo()}

                <div className="aum-modal-actions">
                  <button
                    type="submit"
                    className="aum-btn aum-btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Adding User..." : "Add Barangay User"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default AddUserModal;
