/**
 * Selection accent — the stage outline's colour, parsed from THE token sheet
 * (`design/tokens.css`, `--ct-color-accent`). Architecture §9.8: tokens are
 * defined once and consumed by CSS *and by the scene*; this module is the
 * scene-side consumer for the selection/interaction accent.
 *
 * Reading the stylesheet instead of duplicating the literal keeps one source of
 * truth: the WebGL hull can never drift from the CSS selection affordance, and
 * no colour literal exists in any `stage/` module (the stage imports this
 * constant instead). The accent is interaction-only — never a probability
 * (tokens.css header; the ramp owns every data colour).
 *
 * HOW THE TEXT IS READ — and one known environment limitation:
 *   - `vite build` / `vite dev`: `import … from "./tokens.css?raw"` is the
 *     documented Vite idiom and yields the literal stylesheet text. The built
 *     chunk carries the resolved string with no runtime dependency.
 *   - `vitest` (Node): Vite's CSS pipeline intercepts the `.css` query and the
 *     import resolves to an EMPTY string, so the init-time parse below would
 *     throw. This is a vitest-only limitation, not a defect in the source.
 *
 * WHY THE PARSE IS LAZY (called on first use, cached):
 *   `import … from "./tokens.css?raw"` is the documented Vite idiom and
 *   resolves to the literal stylesheet text under `vite build` / `vite dev`.
 *   Under `vitest` (Node) Vite's CSS pipeline intercepts the `.css` query and
 *   the import resolves to an EMPTY string. An init-time throw would make the
 *   module un-importable in Node — and `Stage3D.tsx` imports it (via the
 *   selection-outline material), while several vitest suites import `Stage3D`
 *   for SSR render checks that never execute WebGL. Deferring the parse to the
 *   first *call* keeps the import side-effect-free and testable, while the
 *   browser (where `?raw` works) still fails loudly the moment the outline
 *   colour is actually requested. The pure parser is exported so its behaviour
 *   can be unit-tested without the environment quirk.
 */
import tokensCss from "./tokens.css?raw";

const ACCENT_PATTERN = /--ct-color-accent:\s*(#[0-9a-fA-F]{3,8})\s*[;}&]/;

/**
 * Pure parser: extract the accent hex from stylesheet text, or throw a loud
 * diagnostic. Exported for unit tests (vitest can pass synthetic CSS and real
 * token-sheet text read via `node:fs`, sidestepping the `?raw` empty-string
 * limitation).
 */
export function parseAccent(raw: string): string {
  const match = ACCENT_PATTERN.exec(raw);
  if (match === null || match[1] === undefined) {
    throw new Error(
      "design/tokens.css: --ct-color-accent not found — the selection outline has no sanctioned colour"
    );
  }
  return match[1];
}

let cached: string | null = null;

/**
 * The `--ct-color-accent` value, exactly as the token sheet defines it.
 * Throws on first use if the token is absent from the loaded stylesheet.
 */
export function selectionAccentColour(): string {
  if (cached === null) {
    cached = parseAccent(tokensCss);
  }
  return cached;
}
