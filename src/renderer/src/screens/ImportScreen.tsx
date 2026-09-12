import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { CsvImportPanel } from '../components/CsvImportPanel';
import { ImportPreview } from '../components/ImportPreview';
import { ImportSourceList } from '../components/ImportSourceList';
import { PasteImportPanel } from '../components/PasteImportPanel';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionEmpty } from '../components/SectionEmpty';
import { SelectField } from '../components/SelectField';
import type { ParsedImport } from '../lib/importParsing';
import { importCountLabel } from '../lib/importParsing';
import type { ImportSourceId } from '../lib/importSources';
import { findImportSource } from '../lib/importSources';
import { describeTestPlanError } from '../lib/testPlanErrors';
import { useProjectsStore } from '../state/useProjectsStore';
import { useTestPlanStore } from '../state/useTestPlanStore';

const UNSORTED_VALUE = '';
const EMPTY: ParsedImport = { cases: [], skipped: [] };

function Breadcrumb({
  projectId,
  name,
}: {
  readonly projectId: string;
  readonly name: string;
}): JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link to="/projects" className="shrink-0 text-muted transition hover:text-ink">
        Projects
      </Link>
      <span className="shrink-0 text-faint" aria-hidden="true">
        /
      </span>
      <Link
        to={`/projects/${projectId}`}
        className="max-w-[220px] truncate text-muted transition hover:text-ink"
      >
        {name}
      </Link>
      <span className="shrink-0 text-faint" aria-hidden="true">
        /
      </span>
      <span className="shrink-0">Import</span>
    </span>
  );
}

/**
 * Importing test cases into a project.
 *
 * The design draws this as a panel over the project page. It is a route
 * here instead: picking a source, mapping columns, and reading a preview
 * is several minutes of work with a real chance of going back a step, and
 * a dialog that size stops being a dialog. The project page keeps its own
 * state underneath, and the breadcrumb is the way back.
 */
export function ImportScreen(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const projects = useProjectsStore((s) => s.projects);
  const loaded = useProjectsStore((s) => s.loaded);
  const loadProjects = useProjectsStore((s) => s.load);

  const areas = useTestPlanStore((s) => s.areas);
  const saving = useTestPlanStore((s) => s.saving);
  const lastError = useTestPlanStore((s) => s.lastError);
  const loadPlan = useTestPlanStore((s) => s.load);
  const importCases = useTestPlanStore((s) => s.importCases);
  const clearError = useTestPlanStore((s) => s.clearError);

  const [source, setSource] = useState<ImportSourceId | null>(null);
  const [areaId, setAreaId] = useState<string>(UNSORTED_VALUE);
  const [parsed, setParsed] = useState<ParsedImport>(EMPTY);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) void loadPlan(projectId);
  }, [loadPlan, projectId]);

  /* Stable, so the panels' parse effects fire on an edit rather than on
     every render of this screen. */
  const handleParsed = useCallback((next: ParsedImport) => setParsed(next), []);

  const project = projects.find((p) => p.id === projectId) ?? null;

  if (loaded && !project) {
    return (
      <AppShell title="Import">
        <div className="flex flex-col items-start gap-4 px-8 py-10">
          <SectionEmpty headline="That project isn't here">
            Cases are imported into a project, and this one is no longer on this machine.
          </SectionEmpty>
          <PrimaryButton onClick={() => navigate('/projects')}>Back to projects</PrimaryButton>
        </div>
      </AppShell>
    );
  }

  if (!project || !projectId) {
    return <AppShell title="Import">{<div className="px-8 py-10" />}</AppShell>;
  }

  const areaOptions = [
    { value: UNSORTED_VALUE, label: 'Unsorted' },
    ...[...areas]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((area) => ({ value: area.id, label: area.name })),
  ];

  async function handleImport(): Promise<void> {
    if (!projectId) return;
    const imported = await importCases({
      projectId,
      areaId: areaId === UNSORTED_VALUE ? null : areaId,
      cases: parsed.cases,
    });
    if (imported) navigate(`/projects/${projectId}`);
  }

  function chooseSource(id: ImportSourceId): void {
    clearError();
    setParsed(EMPTY);
    setSource(id);
  }

  return (
    <AppShell title={<Breadcrumb projectId={projectId} name={project.name} />}>
      <div className="mx-auto flex w-full max-w-[780px] flex-col gap-6 px-8 py-7">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-display font-semibold text-ink">Import test cases</h1>
          <p className="text-lead text-quiet">
            Into {project.name}. Everything imported lands in one area, which you can change per
            case afterwards.
          </p>
        </div>

        {source === null ? (
          <ImportSourceList onChoose={chooseSource} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="font-display text-section font-semibold text-ink">
                  {findImportSource(source).title}
                </h2>
                <p className="text-caption text-muted">{findImportSource(source).description}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSource(null);
                  setParsed(EMPTY);
                }}
                className="shrink-0 text-caption text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Choose a different source
              </button>
            </div>

            {source === 'paste' && <PasteImportPanel onParsed={handleParsed} />}
            {source === 'csv' && <CsvImportPanel onParsed={handleParsed} />}

            <ImportPreview parsed={parsed} />

            {lastError && (
              <p role="alert" className="text-label text-danger">
                {describeTestPlanError(lastError)}
              </p>
            )}

            <div className="flex flex-wrap items-end justify-between gap-4 border-t border-hairline pt-5">
              <div className="w-[220px]">
                <SelectField
                  id="import-area"
                  tone="caps"
                  label="Put them in"
                  options={areaOptions}
                  value={areaId}
                  onChange={(event) => setAreaId(event.target.value)}
                />
              </div>
              <PrimaryButton
                size="lg"
                disabled={parsed.cases.length === 0}
                loading={saving}
                onClick={() => void handleImport()}
              >
                {importCountLabel(parsed.cases.length)}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
