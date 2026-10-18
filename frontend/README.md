B.A.N.T.A.Y. Web Frontend — Overview & Setup

Project Overview
This frontend powers the web application of the project B.A.N.T.A.Y.
It handles the user interface, authentication flow, map visualization, dashboard views, patrol controls, and interactions with the backend API.

Installation & Setup
1. Obtain source: clone the repository into your workspace.
2. From the frontend directory, run npm install. After install, verify your Node.js version and compatibility with package.json and the project scripts.
3. Create a .env file in the frontend directory with the required environment variables.

Example configuration:

VITE_API_URL=http://localhost:5000
VITE_MAPBOX_TOKEN=your_mapbox_access_token

Notes:
- VITE_API_URL should point to the backend server URL.
- VITE_MAPBOX_TOKEN is required for map-related features and mapbox access in the app.

Run the app via terminal:
npm run dev

For production build:
npm run build

For local preview of the production build:
npm run preview

Project Structure
frontend/
  public/
  src/
    App.css
    App.jsx
    index.css
    main.jsx
    assets/
    components/
    hooks/
    utils/
  index.html
  package.json
  vite.config.js
  eslint.config.js
  vercel.json

Core Technologies
- React
- Vite
- React Router
- Mapbox / react-map-gl
- Recharts
- JSPDF / html2canvas for export features
- XLSX for spreadsheet processing
- JWT-based authenticated frontend flows

Main Features
- Authentication and session management
- Crime dashboards and reporting
- Patrol and incident workflows
- GIS mapping and map-based scene analysis
- Resident, user, and case management screens
- PDF and spreadsheet export utilities

Development Notes
- The app depends on the backend running at http://localhost:5000 for most functionality.
- If the backend is not running, most data-fetching screens will fail to load data.
- Keep environment values in a local .env file and do not commit secrets to the repository.
- Map features require a valid Mapbox token in VITE_MAPBOX_TOKEN.

Health Check
The frontend does not expose a backend health endpoint directly; instead, it relies on the backend service at the configured VITE_API_URL.

Base URL
By default:
http://localhost:5173

Common Commands
npm install
npm run dev
npm run build
npm run preview
npm run lint

This frontend is the UI layer for the B.A.N.T.A.Y. system and is responsible for rendering the application experience, interacting with API endpoints, and visualizing operational data for end users.
