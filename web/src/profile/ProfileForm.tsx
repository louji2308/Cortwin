import { useState, type FormEvent, type ReactNode } from "react";
import type { ProfileFormProps } from "./types";
import { buildProfileViewModel, type DraftChange, type Drafts, type FieldVm, type SectionVm } from "./view";
import "./ProfileForm.css";

/**
 * Profile — the registry-driven patient input form (C-09 §7.1 surfaces,
 * Implementation_Plan P6 steps 5/6/15/16/17).
 *
 * Renders ONLY from props: identity, labels, levels, ranges, units and counts
 * come from the injected C-02 registry; dispatch callbacks arrive from the
 * container, so this component never imports a store singleton, never reads an
 * artifact and never computes clinical truth. All interaction logic lives in
 * `view.ts` / `handlers.ts` (pure, directly testable); this file is markup,
 * local draft state and accessibility wiring.
 *
 * `FieldView` / `SectionView` are exported so tests can render draft-dependent
 * states (invalid text, armed range warning) that only exist between events.
 */

type EventSink = (change: DraftChange) => void;

function messageFor(
  field: FieldVm
): { className: string; role: string; text: string; glyph: string | null } | null {
  if (field.invalidMessage !== null) {
    return {
      className: "ct-field__message ct-field__message--error",
      role: "field-error",
      text: field.invalidMessage,
      glyph: "!"
    };
  }
  if (field.warning !== null) {
    return {
      className: "ct-field__message ct-field__message--warning",
      role: "range-warning",
      text: field.warning,
      glyph: "\u25B3"
    };
  }
  if (field.missingMessage !== null) {
    return {
      className: "ct-field__message",
      role: "field-missing",
      text: field.missingMessage,
      glyph: null
    };
  }
  if (field.feature.derived !== null) {
    return {
      className: "ct-field__message ct-field__message--note",
      role: "field-note",
      text: field.feature.derived.formula,
      glyph: null
    };
  }
  return null;
}

function valueControl(field: FieldVm, readOnly: boolean, onEvent: EventSink): ReactNode {
  const describedBy = field.messageId;
  switch (field.control.kind) {
    case "number":
      return (
        <input
          className="ct-field__input ct-field__input--number"
          id={field.controlId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          data-role="value-input"
          value={field.displayValue}
          disabled={field.disabled}
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          aria-invalid={field.invalid || undefined}
          aria-describedby={describedBy}
          onFocus={field.onSelect}
          onChange={(event) => onEvent(field.onEdit(event.target.value))}
          onBlur={() => onEvent(field.onBlur())}
        />
      );
    case "checkbox":
      return (
        <input
          className="ct-field__checkbox"
          id={field.controlId}
          type="checkbox"
          data-role="value-input"
          data-value-present={String(field.valuePresent)}
          checked={field.control.checked}
          disabled={field.disabled}
          aria-readonly={readOnly || undefined}
          aria-describedby={describedBy}
          onFocus={field.onSelect}
          onChange={(event) => onEvent(field.onToggle(event.target.checked))}
        />
      );
    case "select": {
      const { options, value } = field.control;
      return (
        <select
          className="ct-field__input ct-field__select"
          id={field.controlId}
          data-role="value-input"
          value={value}
          disabled={field.disabled}
          aria-readonly={readOnly || undefined}
          aria-describedby={describedBy}
          onFocus={field.onSelect}
          onChange={(event) => onEvent(field.onChoose(event.target.value))}
        >
          {field.observed ? null : (
            <option value="" data-role="select-placeholder">
              not provided
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    case "radio": {
      const { options, value } = field.control;
      return (
        <div
          className="ct-field__options"
          role="radiogroup"
          aria-labelledby={`${field.controlId}-label`}
        >
          {options.map((option, index) => (
            <span className="ct-field__option" key={option.value}>
                <input
                  className="ct-field__radio"
                  id={`${field.controlId}-${index}`}
                  type="radio"
                  name={field.controlId}
                  data-role="value-input"
                  value={option.value}
                checked={value === option.value}
                disabled={field.disabled}
                aria-readonly={readOnly || undefined}
                aria-describedby={describedBy}
                onFocus={field.onSelect}
                onChange={() => onEvent(field.onChoose(option.value))}
              />
              <label className="ct-field__option-label" htmlFor={`${field.controlId}-${index}`}>
                {option.label}
              </label>
            </span>
          ))}
        </div>
      );
    }
  }
}

/** One registry feature: label, control, stable message slot, provision toggle. */
export function FieldView({
  field,
  readOnly,
  onEvent
}: {
  field: FieldVm;
  readOnly: boolean;
  onEvent: EventSink;
}): ReactNode {
  const message = messageFor(field);
  return (
    <div
      className="ct-field"
      data-feature-id={field.feature.id}
      data-control={field.controlKind}
      data-observed={String(field.observed)}
    >
      <div className="ct-field__head">
        {field.controlKind === "radio" ? (
          <span className="ct-field__label" id={`${field.controlId}-label`}>
            {field.feature.label}
          </span>
        ) : (
          <label className="ct-field__label" htmlFor={field.controlId}>
            {field.feature.label}
          </label>
        )}
        {field.feature.unit !== null ? (
          <span className="ct-field__unit">{field.feature.unit}</span>
        ) : null}
      </div>

      {valueControl(field, readOnly, onEvent)}

      <div className="ct-field__messages" id={field.messageId}>
        {message === null ? null : (
          <p className={message.className} data-role={message.role}>
            {message.glyph === null ? null : (
              <span className="ct-field__glyph" aria-hidden="true">
                {message.glyph}
              </span>
            )}
            <span>{message.text}</span>
          </p>
        )}
      </div>

      <div className="ct-field__missing">
        <input
          className="ct-field__missing-toggle"
          id={field.provideId}
          type="checkbox"
          data-role="feature-provide"
          checked={!field.provided}
          disabled={field.missingDisabled}
          aria-label={`${field.feature.label}: not provided`}
          onChange={(event) => onEvent(field.onToggleProvided(event.target.checked))}
        />
        <label className="ct-field__missing-label" htmlFor={field.provideId}>
          not provided
        </label>
      </div>
    </div>
  );
}

/** One modality section: title, count, section-level provision toggle, fields. */
export function SectionView({
  section,
  readOnly,
  onEvent
}: {
  section: SectionVm;
  readOnly: boolean;
  onEvent: EventSink;
}): ReactNode {
  return (
    <section
      className="ct-profile__section"
      aria-labelledby={section.headerId}
      data-modality-id={section.modality.id}
      data-provided={String(section.provided)}
    >
      <div className="ct-profile__section-head">
        <span className="ct-profile__section-title" id={section.headerId}>
          {section.modality.label}
        </span>
        <span className="ct-profile__count" data-role="modality-count">
          {`${section.count.provided} / ${section.count.total} provided`}
        </span>
        <div className="ct-profile__modality-missing">
          <input
            className="ct-field__missing-toggle"
            id={section.switchId}
            type="checkbox"
            data-role="modality-provide"
            checked={!section.provided}
            disabled={readOnly}
            aria-label={`${section.modality.label}: not provided`}
            onChange={(event) => onEvent(section.onToggleProvided(event.target.checked))}
          />
          <label className="ct-field__missing-label" htmlFor={section.switchId}>
            not provided
          </label>
        </div>
      </div>

      {section.notice !== null ? (
        <p className="ct-profile__notice" data-role="modality-notice">
          {section.notice}
        </p>
      ) : null}

      <ul className="ct-profile__fields">
        {section.fields.map((field) => (
          <li className="ct-profile__item" key={field.feature.id}>
            <FieldView field={field} readOnly={readOnly} onEvent={onEvent} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProfileForm(props: ProfileFormProps) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const vm = buildProfileViewModel(props, { drafts });

  const apply: EventSink = (change) => {
    if (change.kind === "none") return;
    if (change.kind === "keep") {
      const { featureId, draft } = change;
      setDrafts((previous) => ({ ...previous, [featureId]: draft }));
      return;
    }
    setDrafts((previous: Drafts) => {
      let next: Drafts = previous;
      for (const featureId of change.featureIds) {
        if (next[featureId] !== undefined) {
          if (next === previous) next = { ...previous };
          delete next[featureId];
        }
      }
      return next;
    });
  };

  const preventSubmit = (event: FormEvent): void => {
    event.preventDefault();
  };

  return (
    <form
      className="ct-profile"
      data-testid="profile-form"
      aria-label="Patient inputs"
      data-revision={props.revision ?? 0}
      data-eval-status={props.evalStatus ?? "idle"}
      onSubmit={preventSubmit}
    >
      <div className="ct-profile__status" role="status" aria-live="polite" data-role="eval-status">
        {vm.statusText}
      </div>

      {vm.readOnly ? (
        <p className="ct-profile__banner" data-role="readonly-banner">
          View-only — edits are not recorded.
        </p>
      ) : null}

      {vm.sections.map((section) => (
        <SectionView
          key={section.modality.id}
          section={section}
          readOnly={vm.readOnly}
          onEvent={apply}
        />
      ))}
    </form>
  );
}
