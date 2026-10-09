# Mtaa: a live 3D neighbourhood for your AI agents

*Mtaa* is Swahili for "neighbourhood". Every project is a hexagon plot, every Claude agent is a
small robot, and every finished task stays behind as a building, so busy projects grow into towns.
Light follows the real time of day in Nairobi. It is useful as well as fun: one glance shows which
agents are working, which are stuck, and which one is **waiting for your approval**.

Sells: a stand-out portfolio piece and demo video; a Fiverr gig ("live dashboard for your AI agents");
the base for a PayPal + AI hackathon entry (agents' PayPal actions as buildings and coins).

**Visual reference:** the clickable prototype at https://claude.ai/artifact/WW1sLKbyA6XmQCGBwz5dg3
(source: [docs/prototypes/mtaa.html](../prototypes/mtaa.html)). Match its look, layout, copy and
behaviour unless this spec says otherwise. It is one vanilla three.js file; port it, don't copy it whole.

## Owned paths (scope word: `mtaa`)
`src/app/mtaa/**`, `src/features/mtaa/**`, `tools/mtaa-bridge/**`, `e2e/mtaa.spec.ts`,
`docs/prototypes/mtaa.html`, this file.

## Dependencies
Approved: `three` and `@types/three` (pin exact versions, check the installed `.d.ts` before use).
No React Three Fiber: a thin client component around vanilla three.js keeps the port 1:1 with the
prototype and the bundle small. The bridge uses Node built-ins only.

## Architecture (the one rule that matters)
Both data sources emit the **same event stream** into the **same pure reducer**; the 3D scene and
the HUD only read the reducer's state.

```
Simulator (demo, seeded) ──┐
                           ├─► MtaaEvent ─► reducer(state, event) ─► WorldState ─► scene + HUD
Bridge (live, SSE) ────────┘
```

### `MtaaEvent` (zod schema, `src/features/mtaa/events.ts`)
`{ v: 1, ts, source: "sim" | "claude-code", sessionId, project, agentId, role, kind, tool?, title? }`
- `kind`: `session_start | task_start | tool | tool_done | needs_approval | approval_resolved |
  subagent_start | subagent_stop | task_done | session_end`
- `tool`: `{ name, target? }` where `target` is a file path or a command, max 120 chars.
  **Never** file contents, diffs, prompts or tool output.
- `role`: `kiongozi` (main session) · `fundi` (builder) · `mkaguzi` (verifier) · `msanii` (UI QA) ·
  `msaidizi` (any other subagent type, generic helper).

### `WorldState` (reducer output)
projects → plots (stable axial position per project name, HQ in the centre, spiral outward),
sessions (status: planning / working / needs-you / done), agents (state: walk / work / read / wait /
rest / gone, current action, last 6 actions, tokens if known), buildings per plot (slot, kind, task
name, built-at), the current construction site and its progress per session.

## Stage 1: the world in the app, demo mode (deployable)
Port the prototype into `/mtaa` with the architecture above.
- `layout.ts` (pure): axial hex maths, 12 slots + centre per plot, slot choice that is stable for a
  given task id, rebuild-the-oldest when a plot is full.
- `sky.ts` (pure): Nairobi (UTC+3) time → sun height, sun direction, sky colour, phase label
  (Night / Sunrise / Day / Sunset). Sunrise ≈ 06:24, sunset ≈ 18:48 all year (equator).
- `sim.ts` (pure, seeded RNG): the prototype's simulator, emitting `MtaaEvent`s. Same seed → same
  events (tested).
- `reducer.ts` (pure): all state changes. Unit-test every event kind and the edge cases
  (unknown agent, event for a removed agent, two approvals at once, task_done with no site).
- `scene/`: buildings, robots, plots, trees, HQ + matatu, sparks, labels, camera (drag, pinch,
  wheel, ⟲ ⟳ + − ⌂ buttons, arrow keys, Q/E), raycast picking, selection ring.
- `ui/`: Sessions / Activity / Key tabs, inspector card (agent and plot variants, Approve / Deny,
  Follow), toasts, demo chip, Nairobi clock, Time-lapse (one day per minute).
- Home page and `src/lib/site.ts`: add Mtaa as the third project card (shared file: allowed for this).

**Acceptance (stage 1)**
1. `/mtaa` renders the world with 6 project plots + HQ, ≥ 5 sessions, robots moving, sites growing.
2. Within 10 s a "needs you" badge appears; Approve and Deny work from the badge, the card and keyboard.
3. A task completes within 30 s of load and its building pops in with a toast.
4. Day/night matches Nairobi time; Time-lapse runs a day in ~60 s and "Back to live" restores it.
5. 390 px: bottom sheet, no horizontal scroll, card never covers the camera controls.
6. `prefers-reduced-motion`: no bobbing, sparks or camera easing; the sim still runs.
7. No console errors; axe clean on the HUD; WebGL failure shows the friendly fallback.
8. Unit tests: layout, sky, sim determinism, reducer. e2e: load, approve flow, tab switching, mobile.

## Stage 2: live mode (runs on your own computer)
`tools/mtaa-bridge/server.mjs`: Node built-ins only, binds **127.0.0.1:4100** only.
- `POST /event`: receives a Claude Code hook payload (JSON on the hook's stdin, forwarded by curl),
  maps it to an `MtaaEvent`, appends it to `~/.mtaa/events.jsonl`, broadcasts it.
- `GET /events`: Server-Sent Events stream. `GET /state`: all events since a timestamp, so a page
  that loads late can rebuild the world.
- CORS: allow only `http://localhost:3000` (configurable). Body limit 64 KB. Never crash on bad input.
- `npm run mtaa:bridge` starts it; `npm run mtaa:hooks` **prints** the settings snippet for
  `~/.claude/settings.json` and explains it. It never edits the user's settings by itself.
- The hook command must never slow Claude Code down or fail it:
  `curl -s -m 1 -X POST http://127.0.0.1:4100/event -H 'content-type: application/json' --data-binary @- >/dev/null 2>&1 || true`

**Hook → event mapping** (verify every field name against the official Claude Code hooks reference
before coding; if a field can't be confirmed, say so in the summary and handle its absence):

| Hook | MtaaEvent | Notes |
|---|---|---|
| SessionStart | `session_start` | project = basename of `cwd` |
| UserPromptSubmit | `task_start` | title is "New task" unless `MTAA_SHOW_PROMPTS=1`, then the first 60 chars |
| PreToolUse | `tool` | `Read/Grep/Glob` → read, `Edit/Write` → work at site, `Bash` → work at hall, `WebFetch/WebSearch` → matatu stop; the subagent tool → `subagent_start` with role from its `subagent_type` |
| PostToolUse | `tool_done` | |
| Notification (permission) | `needs_approval` | ❗ badge + toast; card says "Approve it in your terminal" in live mode |
| SubagentStop | `subagent_stop` | |
| Stop | `task_done` | building kind from the files touched: mostly tests → solar pod, docs/markdown → crates, config/CI/scripts → tower, else dome (pure function, tested) |
| SessionEnd | `session_end` | |

Live mode in the page: a "Connect to this computer" control (only shown on `localhost`) that opens
the SSE stream, falls back to demo with a clear message if the bridge isn't running, and labels the
chip "Live" instead of "Demo".

**Acceptance (stage 2)**: bridge unit tests (mapping table, bad bodies, size limit, CORS);
an e2e that posts recorded hook payloads (fixtures in `e2e/fixtures/mtaa-hooks/`) to a test bridge
and sees the robot, the ❗ and the building appear.

## Stage 3: memory and growth
- On load in live mode, rebuild the world from `/state` (all history), so the town survives restarts.
- Plot card: buildings by kind, last 10 tasks with dates, total agent time.
- "Replay today" control: replays today's events at 60× speed (great for screen recording).

## Stage 4: polish
Sounds (off by default, toggle), instanced meshes once a plot has > 40 objects, 60 fps on a mid
laptop and ≥ 30 fps on a mid Android (pixel ratio ≤ 1.5 and 1024 shadows on phones), Open Graph
image, a 30-second demo recording for Fiverr.

## Privacy and safety
- The bridge only listens on 127.0.0.1 and stores tool names and short targets, never contents.
- No telemetry, no outbound requests from the bridge.
- Approving permissions from the world is **out of scope** for now (it would mean a PreToolUse hook
  that blocks on the page's answer). Note it as a possible stage 5 with a safety review first.

## Implementation notes
*(builder: fill in key files, data flow and gotchas when done)*
