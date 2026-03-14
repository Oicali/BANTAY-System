const Blotter = require("../models/Blotter");
const pool = require("../../../config/database");

// ============================================================
// VALIDATION HELPERS
// ============================================================

const validateName = (name, fieldName, required = true) => {
  const errors = [];
  
  if (required && (!name || name.trim().length === 0)) {
    errors.push(`${fieldName} is required`);
    return errors;
  }
  
  if (name && name.trim().length > 0) {
    const trimmedName = name.trim();
    
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      errors.push(`${fieldName} must be 2-50 characters`);
    }
    
    const namePattern = /^[A-Za-zÑñ\s'-]{2,50}$/;
    if (!namePattern.test(trimmedName)) {
      errors.push(`${fieldName} must contain only letters`);
    }
  }
  
  return errors;
};

const validateAddress = (address, fieldName) => {
  const errors = [];
  
  if (!address || address.trim().length === 0) {
    errors.push(`${fieldName} is required`);
    return errors;
  }
  
  if (address.length < 5 || address.length > 200) {
    errors.push(`${fieldName} must be 5-200 characters`);
  }
  
  return errors;
};

const validatePhoneNumber = (phone, required = false) => {
  const errors = [];
  
  if (required && (!phone || phone.trim().length === 0)) {
    errors.push("Contact number is required");
    return errors;
  }
  
  if (phone && phone.trim().length > 0) {
    const phonePattern = /^(09|\+639)\d{9}$/;
    if (!phonePattern.test(phone.replace(/[\s-]/g, ''))) {
      errors.push("Please enter a valid Philippine mobile number (11 digits starting with 09)");
    }
  }
  
  return errors;
};

const validateComplainant = (complainant, index) => {
  const errors = [];
  const prefix = `Complainant #${index + 1}`;
  
  errors.push(...validateName(complainant.first_name, `${prefix} First Name`, true));
  errors.push(...validateName(complainant.middle_name, `${prefix} Middle Name`, false));
  errors.push(...validateName(complainant.last_name, `${prefix} Last Name`, true));
  
  if (!complainant.region) errors.push(`${prefix} Region is required`);
  if (!complainant.district_province) errors.push(`${prefix} District/Province is required`);
  if (!complainant.city_municipality) errors.push(`${prefix} City/Municipality is required`);
  if (!complainant.barangay) errors.push(`${prefix} Barangay is required`);
  if (!complainant.gender) errors.push(`${prefix} Gender is required`);
  if (!complainant.nationality) errors.push(`${prefix} Nationality is required`);
  if (!complainant.info_obtained) errors.push(`${prefix} Info obtained is required`);
  
  errors.push(...validateAddress(complainant.house_street, `${prefix} House/Street`));
  errors.push(...validatePhoneNumber(complainant.contact_number, false));
  
  return errors;
};

const validateSuspect = (suspect, index) => {
  const errors = [];
  const prefix = `Suspect #${index + 1}`;
  
  errors.push(...validateName(suspect.first_name, `${prefix} First Name`, true));
  errors.push(...validateName(suspect.middle_name, `${prefix} Middle Name`, false));
  errors.push(...validateName(suspect.last_name, `${prefix} Last Name`, true));
  
  if (!suspect.status) errors.push(`${prefix} Status is required`);
  if (!suspect.degree_participation) errors.push(`${prefix} Degree of Participation is required`);
  if (!suspect.gender) errors.push(`${prefix} Gender is required`);
  if (!suspect.region) errors.push(`${prefix} Region is required`);
  if (!suspect.district_province) errors.push(`${prefix} District/Province is required`);
  if (!suspect.city_municipality) errors.push(`${prefix} City/Municipality is required`);
  if (!suspect.barangay) errors.push(`${prefix} Barangay is required`);
  if (!suspect.nationality) errors.push(`${prefix} Nationality is required`);
  
  errors.push(...validateAddress(suspect.house_street, `${prefix} House/Street`));
  
  // Validate age if provided
  if (suspect.age) {
    const age = parseInt(suspect.age);
    if (age < 10 || age > 120) {
      errors.push(`${prefix} Age must be between 10 and 120`);
    }
  }
  
  // Validate height if provided
  if (suspect.height_cm) {
    const height = parseInt(suspect.height_cm);
    if (height < 50 || height > 250) {
      errors.push(`${prefix} Height must be between 50-250 cm`);
    }
  }
  
  // Validate birthday if provided
  if (suspect.birthday) {
    const birthDate = new Date(suspect.birthday);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    
    if (age < 10) {
      errors.push(`${prefix} Suspect must be at least 10 years old`);
    }
    
    if (birthDate > today) {
      errors.push(`${prefix} Birthday cannot be in the future`);
    }
  }
  
  // If arrested, location is required
  if ((suspect.status === 'Arrested' || suspect.status === 'In Custody') && !suspect.location_if_arrested) {
    errors.push(`${prefix} Location is required when status is Arrested/In Custody`);
  }
  
  return errors;
};

const validateOffense = (offense, index) => {
  const errors = [];
  const prefix = `Offense #${index + 1}`;
  
  if (offense.is_principal_offense === undefined || offense.is_principal_offense === null) {
    errors.push(`${prefix} Principal Offense indication is required`);
  }
  if (!offense.offense_name) errors.push(`${prefix} Offense name is required`);
  if (!offense.stage_of_felony) errors.push(`${prefix} Stage of Felony is required`);
  if (!offense.index_type) errors.push(`${prefix} Index Type is required`);
  if (!offense.investigator_on_case) errors.push(`${prefix} Investigator on Case is required`);
  if (!offense.most_investigator) errors.push(`${prefix} Most Investigator is required`);
  
  return errors;
};

const validateBlotterData = (blotterData) => {
  const errors = [];
  
  // Case detail validations
  if (!blotterData.incident_type) errors.push("Incident Type is required");
  if (!blotterData.cop) {
    errors.push("COP is required");
  } else if (blotterData.cop.length < 5 || blotterData.cop.length > 100) {
    errors.push("COP must be 5-100 characters");
  }
  
  if (!blotterData.date_time_commission) errors.push("Date & Time of Commission is required");
  if (!blotterData.date_time_reported) errors.push("Date & Time Reported is required");
  
  // Validate dates
  if (blotterData.date_time_commission && blotterData.date_time_reported) {
    const commission = new Date(blotterData.date_time_commission);
    const reported = new Date(blotterData.date_time_reported);
    const now = new Date();
    
    if (commission > now) {
      errors.push("Commission date cannot be in the future");
    }
    
    if (reported > now) {
      errors.push("Report date cannot be in the future");
    }
    
    if (commission > reported) {
      errors.push("Commission date cannot be after report date");
    }
  }

  // Place validations
  if (!blotterData.place_region) errors.push("Place of Commission - Region is required");
  if (!blotterData.place_district_province) errors.push("District/Province is required");
  if (!blotterData.place_city_municipality) errors.push("City/Municipality is required");
  if (!blotterData.place_barangay) errors.push("Barangay is required");
  if (!blotterData.place_street) {
    errors.push("Street is required");
  } else if (blotterData.place_street.length < 3 || blotterData.place_street.length > 200) {
    errors.push("Street must be 3-200 characters");
  }
  
  // Narrative validation
  if (!blotterData.narrative) {
    errors.push("Narrative is required");
  } else if (blotterData.narrative.length < 20 || blotterData.narrative.length > 5000) {
    errors.push("Narrative must be 20-5000 characters");
  }
  
  // Boolean validations
  if (blotterData.referred_by_barangay === undefined) errors.push("Please select if referred by barangay");
  if (blotterData.referred_by_dilg === undefined) errors.push("Please select if referred by DILG");
  
  // Amount validation - OPTIONAL (validate only if provided)
  if (blotterData.amount_involved) {
    const amount = parseFloat(blotterData.amount_involved);
    if (isNaN(amount)) {
      errors.push("Amount must be a valid number");
    } else if (amount < 0.01 || amount > 999999999.99) {
      errors.push("Amount must be between 0.01 and 999,999,999.99");
    }
  }
  
  return errors;
};

// ============================================================
// CONTROLLER FUNCTIONS
// ============================================================

const createBlotter = async (req, res) => {
  try {
    const { blotterData, complainants, suspects, offenses } = req.body;
    
    let allErrors = [];
    
    // Validate blotter data
    allErrors.push(...validateBlotterData(blotterData));
    
    // Validate complainants
    if (!complainants || complainants.length === 0) {
      allErrors.push("At least one complainant is required");
    } else {
      complainants.forEach((complainant, index) => {
        allErrors.push(...validateComplainant(complainant, index));
      });
    }
    
    // Validate suspects
    if (!suspects || suspects.length === 0) {
      allErrors.push("At least one suspect is required");
    } else {
      suspects.forEach((suspect, index) => {
        allErrors.push(...validateSuspect(suspect, index));
      });
    }
    
    // Validate offenses
    if (!offenses || offenses.length === 0) {
      allErrors.push("At least one offense is required");
    } else {
      offenses.forEach((offense, index) => {
        allErrors.push(...validateOffense(offense, index));
      });
      
      // Check if at least one offense is principal
      const hasPrincipal = offenses.some(o => o.is_principal_offense === true);
      if (!hasPrincipal) {
        allErrors.push("At least one offense must be marked as Principal Offense");
      }
    }
    
    // If there are validation errors, return them
    if (allErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: allErrors
      });
    }
    
    // Create blotter
    const result = await Blotter.create(blotterData, complainants, suspects, offenses);
    
    res.status(201).json({
      success: true,
      message: "Blotter entry created successfully",
      data: result
    });
    
  } catch (error) {
    console.error("Create blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating blotter entry",
      error: error.message
    });
  }
};

const getAllBlotters = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      incident_type: req.query.incident_type,
      search: req.query.search,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      barangay: req.query.barangay,
    };
    
    const blotters = await Blotter.getAll(filters);
    
    res.status(200).json({
      success: true,
      count: blotters.length,
      data: blotters
    });
    
  } catch (error) {
    console.error("Get blotters error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching blotters",
      error: error.message
    });
  }
};

const getBlotterById = async (req, res) => {
  try {
    const { id } = req.params;
    const blotter = await Blotter.getByIdRaw(id); // Use the new method
    
    if (!blotter) {
      return res.status(404).json({
        success: false,
        message: "Blotter not found"
      });
    }
    
    res.status(200).json({
      success: true,
      data: blotter
    });
    
  } catch (error) {
    console.error("Get blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching blotter",
      error: error.message
    });
  }
};

const updateBlotterStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }
    
    const validStatuses = ['Pending', 'Under Investigation', 'Resolved', 'Urgent'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }
    
    const blotter = await Blotter.updateStatus(id, status);
    
    if (!blotter) {
      return res.status(404).json({
        success: false,
        message: "Blotter not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Blotter status updated successfully",
      data: blotter
    });
    
  } catch (error) {
    console.error("Update blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating blotter",
      error: error.message
    });
  }
};

const deleteBlotter = async (req, res) => {
  try {
    const { id } = req.params;
    const blotter = await Blotter.delete(id);
    
    if (!blotter) {
      return res.status(404).json({
        success: false,
        message: "Blotter not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Blotter deleted successfully"
    });
    
  } catch (error) {
    console.error("Delete blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting blotter",
      error: error.message
    });
  }
};

const updateBlotter = async (req, res) => {
  try {
    const { id } = req.params;
    const { blotterData, complainants, suspects, offenses } = req.body;
    
    // Same validation as createBlotter
    let allErrors = [];
    allErrors.push(...validateBlotterData(blotterData));
    
    if (!complainants || complainants.length === 0) {
      allErrors.push("At least one complainant is required");
    } else {
      complainants.forEach((c, i) => allErrors.push(...validateComplainant(c, i)));
    }
    
    if (!suspects || suspects.length === 0) {
      allErrors.push("At least one suspect is required");
    } else {
      suspects.forEach((s, i) => allErrors.push(...validateSuspect(s, i)));
    }
    
    if (!offenses || offenses.length === 0) {
      allErrors.push("At least one offense is required");
    } else {
      offenses.forEach((o, i) => allErrors.push(...validateOffense(o, i)));
      const hasPrincipal = offenses.some(o => o.is_principal_offense === true);
      if (!hasPrincipal) allErrors.push("At least one offense must be principal");
    }
    
    if (allErrors.length > 0) {
      return res.status(400).json({ success: false, errors: allErrors });
    }
    
    const result = await Blotter.update(id, blotterData, complainants, suspects, offenses);
    
    if (!result) {
      return res.status(404).json({ success: false, message: "Blotter not found" });
    }
    
    res.status(200).json({
      success: true,
      message: "Blotter updated successfully",
      data: result
    });
    
  } catch (error) {
    console.error("Update blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating blotter",
      error: error.message
    });
  }
};
const getModus = async (req, res) => {
  
  try {
    const { crime_type } = req.params;
    const result = await pool.query(
      `SELECT id, modus_name, description FROM crime_modus_reference 
       WHERE crime_type = $1 AND is_active = true ORDER BY modus_name ASC`,
      [crime_type]
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDeletedBlotters = async (req, res) => {
  try {
    const blotters = await Blotter.getDeleted();
    res.json({ success: true, data: blotters });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const restoreBlotter = async (req, res) => {
  try {
    const { id } = req.params;
    const blotter = await Blotter.restore(id);
    if (!blotter) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Blotter restored successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createBlotter,
  getAllBlotters,
  getBlotterById,
  updateBlotterStatus,
  deleteBlotter,
  updateBlotter,
  getModus,
  getDeletedBlotters,
  restoreBlotter
};