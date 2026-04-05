// ================================================================================
// FILE: backend/features/user/validators/userValidator.js
// ================================================================================

class UserValidator {
  // =====================================================
  // VALIDATE EMAIL FORMAT
  // =====================================================
  static validateEmail(email, required = true) {
    if (!email || email.trim() === "") {
      if (required) return "Email is required";
      return null;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return "Invalid email format";
    }
    return null;
  }

  // =====================================================
  // VALIDATE PHONE FORMAT (Philippine mobile: +639XXXXXXXXX)
  // =====================================================
  static validatePhone(phone, fieldName = "Phone number", required = true) {
    if (!phone || phone.trim() === "") {
      if (required) return `${fieldName} is required`;
      return null;
    }
    const phoneRegex = /^\+639\d{9}$/;
    if (!phoneRegex.test(phone.trim())) {
      return `${fieldName} must be in format +639XXXXXXXXX (e.g., +639171234567)`;
    }
    return null;
  }

  // =====================================================
  // VALIDATE USER TYPE
  // =====================================================
  static validateUserType(userType) {
    if (!userType) return "User type is required";
    if (!["police", "barangay"].includes(userType)) {
      return "Invalid user type. Must be 'police' or 'barangay'";
    }
    return null;
  }

  // =====================================================
  // VALIDATE REQUIRED FIELDS FOR REGISTRATION
  // =====================================================
  static validateRequiredFields(data) {
  const baseRequired = [
    "userType",
    "email",
    "firstName",
    "lastName",
    "phone",
    "role",
    "gender",
    "dateOfBirth",
    "regionCode",
    "provinceCode",
    "municipalityCode",
  ];

  const missing = baseRequired.filter((field) => !data[field]);

  // Accept either 'barangayCode' or 'barangay' for the barangay field
  const hasBarangay = data.barangayCode || data.barangay;
  if (!hasBarangay) {
    missing.push("barangayCode");
  }

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

  // =====================================================
  // VALIDATE PHONE AND ALTERNATE PHONE DIFFERENCE
  // =====================================================
  static validatePhoneDifference(phone, alternatePhone) {
    if (phone && alternatePhone && phone === alternatePhone) {
      return "Phone and alternate phone cannot be the same";
    }
    return null;
  }

  // =====================================================
  // VALIDATE PHONE UNIQUENESS (DB Check)
  // =====================================================
  static async validatePhoneUniqueness(phone, client, excludeUserId = null) {
    if (!phone) return null;
    const query = excludeUserId
      ? "SELECT user_id FROM users WHERE (phone = $1 OR alternate_phone = $1) AND user_id != $2"
      : "SELECT user_id FROM users WHERE phone = $1 OR alternate_phone = $1";
    const params = excludeUserId ? [phone, excludeUserId] : [phone];
    const result = await client.query(query, params);
    if (result.rows.length > 0) return "Phone number already registered";
    return null;
  }

  // =====================================================
  // VALIDATE ALTERNATE PHONE UNIQUENESS (DB Check)
  // =====================================================
  static async validateAlternatePhoneUniqueness(
    alternatePhone,
    client,
    excludeUserId = null,
  ) {
    if (!alternatePhone) return null;
    const query = excludeUserId
      ? "SELECT user_id FROM users WHERE (phone = $1 OR alternate_phone = $1) AND user_id != $2"
      : "SELECT user_id FROM users WHERE phone = $1 OR alternate_phone = $1";
    const params = excludeUserId
      ? [alternatePhone, excludeUserId]
      : [alternatePhone];
    const result = await client.query(query, params);
    if (result.rows.length > 0)
      return "Alternate phone number already registered";
    return null;
  }

  // =====================================================
  // VALIDATE EMAIL UNIQUENESS (DB Check)
  // =====================================================
  static async validateEmailUniqueness(email, client, excludeUserId = null) {
    if (!email) return null;
    const query = excludeUserId
      ? "SELECT user_id FROM users WHERE LOWER(email) = LOWER($1) AND user_id != $2"
      : "SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)";
    const params = excludeUserId ? [email, excludeUserId] : [email];
    const result = await client.query(query, params);
    if (result.rows.length > 0) return "Email already registered";
    return null;
  }

  // =====================================================
  // VALIDATE ROLE (DB Check)
  // =====================================================
  static async validateRole(role, userType, client) {
    if (!role) return "Role is required";
    const result = await client.query(
      "SELECT role_id FROM roles WHERE role_name = $1 AND user_type = $2",
      [role, userType],
    );
    if (result.rows.length === 0) {
      return `Invalid role '${role}' for ${userType} user. Valid roles: ${userType === "police" ? "Administrator, Investigator, Patrol" : "Barangay"}`;
    }
    return null;
  }

  // =====================================================
  // VALIDATE REGISTRATION DATA
  // =====================================================
  static async validateRegistration(data, client) {
    const errors = {};

    // Required fields
    const requiredError = this.validateRequiredFields(data);
    if (requiredError) errors.general = requiredError;

    // User type
    const userTypeError = this.validateUserType(data.userType);
    if (userTypeError) errors.userType = userTypeError;

    // Email format
    const emailError = this.validateEmail(data.email);
    if (emailError) errors.email = emailError;

    // Phone format
    const phoneError = this.validatePhone(data.phone);
    if (phoneError) errors.phone = phoneError;

    // Alternate phone format
    if (data.alternatePhone) {
      const altPhoneError = this.validatePhone(
        data.alternatePhone,
        "Alternate phone number",
        false,
      );
      if (altPhoneError) errors.alternatePhone = altPhoneError;
    }

    // ✅ FIXED: was errors.phoneDifference — frontend never reads that key
    const diffError = this.validatePhoneDifference(
      data.phone,
      data.alternatePhone,
    );
    if (diffError) errors.alternatePhone = diffError;

    // DB uniqueness checks
    if (!errors.email) {
      const emailUniqError = await this.validateEmailUniqueness(
        data.email,
        client,
      );
      if (emailUniqError) errors.email = emailUniqError;
    }
    if (!errors.phone) {
      const phoneUniqError = await this.validatePhoneUniqueness(
        data.phone,
        client,
      );
      if (phoneUniqError) errors.phone = phoneUniqError;
    }
    if (data.alternatePhone && !errors.alternatePhone) {
      const altPhoneUniqError = await this.validateAlternatePhoneUniqueness(
        data.alternatePhone,
        client,
      );
      if (altPhoneUniqError) errors.alternatePhone = altPhoneUniqError;
    }

    // Role validation
    if (!errors.role) {
      const roleError = await this.validateRole(
        data.role,
        data.userType,
        client,
      );
      if (roleError) errors.role = roleError;
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }
  // =====================================================
  // VALIDATE UPDATE DATA
  // =====================================================
  static async validateUpdate(data, existingUser, client) {
    const errors = {};

    // Email uniqueness (if changed)
    if (
      data.email &&
      data.email.toLowerCase() !== existingUser.email.toLowerCase()
    ) {
      const emailUniqError = await this.validateEmailUniqueness(
        data.email,
        client,
        existingUser.user_id,
      );
      if (emailUniqError) errors.email = emailUniqError;
    }

    // Phone uniqueness (if changed)
    if (data.phone && data.phone !== existingUser.phone) {
      const phoneUniqError = await this.validatePhoneUniqueness(
        data.phone,
        client,
        existingUser.user_id,
      );
      if (phoneUniqError) errors.phone = phoneUniqError;
    }

    // Alternate phone uniqueness (if changed)
    if (
      data.alternate_phone &&
      data.alternate_phone !== existingUser.alternate_phone
    ) {
      const altPhoneUniqError = await this.validateAlternatePhoneUniqueness(
        data.alternate_phone,
        client,
        existingUser.user_id,
      );
      if (altPhoneUniqError) errors.alternate_phone = altPhoneUniqError;
    }

    // Role validation (if changed)
    if (data.role) {
      const roleError = await this.validateRole(
        data.role,
        existingUser.user_type,
        client,
      );
      if (roleError) errors.role = roleError;
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }
}

module.exports = UserValidator;
