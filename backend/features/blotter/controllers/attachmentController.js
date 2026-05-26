const pool = require("../../../config/database");
const cloudinary = require("../../../config/cloudinary");
const streamifier = require("streamifier");

// Upload to Cloudinary via stream
const uploadToCloudinary = (buffer, folder, publicId, resourceType = "image") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,  // ← was hardcoded "image"
        // Only apply image transformations for images
        ...(resourceType === "image" && {
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        }),
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// POST /blotters/:id/attachments
const uploadAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const { caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const blotter = await pool.query(
      `SELECT blotter_id FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [id]
    );
    if (blotter.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Blotter not found" });
    }

    const count = await pool.query(
      `SELECT COUNT(*) FROM blotter_attachments WHERE blotter_id = $1`,
      [id]
    );
    if (parseInt(count.rows[0].count) >= 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum 5 attachments per report",
      });
    }

    // ← Detect resource type from mimetype
    const isVideo = req.file.mimetype.startsWith("video/");
    const resourceType = isVideo ? "video" : "image";

    const publicId = `bantay_evidence_${id}_${Date.now()}`;
    const result = await uploadToCloudinary(
      req.file.buffer,
      "bantay/evidence",
      publicId,
      resourceType  // ← pass it through
    );

    const attachment = await pool.query(
      `INSERT INTO blotter_attachments 
        (blotter_id, file_url, public_id, file_name, file_type, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        result.secure_url,
        result.public_id,
        req.file.originalname,
        req.file.mimetype,  // ← store mimetype so the frontend can distinguish
        caption || null,
        req.user.user_id,
      ]
    );

    res.status(201).json({ success: true, data: attachment.rows[0] });
  } catch (error) {
    console.error("Upload attachment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /blotters/:id/attachments
const getAttachments = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT attachment_id, blotter_id, file_url, public_id, file_name, file_type, caption, uploaded_by,
  TO_CHAR(uploaded_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS') AS uploaded_at
 FROM blotter_attachments WHERE blotter_id = $1 ORDER BY uploaded_at ASC`,
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /blotters/:id/attachments/:attachmentId
const deleteAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;

    const attachment = await pool.query(
      `SELECT * FROM blotter_attachments WHERE attachment_id = $1`,
      [attachmentId]
    );
    if (attachment.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Attachment not found" });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(attachment.rows[0].public_id);

    // Delete from DB
    await pool.query(
      `DELETE FROM blotter_attachments WHERE attachment_id = $1`,
      [attachmentId]
    );

    res.json({ success: true, message: "Attachment deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { uploadAttachment, getAttachments, deleteAttachment };