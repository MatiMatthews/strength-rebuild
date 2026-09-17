import { expect, type Page, type TestInfo } from '@playwright/test';

// Measure rendered static content on real surfaces. Interactive states have a
// separate contract; don't treat a scan of these labels as their acceptance.
export async function inspectContent(page: Page, info: TestInfo, name: string) {
  const pairs = await page.evaluate(() => {
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255)
        .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    };
    const results: { text: string; foreground: string; background: string; ratio: number; minimum: number }[] = [];
    for (const element of document.querySelectorAll('div, span, p, h1, h2, label, svg')) {
      if (element.closest('[role="button"], [role="radio"], [role="checkbox"], [role="tab"], button, input, [aria-hidden="true"]')) continue;
      if (!element.getClientRects().length || getComputedStyle(element).visibility !== 'visible') continue;
      const icon = element.tagName.toLowerCase() === 'svg';
      const text = icon ? element.getAttribute('class') ?? 'icon' : Array.from(element.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
      if (!text) continue;
      let ancestor: Element | null = element;
      let background = '';
      while (ancestor) {
        background = getComputedStyle(ancestor).backgroundColor;
        if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') break;
        ancestor = ancestor.parentElement;
      }
      if (!ancestor) throw Error(`No explicit background for ${text}`);
      const foreground = icon ? getComputedStyle(element).stroke : getComputedStyle(element).color;
      const a = luminance(foreground), b = luminance(background);
      results.push({ text, foreground, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), minimum: icon ? 3 : 4.5 });
    }
    return results;
  });
  expect(pairs.length).toBeGreaterThan(0);
  await info.attach(`${name}-contrast`, { body: JSON.stringify(pairs, null, 2), contentType: 'application/json' });
  expect(pairs.filter(pair => pair.ratio < pair.minimum), name).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}
