import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { LandingScreen } from "./LandingScreen";

/* Issue #148 Linux-verifiable acceptance: canonical asset identity, offline
 * launcher integration, and platform icon declarations/dimensions.
 * Installed-package / physical-device confirmation stays open and is NOT
 * claimed here.
 */

const ROOT = resolve(__dirname, "../..");
const CANONICAL_SHA256 = "1a7fe54f33c781d6b7741277a20a9e800ca5525a0fbea790a7109c3e119f66a9";

function pngSize(path: string): { width: number; height: number; bitDepth: number; colorType: number } {
  const data = readFileSync(path);
  expect(data.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(data.readUInt32BE(12)).toBe(0x49484452); // IHDR
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24],
    colorType: data[25],
  };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("canonical AHD logo asset (#148)", () => {
  it("bundles the byte-identical 500x500 RGBA mark offline", () => {
    const path = join(ROOT, "public/ahd-logo.png");
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(CANONICAL_SHA256);
    const size = pngSize(path);
    expect(size).toEqual({ width: 500, height: 500, bitDepth: 8, colorType: 6 });
  });

  it("renders the mark decorative, square and offline on the launcher", () => {
    render(
      <LandingScreen
        eras={[]}
        saves={[]}
        worldActive={false}
        busy={false}
        buildLabel="Test build"
        reducedMotion="system"
        pendingDelete={null}
        onNew={() => {}}
        onHelp={() => {}}
        onSettings={() => {}}
        onReturn={() => {}}
        onReload={() => {}}
        onImport={() => {}}
        onLoad={() => {}}
        onRequestDelete={() => {}}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onlineBusy={false}
        onEnterMultiplayerNative={() => {}}
        onEnterMultiplayer={() => {}}
      />,
    );
    const logo = document.querySelector("img.ahd-landing-logo") as HTMLImageElement | null;
    expect(logo).not.toBeNull();
    // Offline bundle: relative self path, never a remote URL.
    expect(logo?.getAttribute("src")).toContain("ahd-logo.png");
    expect(logo?.getAttribute("src")).not.toMatch(/^https?:/);
    // Decorative: the h1 already names the game (reference parity).
    expect(logo?.alt).toBe("");
    // Square intrinsic placeholder before the PNG loads.
    expect(logo?.getAttribute("width")).toBe(logo?.getAttribute("height"));
    expect(Number(logo?.getAttribute("width"))).toBeGreaterThan(0);
  });

  it("keeps the launcher source free of remote image references", () => {
    const source = readFileSync(join(ROOT, "src/ui/LandingScreen.tsx"), "utf8");
    expect(source).not.toMatch(/https?:\/\/[^"']*\.(png|jpg|webp|svg)/);
  });
});

describe("platform icon declarations (#148)", () => {
  it("declares bundle icons that exist on disk", () => {
    const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
    expect(conf.bundle.icon.length).toBeGreaterThan(0);
    for (const entry of conf.bundle.icon as string[]) {
      expect(existsSync(join(ROOT, "src-tauri", entry))).toBe(true);
    }
  });

  it("ships correct desktop icon dimensions", () => {
    const icons = join(ROOT, "src-tauri/icons");
    expect(pngSize(join(icons, "32x32.png"))).toMatchObject({ width: 32, height: 32 });
    expect(pngSize(join(icons, "64x64.png"))).toMatchObject({ width: 64, height: 64 });
    expect(pngSize(join(icons, "128x128.png"))).toMatchObject({ width: 128, height: 128 });
    expect(pngSize(join(icons, "128x128@2x.png"))).toMatchObject({ width: 256, height: 256 });
    expect(pngSize(join(icons, "icon.png"))).toMatchObject({ width: 512, height: 512 });
  });

  it("ships iOS icons at filename-implied sizes with no stale duplicates", () => {
    const dir = join(ROOT, "src-tauri/icons/ios");
    const files = readdirSync(dir).filter(name => name.endsWith(".png"));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter(name => name.endsWith("-1.png"))).toEqual([]);
    for (const name of files) {
      const match = name.match(/^AppIcon-(?:([\d.]+)x([\d.]+)|(\d+))@(\d+)x\.png$/);
      expect(match).not.toBeNull();
      const expected = match?.[3]
        ? Number(match[3]) * Number(match[4])
        : Math.round(Number(match?.[1]) * Number(match?.[4]));
      const size = pngSize(join(dir, name));
      expect(`${name}: ${size.width}x${size.height}`).toBe(`${name}: ${expected}x${expected}`);
    }
  });

  it("ships Android buckets at density sizes on the white launcher background", () => {
    const base = join(ROOT, "src-tauri/icons/android");
    const legacy: Record<string, number> = {
      mdpi: 48,
      hdpi: 72,
      xhdpi: 96,
      xxhdpi: 144,
      xxxhdpi: 192,
    };
    const foreground: Record<string, number> = {
      mdpi: 108,
      hdpi: 162,
      xhdpi: 216,
      xxhdpi: 324,
      xxxhdpi: 432,
    };
    for (const [density, px] of Object.entries(legacy)) {
      for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
        const size = pngSize(join(base, `mipmap-${density}`, name));
        expect(`${density}/${name}`).toBe(`${density}/${name}`);
        expect(size.width).toBe(px);
        expect(size.height).toBe(px);
      }
    }
    for (const [density, px] of Object.entries(foreground)) {
      const size = pngSize(join(base, `mipmap-${density}`, "ic_launcher_foreground.png"));
      expect(size.width).toBe(px);
      expect(size.height).toBe(px);
    }
    const background = readFileSync(join(base, "values/ic_launcher_background.xml"), "utf8");
    expect(background).toContain("#fff");
    const adaptive = readFileSync(join(base, "mipmap-anydpi-v26/ic_launcher.xml"), "utf8");
    expect(adaptive).toContain("ic_launcher_foreground");
    expect(adaptive).toContain("ic_launcher_background");
  });

  it("ships a six-size Windows icon and leaves no stray icon copies", () => {
    const data = readFileSync(join(ROOT, "src-tauri/icons/icon.ico"));
    expect(data.readUInt16LE(2)).toBe(1);
    expect(data.readUInt16LE(4)).toBe(6);
    const strays = walk(join(ROOT, "src-tauri/icons")).filter(path =>
      /(^|[\\/])[^\\/]*-1\.png$/.test(path),
    );
    expect(strays).toEqual([]);
  });
});
