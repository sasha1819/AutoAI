import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_OPTIONS, UserRole } from '@shared/ipc-contract';
import { useProjectsStore } from '../state/useProjectsStore';
import { useRunStore } from '../state/useRunStore';
import { useSessionStore } from '../state/useSessionStore';
import { AssistantPanel } from './AssistantPanel';
import { BrandMark } from './BrandMark';
import type { IconProps } from './Icons';
import {
  ChevronDownIcon,
  FileTextIcon,
  FolderIcon,
  LayoutGridIcon,
  PlayIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from './Icons';

export const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.ManualTester]: 'Manual QA Tester',
  [UserRole.AutomationEngineer]: 'Automation Engineer',
  [UserRole.QaLead]: 'QA Lead',
};

const NAV_ITEM_BASE =
  'flex h-row items-center gap-2.5 rounded-lg px-2.5 text-ui outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40';

/**
 * One nav row. The permanent nav is the point of the v2 shell - the shape
 * of the app is visible from minute one - so a section with nothing in it
 * still appears, shows its real count, and says so when you open it. What
 * it never does is show a count it invented.
 */
function NavItem({
  to,
  end = false,
  label,
  count,
  Icon,
}: {
  readonly to: string;
  readonly end?: boolean;
  readonly label: string;
  readonly count?: number;
  readonly Icon: (props: IconProps) => JSX.Element;
}): JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `${NAV_ITEM_BASE} ${
          isActive
            ? 'bg-raised font-medium text-ink shadow-[0_1px_2px_rgba(26,24,21,0.06)]'
            : 'text-quiet hover:bg-raised/60'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-ink' : 'text-muted'}>
            <Icon size={15} />
          </span>
          <span className="flex-1 truncate">{label}</span>
          {count !== undefined && <span className="font-mono text-meta text-quiet">{count}</span>}
        </>
      )}
    </NavLink>
  );
}

/**
 * The role pill from the design, wired rather than drawn. It carries a
 * chevron, so it opens something: changing the selection re-runs the same
 * `onboarding:set-role` call the onboarding screen makes, and the whole UI
 * changes register with it. A native select keeps it keyboard- and
 * screen-reader-navigable for free; the pill chrome sits on top.
 */
function RoleSwitcher({ role }: { readonly role: UserRole }): JSX.Element {
  const setRole = useSessionStore((s) => s.setRole);

  return (
    <div className="relative flex h-chip items-center rounded-full border border-edge bg-raised pl-3 pr-8">
      <span className="mr-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <select
        aria-label="Your role"
        value={role}
        onChange={(e) => void setRole(e.target.value as UserRole)}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-caption text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {ROLE_OPTIONS.map((option) => (
          <option key={option.role} value={option.role}>
            {ROLE_LABEL[option.role]}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 text-muted">
        <ChevronDownIcon size={12} />
      </span>
    </div>
  );
}

interface AppShellProps {
  /** What the top bar names. A string for a plain screen title, or a node
   * for the breadcrumb a project page draws. */
  readonly title: ReactNode;
  readonly children: ReactNode;
}

/**
 * The shell for every post-`ready` screen: the permanent left nav from the
 * v2 design, a 60px top bar, one scrolling content region, and the
 * "Ask AutoAI" dock (AssistantPanel) always present along the bottom.
 * Screens supply their own padding so a full-bleed screen doesn't have to
 * undo the shell's.
 */
export function AppShell({ title, children }: AppShellProps): JSX.Element {
  const session = useSessionStore((s) => s.session);
  const projects = useProjectsStore((s) => s.projects);
  const allRuns = useRunStore((s) => s.allRuns);
  const loadAllRuns = useRunStore((s) => s.loadAll);

  /* The nav's own count needs the real run total up front, not only once
     RunsScreen has been visited - same "never show a count it invented"
     principle as every other NavItem here. */
  useEffect(() => {
    void loadAllRuns();
  }, [loadAllRuns]);

  const initial = (
    session?.name.trim().charAt(0) ||
    session?.email.trim().charAt(0) ||
    '?'
  ).toUpperCase();

  /* Newest first, three at most - the "Recent" list in the design. Sorted
     off `createdAt` rather than array order so it doesn't depend on how
     the store happened to accumulate them. */
  const recent = [...projects]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <nav
        aria-label="Sections"
        className="flex w-nav shrink-0 flex-col justify-between overflow-hidden border-r border-hairline bg-rail px-3.5 py-[22px]"
      >
        <div className="flex min-h-0 flex-col gap-[22px]">
          <div className="px-2.5">
            <BrandMark size={24} />
          </div>

          <div className="flex flex-col gap-0.5">
            <NavItem to="/" end label="Overview" Icon={LayoutGridIcon} />
            <NavItem to="/projects" label="Projects" count={projects.length} Icon={FolderIcon} />
            <NavItem to="/runs" label="Runs" count={allRuns.length} Icon={PlayIcon} />
            <NavItem to="/reports" label="Reports" count={0} Icon={FileTextIcon} />
          </div>

          <div className="flex min-h-0 flex-col gap-2 px-2.5">
            <span className="font-mono text-nano font-semibold uppercase tracking-wide text-muted">
              Recent
            </span>
            {recent.length === 0 ? (
              <span className="text-caption text-muted">Nothing here yet</span>
            ) : (
              <div className="flex flex-col gap-1.5 overflow-hidden">
                {recent.map((project) => (
                  <NavLink
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="truncate text-label text-quiet outline-none transition hover:text-ink focus-visible:text-ink"
                  >
                    {project.name}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <NavItem to="/settings" label="Settings" Icon={SettingsIcon} />
          <div className="mt-1.5 flex items-center gap-2 border-t border-hairline p-2.5 text-accent-deep">
            <ShieldCheckIcon size={13} />
            <span className="text-meta">Local only</span>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-topbar shrink-0 items-center justify-between gap-6 border-b border-hairline px-8">
          <div className="flex min-w-0 items-center font-display text-screen font-semibold text-ink">
            {title}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {session?.role && <RoleSwitcher role={session.role} />}
            <span
              className="flex size-7 items-center justify-center rounded-full bg-ink font-display text-micro font-semibold text-surface"
              title={session?.name}
            >
              {initial}
            </span>
          </div>
        </header>

        {/* pb-16 reserves space for the assistant dock's slim, always-present
            input row (AssistantPanel) - the dock grows taller than that when
            a conversation is open, but the minimum persistent height never
            covers a screen's own last row of content. */}
        <main className="scroll-region min-h-0 flex-1 overflow-y-auto pb-16">{children}</main>
      </div>

      <AssistantPanel />
    </div>
  );
}
