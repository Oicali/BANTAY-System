// backend\features\blotter\controllers\blotterController.js

const Blotter = require("../models/Blotter");
const pool = require("../../../config/database");
const { logAudit, getClientIp } = require("../../../shared/utils/auditLogger");
const { scheduleReferralReminders } = require("../../../jobs/referralReminderJob");
const {
  createNotification,
  notifyAllByRole,
  getResponderForReferral,
  notifyPatrolsForReferral,
} = require("../../notifications/notificationService");
const xlsx = require("xlsx");
const {
  normalizeOffense,
  normalizeBarangay,
  deriveFromDate,
} = require("../utils/importUtils");
const { VALID_BARANGAYS } = require("../utils/barangayList");
const { v4: uuidv4 } = require("uuid");

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

  if (!complainant.gender) errors.push(`${prefix} Gender is required`);
  if (!complainant.nationality)
    errors.push(`${prefix} Nationality is required`);
  if (!complainant.info_obtained)
    errors.push(`${prefix} Info obtained is required`);
  const validRoles = ["Victim", "Complainant", "Witness", "Respondent"];
  if (complainant.role && !validRoles.includes(complainant.role)) {
    errors.push(`${prefix} has an invalid role`);
  }

  if (
    complainant.witness_statement &&
    complainant.witness_statement.length > 500
  ) {
    errors.push(`${prefix} witness statement must be under 500 characters`);
  }

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

  if (suspect.house_street && suspect.house_street.trim().length > 0) {
    if (
      suspect.house_street.trim().length < 2 ||
      suspect.house_street.trim().length > 200
    ) {
      errors.push(`${prefix} House/Street must be 2-200 characters`);
    }
  }
  if (suspect.age) {
    const age = parseInt(suspect.age);
    if (age < 10 || age > 120) {
      errors.push(`${prefix} Age must be between 10 and 120`);
    }
  }

  if (suspect.height_cm) {
    const height = parseInt(suspect.height_cm);
    if (height < 50 || height > 250) {
      errors.push(`${prefix} Height must be between 50-250 cm`);
    }
  }

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

  if (!blotterData.narrative) {
    errors.push("Narrative is required");
  } else if (
    blotterData.narrative.length < 20 ||
    blotterData.narrative.length > 5000
  ) {
    errors.push("Narrative must be 20-5000 characters");
  }

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

    allErrors.push(...validateBlotterData(blotterData));

    if (!complainants || complainants.length === 0) {
      allErrors.push("At least one complainant is required");
    } else {
      complainants.forEach((complainant, index) => {
        allErrors.push(...validateComplainant(complainant, index));
      });
    }

    if (suspects && suspects.length > 0) {
      suspects.forEach((suspect, index) => {
        if (!suspect.first_name || suspect.first_name.trim() === "") return;
        allErrors.push(...validateSuspect(suspect, index));
      });
    }

    if (allErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: allErrors,
      });
    }

    const result = await Blotter.create(
      blotterData,
      complainants,
      suspects,
      offenses,
    );

    await autoCreateCase(
      pool,
      result.blotter_id || result.id,
      req.user.user_id,
    );

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Crime Report Created",
      description: `Created crime report for incident type "${blotterData.incident_type}"`,
      action: "CREATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.status(201).json({
      success: true,
      message: "Crime report created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Create crime report error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating crime report",
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

    let results = blotters;
    if (req.query.referred === "false") {
      results = blotters.filter(
        (b) => !b.referred_by_barangay || b.status !== "Pending"
      );
    } else if (req.query.referred === "true") {
      results = blotters.filter(
        (b) => b.referred_by_barangay === true && b.status === "Pending"
      );
    }

    if (req.query.barangay && req.user?.role === "Patrol") {
      const reminderResult = await pool.query(
        `SELECT link_to FROM notifications
         WHERE recipient_user_id = $1
           AND type = 'REFERRAL_REMINDER'
         ORDER BY created_at DESC`,
        [req.user.user_id]
      );

      const reminderIds = reminderResult.rows
        .map(r => {
          const match = r.link_to?.match(/referral=(\d+)$/);
          return match ? parseInt(match[1]) : null;
        })
        .filter(Boolean);

      if (reminderIds.length > 0) {
        const alreadyIncluded = new Set(results.map(b => b.blotter_id));
        const missingIds = reminderIds.filter(id => !alreadyIncluded.has(id));

        if (missingIds.length > 0) {
          const extraBlotters = await pool.query(
            `SELECT * FROM blotter_entries
             WHERE blotter_id = ANY($1::int[])
               AND is_deleted = false
               AND referred_by_barangay = true`,
            [missingIds]
          );
          const tagged = extraBlotters.rows.map(b => ({
            ...b,
            _reminder_access: true,
          }));
          results = [...results, ...tagged];
        }
      }
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
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      return res.status(400).json({ success: false, message: "Invalid crime report ID" });
    }
    const blotter = await Blotter.getByIdRaw(parsedId);

    if (!blotter) {
      return res.status(404).json({
        success: false,
        message: "Crime report not found",
      });
    }

    res.status(200).json({
      success: true,
      data: blotter,
    });
  } catch (error) {
    console.error("Get crime report error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching crime report",
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
        message: "Crime report not found",
      });
    }

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Crime Report Status Updated",
      description: `Updated crime report ID ${id} status to "${status}"`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.status(200).json({
      success: true,
      message: "Crime report status updated successfully",
      data: blotter,
    });
  } catch (error) {
    console.error("Update crime report error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating crime report",
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
        message: "Crime report not found",
      });
    }
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Crime Report Deleted",
      description: `Soft-deleted crime report ID ${id}`,
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
      message: "Crime report deleted successfully",
    });
  } catch (error) {
    console.error("Delete crime report error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting crime report",
      error: error.message,
    });
  }
};

const updateBlotter = async (req, res) => {
  try {
    const { id } = req.params;
    const { blotterData, complainants, suspects, offenses } = req.body;

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
        .json({ success: false, message: "Crime report not found" });
    }

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Crime Report Updated",
      description: `Updated crime report ID ${id}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.status(200).json({
      success: true,
      message: "Crime report updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update crime report error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating crime report",
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
      eventName: "Crime Report Restored",
      description: `Restored crime report ID ${id}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, message: "Crime report restored successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// IMPORT — VALID_CRIME_TYPES / OFFENSE_TO_CRIME_TYPE / BARANGAY MAP
// ============================================================

const VALID_CRIME_TYPES = [
  "Carnapping - MC", "Carnapping - MV", "Homicide", "Murder",
  "Physical Injury", "Rape", "Robbery", "Special Complex Crime", "Theft",
];

const OFFENSE_TO_CRIME_TYPE = {
  Murder: "MURDER", Homicide: "HOMICIDE", "Physical Injury": "PHYSICAL INJURIES",
  Rape: "RAPE", Robbery: "ROBBERY", Theft: "THEFT",
  "Carnapping - MC": "CARNAPPING - MC", "Carnapping - MV": "CARNAPPING - MV",
  "Special Complex Crime": "SPECIAL COMPLEX CRIME",
};

const BARANGAY_MIGRATION_MAP = {
  ALIMA: "SINEGUELASAN", BANALO: "SINEGUELASAN", SINBANALI: "SINEGUELASAN",
  CAMPOSANTO: "KAINGIN (POB.)", "DAANG BUKID": "KAINGIN (POB.)", "TABING DAGAT": "KAINGIN (POB.)",
  DIGMAN: "KAINGIN DIGMAN", KAINGIN: "KAINGIN DIGMAN",
  PANAPAAN: "P.F. ESPIRITU I (PANAPAAN)", "PANAPAAN 1": "P.F. ESPIRITU I (PANAPAAN)",
  "PANAPAAN 2": "P.F. ESPIRITU II", "PANAPAAN 3": "P.F. ESPIRITU II",
  "PANAPAAN 4": "P.F. ESPIRITU IV", "PANAPAAN 5": "P.F. ESPIRITU V", "PANAPAAN 6": "P.F. ESPIRITU VI",
  "PANAPAAN I": "P.F. ESPIRITU I (PANAPAAN)", "PANAPAAN II": "P.F. ESPIRITU II",
  "PANAPAAN III": "P.F. ESPIRITU II", "PANAPAAN IV": "P.F. ESPIRITU IV",
  "PANAPAAN V": "P.F. ESPIRITU V", "PANAPAAN VI": "P.F. ESPIRITU VI",
  "P.F. ESPIRITU 1 (PANAPAAN)": "P.F. ESPIRITU I (PANAPAAN)", "P.F. ESPIRITU 2": "P.F. ESPIRITU II",
  "P.F. ESPIRITU 3": "P.F. ESPIRITU III", "P.F. ESPIRITU 4": "P.F. ESPIRITU IV",
  "P.F. ESPIRITU 5": "P.F. ESPIRITU V", "P.F. ESPIRITU 6": "P.F. ESPIRITU VI",
  "ANIBAN 1": "ANIBAN I", "ANIBAN 2": "ANIBAN II",
  "HABAY 1": "HABAY I", "HABAY 2": "HABAY II",
  "LIGAS 1": "LIGAS I", "LIGAS 2": "LIGAS II",
  "MABOLO 1": "MABOLO", "MABOLO 2": "MABOLO", "MABOLO 3": "MABOLO",
  "MABOLO I": "MABOLO", "MABOLO II": "MABOLO", "MABOLO III": "MABOLO",
  "MALIKSI 1": "MALIKSI I", "MALIKSI 2": "MALIKSI II", "MALIKSI 3": "MALIKSI II", "MALIKSI III": "MALIKSI II",
  "MAMBOG 1": "MAMBOG I", "MAMBOG 2": "MAMBOG II", "MAMBOG 3": "MAMBOG III",
  "MAMBOG 4": "MAMBOG IV", "MAMBOG 5": "MAMBOG II", "MAMBOG V": "MAMBOG II",
  "MOLINO 1": "MOLINO I", "MOLINO 2": "MOLINO II", "MOLINO 3": "MOLINO III",
  "MOLINO 4": "MOLINO IV", "MOLINO 5": "MOLINO V", "MOLINO 6": "MOLINO VI", "MOLINO 7": "MOLINO VII",
  "NIOG 1": "NIOG", "NIOG 2": "NIOG", "NIOG 3": "NIOG", "NIOG I": "NIOG", "NIOG II": "NIOG", "NIOG III": "NIOG",
  "REAL 1": "REAL", "REAL 2": "REAL", "REAL I": "REAL", "REAL II": "REAL",
  "SALINAS 1": "SALINAS I", "SALINAS 2": "SALINAS II", "SALINAS 3": "SALINAS II",
  "SALINAS 4": "SALINAS II", "SALINAS III": "SALINAS II", "SALINAS IV": "SALINAS II",
  "SAN NICOLAS 1": "SAN NICOLAS I", "SAN NICOLAS 2": "SAN NICOLAS II", "SAN NICOLAS 3": "SAN NICOLAS III",
  "TALABA 1": "TALABA I", "TALABA 2": "TALABA II", "TALABA 3": "TALABA III",
  "TALABA 4": "TALABA III", "TALABA 5": "TALABA III", "TALABA 6": "TALABA III", "TALABA 7": "TALABA I",
  "TALABA IV": "TALABA III", "TALABA V": "TALABA III", "TALABA VI": "TALABA III", "TALABA VII": "TALABA I",
  "ZAPOTE 1": "ZAPOTE I", "ZAPOTE 2": "ZAPOTE II", "ZAPOTE 3": "ZAPOTE III",
  "ZAPOTE 4": "ZAPOTE II", "ZAPOTE IV": "ZAPOTE II",
  "KAINGIN DIGMAN": "KAINGIN DIGMAN",
};

// ============================================================
// IMPORT BLOTTERS (bulk / chunked — safe for 5,000+ rows)
// ============================================================

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
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const int = (v) => { const n = parseInt(v); return isNaN(n) ? 0 : n; };
    const bool = (v) => {
      if (v === null || v === undefined || v === "") return false;
      return String(v).trim().toUpperCase() === "YES" || v === true || v === 1;
    };

    const parseDate = (v) => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number") {
        const days = Math.floor(v);
        const utcAnchor = new Date((days - 25569) * 86400 * 1000);
        return new Date(utcAnchor.getUTCFullYear(), utcAnchor.getUTCMonth(), utcAnchor.getUTCDate());
      }
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    const excelFractionToHM = (frac) => {
      const totalMinutes = Math.round(frac * 24 * 60);
      return { hours: Math.floor(totalMinutes / 60) % 24, minutes: totalMinutes % 60 };
    };

    const parseDateTime = (dateVal, timeVal) => {
      const d = parseDate(dateVal);
      if (!d) return null;
      let hours = 0, minutes = 0;
      if (typeof timeVal === "number") {
        ({ hours, minutes } = excelFractionToHM(timeVal));
      } else if (timeVal && String(timeVal).includes(":")) {
        const parts = String(timeVal).split(":");
        hours = parseInt(parts[0]) || 0;
        minutes = parseInt(parts[1]) || 0;
      } else if (typeof dateVal === "number" && dateVal % 1 !== 0) {
        ({ hours, minutes } = excelFractionToHM(dateVal % 1));
      }
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    const deriveDayOfWeek = (d) => !d ? null : ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
    const deriveMonth = (d) => !d ? null : ["January","February","March","April","May","June","July","August","September","October","November","December"][d.getMonth()];

    // ── ONE upfront query to find existing Report IDs ──────
    const allBlotterNos = rows.map(r => str(r["BLOTTER_ENTRY_NUMBER"])).filter(Boolean);
    const existingResult = await pool.query(
      `SELECT blotter_entry_number FROM blotter_entries WHERE blotter_entry_number = ANY($1::text[])`,
      [allBlotterNos]
    );
    const existingSet = new Set(existingResult.rows.map(r => r.blotter_entry_number));
    const seenInFile = new Set();

    // ── process rows (validation only, no DB calls here) ───
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;

      const blotterNo = str(row["BLOTTER_ENTRY_NUMBER"]);
      if (!blotterNo) {
        errors.push({ row: rowNum, field: "BLOTTER_ENTRY_NUMBER", message: "Missing Report ID" });
        continue;
      }

      if (existingSet.has(blotterNo)) {
        duplicates.push({ row: rowNum, blotter_entry_number: blotterNo });
        continue;
      }
      if (seenInFile.has(blotterNo)) {
        errors.push({ row: rowNum, field: "BLOTTER_ENTRY_NUMBER", message: "Duplicate Report ID in file" });
        continue;
      }
      seenInFile.add(blotterNo);

      const incidentType = str(row["INCIDENT_TYPE"]);
      if (!incidentType) {
        errors.push({ row: rowNum, field: "INCIDENT_TYPE", message: "Missing incident type" });
        continue;
      }
      if (!VALID_CRIME_TYPES.some(c => c.toLowerCase() === incidentType.toLowerCase())) {
        errors.push({ row: rowNum, field: "INCIDENT_TYPE", message: `"${incidentType}" is not a valid PNP index crime` });
        continue;
      }

      const rawBarangay = str(row["PLACE_BARANGAY"]);
      if (!rawBarangay) {
        errors.push({ row: rowNum, field: "PLACE_BARANGAY", message: "Missing barangay" });
        continue;
      }

      const barangay = BARANGAY_MIGRATION_MAP[rawBarangay.toUpperCase()] || rawBarangay.toUpperCase();
      if (!VALID_BARANGAYS.includes(barangay)) {
        errors.push({ row: rowNum, field: "PLACE_BARANGAY", message: `"${rawBarangay}" is not a recognized barangay` });
        continue;
      }

      const dateCommitted = parseDateTime(row["DATE_COMMITTED"], row["TIME_COMMITTED"]);
      if (!dateCommitted) {
        errors.push({ row: rowNum, field: "DATE_COMMITTED", message: "Missing or invalid date committed" });
        continue;
      }

      const dateReported = parseDateTime(row["DATE_REPORTED"], row["TIME_REPORTED"]);

      inserted.push({
        rowNum, blotterNo, incidentType, barangay, dateCommitted,
        dateReported: dateReported || dateCommitted,
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
        amount: num(row["AMOUNT"]),
        lat: num(row["LAT"]),
        lng: num(row["LNG"]),
        complainant: {
          first_name: str(row["C_FIRST_NAME"]),
          middle_name: str(row["C_MIDDLE_NAME"]),
          last_name: str(row["C_LAST_NAME"]),
          qualifier: str(row["C_QUALIFIER"]),
          alias: str(row["C_ALIAS"]),
          gender: str(row["C_GENDER"]) || "Male",
          nationality: str(row["C_NATIONALITY"]) || "FILIPINO",
          contact_number: (() => {
            const n = str(row["C_CONTACT_NUMBER"]);
            if (!n) return null;
            const cleaned = n.replace(/\D/g, "");
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
          role: (() => {
            const r = str(row["C_ROLE"]);
            const valid = ["Victim", "Complainant", "Witness", "Respondent"];
            return valid.includes(r) ? r : "Victim";
          })(),
          relationship_to_victim: str(row["C_RELATIONSHIP_TO_VICTIM"]) || null,
          witness_statement: str(row["C_WITNESS_STATEMENT"]) || null,
        },
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

      const CHUNK_SIZE = 500;
      const caseRows = [];

      // Resolve/create ALL unique modus entries ONCE, before chunking
      const uniquePairs = new Map();
      for (const r of inserted) {
        const crimeType = OFFENSE_TO_CRIME_TYPE[r.offense.offense_name];
        if (!crimeType || !r.offense.modus) continue;
        const modusList = r.offense.modus.split(",").map(m => m.trim()).filter(Boolean);
        for (const modusName of modusList) {
          uniquePairs.set(`${crimeType}||${modusName.toLowerCase()}`, { crimeType, modusName });
        }
      }

      const pairArr = [...uniquePairs.values()];
      const modusIdMap = new Map();

      if (pairArr.length > 0) {
        const existing = await client.query(
          `SELECT id, crime_type, modus_name FROM crime_modus_reference
           WHERE (UPPER(crime_type), LOWER(modus_name)) IN (
             SELECT UNNEST($1::text[]), UNNEST($2::text[])
           )`,
          [pairArr.map(p => p.crimeType), pairArr.map(p => p.modusName.toLowerCase())]
        );
        for (const row of existing.rows) {
          modusIdMap.set(`${row.crime_type}||${row.modus_name.toLowerCase()}`, row.id);
        }
        const existingIds = existing.rows.map(r => r.id);
        if (existingIds.length > 0) {
          await client.query(`UPDATE crime_modus_reference SET is_active = true WHERE id = ANY($1::int[])`, [existingIds]);
        }

        const missing = pairArr.filter(p => !modusIdMap.has(`${p.crimeType}||${p.modusName.toLowerCase()}`));
        if (missing.length > 0) {
          const created = await client.query(
            `INSERT INTO crime_modus_reference (crime_type, modus_name, is_active)
             SELECT * FROM UNNEST($1::text[], $2::text[], $3::boolean[])
             RETURNING id, crime_type, modus_name`,
            [missing.map(p => p.crimeType), missing.map(p => p.modusName), missing.map(() => true)]
          );
          for (const row of created.rows) {
            modusIdMap.set(`${row.crime_type}||${row.modus_name.toLowerCase()}`, row.id);
          }
        }
      }

      // ── chunk loop ──
      for (let i = 0; i < inserted.length; i += CHUNK_SIZE) {
        const chunk = inserted.slice(i, i + CHUNK_SIZE);

        const blotterInsertResult = await client.query(
          `INSERT INTO blotter_entries (
            blotter_entry_number, incident_type, place_region, place_district_province,
            place_city_municipality, place_barangay, place_street, type_of_place,
            place_commission, narrative, stage_of_felony, modus,
            date_time_commission, date_time_reported, referred_by_barangay, referred_by_dilg,
            day_of_incident, month_of_incident, status, case_solve_type,
            lat, lng, amount_involved, victim, suspect_text, data_source, import_batch_id, is_deleted
          )
          SELECT * FROM UNNEST(
            $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
            $8::text[], $9::text[], $10::text[], $11::text[], $12::text[],
            $13::timestamp[], $14::timestamp[], $15::boolean[], $16::boolean[],
            $17::text[], $18::text[], $19::text[], $20::text[],
            $21::numeric[], $22::numeric[], $23::numeric[], $24::text[], $25::text[],
            $26::text[], $27::text[], $28::boolean[]
          )
          RETURNING blotter_id`,
          [
            chunk.map(r => r.blotterNo),
            chunk.map(r => r.incidentType),
            chunk.map(() => "Region IV-A (CALABARZON)"),
            chunk.map(() => "Cavite"),
            chunk.map(() => "Bacoor City"),
            chunk.map(r => r.barangay),
            chunk.map(r => r.placeStreet),
            chunk.map(r => r.typeOfPlace),
            chunk.map(r => r.placeCommission),
            chunk.map(r => r.narrative),
            chunk.map(r => r.stageOfFelony),
            chunk.map(r => r.modus),
            chunk.map(r => r.dateCommitted),
            chunk.map(r => r.dateReported),
            chunk.map(() => false),
            chunk.map(() => false),
            chunk.map(r => r.dayOfWeek),
            chunk.map(r => r.monthName),
            chunk.map(r => r.caseStatus),
            chunk.map(r => r.caseSolveType),
            chunk.map(r => r.lat),
            chunk.map(r => r.lng),
            chunk.map(r => r.amount),
            chunk.map(r => r.complainant.first_name ? `${r.complainant.first_name} ${r.complainant.last_name || ""}`.trim() : null),
            chunk.map(r => r.suspect.first_name ? `${r.suspect.first_name} ${r.suspect.last_name || ""}`.trim() : null),
            chunk.map(() => "bantay_import"),
            chunk.map(() => batchId),
            chunk.map(() => false),
          ]
        );

        const blotterIds = blotterInsertResult.rows.map(r => r.blotter_id);
        chunk.forEach((r, idx) => { r.blotterId = blotterIds[idx]; });

        const withComplainant = chunk.filter(r => r.complainant.first_name);
        if (withComplainant.length > 0) {
          await client.query(
            `INSERT INTO complainants (
              blotter_id, first_name, middle_name, last_name, qualifier, alias,
              gender, nationality, contact_number, region, district_province,
              city_municipality, barangay, house_street, info_obtained, occupation,
              role, relationship_to_victim, witness_statement
            )
            SELECT * FROM UNNEST(
              $1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
              $7::text[], $8::text[], $9::text[], $10::text[], $11::text[],
              $12::text[], $13::text[], $14::text[], $15::text[], $16::text[],
              $17::text[], $18::text[], $19::text[]
            )`,
            [
              withComplainant.map(r => r.blotterId),
              withComplainant.map(r => r.complainant.first_name),
              withComplainant.map(r => r.complainant.middle_name),
              withComplainant.map(r => r.complainant.last_name),
              withComplainant.map(r => r.complainant.qualifier),
              withComplainant.map(r => r.complainant.alias),
              withComplainant.map(r => r.complainant.gender || "Male"),
              withComplainant.map(r => r.complainant.nationality || "FILIPINO"),
              withComplainant.map(r => r.complainant.contact_number),
              withComplainant.map(r => r.complainant.region),
              withComplainant.map(r => r.complainant.district_province),
              withComplainant.map(r => r.complainant.city_municipality),
              withComplainant.map(r => r.complainant.barangay),
              withComplainant.map(r => r.complainant.house_street),
              withComplainant.map(r => r.complainant.info_obtained),
              withComplainant.map(r => r.complainant.occupation),
              withComplainant.map(r => r.complainant.role || "Victim"),
              withComplainant.map(r => r.complainant.relationship_to_victim),
              withComplainant.map(r => r.complainant.witness_statement),
            ]
          );
        }

        await client.query(
          `INSERT INTO suspects (
            blotter_id, first_name, middle_name, last_name, qualifier, alias,
            gender, birthday, age, birth_place, nationality,
            region, district_province, city_municipality, barangay, house_street,
            status, location_if_arrested, degree_participation,
            relation_to_victim, educational_attainment,
            height_cm, drug_used, motive, occupation
          )
          SELECT * FROM UNNEST(
            $1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
            $7::text[], $8::date[], $9::int[], $10::text[], $11::text[],
            $12::text[], $13::text[], $14::text[], $15::text[], $16::text[],
            $17::text[], $18::text[], $19::text[],
            $20::text[], $21::text[],
            $22::int[], $23::boolean[], $24::text[], $25::text[]
          )`,
          [
            chunk.map(r => r.blotterId),
            chunk.map(r => r.suspect.first_name),
            chunk.map(r => r.suspect.middle_name),
            chunk.map(r => r.suspect.last_name),
            chunk.map(r => r.suspect.qualifier),
            chunk.map(r => r.suspect.alias),
            chunk.map(r => r.suspect.gender),
            chunk.map(r => r.suspect.birthday),
            chunk.map(r => r.suspect.age),
            chunk.map(r => r.suspect.birth_place),
            chunk.map(r => r.suspect.nationality),
            chunk.map(r => r.suspect.region),
            chunk.map(r => r.suspect.district_province),
            chunk.map(r => r.suspect.city_municipality),
            chunk.map(r => r.suspect.barangay),
            chunk.map(r => r.suspect.house_street),
            chunk.map(r => r.suspect.status),
            chunk.map(r => r.suspect.location_if_arrested),
            chunk.map(r => r.suspect.degree_participation),
            chunk.map(r => r.suspect.relation_to_victim),
            chunk.map(r => r.suspect.educational_attainment),
            chunk.map(r => r.suspect.height_cm),
            chunk.map(r => r.suspect.drug_used),
            chunk.map(r => r.suspect.motive),
            chunk.map(r => r.suspect.occupation),
          ]
        );

        await client.query(
          `INSERT INTO offenses (
            blotter_id, offense_name, stage_of_felony, index_type,
            is_principal_offense, investigator_on_case, most_investigator, modus
          )
          SELECT * FROM UNNEST(
            $1::int[], $2::text[], $3::text[], $4::text[],
            $5::boolean[], $6::text[], $7::text[], $8::text[]
          )`,
          [
            chunk.map(r => r.blotterId),
            chunk.map(r => r.offense.offense_name),
            chunk.map(r => r.offense.stage_of_felony),
            chunk.map(r => r.offense.index_type),
            chunk.map(r => r.offense.is_principal_offense),
            chunk.map(r => r.offense.investigator_on_case),
            chunk.map(r => r.offense.most_investigator),
            chunk.map(r => r.offense.modus),
          ]
        );

        const modusPairs = [];
        for (const r of chunk) {
          const crimeType = OFFENSE_TO_CRIME_TYPE[r.offense.offense_name];
          if (!crimeType || !r.offense.modus) continue;
          const modusList = r.offense.modus.split(",").map(m => m.trim()).filter(Boolean);
          for (const modusName of modusList) {
            const modusRefId = modusIdMap.get(`${crimeType}||${modusName.toLowerCase()}`);
            if (modusRefId) modusPairs.push({ blotterId: r.blotterId, modusRefId });
          }
        }
        if (modusPairs.length > 0) {
          await client.query(
            `INSERT INTO crime_modus (blotter_id, modus_reference_id)
             SELECT * FROM UNNEST($1::int[], $2::int[])
             ON CONFLICT DO NOTHING`,
            [modusPairs.map(p => p.blotterId), modusPairs.map(p => p.modusRefId)]
          );
        }

        chunk.forEach(r => {
          caseRows.push({
            blotterId: r.blotterId,
            status: r.caseStatus,
            incidentType: r.incidentType,
            reportedDate: r.dateReported || r.dateCommitted,
          });
        });

        actualInserted += chunk.length;
      }

      // ── bulk auto-create cases ──────────────────────────
      if (caseRows.length > 0) {
        const validStatuses = ["Under Investigation", "Solved", "Cleared"];
        const currentYear = new Date().getFullYear();
        const highCrimes = ["murder", "homicide", "rape", "special complex crime"];
        const mediumCrimes = ["robbery", "carnapping - mc", "carnapping - mv"];

        const byYear = new Map();
        for (const cr of caseRows) {
          const year = cr.reportedDate ? new Date(cr.reportedDate).getFullYear() : currentYear;
          if (!byYear.has(year)) byYear.set(year, []);
          byYear.get(year).push(cr);
        }

        const finalCaseNumbers = [];
        for (const [year, group] of byYear.entries()) {
          const seqResult = await client.query(
            `INSERT INTO case_number_seq (year, seq) VALUES ($1, $2)
             ON CONFLICT (year) DO UPDATE SET seq = case_number_seq.seq + $2
             RETURNING seq`,
            [year, group.length],
          );
          const endSeq = seqResult.rows[0].seq;
          const startSeq = endSeq - group.length + 1;

          group.forEach((cr, i) => {
            const seq = startSeq + i;
            const case_number = `CASE-${year}-${String(seq).padStart(4, "0")}`;
            const caseStatus = validStatuses.includes(cr.status) ? cr.status : "Under Investigation";
            const incidentType = (cr.incidentType || "").toLowerCase().trim();
            let priority = "Low";
            if (year === currentYear) {
              if (highCrimes.includes(incidentType)) priority = "High";
              else if (mediumCrimes.includes(incidentType)) priority = "Medium";
            }
            finalCaseNumbers.push({ blotterId: cr.blotterId, case_number, status: caseStatus, priority });
          });
        }
await client.query(
  `INSERT INTO cases (blotter_id, case_number, status, priority, created_by)
   SELECT * FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::uuid[])
   ON CONFLICT DO NOTHING`,
  [
    finalCaseNumbers.map(c => c.blotterId),
    finalCaseNumbers.map(c => c.case_number),
    finalCaseNumbers.map(c => c.status),
    finalCaseNumbers.map(c => c.priority),
    finalCaseNumbers.map(() => req.user.user_id),
  ]
);
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

    const blotter = await pool.query(
      `SELECT * FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [id],
    );
    if (blotter.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Crime report not found" });
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE blotter_entries SET status = 'Under Investigation', updated_at = NOW() WHERE blotter_id = $1`,
        [id],
      );

      await autoCreateCase(client, parseInt(id), req.user.user_id);

      await client.query("COMMIT");

      await logAudit({
        userId: req.user?.user_id,
        username: req.user?.username,
        eventName: "Referral Accepted",
        description: `Accepted barangay referral for crime report ID ${id}`,
        action: "UPDATE",
        status: "success",
        source: "Web Portal",
        ipAddress: getClientIp(req),
      });

      const referralRow = await pool.query(
        `SELECT submitted_by, place_barangay, blotter_entry_number FROM blotter_entries WHERE blotter_id = $1`,
        [id]
      );

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

      await notifyAllByRole(["Administrator", "Technical Administrator"], {
        senderId: req.user.user_id,
        senderName: req.user.username,
        type: "REFERRAL_ACCEPTED",
        title: "Referral Accepted",
        message: `${req.user.username} accepted referral ${blotter.rows[0].blotter_entry_number} (Brgy. ${referralRow.rows[0]?.place_barangay}).`,
        linkTo: "/e-blotter",
      }, req.user.user_id);

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
      scheduleReferralReminders(blotterId, blotterNumber, place_barangay);
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

    const blotterIds = result.rows.map((row) => row.blotter_id);

    let respondersMap = {};
    if (blotterIds.length > 0) {
      const {
        getRespondersForReferrals,
      } = require("../../notifications/notificationService");
      respondersMap = await getRespondersForReferrals(blotterIds);
    }

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

  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  const CF_MODEL =
    process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return res.status(500).json({
      success: false,
      message: "AI service not configured",
    });
  }

  const CRIME_TYPES_FOR_AI = [
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
${CRIME_TYPES_FOR_AI.map((c, i) => `${i + 1}. ${c}`).join("\n")}

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
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
      {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 20,
      },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CF_API_TOKEN}`,
        },
      },
    );

    let raw = response.data?.result?.response;
    if (raw && typeof raw !== "string") raw = JSON.stringify(raw);
    raw = (raw || "").trim();

    if (raw.toUpperCase() === "NOT_AN_INDEX_CRIME") {
      return res.json({
        success: true,
        crime_type: null,
        not_an_index_crime: true,
        confident: true,
        raw,
      });
    }

    const matched = CRIME_TYPES_FOR_AI.find(
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

const checkReminderAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      return res.status(400).json({ success: false, message: "Invalid crime report ID" });
    }

    const result = await pool.query(
      `SELECT 1 FROM notifications
       WHERE recipient_user_id = $1
         AND type = 'REFERRAL_REMINDER'
         AND link_to LIKE $2
       LIMIT 1`,
      [req.user.user_id, `%referral=${parsedId}`]
    );

    res.json({ success: true, has_access: result.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
        .json({ success: false, message: "Crime report not found" });
    if (!blotter.rows[0].referred_by_barangay)
      return res
        .status(400)
        .json({ success: false, message: "Not a barangay referral" });
    if (blotter.rows[0].status !== "Pending")
      return res
        .status(400)
        .json({ success: false, message: "Already accepted" });

    const existing = await getResponderForReferral(id);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Already responded by ${existing.sender_name}`,
      });
    }

    const responderName = req.user.username;
    const blotterNumber = blotter.rows[0].blotter_entry_number;

    await notifyAllByRole(
      ["Administrator", "Technical Administrator"],
      {
        senderId: req.user.user_id,
        senderName: responderName,
        type: "REFERRAL_RESPONDED",
        title: "Response to Referral",
        message: `${responderName} will respond to referral ${blotterNumber}`,
        linkTo: `/e-blotter?referral=${id}`,
      },
      req.user.user_id,
    );
    await notifyPatrolsForReferral(
      blotter.rows[0].place_barangay,
      {
        senderId: req.user.user_id,
        senderName: responderName,
        type: "REFERRAL_RESPONDED",
        title: "Referral Already Responded",
        message: `${responderName} is responding to ${blotterNumber}. No need to respond.`,
        linkTo: `/e-blotter?referral=${id}`,
      },
      req.user.user_id,
    );

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

    const blotter = await pool.query(
      `SELECT * FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [id],
    );

    if (blotter.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Crime report not found" });
    }

    if (!blotter.rows[0].referred_by_barangay) {
      return res
        .status(400)
        .json({ success: false, message: "Not a barangay referral" });
    }

    const existing = await getResponderForReferral(id);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Already responded by ${existing.sender_name}`,
      });
    }

    const blotterNumber = blotter.rows[0].blotter_entry_number;

    let successCount = 0;
    for (const patrolId of patrol_ids) {
      await createNotification({
        recipientId: patrolId,
        senderId: req.user.user_id,
        senderName: req.user.username,
        type: "REFERRAL_REMINDER",
        title: "Referral Reminder",
        message: `${req.user.username} is reminding you to respond to referral #${blotterNumber}`,
        linkTo: "/e-blotter",
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

const getReminderBlotterIds = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT link_to FROM notifications
       WHERE recipient_user_id = $1
         AND type = 'REFERRAL_REMINDER'
       ORDER BY created_at DESC`,
      [req.user.user_id]
    );

    const ids = result.rows
      .map(r => {
        const match = r.link_to?.match(/referral=(\d+)$/);
        return match ? parseInt(match[1]) : null;
      })
      .filter(Boolean);

    res.json({ success: true, data: ids });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
  remindPatrols,
  getPatrolUsers,
  checkReminderAccess,
  getReminderBlotterIds,
};