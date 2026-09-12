import { ChartNetworkIcon } from './Icons';

interface BrandMarkProps {
  /** 32 on the auth rail, 24 in the top bar - the only two the design uses. */
  readonly size?: 32 | 24;
}

/** Amber badge + wordmark. The badge and the glyph inside it are sized
 * independently in the design (18px glyph in a 32px badge, 14px in a 24px
 * one), so both are set explicitly rather than scaled off one number. */
export function BrandMark({ size = 32 }: BrandMarkProps): JSX.Element {
  const large = size === 32;

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex shrink-0 items-center justify-center bg-accent text-accent-ink ${
          large ? 'size-8 rounded-md' : 'size-6 rounded'
        }`}
      >
        <ChartNetworkIcon size={large ? 18 : 14} />
      </div>
      <span className={`font-display font-bold text-ink ${large ? 'text-brand' : 'text-card'}`}>
        AutoAI
      </span>
    </div>
  );
}
