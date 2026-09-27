// 規格 §9-1：dist/ 內 JS gzip 總量 ≤ 450KB。用法：npm run build 之後 `node tools/size.mjs`
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const LIMIT_KB = 450
const root = fileURLToPath(new URL('../dist/', import.meta.url))
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.js')) files.push(p)
  }
}
walk(root)
let raw = 0
let gz = 0
for (const f of files) {
  const buf = readFileSync(f)
  const g = gzipSync(buf, { level: 9 }).length
  raw += buf.length
  gz += g
  console.log(`${(buf.length / 1024).toFixed(2).padStart(9)} KB  gzip ${(g / 1024).toFixed(2).padStart(8)} KB  ${f.split(/[\\/]dist[\\/]/)[1]}`)
}
console.log(`TOTAL JS: ${files.length} files, raw ${(raw / 1024).toFixed(2)} KB, gzip ${(gz / 1024).toFixed(2)} KB (limit ${LIMIT_KB} KB)`)
if (!files.length) {
  console.log('FAIL  找不到 dist/ 的 JS，先跑 npm run build')
  process.exit(1)
}
console.log(gz / 1024 <= LIMIT_KB ? 'PASS  JS gzip 總量在上限內' : 'FAIL  JS gzip 總量超過上限')
process.exit(gz / 1024 <= LIMIT_KB ? 0 : 1)
