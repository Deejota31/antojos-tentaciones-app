# Modelo de datos (Google Sheets)

Una hoja de cálculo privada con 11 pestañas. Nadie la edita desde el navegador: todo pasa por Apps Script.
La primera columna de cada pestaña es un **ID estable** (nunca el número de fila). Los importes están en soles con 2 decimales.
Las columnas de texto tienen formato texto plano (teléfonos y fechas ISO no se convierten). Fechas de negocio en `America/Lima` (`yyyy-MM-dd`); marcas de tiempo técnicas en ISO UTC.

```
CATEGORIAS 1──* PRODUCTOS 1──* OPCIONES (variantes y extras)
                     ╎ (copia al vender)
PEDIDOS 1──* DETALLE_PEDIDOS
PEDIDOS 1──* PAGOS (cobros y devoluciones) *──0..1 CAJAS
PEDIDOS 1──* HISTORIAL_ESTADOS
CAJAS 1──* MOVIMIENTOS_CAJA *──0..1 PAGOS | GASTOS
GASTOS *──0..1 CAJAS
CONFIG (clave → valor)
```

## CONFIG
| Columna | Uso |
|---|---|
| Clave | `negocio_nombre`, `whatsapp_numero`, `whatsapp_validado`, `horario`, `direccion`, `delivery_modo`, `delivery_tarifa`, `delivery_zonas`, `recojo_disponible`, `carta_publica_activa`, `medios_pago`, `categorias_gasto`, … |
| Valor, Descripción, Actualizado en | |

Horario, dirección, zonas y tarifas quedan **vacíos** (pendientes de configurar). `whatsapp_validado = NO` hasta que la dueña confirme el número 939 968 342.

## CATEGORIAS
ID · Nombre · Descripción · Orden · Activo · Creado en · Actualizado en

## PRODUCTOS
ID · Categoría ID · Nombre · Descripción · Precio · Costo estimado · Foto URL · Activo · Agotado · Destacado · Orden · Es combo · Incluye (combo) · Revisar · Creado en · Actualizado en

- **Precio vacío** = por configurar: no se puede vender salvo que tenga variantes con precio.
- **Revisar**: nota visible en el panel para datos dudosos (descripciones no recibidas, precios pendientes).
- Nunca se borran: se desactivan (`Activo = NO`) o se marcan `Agotado`.

## OPCIONES
ID · Producto ID · Tipo (`variante` | `extra`) · Nombre · Precio · Activo · Orden · Creado en · Actualizado en

Variante: reemplaza el precio del producto (ej. “Inca Kola 500 ml”). Extra: se suma (ej. “Huevo +1.50”).

## PEDIDOS (cabecera)
ID · Código · Fecha · Origen (`panel` | `carta`) · Canal (`local` | `recojo` | `delivery`) · Estado · Estado pago · Cliente · Teléfono · Dirección · Referencia · Nota · Subtotal · Delivery · Delivery estado (`no_aplica` | `definido` | `por_confirmar`) · Total · Pagado · Devuelto · Devolución (`` | `pendiente` | `devuelto`) · Líneas · Integridad (`incompleto` | `completo`) · Clave idempotencia · Datos pendientes · Confirmado en · Entregado en · Cancelado en · Motivo cancelación · Creado en · Actualizado en

- **ID** = `ped_<clave de idempotencia>`; **Código** = `MMDD-NNN` (correlativo diario, el que se dice al cliente).
- **Estado** y **Estado pago** son independientes.
- Pagado/Devuelto/Estado pago se guardan para leer la hoja cómodamente, pero los totales de la app se recalculan siempre desde PAGOS.
- **Integridad/Datos pendientes**: ver “Consistencia” en el README.

## DETALLE_PEDIDOS (copia de lo vendido)
ID (`<pedido>-L<n>`) · Pedido ID · Línea · Producto ID · Producto · Categoría ID · Categoría · Variante ID · Variante · Precio base · Extras IDs · Extras · Extras total · Precio unitario · Cantidad · Importe · Costo unitario estimado · Nota · Creado en

Guarda nombre, categoría, variante, extras y precios **tal como se vendieron**. Cambiar el catálogo no altera ventas anteriores.

## PAGOS
ID · Pedido ID · Código pedido · Tipo (`pago` | `devolucion`) · Medio · Monto · Fecha · Fecha hora · Caja ID · Nota · Estado (`activo` | `anulado`) · Clave idempotencia · Creado en · Actualizado en

## GASTOS
ID · Fecha · Categoría · Tipo (`compra` | `operativo`) · Descripción · Monto · Medio · Pagado desde caja · Caja ID · Comprobante · Estado · Clave idempotencia · Creado en · Actualizado en

Compras de insumos y gastos operativos se separan por **Tipo**. Los **costos estimados** no son gastos: viven en PRODUCTOS (Costo estimado) y se copian a cada línea vendida.

## CAJAS
ID · Fecha · Estado (`abierta` | `cerrada`) · Fondo inicial · Abierta en · Cerrada en · Efectivo esperado · Efectivo contado · Diferencia · Observación · Resumen al cierre (JSON) · Actualizado en

Solo una caja abierta a la vez. Al cerrar se guarda una foto del resumen por medio de pago.

## MOVIMIENTOS_CAJA
ID · Caja ID · Fecha hora · Tipo (`cobro` | `devolucion` | `gasto` | `retiro` | `aporte`) · Medio · Sentido (`ingreso` | `egreso`) · Monto · Referencia (`pago` | `gasto` | `duena`) · Referencia ID · Nota · Estado · Creado en

El único libro de la caja. Cada cobro/devolución/gasto pagado desde caja tiene **un** movimiento (`mov_<id del origen>`), así nada se descuenta dos veces. Retiros y aportes de la dueña son movimientos propios, separados de ventas y gastos.

## HISTORIAL_ESTADOS
ID · Pedido ID · Tipo (`pedido` | `pago` | `delivery`) · De · A · Fecha hora · Nota

## Propiedades del script (no en la hoja)
`SPREADSHEET_ID`, `CLAVE_HASH` + `CLAVE_SAL` (clave del panel, con hash), `SES_<hash>` (sesiones con vencimiento), `COD_<fecha>` (correlativo de códigos), `FOTOS_CARPETA_ID`.
