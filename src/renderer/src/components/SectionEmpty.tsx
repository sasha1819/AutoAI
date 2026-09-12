import type { ReactNode } from 'react';

interface SectionEmptyProps {
  readonly headline: string;
  readonly children: ReactNode;
  /** A frame is right when the empty block stands in for a list that will
   * one day fill the same box (Runs, Reports). Inline suits a panel that
   * already has its own border, like the case list inside a project. */
  readonly frame?: boolean;
}

/**
 * The v2 rule for a section with nothing in it: say nothing, rather than
 * pretend. It appears in the nav with a real count of zero, opens like any
 * other section, and then tells the truth about why it is empty - including
 * when the reason is that the feature behind it isn't built yet.
 *
 * What it never does is stand in a sample row, a zeroed chart, or a button
 * that would have to apologise for itself when clicked.
 */
export function SectionEmpty({ headline, children, frame = true }: SectionEmptyProps): JSX.Element {
  return (
    <div
      className={
        frame
          ? 'flex flex-col items-start gap-2 rounded-lg border border-dashed border-edge px-7 py-10'
          : 'flex flex-col items-start gap-2 px-1 py-8'
      }
    >
      <p className="font-display text-card font-semibold text-ink">{headline}</p>
      <p className="max-w-[520px] text-caption leading-relaxed text-muted">{children}</p>
    </div>
  );
}
