import { writeFileSync } from 'node:fs'
import { ENGINE } from './palette.mjs'

const literal = v => typeof v === 'string' ? `'${v}'` : String(v)

export function writeEngine(target) {
  const fields = Object.entries(ENGINE).map(([k, v]) => `    ${k}: ${literal(v)},`).join('\n')
  writeFileSync(target, `export const WINE_ENGINE = {\n${fields}\n} as const;\n`)
}
