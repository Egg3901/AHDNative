# Private iPhone testing

The shell is not yet a playable game. Signing setup is separate from a successful signed build or device test.

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
3. After local checks pass, run `ios-private-testflight` manually on a reviewed commit. It has a 20-minute cap and dependency caches. Review failure logs before retrying; never repeat a failed build unchanged or raise the cap without agreement.
4. After Apple processes the upload, open AHDNative > TestFlight and answer export-compliance questions accurately. Add the build and your App Store Connect user to an internal testing group.
5. Accept the invitation in TestFlight on your iPhone and install. No external beta review or App Store submission is requested by this workflow.

The export is restricted to internal testing. Apple processing does not require keeping a build machine running. Record build commit, result and elapsed minutes in private tracking. Device validation requires an actual phone launch.

## Privacy

Private delivery keeps signing identities out of GitHub artifacts; it does not make the Apple developer identity anonymous to Apple or recipients. Certificates, profiles, generated signing settings, IPA files, archives and signing logs stay private. Public Linux CI has no Apple credentials and uploads no native artifacts.

## References

- [Apple: internal TestFlight testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [Tauri: manual iOS signing](https://v2.tauri.app/distribute/sign/ios/)
- [Codemagic: API-key upload authentication](https://docs.codemagic.io/yaml-publishing/app-store-connect/)
