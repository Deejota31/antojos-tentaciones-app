# Guía rápida para Pamela

## Al empezar el día
1. Abre el panel y entra con tu clave.
2. Ve a **Caja → Abrir caja** y anota el efectivo con el que empiezas (el sencillo para vuelto).

## Registrar una venta
1. **Vender** (o **Nueva venta** en Inicio).
2. Toca los productos. Si tienen opciones o extras, elige y toca **Agregar**. Para notas como “sin ensalada”, escríbelas en la línea.
3. Elige **En local**, **Recojo** o **Delivery**. Para una venta en local no hace falta nombre ni teléfono.
4. Elige el estado: **A preparar** (va a Cocina) o **Entregado ya**.
5. Pago: **Pagado**, **Parcial** (escribe cuánto te dieron) o **Por cobrar**, y el medio (Efectivo, Yape, Plin…).
6. **Revisar y guardar** → **Guardar venta**. Solo cuando aparece “Venta 1012-004 guardada” quedó registrada.

Si sale un error (sin internet, por ejemplo), el pedido sigue en pantalla: vuelve a tocar **Guardar venta**. No se duplica.

Productos con “Precio por configurar” o “Agotado” no se pueden vender. Si alguien agota un producto mientras armas el pedido, la app te avisa cuál es.

## Pedidos y cocina
- **Pedidos → En curso**: toca el botón amarillo para avanzar (Empezar a preparar → Marcar listo → Marcar entregado).
- **Cocina** muestra solo lo que hay que preparar, con notas resaltadas. Se actualiza sola cada 30 segundos.
- **Por cobrar**: pedidos con saldo. Ábrelo y toca **Registrar cobro**.
- **Delivery sin costo**: el pedido queda “Pendiente de confirmación” hasta que pongas el costo (puede ser 0).

## Cancelar
Abre el pedido → **Cancelar pedido**, escribe el motivo. Si ya te pagaron, elige:
- **Queda pendiente de devolver**: aparecerá un aviso en Inicio hasta que registres la devolución.
- **Ya lo devolví**: elige por dónde lo devolviste.

Nada se borra: el pedido queda como cancelado con su historial.

## Gastos
**Gastos → Registrar gasto**. Marca **Pagado con dinero de la caja** solo si salió del cajón: así se descuenta de la caja. Si lo pagaste de tu cuenta, desmárcalo.

## Cerrar la caja
1. **Caja → Cerrar caja**.
2. Cuenta el efectivo y escríbelo. La app te dice si cuadra, falta o sobra.
3. Si hay diferencia, escribe por qué (ej. “di vuelto de más”).
Yape, Plin y transferencias se ven aparte: no están en el cajón.

Para sacar dinero para ti usa **Retiro de la dueña**; para poner más sencillo, **Aporte de la dueña**. No cuentan como ventas ni gastos.

## La carta
**Carta**: cambia precios, fotos y descripciones; marca **Agotado** cuando se acabe algo y quítalo al reponer. **Activo** apagado lo oculta sin borrarlo. Revisa los productos marcados “por revisar” (bebidas y Salchibroaster no tienen precio todavía).

## Cómo leer los números
- **Ventas**: pedidos confirmados (no cuenta pendientes ni cancelados).
- **Cobrado**: dinero que entró en esos días, menos devoluciones.
- **Por cobrar**: lo que aún te deben de esas ventas.
- Ventas menos gastos **no** es tu ganancia real: faltan costos que no se registran día a día.

## Si olvidas la clave
En Google Apps Script ejecuta la función `restablecerClave()`: el registro muestra una clave nueva. Luego cámbiala en **Ajustes**.
