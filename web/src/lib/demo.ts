/**
 * Modo demostración: ejecuta el mismo Code.gs dentro del navegador con una hoja simulada en memoria.
 * Los datos de ejemplo viven solo aquí (se pierden al recargar) y nunca llegan a la hoja real del negocio.
 */
import code from '../../../apps-script/Code.gs?raw'
import { ApiError, type Transport } from './api'
import { crearBackend, type Backend } from './fakegas'

export const CLAVE_DEMO = 'demo'

function sembrar(b: Backend) {
  const ses = b.post('login', { clave: CLAVE_DEMO }).data.sesion as string
  const k = () => crypto.randomUUID()
  const call = (a: string, p: unknown) => { const r = b.post(a, p, ses); if (!r.ok) throw new Error(`${a}: ${r.error?.message}`); return r.data }
  call('saveOpcion', { id: 'opc-demo-inca', productoId: 'prd-beb-gaseosas', tipo: 'variante', nombre: 'Inca Kola 500 ml', precio: 3.5 })
  call('saveOpcion', { id: 'opc-demo-coca', productoId: 'prd-beb-gaseosas', tipo: 'variante', nombre: 'Coca-Cola 500 ml', precio: 3.5 })
  call('saveOpcion', { id: 'opc-demo-huevo', productoId: 'prd-hamb-clasica', tipo: 'extra', nombre: 'Huevo', precio: 1.5 })
  call('saveOpcion', { id: 'opc-demo-queso', productoId: 'prd-hamb-clasica', tipo: 'extra', nombre: 'Queso', precio: 1.5 })
  call('marcarProducto', { id: 'prd-hamb-bbq', destacado: true })
  call('marcarProducto', { id: 'prd-esp-alitas-acevichadas', destacado: true })

  // Días anteriores (para reportes): el reloj de la simulación retrocede.
  const ahora = Date.now()
  const lineasDia = [
    [{ productoId: 'prd-hamb-clasica', cantidad: 2 }, { productoId: 'prd-beb-gaseosas', varianteId: 'opc-demo-inca', cantidad: 2 }],
    [{ productoId: 'prd-salc-mechada', cantidad: 1 }], [{ productoId: 'prd-brst-pecho', cantidad: 2 }],
    [{ productoId: 'prd-esp-bistec-pobre', cantidad: 1 }], [{ productoId: 'prd-hamb-doble', cantidad: 1 }, { productoId: 'prd-salc-clasica', cantidad: 1 }],
  ]
  for (let d = 6; d >= 1; d--) {
    b.reloj(() => ahora - d * 86400000 - 3 * 3600000)
    lineasDia.slice(0, 2 + (d % 4)).forEach((lineas, i) => {
      const r = call('crearVenta', { clave: k(), canal: i % 3 === 2 ? 'recojo' : 'local', estado: 'entregado', lineas })
      call('registrarPago', { clave: k(), pedidoId: r.id, medio: ['Efectivo', 'Yape', 'Plin'][i % 3], monto: r.total })
    })
    call('crearGasto', { clave: k(), categoria: d % 2 ? 'Ingredientes' : 'Envases', tipo: 'compra', monto: 35 + d * 4, medio: 'Transferencia' })
  }

  b.reloj(() => ahora - 90 * 60000)
  call('abrirCaja', { clave: k(), fondo: 50 })
  const v1 = call('crearVenta', { clave: k(), canal: 'local', estado: 'entregado', lineas: lineasDia[0], pago: { medio: 'Efectivo', monto: 23 } })
  void v1
  call('crearVenta', { clave: k(), canal: 'local', lineas: [{ productoId: 'prd-hamb-clasica', extras: ['opc-demo-huevo'], cantidad: 1, nota: 'Sin ensalada' }, { productoId: 'prd-brst-alita', cantidad: 1 }], pago: { medio: 'Yape', monto: 19.5 } })
  const v3 = call('crearVenta', { clave: k(), canal: 'delivery', cliente: 'Rosa', telefono: '987654321', direccion: 'Jr. Ejemplo 123', referencia: 'Puerta verde', delivery: 3, lineas: lineasDia[1], pago: { medio: 'Plin', monto: 10 } })
  call('cambiarEstado', { pedidoId: v3.id, estado: 'preparando' })
  const v4 = call('crearVenta', { clave: k(), canal: 'recojo', cliente: 'Luis', lineas: [{ productoId: 'prd-esp-alitas-acevichadas', cantidad: 1, nota: 'Cremas aparte' }] })
  call('cambiarEstado', { pedidoId: v4.id, estado: 'listo' })
  call('crearVenta', { clave: k(), canal: 'delivery', estado: 'pendiente', cliente: 'Carla', direccion: 'Av. Ejemplo 456', lineas: [{ productoId: 'prd-hamb-bbq', cantidad: 2 }] })
  const v6 = call('crearVenta', { clave: k(), canal: 'local', lineas: [{ productoId: 'prd-hamb-triple', cantidad: 1 }], pago: { medio: 'Efectivo', monto: 16 } })
  call('cancelarPedido', { pedidoId: v6.id, motivo: 'Cliente se retiró', devolucion: 'pendiente', clave: k() })
  call('crearGasto', { clave: k(), categoria: 'Gas', tipo: 'operativo', monto: 12, medio: 'Efectivo', desdeCaja: true, descripcion: 'Recarga de balón' })
  b.reloj(null)
  call('logout', {})
}

export function demoTransport(): Transport {
  const b = crearBackend(code)
  b.setup()
  b.fijarClave(CLAVE_DEMO)
  sembrar(b)
  return async (action, payload, sesion) => {
    await new Promise(r => setTimeout(r, 120))
    const r = b.post(action, payload, sesion)
    if (!r.ok) throw new ApiError(r.error!.code, r.error!.message, r.error!.detalle)
    return r.data
  }
}
