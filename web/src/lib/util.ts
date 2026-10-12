// Dinero (céntimos enteros), fechas en America/Lima y precios del catálogo.
import type { Opcion, Producto } from './types'

export const TZ = 'America/Lima'
export const c = (soles: number | null | undefined) => Math.round(Number(soles || 0) * 100)
export const s = (cents: number) => Math.round(cents) / 100
const nf = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const soles = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `S/ ${nf.format(n)}`)

export function hoyLima(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function sumarDias(fecha: string, n: number) {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const hora = (iso: string) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '')
export const fechaHora = (iso: string) => (iso ? new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '')
export const fechaCorta = (f: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(f + 'T12:00:00Z'))

export type Preset = 'hoy' | 'ayer' | '7d' | 'mes' | 'mesAnterior'
export function rangoPreset(p: Preset, hoy = hoyLima()): { desde: string; hasta: string } {
  if (p === 'hoy') return { desde: hoy, hasta: hoy }
  if (p === 'ayer') { const a = sumarDias(hoy, -1); return { desde: a, hasta: a } }
  if (p === '7d') return { desde: sumarDias(hoy, -6), hasta: hoy }
  const ini = hoy.slice(0, 8) + '01'
  if (p === 'mes') return { desde: ini, hasta: hoy }
  const finAnt = sumarDias(ini, -1)
  return { desde: finAnt.slice(0, 8) + '01', hasta: finAnt }
}

/* ---------- Precio de una línea (mismo criterio que calcularLineas_ en Code.gs) ---------- */
export interface LineaCarrito { key: string; productoId: string; varianteId: string; extras: string[]; cantidad: number; nota: string }
export type Vendible = { ok: true } | { ok: false; motivo: string }

export function variantesDe(p: Producto, ops: Opcion[]) { return ops.filter(o => o.productoId === p.id && o.tipo === 'variante' && o.activo).sort(porOrden) }
export function extrasDe(p: Producto, ops: Opcion[]) { return ops.filter(o => o.productoId === p.id && o.tipo === 'extra' && o.activo).sort(porOrden) }
export const porOrden = (a: { orden: number | null }, b: { orden: number | null }) => (a.orden ?? 999) - (b.orden ?? 999)

/** Se puede vender si está activo, no agotado y tiene precio propio o variantes con precio. */
export function vendible(p: Producto, ops: Opcion[]): Vendible {
  if (!p.activo) return { ok: false, motivo: 'Inactivo' }
  if (p.agotado) return { ok: false, motivo: 'Agotado' }
  if (!variantesDe(p, ops).length && !(p.precio && p.precio > 0)) return { ok: false, motivo: 'Precio por configurar' }
  return { ok: true }
}

export function precioUnitarioC(l: LineaCarrito, prods: Map<string, Producto>, ops: Map<string, Opcion>): number | null {
  const p = prods.get(l.productoId)
  if (!p) return null
  let base: number | null
  if (l.varianteId) { const v = ops.get(l.varianteId); base = v && v.activo ? v.precio : null }
  else base = p.precio
  if (base === null || base === undefined) return null
  let extras = 0
  for (const id of l.extras) { const e = ops.get(id); if (!e || !e.activo) return null; extras += c(e.precio) }
  return c(base) + extras
}

/** CSV con separador ";" (Excel en español lo abre en columnas) y BOM para tildes. */
export function csv(filas: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    const seguro = /^[=+\-@]/.test(t) && typeof v === 'string' ? "'" + t : t
    return /[";\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
  }
  return '﻿' + filas.map(f => f.map(esc).join(';')).join('\r\n')
}
export function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
