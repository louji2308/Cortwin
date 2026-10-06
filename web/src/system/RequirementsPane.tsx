import { REQUIREMENT_ENTRIES } from "./requirementsData";
import { SystemPaneShell } from "./SystemPaneShell";
import type { RequirementEntry } from "./types";

export type RequirementsPaneProps = {
  /** Entries to render. Defaults to the rows transcribed from docs/TRACEABILITY.md. */
  entries?: readonly RequirementEntry[];
  /** Designed loading state while the shell fetches entries. */
  loading?: boolean;
};

/**
 * System → Requirements (Contracts §9, L426): a declarative table mapping
 * each requirement to a deep-link state. The pane renders only its `entries`
 * prop — nothing is fetched or generated at runtime — and each "Show me" is
 * an anchor whose href must parse against the C-10 grammar (asserted by
 * requirementsPane.test.tsx).
 */
export function RequirementsPane({
  entries = REQUIREMENT_ENTRIES,
  loading = false,
}: RequirementsPaneProps) {
  return (
    <SystemPaneShell
      pane="requirements"
      title="Requirements"
      subtitle="Every requirement, the contract that satisfies it, the verification ID that covers it, and a Show me link into the matching view."
      loadingMessage="Loading requirements…"
      state={entries.length === 0 ? "empty" : "ready"}
      loading={loading}
    >
      {entries.length === 0 ? (
        <div className="ct-sys-state" role="status">
          <p className="ct-sys-state__heading">No requirement entries in this session.</p>
          <p className="ct-sys-state__body">
            This pane renders only the entries it is given — nothing is generated at runtime.
          </p>
        </div>
      ) : (
        <>
          <div className="ct-sys-tablewrap">
            <table className="ct-sys-table" data-testid="requirements-table">
              <caption>Requirement → contract → verification → view</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Requirement</th>
                  <th scope="col">Contract</th>
                  <th scope="col">Verification</th>
                  <th scope="col">Show me</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} data-requirement={entry.id}>
                    <th scope="row">{entry.id}</th>
                    <td>{entry.description}</td>
                    <td>{entry.satisfactionContract}</td>
                    <td>{entry.verifyId}</td>
                    <td>
                      <a
                        className="ct-sys-link"
                        href={entry.deepLink}
                        aria-label={`Show me requirement ${entry.id} at ${entry.deepLink}`}
                      >
                        Show me
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ct-sys-note">
            Show me links render as fragment URLs; resolving them into application state is the
            router&apos;s job (C-10).
          </p>
        </>
      )}
    </SystemPaneShell>
  );
}
