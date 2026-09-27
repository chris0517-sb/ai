// 規格 §9 裡不用開瀏覽器就能驗的幾條：10（散寫色碼）、11（emoji／CREDITS）、13（index.html）
// 另外核對：危險指令三行＝JARVIS test_dangerous_commands.py 第 17、28、45 行（只讀那個檔，不執行）。
// 用法：node tools/static-checks.mjs   （exit 0＝全過）
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const fails = []
const ok = (msg) => console.log(`PASS  ${msg}`)
const bad = (msg) => {
  fails.push(msg)
  console.log(`FAIL  ${msg}`)
}

const walk = (dir, exts, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

// ── 10. 元件內沒有散寫色碼（.tsx 一個都不准；.ts/.css 只准 tokens.css） ──
{
  const hex = /#[0-9A-Fa-f]{6}\b/g
  const tsx = walk(SRC, ['.tsx'])
  const hits = []
  for (const f of tsx) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.match(hex)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`)
      })
  }
  if (hits.length) bad(`10 .tsx 裡有 6 碼色碼：\n  ${hits.join('\n  ')}`)
  else ok(`10 .tsx 內沒有 6 碼色碼（掃了 ${tsx.length} 個檔）`)
  const others = walk(SRC, ['.ts', '.css']).filter((f) => !f.endsWith('tokens.css'))
  const hits2 = []
  for (const f of others) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.match(/#[0-9A-Fa-f]{3,8}\b/) && !line.trim().startsWith('//') && !line.includes('href')) hits2.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`)
      })
  }
  if (hits2.length) bad(`10+ .ts/.css（tokens.css 以外）有色碼：\n  ${hits2.join('\n  ')}`)
  else ok(`10+ .ts/.css 只有 tokens.css 有色碼（掃了 ${others.length} 個檔）`)
}

// ── 11. 沒有 emoji 圖示；CREDITS.md 列出所有搬來的元件與來源 ──
{
  const emoji = /\p{Extended_Pictographic}/u
  const files = [...walk(SRC, ['.tsx', '.ts', '.css']), join(ROOT, 'index.html')]
  const hits = []
  for (const f of files) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const ch of line) {
          if (emoji.test(ch)) hits.push(`${relative(ROOT, f)}:${i + 1}: U+${ch.codePointAt(0).toString(16).toUpperCase()} ${ch}`)
        }
      })
  }
  if (hits.length) bad(`11 找到 emoji／圖形符號字元：\n  ${hits.join('\n  ')}`)
  else ok(`11 原始碼沒有 emoji（\\p{Extended_Pictographic}，掃了 ${files.length} 個檔）`)
  const credits = join(ROOT, 'CREDITS.md')
  if (!existsSync(credits)) bad('11 CREDITS.md 不存在')
  else {
    const c = readFileSync(credits, 'utf8')
    const need = [
      ['Dot Grid', 'reactbits.dev'],
      ['Decrypted Text', 'reactbits.dev'],
      ['Terminal', 'magicui.design'],
      ['Animated Beam', 'magicui.design'],
      ['Number Ticker', 'magicui.design'],
    ]
    const miss = need.filter(([n, u]) => !c.includes(n) || !c.includes(u))
    const lic = c.includes('Commons Clause') && c.includes('MIT')
    const dated = /2026-09-28/.test(c)
    if (miss.length || !lic || !dated) bad(`11 CREDITS.md 缺：${miss.map((m) => m[0]).join('、') || '—'}${lic ? '' : '／授權'}${dated ? '' : '／取得日期'}`)
    else ok('11 CREDITS.md 列了 5 個搬來的元件（名稱、來源網址、取得日期、授權）')
  }
}

// ── 13. index.html 有 noindex、lang=zh-Hant、title、description ──
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  const checks = [
    ['noindex', /<meta\s+name="robots"\s+content="noindex,\s*nofollow"/i],
    ['lang=zh-Hant', /<html\s+lang="zh-Hant"/i],
    ['title', /<title>楊承翰｜AI 作品<\/title>/],
    ['description', /<meta\s+name="description"\s+content="[^"]+"/i],
    ['theme-color', /<meta\s+name="theme-color"\s+content="#04060A"/i],
  ]
  const miss = checks.filter(([, re]) => !re.test(html)).map(([n]) => n)
  if (miss.length) bad(`13 index.html 缺：${miss.join('、')}`)
  else ok('13 index.html 有 noindex／lang=zh-Hant／title／description／theme-color')
  const dist = join(ROOT, 'dist', 'index.html')
  if (existsSync(dist)) {
    const d = readFileSync(dist, 'utf8')
    const miss2 = checks.filter(([, re]) => !re.test(d)).map(([n]) => n)
    if (miss2.length) bad(`13 dist/index.html 缺：${miss2.join('、')}`)
    else ok('13 dist/index.html 同樣都有')
  }
}

// ── 危險指令三行一字不差（對 JARVIS 測試檔第 17、28、45 行） ──
{
  const testFile = 'C:/Users/USER/.jarvis/scripts/test_dangerous_commands.py'
  if (!existsSync(testFile)) bad('A 讀不到 test_dangerous_commands.py')
  else {
    const lines = readFileSync(testFile, 'utf8').split(/\r?\n/)
    const pyStr = (n) => {
      const m = lines[n - 1].match(/\(\s*"((?:[^"\\]|\\.)*)"/)
      return m ? m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"') : null
    }
    const want = [pyStr(28), pyStr(17), pyStr(45)]
    const content = readFileSync(join(SRC, 'content.ts'), 'utf8')
    const got = [...content.matchAll(/cmd: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\\\/g, '\\'))
    const same = want.length === got.length && want.every((w, i) => w === got[i])
    if (same) ok('A 終端機三條指令＝test_dangerous_commands.py 第 28、17、45 行（逐字相同）')
    else bad(`A 終端機指令跟測試檔不一致\n  測試檔：${JSON.stringify(want)}\n  網站：${JSON.stringify(got)}`)
  }
}

console.log(fails.length ? `\n${fails.length} 項未通過` : '\n全部通過')
process.exit(fails.length ? 1 : 0)
