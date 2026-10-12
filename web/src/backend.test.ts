// @vitest-environment node
// Ejecuta apps-script/Code.gs real contra la simulación de Apps Script (src/lib/fakegas.ts).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { crearBackend, type Backend } from './lib/fakegas'

const CODE = readFileSync(resolve(__dirname, '../../apps-script/Code.gs'), 'utf8')
const CLAVE = 'clave-de-prueba-1'

let b: Backend
let ses: string
let n = 0
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const clave = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`
function ok(action: string, payload: unknown = {}) {
  const r = b.post(action, payload, ses)
  if (!r.ok) throw new Error(`${action}: ${r.error?.code} ${r.error?.message}`)
  return r.data
}
function err(action: string, payload: unknown = {}, sesion: string | undefined = ses) {
  const r = b.post(action, payload, sesion)
  expect(r.ok).toBe(false)
  return r.error!
}
const venta = (lineas: unknown[], extra: Record<string, unknown> = {}) => ok('crearVenta', { clave: clave(), canal: 'local', lineas, ...extra })
const rangoHoy = () => { const hoy = ok('inicial').hoy; return ok('rango', { desde: hoy, hasta: hoy, fresh: true }) }
const filas = (hoja: string) => b.ss.datos(hoja)

beforeEach(() => {
  n = 0
  b = crearBackend(CODE, { uuid })
  b.setup()
  b.fijarClave(CLAVE)
  ses = b.post('login', { clave: CLAVE }).data.sesion
})

describe('instalación', () => {
  it('crea hojas, catálogo y configuración sin ventas', () => {
    expect([...b.ss.sheets.keys()]).toEqual(expect.arrayContaining(['CONFIG', 'CATEGORIAS', 'PRODUCTOS', 'OPCIONES', 'PEDIDOS',
      'DETALLE_PEDIDOS', 'PAGOS', 'GASTOS', 'CAJAS', 'MOVIMIENTOS_CAJA', 'HISTORIAL_ESTADOS']))
    expect(b.ss.sheets.has('Sheet1')).toBe(false)
    expect(filas('CATEGORIAS')).toHaveLength(5)
    expect(filas('PRODUCTOS')).toHaveLength(25)
    expect(filas('PEDIDOS')).toHaveLength(0)
    expect(b.logs.some(l => l.startsWith('CLAVE INICIAL'))).toBe(true)
  })

  it('es idempotente: no duplica ni reinicia la configuración modificada', () => {
    ok('saveConfig', { valores: { horario: 'Lun a Sáb 6 pm – 11 pm' } })
    const p = ok('inicial').productos.find((x: any) => x.id === 'prd-hamb-clasica')
    ok('saveProducto', { ...p, precio: 9 })
    venta([{ productoId: 'prd-hamb-clasica', cantidad: 1 }])
    b.setup()
    b.setup()
    const d = ok('inicial', { fresh: true })
    expect(filas('PRODUCTOS')).toHaveLength(25)
    expect(filas('CONFIG').length).toBe(15)
    expect(d.config.horario).toBe('Lun a Sáb 6 pm – 11 pm')
    expect(d.productos.find((x: any) => x.id === 'prd-hamb-clasica').precio).toBe(9)
    expect(filas('PEDIDOS')).toHaveLength(1)
    // La clave no se regenera si ya existe.
    expect(b.post('login', { clave: CLAVE }).ok).toBe(true)
  })

  it('bebidas y Salchibroaster quedan sin precio y marcados para revisión', () => {
    const d = ok('inicial')
    for (const id of ['prd-beb-chicha', 'prd-beb-gaseosas', 'prd-beb-infusiones', 'prd-salc-salchibroaster']) {
      const p = d.productos.find((x: any) => x.id === id)
      expect(p.precio).toBeNull()
      expect(p.revisar).not.toBe('')
    }
  })
})

describe('autenticación', () => {
  it('rechaza operaciones privadas sin sesión, con sesión falsa o vencida', () => {
    expect(err('inicial', {}, '').code).toBe('UNAUTHORIZED')
    expect(err('crearVenta', { clave: clave(), lineas: [] }, 'f'.repeat(64)).code).toBe('UNAUTHORIZED')
    expect(err('rango', {}, 'x').code).toBe('UNAUTHORIZED')
    b.reloj(() => Date.now() + 8 * 86400000)
    expect(err('inicial').code).toBe('UNAUTHORIZED')
  })

  it('bloquea tras varios intentos fallidos', () => {
    for (let i = 0; i < 8; i++) expect(b.post('login', { clave: 'mala' }).error?.code).toBe('UNAUTHORIZED')
    expect(b.post('login', { clave: CLAVE }).error?.code).toBe('LOCKED')
  })

  it('cerrar sesión y cambiar la clave revocan el acceso', () => {
    const otra = b.post('login', { clave: CLAVE }).data.sesion
    ok('logout')
    expect(err('inicial').code).toBe('UNAUTHORIZED')
    ses = otra
    expect(err('cambiarClave', { actual: 'mal', nueva: 'nueva-clave-9' }).code).toBe('VALIDATION')
    ok('cambiarClave', { actual: CLAVE, nueva: 'nueva-clave-9' })
    expect(err('inicial').code).toBe('UNAUTHORIZED')
    expect(b.post('login', { clave: 'nueva-clave-9' }).ok).toBe(true)
  })

  it('la clave se guarda con hash y sal, nunca en texto', () => {
    expect([...b.props.values()].some(v => v.includes(CLAVE))).toBe(false)
  })
})

describe('ventas', () => {
  it('recalcula precios en el servidor e ignora importes enviados', () => {
    const r = venta([{ productoId: 'prd-hamb-doble', cantidad: 2, precioUnitario: 1 }, { productoId: 'prd-brst-pecho', cantidad: 1 }])
    expect(r.total).toBe(39)
    expect(r.estado).toBe('confirmado')
  })

  it('avisa si el total mostrado ya no coincide', () => {
    const e = err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }], totalEsperado: 12 })
    expect(e.code).toBe('PRECIO_CAMBIO')
    expect(filas('PEDIDOS')).toHaveLength(0)
  })

  it('doble clic o reintento con la misma clave no duplica pedido, pago ni movimiento', () => {
    ok('abrirCaja', { clave: clave(), fondo: 0 })
    const p = { clave: clave(), canal: 'local', lineas: [{ productoId: 'prd-hamb-clasica', cantidad: 1 }], pago: { medio: 'Efectivo', monto: 8 } }
    const a = ok('crearVenta', p)
    const c = ok('crearVenta', p)
    expect(c.id).toBe(a.id)
    expect(c.duplicado).toBe(true)
    expect(filas('PEDIDOS')).toHaveLength(1)
    expect(filas('DETALLE_PEDIDOS')).toHaveLength(1)
    expect(filas('PAGOS')).toHaveLength(1)
    expect(filas('MOVIMIENTOS_CAJA')).toHaveLength(1)
    const pago = { clave: clave(), pedidoId: a.id, medio: 'Yape', monto: 1 }
    expect(err('registrarPago', pago).message).toMatch(/ya está pagado/)
  })

  it('el cambio de precio no altera ventas anteriores', () => {
    venta([{ productoId: 'prd-hamb-clasica', cantidad: 3 }])
    const p = ok('inicial').productos.find((x: any) => x.id === 'prd-hamb-clasica')
    ok('saveProducto', { ...p, precio: 10, nombre: 'Clásica XL' })
    venta([{ productoId: 'prd-hamb-clasica', cantidad: 1 }])
    const r = rangoHoy()
    expect(r.lineas.map((l: any) => [l.producto, l.precioUnitario, l.importe])).toEqual([['Hamburguesa Clásica', 8, 24], ['Clásica XL', 10, 10]])
    expect(r.pedidos.map((x: any) => x.total)).toEqual([24, 10])
  })

  it('bloquea productos agotados, inactivos o sin precio y explica cuál', () => {
    ok('marcarProducto', { id: 'prd-hamb-royal', agotado: true })
    let e = err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-hamb-royal', cantidad: 1 }, { productoId: 'prd-hamb-doble', cantidad: 1 }] })
    expect(e.code).toBe('NO_DISPONIBLE')
    expect((e as any).detalle.problemas).toEqual([expect.objectContaining({ productoId: 'prd-hamb-royal', motivo: 'agotado' })])
    e = err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-beb-chicha', cantidad: 1 }] })
    expect((e as any).detalle.problemas[0].motivo).toBe('sin_precio')
    expect(filas('PEDIDOS')).toHaveLength(0)
  })

  it('usa el precio de la variante y suma extras; exige variante cuando hay', () => {
    ok('saveOpcion', { id: 'opc-gas-inca', productoId: 'prd-beb-gaseosas', tipo: 'variante', nombre: 'Inca Kola 500 ml', precio: 3.5 })
    ok('saveOpcion', { id: 'opc-hb-huevo', productoId: 'prd-hamb-clasica', tipo: 'extra', nombre: 'Huevo', precio: 1.5 })
    expect(err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-beb-gaseosas', cantidad: 1 }] }).code).toBe('NO_DISPONIBLE')
    const r = venta([{ productoId: 'prd-beb-gaseosas', varianteId: 'opc-gas-inca', cantidad: 2 },
      { productoId: 'prd-hamb-clasica', extras: ['opc-hb-huevo'], cantidad: 1, nota: 'sin ensalada' }])
    expect(r.total).toBe(16.5)
    const l = rangoHoy().lineas
    expect(l[1]).toMatchObject({ variante: '', extras: 'Huevo (+S/ 1.50)', precioUnitario: 9.5, nota: 'sin ensalada' })
    expect(err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-hamb-doble', extras: ['opc-hb-huevo'], cantidad: 1 }] }).code).toBe('VALIDATION')
  })

  it('rechaza cantidades e importes inválidos', () => {
    for (const cantidad of [0, -1, 1.5, 100, 'x']) expect(err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-hamb-doble', cantidad }] }).code).toBe('VALIDATION')
    expect(err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }], pago: { medio: 'Efectivo', monto: 14 } }).code).toBe('VALIDATION')
    expect(err('crearVenta', { clave: 'no-uuid', lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }] }).code).toBe('VALIDATION')
  })

  it('protege los textos frente a fórmulas', () => {
    venta([{ productoId: 'prd-hamb-doble', cantidad: 1, nota: '=IMPORTRANGE("x")' }], { cliente: '+51 999', nota: '@hola' })
    const ped = filas('PEDIDOS')[0]
    expect(ped).toContain("'+51 999")
    expect(ped).toContain("'@hola")
    expect(filas('DETALLE_PEDIDOS')[0]).toContain("'=IMPORTRANGE(\"x\")")
    expect(rangoHoy().lineas[0].nota).toBe('=IMPORTRANGE("x")')
  })
})

describe('pagos y estados', () => {
  it('pago parcial deja saldo y no permite cobrar de más', () => {
    const r = venta([{ productoId: 'prd-hamb-doble', cantidad: 2 }], { pago: { medio: 'Yape', monto: 10 } })
    let p = rangoHoy().pedidos[0]
    expect([p.total, p.pagado, p.saldo, p.estadoPago]).toEqual([26, 10, 16, 'parcial'])
    expect(err('registrarPago', { clave: clave(), pedidoId: r.id, medio: 'Efectivo', monto: 20 }).message).toMatch(/saldo pendiente \(S\/ 16.00\)/)
    const k = clave()
    ok('registrarPago', { clave: k, pedidoId: r.id, medio: 'Efectivo', monto: 16 })
    ok('registrarPago', { clave: k, pedidoId: r.id, medio: 'Efectivo', monto: 16 })
    p = rangoHoy().pedidos[0]
    expect([p.pagado, p.saldo, p.estadoPago]).toEqual([26, 0, 'pagado'])
    expect(filas('PAGOS')).toHaveLength(2)
  })

  it('solo permite transiciones hacia adelante y registra el historial', () => {
    const r = venta([{ productoId: 'prd-hamb-doble', cantidad: 1 }])
    ok('cambiarEstado', { pedidoId: r.id, estado: 'preparando' })
    ok('cambiarEstado', { pedidoId: r.id, estado: 'preparando' }) // doble clic
    ok('cambiarEstado', { pedidoId: r.id, estado: 'entregado' })
    expect(err('cambiarEstado', { pedidoId: r.id, estado: 'listo' }).code).toBe('TRANSICION')
    expect(err('cancelarPedido', { pedidoId: r.id, motivo: 'x' }).code).toBe('TRANSICION')
    const h = ok('pedido', { id: r.id }).historial.map((x: any) => `${x.de}>${x.a}`)
    expect(h).toEqual(['>confirmado', 'confirmado>preparando', 'preparando>entregado'])
  })

  it('cancelar un pedido pagado exige decidir qué pasa con el dinero y no lo borra', () => {
    ok('abrirCaja', { clave: clave(), fondo: 20 })
    const r = venta([{ productoId: 'prd-hamb-doble', cantidad: 1 }], { pago: { medio: 'Efectivo', monto: 13 } })
    expect(err('cancelarPedido', { pedidoId: r.id, motivo: 'Cliente se fue' }).code).toBe('VALIDATION')
    ok('cancelarPedido', { pedidoId: r.id, motivo: 'Cliente se fue', devolucion: 'pendiente', clave: clave() })
    let d = ok('pedido', { id: r.id })
    expect([d.pedido.estado, d.pedido.estadoPago, d.pedido.devolucion]).toEqual(['cancelado', 'devolucion_pendiente', 'pendiente'])
    expect(d.pagos).toHaveLength(1)
    expect(err('registrarPago', { clave: clave(), pedidoId: r.id, medio: 'Efectivo', monto: 1 }).code).toBe('VALIDATION')
    const k = clave()
    ok('registrarDevolucion', { pedidoId: r.id, medio: 'Efectivo', clave: k })
    ok('registrarDevolucion', { pedidoId: r.id, medio: 'Efectivo', clave: k })
    d = ok('pedido', { id: r.id })
    expect([d.pedido.estadoPago, d.pedido.devolucion, d.pagos.length]).toEqual(['devuelto', 'devuelto', 2])
    const caja = ok('cajaActual')
    expect(caja.actual).toMatchObject({ cobros: 13, devoluciones: 13, efectivoEsperado: 20 })
    // Un cancelado no cuenta como venta ni deja saldo pendiente.
    expect(rangoHoy().pedidos[0].saldo).toBe(0)
  })

  it('cancelar y devolver de inmediato también es idempotente', () => {
    const r = venta([{ productoId: 'prd-hamb-doble', cantidad: 1 }], { pago: { medio: 'Plin', monto: 13 } })
    const p = { pedidoId: r.id, motivo: 'Error', devolucion: 'devuelto', medioDevolucion: 'Plin', clave: clave() }
    ok('cancelarPedido', p)
    ok('cancelarPedido', p)
    expect(filas('PAGOS')).toHaveLength(2)
    expect(ok('pedido', { id: r.id }).pedido.estadoPago).toBe('devuelto')
  })

  it('delivery sin costo definido queda pendiente y no se confirma hasta definirlo', () => {
    expect(err('crearVenta', { clave: clave(), canal: 'delivery', lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }] }).message).toMatch(/Dirección/)
    expect(err('crearVenta', { clave: clave(), canal: 'delivery', direccion: 'Av. Siempre Viva 123', lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }] }).message).toMatch(/delivery/)
    const r = ok('crearVenta', { clave: clave(), canal: 'delivery', direccion: 'Av. Siempre Viva 123', estado: 'pendiente', lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }] })
    expect(r.deliveryEstado).toBe('por_confirmar')
    expect(err('cambiarEstado', { pedidoId: r.id, estado: 'confirmado' }).message).toMatch(/delivery/)
    expect(ok('definirDelivery', { pedidoId: r.id, monto: 4 }).total).toBe(17)
    expect(ok('cambiarEstado', { pedidoId: r.id, estado: 'confirmado' }).estado).toBe('confirmado')
  })
})

describe('caja y gastos', () => {
  it('cierre con efectivo, pagos digitales, gastos, retiros y aportes sin descontar dos veces', () => {
    const caja = ok('abrirCaja', { clave: clave(), fondo: 50 })
    expect(err('abrirCaja', { clave: clave(), fondo: 0 }).code).toBe('CAJA_ABIERTA')
    venta([{ productoId: 'prd-esp-churrasco', cantidad: 1 }], { pago: { medio: 'Efectivo', monto: 18 } })
    venta([{ productoId: 'prd-hamb-doble', cantidad: 1 }], { pago: { medio: 'Yape', monto: 13 } })
    venta([{ productoId: 'prd-hamb-clasica', cantidad: 1 }]) // sin cobrar
    const kg = clave()
    ok('crearGasto', { clave: kg, categoria: 'Gas', tipo: 'operativo', monto: 8, medio: 'Efectivo', desdeCaja: true })
    ok('crearGasto', { clave: kg, categoria: 'Gas', tipo: 'operativo', monto: 8, medio: 'Efectivo', desdeCaja: true })
    ok('crearGasto', { clave: clave(), categoria: 'Ingredientes', tipo: 'compra', monto: 30, medio: 'Transferencia', desdeCaja: false })
    ok('movimientoCaja', { clave: clave(), tipo: 'retiro', monto: 10, medio: 'Efectivo', nota: 'Para mercado' })
    ok('movimientoCaja', { clave: clave(), tipo: 'aporte', monto: 5, medio: 'Efectivo' })
    const a = ok('cajaActual').actual
    expect(a).toMatchObject({ fondo: 50, cobros: 31, gastos: 8, retiros: 10, aportes: 5, efectivoEsperado: 55, digital: 13 })
    expect(a.medios.find((m: any) => m.medio === 'Yape').neto).toBe(13)
    expect(filas('MOVIMIENTOS_CAJA')).toHaveLength(5)
    expect(err('cerrarCaja', { cajaId: caja.id, contado: 53 }).message).toMatch(/Observación/)
    const c = ok('cerrarCaja', { cajaId: caja.id, contado: 53, observacion: 'Faltan 2 soles de vuelto' })
    expect([c.estado, c.esperado, c.contado, c.diferencia]).toEqual(['cerrada', 55, 53, -2])
    expect(ok('cerrarCaja', { cajaId: caja.id, contado: 99 }).contado).toBe(53) // reintento no reescribe
    const r = rangoHoy()
    const gastos = r.gastos.reduce((s: number, g: any) => s + g.monto, 0)
    expect(gastos).toBe(38) // Gastos muestra los dos; la caja solo descuenta el pagado desde caja
  })

  it('anular un gasto de caja anula su movimiento; no se anula si la caja cerró', () => {
    const caja = ok('abrirCaja', { clave: clave(), fondo: 10 })
    const g = ok('crearGasto', { clave: clave(), categoria: 'Envases', monto: 4, medio: 'Efectivo', desdeCaja: true })
    ok('anularGasto', { id: g.id, motivo: 'Duplicado' })
    expect(ok('cajaActual').actual.efectivoEsperado).toBe(10)
    const g2 = ok('crearGasto', { clave: clave(), categoria: 'Envases', monto: 4, medio: 'Efectivo', desdeCaja: true })
    ok('cerrarCaja', { cajaId: caja.id, contado: 6 })
    expect(err('anularGasto', { id: g2.id, motivo: 'x' }).message).toMatch(/cerrada/)
    expect(err('crearGasto', { clave: clave(), categoria: 'Gas', monto: 4, medio: 'Efectivo', desdeCaja: true }).code).toBe('SIN_CAJA')
  })
})

describe('consistencia ante fallos', () => {
  it('una venta interrumpida queda incompleta, no cuenta y el reintento la completa sin duplicar', () => {
    ok('abrirCaja', { clave: clave(), fondo: 0 })
    const p = { clave: clave(), canal: 'local', lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }, { productoId: 'prd-hamb-clasica', cantidad: 1 }],
      pago: { medio: 'Efectivo', monto: 21 } }
    b.fallarEn('PAGOS')
    expect(b.post('crearVenta', p, ses).error?.code).toBe('SERVER_ERROR')
    let r = rangoHoy()
    expect(r.pedidos).toHaveLength(0)
    expect(r.incompletos).toHaveLength(1)
    expect(filas('DETALLE_PEDIDOS')).toHaveLength(2)
    ok('crearVenta', p)
    r = rangoHoy()
    expect(r.incompletos).toHaveLength(0)
    expect(r.pedidos[0]).toMatchObject({ total: 21, pagado: 21, estadoPago: 'pagado' })
    expect([filas('DETALLE_PEDIDOS').length, filas('PAGOS').length, filas('MOVIMIENTOS_CAJA').length]).toEqual([2, 1, 1])
  })

  it('"reparar" termina operaciones a medias sin la petición original', () => {
    b.fallarEn('DETALLE_PEDIDOS')
    b.post('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }] }, ses)
    expect(ok('reparar').reparados).toHaveLength(1)
    expect(rangoHoy().pedidos).toHaveLength(1)
  })

  it('un pago que falla antes de su movimiento se completa al reintentar', () => {
    ok('abrirCaja', { clave: clave(), fondo: 0 })
    const r = venta([{ productoId: 'prd-hamb-doble', cantidad: 1 }])
    const p = { clave: clave(), pedidoId: r.id, medio: 'Efectivo', monto: 13 }
    b.fallarEn('PAGO')
    expect(b.post('registrarPago', p, ses).ok).toBe(false)
    expect(rangoHoy().pedidos[0].pagado).toBe(13) // los totales salen de PAGOS, no del valor guardado en el pedido
    ok('registrarPago', p)
    expect(ok('cajaActual').actual.cobros).toBe(13)
    expect(filas('PAGOS')).toHaveLength(1)
  })

  it('responde "ocupado" si otra operación tiene el bloqueo', () => {
    b.ocuparLock(true)
    expect(err('crearVenta', { clave: clave(), lineas: [{ productoId: 'prd-hamb-doble', cantidad: 1 }] }).code).toBe('BUSY')
  })

  it('la caché se invalida al escribir', () => {
    const hoy = ok('inicial').hoy
    expect(ok('rango', { desde: hoy, hasta: hoy }).pedidos).toHaveLength(0)
    venta([{ productoId: 'prd-hamb-doble', cantidad: 1 }])
    expect(ok('rango', { desde: hoy, hasta: hoy }).pedidos).toHaveLength(1)
    ok('marcarProducto', { id: 'prd-hamb-doble', agotado: true })
    expect(ok('inicial').productos.find((x: any) => x.id === 'prd-hamb-doble').agotado).toBe(true)
  })
})

describe('carta pública (segunda etapa)', () => {
  it('cerrada por defecto y nunca expone pedidos ni clientes', () => {
    venta([{ productoId: 'prd-hamb-doble', cantidad: 1 }], { cliente: 'Rosa Privada', telefono: '999888777' })
    const c = b.post('carta').data
    expect(c.activa).toBe(false)
    expect(b.post('crearSolicitud', { clave: clave(), lineas: [] }).error?.code).toBe('CERRADO')
    ok('saveConfig', { valores: { carta_publica_activa: 'SI' } })
    const abierta = JSON.stringify(b.post('carta').data)
    expect(abierta).not.toMatch(/Rosa|999888777|pedidos|costo/)
    expect(b.post('carta').data.whatsapp).toBe('') // número sin validar: no se usa
  })

  it('crea una solicitud pendiente con código, sin cobro, y delivery por confirmar', () => {
    ok('saveConfig', { valores: { carta_publica_activa: 'SI', whatsapp_validado: 'SI' } })
    const k = clave()
    const s = { clave: k, canal: 'delivery', cliente: 'Ana', direccion: 'Jr. Lima 1', lineas: [{ productoId: 'prd-hamb-bbq', cantidad: 1 }], totalEsperado: 16 }
    const r = b.post('crearSolicitud', s).data
    expect(r).toMatchObject({ subtotal: 16, deliveryEstado: 'por_confirmar', whatsapp: '51939968342' })
    expect(r.codigo).toMatch(/^\d{4}-\d{3}$/)
    expect(b.post('crearSolicitud', s).data).toMatchObject({ codigo: r.codigo, duplicado: true })
    const p = rangoHoy().pedidos
    expect(p).toHaveLength(1)
    expect([p[0].estado, p[0].origen, p[0].pagado]).toEqual(['pendiente', 'carta', 0])
    expect(b.post('crearSolicitud', { ...s, clave: clave(), cliente: '' }).error?.code).toBe('VALIDATION')
  })
})
