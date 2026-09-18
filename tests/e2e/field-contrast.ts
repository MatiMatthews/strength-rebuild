import { expect, type Locator, type TestInfo } from '@playwright/test';
export async function fieldContrast(locator: Locator, info: TestInfo, name: string) {
  const pairs = await locator.evaluate(root => {
    type C = number[];
    const parse = (s: string): C => { const c = s.match(/[\d.]+/g)!.map(Number); return [c[0]!, c[1]!, c[2]!, c[3] ?? 1]; };
    const over = (f: C, b: C): C => { const a = f[3]! + b[3]! * (1-f[3]!); return [0,1,2].map(i => a ? (f[i]!*f[3]! + b[i]!*b[3]!*(1-f[3]!))/a : 0).concat(a); };
    const pixel = (el: Element, color: C): C => { for(let p: Element|null=el;p;p=p.parentElement) { const s=getComputedStyle(p); color=over(color,parse(s.backgroundColor)); color[3]!*=Number(s.opacity); } return over(color,[255,255,255,1]); };
    const lum = (c: C) => { const v=c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]!*.2126+v[1]!*.7152+v[2]!*.0722; };
    const ratio = (a:C,b:C) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const elements=[root,...root.querySelectorAll('*')];
    if(root.matches('input,textarea') && parseFloat(getComputedStyle(root).borderTopWidth)===0) { let parent=root.parentElement; while(parent && parseFloat(getComputedStyle(parent).borderTopWidth)===0) parent=parent.parentElement; if(parent) elements.push(parent); }
    return elements.flatMap(el=>{
      const s=getComputedStyle(el), bg=pixel(el,[0,0,0,0]); if(!el.getClientRects().length)return [];
      const pairs=[];
      if (el.matches('input,textarea')) { pairs.push({kind:'input',ratio:ratio(pixel(el,parse(s.color)),bg),minimum:4.5}); pairs.push({kind:'placeholder',ratio:ratio(pixel(el,parse(getComputedStyle(el,'::placeholder').color)),bg),minimum:4.5}); }
      for(const side of ['top','right','bottom','left']) { const color=s.getPropertyValue(`border-${side}-color`); if(parseFloat(s.getPropertyValue(`border-${side}-width`))>0 && s.getPropertyValue(`border-${side}-style`)!=='none') pairs.push({kind:`boundary-${side}`,ratio:Math.max(ratio(pixel(el,parse(color)),bg),ratio(pixel(el,parse(color)),pixel(el.parentElement!,[0,0,0,0]))),minimum:3}); }
      return pairs;
    });
  });
  expect(pairs.length).toBeGreaterThan(0);
  await info.attach(name,{body:JSON.stringify(pairs),contentType:'application/json'});
  expect(pairs.filter(p=>p.ratio<p.minimum),name).toEqual([]);
}
