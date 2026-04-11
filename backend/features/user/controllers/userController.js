// ================================================================================
// FILE: backend/features/user/controllers/userController.js
// ================================================================================

const pool = require("../../../config/database");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const emailService = require("../../user/services/emailService");
const UserValidator = require("../validators/userValidator");

// =====================================================
// GET ALL USERS (server-side paginated)
// =====================================================
const getAllUsers = async (req, res) => {
  try {
    const {
      userType = "police",
      status,
      search,
      role,
      barangayCode,
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ["u.user_type = $1"];
    const params = [userType];
    let paramIdx = 2;

    if (status && status !== "all") {
      conditions.push(`u.status = $${paramIdx++}`);
      params.push(status);
    } else if (!status) {
      conditions.push(`u.status != 'deactivated'`);
    }

    if (search) {
      conditions.push(`(
        u.username ILIKE $${paramIdx} OR
        u.email ILIKE $${paramIdx} OR
        u.first_name ILIKE $${paramIdx} OR
        u.last_name ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (role && role !== "all" && userType === "police") {
      conditions.push(`r.role_name = $${paramIdx++}`);
      params.push(role);
    }

    if (barangayCode && barangayCode !== "all" && userType === "barangay") {
      conditions.push(`bd.barangay_code = $${paramIdx++}`);
      params.push(barangayCode);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
   FROM users u
   LEFT JOIN roles r ON u.role_id = r.role_id
   LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
   ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total);

    const dataResult = await pool.query(
      `SELECT
    u.user_id, u.username, u.email,
    u.first_name, u.last_name, u.middle_name, u.suffix,
    u.phone, u.alternate_phone, u.gender,
    TO_CHAR(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
    u.profile_picture,
    u.status, u.last_login, u.created_at,
    u.user_type,
    u.rank_id,
    pr.rank_name AS rank, pr.abbreviation AS rank_abbreviation,
    r.role_id, r.role_name AS role,
    ua.region_code, ua.province_code, ua.municipality_code,
    ua.barangay_code AS address_barangay_code, ua.address_line,
    bd.barangay_code AS assigned_barangay_code
   FROM users u
   LEFT JOIN roles r ON u.role_id = r.role_id
   LEFT JOIN pnp_ranks pr ON u.rank_id = pr.rank_id
   LEFT JOIN user_addresses ua ON u.user_id = ua.user_id
   LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
   ${whereClause}
   ORDER BY u.created_at DESC
   LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, parseInt(limit), offset],
    );

    res.json({
      success: true,
      users: dataResult.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Fetch all users error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

// =====================================================
// GET FILTER OPTIONS
// =====================================================
const getFilterOptions = async (req, res) => {
  try {
    const rolesResult = await pool.query(
      `SELECT DISTINCT r.role_name
       FROM roles r
       WHERE r.user_type = 'police'
       ORDER BY r.role_name`,
    );

    res.json({
      success: true,
      roles: rolesResult.rows.map((r) => r.role_name),
    });
  } catch (err) {
    console.error("Fetch filter options error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch filter options" });
  }
};

// =====================================================
// GET USER BY ID
// =====================================================
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
    u.user_id, u.username, u.email,
    u.first_name, u.last_name, u.middle_name, u.suffix,
    u.phone, u.alternate_phone, u.gender,
    TO_CHAR(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
    u.profile_picture,
    u.status, u.last_login, u.created_at,
    u.user_type,
    u.rank_id,
    pr.rank_name AS rank, pr.abbreviation AS rank_abbreviation,
    r.role_id, r.role_name AS role,
    ua.region_code, ua.province_code, ua.municipality_code,
    ua.barangay_code AS address_barangay_code, ua.address_line,
    bd.barangay_code AS assigned_barangay_code
   FROM users u
   LEFT JOIN roles r ON u.role_id = r.role_id
   LEFT JOIN pnp_ranks pr ON u.rank_id = pr.rank_id
   LEFT JOIN user_addresses ua ON u.user_id = ua.user_id
   LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
   WHERE u.user_id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("Fetch user by ID error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
};

// =====================================================
// REGISTER USER
// =====================================================
const registerUser = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      userType,
      email,
      firstName,
      lastName,
      role,
      middleName,
      suffix,
      phone,
      alternatePhone,
      gender,
      dateOfBirth,
      regionCode,
      provinceCode,
      municipalityCode,
      barangayCode,
      barangay,
      addressLine,
      rankId
    } = req.body;

    const cap = (str) =>
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";

    const trimmedEmail = email?.trim().toLowerCase() || "";
    const trimmedFirstName = cap(firstName?.trim() || "");
    const trimmedLastName = cap(lastName?.trim() || "");
    const trimmedMiddleName = cap(middleName?.trim() || "");
    const trimmedSuffix = suffix?.trim() || "";
    const trimmedPhone = phone?.trim() || "";
    const trimmedAlternatePhone = alternatePhone?.trim() || "";
    const trimmedRegionCode = regionCode?.trim() || null;
    const trimmedProvinceCode = provinceCode?.trim() || null;
    const trimmedMunicipalityCode = municipalityCode?.trim() || null;
    const trimmedBarangayCode =
      barangay?.trim() || barangayCode?.trim() || null;
    const trimmedAddressLine = addressLine?.trim() || null;
  

    console.log("Registration attempt:", {
      userType,
      email: trimmedEmail,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
    });

    const validation = await UserValidator.validateRegistration(
      req.body,
      client,
    );
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors,
      });
    }

    const roleResult = await client.query(
      "SELECT role_id FROM roles WHERE role_name = $1 AND user_type = $2",
      [role, userType],
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid role '${role}' for ${userType} user`,
        errors: { role: `Invalid role for ${userType} user` },
      });
    }
    const roleId = roleResult.rows[0].role_id;

    await client.query("BEGIN");

    const username = await emailService.generateUsername(
      trimmedFirstName,
      trimmedMiddleName || "",
      trimmedLastName,
      userType === "police" ? "pnp" : "brgy",
      client,
    );

    const plainPassword = emailService.generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const userResult = await client.query(
  `INSERT INTO users (
    username, email, password,
    first_name, last_name, middle_name, suffix,
    phone, alternate_phone,
    gender, date_of_birth,
    user_type, role_id, rank_id,
    status, created_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unverified',CURRENT_TIMESTAMP)
  RETURNING user_id`,
  [
    username, trimmedEmail, hashedPassword,
    trimmedFirstName, trimmedLastName,
    trimmedMiddleName || null, trimmedSuffix || null,
    trimmedPhone, trimmedAlternatePhone || null,
    gender, dateOfBirth,
    userType, roleId, rankId ? parseInt(rankId) : null,
  ],
);
    const userId = userResult.rows[0].user_id;

    await client.query(
      `INSERT INTO user_addresses
        (user_id, region_code, province_code, municipality_code, barangay_code, address_line)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        userId,
        trimmedRegionCode,
        trimmedProvinceCode,
        trimmedMunicipalityCode,
        trimmedBarangayCode,
        trimmedAddressLine,
      ],
    );

    if (userType === "barangay") {
      await client.query(
        `INSERT INTO barangay_details (user_id, barangay_code) VALUES ($1,$2)`,
        [userId, trimmedBarangayCode],
      );
    }

    // ── Verification token ────────────────────────────────────────────────
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
      [userId, tokenHash, tokenExpiresAt],
    );

    // ── FIX: store pending credentials in dedicated table keyed by user_id ─
    // This replaces the old otp_requests approach which could cross-contaminate
    // credentials between users when a upsert overwrote a prior row.
    const credentialsJson = JSON.stringify({
      username,
      password: plainPassword,
      userType,
      role,
    });

    await client.query(
      `INSERT INTO pending_credentials (user_id, credentials, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET credentials = EXCLUDED.credentials,
             expires_at  = EXCLUDED.expires_at`,
      [userId, credentialsJson, tokenExpiresAt],
    );

    await client.query("COMMIT");

    const backendUrl =
      process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const verificationUrl = `${backendUrl}/user-management/verify-account?token=${rawToken}`;

    const emailResult = await emailService.sendVerificationEmail(
      trimmedEmail,
      trimmedFirstName,
      trimmedLastName,
      verificationUrl,
    );
    if (!emailResult.success) {
      console.error("Failed to send verification email:", emailResult.message);
    }

    console.log("User registered (unverified):", username);

    res.status(201).json({
      success: true,
      message: `Account created. A verification email has been sent to ${trimmedEmail}.`,
      user: {
        userId,
        username,
        email: trimmedEmail,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        userType,
        role,
        status: "unverified",
        verificationEmailSent: emailResult.success,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// VERIFY ACCOUNT
// =====================================================
const verifyAccount = async (req, res) => {
  const client = await pool.connect();
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  try {
    const { token } = req.query;
    if (!token)
      return res.redirect(`${frontendUrl}/verification-success?status=invalid`);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Look up the verification token — joined to users so we get all needed fields
    const tokenResult = await client.query(
      `SELECT
         t.token_id, t.user_id, t.expires_at, t.is_revoked,
         u.status, u.email, u.first_name, u.last_name,
         u.username, u.user_type,
         r.role_name AS role
       FROM tokens t
       JOIN users u ON t.user_id = u.user_id
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE t.token_hash = $1`,
      [tokenHash],
    );

    if (tokenResult.rows.length === 0)
      return res.redirect(`${frontendUrl}/verification-success?status=invalid`);

    const tokenRow = tokenResult.rows[0];

    if (tokenRow.is_revoked)
      return res.redirect(`${frontendUrl}/verification-success?status=used`);
    if (new Date(tokenRow.expires_at) < new Date())
      return res.redirect(`${frontendUrl}/verification-success?status=expired`);
    if (tokenRow.status === "verified")
      return res.redirect(
        `${frontendUrl}/verification-success?status=already_verified`,
      );

    const userId = tokenRow.user_id;

    await client.query("BEGIN");

    // Activate the account
    await client.query(
      `UPDATE users
       SET status = 'verified', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId],
    );

    // Revoke the verification token
    await client.query(
      `UPDATE tokens
       SET is_revoked = TRUE, revoked_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1`,
      [tokenHash],
    );

    // ── FIX: fetch credentials from pending_credentials keyed by user_id ──
    // No string-key collisions possible — one row per user, foreign key enforced.
    const credResult = await client.query(
      `SELECT credentials FROM pending_credentials WHERE user_id = $1`,
      [userId],
    );

    let username = tokenRow.username;
    let plainPassword = null;
    let userType = tokenRow.user_type;
    let role = tokenRow.role;

    if (credResult.rows.length > 0) {
      try {
        const creds = JSON.parse(credResult.rows[0].credentials);
        username = creds.username || username;
        plainPassword = creds.password || null;
        userType = creds.userType || userType;
        role = creds.role || role;
      } catch (e) {
        console.error("Failed to parse pending credentials:", e);
      }
      // Delete immediately after reading — credentials are single-use
      await client.query(`DELETE FROM pending_credentials WHERE user_id = $1`, [
        userId,
      ]);
    }

    await client.query("COMMIT");

    // Send welcome email with credentials
    if (plainPassword) {
      const emailResult = await emailService.sendWelcomeEmail(
        tokenRow.email,
        tokenRow.first_name,
        tokenRow.last_name,
        username,
        plainPassword,
        userType,
        role,
      );
      if (!emailResult.success) {
        console.error("Failed to send welcome email:", emailResult.message);
      }
    }

    console.log(`Account verified and activated: ${username}`);
    return res.redirect(`${frontendUrl}/verification-success?status=success`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Verify account error:", error);
    return res.redirect(`${frontendUrl}/verification-success?status=error`);
  } finally {
    client.release();
  }
};

// =====================================================
// RESEND VERIFICATION EMAIL
// =====================================================
const resendVerificationEmail = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const userResult = await client.query(
      `SELECT u.user_id, u.email, u.first_name, u.last_name, u.username,
              u.status, u.user_type, r.role_name AS role
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [id],
    );
    if (userResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const user = userResult.rows[0];
    if (user.status !== "unverified")
      return res.status(400).json({
        success: false,
        message: `Account is already ${user.status}. Verification email is only for unverified accounts.`,
      });

    await client.query("BEGIN");

    // Revoke any existing verification tokens for this user
    await client.query(
      `UPDATE tokens
       SET is_revoked = TRUE, revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_revoked = FALSE`,
      [user.user_id],
    );

    // ── FIX: read existing pending credentials by user_id ─────────────────
    const credResult = await client.query(
      `SELECT credentials FROM pending_credentials WHERE user_id = $1`,
      [user.user_id],
    );

    let username = user.username;
    let plainPassword = null;
    let userType = user.user_type;
    let role = user.role;

    if (credResult.rows.length > 0) {
      try {
        const creds = JSON.parse(credResult.rows[0].credentials);
        username = creds.username || username;
        plainPassword = creds.password || null;
        userType = creds.userType || userType;
        role = creds.role || role;
      } catch (e) {
        console.error("Failed to parse pending credentials:", e);
      }
    }

    // If no stored password (e.g. row expired and was cleaned up), generate a new one
    if (!plainPassword) {
      plainPassword = emailService.generatePassword();
      const hashed = await bcrypt.hash(plainPassword, 10);
      await client.query(
        `UPDATE users
         SET password = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [hashed, user.user_id],
      );
    }

    // Issue a fresh verification token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
      [user.user_id, tokenHash, tokenExpiresAt],
    );

    // ── FIX: upsert pending credentials keyed by user_id ──────────────────
    const credentialsJson = JSON.stringify({
      username,
      password: plainPassword,
      userType,
      role,
    });

    await client.query(
      `INSERT INTO pending_credentials (user_id, credentials, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET credentials = EXCLUDED.credentials,
             expires_at  = EXCLUDED.expires_at`,
      [user.user_id, credentialsJson, tokenExpiresAt],
    );

    await client.query("COMMIT");

    const backendUrl =
      process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const verificationUrl = `${backendUrl}/user-management/verify-account?token=${rawToken}`;

    const emailResult = await emailService.sendVerificationEmail(
      user.email,
      user.first_name,
      user.last_name,
      verificationUrl,
    );

    res.json({
      success: true,
      message: `Verification email resent to ${user.email}`,
      emailSent: emailResult.success,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Resend verification error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to resend verification email" });
  } finally {
    client.release();
  }
};

// =====================================================
// UPDATE USER
// =====================================================
const updateUser = async (req, res) => {
  const { id } = req.params;
  const {
    email,
    first_name,
    last_name,
    middle_name,
    suffix,
    date_of_birth,
    gender,
    phone,
    alternate_phone,
    new_password,
    role,
    region_code,
    province_code,
    municipality_code,
    barangay_code,
    assigned_barangay_code,
    address_line,
    rank_id
  } = req.body;

  const client = await pool.connect();
  try {
    if (req.user.role !== "Administrator")
      return res.status(403).json({
        success: false,
        message: "Only administrators can update user information",
      });

    const userCheck = await client.query(
      "SELECT user_id, user_type, email, phone, alternate_phone FROM users WHERE user_id = $1",
      [id],
    );
    if (userCheck.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const existingUser = userCheck.rows[0];

    const validation = await UserValidator.validateUpdate(
      req.body,
      existingUser,
      client,
    );
    if (!validation.isValid)
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors,
      });

    let roleId = null;
    if (role) {
      const roleResult = await client.query(
        "SELECT role_id FROM roles WHERE role_name = $1 AND user_type = $2",
        [role, existingUser.user_type],
      );
      if (roleResult.rows.length === 0)
        return res.status(400).json({
          success: false,
          message: `Invalid role '${role}' for ${existingUser.user_type} user`,
        });
      roleId = roleResult.rows[0].role_id;
    }

    await client.query("BEGIN");

    const cap = (str) =>
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : null;

    const trimmedEmail = email?.toLowerCase().trim() || null;
    const trimmedFirstName = cap(first_name?.trim() || "");
    const trimmedLastName = cap(last_name?.trim() || "");
    const trimmedMiddleName = cap(middle_name?.trim() || "");
    const trimmedSuffix = suffix?.trim() || "";
    const trimmedPhone = phone?.trim() || "";
    const trimmedAlternatePhone = alternate_phone?.trim() || "";

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (trimmedEmail) {
      updateFields.push(`email = $${paramCount++}`);
      updateValues.push(trimmedEmail);
    }
    if (trimmedFirstName) {
      updateFields.push(`first_name = $${paramCount++}`);
      updateValues.push(trimmedFirstName);
    }
    if (trimmedLastName) {
      updateFields.push(`last_name = $${paramCount++}`);
      updateValues.push(trimmedLastName);
    }

    updateFields.push(`middle_name = $${paramCount++}`);
    updateValues.push(trimmedMiddleName);
    updateFields.push(`suffix = $${paramCount++}`);
    updateValues.push(trimmedSuffix);

    if (date_of_birth) {
      updateFields.push(`date_of_birth = $${paramCount++}`);
      updateValues.push(date_of_birth);
    }
    if (gender) {
      updateFields.push(`gender = $${paramCount++}`);
      updateValues.push(gender);
    }
    if (trimmedPhone) {
      updateFields.push(`phone = $${paramCount++}`);
      updateValues.push(trimmedPhone);
    }

    updateFields.push(`alternate_phone = $${paramCount++}`);
    updateValues.push(trimmedAlternatePhone || null);

    if (roleId) {
      updateFields.push(`role_id = $${paramCount++}`);
      updateValues.push(roleId);
    }

    if (rank_id !== undefined) {
      updateFields.push(`rank_id = $${paramCount++}`);
      updateValues.push(rank_id ? parseInt(rank_id) : null);
    }

    if (new_password) {
      const hashedPassword = await bcrypt.hash(new_password, 10);
      updateFields.push(`password = $${paramCount++}`);
      updateValues.push(hashedPassword);
    }

    updateFields.push("updated_at = CURRENT_TIMESTAMP");
    updateValues.push(id);

    await client.query(
      `UPDATE users SET ${updateFields.join(", ")} WHERE user_id = $${paramCount}`,
      updateValues,
    );

    // ── Address update ─────────────────────────────────────────────────────
    const effectiveAddressBarangay =
      existingUser.user_type === "barangay"
        ? assigned_barangay_code || barangay_code || null
        : barangay_code || null;

    const addrFields = [];
    const addrValues = [];
    let addrCount = 1;

    if (region_code) {
      addrFields.push(`region_code = $${addrCount++}`);
      addrValues.push(region_code);
    }
    if (province_code) {
      addrFields.push(`province_code = $${addrCount++}`);
      addrValues.push(province_code);
    }
    if (municipality_code) {
      addrFields.push(`municipality_code = $${addrCount++}`);
      addrValues.push(municipality_code);
    }
    if (effectiveAddressBarangay) {
      addrFields.push(`barangay_code = $${addrCount++}`);
      addrValues.push(effectiveAddressBarangay);
    }
    if (address_line !== undefined) {
      addrFields.push(`address_line = $${addrCount++}`);
      addrValues.push(address_line?.trim() || null);
    }

    if (addrFields.length > 0) {
      addrValues.push(id);
      await client.query(
        `UPDATE user_addresses SET ${addrFields.join(", ")} WHERE user_id = $${addrCount}`,
        addrValues,
      );
    }


    // ── Barangay details ───────────────────────────────────────────────────
    if (existingUser.user_type === "barangay") {
      const brgyCode = assigned_barangay_code || barangay_code;
      if (brgyCode) {
        await client.query(
          "UPDATE barangay_details SET barangay_code = $1 WHERE user_id = $2",
          [brgyCode, id],
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "User updated successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update user error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// DEACTIVATE USER
// =====================================================
const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminPassword } = req.body;

    if (!adminPassword)
      return res.status(400).json({
        success: false,
        message: "Administrator password is required",
      });

    const userResult = await pool.query(
      "SELECT password FROM users WHERE user_id = $1",
      [req.user.user_id],
    );
    if (userResult.rows.length === 0)
      return res
        .status(401)
        .json({ success: false, message: "Admin user not found" });

    const isPasswordValid = await bcrypt.compare(
      adminPassword,
      userResult.rows[0].password,
    );
    if (!isPasswordValid)
      return res
        .status(401)
        .json({ success: false, message: "Incorrect password" });

    const updateResult = await pool.query(
      "UPDATE users SET status = 'deactivated', updated_at = NOW() WHERE user_id = $1",
      [id],
    );
    if (updateResult.rowCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, message: "User deactivated successfully" });
  } catch (error) {
    console.error("Deactivate user error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to deactivate user" });
  }
};

// =====================================================
// LOCK USER ACCOUNT
// =====================================================
const lockUser = async (req, res) => {
  const { id } = req.params;
  try {
    if (req.user.role !== "Administrator")
      return res.status(403).json({
        success: false,
        message: "Only administrators can lock user accounts",
      });
    if (req.user.user_id === id)
      return res.status(400).json({
        success: false,
        message: "You cannot lock your own account",
      });

    const userCheck = await pool.query(
      "SELECT user_id, status FROM users WHERE user_id = $1",
      [id],
    );
    if (userCheck.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (userCheck.rows[0].status === "locked")
      return res
        .status(400)
        .json({ success: false, message: "Account is already locked" });

    await pool.query(
      "UPDATE users SET status = 'locked', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1",
      [id],
    );
    res.json({ success: true, message: "Account locked successfully" });
  } catch (err) {
    console.error("Lock account error:", err);
    res.status(500).json({ success: false, message: "Failed to lock account" });
  }
};

// =====================================================
// UNLOCK USER ACCOUNT
// =====================================================
const unlockUser = async (req, res) => {
  const { id } = req.params;
  try {
    if (req.user.role !== "Administrator")
      return res.status(403).json({
        success: false,
        message: "Only administrators can unlock user accounts",
      });

    const userCheck = await pool.query(
      "SELECT user_id, status FROM users WHERE user_id = $1",
      [id],
    );
    if (userCheck.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (userCheck.rows[0].status !== "locked")
      return res
        .status(400)
        .json({ success: false, message: "Account is not locked" });

    await pool.query(
      `UPDATE users
       SET status = 'verified', failed_login_attempts = 0, lockout_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [id],
    );
    res.json({ success: true, message: "Account unlocked successfully" });
  } catch (err) {
    console.error("Unlock account error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to unlock account" });
  }
};

// =====================================================
// GET ALL ROLES
// =====================================================
const getAllRoles = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT role_id, role_name, user_type FROM roles ORDER BY user_type, role_name",
    );
    res.json({ success: true, roles: result.rows });
  } catch (err) {
    console.error("Fetch roles error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch roles" });
  }
};

// =====================================================
// RESTORE USER
// =====================================================
const restoreUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminPassword } = req.body;

    if (!adminPassword)
      return res.status(400).json({
        success: false,
        message: "Administrator password is required",
      });

    const userResult = await pool.query(
      "SELECT password FROM users WHERE user_id = $1",
      [req.user.user_id],
    );
    if (userResult.rows.length === 0)
      return res
        .status(401)
        .json({ success: false, message: "Admin user not found" });

    const isPasswordValid = await bcrypt.compare(
      adminPassword,
      userResult.rows[0].password,
    );
    if (!isPasswordValid)
      return res
        .status(401)
        .json({ success: false, message: "Incorrect password" });

    const targetResult = await pool.query(
      "SELECT user_id, status FROM users WHERE user_id = $1",
      [id],
    );
    if (targetResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (targetResult.rows[0].status !== "deactivated")
      return res.status(400).json({
        success: false,
        message: "User account is not deactivated",
      });

    await pool.query(
      "UPDATE users SET status = 'verified', updated_at = NOW() WHERE user_id = $1",
      [id],
    );
    res.json({ success: true, message: "User account restored successfully" });
  } catch (error) {
    console.error("Restore user error:", error);
    res.status(500).json({ success: false, message: "Failed to restore user" });
  }
};

const getRanks = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT rank_id, rank_name, abbreviation FROM pnp_ranks ORDER BY rank_order ASC",
    );
    res.json({ success: true, ranks: result.rows });
  } catch (err) {
    console.error("Fetch ranks error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch ranks" });
  }
};

module.exports = {
  getAllUsers,
  getFilterOptions,
  getUserById,
  registerUser,
  verifyAccount,
  resendVerificationEmail,
  updateUser,
  deactivateUser,
  lockUser,
  unlockUser,
  restoreUser,
  getAllRoles,
  getRanks,
};
