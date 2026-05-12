const pool = require("../../../config/database");
const xlsx = require("xlsx");

// helper — get barangay_code of logged-in user
const getUserBarangayCode = async (userId) => {
  const result = await pool.query(
    `SELECT barangay_code FROM barangay_details WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.barangay_code || null;
};

// GET /api/residents — all residents for this barangay
const getResidents = async (req, res) => {
  try {
    const barangayCode = await getUserBarangayCode(req.user.user_id);
    if (!barangayCode)
      return res.status(403).json({ success: false, message: "No barangay assigned" });

    const { q } = req.query;
    let query = `SELECT * FROM barangay_residents WHERE barangay_code = $1 AND is_active = true`;
    const params = [barangayCode];

    if (q) {
      query += ` AND (first_name ILIKE $2 OR last_name ILIKE $2 OR middle_name ILIKE $2)`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY last_name ASC, first_name ASC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/residents/import — import Excel
const importResidents = async (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file uploaded" });

  try {
    const barangayCode = await getUserBarangayCode(req.user.user_id);
    if (!barangayCode)
      return res.status(403).json({ success: false, message: "No barangay assigned" });

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0)
      return res.status(400).json({ success: false, message: "File is empty" });

    // validate template
    const first = rows[0];
    if (!("FIRST_NAME" in first) || !("LAST_NAME" in first))
      return res.status(400).json({
        success: false,
        message: "Invalid template. Use the official Bantay Resident import template.",
      });

    const str = (v) => (v === null || v === undefined || v === "" ? null : String(v).trim());
    const parseDate = (v) => {
      if (!v || v === "") return null;
      if (typeof v === "number") return new Date((v - 25569) * 86400 * 1000);
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const firstName = str(row["FIRST_NAME"]);
        const lastName = str(row["LAST_NAME"]);

        if (!firstName || !lastName) {
          errors.push({ row: i + 2, message: "Missing first or last name" });
          skipped++;
          continue;
        }

        await client.query(
          `INSERT INTO barangay_residents
            (barangay_code, first_name, middle_name, last_name, qualifier,
             gender, date_of_birth, contact_number, house_street,
             civil_status, voter_status, imported_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            barangayCode,
            firstName,
            str(row["MIDDLE_NAME"]),
            lastName,
            str(row["QUALIFIER"]),
            str(row["GENDER"]),
            parseDate(row["DATE_OF_BIRTH"]),
            str(row["CONTACT_NUMBER"]),
            str(row["HOUSE_STREET"]),
            str(row["CIVIL_STATUS"]),
            str(row["VOTER_STATUS"]),
            req.user.user_id,
          ]
        );
        inserted++;
      }

      await client.query("COMMIT");
      res.json({ success: true, summary: { inserted, skipped, errors } });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/residents/:id
const deleteResident = async (req, res) => {
  try {
    const barangayCode = await getUserBarangayCode(req.user.user_id);
    await pool.query(
      `UPDATE barangay_residents SET is_active = false 
       WHERE resident_id = $1 AND barangay_code = $2`,
      [req.params.id, barangayCode]
    );
    res.json({ success: true, message: "Resident removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getResidents, importResidents, deleteResident };