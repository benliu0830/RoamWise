import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureFullPage } from './browser-capture.mjs';

// Optional QA tool: no browser dependency is added to the shipping app.
const { chromium } = await import(
  pathToFileURL(join(tmpdir(), 'roamwise-browser-qa/node_modules/playwright/index.mjs')).href
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  reducedMotion: 'reduce'
});
const page = await context.newPage();
const errors = [];
const overflows = [];
page.on('pageerror', (error) => {
  errors.push(error.stack || error.message);
  console.log('BROWSER ERROR', error.stack || error.message);
});
const output = '.impeccable/review';
await mkdir(output, { recursive: true });
const sizes = [
  ['desktop', 1440, 960],
  ['tablet', 820, 1180],
  ['mobile', 390, 844]
];
async function captures(surface) {
  for (const [name, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureFullPage(page, `${output}/${name}-${surface}.png`);
    await page.screenshot({ path: `${output}/${name}-${surface}-viewport.png` });
    if (surface === 'results' && name === 'mobile')
      console.log(
        'Mobile first result top',
        Math.round((await page.locator('.place-card').first().boundingBox()).y)
      );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) {
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll('main *')]
          .filter(
            (node) =>
              node.getBoundingClientRect().right > innerWidth + 1 &&
              getComputedStyle(node).position !== 'absolute' &&
              !node.closest('.category-chips')
          )
          .slice(0, 12)
          .map((node) => ({
            tag: node.tagName,
            class: node.className,
            right: Math.round(node.getBoundingClientRect().right),
            text: node.textContent.slice(0, 60)
          }))
      );
      overflows.push(`${surface} at ${width}px: ${overflow}px`);
      console.log('OVERFLOW', surface, width, JSON.stringify(offenders));
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
}
try {
  await page.goto('http://localhost:3000/#home');
  await page.locator('#home-destination').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await captures('home');
  await page.locator('#home-destination').focus();
  assert.equal(await page.getByRole('option').count(), 8);
  await page.locator('#home-destination').press('ArrowDown');
  assert(await page.locator('#home-destination').getAttribute('aria-activedescendant'));
  await page.locator('#home-destination').press('Escape');
  assert.equal(await page.locator('#home-destination').getAttribute('aria-expanded'), 'false');
  await page.goto('http://localhost:3000/#tourist');
  await page.locator('#travel-destination').fill('Ottawa, Canada');
  await page.locator('[name=query]').fill('Starbucks');
  await page.locator('#travel-form button[type=submit]').click();
  await page.locator('.branch-group-card').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('.branch-group-card').count(), 1);
  assert((await page.locator('.branch-group-card').textContent()).includes('locations found'));
  await captures('results');
  await page.locator('.branch-group-card').screenshot({ path: `${output}/result-card.png` });
  await page.locator('.branch-group-card h3 a').click();
  await page.locator('.branch-map-disclosure > summary').click();
  await page.locator('#branches-map.leaflet-container').waitFor();
  const count = await page.locator('.place-card').count();
  assert(count > 1, 'Real provider search must discover multiple Starbucks branches');
  assert.equal(await page.locator('.leaflet-marker-icon').count(), count);
  await page.locator('.branch-map-disclosure > summary').click();
  await captures('branches');
  await page.locator('.origin-settings summary').click();
  await page.locator('#origin-input').fill('45.4215, -75.6972');
  await page.locator('#origin-form button[type=submit]').click();
  await page
    .locator('.origin-settings summary')
    .filter({ hasText: 'chosen coordinates' })
    .waitFor();
  await page.locator('.place-card h3 a').first().click();
  await page.locator('#details-facts').waitFor();
  await page.waitForFunction(
    () => !document.querySelector('#detail-status').textContent.includes('Checking'),
    null,
    { timeout: 40000 }
  );
  await page.waitForFunction(
    () => !document.querySelector('#description-status').textContent.includes('Loading'),
    null,
    { timeout: 40000 }
  );
  assert(
    !/official website|visit website|budget|entry cost|ticket price/i.test(
      await page.locator('main').textContent()
    )
  );
  await captures('details');
  await page.locator('#detail-transport').selectOption('transit');
  assert(
    (await page.locator('#detail-directions').getAttribute('href')).includes('travelmode=transit')
  );
  await page.locator('[data-action=favorite]').click();
  await page.locator('[data-action=add]').click();
  await page.goto('http://localhost:3000/#builder');
  assert(!/budget|price|currency/i.test(await page.locator('main').textContent()));
  await page.locator('[data-action=generate]').click();
  await page.locator('.schedule li').first().waitFor({ timeout: 60000 });
  await page.locator('[data-action=save-plan]').click();
  await captures('plan');
  await page.goto('http://localhost:3000/#saved');
  assert.equal(await page.locator('.place-card').count(), 1);
  await page.locator('[data-tab=plans]').click();
  assert.equal(await page.locator('.saved-plan').count(), 1);
  assert(!/budget|price|currency/i.test(await page.locator('main').textContent()));
  await page.goto('http://localhost:3000/#results');
  await page.locator('.advanced-filter-panel > summary').click();
  await page.locator('#hours-filter').selectOption('now');
  const openingLabels = await page.locator('.place-card .opening-status').allTextContents();
  assert(openingLabels.every((label) => label.includes('Open now')));
  await page.locator('[data-action=reset-filters]').first().click();
  await page.locator('.advanced-filter-panel > summary').click();
  await page.locator('#distance-filter').selectOption('1');
  await page.locator('[data-action=view][data-view=map]').click();
  await page.locator('#results-map').waitFor();
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
  assert.equal(overflows.length, 0, `Layout overflows: ${overflows.join('; ')}`);
  console.log(
    `PASS real browser: ${count} Starbucks branches grouped, branch maps/details, manual origin, opening/distance filters, transit directions, favorites, itinerary/save; desktop/tablet/mobile screenshots; no overflow or JavaScript errors.`
  );
} finally {
  await browser.close();
}
