# Direct Hire — Full-Stack Project

```
directhire-v2/
├── backend/          Express API server  →  http://localhost:4000
├── frontend/         Next.js website     →  http://localhost:3000
└── package.json      Root (runs both together)
```

---

## Prerequisites

Install these before starting:

| Tool | Download | Check installed |
|---|---|---|
| Node.js 18+ | [nodejs.org](https://nodejs.org) | `node -v` |
| PostgreSQL 14+ | [postgresql.org](https://postgresql.org) | `psql --version` |
| npm 9+ | Comes with Node | `npm -v` |

---

## First-time setup

### Step 1 — Install all dependencies

```
# Windows (PowerShell or CMD)
cd directhire-v2
npm install

# Mac / Linux
cd directhire-v2
npm install
```

---

### Step 2 — Configure the backend

```
# Windows
cd backend
copy .env.example .env
notepad .env

# Mac / Linux
cd backend
cp .env.example .env
nano .env
```

Generate secrets and paste them into the `.env` file:

```
# Windows PowerShell — run each line separately
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(64).toString('base64'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('base64'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

The minimum you must set in `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/directhire?schema=public"
JWT_ACCESS_SECRET=paste_first_output_here
JWT_REFRESH_SECRET=paste_second_output_here
ENCRYPTION_KEY=paste_third_output_here
CRON_SECRET=paste_fourth_output_here
```

Leave everything else at default for local development.

---

### Step 3 — Create the database

```
# Windows — open psql as postgres user
psql -U postgres

# Then run inside psql:
CREATE DATABASE directhire;
\q
```

---

### Step 4 — Run database migrations and seed

```
# Windows (from directhire-v2/backend/)
cd backend
npx prisma migrate dev --name init
npm run db:seed
cd ..

# Mac / Linux
cd backend
npm run db:migrate
npm run db:seed
cd ..
```

---

### Step 5 — Configure the frontend

```
# Windows
cd frontend
copy .env.local.example .env.local

# Mac / Linux
cd frontend
cp .env.local.example .env.local
cd ..
```

`.env.local` just needs:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Running the project

### Option A — Run both together from root (recommended)

```
# From directhire-v2/ root
npm run dev
```

This starts both servers at once using `concurrently`:
- **Backend**  → http://localhost:4000
- **Frontend** → http://localhost:3000

---

### Option B — Run separately (two terminals)

**Terminal 1 — Backend:**
```
cd directhire-v2/backend
npm run dev
```

**Terminal 2 — Frontend:**
```
cd directhire-v2/frontend
npm run dev
```

---

## Demo credentials (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@directhire.io | Admin123!Local |
| Worker | ana.koci@worker.demo | Worker123! |
| Employer | hr@caremount.demo | Employer123! |

---

## How the two servers connect

```
Browser → http://localhost:3000  (Next.js frontend)
              │
              │  /api/* requests
              ▼
         next.config.js rewrite proxy
              │
              ▼
         http://localhost:4000  (Express backend)
              │
              ├── /api/auth/*
              ├── /api/onboarding/*
              ├── /api/uploads/*
              ├── /api/user/*
              ├── /api/admin/*
              └── /api/cron/*
```

The Next.js `next.config.js` rewrites all `/api/*` requests to the backend.
This means cookies are always sent to the same origin (`localhost:3000`),
which avoids all cross-origin cookie issues during development.

In production, you point both to the same domain with a reverse proxy (Nginx/Caddy)
or deploy behind a single host (Railway, Render etc.).

---

## Project structure

```
directhire-v2/
│
├── package.json                    Root scripts (dev, build, db:*)
│
├── backend/
│   ├── .env.example                Copy to .env and fill in
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma           Database schema (21 models)
│   ├── scripts/
│   │   └── seed.ts                 Demo data seeder
│   └── src/
│       ├── server.ts               Express app entry point
│       ├── lib/
│       │   ├── prisma.ts           DB client singleton
│       │   ├── auth.ts             JWT sign/verify + cookie helpers
│       │   ├── response.ts         ok(), err(), paginated() helpers
│       │   └── encrypt.ts          AES-256-GCM field encryption
│       ├── middleware/
│       │   ├── auth.middleware.ts  requireAuth(), requireAdmin()
│       │   ├── error.middleware.ts Global error handler
│       │   └── ratelimit.middleware.ts
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── onboarding.routes.ts
│       │   ├── uploads.routes.ts
│       │   ├── user.routes.ts
│       │   ├── admin.routes.ts
│       │   └── cron.routes.ts
│       ├── controllers/
│       │   ├── auth.controller.ts
│       │   ├── onboarding.controller.ts
│       │   ├── uploads.controller.ts
│       │   ├── user.controller.ts
│       │   └── admin.controller.ts
│       ├── services/
│       │   ├── email/              Multi-provider email service
│       │   ├── storage/            Local + Supabase file storage
│       │   └── queue/              BullMQ + inline job runner
│       └── types/
│           └── index.ts
│
└── frontend/
    ├── .env.local.example          Copy to .env.local
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── next.config.js              /api/* proxy to backend
    └── src/
        ├── middleware.ts           Route protection (JWT cookie check)
        ├── app/
        │   ├── layout.tsx
        │   ├── globals.css
        │   ├── (auth)/             Public auth pages
        │   │   ├── login/
        │   │   ├── register/
        │   │   ├── forgot-password/
        │   │   └── reset-password/
        │   └── (app)/             Protected app pages
        │       ├── worker/
        │       │   ├── dashboard/
        │       │   └── onboarding/
        │       ├── employer/
        │       │   ├── dashboard/
        │       │   └── onboarding/
        │       └── admin/
        │           ├── dashboard/
        │           └── approvals/
        ├── lib/
        │   ├── api-client.ts       Typed fetch wrapper → /api/*
        │   └── stores/
        │       └── onboarding.store.ts  Zustand (autosave, uploads)
        └── components/             (shared UI components)
```

---

## Backend API endpoints

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/verify-email

GET    /api/onboarding/progress
POST   /api/onboarding/save-step
POST   /api/onboarding/submit

POST   /api/uploads
GET    /api/uploads
DELETE /api/uploads/:id

GET    /api/user/profile
PATCH  /api/user/profile
GET    /api/user/notifications
PATCH  /api/user/notifications/:id/read

GET    /api/admin/stats
GET    /api/admin/submissions
POST   /api/admin/review
GET    /api/admin/jobs
PATCH  /api/admin/jobs/:id/status
PATCH  /api/admin/documents/:id/review
GET    /api/admin/audit-log
GET    /api/admin/users
PATCH  /api/admin/users/:id/suspend
PATCH  /api/admin/users/:id/activate

GET    /api/jobs
GET    /api/jobs/countries
GET    /api/jobs/filter-options
POST   /api/jobs/:id/save
DELETE /api/saved-jobs/:jobId
GET    /api/saved-jobs
POST   /api/jobs/:id/apply
GET    /api/applications/mine

GET    /api/employer/candidates
GET    /api/employer/jobs
POST   /api/employer/jobs
GET    /api/employer/applications
PATCH  /api/employer/applications/:id/status
GET    /api/employer/locks
PATCH  /api/employer/locks/:id/release
GET    /api/employer/billing

GET    /api/cron              (requires X-Cron-Secret header)
GET    /health
```

---

## Common issues on Windows

**psql not found:**
Add PostgreSQL to your PATH. Default location:
`C:\Program Files\PostgreSQL\16\bin`
Add this to System Environment Variables → Path.

**Port already in use:**
```
# Find and kill process on port 4000
netstat -ano | findstr :4000
taskkill /PID <PID_NUMBER> /F
```

**node_modules issues:**
```
# Delete and reinstall
rmdir /s /q node_modules
rmdir /s /q backend\node_modules
rmdir /s /q frontend\node_modules
npm install
```

**Prisma client not generated:**
```
cd backend
npx prisma generate
```
