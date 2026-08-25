---
title: Elements
description: <optical-send> and <optical-receive> in practice — properties, events, and the demo's own measured throughput.
---

```sh
npm install @johnhenry/oat-sender @johnhenry/oat-receiver
```

```ts
import { defineOpticalSend } from '@johnhenry/oat-sender';
import { defineOpticalReceive } from '@johnhenry/oat-receiver';

defineOpticalSend();
defineOpticalReceive();
```

## `<optical-send>`

```html
<optical-send id="sender" controls frame-rate="12"></optical-send>
```

```ts
sender.source = file; // Blob, File, or string — starts preparation immediately
```

`source` is a **property setter**, not an attribute you can usefully set in markup for dynamic content — assigning it triggers `prepare()`, which reads the value and begins encoding right away. There's no separate `.start()`.

**Events:**

| Event | Fires when |
| --- | --- |
| `oat-manifest-ready` | The artifact is built and ready to transmit |
| `oat-progress` | Frame-by-frame transmission progress |
| `oat-error` | Anything failed — check `e.detail.error` |

## `<optical-receive>`

```html
<optical-receive id="receiver" controls ui-policy="safe"></optical-receive>
```

**Events:**

| Event | Fires when |
| --- | --- |
| `oat-state-change` | The receiver's internal state machine transitions — `e.detail.state` |
| `oat-artifact` | A verified artifact was reconstructed — the payload is in `e.detail` |
| `oat-ui-proposal` | The sender proposed a UI (see [Security model](/oat/security/) for the accept/downgrade/reject outcomes) |
| `oat-rejected` | The artifact failed verification or was explicitly rejected |
| `oat-unknown-sender` | A digest-valid, signature-valid artifact arrived from a key not yet trusted (trust-on-first-use) — resolve with `trustSenderAndContinue()` or `rejectUnknownSender()` |
| `oat-consent-required` | A UI proposal's policy requires explicit user confirmation before rendering — gated behind `confirmProposal()`/`dismissProposal()` |
| `oat-error` | Anything failed |

## Reactivity: property setters trigger a rebuild, attributes mostly don't

Most receiver configuration (`ui-policy`, `trustedPublicKeys`, `allowUnsafeHtml`, …) is a **property setter that rebuilds the policy engine on write**. If you're driving the receiver from application state, prefer setting properties over toggling attributes — attribute changes after initial construction aren't uniformly observed. This was a real bug found and fixed in the reference demo: the `ui-policy` *attribute* wasn't observed post-construction because every other config path was a property setter and this one wasn't, so switching policy presets at runtime silently did nothing until some other setter happened to trigger a rebuild.

A related fix worth knowing if you call it yourself: **`trustSenderAndContinue()` must go through the `trustedPublicKeys` setter**, not mutate the trust list directly — a direct mutation left `allowUnsafeHtml`'s trust-list-length check stale, so a newly-trusted sender's very first M6 (unsafe-HTML) proposal could downgrade instead of being accepted, even with `allowUnsafeHtml` already opted in. Both packages ship the fix; this is a note for anyone extending the trust flow themselves.

## Measured throughput

The reference demo caps file transfers at 300 KB not because the library requires it, but because effective throughput over 200-byte QR frames at 12fps — after the fountain code's ~30% redundancy overhead — is about **700 KB/min**. That's the number to design a UI's expectations around, not an assumption that optical transfer is fast.
