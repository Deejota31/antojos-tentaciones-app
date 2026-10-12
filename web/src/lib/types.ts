// Tipos de los datos que devuelve Code.gs. Importes en soles (2 decimales); los cálculos se hacen en céntimos.

export type Estado = 'pendiente' | 'confirmado' | 'preparando' | 'listo' | 'entregado' | 'cancelado'
export type EstadoPago = 'pendiente' | 'parcial' | 'pagado' | 'devolucion_pendiente' | 'devuelto' | 'sin_cobro'
export type Canal = 'local' | 'recojo' | 'delivery'

export interface Config { [clave: string]: string }

export interface Categoria { id: string; nombre: string; descripcion: string; orden: number | null; activo: boolean; creadoEn: string; actualizadoEn: string }
export interface Producto {
  id: string; categoriaId: string; nombre: string; descripcion: string; precio: number | null; costo: number | null; fotoUrl: string
  activo: boolean; agotado: boolean; destacado: boolean; orden: number | null; esCombo: boolean; incluye: string; revisar: string
  creadoEn: string; actualizadoEn: string
}
export interface Opcion { id: string; productoId: string; tipo: 'variante' | 'extra'; nombre: string; precio: number | null; activo: boolean; orden: number | null }

export interface Movimiento {
  id: string; cajaId: string; fechaHora: string; tipo: 'cobro' | 'devolucion' | 'gasto' | 'retiro' | 'aporte'; medio: string
  sentido: 'ingreso' | 'egreso'; monto: number; referencia: string; referenciaId: string; nota: string; estado: string
}
export interface ResumenCaja {
  fondo: number; cobros: number; devoluciones: number; gastos: number; retiros: number; aportes: number
  efectivoEsperado: number; digital: number
  medios: { medio: string; cobros: number; devoluciones: number; gastos: number; retiros: number; aportes: number; neto: number }[]
}
export interface Caja {
  id: string; fecha: string; estado: 'abierta' | 'cerrada'; fondo: number; abiertaEn: string; cerradaEn: string
  esperado: number | null; contado: number | null; diferencia: number | null; observacion: string
  resumen?: ResumenCaja | null; actual?: ResumenCaja; movimientos?: Movimiento[]; cobrosSinCaja?: number
}

export interface Inicial {
  version: string; sheetUrl: string; hoy: string; config: Config
  categorias: Categoria[]; productos: Producto[]; opciones: Opcion[]; caja: Caja | null
}

export interface Pedido {
  id: string; codigo: string; fecha: string; origen: 'panel' | 'carta'; canal: Canal; estado: Estado; estadoPago: EstadoPago
  cliente: string; telefono: string; direccion: string; referencia: string; nota: string
  subtotal: number; delivery: number | null; deliveryEstado: 'no_aplica' | 'definido' | 'por_confirmar'; total: number
  pagado: number; devuelto: number; saldo: number; devolucion: '' | 'pendiente' | 'devuelto'; lineas: number
  confirmadoEn: string; entregadoEn: string; canceladoEn: string; motivoCancelacion: string; creadoEn: string; actualizadoEn: string
  enRango?: boolean; integridad?: string
}
export interface Linea {
  id: string; pedidoId: string; linea: number; productoId: string; producto: string; categoriaId: string; categoria: string
  variante: string; extras: string; precioUnitario: number; cantidad: number; importe: number; costoUnitario: number | null; nota: string
}
export interface Pago {
  id: string; pedidoId: string; codigo: string; tipo: 'pago' | 'devolucion'; medio: string; monto: number; fecha: string
  fechaHora: string; cajaId: string; nota: string; estado: 'activo' | 'anulado'
}
export interface Gasto {
  id: string; fecha: string; categoria: string; tipo: 'compra' | 'operativo'; descripcion: string; monto: number; medio: string
  desdeCaja: boolean; cajaId: string; comprobante: string; estado: 'activo' | 'anulado'; creadoEn: string
}
export interface Historial { id: string; pedidoId: string; tipo: string; de: string; a: string; fechaHora: string; nota: string }

export interface Rango {
  desde: string; hasta: string; hoy: string; generadoEn: string
  pedidos: Pedido[]; lineas: Linea[]; pagos: Pago[]; gastos: Gasto[]
  incompletos: { id: string; codigo: string; creadoEn: string }[]
}
export interface DetallePedido { pedido: Pedido; lineas: Linea[]; pagos: Pago[]; historial: Historial[] }

export const ESTADOS_VENTA: Estado[] = ['confirmado', 'preparando', 'listo', 'entregado']
export const ESTADOS_ABIERTOS: Estado[] = ['pendiente', 'confirmado', 'preparando', 'listo']
export const TRANSICIONES: Record<Estado, Estado[]> = {
  pendiente: ['confirmado'], confirmado: ['preparando', 'listo', 'entregado'], preparando: ['listo', 'entregado'],
  listo: ['entregado'], entregado: [], cancelado: [],
}
export const ETIQUETA_ESTADO: Record<Estado, string> = {
  pendiente: 'Pendiente de confirmación', confirmado: 'Confirmado', preparando: 'Preparando', listo: 'Listo',
  entregado: 'Entregado', cancelado: 'Cancelado',
}
export const ETIQUETA_PAGO: Record<EstadoPago, string> = {
  pendiente: 'Por cobrar', parcial: 'Pago parcial', pagado: 'Pagado', devolucion_pendiente: 'Devolución pendiente',
  devuelto: 'Devuelto', sin_cobro: 'Sin cobro',
}
export const ETIQUETA_CANAL: Record<Canal, string> = { local: 'En local', recojo: 'Recojo', delivery: 'Delivery' }
