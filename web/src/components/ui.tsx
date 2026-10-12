import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Ban, Check, CheckCheck, Clock, Flame, Loader2, PackageCheck, ThumbsUp, X } from 'lucide-react'
import type { Estado, EstadoPago } from '../lib/types'
import { ETIQUETA_ESTADO, ETIQUETA_PAGO } from '../lib/types'
import { soles } from '../lib/util'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

type Variante = 'principal' | 'secundario' | 'peligro' | 'fantasma' | 'oscuro'
export function Btn({ variante = 'secundario', grande, cargando, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; grande?: boolean; cargando?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-bold select-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
  const tam = grande ? 'min-h-14 px-5 text-lg' : 'min-h-11 px-4 text-[0.95rem]'
  const v = {
    principal: 'btn-cartel bg-amarillo text-noche',
    oscuro: 'btn-cartel bg-noche text-amarillo',
    secundario: 'border-2 border-linea bg-white text-tinta hover:border-noche',
    peligro: 'border-2 border-e-canc bg-white text-e-canc hover:bg-e-canc-bg',
    fantasma: 'text-tinta hover:bg-black/5',
  }[variante]
  return (
    <button type="button" className={cx(base, tam, v, className)} disabled={rest.disabled || cargando} aria-busy={cargando || undefined} {...rest}>
      {cargando && <Loader2 className="gira size-4" aria-hidden />}
      {children}
    </button>
  )
}

const ICONO_ESTADO: Record<Estado, typeof Clock> = {
  pendiente: Clock, confirmado: ThumbsUp, preparando: Flame, listo: Check, entregado: PackageCheck, cancelado: Ban,
}
const CLASE_ESTADO: Record<Estado, string> = {
  pendiente: 'bg-e-pend-bg text-e-pend', confirmado: 'bg-e-conf-bg text-e-conf', preparando: 'bg-e-prep-bg text-e-prep',
  listo: 'bg-e-listo-bg text-e-listo', entregado: 'bg-e-entr-bg text-e-entr', cancelado: 'bg-e-canc-bg text-e-canc',
}
export function EstadoBadge({ estado, corto }: { estado: Estado; corto?: boolean }) {
  const I = ICONO_ESTADO[estado]
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold whitespace-nowrap', CLASE_ESTADO[estado])}>
      <I className="size-4" aria-hidden />{corto && estado === 'pendiente' ? 'Pendiente' : ETIQUETA_ESTADO[estado]}
    </span>
  )
}
const CLASE_PAGO: Record<EstadoPago, string> = {
  pendiente: 'border-e-pend text-e-pend', parcial: 'border-e-pend text-e-pend', pagado: 'border-e-listo text-e-listo',
  devolucion_pendiente: 'border-e-canc text-e-canc', devuelto: 'border-e-entr text-e-entr', sin_cobro: 'border-e-entr text-e-entr',
}
export function PagoBadge({ estado }: { estado: EstadoPago }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border-2 bg-white px-2 py-0.5 text-sm font-bold whitespace-nowrap', CLASE_PAGO[estado])}>
      {estado === 'pagado' ? <CheckCheck className="size-4" aria-hidden /> : null}{ETIQUETA_PAGO[estado]}
    </span>
  )
}

export const Dinero = ({ v, className }: { v: number | null | undefined; className?: string }) => <span className={cx('tabular whitespace-nowrap', className)}>{soles(v)}</span>

export function Campo({ etiqueta, ayuda, error, children, className }: { etiqueta: string; ayuda?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-sm font-bold text-gris">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-sm text-gris">{ayuda}</span>}
      {error && <span className="text-sm font-bold text-e-canc">{error}</span>}
    </label>
  )
}
const control = 'min-h-12 w-full min-w-0 rounded-xl border-2 border-linea bg-white px-3 text-base text-tinta focus:border-noche'
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(control, className)} {...p} />
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(control, 'cursor-pointer', className)} {...p}>{children}</select>
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx(control, 'min-h-20 py-2', className)} {...p} />

/** Selector de opciones visibles (botones grandes). Funciona con dedo, mouse y teclado. */
export function Opciones<T extends string>({ valor, onCambio, opciones, etiqueta, className }:
  { valor: T; onCambio: (v: T) => void; opciones: { v: T; t: ReactNode }[]; etiqueta: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={cx('flex flex-wrap gap-2', className)}>
      {opciones.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} onClick={() => onCambio(o.v)}
          className={cx('min-h-11 rounded-xl border-2 px-3 font-bold cursor-pointer',
            valor === o.v ? 'border-noche bg-noche text-amarillo' : 'border-linea bg-white text-tinta hover:border-noche')}>
          {o.t}
        </button>
      ))}
    </div>
  )
}

export function Modal({ abierto, onCerrar, titulo, children, pie, ancho = 'max-w-lg' }:
  { abierto: boolean; onCerrar: () => void; titulo: string; children: ReactNode; pie?: ReactNode; ancho?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (abierto && !d.open) d.showModal()
    if (!abierto && d.open) d.close()
  }, [abierto])
  return (
    <dialog ref={ref} onCancel={e => { e.preventDefault(); onCerrar() }} aria-label={titulo}
      className="m-0 mt-auto w-full sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-none">
      {abierto && (
        <div className={cx('mx-auto flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', ancho)}>
          <div className="flex items-center gap-3 border-b-2 border-linea px-5 py-3">
            <h2 className="titulo min-w-0 flex-1 text-lg">{titulo}</h2>
            <button type="button" onClick={onCerrar} className="grid size-11 place-items-center rounded-xl hover:bg-black/5 cursor-pointer" aria-label="Cerrar">
              <X className="size-6" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {pie && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t-2 border-linea px-5 py-3">{pie}</div>}
        </div>
      )}
    </dialog>
  )
}

/* ---------- Confirmación de operaciones delicadas ---------- */
interface Pregunta { titulo: string; texto: ReactNode; ok: string; peligro?: boolean; resolver: (v: boolean) => void }
let abrirPregunta: ((p: Pregunta) => void) | null = null
export function confirmar(p: Omit<Pregunta, 'resolver'>): Promise<boolean> {
  return new Promise(resolver => (abrirPregunta ? abrirPregunta({ ...p, resolver }) : resolver(window.confirm(String(p.titulo)))))
}
export function Confirmador() {
  const [p, setP] = useState<Pregunta | null>(null)
  useEffect(() => { abrirPregunta = setP; return () => { abrirPregunta = null } }, [])
  const cerrar = (v: boolean) => { p?.resolver(v); setP(null) }
  return (
    <Modal abierto={!!p} onCerrar={() => cerrar(false)} titulo={p?.titulo ?? ''}
      pie={<><Btn onClick={() => cerrar(false)}>Volver</Btn><Btn variante={p?.peligro ? 'oscuro' : 'principal'} onClick={() => cerrar(true)}>{p?.ok}</Btn></>}>
      <div className="text-base leading-relaxed">{p?.texto}</div>
    </Modal>
  )
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-linea bg-white/60 px-5 py-8 text-center">
      <p className="text-lg font-bold">{titulo}</p>
      {children && <div className="mt-2 text-gris">{children}</div>}
    </div>
  )
}

export function Seccion({ titulo, accion, children, className }: { titulo: string; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border-2 border-linea bg-white p-4', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

/** Explicación visible de cómo se calcula un indicador (no depende de pasar el mouse). */
export function ComoSeCalcula({ children }: { children: ReactNode }) {
  return (
    <details className="mt-1 text-sm text-gris">
      <summary className="cursor-pointer select-none underline decoration-dotted underline-offset-2">Cómo se calcula</summary>
      <p className="mt-1">{children}</p>
    </details>
  )
}

export function Barra({ valor, max, color = 'bg-naranja' }: { valor: number; max: number; color?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-papel" aria-hidden>
      <div className={cx('h-full rounded-full', color)} style={{ width: `${max > 0 ? Math.max(2, (valor / max) * 100) : 0}%` }} />
    </div>
  )
}
