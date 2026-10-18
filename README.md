B.A.N.T.A.Y. Web Application — Full Stack Setup

Project Overview
This repository contains the full-stack application for B.A.N.T.A.Y., including:
- Backend API service in the backend folder
- Frontend web app in the frontend folder

The backend handles authentication, API routing, database access, file upload integrations, patrol workflows, dashboards, and AI assessment services. The frontend provides the user interface, navigation, mapping views, and business workflows for end users.

Repository Structure
.
├── backend/
│   ├── config/
│   ├── features/
│   ├── jobs/
│   ├── shared/
│   ├── .env.example
│   ├── package.json
│   ├── server.js
│   └── README.md
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── README.md
├── docs/
├── database/
├── Dockerfile
├── Dockerfile.python
├── bantay_backup.sql
├── README.md
└── package.json (if present at repo root)

Quick Start
1. Install backend dependencies
   cd backend
   npm install

2. Create and configure the backend .env file
   Copy .env.example to .env and update the values for your local environment.

3. Start the backend server
   npm run dev

4. Install frontend dependencies
   cd ../frontend
   npm install

5. Create and configure the frontend .env file
   Add the required Vite variables such as:
   VITE_API_URL=http://localhost:5000
   VITE_MAPBOX_TOKEN=your_mapbox_access_token

6. Start the frontend app
   npm run dev

Required Services
- PostgreSQL database
- Backend API running on port 5000
- Frontend running on port 5173 (default Vite dev server)
- Optional AI service for the assessment module
- Mapbox token for map-related UI features

Environment Files
- Backend env template: backend/.env.example
- Frontend env values: set in frontend/.env locally

Backend Documentation
See [backend/README.md](backend/README.md) for backend setup, environment variables, project structure, and API notes.

Frontend Documentation
See [frontend/README.md](frontend/README.md) for frontend setup, environment configuration, build commands, and app structure.

Common Local URLs
- Backend: http://localhost:5000
- Frontend: http://localhost:5173

Development Notes
- The backend must be running before the frontend can fetch most data.
- Keep secrets and private configuration values in local .env files and do not commit them.
- Use the backend health route for status checks when the API is up.

This project is the full-stack B.A.N.T.A.Y. system, combining the API service and web frontend into a single repository.
