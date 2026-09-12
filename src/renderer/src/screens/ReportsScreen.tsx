import { AppShell } from '../components/AppShell';
import { SectionEmpty } from '../components/SectionEmpty';

/** The other half of the honest-empty pair with Runs: a report is what a
 * finished run leaves behind, so there cannot be one before there has been
 * a run. */
export function ReportsScreen(): JSX.Element {
  return (
    <AppShell title="Reports">
      <div className="flex flex-col gap-6 px-8 py-7">
        <SectionEmpty headline="No reports yet">
          A report is what a finished run leaves behind — what passed, what failed, and what AutoAI
          saw at the moment it failed. Nothing has run on this machine, so there is nothing to read.
        </SectionEmpty>
      </div>
    </AppShell>
  );
}
