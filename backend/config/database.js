const { Pool } = require("pg");
const fs = require("fs");
require("dotenv").config();

// ── 1. Validate required env vars at startup ──────────────────────────────────
const REQUIRED_ENV = ["DB_USER", "DB_PASS", "DB_HOST", "DB_PORT", "DB_NAME"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

// ── 2. SSL configuration ──────────────────────────────────────────────────────
// Aiven requires a CA cert. Railway uses SSL but doesn't need a cert file.
// If neither DB_SSL_CA_CONTENT nor DB_SSL_CA is provided, we connect with
// SSL enabled but without cert verification (correct for Railway).
let sslConfig;
try {
  if (process.env.DB_SSL_CA_CONTENT) {
    // Production with explicit cert (Aiven on Render)
    const ca = process.env.DB_SSL_CA_CONTENT.replace(/\\n/g, "\n");
    sslConfig = { rejectUnauthorized: true, ca };
    console.log("🔐 SSL: using cert from DB_SSL_CA_CONTENT");
  } else if (process.env.DB_SSL_CA) {
    // Local development with cert file (Aiven locally)
    const ca = fs.readFileSync(process.env.DB_SSL_CA).toString();
    sslConfig = { rejectUnauthorized: true, ca };
    console.log("🔐 SSL: using cert from DB_SSL_CA file");
  } else {
    // Railway — SSL enabled, no cert required
    sslConfig = { rejectUnauthorized: false };
    console.log("🔐 SSL: no cert (Railway mode)");
  }
} catch (err) {
  console.error("❌ Failed to read SSL certificate:", err.message);
  process.exit(1);
}

// ── 3. Connection pool ────────────────────────────────────────────────────────
// Railway has no hard connection limit so max can be higher.
// If you ever switch back to Aiven free tier, lower max to 3 and min to 0.
const pool = new Pool({
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  ssl:      sslConfig,
  max:      10,   // Railway can handle this comfortably
  min:      0,    // don't hold idle connections open
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis:  5_000,
});

// ── 4. Per-connection config ──────────────────────────────────────────────────
pool.on("connect", async (client) => {
  try {
    await client.query("SET TIMEZONE = 'Asia/Manila'");
    await client.query("SET statement_timeout = '30s'");
    console.log("🗄️ PostgreSQL connected");
  } catch (err) {
    console.error("⚠️ Failed to configure DB client:", err.message);
  }
});

// ── 5. Pool error handler (prevents server crash) ─────────────────────────────
pool.on("error", (err) => {
  console.error("❌ Unexpected DB pool error:", err.message);
});

// ── 6. Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`${signal} received — closing DB pool...`);
  await pool.end();
  process.exit(0);
};
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = pool;