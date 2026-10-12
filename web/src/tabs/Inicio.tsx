import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList, ShoppingBag, Wallet } from 'lucide-react'
import type { Tab } from '../App'
import { useStore } from '../lib/store'
import { calcular } from '../lib/engine'
import { Barra, Btn, ComoSeCalcula, Dinero, Seccion, Vacio, cx } from '../components/ui'
import { RangoFechas, textoRango } from '../components/RangoFechas'
import { Encabezado } from '../components/Encabezado'

export function Inicio({ ir }: { ir: (t: Tab) => void }) {
  const st = useStore()
  const m = useMemo(() => (st.rango ? calcular(st.rango) : null), [st.rango])
  const [reparando, setReparando] = useState(false)
  const caja = st.inicial?.caja
  const porRevisar = st.inicial?.productos.filter(p => p.activo && p.revisar).length ?? 0
  const devPend = st.rango?.pedidos.filter(p => p.estadoPago === 'devolucion_pendiente') ?? []
  const delPend = st.rango?.pedidos.filter(p => p.deliveryEstado === 'por_confirmar' && p.estado === 'pendiente') ?? []
  const porCobrarFuera = st.rango?.pedidos.filter(p => !p.enRango && p.saldo > 0) ?? []

  return (
    <div className="space-y-4">
      <Encabezado titulo="Inicio" sub={textoRango(st.sel.desde, st.sel.hasta)}>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
          <Btn variante="principal" grande className="min-w-0 flex-col px-1 text-base leading-tight sm:flex-row sm:px-5 sm:text-lg" onClick={() => ir('vender')}><ShoppingBag className="size-5 shrink-0" aria-hidden />Nueva venta</Btn>
          <Btn grande className="min-w-0 flex-col px-1 text-base leading-tight sm:flex-row sm:px-5 sm:text-lg" onClick={() => ir('pedidos')}><ClipboardList className="size-5 shrink-0" aria-hidden />Pedidos</Btn>
          <Btn grande className="min-w-0 flex-col px-1 text-base leading-tight sm:flex-row sm:px-5 sm:text-lg" onClick={() => ir('caja')}><Wallet className="size-5 shrink-0" aria-hidden />{caja ? 'Cerrar caja' : 'Abrir caja'}</Btn>
        </div>
      </Encabezado>
      <RangoFechas />

      {!!st.rango?.incompletos.length && (
        <Aviso>
          {st.rango.incompletos.length} pedido(s) quedaron a medio guardar por un corte ({st.rango.incompletos.map(x => x.codigo).join(', ')}). No se cuentan en los totales hasta completarlos.
          <Btn className="mt-2" cargando={reparando} onClick={async () => {
            setReparando(true)
            try { await st.run('Completar pedidos', () => st.call('reparar'), r => `Completados: ${r.reparados.length}`); await st.recargarRango(true) } finally { setReparando(false) }
          }}>Completar ahora</Btn>
        </Aviso>
      )}
      {devPend.length > 0 && <Aviso>Hay {devPend.length} pedido(s) cancelado(s) con dinero por devolver: {devPend.map(p => p.codigo).join(', ')}. Regístralo en Pedidos cuando devuelvas.</Aviso>}
      {delPend.length > 0 && <Aviso>{delPend.length} pedido(s) de delivery esperan el costo de envío para poder confirmarse.</Aviso>}

      {!m ? <Cargando /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Ventas" valor={<Dinero v={m.ventas} />} detalle={`${m.numVentas} venta${m.numVentas === 1 ? '' : 's'}`} destacado
              formula="Suma del total de los pedidos confirmados, en preparación, listos o entregados registrados en el periodo. No incluye pedidos pendientes de confirmación ni cancelados." />
            <Kpi titulo="Cobrado" valor={<Dinero v={m.cobradoNeto} />} detalle={m.devoluciones ? `Incluye −${m.devoluciones.toFixed(2)} de devoluciones` : 'Dinero recibido'}
              formula="Pagos registrados en el periodo (por la fecha del pago, de cualquier pedido) menos devoluciones. Puede diferir de Ventas: hay ventas por cobrar y cobros de pedidos de otros días." />
            <Kpi titulo="Por cobrar" valor={<Dinero v={m.saldo} />} detalle={porCobrarFuera.length ? `+ ${porCobrarFuera.length} de días anteriores` : 'De las ventas del periodo'} alerta={!!m.saldo}
              formula="Total de cada venta del periodo menos lo pagado (descontando devoluciones). Los saldos de días anteriores se ven en Pedidos → Por cobrar." />
            <Kpi titulo="Gastos" valor={<Dinero v={m.gastos.total} />} detalle={`Compras ${m.gastos.compra.toFixed(2)} · Operativos ${m.gastos.operativo.toFixed(2)}`}
              formula="Gastos registrados en el periodo, por su fecha. Ventas menos gastos no es la utilidad real: faltan costos no registrados y compras que duran varios días." />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini t="Pendientes de confirmar" v={m.pendientes} onClick={() => ir('pedidos')} />
            <Mini t="En preparación" v={m.enPreparacion} onClick={() => ir('cocina')} />
            <Mini t="Ticket promedio" v={<Dinero v={m.ticket} />} />
            <Mini t="Cancelados" v={m.cancelados.cantidad} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Seccion titulo="Más vendidos">
              {m.porProducto.length ? (
                <ol className="space-y-3">
                  {m.porProducto.slice(0, 6).map(p => (
                    <li key={p.clave}>
                      <div className="flex justify-between gap-2"><span className="font-bold">{p.nombre}</span><span className="tabular">{p.unidades} u · <Dinero v={p.ventas} /></span></div>
                      <Barra valor={p.unidades} max={m.porProducto[0].unidades} />
                    </li>
                  ))}
                </ol>
              ) : <Vacio titulo="Aún no hay ventas en este periodo" />}
            </Seccion>
            <Seccion titulo="Ventas por categoría">
              {m.porCategoria.length ? (
                <ul className="space-y-3">
                  {[...m.porCategoria].sort((a, b) => b.ventas - a.ventas).map(x => (
                    <li key={x.clave}>
                      <div className="flex justify-between gap-2"><span className="font-bold">{x.nombre}</span><Dinero v={x.ventas} /></div>
                      <Barra valor={x.ventas} max={Math.max(...m.porCategoria.map(y => y.ventas))} color="bg-fucsia" />
                    </li>
                  ))}
                </ul>
              ) : <Vacio titulo="Sin ventas por categoría todavía" />}
              <ComoSeCalcula>Importe de los productos vendidos (sin delivery), agrupado por la categoría que tenían al momento de la venta.</ComoSeCalcula>
            </Seccion>
          </div>
          {porRevisar > 0 && (
            <p className="text-gris">{porRevisar} producto(s) de la carta tienen datos por revisar (precios o descripciones). <button type="button" className="font-bold underline cursor-pointer" onClick={() => ir('carta')}>Revisar carta</button></p>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ titulo, valor, detalle, formula, destacado, alerta }: { titulo: string; valor: React.ReactNode; detalle: string; formula: string; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className={cx('rounded-2xl border-2 p-4', destacado ? 'border-noche bg-amarillo' : 'border-linea bg-white')}>
      <p className="font-bold">{titulo}</p>
      <p className={cx('mt-1 text-2xl font-bold sm:text-3xl', alerta && 'text-e-pend')}>{valor}</p>
      <p className={cx('mt-1 text-sm', destacado ? 'text-noche/80' : 'text-gris')}>{detalle}</p>
      <ComoSeCalcula>{formula}</ComoSeCalcula>
    </div>
  )
}
function Mini({ t, v, onClick }: { t: string; v: React.ReactNode; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div'
  return (
    <C type={onClick ? 'button' : undefined} onClick={onClick} className={cx('rounded-2xl border-2 border-linea bg-white p-3 text-left', onClick && 'cursor-pointer hover:border-noche')}>
      <p className="text-sm text-gris">{t}</p>
      <p className="text-xl font-bold tabular">{v}</p>
    </C>
  )
}
export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-2xl border-2 border-e-pend bg-e-pend-bg p-3 text-e-pend">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col items-start font-bold">{children}</div>
    </div>
  )
}
export const Cargando = () => <p className="py-10 text-center text-gris" role="status">Cargando datos…</p>
