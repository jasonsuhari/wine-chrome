import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { writeEngine } from './gen-engine.mjs'

const ENGINE = 'engine'
const OUT = 'dist/wine'
const run = (cmd, args, cwd = '.') => execFileSync(cmd, args, { cwd, stdio: 'inherit' })

writeEngine(`${ENGINE}/src/inject/dynamic-theme/wine-engine.ts`)
run('node', ['--max-old-space-size=3072', 'tasks/cli.js', 'build', '--release', '--chrome-mv3'], ENGINE)

rmSync(OUT, { recursive: true, force: true })
cpSync(`${ENGINE}/build/release/chrome-mv3`, OUT, { recursive: true })

const manifest = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8'))
manifest.name = 'Wine'
manifest.short_name = 'Wine'
manifest.description = 'Every site in deep wine.'
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log('built', OUT)
