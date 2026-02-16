# Pulse - Video Upload, Sensitivity Processing & Streaming Platform

A comprehensive full-stack application for uploading videos, processing them for content sensitivity analysis, and streaming with real-time progress tracking.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB, Socket.io
- **Frontend:** React, Vite, React Router, Socket.io Client
- **Auth:** JWT with role-based access control (RBAC)

## Features

- Video upload with drag-and-drop, progress tracking, and file validation
- Automated content sensitivity analysis (safe/flagged classification) with real-time progress via Socket.io
- HTTP range request streaming for efficient video playback
- Multi-tenant architecture with user data isolation
- Role-based access control: Viewer, Editor, Admin
- Admin panel with user management and system statistics
- Video library with search, filtering by sensitivity/status/category, and pagination
- Responsive dark-themed UI

## Project Structure

```
pulse/
├── backend/
│   ├── src/
│   │   ├── config/        # DB and Socket.io configuration
│   │   ├── controllers/   # Route handlers
│   │   ├── middleware/     # Auth, upload, error handling
│   │   ├── models/        # Mongoose schemas (User, Video)
│   │   ├── routes/        # Express route definitions
│   │   ├── services/      # Sensitivity analysis pipeline
│   │   ├── utils/         # Seed script
│   │   └── server.js      # Application entry point
│   ├── uploads/           # Video file storage
│   ├── .env               # Environment variables
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── context/       # Auth context provider
│   │   ├── hooks/         # Custom hooks (useSocket)
│   │   ├── pages/         # Page components
│   │   ├── services/      # API and Socket.io clients
│   │   ├── App.jsx        # Root component with routing
│   │   └── index.css      # Complete application styles
│   └── package.json
└── README.md
```

## Prerequisites

- Node.js v18+
- MongoDB (running locally on port 27017 or provide a connection URI)

## Setup & Run

### 1. Backend

```bash
cd backend
npm install

# (Optional) Seed an admin user
npm run seed
# Creates: admin@pulse.com / admin123

# Start the server
npm run dev
```

The backend runs on `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

### 3. Open the app

Navigate to `http://localhost:5173` in your browser. Register a new account or log in with the seeded admin credentials.

## Environment Variables

See `backend/.env.example` for all available configuration options.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Backend server port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/pulse` | MongoDB connection string |
| `JWT_SECRET` | - | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | Token expiration time |
| `UPLOAD_DIR` | `uploads` | Directory for uploaded video files |
| `MAX_FILE_SIZE` | `524288000` | Max upload size in bytes (500MB) |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin for the frontend |

## API Endpoints

### Auth
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Authenticate and receive JWT
- `GET /api/auth/me` - Get current user profile

### Videos
- `POST /api/videos/upload` - Upload a video (Editor/Admin)
- `GET /api/videos` - List videos with filtering and pagination
- `GET /api/videos/:id` - Get video metadata
- `PUT /api/videos/:id` - Update video metadata (Editor/Admin)
- `DELETE /api/videos/:id` - Delete a video (Editor/Admin)
- `GET /api/videos/:id/stream` - Stream video with range requests
- `POST /api/videos/:id/reprocess` - Re-trigger sensitivity analysis

### Admin
- `GET /api/admin/users` - List all users (Admin)
- `PUT /api/admin/users/:id/role` - Update user role (Admin)
- `DELETE /api/admin/users/:id` - Delete user (Admin)
- `GET /api/admin/stats` - System statistics (Admin)

## Roles

| Role | Permissions |
|---|---|
| **Viewer** | View videos, stream content |
| **Editor** | Upload, edit, delete own videos |
| **Admin** | Full access including user management |
