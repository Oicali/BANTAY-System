// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config();

const app = express();

// Middleware
app.use(cors());            // Allow cross-origin requests
app.use(express.json());    // Parse JSON bodies

// Basic route for testing
app.get('/', (req, res) => {
  res.send('Backend is running...');
});

// Health check route (optional, good for Railway monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
