import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ImportScreen } from './screens/ImportScreen';
import { LoginScreen } from './screens/LoginScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { ProjectScreen } from './screens/ProjectScreen';
import { ProjectSetupScreen } from './screens/ProjectSetupScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { RunsScreen } from './screens/RunsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import type { BootstrapStage } from './state/useSessionStore';
import { useSessionStore } from './state/useSessionStore';

function LoadingScreen(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <span className="text-label text-muted">Loading…</span>
    </div>
  );
}

/**
 * The auth flow (Welcome -> Register/Login) is a linear gate, not a set of
 * pages a user can navigate freely between - so it's driven by `stage`, not
 * by the router. Registration assigns a real role immediately, so there is
 * no separate onboarding step to gate on.
 *
 * Once a session is fully ready, everything past that point lives behind
 * react-router, matching the permanent left nav (`AppShell`) every one of
 * these screens shares: Overview, Projects, a project's own detail/import
 * pages, Runs, Reports, Settings.
 */
export function App(): JSX.Element {
  const stage = useSessionStore((s) => s.stage);
  const bootstrap = useSessionStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    // Keyed by stage so each transition (Welcome -> Register/Login -> ready)
    // remounts and replays the fade rather than hard-cutting.
    <div key={stage} className="animate-stage-in">
      {renderStage(stage)}
    </div>
  );
}

function renderStage(stage: BootstrapStage): JSX.Element {
  switch (stage) {
    case 'loading':
      return <LoadingScreen />;
    case 'welcome':
      return <WelcomeScreen />;
    case 'needs-registration':
      return <RegisterScreen />;
    case 'needs-login':
      return <LoginScreen />;
    case 'ready':
      return (
        <Routes>
          <Route path="/" element={<OverviewScreen />} />
          <Route path="/projects" element={<ProjectsScreen />} />
          <Route path="/projects/new" element={<ProjectSetupScreen />} />
          <Route path="/projects/:projectId" element={<ProjectScreen />} />
          <Route path="/projects/:projectId/import" element={<ImportScreen />} />
          <Route path="/runs" element={<RunsScreen />} />
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      );
  }
}
