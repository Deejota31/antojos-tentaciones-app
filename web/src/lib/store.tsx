import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, guardarSesion, httpTransport, sesionGuardada, urlApi, type Transport } from './api'
import { toast } from './toast'
import type { Caja, Categoria, Inicial, Opcion, Producto, Rango } from './types'
import { rangoPreset } from './util'

/**
 * Estado compartido del panel. Los datos viven en Google Sheets; aquí solo hay copias de lectura.
 * - "inicial": configuración + catálogo + caja abierta (se carga una vez; los cambios del catálogo se aplican localmente).
 * - "rango": pedidos, líneas, pagos y gastos del rango elegido (una sola llamada).
 * Ninguna operación se muestra como guardada antes de la respuesta del servidor.
 */

interface Store {
  modo: 'real' | 'demo'
  listo: boolean
  autenticado: boolean
  sesionVencida: boolean
  inicial: Inicial | null
  rango: Rango | null
  sel: { desde: string; hasta: string }
  cargandoRango: boolean
  guardando: number
  ultimoGuardado: string
  call: <T = any>(action: string, payload?: unknown) => Promise<T>
  run: <T>(etiqueta: string, fn: () => Promise<T>, exito?: string | ((r: T) => string)) => Promise<T>
  login: (clave: string) => Promise<void>
  logout: (todas?: boolean) => Promise<void>
  setSel: (r: { desde: string; hasta: string }) => void
  recargarRango: (fresh?: boolean) => Promise<void>
  recargarTodo: () => Promise<void>
  recargarCatalogo: () => Promise<void>
  setCaja: (c: Caja | null) => void
  upsertCategoria: (x: Categoria) => void
  upsertProducto: (x: Producto) => void
  upsertOpcion: (x: Opcion) => void
  setConfig: (cfg: Inicial['config']) => void
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('Sin store'); return s }

const upsert = <T extends { id: string }>(xs: T[], x: T) => (xs.some(y => y.id === x.id) ? xs.map(y => (y.id === x.id ? x : y)) : [...xs, x])

export function StoreProvider({ children, transport: forced }: { children: ReactNode; transport?: Transport }) {
  const [transport, setTransport] = useState<Transport | null>(forced ?? null)
  const [modo, setModo] = useState<'real' | 'demo'>('real')
  const [sesion, setSesion] = useState<string | null>(() => (forced ? null : sesionGuardada()))
  const [sesionVencida, setVencida] = useState(false)
  const [inicial, setInicial] = useState<Inicial | null>(null)
  const [rango, setRango] = useState<Rango | null>(null)
  const [sel, setSelState] = useState(() => rangoPreset('hoy'))
  const [cargandoRango, setCargandoRango] = useState(false)
  const [guardando, setGuardando] = useState(0)
  const [ultimoGuardado, setUltimo] = useState('')
  const sesionRef = useRef(sesion)
  sesionRef.current = sesion
  const pedidoRango = useRef(0)

  // Elegir el transporte: ?demo usa la simulación local; si no, la URL configurada de Apps Script.
  useEffect(() => {
    if (forced) return
    const demo = new URLSearchParams(location.search).has('demo') || urlApi() === 'demo'
    if (demo) {
      setModo('demo')
      void import('./demo').then(m => setTransport(() => m.demoTransport()))
    } else if (urlApi()) setTransport(() => httpTransport(urlApi()))
    else setTransport(null)
  }, [forced])

  const call = useCallback(async <T,>(action: string, payload: unknown = {}): Promise<T> => {
    if (!transport) throw new ApiError('NO_CONFIG', 'Falta configurar la dirección del servidor.')
    try {
      return (await transport(action, payload, sesionRef.current ?? undefined)) as T
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED' && action !== 'login') {
        // La sesión venció: se pide la clave sin desmontar la app, así no se pierde lo que se estaba registrando.
        setVencida(true)
      }
      throw e
    }
  }, [transport])

  const run = useCallback(async <T,>(etiqueta: string, fn: () => Promise<T>, exito?: string | ((r: T) => string)) => {
    setGuardando(n => n + 1)
    try {
      const r = await fn()
      setUltimo(new Date().toISOString())
      if (exito) toast(typeof exito === 'function' ? exito(r) : exito, 'ok')
      return r
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof ApiError && e.code === 'UNAUTHORIZED')) toast(`${etiqueta}: ${msg}`, 'error')
      throw e
    } finally { setGuardando(n => n - 1) }
  }, [])

  const cargarRango = useCallback(async (r: { desde: string; hasta: string }, fresh = false) => {
    const id = ++pedidoRango.current
    setCargandoRango(true)
    try {
      const data = await call<Rango>('rango', { ...r, fresh })
      if (id === pedidoRango.current) setRango(data) // ignora respuestas viejas si se cambió de rango
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'UNAUTHORIZED')) toast(`No se pudieron cargar los pedidos: ${(e as Error).message}`, 'error')
    } finally { if (id === pedidoRango.current) setCargandoRango(false) }
  }, [call])

  const recargarTodo = useCallback(async () => {
    const ini = await call<Inicial>('inicial', { fresh: true })
    setInicial(ini)
    await cargarRango(sel, true)
  }, [call, cargarRango, sel])

  // Al tener transporte y sesión: carga inicial.
  useEffect(() => {
    if (!transport || !sesion) return
    let vivo = true
    call<Inicial>('inicial').then(ini => { if (vivo) { setInicial(ini); setSelState(rangoPreset('hoy', ini.hoy)); void cargarRango(rangoPreset('hoy', ini.hoy)) } })
      .catch(e => { if (!(e instanceof ApiError && e.code === 'UNAUTHORIZED')) toast(e.message, 'error') })
    return () => { vivo = false }
  }, [transport, sesion, call, cargarRango])

  const login = useCallback(async (clave: string) => {
    if (!transport) throw new ApiError('NO_CONFIG', 'Falta configurar la dirección del servidor.')
    const r = (await transport('login', { clave, equipo: navigator.userAgent.slice(0, 100) })) as { sesion: string }
    if (modo === 'real') guardarSesion(r.sesion)
    sesionRef.current = r.sesion
    const recuperada = sesionVencida && inicial
    setSesion(r.sesion)
    setVencida(false)
    if (recuperada) void cargarRango(sel, true)
  }, [transport, modo, sesionVencida, inicial, cargarRango, sel])

  const logout = useCallback(async (todas = false) => {
    try { await call(todas ? 'logoutTodas' : 'logout', {}) } catch { /* igual se cierra aquí */ }
    guardarSesion(null)
    setSesion(null); setInicial(null); setRango(null)
  }, [call])

  const value = useMemo<Store>(() => ({
    modo, listo: !!transport, autenticado: !!sesion, sesionVencida, inicial, rango, sel, cargandoRango, guardando, ultimoGuardado,
    call, run, login, logout,
    setSel: r => { setSelState(r); void cargarRango(r) },
    recargarRango: fresh => cargarRango(sel, fresh),
    recargarTodo,
    recargarCatalogo: async () => { const ini = await call<Inicial>('inicial', { fresh: true }); setInicial(ini) },
    setCaja: caja => setInicial(i => (i ? { ...i, caja } : i)),
    upsertCategoria: x => setInicial(i => (i ? { ...i, categorias: upsert(i.categorias, x) } : i)),
    upsertProducto: x => setInicial(i => (i ? { ...i, productos: upsert(i.productos, x) } : i)),
    upsertOpcion: x => setInicial(i => (i ? { ...i, opciones: upsert(i.opciones, x) } : i)),
    setConfig: config => setInicial(i => (i ? { ...i, config } : i)),
  }), [modo, transport, sesion, sesionVencida, inicial, rango, sel, cargandoRango, guardando, ultimoGuardado, call, run, login, logout, cargarRango, recargarTodo])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
