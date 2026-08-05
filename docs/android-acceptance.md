# Master Android Acceptance Gate

This gate covers the first Android self-hosted release: a signed or debug APK
that loads Master through Capacitor and persists workspace data through the
server-side SQLite/API path.

## Scope

- Android application shell with package ID `com.master.time`.
- Hosted UI and the self-hosted SQLite/API remain the source of truth for V1.
- Android gets a random installation identity for workspace persistence.
- V1 is online-first. It does not claim offline editing or background AI
  generation.

## Release gates

| ID | Gate | Pass condition | Evidence |
| --- | --- | --- | --- |
| AND-001 | Install and launch | APK installs and opens without a blank screen or crash | Device recording |
| AND-002 | Workspace persistence | Goal, node and task survive app close and relaunch | Before/after screenshots |
| AND-003 | Map touch | Pan, pinch zoom, node drag, expand/collapse and fit-to-content work | Device recording |
| AND-004 | Position persistence | A manually moved node remains in position after relaunch | Before/after screenshots |
| AND-005 | Plan and calendar | Today, week, month and calendar views project the same task data | Test log |
| AND-006 | Mobile layout | 375px, 390px and 412px viewport checks have no horizontal overflow or overlap | Rendered screenshots |
| AND-007 | Back and keyboard | Android back closes the active editor/panel first; keyboard does not hide primary actions | Device recording |
| AND-008 | Network failure | Timeout/offline state is visible and does not silently discard edits | Device recording |
| AND-009 | Identity boundary | Android requests use a validated installation ID; ChatGPT web requests keep email identity | API test log |
| AND-010 | Secret boundary | No OpenAI or server secret exists in client source, APK assets or Capacitor config | Secret scan |
| AND-011 | Build | `assembleDebug` succeeds and produces an APK | Gradle output |
| AND-012 | Release metadata | App name, package ID, version, icon and splash are correct | APK inspection |

## Blocking policy

- Any P0 or P1 failure blocks the next feature and the release.
- P0 includes crash, install failure, data loss, identity crossover, secret
  leakage or silent write loss.
- P1 includes a broken goal/map/task/calendar core flow.
- Every failed gate must have a reproduction step, expected result, actual
  result and a linked fix commit before it can be closed.

## Explicit V1 limitations

- AI generation happens when Master is opened after the scheduled review time.
- Offline editing and background notification delivery are later milestones.
- A Play Store AAB requires a production signing key and an authenticated app
  account; those are external release inputs, not repository defaults.
