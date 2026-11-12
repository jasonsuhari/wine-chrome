import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const EXT = path.resolve(HERE, process.env.EXT || '../dist/wine')
const FIXTURES = path.join(HERE, 'fixtures')
const OUT = path.resolve(HERE, 'out/check')
const PROFILE = path.resolve(HERE, '.profile-check')
const exe = process.env.CHROME_PATH || chromium.executablePath()

const server = createServer((req, res) => {
  const file = path.join(FIXTURES, path.normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''))
  if (!file.startsWith(FIXTURES)) return res.writeHead(403).end()
  try {
    const body = readFileSync(file)
    res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' }).end(body)
  } catch { res.writeHead(404).end() }
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

mkdirSync(OUT, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: exe, channel: 'chromium', headless: true, colorScheme: 'dark',
  viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1, ignoreDefaultArgs: ['--hide-scrollbars'],
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
await new Promise(r => setTimeout(r, 1500))
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto(`${base}/cases.html`, { waitUntil: 'load' })
await page.waitForSelector('style.darkreader', { state: 'attached', timeout: 10000 }).catch(() => console.log('Wine did not apply'))
await page.waitForTimeout(1500)
const results = await page.evaluate(() => window.wineCases())
await page.screenshot({ path: `${OUT}/cases.png`, fullPage: true })
await ctx.close()
server.close()

let failed = 0
for (const { name, pass, detail } of results) {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}  ${detail}`)
}
console.log(`\n${results.length - failed} of ${results.length} pass. Screenshot: ${OUT}/cases.png`)
process.exit(failed ? 1 : 0)
