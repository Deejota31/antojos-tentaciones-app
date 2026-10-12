import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cerrarAviso, suscribir, type Aviso } from '../lib/toast'
import { cx } from './ui'

export function Toaster() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  useEffect(() => suscribir(setAvisos), [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
      {avisos.map(a => {
        const I = a.tipo === 'ok' ? CheckCircle2 : a.tipo === 'error' ? AlertTriangle : Info
        return (
          <div key={a.id} role={a.tipo === 'error' ? 'alert' : 'status'}
            className={cx('entra pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border-2 px-3 py-2 shadow-lg',
              a.tipo === 'error' ? 'border-e-canc bg-e-canc-bg text-e-canc' : a.tipo === 'ok' ? 'border-noche bg-white text-tinta' : 'border-linea bg-white text-tinta')}>
            <I className={cx('mt-0.5 size-5 shrink-0', a.tipo === 'ok' && 'text-e-listo')} aria-hidden />
            <p className="min-w-0 flex-1 font-bold">{a.texto}</p>
            <button type="button" onClick={() => cerrarAviso(a.id)} className="grid size-7 place-items-center rounded cursor-pointer" aria-label="Cerrar aviso"><X className="size-4" /></button>
          </div>
        )
      })}
    </div>
  )
}
