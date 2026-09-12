import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProjectTable } from '../components/ProjectTable';
import { SectionEmpty } from '../components/SectionEmpty';
import { TransportFailedNotice } from '../components/TransportFailedNotice';
import { useProjectsStore } from '../state/useProjectsStore';

/**
 * The full list behind the nav's Projects count. Overview shows the same
 * table under its own heading; both read the one store, so the count in
 * the nav and the rows on either screen can never disagree.
 */
export function ProjectsScreen(): JSX.Element {
  const navigate = useNavigate();
  const projects = useProjectsStore((s) => s.projects);
  const loaded = useProjectsStore((s) => s.loaded);
  const transportFailed = useProjectsStore((s) => s.transportFailed);
  const loadProjects = useProjectsStore((s) => s.load);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <AppShell title="Projects">
      <div className="flex flex-col gap-6 px-8 py-7">
        <div className="flex items-center justify-between">
          <p className="text-label text-muted">
            Every project is one folder on this Mac. Nothing is copied or uploaded.
          </p>
          <PrimaryButton onClick={() => navigate('/projects/new')}>Add project</PrimaryButton>
        </div>

        {transportFailed && <TransportFailedNotice />}

        {loaded &&
          (projects.length === 0 ? (
            <SectionEmpty headline="No projects yet">
              Add one to point AutoAI at a folder on this machine.
            </SectionEmpty>
          ) : (
            <ProjectTable projects={projects} />
          ))}
      </div>
    </AppShell>
  );
}
