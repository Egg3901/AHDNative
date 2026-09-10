# Offline help and presentation settings

This slice adds a self-contained Help page and device-local presentation settings for the Native singleplayer app. It does not add account controls, mechanic controls, online help links, or a native release claim.

## Help content boundary

`src/ui/HelpPanel.tsx` describes behavior that is present in the local app:

- The new-game form chooses an era, a playable country, a player name, and an optional repeatable seed.
- The Character tab exposes the action catalog and the amount, party, and region fields supplied by each action.
- Successful actions and turns are saved by `src/App.tsx`; rejected actions stay out of the committed session state.
- Parties, candidacy, elections, legislature, news, banking, portfolio, and market views use actual game data. Larger directory queries are loaded only while visible.
- The home save browser supports continue, import, confirmed deletion, and visible errors.
- Failed imports are loaded into a replacement session, so an error leaves the current session open.

The page names current gaps from the navigation audit without sending players to a network resource. Multiplayer accounts and live server play remain outside the offline app. Corporation management, unions, notifications, maps, country switching, regional legislative actions, and several advanced country systems remain unavailable. The app includes stock-market browsing and trades in the player cash currency, bill details with tax-rate proposals, and region/nation browsing.

The content was checked against these local sources and the read-only AHDGame baseline:

- Native flow: `src/App.tsx`, `src/game/session.ts`, `src/game/client.ts`, `src/game/storage.ts`, `src/ui/GameScreen.tsx`, `src/ui/NewGameScreen.tsx`, `src/ui/FinancePanel.tsx`, and `src/ui/LegislaturePanel.tsx`.
- Native parity inventory: `docs/NAVIGATION-PARITY.md`.
- AHDGame help menu: `src/components/HelpDropdown.tsx`.
- AHDGame appearance baseline: `src/app/settings/components/AppearanceSection.tsx` and `src/lib/browserPreferences.ts`.

## Preference contract

`src/preferences.ts` exports:

```ts
type TextSize = "standard" | "large";
type ReducedMotion = "system" | "on" | "off";

interface Preferences {
  textSize: TextSize;
  reducedMotion: ReducedMotion;
}

interface PreferenceResult {
  value: Preferences;
  error: string | null;
}
```

`DEFAULT_PREFERENCES` is `{ textSize: "standard", reducedMotion: "system" }`. `parsePreferences` accepts an unknown value or stored JSON and replaces invalid fields with defaults.

`loadPreferences(storage?)` reads `ahdnative-preferences-v1`. `savePreferences(value, storage?)` writes the normalized value. The optional `PreferenceStorage` argument is useful for tests and alternate device stores. When it is omitted, the module reads `window.localStorage` only inside the function. Missing storage, blocked storage, and storage exceptions return defaults or the normalized current value with a readable error. They never throw from the preference boundary.

`applyPreferencesToDocument(preferences, target?)` writes `data-text-size` and `data-reduced-motion` through `document.documentElement.dataset`. It does nothing when no document exists. The app shell should provide the matching CSS, including the system `prefers-reduced-motion` rule.

## Integration requirements

The root app should load preferences once at the app boundary, keep the returned `value` in state, and surface the returned `error` in `SettingsPanel`:

```tsx
const [loaded] = useState(() => loadPreferences());
const [preferences, setPreferences] = useState(loaded.value);
const [preferencesError, setPreferencesError] = useState(loaded.error);

useEffect(() => {
  applyPreferencesToDocument(preferences);
}, [preferences]);

function changePreferences(next: Preferences) {
  const saved = savePreferences(next);
  setPreferences(saved.value);
  setPreferencesError(saved.error);
}

<SettingsPanel value={preferences} onChange={changePreferences} error={preferencesError} />
```

`SettingsPanel` owns no storage and changes no game state. Its `onChange` callback receives a fresh complete `Preferences` object for every radio choice. Route and menu ownership stays with the root app.

## Validation

Focused checks for this slice:

```text
npm test -- src/preferences.test.ts
npm run test:ui -- src/ui/HelpPanel.test.tsx src/ui/SettingsPanel.test.tsx
```

The preference tests cover malformed values, normalization, successful round trips, missing storage, throwing storage, and document attributes. The UI tests cover offline help content, the no-link boundary, selected settings, user changes, and visible persistence errors. Full build and suite checks belong to the root integration batch.
