import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Project } from '@shared/ipc-contract';
import { AppShell } from '../components/AppShell';
import { AreaRail } from '../components/AreaRail';
import { CaseChatCard } from '../components/CaseChatCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetectionSummary } from '../components/DetectionSummary';
import { FolderIcon, TrashIcon } from '../components/Icons';
import { NewCaseForm } from '../components/NewCaseForm';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProjectScanCard } from '../components/ProjectScanCard';
import { ProjectSetupCard } from '../components/ProjectSetupCard';
import { SectionEmpty } from '../components/SectionEmpty';
import { TargetTypeSelect } from '../components/TargetTypeSelect';
import { TestCaseDetail } from '../components/TestCaseDetail';
import { TestCaseList } from '../components/TestCaseList';
import { TransportFailedNotice } from '../components/TransportFailedNotice';
import { relativeTime } from '../lib/projectDisplay';
import type { AreaSelection } from '../lib/testPlanDisplay';
import {
  ALL_CASES,
  caseCountLabel,
  casesInSelection,
  countCases,
  selectionTitle,
} from '../lib/testPlanDisplay';
import { describeTestPlanError } from '../lib/testPlanErrors';
import { useProjectsStore } from '../state/useProjectsStore';
import { useRunStore } from '../state/useRunStore';
import { useTestPlanStore } from '../state/useTestPlanStore';

/** The top bar for a project page: the design's breadcrumb, with the
 * first crumb a real link back to the list. */
function Breadcrumb({ name }: { readonly name: string }): JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link
        to="/projects"
        className="shrink-0 text-muted transition hover:text-ink focus-visible:text-ink"
      >
        Projects
      </Link>
      <span className="shrink-0 text-faint" aria-hidden="true">
        /
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * The design puts a run summary strip here - "Run 41 finished 12 minutes
 * ago, 6 passed, 1 failed". Shows the most recent of this project's runs
 * once at least one exists (including ones produced by AreaRail's batch
 * "Run" action, which are just individual runs in sequence, not a separate
 * kind of result), and the same honest empty sentence as before otherwise.
 */
function RunStrip({ project }: { readonly project: Project }): JSX.Element {
  const runsByCase = useRunStore((s) => s.runsByCase);
  const loadForProject = useRunStore((s) => s.loadForProject);

  useEffect(() => {
    void loadForProject(project.id);
  }, [loadForProject, project.id]);

  const runs = Object.values(runsByCase);
  const latest = runs.length > 0 ? runs.reduce((a, b) => (a.finishedAt > b.finishedAt ? a : b)) : null;

  if (!latest) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-hairline bg-raised px-5 py-4">
        <span className="flex h-pill shrink-0 items-center rounded-full border border-edge px-3 text-caption text-muted">
          No runs
        </span>
        <p className="min-w-0 text-label text-quiet">
          AutoAI hasn&apos;t run a test case in this project yet. Open a runnable case and press Run.
        </p>
      </div>
    );
  }

  const passed = latest.steps.filter((step) => step.status === 'passed').length;
  const failed = latest.steps.filter((step) => step.status === 'failed').length;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-hairline bg-raised px-5 py-4">
      <span
        className={`flex h-pill shrink-0 items-center rounded-full border px-3 text-caption font-semibold uppercase tracking-wide ${
          latest.status === 'passed' ? 'border-ok/40 text-ok' : 'border-danger/40 text-danger'
        }`}
      >
        {latest.status === 'passed' ? 'Passed' : 'Failed'}
      </span>
      <p className="min-w-0 flex-1 truncate text-label text-quiet">
        {latest.caseName} finished {relativeTime(latest.finishedAt, Date.now())} — {passed} passed
        {failed > 0 ? `, ${failed} failed` : ''}.
      </p>
    </div>
  );
}

/** Saved on blur/enter, not on every keystroke - see ProjectService.setBaseUrl.
 *  An empty string is stored as null (no base URL set), the same convention
 *  as clearing the target-type override. */
function ProjectUrlField({ project }: { readonly project: Project }): JSX.Element {
  const setBaseUrl = useProjectsStore((s) => s.setBaseUrl);
  const [value, setValue] = useState(project.baseUrl ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(project.baseUrl ?? '');
  }, [project.id, project.baseUrl]);

  async function commit(): Promise<void> {
    const trimmed = value.trim();
    if (trimmed === (project.baseUrl ?? '')) return;
    setSaving(true);
    await setBaseUrl(project.id, trimmed.length > 0 ? trimmed : null);
    setSaving(false);
  }

  return (
    <input
      type="text"
      aria-label={`Project URL for ${project.name}`}
      placeholder="Project URL, e.g. http://localhost:8080"
      value={value}
      disabled={saving}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="h-pill w-64 shrink-0 rounded-full border border-edge bg-raised px-3 text-meta text-quiet outline-none transition placeholder:text-faint focus:border-accent disabled:opacity-50"
    />
  );
}

/** "Not set · Choose folder" or the path with "Change"/"Clear", reusing the
 *  existing native folder picker - same channel AddProject already uses. */
function TestCaseFolderRow({ project }: { readonly project: Project }): JSX.Element {
  const pickLocalFolder = useProjectsStore((s) => s.pickLocalFolder);
  const setTestCaseFolder = useProjectsStore((s) => s.setTestCaseFolder);
  const [saving, setSaving] = useState(false);

  async function handleChoose(): Promise<void> {
    const path = await pickLocalFolder();
    if (!path) return;
    setSaving(true);
    await setTestCaseFolder(project.id, path);
    setSaving(false);
  }

  async function handleClear(): Promise<void> {
    setSaving(true);
    await setTestCaseFolder(project.id, null);
    setSaving(false);
  }

  return (
    <div className="flex shrink-0 items-center gap-2 text-caption text-quiet">
      <FolderIcon size={13} className="shrink-0 text-faint" />
      {project.testCaseFolderPath ? (
        <>
          <span className="max-w-[220px] truncate font-mono" title={project.testCaseFolderPath}>
            {project.testCaseFolderPath}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleChoose()}
            className="text-muted underline underline-offset-2 transition hover:text-ink disabled:opacity-50"
          >
            Change
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleClear()}
            className="text-muted underline underline-offset-2 transition hover:text-ink disabled:opacity-50"
          >
            Clear
          </button>
        </>
      ) : (
        <>
          <span>Test case folder: not set</span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleChoose()}
            className="text-accent-deep underline underline-offset-2 transition hover:text-accent-deep-hover disabled:opacity-50"
          >
            Choose folder
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The working half of a project page: areas down the left, the cases in
 * whichever area is selected, and the selected case beside them. Selection
 * lives here rather than in the store because it is about this screen
 * rather than about the data - reopening the project should not restore
 * whatever row happened to be highlighted last time.
 */
function ProjectBody({ project }: { readonly project: Project }): JSX.Element {
  const navigate = useNavigate();
  const removeProject = useProjectsStore((s) => s.remove);
  const removing = useProjectsStore((s) => s.loading);
  const areas = useTestPlanStore((s) => s.areas);
  const cases = useTestPlanStore((s) => s.cases);
  const saving = useTestPlanStore((s) => s.saving);
  const lastError = useTestPlanStore((s) => s.lastError);
  const loadPlan = useTestPlanStore((s) => s.load);
  const createArea = useTestPlanStore((s) => s.createArea);
  const renameArea = useTestPlanStore((s) => s.renameArea);
  const createCase = useTestPlanStore((s) => s.createCase);
  const moveCase = useTestPlanStore((s) => s.moveCase);
  const deleteCase = useTestPlanStore((s) => s.deleteCase);
  const clearError = useTestPlanStore((s) => s.clearError);
  const runArea = useRunStore((s) => s.runArea);
  const runningArea = useRunStore((s) => s.runningArea);

  const [selection, setSelection] = useState<AreaSelection>(ALL_CASES);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    void loadPlan(project.id);
  }, [loadPlan, project.id]);

  const counts = useMemo(() => countCases(cases), [cases]);
  const visible = useMemo(() => casesInSelection(cases, selection), [cases, selection]);

  /* Which cases AreaRail's per-area Run button would actually run - only
     ever the scripted ones, grouped by area, never "Unsorted" or "All
     cases" (batch running stays scoped to real areas, per the plan). */
  const runnableCaseIdsByArea = useMemo(() => {
    const byArea: Record<string, string[]> = {};
    for (const testCase of cases) {
      if (!testCase.script || testCase.script.length === 0) continue;
      if (!testCase.areaId) continue;
      (byArea[testCase.areaId] ??= []).push(testCase.id);
    }
    return byArea;
  }, [cases]);

  /* A case stays open only while it is still in front of the reader. Move
     it to another area, or delete it, and the panel beside a list that no
     longer contains it would be describing something off-screen. */
  const selectedCase = visible.find((testCase) => testCase.id === selectedCaseId) ?? null;

  function handleSelectArea(next: AreaSelection): void {
    setSelection(next);
    setSelectedCaseId(null);
  }

  async function handleCreateCase(input: {
    name: string;
    areaId: string | null;
    steps: string[];
  }): Promise<void> {
    const created = await createCase({ projectId: project.id, ...input });
    if (created) {
      setComposing(false);
      setSelectedCaseId(created.id);
    }
  }

  async function handleDeleteCase(caseId: string): Promise<void> {
    const deleted = await deleteCase(caseId);
    if (deleted) setSelectedCaseId(null);
  }

  /* A case created from a suggested flow lands in Unsorted, so the list has
     to be pointed at "all cases" (not whatever area filter was active) for
     the newly-selected case to actually be visible - otherwise the panel
     would claim to show something the list beside it has filtered out. */
  function handleScanCaseCreated(caseId: string): void {
    setSelection(ALL_CASES);
    setSelectedCaseId(caseId);
  }

  async function handleDeleteProject(): Promise<void> {
    const deleted = await removeProject(project.id);
    /* Only leave once main says it is gone. On a refusal the dialog closes
       and the projects store has the error, which the list renders - the
       one thing that must not happen is landing on a list that still
       shows the project this screen just claimed to delete. */
    setConfirmingDelete(false);
    if (deleted) navigate('/projects');
  }

  /* The area the new case should land in: whichever one the list is
     pointed at, and Unsorted for the two rows that aren't areas. */
  const composeAreaId = selection.kind === 'area' ? selection.areaId : null;

  return (
    <div className="flex flex-col gap-6 px-8 py-7">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-5">
        <span
          className="min-w-0 flex-1 truncate font-mono text-caption text-quiet"
          title={project.localPath}
        >
          {project.localPath}
        </span>
        <TargetTypeSelect project={project} />
        <ProjectUrlField project={project} />
        <TestCaseFolderRow project={project} />
        <span className="shrink-0 text-caption text-faint">
          added {relativeTime(project.createdAt, Date.now())}
        </span>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="flex shrink-0 items-center gap-1.5 text-caption text-muted outline-none transition hover:text-danger focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <TrashIcon size={13} />
          Delete project
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${project.name}?`}
        confirmLabel="Delete project"
        cancelLabel="Keep it"
        destructive
        busy={removing}
        onConfirm={() => void handleDeleteProject()}
        onCancel={() => setConfirmingDelete(false)}
      >
        <p>
          AutoAI will forget this project along with{' '}
          {counts.total === 0 ? 'the areas in it' : `its ${caseCountLabel(counts.total).toLowerCase()} and every area`}
          . That cannot be undone.
        </p>
        <p className="mt-3 text-caption text-muted">
          The folder on disk is not touched. AutoAI was only remembering where it is.
        </p>
      </ConfirmDialog>

      <RunStrip project={project} />

      <DetectionSummary project={project} />

      <ProjectScanCard project={project} onCaseCreated={handleScanCaseCreated} />

      <ProjectSetupCard project={project} />

      <CaseChatCard project={project} onCaseCreated={handleScanCaseCreated} />

      {lastError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-5 py-3.5"
        >
          <p className="text-label text-quiet">{describeTestPlanError(lastError)}</p>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 text-caption text-muted transition hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        <AreaRail
          projectId={project.id}
          areas={areas}
          counts={counts}
          selection={selection}
          onSelect={handleSelectArea}
          onCreateArea={(name) => void createArea(project.id, name)}
          onRenameArea={(areaId, name) => void renameArea(areaId, name)}
          runnableCaseIdsByArea={runnableCaseIdsByArea}
          onRunArea={(caseIds) => void runArea(caseIds)}
          runningArea={runningArea}
        />

        <TestCaseList
          title={selectionTitle(areas, selection)}
          cases={visible}
          selectedCaseId={selectedCase?.id ?? null}
          onSelect={setSelectedCaseId}
          onNew={() => {
            clearError();
            setComposing(true);
          }}
          composing={composing}
        >
          {composing && (
            <NewCaseForm
              areas={areas}
              defaultAreaId={composeAreaId}
              saving={saving}
              error={lastError ? describeTestPlanError(lastError) : null}
              onSubmit={(input) => void handleCreateCase(input)}
              onCancel={() => {
                clearError();
                setComposing(false);
              }}
            />
          )}
        </TestCaseList>

        {selectedCase && (
          <div className="lg:col-span-2 xl:col-span-1">
            <TestCaseDetail
              testCase={selectedCase}
              areas={areas}
              project={project}
              saving={saving}
              onMove={(areaId) => void moveCase(selectedCase.id, areaId)}
              onDelete={() => void handleDeleteCase(selectedCase.id)}
              onClose={() => setSelectedCaseId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function NotFound(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-start gap-4 px-8 py-10">
      <SectionEmpty headline="That project isn't here">
        It may have been removed, or the link may be out of date. The Projects list has everything
        AutoAI currently knows about.
      </SectionEmpty>
      <PrimaryButton onClick={() => navigate('/projects')}>Back to projects</PrimaryButton>
    </div>
  );
}

export function ProjectScreen(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const projects = useProjectsStore((s) => s.projects);
  const loaded = useProjectsStore((s) => s.loaded);
  const transportFailed = useProjectsStore((s) => s.transportFailed);
  const loadProjects = useProjectsStore((s) => s.load);

  /* The list is the only source of project data - there is no
     `project:get` channel - so a page opened straight from a URL (a
     reload, a Recent link after a restart) has to make sure it has been
     fetched at least once before deciding the project doesn't exist. */
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const project = projects.find((p) => p.id === projectId) ?? null;

  return (
    <AppShell title={<Breadcrumb name={project?.name ?? 'Project'} />}>
      {transportFailed && (
        <div className="px-8 pt-7">
          <TransportFailedNotice />
        </div>
      )}
      {loaded && (project ? <ProjectBody project={project} /> : <NotFound />)}
    </AppShell>
  );
}
