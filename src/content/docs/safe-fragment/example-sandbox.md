---
title: "<example-sandbox>"
description: "A separate component for running application-authored, executable code samples in an allow-scripts-only iframe. Never for untrusted input."
sidebar:
  order: 7
---

:::danger[Not a way to render untrusted content]
`<example-sandbox>` is a **separate** component for running arbitrary, application-authored, **executable** code examples
(documentation playgrounds, live demos). Never feed it untrusted input. It makes **no safety claim about the code it runs**; its
only guarantee is iframe-level isolation of that code from the host page. Feeding it untrusted input is a misuse, not a bypass of
`<safe-fragment>`.
:::

It does the opposite of `<safe-fragment>` on purpose, which is why it is its own component and why the two never share a trust
model ([ADR 0001](/safe-fragment/decisions/#adr-0001-html-is-data-never-code)).

## Usage

```js
import { registerExampleSandbox } from "@johnhenry/safe-fragment";
registerExampleSandbox();
```

```html
<example-sandbox height="200px">
  <template> console.log("Hello from the sandbox"); document.getElementById("app").textContent = "rendered inside the iframe"; </template>
</example-sandbox>
```

`registerExampleSandbox()` is entirely independent of `registerSafeFragment()`: an application that only needs
`<safe-fragment>` never has to pull it in, and vice versa. Options: `tagName` (default `"example-sandbox"`),
`trustedTypesPolicyName`, and the `document`, `customElementRegistry` and `htmlElementBase` overrides.

The code comes from the `.code` property or a `<template>` child. The `height` attribute sets the iframe's height. `run()`
(re)builds a fresh, isolated iframe running the current code; every run tears down the previous iframe, so runs never share state.

## Isolation

The code runs inside an iframe sandboxed with **only `allow-scripts`**: no `allow-same-origin`, no `allow-top-navigation`, no
`allow-popups`, no `allow-forms`, no `allow-modals`. Without `allow-same-origin` the iframe gets a unique opaque origin, so it
cannot synchronously reach the parent's `document`, cookies or storage. The repository verifies this directly in an isolation
test.

## Messages

The sandbox communicates back through a narrow `postMessage` protocol, surfaced as bubbling events on the element:

| Event | Detail |
| --- | --- |
| `example-sandbox:ready` | none: the iframe is up. |
| `example-sandbox:message` | The payload of a `console` call made by the sandboxed code. |
| `example-sandbox:error` | An error payload, or `{ message }` when there is no code source or the sandbox document could not be set. |

Messages are authenticated by `event.source` identity, not `event.origin`, which is opaque (`"null"`) by design here.

## Trusted Types

Under `require-trusted-types-for 'script'`, add the policy name `safe-fragment-sandbox` to `trusted-types`; see
[Trusted Types and CSP](/safe-fragment/trusted-types-and-csp/).

## Try it

Example 03 in the repository runs a small live code sample in `<example-sandbox>`: console output comes back over `postMessage`,
and the code cannot reach the host page's DOM. See [Examples](/safe-fragment/examples/) for how to run it.
