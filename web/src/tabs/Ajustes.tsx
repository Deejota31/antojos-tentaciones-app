import { useState } from 'react'
import { ExternalLink, LogOut } from 'lucide-react'
import { useStore } from '../lib/store'
import { guardarUrlApi, urlApi } from '../lib/api'
import type { Config } from '../lib/types'
import { Btn, Campo, Input, Opciones, Seccion, Textarea, confirmar } from '../components/ui'
import { Encabezado } from '../components/Encabezado'
import { Cargando } from './Inicio'

export function Ajustes() {
  const st = useStore()
  const ini = st.inicial
  const [cfg, setCfg] = useState<Config>(() => ({ ...(ini?.config ?? {}) }))
  const [guardando, setGuardando] = useState(false)
  const [clave, setClave] = useState({ actual: '', nueva: '', repetir: '' })
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null)
  if (!ini) return <Cargando />
  const cambios = Object.keys(cfg).filter(k => cfg[k] !== ini.config[k])
  const upd = (k: string, v: string) => setCfg(c => ({ ...c, [k]: v }))
  const t = (k: string, etiqueta: string, ayuda?: string, ph?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}><Input value={cfg[k] ?? ''} onChange={e => upd(k, e.target.value)} placeholder={ph} /></Campo>
  )

  return (
    <div className="space-y-4">
      <Encabezado titulo="Ajustes" />
      <Seccion titulo="Negocio">
        <div className="grid gap-3 md:grid-cols-2">
          {t('negocio_nombre', 'Nombre')}
          {t('negocio_firma', 'Firma')}
          <Campo etiqueta="Descripción para la carta" className="md:col-span-2"><Textarea value={cfg.negocio_descripcion ?? ''} onChange={e => upd('negocio_descripcion', e.target.value)} rows={2} /></Campo>
          {t('horario', 'Horario de atención', 'Se mostrará en la carta pública.', 'Pendiente de configurar')}
          {t('direccion', 'Dirección del local', undefined, 'Pendiente de configurar')}
          {t('logo_url', 'Enlace del logo (https)', undefined, 'Pendiente')}
        </div>
      </Seccion>
      <Seccion titulo="Cobros y gastos">
        <div className="grid gap-3 md:grid-cols-2">
          {t('medios_pago', 'Medios de pago', 'Separados por coma. "Efectivo" es el dinero de la caja y no se puede quitar.')}
          {t('categorias_gasto', 'Categorías de gasto', 'Separadas por coma.')}
        </div>
      </Seccion>
      <Seccion titulo="WhatsApp y carta pública (segunda etapa)">
        <div className="grid gap-3 md:grid-cols-2">
          {t('whatsapp_numero', 'Número de WhatsApp', 'Con código de país, solo dígitos. Ej. 51939968342.')}
          <Campo etiqueta="¿Número confirmado por la dueña?" ayuda="Mientras diga No, la carta no abrirá WhatsApp.">
            <Opciones etiqueta="Número confirmado" valor={cfg.whatsapp_validado === 'SI' ? 'SI' : 'NO'} onCambio={v => upd('whatsapp_validado', v)} opciones={[{ v: 'NO', t: 'No' }, { v: 'SI', t: 'Sí, es correcto' }]} />
          </Campo>
          <Campo etiqueta="Delivery">
            <Opciones etiqueta="Delivery" valor={cfg.delivery_modo || 'por_confirmar'} onCambio={v => upd('delivery_modo', v)}
              opciones={[{ v: 'por_confirmar', t: 'Costo por confirmar' }, { v: 'tarifa_fija', t: 'Tarifa fija' }, { v: 'no_disponible', t: 'No disponible' }]} />
          </Campo>
          {cfg.delivery_modo === 'tarifa_fija' && t('delivery_tarifa', 'Tarifa fija (S/)')}
          {t('delivery_zonas', 'Zonas de reparto', undefined, 'Pendiente de configurar')}
          <Campo etiqueta="Recojo en local"><Opciones etiqueta="Recojo" valor={cfg.recojo_disponible === 'NO' ? 'NO' : 'SI'} onCambio={v => upd('recojo_disponible', v)} opciones={[{ v: 'SI', t: 'Disponible' }, { v: 'NO', t: 'No disponible' }]} /></Campo>
          <Campo etiqueta="Carta pública" ayuda="La página pública de la carta se publica en la segunda etapa. Este interruptor ya controla si el servidor acepta solicitudes.">
            <Opciones etiqueta="Carta pública" valor={cfg.carta_publica_activa === 'SI' ? 'SI' : 'NO'} onCambio={v => upd('carta_publica_activa', v)} opciones={[{ v: 'NO', t: 'Cerrada' }, { v: 'SI', t: 'Recibiendo pedidos' }]} />
          </Campo>
        </div>
      </Seccion>
      <div className="sticky bottom-20 z-10 flex justify-end xl:bottom-4">
        <Btn variante="principal" grande disabled={!cambios.length} cargando={guardando} onClick={async () => {
          setGuardando(true)
          try { st.setConfig(await st.run('Guardar ajustes', () => st.call<Config>('saveConfig', { valores: Object.fromEntries(cambios.map(k => [k, cfg[k]])) }), 'Ajustes guardados')) }
          catch { /* aviso */ } finally { setGuardando(false) }
        }}>Guardar ajustes{cambios.length ? ` (${cambios.length})` : ''}</Btn>
      </div>

      <Seccion titulo="Seguridad">
        <div className="grid gap-3 md:grid-cols-3">
          <Campo etiqueta="Clave actual"><Input type="password" autoComplete="current-password" value={clave.actual} onChange={e => setClave({ ...clave, actual: e.target.value })} /></Campo>
          <Campo etiqueta="Nueva clave (mín. 8)"><Input type="password" autoComplete="new-password" value={clave.nueva} onChange={e => setClave({ ...clave, nueva: e.target.value })} /></Campo>
          <Campo etiqueta="Repetir nueva clave" error={clave.repetir && clave.repetir !== clave.nueva ? 'No coincide.' : undefined}><Input type="password" autoComplete="new-password" value={clave.repetir} onChange={e => setClave({ ...clave, repetir: e.target.value })} /></Campo>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variante="principal" disabled={!clave.actual || clave.nueva.length < 8 || clave.nueva !== clave.repetir} onClick={async () => {
            try { await st.run('Cambiar clave', () => st.call('cambiarClave', { actual: clave.actual, nueva: clave.nueva }), 'Clave cambiada. Vuelve a entrar.'); await st.logout() } catch { /* aviso */ }
          }}>Cambiar clave</Btn>
          <Btn onClick={() => st.logout()}><LogOut className="size-4" aria-hidden />Cerrar sesión</Btn>
          <Btn variante="peligro" onClick={async () => { if (await confirmar({ titulo: 'Cerrar todas las sesiones', texto: 'Se cerrará la sesión en todos los equipos, incluido este.', ok: 'Cerrar todas', peligro: true })) await st.logout(true) }}>Cerrar sesión en todos los equipos</Btn>
        </div>
        <p className="mt-2 text-sm text-gris">Cambiar la clave cierra la sesión en todos los equipos. Si la olvidas, se restablece desde Apps Script con la función restablecerClave().</p>
      </Seccion>

      <Seccion titulo="Conexión y datos">
        <div className="space-y-2">
          <p>Versión del servidor {ini.version}. {st.modo === 'demo' ? 'Modo demostración.' : <a href={ini.sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold underline">Abrir la hoja de cálculo<ExternalLink className="size-4" aria-hidden /></a>}</p>
          {st.modo === 'real' && <Btn onClick={async () => { if (await confirmar({ titulo: 'Cambiar conexión', texto: `Dirección actual: ${urlApi() || '(ninguna)'}. Se cerrará la sesión en este equipo.`, ok: 'Cambiar' })) { const u = prompt('Nueva dirección /exec de Apps Script:', urlApi()); if (u !== null) { guardarUrlApi(u); await st.logout(); location.reload() } } }}>Cambiar dirección del servidor</Btn>}
          <Btn onClick={async () => setDiag(await st.call('diagnostico'))}>Ver diagnóstico</Btn>
          {diag && <pre className="scroll-x rounded-xl bg-papel p-3 text-sm">{JSON.stringify(diag, null, 2)}</pre>}
        </div>
      </Seccion>
    </div>
  )
}
