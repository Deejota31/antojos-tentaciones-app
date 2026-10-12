# Antojos & Tentaciones — By Pamela Páez

Microapp para administrar el negocio desde el celular, la tablet o la computadora: ventas rápidas, pedidos y cocina, cobros y saldos, gastos, caja, carta y reportes. **Google Sheets** es la base de datos, **Google Apps Script** es la API y el frontend es una web estática (Vite + React + TypeScript + Tailwind + Zod + Lucide), el mismo stack verificado en Deejota Gastos.

```
apps-script/   Backend: Code.gs (API + instalador) y appsscript.json
web/           Panel (React) + pruebas (Vitest) + scripts de capturas y recorrido
docs/          Modelo de datos, guía para la dueña y bocetos (capturas por dispositivo)
```

Etapa 1 (este PR): panel privado completo. Etapa 2: la carta pública con carrito y WhatsApp. Su backend (`carta`, `crearSolicitud`) ya está implementado y probado; falta la página pública (ver “Segunda etapa”).

## Qué se reutilizó de Deejota Gastos y qué cambió

| Tema | Decisión |
|---|---|
| Stack | Igual: Vite + React 19 + TS + Tailwind 4 + Zod + Lucide, Vitest, Netlify desde `main`. Sin Recharts: los indicadores usan barras simples. |
| API | Igual: `POST` con cuerpo `text/plain` JSON (sin preflight CORS), `GET` = ping. `LockService`, caché por generación en `CacheService`, IDs/claves generados en el cliente para idempotencia, protección contra fórmulas, lectura por bloques. |
| Autenticación | **Distinto**. Deejota usa un token fijo en `localStorage`. Aquí: clave de la dueña con hash + sal, y sesiones emitidas por el servidor con vencimiento (7 días) y revocables. Ver “Autenticación”. |
| Pruebas | Igual enfoque: el `Code.gs` real corre contra una simulación de Apps Script. La simulación además alimenta el **modo demo** del navegador (`?demo`), así la demo ejecuta el mismo backend. |
| Tipografías | Autohospedadas con Fontsource (Bungee + Atkinson Hyperlegible): no dependen de Google Fonts. |

## Arquitectura

- **Lectura**: `inicial` (configuración + catálogo + caja abierta; el catálogo se cachea) y `rango` (pedidos, líneas, pagos y gastos de un rango, más pedidos abiertos/por cobrar de 90 días) en una llamada cada una. El detalle de un pedido (`pedido`) y el historial de cajas se piden bajo demanda.
- **Cálculos**: un único motor en el navegador (`web/src/lib/engine.ts`) para Inicio, Pedidos y Reportes; la caja la calcula el servidor (`resumenCaja_`). Una prueba verifica que ambos cuadran.
- **Escritura**: el servidor recalcula precios y totales desde el catálogo (ignora importes del navegador), valida disponibilidad, variantes, extras, cantidades (1–99) e importes, y transiciones de estado (solo hacia adelante; cancelar desde cualquier estado no final).
- **Tras guardar**: se recarga solo el rango (una llamada); los cambios del catálogo se aplican localmente con la respuesta. Nunca se muestra “guardado” antes de la respuesta del servidor; el formulario/carrito se conserva si falla.

### Definiciones (se muestran también en pantalla)
- **Venta**: pedido confirmado, en preparación, listo o entregado. Pendientes de confirmación y cancelados no son ventas.
- **Cobrado**: pagos por fecha de pago, de cualquier pedido, menos devoluciones.
- **Por cobrar**: total − (pagado − devuelto) de las ventas del rango.
- **Ticket promedio**: ventas ÷ número de ventas.
- **Margen estimado**: (precio − costo estimado) × unidades, solo de productos con costo cargado. Ventas − gastos nunca se presenta como utilidad real.

## Autenticación

1. `setup()` genera una clave aleatoria y la muestra **una vez** en el registro de ejecución. El servidor guarda solo `CLAVE_HASH` (SHA-256 iterado 1500 veces) + `CLAVE_SAL` en Propiedades del script.
2. `login` compara en tiempo constante y emite un token aleatorio de 256 bits; en Propiedades se guarda solo el hash del token con su vencimiento.
3. **Cada acción privada** verifica el token en el servidor antes de leer o escribir. Ocultar el panel no es la protección: sin sesión válida la API responde `UNAUTHORIZED`.
4. 8 intentos fallidos bloquean el login 15 minutos. Cambiar la clave o “cerrar sesión en todos los equipos” revoca todas las sesiones. `restablecerClave()` (desde el editor) genera otra si se olvida.
5. Si la sesión vence mientras se trabaja, aparece el login encima: el pedido en curso no se pierde.

Acciones públicas (sin sesión): `login`, `carta` (solo catálogo y datos del negocio, nunca pedidos ni clientes) y `crearSolicitud` (con límite por minuto, campo trampa y cerrada por defecto).

**Despliegue compatible**: Web App de Apps Script con *Ejecutar como: yo* y *Acceso: cualquier persona*. Es necesario para que el navegador (Netlify) llame a la API; la hoja sigue privada porque solo el script la abre. Las peticiones `text/plain` no disparan preflight y Apps Script responde con redirección 302 a `googleusercontent.com`, que `fetch` sigue (`redirect: 'follow'`).

## Consistencia sin transacciones

Sheets no tiene transacciones, así que cada operación de varias hojas es una secuencia de pasos **idempotentes** bajo `LockService`:

1. Los IDs se derivan de la clave de idempotencia (`ped_<clave>`, `<pedido>-L1`, `pag_<clave>-0`, `mov_<id origen>`). Repetir un paso nunca duplica.
2. La venta se escribe primero como cabecera con `Integridad = incompleto` y el plan completo de filas en `Datos pendientes`; luego detalle, pago, movimiento de caja e historial; al final `completo`.
3. Un pedido incompleto **no cuenta en ningún total** y aparece como aviso en Inicio con el botón “Completar ahora” (acción `reparar`, que usa el plan guardado). Reintentar la misma venta también lo completa.
4. Los totales pagados se recalculan desde PAGOS, así un fallo entre registrar el pago y actualizar la cabecera no desordena los saldos.

Doble clic, reintentos automáticos (3, ante red, tiempo de espera o bloqueo ocupado) y reenvíos tras error reutilizan la misma clave.

## Instalación

### 1. Backend (Apps Script)
1. Entra a <https://script.google.com> con la cuenta del negocio → **Nuevo proyecto**. Nómbralo “Antojos & Tentaciones API”.
2. Pega `apps-script/Code.gs` en `Code.gs`. En **Configuración del proyecto** activa “Mostrar appsscript.json” y pega `apps-script/appsscript.json`.
3. Elige la función `setup` → **Ejecutar** → autoriza (Hojas y Drive; Drive es para las fotos). En el **registro** aparecen la URL de la hoja y la **CLAVE INICIAL**: guárdala.
4. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: *yo*. Acceso: *cualquier persona*. Copia la URL que termina en `/exec`.
5. Volver a ejecutar `setup()` es seguro: solo agrega lo que falte.

Para actualizar el backend: pega el `Code.gs` nuevo y en **Implementar → Gestionar implementaciones → Editar → Nueva versión** (la URL se mantiene).

### 2. Frontend (Netlify)
1. En Netlify: **Add new site → Import from Git** → este repo. `netlify.toml` ya define base `web`, build y carpeta `dist`.
2. En *Environment variables* agrega `VITE_API_URL` = la URL `/exec`. (Sin esta variable, cada equipo puede ingresarla en “Configurar conexión” del login).
3. Netlify publica al fusionar en `main`.

### Datos de demostración (para presentar)
- **`cargarDemo()`** (desde el editor de Apps Script, tarda 1–3 minutos): carga unos 10 días de operación ficticia usando las mismas funciones del negocio. Incluye más de 60 pedidos en todos los estados, cobros por todos los medios, saldos por cobrar, cancelaciones con y sin devolución, gastos de compra y operativos, 9 cajas cerradas (una con diferencia) y la caja de hoy abierta con aporte y retiro. También agrega precios de ejemplo para bebidas y extras, marcados “(demo)”. Se niega a correr si la hoja ya tiene ventas reales.
- Mientras haya datos de demo, el panel muestra un aviso verde lima.
- **`borrarDatos()`** (desde el editor) o **Ajustes → Borrar datos de ventas** (pide la clave y escribir BORRAR): borra pedidos, detalle, pagos, gastos, cajas, movimientos e historial, y las opciones “(demo)”. Conserva la carta, los ajustes y la clave. Los códigos de pedido vuelven a empezar en 001. Se recupera solo desde Archivo → Historial de versiones de la hoja.
- El modo `?demo` del navegador carga exactamente los mismos datos, en memoria.

### 3. Primer uso
Entra con la clave inicial y cámbiala en **Ajustes → Seguridad**. Revisa en **Carta** los productos “por revisar” (bebidas y Salchibroaster sin precio, descripciones pendientes) y en **Ajustes** confirma el número de WhatsApp.

### Desarrollo local
```bash
cd web
npm install
npm run dev          # abre http://localhost:5173/?demo  (clave: demo)
npm test             # 37 pruebas: backend real + motor de indicadores
npm run lint && npm run build
```

## Catálogo inicial
Cargado por `setup()` con IDs fijos (no se duplica). Los nombres llevan la categoría para que la cocina distinga, por ejemplo, “Hamburguesa Clásica” de “Salchipapa Clásica”. Precios según la carta compartida. **Sin precio** (no vendibles hasta configurarlos): Chicha morada, Gaseosas, Infusiones y Salchibroaster. Todas las descripciones quedan vacías y marcadas “Revisar”: no se recibió el texto de la carta. No se cargan horarios, dirección, zonas ni tarifas.

## Pruebas realizadas

Ejecutadas en este entorno:
- **Backend** (`web/src/backend.test.ts`, 33 pruebas): instalador idempotente y que no reinicia configuración; autenticación (sin sesión, sesión falsa o vencida, bloqueo por intentos, logout, cambio de clave revoca, clave nunca en texto); precios recalculados en el servidor; aviso si el total cambió; **doble clic/reintento sin duplicar** pedido, pago ni movimiento; **cambio de precio sin alterar el historial**; **producto agotado** o sin precio bloqueado con detalle; variantes y extras; cantidades e importes inválidos; protección contra fórmulas; **pago parcial y saldo**; transiciones; **cancelación de pedido pagado** (pendiente de devolución y devolución inmediata, ambas idempotentes); delivery por confirmar; **cierre de caja** con efectivo, Yape, gastos de caja, gasto fuera de caja, retiro y aporte; anulación de gastos; **escrituras interrumpidas** a mitad (detalle, pago) y su recuperación; lock ocupado; invalidación de caché; carta pública sin datos de clientes y solicitud pendiente con código; `cargarDemo()` (≥5 registros en cada hoja, todos los estados, sin incompletos, no corre sobre ventas reales) y `borrarDatos()` (limpia lo operativo, conserva catálogo y configuración; desde el panel exige clave y BORRAR).
- Comprobé que las pruebas fallan si se quita la protección de fórmulas, la idempotencia de ventas o la verificación de sesión.
- **Coherencia** (`web/src/engine.test.ts`): ventas, cobros, devoluciones, saldo y ticket del motor cuadran con la caja del servidor; filtros por categoría, canal y medio.
- **Navegador real** (Chromium, modo demo) en 390 px, 1024 px y 1440 px (`web/scripts/recorrido.mjs`): login con clave errada y correcta, producto sin precio bloqueado, venta con pago parcial guardada con doble clic (una sola), cobro del saldo, cancelación con devolución pendiente, cierre de caja con diferencia. Sin errores de página.
- **Sin desplazamiento horizontal** en las 7 vistas principales en los tres anchos (`web/scripts/bocetos.mjs`). Capturas en `docs/bocetos/`.

## Necesita validación en Google (no se pudo ejecutar aquí)
- Tiempos reales de Apps Script: el login hace 1500 SHA-256 (estimado < 1 s); lectura de rangos con muchos meses de datos.
- Despliegue `/exec` con acceso “cualquier persona” llamado desde Netlify (la simulación no cubre la redirección real de Google).
- Subida de fotos a Drive y su visualización con el enlace `lh3.googleusercontent.com` (la carpeta se comparte “cualquiera con el enlace puede ver”).
- Cuotas de `PropertiesService` (sesiones) y `CacheService`.
- Uso en celulares reales (iPhone/Android), rotación y teclado numérico.

## Limitaciones conocidas
- Un pedido no se edita después de guardarlo (líneas): se cancela y se registra de nuevo. Se puede cambiar el delivery mientras esté abierto.
- Un gasto no se edita: se anula y se registra otro. No se anulan pagos ni gastos de una caja ya cerrada.
- El bloqueo por intentos de login es global (no por equipo): un tercero insistente podría demorar el acceso 15 minutos.
- Sin modo sin conexión (por diseño en esta fase). El token de sesión vive en el navegador del equipo: no usar el panel en equipos compartidos sin cerrar sesión.
- La caja es una sola a la vez (un local, un turno).

## Segunda etapa: carta pública y WhatsApp (diseño)
Ya en el servidor: `carta` (catálogo público sin datos privados) y `crearSolicitud` (pedido `pendiente`, origen `carta`, delivery según configuración —“por confirmar” si no hay tarifa—, sin pagos, con código y límite por minuto). Falta la página:
1. Ruta pública (`#/carta`) que no requiere sesión: logo, descripción, destacados, categorías, productos con foto y disponibilidad; horario/dirección/zonas solo si están configurados.
2. Carrito en `sessionStorage` con clave de idempotencia; muestra “Delivery por confirmar” y nunca presenta el subtotal como total final.
3. Al enviar: `crearSolicitud` → recibe el código → abre `https://wa.me/<número>?text=…` con el pedido y el código. Solo si `whatsapp_validado = SI`.
4. Pantalla final que explica que abrir WhatsApp no confirma el pedido: hay que enviar el mensaje y esperar la confirmación. Si falla el guardado, el carrito se conserva y el reintento usa la misma clave.
5. La dueña confirma desde **Pedidos → En curso** (define delivery si corresponde).

Fuera de alcance: inventario por ingredientes, recetas, fidelización, facturación electrónica, pasarela de pago, WhatsApp Business API, varios locales.
