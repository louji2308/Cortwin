/**
 * Keyboard-reachable segmented control (native buttons + aria-pressed) used for
 * target selection across the Trust panes. No colour-only state: the pressed
 * button carries aria-pressed plus a visual weight/border change.
 */

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  title?: string;
};

export type SegmentedControlProps<T extends string> = {
  legend: string;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onChange
}: SegmentedControlProps<T>) {
  return (
    <fieldset className="ct-seg">
      <legend className="ct-seg__legend">{legend}</legend>
      <div className="ct-seg__row">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="ct-seg__btn ct-num"
            aria-pressed={option.value === value}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
