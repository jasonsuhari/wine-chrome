const WINE_BASE = {r: 0x1a, g: 0x05, b: 0x0b};
const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently: true});

function rgba(css) {
  if (!css || css === 'none' || css === 'transparent') return {r: 0, g: 0, b: 0, a: 0};
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return {r, g, b, a: a / 255};
}
function hsl({r, g, b}) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return {h: 0, s: 0, l, c: 0};
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return {h: (h + 360) % 360, s, l, c: d};
}
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const style = (sel, prop) => getComputedStyle(document.querySelector(sel)).getPropertyValue(prop);
const color = (sel, prop) => rgba(style(sel, prop));
const isWineHue = (c) => { const {h, c: chroma} = hsl(c); return chroma < 0.02 || h >= 320 || h <= 15; };
const fmt = ({r, g, b, a}) => `rgba(${r},${g},${b},${+a.toFixed(2)})`;
const stops = (sel) => (style(sel, 'background-image').match(/(rgba?|color|oklch|lab|lch|hsl)\([^()]*\)/g) || []).map(rgba);

const CASES = {
  'dark surfaces are never darker than the base and keep their order'() {
    const ls = ['.dark-0', '.dark-1', '.dark-2', '.dark-3'].map((s) => hsl(color(s, 'background-color')).l);
    const base = hsl(WINE_BASE).l;
    const ok = ls[0] >= base - 0.012 && ls.every((l, i) => i === 0 || l > ls[i - 1] + 0.01);
    return [ok, `l=${ls.map((l) => l.toFixed(3)).join(',')} base=${base.toFixed(3)}`];
  },
  'neutral greys become wine'() {
    const cs = ['.warm-grey', '.slate', '.cool-grey', '.pale-blue'].map((s) => color(s, 'background-color'));
    return [cs.every(isWineHue), cs.map(fmt).join(' ')];
  },
  'oklch background becomes dark wine'() {
    const cs = ['.oklch-bg', '.oklch-var-bg', '.oklch-from-var'].map((s) => color(s, 'background-color'));
    return [cs.every((c) => hsl(c).l < 0.3 && isWineHue(c)), cs.map(fmt).join(' ')];
  },
  'hsl() with calc() keeps its hue'() {
    const c = color('.calc-hsl', 'color');
    const bg = color('.calc-hsl-var', 'background-color');
    const {h} = hsl(c);
    const bgHsl = hsl(bg);
    return [h >= 5 && h <= 60 && bgHsl.h >= 5 && bgHsl.h <= 60 && bgHsl.l < 0.35, `${fmt(c)} h=${h.toFixed(0)} bg=${fmt(bg)} h=${bgHsl.h.toFixed(0)}`];
  },
  'light-dark() surfaces become wine'() {
    const cs = ['.ld-bg', '.ld-card'].map((s) => color(s, 'background-color'));
    return [cs.every((c) => isWineHue(c) && hsl(c).c > 0.02 && hsl(c).l < 0.3), cs.map(fmt).join(' ')];
  },
  'relative colour becomes dark'() {
    const c = color('.relative-bg', 'background-color');
    return [hsl(c).l < 0.3, fmt(c)];
  },
  'fade with a var() stop is converted'() {
    const all = [...stops('.fade-var'), ...stops('.fade-fallback')].filter((c) => c.a > 0.05);
    return [all.length > 0 && all.every((c) => hsl(c).l < 0.35), all.map(fmt).join(' ') || style('.fade-var', 'background-image')];
  },
  'link through nested var() is light'() {
    const c = color('.link-nested a', 'color');
    return [hsl(c).l > 0.6, fmt(c)];
  },
  'translucent hairline border stays a valid faint border'() {
    const text = color('.hairline', 'color');
    const borders = [color('.hairline', 'border-right-color'), color('.hairline-logical', 'border-right-color')];
    return [borders.every((b) => b.a < 0.6 && hsl(b).l > 0.15 && dist(b, text) > 1), `borders=${borders.map(fmt).join(' ')} text=${fmt(text)}`];
  },
  'light-dark() lowered to toggle vars stays valid'() {
    const text = color('.toggle-border', 'color');
    const border = color('.toggle-border', 'border-right-color');
    const bg = color('.toggle-bg', 'background-color');
    return [border.a < 0.6 && dist(border, text) > 1 && bg.a === 1 && hsl(bg).l < 0.3, `border=${fmt(border)} bg=${fmt(bg)} text=${fmt(text)}`];
  },
  'background var holding colour and image keeps both'() {
    const img = style('.btn-shorthand', 'background-image');
    const c = color('.btn-shorthand', 'background-color');
    return [img !== 'none' && hsl(c).s > 0.4, `${fmt(c)} image=${img.slice(0, 30)}`];
  },
  'mask icon keeps a visible colour'() {
    const c = color('.mask-icon', 'background-color');
    return [hsl(c).l > 0.35, fmt(c)];
  },
  'gradient text stays light'() {
    const all = stops('.grad-text');
    return [all.length > 0 && all.every((c) => hsl(c).l > 0.5), all.map(fmt).join(' ')];
  },
  'css-in-js dark button stays dark'() {
    const c = color('.cssinjs-btn', 'background-color');
    return [hsl(c).l < 0.35, fmt(c)];
  },
  'two-tone icons keep two tones'() {
    const a = [color('.two-tone circle', 'fill'), color('.two-tone path', 'fill')];
    const b = [color('.two-tone-white rect', 'fill'), color('.two-tone-white path', 'fill')];
    return [dist(...a) > 50 && dist(...b) > 50, [...a, ...b].map(fmt).join(' ')];
  },
  'svg with default fill is not black'() {
    const c = color('.default-fill path', 'fill');
    return [hsl(c).l > 0.5, fmt(c)];
  },
  'svg fill through a text-colour var is light'() {
    const c = color('.var-fill path', 'fill');
    return [hsl(c).l > 0.5, fmt(c)];
  },
  'display-p3 stroke stays valid and light'() {
    const raws = ['.p3-stroke', '.p3-attr', '.p3-built-attr'].map((s) => style(s, 'stroke'));
    return [raws.every((raw) => raw !== 'none' && hsl(rgba(raw)).l > 0.5), raws.join(' | ')];
  },
  'svg mask contents are untouched'() {
    const rect = color('.mask-rect', 'fill');
    const text = color('.mask-text', 'fill');
    return [hsl(rect).l > 0.95 && hsl(text).l < 0.05, `rect=${fmt(rect)} text=${fmt(text)}`];
  },
  'hidden scrollbar stays hidden'() {
    const el = document.querySelector('.hide-bar');
    const bar = el.offsetHeight - el.clientHeight;
    return [bar === 0, `scrollbar height ${bar}px`];
  },
  'shadow root text has no injected css'() {
    const text = document.querySelector('wine-time').shadowRoot.textContent;
    return [!/[{}]/.test(text), JSON.stringify(text.slice(0, 60))];
  },
  'inline !important colour is converted'() {
    const c = color('.inline-important', 'color');
    return [hsl(c).l > 0.5, fmt(c)];
  },
  'translucent input stands out from its panel'() {
    const panel = color('.panel', 'background-color');
    const input = color('.panel input', 'background-color');
    const mixed = {r: input.r * input.a + panel.r * (1 - input.a), g: input.g * input.a + panel.g * (1 - input.a), b: input.b * input.a + panel.b * (1 - input.a)};
    const delta = Math.abs(hsl(mixed).l - hsl(panel).l);
    return [delta > 0.025, `panel=${fmt(panel)} input=${fmt(input)} delta l=${delta.toFixed(3)}`];
  },
  'unstyled input is wine'() {
    const c = color('.plain-input', 'background-color');
    return [isWineHue(c) && hsl(c).c > 0.02 && hsl(c).l < 0.3, fmt(c)];
  },
};

window.wineCases = () => Object.entries(CASES).map(([name, run]) => {
  try {
    const [pass, detail] = run();
    return {name, pass, detail};
  } catch (e) {
    return {name, pass: false, detail: `threw ${e.message}`};
  }
});
