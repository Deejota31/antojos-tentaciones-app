import { useState } from 'react'
import { ArrowDown, ArrowUp, ImageOff, Pencil, Plus, Star } from 'lucide-react'
import { useStore } from '../lib/store'
import { nuevaClave } from '../lib/api'
import type { Categoria, Opcion, Producto } from '../lib/types'
import { porOrden, soles, variantesDe } from '../lib/util'
import { Btn, Campo, Input, Modal, Opciones, Textarea, Vacio, cx } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { Cargando } from './Inicio'

const nuevoId = (pref: string) => `${pref}-${nuevaClave().replace(/-/g, '').slice(0, 12)}`

export function Carta() {
  const st = useStore()
  const ini = st.inicial
  const [cat, setCat] = useState('')
  const [editProd, setEditProd] = useState<Producto | 'nuevo' | null>(null)
  const [editCat, setEditCat] = useState<Categoria | 'nueva' | null>(null)
  const [ocupado, setOcupado] = useState('')
  if (!ini) return <Cargando />
  const cats = [...ini.categorias].sort(porOrden)
  const actual = cat || cats[0]?.id || ''
  const prods = ini.productos.filter(p => p.categoriaId === actual).sort(porOrden)
  const porRevisar = ini.productos.filter(p => p.activo && p.revisar)

  const marcar = async (p: Producto, cambio: Partial<Pick<Producto, 'agotado' | 'activo' | 'destacado'>>) => {
    setOcupado(p.id + Object.keys(cambio)[0])
    try { st.upsertProducto(await st.run('Actualizar producto', () => st.call<Producto>('marcarProducto', { id: p.id, ...cambio }), 'Producto actualizado')) }
    catch { /* aviso */ } finally { setOcupado('') }
  }
  const mover = async (lista: { id: string }[], i: number, d: -1 | 1, hoja: 'CATEGORIAS' | 'PRODUCTOS') => {
    const j = i + d
    if (j < 0 || j >= lista.length) return
    const ids = lista.map(x => x.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    try {
      await st.run('Cambiar orden', () => st.call('reordenar', { hoja, ids }))
      ids.forEach((id, k) => {
        if (hoja === 'PRODUCTOS') { const p = ini.productos.find(x => x.id === id); if (p) st.upsertProducto({ ...p, orden: k + 1 }) }
        else { const c = ini.categorias.find(x => x.id === id); if (c) st.upsertCategoria({ ...c, orden: k + 1 }) }
      })
    } catch { /* aviso */ }
  }

  return (
    <div className="space-y-4">
      <Encabezado titulo="Carta">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setEditCat('nueva')}><Plus className="size-4" aria-hidden />Categoría</Btn>
          <Btn variante="principal" onClick={() => setEditProd('nuevo')} disabled={!cats.length}><Plus className="size-4" aria-hidden />Producto</Btn>
        </div>
      </Encabezado>
      {porRevisar.length > 0 && (
        <details className="rounded-2xl border-2 border-e-pend bg-e-pend-bg p-3 text-e-pend">
          <summary className="cursor-pointer font-bold">{porRevisar.length} producto(s) con datos por revisar</summary>
          <ul className="mt-2 space-y-1">{porRevisar.map(p => <li key={p.id}><button type="button" className="font-bold underline cursor-pointer" onClick={() => setEditProd(p)}>{p.nombre}</button>: {p.revisar}</li>)}</ul>
        </details>
      )}

      <div className="scroll-x -mx-3 flex gap-2 px-3 pb-1" role="tablist" aria-label="Categorías">
        {cats.map(x => (
          <button key={x.id} type="button" role="tab" aria-selected={actual === x.id} onClick={() => setCat(x.id)}
            className={cx('min-h-11 shrink-0 rounded-full border-2 px-4 font-bold cursor-pointer', actual === x.id ? 'border-noche bg-naranja' : 'border-linea bg-white', !x.activo && 'line-through opacity-60')}>
            {x.nombre}
          </button>
        ))}
      </div>
      {actual && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Btn variante="fantasma" onClick={() => setEditCat(cats.find(x => x.id === actual)!)}><Pencil className="size-4" aria-hidden />Editar categoría</Btn>
          <Btn variante="fantasma" aria-label="Mover categoría antes" onClick={() => mover(cats, cats.findIndex(x => x.id === actual), -1, 'CATEGORIAS')}><ArrowUp className="size-4" />Antes</Btn>
          <Btn variante="fantasma" aria-label="Mover categoría después" onClick={() => mover(cats, cats.findIndex(x => x.id === actual), 1, 'CATEGORIAS')}><ArrowDown className="size-4" />Después</Btn>
        </div>
      )}

      {!prods.length ? <Vacio titulo="Esta categoría no tiene productos" /> : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {prods.map((p, i) => {
            const vars = variantesDe(p, ini.opciones)
            return (
              <li key={p.id} className={cx('flex flex-col rounded-2xl border-2 bg-white', p.activo ? 'border-linea' : 'border-dashed border-linea opacity-70')}>
                <div className="flex gap-3 p-3">
                  {p.fotoUrl ? <img src={p.fotoUrl} alt="" className="size-20 shrink-0 rounded-xl object-cover" loading="lazy" />
                    : <div className="placeholder-foto grid size-20 shrink-0 place-items-center rounded-xl text-center text-xs font-bold text-gris"><span><ImageOff className="mx-auto size-4" aria-hidden />Foto pendiente</span></div>}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{p.nombre}{p.destacado && <Star className="ml-1 inline size-4 fill-amarillo text-noche" aria-label="Destacado" />}</p>
                    <p className="font-bold tabular">{vars.length ? `${vars.length} opciones desde ${soles(Math.min(...vars.map(v => v.precio ?? 0)))}` : p.precio ? soles(p.precio) : <span className="text-e-pend">Precio por configurar</span>}</p>
                    {p.esCombo && <p className="text-sm">Combo: {p.incluye}</p>}
                    {p.revisar && <p className="text-sm text-e-pend">Revisar: {p.revisar}</p>}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t-2 border-linea p-2">
                  <Toggle on={p.agotado} t="Agotado" ocupado={ocupado === p.id + 'agotado'} onClick={() => marcar(p, { agotado: !p.agotado })} />
                  <Toggle on={p.activo} t="Activo" ocupado={ocupado === p.id + 'activo'} onClick={() => marcar(p, { activo: !p.activo })} />
                  <Toggle on={p.destacado} t="Destacado" ocupado={ocupado === p.id + 'destacado'} onClick={() => marcar(p, { destacado: !p.destacado })} />
                  <span className="ml-auto flex">
                    <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-papel cursor-pointer" aria-label={`Subir ${p.nombre}`} onClick={() => mover(prods, i, -1, 'PRODUCTOS')}><ArrowUp className="size-4" /></button>
                    <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-papel cursor-pointer" aria-label={`Bajar ${p.nombre}`} onClick={() => mover(prods, i, 1, 'PRODUCTOS')}><ArrowDown className="size-4" /></button>
                    <Btn onClick={() => setEditProd(p)}><Pencil className="size-4" aria-hidden />Editar</Btn>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-sm text-gris">Los productos nunca se borran: desactívalos para que no aparezcan. Las ventas anteriores conservan el nombre y precio con que se vendieron.</p>

      {editCat && <EditarCategoria c={editCat === 'nueva' ? null : editCat} onCerrar={() => setEditCat(null)} />}
      {editProd && <EditarProducto p={editProd === 'nuevo' ? null : editProd} categoriaId={actual} onCerrar={() => setEditProd(null)} />}
    </div>
  )
}

function Toggle({ on, t, ocupado, onClick }: { on: boolean; t: string; ocupado: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} disabled={ocupado}
      className={cx('min-h-10 rounded-full border-2 px-3 text-sm font-bold cursor-pointer disabled:opacity-50', on ? 'border-noche bg-noche text-amarillo' : 'border-linea bg-white text-gris')}>
      {on ? '✓ ' : ''}{t}
    </button>
  )
}

function EditarCategoria({ c, onCerrar }: { c: Categoria | null; onCerrar: () => void }) {
  const st = useStore()
  const [f, setF] = useState({ id: c?.id ?? nuevoId('cat'), nombre: c?.nombre ?? '', descripcion: c?.descripcion ?? '', activo: c?.activo ?? true })
  const [enviando, setEnviando] = useState(false)
  return (
    <Modal abierto onCerrar={onCerrar} titulo={c ? 'Editar categoría' : 'Nueva categoría'}
      pie={<><Btn onClick={onCerrar}>Volver</Btn><Btn variante="principal" disabled={!f.nombre.trim()} cargando={enviando} onClick={async () => {
        setEnviando(true)
        try { st.upsertCategoria(await st.run('Guardar categoría', () => st.call<Categoria>('saveCategoria', f), 'Categoría guardada')); onCerrar() } catch { /* aviso */ } finally { setEnviando(false) }
      }}>Guardar</Btn></>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} autoFocus /></Campo>
        <Campo etiqueta="Descripción (opcional)"><Input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" className="size-5 accent-noche" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} />Visible y a la venta</label>
      </div>
    </Modal>
  )
}

/** Reduce la foto en el navegador (máx. 1000 px, JPEG) antes de subirla. */
async function prepararFoto(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, 1000 / Math.max(img.width, img.height))
  const cv = document.createElement('canvas')
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k)
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
  return cv.toDataURL('image/jpeg', 0.82).split(',')[1]
}

function EditarProducto({ p, categoriaId, onCerrar }: { p: Producto | null; categoriaId: string; onCerrar: () => void }) {
  const st = useStore()
  const ini = st.inicial!
  const [f, setF] = useState({
    id: p?.id ?? nuevoId('prd'), categoriaId: p?.categoriaId ?? categoriaId, nombre: p?.nombre ?? '', descripcion: p?.descripcion ?? '',
    precio: p?.precio === null || p?.precio === undefined ? '' : String(p.precio), costo: p?.costo === null || p?.costo === undefined ? '' : String(p.costo),
    fotoUrl: p?.fotoUrl ?? '', activo: p?.activo ?? true, agotado: p?.agotado ?? false, destacado: p?.destacado ?? false,
    esCombo: p?.esCombo ?? false, incluye: p?.incluye ?? '', revisar: p?.revisar ?? '',
  })
  const [enviando, setEnviando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const existe = !!p || ini.productos.some(x => x.id === f.id)
  const ops = ini.opciones.filter(o => o.productoId === f.id).sort(porOrden)
  const upd = (x: Partial<typeof f>) => setF(v => ({ ...v, ...x }))
  const guardar = async () => {
    const r = await st.run('Guardar producto', () => st.call<Producto>('saveProducto', { ...f, precio: f.precio === '' ? null : Number(f.precio), costo: f.costo === '' ? null : Number(f.costo) }), 'Producto guardado')
    st.upsertProducto(r)
    return r
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo={p ? `Editar ${p.nombre}` : 'Nuevo producto'} ancho="max-w-2xl"
      pie={<><Btn onClick={onCerrar}>Volver</Btn><Btn variante="principal" disabled={!f.nombre.trim()} cargando={enviando} onClick={async () => {
        setEnviando(true); try { await guardar(); onCerrar() } catch { /* aviso */ } finally { setEnviando(false) }
      }}>Guardar</Btn></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre"><Input value={f.nombre} onChange={e => upd({ nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Categoría">
            <select className="min-h-12 rounded-xl border-2 border-linea bg-white px-3" value={f.categoriaId} onChange={e => upd({ categoriaId: e.target.value })}>
              {ini.categorias.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Precio (S/)" ayuda="Vacío = por configurar: no se puede vender hasta definirlo (o crear opciones con precio).">
            <Input value={f.precio} onChange={e => upd({ precio: e.target.value.replace(',', '.') })} inputMode="decimal" placeholder="Por configurar" />
          </Campo>
          <Campo etiqueta="Costo estimado por unidad (S/)" ayuda="Opcional. Solo para el margen estimado en Reportes.">
            <Input value={f.costo} onChange={e => upd({ costo: e.target.value.replace(',', '.') })} inputMode="decimal" />
          </Campo>
        </div>
        <Campo etiqueta="Descripción"><Textarea value={f.descripcion} onChange={e => upd({ descripcion: e.target.value })} rows={2} /></Campo>

        <div>
          <p className="mb-1 text-sm font-bold text-gris">Foto</p>
          <div className="flex flex-wrap items-center gap-3">
            {f.fotoUrl ? <img src={f.fotoUrl} alt="" className="size-24 rounded-xl object-cover" /> : <div className="placeholder-foto grid size-24 place-items-center rounded-xl text-xs font-bold text-gris">Foto pendiente</div>}
            <div className="min-w-0 flex-1 space-y-2">
              <label className={cx('inline-flex min-h-11 items-center rounded-xl border-2 border-linea px-4 font-bold', existe ? 'cursor-pointer hover:border-noche' : 'opacity-50')}>
                {subiendo ? 'Subiendo…' : 'Subir foto real'}
                <input type="file" accept="image/*" className="sr-only" disabled={!existe || subiendo} onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setSubiendo(true)
                  try {
                    const base64 = await prepararFoto(file)
                    const r = await st.run('Subir foto', () => st.call<Producto>('subirFoto', { productoId: f.id, mime: 'image/jpeg', base64 }), 'Foto guardada')
                    st.upsertProducto(r); upd({ fotoUrl: r.fotoUrl })
                  } catch { /* aviso */ } finally { setSubiendo(false); e.target.value = '' }
                }} />
              </label>
              {!existe && <p className="text-sm text-gris">Guarda el producto primero para subir su foto.</p>}
              <Input value={f.fotoUrl} onChange={e => upd({ fotoUrl: e.target.value })} placeholder="o pega un enlace https" aria-label="Enlace de la foto" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {(['activo', 'agotado', 'destacado', 'esCombo'] as const).map(k => (
            <label key={k} className="flex min-h-11 items-center gap-2 font-bold">
              <input type="checkbox" className="size-5 accent-noche" checked={f[k]} onChange={e => upd({ [k]: e.target.checked })} />
              {{ activo: 'Activo', agotado: 'Agotado', destacado: 'Destacado', esCombo: 'Es combo' }[k]}
            </label>
          ))}
        </div>
        {f.esCombo && <Campo etiqueta="Qué incluye el combo"><Input value={f.incluye} onChange={e => upd({ incluye: e.target.value })} placeholder="Ej. Hamburguesa Clásica + papas + gaseosa" /></Campo>}
        <Campo etiqueta="Nota de revisión" ayuda="Déjala vacía cuando el producto esté revisado."><Input value={f.revisar} onChange={e => upd({ revisar: e.target.value })} /></Campo>

        <div className="rounded-2xl border-2 border-linea p-3">
          <p className="font-bold">Opciones y extras</p>
          <p className="mb-2 text-sm text-gris">Opción (variante): reemplaza el precio, por ejemplo un tamaño o sabor. Extra: se suma al precio.</p>
          {!existe ? <p className="text-sm text-gris">Guarda el producto primero para agregar opciones.</p> : (
            <>
              <ul className="space-y-2">{ops.map(o => <OpcionFila key={o.id} o={o} />)}</ul>
              <NuevaOpcion productoId={f.id} />
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function OpcionFila({ o }: { o: Opcion }) {
  const st = useStore()
  const [nombre, setNombre] = useState(o.nombre)
  const [precio, setPrecio] = useState(String(o.precio ?? ''))
  const guardar = async (x: Partial<Opcion>) => {
    try { st.upsertOpcion(await st.run('Guardar opción', () => st.call<Opcion>('saveOpcion', { ...o, nombre, precio: Number(precio), ...x }), 'Opción guardada')) } catch { /* aviso */ }
  }
  const cambiado = nombre !== o.nombre || precio !== String(o.precio ?? '')
  return (
    <li className={cx('flex flex-wrap items-center gap-2', !o.activo && 'opacity-60')}>
      <span className="w-16 text-sm font-bold text-gris">{o.tipo === 'variante' ? 'Opción' : 'Extra'}</span>
      <Input className="min-w-32 flex-1" value={nombre} onChange={e => setNombre(e.target.value)} aria-label="Nombre de la opción" />
      <Input className="w-24" value={precio} onChange={e => setPrecio(e.target.value.replace(',', '.'))} inputMode="decimal" aria-label="Precio" />
      {cambiado && <Btn variante="principal" onClick={() => guardar({})}>Guardar</Btn>}
      <Btn variante="fantasma" onClick={() => guardar({ activo: !o.activo })}>{o.activo ? 'Desactivar' : 'Activar'}</Btn>
    </li>
  )
}

function NuevaOpcion({ productoId }: { productoId: string }) {
  const st = useStore()
  const [tipo, setTipo] = useState<'variante' | 'extra'>('variante')
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ok = nombre.trim() && precio !== '' && Number(precio) >= 0 && (tipo === 'extra' || Number(precio) > 0)
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t-2 border-linea pt-3">
      <Opciones etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={[{ v: 'variante', t: 'Opción' }, { v: 'extra', t: 'Extra' }]} />
      <Input className="min-w-32 flex-1" value={nombre} onChange={e => setNombre(e.target.value)} placeholder={tipo === 'variante' ? 'Ej. 1 litro' : 'Ej. Huevo'} aria-label="Nombre" />
      <Input className="w-24" value={precio} onChange={e => setPrecio(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="S/" aria-label="Precio" />
      <Btn variante="principal" disabled={!ok} cargando={enviando} onClick={async () => {
        setEnviando(true)
        try {
          st.upsertOpcion(await st.run('Agregar opción', () => st.call<Opcion>('saveOpcion', { id: nuevoId('opc'), productoId, tipo, nombre, precio: Number(precio) }), 'Opción agregada'))
          setNombre(''); setPrecio('')
        } catch { /* aviso */ } finally { setEnviando(false) }
      }}>Agregar</Btn>
    </div>
  )
}
