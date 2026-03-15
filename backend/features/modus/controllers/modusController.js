const pool = require("../../../config/database");

const INDEX_CRIMES = [
  "MURDER", "HOMICIDE", "PHYSICAL INJURIES", "RAPE",
  "ROBBERY", "THEFT", "CARNAPPING - MC", "CARNAPPING - MV", "SPECIAL COMPLEX CRIME"
];

// GET all modus
const getAllModus = async (req, res) => {
  const { sort_by } = req.query;

  let orderBy;
  if (sort_by === "created_at") {
    orderBy = "created_at DESC";         // Newest first
  } else if (sort_by === "created_at_asc") {
    orderBy = "created_at ASC";          // Oldest first
  } else {
    orderBy = "crime_type, modus_name";  // Default: alphabetical
  }

  const result = await pool.query(
    `SELECT * FROM crime_modus_reference ORDER BY ${orderBy}`
  );
  res.json({ success: true, data: result.rows });
};

// GET one modus
const getModusById = async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM crime_modus_reference WHERE id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, data: result.rows[0] });
};

// POST create
const createModus = async (req, res) => {
  const { crime_type, modus_name, description } = req.body;

  if (!crime_type || !modus_name)
    return res.status(400).json({ success: false, message: "crime_type and modus_name are required" });

  if (!INDEX_CRIMES.includes(crime_type.toUpperCase()))
    return res.status(400).json({ success: false, message: "Invalid crime type" });

  const dup = await pool.query(
    `SELECT id FROM crime_modus_reference WHERE UPPER(crime_type) = $1 AND LOWER(modus_name) = LOWER($2)`,
    [crime_type.toUpperCase(), modus_name]
  );
  if (dup.rows.length > 0)
    return res.status(400).json({ success: false, message: "Modus already exists for this crime type" });

  const result = await pool.query(
    `INSERT INTO crime_modus_reference (crime_type, modus_name, description, is_active)
     VALUES ($1, $2, $3, true) RETURNING *`,
    [crime_type.toUpperCase(), modus_name, description || null]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
};

// PATCH update (edit fields or toggle is_active for soft remove/restore)
const updateModus = async (req, res) => {
  const { crime_type, modus_name, description, is_active } = req.body;

  const result = await pool.query(
    `UPDATE crime_modus_reference
     SET
       crime_type  = COALESCE($1, crime_type),
       modus_name  = COALESCE($2, modus_name),
       description = COALESCE($3, description),
       is_active   = COALESCE($4, is_active),
       updated_at  = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      crime_type ? crime_type.toUpperCase() : null,
      modus_name || null,
      description !== undefined ? description : null,
      is_active !== undefined ? is_active : null,
      req.params.id,
    ]
  );

  if (result.rows.length === 0)
    return res.status(404).json({ success: false, message: "Not found" });

  res.json({ success: true, data: result.rows[0] });
};

// DELETE (hard delete — blocked if used in reports)


module.exports = { getAllModus, getModusById, createModus, updateModus };