import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "./skill-vector.service";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors (→ score 100)", () => {
    const a = [1, 0, 1, 0, 1];
    const b = [1, 0, 1, 0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it("returns 0 for vectors with no overlap (→ score 0)", () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns a value strictly between 0 and 1 for partial overlap", () => {
    // worker has skills 0,1 — job requires skills 0,2 — one in common out of three
    const a = [1, 1, 0, 0];
    const b = [1, 0, 1, 0];
    const score = cosineSimilarity(a, b);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 when vector a is all zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 1])).toBe(0);
  });

  it("returns 0 when vector b is all zeros", () => {
    expect(cosineSimilarity([1, 0, 1], [0, 0, 0])).toBe(0);
  });

  it("returns 0 when both vectors are all zeros", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("works with single-element vectors", () => {
    expect(cosineSimilarity([1], [1])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1], [0])).toBe(0);
  });

  it("is symmetric — cosineSimilarity(a,b) === cosineSimilarity(b,a)", () => {
    const a = [1, 0, 1, 1, 0];
    const b = [0, 1, 1, 0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});
