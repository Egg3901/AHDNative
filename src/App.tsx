import { useEffect, useRef, useState } from 'react';
import { createGameClient, type GameClient } from './game/client';
import { saveRepository, type SaveMetadata } from './game/storage';
import type { EraChoice, GameView, NewGameOptions } from './game/types';
import { NewGameScreen } from './ui/NewGameScreen';
import { GameScreen } from './ui/GameScreen';

export function App() {
  const client = useRef<GameClient | null>(null);
  const locked = useRef(false);
  const [eras, setEras] = useState<EraChoice[]>([]);
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [screen, setScreen] = useState<'home' | 'new' | 'game'>('home');
  const [world, setWorld] = useState<GameView>();
  const slot = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const worker = createGameClient(); client.current = worker;
    let live = true;
    const report = (reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); };
    void worker.choices().then(choices => { if (live) setEras(choices); }).catch(report);
    void saveRepository.list().then(saved => { if (live) setSaves(saved); }).catch(report);
    return () => { live = false; client.current?.dispose(); client.current = null; };
  }, []);

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
    setSaves(await saveRepository.list()); setMessage('Game saved.');
  }

  if (screen === 'new') return <NewGameScreen eras={eras} busy={busy} error={error} onStart={start} onBack={() => setScreen('home')} />;
  if (screen === 'game' && world) return <GameScreen world={world} busy={busy} error={error} message={message}
    onAdvanceTurn={() => void run(async () => { setWorld(await client.current!.advance()); await save(); })}
    onAction={(id, params) => void run(async () => {
      const response = await client.current!.act(id, params); setWorld(response.view);
      if (response.result.ok) { await save(); setMessage(response.result.message); } else setError(response.result.error);
    })}
    onSave={() => void run(save)}
    onExit={() => void run(async () => { if (!client.current?.isClosed) await save(); setScreen('home'); })} />;
  return <main className="ahd-screen"><div className="ahd-container" style={{ maxWidth: '42rem', paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
    <p className="ahd-eyebrow">Singleplayer</p><h1 className="ahd-h1">A House Divided</h1>
    <p className="ahd-muted">Build your political career. Your world stays on this device.</p>
    {error && <p className="ahd-alert" role="alert">{error}</p>}
    <button className="ahd-btn ahd-btn-primary" disabled={busy || !eras.length} onClick={() => { setError(undefined); setScreen('new'); }}>New game</button>
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
      {saves.map(saved => <article className="ahd-card ahd-card-pad" key={saved.slotId} style={{ marginTop: '.75rem' }}>
        <h3>{saved.playerName}</h3><p className="ahd-muted">{saved.countryId} · Turn {saved.turn} · {new Date(saved.savedAt).toLocaleString()}</p>
        <button className="ahd-btn" disabled={busy} onClick={() => load(saved)} aria-label={`Continue ${saved.playerName}`}>Continue</button>
      </article>)}
    </section>
    {busy && <p role="status">Loading your world...</p>}
  </div></main>;
}
