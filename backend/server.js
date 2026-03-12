const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const tokenManager = require("./shared/utils/tokenManager");

const app = express();

// ── 1. CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,         // e.g. https://bantay-system.vercel.app
  "http://localhost:5173",           // Vite dev server
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── 2. Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ── 3. Database ───────────────────────────────────────────────────────────────
require("./config/database");

// ── 4. Routes ─────────────────────────────────────────────────────────────────
app.use("/auth",             require("./features/auth/authRoutes"));
// app.use("/users",            require("./features/user/routes/profileRoutes"));
// app.use("/user-management",  require("./features/user/routes/userRoutes"));
// app.use("/blotters",         require("./features/blotter/routes/blotterRoutes"));
// app.use("/modus-management", require("./features/modus/routes/modusRoutes"));
// app.use("/cases",            require("./features/cases/routes/casesRoutes"));
// app.use("/crime-map",        require("./features/crime-map/routes/crimeMapRoutes"));

// ── 5. Static uploads ─────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── 6. Health check ───────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "🗄️ BANTAY Backend is running!" });
});

app.get("/health", (req, res) => {
  res.json({
    status: "✅ ok",
    uptime: `⏱️ ${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
  });
});

// ── 7. 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── 8. Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === "development";
  console.error("❌ Server error:", err.message);
  res.status(err.status || 500).json({
    message: isDev ? err.message : "Internal server error",
    ...(isDev && { stack: err.stack }),
  });
});

// ── 9. Start server ───────────────────────────────────────────────────────────
// ── 9. Start server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV === "production") {
    console.log(`✅ Server running on http://localhost:3000`);
  } else {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  }
});
// ── 10. Token cleanup (every hour) ────────────────────────────────────────────
setInterval(async () => {
  try {
    await tokenManager.cleanupExpiredTokens();
  } catch (err) {
    console.error("🧹 Token cleanup error:", err.message);
  }
}, 60 * 60 * 1000);
console.log("🧹 Token cleanup scheduled (runs every hour)");