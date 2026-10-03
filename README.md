# Cloudflare Meet: Serverless Video Conferencing Platform

A production-ready, Zoom/Google Meet-inspired video conferencing platform natively architected and deployed on Cloudflare's serverless edge infrastructure.

---

## 🏛 Architecture Overview

Cloudflare Meet leverages Cloudflare's complete developer platform without introducing any external media servers, external TURN providers, VPS instances, or third-party databases:

```
                                  +-----------------------------+
                                  |    Cloudflare Pages (UI)    |
                                  |    React + Vite + Tailwind   |
                                  +--------------+--------------+
                                                 |
                                     HTTPS REST  |  WebSocket Room
                                        API      |    Signaling
                                                 v
                                  +-----------------------------+
                                  |   Cloudflare Worker (API)   |
                                  +-------+--------------+------+
                                          |              |
                      +-------------------+              +-------------------+
                      |                   |              |                   |
                      v                   v              v                   v
              +---------------+   +---------------+ +---------+     +-----------------+
              | Cloudflare D1 |   | Cloudflare DO | | R2 Buck |     | Cloudflare Calls|
              | Relational DB |   | (Room State)  | | Storage |     | (SFU & TURN)    |
              +---------------+   +---------------+ +---------+     +-----------------+
```

### Component Breakdown
1. **Cloudflare Pages (`/frontend`)**:
   - Single-Page Application (SPA) built with React 18, TypeScript, Vite, and modern styling.
   - Pre-join device preview with microphone volume activity meter (`AudioContext`), camera selection, audio output selection, mute/video default toggles, password entry, and waiting room status.
   - In-meeting stage with dynamic Grid and Speaker layouts, video tiles, initials fallback, audio speaking glowing indicators, screen sharing, unread chat notification badges, and participant management.
2. **Cloudflare Workers (`/worker`)**:
   - API routing for user registration, authentication, sessions, meeting creation, meeting metadata, participant logs, and file downloads.
   - PBKDF2 password hashing (100,000 iterations with SHA-256 and 16-byte cryptographically secure salt) and constant-time equality checks.
   - Secure HttpOnly, SameSite=Lax session cookies.
   - Centralized error handler returning structured errors (`{ success: false, error: { code, message } }`).
3. **Cloudflare D1 (`/migrations`)**:
   - Relational database schema with parameterized queries for `users`, `sessions`, `meetings`, `meeting_participants`, `meeting_invitations`, `meeting_events`, `meeting_files`, and `meeting_recordings`.
4. **Cloudflare Durable Objects (`MeetingRoom` in `/worker/src/rooms.ts`)**:
   - Coordinates ephemeral realtime room state: participant presence, lobby / waiting room queue, in-room chat messages, participant state updates (mic, camera, speaking, screen sharing), and host controls (admit, deny, mute, remove, end for all).
   - Instant WebSocket disconnection and reconnection handling with exponential backoff.
5. **Cloudflare Realtime SFU & Cloudflare TURN (Cloudflare Calls in `/worker/src/realtime.ts`)**:
   - Cloudflare Calls API handles WebRTC audio/video forwarding and screen sharing.
   - Generates short-lived TURN credentials (`POST /v1/apps/{appId}/turn/credentials`) so clients behind restrictive NATs/firewalls connect directly through Cloudflare edge TURN relays.
   - Privileged credentials (`CALLS_APP_ID`, `CALLS_APP_SECRET`) remain strictly on the Worker.
6. **Cloudflare R2 Object Storage (`/worker/src/storage.ts`)**:
   - Secure object storage for meeting file attachments, user avatars, and recordings.
   - Automatic MIME type validation, file size limits (50 MB files, 5 MB avatars), and path-traversal sanitization.

---

## 📁 Project Structure

```
cloudflare-zoom/
├── frontend/                     # Cloudflare Pages Frontend Application
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx            # Real-time in-call chat drawer
│   │   │   ├── ControlBar.tsx           # Mic, camera, screen share, layout, leave controls
│   │   │   ├── DevicePreview.tsx        # Pre-join camera/mic preview & device selector
│   │   │   ├── FilesPanel.tsx           # Meeting file uploads & downloads from R2
│   │   │   ├── Header.tsx               # Top navigation bar
│   │   │   ├── ParticipantTile.tsx      # Video tile with speaking indicator & badges
│   │   │   ├── ParticipantsPanel.tsx    # Participant list & host admit/mute/kick controls
│   │   │   ├── ReconnectingBanner.tsx   # Network disconnection auto-reconnect banner
│   │   │   ├── VideoGrid.tsx            # Adaptive Grid vs. Speaker view
│   │   │   └── WaitingRoomOverlay.tsx   # Waiting room / lobby holding screen
│   │   ├── hooks/
│   │   │   ├── useAuth.tsx              # Authentication state provider & session hooks
│   │   │   ├── useMediaDevices.ts       # Device enumeration, stream acquisition, mic meter
│   │   │   └── useRoomWebSocket.ts      # WebSocket connection to DO room with backoff
│   │   ├── lib/
│   │   │   ├── api.ts                   # REST client for Worker API
│   │   │   ├── callsClient.ts           # WebRTC client for Cloudflare Calls SFU
│   │   │   └── types.ts                 # Shared UI & WebRTC types
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx            # Instant meeting, Join with Code, Schedule modal
│   │   │   ├── Login.tsx                # User authentication
│   │   │   ├── MeetingRoom.tsx          # Meeting room coordinator
│   │   │   ├── MeetingsList.tsx         # Meeting history, schedule, files
│   │   │   ├── Profile.tsx              # User profile & avatar upload
│   │   │   └── Register.tsx             # User registration
│   │   ├── App.tsx                      # Application router
│   │   ├── index.css                    # Dark-themed modern Tailwind styles
│   │   └── main.tsx                     # React root mount
│   ├── index.html                       # HTML template
│   ├── tsconfig.json                    # Frontend TypeScript configuration
│   └── vite.config.ts                   # Vite bundler configuration
│
├── worker/                       # Cloudflare Worker & Durable Objects Backend
│   ├── src/
│   │   ├── auth.ts                      # PBKDF2 hashing, sessions, cookies, public ID generator
│   │   ├── db.ts                        # D1 database queries with parameterized SQL
│   │   ├── index.ts                     # Worker fetch entrypoint, REST API router, WS upgrade
│   │   ├── meetings.ts                  # Meeting creation, lookup, password check, permissions
│   │   ├── middleware.ts                # CORS, security headers, rate limiting, auth checks
│   │   ├── realtime.ts                  # Cloudflare Calls SFU & TURN client
│   │   ├── rooms.ts                     # MeetingRoom Durable Object class
│   │   ├── storage.ts                   # R2 storage uploads, avatars, file sharing
│   │   └── types.ts                     # Worker interfaces and environment bindings
│   └── tsconfig.json                    # Worker TypeScript configuration
│
├── migrations/
│   └── 0001_initial_schema.sql          # D1 relational database schema & indexes
│
├── scripts/
│   ├── build.cjs                        # Transpiler for Worker TypeScript modules
│   └── verify_frontend.cjs              # React/TSX compiler & verification script
│
├── tests/                               # Comprehensive Automated Test Suite
│   ├── fixtures/
│   │   ├── mockD1.js                    # In-memory SQLite D1 database test adapter
│   │   ├── mockDO.js                    # WebSocketPair & Durable Object test fixture
│   │   ├── mockR2.js                    # In-memory R2 bucket mock
│   │   ├── setup.js                     # Global WebCrypto & Web standard polyfills
│   │   └── sqlite_bridge.py             # SQLite bridge process for D1 testing
│   ├── auth.test.js                     # Authentication, PBKDF2, sessions tests
│   ├── meetings.test.js                 # Meeting lifecycle, permissions, password tests
│   ├── rooms.test.js                    # Durable Object lobby, chat, host control tests
│   ├── realtime.test.js                 # Cloudflare Calls SFU & TURN tests
│   ├── storage.test.js                  # R2 file upload, download, and sanitization tests
│   ├── e2e.test.js                      # Full multi-participant end-to-end workflow test
│   └── runner.js                        # Master test runner
│
├── .env.example                         # Environment variable documentation
├── package.json                         # Build & test scripts
├── wrangler.toml                        # Cloudflare Wrangler configuration (Worker, D1, DO, R2)
└── README.md                            # Complete setup & deployment guide
```

---

## 🚀 Cloudflare Resource Setup Instructions

### 1. Prerequisites
- Node.js 18+ and npm
- Cloudflare account with a Workers Paid subscription (required for Durable Objects)
- Wrangler CLI installed (`npm install -g wrangler` or `npx wrangler`)

Authenticate Wrangler with your Cloudflare account:
```bash
wrangler login
```

### 2. Create the D1 Database
Create the production D1 database:
```bash
wrangler d1 create zoom-db-production
```
*Note the returned `database_id` and paste it into `wrangler.toml` under `[[env.production.d1_databases]]`.*

Apply the database schema migrations:
```bash
# Local development migration
npm run db:migrate:local

# Production remote migration
npm run db:migrate:prod
```

### 3. Create the R2 Storage Bucket
Create the R2 bucket for meeting files, recordings, and user avatars:
```bash
wrangler r2 bucket create zoom-media-storage-prod
```

### 4. Configure Cloudflare Calls (Realtime SFU & TURN)
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Calls**.
2. Click **Create App** and give it a name (e.g., `cloudflare-meet`).
3. Note your **App ID** and generate an **App Secret** (API Token with Calls permissions).
4. Set these secrets securely in your Worker:
```bash
wrangler secret put CALLS_APP_ID --env production
wrangler secret put CALLS_APP_SECRET --env production
```

### 5. Deploy the Cloudflare Worker & Durable Objects
Deploy the backend API and Durable Object room coordinator:
```bash
npm run build:worker
npm run deploy:worker
```
*This deploys the `cloudflare-zoom-production` worker with D1, Durable Objects, and R2 bindings.*

### 6. Deploy the Frontend to Cloudflare Pages
Build the React frontend and deploy to Cloudflare Pages:
```bash
npm run build:frontend
npm run deploy:pages
```
Or connect your GitHub repository directly to Cloudflare Pages:
- **Build command:** `cd frontend && npm run build`
- **Build output directory:** `frontend/dist`
- **Root directory:** `/`

---

## 💻 Local Development Instructions

1. Clone repository and install dependencies:
```bash
npm install
cd frontend && npm install && cd ..
```

2. Copy `.env.example` to `.env` and fill in credentials (or leave blank to use the built-in development fallback):
```bash
cp .env.example .env
```

3. Initialize local D1 database:
```bash
npm run db:migrate:local
```

4. Run the Worker in local development mode:
```bash
npm run dev
```

5. In another terminal, run the Vite frontend development server:
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🧪 Testing Instructions

The repository includes a comprehensive, offline-capable test suite verifying every component against real SQLite databases, WebCrypto hashing, and mock Durable Objects / R2 storage.

Run all test suites:
```bash
npm test
```

Run individual test suites:
```bash
npm run test:auth      # Authentication, PBKDF2 hashing, sessions, cookie validation
npm run test:meetings  # Meeting creation, password verification, permissions
npm run test:rooms     # Durable Object room presence, waiting room, chat, host actions
npm run test:realtime  # Cloudflare Calls SFU & TURN credentials
npm run test:storage   # Cloudflare R2 uploads, downloads, and sanitization
npm run test:e2e       # Multi-participant end-to-end workflow (Host Alice + Guest Bob)
```

Run frontend compilation verification:
```bash
node scripts/verify_frontend.cjs
```

---

## 🔒 Security Notes & Best Practices

1. **Password Security**: Passwords are never stored as plaintext. We use PBKDF2 with HMAC-SHA256, 100,000 iterations, and a 16-byte cryptographically secure random salt using the native Web Crypto API. Password hashes are stored as `pbkdf2:100000:<salt>:<hash>` and compared using constant-time string equality.
2. **Session Cookies**: Sessions use 32-byte cryptographically secure random tokens stored in D1 with a 7-day expiration. Session cookies are delivered with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` (in production).
3. **No Secret Leaks**: Privileged Cloudflare credentials (`CALLS_APP_SECRET`) are kept strictly on the Worker. The browser only receives short-lived TURN credentials or temporary WebRTC session tokens.
4. **Host Authorization**: The server validates user identities against the meeting record in D1 before executing host-only actions (such as ending a meeting, muting participants, or removing users).
5. **Path Traversal & Safe File Uploads**: Files uploaded to R2 are sanitized with basename stripping, special character replacement, and size limits (50 MB for meeting files, 5 MB for avatars).
6. **SQL Parameterization**: All D1 database queries use parameterized SQL bindings (`db.prepare(...).bind(...)`), preventing SQL injection.
7. **Rate Limiting**: Critical endpoints (`/api/auth/register`, `/api/auth/login`) include rate-limiting controls to prevent brute-force attacks.

---

## ⚠️ Known Limitations & Extensions

- **Cloudflare Calls Regional Availability**: Cloudflare Calls operates globally on Cloudflare's Anycast network; however, browser WebRTC support requires HTTPS when accessing camera and microphone devices.
- **Durable Objects Concurrency**: Durable Objects provide single-threaded execution per room, guaranteeing consistency for up to hundreds of concurrent participants per meeting.
- **Recording Architecture**: Cloudflare Calls provides an egress recording API that records media tracks to Cloudflare R2. In this release, recording metadata tables and R2 storage keys are pre-configured; initiating a server-side Calls recording job connects to the `/sessions/{id}/recordings` endpoint when enabled in your Cloudflare Calls account.
