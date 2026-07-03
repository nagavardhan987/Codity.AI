import {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from 'kysely';

export interface Database {
  users: UsersTable;
  organizations: OrganizationsTable;
  organization_users: OrganizationUsersTable;
  projects: ProjectsTable;
  retry_policies: RetryPoliciesTable;
  queues: QueuesTable;
  jobs: JobsTable;
  job_executions: JobExecutionsTable;
  job_logs: JobLogsTable;
  workers: WorkersTable;
  worker_heartbeats: WorkerHeartbeatsTable;
  scheduled_jobs: ScheduledJobsTable;
  dead_letter_queue: DeadLetterQueueTable;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  created_at: Generated<Date>;
}
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;

export interface OrganizationsTable {
  id: Generated<string>;
  name: string;
  created_at: Generated<Date>;
}

export interface OrganizationUsersTable {
  org_id: string;
  user_id: string;
  role: string;
}

export interface ProjectsTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  created_at: Generated<Date>;
}

export interface RetryPoliciesTable {
  id: Generated<string>;
  name: string;
  type: 'fixed' | 'linear' | 'exponential';
  max_retries: number;
  delay_seconds: number;
}

export interface QueuesTable {
  id: Generated<string>;
  project_id: string;
  name: string;
  priority: number;
  concurrency_limit: number;
  retry_policy_id: string;
  is_paused: Generated<boolean>;
}

export interface JobsTable {
  id: Generated<string>;
  queue_id: string;
  idempotency_key: string | null;
  type: 'immediate' | 'delayed' | 'scheduled' | 'recurring' | 'batch';
  status: 'queued' | 'scheduled' | 'claimed' | 'running' | 'completed' | 'failed' | 'dead_letter';
  payload: any;
  run_at: Date;
  max_retries: number | null;
  batch_id: string | null;
  scheduled_job_id: string | null;
  claimed_by: string | null;
  claimed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}
export type Job = Selectable<JobsTable>;

export interface JobExecutionsTable {
  id: Generated<string>;
  job_id: string;
  worker_id: string | null;
  status: 'running' | 'completed' | 'failed';
  started_at: Generated<Date>;
  completed_at: Date | null;
  error_details: any | null;
  attempt_number: number;
}

export interface JobLogsTable {
  id: Generated<string>;
  execution_id: string;
  log_level: string;
  message: string;
  timestamp: Generated<Date>;
}

export interface WorkersTable {
  id: Generated<string>;
  hostname: string;
  created_at: Generated<Date>;
}

export interface WorkerHeartbeatsTable {
  id: Generated<string>;
  worker_id: string;
  timestamp: Generated<Date>;
  cpu_usage: number;
  memory_usage: number;
}

export interface ScheduledJobsTable {
  id: Generated<string>;
  queue_id: string;
  cron_expression: string;
  payload: any;
  last_run_at: Date | null;
  next_run_at: Date | null;
}

export interface DeadLetterQueueTable {
  id: Generated<string>;
  job_id: string;
  reason: string;
  moved_at: Generated<Date>;
}
