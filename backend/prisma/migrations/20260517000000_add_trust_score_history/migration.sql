-- CreateTable
CREATE TABLE "trust_score_history" (
    "id"         TEXT NOT NULL,
    "worker_id"  TEXT NOT NULL,
    "score"      INTEGER NOT NULL,
    "reason"     TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trust_score_history_worker_id_idx" ON "trust_score_history"("worker_id");

-- CreateIndex
CREATE INDEX "trust_score_history_created_at_idx" ON "trust_score_history"("created_at");

-- AddForeignKey
ALTER TABLE "trust_score_history"
    ADD CONSTRAINT "trust_score_history_worker_id_fkey"
    FOREIGN KEY ("worker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
