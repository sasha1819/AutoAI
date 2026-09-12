import { useEffect, useId, useMemo, useState } from 'react';
import type { CsvMapping, ParsedImport } from '../lib/importParsing';
import { casesFromCsv, guessCsvMapping, parseCsv } from '../lib/importParsing';
import { SelectField } from './SelectField';

const SEPARATOR_OPTIONS = [
  { value: 'newline', label: 'A new line' },
  { value: 'semicolon', label: 'A semicolon' },
  { value: 'pipe', label: 'A pipe' },
];

interface LoadedFile {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
}

/**
 * A spreadsheet export, read in the renderer.
 *
 * The file arrives through a plain file input rather than through the main
 * process: the browser hands back the bytes the person chose and nothing
 * else, which is a narrower door than a filesystem read channel, and it
 * needs no new IPC surface to audit.
 */
export function CsvImportPanel({
  onParsed,
}: {
  readonly onParsed: (parsed: ParsedImport) => void;
}): JSX.Element {
  const fieldId = useId();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<CsvMapping>({
    nameColumn: 0,
    stepsColumn: 1,
    stepSeparator: 'newline',
  });

  const parsed = useMemo(
    () => (file ? casesFromCsv(file.rows, mapping, hasHeader) : { cases: [], skipped: [] }),
    [file, mapping, hasHeader],
  );

  /* Memoised on the file and the mapping, so re-parsing happens when one
     of those changes rather than on every render. */
  useEffect(() => {
    onParsed(parsed);
  }, [onParsed, parsed]);

  async function handleFile(chosen: File | null): Promise<void> {
    if (!chosen) return;
    setReadError(null);
    try {
      const rows = parseCsv(await chosen.text());
      if (rows.length === 0) {
        setReadError('That file has nothing in it.');
        setFile(null);
        return;
      }
      setFile({ name: chosen.name, rows });
      /* The header row is the only clue about which column is which, so
         the opening guess is made the moment the file lands rather than
         leaving both selects on column one. */
      setMapping(guessCsvMapping(rows[0] ?? []));
    } catch {
      setReadError("That file couldn't be read.");
      setFile(null);
    }
  }

  const header = file?.rows[0] ?? [];
  const columnOptions = header.map((cell, index) => ({
    value: String(index),
    label: hasHeader && cell.trim().length > 0 ? cell.trim() : `Column ${index + 1}`,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${fieldId}-file`}
          className="text-tag font-semibold uppercase tracking-wide text-muted"
        >
          Your file
        </label>
        <input
          id={`${fieldId}-file`}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          className="text-body text-quiet file:mr-3 file:h-control file:cursor-pointer file:rounded-lg file:border file:border-edge file:bg-raised file:px-4 file:text-ui file:text-ink hover:file:border-faint"
        />
        {readError && (
          <p role="alert" className="text-caption text-danger">
            {readError}
          </p>
        )}
      </div>

      {file && (
        <>
          <p className="font-mono text-caption text-muted">
            {file.name} · {file.rows.length} rows
          </p>

          <label className="flex items-center gap-2.5 text-label text-quiet">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(event) => setHasHeader(event.target.checked)}
              className="size-4 accent-accent"
            />
            The first row is a header, not a case
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField
              id={`${fieldId}-name`}
              tone="caps"
              label="Name column"
              options={columnOptions}
              value={String(mapping.nameColumn)}
              onChange={(event) =>
                setMapping((m) => ({ ...m, nameColumn: Number(event.target.value) }))
              }
            />
            <SelectField
              id={`${fieldId}-steps`}
              tone="caps"
              label="Steps column"
              options={columnOptions}
              value={String(mapping.stepsColumn)}
              onChange={(event) =>
                setMapping((m) => ({ ...m, stepsColumn: Number(event.target.value) }))
              }
            />
            <SelectField
              id={`${fieldId}-separator`}
              tone="caps"
              label="Steps are split by"
              options={SEPARATOR_OPTIONS}
              value={mapping.stepSeparator}
              onChange={(event) =>
                setMapping((m) => ({
                  ...m,
                  stepSeparator: event.target.value as CsvMapping['stepSeparator'],
                }))
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
