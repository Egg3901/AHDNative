import { describe, expect, it } from "vitest";
import { safeAvatarUrl, safeHeaderUrl, validateProfileUpdate } from "./profileValidation";

/** A syntactically valid PNG data URL of the given decoded byte length. */
function pngBytes(bytes: number): string {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const body = new Uint8Array(Math.max(0, bytes - header.length));
  const all = Uint8Array.from([...header, ...body]);
  let binary = "";
  for (const b of all) binary += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(binary)}`;
}

describe("profile image guards (#242)", () => {
  it("accepts a profile header up to 4 MB but rejects one over it", () => {
    expect(safeHeaderUrl(pngBytes(3 * 1024 * 1024))).not.toBeNull();
    expect(safeHeaderUrl(pngBytes(4 * 1024 * 1024 + 1))).toBeNull();
  });

  it("accepts a 2 to 4 MB header as a header but not as an avatar", () => {
    const wide = pngBytes(3 * 1024 * 1024);
    expect(safeHeaderUrl(wide)).toBe(wide);
    expect(safeAvatarUrl(wide)).toBeNull();
  });

  it("validates profileHeaderUrl with the header cap in a profile update", () => {
    const wide = pngBytes(3 * 1024 * 1024);
    const valid = validateProfileUpdate({ profileHeaderUrl: wide });
    expect(valid.profileHeaderUrl).toBe(wide);
    expect(() => validateProfileUpdate({ avatarUrl: wide })).toThrow(/2 MB/);
  });

  it("rejects non-raster envelopes", () => {
    expect(safeHeaderUrl("https://example.com/header.png")).toBeNull();
    expect(safeHeaderUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
  });
});
