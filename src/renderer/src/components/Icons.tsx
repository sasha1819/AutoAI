import type { ReactNode, SVGProps } from 'react';

/**
 * The icon set used by the design (Lucide geometry: 24px box, 2px stroke,
 * round caps, currentColor). They are drawn here rather than imported so
 * the renderer stays dependency-free and every glyph inherits the colour
 * of whatever it sits in - the amber logo badge, a muted field, an
 * accent-coloured tile - without a second asset per colour.
 *
 * Sizes are always explicit at the call site because the design uses the
 * same glyph at several sizes (folder at 14px in a button, 32px in the
 * empty state).
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'children'> {
  readonly size?: number;
}

function Glyph({
  size = 16,
  children,
  ...rest
}: IconProps & { readonly children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The AutoAI mark: a chart axis with three connected nodes - the three
 * engines being orchestrated. */
export function ChartNetworkIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="m13.11 7.664 1.78 2.672" />
      <path d="m14.162 12.788-3.324 1.424" />
      <path d="m20 4-6.06 1.515" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="9" cy="15" r="2" />
    </Glyph>
  );
}

export function SmartphoneIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </Glyph>
  );
}

export function AppWindowIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M10 4v4" />
      <path d="M2 8h20" />
      <path d="M6 4v4" />
    </Glyph>
  );
}

export function MonitorIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </Glyph>
  );
}

export function ShieldCheckIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </Glyph>
  );
}

export function FolderIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Glyph>
  );
}

export function EyeIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  );
}

export function EyeOffIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </Glyph>
  );
}

export function ArrowLeftIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </Glyph>
  );
}

/** Nav: Overview. Four panes - the app at a glance. */
export function LayoutGridIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Glyph>
  );
}

/** Nav: Runs. Filled rather than stroked so it reads at 15px. */
export function PlayIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </Glyph>
  );
}

/** Nav: Reports. */
export function FileTextIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </Glyph>
  );
}

export function SettingsIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Glyph>
  );
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
  return (
    <Glyph strokeWidth={2.5} {...props}>
      <path d="m6 9 6 6 6-6" />
    </Glyph>
  );
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Glyph strokeWidth={3} {...props}>
      <path d="m5 12 5 5L20 7" />
    </Glyph>
  );
}

export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Glyph>
  );
}

export function PencilIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z" />
      <path d="m15 5 4 4" />
    </Glyph>
  );
}

export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Glyph>
  );
}

/** The "Ask AutoAI" trigger in AppShell's top bar. */
export function MessageCircleIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </Glyph>
  );
}

export function XIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Glyph>
  );
}

export function ListChecksIcon(props: IconProps): JSX.Element {
  return (
    <Glyph {...props}>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </Glyph>
  );
}
