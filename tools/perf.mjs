import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PAGES } from './perf-pages.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const EXT = path.resolve(HERE, process.env.EXT || '../dist/wine')
const HARS = path.resolve(HERE, 'out/har')
const exe = process.env.CHROME_PATH || chromium.executablePath()
const pick = (process.env.PAGES || Object.keys(PAGES).join(',')).split(',')
const RUNS = Number(process.env.RUNS || 5)
const MODE = process.env.MODE || 'replay'
const ARMS = (process.env.ARMS || 'on').split(',')
const THROTTLE = Number(process.env.THROTTLE || 1)
const SETTLE = Number(process.env.SETTLE || 6000)
const SCROLLS = Number(process.env.SCROLLS || 8)
const SHOTS = process.env.SHOTS
const OUT = process.env.OUT

async function launch(arm) {
  const profile = path.resolve(HERE, `.profile-perf-${arm}`)
  rmSync(profile, { recursive: true, force: true })
  const args = arm === 'on' ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] : ['--disable-extensions']
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: exe, channel: 'chromium', headless: true, colorScheme: 'dark',
    viewport: { width: 1384, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', serviceWorkers: 'block', args,
  })
  await new Promise(r => setTimeout(r, 2500))
  await ctx.addInitScript(() => {
    const w = window.__perf = { longTasks: [], lastWineMutation: 0, wineMutations: 0 }
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) w.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true })
    } catch {}
    const isWine = n => n && n.nodeType === 1 && (n.classList?.contains('darkreader') || [...n.attributes].some(a => a.name.startsWith('data-darkreader-inline')))
    new MutationObserver(records => {
      for (const r of records) {
        const t = r.target.nodeType === 3 ? r.target.parentNode : r.target
        if ((r.type === 'attributes' && r.attributeName.startsWith('data-darkreader')) || isWine(t) || [...r.addedNodes].some(isWine)) {
          w.lastWineMutation = performance.now(); w.wineMutations++
        }
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
  })
  return ctx
}

const metricsOf = async cdp => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
const ms = (a, b, k) => Math.round(((b[k] || 0) - (a[k] || 0)) * 1000)

async function visit(ctx, key, arm, run) {
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable', { timeDomain: 'threadTicks' })
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  const m0 = await metricsOf(cdp)
  try { await page.goto(PAGES[key], { waitUntil: 'load', timeout: 45000 }) } catch (e) { console.error(key, 'load', e.message.slice(0, 80)) }
  await page.waitForTimeout(SETTLE)
  const m1 = await metricsOf(cdp)
  const loadInfo = await page.evaluate(() => ({
    load: Math.round(performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0),
    fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
    lastWine: Math.round(window.__perf.lastWineMutation), wineMutations: window.__perf.wineMutations,
    lt: window.__perf.longTasks.slice(), nodes: document.getElementsByTagName('*').length,
  }))
  if (SHOTS && run === 1) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${key}-${arm}.png` }) }
  for (let i = 0; i < SCROLLS; i++) { await page.mouse.wheel(0, 1600); await page.waitForTimeout(600) }
  await page.waitForTimeout(SCROLLS ? 2000 : 0)
  const m2 = await metricsOf(cdp)
  const after = await page.evaluate(() => ({ lt: window.__perf.longTasks.slice(), lastWine: Math.round(window.__perf.lastWineMutation) }))
  await page.close()
  const tbt = lt => lt.reduce((s, [, d]) => s + Math.max(0, d - 50), 0)
  const scrollLT = after.lt.slice(loadInfo.lt.length)
  return {
    key, arm, run,
    script: ms(m0, m1, 'ScriptDuration'), task: ms(m0, m1, 'TaskDuration'),
    style: ms(m0, m1, 'RecalcStyleDuration'), layout: ms(m0, m1, 'LayoutDuration'),
    longTasks: loadInfo.lt.length, tbt: tbt(loadInfo.lt),
    fcp: loadInfo.fcp, load: loadInfo.load, themedAt: loadInfo.lastWine, themedAfterLoad: Math.max(0, loadInfo.lastWine - loadInfo.load),
    wineMutations: loadInfo.wineMutations, nodes: loadInfo.nodes,
    scrollScript: ms(m1, m2, 'ScriptDuration'), scrollTask: ms(m1, m2, 'TaskDuration'), scrollTbt: tbt(scrollLT),
  }
}

const rows = []
mkdirSync(HARS, { recursive: true })
for (const arm of ARMS) for (const key of pick) {
  const har = `${HARS}/${key}.har.zip`
  if (MODE === 'replay' && !existsSync(har)) throw new Error(`no HAR for ${key}; run MODE=record first`)
  const runs = MODE === 'record' ? 1 : RUNS
  for (let r = 1; r <= runs; r++) {
    const ctx = await launch(arm)
    if (MODE === 'record') await ctx.routeFromHAR(har, { url: '**/*', update: true, updateContent: 'attach', updateMode: 'full' })
    else if (MODE === 'replay') await ctx.routeFromHAR(har, { url: '**/*', notFound: 'fallback' })
    const row = await visit(ctx, key, arm, r)
    rows.push(row); console.log(JSON.stringify(row))
    await ctx.close()
  }
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const fields = ['script', 'task', 'style', 'tbt', 'themedAfterLoad', 'scrollScript', 'scrollTask']
const summary = {}
for (const arm of ARMS) for (const key of pick) {
  const rs = rows.filter(r => r.arm === arm && r.key === key)
  summary[`${key}/${arm}`] = Object.fromEntries(fields.map(f => [f, median(rs.map(r => r[f]))]))
}
for (const arm of ARMS) {
  const total = {}
  for (const f of fields) total[f] = pick.reduce((s, k) => s + summary[`${k}/${arm}`][f], 0)
  summary[`TOTAL/${arm}`] = total
}
console.log('SUMMARY ' + JSON.stringify(summary))
if (OUT) writeFileSync(OUT, JSON.stringify({ rows, summary }, null, 2))
