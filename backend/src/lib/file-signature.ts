// backend/src/lib/file-signature.ts
// Identify an upload by its leading bytes ("magic numbers") instead of
// trusting the client-supplied Content-Type, so e.g. an HTML page sent as
// image/png is rejected.

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, start: number, end: number): string {
  return buf.length >= end ? buf.subarray(start, end).toString("latin1") : "";
}

/** The real MIME type of a buffer, for the formats DirectHire accepts; null if unrecognised. */
export function sniffMime(buf: Buffer): string | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "image/webp";
  if (ascii(buf, 0, 5) === "%PDF-") return "application/pdf";
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  // ISO base media (MP4 / QuickTime): box type at bytes 4..8.
  const box = ascii(buf, 4, 8);
  if (box === "ftyp") return ascii(buf, 8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  if (["moov", "mdat", "wide", "free", "skip"].includes(box)) return "video/quicktime";
  return null;
}

// MP4 and QuickTime share a container; browsers label either way.
const EQUIVALENT: Record<string, string[]> = {
  "video/mp4":       ["video/mp4", "video/quicktime"],
  "video/quicktime": ["video/quicktime", "video/mp4"],
};

/**
 * Checks the file's real content against the allowed types.
 * Returns the MIME type to store (the sniffed one), or null to reject.
 */
export function verifiedMime(buf: Buffer, claimed: string, allowed: string[]): string | null {
  const actual = sniffMime(buf);
  if (!actual || !allowed.includes(actual)) return null;
  const acceptable = EQUIVALENT[actual] ?? [actual];
  return acceptable.includes(claimed) ? actual : null;
}
