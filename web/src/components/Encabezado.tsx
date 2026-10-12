import type { ReactNode } from 'react'

/** Título de sección en la tipografía de cartel (sin sombra: la sombra fucsia es solo de la marca). */
export function Encabezado({ titulo, sub, children }: { titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="titulo text-2xl text-noche sm:text-3xl">{titulo}</h1>
        {sub && <p className="mt-0.5 text-gris">{sub}</p>}
      </div>
      {children}
    </div>
  )
}
