import { test, expect, type Page } from '@playwright/test';

/**
 * Domkit Workshop planet (#/domkit): the real @johnhenry/domkit custom elements. The code editor is form-associated, the combo
 * box pages through a search function, the stylable select reads like a native listbox, the attribute cycler is driven by its
 * own buttons and by <hot-key>s, and the drill menu and shortcut dialog work from the keyboard and script.
 */

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
const mine = (errors: string[]) => errors.filter((e) => !/favicon|fonts\.g|ERR_FAILED|net::|Failed to load resource|orrery\.json|Not allowed to request resource|downloadable font/i.test(e));

async function open(page: Page, hash = '#/domkit') {
  await page.goto('about:blank');
  await page.goto(`./${hash}`);
  await expect(page.locator('.pg-domkit')).toBeVisible();
}
const tab = (page: Page, name: string) => page.locator(`.dk-tablist [data-tab="${name}"]`);

test('code-editor: a form field with validity, reset and FormData', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  await expect(tab(page, 'code-editor')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-ce-tag]')).toContainText('<code-editor name="snippet" language="js"');
  await expect(page.locator('[data-ce-validity]')).toHaveText('true');
  await expect(page.locator('[data-ce-fd]')).toContainText('chars');

  await page.locator('[data-ce-clear]').click();
  await expect(page.locator('[data-ce-validity]')).toHaveText('false');

  const textarea = page.locator('#dk-code textarea');
  await textarea.click();
  await page.keyboard.type('let x = (1');
  await expect(page.locator('[data-ce-log]')).toContainText('input');
  await expect(page.locator('[data-ce-validity]')).toHaveText('true');
  await expect(textarea).toHaveValue('let x = (1)'); // the bracket auto-closed
  await page.locator('[data-ce-form] button[type="submit"]').click();
  await expect(page.locator('[data-ce-submit]')).toContainText('"snippet": "let x = (1)"');

  await page.locator('[data-ce-form] button[type="reset"]').click();
  await expect(textarea).toHaveValue(/function orbit/);

  await page.locator('[data-ce="language"]').selectOption('css');
  await expect(page.locator('#dk-code')).toHaveAttribute('language', 'css');
  await expect(page).toHaveURL(/lang=css/);
  expect(mine(errors), mine(errors).join('\n')).toEqual([]);
});

test('infinite-combo-box: a paged search function, chosen value in the form', async ({ page }) => {
  await open(page, '#/domkit?tab=1');
  await expect(tab(page, 'combo')).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-cb-lat]').fill('0');
  const input = page.locator('#dk-star input');
  await input.click();
  await input.pressSequentially('lyr');
  const options = page.locator('#dk-star [role="option"]:not([data-load-more])');
  await expect(options.first()).toContainText('Lyrae');
  await expect(page.locator('[data-cb-log]')).toContainText('search "lyr"');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cb-value]')).toHaveText('"alp-Lyr"');
  await expect(page.locator('[data-cb-form-data]')).toContainText('star "alp-Lyr"');

  // "alpha" matches 33 designations: the first page is 20, with a cursor for the rest.
  await input.fill('');
  await input.pressSequentially('alpha');
  await expect(page.locator('[data-cb-log]')).toContainText('20 of 33, next cursor "20"');
  await expect(page.locator('#dk-star [role="option"]:not([data-load-more])')).toHaveCount(20);
});

test('stylable-select: rich options that read like a native listbox', async ({ page }) => {
  await open(page, '#/domkit?tab=2');
  const options = page.locator('#dk-select [role="option"]');
  await expect(options).toHaveCount(14);
  await options.nth(1).click();
  await expect(page.locator('[data-ss-current]')).toHaveText('"spintax"');
  await expect(page.locator('[data-ss-log]')).toContainText('change');
  await page.locator('[data-ss-bool="multiple"]').check();
  await options.nth(3).click();
  await expect(page.locator('[data-ss-stats]')).toContainText('select-multiple');
  await expect(page.locator('[data-ss-stats]')).toContainText('["spintax","hashish"]');
  await page.locator('[data-ss-remove]').click();
  await expect(options).toHaveCount(13);
});

test('attribute-cycler: buttons and hot-keys cycle a persisted tone', async ({ page }) => {
  await open(page, '#/domkit?tab=3');
  const card = page.locator('[data-tone-target]');
  await expect(card).toHaveAttribute('data-tone', 'ember');
  await page.locator('[data-ac-next]').click();
  await expect(card).toHaveAttribute('data-tone', 'tide');
  await expect(page.locator('#dk-tone button[value="tide"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#dk-tone button[value="dusk"]').click();
  await expect(card).toHaveAttribute('data-tone', 'dusk');
  expect(await page.evaluate(() => localStorage.getItem('orrery:domkit:tone'))).toBe('dusk');
  await page.locator('.dk-tablist [data-tab="cycler"]').focus();
  await page.keyboard.press(']');
  await expect(card).toHaveAttribute('data-tone', 'ember');
  await page.keyboard.press('[');
  await expect(card).toHaveAttribute('data-tone', 'dusk');
  await page.reload();
  await expect(page.locator('[data-tone-target]')).toHaveAttribute('data-tone', 'dusk');
});

test('drill-menu, swipe-input and the ? shortcut dialog', async ({ page }) => {
  await open(page, '#/domkit?tab=4');
  await page.locator('#dk-drill > button[data-key="alerts"]').click();
  await expect(page.locator('#dk-drill')).toHaveAttribute('screen', 'alerts');
  await expect(page.locator('[data-drill-log]')).toContainText('push "alerts"');
  await page.locator('#dk-drill [data-screen="alerts"] [data-back]').click();
  await expect(page.locator('#dk-drill')).not.toHaveAttribute('screen', /./);
  await page.locator('[data-drill-push]').click();
  await expect(page.locator('#dk-drill')).toHaveAttribute('screen', 'display');

  await page.locator('#dk-moons [role="tab"]').nth(2).click();
  await expect(page.locator('#dk-moons [role="tab"]').nth(2)).toHaveAttribute('aria-selected', 'true');
  // A mouse drag to the left on the card is a swipe: --next selects Callisto.
  const box = (await page.locator('#dk-moons swipe-input:visible').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-swipe-log]')).toContainText('swipe left');
  await expect(page.locator('#dk-moons [role="tab"]').nth(3)).toHaveAttribute('aria-selected', 'true');

  await page.locator('.dk-tablist [data-tab="more"]').focus();
  await page.keyboard.press('?');
  await expect(page.locator('.dk-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dk-dialog')).toBeHidden();
});
