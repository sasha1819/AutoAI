import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import { AppWindowIcon, MonitorIcon, ShieldCheckIcon, SmartphoneIcon } from './Icons';

/**
 * The shell every pre-`ready` screen sits in: a fixed brand rail on the
 * left, the screen's own content centred on the right. The rail is
 * identical across welcome / register / login / onboarding by design, so
 * it lives here once rather than being repeated per screen.
 */

const ENGINES = [
  {
    Icon: SmartphoneIcon,
    title: 'Mobile (Appium)',
    tag: 'appium',
    text: 'Automate native and hybrid iOS & Android tests effortlessly.',
  },
  {
    Icon: AppWindowIcon,
    title: 'Web (Playwright)',
    tag: 'playwright',
    text: 'Fast, reliable end-to-end testing for modern web apps.',
  },
  {
    Icon: MonitorIcon,
    title: 'Desktop (Native)',
    tag: 'accessibility',
    text: 'Direct harness integration via OS-level accessibility APIs.',
  },
] as const;

/** The two content widths the design uses: 340px for a form, 400px for the
 * role picker. A union rather than a raw class string so Tailwind can see
 * every value it has to generate. */
type ContentWidth = 'form' | 'wide';

const CONTENT_WIDTH: Record<ContentWidth, string> = {
  form: 'w-[340px]',
  wide: 'w-[400px]',
};

interface AuthLayoutProps {
  readonly children: ReactNode;
  readonly width?: ContentWidth;
}

export function AuthLayout({ children, width = 'form' }: AuthLayoutProps): JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <aside className="scroll-region flex w-rail shrink-0 flex-col justify-between gap-10 overflow-y-auto border-r border-hairline bg-rail px-10 py-11">
        <BrandMark size={32} />

        <div className="flex flex-col gap-8">
          <h2 className="font-display text-hero font-bold text-ink">
            One console.
            <br />
            Three engines.
          </h2>

          <div className="flex flex-col gap-3">
            {ENGINES.map((engine) => (
              <div
                key={engine.tag}
                className="flex items-center gap-4 rounded-lg border border-hairline bg-raised p-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent-deep">
                  <engine.Icon size={20} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-body font-bold text-ink">{engine.title}</span>
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-accent-deep">
                      {engine.tag}
                    </span>
                  </div>
                  <p className="text-micro text-muted">{engine.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-hairline pt-2">
          <div className="flex items-center gap-2 text-accent-deep">
            <ShieldCheckIcon size={14} />
            <span className="text-tag font-semibold uppercase tracking-wide">Local-first</span>
          </div>
          <p className="text-micro leading-normal text-muted">
            No account, and your profile and projects never leave this machine. Scanning a project
            &mdash; only when you ask &mdash; sends its code to Claude to suggest tests.
          </p>
        </div>
      </aside>

      <main className="scroll-region flex flex-1 items-center justify-center overflow-y-auto px-10 py-12">
        <div className={`${CONTENT_WIDTH[width]} shrink-0`}>{children}</div>
      </main>
    </div>
  );
}
