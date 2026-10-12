// @vitest-environment node
// Coherencia entre módulos: los indicadores del motor (Inicio/Reportes) cuadran con la caja calculada por el servidor.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crearBackend } from './lib/fakegas'
import { calcular } from './lib/engine'
import { csv, precioUnitarioC, rangoPreset, sumarDias } from './lib/util'

const CODE = readFileSync(resolve(__dirname, '../../apps-script/Code.gs'), 'utf8')

describe('motor de indicadores', () => {
  it('cuadra ventas, cobros, saldo y caja con los datos reales del backend', () => {
    const b = crearBackend(CODE)
    b.setup(); b.fijarClave('x')
    const ses = b.post('login', { clave: 'x' }).data.sesion
    const k = () => crypto.randomUUID()
    const call = (a: string, p: unknown = {}) => { const r = b.post(a, p, ses); if (!r.ok) throw new Error(r.error!.message); return r.data }
    call('abrirCaja', { clave: k(), fondo: 30 })
    const v1 = call('crearVenta', { clave: k(), lineas: [{ productoId: 'prd-hamb-doble', cantidad: 2 }], pago: { medio: 'Efectivo', monto: 26 } })
    const v2 = call('crearVenta', { clave: k(), canal: 'delivery', direccion: 'x', delivery: 4, lineas: [{ productoId: 'prd-esp-churrasco', cantidad: 1 }], pago: { medio: 'Yape', monto: 10 } })
    const v3 = call('crearVenta', { clave: k(), lineas: [{ productoId: 'prd-brst-pecho', cantidad: 1 }], pago: { medio: 'Plin', monto: 13 } })
    call('cancelarPedido', { pedidoId: v3.id, motivo: 'x', devolucion: 'devuelto', medioDevolucion: 'Plin', clave: k() })
    call('crearVenta', { clave: k(), estado: 'pendiente', lineas: [{ productoId: 'prd-hamb-clasica', cantidad: 1 }] })
    call('crearGasto', { clave: k(), categoria: 'Gas', monto: 7, medio: 'Efectivo', desdeCaja: true })
    void v1; void v2
    const hoy = call('inicial').hoy
    const r = call('rango', { desde: hoy, hasta: hoy })
    const m = calcular(r)
    expect(m.ventas).toBe(26 + 22)          // pendiente y cancelado no son ventas
    expect(m.numVentas).toBe(2)
    expect(m.ticket).toBe(24)
    expect(m.cobros).toBe(26 + 10 + 13)
    expect(m.devoluciones).toBe(13)
    expect(m.cobradoNeto).toBe(36)
    expect(m.saldo).toBe(12)
    expect(m.pendientes).toBe(1)
    expect(m.cancelados).toEqual({ cantidad: 1, total: 13 })
    expect(m.gastos.total).toBe(7)
    expect(m.porProducto[0]).toMatchObject({ nombre: 'Hamburguesa Doble', unidades: 2, ventas: 26 })
    const caja = call('cajaActual').actual
    expect(caja.cobros).toBe(m.cobros)
    expect(caja.devoluciones).toBe(m.devoluciones)
    expect(caja.efectivoEsperado).toBe(30 + 26 - 7)
    // Con filtro de categoría, ventas = importe de líneas (sin delivery)
    expect(calcular(r, { categoriaId: 'cat-especiales' })).toMatchObject({ ventas: 18, numVentas: 1, cobros: null })
    expect(calcular(r, { canal: 'delivery' })).toMatchObject({ ventas: 22, cobros: 10 })
    expect(calcular(r, { medio: 'Plin' })).toMatchObject({ cobros: 13, devoluciones: 13 })
  })
})

describe('utilidades', () => {
  it('rangos de fechas', () => {
    expect(rangoPreset('mesAnterior', '2026-03-15')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(rangoPreset('7d', '2026-10-12')).toEqual({ desde: '2026-10-06', hasta: '2026-10-12' })
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('precio de línea con variante y extras, y bloqueo sin precio', () => {
    const prods = new Map([['p', { id: 'p', precio: null } as any], ['q', { id: 'q', precio: 8 } as any]])
    const ops = new Map([['v', { id: 'v', precio: 3.5, activo: true } as any], ['e', { id: 'e', precio: 1.5, activo: true } as any]])
    expect(precioUnitarioC({ key: '', productoId: 'p', varianteId: '', extras: [], cantidad: 1, nota: '' }, prods, ops)).toBeNull()
    expect(precioUnitarioC({ key: '', productoId: 'p', varianteId: 'v', extras: [], cantidad: 1, nota: '' }, prods, ops)).toBe(350)
    expect(precioUnitarioC({ key: '', productoId: 'q', varianteId: '', extras: ['e'], cantidad: 1, nota: '' }, prods, ops)).toBe(950)
  })
  it('CSV escapa separadores y neutraliza fórmulas', () => {
    expect(csv([['a;b', '=1+1', 3]])).toBe('﻿"a;b";\'=1+1;3')
  })
})
