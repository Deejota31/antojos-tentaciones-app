// Genera los íconos PNG de la app instalable (public/icons/) con la tipografía de la marca.
// Uso: CHROMIUM_PATH=/ruta/chromium node scripts/iconos.mjs
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'

const fuente = readFileSync(new URL('../node_modules/@fontsource/bungee/files/bungee-latin-400-normal.woff2', import.meta.url)).toString('base64')
const OUT = new URL('../public/icons/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// "maskable": el contenido se mantiene dentro de la zona segura (80 %) porque Android recorta el borde.
const html = (tam, maskable) => `<!doctype html><html><head><style>
@font-face { font-family: B; src: url(data:font/woff2;base64,${fuente}) format('woff2'); }
html, body { margin: 0; }
.i { width: ${tam}px; height: ${tam}px; background: #1A1022; position: relative; overflow: hidden; }
.t { position: absolute; inset: 0; display: grid; place-items: center; font-family: B; color: #FFD60A;
  font-size: ${Math.round(tam * (maskable ? 0.27 : 0.34))}px; line-height: .9; text-align: center;
  text-shadow: ${Math.max(2, Math.round(tam * 0.022))}px ${Math.max(2, Math.round(tam * 0.022))}px 0 #FF1F8E; padding-bottom: ${Math.round(tam * 0.08)}px; }
.f { position: absolute; left: ${maskable ? '18%' : '0'}; right: ${maskable ? '18%' : '0'}; bottom: ${maskable ? '22%' : '0'}; height: ${Math.round(tam * 0.1)}px;
  background: linear-gradient(90deg, #FFD60A 0 25%, #FF6B00 25% 50%, #FF1F8E 50% 75%, #B6F500 75% 100%); }
</style></head><body><div class="i"><div class="t">A&amp;T</div><div class="f"></div></div></body></html>`

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
const page = await browser.newPage()
for (const [nombre, tam, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, false], ['maskable-512.png', 512, true]]) {
  await page.setViewportSize({ width: tam, height: tam })
  await page.setContent(html(tam, maskable))
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.i').screenshot({ path: OUT + nombre })
  console.log('ok', nombre)
}
await browser.close()
