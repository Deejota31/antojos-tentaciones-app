import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useStore } from '../lib/store'
import { calcular, type Filtros } from '../lib/engine'
import type { Canal } from '../lib/types'
import { ETIQUETA_CANAL, ETIQUETA_ESTADO, ETIQUETA_PAGO } from '../lib/types'
import { csv, descargar, fechaHora, porOrden, soles } from '../lib/util'
import { Barra, Btn, Campo, ComoSeCalcula, Dinero, Seccion, Select, Vacio } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { RangoFechas, textoRango } from '../components/RangoFechas'
import { Cargando } from './Inicio'

export function Reportes() {
  const st = useStore()
  const [f, setF] = useState<Filtros>({})
  const m = useMemo(() => (st.rango ? calcular(st.rango, f) : null), [st.rango, f])
  const ini = st.inicial
  if (!st.rango || !m || !ini) return <Cargando />
  const r = st.rango
  const medios = (ini.config.medios_pago || '').split(',').map(x => x.trim()).filter(Boolean)
  const nombreArchivo = (t: string) => `antojos-${t}-${r.desde}_${r.hasta}.csv`
  const pedRango = r.pedidos.filter(p => p.enRango)

  const exportar = (tipo: 'pedidos' | 'productos' | 'pagos' | 'gastos') => {
    if (tipo === 'pedidos') descargar(nombreArchivo('pedidos'), csv([
      ['Código', 'Fecha', 'Hora', 'Canal', 'Estado', 'Estado pago', 'Cliente', 'Subtotal', 'Delivery', 'Total', 'Pagado', 'Devuelto', 'Saldo', 'Origen'],
      ...pedRango.filter(p => !f.canal || p.canal === f.canal).map(p => [p.codigo, p.fecha, fechaHora(p.creadoEn), ETIQUETA_CANAL[p.canal], ETIQUETA_ESTADO[p.estado], ETIQUETA_PAGO[p.estadoPago],
        p.cliente, p.subtotal, p.delivery, p.total, p.pagado, p.devuelto, p.saldo, p.origen]),
    ]))
    if (tipo === 'productos') descargar(nombreArchivo('productos'), csv([['Producto', 'Unidades', 'Ventas', 'Pedidos'], ...m.porProducto.map(x => [x.nombre, x.unidades, x.ventas, x.pedidos])]))
    if (tipo === 'pagos') descargar(nombreArchivo('pagos'), csv([['Fecha', 'Hora', 'Pedido', 'Tipo', 'Medio', 'Monto', 'Estado', 'Caja'],
      ...r.pagos.filter(p => !f.medio || p.medio === f.medio).map(p => [p.fecha, fechaHora(p.fechaHora), p.codigo, p.tipo === 'pago' ? 'Cobro' : 'Devolución', p.medio, p.monto, p.estado, p.cajaId ? 'Sí' : 'No'])]))
    if (tipo === 'gastos') descargar(nombreArchivo('gastos'), csv([['Fecha', 'Categoría', 'Tipo', 'Descripción', 'Monto', 'Medio', 'Desde caja', 'Comprobante', 'Estado'],
      ...r.gastos.map(g => [g.fecha, g.categoria, g.tipo, g.descripcion, g.monto, g.medio, g.desdeCaja ? 'Sí' : 'No', g.comprobante, g.estado])]))
  }

  const prodsFiltro = ini.productos.filter(p => !f.categoriaId || p.categoriaId === f.categoriaId).sort(porOrden)
  const maxCat = Math.max(0, ...m.porCategoria.map(x => x.ventas))

  return (
    <div className="space-y-4">
      <Encabezado titulo="Reportes" sub={textoRango(st.sel.desde, st.sel.hasta)} />
      <RangoFechas />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Campo etiqueta="Categoría"><Select value={f.categoriaId ?? ''} onChange={e => setF({ ...f, categoriaId: e.target.value, productoId: '' })}>
          <option value="">Todas</option>{[...ini.categorias].sort(porOrden).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Campo>
        <Campo etiqueta="Producto"><Select value={f.productoId ?? ''} onChange={e => setF({ ...f, productoId: e.target.value })}>
          <option value="">Todos</option>{prodsFiltro.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Campo>
        <Campo etiqueta="Atención"><Select value={f.canal ?? ''} onChange={e => setF({ ...f, canal: e.target.value as Canal | '' })}>
          <option value="">Todas</option>{(['local', 'recojo', 'delivery'] as Canal[]).map(c => <option key={c} value={c}>{ETIQUETA_CANAL[c]}</option>)}</Select></Campo>
        <Campo etiqueta="Medio de pago" ayuda="Filtra cobros y devoluciones."><Select value={f.medio ?? ''} onChange={e => setF({ ...f, medio: e.target.value })}>
          <option value="">Todos</option>{medios.map(x => <option key={x} value={x}>{x}</option>)}</Select></Campo>
      </div>
      {m.porLineas && <p className="rounded-xl bg-e-conf-bg p-3 font-bold text-e-conf">Con filtro de producto o categoría, las ventas son el importe de esos productos (sin delivery) y no se muestran cobros: un pago no se reparte por producto.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <K t="Pedidos confirmados" v={String(m.numVentas)} f="Pedidos confirmados, en preparación, listos o entregados del periodo (o que contienen el producto/categoría filtrado)." />
        <K t="Ventas" v={soles(m.ventas)} f={m.porLineas ? 'Suma del importe de las líneas filtradas.' : 'Suma del total (incluye delivery) de los pedidos confirmados del periodo.'} />
        <K t="Ticket promedio" v={soles(m.ticket)} f="Ventas ÷ pedidos confirmados." />
        <K t="Cobrado neto" v={soles(m.cobradoNeto)} f="Cobros del periodo (por fecha del pago) menos devoluciones." />
        <K t="Cobros" v={soles(m.cobros)} f="Pagos recibidos en el periodo." />
        <K t="Devoluciones" v={soles(m.devoluciones)} f="Dinero devuelto en el periodo por pedidos cancelados." />
        <K t="Saldo por cobrar" v={soles(m.saldo)} f="Total − (pagado − devuelto) de las ventas del periodo." />
        <K t="Cancelaciones" v={`${m.cancelados.cantidad} · ${soles(m.cancelados.total)}`} f="Pedidos del periodo en estado cancelado y la suma de sus totales." />
        <K t="Gastos" v={soles(m.gastos.total)} f="Gastos activos con fecha en el periodo. No dependen de los filtros de producto, atención ni medio." />
        {m.margen && <K t="Margen estimado" v={soles(m.margen.estimado)} f={`(Precio − costo estimado) × unidades, solo de productos con costo cargado (${soles(m.margen.cubierto)} en ventas). Sin costo: ${soles(m.margen.sinCosto)}. Es una estimación, no la utilidad real.`} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Unidades vendidas por producto" accion={<Btn onClick={() => exportar('productos')}><Download className="size-4" aria-hidden />CSV</Btn>}>
          {!m.porProducto.length ? <Vacio titulo="Sin ventas en este periodo" /> : (
            <div className="scroll-x"><table className="w-full min-w-[22rem] text-left">
              <thead><tr className="border-b-2 border-noche"><th className="py-2">Producto</th><th className="text-right">Unidades</th><th className="text-right">Ventas</th></tr></thead>
              <tbody className="divide-y divide-linea">{m.porProducto.map(x => <tr key={x.clave}><td className="py-2">{x.nombre}</td><td className="text-right tabular">{x.unidades}</td><td className="text-right"><Dinero v={x.ventas} /></td></tr>)}</tbody>
            </table></div>
          )}
        </Seccion>
        <div className="min-w-0 space-y-4">
          <Seccion titulo="Ventas por categoría">
            {!m.porCategoria.length ? <Vacio titulo="Sin datos" /> : (
              <ul className="space-y-3">{[...m.porCategoria].sort((a, b) => b.ventas - a.ventas).map(x => (
                <li key={x.clave}><div className="flex justify-between"><span className="font-bold">{x.nombre}</span><span className="tabular">{x.unidades} u · {soles(x.ventas)}</span></div><Barra valor={x.ventas} max={maxCat} color="bg-fucsia" /></li>
              ))}</ul>
            )}
            <ComoSeCalcula>Importe de productos (sin delivery), con la categoría que tenían al venderse.</ComoSeCalcula>
          </Seccion>
          <Seccion titulo="Por atención y medio de pago">
            <ul className="space-y-1">{m.porCanal.map(x => <li key={x.canal} className="flex justify-between"><span>{ETIQUETA_CANAL[x.canal]} ({x.pedidos})</span><Dinero v={x.ventas} /></li>)}</ul>
            {!m.porLineas && <ul className="mt-3 space-y-1 border-t-2 border-linea pt-3">{m.porMedio.map(x => <li key={x.medio} className="flex justify-between"><span>{x.medio}</span><span className="tabular">{soles(x.cobros)}{x.devoluciones ? ` (−${soles(x.devoluciones)})` : ''}</span></li>)}</ul>}
          </Seccion>
          <Seccion titulo="Gastos por categoría">
            {!m.gastos.porCategoria.length ? <Vacio titulo="Sin gastos" /> : <ul className="space-y-1">{m.gastos.porCategoria.map(x => <li key={x.clave} className="flex justify-between"><span>{x.nombre}</span><Dinero v={x.ventas} /></li>)}</ul>}
          </Seccion>
        </div>
      </div>

      <Seccion titulo="Exportar datos del periodo">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => exportar('pedidos')}><Download className="size-4" aria-hidden />Pedidos</Btn>
          <Btn onClick={() => exportar('pagos')}><Download className="size-4" aria-hidden />Cobros y devoluciones</Btn>
          <Btn onClick={() => exportar('gastos')}><Download className="size-4" aria-hidden />Gastos</Btn>
        </div>
        <p className="mt-2 text-sm text-gris">Archivos CSV separados por punto y coma; se abren directo en Excel o Google Sheets.</p>
      </Seccion>
    </div>
  )
}

function K({ t, v, f }: { t: string; v: string; f: string }) {
  return (
    <div className="rounded-2xl border-2 border-linea bg-white p-3">
      <p className="text-sm font-bold text-gris">{t}</p>
      <p className="text-xl font-bold tabular">{v}</p>
      <ComoSeCalcula>{f}</ComoSeCalcula>
    </div>
  )
}
