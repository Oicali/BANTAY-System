// ================================================================================
// FILE: backend/features/user/models/User.js
// ================================================================================

const pool = require("../../../config/database");

class User {
  // =====================================================
  // GET CURRENT USER PROFILE
  // =====================================================
  static async getProfile(userId) {
  try {
    const result = await pool.query(
      `SELECT 
        u.user_id, u.username, u.email, 
        u.first_name, u.last_name, u.middle_name, u.suffix, 
        u.phone, u.alternate_phone,
        u.gender, 
        TO_CHAR(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
        u.profile_picture, u.user_type, u.status, u.created_at,
        u.rank_id,
        r.role_name AS role,
        pr.rank_name AS rank,
        pr.abbreviation AS rank_abbreviation,
        ua.region_code, ua.province_code,
        ua.municipality_code, ua.barangay_code,
        ua.address_line,
        bd.barangay_code AS assigned_barangay_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN pnp_ranks pr ON u.rank_id = pr.rank_id
      LEFT JOIN user_addresses ua ON u.user_id = ua.user_id
      LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
      WHERE u.user_id = $1`,
      [userId],
    );

    const profile = result.rows[0] || null;
    return profile;
  } catch (error) {
    console.error("Get profile error:", error);
    throw error;
  }
}

  // =====================================================
  // CHECK PHONE AVAILABILITY
  // =====================================================
  static async checkPhoneAvailability(phone, excludeUserId = null) {
    try {
      if (!phone || phone.trim() === "") return true;
      const normalizedPhone = phone.trim();

      if (excludeUserId) {
        const currentUserResult = await pool.query(
          "SELECT phone, alternate_phone FROM users WHERE user_id = $1",
          [excludeUserId],
        );
        if (currentUserResult.rows.length > 0) {
          const { phone: cur, alternate_phone: curAlt } = currentUserResult.rows[0];
          if (normalizedPhone === cur || normalizedPhone === curAlt) return true;
        }
      }

      let query = "SELECT user_id FROM users WHERE (phone = $1 OR alternate_phone = $1)";
      let params = [normalizedPhone];
      if (excludeUserId) {
        query += " AND user_id != $2";
        params.push(excludeUserId);
      }

      const result = await pool.query(query, params);
      return result.rows.length === 0;
    } catch (error) {
      console.error("Check phone error:", error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE USER PROFILE
  // =====================================================
  static async updateProfile(userId, profileData) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const {
        first_name, last_name, middle_name, suffix, gender,
        phone, alternate_phone, profile_picture,
        email,
        region_code, province_code, municipality_code, barangay_code, address_line,
      } = profileData;

      // Update users table
      // NOTE: updated_at is omitted — the DB trigger auto-updates it on every row change.
      const userResult = await client.query(
        `UPDATE users
         SET first_name = $1, last_name = $2, middle_name = $3, suffix = $4,
             gender = $5, phone = $6, alternate_phone = $7,
             email = COALESCE($8, email)
         WHERE user_id = $9
         RETURNING *`,
        [
          first_name,
          last_name,
          middle_name || null,
          suffix || null,
          gender || null,
          phone || null,
          alternate_phone || null,
          email || null,
          userId,
        ],
      );

      // ✅ FIX: Always upsert user_addresses when ANY address field is provided.
      //    Previously used `|| null` on empty strings which made the condition
      //    `if (region_code || ...)` pass but then saved NULL for the others.
      //    Now the controller pre-cleans values to null before calling this,
      //    so we just always upsert to keep address data in sync.
      await client.query(
        `INSERT INTO user_addresses 
          (user_id, region_code, province_code, municipality_code, barangay_code, address_line)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           region_code       = EXCLUDED.region_code,
           province_code     = EXCLUDED.province_code,
           municipality_code = EXCLUDED.municipality_code,
           barangay_code     = EXCLUDED.barangay_code,
           address_line      = EXCLUDED.address_line`,
        [
          userId,
          region_code     || null,
          province_code   || null,
          municipality_code || null,
          barangay_code   || null,
          address_line    || null,
        ],
      );

      await client.query("COMMIT");
      return userResult.rows[0] || null;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update profile error:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // GET USER BY ID (with password)
  // =====================================================
  static async getUserById(userId) {
    try {
      const result = await pool.query(
        "SELECT user_id, password, status, email_changed_at, password_changed_at FROM users WHERE user_id = $1",
        [userId],
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("Get user by ID error:", error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE PASSWORD
  // =====================================================
  static async updatePassword(userId, hashedPassword) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE users 
         SET password = $1, failed_login_attempts = 0, lockout_until = NULL, updated_at = NOW() 
         WHERE user_id = $2`,
        [hashedPassword, userId],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update password error:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // FIND USER BY USERNAME OR EMAIL
  // =====================================================
  static async findByUsernameOrEmail(usernameOrEmail) {
    try {
      const result = await pool.query(
        "SELECT * FROM users WHERE username = $1 OR email = $1",
        [usernameOrEmail],
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("Find user error:", error);
      throw error;
    }
  }

  // =====================================================
  // GET ALL USERS
  // =====================================================
  static async getAllUsers() {
  try {
    const result = await pool.query(
      `SELECT 
        u.user_id, u.username, u.email, 
        u.first_name, u.last_name, u.middle_name, u.suffix,
        u.phone, u.status, u.last_login, u.created_at, u.user_type,
        u.rank_id,
        r.role_name AS role,
        pr.rank_name AS rank,
        pr.abbreviation AS rank_abbreviation,
        bd.barangay_code AS assigned_barangay_code,
        ua.region_code, ua.province_code, ua.municipality_code, ua.barangay_code, ua.address_line
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN pnp_ranks pr ON u.rank_id = pr.rank_id
      LEFT JOIN user_addresses ua ON u.user_id = ua.user_id
      LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
      ORDER BY u.created_at DESC`,
    );
    return result.rows;
  } catch (error) {
    console.error("Get all users error:", error);
    throw error;
  }
}

  // =====================================================
  // GET USER DETAILS BY ID
  // =====================================================
  static async getUserDetailsById(userId) {
  try {
    const result = await pool.query(
      `SELECT 
        u.user_id, u.username, u.email, 
        u.first_name, u.last_name, u.middle_name, u.suffix,
        u.phone, u.status, u.last_login, u.created_at, u.user_type,
        u.rank_id,
        r.role_name AS role,
        pr.rank_name AS rank,
        pr.abbreviation AS rank_abbreviation,
        bd.barangay_code AS assigned_barangay_code,
        ua.region_code, ua.province_code, ua.municipality_code, ua.barangay_code, ua.address_line
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN pnp_ranks pr ON u.rank_id = pr.rank_id
      LEFT JOIN user_addresses ua ON u.user_id = ua.user_id
      LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
      WHERE u.user_id = $1`,
      [userId],
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("Get user details error:", error);
    throw error;
  }
}

  // =====================================================
  // UPDATE PROFILE PICTURE
  // =====================================================
  static async updateProfilePicture(userId, profile_picture) {
    try {
      await pool.query(
        "UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE user_id = $2",
        [profile_picture, userId],
      );
      return true;
    } catch (error) {
      console.error("Update profile picture error:", error);
      throw error;
    }
  }
  // =====================================================
  // SET email_changed_at (persists 24h cooldown across restarts)
  // =====================================================
  static async updateEmailChangedAt(userId) {
    try {
      await pool.query(
        "UPDATE users SET email_changed_at = NOW() WHERE user_id = $1",
        [userId]
      );
      return true;
    } catch (error) {
      console.error("updateEmailChangedAt error:", error);
      throw error;
    }
  }

  // =====================================================
  // SET password_changed_at (persists 24h limit across restarts)
  // =====================================================
  static async updatePasswordChangedAt(userId) {
    try {
      await pool.query(
        "UPDATE users SET password_changed_at = NOW() WHERE user_id = $1",
        [userId]
      );
      return true;
    } catch (error) {
      console.error("updatePasswordChangedAt error:", error);
      throw error;
    }
  }
}

module.exports = User;