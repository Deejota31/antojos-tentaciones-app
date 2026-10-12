/**
 * Modo demostración: ejecuta el mismo Code.gs dentro del navegador con una hoja simulada en memoria y carga
 * los mismos datos de ejemplo que cargarDemo() en Apps Script. Viven solo aquí (se pierden al recargar).
 */
import code from '../../../apps-script/Code.gs?raw'
import { ApiError, type Transport } from './api'
import { crearBackend } from './fakegas'

export const CLAVE_DEMO = 'demo'

export function demoTransport(): Transport {
  const b = crearBackend(code)
  b.setup()
  b.fijarClave(CLAVE_DEMO)
  b.cargarDemo()
  return async (action, payload, sesion) => {
    await new Promise(r => setTimeout(r, 120))
    const r = b.post(action, payload, sesion)
    if (!r.ok) throw new ApiError(r.error!.code, r.error!.message, r.error!.detalle)
    return r.data
  }
}
