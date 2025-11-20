# Haori.js

Haori.js is a lightweight, HTML-first UI library that enables dynamic user interfaces primarily through HTML attributes. It lets you declare data bindings, conditional rendering, list rendering, form two-way binding, server fetches, and HTML imports without writing much JavaScript.

Version: 1.0.0

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
- Key features:
	- Data binding via `data-bind`
	- Conditional rendering via `data-if`
	- List rendering via `data-each`
	- Two-way form binding (automatic binding based on `name` attributes)
	- Server fetches via `data-fetch`
	- HTML imports via `data-import`
	- Zero runtime dependencies (uses browser-native APIs)

## Installation

Install from npm:

```bash
npm install haori
```

Via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/haori@1.0.0/dist/haori.iife.js"></script>
```

ES Module import:

```js
import Haori from 'haori'
```

---

## Quick start

You can use Haori with plain HTML. Minimal example:

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>Haori Sample</title>
	<script src="https://cdn.jsdelivr.net/npm/haori@1.0.0/dist/haori.iife.js"></script>
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
import Haori from 'haori'

Haori.mount(document.body, { items: [ { name: 'apple' }, { name: 'orange' } ] })
```

---

## Common attributes (summary)

- `data-bind` — set binding data for an element (JSON or parameter format)
- `{{ ... }}` — template expressions (evaluated and inserted)
- `data-if` — show/hide an element based on a condition
- `data-each` — repeat an element for items in an array (`data-each-key`, `data-each-arg`, `data-each-index`)
- `data-fetch` — fetch data from a server and bind the result
- `data-import` — load external HTML and insert it
- `data-url-param` — import URL query parameters into bindings

For detailed usage and many examples, see the official documentation.

---

## Build & publish (packaging)

Basic build and publish steps in a development environment:

1. Install dependencies

```bash
npm install
```

2. Type-check and build

```bash
npm run compile
# or
npm run build
```

3. Run tests

```bash
npm run test
```

4. Bump version

```bash
npm version patch
```

5. Login to npm and publish

```bash
npm login
npm publish --access public
```

Make sure `package.json` fields `name`, `version`, `description`, `repository` and `license` are correct. Files published to npm are controlled by the `files` field in `package.json` and `.npmignore`.

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

