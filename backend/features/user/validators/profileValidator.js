// ================================================================================
// FILE: backend/features/user/validators/profileValidator.js
// ================================================================================
// Profile Validation - Input validation for profile operations
// Ensures data integrity before processing

class ProfileValidator {

  // =====================================================
  // VALIDATE NAME FIELDS
  // =====================================================
  static validateName(name, fieldName, maxLength = 50, required = true) {
    if (!name || name.trim() === "") {
      if (required) {
        return `${fieldName} is required`;
      }
      return null;
    }

    if (name.length > maxLength) {
      return `${fieldName} must not exceed ${maxLength} characters`;
    }

    const namePattern = /^[a-zA-Z\s'\-.]+$/;
    if (!namePattern.test(name.trim())) {
      return `${fieldName} can only contain letters, spaces, hyphens, apostrophes, and periods`;
    }

    return null;
  }

  // =====================================================
  // VALIDATE SUFFIX
  // =====================================================
  static validateSuffix(suffix) {
    if (!suffix || suffix.trim() === "") {
      return null;
    }

    if (suffix.length > 5) {
      return "Suffix must not exceed 5 characters";
    }

    const validSuffixes = /^(Jr\.?|Sr\.?|I{1,3}|IV|V)$/i;
    if (!validSuffixes.test(suffix.trim())) {
      return "Valid suffixes: Jr., Sr., I, II, III, IV, V";
    }

    return null;
  }

  // =====================================================
  // VALIDATE PHONE NUMBER (with +63 prefix)
  // =====================================================
  static validatePhone(phone, fieldName = "Phone number", required = true) {
    if (!phone || phone.trim() === "") {
      if (required) {
        return `${fieldName} is required`;
      }
      return null;
    }

    let cleanPhone = phone.replace(/[^\d+]/g, "");

    if (!cleanPhone.startsWith("+63")) {
      return `${fieldName} must start with +63`;
    }

    const numberPart = cleanPhone.substring(3);

    if (numberPart.length !== 10) {
      return `${fieldName} must have exactly 10 digits after +63`;
    }

    if (!numberPart.startsWith("9")) {
      return `${fieldName} must start with +639`;
    }

    return null;
  }

  // =====================================================
  // VALIDATE GENDER
  // =====================================================
  static validateGender(gender) {
    if (!gender) {
      return "Gender is required";
    }

    if (!["Male", "Female"].includes(gender)) {
      return "Gender must be Male or Female";
    }

    return null;
  }

  // =====================================================
  // VALIDATE ADDRESS LINE (optional free text)
  // =====================================================
  static validateAddressLine(addressLine) {
    if (!addressLine || addressLine.trim() === "") {
      return null; // optional
    }

    if (addressLine.length > 255) {
      return "Address line must not exceed 255 characters";
    }

    return null;
  }

  // =====================================================
  // VALIDATE PSGC CODE (optional structured field)
  // =====================================================
  static validatePsgcCode(code, fieldName) {
    if (!code || code.trim() === "") {
      return null; // optional
    }

    if (!/^\d+$/.test(code.trim())) {
      return `${fieldName} must contain only numbers`;
    }

    if (code.trim().length > 30) {
      return `${fieldName} must not exceed 30 characters`;
    }

    return null;
  }

  // =====================================================
  // VALIDATE PASSWORD
  // =====================================================
  static validatePassword(password) {
    const errors = [];

    if (!password || password.trim() === "") {
      errors.push("Password is required");
      return errors;
    }

    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push("Password must contain at least one number");
    }

    if (!/(?=.*[@$!%*?&#])/.test(password)) {
      errors.push("Password must contain at least one special character (@$!%*?&#)");
    }

    return errors;
  }

  // =====================================================
  // VALIDATE PROFILE UPDATE DATA
  // =====================================================
  static validateProfileUpdate(data) {
    const errors = {};

    // Name fields
    const firstNameError = this.validateName(data.first_name, "First name", 50, true);
    if (firstNameError) errors.first_name = firstNameError;

    const lastNameError = this.validateName(data.last_name, "Last name", 50, true);
    if (lastNameError) errors.last_name = lastNameError;

    if (data.middle_name) {
      const middleNameError = this.validateName(data.middle_name, "Middle name", 50, false);
      if (middleNameError) errors.middle_name = middleNameError;
    }

    if (data.suffix) {
      const suffixError = this.validateSuffix(data.suffix);
      if (suffixError) errors.suffix = suffixError;
    }

    if (data.gender) {
      const genderError = this.validateGender(data.gender);
      if (genderError) errors.gender = genderError;
    }

    // Phone fields (expects +63 prefix)
    const phoneError = this.validatePhone(data.phone, "Phone number", true);
    if (phoneError) errors.phone = phoneError;

    if (data.alternate_phone) {
      const altPhoneError = this.validatePhone(data.alternate_phone, "Alternate phone number", false);
      if (altPhoneError) errors.alternate_phone = altPhoneError;
    }

    if (data.phone && data.alternate_phone && data.phone === data.alternate_phone) {
      errors.alternate_phone = "Alternate phone cannot be the same as primary phone";
    }

    // Structured address fields (all optional)
    const regionErr = this.validatePsgcCode(data.region_code, "Region code");
    if (regionErr) errors.region_code = regionErr;

    const provinceErr = this.validatePsgcCode(data.province_code, "Province code");
    if (provinceErr) errors.province_code = provinceErr;

    const municipalityErr = this.validatePsgcCode(data.municipality_code, "Municipality code");
    if (municipalityErr) errors.municipality_code = municipalityErr;

    const barangayErr = this.validatePsgcCode(data.barangay_code, "Barangay code");
    if (barangayErr) errors.barangay_code = barangayErr;

    const addressLineErr = this.validateAddressLine(data.address_line);
    if (addressLineErr) errors.address_line = addressLineErr;

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // =====================================================
  // VALIDATE PASSWORD CHANGE DATA
  // =====================================================
  static validatePasswordChange(data) {
    const errors = {};

    if (!data.currentPassword) {
      errors.currentPassword = "Current password is required";
    }

    if (!data.newPassword) {
      errors.newPassword = "New password is required";
    } else {
      const passwordErrors = this.validatePassword(data.newPassword);
      if (passwordErrors.length > 0) {
        errors.newPassword = passwordErrors[0];
      }
    }

    if (!data.confirmPassword) {
      errors.confirmPassword = "Please confirm your new password";
    } else if (data.newPassword !== data.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (data.currentPassword && data.newPassword && data.currentPassword === data.newPassword) {
      errors.newPassword = "New password must be different from current password";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }
}

module.exports = ProfileValidator;