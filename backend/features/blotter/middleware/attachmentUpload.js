const multer = require("multer");

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB to accommodate videos
 fileFilter: (req, file, cb) => {
  console.log("Uploaded MIME:", file.mimetype);

  const allowedImages = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ];

  const allowedVideos = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];

  const allowed = [...allowedImages, ...allowedVideos];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }
}
});

module.exports = attachmentUpload;