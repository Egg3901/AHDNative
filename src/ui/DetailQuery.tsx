import { useEffect, useState, type ReactNode } from 'react';

/** Keep large optional queries out of ordinary action/turn responses. */
export function DetailQuery<T>({ load, revision, label, children, retainOnRevision = false, contextKey }: {
  load: () => Promise<T>; revision: object; label: string; children: (value: T) => ReactNode;
  /** Keep same-save details mounted through a world revision while refreshing. */
  retainOnRevision?: boolean;
  /** Stable identity of the save/character whose detail is being rendered. */
  contextKey?: string;
}) {
  const [loaded, setLoaded] = useState<{ revision: object; load: typeof load; contextKey?: string; data: T }>();
  const [failure, setFailure] = useState<{ revision: object; contextKey?: string; message: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailure(undefined);
    void Promise.resolve().then(load)
      .then(data => { if (active) setLoaded({ revision, load, contextKey, data }); })
      .catch(error => { if (active) setFailure({ revision, contextKey, message: error instanceof Error ? error.message : `${label} could not load.` }); });
    return () => { active = false; };
  }, [load, revision, attempt, label, contextKey]);
  if (failure?.revision === revision && failure.contextKey === contextKey) return <div className="ahd-card ahd-card-pad">
    <p role="alert">{failure.message}</p>
    <button type="button" className="ahd-btn" onClick={() => setAttempt(n => n + 1)}>Retry details</button>
  </div>;
  if (retainOnRevision && contextKey !== undefined && loaded?.load === load && loaded.contextKey === contextKey) return children(loaded.data);
  if (loaded?.revision !== revision || loaded.load !== load || loaded.contextKey !== contextKey) return <p role="status" className="ahd-notice">Loading {label.toLowerCase()}...</p>;
  return children(loaded.data);
}
