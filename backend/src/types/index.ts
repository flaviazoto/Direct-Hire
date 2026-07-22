// backend/src/types/index.ts
export type Role       = "WORKER" | "EMPLOYER" | "ADMIN";
export type FileType   = "PROFILE_PHOTO"|"WORK_VIDEO"|"INTRO_VIDEO"|"MEDICAL_CERTIFICATE"|"BUSINESS_DOCUMENT"|"COMPANY_LOGO"|"OTHER";
export type EmailType  = "WELCOME"|"EMAIL_VERIFICATION"|"PASSWORD_RESET"|"ONBOARDING_REMINDER"|"ONBOARDING_SUBMITTED"|"ACCOUNT_APPROVED"|"ACCOUNT_REJECTED"|"ACCOUNT_NEEDS_CHANGES"|"SUBSCRIPTION_CONFIRMED"|"ADMIN_NEW_SUBMISSION"|"APPLICATION_RECEIVED"|"APPLICATION_SHORTLISTED"|"APPLICATION_INTERVIEW_REQUESTED"|"APPLICATION_ACCEPTED"|"APPLICATION_REJECTED"|"JOB_MATCH"|"INVOICE_RECEIPT"|"SYSTEM_HEALTH_ALERT"|"GENERAL";

export interface UploadResult {
  id:        string;
  fileUrl:   string;
  filePath:  string;
  fileType:  FileType;
  fileName:  string;
  sizeBytes: number;
}

export interface UploadParams {
  userId:     string;
  fileType:   FileType;
  fileName:   string;
  mimeType:   string;
  buffer:     Buffer;
  isPrivate?: boolean;
}
