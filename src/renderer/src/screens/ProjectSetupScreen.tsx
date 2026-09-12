import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TargetType } from '@shared/ipc-contract';
import { AppShell } from '../components/AppShell';
import { FormField } from '../components/FormField';
import { FolderIcon } from '../components/Icons';
import { PillGroup } from '../components/PillGroup';
import { PrimaryButton } from '../components/PrimaryButton';
import { TransportFailedNotice } from '../components/TransportFailedNotice';
import { describeProjectError } from '../lib/projectErrors';
import { useProjectsStore } from '../state/useProjectsStore';

type Mode = 'local' | 'git';

const TARGET_TYPE_OPTIONS = [
  { value: TargetType.Mobile, label: 'Mobile' },
  { value: TargetType.Web, label: 'Web' },
  { value: TargetType.Desktop, label: 'Desktop' },
  { value: '', label: 'Not sure yet' },
] as const;

/** The last path segment, which is almost always the name someone would
 * have typed anyway. Falls back to the whole path for a root folder. */
function nameFromPath(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/**
 * "Add a project": point AutoAI at a folder already on this Mac, or hand
 * it a git URL to clone. Either way, detection runs server-side the
 * moment the project is created - this screen's target-type picker is an
 * optional, explicit override, not something detection is waiting on.
 */
export function ProjectSetupScreen(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const pickLocalFolder = useProjectsStore((s) => s.pickLocalFolder);
  const addFromLocalPath = useProjectsStore((s) => s.addFromLocalPath);
  const addFromGit = useProjectsStore((s) => s.addFromGit);
  const setOverride = useProjectsStore((s) => s.setOverride);
  const lastError = useProjectsStore((s) => s.lastError);
  const lastErrorDetail = useProjectsStore((s) => s.lastErrorDetail);
  const clearError = useProjectsStore((s) => s.clearError);
  const loading = useProjectsStore((s) => s.loading);
  const transportFailed = useProjectsStore((s) => s.transportFailed);

  /* Overview's "Choose a folder" opens the native picker before it
     navigates, and hands the result over in router state - so arriving
     from there lands on a form that is already filled in rather than on
     an empty one that makes you pick the same folder twice. */
  const pickedPath =
    typeof (location.state as { pickedPath?: unknown } | null)?.pickedPath === 'string'
      ? ((location.state as { pickedPath: string }).pickedPath)
      : '';

  const [mode, setMode] = useState<Mode>('local');
  const [name, setName] = useState(pickedPath ? nameFromPath(pickedPath) : '');
  const [path, setPath] = useState(pickedPath);
  const [gitUrl, setGitUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [targetType, setTargetType] = useState<string>('');

  async function handlePickFolder(): Promise<void> {
    const picked = await pickLocalFolder();
    if (picked === null) return;
    setPath(picked);
    if (name.trim().length === 0) setName(nameFromPath(picked));
  }

  const missing =
    mode === 'local' && !path.trim()
      ? 'a project folder'
      : mode === 'git' && !gitUrl.trim()
        ? 'a repository URL'
        : null;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    clearError();

    const project =
      mode === 'local'
        ? await addFromLocalPath({ path, name: name.trim() || undefined })
        : await addFromGit({ url: gitUrl.trim(), branch: branch.trim() || undefined, name: name.trim() || undefined });

    if (!project) return;
    if (targetType.length > 0) {
      await setOverride(project.id, targetType as TargetType);
    }
    navigate(`/projects/${project.id}`, { replace: true });
  }

  return (
    <AppShell title="Add a project">
      <div className="flex justify-center px-8 py-9">
        <form className="flex w-[460px] max-w-full flex-col gap-6" onSubmit={handleSubmit}>
          <p className="text-lead text-quiet">
            Point AutoAI at a project folder on this machine, or give it a git URL to clone. Nothing
            is copied or uploaded beyond what you ask it to clone.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('local')}
              className={`h-row rounded-md px-3 text-caption font-medium transition ${
                mode === 'local' ? 'bg-ink text-surface' : 'bg-rail text-quiet hover:text-ink'
              }`}
            >
              A folder on this Mac
            </button>
            <button
              type="button"
              onClick={() => setMode('git')}
              className={`h-row rounded-md px-3 text-caption font-medium transition ${
                mode === 'git' ? 'bg-ink text-surface' : 'bg-rail text-quiet hover:text-ink'
              }`}
            >
              From a git repository
            </button>
          </div>

          {mode === 'local' ? (
            <div className="flex flex-col gap-3">
              {/* The folder is typeable, not only pickable. When this was a
                  read-only label fed solely by the native dialog, anyone
                  whose dialog returned nothing had no way to fill the
                  field in. The path is validated in the main process
                  either way, so typing one is no less safe than picking
                  it. */}
              <PrimaryButton type="button" variant="secondary" onClick={() => void handlePickFolder()}>
                <FolderIcon size={14} />
                Choose folder
              </PrimaryButton>

              <FormField
                id="projectPath"
                label="Project folder"
                tone="caps"
                type="text"
                className="font-mono text-caption"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="~/dev/checkout-web"
                spellCheck={false}
                autoComplete="off"
                required
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <FormField
                id="gitUrl"
                label="Repository URL"
                tone="caps"
                type="text"
                className="font-mono text-caption"
                placeholder="https://github.com/org/repo.git"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                required
              />
              <p className="text-caption text-muted">
                A plain https:// URL, or an SSH remote (git@host:org/repo.git) if you have a key set
                up. AutoAI never stores a URL with a password or token embedded in it.
              </p>
              <FormField
                id="branch"
                label="Branch"
                tone="caps"
                type="text"
                placeholder="Defaults to the repository's default branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>
          )}

          <FormField
            id="projectName"
            label="Name"
            tone="caps"
            type="text"
            placeholder={mode === 'git' ? 'Defaults to the repository name' : 'Defaults to the folder name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <PillGroup
            legend="Target type"
            options={TARGET_TYPE_OPTIONS}
            value={targetType}
            onChange={setTargetType}
          />

          {lastError && (
            <p className="text-ui text-danger">
              {describeProjectError(lastError)}
              {lastErrorDetail && <span className="block text-caption text-danger/80">{lastErrorDetail}</span>}
            </p>
          )}
          {transportFailed && <TransportFailedNotice />}
          {missing && <p className="text-ui text-muted">Add {missing} to create the project.</p>}

          <div className="flex gap-2.5">
            <PrimaryButton type="submit" className="flex-1" loading={loading} disabled={missing !== null}>
              Create project
            </PrimaryButton>
            <PrimaryButton
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => navigate('/projects')}
            >
              Cancel
            </PrimaryButton>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
