import { useStore } from '../lib/store'
import { fechaCorta, rangoPreset, type Preset } from '../lib/util'
import { cx } from './ui'

const PRESETS: { p: Preset; t: string }[] = [
  { p: 'hoy', t: 'Hoy' }, { p: 'ayer', t: 'Ayer' }, { p: '7d', t: '7 días' }, { p: 'mes', t: 'Este mes' }, { p: 'mesAnterior', t: 'Mes anterior' },
]

/** Selector de fechas compartido: Inicio, Pedidos, Gastos y Reportes miran el mismo rango. */
export function RangoFechas() {
  const st = useStore()
  const hoy = st.inicial?.hoy
  const activo = PRESETS.find(x => { const r = rangoPreset(x.p, hoy); return r.desde === st.sel.desde && r.hasta === st.sel.hasta })?.p
  const cambiar = (desde: string, hasta: string) => { if (desde && hasta && desde <= hasta) st.setSel({ desde, hasta }) }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periodo">
        {PRESETS.map(x => (
          <button key={x.p} type="button" aria-pressed={activo === x.p} onClick={() => { const r = rangoPreset(x.p, hoy); cambiar(r.desde, r.hasta) }}
            className={cx('min-h-10 rounded-full border-2 px-3 text-sm font-bold cursor-pointer', activo === x.p ? 'border-noche bg-noche text-amarillo' : 'border-linea bg-white hover:border-noche')}>
            {x.t}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <label className="sr-only" htmlFor="rf-desde">Desde</label>
        <input id="rf-desde" type="date" value={st.sel.desde} max={st.sel.hasta} onChange={e => cambiar(e.target.value, st.sel.hasta)}
          className="min-h-10 rounded-xl border-2 border-linea bg-white px-2" />
        <span aria-hidden>a</span>
        <label className="sr-only" htmlFor="rf-hasta">Hasta</label>
        <input id="rf-hasta" type="date" value={st.sel.hasta} min={st.sel.desde} onChange={e => cambiar(st.sel.desde, e.target.value)}
          className="min-h-10 rounded-xl border-2 border-linea bg-white px-2" />
      </div>
    </div>
  )
}

export const textoRango = (desde: string, hasta: string) => (desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`)
