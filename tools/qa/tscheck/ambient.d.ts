/**
 * Minimal ambient declarations so `tools/qa/tscheck` can strict-typecheck
 * web/playwright.config.ts without installing @types/node (installing
 * dependencies is outside this unit's authority — Tech_Stack §27 is a lock).
 * Runtime resolution is real Node ESM; this file only satisfies the checker.
 */
declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
