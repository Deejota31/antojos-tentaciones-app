// Capturas del panel en modo demostración para celular, tablet y escritorio (docs/bocetos/).
// Uso: npm run build && npx vite preview --port 4173 &  luego  CHROMIUM_PATH=/ruta/chromium npm run bocetos
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const OUT = new URL('../../docs/bocetos/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const equipos = [
  { n: 'celular', w: 390, h: 844, mobile: true },
  { n: 'tablet', w: 1024, h: 768, mobile: true },
  { n: 'escritorio', w: 1440, h: 900, mobile: false },
]
const vistas = (process.env.VISTAS || 'inicio,vender,pedidos,cocina,caja,carta,reportes').split(',')
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--disable-gpu'],
})
for (const e of equipos) {
  const ctx = await browser.newContext({ viewport: { width: e.w, height: e.h }, deviceScaleFactor: 1, isMobile: e.mobile, hasTouch: e.mobile, locale: 'es-PE', timezoneId: 'America/Lima' })
  const page = await ctx.newPage()
  page.on('pageerror', err => console.error(`[${e.n}] error de página:`, err.message))
  await page.goto(BASE + '?demo')
  await page.getByLabel('Clave').fill('demo')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('heading', { name: 'Inicio' }).waitFor()
  await page.waitForTimeout(800)
  for (const v of vistas) {
    await page.evaluate(h => { location.hash = h }, v)
    await page.waitForTimeout(900)
    if (v === 'vender') {
      await page.getByRole('button', { name: /Hamburguesa Doble/ }).first().click()
      await page.getByRole('button', { name: /Broaster Pecho/ }).first().click()
      await page.waitForTimeout(300)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 0) {
      const culpable = await page.evaluate(() => {
        const W = document.documentElement.clientWidth
        const xs = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > W + 1 && !el.closest('.scroll-x'))
        const el = xs[xs.length - 1]
        return el ? `${el.tagName}.${el.className}`.slice(0, 160) + ' :: ' + (el.textContent || '').slice(0, 60) : ''
      })
      console.warn(`[${e.n}/${v}] desplazamiento horizontal de ${overflow}px → ${culpable}`)
    }
    await page.screenshot({ path: `${OUT}${e.n}-${v}.png`, fullPage: process.env.FULL === '1' })
    console.log('ok', e.n, v)
  }
  await ctx.close()
}
await browser.close()
