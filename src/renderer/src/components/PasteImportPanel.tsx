import { useEffect, useId, useMemo, useState } from 'react';
import type { ParsedImport } from '../lib/importParsing';
import { parsePastedCases } from '../lib/importParsing';
import { TextAreaField } from './TextAreaField';

const EXAMPLE = `Guest can buy one item
Open the storefront
Add a mug to the cart
Pay with a test card
The order confirmation should name the mug

Promo code applies discount
Add a mug to the cart
Enter promo code SAVE20
The total should drop by 20%`;

/**
 * Paste, in the fixed shape the parser reads.
 *
 * The design has Claude reading cases written any way at all. That needs a
 * model connection, so this asks for one shape instead and shows it. A
 * parser that guessed at free prose would put the wrong line in the name
 * of some cases and nobody would notice until a run used it.
 */
export function PasteImportPanel({
  onParsed,
}: {
  readonly onParsed: (parsed: ParsedImport) => void;
}): JSX.Element {
  const fieldId = useId();
  const [text, setText] = useState('');

  const parsed = useMemo(() => parsePastedCases(text), [text]);

  /* Parse on every keystroke and hand the result up, so the preview and
     the import button below are always describing what is in the box.
     `parsed` is memoised on `text`, so this fires once per edit rather
     than once per render. */
  useEffect(() => {
    onParsed(parsed);
  }, [onParsed, parsed]);

  return (
    <div className="flex flex-col gap-4">
      <TextAreaField
        id={`${fieldId}-paste`}
        label="Your cases"
        rows={14}
        autoFocus
        placeholder={EXAMPLE}
        hint="A blank line starts a new case. The first line names it, every line under it is a step. Bullets and numbers are stripped."
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="button"
        onClick={() => setText(EXAMPLE)}
        className="self-start text-caption text-accent-deep underline-offset-2 outline-none transition hover:text-accent-deep-hover hover:underline focus-visible:underline"
      >
        Fill the box with the example
      </button>
    </div>
  );
}
