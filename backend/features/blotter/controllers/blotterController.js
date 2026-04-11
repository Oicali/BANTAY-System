const Blotter = require("../models/Blotter");
const pool = require("../../../config/database");
const autoCreateCase = async (client, blotterId, createdBy) => {
  const existing = await client.query(
    "SELECT id FROM cases WHERE blotter_id = $1", [blotterId]
  );
  if (existing.rows.length > 0) return;

  const year = new Date().getFullYear();

  // Use a DB-level sequence to avoid collision during bulk inserts
  const seqResult = await client.query(
    `INSERT INTO case_number_seq (year) VALUES ($1)
     ON CONFLICT (year) DO UPDATE SET seq = case_number_seq.seq + 1
     RETURNING seq`,
    [year]
  );
  const seq = seqResult.rows[0].seq;
  const case_number = `CASE-${year}-${String(seq).padStart(4, "0")}`;

  const blotterRow = await client.query(
    "SELECT status FROM blotter_entries WHERE blotter_id = $1", [blotterId]
  );
  const blotterStatus = blotterRow.rows[0]?.status || "Under Investigation";
  const validStatuses = ["Under Investigation", "Solved", "Cleared"];
  const caseStatus = validStatuses.includes(blotterStatus) ? blotterStatus : "Under Investigation";

  await client.query(
    `INSERT INTO cases (blotter_id, case_number, status, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [blotterId, case_number, caseStatus, createdBy]
  );
};
// import
const xlsx = require("xlsx");
const { normalizeOffense, normalizeBarangay, deriveFromDate } = require("../utils/importUtils");
const { v4: uuidv4 } = require("uuid");

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
  
  if (address.length < 2 || address.length > 200) {
  errors.push(`${fieldName} must be 2-200 characters`);
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
    const cleaned = phone.replace(/[\s-]/g, '');
    // Auto-fix 10-digit numbers starting with 9
    const normalized = (cleaned.length === 10 && cleaned.startsWith("9"))
      ? "0" + cleaned
      : cleaned;
    const phonePattern = /^(09|\+639)\d{9}$/;
    if (!phonePattern.test(normalized)) {
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
  
  // if (!complainant.region) errors.push(`${prefix} Region is required`);
  // if (!complainant.district_province) errors.push(`${prefix} District/Province is required`);
  // if (!complainant.city_municipality) errors.push(`${prefix} City/Municipality is required`);
  // if (!complainant.barangay) errors.push(`${prefix} Barangay is required`);
  if (!complainant.gender) errors.push(`${prefix} Gender is required`);
  if (!complainant.nationality) errors.push(`${prefix} Nationality is required`);
  if (!complainant.info_obtained) errors.push(`${prefix} Info obtained is required`);
  
  if (complainant.house_street && complainant.house_street.trim().length > 0) {
  if (complainant.house_street.trim().length < 2 || complainant.house_street.trim().length > 200) {
    errors.push(`${prefix} House/Street must be 2-200 characters`);
  }
}
  errors.push(...validatePhoneNumber(complainant.contact_number, false));
  
  return errors;
};

const validateSuspect = (suspect, index) => {
  const errors = [];
  const prefix = `Suspect #${index + 1}`;
  
  errors.push(...validateName(suspect.first_name, `${prefix} First Name`, true));
  errors.push(...validateName(suspect.middle_name, `${prefix} Middle Name`, false));
  errors.push(...validateName(suspect.last_name, `${prefix} Last Name`, true));
  
  // gender, nationality, house_street are optional
  if (suspect.house_street && suspect.house_street.trim().length > 0) {
  if (suspect.house_street.trim().length < 2 || suspect.house_street.trim().length > 200) {
    errors.push(`${prefix} House/Street must be 2-200 characters`);
  }
}
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
  // if ((suspect.status === 'Arrested' || suspect.status === 'In Custody') && !suspect.location_if_arrested) {
  //   errors.push(`${prefix} Location is required when status is Arrested/In Custody`);
  // }
  
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
  return errors;
};


const validateBlotterData = (blotterData) => {
  const errors = [];
  
  // Case detail validations
  if (!blotterData.incident_type) errors.push("Incident Type is required");
  if (blotterData.cop && blotterData.cop.trim().length > 0) {
    if (blotterData.cop.trim().length < 2 || blotterData.cop.trim().length > 100) {
      errors.push("COP must be 2-100 characters");
    }
  }
  
  if (!blotterData.date_time_commission) errors.push("Date & Time of Commission is required");
  if (!blotterData.date_time_reported) errors.push("Date & Time Reported is required");
  
  // Validate dates
  if (blotterData.date_time_commission && blotterData.date_time_reported) {
    const commission = new Date(blotterData.date_time_commission);
    const reported = new Date(blotterData.date_time_reported);
    const now = new Date();
    
    const futureLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
if (commission > futureLimit) {
  errors.push("Commission date cannot be in the future");
}

if (reported > futureLimit) {
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
  } else if (blotterData.place_street.length < 2 || blotterData.place_street.length > 200) {
    errors.push("Street must be 2-200 characters");
  }
  
  // Narrative validation
  if (!blotterData.narrative) {
    errors.push("Narrative is required");
  } else if (blotterData.narrative.length < 20 || blotterData.narrative.length > 5000) {
    errors.push("Narrative must be 20-5000 characters");
  }
  
  
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
    if (suspects && suspects.length > 0) {
      suspects.forEach((suspect, index) => {
        // skip validation for empty/removed suspects
        if (!suspect.first_name || suspect.first_name.trim() === "") return;
        allErrors.push(...validateSuspect(suspect, index));
      });
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

// Auto-create case
// try {
//   const year = new Date(blotterData.date_time_commission).getFullYear();
//   const countResult = await pool.query(
//     "SELECT COUNT(*) FROM cases WHERE EXTRACT(YEAR FROM created_at) = $1", [year]
//   );
//   const count = parseInt(countResult.rows[0].count) + 1;
//   const case_number = `CASE-${year}-${String(count).padStart(4, "0")}`;
//   await pool.query(
//     `INSERT INTO cases (blotter_id, case_number, created_by) VALUES ($1, $2, $3)`,
//     [result.blotter_id, case_number, req.user.user_id]
//   );
// } catch (caseErr) {
//   console.error("Auto-case creation failed:", caseErr.message);
//   // Non-fatal — blotter still saved
// }
await autoCreateCase(pool, result.blotter_id || result.id, req.user.user_id);
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
      data_source: req.query.data_source,
      referred: req.query.referred,
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
    
    if (suspects && suspects.length > 0) {
      suspects.forEach((suspect, index) => {
        if (!suspect.first_name || suspect.first_name.trim() === "") return;
        allErrors.push(...validateSuspect(suspect, index));
      });
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

const importBlotters = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "File is empty" });
    }

    // Validate it's the Bantay template
    const firstRow = rows[0];
    const hasRequiredColumns =
      "BLOTTER_ENTRY_NUMBER" in firstRow &&
      "DATE_COMMITTED" in firstRow &&
      "PLACE_BARANGAY" in firstRow &&
      "INCIDENT_TYPE" in firstRow;

    if (!hasRequiredColumns) {
      return res.status(400).json({
        success: false,
        message: "Invalid file format. Please use the official Bantay System import template.",
      });
    }

    const batchId = uuidv4();
    const inserted = [];
    const duplicates = [];
    const errors = [];

    // ── helpers ──────────────────────────────────────────
    const str = (v) => (v === null || v === undefined || v === "" ? null : String(v).trim());
    const num = (v) => {
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };
    const int = (v) => {
      const n = parseInt(v);
      return isNaN(n) ? 0 : n;
    };
    const bool = (v) => {
      if (v === null || v === undefined || v === "") return false;
      return String(v).trim().toUpperCase() === "YES" || v === true || v === 1;
    };
    const parseDate = (v) => {
      if (!v || v === "") return null;
      if (typeof v === "number") {
        // Excel serial date
        return new Date((v - 25569) * 86400 * 1000);
      }
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };
    const parseDateTime = (dateVal, timeVal) => {
      const d = parseDate(dateVal);
      if (!d) return null;
      if (timeVal && timeVal !== "") {
        const parts = String(timeVal).split(":");
        if (parts.length >= 2) {
          d.setHours(parseInt(parts[0]) || 0);
          d.setMinutes(parseInt(parts[1]) || 0);
          d.setSeconds(0);
        }
      }
      return d;
    };
    const deriveQuarter = (d) => {
      if (!d) return null;
      return Math.ceil((d.getMonth() + 1) / 3);
    };
    const deriveDayOfWeek = (d) => {
      if (!d) return null;
      return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
    };
    const deriveMonth = (d) => {
      if (!d) return null;
      return ["January","February","March","April","May","June",
              "July","August","September","October","November","December"][d.getMonth()];
    };

    // ── process rows ─────────────────────────────────────
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;

      const blotterNo = str(row["BLOTTER_ENTRY_NUMBER"]);
      if (!blotterNo) {
        const impYear = new Date().getFullYear();
        const impCount = await pool.query(
          `SELECT COUNT(*) FROM blotter_entries WHERE blotter_entry_number LIKE $1`,
          [`IMP-${impYear}-%`]
        );
        const impSeq = (parseInt(impCount.rows[0].count) + 1).toString().padStart(6, "0");
        row["BLOTTER_ENTRY_NUMBER"] = `IMP-${impYear}-${impSeq}`;
        // re-assign blotterNo
        continue; // still skip — require blotter number in Excel
      }

      const incidentType = str(row["INCIDENT_TYPE"]);
      if (!incidentType) {
        errors.push({ row: rowNum, field: "INCIDENT_TYPE", message: "Missing incident type" });
        continue;
      }

      const rawBarangay = str(row["PLACE_BARANGAY"]);
      if (!rawBarangay) {
        errors.push({ row: rowNum, field: "PLACE_BARANGAY", message: "Missing barangay" });
        continue;
      }

      const BARANGAY_MIGRATION_MAP = {
        "ALIMA": "SINEGUELASAN", "BANALO": "SINEGUELASAN", "SINBANALI": "SINEGUELASAN",
        "CAMPOSANTO": "KAINGIN (POB.)", "DAANG BUKID": "KAINGIN (POB.)", "TABING DAGAT": "KAINGIN (POB.)",
        "DIGMAN": "KAINGIN DIGMAN", "KAINGIN": "KAINGIN DIGMAN",
        "PANAPAAN": "P.F. ESPIRITU I (PANAPAAN)", "PANAPAAN 1": "P.F. ESPIRITU I (PANAPAAN)",
        "PANAPAAN 2": "P.F. ESPIRITU II", "PANAPAAN 3": "P.F. ESPIRITU II",
        "PANAPAAN 4": "P.F. ESPIRITU IV", "PANAPAAN 5": "P.F. ESPIRITU V", "PANAPAAN 6": "P.F. ESPIRITU VI",
        "P.F. ESPIRITU 1 (PANAPAAN)": "P.F. ESPIRITU I (PANAPAAN)",
        "P.F. ESPIRITU 2": "P.F. ESPIRITU II", "P.F. ESPIRITU 3": "P.F. ESPIRITU III",
        "P.F. ESPIRITU 4": "P.F. ESPIRITU IV", "P.F. ESPIRITU 5": "P.F. ESPIRITU V",
        "P.F. ESPIRITU 6": "P.F. ESPIRITU VI",
        "ANIBAN 1": "ANIBAN I", "ANIBAN 2": "ANIBAN II",
        "HABAY 1": "HABAY I", "HABAY 2": "HABAY II",
        "LIGAS 1": "LIGAS I", "LIGAS 2": "LIGAS II",
        "MABOLO 1": "MABOLO", "MABOLO 2": "MABOLO", "MABOLO 3": "MABOLO",
        "MALIKSI 1": "MALIKSI I", "MALIKSI 2": "MALIKSI II", "MALIKSI 3": "MALIKSI II",
        "MAMBOG 1": "MAMBOG I", "MAMBOG 2": "MAMBOG II", "MAMBOG 3": "MAMBOG III",
        "MAMBOG 4": "MAMBOG IV", "MAMBOG 5": "MAMBOG II",
        "MOLINO 1": "MOLINO I", "MOLINO 2": "MOLINO II", "MOLINO 3": "MOLINO III",
        "MOLINO 4": "MOLINO IV", "MOLINO 5": "MOLINO V", "MOLINO 6": "MOLINO VI", "MOLINO 7": "MOLINO VII",
        "NIOG 1": "NIOG", "NIOG 2": "NIOG", "NIOG 3": "NIOG",
        "REAL 1": "REAL", "REAL 2": "REAL",
        "SALINAS 1": "SALINAS I", "SALINAS 2": "SALINAS II", "SALINAS 3": "SALINAS II", "SALINAS 4": "SALINAS II",
        "SAN NICOLAS 1": "SAN NICOLAS I", "SAN NICOLAS 2": "SAN NICOLAS II", "SAN NICOLAS 3": "SAN NICOLAS III",
        "TALABA 1": "TALABA I", "TALABA 2": "TALABA II", "TALABA 3": "TALABA III",
        "TALABA 4": "TALABA III", "TALABA 5": "TALABA III", "TALABA 6": "TALABA III", "TALABA 7": "TALABA I",
        "ZAPOTE 1": "ZAPOTE I", "ZAPOTE 2": "ZAPOTE II", "ZAPOTE 3": "ZAPOTE III", "ZAPOTE 4": "ZAPOTE II",
        "KAINGIN DIGMAN": "KAINGIN DIGMAN",
      };

      const barangay = BARANGAY_MIGRATION_MAP[rawBarangay.toUpperCase()] || rawBarangay;

      const dateCommitted = parseDateTime(row["DATE_COMMITTED"], row["TIME_COMMITTED"]);
      if (!dateCommitted) {
        errors.push({ row: rowNum, field: "DATE_COMMITTED", message: "Missing or invalid date committed" });
        continue;
      }

      // Duplicate check
      const dup = await pool.query(
        `SELECT 1 FROM blotter_entries WHERE blotter_entry_number = $1`,
        [blotterNo]
      );
      if (dup.rows.length > 0) {
        duplicates.push({ row: rowNum, blotter_entry_number: blotterNo });
        continue;
      }

      const dateReported = parseDateTime(row["DATE_REPORTED"], row["TIME_REPORTED"]);

      inserted.push({
        rowNum,
        // ── blotter fields ──
        blotterNo,
        incidentType,
        barangay,
        dateCommitted,
        dateReported: dateReported || dateCommitted,
        quarter: deriveQuarter(dateCommitted),
        dayOfWeek: deriveDayOfWeek(dateCommitted),
        monthName: deriveMonth(dateCommitted),
        placeStreet: str(row["PLACE_STREET"]) || "N/A",
        typeOfPlace: str(row["TYPE_OF_PLACE"]),
        placeCommission: str(row["PLACE_COMMISSION"]),
        stageOfFelony: str(row["STAGE_OF_FELONY"]),
        modus: str(row["MODUS"]),
        narrative: str(row["NARRATIVE"]) || "Imported from Bantay template",
        caseStatus: str(row["CASE_STATUS"]) || "Under Investigation",
        caseSolveType: str(row["CASE_SOLVE_TYPE"]),
        drugInvolved: bool(row["DRUG_INVOLVED"]),
        amount: num(row["AMOUNT"]),
        lat: num(row["LAT"]),
        lng: num(row["LNG"]),
        // robbery
        robEstablishmentType: str(row["ROB_ESTABLISHMENT_TYPE"]),
        robEstablishmentName: str(row["ROB_ESTABLISHMENT_NAME"]),
        // vehicle
        vehiclePlateNo: str(row["VEHICLE_PLATE_NO"]),
        vehicleKind: str(row["VEHICLE_KIND"]),
        vehicleMake: str(row["VEHICLE_MAKE"]),
        vehicleModel: str(row["VEHICLE_MODEL"]),
        vehicleStatus: str(row["VEHICLE_STATUS"]),
        // firearm
        faCaliber: str(row["FA_CALIBER"]),
        faKind: str(row["FA_KIND"]),
        faMake: str(row["FA_MAKE"]),
        faStatus: str(row["FA_STATUS"]),
        // gambling
        gamblingKind: str(row["GAMBLING_KIND"]),

        // ── complainant fields ──
        complainant: {
          first_name: str(row["C_FIRST_NAME"]),
          middle_name: str(row["C_MIDDLE_NAME"]),
          last_name: str(row["C_LAST_NAME"]),
          qualifier: str(row["C_QUALIFIER"]),
          alias: str(row["C_ALIAS"]),
          gender: str(row["C_GENDER"]) || "Male",
          nationality: str(row["C_NATIONALITY"]) || "FILIPINO",
          contact_number: (() => {
  const num = str(row["C_CONTACT_NUMBER"]);
  if (!num) return null;
  const cleaned = num.replace(/\D/g, "");
  if (cleaned.length === 10 && cleaned.startsWith("9")) return "0" + cleaned;
  return cleaned;
})(),
          region: str(row["C_REGION"]) || "Region IV-A (CALABARZON)",
          district_province: str(row["C_PROVINCE"]) || "Cavite",
          city_municipality: str(row["C_CITY_MUNICIPALITY"]) || "Bacoor City",
          barangay: str(row["C_BARANGAY"]),
          house_street: str(row["C_HOUSE_STREET"]) || "N/A",
          info_obtained: str(row["C_INFO_OBTAINED"]) || "Walk-in",
          occupation: str(row["C_OCCUPATION"]),
        },

        // ── suspect fields ──
        suspect: {
          first_name: str(row["S_FIRST_NAME"]) || "UNKNOWN",
          middle_name: str(row["S_MIDDLE_NAME"]),
          last_name: str(row["S_LAST_NAME"]) || "UNKNOWN",
          qualifier: str(row["S_QUALIFIER"]),
          alias: str(row["S_ALIAS"]),
          gender: str(row["S_GENDER"]) || "Male",
          birthday: parseDate(row["S_BIRTHDAY"]),
          age: int(row["S_AGE"]) || null,
          birth_place: str(row["S_BIRTH_PLACE"]),
          nationality: str(row["S_NATIONALITY"]) || "FILIPINO",
          region: str(row["S_REGION"]) || "",
          district_province: str(row["S_PROVINCE"]) || "",
          city_municipality: str(row["S_CITY_MUNICIPALITY"]) || "",
          barangay: str(row["S_BARANGAY"]) || "",
          house_street: str(row["S_HOUSE_STREET"]) || "N/A",
          status: str(row["S_STATUS"]) || "At Large",
          location_if_arrested: str(row["S_LOCATION_IF_ARRESTED"]),
          degree_participation: str(row["S_DEGREE_PARTICIPATION"]) || "Principal",
          relation_to_victim: str(row["S_RELATION_TO_VICTIM"]),
          educational_attainment: str(row["S_EDUCATIONAL_ATTAINMENT"]),
          height_cm: int(row["S_HEIGHT_CM"]) || null,
          drug_used: bool(row["S_DRUG_USED"]),
          motive: str(row["S_MOTIVE"]),
          occupation: str(row["S_OCCUPATION"]),
        },

        // ── offense fields ──
        offense: {
          offense_name: str(row["O_OFFENSE_NAME"]) || incidentType,
          stage_of_felony: str(row["O_STAGE_OF_FELONY"]) || str(row["STAGE_OF_FELONY"]) || "COMPLETED",
          index_type: str(row["O_INDEX_TYPE"]) || "Index",
          is_principal_offense: true,
          investigator_on_case: str(row["O_INVESTIGATOR_ON_CASE"]) || "N/A",
          most_investigator: str(row["O_MOST_INVESTIGATOR"]) || "N/A",
          modus: str(row["O_MODUS"]) || str(row["MODUS"]),
        },
      });
    }

    // ── bulk insert in transaction ────────────────────────
    const client = await pool.connect();
    let actualInserted = 0;

    try {
      await client.query("BEGIN");

      for (const r of inserted) {
        // 1. Insert blotter_entry
        const blotterResult = await client.query(
          `INSERT INTO blotter_entries (
            blotter_entry_number, incident_type,
            place_region, place_district_province, place_city_municipality,
            place_barangay, place_street, type_of_place, place_commission,
            narrative, stage_of_felony, modus,
            date_time_commission, date_time_reported,
            referred_by_barangay, referred_by_dilg,
            day_of_incident, month_of_incident,
            status, case_solve_type,
            lat, lng, amount_involved,
            victim, suspect_text,
            data_source, import_batch_id, is_deleted
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,
            $19,$20,$21,$22,$23,$24,$25,$26,$27,$28
          ) RETURNING blotter_id`,
          [
            r.blotterNo, r.incidentType,
            "Region IV-A (CALABARZON)", "Cavite", "Bacoor City",
            r.barangay, r.placeStreet, r.typeOfPlace, r.placeCommission,
            r.narrative, r.stageOfFelony, r.modus,
            r.dateCommitted, r.dateReported,
            false, false,
            r.dayOfWeek, r.monthName,
            r.caseStatus, r.caseSolveType,
            r.lat, r.lng, r.amount,
            r.complainant.first_name
              ? `${r.complainant.first_name} ${r.complainant.last_name || ""}`.trim()
              : null,
            r.suspect.first_name
              ? `${r.suspect.first_name} ${r.suspect.last_name || ""}`.trim()
              : null,
            "bantay_import", r.batchId || batchId, false,
          ]
        );

        const blotterId = blotterResult.rows[0].blotter_id;
        await autoCreateCase(client, blotterId, req.user.user_id);

        // 2. Insert complainant (only if first name exists)
        if (r.complainant.first_name) {
          await client.query(
            `INSERT INTO complainants (
              blotter_id, first_name, middle_name, last_name, qualifier, alias,
              gender, nationality, contact_number,
              region, district_province, city_municipality, barangay, house_street,
              info_obtained, occupation
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
            )`,
            [
              blotterId,
              r.complainant.first_name || null,
              r.complainant.middle_name || null,
              r.complainant.last_name || null,
              r.complainant.qualifier || null,
              r.complainant.alias || null,
              r.complainant.gender || "Male",
              r.complainant.nationality || "FILIPINO",
              r.complainant.contact_number || null,
              r.complainant.region || null,
              r.complainant.district_province || null,
              r.complainant.city_municipality || null,
              r.complainant.barangay || null,
              r.complainant.house_street || null,
              r.complainant.info_obtained || null,
              r.complainant.occupation || null,
            ]
          );
        }

        // 3. Insert suspect
        await client.query(
          `INSERT INTO suspects (
            blotter_id, first_name, middle_name, last_name, qualifier, alias,
            gender, birthday, age, birth_place, nationality,
            region, district_province, city_municipality, barangay, house_street,
            status, location_if_arrested, degree_participation,
            relation_to_victim, educational_attainment,
            height_cm, drug_used, motive, occupation
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
          )`,
          [
            blotterId,
            r.suspect.first_name,
            r.suspect.middle_name,
            r.suspect.last_name,
            r.suspect.qualifier,
            r.suspect.alias,
            r.suspect.gender,
            r.suspect.birthday,
            r.suspect.age || null,
            r.suspect.birth_place,
            r.suspect.nationality,
            r.suspect.region,
            r.suspect.district_province,
            r.suspect.city_municipality,
            r.suspect.barangay,
            r.suspect.house_street,
            r.suspect.status,
            r.suspect.location_if_arrested,
            r.suspect.degree_participation,
            r.suspect.relation_to_victim,
            r.suspect.educational_attainment,
            r.suspect.height_cm || null,
            r.suspect.drug_used,
            r.suspect.motive,
            r.suspect.occupation,
          ]
        );

        // 4. Insert offense
       // 4. Insert offense
        await client.query(
          `INSERT INTO offenses (
            blotter_id, offense_name, stage_of_felony, index_type,
            is_principal_offense, investigator_on_case, most_investigator, modus
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            blotterId,
            r.offense.offense_name,
            r.offense.stage_of_felony,
            r.offense.index_type,
            r.offense.is_principal_offense,
            r.offense.investigator_on_case,
            r.offense.most_investigator,
            r.offense.modus,
          ]
        );

        // 5. Auto-link or auto-create modus in crime_modus_reference
        if (r.offense.modus) {
          const OFFENSE_TO_CRIME_TYPE = {
            "Murder": "MURDER",
            "Homicide": "HOMICIDE",
            "Physical Injury": "PHYSICAL INJURIES",
            "Rape": "RAPE",
            "Robbery": "ROBBERY",
            "Theft": "THEFT",
            "Carnapping - MC": "CARNAPPING - MC",
            "Carnapping - MV": "CARNAPPING - MV",
            "Special Complex Crime": "SPECIAL COMPLEX CRIME",
            "CARNAPPING - MC": "CARNAPPING - MC",
            "CARNAPPING - MV": "CARNAPPING - MV",
          };

          const crimeType = OFFENSE_TO_CRIME_TYPE[r.offense.offense_name];

          if (crimeType) {
            // Split modus by comma in case multiple are stored as one string
            const modusList = r.offense.modus.split(",").map(m => m.trim()).filter(Boolean);

            for (const modusName of modusList) {
              // Check if modus already exists for this crime type
              const existing = await client.query(
                `SELECT id FROM crime_modus_reference
                 WHERE UPPER(crime_type) = $1 AND LOWER(modus_name) = LOWER($2)`,
                [crimeType, modusName]
              );

              let modusRefId;

              if (existing.rows.length > 0) {
                // Already exists — use it
                modusRefId = existing.rows[0].id;

                // Make sure it's active
                await client.query(
                  `UPDATE crime_modus_reference SET is_active = true WHERE id = $1`,
                  [modusRefId]
                );
              } else {
                // Doesn't exist — auto-create it
                const created = await client.query(
                  `INSERT INTO crime_modus_reference (crime_type, modus_name, is_active)
                   VALUES ($1, $2, true) RETURNING id`,
                  [crimeType, modusName]
                );
                modusRefId = created.rows[0].id;
              }

              // Link to this blotter via crime_modus table
              await client.query(
                `INSERT INTO crime_modus (blotter_id, modus_reference_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [blotterId, modusRefId]
              );
            }
          }
        }

        // Auto-create case for imported blotter
// try {
//   const year = new Date(r.dateCommitted).getFullYear();
//   const countResult = await client.query(
//     "SELECT COUNT(*) FROM cases WHERE EXTRACT(YEAR FROM created_at) = $1", [year]
//   );
//   const caseCount = parseInt(countResult.rows[0].count) + 1;
//   const case_number = `CASE-${year}-${String(caseCount).padStart(4, "0")}`;
//   await client.query(
//     `INSERT INTO cases (blotter_id, case_number, created_by)
//      VALUES ($1, $2, $3)
//      ON CONFLICT DO NOTHING`,
//     [blotterId, case_number, req.user.user_id]
//   );
// } catch (caseErr) {
//   console.error("Auto-case (import) failed:", caseErr.message);
// }

actualInserted++;
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Import transaction error:", err);
      return res.status(500).json({ 
        success: false, 
        message: err.message,
        detail: err.detail || null,
        column: err.column || null,
        table: err.table || null,
      });
    } finally {
      client.release();
    }

    return res.status(200).json({
      success: true,
      summary: {
        inserted: actualInserted,
        skipped_duplicates: duplicates.length,
        skipped_errors: errors.length,
        errors,
        duplicates,
        batch_id: batchId,
      },
    });
  } catch (error) {
    console.error("Import error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const acceptReferral = async (req, res) => {
  try {
    const { id } = req.params;

    // Check blotter exists and is a brgy referral
    const blotter = await pool.query(
      `SELECT * FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [id]
    );
    if (blotter.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Blotter not found" });
    }
    if (!blotter.rows[0].referred_by_barangay) {
      return res.status(400).json({ success: false, message: "Not a barangay referral" });
    }
    if (blotter.rows[0].status !== "Pending") {
      return res.status(400).json({ success: false, message: "Already accepted" });
    }

    // Use transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      // Update status to Under Investigation
      await client.query(
        `UPDATE blotter_entries SET status = 'Under Investigation', updated_at = NOW() WHERE blotter_id = $1`,
        [id]
      );
      
      // Auto-create case
      await autoCreateCase(client, parseInt(id), req.user.user_id);
      
      await client.query("COMMIT");
      return res.status(200).json({ success: true, message: "Referral accepted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Accept referral error:", error);
    res.status(500).json({ success: false, message: "Error accepting referral" });
  }
};
const createBrgyReport = async (req, res) => {
  try {
    const { incident_type, date_time_commission, date_time_reported,
            place_barangay, place_street, narrative,
            victim_first_name, victim_last_name, victim_gender, victim_contact } = req.body;

    // Simple validation
    const errors = [];
    if (!incident_type) errors.push("Incident type is required");
    if (!date_time_commission) errors.push("Date & time of commission is required");
    if (!date_time_reported) errors.push("Date & time reported is required");
    if (!place_barangay) errors.push("Barangay is required");
    if (!place_street) errors.push("Street is required");
    if (!narrative || narrative.trim().length < 20) errors.push("Narrative must be at least 20 characters");
if (!place_street || place_street.trim().length < 2) errors.push("Street must be at least 2 characters");
    if (!victim_first_name) errors.push("Victim first name is required");
    if (!victim_last_name) errors.push("Victim last name is required");

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Generate blotter number
      const year = new Date(date_time_commission).getFullYear();
      const countResult = await client.query(
        `SELECT COUNT(*) FROM blotter_entries WHERE EXTRACT(YEAR FROM created_at) = $1
         AND blotter_entry_number NOT LIKE 'SEED-%' AND blotter_entry_number NOT LIKE 'IMP-%'`,
        [year]
      );
      const count = parseInt(countResult.rows[0].count) + 1;
      const seq = count.toString().padStart(6, "0");
      const blotterNumber = `BRGY-${year}-${seq}`;

      // Insert blotter
      const blotterResult = await client.query(
        `INSERT INTO blotter_entries (
          blotter_entry_number, incident_type,
          date_time_commission, date_time_reported,
          place_region, place_district_province, place_city_municipality,
          place_barangay, place_street,
          narrative, referred_by_barangay, status, submitted_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING blotter_id`,
        [
          blotterNumber, incident_type,
          date_time_commission, date_time_reported,
          "Region IV-A (CALABARZON)", "Cavite", "Bacoor City",
          place_barangay, place_street,
          narrative, true, "Pending", req.user.user_id
        ]
      );

      const blotterId = blotterResult.rows[0].blotter_id;

      await client.query(
        `INSERT INTO complainants (
          blotter_id, first_name, last_name, gender, nationality,
          house_street, info_obtained
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          blotterId,
          victim_first_name, victim_last_name,
          victim_gender || "Male", "FILIPINO",
          "N/A", "Walk-in"
        ]
      );

      // Insert offense so it shows correctly in EBlotter
      await client.query(
        `INSERT INTO offenses (
          blotter_id, offense_name, stage_of_felony, index_type,
          is_principal_offense, investigator_on_case, most_investigator
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          blotterId,
          incident_type,
          "COMPLETED",
          "Index",
          true,
          "N/A",
          "N/A"
        ]
      );

      await client.query("COMMIT");
return res.status(201).json({
        success: true,
        message: "Report submitted successfully! Awaiting police review.",
        data: { blotter_entry_number: blotterNumber }
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Brgy report error:", error);
    res.status(500).json({ success: false, message: "Error submitting report" });
  }
};

const getBrgyReports = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT blotter_id, blotter_entry_number, incident_type,
              place_barangay, place_street, date_time_commission,
              date_time_reported, status, created_at
       FROM blotter_entries
       WHERE referred_by_barangay = true
         AND submitted_by = $1
         AND is_deleted = false
       ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get brgy reports error:", error);
    res.status(500).json({ success: false, message: "Error fetching reports" });
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
  restoreBlotter,
  importBlotters,
  acceptReferral,
  createBrgyReport,
  getBrgyReports,
};