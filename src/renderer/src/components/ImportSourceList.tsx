import type { ImportSource, ImportSourceId } from '../lib/importSources';
import { IMPORT_SOURCES } from '../lib/importSources';
import {
  AppWindowIcon,
  ChartNetworkIcon,
  FileTextIcon,
  FolderIcon,
  ListChecksIcon,
  PencilIcon,
  PlayIcon,
} from './Icons';
import type { IconProps } from './Icons';

const ICONS: Record<ImportSourceId, (props: IconProps) => JSX.Element> = {
  code: FolderIcon,
  jira: ChartNetworkIcon,
  testrail: ListChecksIcon,
  csv: FileTextIcon,
  postman: AppWindowIcon,
  paste: PencilIcon,
  record: PlayIcon,
};

function SourceCard({
  source,
  onChoose,
}: {
  readonly source: ImportSource;
  readonly onChoose: () => void;
}): JSX.Element {
  const Icon = ICONS[source.id];
  const blocked = source.blockedBecause !== null;

  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={blocked}
      aria-describedby={blocked ? `${source.id}-blocked` : undefined}
      className={`flex items-start gap-3.5 rounded-lg border px-4 py-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40 ${
        blocked
          ? 'cursor-not-allowed border-dashed border-edge bg-transparent'
          : 'border-hairline bg-raised hover:border-faint'
      }`}
    >
      <span className={`mt-px shrink-0 ${blocked ? 'text-faint' : 'text-accent-deep'}`}>
        <Icon size={17} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className={`text-card font-medium ${blocked ? 'text-muted' : 'text-ink'}`}>
          {source.title}
        </span>
        <span className="text-caption leading-relaxed text-muted">{source.description}</span>
        {source.blockedBecause && (
          <span id={`${source.id}-blocked`} className="mt-1 text-caption leading-relaxed text-faint">
            {source.blockedBecause}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The source picker from the design. Two of the seven read something
 * AutoAI already has in front of it - a paste and a file - and work. The
 * other five each need a test engine or a connection to another tool, and
 * say which.
 */
export function ImportSourceList({
  onChoose,
}: {
  readonly onChoose: (id: ImportSourceId) => void;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {IMPORT_SOURCES.map((source) => (
        <SourceCard key={source.id} source={source} onChoose={() => onChoose(source.id)} />
      ))}
    </div>
  );
}
