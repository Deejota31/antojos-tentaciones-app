import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useStore } from '../lib/store'
import { guardarUrlApi, urlApi } from '../lib/api'
import { Btn, Campo, Input } from '../components/ui'

/** Inicio de sesión. Como capa (overlay) cuando la sesión vence: lo que se estaba registrando sigue debajo. */
export function Login({ overlay }: { overlay?: boolean }) {
  const st = useStore()
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [url, setUrl] = useState(urlApi())
  const [conexion, setConexion] = useState(!st.listo && st.modo === 'real')

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setEnviando(true)
    try { await st.login(clave); setClave('') } catch (err) { setError((err as Error).message) } finally { setEnviando(false) }
  }

  return (
    <div className={overlay ? 'fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-noche/80 p-4' : 'grid min-h-dvh place-items-center bg-noche p-4'}>
      <div className="w-full max-w-sm">
        {!overlay && (
          <div className="mb-6 text-center">
            <p className="cartel text-4xl">Antojos &amp;<br />Tentaciones</p>
            <p className="mt-2 text-white/80">By Pamela Páez · Panel del negocio</p>
          </div>
        )}
        <form onSubmit={entrar} className="rounded-3xl border-2 border-noche bg-white p-5 shadow-[6px_6px_0_#FF1F8E]">
          <h1 className="mb-1 text-xl font-bold">{overlay ? 'Tu sesión terminó' : 'Entrar al panel'}</h1>
          <p className="mb-4 text-gris">{overlay ? 'Ingresa tu clave para seguir. Lo que estabas registrando no se perdió.' : 'Ingresa la clave del negocio.'}</p>
          {st.modo === 'demo' && <p className="mb-3 rounded-xl bg-lima px-3 py-2 font-bold">Demostración: la clave es <code>demo</code>.</p>}
          <Campo etiqueta="Clave" error={error}>
            <Input type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} autoFocus required />
          </Campo>
          <Btn variante="principal" grande type="submit" className="mt-4 w-full" cargando={enviando} disabled={!st.listo}>
            <KeyRound className="size-5" aria-hidden />Entrar
          </Btn>
          {!overlay && st.modo === 'real' && (
            <div className="mt-4 border-t-2 border-linea pt-3">
              {!conexion ? (
                <button type="button" className="text-sm text-gris underline cursor-pointer" onClick={() => setConexion(true)}>Configurar conexión</button>
              ) : (
                <div className="space-y-2">
                  <Campo etiqueta="Dirección del servidor (Apps Script /exec)" ayuda="Solo la primera vez en cada equipo. También puedes escribir demo para probar.">
                    <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" inputMode="url" />
                  </Campo>
                  <Btn onClick={() => { guardarUrlApi(url); location.reload() }}>Guardar dirección</Btn>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
