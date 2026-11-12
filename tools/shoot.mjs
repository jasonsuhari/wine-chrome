import { chromium } from 'playwright-core'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const EXT = path.resolve(HERE, '../dist/wine')
const OUT = path.resolve(HERE, process.env.OUT || 'out/shots')
const PROFILE = path.resolve(HERE, '.profile')
const exe = process.env.CHROME_PATH || chromium.executablePath()
export const SITES = {
  wikipedia: 'https://en.wikipedia.org/wiki/Wine',
  hn: 'https://news.ycombinator.com/',
  pydocs: 'https://docs.python.org/3/library/functions.html',
  mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme',
  github: 'https://github.com/darkreader/darkreader',
  youtube: 'https://www.youtube.com/',
  npm: 'https://www.npmjs.com/package/react',
  bbc: 'https://www.bbc.com/news',
  amazon: 'https://www.amazon.com/',
  apple: 'https://www.apple.com/',
  stripe: 'https://stripe.com/',
  notion: 'https://www.notion.com/',
}
const pick = (process.env.SITES || Object.keys(SITES).join(',')).split(',')
mkdirSync(OUT, { recursive: true })
if (!process.env.KEEP_PROFILE) rmSync(PROFILE, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: exe, channel: 'chromium', headless: true, colorScheme: 'dark',
  viewport: { width: 1384, height: 800 }, deviceScaleFactor: 1, locale: 'en-US',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
await new Promise(r => setTimeout(r, 2500))
const page = ctx.pages()[0] || await ctx.newPage()
for (const key of pick) {
  const visits = Number(process.env.VISITS || 1)
  for (let v = 1; v <= visits; v++) {
    try { await page.goto(SITES[key], { waitUntil: 'domcontentloaded', timeout: 30000 }) } catch (e) { console.log(key, 'load', e.message.slice(0, 80)) }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(3500)
  }
  const state = await page.evaluate(() => ({ dr: document.documentElement.getAttribute('data-darkreader-mode'), tint: !!document.getElementById('wine-tint'), curated: document.documentElement.hasAttribute('data-wine-curated'), bg: getComputedStyle(document.body).backgroundColor })).catch(e => ({ err: e.message.slice(0, 60) }))
  await page.screenshot({ path: `${OUT}/${key}.png` })
  console.log(key, JSON.stringify(state))
}
await ctx.close()
