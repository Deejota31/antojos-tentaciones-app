import { useEffect, useState } from 'react'

/**
 * Instalación como app. Android/Chrome/Edge avisan con "beforeinstallprompt" y permiten mostrar su diálogo.
 * iPhone/iPad (Safari) no lo permiten: se instala con Compartir → "Agregar a inicio", así que se muestran instrucciones.
 */
interface EventoInstalar extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let diferido: EventoInstalar | null = null
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach(f => f())
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); diferido = e as EventoInstalar; avisar() })
  addEventListener('appinstalled', () => { diferido = null; avisar() })
}

export type EstadoInstalacion = 'instalada' | 'disponible' | 'ios' | 'manual'
const esStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useInstalacion() {
  const [, refrescar] = useState(0)
  useEffect(() => { const f = () => refrescar(n => n + 1); oyentes.add(f); return () => { oyentes.delete(f) } }, [])
  const estado: EstadoInstalacion = esStandalone() ? 'instalada' : diferido ? 'disponible' : esIOS() ? 'ios' : 'manual'
  const instalar = async () => {
    if (!diferido) return false
    await diferido.prompt()
    const r = await diferido.userChoice
    diferido = null
    avisar()
    return r.outcome === 'accepted'
  }
  return { estado, instalar }
}
