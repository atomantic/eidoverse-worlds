# Gamepad controls

Click inside the world, press a controller button, then release the buttons
and sticks. The browser must report `mapping: "standard"`; unmapped devices
are ignored. The first connected standard controller keeps control until it
disconnects.

| Action | Xbox / PlayStation | Keyboard / mouse |
| --- | --- | --- |
| Move | Left stick | WASD / arrows |
| Look | Right stick | Mouse drag / mouselook |
| Jump | A / Cross | Space |
| Use nearby object | X / Square | E / click the prompt |
| Cancel posture, photo mode, or pointer lock | B / Circle | Escape |
| Run | Left stick click | Shift |

Movement is analog and camera-relative. Both sticks have a radial dead zone
of 0.18, with the remaining range rescaled to full travel. Right-stick look
uses 2.4 radians/second horizontally and 1.9 vertically, independent of frame
rate. Use and cancel fire on press edges; holding use cannot repeatedly
activate a pod or toggle an object. Prompts switch with the active input.
Keyboard flight and photo-camera translation retain their existing controls.

Blur, hidden pages, disconnection, and world departure clear input. Chat,
editable controls, and modal focus suppress gameplay. After returning to the
world or reconnecting, release buttons and center sticks before playing.
Walking also gets up from a ragdoll or dismounts a seat through the existing
embodiment flow.

## Browser and embedding requirements

Use HTTPS, or a trustworthy loopback origin such as `http://127.0.0.1` for
local development. Click the renderer to focus it before using the controller;
an already-connected device may remain invisible until a physical button is
pressed. Missing Gamepad API support or `SecurityError` from a denied policy
leaves keyboard and touch operational.

The embedding host must delegate `gamepad` in the iframe's `allow` attribute
(alongside its other required capabilities), and any enclosing
`Permissions-Policy` response header must permit the renderer origin.
The directive's default allowlist is `self`; cross-origin embeds need explicit
delegation. The renderer cannot loosen a parent's policy.

- [Gamepad API and device discovery](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)
- [Gamepad Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/gamepad)

PortOS retains destination selection, guest admission, and the departure
handshake. Gamepad use calls the same contextual action as E or touch, which
only requests the existing validated host route. No travel URLs or credentials
are accepted by the input layer. PortOS's main Eidoverse iframe already declares
`gamepad`; its guest iframe must also delegate it for cross-origin guest worlds
(host-side work, outside this renderer repository).

## Verification

Run each script in a separate Bun process:

```sh
bun tools/input-test.ts
bun tools/input-dom-test.ts
bun tools/interaction-test.ts
bun tools/departure-test.ts
bun tools/portos-frame-test.ts
bun tools/portos-frame-dom-test.ts
```

For physical acceptance, run `bun tools/interaction-preview.ts`. This starts
disposable worlds on loopback ports 8993/8994, with the existing frame contract
and `allow="gamepad"`. No installed world is seeded. Open the printed parent
URL, then exercise movement, look, jump, and held use at the pod. The parent
must report that the source departed before joining the destination. Also test
the renderer directly on port 8993 using the same synthetic fixture key and
world `interaction-a`: the pod provides `Test object interaction`, an ordinary
logged `use`. Check blur/chat suppression and unplug/replug while moving.

Physical acceptance on Windows, 2026-09-07: Edge exposed
`Xbox 360 Controller (XInput STANDARD GAMEPAD)` with standard mapping. The
operator confirmed the embedded move/look/jump/held-use check. The frame
reported `PASS: departed source, entered destination, one human world`, the
source observer confirmed departure, and no page JavaScript errors occurred.
The operator also confirmed standalone move/look/jump/use, chat suppression,
and that unplugging the controller stopped movement. The standalone check
produced ordinary `use` entries in the scratch log.
This fixture exercises the PortOS frame contract, not a deployed PortOS host.
