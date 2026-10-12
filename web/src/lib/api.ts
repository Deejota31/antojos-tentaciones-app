import { z } from 'zod'

/**
 * Cliente de la API de Apps Script. Todo va por POST con text/plain (sin preflight CORS).
 * La sesión es un token emitido por el servidor tras la clave; el servidor lo verifica en cada acción privada.
 */

export class ApiError extends Error {
  code: string
  detalle: any
  constructor(code: string, message: string, detalle?: unknown) { super(message); this.code = code; this.detalle = detalle }
}

export type Transport = (action: string, payload: unknown, sesion?: string) => Promise<unknown>

const envelope = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string(), detalle: z.unknown().optional() }).optional(),
})

// Reintentar es seguro: las altas llevan clave de idempotencia y los cambios de estado son idempotentes.
const REINTENTABLES = new Set(['NETWORK', 'TIMEOUT', 'BUSY', 'HTTP'])
const TIMEOUT_MS = 30_000

export function httpTransport(url: string, fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Transport {
  return async (action, payload, sesion) => {
    let last: ApiError | null = null
    for (let intento = 0; intento < 3; intento++) {
      if (intento) await sleep(1200 * intento)
      try { return await unaVez(url, action, payload, sesion, fetchImpl) } catch (e) {
        last = e instanceof ApiError ? e : new ApiError('NETWORK', 'Sin conexión con el servidor.')
        if (!REINTENTABLES.has(last.code)) throw last
      }
    }
    throw last!
  }
}

async function unaVez(url: string, action: string, payload: unknown, sesion: string | undefined, fetchImpl: typeof fetch) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, sesion }),
      redirect: 'follow',
      signal: ctrl.signal,
    })
  } catch (e) {
    throw (e as Error).name === 'AbortError'
      ? new ApiError('TIMEOUT', 'El servidor tardó demasiado. Revisa tu conexión e intenta de nuevo.')
      : new ApiError('NETWORK', 'Sin conexión con el servidor. Revisa internet e intenta de nuevo.')
  } finally { clearTimeout(timer) }
  if (!res.ok) throw new ApiError('HTTP', `El servidor respondió ${res.status}.`)
  let json: unknown
  try { json = await res.json() } catch {
    throw new ApiError('INVALID_RESPONSE', 'Respuesta inesperada. Verifica que la URL sea la del despliegue /exec con acceso "Cualquier persona".')
  }
  const env = envelope.safeParse(json)
  if (!env.success) throw new ApiError('INVALID_RESPONSE', 'Respuesta con formato inesperado.')
  if (!env.data.ok) throw new ApiError(env.data.error?.code ?? 'SERVER_ERROR', env.data.error?.message ?? 'Error desconocido.', env.data.error?.detalle)
  return env.data.data
}

/* ---------- Conexión y sesión guardadas en este equipo ---------- */
const K_URL = 'at.api'
const K_SES = 'at.sesion'
const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const set = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* modo privado */ } }

export const urlApi = () => get(K_URL) || (import.meta.env.VITE_API_URL as string | undefined) || ''
export const guardarUrlApi = (u: string) => set(K_URL, u.trim() || null)
export const sesionGuardada = () => get(K_SES)
export const guardarSesion = (s: string | null) => set(K_SES, s)

export function nuevaClave(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`
}
