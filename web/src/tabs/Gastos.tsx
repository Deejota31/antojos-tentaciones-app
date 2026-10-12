import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { nuevaClave } from '../lib/api'
import type { Gasto } from '../lib/types'
import { calcular } from '../lib/engine'
import { fechaCorta, soles } from '../lib/util'
import { Btn, Campo, Dinero, Input, Opciones, Seccion, Vacio, confirmar, cx } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { RangoFechas, textoRango } from '../components/RangoFechas'
import { Cargando } from './Inicio'

const nuevoForm = (hoy: string, medio: string) => ({ clave: nuevaClave(), fecha: hoy, categoria: '', tipo: 'operativo' as 'compra' | 'operativo', descripcion: '', monto: '', medio, desdeCaja: medio === 'Efectivo', comprobante: '' })

export function Gastos() {
  const st = useStore()
  const ini = st.inicial
  const [f, setF] = useState(() => nuevoForm(ini?.hoy ?? '', 'Efectivo'))
  const [enviando, setEnviando] = useState(false)
  const m = useMemo(() => (st.rango ? calcular(st.rango) : null), [st.rango])
  if (!ini || !st.rango || !m) return <Cargando />
  const cats = (ini.config.categorias_gasto || '').split(',').map(x => x.trim()).filter(Boolean)
  const medios = (ini.config.medios_pago || 'Efectivo').split(',').map(x => x.trim()).filter(Boolean)
  const upd = (x: Partial<typeof f>) => setF(v => ({ ...v, ...x }))
  const fecha = f.fecha || ini.hoy
  const ok = f.categoria && Number(f.monto) > 0 && fecha && (!f.desdeCaja || !!ini.caja)
  const lista = [...st.rango.gastos].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))

  return (
    <div className="space-y-4">
      <Encabezado titulo="Gastos" sub={textoRango(st.sel.desde, st.sel.hasta)} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <Seccion titulo="Registrar gasto">
          <div className="space-y-3">
            <Campo etiqueta="Categoría"><Opciones etiqueta="Categoría" valor={f.categoria} onCambio={categoria => upd({ categoria })} opciones={cats.map(x => ({ v: x, t: x }))} /></Campo>
            <Campo etiqueta="Tipo" ayuda="Compra: insumos que se usan para producir (ingredientes, envases). Operativo: gas, limpieza, transporte, servicios.">
              <Opciones etiqueta="Tipo" valor={f.tipo} onCambio={tipo => upd({ tipo })} opciones={[{ v: 'compra', t: 'Compra de insumos' }, { v: 'operativo', t: 'Gasto operativo' }]} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Monto (S/)"><Input value={f.monto} onChange={e => upd({ monto: e.target.value.replace(',', '.') })} inputMode="decimal" /></Campo>
              <Campo etiqueta="Fecha"><Input type="date" value={fecha} max={ini.hoy} onChange={e => upd({ fecha: e.target.value })} /></Campo>
            </div>
            <Campo etiqueta="Descripción (opcional)"><Input value={f.descripcion} onChange={e => upd({ descripcion: e.target.value })} placeholder="Ej. 5 kg de papa" /></Campo>
            <Campo etiqueta="Medio de pago"><Opciones etiqueta="Medio" valor={f.medio} onCambio={medio => upd({ medio, desdeCaja: medio === 'Efectivo' && !!ini.caja })} opciones={medios.map(x => ({ v: x, t: x }))} /></Campo>
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 accent-noche" checked={f.desdeCaja} onChange={e => upd({ desdeCaja: e.target.checked })} />
              <span><b>Pagado con dinero de la caja</b><span className="block text-sm text-gris">{ini.caja ? 'Se descuenta de la caja abierta.' : 'No hay caja abierta: solo se registra como gasto.'}</span></span>
            </label>
            <Campo etiqueta="Comprobante (opcional)" ayuda="Número de boleta o enlace a la foto."><Input value={f.comprobante} onChange={e => upd({ comprobante: e.target.value })} /></Campo>
            <Btn variante="principal" grande className="w-full" disabled={!ok} cargando={enviando} onClick={async () => {
              setEnviando(true)
              try {
                await st.run('Registrar gasto', () => st.call<Gasto>('crearGasto', { ...f, fecha, monto: Number(f.monto) }), `Gasto registrado: ${soles(Number(f.monto))}`)
                setF(nuevoForm(ini.hoy, f.medio))
                void st.recargarRango()
              } catch { /* se conserva el formulario y su clave para reintentar */ } finally { setEnviando(false) }
            }}>Registrar gasto</Btn>
          </div>
        </Seccion>

        <div className="space-y-3">
          <RangoFechas />
          <div className="grid grid-cols-3 gap-2">
            <Tot t="Total" v={m.gastos.total} /><Tot t="Compras" v={m.gastos.compra} /><Tot t="Operativos" v={m.gastos.operativo} />
          </div>
          <p className="text-sm text-gris">Los gastos registrados no equivalen al costo de lo vendido. Ventas menos gastos no es la utilidad real.</p>
          {!lista.length ? <Vacio titulo="No hay gastos en este periodo" /> : (
            <ul className="space-y-2">
              {lista.map(g => (
                <li key={g.id} className={cx('flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-linea bg-white p-3', g.estado === 'anulado' && 'opacity-60')}>
                  <span className={g.estado === 'anulado' ? 'line-through' : ''}>
                    <b>{g.categoria}</b> · {g.tipo === 'compra' ? 'Compra' : 'Operativo'}{g.descripcion && ` · ${g.descripcion}`}
                    <span className="block text-sm text-gris">{fechaCorta(g.fecha)} · {g.medio}{g.desdeCaja ? ' · de caja' : ''}{g.comprobante && ` · ${g.comprobante}`}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Dinero v={g.monto} className="font-bold" />
                    {g.estado === 'activo' && <Btn variante="fantasma" className="text-sm" onClick={async () => {
                      if (!(await confirmar({ titulo: 'Anular gasto', texto: `Se anulará el gasto de ${soles(g.monto)}${g.desdeCaja ? ' y su movimiento de caja' : ''}. Queda registrado como anulado.`, ok: 'Anular', peligro: true }))) return
                      try { await st.run('Anular gasto', () => st.call('anularGasto', { id: g.id, motivo: 'Anulado desde el panel' }), 'Gasto anulado'); void st.recargarRango() } catch { /* aviso */ }
                    }}>Anular</Btn>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
const Tot = ({ t, v }: { t: string; v: number }) => <div className="rounded-2xl border-2 border-linea bg-white p-3"><p className="text-sm text-gris">{t}</p><p className="text-lg font-bold"><Dinero v={v} /></p></div>
