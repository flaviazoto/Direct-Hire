-- Migration: add_job_run_logs

CREATE TABLE "job_run_logs" (
    "id"                TEXT         NOT NULL,
    "job_name"          TEXT         NOT NULL,
    "status"            TEXT         NOT NULL,
    "records_processed" INTEGER      NOT NULL DEFAULT 0,
    "records_failed"    INTEGER      NOT NULL DEFAULT 0,
    "error_message"     TEXT,
    "started_at"        TIMESTAMP(3) NOT NULL,
    "completed_at"      TIMESTAMP(3) NOT NULL,
    "duration_ms"       INTEGER      NOT NULL,

    CONSTRAINT "job_run_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_run_logs_job_name_idx" ON "job_run_logs"("job_name");
CREATE INDEX "job_run_logs_started_at_idx" ON "job_run_logs"("started_at");
