import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import type { Estado, Linea, Pedido } from '../lib/types'
import { ETIQUETA_CANAL } from '../lib/types'
import { hora } from '../lib/util'
import { Btn, EstadoBadge, Vacio, cx } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { Cargando } from './Inicio'

const COLUMNAS: { estado: Estado; t: string; siguiente: Estado; accion: string }[] = [
  { estado: 'confirmado', t: 'Por preparar', siguiente: 'preparando', accion: 'Empezar' },
  { estado: 'preparando', t: 'Preparando', siguiente: 'listo', accion: 'Listo' },
  { estado: 'listo', t: 'Listos para entregar', siguiente: 'entregado', accion: 'Entregado' },
]

/** Vista de cocina: solo lo necesario para preparar. Sin importes ni datos de pago. */
export function Cocina() {
  const st = useStore()
  const [auto, setAuto] = useState(true)
  const [ocupado, setOcupado] = useState('')
  const recargar = useRef(st.recargarRango)
  recargar.current = st.recargarRango
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') void recargar.current() }, 30_000)
    return () => clearInterval(t)
  }, [auto])
  const lineasPor = useMemo(() => {
    const m = new Map<string, Linea[]>()
    for (const l of st.rango?.lineas ?? []) m.set(l.pedidoId, [...(m.get(l.pedidoId) ?? []), l])
    return m
  }, [st.rango])
  if (!st.rango) return <Cargando />

  const mover = async (p: Pedido, a: Estado) => {
    setOcupado(p.id)
    try { await st.run('Cambiar estado', () => st.call('cambiarEstado', { pedidoId: p.id, estado: a })); await st.recargarRango() }
    catch { /* aviso mostrado */ } finally { setOcupado('') }
  }
  const pendientes = st.rango.pedidos.filter(p => p.estado === 'pendiente').length

  return (
    <div className="space-y-3">
      <Encabezado titulo="Cocina">
        <label className="flex min-h-11 items-center gap-2 font-bold">
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} className="size-5 accent-noche" />
          Actualizar cada 30 s
        </label>
      </Encabezado>
      {pendientes > 0 && <p className="text-gris">{pendientes} pedido(s) esperan confirmación en Pedidos; aparecerán aquí al confirmarlos.</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNAS.map(col => {
          const ps = st.rango!.pedidos.filter(p => p.estado === col.estado).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
          return (
            <section key={col.estado} aria-label={col.t}>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">{col.t} <span className="tabular text-gris">({ps.length})</span></h2>
              {!ps.length ? <Vacio titulo="Nada aquí" /> : (
                <ul className="space-y-3">
                  {ps.map(p => (
                    <li key={p.id} className={cx('rounded-2xl border-2 bg-white p-3', col.estado === 'listo' ? 'border-e-listo' : 'border-noche')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-2xl font-bold tabular">{p.codigo}</span>
                        <span className="text-right text-gris"><span className="tabular">{hora(p.confirmadoEn || p.creadoEn)}</span><br />{ETIQUETA_CANAL[p.canal]}{p.cliente && ` · ${p.cliente}`}</span>
                      </div>
                      <ul className="mt-2 space-y-1.5 text-lg">
                        {(lineasPor.get(p.id) ?? []).map(l => (
                          <li key={l.id}>
                            <b className="tabular">{l.cantidad}×</b> {l.producto}{l.variante && <b> · {l.variante}</b>}
                            {l.extras && <span className="block pl-7 text-base">+ {l.extras.replace(/ \(\+S\/ [\d.]+\)/g, '')}</span>}
                            {l.nota && <span className="block pl-7 text-base font-bold text-e-canc">⚑ {l.nota}</span>}
                          </li>
                        ))}
                      </ul>
                      {p.nota && <p className="mt-2 rounded-lg bg-e-pend-bg p-2 font-bold text-e-pend">Nota: {p.nota}</p>}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <EstadoBadge estado={p.estado} />
                        <Btn variante="principal" cargando={ocupado === p.id} onClick={() => mover(p, col.siguiente)}>{col.accion}</Btn>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
