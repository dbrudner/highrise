# Highrise desktop app & Steam release

The desktop app is the web build (`../web`) wrapped in Electron, with
[steamworks.js](https://github.com/ceifa/steamworks.js) for Steam features.
Requires Node 22.12+ (`nvm use` picks up `.nvmrc`).

```sh
../build.sh            # rebuild the wasm when Rust changes
npm install
npm start              # run in a window (dev menu has Reload / DevTools)
npm run dist:mac       # → dist/Highrise-0.1.0-arm64.dmg (+ .zip, dist/mac-arm64/Highrise.app)
npm run dist:mac-intel # Intel Macs (or dist:mac-universal for one app that runs on both)
npm run dist:win       # Windows → "dist/Highrise Setup 0.1.0.exe" installer, .zip, dist/win-unpacked/
npm run dist:linux     # Linux / Steam Deck → dist/Highrise-0.1.0.AppImage, dist/linux-unpacked/
npm run dist:all       # all three at once
```

All three build from a Mac with no extra tools (no Wine or Docker). The Windows build is unsigned, so SmartScreen
warns on first run when it's installed outside Steam.

### Steam Deck

The Deck runs the **native Linux build** (`linux-unpacked/`). Things already handled:

- **Full screen** on launch when Steam sets `SteamDeck=1` (or run with `--fullscreen` anywhere).
- **Chromium sandbox** is turned off on Linux (`main.cjs`), because Steam's runtime container can't use
  Electron's setuid helper and the game would fail to start without this.
- **Controls**: full gamepad support through the browser Gamepad API (virtual cursor, D-pad menus, the touchscreen
  works too). In Steamworks → Steam Input, set the default config to **Gamepad** so Steam passes the controller through.
- **1280×800** fits the window minimum (1024×640).

To test on a Deck before you have an App ID, copy `dist/linux-unpacked/` (or the AppImage) over, add `highrise`
as a Non-Steam Game in desktop mode, and launch it from gaming mode.
As a fallback, the Windows build also runs on the Deck under Proton.

`HIGHRISE_SMOKE=/tmp/shot.png dist/mac-arm64/Highrise.app/Contents/MacOS/Highrise`
renders off-screen, saves screenshots and quits — a quick check that a build works.

Saves live in `~/Library/Application Support/Highrise/save.json`
(`%APPDATA%\Highrise\save.json` on Windows, `~/.config/Highrise/save.json` on Linux / Steam Deck).

## Steam integration status

Built and dormant until an App ID is set:

| Feature | How |
| --- | --- |
| Steam init + overlay (Shift+Tab) | `main.cjs`, enabled when `steam.json` has an `appId` (or `STEAM_APP_ID` env) |
| Achievements | game calls `native.unlockAchievement(id)`; IDs below |
| Cloud saves | use Steam **Auto-Cloud** on the save file (no code needed) |
| Relaunch through Steam | `restartAppIfNecessary` in packaged builds |

Try it now with Valve's test app: open Steam, then `STEAM_APP_ID=480 npm start`.
The overlay works; achievements won't (Spacewar doesn't define ours).

## Shipping checklist (things only you can do)

1. **Steamworks account** — sign up at partner.steamgames.com, pay the Steam Direct fee ($100/app), get an **App ID**.
2. Put it in `steam.json`: `{ "appId": 1234560 }`.
3. **Achievements** (Steamworks → Stats & Achievements), API names must match:
   `ACH_GRAND_OPENING`, `ACH_GOING_UP`, `ACH_FIRST_TENANT`, `ACH_STAR_2`, `ACH_STAR_3`,
   `ACH_STAR_4`, `ACH_STAR_5`, `ACH_FOOD_COURT`, `ACH_TYCOON` (each needs 2 icons, 256×256).
4. **Steam Cloud → Auto-Cloud**: root `MacAppSupport` path `Highrise` pattern `save.json`;
   root `WinAppDataRoaming` path `Highrise` pattern `save.json`;
   root `LinuxXdgConfigHome` path `Highrise` pattern `save.json`. Set a byte quota (1 MB is plenty).
   These three roots let one save follow the player between their Mac, PC and Deck.
5. **Depots & launch options**: one depot per OS (macOS, Windows, Linux + SteamOS). Launch `Highrise.app` (macOS),
   `Highrise.exe` (Windows) and `highrise` (Linux). Under Steam Deck compatibility, set controller support to full
   and the default Steam Input config to Gamepad, then request a Deck review.
6. **macOS signing**: Steam expects a signed + notarized app. Join the Apple Developer Program ($99/yr), then in
   `package.json` replace `"identity": null` with your Developer ID and add `"notarize": true`
   (credentials via `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars).
7. **Upload** with SteamCMD: fill the IDs in `steam/*.vdf`, then
   `steamcmd +login <builder_account> +run_app_build $(pwd)/steam/app_build.vdf +quit`.
8. **Store page art**: header capsule 920×430, small 462×174, main 1232×706, vertical 748×896,
   library capsule 600×900, library hero 3840×1240, logo 1280×720, 5+ screenshots at 1920×1080.

## Without Steam

The `.dmg` works standalone. Unsigned builds open fine on the Mac that built them; on other Macs the
user has to right-click → Open the first time (or you sign + notarize as in step 6).
