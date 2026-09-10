import type { LegislationSelection } from "./game/legislationDetails";
import { loadPreferences, savePreferences, applyPreferencesToDocument, type Preferences } from "./preferences";
import { SettingsPanel } from "./ui/SettingsPanel";
import { HelpPanel } from "./ui/HelpPanel";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createGameClient, type GameClient } from './game/client';
import { saveRepository, type SaveMetadata } from './game/storage';
import type { EraChoice, GameView, NewGameOptions } from './game/types';
import { NewGameScreen } from './ui/NewGameScreen';
import { GameScreen } from './ui/GameScreen';

export function App() {
  const [presentation, setPresentation] = useState(loadPreferences);
  useEffect(() => applyPreferencesToDocument(presentation.value), [presentation.value]);
  const changePreferences = useCallback((value: Preferences) => setPresentation(savePreferences(value)), []);
  const client = useRef<GameClient | null>(null);
  const locked = useRef(false);
  const [eras, setEras] = useState<EraChoice[]>([]);
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [screen, setScreen] = useState<'home' | 'new' | 'game' | 'help' | 'settings'>('home');
  const [world, setWorld] = useState<GameView>();
  const slot = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<SaveMetadata | null>(null);
  const search = useCallback((query: string) => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.search(query);
  }, []);
  const loadMarkets = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.markets();
  }, []);
  const loadLegislation = useCallback((selection?: LegislationSelection) => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.legislation(selection);
  }, []);
  const loadWorldOverview = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.worldOverview();
  }, []);
  const loadPolitics = useCallback(() => {
    if (!client.current) return Promise.reject(new Error('Start or load a game first.'));
    return client.current.politics();
  }, []);

  useEffect(() => {
    let worker: GameClient;
    try { worker = createGameClient(); client.current = worker; }
    catch {
      setError('The local game could not start. Reload the app to try again.');
      return;
    }
    let live = true;
    const report = (reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); };
    void worker.choices().then(choices => { if (live) setEras(choices); }).catch(report);
    void saveRepository.list().then(saved => { if (live) setSaves(saved); }).catch(report);
    return () => { live = false; client.current?.dispose(); client.current = null; };
  }, []);

  useEffect(() => {
    if (!pendingDelete) return;
    const id = `delete-cancel-${pendingDelete.slotId}`;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }, [pendingDelete]);

  async function run(operation: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(undefined); setMessage(undefined);
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function replaceWorld(operation: (worker: GameClient) => Promise<GameView>, nextSlot: string) {
    const next = createGameClient();
    try {
      const view = await operation(next);
      client.current?.dispose(); client.current = next;
      setWorld(view); slot.current = nextSlot; setScreen('game');
    } catch (reason) { next.dispose(); throw reason; }
  }
  function start(options: NewGameOptions) {
    void run(async () => {
      await replaceWorld(worker => worker.create({ ...options, seed: options.seed || crypto.randomUUID() }), crypto.randomUUID());
      await save();
    });
  }
  function load(saved: SaveMetadata) {
    void run(async () => {
      const contents = await saveRepository.load(saved.slotId);
      await replaceWorld(worker => worker.load(contents), saved.slotId);
    });
  }
  function importSave(file: File) {
    void run(async () => {
      if (file.size > 256 * 1024 * 1024) throw new Error('This save exceeds the 256 MB limit.');
      const contents = await file.text();
      const nextSlot = crypto.randomUUID();
      await replaceWorld(async worker => {
        const view = await worker.load(contents);
        // Keep the original bytes for interchange; the worker migrates its own copy.
        await saveRepository.save(nextSlot, contents);
        setSaves(await saveRepository.list());
        return view;
      }, nextSlot);
      setMessage('Saved game imported.');
    });
  }
  async function save() {
    if (!client.current || !slot.current) throw new Error('Start or load a game first.');
    const contents = await client.current.serialize(new Date().toISOString());
    await saveRepository.save(slot.current, contents);
    setMessage('Game saved.');
  }

  function requestDelete(saved: SaveMetadata) {
    if (busy) return;
    setError(undefined);
    setMessage(undefined);
    setPendingDelete(saved);
  }
  function cancelDelete() {
    if (busy) return;
    const id = pendingDelete?.slotId;
    setPendingDelete(null);
    if (id) requestAnimationFrame(() => document.getElementById(`delete-request-${id}`)?.focus());
  }
  function confirmDelete() {
    if (!pendingDelete || locked.current) return;
    const target = pendingDelete;
    void run(async () => {
      await saveRepository.delete(target.slotId);
      setSaves(previous => previous.filter(saved => saved.slotId !== target.slotId));
      setPendingDelete(null);
      setMessage('Save deleted.');
      if (slot.current === target.slotId) {
        client.current?.dispose();
        client.current = null;
        slot.current = undefined;
        setWorld(undefined);
        setScreen('home');
      }
    });
  }

  if (screen === 'help' || screen === 'settings') return <main className="ahd-screen"><div className="ahd-container" style={{ maxWidth: '42rem', paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '2rem' }}>
    <button className="ahd-btn" onClick={() => setScreen('home')} autoFocus>Back to home</button>
    {screen === 'help' ? <HelpPanel /> : <SettingsPanel value={presentation.value} onChange={changePreferences} error={presentation.error} />}
  </div></main>;
  if (screen === 'new') return <NewGameScreen eras={eras} busy={busy} error={error} onStart={start} onBack={() => setScreen('home')} />;
  if (screen === 'game' && world) return <GameScreen preferences={presentation.value} onPreferencesChange={changePreferences} preferencesError={presentation.error} loadPolitics={loadPolitics} search={search} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={busy} error={error} message={message}
    onAdvanceTurn={() => void run(async () => { setWorld(await client.current!.advance()); await save(); })}
    onAction={(id, params) => void run(async () => {
      const response = await client.current!.act(id, params); setWorld(response.view);
      if (response.result.ok) { await save(); setMessage(response.result.message); } else setError(response.result.error);
    })}
    onSave={() => void run(save)}
    onExit={() => void run(async () => {
      if (!client.current?.isClosed) await save();
      setScreen('home'); setSaves(await saveRepository.list());
    })} />;
  return <main className="ahd-screen"><div className="ahd-container" style={{ maxWidth: '42rem', paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
    <p className="ahd-eyebrow">Singleplayer</p><h1 className="ahd-h1">A House Divided</h1>
    <p className="ahd-muted">Build your political career. Your world stays on this device.</p>
    {error && <p className="ahd-alert" role="alert">{error}</p>}
    {message && !error && <p className="ahd-notice" role="status">{message}</p>}
    {error && !eras.length && <button className="ahd-btn" onClick={() => window.location.reload()}>Reload app</button>}
    <button className="ahd-btn ahd-btn-primary" disabled={busy || !eras.length} onClick={() => { setError(undefined); setScreen('new'); }}>New game</button>
    <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
      <button className="ahd-btn" onClick={() => setScreen('help')}>Help</button>
      <button className="ahd-btn" onClick={() => setScreen('settings')}>Settings</button>
    </div>
    {world && <button className="ahd-btn" disabled={busy} onClick={() => setScreen('game')}>Return to game</button>}
    <label className="ahd-field" style={{ marginTop: '1rem' }}>
      <span className="ahd-label">Import saved game</span>
      <input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (file) importSave(file);
      }} />
    </label>
    <section aria-label="Saved games" style={{ marginTop: '1.5rem' }}>
      <h2 className="ahd-h2">Saved games</h2>
      {!saves.length && <p className="ahd-muted">Your saved worlds will appear here.</p>}
      {saves.map(saved => {
        const isPending = pendingDelete?.slotId === saved.slotId;
        return <article className="ahd-card ahd-card-pad" key={saved.slotId} style={{ marginTop: '.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{saved.playerName}</h3><p className="ahd-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>{saved.countryId} · Turn {saved.turn} · {new Date(saved.savedAt).toLocaleString()}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
            <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => load(saved)} aria-label={`Continue ${saved.playerName}`}>Continue</button>
            <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" disabled={busy} id={`delete-request-${saved.slotId}`} onClick={() => requestDelete(saved)} aria-label={`Delete ${saved.playerName}`}>Delete</button>
          </div>
          {isPending && (
            <div
              role="dialog"
              aria-labelledby={`delete-title-${saved.slotId}`}
              aria-describedby={`delete-desc-${saved.slotId}`}
              style={{
                marginTop: '0.75rem',
                border: '1px solid var(--ahd-border)',
                borderRadius: 'var(--ahd-radius-sm)',
                background: 'var(--ahd-card-elevated)',
                padding: '0.75rem',
              }}
            >
              <h4 id={`delete-title-${saved.slotId}`} style={{ margin: 0, fontSize: '0.88rem', fontWeight: 750 }}>
                Delete {saved.playerName} · {saved.countryId} Turn {saved.turn}?
              </h4>
              <p id={`delete-desc-${saved.slotId}`} className="ahd-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', lineHeight: 1.5 }}>
                This will permanently delete this saved game. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  id={`delete-cancel-${saved.slotId}`}
                  className="ahd-btn ahd-btn-sm"
                  disabled={busy}
                  onClick={cancelDelete}
                  autoFocus
                >
                  Cancel
                </button>
                <button
                  className="ahd-btn ahd-btn-sm ahd-btn-primary"
                  disabled={busy}
                  onClick={confirmDelete}
                  aria-label={`Confirm delete ${saved.playerName}`}
                >
                  {busy ? <span className="ahd-spinner" aria-hidden /> : null}
                  Confirm delete
                </button>
              </div>
            </div>
          )}
        </article>;
      })}
    </section>
    {busy && <p role="status">Loading your world...</p>}
  </div></main>;
}
