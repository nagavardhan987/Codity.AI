# API Reference

| Endpoint | Method | Auth Required | Payload | Status Codes | Description |
|---|---|---|---|---|---|
| `/api/auth/register` | POST | No | `{ email, password }` | 201, 400 | Register a new user |
| `/api/auth/login` | POST | No | `{ email, password }` | 200, 400, 401 | Login and receive JWT |
| `/api/dashboard/queues` | GET | No | None | 200, 500 | List all queues with active/paused status |
| `/api/dashboard/workers` | GET | No | None | 200, 500 | List all workers and their heartbeats |
| `/api/dashboard/jobs` | GET | No | Query: `queue_id` | 200, 500 | List jobs for a queue |
| `/api/dashboard/jobs/:id/logs` | GET | No | None | 200, 404, 500 | Fetch logs for a specific job |
| `/api/dashboard/queues` | POST | No | `{ name, priority, concurrency_limit }` | 201, 500 | Create a queue (Dashboard demo) |
| `/api/dashboard/queues/:id/toggle`| POST | No | None | 200, 500 | Pause/Resume a queue |
| `/api/dashboard/jobs` | POST | No | `{ queue_id, type, payload, delaySeconds, run_at, cron_expression }` | 201, 500 | Submit a job (Dashboard demo) |
| `/api/dashboard/jobs/:id/retry` | POST | No | None | 200, 500 | Retry a failed/dead job |
| `/api/dashboard/dlq` | GET | No | None | 200, 500 | Fetch DLQ jobs |
| `/api/dashboard/dlq/:jobId/requeue`| POST | No | None | 200, 500 | Requeue a DLQ job |
| `/api/dashboard/metrics` | GET | No | None | 200, 500 | Fetch overview metrics |
| `/api/jobs/` | POST | Yes | `{ queue_id, type, payload, max_retries, run_at, cron_expression, idempotency_key }` | 201, 400, 403 | Submit a new job (immediate/delayed/scheduled/recurring) |
| `/api/jobs/batch` | POST | Yes | `{ jobs: [...] }` | 201, 400, 403 | Submit multiple jobs in batch |
| `/api/jobs/` | GET | Yes | Query: `queue_id, status, limit, offset` | 200, 500 | List jobs with filters (paginated) |
| `/api/jobs/:id` | GET | Yes | None | 200, 404, 500 | Get job detail including full execution history, logs, and payload |
| `/api/orgs/` | POST | Yes | `{ name }` | 201, 400 | Create a new organization |
| `/api/orgs/` | GET | Yes | None | 200, 500 | List organizations the user belongs to |
| `/api/projects/` | POST | Yes | `{ org_id, name }` | 201, 400, 403 | Create a new project in an org |
| `/api/projects/org/:orgId` | GET | Yes | None | 200, 403, 500 | List projects in an org |
| `/api/queues/` | POST | Yes | `{ project_id, name, priority, concurrency_limit, retry_policy }` | 201, 400, 403 | Create a new queue in a project |
| `/api/queues/project/:projectId` | GET | Yes | None | 200, 403, 500 | List queues in a project |
| `/api/queues/:id/pause` | PATCH | Yes | None | 200, 404, 500 | Pause a queue |
| `/api/queues/:id/resume`| PATCH | Yes | None | 200, 404, 500 | Resume a queue |
| `/api/workers/` | GET | Yes | None | 200, 500 | List worker nodes with computed liveness status |
| `/api/dead-letter/` | GET | Yes | None | 200, 500 | List Dead Letter Queue (DLQ) jobs |
| `/api/dead-letter/:id/retry` | POST | Yes | None | 200, 404, 500 | Requeue a job from the DLQ |

## Error Response Shape
All endpoints return a standard error shape when a failure occurs:
```json
{
  "status": "error",
  "message": "Human-readable error description",
  "code": "400"
}
```
**Common Status Codes:**
- `400 Bad Request`: Validation errors, malformed payloads.
- `401 Unauthorized`: Missing or invalid JWT.
- `403 Forbidden`: User does not have permission to access the requested resource (e.g. wrong organization).
- `404 Not Found`: The requested job, queue, or resource does not exist.
- `500 Internal Server Error`: Unexpected backend crash.

## Paginated Response Shape
Endpoints like `GET /api/jobs/` utilize `limit` and `offset` query parameters. The response encapsulates an array of records:
```json
{
  "status": "success",
  "data": {
    "jobs": [
      { "id": "...", "type": "...", "status": "queued" },
      { "id": "...", "type": "...", "status": "completed" }
    ]
  }
}
```

## Request Body Examples

### Scheduled Job
To submit a job that will run exactly once at a specific future time, use the `scheduled` type and provide a `run_at` ISO-8601 timestamp (this is distinct from `delayed` which relies on `delaySeconds` in the dashboard or relative times).
```json
{
  "queue_id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "scheduled",
  "run_at": "2026-12-31T23:59:59Z",
  "payload": {
    "report_name": "Year_End_Summary"
  }
}
```
