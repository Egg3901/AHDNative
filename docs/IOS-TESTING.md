# Private iPhone testing

The shell is not yet a playable game. No Codemagic build has been run by this implementation session.

## One-time owner setup

1. Use an active Apple Developer Program membership. Keep your Apple account details and signing material out of the public repository.
2. Register the explicit App ID `net.lakesidegames.ahdnative` in Apple Developer Certificates, Identifiers & Profiles. Create an iOS app record in App Store Connect using that bundle ID, name AHDNative, and a unique SKU.
3. In App Store Connect, create a dedicated API key under Users and Access > Integrations > App Store Connect API with App Manager access. Download its `.p8` once. Add it directly to Codemagic Team integrations > Developer Portal under the integration name `ahdnative-app-store`, together with its Key ID and Issuer ID.
4. In Codemagic Code signing identities, upload an existing Apple Distribution certificate including its private key, or generate one through the Apple integration. Add/fetch an App Store provisioning profile for this bundle ID and ensure its certificate matches. The YAML `ios_signing` block selects uploaded matching identities; it does not create them by itself.
5. Keep Codemagic builds and dashboards private. Do not enable public artifact sharing, GitHub artifact publishing, or automatic triggers.
6. Once signing is ready and local checks pass, run `ios-private-testflight` manually on a reviewed commit. It has a 20-minute cap, dependency caches, and no automatic retries. Inspect any failure before spending another build. A first cold build may need tuning; do not repeatedly rerun it unchanged.
7. After Apple processes the upload, open the app's TestFlight tab and resolve export-compliance questions accurately. Create an internal group, add your App Store Connect user and the build, and accept the invitation in the TestFlight app on your iPhone. External testers require a separate distribution decision and may require beta review.

The workflow marks exports for internal testing only. It uploads without automatic external beta review or App Store submission. Apple processing does not require keeping a build machine running.

## Privacy and evidence

Private delivery prevents publishing signing identities through GitHub artifacts. It does not make your Apple developer identity anonymous to Apple or recipients. Use the appropriate existing developer account and inspect what testers can see before expanding distribution.

Keep certificates, profiles, generated Xcode signing settings, IPA files, archives, and signing logs in private services. Public CI checks source without Apple credentials and uploads no native artifacts.

Record each paid build's commit, result, elapsed minutes and remaining allowance in private tracking. Do not claim device validation until the app has actually launched on a phone.

## References

- [Apple: add an app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
- [Apple: internal TestFlight testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [Codemagic: signing identities](https://docs.codemagic.io/yaml-code-signing/signing-ios/)
- [Codemagic: App Store Connect upload](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
- [Tauri: CLI](https://v2.tauri.app/reference/cli/)
