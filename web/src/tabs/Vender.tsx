import { useEffect, useMemo, useState } from 'react'
import { ImageOff, Minus, Plus, Search, ShoppingBag, Star, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { ApiError, nuevaClave } from '../lib/api'
import type { Canal, Opcion, Producto } from '../lib/types'
import { ETIQUETA_CANAL } from '../lib/types'
import { c, extrasDe, porOrden, precioUnitarioC, s, soles, variantesDe, vendible, type LineaCarrito } from '../lib/util'
import { Btn, Campo, Dinero, Input, Modal, Opciones, Textarea, cx } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { Cargando } from './Inicio'

type ModoPago = 'completo' | 'parcial' | 'pendiente'
interface Borrador {
  clave: string; lineas: LineaCarrito[]; canal: Canal; cliente: string; telefono: string; direccion: string; referencia: string
  delivery: string; nota: string; entrega: 'confirmado' | 'entregado' | 'pendiente'; modoPago: ModoPago; medio: string; monto: string
}
const vacio = (): Borrador => ({ clave: nuevaClave(), lineas: [], canal: 'local', cliente: '', telefono: '', direccion: '', referencia: '',
  delivery: '', nota: '', entrega: 'confirmado', modoPago: 'completo', medio: 'Efectivo', monto: '' })

// El borrador se conserva al cambiar de sección o si falla el guardado (misma clave = reintento sin duplicar).
const K = 'at.borrador-venta'
const leerBorrador = (): Borrador => { try { const x = JSON.parse(sessionStorage.getItem(K) || ''); return x?.clave ? x : vacio() } catch { return vacio() } }

export function Vender() {
  const st = useStore()
  const [b, setB] = useState<Borrador>(leerBorrador)
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [elegir, setElegir] = useState<Producto | null>(null)
  const [verTicket, setVerTicket] = useState(false)
  const [revisar, setRevisar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [problemas, setProblemas] = useState<Record<string, string>>({})
  useEffect(() => { try { sessionStorage.setItem(K, JSON.stringify(b)) } catch { /* sin almacenamiento */ } }, [b])

  const ini = st.inicial
  const prods = useMemo(() => new Map((ini?.productos ?? []).map(p => [p.id, p])), [ini])
  const ops = useMemo(() => new Map((ini?.opciones ?? []).map(o => [o.id, o])), [ini])
  const medios = (ini?.config.medios_pago || 'Efectivo').split(',').map(x => x.trim()).filter(Boolean)
  if (!ini) return <Cargando />

  const cats = ini.categorias.filter(x => x.activo).sort(porOrden)
  const visibles = ini.productos.filter(p => p.activo && cats.some(x => x.id === p.categoriaId)
    && (!cat || p.categoriaId === cat) && (!q || p.nombre.toLowerCase().includes(q.toLowerCase()))).sort(porOrden)

  const unit = (l: LineaCarrito) => precioUnitarioC(l, prods, ops)
  const subtotalC = b.lineas.reduce((a, l) => a + (unit(l) ?? 0) * l.cantidad, 0)
  const deliveryC = b.canal === 'delivery' && b.delivery !== '' ? c(Number(b.delivery)) : 0
  const deliveryPorConfirmar = b.canal === 'delivery' && b.delivery === ''
  const totalC = subtotalC + deliveryC
  const montoPagoC = b.modoPago === 'completo' ? totalC : b.modoPago === 'parcial' ? c(Number(b.monto || 0)) : 0
  const n = b.lineas.reduce((a, l) => a + l.cantidad, 0)

  const upd = (x: Partial<Borrador>) => setB(v => ({ ...v, ...x }))
  const agregar = (l: Omit<LineaCarrito, 'key'>) => setB(v => {
    const igual = v.lineas.find(y => y.productoId === l.productoId && y.varianteId === l.varianteId && y.extras.join() === l.extras.join() && y.nota === l.nota)
    return igual ? { ...v, lineas: v.lineas.map(y => (y === igual ? { ...y, cantidad: Math.min(99, y.cantidad + l.cantidad) } : y)) }
      : { ...v, lineas: [...v.lineas, { ...l, key: nuevaClave() }] }
  })
  const tocar = (p: Producto) => {
    if (!vendible(p, ini.opciones).ok) return
    if (variantesDe(p, ini.opciones).length || extrasDe(p, ini.opciones).length) setElegir(p)
    else agregar({ productoId: p.id, varianteId: '', extras: [], cantidad: 1, nota: '' })
  }

  const errores: string[] = []
  if (!b.lineas.length) errores.push('Agrega al menos un producto.')
  if (b.lineas.some(l => unit(l) === null)) errores.push('Hay productos sin precio válido: quítalos o configúralos.')
  if (b.canal === 'delivery' && !b.direccion.trim()) errores.push('Falta la dirección de entrega.')
  if (deliveryPorConfirmar && b.entrega !== 'pendiente') errores.push('Indica el costo de delivery (puede ser 0) o guarda el pedido como pendiente de confirmación.')
  if (b.modoPago === 'parcial' && !(montoPagoC > 0 && montoPagoC < totalC)) errores.push('El pago parcial debe ser mayor a 0 y menor al total.')
  if (b.modoPago === 'completo' && deliveryPorConfirmar) errores.push('Con delivery por confirmar no se puede cobrar el total todavía.')

  const guardar = async () => {
    setGuardando(true)
    try {
      const r = await st.run('Guardar venta', () => st.call('crearVenta', {
        clave: b.clave, canal: b.canal, cliente: b.cliente, telefono: b.telefono, direccion: b.direccion, referencia: b.referencia, nota: b.nota,
        delivery: b.canal === 'delivery' && b.delivery !== '' ? Number(b.delivery) : null, estado: b.entrega,
        lineas: b.lineas.map(l => ({ productoId: l.productoId, varianteId: l.varianteId, extras: l.extras, cantidad: l.cantidad, nota: l.nota })),
        pago: montoPagoC > 0 ? { medio: b.medio, monto: s(montoPagoC) } : null,
        totalEsperado: s(totalC),
      }), (x: any) => `Venta ${x.codigo} guardada: ${soles(x.total)}`)
      void r
      setB(vacio()); setRevisar(false); setVerTicket(false); setProblemas({})
      void st.recargarRango()
    } catch (e) {
      // El borrador y su clave se conservan: reintentar no duplica.
      if (e instanceof ApiError && (e.code === 'NO_DISPONIBLE' || e.code === 'PRECIO_CAMBIO')) {
        const pr: Record<string, string> = {}
        for (const x of e.detalle?.problemas ?? []) pr[x.productoId] = x.mensaje
        setProblemas(pr); setRevisar(false)
        await st.recargarCatalogo().catch(() => {})
      }
    } finally { setGuardando(false) }
  }

  const ticket = (
    <Ticket b={b} upd={upd} unit={unit} prods={prods} ops={ops} medios={medios} problemas={problemas} totalC={totalC} subtotalC={subtotalC}
      deliveryPorConfirmar={deliveryPorConfirmar} cajaAbierta={!!ini.caja} montoPagoC={montoPagoC} errores={errores}
      onRevisar={() => setRevisar(true)} onVaciar={() => setB(vacio())} />
  )

  return (
    <div className="space-y-3">
      <Encabezado titulo="Nueva venta" />
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] md:items-start md:gap-4">
        <div className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-gris" aria-hidden />
            <Input type="search" placeholder="Buscar producto" value={q} onChange={e => setQ(e.target.value)} className="pl-10" aria-label="Buscar producto" />
          </div>
          <div className="scroll-x -mx-3 flex gap-2 px-3 pb-1" role="group" aria-label="Categorías">
            {[{ id: '', nombre: 'Todo' }, ...cats].map(x => (
              <button key={x.id} type="button" aria-pressed={cat === x.id} onClick={() => setCat(x.id)}
                className={cx('min-h-11 shrink-0 rounded-full border-2 px-4 font-bold cursor-pointer', cat === x.id ? 'border-noche bg-naranja text-noche' : 'border-linea bg-white hover:border-noche')}>
                {x.nombre}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibles.map(p => {
              const v = vendible(p, ini.opciones)
              const vars = variantesDe(p, ini.opciones)
              const enCarrito = b.lineas.filter(l => l.productoId === p.id).reduce((a, l) => a + l.cantidad, 0)
              return (
                <button key={p.id} type="button" onClick={() => tocar(p)} disabled={!v.ok}
                  className={cx('relative flex min-h-28 flex-col overflow-hidden rounded-2xl border-2 bg-white text-left cursor-pointer disabled:cursor-not-allowed',
                    enCarrito ? 'border-noche' : 'border-linea hover:border-noche', !v.ok && 'opacity-60')}>
                  {p.fotoUrl ? <img src={p.fotoUrl} alt="" className="h-20 w-full object-cover" loading="lazy" /> : null}
                  <span className="flex flex-1 flex-col gap-1 p-3">
                    <span className={cx('font-bold leading-tight [overflow-wrap:anywhere]', enCarrito > 0 && 'pr-8')}>{p.nombre}</span>
                    <span className="mt-auto flex flex-wrap items-center gap-1 text-sm">
                      {v.ok ? <span className="font-bold tabular">{vars.length ? `desde ${soles(Math.min(...vars.map(x => x.precio ?? 0)))}` : soles(p.precio)}</span>
                        : <span className="rounded bg-e-pend-bg px-1.5 font-bold text-e-pend">{v.motivo}</span>}
                      {p.destacado && <Star className="size-4 fill-amarillo text-noche" aria-label="Destacado" />}
                    </span>
                  </span>
                  {enCarrito > 0 && <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-noche font-bold text-amarillo" aria-label={`${enCarrito} en el pedido`}>{enCarrito}</span>}
                </button>
              )
            })}
          </div>
          {!visibles.length && <p className="py-6 text-center text-gris">No hay productos con ese filtro.</p>}
        </div>
        <aside className="hidden md:sticky md:top-16 md:block">{ticket}</aside>
      </div>

      {/* Celular: barra fija con el resumen */}
      <div className="fixed inset-x-0 bottom-[4.25rem] z-20 px-3 pb-2 md:hidden">
        <Btn variante="oscuro" grande className="w-full justify-between" onClick={() => setVerTicket(true)} disabled={!b.lineas.length}>
          <span className="flex items-center gap-2"><ShoppingBag className="size-5" aria-hidden />Ver pedido ({n})</span>
          <span className="tabular">{soles(s(totalC))}</span>
        </Btn>
      </div>
      <Modal abierto={verTicket} onCerrar={() => setVerTicket(false)} titulo="Pedido">{ticket}</Modal>

      {elegir && <ElegirOpciones p={elegir} opciones={ini.opciones} onCerrar={() => setElegir(null)} onAgregar={l => { agregar(l); setElegir(null) }} />}

      <Modal abierto={revisar} onCerrar={() => setRevisar(false)} titulo="Revisa antes de guardar"
        pie={<><Btn onClick={() => setRevisar(false)}>Seguir editando</Btn><Btn variante="principal" cargando={guardando} onClick={guardar}>Guardar venta</Btn></>}>
        <ul className="divide-y-2 divide-linea">
          {b.lineas.map(l => { const p = prods.get(l.productoId); const u = unit(l) ?? 0; return (
            <li key={l.key} className="flex justify-between gap-3 py-2">
              <span><b>{l.cantidad} × {p?.nombre}</b>{l.varianteId && ` · ${ops.get(l.varianteId)?.nombre}`}{l.extras.length > 0 && <span className="block text-sm text-gris">+ {l.extras.map(e => ops.get(e)?.nombre).join(', ')}</span>}{l.nota && <span className="block text-sm italic">“{l.nota}”</span>}</span>
              <Dinero v={s(u * l.cantidad)} className="font-bold" />
            </li>
          ) })}
        </ul>
        <dl className="mt-3 space-y-1 border-t-2 border-noche pt-3 text-lg">
          {b.canal === 'delivery' && <Fila t="Delivery" v={deliveryPorConfirmar ? 'Por confirmar' : soles(s(deliveryC))} />}
          <Fila t={deliveryPorConfirmar ? 'Subtotal (sin delivery)' : 'Total'} v={soles(s(totalC))} fuerte />
          <Fila t="Atención" v={ETIQUETA_CANAL[b.canal] + (b.cliente ? ` · ${b.cliente}` : '')} />
          <Fila t="Pago" v={montoPagoC > 0 ? `${soles(s(montoPagoC))} con ${b.medio}` : 'Pendiente de cobro'} />
          {montoPagoC > 0 && montoPagoC < totalC && <Fila t="Saldo por cobrar" v={soles(s(totalC - montoPagoC))} />}
          <Fila t="Estado" v={b.entrega === 'entregado' ? 'Entregado al momento' : b.entrega === 'pendiente' ? 'Pendiente de confirmación' : 'Confirmado, a preparar'} />
        </dl>
        {montoPagoC > 0 && !ini.caja && <p className="mt-3 rounded-xl bg-e-pend-bg p-2 font-bold text-e-pend">No hay caja abierta: el cobro se registrará pero no entrará en ninguna caja.</p>}
      </Modal>
      <div className="h-16 md:hidden" />
      {b.lineas.length === 0 && <p className="sr-only">El pedido está vacío.</p>}
    </div>
  )
}

const Fila = ({ t, v, fuerte }: { t: string; v: string; fuerte?: boolean }) => (
  <div className={cx('flex justify-between gap-3', fuerte && 'text-xl font-bold')}><dt className={fuerte ? '' : 'text-gris'}>{t}</dt><dd className="tabular text-right">{v}</dd></div>
)

function Ticket(p: {
  b: Borrador; upd: (x: Partial<Borrador>) => void; unit: (l: LineaCarrito) => number | null; prods: Map<string, Producto>; ops: Map<string, Opcion>
  medios: string[]; problemas: Record<string, string>; totalC: number; subtotalC: number; deliveryPorConfirmar: boolean; cajaAbierta: boolean
  montoPagoC: number; errores: string[]; onRevisar: () => void; onVaciar: () => void
}) {
  const { b, upd } = p
  const cambiarCant = (key: string, d: number) => upd({ lineas: b.lineas.flatMap(l => (l.key !== key ? [l] : l.cantidad + d <= 0 ? [] : [{ ...l, cantidad: Math.min(99, l.cantidad + d) }])) })
  return (
    <div className="space-y-4 rounded-2xl border-2 border-noche bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Pedido</h2>
        {b.lineas.length > 0 && <Btn variante="fantasma" onClick={p.onVaciar}><Trash2 className="size-4" aria-hidden />Vaciar</Btn>}
      </div>
      {!b.lineas.length ? <p className="text-gris">Toca un producto para agregarlo.</p> : (
        <ul className="space-y-2">
          {b.lineas.map(l => {
            const pr = p.prods.get(l.productoId)
            const u = p.unit(l)
            return (
              <li key={l.key} className={cx('rounded-xl border-2 p-2', p.problemas[l.productoId] || u === null ? 'border-e-canc bg-e-canc-bg' : 'border-linea')}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{pr?.nombre}{l.varianteId && <span className="font-normal"> · {p.ops.get(l.varianteId)?.nombre}</span>}</p>
                    {l.extras.length > 0 && <p className="text-sm text-gris">+ {l.extras.map(e => p.ops.get(e)?.nombre).join(', ')}</p>}
                    <input value={l.nota} onChange={e => upd({ lineas: b.lineas.map(y => (y.key === l.key ? { ...y, nota: e.target.value.slice(0, 200) } : y)) })}
                      placeholder="Nota (ej. sin ensalada)" aria-label={`Nota para ${pr?.nombre}`} className="mt-1 min-h-9 w-full rounded-lg border border-linea px-2 text-sm" />
                    {(p.problemas[l.productoId] || u === null) && <p className="mt-1 text-sm font-bold text-e-canc">{p.problemas[l.productoId] || 'Sin precio válido.'}</p>}
                  </div>
                  <span className="tabular font-bold">{u === null ? '—' : soles(s(u * l.cantidad))}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" onClick={() => cambiarCant(l.key, -1)} className="grid size-10 place-items-center rounded-lg border-2 border-linea cursor-pointer" aria-label={`Quitar uno de ${pr?.nombre}`}><Minus className="size-4" /></button>
                  <span className="w-8 text-center text-lg font-bold tabular" aria-label="Cantidad">{l.cantidad}</span>
                  <button type="button" onClick={() => cambiarCant(l.key, 1)} className="grid size-10 place-items-center rounded-lg border-2 border-linea cursor-pointer" aria-label={`Agregar uno de ${pr?.nombre}`}><Plus className="size-4" /></button>
                  {u !== null && <span className="ml-auto text-sm text-gris tabular">{soles(s(u))} c/u</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Campo etiqueta="Atención">
        <Opciones etiqueta="Atención" valor={b.canal} onCambio={canal => upd({ canal })}
          opciones={[{ v: 'local', t: 'En local' }, { v: 'recojo', t: 'Recojo' }, { v: 'delivery', t: 'Delivery' }]} />
      </Campo>
      {b.canal !== 'local' && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
          <Campo etiqueta="Nombre del cliente"><Input value={b.cliente} onChange={e => upd({ cliente: e.target.value })} autoComplete="off" /></Campo>
          <Campo etiqueta="Teléfono (opcional)"><Input value={b.telefono} onChange={e => upd({ telefono: e.target.value })} inputMode="tel" /></Campo>
        </div>
      )}
      {b.canal === 'delivery' && (
        <div className="grid gap-3">
          <Campo etiqueta="Dirección"><Input value={b.direccion} onChange={e => upd({ direccion: e.target.value })} /></Campo>
          <Campo etiqueta="Referencia"><Input value={b.referencia} onChange={e => upd({ referencia: e.target.value })} /></Campo>
          <Campo etiqueta="Costo de delivery (S/)" ayuda="Déjalo vacío si aún no sabes el costo: el pedido quedará pendiente de confirmación.">
            <Input value={b.delivery} onChange={e => upd({ delivery: e.target.value.replace(',', '.') })} inputMode="decimal" placeholder="Por confirmar" />
          </Campo>
        </div>
      )}
      <Campo etiqueta="Nota del pedido (opcional)"><Textarea value={b.nota} onChange={e => upd({ nota: e.target.value })} rows={2} /></Campo>

      <Campo etiqueta="Estado">
        <Opciones etiqueta="Estado" valor={b.entrega} onCambio={entrega => upd({ entrega })}
          opciones={[{ v: 'confirmado', t: 'A preparar' }, { v: 'entregado', t: 'Entregado ya' }, { v: 'pendiente', t: 'Por confirmar' }]} />
      </Campo>

      <Campo etiqueta="Pago">
        <Opciones etiqueta="Pago" valor={b.modoPago} onCambio={modoPago => upd({ modoPago })}
          opciones={[{ v: 'completo', t: 'Pagado' }, { v: 'parcial', t: 'Parcial' }, { v: 'pendiente', t: 'Por cobrar' }]} />
      </Campo>
      {b.modoPago !== 'pendiente' && (
        <>
          <Opciones etiqueta="Medio de pago" valor={b.medio} onCambio={medio => upd({ medio })} opciones={p.medios.map(m => ({ v: m, t: m }))} />
          {b.modoPago === 'parcial' && (
            <Campo etiqueta="Monto recibido (S/)"><Input value={b.monto} onChange={e => upd({ monto: e.target.value.replace(',', '.') })} inputMode="decimal" /></Campo>
          )}
        </>
      )}

      <div className="border-t-2 border-noche pt-3">
        {b.canal === 'delivery' && <p className="flex justify-between text-gris"><span>Delivery</span><span className="tabular">{p.deliveryPorConfirmar ? 'Por confirmar' : soles(s(p.totalC - p.subtotalC))}</span></p>}
        <p className="flex items-baseline justify-between text-2xl font-bold"><span>{p.deliveryPorConfirmar ? 'Subtotal' : 'Total'}</span><span className="tabular">{soles(s(p.totalC))}</span></p>
        {p.montoPagoC > 0 && p.montoPagoC < p.totalC && <p className="flex justify-between font-bold text-e-pend"><span>Queda por cobrar</span><span className="tabular">{soles(s(p.totalC - p.montoPagoC))}</span></p>}
      </div>
      {p.errores.length > 0 && b.lineas.length > 0 && <ul className="space-y-1 text-sm font-bold text-e-canc">{p.errores.map(e => <li key={e}>{e}</li>)}</ul>}
      <Btn variante="principal" grande className="w-full" disabled={p.errores.length > 0} onClick={p.onRevisar}>Revisar y guardar</Btn>
    </div>
  )
}

function ElegirOpciones({ p, opciones, onCerrar, onAgregar }: { p: Producto; opciones: Opcion[]; onCerrar: () => void; onAgregar: (l: Omit<LineaCarrito, 'key'>) => void }) {
  const vars = variantesDe(p, opciones)
  const exts = extrasDe(p, opciones)
  const [v, setV] = useState(vars[0]?.id ?? '')
  const [ex, setEx] = useState<string[]>([])
  const [cant, setCant] = useState(1)
  const [nota, setNota] = useState('')
  const base = vars.length ? vars.find(x => x.id === v)?.precio ?? 0 : p.precio ?? 0
  const unit = c(base) + ex.reduce((a, id) => a + c(exts.find(e => e.id === id)?.precio), 0)
  return (
    <Modal abierto onCerrar={onCerrar} titulo={p.nombre}
      pie={<Btn variante="principal" grande className="w-full sm:w-auto" disabled={vars.length > 0 && !v} onClick={() => onAgregar({ productoId: p.id, varianteId: v, extras: ex, cantidad: cant, nota: nota.trim() })}>
        Agregar {cant} · {soles(s(unit * cant))}</Btn>}>
      <div className="space-y-4">
        {p.fotoUrl ? <img src={p.fotoUrl} alt={p.nombre} className="h-40 w-full rounded-xl object-cover" /> : (
          <div className="placeholder-foto grid h-24 place-items-center rounded-xl text-sm font-bold text-gris"><span className="flex items-center gap-2"><ImageOff className="size-4" aria-hidden />Foto pendiente</span></div>
        )}
        {vars.length > 0 && <Campo etiqueta="Elige una opción"><Opciones etiqueta="Opción" valor={v} onCambio={setV} opciones={vars.map(x => ({ v: x.id, t: `${x.nombre} · ${soles(x.precio)}` }))} /></Campo>}
        {exts.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-bold text-gris">Extras</legend>
            <div className="flex flex-wrap gap-2">
              {exts.map(e => { const on = ex.includes(e.id); return (
                <button key={e.id} type="button" role="checkbox" aria-checked={on} onClick={() => setEx(on ? ex.filter(x => x !== e.id) : [...ex, e.id])}
                  className={cx('min-h-11 rounded-xl border-2 px-3 font-bold cursor-pointer', on ? 'border-noche bg-noche text-amarillo' : 'border-linea')}>
                  {e.nombre} +{soles(e.precio)}
                </button>
              ) })}
            </div>
          </fieldset>
        )}
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gris">Cantidad</span>
          <button type="button" onClick={() => setCant(Math.max(1, cant - 1))} className="grid size-11 place-items-center rounded-xl border-2 border-linea cursor-pointer" aria-label="Menos"><Minus className="size-5" /></button>
          <span className="w-8 text-center text-xl font-bold tabular">{cant}</span>
          <button type="button" onClick={() => setCant(Math.min(99, cant + 1))} className="grid size-11 place-items-center rounded-xl border-2 border-linea cursor-pointer" aria-label="Más"><Plus className="size-5" /></button>
        </div>
        <Campo etiqueta="Nota (opcional)"><Input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. cremas aparte" /></Campo>
      </div>
    </Modal>
  )
}
