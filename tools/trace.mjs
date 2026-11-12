import { chromium } from 'playwright-core'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PAGES } from './perf-pages.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const EXT = path.resolve(HERE, '../dist/wine')
const exe = process.env.CHROME_PATH || chromium.executablePath()
const key = process.argv[2] || 'ghpr'
const arm = process.argv[3] || 'on'
const SETTLE = Number(process.env.SETTLE || 6000)

const profile = path.resolve(HERE, `.profile-trace-${arm}`)
rmSync(profile, { recursive: true, force: true })
const args = arm === 'on' ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] : ['--disable-extensions']
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: exe, channel: 'chromium', headless: true, colorScheme: 'dark',
  viewport: { width: 1384, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', serviceWorkers: 'block', args,
})
await new Promise(r => setTimeout(r, 2500))
const har = path.resolve(HERE, `out/har/${key}.har.zip`)
if (existsSync(har)) await ctx.routeFromHAR(har, { url: '**/*', notFound: 'fallback' })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const events = []
cdp.on('Tracing.dataCollected', e => events.push(...e.value))
const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'v8.execute', 'blink.user_timing', 'loading'] }, transferMode: 'ReportEvents' })
try { await page.goto(PAGES[key], { waitUntil: 'load', timeout: 45000 }) } catch {}
await page.waitForTimeout(SETTLE)
await cdp.send('Tracing.end')
await done
await ctx.close()
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ traceEvents: events }))

const main = events.find(e => e.name === 'TracingStartedInBrowser')
const rendererPids = new Map()
for (const e of events) if (e.name === 'thread_name' && e.args?.name === 'CrRendererMain') rendererPids.set(`${e.pid}:${e.tid}`, true)
const byName = new Map()
const count = new Map()
let topTotal = 0
const tops = events.filter(e => e.ph === 'X' && rendererPids.has(`${e.pid}:${e.tid}`) && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask'))
for (const t of tops) topTotal += t.dur || 0
for (const e of events) {
  if (e.ph !== 'X' || !rendererPids.has(`${e.pid}:${e.tid}`)) continue
  if (!['UpdateLayoutTree', 'Layout', 'ParseHTML', 'ParseAuthorStyleSheet', 'EvaluateScript', 'FunctionCall', 'v8.compile', 'v8.compileModule', 'TimerFire', 'FireAnimationFrame', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'Paint', 'PrePaint', 'Layerize', 'HitTest', 'RunMicrotasks', 'v8.run', 'ScheduleStyleRecalculation', 'InvalidateLayout', 'RecalculateStyles', 'UpdateLayerTree', 'Decode Image', 'XHRReadyStateChange', 'EventDispatch'].includes(e.name)) continue
  byName.set(e.name, (byName.get(e.name) || 0) + (e.dur || 0)); count.set(e.name, (count.get(e.name) || 0) + 1)
}
console.log(`${key}/${arm}: main-thread top-level tasks ${(topTotal / 1000).toFixed(0)} ms`)
for (const [n, d] of [...byName].sort((a, b) => b[1] - a[1])) console.log(`${(d / 1000).toFixed(1).padStart(8)} ms ${String(count.get(n)).padStart(6)}x  ${n}`)
const ult = events.filter(e => e.ph === 'X' && e.name === 'UpdateLayoutTree' && rendererPids.has(`${e.pid}:${e.tid}`)).sort((a, b) => b.dur - a.dur).slice(0, 8)
console.log('--- biggest style recalcs (ms, elements, ts)')
for (const e of ult) console.log((e.dur / 1000).toFixed(1).padStart(8), e.args?.elementCount ?? '', Math.round(e.ts / 1000) - Math.round((main?.ts || 0) / 1000), JSON.stringify(e.args?.beginData?.stackTrace?.[0] || '').slice(0, 120))
