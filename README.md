# blazium-web-portal-tests

A browser test for Blazium's portal exports. It exports a small Blazium project for the web, serves
it with a stand-in for the host page's script, and drives it in headless Firefox to check that each
call and signal of the portal singleton actually works in a browser.

It covers the **Betacade** portal (`Betacade` singleton, the Betacade HTML export added in
[blazium-games/blazium#855](https://github.com/blazium-games/blazium/pull/855)). Blazium's own unit
tests run off the web, so they only see the native fallback; the JavaScript glue, web saves and the
page's signals are only exercised in a browser.

## What it checks

The test project (`project/`) calls every method of `Betacade` (`is_available`, `is_replaying`,
`is_on_host`, `get_last_error`, `save`/`load`/`remove`, `event`, `set_state`, `submit_score`,
`achieve`) and connects every signal (`paused`, `resumed`, `replay_entered`, `replay_state`,
`replay_exited`, `result`, `unavailable`). It logs each call and each signal, with the type and value
it got, to `window.__sdk`.

`tools/wt-stub.js` stands in for the play page: a `window.wt` with the calls Blazium's glue
(`misc/dist/html/third_party_services/blazium-betacade.js`) makes, the `wt:pause` / `wt:resume`
window events, and `?wt-replay=state` for the replay viewer. It records what the game sends and lets
the test call the replay hooks the game registers. It is written from Blazium's glue and Betacade's
public guide (https://api.betacade.com/llms.txt); it is not Betacade's own script.

`tools/e2e.mjs` then checks:

| | What | How |
| --- | --- | --- |
| A | Page signals before the first save or event | `?lazy=1`, fire `wt:pause`/`wt:resume`, then the same after a save |
| B | Normal play | saves round-trip through localStorage (and a reload), events reach `wt.track` with typed fields, `submit_score` and `achieve` reach `wt`, the snapshot getter returns the state |
| C | Replay viewer, no `set_state` while replaying | does the game register `wt.onReplay` (within 30 s)? |
| D | Replay viewer, `set_state` always | `replay_entered`, `replay_state` (as a Dictionary), `replay_exited` |
| E | Plain Web preset | does `save()` work there too? |
| F | Betacade preset with no `window.wt` | `is_available()` false, saves still work, no errors |

`tools/export.sh` also checks that the Betacade preset writes `index.html`. Every console error and
warning is collected and printed as `PROBLEM`.

## Running it

You need a Blazium editor binary and a web release template (zip) built from the same commit,
Firefox, Node 22 or later (no npm packages), and on Linux without a display, `xvfb-run`.

```sh
tools/export.sh path/to/blazium.linuxbsd.editor.x86_64 path/to/web_nothreads_release.zip out
node tools/serve.mjs out &
xvfb-run -a node tools/e2e.mjs out/shot
```

It prints `GAP n: CONFIRMED|FIXED` for each gap below, every `PROBLEM`, and `ALL PASSED` or the
number of failures.

## Results

Run on 2026-11-12: Linux, Firefox 158 headless, web `template_release` single-threaded, Emscripten
3.1.64. "Stock" is the #855 merge on `blazium-dev` (e0327991); "patched" adds the fix in
[conrs/blazium `pr855-fixes`](https://github.com/conrs/blazium/tree/pr855-fixes).

| Gap | Stock | Patched |
| --- | --- | --- |
| 1. Page callbacks get one Array instead of their arguments | CONFIRMED: `replay_state(Array:["{\"level\":7,...}"])` | FIXED: `replay_state(Dictionary:{"level":7.0,...})` |
| 2. Saves only work under the Betacade preset | CONFIRMED: plain Web `save() -> false`, localStorage empty | FIXED: `save() -> true`, written |
| 3. Page signals wired only after the first save or event | CONFIRMED: `wt:pause` before a save fires nothing | FIXED: `paused()`/`resumed()` from the start |
| 4. Replay hooks register only from `set_state` | CONFIRMED: no `wt.onReplay` in 30 s | FIXED: registered at boot |
| 5. Betacade preset doesn't write `index.html` | CONFIRMED: wrote `SdkTest.html` only | FIXED: `index.html` |
| Console errors and warnings | 152 lines: `No interface 'BlaziumPortals' registered` (x72, plain Web and no `wt`), `Parse JSON failed` (x4) | none |
| Result | 1 FAILED (gap 1; gaps 2-5 are reported as verdicts) | ALL PASSED |

Everything else passes on both: saves round-trip (and survive a reload), `remove` and `load`
defaults, all 15 events reach `wt.track` with typed fields, `submit_score` and `achieve` reach `wt`,
the snapshot getter returns the state, and with no `window.wt` the export stays silent and still
saves.

Not covered: a `template_debug` build (where gap 1 should also drop `paused`/`resumed`), and the
other portals' callbacks.

## License

MIT. See `LICENSE`.
