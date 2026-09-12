import type { RoleOption } from '@shared/ipc-contract';

interface RoleCardProps {
  readonly option: RoleOption;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export function RoleCard({ option, selected, onSelect }: RoleCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition ${
        selected ? 'border-accent bg-accent-soft' : 'border-hairline bg-raised hover:border-edge'
      }`}
    >
      <span className="font-display text-card font-bold text-ink">{option.title}</span>
      <span className="text-caption leading-relaxed text-quiet">{option.description}</span>
    </button>
  );
}
