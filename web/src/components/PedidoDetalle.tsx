import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '../lib/toast'
import { useStore } from '../lib/store'
import { nuevaClave } from '../lib/api'
import type { DetallePedido, Estado } from '../lib/types'
import { ETIQUETA_CANAL, ETIQUETA_ESTADO, TRANSICIONES } from '../lib/types'
import { c, fechaHora, s, soles } from '../lib/util'
import { Btn, Campo, Dinero, EstadoBadge, Input, Modal, Opciones, PagoBadge, confirmar } from './ui'

export const ACCION_ESTADO: Partial<Record<Estado, string>> = {
  confirmado: 'Confirmar', preparando: 'Empezar a preparar', listo: 'Marcar listo', entregado: 'Marcar entregado',
}

/** Detalle de un pedido, cargado bajo demanda (líneas, pagos e historial), con sus acciones. */
export function PedidoDetalle({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const st = useStore()
  const [d, setD] = useState<DetallePedido | null>(null)
  const [accion, setAccion] = useState<'' | 'cobrar' | 'cancelar' | 'devolver' | 'delivery'>('')
  const [ocupado, setOcupado] = useState('')
  const medios = (st.inicial?.config.medios_pago || 'Efectivo').split(',').map(x => x.trim()).filter(Boolean)

  // Referencias estables: el detalle se pide una vez por pedido (y tras cada acción), no en cada render.
  const callRef = useRef(st.call)
  callRef.current = st.call
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar
  const cargar = useCallback(async () => {
    try { setD(await callRef.current<DetallePedido>('pedido', { id })) } catch (e) { toast((e as Error).message, 'error'); cerrarRef.current() }
  }, [id])
  useEffect(() => { void cargar() }, [cargar])

  const hacer = async (etiqueta: string, action: string, payload: unknown, exito: string) => {
    setOcupado(action)
    try {
      await st.run(etiqueta, () => st.call(action, payload), exito)
      setAccion('')
      await Promise.all([cargar(), st.recargarRango()])
    } catch { /* el aviso ya se mostró; el formulario queda abierto para reintentar con la misma clave */ } finally { setOcupado('') }
  }

  const p = d?.pedido
  return (
    <Modal abierto onCerrar={onCerrar} titulo={p ? `Pedido ${p.codigo}` : 'Pedido'} ancho="max-w-2xl">
      {!d || !p ? <p className="py-8 text-center text-gris" role="status">Cargando pedido…</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={p.estado} /><PagoBadge estado={p.estadoPago} />
            <span className="text-gris">{ETIQUETA_CANAL[p.canal]} · {fechaHora(p.creadoEn)}{p.origen === 'carta' ? ' · Desde la carta' : ''}</span>
          </div>
          {(p.cliente || p.telefono || p.direccion) && (
            <div className="rounded-xl bg-papel p-3">
              {p.cliente && <p className="font-bold">{p.cliente}{p.telefono && <a className="ml-2 font-normal underline" href={`tel:${p.telefono}`}>{p.telefono}</a>}</p>}
              {p.direccion && <p>{p.direccion}{p.referencia && <span className="text-gris"> · {p.referencia}</span>}</p>}
            </div>
          )}
          {p.nota && <p className="italic">“{p.nota}”</p>}

          <ul className="divide-y-2 divide-linea rounded-xl border-2 border-linea">
            {d.lineas.map(l => (
              <li key={l.id} className="flex justify-between gap-3 p-3">
                <span><b>{l.cantidad} × {l.producto}</b>{l.variante && ` · ${l.variante}`}
                  {l.extras && <span className="block text-sm text-gris">+ {l.extras}</span>}
                  {l.nota && <span className="block text-sm italic">“{l.nota}”</span>}</span>
                <span className="text-right"><Dinero v={l.importe} className="font-bold" /><span className="block text-sm text-gris tabular">{soles(l.precioUnitario)} c/u</span></span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1">
            {p.canal === 'delivery' && <F t="Delivery" v={p.deliveryEstado === 'por_confirmar' ? 'Por confirmar' : soles(p.delivery)} />}
            <F t="Total" v={soles(p.total)} fuerte />
            <F t="Pagado" v={soles(p.pagado)} />
            {p.devuelto > 0 && <F t="Devuelto" v={soles(p.devuelto)} />}
            {p.estado !== 'cancelado' && <F t="Saldo por cobrar" v={soles(p.saldo)} />}
            {p.estado === 'cancelado' && <F t="Motivo de cancelación" v={p.motivoCancelacion} />}
          </dl>

          <div className="flex flex-wrap gap-2">
            {TRANSICIONES[p.estado].map(a => (
              <Btn key={a} variante={a === TRANSICIONES[p.estado][0] ? 'principal' : 'secundario'} cargando={ocupado === 'cambiarEstado'}
                disabled={a !== 'pendiente' && p.deliveryEstado === 'por_confirmar'}
                onClick={() => hacer('Cambiar estado', 'cambiarEstado', { pedidoId: p.id, estado: a }, `${p.codigo}: ${ETIQUETA_ESTADO[a]}`)}>
                {ACCION_ESTADO[a]}
              </Btn>
            ))}
            {p.estado !== 'cancelado' && p.saldo > 0 && p.deliveryEstado !== 'por_confirmar' && <Btn onClick={() => setAccion('cobrar')}>Registrar cobro</Btn>}
            {p.canal === 'delivery' && !['entregado', 'cancelado'].includes(p.estado) && <Btn onClick={() => setAccion('delivery')}>{p.deliveryEstado === 'por_confirmar' ? 'Definir delivery' : 'Cambiar delivery'}</Btn>}
            {p.estadoPago === 'devolucion_pendiente' && <Btn variante="principal" onClick={() => setAccion('devolver')}>Registrar devolución</Btn>}
            {!['entregado', 'cancelado'].includes(p.estado) && <Btn variante="peligro" onClick={() => setAccion('cancelar')}>Cancelar pedido</Btn>}
          </div>
          {p.deliveryEstado === 'por_confirmar' && <p className="text-sm font-bold text-e-pend">Define el costo de delivery (puede ser 0) para confirmar y cobrar.</p>}

          {accion === 'cobrar' && <Cobrar saldo={p.saldo} medios={medios} ocupado={ocupado === 'registrarPago'} cajaAbierta={!!st.inicial?.caja}
            onCancelar={() => setAccion('')} onOk={(medio, monto, clave) => hacer('Registrar cobro', 'registrarPago', { clave, pedidoId: p.id, medio, monto }, `Cobro registrado: ${soles(monto)}`)} />}
          {accion === 'delivery' && <Delivery actual={p.delivery} ocupado={ocupado === 'definirDelivery'} onCancelar={() => setAccion('')}
            onOk={monto => hacer('Definir delivery', 'definirDelivery', { pedidoId: p.id, monto }, `Delivery: ${soles(monto)}`)} />}
          {accion === 'cancelar' && <Cancelar neto={s(c(p.pagado) - c(p.devuelto))} medios={medios} ocupado={ocupado === 'cancelarPedido'} onCancelar={() => setAccion('')}
            onOk={x => hacer('Cancelar pedido', 'cancelarPedido', { pedidoId: p.id, ...x }, `Pedido ${p.codigo} cancelado`)} />}
          {accion === 'devolver' && <Devolver monto={s(c(p.pagado) - c(p.devuelto))} medios={medios} ocupado={ocupado === 'registrarDevolucion'} onCancelar={() => setAccion('')}
            onOk={(medio, clave) => hacer('Registrar devolución', 'registrarDevolucion', { pedidoId: p.id, medio, clave }, 'Devolución registrada')} />}

          {d.pagos.length > 0 && (
            <div>
              <h3 className="mb-2 font-bold">Pagos y devoluciones</h3>
              <ul className="space-y-2">
                {d.pagos.map(x => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-linea p-2">
                    <span className={x.estado === 'anulado' ? 'text-gris line-through' : ''}>
                      <b>{x.tipo === 'pago' ? 'Cobro' : 'Devolución'}</b> {soles(x.monto)} · {x.medio} · {fechaHora(x.fechaHora)}{!x.cajaId && ' · sin caja'}
                    </span>
                    {x.estado === 'anulado' ? <span className="text-sm text-gris">{x.nota}</span> : (
                      <Btn variante="fantasma" className="text-sm" onClick={async () => {
                        const motivo = prompt('Motivo para anular este registro (ej. monto equivocado):')
                        if (!motivo) return
                        if (await confirmar({ titulo: 'Anular registro', texto: `Se anulará ${x.tipo === 'pago' ? 'el cobro' : 'la devolución'} de ${soles(x.monto)}. Queda en el historial, no se borra.`, ok: 'Anular', peligro: true }))
                          void hacer('Anular', 'anularPago', { pagoId: x.id, motivo }, 'Registro anulado').catch(() => {})
                      }}>Anular</Btn>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary className="cursor-pointer font-bold">Historial ({d.historial.length})</summary>
            <ol className="mt-2 space-y-1 text-sm">
              {d.historial.map(h => <li key={h.id}><span className="tabular text-gris">{fechaHora(h.fechaHora)}</span> · {h.tipo === 'pedido' ? `${h.de ? ETIQUETA_ESTADO[h.de as Estado] + ' → ' : ''}${ETIQUETA_ESTADO[h.a as Estado] ?? h.a}` : `${h.tipo}: ${h.de} → ${h.a}`}{h.nota && ` · ${h.nota}`}</li>)}
            </ol>
          </details>
        </div>
      )}
    </Modal>
  )
}

const F = ({ t, v, fuerte }: { t: string; v: string; fuerte?: boolean }) => (
  <div className={`flex justify-between gap-3 ${fuerte ? 'text-xl font-bold' : ''}`}><dt className={fuerte ? '' : 'text-gris'}>{t}</dt><dd className="tabular text-right">{v}</dd></div>
)

function Caja({ children }: { children: React.ReactNode }) { return <div className="entra space-y-3 rounded-2xl border-2 border-noche bg-papel p-3">{children}</div> }

function Cobrar({ saldo, medios, ocupado, cajaAbierta, onOk, onCancelar }: { saldo: number; medios: string[]; ocupado: boolean; cajaAbierta: boolean; onOk: (m: string, monto: number, clave: string) => void; onCancelar: () => void }) {
  const [clave] = useState(nuevaClave)
  const [medio, setMedio] = useState(medios[0] ?? 'Efectivo')
  const [monto, setMonto] = useState(String(saldo))
  const n = Number(monto)
  const ok = n > 0 && c(n) <= c(saldo)
  return (
    <Caja>
      <Opciones etiqueta="Medio" valor={medio} onCambio={setMedio} opciones={medios.map(m => ({ v: m, t: m }))} />
      <Campo etiqueta={`Monto (saldo ${soles(saldo)})`} error={monto && !ok ? 'Debe ser mayor a 0 y no superar el saldo.' : undefined}>
        <Input value={monto} onChange={e => setMonto(e.target.value.replace(',', '.'))} inputMode="decimal" />
      </Campo>
      {!cajaAbierta && <p className="text-sm font-bold text-e-pend">No hay caja abierta: el cobro no entrará en ninguna caja.</p>}
      <div className="flex gap-2"><Btn onClick={onCancelar}>Volver</Btn><Btn variante="principal" disabled={!ok} cargando={ocupado} onClick={() => onOk(medio, s(c(n)), clave)}>Registrar cobro</Btn></div>
    </Caja>
  )
}

function Delivery({ actual, ocupado, onOk, onCancelar }: { actual: number | null; ocupado: boolean; onOk: (m: number) => void; onCancelar: () => void }) {
  const [v, setV] = useState(actual === null ? '' : String(actual))
  const ok = v !== '' && Number(v) >= 0 && isFinite(Number(v))
  return (
    <Caja>
      <Campo etiqueta="Costo de delivery (S/)" ayuda="Puede ser 0 si es gratis."><Input value={v} onChange={e => setV(e.target.value.replace(',', '.'))} inputMode="decimal" /></Campo>
      <div className="flex gap-2"><Btn onClick={onCancelar}>Volver</Btn><Btn variante="principal" disabled={!ok} cargando={ocupado} onClick={() => onOk(Number(v))}>Guardar delivery</Btn></div>
    </Caja>
  )
}

function Cancelar({ neto, medios, ocupado, onOk, onCancelar }: { neto: number; medios: string[]; ocupado: boolean; onOk: (x: object) => void; onCancelar: () => void }) {
  const [clave] = useState(nuevaClave)
  const [motivo, setMotivo] = useState('')
  const [dev, setDev] = useState<'pendiente' | 'devuelto'>('pendiente')
  const [medio, setMedio] = useState(medios[0] ?? 'Efectivo')
  return (
    <Caja>
      <Campo etiqueta="Motivo"><Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. el cliente desistió" /></Campo>
      {neto > 0 && (
        <>
          <p className="font-bold">Este pedido tiene {soles(neto)} cobrados. ¿Qué pasa con ese dinero?</p>
          <Opciones etiqueta="Tratamiento del dinero" valor={dev} onCambio={setDev} opciones={[{ v: 'pendiente', t: 'Queda pendiente de devolver' }, { v: 'devuelto', t: 'Ya lo devolví' }]} />
          {dev === 'devuelto' && <Opciones etiqueta="Medio de devolución" valor={medio} onCambio={setMedio} opciones={medios.map(m => ({ v: m, t: m }))} />}
        </>
      )}
      <p className="text-sm text-gris">El pedido no se borra: queda como cancelado con su historial.</p>
      <div className="flex gap-2"><Btn onClick={onCancelar}>Volver</Btn>
        <Btn variante="oscuro" disabled={!motivo.trim()} cargando={ocupado} onClick={async () => {
          if (await confirmar({ titulo: 'Cancelar pedido', texto: neto > 0 ? `Se cancelará y ${dev === 'devuelto' ? `se registrará la devolución de ${soles(neto)} por ${medio}` : `quedarán ${soles(neto)} pendientes de devolver`}.` : 'Se cancelará el pedido.', ok: 'Cancelar pedido', peligro: true }))
            onOk({ motivo, devolucion: neto > 0 ? dev : '', medioDevolucion: medio, clave })
        }}>Cancelar pedido</Btn></div>
    </Caja>
  )
}

function Devolver({ monto, medios, ocupado, onOk, onCancelar }: { monto: number; medios: string[]; ocupado: boolean; onOk: (medio: string, clave: string) => void; onCancelar: () => void }) {
  const [clave] = useState(nuevaClave)
  const [medio, setMedio] = useState(medios[0] ?? 'Efectivo')
  return (
    <Caja>
      <p className="font-bold">Devolución de {soles(monto)}</p>
      <Opciones etiqueta="Medio de devolución" valor={medio} onCambio={setMedio} opciones={medios.map(m => ({ v: m, t: m }))} />
      <div className="flex gap-2"><Btn onClick={onCancelar}>Volver</Btn><Btn variante="principal" cargando={ocupado} onClick={() => onOk(medio, clave)}>Registrar devolución</Btn></div>
    </Caja>
  )
}
