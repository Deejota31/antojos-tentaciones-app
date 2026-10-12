/**
 * Simulación en memoria de los servicios de Google Apps Script que usa apps-script/Code.gs.
 * Se usa en dos lugares: las pruebas automatizadas (ejecutan el Code.gs real) y el "modo demo" del panel,
 * que corre el mismo backend dentro del navegador sin tocar ninguna hoja real.
 * No reemplaza la validación en Google: cuotas, tiempos, permisos y Drive solo se comprueban allí.
 */

type Cell = unknown

class FakeSheet {
  rows: Cell[][] = []
  writes = 0
  name: string
  constructor(name: string) { this.name = name }
  getName() { return this.name }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i]?.some(v => v !== '' && v !== undefined)) return i + 1
    return 0
  }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0) }
  getMaxRows() { return Math.max(1000, this.rows.length) }
  setFrozenRows() {}
  getRange(r: number, c: number, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc) }
}

class FakeRange {
  private s: FakeSheet; private r: number; private c: number; private nr: number; private nc: number
  constructor(s: FakeSheet, r: number, c: number, nr: number, nc: number) { this.s = s; this.r = r; this.c = c; this.nr = nr; this.nc = nc }
  getValues() {
    return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.s.rows[this.r - 1 + i]?.[this.c - 1 + j] ?? ''))
  }
  setValues(v: Cell[][]) {
    if (v.length !== this.nr || v.some(row => row.length !== this.nc)) throw new Error('The number of rows or columns in the data does not match the range.')
    this.s.writes++
    v.forEach((row, i) => {
      const target = (this.s.rows[this.r - 1 + i] ??= [])
      // Se guarda tal cual (incluido el apóstrofo que protege de fórmulas) para poder verificarlo en pruebas.
      row.forEach((x, j) => { target[this.c - 1 + j] = x })
    })
    return this
  }
  setNumberFormat() { return this }
  clearContent() {
    for (let i = 0; i < this.nr; i++) { const row = this.s.rows[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = '' }
    return this
  }
  setFontWeight() { return this }
  setBackground() { return this }
}

export class FakeSpreadsheet {
  sheets = new Map<string, FakeSheet>([['Sheet1', new FakeSheet('Sheet1')]])
  getId() { return 'ss-demo' }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/ss-demo' }
  getName() { return 'Antojos & Tentaciones - Base de Datos' }
  getSheetByName(n: string) { return this.sheets.get(n) ?? null }
  insertSheet(n: string) { const s = new FakeSheet(n); this.sheets.set(n, s); return s }
  getSheets() { return [...this.sheets.values()] }
  deleteSheet(s: FakeSheet) { this.sheets.delete(s.name) }
  setSpreadsheetTimeZone() {}
  /** Filas de datos (sin encabezado) de una hoja, para inspeccionar en pruebas. */
  datos(n: string) { return (this.sheets.get(n)?.rows ?? []).slice(1).filter(r => r.some(v => v !== '' && v !== undefined)) }
}

/* ---------- SHA-256 síncrono (Utilities.computeDigest es síncrono en Apps Script) ---------- */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2])
export function sha256Bytes(input: string): number[] {
  const msg = new TextEncoder().encode(input)
  const len = msg.length
  const withPad = new Uint8Array(((len + 9 + 63) >> 6) << 6)
  withPad.set(msg)
  withPad[len] = 0x80
  const bits = len * 8
  const dv = new DataView(withPad.buffer)
  dv.setUint32(withPad.length - 4, bits >>> 0)
  dv.setUint32(withPad.length - 8, Math.floor(bits / 2 ** 32))
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }
  const out: number[] = []
  for (const x of h) out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255)
  return out.map(b => (b > 127 ? b - 256 : b)) // Apps Script devuelve bytes con signo
}

function formatDate(d: Date, tz: string, fmt: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map(p => [p.type, p.value]))
  return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
}

export interface Backend {
  ss: FakeSpreadsheet
  props: Map<string, string>
  cache: Map<string, string>
  logs: string[]
  /** Llama a doPost como lo haría la web: devuelve el sobre {ok, data|error}. */
  post(action: string, payload?: unknown, sesion?: string): { ok: boolean; data?: any; error?: { code: string; message: string; detalle?: any } }
  get(): { ok: boolean; data?: any }
  setup(): void
  cargarDemo(): Record<string, number>
  borrarDatos(): Record<string, number>
  fijarClave(clave: string): void
  fallarEn(paso: string): void
  reloj(fn: (() => number) | null): void
  ocuparLock(ocupado: boolean): void
}

export interface BackendOpts { uuid?: () => string }

/** Ejecuta el texto de Code.gs dentro de la simulación. */
export function crearBackend(code: string, opts: BackendOpts = {}): Backend {
  const ss = new FakeSpreadsheet()
  const props = new Map<string, string>()
  const cache = new Map<string, string>()
  const logs: string[] = []
  let lockLibre = true
  let n = 0
  const uuid = opts.uuid ?? (() => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`))
  const fotos: string[] = []
  const env: Record<string, unknown> = {
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k: string) => props.get(k) ?? null,
      setProperty: (k: string, v: string) => { props.set(k, String(v)) },
      deleteProperty: (k: string) => { props.delete(k) },
      getProperties: () => Object.fromEntries(props),
    }) },
    CacheService: { getScriptCache: () => ({
      get: (k: string) => cache.get(k) ?? null,
      getAll: (ks: string[]) => Object.fromEntries(ks.filter(k => cache.has(k)).map(k => [k, cache.get(k)])),
      put: (k: string, v: string) => { cache.set(k, String(v)) },
      putAll: (o: Record<string, string>) => Object.entries(o).forEach(([k, v]) => cache.set(k, v)),
      remove: (k: string) => { cache.delete(k) },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => lockLibre, releaseLock: () => {} }) },
    Utilities: {
      getUuid: uuid,
      formatDate,
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg: string, s: string) => sha256Bytes(s),
      base64Decode: (s: string) => Array.from(atob(s), c => c.charCodeAt(0)),
      newBlob: (bytes: number[], mime: string, name: string) => ({ bytes, mime, name }),
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      createFolder: (name: string) => ({ getId: () => 'carpeta-' + name.length, createFile: (b: { name: string }) => {
        fotos.push(b.name)
        return { getId: () => 'foto' + fotos.length, setSharing: () => {} }
      } }),
      getFolderById: () => { throw new Error('No encontrado') },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => s }) },
    Logger: { log: (s: string) => { logs.push(String(s)) } },
    console: { error: () => {}, warn: () => {}, log: () => {} },
  }
  const names = Object.keys(env)
  const expose = `;return { doPost: doPost, doGet: doGet, setup: setup, restablecerClave: restablecerClave, cargarDemo: cargarDemo, borrarDatos: borrarDatos,
    fijarClave: fijarClave_, set: function (k, v) { if (k === 'F') FALLAS_PRUEBA = v; if (k === 'R') RELOJ_PRUEBA = v; } };`
  // eslint-disable-next-line no-new-func
  const api = new Function(...names, code + expose)(...names.map(k => env[k]))
  return {
    ss, props, cache, logs,
    post(action, payload = {}, sesion) {
      return JSON.parse(api.doPost({ postData: { contents: JSON.stringify({ action, payload, sesion }) } }))
    },
    get() { return JSON.parse(api.doGet()) },
    setup() { api.setup() },
    cargarDemo() { return api.cargarDemo() },
    borrarDatos() { return api.borrarDatos() },
    fijarClave(clave) { api.fijarClave(clave) },
    fallarEn(paso) { api.set('F', { [paso]: true }) },
    reloj(fn) { api.set('R', fn) },
    ocuparLock(o) { lockLibre = !o },
  }
}
