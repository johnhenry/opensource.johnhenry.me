---
title: "Siri and Shortcuts"
description: "App Intents for the common actions, all off until you turn them on."
sidebar:
  order: 8
---

The SwiftUI app (`apps/mac-swift`, the #115 spike) exposes thirteen Sitefile Desktop actions (eight, plus three for JSX projects since #137, plus two for folder projects since #215) as
App Intents, which Siri, Shortcuts and Spotlight can run. Nothing runs until the user turns it on:
Settings → Siri & Apple Intelligence has one global switch and one switch per tool, all off by
default. The Rune app is gone (#242).

Code: `apps/mac-swift/Sources/SitefileKit/Siri/`:

- `SiriTools.swift`: the catalog, groups and budget
- `ToolAccessPolicy.swift`: the policy
- `SiriRunner.swift`: what each tool does
- `SiriJsx.swift`, `SiriFolders.swift`: the JSX project (#137) and folder project (#215) tools, entities and queries
- `SiriIntents.swift`: the intents, entity, query and App Shortcuts
- `SiriSettingsView.swift`: the Settings page

Tests: `apps/mac-swift/Tests/SitefileKitTests/SiriTests.swift`.

## Verified on this Mac (2026-11-10)

| | |
|---|---|
| Xcode | 27.2 (27B52) |
| macOS SDK | 27.2 |
| macOS running | 27.0 |
| Swift | 6.4.2 (`swift build` uses the Swift Build engine by default) |
| Deployment target | macOS 27 (raised from 14 in #121: the latest system only) |

What the 27.2 SDK's `AppIntents.swiftinterface` has, and what this code uses:

- **Used.** The deployment target is macOS 27, so nothing is behind `if #available`:
  - `AppIntent`, `AppEntity`, `EntityStringQuery`, `AppShortcutsProvider`, `IntentDescription`
  - `IntentAuthenticationPolicy`
  - `requestConfirmation(actionName:dialog:)`, the titled prompt (until #121 it was gated on
    macOS 15, with the plain `requestConfirmation()` on 14)
  - `AppShortcut(intent:phrases:shortTitle:systemImageName:)`
- **Not used.**
  - `@AppIntent(schema:)`: no domain fits (see below).
  - `openAppWhenRun` (deprecated in 26). Its replacement, `supportedModes`, defaults to
    `.background`, which is what every tool wants, so no intent declares it.
  - `CancellableIntent` (26.4) and the `AppIntentError(description:)` initializers (27).
    Errors use `CustomLocalizedStringResourceConvertible` (macOS 13) instead.
- **Not in this SDK.**
  - There is no `@AppIntent(.tool)` form. The model-delegation APIs are underscored or internal.
  - The Siri AI Developer Preview (custom tools for Apple Intelligence) ships in the 27.3 betas,
    which aren't installed here. It's beta-only, and Apple says the APIs may change.
  - Nothing in this code stands in for those APIs. Adopting them goes in `SiriIntents.swift`
    once a 27.3 SDK is installed, behind `if #available` or `@available`. The catalog, policy and
    budget already have the shape a tool list needs.
- **`isDiscoverable` is static, and metadata is extracted at build time.** Intents can't be
  registered or unregistered at runtime. That is why the switches block runs rather than hide
  actions.

### App Schema domains: none adopted

The SDK's `AssistantSchemas` domains are:

- assistant, books, camera, files, journal, mail, photos, presentation, reader, spreadsheet,
  system, visualIntelligence, whiteboard, wordProcessor

None of them models local web servers, images or builds:

- `files` (open, rename, move, delete files) would misdescribe a server as a file.
- `system.search` opens the app into in-app search. That isn't one of these tools; it could be a
  later addition for the Servers page's filter.

Adopting a schema that doesn't fit would give Siri wrong expectations about parameters and
results. So every intent is a plain `AppIntent`.

## Tools and defaults

Every tool is **off** by default, and so is the global switch. A tool runs only when both its
own switch and the global switch are on. Stable IDs are persisted, so they are never renamed; a
test (`testIDsAreUniqueAndStable`) fails on a rename.

| ID | Intent (Shortcuts action) | Group | Parameters → result | Reads / changes | Sensitive | Confirmation | Authentication policy | Availability |
|---|---|---|---|---|---|---|---|---|
| `status` | `GetStatusIntent`, "Get Sitefile Status" | core | none → text (counts and version) + dialog | reads counts and the sitefile version, no names or paths | no | no | `.alwaysAllowed` | macOS 27 |
| `list_servers` | `ListServersIntent`, "List Sitefile Servers" | core | none → `[Sitefile Server]` + dialog | reads names, status, local addresses | **yes** | no | `.requiresAuthentication` | macOS 27 |
| `open_server` | `OpenServerIntent`, "Open Sitefile Server" | servers | Server → dialog | opens a running server in the browser (no store change): its address, or a JSX server's best route (#156) | no | no | `.requiresAuthentication` | macOS 27 |
| `start_server` | `StartServerIntent`, "Start Sitefile Server" | servers | Server → Sitefile Server + dialog | **changes**: starts a stopped server (`RestartServer`, as the window's Start) | no | no | `.requiresAuthentication` | macOS 27 |
| `stop_server` | `StopServerIntent`, "Stop Sitefile Server" | servers | Server → Sitefile Server + dialog | **changes**: stops a running server | no | **yes** (destructive) | `.requiresAuthentication` | macOS 27 |
| `restart_server` | `RestartServerIntent`, "Restart Sitefile Server" | servers | Server → Sitefile Server + dialog | **changes**: restarts (or starts) a server | no | **yes** (destructive) | `.requiresAuthentication` | macOS 27 |
| `list_images` | `ListImagesIntent`, "List Sitefile Images" | images | none → `[text]` (tags) + dialog | reads image tags and whether they're in use | no | no | `.requiresAuthentication` | macOS 27 |
| `list_builds` | `ListBuildsIntent`, "List Recent Sitefile Builds" | builds | none → `[text]` (folder name or tag: status, newest 10) + dialog | reads recent builds; returns folder names, not paths | **yes** | no | `.requiresAuthentication` | macOS 27 |

| `list_jsx_projects` | `ListJsxProjectsIntent`, "List JSX Projects" | jsx | none → `[JSX Project]` + dialog | reads JSX projects' names and capabilities (#157: Build site, Run app, Run gateway, from sfd-local's one detection) | **yes** | no | `.requiresAuthentication` | macOS 27 |
| `serve_jsx_project` | `ServeJsxProjectIntent`, "Serve JSX Project" | jsx | JSX Project → Sitefile Server + dialog | **changes**: starts the project's servable app (or, when that can't run, its hostable gateway: #157's capabilities, the same detection the app and MCP use) with only its saved grants (`ServeJsx`); a capability that isn't installed, needs a compiler or a choice is "can't do that" (the app shows the fix); for a fileable project (#155), serves its newest build's image like any image (`Serve` of its tag, with live reload); with no image yet, "can't do that" | no | no | `.requiresAuthentication` | macOS 27 |
| `build_jsx_project` | `BuildJsxProjectIntent`, "Build JSX Project" | jsx | JSX Project → dialog | **changes**: runs a fileable build (`BuildJsx`, no tag or serve choice) and waits up to 20 s for it: "Built handbook as the image handbook:latest (0123456789ab). You can serve it next." (#155, #159), else "Building handbook." | no | no | `.requiresAuthentication` | macOS 27 |
| `list_folder_projects` | `ListFolderProjectsIntent`, "List Folder Projects" | folders | none → `[Folder Project]` + dialog | reads folder projects' names and whether Save on change is on (#215) | **yes** | no | `.requiresAuthentication` | macOS 27 |
| `set_save_on_change` | `SetSaveOnChangeIntent`, "Set Save on Change" | folders | Folder Project, Save on Change (on or off, default on) → dialog | **changes**: `WatchFolderProject`, as the window's Save on change switch (#208): while on, each change to the folder's files is saved as a new image; remembered with the project. Saving, forgetting and the tag stay the app's | no | no | `.requiresAuthentication` | macOS 27 |

"Server" is the `ServerEntity` (`Sitefile Server`). Its query, `ServerEntityQuery`, implements
`entities(for:)`, `entities(matching:)` and `suggestedEntities()`.

**Authentication.** `status` returns only counts, so it may run on a locked device. Every other
tool returns names or changes state, so it requires an unlocked device
(`.requiresAuthentication`). `.requiresLocalDeviceAuthentication` would add a password or Touch
ID prompt to every run. Stop and restart already ask for confirmation, so that prompt would add
friction without adding safety on a Mac.

**Handlers reuse the backend.** Each intent's `perform()` is one `SiriRunner` call, and each
`SiriRunner` function makes the same sfd-ffi requests the window makes, through
`sfd_call_from` with the origin `{"kind":"siri"}` (#182: `SiriEnvironment` wraps the app's
`Backend` in `SiriOriginBackend`), so the Activity list shows them as Siri & Shortcuts':

- `Status`, `ListServers { all: true }`, `StopServer` and `RestartServer`
- `ListImages` and `ListBuilds`, from the generated Swift `Request`/`Response`
  (`Generated/SfdCore.swift`, #120).
  Rust and `sfd-core` are unchanged.

Nothing duplicates sitefile's logic.

### Groups and budget

The pattern follows erisera-code/jjhub's WebMCP loader (`web/src/mcp/groups.ts`,
`groups.test.ts`):

- **`SiriToolBudget.maxTools = 38`.** Siri and Apple Intelligence were reported to stop
  considering an app's tools somewhere around 40. Apple doesn't document a number, so this is
  unverified. 38 leaves two of headroom, as jjhub's `WEBMCP_MAX_REGISTERED = 20` sits two below
  the ~22 it observed.
- **`maxDescriptionLength = 160`.** Our own cap, not Apple's. `maxAppShortcuts = 10` is Apple's
  documented limit.
- **Groups.** The groups partition the catalog:
  - `core`: status, list_servers. Read-only, and the only group with App Shortcuts phrases.
  - `servers`: open, start, stop, restart
  - `images`: list_images
  - `builds`: list_builds
  - `folders` (#215): list_folder_projects, set_save_on_change. "Folder Project" is
    `FolderProjectEntity` (its ID is the project folder; validated like a JSX project's), resolved
    by `FolderProjectEntityQuery`, which answers only while `set_save_on_change` is allowed. A
    missing folder can't be changed. The tool sends only `WatchFolderProject`; it never saves,
    forgets or retags. 13 tools in all, within the 38.
  - (App Shortcuts phrases stay core-only, as a test requires, so the folder tools are Shortcuts
    actions and Siri-by-name, not phrases.)
  - `jsx` (#137): list_jsx_projects, serve_jsx_project, build_jsx_project. JSX servers are in
    the server list, so the `servers` group's stop and restart cover them. "JSX Project" is
    `JsxProjectEntity` (its ID is the project folder; validated as an absolute path, at most
    1024 bytes), resolved by `JsxProjectEntityQuery`, which answers only while
    `serve_jsx_project` or `build_jsx_project` is allowed. **No tool grants a JSX project
    anything** (network, child processes): only the project's page in the app does; a
    permission denial comes back as "That project needs a permission only you can allow, on
    its page in Sitefile Desktop." with no path. A fileable build makes an image (#155), so
    serving one needs no new tool: Serve JSX Project serves a fileable project's newest image.
    11 tools in all, within the 38.
- **Tests that fail the build** (`SiriToolBudgetTests`) when:
  - the catalog or the intent registry exceeds 38
  - a tool isn't in exactly one group
  - IDs or titles aren't unique, or an ID is renamed
  - a description exceeds the cap
  - a destructive tool doesn't confirm
  - App Shortcuts include a non-core tool, or there are more than 10
- **`bundle.sh` checks the built metadata.** It repeats these checks on the extracted metadata:
  - the metadata's actions equal the `SitefileToolIntent` types
  - there are at most 38 actions
  - App Shortcuts are core intents only, at most 10
- **Runtime budget.** App Intents metadata is static, so jjhub's load/unload can't apply. The
  runtime budget is how many tools the user turns on:
  - Settings shows "N of 38 enabled".
  - `ToolAccessPolicy.setTool` refuses to turn on a tool past the budget, and Settings explains
    why. There's no silent eviction.
  - Turning a tool off always works.
  - With 8 tools, the cap matters only as the catalog grows.
- **App Shortcuts.** Only `status` ("Get status in …", "… status") and `list_servers` ("List
  servers in …", "Show … servers") have phrases.

## The access policy

`ToolAccessPolicy` is the single source of truth:

- **Keys.** The global switch is `siri.enabled`; each tool's switch is `siri.tool.<id>`. A tool
  runs only if both are stored as `true`.
- **Missing preferences mean off.** A tool added in a later version starts off.
- **Unknown IDs are blocked.** This holds even if the store has a `true` for them.
- **The global switch keeps the per-tool choices.** Turning it off writes only `siri.enabled`,
  so turning it back on restores the user's choices.
- **Storage.** Choices are stored in UserDefaults, in the app's own domain
  (`dev.sitefile.desktop.swiftui-spike` when bundled).
  - Intents run in the app's own process: `AppIntent`s compiled into the app, no extension. So
    there's no App Group and no entitlement.
  - Each check reads UserDefaults afresh. A change in Settings applies to the next run, with or
    without a window open, and after relaunch.
  - `main.swift` installs the policy and the backend (`SiriEnvironment`) before any scene, so an
    intent that launches the app finds them with no window.
- **The store is injectable.** `ToolAccessStore` has a UserDefaults implementation and an
  in-memory one for tests.
- **No cross-process observation.** Settings and intents share one process and one UserDefaults
  domain, so there is no observation across processes to build or test. If an App Intents
  extension is ever added, the policy must move to an App Group suite. That's a store swap, and
  the tests would then need to cover the shared suite.

### Enforcement

Every `SiriRunner` function checks the policy first, before any of these:

- a backend read
- parameter work that touches data
- a change
- launching the browser

Then it validates parameters and calls the backend. Before any change it checks the policy again,
and checks for cancellation, right before the one backend call that commits:

- after a confirmation prompt
- after the server lookup

So:

- **Blocked tools.** A blocked tool throws "This action is disabled in Sitefile Desktop's Siri &
  Apple Intelligence settings." The error carries no other data, and the backend is never called
  (tested with a mock).
- **No bypass.** Direct `perform()` calls, saved shortcuts, Spotlight, Siri and Shortcuts all
  reach the same check.
- **Same check for every caller.** The switches apply to every way an intent runs: Siri,
  Shortcuts (including saved and automated shortcuts), Spotlight and App Shortcuts. The 27.2 SDK
  gives `perform()` no reliable way to tell those callers apart, so the app doesn't try.
- **Entity queries.** `ServerEntityQuery` answers only when at least one tool that takes a server
  (`open_server`, `start_server`, `stop_server`, `restart_server`) is allowed. This covers
  `entities(for:)`, `entities(matching:)` and `suggestedEntities()`, so server names can't leak
  through Shortcuts' parameter picker or Siri's disambiguation. A query can't know which intent
  it is resolving for, so "any server tool allowed" is the narrowest rule available.

### Safety

- **Confirmation.** Stop and restart call `requestConfirmation`. A cancelled prompt throws, and
  nothing changes. The policy is checked again after the prompt, in case it was turned off while
  the prompt was showing.
- **Validation.**
  - A malformed server ID (not 1–128 ASCII letters, digits, `-_.`) never reaches the backend.
  - An unknown ID gives "That server no longer exists".
  - A server whose folder is gone can't start or restart.
  - Open needs a running server with an `http(s)` address.
- **Errors.**
  - Backend errors are reported by code only ("couldn't do that (E_HOME)"), because backend
    messages can contain paths.
  - The `status` result leaves out the store's path.
- **Concurrency.** `perform()` is `@MainActor`, the spike's model. Backend calls hop off through
  the bridge's continuations, and the browser opens on the main actor.
- **No logging or telemetry.** Nothing logs parameters or results, and nothing is sent anywhere
  but the local backend.

## Settings

Settings (⌘,) → Siri & Apple Intelligence has:

- the "Enable Siri & Apple Intelligence" switch
- "N of 38 enabled"
- a switch per tool, grouped, with what it reads or changes, plus **Sensitive** and
  **Destructive** badges
- a note that turning a tool off blocks every future run even while Siri or Shortcuts still
  lists it
- availability text: App Intents work on this Mac; the newer Siri tools need the
  27.3 preview and its SDK, which this build doesn't include

Per-tool switches stay visible but disabled while the global switch is off. Each switch has an
accessibility label with its title, description and badges. Strings are SwiftUI literal keys or
`String(localized:)`, the spike's convention.

Snapshots, rendered headlessly by `swift test` (`SnapshotTests.testSiriSettings`, over an
in-memory policy):

- `apps/mac-swift/docs/screenshots/settings-siri-light.png`
- `apps/mac-swift/docs/screenshots/settings-siri-dark.png`

The off-screen window is never key, so "on" switches draw with the inactive (grey) track rather
than the accent.

## Build: App Intents metadata without an Xcode project

Siri, Shortcuts and Spotlight find intents through `Contents/Resources/Metadata.appintents`,
which Xcode's build normally extracts. What happens here:

- **`swift build` alone doesn't produce it.** Checked with a scratch package and with this one.
- **The pieces are already there.** SwiftPM's default build engine (Swift Build) compiles with
  const-value extraction for the AppIntents protocols, writing `*.swiftconstvalues` and a
  `SwiftFileList` per module.
- **`bundle.sh` runs the extraction itself.** It calls the toolchain's own
  `appintentsmetadataprocessor` with the arguments Xcode's `AppIntentsMetadata.xcspec` passes
  (module `SitefileKit`, where the intents live, linked statically into the executable) and
  writes the result into the bundle. Then it checks the output (above).
- **Result.** Verified on this Mac, the built `.app` contains
  `Metadata.appintents/{extract.actionsdata, version.json}` with:
  - 8 actions, each with its title, description, authentication policy and `server` parameter
  - the `ServerEntity` entity and `ServerEntityQuery` query
  - 2 App Shortcuts
- **Why not an Xcode project?** It would mean a second build description to keep in step with
  `Package.swift`. And `xcodebuild` on this Mac prints CoreDevice/CoreSimulator plug-in errors.
  The processor route keeps the build text-only and SwiftPM-only. `swift test` is unaffected.
- **Limitation.** It relies on Swift Build's intermediate layout
  (`.build/out/Intermediates.noindex/…`). With `--build-system native` there are no const values,
  and `bundle.sh` stops with a message.

## Configuration and entitlements

**None.** The changes are:

- no new entitlements
- no App Group
- no Info.plist keys (no `NSSiriUsageDescription`: that is for the SiriKit Intents framework,
  not App Intents)
- no extension

The bundle ID is unchanged; the deployment target is macOS 27 since #121.

**Signing is the one requirement found.** On launch, the app registers with `linkd` (the App
Intents daemon). On this Mac, `linkd` rejected the ad-hoc-signed app's process ("Unable to get
teamId … Rejecting invalid client due to requiresValidatedBundle"). `linkd` did run its bundle
audit when LaunchServices registered the app. So intents need a build signed with a Team ID
(Apple Development or Developer ID) to run. This Mac has no signing identity, so that couldn't
be tried.

## Manual check (needs a Team-ID-signed build)

1. Build: `apps/mac-swift/scripts/build-rust.sh`, then `apps/mac-swift/scripts/bundle.sh
   --skip-rust`. Sign `dist/Sitefile Desktop (SwiftUI spike).app` with an Apple Development
   identity. Launch it once with `SITEFILE_HOME` pointing at a test store.
2. Open Settings (⌘,) → Siri & Apple Intelligence. Turn on **Enable Siri & Apple Intelligence**
   and **Get Sitefile Status**.
3. Run it:
   - In Shortcuts, add "Get Sitefile Status" and run it; the dialog shows the counts.
   - Or say "Sitefile Desktop (SwiftUI spike) status" to Siri.
   - Or find "Sitefile Status" in Spotlight.
4. Turn **Get Sitefile Status** off (or the global switch off).
5. Run the same shortcut or phrase again. It fails with "This action is disabled in Sitefile
   Desktop's Siri & Apple Intelligence settings." The action is still listed.
6. For stop and restart: enable one, run it, cancel the confirmation, and check the server is
   still running.

## Remaining limits

- **Discovery and caching.** Shortcuts, Siri and Spotlight list every intent in the metadata
  whatever the switches say. Disabled tools fail when run instead of disappearing.
  - The system caches the metadata. After changing intents, rebuild and relaunch so
    LaunchServices re-registers the bundle; Shortcuts may need a restart to notice.
  - App Shortcuts phrases for disabled core tools still appear.
- **Background runs.** Intents run in the app's process. If the app isn't running, the system
  launches it, which also opens its window (a SwiftUI `Window` scene). The policy and backend
  don't depend on the window. A windowless launch would need an `NSApplicationDelegate` launch
  policy change, which isn't in this change.
- **Authentication.** `.requiresAuthentication` relies on the system's notion of an unlocked
  device. The app adds no authentication of its own.
- **Indexing.** Servers aren't donated to Spotlight (`IndexedEntity`/Core Spotlight), and there
  are no `AppEntity` types for images or builds. Results are plain text.
- **Not tested end to end.**
  - Siri was not spoken to.
  - Shortcuts' action list wasn't inspected: no screen control, and its database is TCC-protected.
  - The ad-hoc build is rejected by `linkd` at runtime (above).
  - What was verified: the metadata in the bundle, the app building and launching on macOS 27.0
    (live snapshot against a temporary `SITEFILE_HOME`), and `linkd` auditing the bundle on
    registration.
- **Apple Intelligence tools.** These wait for a 27.3 SDK (see above).

## Next steps in dialogs (#159)

Every result that changes something ends with its next step in words, from the same
`sfd_core::next_step` the apps' notices and MCP's "Next:" hints use (`NextStep.spoken`,
`SiriDialogs`): "Started docs. It's ready to open in your browser.", "Stopped docs. You can start
it again any time.", "Built handbook as the image handbook:latest (0123456789ab). You can serve
it next.", and for a failure its fix ("It needs network access: allow it in Sitefile Desktop.").
Never a path, a URL or a tool name; a permission is always the user's to allow, in the app.
