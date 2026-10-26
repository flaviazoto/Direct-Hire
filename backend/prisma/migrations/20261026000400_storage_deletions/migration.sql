-- CreateTable
CREATE TABLE "storage_deletions" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "storage_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_deletions_completed_at_idx" ON "storage_deletions"("completed_at");

