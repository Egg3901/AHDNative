import type { RegionsQuery } from "./game/regions";
import type { SearchFilter } from "./game/search";
import type { LegislationSelection } from "./game/legislationDetails";
import { loadPreferences, savePreferences, applyPreferencesToDocument, type Preferences } from "./preferences";
import { SettingsPanel } from "./ui/SettingsPanel";
import { HelpPanel } from "./ui/HelpPanel";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createGameClient, type GameClient } from './game/client';
import { saveRepository, type SaveMetadata } from './game/storage';
import type { CharacterCreation, CreationChoices, EraChoice, GameView, NewGameOptions } from './game/types';
import { newId } from './game/ids';
import { BUILD_LABEL } from './buildIdentity';
import { NewGameScreen } from './ui/NewGameScreen';
import { CharacterCreationScreen } from './ui/CharacterCreationScreen';
import { GameScreen } from './ui/GameScreen';
import { LandingScreen } from './ui/LandingScreen';
import { clearTestHooks, installTestHooks } from './game/testHooks';
import { MpModeScreen } from './ui/MpModeScreen';
import { AskPanel } from './ask/AskPanel';
import { installIosViewport } from './ui/iosViewport';

export function App() {
  const [presentation, setPresentation] = useState(loadPreferences);
  useEffect(() => applyPreferencesToDocument(presentation.value), [presentation.value]);
  // #436 runtime: publish keyboard/visualViewport facts as CSS variables.
  useEffect(() => {
    const viewport = installIosViewport();
    return () => viewport.uninstall();
  }, []);
  const changePreferences = useCallback((value: Preferences) => setPresentation(savePreferences(value)), []);
  const client = useRef<GameClient | null>(null);
  const locked = useRef(false);
  const askReturn = useRef<'home' | 'mp'>('home');
  const [eras, setEras] = useState<EraChoice[]>([]);
  const [saves, setSaves] = useState<SaveMetadata[]>([]);
  const [screen, setScreen] = useState<'home' | 'new' | 'creation' | 'game' | 'help' | 'settings' | 'mp' | 'ask'>(() =>
    new URLSearchParams(window.location.search).get('view') === 'ask' ? 'ask'
      : new URLSearchParams(window.location.search).get('view') === 'mp' ? 'mp' : 'home',
  );
  // #242: world-setup selection held while the player completes the character
  // creation file; the world is not created until both steps are done.
  const [pendingSetup, setPendingSetup] = useState<NewGameOptions | null>(null);
  const [creationChoices, setCreationChoices] = useState<CreationChoices | null>(null);
  const [creationLoading, setCreationLoading] = useState(false);
  const [world, setWorld] = useState<GameView>();
  const slot = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<SaveMetadata | null>(null);
  const loadProfile = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.profile();
  }, []);
  const loadProfileDestination = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.profileDestination();
  }, []);
  const loadImperialProfile = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.imperialProfile();
  }, []);
  const search = useCallback((query: string, filter?: SearchFilter) => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.search(query, filter);
  }, []);
  const loadBondMarket = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.bondMarket();
  }, []);
  const loadRegions = useCallback((query?: RegionsQuery) => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.regions(query);
  }, []);
  const loadCaucusManagement = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.caucusManagement();
  }, []);
  const loadCabinetOffice = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.cabinetOffice();
  }, []);
  const loadPartyManagement = useCallback(() => {
    if (!client.current) return Promise.reject(new Error("Start or load a game first."));
    return client.current.partyManagement();
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
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(undefined); setMessage(undefined);
    try { await operation(); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return false; }
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
    // #242: world setup is step one; the character file is captured next, then
    // the world is created once with both. No world exists until creation ends.
    setError(undefined);
    setPendingSetup(options);
    setCreationChoices(null);
    setCreationLoading(true);
    setScreen('creation');
    void run(async () => {
      const choices = await client.current!.creationChoices(options.era, options.countryId);
      setCreationChoices(choices);
    }).finally(() => setCreationLoading(false));
  }
  function completeCreation(creation: CharacterCreation) {
    if (!pendingSetup) return;
    void run(async () => {
      const options: NewGameOptions = { ...pendingSetup, creation };
      await replaceWorld(worker => worker.create({ ...options, seed: options.seed || newId() }), newId());
      await save();
      setPendingSetup(null);
    });
  }
  function load(saved: SaveMetadata) {
    void run(async () => {
      const contents = await saveRepository.load(saved.slotId);
      await replaceWorld(worker => worker.load(contents), saved.slotId);
    });
  }
  // #506: test-only fixture bootstrap. The player-facing import control is
  // removed; Playwright fixtures enter through `window.__ahdTestHooks`, which
  // is installed only in DEV builds (production builds drop the branch at
  // compile time). Fixtures travel the same native/session path as resume:
  // worker load (deserialize + compatibility migration) then the save store.
  function loadFixtureContents(contents: string) {
    return run(async () => {
      const nextSlot = newId();
      await replaceWorld(async worker => {
        const view = await worker.load(contents);
        // Keep the original bytes for interchange; the worker migrates its own copy.
        await saveRepository.save(nextSlot, contents);
        setSaves(await saveRepository.list());
        return view;
      }, nextSlot);
      setMessage('Saved game loaded.');
    });
  }
  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.VITE_AHD_SMOKE_FIXTURES !== '1') return;
    installTestHooks({ loadFixture: contents => loadFixtureContents(contents).then(() => undefined) });
    return () => clearTestHooks();
  });
  async function save(includeSaveNotice = true) {
    if (!client.current || !slot.current) throw new Error('Start or load a game first.');
    // Prepare the prospective notice without mutating the session. Only
    // acknowledge it after storage succeeds; failed writes never claim success.
    const contents = await client.current.serialize(new Date().toISOString(), includeSaveNotice);
    await saveRepository.save(slot.current, contents);
    if (includeSaveNotice) setWorld(await client.current.recordSaved());
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

  if (screen === 'help' || screen === 'settings') return <main className="ahd-screen"><div className="ahd-container" style={{ maxWidth: '42rem', paddingTop: 'max(1rem, var(--ahd-safe-area-top-fallback, 0px), env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
    <button className="ahd-btn" onClick={() => setScreen('home')} autoFocus>Back to home</button>
    {screen === 'help' ? <HelpPanel /> : <SettingsPanel value={presentation.value} onChange={changePreferences} error={presentation.error} />}
  </div></main>;
  if (screen === 'ask') return <main className="ahd-screen"><div className="ahd-container" style={{ maxWidth: '42rem', paddingTop: 'max(1rem, var(--ahd-safe-area-top-fallback, 0px), env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
    <button className="ahd-btn" onClick={() => setScreen(askReturn.current)} autoFocus>Back</button>
    <div className="ahd-ask-embed" style={{ marginTop: '0.75rem' }}>
      <AskPanel surface="main" onBeforeSignIn={() => { if (world) void run(save); }} />
    </div>
  </div></main>;
  if (screen === 'mp') return <MpModeScreen onAsk={() => { askReturn.current = 'mp'; setScreen('ask'); }} onExit={() => setScreen('home')} />;
  if (screen === 'new') return <NewGameScreen eras={eras} busy={busy} error={error} onStart={start} onBack={() => setScreen('home')} />;
  if (screen === 'creation' && pendingSetup) {
    const era = eras.find((entry) => entry.id === pendingSetup.era);
    const country = era?.countries.find((entry) => entry.id === pendingSetup.countryId);
    return <CharacterCreationScreen
      selection={{
        era: pendingSetup.era,
        countryId: pendingSetup.countryId,
        countryName: country?.name ?? pendingSetup.countryId,
        regionNoun: creationChoices?.regionNoun ?? (pendingSetup.countryId === 'UK' || pendingSetup.countryId === 'JP' ? 'region' : 'state'),
      }}
      regions={country?.regions ?? []}
      initialName={pendingSetup.playerName}
      initialHomeRegionId={pendingSetup.homeRegionId}
      choices={creationChoices}
      loading={creationLoading}
      busy={busy}
      error={error}
      onSubmit={completeCreation}
      onBack={() => { setScreen('new'); setPendingSetup(null); setCreationChoices(null); }}
    />;
  }
  if (screen === 'game' && world) return <GameScreen newsStorageKey={slot.current!} loadProfile={loadProfile} loadProfileDestination={loadProfileDestination} loadImperialProfile={loadImperialProfile} onUpdateProfile={update => run(async () => {
    setWorld(await client.current!.updateProfile(update));
    await save();
    setMessage("Profile saved.");
  })} onSelectConstituency={constituencyId => run(async () => {
    setWorld(await client.current!.selectConstituency(constituencyId));
    await save();
    setMessage("Constituency saved.");
  })} onUpdateWorldFeatureFlags={flags => run(async () => {
    setWorld(await client.current!.updateWorldFeatureFlags(flags));
    await save();
    setMessage("World settings saved.");
  })} preferences={presentation.value} onPreferencesChange={changePreferences} preferencesError={presentation.error} loadPolitics={loadPolitics} search={search} loadBondMarket={loadBondMarket} loadRegions={loadRegions} loadCaucusManagement={loadCaucusManagement} loadCabinetOffice={loadCabinetOffice} onIssueCabinetOrder={(input) => void run(async () => {
      const response = await client.current!.issueCabinetOrder(input); setWorld(response.view);
      if (response.result.ok) { await save(); setMessage(response.result.message); } else setError(response.result.error);
    })} loadPartyManagement={loadPartyManagement} loadMarkets={loadMarkets} loadLegislation={loadLegislation} loadWorldOverview={loadWorldOverview} world={world} busy={busy} error={error} message={message}
    onMarkNotificationRead={(id) => void run(async () => { setWorld(await client.current!.markNotificationRead(id)); await save(false); })}
    onDeleteNotification={(id) => void run(async () => { setWorld(await client.current!.deleteNotification(id)); await save(false); })}
    onMarkAllNotificationsRead={() => void run(async () => { setWorld(await client.current!.markAllNotificationsRead()); await save(false); })}
    onAdvanceTurn={() => void run(async () => { setWorld(await client.current!.advance()); await save(); })}
    onAction={(id, params) => void run(async () => {
      const response = await client.current!.act(id, params); setWorld(response.view);
      if (response.result.ok) { await save(); setMessage(response.result.message); } else setError(response.result.error);
    })}
    onSectorSale={(op, params) => void run(async () => {
      const response = await client.current!.sectorSale(op, params.assetId, params.priceAnchor);
      setWorld(response.view);
      if (response.result.ok) {
        await save();
        setMessage(op === "list" ? "Sector listed for sale." : op === "update" ? "Sale listing updated." : op === "buy" ? "Sector acquired." : "Sector unlisted.");
      } else setError(response.result.error);
    })}
    onSave={() => void run(save)}
    onExit={() => void run(async () => {
      if (!client.current?.isClosed) await save();
      setScreen('home'); setSaves(await saveRepository.list());
    })} />;
  return <LandingScreen
    eras={eras}
    saves={saves}
    worldActive={Boolean(world)}
    busy={busy}
    error={error}
    message={message}
    buildLabel={BUILD_LABEL}
    reducedMotion={presentation.value.reducedMotion}
    pendingDelete={pendingDelete}
    onNew={() => { setError(undefined); setScreen('new'); }}
    onHelp={() => setScreen('help')}
    onSettings={() => setScreen('settings')}
    onReturn={() => setScreen('game')}
    onReload={() => window.location.reload()}
    onLoad={load}
    onRequestDelete={requestDelete}
    onCancelDelete={cancelDelete}
    onConfirmDelete={confirmDelete}
    onEnterMultiplayerNative={() => { setError(undefined); setScreen('mp'); }}
    onAsk={() => { setError(undefined); askReturn.current = 'home'; setScreen('ask'); }}
  />;
}
