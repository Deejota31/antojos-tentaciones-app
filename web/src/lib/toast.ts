// Avisos no intrusivos: se apilan arriba y desaparecen solos. Los errores quedan más tiempo.
export interface Aviso { id: number; texto: string; tipo: 'ok' | 'error' | 'info' }
type Oyente = (avisos: Aviso[]) => void
let avisos: Aviso[] = []
let n = 0
const oyentes = new Set<Oyente>()
const emitir = () => oyentes.forEach(o => o(avisos))
export function toast(texto: string, tipo: Aviso['tipo'] = 'info') {
  const id = ++n
  avisos = [...avisos.slice(-3), { id, texto, tipo }]
  emitir()
  setTimeout(() => cerrarAviso(id), tipo === 'error' ? 8000 : 3500)
}
export function cerrarAviso(id: number) { avisos = avisos.filter(a => a.id !== id); emitir() }
export function suscribir(o: Oyente) { oyentes.add(o); o(avisos); return () => { oyentes.delete(o) } }
