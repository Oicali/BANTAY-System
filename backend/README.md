B.A.N.T.A.Y. Web Backend Server — Overview & Setup

Project Overview
This backend powers the web application of the project B.A.N.T.A.Y.
It handles API requests, authentication, database operations, and other server-side logic.

Installation & Setup
1. Obtain source: clone the repository into your workspace.
2. From the backend directory, run npm install. After install, verify your Node.js version and compatibility with package.json and the project scripts.
3. Copy the sample environment file:
   cp .env.example .env

   If you are using Windows PowerShell, use:
   Copy-Item .env.example .env

4. Update the values in your local .env file. The required variables are defined in .env.example and should match your local database, Cloudinary, email, and AI service configuration.

Example values from the template:

DB_USER=
DB_PASS=
DB_HOST=
DB_PORT=
DB_NAME=
DB_SSL_CA=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_PRESET=

DB_IMG=
JWT_SECRET=

BREVO_API_KEY=
BREVO_SENDER_EMAIL=

NODE_ENV=development
PORT=5000
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

PYTHON_SERVICE_URL=http://localhost:8000
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
GEMINI_API_KEY=

Run the server via terminal:
npm run dev

For production mode:
npm start

Project Structure
backend/
  config/
  features/
    ai-assessment/
    audit/
    auth/
    blotter/
    cases/
    crime-map/
    dashboard/
    gps/
    modus/
    notifications/
    patrols/
    residents/
    user/
  jobs/
  shared/
  server.js
  .env
  package.json

Core Technologies
- Node.js + Express
- PostgreSQL
- JWT authentication
- Cloudinary for file uploads
- Firebase Admin for notification and auth integrations
- Brevo for email services
- GIS / mapping utilities and patrol tracking
- Python AI assessment service integration

Main API Modules
- /auth
- /users
- /user-management
- /blotters
- /modus-management
- /cases
- /crime-map
- /crime-dashboard
- /patrol
- /gps
- /ai-assessment
- /residents
- /audit-log
- /notifications

Health Check
The backend exposes a quick status endpoint:
GET /health

Example response:
{
  "status": "✅ ok",
  "uptime": "⏱️ 123s",
  "timestamp": "2026-10-18T12:00:00.000Z"
}

Base URL
By default:
http://localhost:5000

Notes
- Update FRONTEND_URL and BACKEND_URL according to your local or deployed environment.
- The Python AI service must be running before using AI assessment endpoints.
- Ensure your database credentials and SSL certificate are valid for PostgreSQL connections.
- For local development, keep NODE_ENV=development and use the frontend URL at http://localhost:5173.

Common Commands
npm install
npm run dev
npm start

This backend is the API layer for the B.A.N.T.A.Y. system and is responsible for powering the web application’s business logic, data handling, and integrations.
