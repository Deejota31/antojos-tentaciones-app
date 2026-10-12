/**
 * Motor único de indicadores. Inicio, Pedidos y Reportes llaman a esta función con los mismos datos,
 * así los totales coinciden siempre. Todo se suma en céntimos enteros.
 *
 * Definiciones (se muestran también en pantalla):
 *  - Venta: pedido confirmado, en preparación, listo o entregado (no pendiente ni cancelado), por su fecha de registro.
 *  - Cobrado: pagos registrados en el rango (por fecha del pago, de cualquier pedido). Neto = cobros − devoluciones.
 *  - Saldo por cobrar: total − (pagado − devuelto) de las ventas del rango.
 *  - Ticket promedio: ventas ÷ número de ventas.
 */
import type { Canal, Gasto, Pago, Pedido, Rango } from './types'
import { ESTADOS_VENTA } from './types'
import { c, s } from './util'

export interface Filtros { categoriaId?: string; productoId?: string; canal?: Canal | ''; medio?: string }

export interface Fila { clave: string; nombre: string; unidades: number; ventas: number; pedidos: number }

export interface Metricas {
  ventas: number
  numVentas: number
  ticket: number | null
  cobros: number | null
  devoluciones: number | null
  cobradoNeto: number | null
  saldo: number | null
  pendientes: number
  enPreparacion: number
  abiertos: number
  cancelados: { cantidad: number; total: number }
  gastos: { total: number; compra: number; operativo: number; porCategoria: Fila[] }
  porProducto: Fila[]
  porCategoria: Fila[]
  porMedio: { medio: string; cobros: number; devoluciones: number }[]
  porCanal: { canal: Canal; ventas: number; pedidos: number }[]
  margen: { estimado: number; cubierto: number; sinCosto: number } | null
  /** true cuando hay filtro por producto o categoría: las ventas son de líneas (sin delivery) y no hay cobros por producto. */
  porLineas: boolean
}

export function calcular(r: Rango, f: Filtros = {}): Metricas {
  const porLineas = !!(f.productoId || f.categoriaId)
  const pedRango = r.pedidos.filter(p => p.enRango !== false && (!f.canal || p.canal === f.canal))
  const ventasPed = pedRango.filter(p => ESTADOS_VENTA.includes(p.estado))
  const idsVenta = new Set(ventasPed.map(p => p.id))
  const lineaOk = (l: { productoId: string; categoriaId: string }) =>
    (!f.productoId || l.productoId === f.productoId) && (!f.categoriaId || l.categoriaId === f.categoriaId)
  const lineas = r.lineas.filter(l => idsVenta.has(l.pedidoId) && lineaOk(l))

  let ventasC = 0
  let numVentas = 0
  if (porLineas) {
    ventasC = lineas.reduce((a, l) => a + c(l.importe), 0)
    numVentas = new Set(lineas.map(l => l.pedidoId)).size
  } else {
    ventasC = ventasPed.reduce((a, p) => a + c(p.total), 0)
    numVentas = ventasPed.length
  }

  // Cobros por fecha de pago. Con filtro de canal solo cuentan los pagos de pedidos cargados con ese canal.
  const canalDe = new Map(r.pedidos.map(p => [p.id, p.canal]))
  const pagos = r.pagos.filter((p: Pago) => p.estado === 'activo' && (!f.medio || p.medio === f.medio) && (!f.canal || canalDe.get(p.pedidoId) === f.canal))
  const cobrosC = pagos.filter(p => p.tipo === 'pago').reduce((a, p) => a + c(p.monto), 0)
  const devC = pagos.filter(p => p.tipo === 'devolucion').reduce((a, p) => a + c(p.monto), 0)
  const saldoC = ventasPed.reduce((a, p) => a + c(p.saldo), 0)

  const agrupar = (clave: (l: typeof lineas[number]) => string, nombre: (l: typeof lineas[number]) => string) => {
    const m = new Map<string, { clave: string; nombre: string; u: number; v: number; ped: Set<string> }>()
    for (const l of lineas) {
      const k = clave(l)
      const x = m.get(k) ?? { clave: k, nombre: nombre(l), u: 0, v: 0, ped: new Set<string>() }
      x.u += l.cantidad; x.v += c(l.importe); x.ped.add(l.pedidoId)
      m.set(k, x)
    }
    return [...m.values()].map(x => ({ clave: x.clave, nombre: x.nombre, unidades: x.u, ventas: s(x.v), pedidos: x.ped.size }))
      .sort((a, b) => b.unidades - a.unidades || b.ventas - a.ventas)
  }

  const gastos = r.gastos.filter((g: Gasto) => g.estado === 'activo')
  const gastosCat = new Map<string, number>()
  for (const g of gastos) gastosCat.set(g.categoria, (gastosCat.get(g.categoria) ?? 0) + c(g.monto))

  const medios = new Map<string, { cobros: number; devoluciones: number }>()
  for (const p of pagos) {
    const x = medios.get(p.medio) ?? { cobros: 0, devoluciones: 0 }
    if (p.tipo === 'pago') x.cobros += c(p.monto); else x.devoluciones += c(p.monto)
    medios.set(p.medio, x)
  }
  const canales = (['local', 'recojo', 'delivery'] as Canal[]).map(canal => {
    const ps = ventasPed.filter(p => p.canal === canal)
    return { canal, pedidos: ps.length, ventas: s(ps.reduce((a, p) => a + c(p.total), 0)) }
  })

  let margen: Metricas['margen'] = null
  const conCosto = lineas.filter(l => l.costoUnitario !== null && l.costoUnitario !== undefined)
  if (conCosto.length) {
    margen = {
      estimado: s(conCosto.reduce((a, l) => a + (c(l.precioUnitario) - c(l.costoUnitario)) * l.cantidad, 0)),
      cubierto: s(conCosto.reduce((a, l) => a + c(l.importe), 0)),
      sinCosto: s(lineas.filter(l => l.costoUnitario === null || l.costoUnitario === undefined).reduce((a, l) => a + c(l.importe), 0)),
    }
  }

  const cancelados = pedRango.filter((p: Pedido) => p.estado === 'cancelado')
  return {
    ventas: s(ventasC),
    numVentas,
    ticket: numVentas ? s(Math.round(ventasC / numVentas)) : null,
    cobros: porLineas ? null : s(cobrosC),
    devoluciones: porLineas ? null : s(devC),
    cobradoNeto: porLineas ? null : s(cobrosC - devC),
    saldo: porLineas ? null : s(saldoC),
    pendientes: pedRango.filter(p => p.estado === 'pendiente').length,
    enPreparacion: pedRango.filter(p => p.estado === 'preparando').length,
    abiertos: pedRango.filter(p => ['pendiente', 'confirmado', 'preparando', 'listo'].includes(p.estado)).length,
    cancelados: { cantidad: cancelados.length, total: s(cancelados.reduce((a, p) => a + c(p.total), 0)) },
    gastos: {
      total: s(gastos.reduce((a, g) => a + c(g.monto), 0)),
      compra: s(gastos.filter(g => g.tipo === 'compra').reduce((a, g) => a + c(g.monto), 0)),
      operativo: s(gastos.filter(g => g.tipo !== 'compra').reduce((a, g) => a + c(g.monto), 0)),
      porCategoria: [...gastosCat].map(([k, v]) => ({ clave: k, nombre: k, unidades: 0, ventas: s(v), pedidos: 0 })).sort((a, b) => b.ventas - a.ventas),
    },
    porProducto: agrupar(l => l.productoId + '|' + l.producto, l => l.producto),
    porCategoria: agrupar(l => l.categoriaId, l => l.categoria),
    porMedio: [...medios].map(([medio, x]) => ({ medio, cobros: s(x.cobros), devoluciones: s(x.devoluciones) })).sort((a, b) => b.cobros - a.cobros),
    porCanal: canales,
    margen,
    porLineas,
  }
}
