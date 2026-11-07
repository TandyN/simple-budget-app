import type { ReactNode } from 'react';

export interface TwoPaneProps {
  readonly leftLabel?: string;
  readonly rightLabel?: string;
  readonly left: ReactNode;
  readonly right: ReactNode;
}

export function TwoPane({
  leftLabel = 'Overview pane',
  rightLabel = 'Ledger pane',
  left,
  right,
}: TwoPaneProps) {
  return (
    <div className="sb-two-pane" role="region" aria-label="Two-pane split layout">
      <section className="sb-pane" aria-label={leftLabel}>
        {left}
      </section>
      <section className="sb-pane" aria-label={rightLabel}>
        {right}
      </section>
    </div>
  );
}
