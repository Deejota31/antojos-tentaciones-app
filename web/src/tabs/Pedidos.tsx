import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import type { Linea, Pedido } from '../lib/types'
import { ESTADOS_ABIERTOS, ETIQUETA_CANAL, TRANSICIONES } from '../lib/types'
import { c, hora, s, soles, fechaCorta } from '../lib/util'
import { Btn, Dinero, EstadoBadge, PagoBadge, Vacio, cx } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { RangoFechas, textoRango } from '../components/RangoFechas'
import { ACCION_ESTADO, PedidoDetalle } from '../components/PedidoDetalle'
import { Cargando } from './Inicio'

type Filtro = 'abiertos' | 'porCobrar' | 'todos' | 'entregados' | 'cancelados'
const FILTROS: { f: Filtro; t: string; ok: (p: Pedido) => boolean }[] = [
  { f: 'abiertos', t: 'En curso', ok: p => ESTADOS_ABIERTOS.includes(p.estado) },
  { f: 'porCobrar', t: 'Por cobrar', ok: p => p.saldo > 0 || p.estadoPago === 'devolucion_pendiente' },
  { f: 'entregados', t: 'Entregados', ok: p => p.estado === 'entregado' && !!p.enRango },
  { f: 'cancelados', t: 'Cancelados', ok: p => p.estado === 'cancelado' && !!p.enRango },
  { f: 'todos', t: 'Todos del periodo', ok: p => !!p.enRango },
]

export function Pedidos() {
  const st = useStore()
  const [filtro, setFiltro] = useState<Filtro>('abiertos')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [avanzando, setAvanzando] = useState('')
  const lineasPor = useMemo(() => {
    const m = new Map<string, Linea[]>()
    for (const l of st.rango?.lineas ?? []) m.set(l.pedidoId, [...(m.get(l.pedidoId) ?? []), l])
    return m
  }, [st.rango])
  if (!st.rango) return <Cargando />

  const def = FILTROS.find(x => x.f === filtro)!
  const lista = st.rango.pedidos.filter(def.ok).sort((a, b) => (filtro === 'abiertos' ? a.creadoEn.localeCompare(b.creadoEn) : b.creadoEn.localeCompare(a.creadoEn)))
  const totalLista = s(lista.filter(p => p.estado !== 'cancelado' && p.estado !== 'pendiente').reduce((a, p) => a + c(p.total), 0))
  const saldoLista = s(lista.reduce((a, p) => a + c(p.saldo), 0))

  const avanzar = async (p: Pedido) => {
    const a = TRANSICIONES[p.estado][0]
    if (!a) return
    setAvanzando(p.id)
    try {
      await st.run('Cambiar estado', () => st.call('cambiarEstado', { pedidoId: p.id, estado: a }), `${p.codigo}: ${ACCION_ESTADO[a]?.toLowerCase()}`)
      await st.recargarRango()
    } catch { /* aviso mostrado */ } finally { setAvanzando('') }
  }

  const resumen = (p: Pedido) => (lineasPor.get(p.id) ?? []).map(l => `${l.cantidad}× ${l.producto}${l.variante ? ` (${l.variante})` : ''}`).join(', ')

  return (
    <div className="space-y-3">
      <Encabezado titulo="Pedidos" sub={textoRango(st.sel.desde, st.sel.hasta)} />
      <RangoFechas />
      <div className="scroll-x -mx-3 flex gap-2 px-3 pb-1" role="group" aria-label="Filtrar pedidos">
        {FILTROS.map(x => {
          const n = st.rango!.pedidos.filter(x.ok).length
          return (
            <button key={x.f} type="button" aria-pressed={filtro === x.f} onClick={() => setFiltro(x.f)}
              className={cx('min-h-11 shrink-0 rounded-full border-2 px-4 font-bold cursor-pointer', filtro === x.f ? 'border-noche bg-noche text-amarillo' : 'border-linea bg-white hover:border-noche')}>
              {x.t} <span className="tabular">({n})</span>
            </button>
          )
        })}
      </div>
      {filtro === 'abiertos' && <p className="text-sm text-gris">Incluye pedidos en curso de los últimos 90 días, aunque sean de otro día.</p>}
      {filtro === 'porCobrar' && <p className="text-sm text-gris">Saldos de ventas de los últimos 90 días y devoluciones pendientes. Total por cobrar: <b className="tabular">{soles(saldoLista)}</b></p>}

      {!lista.length ? <Vacio titulo={filtro === 'abiertos' ? 'No hay pedidos en curso' : 'No hay pedidos con este filtro'} /> : (
        <>
          {/* Celular y tablet: tarjetas */}
          <ul className="grid gap-2 sm:grid-cols-2 xl:hidden">
            {lista.map(p => (
              <li key={p.id} className="rounded-2xl border-2 border-linea bg-white p-3">
                <button type="button" onClick={() => setAbierto(p.id)} className="block w-full text-left cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <span><b className="text-lg tabular">{p.codigo}</b> <span className="text-gris">{p.enRango ? hora(p.creadoEn) : fechaCorta(p.fecha)} · {ETIQUETA_CANAL[p.canal]}</span></span>
                    <Dinero v={p.total} className="text-lg font-bold" />
                  </div>
                  {p.cliente && <p className="font-bold">{p.cliente}</p>}
                  <p className="mt-1 line-clamp-2 text-sm">{resumen(p)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5"><EstadoBadge estado={p.estado} corto /><PagoBadge estado={p.estadoPago} />
                    {p.saldo > 0 && <span className="text-sm font-bold text-e-pend tabular">Saldo {soles(p.saldo)}</span>}</div>
                </button>
                {TRANSICIONES[p.estado][0] && p.deliveryEstado !== 'por_confirmar' && (
                  <Btn variante="principal" className="mt-2 w-full" cargando={avanzando === p.id} onClick={() => avanzar(p)}>{ACCION_ESTADO[TRANSICIONES[p.estado][0]]}</Btn>
                )}
              </li>
            ))}
          </ul>
          {/* Laptop y escritorio: tabla completa */}
          <div className="scroll-x hidden rounded-2xl border-2 border-linea bg-white xl:block">
            <table className="w-full text-left">
              <thead className="bg-noche text-amarillo">
                <tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Hora</th><th className="px-3 py-2">Cliente / atención</th><th className="px-3 py-2">Productos</th>
                  <th className="px-3 py-2">Estado</th><th className="px-3 py-2">Pago</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2"><span className="sr-only">Acción</span></th></tr>
              </thead>
              <tbody className="divide-y-2 divide-linea">
                {lista.map(p => (
                  <tr key={p.id} className="align-top hover:bg-papel">
                    <td className="px-3 py-2"><button type="button" onClick={() => setAbierto(p.id)} className="font-bold underline tabular cursor-pointer">{p.codigo}</button></td>
                    <td className="px-3 py-2 tabular">{p.enRango ? hora(p.creadoEn) : fechaCorta(p.fecha)}</td>
                    <td className="px-3 py-2">{p.cliente || '—'}<span className="block text-sm text-gris">{ETIQUETA_CANAL[p.canal]}</span></td>
                    <td className="max-w-xs px-3 py-2 text-sm">{resumen(p)}</td>
                    <td className="px-3 py-2"><EstadoBadge estado={p.estado} corto /></td>
                    <td className="px-3 py-2"><PagoBadge estado={p.estadoPago} /></td>
                    <td className="px-3 py-2 text-right font-bold"><Dinero v={p.total} /></td>
                    <td className="px-3 py-2 text-right"><Dinero v={p.saldo} className={p.saldo > 0 ? 'font-bold text-e-pend' : 'text-gris'} /></td>
                    <td className="px-3 py-2 text-right">
                      {TRANSICIONES[p.estado][0] && p.deliveryEstado !== 'por_confirmar'
                        ? <Btn variante="principal" cargando={avanzando === p.id} onClick={() => avanzar(p)}>{ACCION_ESTADO[TRANSICIONES[p.estado][0]]}</Btn>
                        : <Btn onClick={() => setAbierto(p.id)}>Ver</Btn>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtro !== 'porCobrar' && <p className="text-right text-gris">Ventas de esta lista: <b className="tabular text-tinta">{soles(totalLista)}</b> (sin pendientes ni cancelados)</p>}
        </>
      )}
      {abierto && <PedidoDetalle id={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}
