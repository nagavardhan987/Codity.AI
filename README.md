# Distributed Job Scheduler

A highly scalable, PostgreSQL-backed distributed job scheduler and worker system.

## Features
- **Job Types**: Immediate, Delayed, Scheduled, Recurring (Cron), and Batch jobs.
- **Concurrency & Scaling**: Workers use PostgreSQL `FOR UPDATE SKIP LOCKED` for lock-free atomic job claiming.
- **Reliability**: Dead Letter Queue (DLQ), retry policies (linear, exponential), and dead worker recovery.

## Project Structure
- `job-scheduler-backend/`: Express API, Scheduler service, and Worker logic.
- `job-scheduler-frontend/`: Next.js/React Dashboard.
- `docs/`: System documentation:
  - [ER Diagram](docs/ER_Diagram.md)
  - [Architecture](docs/Architecture.md)
  - [API Reference](docs/API_Reference.md)
  - [Design Decisions](docs/Design_Decisions.md)
- `tests/`: Automated tests verifying core flows.

## Setup Instructions

### 1. Prerequisites
- Node.js (v18+)
- Docker & Docker Compose

### 2. Run PostgreSQL
The project provides a `docker-compose.yml` in the backend directory.
```bash
cd job-scheduler-backend
docker-compose up -d
```

### 3. Environment Variables
In `job-scheduler-backend`, ensure you have an `.env` file containing:
```env
PORT=4000
DATABASE_URL=postgres://scheduler_user:scheduler_password@localhost:5432/job_scheduler
JWT_SECRET=supersecretjwt
```

### 4. Install Dependencies
```bash
cd job-scheduler-backend
npm install
```

### 5. Run Database Migrations and Seed
To set up the database schema and populate it with initial data (users, organizations, queues):
```bash
npm run migrate
npx tsx src/seed.ts
```
> **Demo Credentials**: The seed script creates a default user you can use to log into the dashboard:
> **Email**: `demo@example.com`
> **Password**: `password123`

### 6. Start the Backend API & Scheduler
```bash
npm run dev
```
> **Backend API Base URL**: The backend Express server runs on `http://localhost:4000`. You can find the full API endpoint documentation in the [API Reference](docs/API_Reference.md).

### 7. Run a Worker Node
You can start a standalone worker process. The worker uses the same codebase but typically runs via a dedicated entry point.
```bash
npx tsx src/worker/run.ts
```
*(You can run multiple instances of the worker in different terminals to see distributed locking in action).*

### 8. Frontend (Dashboard)
To view the UI:
```bash
cd ../job-scheduler-frontend
npm install
npm run dev
```
Open `http://localhost:3000` (or the port specified by Vite, e.g., 5173) to monitor queues, active workers, jobs, and the Dead Letter Queue.

## Testing
To verify the core logic paths without running the UI, you can execute the test suite:
```bash
cd job-scheduler-backend
npm run test
```
**Test Coverage**: The suite programmatically verifies the `FOR UPDATE SKIP LOCKED` atomic claim race condition, the Dead Letter Queue routing on max failure retries, the dead-worker stalled detection and requeue mechanism, and schema-level validation constraints.
