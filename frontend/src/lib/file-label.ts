// frontend/src/lib/file-label.ts
// Uploads now keep the user's original file name (cleaned by the API). Files
// uploaded before that change were stored as "<userId>-<timestamp>.<ext>";
// show those as a readable type label instead of the internal code.

const TYPE_LABEL: Record<string, string> = {
  PROFILE_PHOTO:       "Profile photo",
  WORK_VIDEO:          "Work video",
  INTRO_VIDEO:         "Introduction video",
  MEDICAL_CERTIFICATE: "Medical certificate",
  BUSINESS_DOCUMENT:   "Business document",
  COMPANY_LOGO:        "Company logo",
};

const GENERATED_NAME = /^[a-z0-9]{20,}-\d{10,}\.([a-z0-9]+)$/i;

export function fileLabel(fileName: string | null | undefined, fileType?: string | null): string {
  const name = fileName ?? "";
  const m = GENERATED_NAME.exec(name);
  if (!m) return name || TYPE_LABEL[fileType ?? ""] || "Document";
  return `${TYPE_LABEL[fileType ?? ""] ?? "Document"}.${m[1].toLowerCase()}`;
}
