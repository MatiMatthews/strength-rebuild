import { expect, type Locator, type TestInfo } from '@playwright/test';

// Composite the real painted foreground/background through every ancestor's
// opacity. This detects washed-out disabled/pressed labels, not just token pairs.
export async function navigationContrast(locator: Locator, info: TestInfo, name: string) {
  const pairs = await locator.evaluate(root => {
    type Color = [number, number, number, number];
    const parse = (value: string): Color => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      return [values[0]!, values[1]!, values[2]!, values[3] ?? 1];
    };
    const over = (front: Color, back: Color): Color => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      return [0, 1, 2].map(i => alpha ? (front[i]! * front[3] + back[i]! * back[3] * (1 - front[3])) / alpha : 0).concat(alpha) as Color;
    };
    const pixel = (element: Element, initial: Color) => {
      let color = initial;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        color = over(color, parse(style.backgroundColor));
        color[3] *= Number(style.opacity);
      }
      return over(color, [255, 255, 255, 1]);
    };
    const luminance = (color: Color) => {
      const c = color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722;
    };
    return [root, ...root.querySelectorAll('*')].flatMap(element => {
      const icon = element.tagName.toLowerCase() === 'svg';
      const text = icon ? 'icon' : Array.from(element.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
      if (!text || !element.getClientRects().length) return [];
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (Number(style.opacity) === 0 || style.visibility !== 'visible') return [];
      }
      const style = getComputedStyle(element);
      const foreground = pixel(element, parse(icon ? style.stroke : style.color));
      const background = pixel(element, [0, 0, 0, 0]);
      const a = luminance(foreground), b = luminance(background);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
      return [{ text, foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), minimum: icon || large ? 3 : 4.5 }];
    });
  });
  expect(pairs.length).toBeGreaterThan(0);
  await info.attach(name, { body: JSON.stringify(pairs), contentType: 'application/json' });
  expect(pairs.filter(pair => pair.ratio < pair.minimum), name).toEqual([]);
}

export async function progressContrast(locator: Locator, info: TestInfo, name: string) {
  const pairs = await locator.evaluate(root => {
    const luminance = (value: string) => {
      const c = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722;
    };
    return [...root.querySelectorAll('div')].flatMap(element => {
      const color = getComputedStyle(element).backgroundColor;
      if (color === 'rgba(0, 0, 0, 0)') return [];
      let parent = element.parentElement;
      while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
      if (!parent) throw Error('Missing progress surface');
      const background = getComputedStyle(parent).backgroundColor;
      const a = luminance(color), b = luminance(background);
      return [{ color, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }];
    });
  });
  expect(pairs.length).toBeGreaterThan(0);
  await info.attach(name, { body: JSON.stringify(pairs), contentType: 'application/json' });
  expect(pairs.filter(pair => pair.ratio < 3)).toEqual([]);
}
