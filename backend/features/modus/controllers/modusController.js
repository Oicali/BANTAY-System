const pool = require("../../../config/database");

const INDEX_CRIMES = [
  "MURDER", "HOMICIDE", "PHYSICAL INJURIES", "RAPE",
  "ROBBERY", "THEFT", "CARNAPPING - MC", "CARNAPPING - MV", "SPECIAL COMPLEX CRIME"
];

// GET all modus with pagination
const getAllModus = async (req, res) => {
  const { sort_by, page = 1, limit = 15, crime_type, is_active } = req.query;
  const offset  = (parseInt(page) - 1) * parseInt(limit);
  const orderBy = sort_by === 'created_at' ? 'created_at DESC' : 'crime_type, modus_name';

  const conditions = [];
  const params     = [];

  if (crime_type) {
    params.push(crime_type.toUpperCase());
    conditions.push(`UPPER(crime_type) = $${params.length}`);
  }

  if (is_active === 'true' || is_active === 'false') {
    params.push(is_active === 'true');
    conditions.push(`is_active = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Separate param arrays — count uses only filter params, data adds limit+offset
  const countParams = [...params];
  params.push(parseInt(limit));
  params.push(offset);

  const [result, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM crime_modus_reference ${whereClause} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    pool.query(
      `SELECT COUNT(*) FROM crime_modus_reference ${whereClause}`,
      countParams
    ),
  ]);

  const total = parseInt(countResult.rows[0].count);

  res.json({
    success: true,
    data: result.rows,
    pagination: {
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)) || 1,
    },
  });
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
    `INSERT INTO crime_modus_reference (crime_type, modus_name, description, is_active) VALUES ($1, $2, $3, true) RETURNING *`,
    [crime_type.toUpperCase(), modus_name, description || null]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
};

// PATCH update
const updateModus = async (req, res) => {
  const { crime_type, modus_name, description, is_active } = req.body;
  const result = await pool.query(
    `UPDATE crime_modus_reference
     SET crime_type  = COALESCE($1, crime_type),
         modus_name  = COALESCE($2, modus_name),
         description = COALESCE($3, description),
         is_active   = COALESCE($4, is_active),
         updated_at  = NOW()
     WHERE id = $5 RETURNING *`,
    [crime_type?.toUpperCase(), modus_name, description, is_active, req.params.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, data: result.rows[0] });
};

// DELETE
// const deleteModus = async (req, res) => {
//   const used = await pool.query(
//     `SELECT id FROM crime_modus WHERE modus_reference_id = $1 LIMIT 1`,
//     [req.params.id]
//   );
//   if (used.rows.length > 0)
//     return res.status(400).json({ success: false, message: "Cannot delete — modus is used in existing reports. Disable it instead." });

//   const result = await pool.query(
//     `DELETE FROM crime_modus_reference WHERE id = $1 RETURNING *`,
//     [req.params.id]
//   );
//   if (result.rows.length === 0)
//     return res.status(404).json({ success: false, message: "Not found" });
//   res.json({ success: true, message: "Deleted successfully" });
// };

module.exports = { getAllModus, getModusById, createModus, updateModus };