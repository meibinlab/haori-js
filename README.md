# Haori.js

Haori.js is a lightweight, HTML-first UI library that enables dynamic user interfaces primarily through HTML attributes. It lets you declare data bindings, conditional rendering, list rendering, form two-way binding, server fetches, and HTML imports without writing much JavaScript.

Version: 0.39.2

---

Contents

- Overview
- Installation
- Quick start
- Common attributes (summary)
- Build & publish
- License & contributing
- Further documentation

---

## Overview

- Design principle: HTML-first — declare UI behavior with HTML attributes
- Keep internal state authoritative; let the rendered DOM follow asynchronously
- Key features:
  - Data binding via `data-bind`
  - Conditional rendering via `data-if` (JavaScript falsy semantics: `false`, `null`, `undefined`, `NaN`, `0`, and `''` are hidden)
  - List rendering via `data-each`
  - Two-way form binding (automatic binding based on `name` attributes)
  - Boolean checkbox support with `value="true"` (`true` when checked, `false` when unchecked)
  - `type="number"` inputs are bound and submitted as numbers (empty / non-numeric values become `null`)
  - Event-driven actions via `data-click-*`, `data-change-*`, `data-load-*`, `data-intersect-*`
  - Interval polling via `data-poll-*` (interval, timeout, and stop condition)
  - Server fetches via `data-fetch`
  - HTML imports via `data-import`
  - Lifecycle events such as `haori:eachupdate`, `haori:bindcomplete`, `haori:show` / `haori:hide`
  - Zero runtime dependencies (uses browser-native APIs)

Runtime mode can be distinguished with `data-runtime` and `Env.runtime` when you need different behavior for embedded use and browser demos.

## Installation

Install from npm:

```bash
npm install haori
```

Via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
```

This CDN URL follows the latest published npm release.

ES Module import:

```js
import Haori from 'haori';
```

---

## Quick start

You can use Haori with plain HTML. Minimal example:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Haori Sample</title>
    <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
  </head>
  <body>
    <div data-bind='{"name":"Taro"}'>
      <p>Hello, {{name}}</p>
    </div>
  </body>
</html>
```

Mounting from JavaScript:

```js
import Haori from 'haori';

Haori.mount(document.body, {items: [{name: 'apple'}, {name: 'orange'}]});
```

---

## Common attributes (summary)

- `data-bind` — set binding data for an element (JSON or parameter format). **Reserved top-level keys:** data/navigation/storage names that collide with globals (`location`, `history`, `document`, `navigator`, `localStorage`, `sessionStorage`) **can** be used as top-level keys and shadow the global inside expressions (e.g. `{"history":[…]}` works with `data-each="history"`). Execution/prototype-escape names (`window`, `self`, `globalThis`, `Object`, `Function`, `eval`, `constructor`, `__proto__`, `prototype`, `setTimeout`, …) **cannot**: such a key is ignored (it resolves to `undefined` in expressions) while the other keys still render, and an `error` is logged naming the ignored key. Nested object/array property names are unrestricted.
- `{{ ... }}` — template expressions (evaluated and inserted)
- `data-if` — show/hide an element based on a condition
- `data-each` — repeat an element for items in an array (`data-each-key`, `data-each-arg`, `data-each-index`)
- `data-attr-xxx` — safely update browser-interpreted attributes such as `src` and `value`
- `data-fetch` — fetch data from a server and bind the result
- `data-import` — load external HTML and insert it
- `data-url-param` — import URL query parameters into bindings
- `data-store` — mirror the declared binding keys to browser storage (one JSON record per storage key), restoring them right after `data-bind` so they work as `data-if` conditions, `data-each` arrays and initial input values. Select the keys with `data-store-params="a&b"` and/or nest them under a record key with `data-store-arg="name"` (one of them is required); `data-store-type="session|local"` picks the storage (default `session`). Saving happens automatically whenever a declared key changes — form two-way commits and fetch responses included — and writes are synchronous with the binding, so a save right before `data-{event}-redirect` is never lost. Writes replace only the declared keys, so screens can each own their part of the record. Declare it on the `<form>` itself to persist input state. Pair with `data-{event}-store-clear="key"` (plus `-type`) to discard the record. Multi-screen wizards can therefore carry state without a single line of JavaScript.
- `data-unauthorized-redirect` / `data-forbidden-redirect` — auth guard declared on `<body>`/`<html>`. When a Haori fetch responds 401/403, navigate to the given URL (expressions allowed). Applies to all fetch paths (`data-fetch`, event fetches, `data-import`); per-status opt-in. Pair with `*-return-param="name"` to auto-append the current `pathname+search+hash` as a return query for post-login restoration (an existing same-name query on the target URL wins).
- `data-{event}-redirect-return-param="name"` — the symmetric receiver side. On a successful procedure, resolve the post-redirect destination from the given URL query, navigating there only when it is a safe same-origin local path (open-redirect protection is built in); otherwise fall back to `data-{event}-redirect`. Used with the auth guard's `*-return-param`, append → consume becomes symmetric and the hand-written validation JS is no longer needed.

Additional binding helpers:

- `data-derive` / `data-derive-name` — define a derived value on an element and expose it to descendants only. This is useful for cases such as parent-child selects.
- `data-*-bind-merge` (e.g. `data-click-bind-merge`, `data-fetch-bind-merge`) — when binding a result to a target element, shallow-merge it into the target's existing `data-bind` (keys not present in the new data are preserved) instead of replacing the whole binding. Useful for patching a single computed key (such as `selectedId={{items[0].id}}`) into existing state.

Event-driven actions:

- `data-click-*`, `data-change-*`, `data-input-*`, `data-load-*`, `data-intersect-*` declare actions (fetch, bind, copy, dialog control, etc.) triggered by click, form change, incremental input, element load, and viewport intersection respectively. `data-load-*` also fires when a `data-if` element transitions from hidden to shown (the `haori:show` timing), so it works on elements like `<button>` that never receive a native `load` event.
- `data-poll-*` — run a procedure repeatedly on a timer (interval polling), for screens that wait until another device or process finishes. The action vocabulary is shared with `data-{event}-*` (`data-poll-fetch`, `data-poll-bind`, `data-poll-bind-arg`, …). Configuration is `data-poll-interval` (interval in ms, default 5000, floor 100), `data-poll-timeout` (give up after ms, unlimited when omitted), `data-poll-until="{{expr}}"` (stop permanently once true; evaluated before each request and after each bind), `data-poll-error-limit` (stop after N consecutive failures; keeps going when omitted), `data-poll-disabled` (suppress while truthy) and `data-poll-state` (inject `_poll` state — `running` / `paused` / `stopped` / `timedOut` / `stopReason` / `count` / `elapsedMs`). The first request runs immediately, later intervals are measured from the previous completion (so requests never overlap), polling pauses while hidden by `data-if` and resumes when shown, and stops permanently when the element leaves the DOM. Note that browsers throttle timers in background tabs, so the configured interval is not guaranteed there (an immediate refetch is issued when the tab becomes visible again).
- `data-input-*` — run a procedure on each keystroke (the `input` event) for text inputs. Because `input` fires incrementally, only elements that explicitly declare a `data-input-*` attribute are handled (opt-in); like `change`, it auto-detects the ancestor form and reflects the value into two-way bindings. Useful for incremental search filtering (e.g. `<input name="q" data-input-form>`).
- `data-on="eventName"` + `data-on-*` — run a procedure when an arbitrary **custom event** dispatched on `window` / `document` fires (the action vocabulary is shared with `data-{event}-*`). Lets you declaratively initialize on events other than the built-ins, e.g. a native-bridge ready signal (`<body data-on="appReady" data-on-fetch="/api/init.json" data-on-bind="#app">`). The event name is held in the attribute value (attribute names are lowercased), a single `window` capture subscription receives both `window`- and `document`-dispatched events without double-firing, and elements inserted later are picked up too. Built-in names (click/change/input/load) are warned and not subscribed. Note: events dispatched before Haori subscribes are not received (no replay).
- `data-validity="{{expr}}"` / `data-validity-message="…"` — declarative cross-field validation on an input. The condition is pushed into `setCustomValidity()`, so it rides on native validation (`data-{event}-validate`): bubble message, focus move and `:invalid` styling all keep working. Conditions that native constraints cannot express ("either phone or e-mail", "the two addresses must match") become declarative.
- `data-{event}-if="{{expr}}"` (`data-fetch-if` for the non-event form) — an execution condition for the procedure. When false, nothing runs — fetch, redirect and `data-{event}-run` included. Both are evaluated **synchronously at run time**, so they do not wait for attribute re-rendering (`requestAnimationFrame`) and always see the input the user just changed — unlike `data-attr-disabled`, which is one frame stale when you fix the last field and press straight away. Do not use `disabled` to block a click: a disabled button fires no click event at all, so the "fixed it but cannot press" direction cannot be recovered at run time.
- Actions that run **after** the response is bound (`data-{event}-redirect`, `-redirect-return-param`, `-dialog`, `-toast`, `-history`, `-scroll`) evaluate their attribute right before they run, so the destination or message can be decided by the response (`data-click-redirect="{{nextAction === 'pay' ? redirectUrl : '/complete.html'}}"`). Bind the response to the element itself or an ancestor so the keys are in scope. If a key the expression used disappears mid-procedure (a full-replace `data-{event}-bind`), the value evaluated at procedure start is used instead and a warning is logged in dev mode — navigation is never silently dropped. `data-store` mirroring is synchronous with the binding, so it always completes before the redirect.
- `data-enhance="name"` applies a DOM-scanning third-party library (Choices.js, postal-code helpers, …) declaratively. Register it once with `Haori.enhancers.register(name, {init, refresh, destroy})` and Haori calls `init` on the initial scan, on nodes added later and on new `data-each` rows, `refresh` when a `data-each` render settles or a `data-if` branch is shown again, and `destroy` when the element leaves the DOM. Application is once per element per name and the scan is limited to the declaring element's subtree. Unregistered names stay pending and are applied retroactively when registered, so load order does not matter. The registration-free shorthand `data-enhance-new="Global.Ctor"` `new`s a dot-separated global reference with the element as its argument (no code allowed in the value). Keep library-generated DOM out of Haori's observation with `data-external`.
- Inside an editable row, when you pull "the selected one out of the fetched candidates", inputs whose value is decided by a declarative binding (`data-attr-value="{{...}}"` and friends) are **no longer overwritten by the row data** while the expression resolves. While it is unresolved the row data is applied as before, so a value restored from a saved record is not lost. A response is only visible to the bind target and its descendants, so point `data-fetch-bind` at a **wrapper inside the row** when the whole row needs it (pointing at the row element itself writes through to the row data, putting the candidate list into the collected values). Declarations placed outside the bind target keep their fallback value, and development mode now warns that the key is provided in another scope.
- In editable rows (`data-each` combined with `data-form-list`), pointing `data-{event}-copy` / `data-{event}-bind` at the **row element** writes through to the matching **array element**. Row input values are owned by that array element, so a single declaration fills several inputs at once without touching the other rows (copying "same as the contract holder's address", or filling a row from a postal-code lookup). Use it where the list-owning `<form>` rules out a nested `<form>` inside the row.
- Attributes that take a **CSS selector** (`data-{event}-bind`, `-form`, `-copy`, `-copy-source`, `-reset`, `-refetch`, `-click`, `-open`, `-close`, `-adjust`, `-row-*`, `data-fetch-bind`, `data-fetch-state`, …) evaluate `{{ ... }}` before querying, so a row inside `data-each` can target *its own* elements (`data-change-bind="#plan-scope-{{i}}"` paired with `id="plan-scope-{{i}}"`). An invalid selector is logged and skipped instead of throwing, and an unresolved single placeholder is treated as "no value given" (falling back to the attribute's default behaviour). Key-list attributes such as `-bind-arg` / `-copy-params` are not evaluated.
- `data-click-copy-source` — explicitly set the copy source element for `data-click-copy` (defaults to the form given by `data-click-form`, otherwise the event element's binding).
- `data-click-no-disabled` / `data-click-defer` — coexistence helpers for other libraries. `no-disabled` runs the click procedure without adding the `disabled` attribute (so libraries/CSS that ignore disabled elements, e.g. Bootstrap collapse, keep working; double execution is still prevented internally). `defer` runs the click procedure on the next frame (`requestAnimationFrame`/`setTimeout(0)`) so other libraries' synchronous click handlers complete first. Avoid `defer` on `<a href>` / `type="submit"` because the deferred procedure cannot `preventDefault()` the default action.
- `data-{event}-prevent` (e.g. `data-click-prevent`) — suppress the browser's native default action for the event (form submission for a `type="submit"` button, navigation for `<a href>`). `preventDefault()` is called synchronously during the click, so it works even together with `data-click-defer`, and `stopPropagation()` is never called (other libraries' event propagation is unaffected). This lets you keep `type="submit"` and still attach `data-click-fetch` etc. without the page reloading.
- `data-{event}-run` (e.g. `data-click-run`, `data-change-run`) — run arbitrary JavaScript on the event without a fetch. The value is executed as real JS via `new Function` (like `-before-run`/`-after-run`), with `{{...}}` expanded at render time and `event` passed as an argument. Returning `false` calls `event.preventDefault()` (the `onclick="return false"` convention). **Security:** the expanded `{{...}}` is concatenated into executable code, so only interpolate trusted values (numeric indexes, IDs you control) — never untrusted strings (API/user input), which would run as code (XSS). Pass untrusted values via `data-bind` and read them inside the called function instead.

Lifecycle events:

- `haori:eachupdate` — fired on the `data-each` element after a list diff completes; all added/removed/reordered rows are in the DOM and their content (`{{...}}`) is rendered by the time it fires, so it can be used to detect render completion (`detail`: `added`, `removed`, `order`, `total`).
- `haori:bindcomplete` — fired on the target element after a `data-*-bind` / `data-*-bind-arg` bind and the subsequent re-evaluation of its subtree complete (`detail.bindArg`).
- `haori:show` / `haori:hide` — fired when a `data-if` element becomes shown or hidden.
- `haori:rowadd` / `haori:rowremove` / `haori:rowmove` — fired on each row element during a `data-each` list diff (`detail`: `key`, `index`, `item` / `key`, `index` / `key`, `from`, `to`). They bubble, so the container or `document` can subscribe. `rowadd` fires after the row's content is rendered; `rowremove` fires **before** the row leaves the DOM.
- `haori:ready` — fired on `document` once initialization completes (`detail.version`). Register the listener before the library script so it is not missed.

Built-in helpers are available in expressions under the reserved namespace `haori`: `haori.date(value, format?, timeZone?)` formats an ISO string / epoch ms / `Date` (default `yyyy/MM/dd HH:mm`; local time, or a given IANA time zone such as `'Asia/Tokyo'` when `timeZone` is passed), `haori.number(value, decimals?)` formats numbers with grouping, `haori.range(start, end?, step?)` builds an integer array (end-exclusive), and `haori.pages(totalPages, current, {window?, boundary?})` builds an ellipsis-aware page list (`current` is 0-based; each item exposes `{page, label, active, ellipsis}` with `label` = `page + 1`). For month-based UIs, `haori.monthAdd(value, delta)` adds months to a `YYYY-MM` string (timezone-safe integer math; invalid input returns `''`) and `haori.monthRange(count, base?)` builds a descending list of `count + 1` `{targetMonth, label}` items (`base` defaults to the current month). For pagination summaries, `haori.pageSummary(page, visibleCount?)` turns a Spring-style `Page` (`number`, `size`, `totalElements` / `totalCount`) into `{start, end, total, empty}`. `haori.findBy(array, key, value)` returns the first array element whose `item[key]` matches `value` (stringified comparison), or `null` when none match. `haori.sum(array, key?)` returns the numeric total of an array (the elements themselves when `key` is omitted, or `item[key]`; non-numeric values are ignored; non-arrays yield `0`). `haori.distinct(array, key?)` removes duplicates (by the element itself, or by `item[key]`; stringified comparison, first occurrence kept) and `haori.groupBy(array, key)` groups into `{key, items}` entries (first-seen order) — handy for collapsing detail rows into one row per key or rendering grouped lists with nested `data-each`. These let you build number pagination (`data-each="haori.pages(totalPages, number, {window: 2})"`), format values (`{{ haori.date(lastUpdatedAt, 'yyyy/MM/dd HH:mm') }}`), and total rows (`{{ haori.number(haori.sum(rows, 'total')) }}`) declaratively. The same functions are exposed as `Haori.date` / `Haori.number` / `Haori.range` / `Haori.pages` / `Haori.monthAdd` / `Haori.monthRange` / `Haori.pageSummary` / `Haori.findBy` / `Haori.sum` / `Haori.distinct` / `Haori.groupBy`. `haori` is reserved: a `data-bind` key of the same name does not shadow the built-ins inside expressions.

When loaded via `<script src>` (iife), the global `Haori` **is** the `Haori` class: call class APIs directly (`Haori.addErrorMessage(...)`) and reach the other classes as `Haori.Core` / `Haori.Env`. `Haori.Haori` is a self-reference, so code written for 0.37.1 and earlier keeps working.

To read binding data from JS, use `Haori.Core.getBindingData(element, {resolved?})` — by default it returns the element's own raw binding data (or `null`), and with `resolved: true` it returns the scope with inheritance resolved (the read counterpart to `setBindingData`).

Template expressions support safe JavaScript-like syntax such as property access, bracket access with dynamic indexes, optional chaining, ternary expressions, and method chains including array `map`/`filter` with arrow functions and spread calls. Access to global objects, `eval` or `arguments`, and prototype escape paths such as `constructor`, `__proto__`, `prototype`, `Reflect`, or `Object` is blocked. Because `Object` is blocked, use spread syntax `{...a, ...b}` instead of `Object.assign`; when a blocked identifier is referenced in an expression, a `blocked identifier(s): …` warning is logged to the console.

Helpers for tests and debugging: `waitForRenders()` (also `Haori.waitForRenders()`) resolves once initialization, in-flight fetches, and queued render tasks have all settled — useful for E2E tests. `Haori.Core.dumpScope(element)` returns the scope resolved for an element (`resolved`) and where each key comes from (`sources`); in dev mode a falsy `data-if` also logs its expression and referenced scope automatically.

`data-fetch` and `data-import` are automatically re-evaluated only when their evaluated values change after a binding update. `data-fetch` compares a request signature composed of the resolved URL, HTTP method, headers, and body, while `data-import` compares only the resolved URL. If either attribute contains even one unresolved reference, it is treated as invalid for that evaluation cycle, is not executed, and becomes executable only after a later binding update resolves the reference.

When the browser interprets an attribute during HTML parsing, such as `src` or `value` on `input type="number"`, writing template expressions directly in that attribute can cause warnings or unwanted requests before Haori runs. Use `data-attr-*` for those cases. `data-attr-xxx` updates the matching `xxx` attribute, and to keep input state consistent with the DOM it also synchronizes DOM properties for `value` (text inputs), `checked` (radio / checkbox) and `selected` (option). These properties are **not** re-applied to a focused (being-edited) input, nor to an input that holds an edit committed through `change` / `input`, so user input is never rolled back. The committed-edit mark is cleared by an explicit supply of values (fetch response binding, `data-{event}-reset`, `data-{event}-copy`, `Core.setBindingData()`).

For detailed usage and many examples, see the official documentation.

---

## Build & publish (packaging)

Basic local verification and release preparation steps:

Quick release memo:

1. Run `npm run test`, `npm run build`, and `npm pack --dry-run`.
2. Bump the package version with `npm version patch` or the intended version command.
3. Push `main` and tags with `git push origin main` and `git push origin --tags`.
4. Publish a GitHub Release from the new version tag.
5. Confirm npm, jsDelivr, and the GitHub Release assets reflect the new version.

For the GitHub Release-driven npm publish workflow, configure `NPM_TOKEN` for a user that is an owner of the `haori` package. If the token authenticates successfully but does not have publish rights for `haori`, npm may fail with a misleading `E404` during `npm publish`.

6. Install dependencies

```bash
npm install
```

2. Type-check and test

```bash
npm run compile
npm run test
```

3. Build release artifacts

```bash
npm run build
```

4. Bump version

```bash
npm version patch
```

5. Push the version update and tags

```bash
git push origin main
git push origin --tags
```

6. Publish a GitHub Release from the new tag

Publishing to npm is handled by GitHub Actions when a GitHub Release is published. This repository uses release workflows that trigger on `release.published`, build the package, publish it to npm with `NPM_TOKEN` if that package version is not already published, and upload `dist.zip` to the release assets.

Required repository setup:

- `NPM_TOKEN` must be configured in GitHub Actions repository secrets.
- The release must be published from the target version tag.

Recommended pre-release checks:

- `npm run test`
- `npm run build`
- `npm pack --dry-run`

Make sure `package.json` fields `name`, `version`, `description`, `repository` and `license` are correct. Files published to npm are controlled by the `files` field in `package.json`.

---

## License & Contributing

- License: MIT (see `LICENSE` in this repository)

Contributions are welcome — please open issues or pull requests on the GitHub repository.

---

## Further documentation

For more detailed usage, attribute specs, and internal design, see:

- `docs/ja/guide.md` — User guide (many examples)
- `docs/ja/specs.md` — Technical specifications (internal design, API)
- `demo/index.html` — Catalog of runnable demos, one per attribute/feature (`npm run dev:demo`)

---

If you would like additional sections (API reference, diagrams, more examples), tell me what to include and I will expand the README.
