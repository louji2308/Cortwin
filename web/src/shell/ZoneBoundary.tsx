import { Component, type ReactNode } from "react";
import { SHELL_COPY } from "./copy";

export type ZoneBoundaryProps = {
  zone: string;
  children: ReactNode;
};

type ZoneBoundaryState = { error: Error | null };

export class ZoneBoundary extends Component<ZoneBoundaryProps, ZoneBoundaryState> {
  constructor(props: ZoneBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ZoneBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.setState({ error });
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { zone, children } = this.props;
    const { error } = this.state;
    if (error === null) return children;
    return (
      <section
        className="ct-zone-error"
        role="alert"
        data-testid="zone-error"
        data-zone={zone}
      >
        <h2 className="ct-zone-error__heading">{SHELL_COPY.zoneErrorHeading}</h2>
        <p className="ct-zone-error__body">{SHELL_COPY.zoneErrorBody}</p>
        <button
          type="button"
          className="ct-zone-error__retry"
          data-testid="zone-retry"
          onClick={this.reset}
        >
          {SHELL_COPY.zoneErrorRetry}
        </button>
      </section>
    );
  }
}
