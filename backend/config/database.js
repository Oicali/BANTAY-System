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

// ── 2. Read SSL cert ──────────────────────────────────────────────────────────
let sslCert;
try {
  if (process.env.DB_SSL_CA_CONTENT) {
    // Production (Render) — read from environment variable
    sslCert = process.env.DB_SSL_CA_CONTENT.replace(/\\n/g, "\n");
  } else if (process.env.DB_SSL_CA) {
    // Local development — read from file
    sslCert = fs.readFileSync(process.env.DB_SSL_CA).toString();
  } else {
    throw new Error("No SSL certificate provided (DB_SSL_CA_CONTENT or DB_SSL_CA required)");
  }
} catch (err) {
  console.error("❌ Failed to read SSL certificate:", err.message);
  process.exit(1);
}

// ── 3. Connection pool ────────────────────────────────────────────────────────
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true, ca: sslCert },
  max: 5,
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ── 4. Per-connection config ──────────────────────────────────────────────────
pool.on("connect", async (client) => {
  try {
    await client.query("SET TIMEZONE = 'Asia/Manila'");
    await client.query("SET statement_timeout = '30s'");
    console.log("🗄️ PostgreSQL connected (Aiven)");
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
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = pool;