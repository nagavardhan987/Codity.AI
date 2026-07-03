# Design Decisions

## Postgres `FOR UPDATE SKIP LOCKED` vs Redis/RabbitMQ
The decision to use PostgreSQL with `FOR UPDATE SKIP LOCKED` for job claiming instead of a dedicated message broker (like Redis or RabbitMQ) simplifies the operational architecture. 
- **Atomic Claiming:** `FOR UPDATE SKIP LOCKED` allows multiple workers to concurrently poll the `jobs` table without locking each other out. It grabs rows that are available and instantly locks them, while other workers simply skip those rows.
- **Single Source of Truth:** Managing jobs, metadata, and application data in the same PostgreSQL database enables transactional guarantees. For example, moving a failed job to the DLQ and updating its status can be done in a single transaction.
- **Simplicity:** By avoiding a separate broker, deployment is streamlined (only needing Node.js and Postgres).

## Retry Logic
The worker node handles retrying jobs that fail. 
- A retry policy (fixed, linear, or exponential) is attached to each queue.
- When a job fails (caught in the worker execution loop in `worker/worker.ts`), the worker looks at the job's execution attempt count.
- If the attempt count is within the permitted `max_retries`, it computes the delay based on the policy and updates the job's `run_at` to a future timestamp, effectively requeuing it.
- If the max retries are exceeded, the job is moved to the Dead Letter Queue (`dead_letter_queue` table) for manual inspection.

## Dead Worker Recovery (Heartbeat and Sweeper Mechanism)
To handle scenarios where a worker crashes or becomes unresponsive while processing a job:
- **Worker Heartbeat:** Each worker periodically (every 15 seconds) inserts a heartbeat record containing memory and CPU usage into `worker_heartbeats`.
- **Scheduler Sweeper:** The scheduler loop (`scheduler/scheduler.ts`) scans for workers that haven't emitted a heartbeat in over 60 seconds.
- **Recovery:** When a stalled worker is detected, the scheduler marks the worker as 'dead'. It then looks for any 'running' job executions tied to that worker, marks those executions as 'failed', and resets the corresponding job status to 'queued' so another healthy worker can claim and run it.

## CASCADE Behaviors
The system ensures referential integrity using PostgreSQL features. Instead of complex application-level cascading deletes, jobs are bound to queues, queues to projects, and projects to organizations. 

## Indexing for Performance
A composite index on `(queue_id, status, run_at)` exists on the `Jobs` table. This is critical for the worker claim query's performance under high concurrency. When hundreds of workers simultaneously poll the database using `FOR UPDATE SKIP LOCKED`, this index ensures they can instantly locate the earliest available `queued` job in their assigned queue without performing expensive sequential scans, maintaining high throughput.
