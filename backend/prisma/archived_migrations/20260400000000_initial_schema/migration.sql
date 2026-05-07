-- CreateEnum
CREATE TYPE "Role" AS ENUM ('WORKER', 'EMPLOYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PROFILE_PHOTO', 'WORK_VIDEO', 'INTRO_VIDEO', 'MEDICAL_CERTIFICATE', 'BUSINESS_DOCUMENT', 'COMPANY_LOGO', 'OTHER');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('WELCOME', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ONBOARDING_REMINDER', 'ONBOARDING_SUBMITTED', 'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED', 'ACCOUNT_NEEDS_CHANGES', 'SUBSCRIPTION_CONFIRMED', 'ADMIN_NEW_SUBMISSION', 'APPLICATION_RECEIVED', 'APPLICATION_SHORTLISTED', 'APPLICATION_INTERVIEW_REQUESTED', 'APPLICATION_ACCEPTED', 'APPLICATION_REJECTED', 'GENERAL');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MESSAGE_RECEIVED', 'APPLICATION_SUBMITTED', 'APPLICATION_UPDATE', 'PROFILE_APPROVED', 'PROFILE_REJECTED', 'JOB_MATCH', 'WORKER_LOCKED', 'WORKER_LOCK_EXTENDED', 'WORKER_LOCK_RELEASED', 'LOCK_EXPIRY_WARNING', 'LOCK_EXPIRED', 'GENERAL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'VIEWED', 'SHORTLISTED', 'INTERVIEWED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LockStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'RELEASED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'CHARGED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_EMAIL_VERIFICATION', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationCodeType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_APPROVED', 'USER_REJECTED', 'USER_SUSPENDED', 'USER_REINSTATED', 'JOB_APPROVED', 'JOB_REJECTED', 'JOB_SUBMITTED', 'JOB_CHANGES_REQUESTED', 'JOB_ARCHIVED', 'JOB_RESUBMITTED', 'EMPLOYER_POSTING_RIGHTS_REVOKED', 'EMPLOYER_POSTING_RIGHTS_RESTORED', 'LOCK_OVERRIDDEN', 'AI_DECISION_OVERRIDDEN', 'APPLICATION_SUBMITTED', 'APPLICATION_STATUS_CHANGED', 'CONTACT_DETAILS_ACCESSED', 'WORKER_LOCKED', 'WORKER_LOCK_EXTENDED', 'WORKER_LOCK_RELEASED', 'WORKER_LOCK_EXPIRED', 'WORKER_LOCK_OVERRIDDEN', 'DOCUMENT_BATCH_REVIEWED');

-- CreateEnum
CREATE TYPE "JobPostStatus" AS ENUM ('DRAFT', 'PENDING_MODERATION', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'FREELANCE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "phone" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "account_status" "AccountStatus" NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
    "email_verification_code_hash" TEXT,
    "email_verification_expires_at" TIMESTAMP(3),
    "email_verification_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_verification_sent_at" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "verification_submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "suspended_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "posting_rights_revoked" BOOLEAN NOT NULL DEFAULT false,
    "posting_rights_revoked_at" TIMESTAMP(3),
    "posting_rights_revoked_by" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_by_employer_id" TEXT,
    "locked_until" TIMESTAMP(3),
    "lock_count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleId" TEXT,
    "linkedinId" TEXT,
    "avatarUrl" TEXT,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "countryOfResidence" TEXT,
    "city" TEXT,
    "address" TEXT,
    "passportNumber" TEXT,
    "maritalStatus" TEXT,
    "fatherName" TEXT,
    "motherName" TEXT,
    "hasSpouse" BOOLEAN NOT NULL DEFAULT false,
    "spouseName" TEXT,
    "numberOfChildren" INTEGER NOT NULL DEFAULT 0,
    "profession" TEXT,
    "yearsExperience" TEXT,
    "expectedSalary" TEXT,
    "availabilityDate" TIMESTAMP(3),
    "additionalNotes" TEXT,
    "profileScore" INTEGER,
    "trustScore" INTEGER,
    "riskScore" INTEGER,
    "isSearchable" BOOLEAN NOT NULL DEFAULT false,
    "passportStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "documentsVerified" BOOLEAN NOT NULL DEFAULT false,
    "documentsReviewedAt" TIMESTAMP(3),
    "documentsReviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerSkill" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,

    CONSTRAINT "WorkerSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerLanguage" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "proficiencyLevel" TEXT NOT NULL,

    CONSTRAINT "WorkerLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerTargetCountry" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "visaTypePreference" TEXT,

    CONSTRAINT "WorkerTargetCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "contactPersonName" TEXT,
    "nipt" TEXT,
    "qkr" TEXT,
    "administratorId" TEXT,
    "industry" TEXT,
    "companySize" TEXT,
    "website" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "businessDescription" TEXT,
    "subscriptionPlan" TEXT,
    "subscriptionStatus" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
    "logoUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerHiringCountry" (
    "id" TEXT NOT NULL,
    "employerProfileId" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "EmployerHiringCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerRequiredSkill" (
    "id" TEXT NOT NULL,
    "employerProfileId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,

    CONSTRAINT "EmployerRequiredSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "draftData" JSONB NOT NULL DEFAULT '{}',
    "isSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "totalSteps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "fileType" "FileType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "rejectionReason" TEXT,
    "changesRequested" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_posts" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "benefits" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "remote_allowed" BOOLEAN NOT NULL DEFAULT false,
    "salary_min" DECIMAL(10,2) NOT NULL,
    "salary_max" DECIMAL(10,2) NOT NULL,
    "salary_currency" TEXT NOT NULL DEFAULT 'USD',
    "contract_type" "ContractType" NOT NULL,
    "experience_required" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "required_skills" TEXT[],
    "languages_required" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visa_support" BOOLEAN NOT NULL DEFAULT false,
    "accommodation" BOOLEAN NOT NULL DEFAULT false,
    "application_deadline" TIMESTAMP(3),
    "positions_available" INTEGER NOT NULL DEFAULT 1,
    "status" "JobPostStatus" NOT NULL DEFAULT 'DRAFT',
    "moderation_notes" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "changes_requested_at" TIMESTAMP(3),
    "changes_requested_by" TEXT,
    "resubmitted_at" TIMESTAMP(3),
    "moderation_history" JSONB,
    "employer_posting_rights" BOOLEAN NOT NULL DEFAULT true,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "application_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "cover_letter" TEXT,
    "worker_note" TEXT,
    "interview_contact_unlocked" BOOLEAN NOT NULL DEFAULT false,
    "company_contact_visible_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "shortlisted_at" TIMESTAMP(3),
    "interviewed_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "interview_instructions" TEXT,
    "match_score" DECIMAL(5,2),
    "offered_salary" DECIMAL(10,2),
    "offered_currency" TEXT,
    "start_date" TIMESTAMP(3),
    "contract_type" TEXT,
    "hire_confirmed_at" TIMESTAMP(3),
    "application_fee_cents" INTEGER,
    "application_fee_paid" BOOLEAN NOT NULL DEFAULT false,
    "stripe_payment_intent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "workerProfileId" TEXT NOT NULL,
    "jobPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_locks" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "lock_status" "LockStatus" NOT NULL DEFAULT 'ACTIVE',
    "daily_fee" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lock_start_date" TIMESTAMP(3) NOT NULL,
    "lock_expiry_date" TIMESTAMP(3) NOT NULL,
    "lock_days" INTEGER NOT NULL,
    "total_billed" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_days_billed" INTEGER NOT NULL DEFAULT 0,
    "release_reason" TEXT,
    "admin_override_by" TEXT,
    "admin_override_at" TIMESTAMP(3),
    "admin_override_note" TEXT,
    "expiry_warning_sent" BOOLEAN NOT NULL DEFAULT false,
    "stripe_payment_intent_id" TEXT,
    "stripe_refund_id" TEXT,
    "total_refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lock_billing_charges" (
    "id" TEXT NOT NULL,
    "lock_id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "charge_date" TIMESTAMP(3) NOT NULL,
    "charge_status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_charge_id" TEXT,
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "grace_period_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lock_billing_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "emailType" "EmailType" NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMsgId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationCodeType" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDecisionLog" (
    "id" TEXT NOT NULL,
    "moduleType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "inputData" JSONB NOT NULL,
    "outputData" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "processingMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_run_logs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "job_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "stripeInvoiceId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_linkedinId_key" ON "User"("linkedinId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_refreshToken_idx" ON "Session"("refreshToken");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerProfile_userId_key" ON "WorkerProfile"("userId");

-- CreateIndex
CREATE INDEX "WorkerProfile_userId_idx" ON "WorkerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerSkill_workerProfileId_skill_key" ON "WorkerSkill"("workerProfileId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerLanguage_workerProfileId_language_key" ON "WorkerLanguage"("workerProfileId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerTargetCountry_workerProfileId_country_key" ON "WorkerTargetCountry"("workerProfileId", "country");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerProfile_userId_key" ON "EmployerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerProfile_stripeCustomerId_key" ON "EmployerProfile"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "EmployerProfile_userId_idx" ON "EmployerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerHiringCountry_employerProfileId_country_key" ON "EmployerHiringCountry"("employerProfileId", "country");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerRequiredSkill_employerProfileId_skill_key" ON "EmployerRequiredSkill"("employerProfileId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_userId_idx" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_onboardingStatus_idx" ON "OnboardingProgress"("onboardingStatus");

-- CreateIndex
CREATE INDEX "Upload_userId_idx" ON "Upload"("userId");

-- CreateIndex
CREATE INDEX "Upload_fileType_idx" ON "Upload"("fileType");

-- CreateIndex
CREATE INDEX "Upload_reviewStatus_idx" ON "Upload"("reviewStatus");

-- CreateIndex
CREATE INDEX "Upload_reviewedById_idx" ON "Upload"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationRecord_userId_key" ON "VerificationRecord"("userId");

-- CreateIndex
CREATE INDEX "VerificationRecord_reviewStatus_idx" ON "VerificationRecord"("reviewStatus");

-- CreateIndex
CREATE INDEX "job_posts_employer_id_idx" ON "job_posts"("employer_id");

-- CreateIndex
CREATE INDEX "job_posts_status_idx" ON "job_posts"("status");

-- CreateIndex
CREATE INDEX "job_posts_country_idx" ON "job_posts"("country");

-- CreateIndex
CREATE INDEX "job_posts_category_idx" ON "job_posts"("category");

-- CreateIndex
CREATE INDEX "job_posts_created_at_idx" ON "job_posts"("created_at");

-- CreateIndex
CREATE INDEX "job_posts_status_country_category_idx" ON "job_posts"("status", "country", "category");

-- CreateIndex
CREATE INDEX "applications_worker_id_idx" ON "applications"("worker_id");

-- CreateIndex
CREATE INDEX "applications_job_id_idx" ON "applications"("job_id");

-- CreateIndex
CREATE INDEX "applications_employer_id_idx" ON "applications"("employer_id");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_created_at_idx" ON "applications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "applications_worker_id_job_id_key" ON "applications"("worker_id", "job_id");

-- CreateIndex
CREATE INDEX "SavedJob_workerProfileId_idx" ON "SavedJob"("workerProfileId");

-- CreateIndex
CREATE INDEX "SavedJob_jobPostId_idx" ON "SavedJob"("jobPostId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_workerProfileId_jobPostId_key" ON "SavedJob"("workerProfileId", "jobPostId");

-- CreateIndex
CREATE INDEX "worker_locks_worker_id_lock_status_idx" ON "worker_locks"("worker_id", "lock_status");

-- CreateIndex
CREATE INDEX "worker_locks_employer_id_idx" ON "worker_locks"("employer_id");

-- CreateIndex
CREATE INDEX "worker_locks_lock_expiry_date_idx" ON "worker_locks"("lock_expiry_date");

-- CreateIndex
CREATE INDEX "lock_billing_charges_lock_id_idx" ON "lock_billing_charges"("lock_id");

-- CreateIndex
CREATE INDEX "lock_billing_charges_employer_id_idx" ON "lock_billing_charges"("employer_id");

-- CreateIndex
CREATE INDEX "EmailLog_userId_idx" ON "EmailLog"("userId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_emailType_idx" ON "EmailLog"("emailType");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Message_recipientId_idx" ON "Message"("recipientId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "verification_codes_userId_type_idx" ON "verification_codes"("userId", "type");

-- CreateIndex
CREATE INDEX "audit_log_target_user_id_idx" ON "audit_log"("target_user_id");

-- CreateIndex
CREATE INDEX "audit_log_admin_id_idx" ON "audit_log"("admin_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "AiDecisionLog_moduleType_idx" ON "AiDecisionLog"("moduleType");

-- CreateIndex
CREATE INDEX "AiDecisionLog_entityId_idx" ON "AiDecisionLog"("entityId");

-- CreateIndex
CREATE INDEX "job_run_logs_job_name_idx" ON "job_run_logs"("job_name");

-- CreateIndex
CREATE INDEX "job_run_logs_started_at_idx" ON "job_run_logs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_stripeInvoiceId_idx" ON "Payment"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_config_key_key" ON "platform_config"("key");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSkill" ADD CONSTRAINT "WorkerSkill_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerLanguage" ADD CONSTRAINT "WorkerLanguage_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTargetCountry" ADD CONSTRAINT "WorkerTargetCountry_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerProfile" ADD CONSTRAINT "EmployerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerHiringCountry" ADD CONSTRAINT "EmployerHiringCountry_employerProfileId_fkey" FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerRequiredSkill" ADD CONSTRAINT "EmployerRequiredSkill_employerProfileId_fkey" FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_locks" ADD CONSTRAINT "worker_locks_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_locks" ADD CONSTRAINT "worker_locks_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lock_billing_charges" ADD CONSTRAINT "lock_billing_charges_lock_id_fkey" FOREIGN KEY ("lock_id") REFERENCES "worker_locks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


