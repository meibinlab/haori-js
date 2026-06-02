# Haori.js

Haori.js is a lightweight, HTML-first UI library that enables dynamic user interfaces primarily through HTML attributes. It lets you declare data bindings, conditional rendering, list rendering, form two-way binding, server fetches, and HTML imports without writing much JavaScript.

Version: 0.8.0

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

- `data-bind` — set binding data for an element (JSON or parameter format)
- `{{ ... }}` — template expressions (evaluated and inserted)
- `data-if` — show/hide an element based on a condition
- `data-each` — repeat an element for items in an array (`data-each-key`, `data-each-arg`, `data-each-index`)
- `data-attr-xxx` — safely update browser-interpreted attributes such as `src` and `value`
- `data-fetch` — fetch data from a server and bind the result
- `data-import` — load external HTML and insert it
- `data-url-param` — import URL query parameters into bindings

Additional binding helpers:

- `data-derive` / `data-derive-name` — define a derived value on an element and expose it to descendants only. This is useful for cases such as parent-child selects; see `docs/ja/data-derive-confirmation-draft.md` for the design background.
- `data-*-bind-merge` (e.g. `data-click-bind-merge`, `data-fetch-bind-merge`) — when binding a result to a target element, shallow-merge it into the target's existing `data-bind` (keys not present in the new data are preserved) instead of replacing the whole binding. Useful for patching a single computed key (such as `selectedId={{items[0].id}}`) into existing state.

Event-driven actions:

- `data-click-*`, `data-change-*`, `data-load-*`, `data-intersect-*` declare actions (fetch, bind, copy, dialog control, etc.) triggered by click, form change, element load, and viewport intersection respectively. `data-load-*` also fires when a `data-if` element transitions from hidden to shown (the `haori:show` timing), so it works on elements like `<button>` that never receive a native `load` event.

Lifecycle events:

- `haori:eachupdate` — fired on the `data-each` element after a list diff completes; all added/removed/reordered rows are in the DOM and their content (`{{...}}`) is rendered by the time it fires, so it can be used to detect render completion (`detail`: `added`, `removed`, `order`, `total`).
- `haori:bindcomplete` — fired on the target element after a `data-*-bind` / `data-*-bind-arg` bind and the subsequent re-evaluation of its subtree complete (`detail.bindArg`).
- `haori:show` / `haori:hide` — fired when a `data-if` element becomes shown or hidden.

Template expressions support safe JavaScript-like syntax such as property access, bracket access with dynamic indexes, optional chaining, ternary expressions, and method chains including array `map`/`filter` with arrow functions and spread calls. Access to global objects, `eval` or `arguments`, and prototype escape paths such as `constructor`, `__proto__`, `prototype`, or `Reflect` is blocked.

`data-fetch` and `data-import` are automatically re-evaluated only when their evaluated values change after a binding update. `data-fetch` compares a request signature composed of the resolved URL, HTTP method, headers, and body, while `data-import` compares only the resolved URL. If either attribute contains even one unresolved reference, it is treated as invalid for that evaluation cycle, is not executed, and becomes executable only after a later binding update resolves the reference.

When the browser interprets an attribute during HTML parsing, such as `src` or `value` on `input type="number"`, writing template expressions directly in that attribute can cause warnings or unwanted requests before Haori runs. Use `data-attr-*` for those cases. `data-attr-xxx` updates only the matching `xxx` attribute and does not synchronize DOM properties such as `input.value`.

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
- `docs/ja/data-derive-confirmation-draft.md` — Design background for scoped derived bindings and stable parent-child select composition

---

If you would like additional sections (API reference, diagrams, more examples), tell me what to include and I will expand the README.
