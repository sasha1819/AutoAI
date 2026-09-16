import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AreaRecord } from '@shared/ipc-contract';
import type { AreaCounts, AreaSelection } from '../lib/testPlanDisplay';
import {
  ALL_CASES,
  UNSORTED,
  areaSelection,
  countForArea,
  isSameSelection,
} from '../lib/testPlanDisplay';
import { FileTextIcon, FolderIcon, ListChecksIcon, PencilIcon, PlayIcon, PlusIcon } from './Icons';

const ROW_BASE =
  'group flex h-row w-full items-center gap-2 rounded-lg px-2.5 text-left text-ui outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40';

function Row({
  label,
  count,
  selected,
  onSelect,
  icon,
  onRename,
  onRun,
  runDisabled,
}: {
  readonly label: string;
  readonly count: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly icon?: JSX.Element;
  /** Only real areas can be renamed. "All cases" and "Unsorted" are not
   * folders, so they get no pencil rather than one that refuses. */
  readonly onRename?: () => void;
  /** Only shown when this area actually has at least one runnable
   *  (scripted) case - never a button that would just report NO_SCRIPT. */
  readonly onRun?: () => void;
  readonly runDisabled?: boolean;
}): JSX.Element {
  const hasRowActions = Boolean(onRename) || Boolean(onRun);
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`${ROW_BASE} ${
          selected
            ? 'bg-raised font-medium text-ink shadow-[0_1px_2px_rgba(26,24,21,0.06)]'
            : 'text-quiet hover:bg-raised/60'
        }`}
      >
        {icon && <span className={selected ? 'text-ink' : 'text-muted'}>{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={`font-mono text-meta ${hasRowActions ? 'group-hover:invisible' : ''} text-quiet`}>
          {count}
        </span>
      </button>
      <div className="invisible absolute right-2 flex items-center gap-1 focus-within:visible group-hover:visible">
        {onRun && (
          <button
            type="button"
            onClick={onRun}
            disabled={runDisabled}
            aria-label={`Run every case in ${label}`}
            className="text-muted outline-none transition hover:text-ink focus-visible:visible disabled:pointer-events-none disabled:opacity-50"
          >
            <PlayIcon size={12} />
          </button>
        )}
        {onRename && (
          <button
            type="button"
            onClick={onRename}
            aria-label={`Rename ${label}`}
            className="text-muted outline-none transition hover:text-ink focus-visible:visible"
          >
            <PencilIcon size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** The shared chrome for the two inline text inputs in this rail - adding
 * an area, and renaming one. Both commit on Enter and abandon on Escape,
 * because both sit in a list where a Cancel button would be the widest
 * thing in the column. */
function InlineNameInput({
  label,
  initialValue,
  onCommit,
  onCancel,
}: {
  readonly label: string;
  readonly initialValue: string;
  readonly onCommit: (name: string) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = (): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      onCancel();
      return;
    }
    onCommit(trimmed);
  };

  return (
    <input
      ref={inputRef}
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      className="h-row w-full rounded-lg border border-accent bg-raised px-2.5 text-ui text-ink outline-none ring-1 ring-accent/30"
    />
  );
}

interface AreaRailProps {
  readonly projectId: string;
  readonly areas: readonly AreaRecord[];
  readonly counts: AreaCounts;
  readonly selection: AreaSelection;
  readonly onSelect: (selection: AreaSelection) => void;
  readonly onCreateArea: (name: string) => void;
  readonly onRenameArea: (areaId: string, name: string) => void;
  /** The runnable (scripted) case ids in each area, keyed by area id - an
   *  area with none here gets no Run affordance at all, never one that
   *  would just report back "nothing to run." */
  readonly runnableCaseIdsByArea: Readonly<Record<string, readonly string[]>>;
  readonly onRunArea: (caseIds: readonly string[]) => void;
  /** True for the whole duration of any area's batch run - disables every
   *  Run button so a second batch can't start mid-run. */
  readonly runningArea: boolean;
}

/**
 * The areas column from the design. The design's copy says areas are
 * "proposed from the last exploration" - nothing explores yet, so they are
 * made by hand here, which produces the same folder either way. What the
 * rail does not do is invent a starter set: an empty project has no areas
 * and says so.
 */
export function AreaRail({
  projectId,
  areas,
  counts,
  selection,
  onSelect,
  onCreateArea,
  onRenameArea,
  runnableCaseIdsByArea,
  onRunArea,
  runningArea,
}: AreaRailProps): JSX.Element {
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section aria-labelledby="areas-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2
          id="areas-heading"
          className="font-mono text-nano font-semibold uppercase tracking-wide text-muted"
        >
          Areas
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add an area"
          className="text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <Row
          label="All cases"
          count={counts.total}
          selected={isSameSelection(selection, ALL_CASES)}
          onSelect={() => onSelect(ALL_CASES)}
          icon={<ListChecksIcon size={15} />}
        />

        {sorted.map((area) =>
          renamingId === area.id ? (
            <InlineNameInput
              key={area.id}
              label={`Rename ${area.name}`}
              initialValue={area.name}
              onCommit={(name) => {
                setRenamingId(null);
                if (name !== area.name) onRenameArea(area.id, name);
              }}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <Row
              key={area.id}
              label={area.name}
              count={countForArea(counts, area.id)}
              selected={isSameSelection(selection, areaSelection(area.id))}
              onSelect={() => onSelect(areaSelection(area.id))}
              icon={<FolderIcon size={15} />}
              onRename={() => setRenamingId(area.id)}
              onRun={
                (runnableCaseIdsByArea[area.id]?.length ?? 0) > 0
                  ? () => onRunArea(runnableCaseIdsByArea[area.id] ?? [])
                  : undefined
              }
              runDisabled={runningArea}
            />
          ),
        )}

        {adding && (
          <InlineNameInput
            label="New area name"
            initialValue=""
            onCommit={(name) => {
              setAdding(false);
              onCreateArea(name);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        <Row
          label="Unsorted"
          count={counts.unsorted}
          selected={isSameSelection(selection, UNSORTED)}
          onSelect={() => onSelect(UNSORTED)}
        />
      </div>

      <p className="px-1 text-caption leading-relaxed text-muted">
        {areas.length === 0
          ? 'Areas group cases by part of the app — Checkout, Login, Search. Add one to start sorting.'
          : 'A case with no area stays in Unsorted until you move it.'}
      </p>

      <Link
        to={`/projects/${projectId}/import`}
        className="flex h-control items-center justify-center gap-2 rounded-lg border border-edge bg-raised text-ui text-ink outline-none transition hover:border-faint focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <FileTextIcon size={14} />
        Import test cases
      </Link>
    </section>
  );
}
