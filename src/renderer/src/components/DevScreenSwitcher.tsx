import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../state/useProjectsStore';
import type { BootstrapStage } from '../state/useSessionStore';
import { useSessionStore } from '../state/useSessionStore';

const FLOW_STAGES: readonly { readonly stage: BootstrapStage; readonly label: string }[] = [
  { stage: 'welcome', label: 'Welcome' },
  { stage: 'needs-registration', label: 'Register' },
  { stage: 'needs-login', label: 'Login' },
  { stage: 'needs-onboarding', label: 'Onboarding' },
];

const APP_ROUTES: readonly { readonly path: string; readonly label: string }[] = [
  { path: '/', label: 'Overview' },
  { path: '/projects', label: 'Projects' },
  { path: '/runs', label: 'Runs' },
  { path: '/reports', label: 'Reports' },
  { path: '/settings', label: 'Settings' },
];

const BUTTON_CLASSES =
  'rounded px-2 py-1 text-left text-[11px] leading-none text-neutral-200 outline-none transition hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:hover:bg-transparent';

/**
 * Jumps straight to any screen, bypassing the real auth/onboarding gate -
 * built after verifying the login-validation slice required registering a
 * throwaway profile and logging out just to see LoginScreen once.
 *
 * Dev-only by construction, not just by convention: `import.meta.env.DEV` is
 * Vite's build-time flag, false (and dead-code-eliminated) in `npm run
 * build`/`build:mac`. This component and its import of `devSetStage` are
 * compiled out of the shipped app entirely, not merely hidden by a runtime
 * check - verify with `grep DevScreenSwitcher out/renderer/assets/*.js`
 * after a production build, which should find nothing.
 */
export function DevScreenSwitcher(): JSX.Element | null {
  if (!import.meta.env.DEV) return null;
  return <DevScreenSwitcherPanel />;
}

function DevScreenSwitcherPanel(): JSX.Element {
  const navigate = useNavigate();
  const session = useSessionStore((s) => s.session);
  const devSetStage = useSessionStore((s) => s.devSetStage);
  const projects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.load);

  useEffect(() => {
    if (session) void loadProjects();
  }, [session, loadProjects]);

  return (
    <div
      className="fixed bottom-3 left-3 z-[999] flex flex-col gap-2 rounded-lg bg-black/85 px-3 py-2.5 shadow-lg backdrop-blur-sm"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Dev · jump to screen</span>

      <div className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wide text-neutral-500">Flow (forced, real data untouched)</span>
        <div className="flex flex-wrap gap-1">
          {FLOW_STAGES.map(({ stage, label }) => (
            <button key={stage} type="button" onClick={() => devSetStage(stage)} className={BUTTON_CLASSES}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wide text-neutral-500">
          App {!session && '(needs a real session first)'}
        </span>
        <div className="flex flex-wrap gap-1">
          {APP_ROUTES.map(({ path, label }) => (
            <button
              key={path}
              type="button"
              disabled={!session}
              title={session ? undefined : 'Register or log in for real first - these screens need a real session.'}
              onClick={() => {
                devSetStage('ready');
                navigate(path);
              }}
              className={BUTTON_CLASSES}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {session && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wide text-neutral-500">
            Project {projects.length === 0 && '(none added yet)'}
          </span>
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  devSetStage('ready');
                  navigate(`/projects/${project.id}`);
                }}
                title={project.localPath}
                className={BUTTON_CLASSES}
              >
                {project.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
