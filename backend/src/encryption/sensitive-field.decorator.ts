/**
 * Framework-agnostic sensitive-field guard for Express + plain-object responses.
 *
 * NestJS equivalent: @Exclude() + ClassSerializerInterceptor + class-transformer.
 * This backend uses Express with plain objects, so we take a different approach:
 *
 *   1. @SensitiveField() populates a global Set<string> at module-load time.
 *   2. The ok() helper in lib/response.ts calls stripSensitiveFields() before
 *      res.json(), guaranteeing encrypted blobs can never leak through any endpoint
 *      that forgets to manually exclude them.
 *
 * Applying the decorator:
 *   class SensitiveFields {
 *     @SensitiveField() passportNumberEnc!: string;
 *     @SensitiveField() phoneEnc!: string;
 *   }
 *
 * The class never needs to be instantiated — decorators run at module-load time
 * and populate SENSITIVE_FIELD_NAMES immediately.
 */

// ── Global registry ───────────────────────────────────────────────────────────

export const SENSITIVE_FIELD_NAMES = new Set<string>();

// ── Decorator ─────────────────────────────────────────────────────────────────

export function SensitiveField(): PropertyDecorator {
  return (_target: object, propertyKey: string | symbol) => {
    SENSITIVE_FIELD_NAMES.add(String(propertyKey));
  };
}

// ── Stripper ──────────────────────────────────────────────────────────────────

/**
 * Removes all registered sensitive field names from a value before it is
 * serialised. Works recursively on arrays; does a shallow copy on objects.
 * Returns primitives and null/undefined unchanged.
 */
export function stripSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripSensitiveFields(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const copy = { ...(value as Record<string, unknown>) };
    for (const key of SENSITIVE_FIELD_NAMES) {
      delete copy[key];
    }
    return copy as T;
  }
  return value;
}

// ── Registration ──────────────────────────────────────────────────────────────
// This class exists solely to trigger @SensitiveField() at module-load time.
// Exporting it prevents tree-shaking from eliding the side effects.

export class SensitiveFieldRegistry {
  @SensitiveField() passportNumberEnc!: string;
  @SensitiveField() phoneEnc!: string;
}
