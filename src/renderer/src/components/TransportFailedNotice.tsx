/**
 * Shown when an IPC call rejected rather than returning a failure - the
 * handler threw, or the channel was never registered. That second case is
 * the classic symptom of main and preload not having been restarted after
 * a contract change, which a refresh does not fix, so the notice says so
 * instead of blaming whoever is reading it.
 */
export function TransportFailedNotice(): JSX.Element {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-ui text-danger">
      Couldn&apos;t reach AutoAI&apos;s background process. If you just updated the app, restart it
      &mdash; a refresh isn&apos;t enough.
    </div>
  );
}
