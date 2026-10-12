import { useEffect, useState, type ReactNode } from 'react'
import { BarChart3, ChefHat, ClipboardList, Home, Loader2, MoreHorizontal, RefreshCw, Settings, ShoppingBag, Utensils, Wallet, Receipt, CheckCircle2 } from 'lucide-react'
import { useStore } from './lib/store'
import { Btn, Confirmador, cx } from './components/ui'
import { Toaster } from './components/Toaster'
import { Login } from './tabs/Login'
import { Inicio } from './tabs/Inicio'
import { Vender } from './tabs/Vender'
import { Pedidos } from './tabs/Pedidos'
import { Cocina } from './tabs/Cocina'
import { CajaTab } from './tabs/Caja'
import { Gastos } from './tabs/Gastos'
import { Carta } from './tabs/Carta'
import { Reportes } from './tabs/Reportes'
import { Ajustes } from './tabs/Ajustes'
import { hora } from './lib/util'

export type Tab = 'inicio' | 'vender' | 'pedidos' | 'cocina' | 'caja' | 'gastos' | 'carta' | 'reportes' | 'ajustes'
const TABS: { id: Tab; t: string; I: typeof Home }[] = [
  { id: 'inicio', t: 'Inicio', I: Home },
  { id: 'vender', t: 'Nueva venta', I: ShoppingBag },
  { id: 'pedidos', t: 'Pedidos', I: ClipboardList },
  { id: 'cocina', t: 'Cocina', I: ChefHat },
  { id: 'caja', t: 'Caja', I: Wallet },
  { id: 'gastos', t: 'Gastos', I: Receipt },
  { id: 'carta', t: 'Carta', I: Utensils },
  { id: 'reportes', t: 'Reportes', I: BarChart3 },
  { id: 'ajustes', t: 'Ajustes', I: Settings },
]
const EN_BARRA: Tab[] = ['inicio', 'vender', 'pedidos', 'caja']

const leerHash = (): Tab => { const h = location.hash.replace('#', '') as Tab; return TABS.some(t => t.id === h) ? h : 'inicio' }

export function App() {
  const st = useStore()
  const [tab, setTabState] = useState<Tab>(leerHash)
  const [mas, setMas] = useState(false)
  useEffect(() => { const f = () => setTabState(leerHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const ir = (t: Tab) => { location.hash = t; setTabState(t); setMas(false); scrollTo({ top: 0 }) }

  if (!st.autenticado) return <><Login /><Toaster /></>
  const vista: Record<Tab, ReactNode> = {
    inicio: <Inicio ir={ir} />, vender: <Vender />, pedidos: <Pedidos />, cocina: <Cocina />, caja: <CajaTab />,
    gastos: <Gastos />, carta: <Carta />, reportes: <Reportes />, ajustes: <Ajustes />,
  }

  return (
    <div className="min-h-dvh xl:grid xl:grid-cols-[15rem_1fr]">
      {/* Menú lateral: laptop y escritorio */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-noche text-white xl:flex">
        <Marca />
        <div className="franja" />
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Secciones">
          {TABS.map(({ id, t, I }) => (
            <button key={id} type="button" onClick={() => ir(id)} aria-current={tab === id ? 'page' : undefined}
              className={cx('mb-1 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-bold cursor-pointer',
                tab === id ? 'bg-amarillo text-noche' : 'text-white/85 hover:bg-white/10')}>
              <I className="size-5" aria-hidden />{t}
            </button>
          ))}
        </nav>
        {st.modo === 'demo' && <p className="m-3 rounded-xl bg-lima px-3 py-2 text-sm font-bold text-noche">Modo demostración: datos de ejemplo que no se guardan en la hoja.</p>}
        {st.modo === 'real' && st.inicial?.config.datos_demo === 'SI' && <p className="m-3 rounded-xl bg-lima px-3 py-2 text-sm font-bold text-noche">La hoja tiene datos de demostración. Bórralos en Ajustes antes de usarla en serio.</p>}
      </aside>

      <div className="min-w-0 pb-24 xl:pb-8">
        {/* Banda superior: celular y tablet */}
        <header className="sticky top-0 z-20 bg-noche text-white xl:hidden">
          <div className="flex items-center gap-2 pr-2">
            <div className="min-w-0 flex-1"><Marca compacta /></div>
            <EstadoGuardado />
          </div>
          <div className="franja" />
          {st.modo === 'demo' && <p className="bg-lima px-4 py-1 text-sm font-bold text-noche">Modo demostración: nada se guarda en la hoja real.</p>}
          {st.modo === 'real' && st.inicial?.config.datos_demo === 'SI' && <p className="bg-lima px-4 py-1 text-sm font-bold text-noche">Datos de demostración cargados. Bórralos en Ajustes antes de usar la app en serio.</p>}
        </header>
        <div className="sticky top-0 z-10 hidden items-center justify-end gap-3 bg-papel/90 px-6 py-2 backdrop-blur xl:flex">
          <EstadoGuardado claro />
        </div>
        <main className="mx-auto w-full max-w-7xl px-3 pt-4 sm:px-5 xl:px-8">{vista[tab]}</main>
      </div>

      {/* Barra inferior: celular y tablet */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-2 border-noche bg-white xl:hidden" aria-label="Secciones">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {EN_BARRA.map(id => { const x = TABS.find(t => t.id === id)!; return (
            <button key={id} type="button" onClick={() => ir(id)} aria-current={tab === id ? 'page' : undefined}
              className={cx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.8rem] font-bold cursor-pointer', tab === id ? 'text-noche' : 'text-gris')}>
              <span className={cx('grid h-8 w-12 place-items-center rounded-full', tab === id && 'bg-amarillo')}><x.I className="size-5" aria-hidden /></span>
              {id === 'vender' ? 'Vender' : x.t}
            </button>
          ) })}
          <button type="button" onClick={() => setMas(v => !v)} aria-expanded={mas}
            className={cx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.8rem] font-bold cursor-pointer', !EN_BARRA.includes(tab) ? 'text-noche' : 'text-gris')}>
            <span className={cx('grid h-8 w-12 place-items-center rounded-full', !EN_BARRA.includes(tab) && 'bg-amarillo')}><MoreHorizontal className="size-5" aria-hidden /></span>Más
          </button>
        </div>
        {mas && (
          <div className="entra absolute inset-x-0 bottom-full border-t-2 border-noche bg-white p-3 shadow-2xl">
            <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
              {TABS.filter(t => !EN_BARRA.includes(t.id)).map(({ id, t, I }) => (
                <button key={id} type="button" onClick={() => ir(id)} className={cx('flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 font-bold cursor-pointer', tab === id ? 'border-noche bg-amarillo' : 'border-linea')}>
                  <I className="size-5" aria-hidden />{t}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>
      {st.sesionVencida && <Login overlay />}
      <Confirmador />
      <Toaster />
    </div>
  )
}

function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <div className={cx('px-4', compacta ? 'py-2' : 'py-5')}>
      <p className={cx('cartel', compacta ? 'text-[1.05rem]' : 'text-[1.35rem]')}>Antojos &amp;<br className={compacta ? 'hidden' : ''} /> Tentaciones</p>
      <p className="mt-1 text-sm text-white/75">By Pamela Páez</p>
    </div>
  )
}

/** Estado de guardado siempre visible + actualizar datos sin perder lo que se está registrando. */
function EstadoGuardado({ claro }: { claro?: boolean }) {
  const st = useStore()
  const [actualizando, setAct] = useState(false)
  const texto = st.guardando > 0 ? 'Guardando…' : st.ultimoGuardado ? `Guardado ${hora(st.ultimoGuardado)}` : ''
  return (
    <div className="flex items-center gap-2">
      <span role="status" className={cx('flex items-center gap-1 text-sm font-bold', claro ? 'text-gris' : 'text-white/85')}>
        {st.guardando > 0 ? <Loader2 className="gira size-4" aria-hidden /> : st.ultimoGuardado ? <CheckCircle2 className="size-4" aria-hidden /> : null}{texto}
      </span>
      <Btn variante={claro ? 'secundario' : 'fantasma'} className={claro ? '' : 'text-white hover:bg-white/10'} cargando={actualizando || st.cargandoRango}
        onClick={async () => { setAct(true); try { await st.recargarTodo() } finally { setAct(false) } }} aria-label="Actualizar datos">
        {!(actualizando || st.cargandoRango) && <RefreshCw className="size-4" aria-hidden />}<span className="hidden sm:inline">Actualizar</span>
      </Btn>
    </div>
  )
}
