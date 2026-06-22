# Haori.js

Haori.js is a lightweight, HTML-first UI library that enables dynamic user interfaces primarily through HTML attributes. It lets you declare data bindings, conditional rendering, list rendering, form two-way binding, server fetches, and HTML imports without writing much JavaScript.

Version: 0.22.3

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
- `data-unauthorized-redirect` / `data-forbidden-redirect` — auth guard declared on `<body>`/`<html>`. When a Haori fetch responds 401/403, navigate to the given URL (expressions allowed). Applies to all fetch paths (`data-fetch`, event fetches, `data-import`); per-status opt-in. Pair with `*-return-param="name"` to auto-append the current `pathname+search+hash` as a return query for post-login restoration (an existing same-name query on the target URL wins).
- `data-{event}-redirect-return-param="name"` — the symmetric receiver side. On a successful procedure, resolve the post-redirect destination from the given URL query, navigating there only when it is a safe same-origin local path (open-redirect protection is built in); otherwise fall back to `data-{event}-redirect`. Used with the auth guard's `*-return-param`, append → consume becomes symmetric and the hand-written validation JS is no longer needed.

Additional binding helpers:

- `data-derive` / `data-derive-name` — define a derived value on an element and expose it to descendants only. This is useful for cases such as parent-child selects.
- `data-*-bind-merge` (e.g. `data-click-bind-merge`, `data-fetch-bind-merge`) — when binding a result to a target element, shallow-merge it into the target's existing `data-bind` (keys not present in the new data are preserved) instead of replacing the whole binding. Useful for patching a single computed key (such as `selectedId={{items[0].id}}`) into existing state.

Event-driven actions:

- `data-click-*`, `data-change-*`, `data-input-*`, `data-load-*`, `data-intersect-*` declare actions (fetch, bind, copy, dialog control, etc.) triggered by click, form change, incremental input, element load, and viewport intersection respectively. `data-load-*` also fires when a `data-if` element transitions from hidden to shown (the `haori:show` timing), so it works on elements like `<button>` that never receive a native `load` event.
- `data-input-*` — run a procedure on each keystroke (the `input` event) for text inputs. Because `input` fires incrementally, only elements that explicitly declare a `data-input-*` attribute are handled (opt-in); like `change`, it auto-detects the ancestor form and reflects the value into two-way bindings. Useful for incremental search filtering (e.g. `<input name="q" data-input-form>`).
- `data-on="eventName"` + `data-on-*` — run a procedure when an arbitrary **custom event** dispatched on `window` / `document` fires (the action vocabulary is shared with `data-{event}-*`). Lets you declaratively initialize on events other than the built-ins, e.g. a native-bridge ready signal (`<body data-on="appReady" data-on-fetch="/api/init.json" data-on-bind="#app">`). The event name is held in the attribute value (attribute names are lowercased), a single `window` capture subscription receives both `window`- and `document`-dispatched events without double-firing, and elements inserted later are picked up too. Built-in names (click/change/input/load) are warned and not subscribed. Note: events dispatched before Haori subscribes are not received (no replay).
- `data-click-copy-source` — explicitly set the copy source element for `data-click-copy` (defaults to the form given by `data-click-form`, otherwise the event element's binding).
- `data-click-no-disabled` / `data-click-defer` — coexistence helpers for other libraries. `no-disabled` runs the click procedure without adding the `disabled` attribute (so libraries/CSS that ignore disabled elements, e.g. Bootstrap collapse, keep working; double execution is still prevented internally). `defer` runs the click procedure on the next frame (`requestAnimationFrame`/`setTimeout(0)`) so other libraries' synchronous click handlers complete first. Avoid `defer` on `<a href>` / `type="submit"` because the deferred procedure cannot `preventDefault()` the default action.
- `data-{event}-prevent` (e.g. `data-click-prevent`) — suppress the browser's native default action for the event (form submission for a `type="submit"` button, navigation for `<a href>`). `preventDefault()` is called synchronously during the click, so it works even together with `data-click-defer`, and `stopPropagation()` is never called (other libraries' event propagation is unaffected). This lets you keep `type="submit"` and still attach `data-click-fetch` etc. without the page reloading.
- `data-{event}-run` (e.g. `data-click-run`, `data-change-run`) — run arbitrary JavaScript on the event without a fetch. The value is executed as real JS via `new Function` (like `-before-run`/`-after-run`), with `{{...}}` expanded at render time and `event` passed as an argument. Returning `false` calls `event.preventDefault()` (the `onclick="return false"` convention). **Security:** the expanded `{{...}}` is concatenated into executable code, so only interpolate trusted values (numeric indexes, IDs you control) — never untrusted strings (API/user input), which would run as code (XSS). Pass untrusted values via `data-bind` and read them inside the called function instead.

Lifecycle events:

- `haori:eachupdate` — fired on the `data-each` element after a list diff completes; all added/removed/reordered rows are in the DOM and their content (`{{...}}`) is rendered by the time it fires, so it can be used to detect render completion (`detail`: `added`, `removed`, `order`, `total`).
- `haori:bindcomplete` — fired on the target element after a `data-*-bind` / `data-*-bind-arg` bind and the subsequent re-evaluation of its subtree complete (`detail.bindArg`).
- `haori:show` / `haori:hide` — fired when a `data-if` element becomes shown or hidden.

Built-in helpers are available in expressions under the reserved namespace `haori`: `haori.date(value, format?, timeZone?)` formats an ISO string / epoch ms / `Date` (default `yyyy/MM/dd HH:mm`; local time, or a given IANA time zone such as `'Asia/Tokyo'` when `timeZone` is passed), `haori.number(value, decimals?)` formats numbers with grouping, `haori.range(start, end?, step?)` builds an integer array (end-exclusive), and `haori.pages(totalPages, current, {window?, boundary?})` builds an ellipsis-aware page list (`current` is 0-based; each item exposes `{page, label, active, ellipsis}` with `label` = `page + 1`). For month-based UIs, `haori.monthAdd(value, delta)` adds months to a `YYYY-MM` string (timezone-safe integer math; invalid input returns `''`) and `haori.monthRange(count, base?)` builds a descending list of `count + 1` `{targetMonth, label}` items (`base` defaults to the current month). For pagination summaries, `haori.pageSummary(page, visibleCount?)` turns a Spring-style `Page` (`number`, `size`, `totalElements` / `totalCount`) into `{start, end, total, empty}`. `haori.findBy(array, key, value)` returns the first array element whose `item[key]` matches `value` (stringified comparison), or `null` when none match. `haori.sum(array, key?)` returns the numeric total of an array (the elements themselves when `key` is omitted, or `item[key]`; non-numeric values are ignored; non-arrays yield `0`). `haori.distinct(array, key?)` removes duplicates (by the element itself, or by `item[key]`; stringified comparison, first occurrence kept) and `haori.groupBy(array, key)` groups into `{key, items}` entries (first-seen order) — handy for collapsing detail rows into one row per key or rendering grouped lists with nested `data-each`. These let you build number pagination (`data-each="haori.pages(totalPages, number, {window: 2})"`), format values (`{{ haori.date(lastUpdatedAt, 'yyyy/MM/dd HH:mm') }}`), and total rows (`{{ haori.number(haori.sum(rows, 'total')) }}`) declaratively. The same functions are exposed as `Haori.date` / `Haori.number` / `Haori.range` / `Haori.pages` / `Haori.monthAdd` / `Haori.monthRange` / `Haori.pageSummary` / `Haori.findBy` / `Haori.sum` / `Haori.distinct` / `Haori.groupBy`. `haori` is reserved: a `data-bind` key of the same name does not shadow the built-ins inside expressions.

To read binding data from JS, use `Haori.Core.getBindingData(element, {resolved?})` — by default it returns the element's own raw binding data (or `null`), and with `resolved: true` it returns the scope with inheritance resolved (the read counterpart to `setBindingData`).

Template expressions support safe JavaScript-like syntax such as property access, bracket access with dynamic indexes, optional chaining, ternary expressions, and method chains including array `map`/`filter` with arrow functions and spread calls. Access to global objects, `eval` or `arguments`, and prototype escape paths such as `constructor`, `__proto__`, `prototype`, `Reflect`, or `Object` is blocked. Because `Object` is blocked, use spread syntax `{...a, ...b}` instead of `Object.assign`; when a blocked identifier is referenced in an expression, a `blocked identifier(s): …` warning is logged to the console.

Helpers for tests and debugging: `waitForRenders()` (also `Haori.waitForRenders()`) resolves once initialization, in-flight fetches, and queued render tasks have all settled — useful for E2E tests. `Haori.Core.dumpScope(element)` returns the scope resolved for an element (`resolved`) and where each key comes from (`sources`); in dev mode a falsy `data-if` also logs its expression and referenced scope automatically.

`data-fetch` and `data-import` are automatically re-evaluated only when their evaluated values change after a binding update. `data-fetch` compares a request signature composed of the resolved URL, HTTP method, headers, and body, while `data-import` compares only the resolved URL. If either attribute contains even one unresolved reference, it is treated as invalid for that evaluation cycle, is not executed, and becomes executable only after a later binding update resolves the reference.

When the browser interprets an attribute during HTML parsing, such as `src` or `value` on `input type="number"`, writing template expressions directly in that attribute can cause warnings or unwanted requests before Haori runs. Use `data-attr-*` for those cases. `data-attr-xxx` updates the matching `xxx` attribute, and to keep input state consistent with the DOM it also synchronizes DOM properties for `value` (text inputs), `checked` (radio / checkbox) and `selected` (option). The `value` property is **not** re-applied to a focused (being-edited) input, so unsaved keystrokes are never rolled back; the committed value is reflected back on `change`.

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

---

If you would like additional sections (API reference, diagrams, more examples), tell me what to include and I will expand the README.
