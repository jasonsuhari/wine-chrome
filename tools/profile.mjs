import { chromium } from 'playwright-core'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PAGES } from './perf-pages.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const EXT = path.resolve(HERE, '../dist/wine')
const exe = process.env.CHROME_PATH || chromium.executablePath()
const key = process.argv[2] || 'ghpr'
const SETTLE = Number(process.env.SETTLE || 6000)
const SCROLLS = Number(process.env.SCROLLS || 0)
const TOP = Number(process.env.TOP || 40)

const profile = path.resolve(HERE, '.profile-prof')
rmSync(profile, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: exe, channel: 'chromium', headless: true, colorScheme: 'dark',
  viewport: { width: 1384, height: 800 }, deviceScaleFactor: 1, locale: 'en-US',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
await new Promise(r => setTimeout(r, 2500))
const har = path.resolve(HERE, `out/har/${key}.har.zip`)
if (existsSync(har)) await ctx.routeFromHAR(har, { url: '**/*', notFound: 'fallback' })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
await cdp.send('Profiler.start')
try { await page.goto(PAGES[key], { waitUntil: 'load', timeout: 45000 }) } catch {}
await page.waitForTimeout(SETTLE)
for (let i = 0; i < SCROLLS; i++) { await page.mouse.wheel(0, 1600); await page.waitForTimeout(600) }
const { profile: p } = await cdp.send('Profiler.stop')
await ctx.close()
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(p))

const byId = new Map(p.nodes.map(n => [n.id, n]))
const parent = new Map()
for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id)
const dt = new Map()
for (let i = 0; i < p.samples.length; i++) dt.set(p.samples[i], (dt.get(p.samples[i]) || 0) + (p.timeDeltas[i + 1] ?? 0))
const isExt = n => n.callFrame.url.startsWith('chrome-extension://')
const label = n => `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber + 1}`
const self = new Map(), total = new Map()
let extTotal = 0, all = 0
for (const [id, t] of dt) {
  all += t
  let n = byId.get(id)
  const own = n
  let firstExt = null
  const seen = new Set()
  let cur = n, underExt = false
  while (cur) {
    if (isExt(cur)) {
      underExt = true
      if (!firstExt) firstExt = cur
      const l = label(cur)
      if (!seen.has(l)) { seen.add(l); total.set(l, (total.get(l) || 0) + t) }
    }
    cur = byId.get(parent.get(cur.id))
  }
  if (underExt) {
    extTotal += t
    const l = isExt(own) ? label(own) : `${own.callFrame.functionName || own.callFrame.url.slice(0, 30) || '(native)'} <- ${label(firstExt)}`
    self.set(l, (self.get(l) || 0) + t)
  }
}
const f = us => (us / 1000).toFixed(1).padStart(8)
console.log(`page ${key}: sampled ${f(all)} ms, under extension ${f(extTotal)} ms`)
console.log('--- self')
for (const [l, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(f(t), l)
console.log('--- inclusive')
for (const [l, t] of [...total].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(f(t), l)
