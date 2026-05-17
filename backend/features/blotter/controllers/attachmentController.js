const pool = require("../../../config/database");
const cloudinary = require("../../../config/cloudinary");
const streamifier = require("streamifier");

// Upload to Cloudinary via stream
const uploadToCloudinary = (buffer, folder, publicId) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
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
console.log("Caption received:", caption); 
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    // Verify blotter exists
    const blotter = await pool.query(
      `SELECT blotter_id FROM blotter_entries WHERE blotter_id = $1 AND is_deleted = false`,
      [id]
    );
    if (blotter.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Blotter not found" });
    }

    // Check max 5 attachments per blotter
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

    const publicId = `bantay_evidence_${id}_${Date.now()}`;
    const result = await uploadToCloudinary(
      req.file.buffer,
      "bantay/evidence",
      publicId
    );

    const attachment = await pool.query(
      `INSERT INTO blotter_attachments 
        (blotter_id, file_url, public_id, file_name, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        result.secure_url,
        result.public_id,
        req.file.originalname,
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
      `SELECT * FROM blotter_attachments WHERE blotter_id = $1 ORDER BY uploaded_at ASC`,
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