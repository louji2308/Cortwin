/**
 * Numeric primitives shared by evaluation, attribution and validation.
 *
 * Semantics mirror the Python reference (`pipeline/calibration.py`,
 * `pipeline/encode.py`) exactly, because every value here is held to the C-06
 * tolerances (1e-5 / 1e-5 / 1e-5 / 1e-6) by the golden fixtures.
 */

/** Numerically stable logistic function (scipy `expit` semantics). */
export function sigmoid(value: number): number {
  if (value >= 0) {
    return 1 / (1 + Math.exp(-value));
  }
  const expValue = Math.exp(value);
  return expValue / (1 + expValue);
}

const PROBABILITY_FLOOR = 1e-12;

/** Inverse sigmoid with the guarded interior used by the pipeline. */
export function logit(probability: number): number {
  const p = Math.min(Math.max(probability, PROBABILITY_FLOOR), 1 - PROBABILITY_FLOOR);
  return Math.log(p / (1 - p));
}

/** Raw ensemble margin of a threshold probability through the Platt pair (C-03). */
export function rawMarginFromProbability(
  probability: number,
  platt: { slope: number; intercept: number },
): number {
  if (!(platt.slope > 0)) {
    throw new RangeError("platt slope must be strictly positive");
  }
  return (logit(probability) - platt.intercept) / platt.slope;
}

export type Direction = "positive" | "negative" | "neutral";

export function directionOf(contribution: number): Direction {
  if (contribution > 0) return "positive";
  if (contribution < 0) return "negative";
  return "neutral";
}

/** Python `float(...)` over a string literal; `null` = not parseable. */
function pythonFloatFromString(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const plain = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
  if (plain) return Number(text);
  const named = /^[+-]?(?:nan|inf|infinity)$/i.test(text);
  if (named) {
    const lower = text.toLowerCase();
    if (lower.includes("nan")) return Number.NaN;
    return text.startsWith("-") ? -Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
  }
  return null;
}

export type ParsedNumber =
  | { kind: "value"; value: number }
  | { kind: "missing" }
  | { kind: "non-numeric" }
  | { kind: "non-finite" };

/**
 * `_as_finite_float` (`pipeline/encode.py`): None -> missing, bool -> 1/0,
 * number/string -> parsed, anything else -> non-numeric; NaN/Infinity are
 * rejected only after parsing so the two failure reasons stay distinguishable.
 */
export function parseFiniteNumber(raw: unknown): ParsedNumber {
  if (raw === null || raw === undefined) return { kind: "missing" };
  if (typeof raw === "boolean") return { kind: "value", value: raw ? 1 : 0 };
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { kind: "value", value: raw } : { kind: "non-finite" };
  }
  if (typeof raw === "string") {
    const parsed = pythonFloatFromString(raw);
    if (parsed === null) return { kind: "non-numeric" };
    return Number.isFinite(parsed) ? { kind: "value", value: parsed } : { kind: "non-finite" };
  }
  return { kind: "non-numeric" };
}

/** Python `==` for one source value against a registry level. */
export function levelEquals(raw: unknown, level: unknown): boolean {
  if (typeof raw === "boolean" || typeof level === "boolean") {
    const left = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
    const right = typeof level === "boolean" ? (level ? 1 : 0) : level;
    if (typeof left === "number" && typeof right === "number") return left === right;
    return false;
  }
  if (typeof raw === "number" && typeof level === "number") return raw === level;
  if (typeof raw === "string" && typeof level === "string") return raw === level;
  return false;
}
