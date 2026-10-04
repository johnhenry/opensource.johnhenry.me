// The app's entry, as an ordinary no-bundler page would ship it: plain bare imports, resolved by the inline import map
// that mport built (and that the frame's policy allowed by its hash). Ported from mport's examples/app-main.mjs.
import { h, render } from "preact";
import { useState } from "preact/hooks";
import htm from "htm";
import { App } from "./app-view.mjs";

const root = document.getElementById("app");
let sources = [];
try { sources = JSON.parse(document.body.dataset.sources || "[]"); } catch { /* shown as "no sources" */ }
render(h(App({ h, useState, htm }), { sources }), root);

// tell the planet what the import map actually resolved (import.meta.resolve applies this document's map)
const resolved = {};
for (const s of ["preact", "preact/hooks", "htm"]) { try { resolved[s] = import.meta.resolve(s); } catch (e) { resolved[s] = `unresolved: ${e.message}`; } }
parent.postMessage({ mportFrame: { type: "rendered", resolved, text: root.textContent } }, "*");
