import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Chromium can wrap a very tall full-page raster at its texture limit. Stitch
// genuine viewport captures instead; no screenshot is enlarged or invented.
export async function captureFullPage(page, path) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height <= 15000) return page.screenshot({ path, fullPage: true });
  const module = await import(
    pathToFileURL(join(tmpdir(), 'roamwise-browser-qa/node_modules/pngjs/lib/png.js')).href
  );
  const PNG = module.PNG || module.default.PNG;
  const { width, height: viewportHeight } = page.viewportSize();
  const positions = await page.evaluate(() =>
    [...document.querySelectorAll('.site-header,.map-panel,.details-aside,.plan-map-aside')].map(
      (node) => {
        const previous = node.style.position;
        node.style.position = 'static';
        return previous;
      }
    )
  );
  const combined = new PNG({ width, height });
  try {
    for (let top = 0; top < height; top += viewportHeight) {
      const scroll = await page.evaluate((y) => {
        window.scrollTo(0, y);
        return window.scrollY;
      }, top);
      const tile = PNG.sync.read(await page.screenshot());
      const sourceTop = top - scroll;
      const rows = Math.min(viewportHeight - sourceTop, height - top);
      PNG.bitblt(tile, combined, 0, sourceTop, width, rows, 0, top);
    }
    await writeFile(path, PNG.sync.write(combined));
  } finally {
    await page.evaluate((styles) => {
      document
        .querySelectorAll('.site-header,.map-panel,.details-aside,.plan-map-aside')
        .forEach((node, i) => {
          node.style.position = styles[i];
        });
      window.scrollTo(0, 0);
    }, positions);
  }
}
