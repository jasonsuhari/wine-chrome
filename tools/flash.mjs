import { chromium } from 'playwright-core'
import { rmSync } from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const EXT = path.resolve(HERE, '../dist/wine')
const PROFILE = path.resolve(HERE, '.profile')
const exe = process.env.CHROME_PATH || chromium.executablePath()
const URLS = (process.env.URLS || 'https://github.com/darkreader/darkreader https://en.wikipedia.org/wiki/Wine https://news.ycombinator.com/ https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme').split(' ')
const VISITS = Number(process.env.VISITS || 3)
rmSync(PROFILE, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: exe, channel: 'chromium', headless: true, colorScheme: 'dark',
  viewport: { width: 1384, height: 800 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
await new Promise(r => setTimeout(r, 2500))
const page = ctx.pages()[0] || await ctx.newPage()
await page.addInitScript(() => {
  const frames = window.__frames = []
  const bgAt = (x, y) => { let e = document.elementFromPoint(x, y); while (e) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(.*, 0\)$/.test(c) && c !== 'transparent') return c; e = e.parentElement } return document.documentElement ? getComputedStyle(document.documentElement).backgroundColor : null }
  const tick = () => {
    if (document.body) frames.push([Math.round(performance.now()), bgAt(innerWidth / 2, innerHeight / 2), bgAt(40, innerHeight - 40)])
    if (performance.now() < 8000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const isWine = c => { const m = c && c.match(/[\d.]+/g); if (!m) return false; const [r, g, b] = m.map(Number); return r > g + 4 && r >= b }
const out = []
for (const url of URLS) for (let v = 1; v <= VISITS; v++) {
  try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }) } catch {}
  await page.waitForTimeout(8500)
  const r = await page.evaluate(() => ({ frames: window.__frames, fcp: (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime }))
  const after = r.frames.filter(f => f[0] >= (r.fcp || 0))
  const unthemed = after.filter(f => !(isWine(f[1]) && isWine(f[2])))
  const lastUnthemed = unthemed.length ? unthemed.at(-1)[0] - Math.round(r.fcp || 0) : 0
  const row = { url: url.replace(/^https:\/\//, '').slice(0, 40), visit: v, fcp: Math.round(r.fcp || 0), unthemedMsAfterFcp: lastUnthemed, finalCentre: after.at(-1)?.[1] }
  out.push(row); console.log(JSON.stringify(row))
}
await ctx.close()
