import { SystemPaneShell } from "./SystemPaneShell";
import type { ArtifactIntegrity, ArtifactIntegrityRow, ParityReport } from "./types";

export type IntegrityPaneProps = {
  /**
   * Result of a parity run, or `null` when no run happened this session.
   * `null` is a designed not-run state — the pane never substitutes a
   * precomputed verdict (Contracts §9, L429).
   */
  report?: ParityReport | null;
  /** Designed loading state while a run is in progress. */
  loading?: boolean;
  /**
   * Boot hash chain (declared manifest values vs. observed digests), or
   * `null` when the boot exposed no artifact record for this session.
   */
  artifacts?: ArtifactIntegrity | null;
  /** Designed failure text when the in-browser run could not execute. */
  error?: string | null;
};

/** Non-finite values never render as numbers — they read "not available". */
function formatValue(value: number): string {
  return Number.isFinite(value) ? String(value) : "not available";
}

/** Status words are derived from the reported boolean only — never typed as data. */
function statusText(passed: boolean): string {
  return passed ? "within tolerance" : "outside tolerance";
}

/** Row emphasis: a mismatch is marked, an absence stays neutral (never a verdict). */
function rowClass(row: ArtifactIntegrityRow): string {
  if (row.verified) return "ct-sys-row";
  return row.observedSha256 === null
    ? "ct-sys-row"
    : "ct-sys-row ct-sys-row--fail";
}

/** Row result: glyph plus words, so the state never depends on colour alone. */
function rowStatus(row: ArtifactIntegrityRow): { text: string; failed: boolean } {
  if (row.verified) return { text: "✓ verified", failed: false };
  if (row.observedSha256 === null) return { text: "— not observed", failed: false };
  return { text: "✗ mismatch", failed: true };
}

/**
 * Boot hash chain (C-01 §5.1): one row per manifest artifact with the digest
 * this browser computed over the bytes it fetched at boot, next to the value
 * the inlined manifest declares. Nothing here is typed, cached or rounded.
 */
function ArtifactHashChain({ artifacts }: { artifacts: ArtifactIntegrity }) {
  const total = artifacts.rows.length;
  const observed = artifacts.rows.filter((row) => row.observedSha256 !== null);
  const missing = total - observed.length;
  const mismatched = observed.filter((row) => !row.verified).length;
  const problems: string[] = [];
  if (missing > 0) {
    problems.push(`${missing} of ${total} artifacts were not observed while booting`);
  }
  if (mismatched > 0) {
    problems.push(`${mismatched} of ${total} artifacts did not match the manifest digest`);
  }
  if (artifacts.engineModelMatches === false) {
    problems.push("the loaded engine reports a different model id than the manifest");
  }
  const healthy = problems.length === 0;

  return (
    <>
      <h3>Boot hash chain</h3>
      {healthy ? (
        <p className="ct-sys-banner ct-sys-banner--ok" role="status" data-testid="artifact-banner">
          ✓ All {total} artifacts matched their manifest SHA-256 digest, verified at boot.
        </p>
      ) : (
        <p className="ct-sys-banner ct-sys-banner--fail" role="alert" data-testid="artifact-banner">
          ✗ Integrity mismatch — {problems.join("; ")}.
        </p>
      )}

      <dl className="ct-sys-dl" data-testid="artifact-identity">
        <dt>Bundle id</dt>
        <dd>{artifacts.bundleId}</dd>
        <dt>Manifest model id</dt>
        <dd>{artifacts.modelId}</dd>
        <dt>Engine model id</dt>
        <dd>
          {artifacts.engineModelId ?? "not provided"}
          {artifacts.engineModelMatches === null
            ? ""
            : artifacts.engineModelMatches
              ? " — matches the manifest"
              : " — differs from the manifest"}
        </dd>
        <dt>Latest observation</dt>
        <dd className="ct-sys-num">{artifacts.verifiedAt ?? "not observed"}</dd>
      </dl>

      <div className="ct-sys-tablewrap">
        <table className="ct-sys-table" data-testid="artifact-table">
          <caption>
            Each observed value was computed in this browser from the bytes fetched at boot,
            before any view rendered; each declared value comes from the inlined manifest.
          </caption>
          <thead>
            <tr>
              <th scope="col">Artifact</th>
              <th scope="col">Path</th>
              <th scope="col">Manifest SHA-256</th>
              <th scope="col">Observed SHA-256</th>
              <th scope="col">Bytes declared / observed</th>
              <th scope="col">Observed at</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {artifacts.rows.map((row) => {
              const status = rowStatus(row);
              return (
                <tr key={row.key} className={rowClass(row)}>
                  <th scope="row">{row.key}</th>
                  <td>{row.path}</td>
                  <td className="ct-sys-num ct-sys-hash">{row.declaredSha256}</td>
                  <td className="ct-sys-num ct-sys-hash">
                    {row.observedSha256 ?? "not observed"}
                  </td>
                  <td className="ct-sys-num">
                    {row.observedBytes === null
                      ? `${row.declaredBytes} / not observed`
                      : `${row.declaredBytes} / ${row.observedBytes}`}
                  </td>
                  <td className="ct-sys-num">{row.observedAt ?? "not observed"}</td>
                  <td className={status.failed ? "ct-sys-status ct-sys-status--fail" : "ct-sys-status"}>
                    {status.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="ct-sys-note">
        The declared digests are read from the inlined C-01 manifest and the observed digests
        are recomputed from the fetched bytes at boot, so the two columns are compared live in
        this session. A corrupted artifact cannot reach the engine: boot stops with a typed
        failure first.
      </p>
    </>
  );
}

/**
 * System → Integrity (Contracts §9, L429): reports a parity run exactly as
 * given. Statuses derive from each check's `passed` boolean, the overall
 * banner from whether every reported check passed, and an absent run shows
 * the not-run state. A parity failure is prominent (role="alert").
 */
export function IntegrityPane({
  report = null,
  loading = false,
  artifacts = null,
  error = null,
}: IntegrityPaneProps) {
  const failing =
    report === null ? 0 : report.checks.filter((check) => !check.passed).length;
  const state =
    error !== null
      ? "run-failed"
      : loading
        ? "running"
        : report === null
          ? "not-run"
          : report.checks.length === 0
            ? "no-checks"
            : "ready";

  return (
    <SystemPaneShell
      pane="integrity"
      title="Integrity"
      subtitle="Browser parity against golden fixtures, shown exactly as reported."
      loadingMessage="Running parity check…"
      state={state}
    >
      {artifacts !== null && <ArtifactHashChain artifacts={artifacts} />}

      {error !== null ? (
        <div className="ct-sys-state" role="alert" data-testid="parity-error">
          <p className="ct-sys-state__heading">
            Fixture verification could not run in this browser.
          </p>
          <p className="ct-sys-state__body">{error}</p>
          <p className="ct-sys-state__body">
            No status is shown until a run reports checks.
          </p>
        </div>
      ) : loading ? (
        <div className="ct-sys-state" role="status" data-testid="parity-loading">
          <p className="ct-sys-state__heading">Running fixture verification…</p>
          <p className="ct-sys-state__body">
            The production TypeScript engine is recomputing every golden fixture inside this
            browser. Results appear only when the run reports them.
          </p>
          <div className="ct-sys-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : report === null ? (
        <div className="ct-sys-state" role="status">
          <p className="ct-sys-state__heading">No integrity run in this session.</p>
          <p className="ct-sys-state__body">
            The parity check runs the production TypeScript engine against the golden fixtures
            inside the browser. Results appear here only after a run — this pane never displays a
            precomputed verdict.
          </p>
        </div>
      ) : (
        <>
          {report.checks.length === 0 ? (
            <div className="ct-sys-state" role="status">
              <p className="ct-sys-state__heading">This run reported no checks.</p>
              <p className="ct-sys-state__body">No status is shown until a run reports checks.</p>
            </div>
          ) : failing === 0 ? (
            <p className="ct-sys-banner ct-sys-banner--ok" role="status">
              ✓ All reported checks are within tolerance.
            </p>
          ) : (
            <p className="ct-sys-banner ct-sys-banner--fail" role="alert">
              ✗ Parity check failed — {failing} of {report.checks.length} checks outside
              tolerance.
            </p>
          )}

          {report.fixtures !== undefined && (
            <p className="ct-sys-status" data-testid="parity-fixtures">
              {report.fixtures.failed === 0 ? "✓" : "✗"} Fixture pass/fail:{" "}
              {report.fixtures.passed} of {report.fixtures.total} fixtures within tolerance.
            </p>
          )}

          <h3>Run identity</h3>
          <dl className="ct-sys-dl" data-testid="parity-identity">
            <dt>Model</dt>
            <dd>{report.modelId}</dd>
            <dt>Fixture</dt>
            <dd>{report.fixtureId}</dd>
          </dl>

          <h3>Tolerances</h3>
          <div className="ct-sys-tablewrap">
            <table className="ct-sys-table" data-testid="parity-tolerances">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Tolerance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Probability</th>
                  <td className="ct-sys-num">{formatValue(report.tolerance.probability)}</td>
                </tr>
                <tr>
                  <th scope="row">Attribution</th>
                  <td className="ct-sys-num">{formatValue(report.tolerance.attribution)}</td>
                </tr>
                <tr>
                  <th scope="row">Efficiency</th>
                  <td className="ct-sys-num">{formatValue(report.tolerance.efficiency)}</td>
                </tr>
                {report.tolerance.margin !== undefined && (
                  <tr>
                    <th scope="row">Margin</th>
                    <td className="ct-sys-num">{formatValue(report.tolerance.margin)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {report.maxMarginDeviation !== undefined && (
            <>
              <h3>Reported deviations</h3>
              <dl className="ct-sys-dl" data-testid="parity-deviations">
                <dt>Max margin deviation</dt>
                <dd className="ct-sys-num">{formatValue(report.maxMarginDeviation)}</dd>
              </dl>
            </>
          )}

          {report.checks.length > 0 && (
            <>
              <h3>Checks</h3>
              <div className="ct-sys-tablewrap">
                <table className="ct-sys-table" data-testid="parity-checks">
                  <caption>Status derives from each check&apos;s reported result.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Check</th>
                      <th scope="col">Observed</th>
                      <th scope="col">Expected</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.checks.map((check) => (
                      <tr
                        key={check.name}
                        className={
                          check.passed ? "ct-sys-row" : "ct-sys-row ct-sys-row--fail"
                        }
                      >
                        <th scope="row">{check.name}</th>
                        <td className="ct-sys-num">{formatValue(check.observed)}</td>
                        <td className="ct-sys-num">{formatValue(check.expected)}</td>
                        <td
                          className={
                            check.passed ? "ct-sys-status" : "ct-sys-status ct-sys-status--fail"
                          }
                        >
                          {check.passed ? "✓" : "✗"} {statusText(check.passed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="ct-sys-note">
            Statuses derive from the reported check results — this pane does not evaluate
            tolerances or precompute outcomes.
          </p>
        </>
      )}
    </SystemPaneShell>
  );
}
