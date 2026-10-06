/**
 * C-01 build-level evidence (Architecture §6.1 stage 9).
 *
 * Run AFTER `npm run build`:
 *     node src/manifest/verify-dist-inline.mjs
 *
 * Proves the production artifact, not the source: dist/index.html carries exactly
 * one `<script type="application/json" id="cortwin-manifest">` data block whose
 * parsed content DEEP-EQUALS web/public/manifest.json, with the six required
 * artifact keys, a sha256 modelId, no raw `<` in the payload (no </script>
 * breakout), and the C-15 CSP meta byte-exact.
 *
 * Deliberately a .mjs script, not a vitest test: CI's vitest step runs before
 * the build step, so dist/ does not exist on a clean checkout, and encoding a
 * vite build inside the test suite would double the build cost on every run.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const WEB_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const distHtml = readFileSync(path.join(WEB_ROOT, "dist", "index.html"), "utf8");
const sourceHtml = readFileSync(path.join(WEB_ROOT, "index.html"), "utf8");
const publicManifest = JSON.parse(
  readFileSync(path.join(WEB_ROOT, "public", "manifest.json"), "utf8")
);

const failures = [];
const ok = (label) => console.log(`  PASS  ${label}`);
const fail = (label, detail) => {
  failures.push(label);
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
};

console.log(`dist/index.html sha256 ${createHash("sha256").update(distHtml).digest("hex")}`);
console.log(`dist/index.html bytes  ${Buffer.byteLength(distHtml)}`);

const matches = [
  ...distHtml.matchAll(/<script type="application\/json" id="([^"]*)">([\s\S]*?)<\/script>/g)
];

if (matches.length === 1) ok("exactly one application/json data block in dist/index.html");
else fail("exactly one data block", `found ${matches.length}`);

const [id, json] = matches.length === 1 ? [matches[0][1], matches[0][2]] : ["", ""];

if (id === "cortwin-manifest") ok('block id is exactly "cortwin-manifest"');
else fail("block id", `got "${id}"`);

let inline = null;
try {
  inline = JSON.parse(json);
  ok("inline block parses as valid JSON");
} catch (error) {
  fail("inline block parses as valid JSON", String(error));
}

if (inline !== null && isDeepStrictEqual(inline, publicManifest)) {
  ok("inline block DEEP-EQUALS web/public/manifest.json");
} else {
  fail("inline block deep-equals public/manifest.json");
}

if (json.includes("<")) fail("payload escaped", "raw '<' present in serialized payload");
else ok("payload has no raw '<' (no </script> breakout possible)");

const expectedKeys = ["cases", "fixtures", "model", "registry", "results", "structures"];
const gotKeys = inline && inline.artifacts ? Object.keys(inline.artifacts).sort() : [];
if (JSON.stringify(gotKeys) === JSON.stringify(expectedKeys)) {
  ok(`six artifact keys: ${gotKeys.join(", ")}`);
} else {
  fail("six artifact keys", JSON.stringify(gotKeys));
}

if (inline && typeof inline.modelId === "string" && /^sha256:[0-9a-f]{64}$/.test(inline.modelId)) {
  ok(`modelId ${inline.modelId}`);
} else {
  fail("modelId present as sha256 content hash", inline ? String(inline.modelId) : "no inline");
}

if (inline && inline.modelId === publicManifest.modelId) {
  ok("modelId matches public/manifest.json");
} else {
  fail("modelId matches public/manifest.json");
}

const csp = /<meta http-equiv="Content-Security-Policy" content="[^"]*" \/>/.exec(sourceHtml);
if (csp && distHtml.includes(csp[0])) ok("CSP meta present in dist byte-exact vs source index.html");
else fail("CSP meta byte-exact in dist");

if ((distHtml.match(/Content-Security-Policy/g) ?? []).length === 1) {
  ok("exactly one CSP meta in dist");
} else {
  fail("exactly one CSP meta in dist");
}

console.log(failures.length === 0 ? "\nRESULT: ALL CHECKS PASS" : `\nRESULT: ${failures.length} FAILURES`);
process.exit(failures.length === 0 ? 0 : 1);
