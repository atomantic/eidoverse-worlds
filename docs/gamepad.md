# Gamepad controls

Click inside the world, press a controller button, then release buttons and
center the sticks. The browser must report `mapping: "standard"`; unmapped
devices are ignored. The first available standard controller keeps control
until it disconnects.

| Action | Xbox / PlayStation | Keyboard / mouse |
| --- | --- | --- |
| Move | Left stick | WASD / arrows |
| Look | Right stick | Drag / mouselook |
| Jump | A / Cross | Space |
| Use nearby object | X / Square | E |
| Cancel posture, photo mode, or pointer lock | B / Circle | Escape (after the editor declines it — see below) |
| Run | Left stick click | Shift |

Movement is analog and camera-relative. Both sticks have a 0.18 radial dead
zone with the remaining range rescaled to full travel. Right-stick look uses
2.4 radians/second horizontally and 1.9 vertically, independent of frame rate.
Use and cancel fire on press edges. Prompts follow the active input device.
Walking gets up from a ragdoll or dismounts a seat, at the same 0.08 threshold
the walk controller uses, so a stick resting outside the dead zone does not tip
you off a swing. Getting up is an edge, not a level: after a knock-down or a
grab the input must pass through neutral before it counts, so being shoved
while holding a key leaves you on the ground until you press again.
Keyboard flight and photo-camera translation retain their existing controls.

Blur, hidden pages, disconnection, and leaving the page clear input. Chat,
editable controls, and modal focus suppress gameplay. After returning or
reconnecting, release buttons and center sticks before playing again.

The controller legend flashes once, the first time a pad takes over in a
session, not on every switch back from the mouse.

## Escape is a chain; B / Circle is not

Escape is shared with the editor, so one press does one thing. The build layer
gets it first and dismisses the most transient state it has — an armed seat
placement, then a ghost, then a seat selection, then a selection, then edit
mode itself. Only a press with none of those left reaches `cancel`, which
stands you up, leaves photo mode, and drops pointer lock. Deselecting an
object while you are sitting no longer also stands you up.

B / Circle has no such chain: it reaches `cancel` directly from the pad poll
and never enters the keyboard path, so it stands you up even mid-edit. That is
deliberate — the editor is a mouse surface, and a pad is not holding it.

Escape under pointer lock is the browser's, not ours. Chromium consumes it to
exit the lock and never delivers the key to the page, so mouselook + Escape
frees the cursor and does not cancel a posture; press it again once unlocked,
or use B / Circle. This is browser behavior with no supported override, and
the client does not try to work around it.

## Using things

X / Square is the same act as E: it uses the nearest thing in reach that offers
an action, through the world's use prompt (`client/lib/useprompt.js`), which
also shows the hint-bar line and follows the active input device (`E`,
`X / □`). It sends the existing `use {id, action}` verb, so rights, reactions
and scripts still own the effects, and nothing here adds a verb or a component.
A climb route takes E first (it marks the press `worldHandled`), and the use
prompt stands aside for a press that was claimed. Both stand aside while
building, limp, or in a headset.

B / Circle and an unclaimed Escape stand you up from a seat the way the
explicit get-up does, so a seat that lets you go only when the world does still
answers with its hint, and holding X is still the way out.

## Browser requirements and verification

Use HTTPS or trustworthy loopback HTTP for local testing. A focused page may
not see an already-connected device until a physical button is pressed.
Cross-origin iframes need `gamepad` delegation in their `allow` attribute;
any ancestor Permissions Policy must permit it too. Missing or denied Gamepad
API access leaves keyboard and touch operational.

- [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)
- [Gamepad Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/gamepad)

Run `bun tools/input-test.ts`, `bun tools/input-dom-test.ts`,
`bun tools/limp-input-test.ts`,
`bun tools/escape-priority-test.ts`, and `bun tools/collider-test.ts` as
separate processes. They cover normalization, edge triggering,
discovery/reconnection neutral guards, focus suppression, disconnect clearing,
denied API fallback, the movement threshold and neutral latch that guard knock-downs and
seats, the Escape chain, the once-per-session pad legend, and E and X / □
sharing one use (real controller.js, build.js and useprompt.js, on the real
bus), plus the collider suite.

Physical Windows/Edge acceptance on 2026-09-07 exposed an
`Xbox 360 Controller (XInput STANDARD GAMEPAD)`. The operator verified movement,
look, jump, use, chat suppression, and stopping on unplug on the source
implementation, including an iframe session. This upstream adaptation retains
the same input modules and mapping; use is routed through the world's use prompt.
An Edge smoke test of this upstream adaptation drove the real controller and
avatar with simulated standard-pad input: movement, camera rotation, jump,
disconnect clearing, and exactly one server-logged `use` across 120 held polls
passed, with no page JavaScript errors.

## Fork-only: gamepad under the PortOS frame

Carried on `portos`, not offered upstream (docs/FORK.md, docs/portos-frame.md).

PortOS retains destination selection, guest admission, and the departure
handshake. The pad's X / □ is the same contextual action as E or a tap: the use
prompt (`client/lib/useprompt.js`), which for a thing carrying `portos/link`
only requests the already-validated host route — no travel URL or credential is
ever accepted by the input layer. PortOS's main Eidoverse iframe already
declares `gamepad`; its guest iframe must also delegate it for cross-origin
guest worlds (host-side work, outside this repository).

Fork-only suites (in the gate): `portos-frame`, `portos-frame-dom`,
`departure`, `portos-rename`, `guest-entry`.

For physical acceptance under the frame, run `bun tools/interaction-preview.ts`.
It founds two disposable worlds in a temp directory, serves them on loopback
port 8993 with a stand-in parent on 8994 speaking the frame contract with
`allow="gamepad"`, and touches no installed world (it stops before writing
anything if 8993 is already taken; `bun tools/interaction-preview-test.ts`
checks that). Open the printed parent URL, then exercise movement, look, jump,
and held use at the pod; the parent must report that the source departed
before joining the destination. Opened directly on 8993 (no host session), the
same pod offers an ordinary logged `use`. This fixture exercises the PortOS
frame contract, not a deployed PortOS host.

Physical acceptance on Windows, 2026-09-07 (the old-protocol build): Edge exposed
`Xbox 360 Controller (XInput STANDARD GAMEPAD)` with standard mapping. The
frame reported `PASS: departed source, entered destination, one human world`,
the source observer confirmed departure, and no page JavaScript errors
occurred. Not yet repeated on the current protocol.
