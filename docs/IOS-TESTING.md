# Private iPhone testing

The app has an integrated local SP loop. Its first private feedback preview is authorized after local checks, with the remaining mechanics and save gaps recorded. A successful signed build and actual phone validation still require separate evidence.

## Private feedback preview

Prepare the development-version preview for owner feedback after passing TDD and real integrated smoke-test evidence. This is not a 1.0.0 release. A shell-only signing test is not an eligible candidate. The readiness record must show the playable SP loop, deterministic replay, save/reload and failure handling, supported content coverage, and comparison against the actual MP/SP interface.

Local evidence is the prerequisite for the first paid build. Phone-specific lifecycle and performance checks follow that build and remain required before release. The first candidate is for review, not automatic release.

## Signing configuration

The workflow uses the app-scoped encrypted Codemagic variable group `ahdnative-signing`. The current configuration does not require a named Developer Portal integration or a manual Code signing identities upload.

Required encrypted variables:

- `IOS_CERTIFICATE`: base64 PKCS#12 distribution certificate including its private key.
- `IOS_CERTIFICATE_PASSWORD`: the PKCS#12 password.
- `IOS_MOBILE_PROVISION`: base64 App Store provisioning profile matching the certificate and `net.lakesidegames.ahdnative`.
- `TAURI_APPLE_DEVELOPMENT_TEAM`: Apple developer team identifier.
- `APP_STORE_CONNECT_PRIVATE_KEY`: App Store Connect API private key in PEM format.
- `APP_STORE_CONNECT_KEY_IDENTIFIER`: matching API key ID.
- `APP_STORE_CONNECT_ISSUER_ID`: matching team issuer ID.

Tauri imports the certificate and profile during signing. Codemagic uses the API variables for uploading to App Store Connect. Every value must remain encrypted and outside this repository; never print the environment or expose signing material to subagents.

## First phone test

1. Confirm the app record and explicit bundle ID exist in Apple Developer and App Store Connect, and all seven signing variables are configured in the app-scoped group.
2. Keep Codemagic dashboards and artifacts private. Disable public sharing and automatic build triggers.
3. After local checks pass, run `ios-private-testflight` manually with `AHD_REVIEW_COMMIT` set to the full reviewed Git commit, using a branch or tag pointing to that commit. It has a 20-minute cap and dependency caches. Review failure logs before retrying; never repeat a failed build unchanged or raise the cap without agreement.
4. After Apple processes the upload, open AHDNative > TestFlight and answer export-compliance questions accurately. Add the build and your App Store Connect user to an internal testing group.
5. Accept the invitation in TestFlight on your iPhone and install. No external beta review or App Store submission is requested by this workflow.

The export is restricted to internal testing. Apple processing does not require keeping a build machine running. Record build commit, result and elapsed minutes in private tracking. Device validation requires an actual phone launch.

## Privacy

Private delivery keeps signing identities out of GitHub artifacts; it does not make the Apple developer identity anonymous to Apple or recipients. Certificates, profiles, generated signing settings, IPA files, archives and signing logs stay private. Public Linux CI has no Apple credentials and uploads no native artifacts.

## References

- [Apple: internal TestFlight testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [Tauri: manual iOS signing](https://v2.tauri.app/distribute/sign/ios/)
- [Codemagic: API-key upload authentication](https://docs.codemagic.io/yaml-publishing/app-store-connect/)

## Build allocation

Codemagic is iOS only. Its workflow installs locked dependencies, validates the bundled rules and builds the frontend once through Tauri. Run the app, engine, UI and browser checks locally or in ordinary verification CI before starting it; do not repeat that suite on the paid Mac. Xcode is pinned to 26.6. The preview targets iOS 16.4 or newer, matching its explicit Safari build target and modern web APIs such as structured cloning. Windows and Android review builds use separate local routes.

The offline preview implements no non-exempt encryption. `Info.ios.plist` records that fact for App Store Connect; re-evaluate it when adding networking, authentication or encrypted saves. See [Apple export-compliance keys](https://help.apple.com/xcode/mac/current/en.lproj/dev0dc15d044.html).

The Mac image does not preinstall `rustup`. The workflow bootstraps it from the official Rust installer when absent, installs the pinned toolchain and records the Cargo binary path for later steps. The first attempt failed at this prerequisite before compilation or signing; inspect a failed step before retrying.

The marketing version stays `0.1.0`. The iOS bundle version has base `1`; Tauri appends Codemagic's build number, producing `1.N` instead of appending a fourth numeric component to `0.1.0`.
