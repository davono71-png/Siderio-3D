import { describe, expect, it } from "vitest";
import { formatRevision, jobToSlug, paperRevisionWarning, parseRevisionLabel } from "./slug";

describe("jobToSlug", () => {
  it("converte la commessa nel path del QR", () => {
    expect(jobToSlug("26/0147")).toBe("26-0147");
    expect(jobToSlug(" 26 / 0147 ")).toBe("26-0147");
  });
});

describe("paperRevisionWarning", () => {
  it("avvisa se il cartaceo è superato", () => {
    expect(paperRevisionWarning(3, 4)).toEqual({ paper: 3, current: 4 });
    expect(paperRevisionWarning(4, 4)).toBeNull();
    expect(paperRevisionWarning(null, 4)).toBeNull();
  });
});

describe("revision helpers", () => {
  it("legge REV.03 e formatta 04", () => {
    expect(parseRevisionLabel("REV.03")).toBe(3);
    expect(parseRevisionLabel("3")).toBe(3);
    expect(formatRevision(4)).toBe("04");
  });
});
