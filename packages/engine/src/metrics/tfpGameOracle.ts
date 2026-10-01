/**
 * Test-only Game pin executor. Loads AHDGame via `git show` at
 * 08820d108bf986d519aed28c2963690dd772c652 and evals the metric seed
 * modules with an optional Math.random stub. Production seeder does not
 * import this file.
 */
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
import type { TfpLeaves } from "./tfpAuthoredLeaves.js";

export const TFP_GAME_PIN = "08820d108bf986d519aed28c2963690dd772c652";

const TFP_PATHS: Record<keyof TfpLeaves, readonly [string, string]> = {
  rdIntensity: ["economic", "rdIntensity"],
  workforceSkill: ["education", "workforceSkill"],
  transportEfficiency: ["infrastructure", "transportEfficiency"],
  broadbandAccess: ["infrastructure", "broadbandAccess"],
  powerGridReliability: ["infrastructure", "powerGridReliability"],
  urbanizationRate: ["population", "urbanizationRate"],
};

export function gameRepo(): string | undefined {
  const repo = process.env.AHDGAME_REPO;
  return repo && repo.length > 0 ? repo : undefined;
}

function gitShow(repo: string, path: string): string {
  return execFileSync("git", ["-C", repo, "show", `${TFP_GAME_PIN}:${path}`], {
    encoding: "utf8",
    maxBuffer: 20_000_000,
  });
}

function transpile(source: string, fileName: string): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName,
  }).outputText;
}

function dirnameOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function resolveRelative(fromPath: string, spec: string): string {
  const dir = dirnameOf(fromPath).split("/");
  for (const part of spec.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") dir.pop();
    else dir.push(part);
  }
  let resolved = dir.join("/");
  if (!resolved.endsWith(".ts") && !resolved.endsWith(".js")) resolved += ".ts";
  return resolved;
}

export function leavesFromDoc(doc: Record<string, unknown> | undefined): TfpLeaves {
  const out = {} as TfpLeaves;
  for (const [field, [cat, id]] of Object.entries(TFP_PATHS) as Array<[keyof TfpLeaves, readonly [string, string]]>) {
    const category = doc?.[cat] as Record<string, { value?: number }> | undefined;
    const value = category?.[id]?.value;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Game doc missing ${cat}.${id}`);
    }
    out[field] = value;
  }
  return out;
}

export function applyPresetOverlay(
  leaves: TfpLeaves,
  overlay: Record<string, number> | undefined,
): TfpLeaves {
  if (!overlay) return { ...leaves };
  const next = { ...leaves };
  if (typeof overlay["economic.rdIntensity"] === "number") next.rdIntensity = overlay["economic.rdIntensity"];
  if (typeof overlay["education.workforceSkill"] === "number") next.workforceSkill = overlay["education.workforceSkill"];
  if (typeof overlay["infrastructure.transportEfficiency"] === "number") {
    next.transportEfficiency = overlay["infrastructure.transportEfficiency"];
  }
  if (typeof overlay["infrastructure.broadbandAccess"] === "number") next.broadbandAccess = overlay["infrastructure.broadbandAccess"];
  if (typeof overlay["infrastructure.powerGridReliability"] === "number") {
    next.powerGridReliability = overlay["infrastructure.powerGridReliability"];
  }
  if (typeof overlay["population.urbanizationRate"] === "number") next.urbanizationRate = overlay["population.urbanizationRate"];
  return next;
}

type GameModule = Record<string, unknown>;

export function loadGameTree(repo: string, random: () => number = Math.random): (path: string) => GameModule {
  const cache = new Map<string, GameModule>();
  const math = Object.assign(Object.create(Math) as Math, { random });
  const load = (path: string): GameModule => {
    const hit = cache.get(path);
    if (hit) return hit;
    cache.set(path, {});
    const code = transpile(gitShow(repo, path), path);
    const module = { exports: {} as GameModule };
    const customRequire = (spec: string) => {
      if (spec === "@/lib/db/types") return {};
      if (spec === "@/lib/db/types/statePolicy") return {};
      if (spec === "@/lib/seeds/ie/ieMetricPresets") return {};
      if (spec === "@/lib/utils/demographics") return { getStateLean: () => 0 };
      if (spec === "@/lib/seeds/populationAnchors") return { getRegionPopulationAnchor: () => null };
      if (spec === "@/lib/era/metricCatalog") return { getIncomeAnchor: () => 1 };
      if (spec === "@/lib/constants/countries") return {};
      if (spec.startsWith("@/")) {
        const mapped = `src/${spec.slice(2)}`;
        return load(mapped.endsWith(".ts") ? mapped : `${mapped}.ts`);
      }
      if (spec.startsWith(".")) return load(resolveRelative(path, spec));
      throw new Error(`unresolved import ${spec} from ${path}`);
    };
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      require: customRequire,
      console,
      Math: math,
      Date,
      structuredClone,
      Buffer,
    }, { filename: path });
    cache.set(path, module.exports);
    return module.exports;
  };
  return load;
}

function byId(docs: Array<Record<string, unknown>> | undefined): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const doc of docs ?? []) map[String(doc._id)] = doc;
  return map;
}

export function overlayedLeaves(
  docs: Array<Record<string, unknown>> | undefined,
  overlays: Record<string, Record<string, number>> | undefined,
  apply1991 = false,
): Record<string, TfpLeaves> {
  const map = byId(docs);
  const out: Record<string, TfpLeaves> = {};
  for (const id of Object.keys(map).sort()) {
    let leaves = leavesFromDoc(map[id]);
    if (apply1991) {
      leaves = {
        ...leaves,
        broadbandAccess: 0,
        urbanizationRate: Math.max(50, Math.min(100, leaves.urbanizationRate - 3)),
      };
    }
    out[id] = applyPresetOverlay(leaves, overlays?.[id]);
  }
  return out;
}
