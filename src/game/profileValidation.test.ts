import { describe, expect, it } from "vitest";
import {
  PROFILE_IMAGE_MIME_TYPES,
  isAllowedProfileImageType,
  profileImageTypeMessage,
  safeAvatarUrl,
  safeHeaderUrl,
  validateProfileImagePick,
  validateProfileUpdate,
} from "./profileValidation";

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

  it("rejects GIF at the shared pick contract that creation and Profile both use", () => {
    expect(PROFILE_IMAGE_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(isAllowedProfileImageType("image/gif")).toBe(false);
    expect(isAllowedProfileImageType("image/png")).toBe(true);
    expect(isAllowedProfileImageType("image/jpeg")).toBe(true);
    expect(isAllowedProfileImageType("image/webp")).toBe(true);
    const gif = new File(["gif-bytes"], "anim.gif", { type: "image/gif" });
    expect(validateProfileImagePick(gif, "picture")).toBe("Only JPEG, PNG or WebP pictures are allowed.");
    expect(validateProfileImagePick(gif, "header")).toBe("Only JPEG, PNG or WebP headers are allowed.");
    expect(profileImageTypeMessage("picture")).toBe("Only JPEG, PNG or WebP pictures are allowed.");
    expect(profileImageTypeMessage("header")).toBe("Only JPEG, PNG or WebP headers are allowed.");
  });

  it("keeps the 2 MB picture and 4 MB header caps on the shared pick contract", () => {
    const okPicture = new File([new Uint8Array(2 * 1024 * 1024)], "face.png", { type: "image/png" });
    const bigPicture = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "face.png", { type: "image/png" });
    const okHeader = new File([new Uint8Array(4 * 1024 * 1024)], "wide.png", { type: "image/png" });
    const bigHeader = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "wide.png", { type: "image/png" });
    expect(validateProfileImagePick(okPicture, "picture")).toBeNull();
    expect(validateProfileImagePick(bigPicture, "picture")).toBe("Picture must be under 2 MB.");
    expect(validateProfileImagePick(okHeader, "header")).toBeNull();
    expect(validateProfileImagePick(bigHeader, "header")).toBe("Header must be under 4 MB.");
  });
});
