import { useState } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import { useInstalacion } from '../lib/instalar'
import { Btn, Modal, cx } from './ui'

/** Botón "Instalar app": abre el diálogo del sistema o, en iPhone, explica los dos pasos. */
export function InstalarApp({ className, compacto }: { className?: string; compacto?: boolean }) {
  const { estado, instalar } = useInstalacion()
  const [ayuda, setAyuda] = useState(false)
  if (estado === 'instalada') return null
  return (
    <>
      <Btn variante={compacto ? 'secundario' : 'principal'} className={className} onClick={async () => { if (estado === 'disponible') await instalar(); else setAyuda(true) }}>
        <Download className="size-5" aria-hidden />Instalar app
      </Btn>
      <Modal abierto={ayuda} onCerrar={() => setAyuda(false)} titulo="Instalar en este equipo" pie={<Btn variante="principal" onClick={() => setAyuda(false)}>Entendido</Btn>}>
        {estado === 'ios' ? (
          <ol className="space-y-3 text-lg">
            <li className="flex items-start gap-3"><Paso n={1} /><span>Abre esta página en <b>Safari</b> y toca <Share className="inline size-5" aria-label="Compartir" /> <b>Compartir</b>.</span></li>
            <li className="flex items-start gap-3"><Paso n={2} /><span>Elige <SquarePlus className="inline size-5" aria-hidden /> <b>Agregar a inicio</b> y toca <b>Agregar</b>.</span></li>
          </ol>
        ) : (
          <ol className="space-y-3 text-lg">
            <li className="flex items-start gap-3"><Paso n={1} /><span>Abre el menú del navegador (<b>⋮</b> en Chrome o Edge).</span></li>
            <li className="flex items-start gap-3"><Paso n={2} /><span>Toca <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</span></li>
          </ol>
        )}
        <p className="mt-4 text-gris">Aparecerá el ícono de Antojos &amp; Tentaciones en tu pantalla de inicio y se abrirá a pantalla completa, sin la barra del navegador. Los datos siguen guardándose en la hoja, así que necesitas internet.</p>
      </Modal>
    </>
  )
}
const Paso = ({ n }: { n: number }) => <span className={cx('grid size-8 shrink-0 place-items-center rounded-full bg-noche font-bold text-amarillo')}>{n}</span>
