import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { nuevaClave } from '../lib/api'
import type { Caja } from '../lib/types'
import { c, fechaCorta, fechaHora, hora, s, soles } from '../lib/util'
import { Btn, Campo, ComoSeCalcula, Dinero, Input, Modal, Opciones, Seccion, Textarea, Vacio, confirmar, cx } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { Cargando } from './Inicio'

const TIPO_MOV: Record<string, string> = { cobro: 'Cobro', devolucion: 'Devolución', gasto: 'Gasto', retiro: 'Retiro de la dueña', aporte: 'Aporte de la dueña' }

export function CajaTab() {
  const st = useStore()
  const caja = st.inicial?.caja
  const [historial, setHistorial] = useState<Caja[] | null>(null)
  // Al entrar se trae la caja actual (los cobros de otras pantallas o equipos la cambian).
  const ref = useRef(st)
  ref.current = st
  useEffect(() => { ref.current.call<Caja | null>('cajaActual', {}).then(x => ref.current.setCaja(x)).catch(() => {}) }, [])
  if (!st.inicial) return <Cargando />
  return (
    <div className="space-y-4">
      <Encabezado titulo="Caja" sub={caja ? `Abierta desde ${fechaCorta(caja.fecha)}, ${hora(caja.abiertaEn)}` : 'No hay caja abierta'} />
      {caja ? <Abierta caja={caja} /> : <Abrir />}
      <Seccion titulo="Cierres anteriores" accion={historial === null && <Btn onClick={async () => setHistorial(await st.call<Caja[]>('cajas', { limite: 30 }))}>Ver cierres</Btn>}>
        {historial === null ? <p className="text-gris">Se cargan solo cuando los pides.</p> : !historial.filter(x => x.estado === 'cerrada').length ? <Vacio titulo="Todavía no hay cierres" /> : (
          <div className="scroll-x">
            <table className="w-full min-w-[36rem] text-left">
              <thead><tr className="border-b-2 border-noche"><th className="py-2">Fecha</th><th>Fondo</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Observación</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {historial.filter(x => x.estado === 'cerrada').map(x => (
                  <tr key={x.id}><td className="py-2">{fechaCorta(x.fecha)}</td><td><Dinero v={x.fondo} /></td><td><Dinero v={x.esperado} /></td><td><Dinero v={x.contado} /></td>
                    <td className={cx('font-bold', (x.diferencia ?? 0) < 0 ? 'text-e-canc' : (x.diferencia ?? 0) > 0 ? 'text-e-conf' : '')}><Dinero v={x.diferencia} /></td><td className="text-sm">{x.observacion}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  )
}

function Abrir() {
  const st = useStore()
  const [clave] = useState(nuevaClave)
  const [fondo, setFondo] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ok = fondo !== '' && Number(fondo) >= 0
  return (
    <Seccion titulo="Abrir caja">
      <p className="mb-3 text-gris">El fondo inicial es el efectivo con el que empiezas (sencillo para vuelto).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fondo inicial en efectivo (S/)"><Input value={fondo} onChange={e => setFondo(e.target.value.replace(',', '.'))} inputMode="decimal" /></Campo>
        <Campo etiqueta="Observación (opcional)"><Input value={obs} onChange={e => setObs(e.target.value)} /></Campo>
      </div>
      <Btn variante="principal" grande className="mt-3" disabled={!ok} cargando={enviando} onClick={async () => {
        setEnviando(true)
        try { st.setCaja(await st.run('Abrir caja', () => st.call<Caja>('abrirCaja', { clave, fondo: Number(fondo), observacion: obs }), 'Caja abierta')) }
        catch { /* aviso mostrado */ } finally { setEnviando(false) }
      }}>Abrir caja</Btn>
    </Seccion>
  )
}

function Abierta({ caja }: { caja: Caja }) {
  const st = useStore()
  const [mov, setMov] = useState<'' | 'retiro' | 'aporte'>('')
  const [cerrar, setCerrar] = useState(false)
  const a = caja.actual!
  const medios = (st.inicial?.config.medios_pago || 'Efectivo').split(',').map(x => x.trim()).filter(Boolean)
  const ef = a.medios.find(m => m.medio === 'Efectivo')
  const digitales = a.medios.filter(m => m.medio !== 'Efectivo')

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border-2 border-noche bg-amarillo p-4 md:col-span-1">
          <p className="font-bold">Efectivo esperado en caja</p>
          <p className="mt-1 text-3xl font-bold"><Dinero v={a.efectivoEsperado} /></p>
          <dl className="mt-2 space-y-0.5 text-sm">
            <L t="Fondo inicial" v={a.fondo} />
            <L t="+ Cobros en efectivo" v={ef?.cobros ?? 0} />
            <L t="+ Aportes" v={ef?.aportes ?? 0} />
            <L t="− Gastos pagados de caja" v={ef?.gastos ?? 0} />
            <L t="− Devoluciones" v={ef?.devoluciones ?? 0} />
            <L t="− Retiros" v={ef?.retiros ?? 0} />
          </dl>
        </div>
        <div className="rounded-2xl border-2 border-linea bg-white p-4 md:col-span-2">
          <p className="font-bold">Pagos digitales (no están en el cajón)</p>
          {!digitales.length ? <p className="mt-2 text-gris">Sin movimientos digitales en esta caja.</p> : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {digitales.map(m => (
                <li key={m.medio} className="rounded-xl bg-papel p-3">
                  <p className="font-bold">{m.medio}</p>
                  <p className="text-2xl font-bold"><Dinero v={m.neto} /></p>
                  <p className="text-sm text-gris">Cobros {soles(m.cobros)}{m.devoluciones ? ` · devoluciones ${soles(m.devoluciones)}` : ''}{m.gastos ? ` · gastos ${soles(m.gastos)}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
          <ComoSeCalcula>
            Solo cuenta lo registrado mientras esta caja estuvo abierta. Cada cobro, devolución o gasto pagado desde caja es un único movimiento, así nada se descuenta dos veces.
            Los gastos que no se pagaron desde caja aparecen en Gastos, no aquí. Retiros y aportes de la dueña no son ventas ni gastos.
          </ComoSeCalcula>
          {!!caja.cobrosSinCaja && <p className="mt-2 font-bold text-e-pend">Hoy hubo {soles(caja.cobrosSinCaja)} cobrados sin caja abierta: no figuran en esta caja.</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setMov('retiro')}>Retiro de la dueña</Btn>
        <Btn onClick={() => setMov('aporte')}>Aporte de la dueña</Btn>
        <Btn variante="oscuro" grande className="ml-auto" onClick={() => setCerrar(true)}>Cerrar caja</Btn>
      </div>

      <Seccion titulo={`Movimientos (${caja.movimientos?.length ?? 0})`}>
        {!caja.movimientos?.length ? <Vacio titulo="Aún no hay movimientos" /> : (
          <ul className="divide-y-2 divide-linea">
            {caja.movimientos.map(m => (
              <li key={m.id} className={cx('flex flex-wrap items-center justify-between gap-2 py-2', m.estado === 'anulado' && 'text-gris line-through')}>
                <span><span className="tabular text-gris">{hora(m.fechaHora)}</span> <b>{TIPO_MOV[m.tipo]}</b> · {m.medio}{m.nota && <span className="text-gris"> · {m.nota}</span>}</span>
                <span className="flex items-center gap-2">
                  <span className={cx('font-bold tabular', m.sentido === 'egreso' ? 'text-e-canc' : 'text-e-listo')}>{m.sentido === 'egreso' ? '−' : '+'}{soles(m.monto)}</span>
                  {m.referencia === 'duena' && m.estado === 'activo' && (
                    <Btn variante="fantasma" className="text-sm" onClick={async () => {
                      if (!(await confirmar({ titulo: 'Anular movimiento', texto: `Se anulará el ${TIPO_MOV[m.tipo].toLowerCase()} de ${soles(m.monto)}. Queda registrado como anulado.`, ok: 'Anular', peligro: true }))) return
                      try { st.setCaja(await st.run('Anular', () => st.call<Caja>('anularMovimiento', { id: m.id, motivo: 'Anulado desde el panel' }), 'Movimiento anulado')) } catch { /* aviso */ }
                    }}>Anular</Btn>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {mov && <Movimiento tipo={mov} medios={medios} onCerrar={() => setMov('')} />}
      {cerrar && <Cerrar caja={caja} onCerrar={() => setCerrar(false)} />}
    </>
  )
}
const L = ({ t, v }: { t: string; v: number }) => <div className="flex justify-between gap-2"><dt>{t}</dt><dd className="tabular">{soles(v)}</dd></div>

function Movimiento({ tipo, medios, onCerrar }: { tipo: 'retiro' | 'aporte'; medios: string[]; onCerrar: () => void }) {
  const st = useStore()
  const [clave] = useState(nuevaClave)
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState('Efectivo')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ok = Number(monto) > 0
  return (
    <Modal abierto onCerrar={onCerrar} titulo={tipo === 'retiro' ? 'Retiro de la dueña' : 'Aporte de la dueña'}
      pie={<><Btn onClick={onCerrar}>Volver</Btn><Btn variante="principal" disabled={!ok} cargando={enviando} onClick={async () => {
        setEnviando(true)
        try { st.setCaja(await st.run('Registrar movimiento', () => st.call<Caja>('movimientoCaja', { clave, tipo, monto: Number(monto), medio, nota }), 'Movimiento registrado')); onCerrar() }
        catch { /* aviso */ } finally { setEnviando(false) }
      }}>Registrar</Btn></>}>
      <div className="space-y-3">
        <p className="text-gris">{tipo === 'retiro' ? 'Dinero que sacas de la caja para ti o para otro uso. No es un gasto del negocio.' : 'Dinero que pones en la caja (por ejemplo, más sencillo). No es una venta.'}</p>
        <Campo etiqueta="Monto (S/)"><Input value={monto} onChange={e => setMonto(e.target.value.replace(',', '.'))} inputMode="decimal" autoFocus /></Campo>
        <Opciones etiqueta="Medio" valor={medio} onCambio={setMedio} opciones={medios.map(m => ({ v: m, t: m }))} />
        <Campo etiqueta="Nota (opcional)"><Input value={nota} onChange={e => setNota(e.target.value)} /></Campo>
      </div>
    </Modal>
  )
}

function Cerrar({ caja, onCerrar }: { caja: Caja; onCerrar: () => void }) {
  const st = useStore()
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const esperado = caja.actual!.efectivoEsperado
  const dif = contado === '' ? null : s(c(Number(contado)) - c(esperado))
  const ok = contado !== '' && Number(contado) >= 0 && (dif === 0 || obs.trim().length > 0)
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Cerrar caja"
      pie={<><Btn onClick={onCerrar}>Volver</Btn><Btn variante="oscuro" disabled={!ok} cargando={enviando} onClick={async () => {
        if (!(await confirmar({ titulo: 'Confirmar cierre', texto: `Efectivo contado ${soles(Number(contado))}, diferencia ${soles(dif)}. Una caja cerrada no se puede reabrir.`, ok: 'Cerrar caja', peligro: true }))) return
        setEnviando(true)
        try {
          const r = await st.run('Cerrar caja', () => st.call<Caja>('cerrarCaja', { cajaId: caja.id, contado: Number(contado), observacion: obs }), 'Caja cerrada')
          void r
          st.setCaja(null); onCerrar(); void st.recargarRango()
        } catch { /* aviso */ } finally { setEnviando(false) }
      }}>Cerrar caja</Btn></>}>
      <div className="space-y-3">
        <p>Cuenta el efectivo del cajón y anótalo.</p>
        <dl className="rounded-xl bg-papel p-3"><div className="flex justify-between text-lg font-bold"><dt>Efectivo esperado</dt><dd className="tabular">{soles(esperado)}</dd></div>
          <div className="flex justify-between text-gris"><dt>Digitales (Yape, Plin, etc.)</dt><dd className="tabular">{soles(caja.actual!.digital)}</dd></div></dl>
        <Campo etiqueta="Efectivo contado (S/)"><Input value={contado} onChange={e => setContado(e.target.value.replace(',', '.'))} inputMode="decimal" autoFocus /></Campo>
        {dif !== null && (
          <p className={cx('rounded-xl p-3 text-lg font-bold', dif === 0 ? 'bg-e-listo-bg text-e-listo' : dif < 0 ? 'bg-e-canc-bg text-e-canc' : 'bg-e-conf-bg text-e-conf')}>
            {dif === 0 ? 'Cuadra exacto' : dif < 0 ? `Falta ${soles(-dif)}` : `Sobra ${soles(dif)}`}
          </p>
        )}
        <Campo etiqueta={dif ? 'Observación (obligatoria si hay diferencia)' : 'Observación (opcional)'}><Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} /></Campo>
        <p className="text-sm text-gris">Abierta {fechaHora(caja.abiertaEn)}.</p>
      </div>
    </Modal>
  )
}
