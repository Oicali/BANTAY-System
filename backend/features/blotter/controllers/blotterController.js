// backend\features\blotter\controllers\blotterController.js

const Blotter = require("../models/Blotter");
const pool = require("../../../config/database");
const { logAudit, getClientIp } = require("../../../shared/utils/auditLogger");
const {
  createNotification,
  notifyAllByRole,
  getResponderForReferral,
  notifyPatrolsForReferral,
} = require("../../notifications/notificationService");
const autoCreateCase = async (client, blotterId, createdBy) => {
  const existing = await client.query(
    "SELECT id FROM cases WHERE blotter_id = $1",
    [blotterId],
  );
  if (existing.rows.length > 0) return;

  const year = new Date().getFullYear();

  const seqResult = await client.query(
    `INSERT INTO case_number_seq (year) VALUES ($1)
     ON CONFLICT (year) DO UPDATE SET seq = case_number_seq.seq + 1
     RETURNING seq`,
    [year],
  );
  const seq = seqResult.rows[0].seq;
  const case_number = `CASE-${year}-${String(seq).padStart(4, "0")}`;

  const blotterRow = await client.query(
    "SELECT status, incident_type, date_time_reported, date_time_commission FROM blotter_entries WHERE blotter_id = $1",
    [blotterId],
  );
  const blotterStatus = blotterRow.rows[0]?.status || "Under Investigation";
  const validStatuses = ["Under Investigation", "Solved", "Cleared"];
  const caseStatus = validStatuses.includes(blotterStatus)
    ? blotterStatus
    : "Under Investigation";

  const incidentType = (blotterRow.rows[0]?.incident_type || "")
    .toLowerCase()
    .trim();
  const reportedDate =
    blotterRow.rows[0]?.date_time_reported ||
    blotterRow.rows[0]?.date_time_commission;
  const blotterYear = reportedDate
    ? new Date(reportedDate).getFullYear()
    : new Date().getFullYear();
  const currentYear = new Date().getFullYear();

  let autoPriority = "Low";
  if (blotterYear === currentYear) {
    const highCrimes = ["murder", "homicide", "rape", "special complex crime"];
    const mediumCrimes = ["robbery", "carnapping - mc", "carnapping - mv"];
    if (highCrimes.includes(incidentType)) autoPriority = "High";
    else if (mediumCrimes.includes(incidentType)) autoPriority = "Medium";
  }
  await client.query(
    `INSERT INTO cases (blotter_id, case_number, status, priority, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [blotterId, case_number, caseStatus, autoPriority, createdBy],
  );
};
const xlsx = require("xlsx");
const {
  normalizeOffense,
  normalizeBarangay,
  deriveFromDate,
} = require("../utils/importUtils");
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
    const cleaned = phone.replace(/[\s-]/g, "");
    // Auto-fix 10-digit numbers starting with 9
    const normalized =
      cleaned.length === 10 && cleaned.startsWith("9")
        ? "0" + cleaned
        : cleaned;
    const phonePattern = /^(09|\+639)\d{9}$/;
    if (!phonePattern.test(normalized)) {
      errors.push(
        "Please enter a valid Philippine mobile number (11 digits starting with 09)",
      );
    }
  }

  return errors;
};
const validateComplainant = (complainant, index) => {
  const errors = [];
  const prefix = `Complainant #${index + 1}`;

  errors.push(
    ...validateName(complainant.first_name, `${prefix} First Name`, true),
  );
  errors.push(
    ...validateName(complainant.middle_name, `${prefix} Middle Name`, false),
  );
  errors.push(
    ...validateName(complainant.last_name, `${prefix} Last Name`, true),
  );

  // if (!complainant.region) errors.push(`${prefix} Region is required`);
  // if (!complainant.district_province) errors.push(`${prefix} District/Province is required`);
  // if (!complainant.city_municipality) errors.push(`${prefix} City/Municipality is required`);
  // if (!complainant.barangay) errors.push(`${prefix} Barangay is required`);
  if (!complainant.gender) errors.push(`${prefix} Gender is required`);
  if (!complainant.nationality)
    errors.push(`${prefix} Nationality is required`);
  if (!complainant.info_obtained)
    errors.push(`${prefix} Info obtained is required`);
  const validRoles = ["Victim", "Complainant", "Witness", "Respondent"];
  if (complainant.role && !validRoles.includes(complainant.role)) {
    errors.push(`${prefix} has an invalid role`);
  }

  // Witness statement max length
  if (
    complainant.witness_statement &&
    complainant.witness_statement.length > 500
  ) {
    errors.push(`${prefix} witness statement must be under 500 characters`);
  }

  // relationship_to_victim max length
  if (
    complainant.relationship_to_victim &&
    complainant.relationship_to_victim.length > 100
  ) {
    errors.push(
      `${prefix} relationship to victim must be under 100 characters`,
    );
  }
  if (complainant.house_street && complainant.house_street.trim().length > 0) {
    if (
      complainant.house_street.trim().length < 2 ||
      complainant.house_street.trim().length > 200
    ) {
      errors.push(`${prefix} House/Street must be 2-200 characters`);
    }
  }
  errors.push(...validatePhoneNumber(complainant.contact_number, false));

  return errors;
};

const validateSuspect = (suspect, index) => {
  const errors = [];
  const prefix = `Suspect #${index + 1}`;

  errors.push(
    ...validateName(suspect.first_name, `${prefix} First Name`, true),
  );
  errors.push(
    ...validateName(suspect.middle_name, `${prefix} Middle Name`, false),
  );
  errors.push(...validateName(suspect.last_name, `${prefix} Last Name`, false));

  // gender, nationality, house_street are optional
  if (suspect.house_street && suspect.house_street.trim().length > 0) {
    if (
      suspect.house_street.trim().length < 2 ||
      suspect.house_street.trim().length > 200
    ) {
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
  if (
    offense.is_principal_offense === undefined ||
    offense.is_principal_offense === null
  ) {
    errors.push(`${prefix} Principal Offense indication is required`);
  }
  if (!offense.offense_name) errors.push(`${prefix} Offense name is required`);
  if (!offense.stage_of_felony)
    errors.push(`${prefix} Stage of Felony is required`);
  if (!offense.index_type) errors.push(`${prefix} Index Type is required`);
  return errors;
};

const validateBlotterData = (blotterData) => {
  const errors = [];

  // Case detail validations
  if (!blotterData.incident_type) errors.push("Incident Type is required");
  if (blotterData.cop && blotterData.cop.trim().length > 0) {
    if (
      blotterData.cop.trim().length < 2 ||
      blotterData.cop.trim().length > 100
    ) {
      errors.push("COP must be 2-100 characters");
    }
  }

  if (!blotterData.date_time_commission)
    errors.push("Date & Time of Commission is required");
  if (!blotterData.date_time_reported)
    errors.push("Date & Time Reported is required");

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
  if (!blotterData.place_region)
    errors.push("Place of Commission - Region is required");
  if (!blotterData.place_district_province)
    errors.push("District/Province is required");
  if (!blotterData.place_city_municipality)
    errors.push("City/Municipality is required");
  if (!blotterData.place_barangay) errors.push("Barangay is required");
  if (!blotterData.place_street) {
    errors.push("Street is required");
  } else if (
    blotterData.place_street.length < 2 ||
    blotterData.place_street.length > 200
  ) {
    errors.push("Street must be 2-200 characters");
  }

  // Narrative validation
  if (!blotterData.narrative) {
    errors.push("Narrative is required");
  } else if (
    blotterData.narrative.length < 20 ||
    blotterData.narrative.length > 5000
  ) {
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
        errors: allErrors,
      });
    }

    // Create blotter
    const result = await Blotter.create(
      blotterData,
      complainants,
      suspects,
      offenses,
    );

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
    await autoCreateCase(
      pool,
      result.blotter_id || result.id,
      req.user.user_id,
    );

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Blotter Created",
      description: `Created blotter entry for incident type "${blotterData.incident_type}"`,
      action: "CREATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.status(201).json({
      success: true,
      message: "Blotter entry created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Create blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating blotter entry",
      error: error.message,
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

    // Backend safety net: enforce referred flag strictly
    let results = blotters;
    if (req.query.referred === "false") {
      results = blotters.filter((b) => !b.referred_by_barangay);
    } else if (req.query.referred === "true") {
      results = blotters.filter((b) => b.referred_by_barangay === true);
    }

    res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error("Get blotters error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching blotters",
      error: error.message,
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
        message: "Blotter not found",
      });
    }

    res.status(200).json({
      success: true,
      data: blotter,
    });
  } catch (error) {
    console.error("Get blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching blotter",
      error: error.message,
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
        message: "Status is required",
      });
    }

    const validStatuses = [
      "Pending",
      "Under Investigation",
      "Resolved",
      "Urgent",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const blotter = await Blotter.updateStatus(id, status);

    if (!blotter) {
      return res.status(404).json({
        success: false,
        message: "Blotter not found",
      });
    }

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Blotter Status Updated",
      description: `Updated blotter ID ${id} status to "${status}"`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.status(200).json({
      success: true,
      message: "Blotter status updated successfully",
      data: blotter,
    });
  } catch (error) {
    console.error("Update blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating blotter",
      error: error.message,
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
        message: "Blotter not found",
      });
    }
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Blotter Deleted",
      description: `Soft-deleted blotter ID ${id}`,
      action: "DELETE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    const deleted = await pool.query(
  `SELECT submitted_by, incident_type, place_barangay, blotter_entry_number FROM blotter_entries WHERE blotter_id = $1`,
  [id]
);

if (deleted.rows[0]?.submitted_by) {
  await createNotification({
    recipientId: deleted.rows[0].submitted_by,
    senderId: req.user.user_id,
    senderName: req.user.username,
    type: "REFERRAL_DELETED",
    title: "Referral Removed",
    message: `Your referral has been removed after thorough review.`,
    linkTo: "/brgy-report",
  });
}

await notifyAllByRole(["Administrator", "Technical Administrator"], {
  senderId: req.user.user_id,
  senderName: req.user.username,
  type: "REFERRAL_DELETED",
  title: "Referral Removed",
  message: `Referral ${deleted.rows[0]?.blotter_entry_number || id} has been deleted by ${req.user.username}.`,
  linkTo: "/e-blotter",
}, req.user.user_id);

if (deleted.rows[0]?.place_barangay) {
  await notifyPatrolsForReferral(deleted.rows[0].place_barangay, {
    senderId: req.user.user_id,
    senderName: req.user.username,
    type: "REFERRAL_DELETED",
    title: "Referral Removed",
    message: `Referral ${deleted.rows[0]?.blotter_entry_number || id} in Brgy. ${deleted.rows[0].place_barangay} has been removed.`,
    linkTo: "/e-blotter",
  }, req.user.user_id);
}

res.status(200).json({
  success: true,
  message: "Blotter deleted successfully",
});
  } catch (error) {
    console.error("Delete blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting blotter",
      error: error.message,
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
      complainants.forEach((c, i) =>
        allErrors.push(...validateComplainant(c, i)),
      );
    }

    if (suspects && suspects.length > 0) {
      suspects.forEach((suspect, index) => {
        if (!suspect.first_name || suspect.first_name.trim() === "") return;
        allErrors.push(...validateSuspect(suspect, index));
      });
    }

    if (offenses && offenses.length > 0) {
      offenses.forEach((offense, index) => {
        allErrors.push(...validateOffense(offense, index));
      });
    }

    if (allErrors.length > 0) {
      return res.status(400).json({ success: false, errors: allErrors });
    }

    const result = await Blotter.update(
      id,
      blotterData,
      complainants,
      suspects,
      offenses,
    );

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "Blotter not found" });
    }

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Blotter Updated",
      description: `Updated blotter ID ${id}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.status(200).json({
      success: true,
      message: "Blotter updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update blotter error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating blotter",
      error: error.message,
    });
  }
};
const getModus = async (req, res) => {
  try {
    const { crime_type } = req.params;
    const result = await pool.query(
      `SELECT id, modus_name, description FROM crime_modus_reference 
       WHERE crime_type = $1 AND is_active = true ORDER BY modus_name ASC`,
      [crime_type],
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
    if (!blotter)
      return res.status(404).json({ success: false, message: "Not found" });
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Blotter Restored",
      description: `Restored blotter ID ${id}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, message: "Blotter restored successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const importBlotters = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
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
        message:
          "Invalid file format. Please use the official Bantay System import template.",
      });
    }

    const batchId = uuidv4();
    const inserted = [];
    const duplicates = [];
    const errors = [];

    // ── helpers ──────────────────────────────────────────
    const str = (v) =>
      v === null || v === undefined || v === "" ? null : String(v).trim();
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
      return [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ][d.getDay()];
    };
    const deriveMonth = (d) => {
      if (!d) return null;
      return [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ][d.getMonth()];
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
          [`IMP-${impYear}-%`],
        );
        const impSeq = (parseInt(impCount.rows[0].count) + 1)
          .toString()
          .padStart(6, "0");
        row["BLOTTER_ENTRY_NUMBER"] = `IMP-${impYear}-${impSeq}`;
        // re-assign blotterNo
        continue; // still skip — require blotter number in Excel
      }

      const incidentType = str(row["INCIDENT_TYPE"]);
      if (!incidentType) {
        errors.push({
          row: rowNum,
          field: "INCIDENT_TYPE",
          message: "Missing incident type",
        });
        continue;
      }

      const rawBarangay = str(row["PLACE_BARANGAY"]);
      if (!rawBarangay) {
        errors.push({
          row: rowNum,
          field: "PLACE_BARANGAY",
          message: "Missing barangay",
        });
        continue;
      }

      const BARANGAY_MIGRATION_MAP = {
        ALIMA: "SINEGUELASAN",
        BANALO: "SINEGUELASAN",
        SINBANALI: "SINEGUELASAN",
        CAMPOSANTO: "KAINGIN (POB.)",
        "DAANG BUKID": "KAINGIN (POB.)",
        "TABING DAGAT": "KAINGIN (POB.)",
        DIGMAN: "KAINGIN DIGMAN",
        KAINGIN: "KAINGIN DIGMAN",
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
        "KAINGIN DIGMAN": "KAINGIN DIGMAN",
      };

      const barangay =
        BARANGAY_MIGRATION_MAP[rawBarangay.toUpperCase()] || rawBarangay;

      const dateCommitted = parseDateTime(
        row["DATE_COMMITTED"],
        row["TIME_COMMITTED"],
      );
      if (!dateCommitted) {
        errors.push({
          row: rowNum,
          field: "DATE_COMMITTED",
          message: "Missing or invalid date committed",
        });
        continue;
      }

      // Duplicate check
      const dup = await pool.query(
        `SELECT 1 FROM blotter_entries WHERE blotter_entry_number = $1`,
        [blotterNo],
      );
      if (dup.rows.length > 0) {
        duplicates.push({ row: rowNum, blotter_entry_number: blotterNo });
        continue;
      }

      const dateReported = parseDateTime(
        row["DATE_REPORTED"],
        row["TIME_REPORTED"],
      );

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
            if (cleaned.length === 10 && cleaned.startsWith("9"))
              return "0" + cleaned;
            return cleaned;
          })(),
          region: str(row["C_REGION"]) || "Region IV-A (CALABARZON)",
          district_province: str(row["C_PROVINCE"]) || "Cavite",
          city_municipality: str(row["C_CITY_MUNICIPALITY"]) || "Bacoor City",
          barangay: str(row["C_BARANGAY"]),
          house_street: str(row["C_HOUSE_STREET"]) || "N/A",
          info_obtained: str(row["C_INFO_OBTAINED"]) || "Walk-in",
          occupation: str(row["C_OCCUPATION"]),
          role: (() => {
            const r = str(row["C_ROLE"]);
            const valid = ["Victim", "Complainant", "Witness", "Respondent"];
            return valid.includes(r) ? r : "Victim";
          })(),
          relationship_to_victim: str(row["C_RELATIONSHIP_TO_VICTIM"]) || null,
          witness_statement: str(row["C_WITNESS_STATEMENT"]) || null,
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
          degree_participation:
            str(row["S_DEGREE_PARTICIPATION"]) || "Principal",
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
          stage_of_felony:
            str(row["O_STAGE_OF_FELONY"]) ||
            str(row["STAGE_OF_FELONY"]) ||
            "COMPLETED",
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
            r.blotterNo,
            r.incidentType,
            "Region IV-A (CALABARZON)",
            "Cavite",
            "Bacoor City",
            r.barangay,
            r.placeStreet,
            r.typeOfPlace,
            r.placeCommission,
            r.narrative,
            r.stageOfFelony,
            r.modus,
            r.dateCommitted,
            r.dateReported,
            false,
            false,
            r.dayOfWeek,
            r.monthName,
            r.caseStatus,
            r.caseSolveType,
            r.lat,
            r.lng,
            r.amount,
            r.complainant.first_name
              ? `${r.complainant.first_name} ${r.complainant.last_name || ""}`.trim()
              : null,
            r.suspect.first_name
              ? `${r.suspect.first_name} ${r.suspect.last_name || ""}`.trim()
              : null,
            "bantay_import",
            r.batchId || batchId,
            false,
          ],
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
    info_obtained, occupation, role, relationship_to_victim, witness_statement
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
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
              r.complainant.role || "Victim",
              r.complainant.relationship_to_victim || null,
              r.complainant.witness_statement || null,
            ],
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
          ],
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
          ],
        );

        // 5. Auto-link or auto-create modus in crime_modus_reference
        if (r.offense.modus) {
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
            "CARNAPPING - MC": "CARNAPPING - MC",
            "CARNAPPING - MV": "CARNAPPING - MV",
          };

          const crimeType = OFFENSE_TO_CRIME_TYPE[r.offense.offense_name];

          if (crimeType) {
            // Split modus by comma in case multiple are stored as one string
            const modusList = r.offense.modus
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean);

            for (const modusName of modusList) {
              // Check if modus already exists for this crime type
              const existing = await client.query(
                `SELECT id FROM crime_modus_reference
                 WHERE UPPER(crime_type) = $1 AND LOWER(modus_name) = LOWER($2)`,
                [crimeType, modusName],
              );

              let modusRefId;

              if (existing.rows.length > 0) {
                // Already exists — use it
                modusRefId = existing.rows[0].id;

                // Make sure it's active
                await client.query(
                  `UPDATE crime_modus_reference SET is_active = true WHERE id = $1`,
                  [modusRefId],
                );
              } else {
                // Doesn't exist — auto-create it
                const created = await client.query(
                  `INSERT INTO crime_modus_reference (crime_type, modus_name, is_active)
                   VALUES ($1, $2, true) RETURNING id`,
                  [crimeType, modusName],
                );
                modusRefId = created.rows[0].id;
              }

              // Link to this blotter via crime_modus table
              await client.query(
                `INSERT INTO crime_modus (blotter_id, modus_reference_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [blotterId, modusRefId],
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

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Blotters Imported",
      description: `Imported ${actualInserted} blotter(s) — ${duplicates.length} duplicate(s) skipped, ${errors.length} error(s) (batch: ${batchId})`,
      action: "CREATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });

    await notifyAllByRole(
      ["Administrator", "Technical Administrator"],
      {
        senderId: req.user.user_id,
        senderName: req.user.username,
        type: "NEW_REFERRAL",
        title: "Blotters Imported",
        message: `${req.user.username} imported ${actualInserted} blotter(s)`,
        linkTo: "/e-blotter",
      },
      req.user.user_id,
    );

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
      [id],
    );
    if (blotter.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Blotter not found" });
    }
    if (!blotter.rows[0].referred_by_barangay) {
      return res
        .status(400)
        .json({ success: false, message: "Not a barangay referral" });
    }
    if (blotter.rows[0].status !== "Pending") {
      return res
        .status(400)
        .json({ success: false, message: "Already accepted" });
    }

    // Use transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Update status to Under Investigation
      await client.query(
        `UPDATE blotter_entries SET status = 'Under Investigation', updated_at = NOW() WHERE blotter_id = $1`,
        [id],
      );

      // Auto-create case
      await autoCreateCase(client, parseInt(id), req.user.user_id);

      await client.query("COMMIT");

      await logAudit({
        userId: req.user?.user_id,
        username: req.user?.username,
        eventName: "Referral Accepted",
        description: `Accepted barangay referral for blotter ID ${id}`,
        action: "UPDATE",
        status: "success",
        source: "Web Portal",
        ipAddress: getClientIp(req),
      });

      const referralRow = await pool.query(
        `SELECT submitted_by, place_barangay, blotter_entry_number FROM blotter_entries WHERE blotter_id = $1`,
        [id]
      );

      // Notify barangay submitter
      if (referralRow.rows[0]?.submitted_by) {
        await createNotification({
          recipientId: referralRow.rows[0].submitted_by,
          senderId: req.user.user_id,
          senderName: req.user.username,
          type: "REFERRAL_ACCEPTED",
          title: "Referral Accepted",
          message: `Your referral has been accepted and is now under investigation.`,
          linkTo: "/brgy-report",
        });
      }

      // Notify admins
      await notifyAllByRole(["Administrator", "Technical Administrator"], {
        senderId: req.user.user_id,
        senderName: req.user.username,
        type: "REFERRAL_ACCEPTED",
        title: "Referral Accepted",
        message: `${req.user.username} accepted referral ${blotter.rows[0].blotter_entry_number} (Brgy. ${referralRow.rows[0]?.place_barangay}).`,
        linkTo: "/e-blotter",
      }, req.user.user_id);

      // Notify patrols assigned to the referral's barangay
      if (referralRow.rows[0]?.place_barangay) {
        await notifyPatrolsForReferral(referralRow.rows[0].place_barangay, {
          senderId: req.user.user_id,
          senderName: req.user.username,
          type: "REFERRAL_ACCEPTED",
          title: "Referral Accepted",
          message: `${req.user.username} accepted referral ${blotter.rows[0].blotter_entry_number} in Brgy. ${referralRow.rows[0].place_barangay}.`,
          linkTo: "/e-blotter",
        }, req.user.user_id);
      }

      return res
        .status(200)
        .json({ success: true, message: "Referral accepted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Accept referral error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error accepting referral" });
  }
};


const createBrgyReport = async (req, res) => {
  try {
    const {
      incident_type,
      date_time_commission,
      date_time_reported,
      place_barangay,
      place_street,
      narrative,
      victims,
    } = req.body;

    const resolvedIncidentType = incident_type || "Special Complex Crime";

    const errors = [];
    if (!date_time_commission)
      errors.push("Date & time of commission is required");
    if (!date_time_reported) errors.push("Date & time reported is required");
    if (!place_barangay) errors.push("Barangay is required");
    if (!place_street) errors.push("Street is required");
    if (!narrative || narrative.trim().length < 20)
      errors.push("Narrative must be at least 20 characters");
    if (!place_street || place_street.trim().length < 2)
      errors.push("Street must be at least 2 characters");
    if (!victims || victims.length === 0)
      errors.push("At least one person involved is required");
    else {
      victims.forEach((v, i) => {
        if (!v.first_name)
          errors.push(`Person #${i + 1} first name is required`);
        if (!v.last_name) errors.push(`Person #${i + 1} last name is required`);
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const year = new Date(date_time_commission).getFullYear();
      const countResult = await client.query(
        `SELECT COUNT(*) FROM blotter_entries WHERE EXTRACT(YEAR FROM created_at) = $1
         AND blotter_entry_number NOT LIKE 'SEED-%' AND blotter_entry_number NOT LIKE 'IMP-%'`,
        [year],
      );
      const count = parseInt(countResult.rows[0].count) + 1;
      const seq = count.toString().padStart(6, "0");
      const blotterNumber = `BRGY-${year}-${seq}`;

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
          blotterNumber,
          resolvedIncidentType,
          date_time_commission,
          date_time_reported,
          "Region IV-A (CALABARZON)",
          "Cavite",
          "Bacoor City",
          place_barangay,
          place_street,
          narrative,
          true,
          "Pending",
          req.user.user_id,
        ],
      );

      const blotterId = blotterResult.rows[0].blotter_id;
      for (const v of victims) {
        await client.query(
          `INSERT INTO complainants (
            blotter_id, first_name, middle_name, last_name, gender, nationality,
            house_street, info_obtained, contact_number, role,
            relationship_to_victim, witness_statement
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            blotterId,
            v.first_name,
            v.middle_name || null,
            v.last_name,
            v.gender || "Male",
            v.nationality || "FILIPINO",
            v.house_street || null,
            "Walk-in",
            v.contact_number || null,
            v.role || "Victim",
            v.relationship_to_victim || null,
            v.witness_statement || null,
          ],
        );
      }

      await client.query(
        `INSERT INTO offenses (
          blotter_id, offense_name, stage_of_felony, index_type,
          is_principal_offense, investigator_on_case, most_investigator
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          blotterId,
          resolvedIncidentType,
          "COMPLETED",
          "Index",
          true,
          "N/A",
          "N/A",
        ],
      );

      await client.query("COMMIT");
      await logAudit({
        userId: req.user?.user_id,
        username: req.user?.username,
        eventName: "Barangay Report Submitted",
        description: `Submitted barangay report "${blotterNumber}" for incident type "${resolvedIncidentType}"`,
        action: "CREATE",
        status: "success",
        source: "Web Portal",
        ipAddress: getClientIp(req),
      });
      await notifyAllByRole(
        ["Administrator", "Technical Administrator"],
        {
          senderId: req.user.user_id,
          senderName: req.user.username,
          type: "NEW_REFERRAL",
          title: "New Barangay Referral",
          message: `New referral submitted: ${resolvedIncidentType} in Brgy. ${place_barangay}`,
          linkTo: "/e-blotter",
        },
        req.user.user_id,
      );

      await notifyPatrolsForReferral(
        place_barangay,
        {
          senderId: req.user.user_id,
          senderName: req.user.username,
          type: "NEW_REFERRAL",
          title: "New Barangay Referral",
          message: `New referral submitted: ${resolvedIncidentType} in Brgy. ${place_barangay}`,
          linkTo: "/e-blotter",
        },
        req.user.user_id,
      );
      return res.status(201).json({
        success: true,
        message: "Report submitted successfully! Awaiting police review.",
        data: { blotter_entry_number: blotterNumber, blotter_id: blotterId },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Brgy report error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error submitting report" });
  }
};

const getBrgyReports = async (req, res) => {
  try {
    // Get all reports for this user
    const result = await pool.query(
      `SELECT 
        b.blotter_id, 
        b.blotter_entry_number, 
        b.incident_type,
        b.place_barangay, 
        b.place_street, 
        b.date_time_commission,
        b.date_time_reported, 
        b.status, 
        b.created_at
      FROM blotter_entries b
      WHERE b.referred_by_barangay = true
        AND b.submitted_by = $1
        AND b.is_deleted = false
      ORDER BY b.created_at DESC`,
      [req.user.user_id],
    );

    // Get responder info for each blotter from notifications
    const blotterIds = result.rows.map((row) => row.blotter_id);

    let respondersMap = {};
    if (blotterIds.length > 0) {
      // Import the notification service function
      const {
        getRespondersForReferrals,
      } = require("../../notifications/notificationService");
      respondersMap = await getRespondersForReferrals(blotterIds);
    }

    // Merge responder data into each report
    const reportsWithResponders = result.rows.map((row) => ({
      ...row,
      responder: respondersMap[row.blotter_id] || null,
    }));

    return res.status(200).json({ success: true, data: reportsWithResponders });
  } catch (error) {
    console.error("Get brgy reports error:", error);
    res.status(500).json({ success: false, message: "Error fetching reports" });
  }
};

const getReferredCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM blotter_entries 
       WHERE referred_by_barangay = true 
         AND status = 'Pending' 
         AND is_deleted = false`,
    );
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const detectCrimeType = async (req, res) => {
  const { narrative } = req.body;

  if (!narrative || narrative.trim().length < 20) {
    return res.status(400).json({
      success: false,
      message: "Narrative must be at least 20 characters",
    });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GROQ_MODEL =
    process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

  if (!GROQ_API_KEY) {
    return res.status(500).json({
      success: false,
      message: "AI service not configured",
    });
  }

  const VALID_CRIME_TYPES = [
    "Carnapping - MC",
    "Carnapping - MV",
    "Homicide",
    "Murder",
    "Physical Injury",
    "Rape",
    "Robbery",
    "Special Complex Crime",
    "Theft",
  ];

  const prompt = `You are a PNP crime classifier. Given an incident narrative, classify it into exactly one of these crime types, OR respond with NOT_AN_INDEX_CRIME if it does not describe a valid criminal offense against a human person.

Valid crime types:
${VALID_CRIME_TYPES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Crime type definitions:
- Carnapping - MC: theft or taking of a motorcycle without owner's consent
- Carnapping - MV: theft or taking of a motor vehicle (car, truck, jeep) without owner's consent
- Homicide: unlawful killing of a human person without premeditation
- Murder: intentional, premeditated killing of a human person; ambush, treachery, or evident premeditation
- Physical Injury: bodily harm inflicted on a HUMAN person; mauling, hitting, stabbing without intent to kill
- Rape: sexual assault against a human person
- Robbery: taking property from a HUMAN person using force, violence, or intimidation
- Special Complex Crime: a single act constituting two or more grave felonies against a human person
- Theft: taking property without owner's consent but without violence or intimidation

CRITICAL RULES — respond NOT_AN_INDEX_CRIME when ANY of these apply:
1. The victim or subject of harm is a non-human animal (aso, pusa, ibon, ipis, daga, manok, baboy, hayop, cockroach, dog, cat, rat, pig, bird, insect, etc.)
2. The narrative describes harming or destroying an object or property with no human victim (upuan, mesa, bato, tabla, etc.)
3. The narrative is incoherent, fictional, clearly a test, or does not describe any real criminal incident
4. The narrative describes an accident with no criminal act (e.g. fell down stairs, slipped)
5. There is no identifiable human victim or human suspect in the narrative
6. The act described is trivial or not punishable under Philippine criminal law

Narrative: "${narrative.trim()}"

Reply with ONLY the exact crime type name from the list above, OR the exact text NOT_AN_INDEX_CRIME. No explanation. No punctuation. Nothing else.`;

  try {
    const axios = require("axios");
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 20,
      },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
      },
    );

    const raw = response.data?.choices?.[0]?.message?.content?.trim() || "";

    // Check for explicit non-crime response
    if (raw.toUpperCase() === "NOT_AN_INDEX_CRIME") {
      return res.json({
        success: true,
        crime_type: null,
        not_an_index_crime: true,
        confident: true,
        raw,
      });
    }

    const matched = VALID_CRIME_TYPES.find(
      (c) => c.toLowerCase() === raw.toLowerCase(),
    );

    if (!matched) {
      return res.json({
        success: true,
        crime_type: null,
        not_an_index_crime: true,
        confident: false,
        raw,
      });
    }

    return res.json({
      success: true,
      crime_type: matched,
      not_an_index_crime: false,
      confident: true,
      raw,
    });
  } catch (error) {
    console.error("detectCrimeType error:", error.message);
    const isRateLimit =
      error.response?.status === 429 ||
      (error.message || "").toLowerCase().includes("rate limit");
    return res.json({
      success: true,
      crime_type: null,
      not_an_index_crime: false,
      confident: false,
      fallback: true,
      rate_limited: isRateLimit,
    });
  }
};

const respondToReferral = async (req, res) => {
  try {
    const { id } = req.params;

    const blotter = await pool.query(
      `SELECT * FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [id],
    );
    if (blotter.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Blotter not found" });
    if (!blotter.rows[0].referred_by_barangay)
      return res
        .status(400)
        .json({ success: false, message: "Not a barangay referral" });
    if (blotter.rows[0].status !== "Pending")
      return res
        .status(400)
        .json({ success: false, message: "Already accepted" });

    // Check if someone already claimed this via notifications
    const existing = await getResponderForReferral(id);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Already responded by ${existing.sender_name}`,
      });
    }

    const responderName = req.user.username;
    const linkTo = `/e-blotter?referral=${id}`;
    const blotterNumber = blotter.rows[0].blotter_entry_number;

    // Notify admins + tech admins (exclude self)
    await notifyAllByRole(
      ["Administrator", "Technical Administrator"],
      {
        senderId: req.user.user_id,
        senderName: responderName,
        type: "REFERRAL_RESPONDED",
        title: "Response to Referral",
        message: `${responderName} will respond to referral ${blotterNumber}`,
        linkTo,
      },
      req.user.user_id,
    );
    // Notify other patrols assigned to this barangay so they know not to go
    await notifyPatrolsForReferral(
      blotter.rows[0].place_barangay,
      {
        senderId: req.user.user_id,
        senderName: responderName,
        type: "REFERRAL_RESPONDED",
        title: "Referral Already Responded",
        message: `${responderName} is responding to ${blotterNumber}. No need to respond.`,
        linkTo,
      },
      req.user.user_id,
    );

    // Notify the barangay submitter
    if (blotter.rows[0].submitted_by) {
      await createNotification({
        recipientId: blotter.rows[0].submitted_by,
        senderId: req.user.user_id,
        senderName: responderName,
        type: "REFERRAL_RESPONDED",
        title: "Referral Responded",
        message: `${responderName} will respond to your referral ${blotterNumber}.`,
        linkTo: "/brgy-report",
      });
    }

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Response to Referral",
      description: `${responderName} responded to referral ID ${id}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      message: "You have respond this referral",
      responder_name: responderName,
    });
  } catch (error) {
    console.error("Respond to referral error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error responding to referral" });
  }
};

const remindPatrols = async (req, res) => {
  try {
    // Role check - only Administrators and Technical Administrators can send reminders
    const userRole = req.user?.role;
    if (
      userRole !== "Administrator" &&
      userRole !== "Technical Administrator"
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only Administrators can send reminders.",
      });
    }

    const { id } = req.params;
    const { patrol_ids } = req.body;

    if (!patrol_ids || patrol_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No patrol officers selected",
      });
    }

    // Check blotter exists and is a brgy referral without responder
    const blotter = await pool.query(
      `SELECT * FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [id],
    );

    if (blotter.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Blotter not found" });
    }

    if (!blotter.rows[0].referred_by_barangay) {
      return res
        .status(400)
        .json({ success: false, message: "Not a barangay referral" });
    }

    // Check if someone already responded
    const existing = await getResponderForReferral(id);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Already responded by ${existing.sender_name}`,
      });
    }

    const blotterNumber = blotter.rows[0].blotter_entry_number;
    const linkTo = `/e-blotter?referral=${id}`;

    // Send reminders to selected patrols
    let successCount = 0;
    for (const patrolId of patrol_ids) {
      await createNotification({
        recipientId: patrolId,
        senderId: req.user.user_id,
        senderName: req.user.username,
        type: "REFERRAL_REMINDER",
        title: "⚠️ Referral Reminder",
        message: `${req.user.username} is reminding you to respond to referral #${blotterNumber}`,
        linkTo: linkTo,
      });
      successCount++;
    }

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Patrol Reminded",
      description: `Sent reminders for referral ${blotterNumber} to ${successCount} patrol officer(s)`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      message: `Reminders sent to ${successCount} patrol officer(s)`,
      count: successCount,
    });
  } catch (error) {
    console.error("Remind patrols error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error sending reminders" });
  }
};

// Add this function to get patrol users for the modal
const getPatrolUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.profile_picture,
              pr.abbreviation as rank_abbreviation
       FROM users u
       LEFT JOIN pnp_ranks pr ON u.rank_id = pr.rank_id
       JOIN roles r ON u.role_id = r.role_id
       WHERE r.role_name = 'Patrol' AND u.status = 'verified'
       ORDER BY u.first_name ASC`,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching patrol users:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createBlotter,
  getAllBlotters,
  getReferredCount,
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
  detectCrimeType,
  respondToReferral,
  remindPatrols, // ← add this
  getPatrolUsers, // ← add this
};
