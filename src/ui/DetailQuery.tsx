import { useEffect, useState, type ReactNode } from 'react';

/** Keep large optional queries out of ordinary action/turn responses. */
export function DetailQuery<T>({ load, revision, label, children }: {
  load: () => Promise<T>; revision: object; label: string; children: (value: T) => ReactNode;
}) {
  const [loaded, setLoaded] = useState<{ revision: object; load: typeof load; data: T }>();
  const [failure, setFailure] = useState<{ revision: object; message: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailure(undefined);
    setLoaded(undefined);
    void Promise.resolve().then(load)
      .then(data => { if (active) setLoaded({ revision, load, data }); })
      .catch(error => { if (active) setFailure({ revision, message: error instanceof Error ? error.message : `${label} could not load.` }); });
    return () => { active = false; };
  }, [load, revision, attempt, label]);
  if (failure?.revision === revision) return <div className="ahd-card ahd-card-pad">
    <p role="alert">{failure.message}</p>
    <button type="button" className="ahd-btn" onClick={() => setAttempt(n => n + 1)}>Retry details</button>
  </div>;
  if (loaded?.revision !== revision || loaded.load !== load) return <p role="status" className="ahd-notice">Loading {label.toLowerCase()}...</p>;
  return children(loaded.data);
}
