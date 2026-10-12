/**
 * Antojos & Tentaciones — backend Google Apps Script (V8).
 *
 * Google Sheets es la base de datos y nunca se expone al navegador: todo pasa por esta API.
 *  - GET: ping de salud sin datos.
 *  - POST con cuerpo text/plain JSON {action, payload, sesion?}: el text/plain evita el preflight CORS,
 *    así funciona desde cualquier hosting estático (Netlify) sin proxy.
 *
 * Autenticación (panel privado): la dueña inicia sesión con su clave. El servidor guarda solo un hash con sal
 * (Propiedades del script) y emite un token de sesión aleatorio con vencimiento. Cada acción privada verifica
 * ese token en el servidor; el navegador solo lo guarda. Cerrar sesión o cambiar la clave lo revoca.
 *
 * Consistencia: Sheets no tiene transacciones. Cada escritura de varias hojas sigue una secuencia de pasos
 * idempotentes ("asegurar que exista X") bajo LockService; los IDs se derivan de la clave de idempotencia,
 * así un reintento completa lo que faltó sin duplicar. Un pedido se marca "incompleto" hasta escribir su último
 * paso; los incompletos no cuentan en ningún total y se reparan con la acción "reparar" o reintentando.
 */

var APP_VERSION = '0.1.0';
var SPREADSHEET_NAME = 'Antojos & Tentaciones - Base de Datos';
var TZ = 'America/Lima';

/* ===================== Esquema de hojas ===================== */
// [campo, encabezado, tipo]. Tipos: t texto, n número, b sí/no, j JSON (texto). La columna 0 es siempre el ID.
var ESQUEMA = {
  CONFIG: [['clave', 'Clave'], ['valor', 'Valor'], ['descripcion', 'Descripción'], ['actualizadoEn', 'Actualizado en']],
  CATEGORIAS: [['id', 'ID'], ['nombre', 'Nombre'], ['descripcion', 'Descripción'], ['orden', 'Orden', 'n'],
    ['activo', 'Activo', 'b'], ['creadoEn', 'Creado en'], ['actualizadoEn', 'Actualizado en']],
  PRODUCTOS: [['id', 'ID'], ['categoriaId', 'Categoría ID'], ['nombre', 'Nombre'], ['descripcion', 'Descripción'],
    ['precio', 'Precio', 'n'], ['costo', 'Costo estimado', 'n'], ['fotoUrl', 'Foto URL'], ['activo', 'Activo', 'b'],
    ['agotado', 'Agotado', 'b'], ['destacado', 'Destacado', 'b'], ['orden', 'Orden', 'n'], ['esCombo', 'Es combo', 'b'],
    ['incluye', 'Incluye (combo)'], ['revisar', 'Revisar'], ['creadoEn', 'Creado en'], ['actualizadoEn', 'Actualizado en']],
  // Variantes (precio propio, reemplaza al del producto) y extras (se suman). Una fila por opción.
  OPCIONES: [['id', 'ID'], ['productoId', 'Producto ID'], ['tipo', 'Tipo'], ['nombre', 'Nombre'], ['precio', 'Precio', 'n'],
    ['activo', 'Activo', 'b'], ['orden', 'Orden', 'n'], ['creadoEn', 'Creado en'], ['actualizadoEn', 'Actualizado en']],
  PEDIDOS: [['id', 'ID'], ['codigo', 'Código'], ['fecha', 'Fecha'], ['origen', 'Origen'], ['canal', 'Canal'],
    ['estado', 'Estado'], ['estadoPago', 'Estado pago'], ['cliente', 'Cliente'], ['telefono', 'Teléfono'],
    ['direccion', 'Dirección'], ['referencia', 'Referencia'], ['nota', 'Nota'], ['subtotal', 'Subtotal', 'n'],
    ['delivery', 'Delivery', 'n'], ['deliveryEstado', 'Delivery estado'], ['total', 'Total', 'n'],
    ['pagado', 'Pagado', 'n'], ['devuelto', 'Devuelto', 'n'], ['devolucion', 'Devolución'], ['lineas', 'Líneas', 'n'],
    ['integridad', 'Integridad'], ['clave', 'Clave idempotencia'], ['pendiente', 'Datos pendientes', 'j'],
    ['confirmadoEn', 'Confirmado en'], ['entregadoEn', 'Entregado en'], ['canceladoEn', 'Cancelado en'],
    ['motivoCancelacion', 'Motivo cancelación'], ['creadoEn', 'Creado en'], ['actualizadoEn', 'Actualizado en']],
  // Copia de lo vendido: cambiar el catálogo nunca altera ventas anteriores.
  DETALLE_PEDIDOS: [['id', 'ID'], ['pedidoId', 'Pedido ID'], ['linea', 'Línea', 'n'], ['productoId', 'Producto ID'],
    ['producto', 'Producto'], ['categoriaId', 'Categoría ID'], ['categoria', 'Categoría'], ['varianteId', 'Variante ID'],
    ['variante', 'Variante'], ['precioBase', 'Precio base', 'n'], ['extrasIds', 'Extras IDs'], ['extras', 'Extras'],
    ['extrasTotal', 'Extras total', 'n'], ['precioUnitario', 'Precio unitario', 'n'], ['cantidad', 'Cantidad', 'n'],
    ['importe', 'Importe', 'n'], ['costoUnitario', 'Costo unitario estimado', 'n'], ['nota', 'Nota'], ['creadoEn', 'Creado en']],
  // Cobros (tipo pago) y devoluciones (tipo devolucion). Nunca se borran: se anulan.
  PAGOS: [['id', 'ID'], ['pedidoId', 'Pedido ID'], ['codigo', 'Código pedido'], ['tipo', 'Tipo'], ['medio', 'Medio'],
    ['monto', 'Monto', 'n'], ['fecha', 'Fecha'], ['fechaHora', 'Fecha hora'], ['cajaId', 'Caja ID'], ['nota', 'Nota'],
    ['estado', 'Estado'], ['clave', 'Clave idempotencia'], ['creadoEn', 'Creado en'], ['actualizadoEn', 'Actualizado en']],
  GASTOS: [['id', 'ID'], ['fecha', 'Fecha'], ['categoria', 'Categoría'], ['tipo', 'Tipo'], ['descripcion', 'Descripción'],
    ['monto', 'Monto', 'n'], ['medio', 'Medio'], ['desdeCaja', 'Pagado desde caja', 'b'], ['cajaId', 'Caja ID'],
    ['comprobante', 'Comprobante'], ['estado', 'Estado'], ['clave', 'Clave idempotencia'], ['creadoEn', 'Creado en'],
    ['actualizadoEn', 'Actualizado en']],
  CAJAS: [['id', 'ID'], ['fecha', 'Fecha'], ['estado', 'Estado'], ['fondo', 'Fondo inicial', 'n'], ['abiertaEn', 'Abierta en'],
    ['cerradaEn', 'Cerrada en'], ['esperado', 'Efectivo esperado', 'n'], ['contado', 'Efectivo contado', 'n'],
    ['diferencia', 'Diferencia', 'n'], ['observacion', 'Observación'], ['resumen', 'Resumen al cierre', 'j'],
    ['actualizadoEn', 'Actualizado en']],
  // Único libro de la caja: cobros, devoluciones, gastos pagados desde caja, retiros y aportes de la dueña.
  MOVIMIENTOS_CAJA: [['id', 'ID'], ['cajaId', 'Caja ID'], ['fechaHora', 'Fecha hora'], ['tipo', 'Tipo'], ['medio', 'Medio'],
    ['sentido', 'Sentido'], ['monto', 'Monto', 'n'], ['referencia', 'Referencia'], ['referenciaId', 'Referencia ID'],
    ['nota', 'Nota'], ['estado', 'Estado'], ['creadoEn', 'Creado en']],
  HISTORIAL_ESTADOS: [['id', 'ID'], ['pedidoId', 'Pedido ID'], ['tipo', 'Tipo'], ['de', 'De'], ['a', 'A'],
    ['fechaHora', 'Fecha hora'], ['nota', 'Nota']]
};

var SHEETS = {};
var COL = {};
Object.keys(ESQUEMA).forEach(function (n) {
  SHEETS[n] = ESQUEMA[n].map(function (c) { return c[1]; });
  COL[n] = {};
  ESQUEMA[n].forEach(function (c, i) { COL[n][c[0]] = i; });
});

/* ===================== Reglas del negocio ===================== */
var CANALES = ['local', 'recojo', 'delivery'];
var ESTADOS = ['pendiente', 'confirmado', 'preparando', 'listo', 'entregado', 'cancelado'];
var ESTADOS_VENTA = { confirmado: true, preparando: true, listo: true, entregado: true };
// Transiciones válidas: solo hacia adelante; cancelar desde cualquier estado no final.
var TRANSICIONES = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['preparando', 'listo', 'entregado', 'cancelado'],
  preparando: ['listo', 'entregado', 'cancelado'],
  listo: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: []
};
var TIPOS_GASTO = ['compra', 'operativo'];
var MAX_LINEAS = 40;
var MAX_CANTIDAD = 99;
var MAX_IMPORTE = 100000;
var CLAVE_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
var ID_RE = /^[a-z]{3}[-_][0-9a-zA-Z_-]{2,80}$/;

/* ===================== Catálogo y configuración iniciales ===================== */
var CONFIG_INICIAL = [
  ['negocio_nombre', 'Antojos & Tentaciones', 'Nombre visible del negocio'],
  ['negocio_firma', 'By Pamela Páez', 'Firma bajo el nombre'],
  ['negocio_descripcion', '', 'Descripción corta para la carta pública (pendiente)'],
  ['logo_url', '', 'Enlace del logo (pendiente)'],
  ['whatsapp_numero', '51939968342', 'Número de WhatsApp con código de país, solo dígitos'],
  ['whatsapp_validado', 'NO', 'SI cuando la dueña confirme que el número es correcto. Sin esto la carta no abre WhatsApp.'],
  ['horario', '', 'Horario de atención (pendiente de configurar)'],
  ['direccion', '', 'Dirección del local (pendiente de configurar)'],
  ['recojo_disponible', 'SI', 'SI o NO'],
  ['delivery_modo', 'por_confirmar', 'por_confirmar, tarifa_fija o no_disponible'],
  ['delivery_tarifa', '', 'Tarifa fija en soles, solo si delivery_modo = tarifa_fija'],
  ['delivery_zonas', '', 'Zonas de reparto (pendiente de configurar)'],
  ['carta_publica_activa', 'NO', 'SI para publicar la carta y aceptar solicitudes'],
  ['medios_pago', 'Efectivo,Yape,Plin,Transferencia,Otro', 'Medios de pago separados por coma. "Efectivo" es el dinero físico de la caja.'],
  ['categorias_gasto', 'Ingredientes,Bebidas,Envases,Gas,Limpieza,Transporte,Servicios,Otros', 'Categorías de gasto separadas por coma']
];
var CONFIG_PUBLICA = ['negocio_nombre', 'negocio_firma', 'negocio_descripcion', 'logo_url', 'horario', 'direccion',
  'recojo_disponible', 'delivery_modo', 'delivery_tarifa', 'delivery_zonas', 'carta_publica_activa'];

var SIN_DESCRIPCION = 'Descripción pendiente: no se recibió el texto de la carta.';
var CATEGORIAS_INICIALES = [
  ['cat-hamburguesas', 'Hamburguesas', 1], ['cat-broaster', 'Broaster', 2], ['cat-salchipapas', 'Salchipapas', 3],
  ['cat-especiales', 'Especiales', 4], ['cat-bebidas', 'Bebidas', 5]
];
// [id, categoría, nombre, precio (null = por configurar), revisar]
var PRODUCTOS_INICIALES = [
  ['prd-hamb-clasica', 'cat-hamburguesas', 'Hamburguesa Clásica', 8], ['prd-hamb-doble', 'cat-hamburguesas', 'Hamburguesa Doble', 13],
  ['prd-hamb-triple', 'cat-hamburguesas', 'Hamburguesa Triple', 16], ['prd-hamb-royal', 'cat-hamburguesas', 'Hamburguesa Royal', 13],
  ['prd-hamb-broaster', 'cat-hamburguesas', 'Hamburguesa Broaster', 14], ['prd-hamb-parrillera', 'cat-hamburguesas', 'Hamburguesa Parrillera', 13],
  ['prd-hamb-bbq', 'cat-hamburguesas', 'Hamburguesa BBQ', 16],
  ['prd-brst-alita', 'cat-broaster', 'Broaster Alita', 10], ['prd-brst-pierna', 'cat-broaster', 'Broaster Pierna', 11],
  ['prd-brst-encuentro', 'cat-broaster', 'Broaster Encuentro', 12], ['prd-brst-pecho', 'cat-broaster', 'Broaster Pecho', 13],
  ['prd-salc-clasica', 'cat-salchipapas', 'Salchipapa Clásica', 10], ['prd-salc-mechada', 'cat-salchipapas', 'Salchipapa Mechada', 15],
  ['prd-salc-burger', 'cat-salchipapas', 'Salchipapa Burger', 15], ['prd-salc-choripapas', 'cat-salchipapas', 'Choripapas', 12],
  ['prd-salc-salchibroaster', 'cat-salchipapas', 'Salchibroaster', null, 'Precio por consultar en la carta: definir precio antes de vender.'],
  ['prd-esp-papa-rellena', 'cat-especiales', 'Papa rellena', 8], ['prd-esp-alitas-acevichadas', 'cat-especiales', 'Alitas acevichadas', 18],
  ['prd-esp-filete-pollo', 'cat-especiales', 'Filete de pollo', 13], ['prd-esp-chuleta', 'cat-especiales', 'Chuleta', 15],
  ['prd-esp-churrasco', 'cat-especiales', 'Churrasco', 18], ['prd-esp-bistec-pobre', 'cat-especiales', 'Bistec a lo pobre', 20],
  ['prd-beb-chicha', 'cat-bebidas', 'Chicha morada', null, 'Precio y tamaños pendientes: no figuran en la carta.'],
  ['prd-beb-gaseosas', 'cat-bebidas', 'Gaseosas', null, 'Marcas, tamaños y precios pendientes: crear variantes.'],
  ['prd-beb-infusiones', 'cat-bebidas', 'Infusiones', null, 'Tipos y precios pendientes: no figuran en la carta.']
];

/* ===================== Utilidades ===================== */
// Solo para pruebas automatizadas: simulan reloj y fallos a mitad de una escritura. En producción son null.
var RELOJ_PRUEBA = null;
var FALLAS_PRUEBA = null;
function ahora_() { return RELOJ_PRUEBA ? new Date(RELOJ_PRUEBA()) : new Date(); }
function puntoControl_(nombre) {
  if (FALLAS_PRUEBA && FALLAS_PRUEBA[nombre]) { FALLAS_PRUEBA[nombre] = false; throw new Error('Fallo simulado en ' + nombre); }
}
function iso_(d) { return d.toISOString(); }
function fechaLima_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function bool_(v) { return v === true || /^(TRUE|SI|SÍ)$/i.test(str_(v)); }
function cents_(n) { return Math.round(Number(n) * 100); }
function soles_(c) { return Math.round(c) / 100; }
function uuid_() { return Utilities.getUuid(); }

function appError_(code, message, extra) {
  var e = new Error(message);
  e.appCode = code;
  if (extra) e.extra = extra;
  return e;
}
// Evita que Sheets interprete un texto como fórmula (inyección de fórmulas).
function safeCell_(s) { return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
function text_(v, label, max, required) {
  var s = str_(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (required && !s) throw appError_('VALIDATION', label + ' es obligatorio.');
  if (s.length > max) throw appError_('VALIDATION', label + ' supera ' + max + ' caracteres.');
  return s;
}
function money_(v, label, allowZero) {
  if (v === '' || v === null || v === undefined) throw appError_('VALIDATION', label + ' es obligatorio.');
  var n = Number(v);
  if (!isFinite(n) || n < 0 || (!allowZero && n === 0) || n > MAX_IMPORTE) throw appError_('VALIDATION', label + ' no es un importe válido.');
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw appError_('VALIDATION', label + ' admite como máximo 2 decimales.');
  return Math.round(n * 100) / 100;
}
function moneyOpt_(v, label) { return v === '' || v === null || v === undefined ? null : money_(v, label, true); }
function clave_(v) {
  if (!CLAVE_RE.test(str_(v))) throw appError_('VALIDATION', 'Clave de operación inválida.');
  return str_(v).toLowerCase();
}
function id_(v, label) {
  if (!ID_RE.test(str_(v))) throw appError_('VALIDATION', (label || 'ID') + ' inválido.');
  return str_(v);
}
function fecha_(v, label) {
  var s = str_(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T12:00:00Z').getTime())) throw appError_('VALIDATION', (label || 'Fecha') + ' inválida.');
  return s;
}
function uno_(v, lista, label) {
  if (lista.indexOf(v) < 0) throw appError_('VALIDATION', label + ' no válido.');
  return v;
}

/* ===================== Acceso a hojas ===================== */
function openSpreadsheet_(create) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  if (!create) throw appError_('NOT_INSTALLED', 'Ejecuta setup() en Apps Script antes de usar la app.');
  var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function ensureSheet_(ss, name) {
  var headers = SHEETS[name];
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var current = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  while (current.length && str_(current[current.length - 1]) === '') current.pop();
  var isPrefix = current.length < headers.length && current.join('|') === headers.slice(0, current.length).join('|');
  if (!current.join('') || isPrefix) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#FFD60A');
  } else if (current.slice(0, headers.length).join('|') !== headers.join('|')) {
    throw new Error('La hoja ' + name + ' tiene encabezados distintos a los esperados. No se modificó nada.');
  }
  // Texto plano en columnas de texto: teléfonos, fechas ISO y códigos no se convierten en números o fechas.
  ESQUEMA[name].forEach(function (c, i) {
    sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(c[2] === 'n' ? '0.00' : '@');
  });
  sh.setFrozenRows(1);
  return sh;
}

function hasContent_(r) {
  for (var i = 0; i < r.length; i++) if (r[i] !== '' && r[i] !== false && r[i] !== null) return true;
  return false;
}
function lastDataRow_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var values = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) if (str_(values[i][0]) !== '') return i + 2;
  return 1;
}

function leerValor_(tipo, v) {
  if (tipo === 'n') return v === '' || v === null || v === undefined ? null : (isFinite(Number(v)) ? Number(v) : null);
  if (tipo === 'b') return bool_(v);
  if (v instanceof Date) return v.toISOString();
  var s = str_(v);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}
function escribirValor_(tipo, v) {
  if (tipo === 'n') return v === null || v === undefined || v === '' ? '' : Number(v);
  if (tipo === 'b') return v ? 'SI' : 'NO';
  if (tipo === 'j') return v === null || v === undefined || v === '' ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
  return safeCell_(str_(v));
}
function aObjeto_(name, row) {
  var o = {};
  ESQUEMA[name].forEach(function (c, i) { o[c[0]] = leerValor_(c[2], row[i]); });
  return o;
}
function aFila_(name, o) {
  return ESQUEMA[name].map(function (c) { return escribirValor_(c[2], o[c[0]]); });
}

// Lee la hoja completa de una vez. _fila es solo para actualizar en esta misma operación, nunca un identificador.
function leer_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw appError_('NOT_INSTALLED', 'Falta la hoja ' + name + ': ejecuta setup().');
  var last = sh.getLastRow();
  var objs = [];
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, SHEETS[name].length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (str_(values[i][0]) === '') continue;
      var o = aObjeto_(name, values[i]);
      o._fila = i + 2;
      objs.push(o);
    }
  }
  var porId = {};
  objs.forEach(function (o) { porId[o.id || o.clave] = o; });
  return { sh: sh, name: name, objs: objs, porId: porId };
}

function agregar_(t, objs) {
  if (!objs.length) return;
  var start = lastDataRow_(t.sh) + 1;
  t.sh.getRange(start, 1, objs.length, SHEETS[t.name].length).setValues(objs.map(function (o) { return aFila_(t.name, o); }));
  objs.forEach(function (o, i) { o._fila = start + i; t.objs.push(o); t.porId[o.id || o.clave] = o; });
}
function guardar_(t, o) {
  t.sh.getRange(o._fila, 1, 1, SHEETS[t.name].length).setValues([aFila_(t.name, o)]);
}
function limpio_(o) {
  var r = {};
  Object.keys(o).forEach(function (k) { if (k !== '_fila' && k !== 'pendiente' && k !== 'clave') r[k] = o[k]; });
  return r;
}

/* ===================== Instalación ===================== */

/**
 * Instalador idempotente: crea hojas y encabezados faltantes, carga el catálogo inicial solo si falta y agrega
 * claves de configuración nuevas sin tocar las existentes. No borra datos ni crea ventas de ejemplo.
 * La primera vez genera una clave de acceso aleatoria y la muestra en el registro.
 */
function setup() {
  var ss = openSpreadsheet_(true);
  Object.keys(ESQUEMA).forEach(function (n) { ensureSheet_(ss, n); });
  var now = iso_(ahora_());

  var cfg = leer_(ss, 'CONFIG');
  agregar_(cfg, CONFIG_INICIAL.filter(function (c) { return !cfg.porId[c[0]]; })
    .map(function (c) { return { clave: c[0], valor: c[1], descripcion: c[2], actualizadoEn: now }; }));

  var cats = leer_(ss, 'CATEGORIAS');
  agregar_(cats, CATEGORIAS_INICIALES.filter(function (c) { return !cats.porId[c[0]]; })
    .map(function (c) { return { id: c[0], nombre: c[1], descripcion: '', orden: c[2], activo: true, creadoEn: now, actualizadoEn: now }; }));

  var prods = leer_(ss, 'PRODUCTOS');
  agregar_(prods, PRODUCTOS_INICIALES.map(function (p, i) { return [p, i]; }).filter(function (x) { return !prods.porId[x[0][0]]; })
    .map(function (x) {
      var p = x[0];
      return { id: p[0], categoriaId: p[1], nombre: p[2], descripcion: '', precio: p[3], costo: null, fotoUrl: '', activo: true,
        agotado: false, destacado: false, orden: x[1] + 1, esCombo: false, incluye: '', revisar: p[4] || SIN_DESCRIPCION,
        creadoEn: now, actualizadoEn: now };
    }));

  ss.setSpreadsheetTimeZone(TZ);
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja 1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CLAVE_HASH')) {
    var inicial = generarClave_();
    fijarClave_(inicial);
    Logger.log('CLAVE INICIAL DEL PANEL (cámbiala al entrar, en Ajustes): ' + inicial);
  }
  invalidar_('cat');
  invalidar_('dat');
  Logger.log('Hoja: ' + ss.getUrl());
}

/** Ejecutar desde el editor si se olvidó la clave: genera otra, la muestra en el registro y cierra todas las sesiones. */
function restablecerClave() {
  var nueva = generarClave_();
  fijarClave_(nueva);
  revocarSesiones_();
  Logger.log('NUEVA CLAVE DEL PANEL: ' + nueva);
}

/* ===================== Autenticación ===================== */
var SESION_DIAS = 7;
var LOGIN_MAX_FALLOS = 8;
var LOGIN_BLOQUEO_SEG = 900;
var HASH_VUELTAS = 1500;

function hex_(bytes) {
  return bytes.map(function (b) { var h = ((b < 0 ? b + 256 : b)).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}
function sha256_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function derivar_(clave, sal) {
  var h = sal + ':' + clave;
  for (var i = 0; i < HASH_VUELTAS; i++) h = sha256_(sal + h);
  return h;
}
function generarClave_() {
  var abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  var u = uuid_().replace(/-/g, '');
  var s = '';
  for (var i = 0; i < 10; i++) s += abc.charAt(parseInt(u.substr(i * 2, 2), 16) % abc.length);
  return s;
}
function fijarClave_(clave) {
  var sal = uuid_().replace(/-/g, '');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CLAVE_SAL', sal);
  props.setProperty('CLAVE_HASH', derivar_(clave, sal));
}
function igualSeguro_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function revocarSesiones_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('SES_') === 0) props.deleteProperty(k); });
}

function login_(p) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('login:fallos') || 0);
  if (fallos >= LOGIN_MAX_FALLOS) throw appError_('LOCKED', 'Demasiados intentos fallidos. Espera 15 minutos.');
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty('CLAVE_HASH');
  if (!hash) throw appError_('NOT_INSTALLED', 'Ejecuta setup() en Apps Script antes de usar la app.');
  var clave = typeof p.clave === 'string' ? p.clave : '';
  if (!clave || clave.length > 200 || !igualSeguro_(derivar_(clave, props.getProperty('CLAVE_SAL') || ''), hash)) {
    cache.put('login:fallos', String(fallos + 1), LOGIN_BLOQUEO_SEG);
    throw appError_('UNAUTHORIZED', 'Clave incorrecta.');
  }
  cache.remove('login:fallos');
  // Limpieza de sesiones vencidas para no acumular propiedades.
  var now = ahora_().getTime();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('SES_') === 0) { try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); } }
  });
  var token = uuid_().replace(/-/g, '') + uuid_().replace(/-/g, '');
  var exp = now + SESION_DIAS * 86400000;
  props.setProperty('SES_' + sha256_(token), JSON.stringify({ exp: exp, creada: now, equipo: text_(p.equipo, 'Equipo', 120) }));
  return { sesion: token, vence: new Date(exp).toISOString() };
}

function verificarSesion_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw appError_('UNAUTHORIZED', 'Inicia sesión para continuar.');
  var raw = PropertiesService.getScriptProperties().getProperty('SES_' + sha256_(token));
  if (!raw) throw appError_('UNAUTHORIZED', 'Tu sesión terminó. Inicia sesión de nuevo.');
  var s;
  try { s = JSON.parse(raw); } catch (e) { throw appError_('UNAUTHORIZED', 'Sesión inválida.'); }
  if (!(s.exp > ahora_().getTime())) {
    PropertiesService.getScriptProperties().deleteProperty('SES_' + sha256_(token));
    throw appError_('UNAUTHORIZED', 'Tu sesión venció. Inicia sesión de nuevo.');
  }
  return s;
}

function logout_(p, token) {
  PropertiesService.getScriptProperties().deleteProperty('SES_' + sha256_(token));
  return { ok: true };
}
function logoutTodas_() { revocarSesiones_(); return { ok: true }; }
function cambiarClave_(p) {
  var props = PropertiesService.getScriptProperties();
  if (!igualSeguro_(derivar_(typeof p.actual === 'string' ? p.actual : '', props.getProperty('CLAVE_SAL') || ''), props.getProperty('CLAVE_HASH') || '')) {
    throw appError_('VALIDATION', 'La clave actual no es correcta.');
  }
  var nueva = typeof p.nueva === 'string' ? p.nueva : '';
  if (nueva.length < 8 || nueva.length > 100) throw appError_('VALIDATION', 'La nueva clave debe tener entre 8 y 100 caracteres.');
  fijarClave_(nueva);
  revocarSesiones_();
  return { ok: true };
}

/* ===================== HTTP ===================== */
function doGet() {
  return responder_(function () { return { app: 'Antojos & Tentaciones', version: APP_VERSION, hora: iso_(ahora_()) }; });
}

function doPost(e) {
  return responder_(function () {
    var body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || ''); } catch (err) { body = null; }
    if (!body || typeof body !== 'object') throw appError_('BAD_JSON', 'Cuerpo de la petición inválido.');
    return despachar_(String(body.action || ''), body.payload && typeof body.payload === 'object' ? body.payload : {}, body.sesion);
  });
}

function despachar_(action, payload, sesion) {
  if (PUBLICAS[action]) return PUBLICAS[action](payload);
  var fn = PRIVADAS[action];
  if (!fn) throw appError_('BAD_ACTION', 'Acción no válida.');
  verificarSesion_(sesion);
  if (LECTURA[action]) return fn(payload, sesion);
  return conLock_(function () {
    var r = fn(payload, sesion);
    if (INVALIDA[action]) INVALIDA[action].forEach(invalidar_);
    return r;
  });
}

function responder_(fn) {
  var started = Date.now();
  var out;
  try {
    out = { ok: true, data: fn() };
  } catch (err) {
    var msg = String(err.message || err);
    var code = err.appCode || (/too many times|quota|cuota/i.test(msg) ? 'QUOTA'
      : /timed out|tiempo/i.test(msg) ? 'TIMEOUT' : 'SERVER_ERROR');
    out = { ok: false, error: { code: code, message: err.appCode ? msg : 'Error del servidor: ' + msg } };
    if (err.extra) out.error.detalle = err.extra;
    if (!err.appCode) console.error(err.stack || err);
  }
  out.ms = Date.now() - started;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function conLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw appError_('BUSY', 'Hay otra operación en curso. Intenta de nuevo en unos segundos.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================== Caché por generación ===================== */
// Cada escritura cambia la "generación": una lectura lenta que empezó antes no puede dejar datos viejos vigentes.
var CACHE_TTL = 600;
var CHUNK = 90000;
function gen_(tipo) { return CacheService.getScriptCache().get('gen:' + tipo) || '0'; }
function invalidar_(tipo) { CacheService.getScriptCache().put('gen:' + tipo, uuid_(), 21600); }
function cacheLeer_(clave) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(clave + ':n'));
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(clave + ':' + i);
  var parts = cache.getAll(keys);
  var json = '';
  for (var j = 0; j < n; j++) { if (parts[keys[j]] == null) return null; json += parts[keys[j]]; }
  try { return JSON.parse(json); } catch (e) { return null; }
}
function cacheGuardar_(clave, data, tipo, gen) {
  try {
    if (gen_(tipo) !== gen) return;
    var json = JSON.stringify(data);
    var values = {};
    var n = Math.ceil(json.length / CHUNK);
    for (var i = 0; i < n; i++) values[clave + ':' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    var cache = CacheService.getScriptCache();
    cache.putAll(values, CACHE_TTL);
    cache.put(clave + ':n', String(n), CACHE_TTL);
  } catch (e) { console.warn('Sin caché: ' + e.message); }
}
function conCache_(tipo, nombre, fresh, fn) {
  var gen = gen_(tipo);
  var clave = tipo + ':' + gen + ':' + nombre;
  var c = fresh ? null : cacheLeer_(clave);
  if (c) return c;
  var data = fn();
  cacheGuardar_(clave, data, tipo, gen);
  return data;
}

/* ===================== Configuración y catálogo ===================== */
function configMapa_(ss) {
  var m = {};
  leer_(ss, 'CONFIG').objs.forEach(function (c) { m[c.clave] = c.valor; });
  return m;
}
function medios_(cfg) {
  return str_(cfg.medios_pago || 'Efectivo').split(',').map(str_).filter(function (x) { return x; });
}

function catalogo_(fresh) {
  return conCache_('cat', 'catalogo', fresh, function () {
    var ss = openSpreadsheet_(false);
    return {
      config: configMapa_(ss),
      categorias: leer_(ss, 'CATEGORIAS').objs.map(limpio_),
      productos: leer_(ss, 'PRODUCTOS').objs.map(limpio_),
      opciones: leer_(ss, 'OPCIONES').objs.map(limpio_)
    };
  });
}

function inicial_(p) {
  var cat = catalogo_(!!p.fresh);
  var ss = openSpreadsheet_(false);
  return {
    version: APP_VERSION,
    sheetUrl: ss.getUrl(),
    hoy: fechaLima_(ahora_()),
    config: cat.config,
    categorias: cat.categorias,
    productos: cat.productos,
    opciones: cat.opciones,
    caja: cajaActual_({})
  };
}

function saveConfig_(p) {
  var permitidas = {};
  CONFIG_INICIAL.forEach(function (c) { permitidas[c[0]] = c[2]; });
  var cambios = p.valores && typeof p.valores === 'object' ? p.valores : {};
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'CONFIG');
  var now = iso_(ahora_());
  var nuevos = [];
  Object.keys(cambios).forEach(function (k) {
    if (!(k in permitidas)) throw appError_('VALIDATION', 'Configuración desconocida: ' + k);
    var v = text_(cambios[k], k, 1000);
    if (k === 'whatsapp_numero' && v && !/^\d{9,15}$/.test(v)) throw appError_('VALIDATION', 'El número de WhatsApp debe tener solo dígitos, con código de país (ej. 51939968342).');
    if (k === 'delivery_modo') uno_(v, ['por_confirmar', 'tarifa_fija', 'no_disponible'], 'Modo de delivery');
    if (k === 'delivery_tarifa' && v) money_(v, 'Tarifa de delivery', true);
    if (/_(validado|disponible|activa)$/.test(k)) uno_(v, ['SI', 'NO'], k);
    if (k === 'medios_pago') {
      var ms = v.split(',').map(str_).filter(function (x) { return x; });
      if (ms.indexOf('Efectivo') < 0) throw appError_('VALIDATION', '"Efectivo" debe seguir en los medios de pago: es el dinero de la caja.');
    }
    var row = t.porId[k];
    if (row) { row.valor = v; row.actualizadoEn = now; guardar_(t, row); }
    else nuevos.push({ clave: k, valor: v, descripcion: permitidas[k], actualizadoEn: now });
  });
  agregar_(t, nuevos);
  return configMapa_(ss);
}

function saveCategoria_(p) {
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'CATEGORIAS');
  var id = id_(p.id, 'ID de categoría');
  var now = iso_(ahora_());
  var o = t.porId[id];
  var datos = { nombre: text_(p.nombre, 'Nombre', 60, true), descripcion: text_(p.descripcion, 'Descripción', 300),
    activo: p.activo !== false };
  if (o) { Object.keys(datos).forEach(function (k) { o[k] = datos[k]; }); o.actualizadoEn = now; guardar_(t, o); }
  else {
    o = { id: id, orden: t.objs.length + 1, creadoEn: now, actualizadoEn: now };
    Object.keys(datos).forEach(function (k) { o[k] = datos[k]; });
    agregar_(t, [o]);
  }
  return limpio_(o);
}

function saveProducto_(p) {
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'PRODUCTOS');
  var cats = leer_(ss, 'CATEGORIAS');
  var id = id_(p.id, 'ID de producto');
  var categoriaId = id_(p.categoriaId, 'Categoría');
  if (!cats.porId[categoriaId]) throw appError_('VALIDATION', 'La categoría no existe.');
  var foto = text_(p.fotoUrl, 'Foto', 500);
  if (foto && !/^https:\/\//.test(foto)) throw appError_('VALIDATION', 'La foto debe ser un enlace https.');
  var precio = moneyOpt_(p.precio, 'Precio');
  if (precio === 0) throw appError_('VALIDATION', 'El precio debe ser mayor a 0 o quedar vacío (por configurar).');
  var now = iso_(ahora_());
  var datos = {
    categoriaId: categoriaId, nombre: text_(p.nombre, 'Nombre', 80, true), descripcion: text_(p.descripcion, 'Descripción', 400),
    precio: precio, costo: moneyOpt_(p.costo, 'Costo estimado'), fotoUrl: foto, activo: p.activo !== false,
    agotado: !!p.agotado, destacado: !!p.destacado, esCombo: !!p.esCombo, incluye: text_(p.incluye, 'Incluye', 300),
    revisar: text_(p.revisar, 'Revisar', 300)
  };
  var o = t.porId[id];
  if (o) { Object.keys(datos).forEach(function (k) { o[k] = datos[k]; }); o.actualizadoEn = now; guardar_(t, o); }
  else {
    o = { id: id, orden: t.objs.length + 1, creadoEn: now, actualizadoEn: now };
    Object.keys(datos).forEach(function (k) { o[k] = datos[k]; });
    agregar_(t, [o]);
  }
  return limpio_(o);
}

// Cambios rápidos durante la atención (agotado, activo, destacado) sin reenviar todo el producto.
function marcarProducto_(p) {
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'PRODUCTOS');
  var o = t.porId[id_(p.id, 'ID de producto')];
  if (!o) throw appError_('NOT_FOUND', 'Producto no encontrado.');
  ['agotado', 'activo', 'destacado'].forEach(function (k) { if (typeof p[k] === 'boolean') o[k] = p[k]; });
  o.actualizadoEn = iso_(ahora_());
  guardar_(t, o);
  return limpio_(o);
}

function saveOpcion_(p) {
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'OPCIONES');
  var prods = leer_(ss, 'PRODUCTOS');
  var id = id_(p.id, 'ID de opción');
  var productoId = id_(p.productoId, 'Producto');
  if (!prods.porId[productoId]) throw appError_('VALIDATION', 'El producto no existe.');
  var tipo = uno_(p.tipo, ['variante', 'extra'], 'Tipo de opción');
  var now = iso_(ahora_());
  var datos = { productoId: productoId, tipo: tipo, nombre: text_(p.nombre, 'Nombre', 60, true),
    precio: money_(p.precio, 'Precio', tipo === 'extra'), activo: p.activo !== false };
  var o = t.porId[id];
  if (o) {
    if (o.productoId !== productoId || o.tipo !== tipo) throw appError_('VALIDATION', 'No se puede mover una opción a otro producto o tipo.');
    Object.keys(datos).forEach(function (k) { o[k] = datos[k]; }); o.actualizadoEn = now; guardar_(t, o);
  } else {
    o = { id: id, orden: t.objs.filter(function (x) { return x.productoId === productoId; }).length + 1, creadoEn: now, actualizadoEn: now };
    Object.keys(datos).forEach(function (k) { o[k] = datos[k]; });
    agregar_(t, [o]);
  }
  return limpio_(o);
}

function reordenar_(p) {
  var hoja = uno_(p.hoja, ['CATEGORIAS', 'PRODUCTOS', 'OPCIONES'], 'Tipo');
  if (!Array.isArray(p.ids) || p.ids.length > 500) throw appError_('VALIDATION', 'Lista de orden inválida.');
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, hoja);
  var now = iso_(ahora_());
  p.ids.forEach(function (id, i) {
    var o = t.porId[str_(id)];
    if (o && o.orden !== i + 1) { o.orden = i + 1; o.actualizadoEn = now; guardar_(t, o); }
  });
  return { ok: true };
}

// Sube una foto a una carpeta de Drive del negocio y la publica solo para ver (necesario para mostrarla en la carta).
function subirFoto_(p) {
  var productoId = id_(p.productoId, 'Producto');
  var mime = uno_(p.mime, ['image/jpeg', 'image/png', 'image/webp'], 'Formato de imagen');
  var b64 = str_(p.base64);
  if (!b64 || b64.length > 2800000) throw appError_('VALIDATION', 'La imagen supera 2 MB. Usa una foto más liviana.');
  var props = PropertiesService.getScriptProperties();
  var carpeta;
  var carpetaId = props.getProperty('FOTOS_CARPETA_ID');
  if (carpetaId) { try { carpeta = DriveApp.getFolderById(carpetaId); } catch (e) { carpeta = null; } }
  if (!carpeta) { carpeta = DriveApp.createFolder('Antojos & Tentaciones - Fotos'); props.setProperty('FOTOS_CARPETA_ID', carpeta.getId()); }
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, productoId + '-' + Date.now());
  var file = carpeta.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var url = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w900';
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'PRODUCTOS');
  var o = t.porId[productoId];
  if (!o) throw appError_('NOT_FOUND', 'Producto no encontrado.');
  o.fotoUrl = url;
  o.actualizadoEn = iso_(ahora_());
  guardar_(t, o);
  return limpio_(o);
}

/* ===================== Cálculo de pedidos (desde el catálogo, nunca desde el navegador) ===================== */
function fmt_(n) { return 'S/ ' + (Math.round(n * 100) / 100).toFixed(2); }

/**
 * Valida y calcula las líneas con los precios actuales del catálogo. Devuelve importes en céntimos.
 * Bloquea productos inactivos, agotados, sin precio (por configurar) o con variantes/extras inválidos.
 */
function calcularLineas_(lineas, cat) {
  if (!Array.isArray(lineas) || !lineas.length) throw appError_('VALIDATION', 'Agrega al menos un producto.');
  if (lineas.length > MAX_LINEAS) throw appError_('VALIDATION', 'Máximo ' + MAX_LINEAS + ' líneas por pedido.');
  var prods = {}, cats = {}, ops = {};
  cat.productos.forEach(function (x) { prods[x.id] = x; });
  cat.categorias.forEach(function (x) { cats[x.id] = x; });
  cat.opciones.forEach(function (x) { ops[x.id] = x; });
  var problemas = [];
  var out = lineas.map(function (l, i) {
    var prod = prods[str_(l.productoId)];
    if (!prod) throw appError_('VALIDATION', 'Producto no encontrado en la línea ' + (i + 1) + '.');
    var cantidad = Number(l.cantidad);
    if (!(cantidad >= 1 && cantidad <= MAX_CANTIDAD && Math.floor(cantidad) === cantidad)) throw appError_('VALIDATION', 'Cantidad inválida para ' + prod.nombre + '.');
    var categoria = cats[prod.categoriaId];
    if (!prod.activo || (categoria && !categoria.activo)) problemas.push({ productoId: prod.id, motivo: 'no_disponible', mensaje: prod.nombre + ' ya no está disponible.' });
    if (prod.agotado) problemas.push({ productoId: prod.id, motivo: 'agotado', mensaje: prod.nombre + ' está agotado.' });
    var variantes = cat.opciones.filter(function (o) { return o.productoId === prod.id && o.tipo === 'variante' && o.activo; });
    var base = null, varianteId = '', varianteNombre = '';
    if (str_(l.varianteId)) {
      var v = ops[str_(l.varianteId)];
      if (!v || v.productoId !== prod.id || v.tipo !== 'variante') throw appError_('VALIDATION', 'Variante inválida para ' + prod.nombre + '.');
      if (!v.activo) problemas.push({ productoId: prod.id, motivo: 'variante', mensaje: 'La opción "' + v.nombre + '" de ' + prod.nombre + ' ya no está disponible.' });
      base = v.precio; varianteId = v.id; varianteNombre = v.nombre;
    } else if (variantes.length) {
      problemas.push({ productoId: prod.id, motivo: 'variante_requerida', mensaje: 'Elige una opción para ' + prod.nombre + '.' });
    } else {
      base = prod.precio;
    }
    if (!varianteId && !variantes.length && (base === null || !(base > 0))) {
      problemas.push({ productoId: prod.id, motivo: 'sin_precio', mensaje: prod.nombre + ' tiene el precio por configurar.' });
    }
    var extrasIds = Array.isArray(l.extras) ? l.extras.map(str_) : [];
    if (extrasIds.length > 10) throw appError_('VALIDATION', 'Demasiados extras en ' + prod.nombre + '.');
    var vistos = {};
    var extras = extrasIds.map(function (eid) {
      var e = ops[eid];
      if (!e || e.productoId !== prod.id || e.tipo !== 'extra' || vistos[eid]) throw appError_('VALIDATION', 'Extra inválido para ' + prod.nombre + '.');
      vistos[eid] = true;
      if (!e.activo) problemas.push({ productoId: prod.id, motivo: 'extra', mensaje: 'El extra "' + e.nombre + '" ya no está disponible.' });
      return e;
    });
    var baseC = cents_(base || 0);
    var extrasC = extras.reduce(function (s, e) { return s + cents_(e.precio); }, 0);
    var unit = baseC + extrasC;
    return {
      productoId: prod.id, producto: prod.nombre, categoriaId: prod.categoriaId, categoria: categoria ? categoria.nombre : '',
      varianteId: varianteId, variante: varianteNombre, precioBase: soles_(baseC), extrasIds: extras.map(function (e) { return e.id; }).join(','),
      extras: extras.map(function (e) { return e.nombre + (e.precio ? ' (+' + fmt_(e.precio) + ')' : ''); }).join('; '),
      extrasTotal: soles_(extrasC), precioUnitario: soles_(unit), cantidad: cantidad, importeC: unit * cantidad,
      importe: soles_(unit * cantidad), costoUnitario: prod.costo, nota: text_(l.nota, 'Nota de ' + prod.nombre, 200)
    };
  });
  if (problemas.length) throw appError_('NO_DISPONIBLE', problemas.map(function (x) { return x.mensaje; }).join(' '), { problemas: problemas });
  return out;
}

function codigoPedido_(d) {
  var dia = Utilities.formatDate(d, TZ, 'MMdd');
  var props = PropertiesService.getScriptProperties();
  var k = 'COD_' + Utilities.formatDate(d, TZ, 'yyyyMMdd');
  var n = Number(props.getProperty(k) || 0) + 1;
  props.setProperty(k, String(n));
  return dia + '-' + ('00' + n).slice(-3);
}

function estadoPago_(estado, totalC, pagadoC, devueltoC) {
  var neto = pagadoC - devueltoC;
  if (estado === 'cancelado') return neto > 0 ? 'devolucion_pendiente' : (devueltoC > 0 ? 'devuelto' : 'sin_cobro');
  if (neto <= 0) return 'pendiente';
  return neto < totalC ? 'parcial' : 'pagado';
}

/* ===================== Operaciones de varias hojas ===================== */
// Cada operación se describe como un plan de filas por hoja con IDs deterministas. Ejecutar el plan es idempotente:
// solo agrega lo que falta. El pedido guarda el plan mientras está "incompleto" para poder terminarlo después.
function ejecutarPlan_(ss, plan) {
  var orden = ['DETALLE_PEDIDOS', 'PAGOS', 'MOVIMIENTOS_CAJA', 'HISTORIAL_ESTADOS'];
  orden.forEach(function (hoja) {
    if (!plan[hoja] || !plan[hoja].length) return;
    var t = leer_(ss, hoja);
    agregar_(t, plan[hoja].filter(function (o) { return !t.porId[o.id]; }));
    puntoControl_(hoja);
  });
}

function cajaAbierta_(ss) {
  var abiertas = leer_(ss, 'CAJAS').objs.filter(function (c) { return c.estado === 'abierta'; });
  return abiertas.length ? abiertas[abiertas.length - 1] : null;
}

function movimientoDePago_(pago, caja) {
  if (!caja) return null;
  return { id: 'mov_' + pago.id, cajaId: caja.id, fechaHora: pago.fechaHora, tipo: pago.tipo === 'pago' ? 'cobro' : 'devolucion',
    medio: pago.medio, sentido: pago.tipo === 'pago' ? 'ingreso' : 'egreso', monto: pago.monto, referencia: 'pago',
    referenciaId: pago.id, nota: 'Pedido ' + pago.codigo, estado: 'activo', creadoEn: pago.creadoEn };
}

function crearPedido_(p, origen) {
  var clave = clave_(p.clave);
  var id = 'ped_' + clave;
  var ss = openSpreadsheet_(false);
  var pedidos = leer_(ss, 'PEDIDOS');
  var existente = pedidos.porId[id];
  if (existente) {
    if (existente.integridad !== 'completo') completarPedido_(ss, pedidos, existente);
    return Object.assign(resumenPedido_(existente), { duplicado: true });
  }

  var cat = catalogo_(true);
  var cfg = cat.config;
  var canal = uno_(str_(p.canal) || 'local', CANALES, 'Tipo de atención');
  var lineas = calcularLineas_(p.lineas, cat);
  var subtotalC = lineas.reduce(function (s, l) { return s + l.importeC; }, 0);

  var datos = {
    cliente: text_(p.cliente, 'Nombre del cliente', 80, origen === 'carta'),
    telefono: text_(p.telefono, 'Teléfono', 20),
    direccion: text_(p.direccion, 'Dirección', 200, canal === 'delivery'),
    referencia: text_(p.referencia, 'Referencia', 200),
    nota: text_(p.nota, 'Nota', 300)
  };
  if (datos.telefono && !/^[0-9 +()-]{6,20}$/.test(datos.telefono)) throw appError_('VALIDATION', 'Teléfono inválido.');

  var deliveryC = 0, deliveryEstado = 'no_aplica';
  if (canal === 'delivery') {
    if (origen === 'carta') {
      if (cfg.delivery_modo === 'no_disponible') throw appError_('VALIDATION', 'El delivery no está disponible por ahora.');
      if (cfg.delivery_modo === 'tarifa_fija' && str_(cfg.delivery_tarifa) !== '') { deliveryC = cents_(cfg.delivery_tarifa); deliveryEstado = 'definido'; }
      else deliveryEstado = 'por_confirmar';
    } else if (p.delivery === null || p.delivery === undefined || p.delivery === '') {
      deliveryEstado = 'por_confirmar';
    } else { deliveryC = cents_(money_(p.delivery, 'Costo de delivery', true)); deliveryEstado = 'definido'; }
  } else if (canal === 'recojo' && origen === 'carta' && cfg.recojo_disponible === 'NO') {
    throw appError_('VALIDATION', 'El recojo no está disponible por ahora.');
  }
  var totalC = subtotalC + deliveryC;

  // El navegador envía el total que mostró: si el catálogo cambió mientras se armaba el pedido, se avisa.
  if (p.totalEsperado !== undefined && p.totalEsperado !== null && cents_(p.totalEsperado) !== totalC) {
    throw appError_('PRECIO_CAMBIO', 'Los precios cambiaron: el total ahora es ' + fmt_(soles_(totalC)) + '. Revisa el pedido.',
      { lineas: lineas.map(function (l) { return { productoId: l.productoId, varianteId: l.varianteId, precioUnitario: l.precioUnitario, importe: l.importe }; }), total: soles_(totalC) });
  }

  var estado = origen === 'carta' ? 'pendiente' : uno_(str_(p.estado) || 'confirmado', ['pendiente', 'confirmado', 'preparando', 'listo', 'entregado'], 'Estado inicial');
  if (ESTADOS_VENTA[estado] && deliveryEstado === 'por_confirmar') {
    throw appError_('VALIDATION', 'Define el costo de delivery (puede ser 0) para confirmar el pedido, o guárdalo como pendiente.');
  }

  var d = ahora_();
  var now = iso_(d);
  var hoy = fechaLima_(d);
  var codigo = codigoPedido_(d);
  var pedido = {
    id: id, codigo: codigo, fecha: hoy, origen: origen, canal: canal, estado: estado, estadoPago: 'pendiente',
    cliente: datos.cliente, telefono: datos.telefono, direccion: canal === 'delivery' ? datos.direccion : '',
    referencia: canal === 'delivery' ? datos.referencia : '', nota: datos.nota,
    subtotal: soles_(subtotalC), delivery: deliveryEstado === 'definido' ? soles_(deliveryC) : null, deliveryEstado: deliveryEstado,
    total: soles_(totalC), pagado: 0, devuelto: 0, devolucion: '', lineas: lineas.length, integridad: 'incompleto', clave: clave,
    confirmadoEn: ESTADOS_VENTA[estado] ? now : '', entregadoEn: estado === 'entregado' ? now : '', canceladoEn: '',
    motivoCancelacion: '', creadoEn: now, actualizadoEn: now
  };

  var plan = { DETALLE_PEDIDOS: [], PAGOS: [], MOVIMIENTOS_CAJA: [], HISTORIAL_ESTADOS: [] };
  lineas.forEach(function (l, i) {
    plan.DETALLE_PEDIDOS.push({ id: id + '-L' + (i + 1), pedidoId: id, linea: i + 1, productoId: l.productoId, producto: l.producto,
      categoriaId: l.categoriaId, categoria: l.categoria, varianteId: l.varianteId, variante: l.variante, precioBase: l.precioBase,
      extrasIds: l.extrasIds, extras: l.extras, extrasTotal: l.extrasTotal, precioUnitario: l.precioUnitario, cantidad: l.cantidad,
      importe: l.importe, costoUnitario: l.costoUnitario, nota: l.nota, creadoEn: now });
  });
  plan.HISTORIAL_ESTADOS.push({ id: 'his_' + clave + '-0', pedidoId: id, tipo: 'pedido', de: '', a: estado, fechaHora: now,
    nota: origen === 'carta' ? 'Solicitud desde la carta' : 'Registrado en el panel' });

  if (origen === 'panel' && p.pago && p.pago.monto !== undefined && p.pago.monto !== null && p.pago.monto !== '' && Number(p.pago.monto) > 0) {
    var montoC = cents_(money_(p.pago.monto, 'Monto pagado'));
    if (montoC > totalC) throw appError_('VALIDATION', 'El pago no puede superar el total (' + fmt_(soles_(totalC)) + ').');
    var medio = uno_(str_(p.pago.medio), medios_(cfg), 'Medio de pago');
    var caja = cajaAbierta_(ss);
    var pago = { id: 'pag_' + clave + '-0', pedidoId: id, codigo: codigo, tipo: 'pago', medio: medio, monto: soles_(montoC),
      fecha: hoy, fechaHora: now, cajaId: caja ? caja.id : '', nota: '', estado: 'activo', clave: clave, creadoEn: now, actualizadoEn: now };
    plan.PAGOS.push(pago);
    var mov = movimientoDePago_(pago, caja);
    if (mov) plan.MOVIMIENTOS_CAJA.push(mov);
    pedido.pagado = pago.monto;
  }
  pedido.estadoPago = estadoPago_(estado, totalC, cents_(pedido.pagado), 0);
  pedido.pendiente = plan;

  agregar_(pedidos, [pedido]);
  puntoControl_('PEDIDOS');
  completarPedido_(ss, pedidos, pedido);
  return resumenPedido_(pedido);
}

function completarPedido_(ss, pedidos, pedido) {
  var plan = pedido.pendiente;
  if (typeof plan === 'string') { try { plan = JSON.parse(plan); } catch (e) { plan = null; } }
  if (!plan) throw appError_('INCOMPLETO', 'El pedido ' + pedido.codigo + ' quedó incompleto y no tiene datos para repararlo. Revísalo en la hoja.');
  ejecutarPlan_(ss, plan);
  pedido.integridad = 'completo';
  pedido.pendiente = '';
  guardar_(pedidos, pedido);
}

function resumenPedido_(o) {
  return { id: o.id, codigo: o.codigo, estado: o.estado, estadoPago: o.estadoPago, total: o.total, subtotal: o.subtotal,
    delivery: o.delivery, deliveryEstado: o.deliveryEstado, fecha: o.fecha, creadoEn: o.creadoEn };
}

/** Termina las operaciones que quedaron a medias (pedidos incompletos) usando el plan que guardaron. */
function reparar_() {
  var ss = openSpreadsheet_(false);
  var pedidos = leer_(ss, 'PEDIDOS');
  var reparados = [], fallidos = [];
  pedidos.objs.filter(function (o) { return o.integridad !== 'completo'; }).forEach(function (o) {
    try { completarPedido_(ss, pedidos, o); reparados.push(o.codigo); }
    catch (e) { fallidos.push({ codigo: o.codigo, error: String(e.message || e) }); }
  });
  // Pedidos con montos guardados distintos de sus pagos (por ejemplo, un fallo justo después de registrar un pago).
  var pagos = leer_(ss, 'PAGOS').objs;
  var recalculados = 0;
  pedidos.objs.forEach(function (o) {
    if (o.integridad !== 'completo') return;
    if (recalcularPedido_(pedidos, o, pagos)) recalculados++;
  });
  return { reparados: reparados, fallidos: fallidos, recalculados: recalculados };
}

function sumasPagos_(pedidoId, pagos) {
  var pag = 0, dev = 0;
  pagos.forEach(function (x) {
    if (x.pedidoId !== pedidoId || x.estado !== 'activo') return;
    if (x.tipo === 'pago') pag += cents_(x.monto); else dev += cents_(x.monto);
  });
  return { pagado: pag, devuelto: dev };
}

function recalcularPedido_(pedidos, o, pagos) {
  var s = sumasPagos_(o.id, pagos);
  var ep = estadoPago_(o.estado, cents_(o.total), s.pagado, s.devuelto);
  var dev = o.estado === 'cancelado' ? (s.pagado - s.devuelto > 0 ? 'pendiente' : (s.devuelto > 0 ? 'devuelto' : '')) : '';
  if (cents_(o.pagado) === s.pagado && cents_(o.devuelto) === s.devuelto && o.estadoPago === ep && o.devolucion === dev) return false;
  o.pagado = soles_(s.pagado);
  o.devuelto = soles_(s.devuelto);
  o.estadoPago = ep;
  o.devolucion = dev;
  o.actualizadoEn = iso_(ahora_());
  guardar_(pedidos, o);
  return true;
}

function pedidoCompleto_(ss, pedidos, id) {
  var o = pedidos.porId[id_(id, 'ID de pedido')];
  if (!o) throw appError_('NOT_FOUND', 'Pedido no encontrado.');
  if (o.integridad !== 'completo') completarPedido_(ss, pedidos, o);
  return o;
}

/* ===================== Estados, pagos, cancelación ===================== */
function cambiarEstado_(p) {
  var ss = openSpreadsheet_(false);
  var pedidos = leer_(ss, 'PEDIDOS');
  var o = pedidoCompleto_(ss, pedidos, p.pedidoId);
  var a = uno_(str_(p.estado), ESTADOS, 'Estado');
  if (a === 'cancelado') throw appError_('VALIDATION', 'Usa "Cancelar pedido" para cancelar.');
  if (o.estado === a) return Object.assign(resumenPedido_(o), { sinCambios: true }); // doble clic: ya está en ese estado
  if (TRANSICIONES[o.estado].indexOf(a) < 0) throw appError_('TRANSICION', 'No se puede pasar de "' + o.estado + '" a "' + a + '".');
  if (ESTADOS_VENTA[a] && o.deliveryEstado === 'por_confirmar') throw appError_('VALIDATION', 'Define primero el costo de delivery (puede ser 0).');
  var now = iso_(ahora_());
  var de = o.estado;
  o.estado = a;
  if (ESTADOS_VENTA[a] && !o.confirmadoEn) o.confirmadoEn = now;
  if (a === 'entregado') o.entregadoEn = now;
  o.estadoPago = estadoPago_(a, cents_(o.total), cents_(o.pagado), cents_(o.devuelto));
  o.actualizadoEn = now;
  guardar_(pedidos, o);
  var hist = leer_(ss, 'HISTORIAL_ESTADOS');
  agregar_(hist, [{ id: 'his_' + uuid_(), pedidoId: o.id, tipo: 'pedido', de: de, a: a, fechaHora: now, nota: text_(p.nota, 'Nota', 200) }]);
  return resumenPedido_(o);
}

function definirDelivery_(p) {
  var ss = openSpreadsheet_(false);
  var pedidos = leer_(ss, 'PEDIDOS');
  var o = pedidoCompleto_(ss, pedidos, p.pedidoId);
  if (o.canal !== 'delivery') throw appError_('VALIDATION', 'El pedido no es delivery.');
  if (o.estado === 'entregado' || o.estado === 'cancelado') throw appError_('VALIDATION', 'El pedido ya está cerrado.');
  var montoC = cents_(money_(p.monto, 'Costo de delivery', true));
  var pagos = leer_(ss, 'PAGOS').objs;
  var s = sumasPagos_(o.id, pagos);
  var totalC = cents_(o.subtotal) + montoC;
  if (s.pagado - s.devuelto > totalC) throw appError_('VALIDATION', 'Lo ya pagado supera el nuevo total.');
  var antes = o.deliveryEstado === 'definido' ? fmt_(o.delivery) : 'por confirmar';
  o.delivery = soles_(montoC);
  o.deliveryEstado = 'definido';
  o.total = soles_(totalC);
  o.estadoPago = estadoPago_(o.estado, totalC, s.pagado, s.devuelto);
  o.actualizadoEn = iso_(ahora_());
  guardar_(pedidos, o);
  agregar_(leer_(ss, 'HISTORIAL_ESTADOS'), [{ id: 'his_' + uuid_(), pedidoId: o.id, tipo: 'delivery', de: antes, a: fmt_(o.delivery),
    fechaHora: o.actualizadoEn, nota: '' }]);
  return resumenPedido_(o);
}

function registrarPago_(p) {
  var clave = clave_(p.clave);
  var id = 'pag_' + clave;
  var ss = openSpreadsheet_(false);
  var pedidos = leer_(ss, 'PEDIDOS');
  var o = pedidoCompleto_(ss, pedidos, p.pedidoId);
  var pagosT = leer_(ss, 'PAGOS');
  var pago = pagosT.porId[id];
  if (!pago) {
    if (o.estado === 'cancelado') throw appError_('VALIDATION', 'El pedido está cancelado: no admite cobros.');
    var s = sumasPagos_(o.id, pagosT.objs);
    var saldoC = cents_(o.total) - (s.pagado - s.devuelto);
    var montoC = cents_(money_(p.monto, 'Monto'));
    if (montoC > saldoC) throw appError_('VALIDATION', saldoC > 0 ? 'El monto supera el saldo pendiente (' + fmt_(soles_(saldoC)) + ').' : 'El pedido ya está pagado.');
    var cfg = configMapa_(ss);
    var d = ahora_();
    var caja = cajaAbierta_(ss);
    pago = { id: id, pedidoId: o.id, codigo: o.codigo, tipo: 'pago', medio: uno_(str_(p.medio), medios_(cfg), 'Medio de pago'),
      monto: soles_(montoC), fecha: fechaLima_(d), fechaHora: iso_(d), cajaId: caja ? caja.id : '', nota: text_(p.nota, 'Nota', 200),
      estado: 'activo', clave: clave, creadoEn: iso_(d), actualizadoEn: iso_(d) };
    agregar_(pagosT, [pago]);
    puntoControl_('PAGO');
  }
  asegurarMovimientoDePago_(ss, pago);
  recalcularPedido_(pedidos, o, pagosT.objs);
  return { pago: limpio_(pago), pedido: resumenPedido_(o) };
}

function asegurarMovimientoDePago_(ss, pago) {
  if (!pago.cajaId) return;
  var movs = leer_(ss, 'MOVIMIENTOS_CAJA');
  if (movs.porId['mov_' + pago.id]) return;
  var caja = leer_(ss, 'CAJAS').porId[pago.cajaId];
  // Solo se completa en una caja aún abierta: una caja cerrada no se modifica (el cobro queda visible en Pagos).
  if (caja && caja.estado === 'abierta') agregar_(movs, [movimientoDePago_(pago, caja)]);
}

function anularPago_(p) {
  var ss = openSpreadsheet_(false);
  var pagosT = leer_(ss, 'PAGOS');
  var pago = pagosT.porId[id_(p.pagoId, 'Pago')];
  if (!pago) throw appError_('NOT_FOUND', 'Pago no encontrado.');
  var motivo = text_(p.motivo, 'Motivo', 200, true);
  var pedidos = leer_(ss, 'PEDIDOS');
  var o = pedidoCompleto_(ss, pedidos, pago.pedidoId);
  if (pago.estado !== 'anulado') {
    if (pago.cajaId) {
      var caja = leer_(ss, 'CAJAS').porId[pago.cajaId];
      if (caja && caja.estado === 'cerrada') throw appError_('VALIDATION', 'La caja de ese pago ya está cerrada. Registra el ajuste en la caja actual.');
    }
    pago.estado = 'anulado';
    pago.nota = (pago.nota ? pago.nota + ' · ' : '') + 'Anulado: ' + motivo;
    pago.actualizadoEn = iso_(ahora_());
    guardar_(pagosT, pago);
  }
  var movs = leer_(ss, 'MOVIMIENTOS_CAJA');
  var mov = movs.porId['mov_' + pago.id];
  if (mov && mov.estado !== 'anulado') { mov.estado = 'anulado'; guardar_(movs, mov); }
  recalcularPedido_(pedidos, o, pagosT.objs);
  agregar_(leer_(ss, 'HISTORIAL_ESTADOS'), [{ id: 'his_' + uuid_(), pedidoId: o.id, tipo: 'pago', de: fmt_(pago.monto) + ' ' + pago.medio,
    a: 'anulado', fechaHora: iso_(ahora_()), nota: motivo }]);
  return { pedido: resumenPedido_(o) };
}

/**
 * Cancela sin borrar. Si había dinero cobrado, la dueña elige: queda "pendiente de devolución" o se registra
 * la devolución ahora (con su medio). Nunca se asume que se devolvió.
 */
function cancelarPedido_(p) {
  var ss = openSpreadsheet_(false);
  var pedidos = leer_(ss, 'PEDIDOS');
  var o = pedidoCompleto_(ss, pedidos, p.pedidoId);
  var pagosT = leer_(ss, 'PAGOS');
  var s = sumasPagos_(o.id, pagosT.objs);
  var netoC = s.pagado - s.devuelto;
  var tratamiento = netoC > 0 && (o.estado !== 'cancelado' || str_(p.devolucion))
    ? uno_(str_(p.devolucion), ['pendiente', 'devuelto'], 'Tratamiento del dinero cobrado') : '';
  var yaDevuelto = p.clave && CLAVE_RE.test(str_(p.clave)) && pagosT.porId['dev_' + str_(p.clave).toLowerCase()];
  if (o.estado !== 'cancelado') {
    if (TRANSICIONES[o.estado].indexOf('cancelado') < 0) throw appError_('TRANSICION', 'Un pedido entregado no se puede cancelar.');
    var motivo = text_(p.motivo, 'Motivo', 200, true);
    var now = iso_(ahora_());
    var de = o.estado;
    o.estado = 'cancelado';
    o.canceladoEn = now;
    o.motivoCancelacion = motivo;
    o.estadoPago = estadoPago_('cancelado', cents_(o.total), s.pagado, s.devuelto);
    o.devolucion = netoC > 0 ? 'pendiente' : '';
    o.actualizadoEn = now;
    guardar_(pedidos, o);
    agregar_(leer_(ss, 'HISTORIAL_ESTADOS'), [{ id: 'his_' + uuid_(), pedidoId: o.id, tipo: 'pedido', de: de, a: 'cancelado', fechaHora: now, nota: motivo }]);
    puntoControl_('CANCELAR');
  }
  // También en un reintento: si se pidió devolver ahora y aún falta, se completa (la clave evita duplicarla).
  if (tratamiento === 'devuelto' || yaDevuelto) {
    return registrarDevolucion_({ pedidoId: o.id, medio: p.medioDevolucion, clave: p.clave }, ss, pedidos, pagosT);
  }
  return { pedido: resumenPedido_(o) };
}

function registrarDevolucion_(p, ss, pedidos, pagosT) {
  ss = ss || openSpreadsheet_(false);
  pedidos = pedidos || leer_(ss, 'PEDIDOS');
  pagosT = pagosT || leer_(ss, 'PAGOS');
  var clave = clave_(p.clave);
  var o = pedidoCompleto_(ss, pedidos, p.pedidoId);
  var id = 'dev_' + clave;
  var dev = pagosT.porId[id];
  if (!dev) {
    if (o.estado !== 'cancelado') throw appError_('VALIDATION', 'Solo se registran devoluciones de pedidos cancelados.');
    var s = sumasPagos_(o.id, pagosT.objs);
    var netoC = s.pagado - s.devuelto;
    if (netoC <= 0) throw appError_('VALIDATION', 'No hay dinero pendiente de devolver.');
    var cfg = configMapa_(ss);
    var d = ahora_();
    var caja = cajaAbierta_(ss);
    dev = { id: id, pedidoId: o.id, codigo: o.codigo, tipo: 'devolucion', medio: uno_(str_(p.medio), medios_(cfg), 'Medio de devolución'),
      monto: soles_(netoC), fecha: fechaLima_(d), fechaHora: iso_(d), cajaId: caja ? caja.id : '', nota: text_(p.nota, 'Nota', 200),
      estado: 'activo', clave: clave, creadoEn: iso_(d), actualizadoEn: iso_(d) };
    agregar_(pagosT, [dev]);
    puntoControl_('DEVOLUCION');
  }
  asegurarMovimientoDePago_(ss, dev);
  recalcularPedido_(pedidos, o, pagosT.objs);
  return { pedido: resumenPedido_(o), devolucion: limpio_(dev) };
}

/* ===================== Gastos ===================== */
function crearGasto_(p) {
  var clave = clave_(p.clave);
  var id = 'gas_' + clave;
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'GASTOS');
  var g = t.porId[id];
  if (!g) {
    var cfg = configMapa_(ss);
    var cats = str_(cfg.categorias_gasto).split(',').map(str_).filter(function (x) { return x; });
    var desdeCaja = !!p.desdeCaja;
    var caja = desdeCaja ? cajaAbierta_(ss) : null;
    if (desdeCaja && !caja) throw appError_('SIN_CAJA', 'No hay una caja abierta. Abre la caja o desmarca "Pagado desde caja".');
    var d = ahora_();
    g = { id: id, fecha: fecha_(p.fecha || fechaLima_(d)), categoria: uno_(str_(p.categoria), cats, 'Categoría de gasto'),
      tipo: uno_(str_(p.tipo) || 'operativo', TIPOS_GASTO, 'Tipo de gasto'), descripcion: text_(p.descripcion, 'Descripción', 200),
      monto: money_(p.monto, 'Monto'), medio: uno_(str_(p.medio), medios_(cfg), 'Medio de pago'), desdeCaja: desdeCaja,
      cajaId: caja ? caja.id : '', comprobante: text_(p.comprobante, 'Comprobante', 300), estado: 'activo', clave: clave,
      creadoEn: iso_(d), actualizadoEn: iso_(d) };
    agregar_(t, [g]);
    puntoControl_('GASTO');
  }
  if (g.desdeCaja && g.cajaId) {
    var movs = leer_(ss, 'MOVIMIENTOS_CAJA');
    if (!movs.porId['mov_' + g.id]) {
      agregar_(movs, [{ id: 'mov_' + g.id, cajaId: g.cajaId, fechaHora: g.creadoEn, tipo: 'gasto', medio: g.medio, sentido: 'egreso',
        monto: g.monto, referencia: 'gasto', referenciaId: g.id, nota: g.categoria + (g.descripcion ? ': ' + g.descripcion : ''),
        estado: 'activo', creadoEn: g.creadoEn }]);
    }
  }
  return limpio_(g);
}

function anularGasto_(p) {
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'GASTOS');
  var g = t.porId[id_(p.id, 'Gasto')];
  if (!g) throw appError_('NOT_FOUND', 'Gasto no encontrado.');
  var motivo = text_(p.motivo, 'Motivo', 200, true);
  if (g.cajaId) {
    var caja = leer_(ss, 'CAJAS').porId[g.cajaId];
    if (caja && caja.estado === 'cerrada') throw appError_('VALIDATION', 'La caja de ese gasto ya está cerrada: no se puede anular.');
  }
  if (g.estado !== 'anulado') {
    g.estado = 'anulado';
    g.descripcion = (g.descripcion ? g.descripcion + ' · ' : '') + 'Anulado: ' + motivo;
    g.actualizadoEn = iso_(ahora_());
    guardar_(t, g);
  }
  var movs = leer_(ss, 'MOVIMIENTOS_CAJA');
  var mov = movs.porId['mov_' + g.id];
  if (mov && mov.estado !== 'anulado') { mov.estado = 'anulado'; guardar_(movs, mov); }
  return limpio_(g);
}

/* ===================== Caja ===================== */
function abrirCaja_(p) {
  var clave = clave_(p.clave);
  var id = 'caj_' + clave;
  var ss = openSpreadsheet_(false);
  var t = leer_(ss, 'CAJAS');
  if (t.porId[id]) return cajaActual_({ id: id }, ss);
  var abierta = t.objs.filter(function (c) { return c.estado === 'abierta'; })[0];
  if (abierta) throw appError_('CAJA_ABIERTA', 'Ya hay una caja abierta. Ciérrala antes de abrir otra.');
  var d = ahora_();
  agregar_(t, [{ id: id, fecha: fechaLima_(d), estado: 'abierta', fondo: money_(p.fondo, 'Fondo inicial', true), abiertaEn: iso_(d),
    cerradaEn: '', esperado: null, contado: null, diferencia: null, observacion: text_(p.observacion, 'Observación', 300),
    resumen: '', actualizadoEn: iso_(d) }]);
  return cajaActual_({ id: id }, ss);
}

function movimientoCaja_(p) {
  var clave = clave_(p.clave);
  var id = 'mov_' + clave;
  var ss = openSpreadsheet_(false);
  var movs = leer_(ss, 'MOVIMIENTOS_CAJA');
  if (!movs.porId[id]) {
    var caja = cajaAbierta_(ss);
    if (!caja) throw appError_('SIN_CAJA', 'No hay una caja abierta.');
    var tipo = uno_(str_(p.tipo), ['retiro', 'aporte'], 'Tipo de movimiento');
    var cfg = configMapa_(ss);
    var d = ahora_();
    agregar_(movs, [{ id: id, cajaId: caja.id, fechaHora: iso_(d), tipo: tipo, medio: uno_(str_(p.medio) || 'Efectivo', medios_(cfg), 'Medio'),
      sentido: tipo === 'aporte' ? 'ingreso' : 'egreso', monto: money_(p.monto, 'Monto'), referencia: 'duena', referenciaId: '',
      nota: text_(p.nota, 'Nota', 200), estado: 'activo', creadoEn: iso_(d) }]);
  }
  return cajaActual_({}, ss);
}

function anularMovimiento_(p) {
  var ss = openSpreadsheet_(false);
  var movs = leer_(ss, 'MOVIMIENTOS_CAJA');
  var m = movs.porId[id_(p.id, 'Movimiento')];
  if (!m) throw appError_('NOT_FOUND', 'Movimiento no encontrado.');
  if (m.referencia !== 'duena') throw appError_('VALIDATION', 'Este movimiento viene de un pago o gasto: anúlalo desde allí.');
  var caja = leer_(ss, 'CAJAS').porId[m.cajaId];
  if (!caja || caja.estado !== 'abierta') throw appError_('VALIDATION', 'La caja ya está cerrada.');
  if (m.estado !== 'anulado') { m.estado = 'anulado'; m.nota = (m.nota ? m.nota + ' · ' : '') + 'Anulado: ' + text_(p.motivo, 'Motivo', 200, true); guardar_(movs, m); }
  return cajaActual_({}, ss);
}

/**
 * Resumen de una caja calculado solo con sus movimientos activos: cada cobro, devolución o gasto desde caja
 * tiene exactamente un movimiento, así nada se descuenta dos veces.
 * Efectivo esperado = fondo + entradas en efectivo − salidas en efectivo.
 */
function resumenCaja_(caja, movs) {
  var porMedio = {};
  var porTipo = { cobro: 0, devolucion: 0, gasto: 0, retiro: 0, aporte: 0 };
  movs.forEach(function (m) {
    if (m.estado !== 'activo') return;
    var c = cents_(m.monto) * (m.sentido === 'ingreso' ? 1 : -1);
    var x = porMedio[m.medio] || (porMedio[m.medio] = { medio: m.medio, cobros: 0, devoluciones: 0, gastos: 0, retiros: 0, aportes: 0, neto: 0 });
    var k = { cobro: 'cobros', devolucion: 'devoluciones', gasto: 'gastos', retiro: 'retiros', aporte: 'aportes' }[m.tipo];
    x[k] += cents_(m.monto);
    x.neto += c;
    porTipo[m.tipo] += cents_(m.monto);
  });
  var ef = porMedio.Efectivo ? porMedio.Efectivo.neto : 0;
  var medios = Object.keys(porMedio).map(function (k) {
    var x = porMedio[k];
    return { medio: x.medio, cobros: soles_(x.cobros), devoluciones: soles_(x.devoluciones), gastos: soles_(x.gastos),
      retiros: soles_(x.retiros), aportes: soles_(x.aportes), neto: soles_(x.neto) };
  });
  return {
    fondo: caja.fondo || 0,
    cobros: soles_(porTipo.cobro), devoluciones: soles_(porTipo.devolucion), gastos: soles_(porTipo.gasto),
    retiros: soles_(porTipo.retiro), aportes: soles_(porTipo.aporte),
    efectivoEsperado: soles_(cents_(caja.fondo || 0) + ef),
    digital: soles_(medios.filter(function (m) { return m.medio !== 'Efectivo'; }).reduce(function (s, m) { return s + cents_(m.neto); }, 0)),
    medios: medios
  };
}

function cajaActual_(p, ss) {
  ss = ss || openSpreadsheet_(false);
  var cajas = leer_(ss, 'CAJAS');
  var caja = p.id ? cajas.porId[str_(p.id)] : cajas.objs.filter(function (c) { return c.estado === 'abierta'; }).pop();
  if (!caja) return null;
  var movs = leer_(ss, 'MOVIMIENTOS_CAJA').objs.filter(function (m) { return m.cajaId === caja.id; });
  var out = limpio_(caja);
  if (typeof out.resumen === 'string' && out.resumen) { try { out.resumen = JSON.parse(out.resumen); } catch (e) { out.resumen = null; } }
  out.actual = resumenCaja_(caja, movs);
  out.movimientos = movs.map(limpio_).reverse();
  // Cobros del día que se registraron sin caja abierta: se muestran para que el cierre cuadre con Reportes.
  var hoy = caja.fecha;
  out.cobrosSinCaja = soles_(leer_(ss, 'PAGOS').objs.filter(function (x) {
    return x.estado === 'activo' && x.tipo === 'pago' && !x.cajaId && x.fecha === hoy;
  }).reduce(function (s, x) { return s + cents_(x.monto); }, 0));
  return out;
}

function cerrarCaja_(p) {
  var ss = openSpreadsheet_(false);
  var cajas = leer_(ss, 'CAJAS');
  var caja = cajas.porId[id_(p.cajaId, 'Caja')];
  if (!caja) throw appError_('NOT_FOUND', 'Caja no encontrada.');
  if (caja.estado === 'cerrada') return cajaActual_({ id: caja.id }, ss); // reintento: ya estaba cerrada
  var movs = leer_(ss, 'MOVIMIENTOS_CAJA').objs.filter(function (m) { return m.cajaId === caja.id; });
  var r = resumenCaja_(caja, movs);
  var contado = money_(p.contado, 'Efectivo contado', true);
  var dif = soles_(cents_(contado) - cents_(r.efectivoEsperado));
  var obs = text_(p.observacion, 'Observación', 300, Math.abs(dif) > 0.004);
  var now = iso_(ahora_());
  caja.estado = 'cerrada';
  caja.cerradaEn = now;
  caja.esperado = r.efectivoEsperado;
  caja.contado = contado;
  caja.diferencia = dif;
  caja.observacion = obs;
  caja.resumen = r;
  caja.actualizadoEn = now;
  guardar_(cajas, caja);
  return cajaActual_({ id: caja.id }, ss);
}

function listarCajas_(p) {
  var ss = openSpreadsheet_(false);
  var limite = Math.min(Math.max(Number(p.limite) || 30, 1), 120);
  return leer_(ss, 'CAJAS').objs.slice(-limite).reverse().map(function (c) {
    var o = limpio_(c);
    if (typeof o.resumen === 'string' && o.resumen) { try { o.resumen = JSON.parse(o.resumen); } catch (e) { o.resumen = null; } }
    return o;
  });
}

/* ===================== Lecturas para el panel ===================== */
var MAX_DIAS_RANGO = 370;

/**
 * Datos de un rango de fechas (por fecha del pedido / del pago / del gasto) en una sola llamada. Incluye además los
 * pedidos abiertos y los que tienen saldo por cobrar de los últimos 90 días, aunque sean de otras fechas.
 * Los totales se calculan en el navegador con un único motor, así Inicio, Pedidos y Reportes siempre coinciden.
 */
function rango_(p) {
  var desde = fecha_(p.desde, 'Desde');
  var hasta = fecha_(p.hasta, 'Hasta');
  if (desde > hasta) throw appError_('VALIDATION', 'El rango de fechas está invertido.');
  if ((new Date(hasta) - new Date(desde)) / 86400000 > MAX_DIAS_RANGO) throw appError_('VALIDATION', 'El rango máximo es de un año.');
  return conCache_('dat', 'rango:' + desde + ':' + hasta, !!p.fresh, function () {
    var ss = openSpreadsheet_(false);
    var hoy = fechaLima_(ahora_());
    var limiteAbiertos = fechaLima_(new Date(ahora_().getTime() - 90 * 86400000));
    var pagos = leer_(ss, 'PAGOS').objs;
    var sumas = {};
    pagos.forEach(function (x) {
      if (x.estado !== 'activo') return;
      var s = sumas[x.pedidoId] || (sumas[x.pedidoId] = { p: 0, d: 0 });
      if (x.tipo === 'pago') s.p += cents_(x.monto); else s.d += cents_(x.monto);
    });
    var incompletos = [];
    var pedidos = [];
    leer_(ss, 'PEDIDOS').objs.forEach(function (o) {
      if (o.integridad !== 'completo') { incompletos.push({ id: o.id, codigo: o.codigo, creadoEn: o.creadoEn }); return; }
      var s = sumas[o.id] || { p: 0, d: 0 };
      var neto = s.p - s.d;
      var saldo = o.estado === 'cancelado' ? 0 : Math.max(0, cents_(o.total) - neto);
      var enRango = o.fecha >= desde && o.fecha <= hasta;
      var abierto = ['pendiente', 'confirmado', 'preparando', 'listo'].indexOf(o.estado) >= 0;
      var porCobrar = saldo > 0 && ESTADOS_VENTA[o.estado];
      var porDevolver = o.estado === 'cancelado' && neto > 0;
      if (!enRango && !((abierto || porCobrar || porDevolver) && o.fecha >= limiteAbiertos)) return;
      var x = limpio_(o);
      x.pagado = soles_(s.p);
      x.devuelto = soles_(s.d);
      x.saldo = soles_(saldo);
      x.estadoPago = estadoPago_(o.estado, cents_(o.total), s.p, s.d);
      x.enRango = enRango;
      pedidos.push(x);
    });
    var ids = {};
    pedidos.forEach(function (x) { ids[x.id] = true; });
    var lineas = leer_(ss, 'DETALLE_PEDIDOS').objs.filter(function (l) { return ids[l.pedidoId]; }).map(function (l) {
      return { id: l.id, pedidoId: l.pedidoId, linea: l.linea, productoId: l.productoId, producto: l.producto, categoriaId: l.categoriaId,
        categoria: l.categoria, variante: l.variante, extras: l.extras, precioUnitario: l.precioUnitario, cantidad: l.cantidad,
        importe: l.importe, costoUnitario: l.costoUnitario, nota: l.nota };
    });
    return {
      desde: desde, hasta: hasta, hoy: hoy, generadoEn: iso_(ahora_()),
      pedidos: pedidos,
      lineas: lineas,
      pagos: pagos.filter(function (x) { return x.fecha >= desde && x.fecha <= hasta; }).map(limpio_),
      gastos: leer_(ss, 'GASTOS').objs.filter(function (g) { return g.fecha >= desde && g.fecha <= hasta; }).map(limpio_),
      incompletos: incompletos
    };
  });
}

/** Detalle completo de un pedido, bajo demanda: líneas, pagos e historial. */
function pedido_(p) {
  var ss = openSpreadsheet_(false);
  var o = leer_(ss, 'PEDIDOS').porId[id_(p.id, 'Pedido')];
  if (!o) throw appError_('NOT_FOUND', 'Pedido no encontrado.');
  var pagos = leer_(ss, 'PAGOS').objs.filter(function (x) { return x.pedidoId === o.id; });
  var s = sumasPagos_(o.id, pagos);
  var x = limpio_(o);
  x.pagado = soles_(s.pagado);
  x.devuelto = soles_(s.devuelto);
  x.saldo = o.estado === 'cancelado' ? 0 : soles_(Math.max(0, cents_(o.total) - (s.pagado - s.devuelto)));
  x.estadoPago = estadoPago_(o.estado, cents_(o.total), s.pagado, s.devuelto);
  x.integridad = o.integridad;
  return {
    pedido: x,
    lineas: leer_(ss, 'DETALLE_PEDIDOS').objs.filter(function (l) { return l.pedidoId === o.id; }).map(limpio_),
    pagos: pagos.map(limpio_),
    historial: leer_(ss, 'HISTORIAL_ESTADOS').objs.filter(function (h) { return h.pedidoId === o.id; }).map(limpio_)
  };
}

function diagnostico_() {
  var ss = openSpreadsheet_(false);
  var out = { version: APP_VERSION, hoja: ss.getUrl(), filas: {} };
  Object.keys(ESQUEMA).forEach(function (n) { out.filas[n] = leer_(ss, n).objs.length; });
  out.incompletos = leer_(ss, 'PEDIDOS').objs.filter(function (o) { return o.integridad !== 'completo'; }).map(function (o) { return o.codigo; });
  var props = PropertiesService.getScriptProperties().getProperties();
  out.sesionesActivas = Object.keys(props).filter(function (k) { return k.indexOf('SES_') === 0; }).length;
  return out;
}

/* ===================== Carta pública (segunda etapa) ===================== */
var PUBLICO_MAX_POR_MIN = 15;

/** Solo datos de la carta: nunca pedidos, clientes ni importes del negocio. */
function cartaPublica_() {
  var cat = catalogo_(false);
  var cfg = {};
  CONFIG_PUBLICA.forEach(function (k) { cfg[k] = cat.config[k] || ''; });
  var whatsapp = cat.config.whatsapp_validado === 'SI' ? cat.config.whatsapp_numero : '';
  if (cfg.carta_publica_activa !== 'SI') return { activa: false, config: { negocio_nombre: cfg.negocio_nombre, negocio_firma: cfg.negocio_firma } };
  var catsActivas = {};
  cat.categorias.forEach(function (c) { if (c.activo) catsActivas[c.id] = true; });
  var productos = cat.productos.filter(function (x) { return x.activo && catsActivas[x.categoriaId]; }).map(function (x) {
    return { id: x.id, categoriaId: x.categoriaId, nombre: x.nombre, descripcion: x.descripcion, precio: x.precio, fotoUrl: x.fotoUrl,
      agotado: x.agotado, destacado: x.destacado, orden: x.orden, esCombo: x.esCombo, incluye: x.incluye };
  });
  var pids = {};
  productos.forEach(function (x) { pids[x.id] = true; });
  return {
    activa: true,
    config: cfg,
    whatsapp: whatsapp,
    categorias: cat.categorias.filter(function (c) { return c.activo; }).map(function (c) { return { id: c.id, nombre: c.nombre, descripcion: c.descripcion, orden: c.orden }; }),
    productos: productos,
    opciones: cat.opciones.filter(function (o) { return o.activo && pids[o.productoId]; }).map(function (o) {
      return { id: o.id, productoId: o.productoId, tipo: o.tipo, nombre: o.nombre, precio: o.precio, orden: o.orden };
    })
  };
}

/**
 * Guarda una solicitud de la carta como pedido "pendiente de confirmación" y devuelve su código.
 * No confirma ni cobra nada: abrir WhatsApp no prueba que el mensaje se haya enviado.
 */
function crearSolicitud_(p) {
  var cat = catalogo_(false);
  if (cat.config.carta_publica_activa !== 'SI') throw appError_('CERRADO', 'La carta no está recibiendo pedidos en este momento.');
  var cache = CacheService.getScriptCache();
  var minuto = 'pub:min:' + Math.floor(ahora_().getTime() / 60000);
  var n = Number(cache.get(minuto) || 0);
  if (n >= PUBLICO_MAX_POR_MIN) throw appError_('RATE_LIMIT', 'Muchas solicitudes seguidas. Intenta en un minuto.');
  cache.put(minuto, String(n + 1), 120);
  if (str_(p.web)) throw appError_('VALIDATION', 'Solicitud inválida.'); // campo trampa para bots
  var datos = { clave: p.clave, canal: p.canal, cliente: p.cliente, telefono: p.telefono, direccion: p.direccion,
    referencia: p.referencia, nota: p.nota, lineas: p.lineas, totalEsperado: p.totalEsperado };
  var r = conLock_(function () {
    var x = crearPedido_(datos, 'carta');
    invalidar_('dat');
    return x;
  });
  return { codigo: r.codigo, subtotal: r.subtotal, delivery: r.delivery, deliveryEstado: r.deliveryEstado, total: r.total,
    whatsapp: cat.config.whatsapp_validado === 'SI' ? cat.config.whatsapp_numero : '', duplicado: !!r.duplicado };
}

/* ===================== Tabla de acciones ===================== */
var PUBLICAS = {
  login: login_,
  carta: cartaPublica_,
  crearSolicitud: crearSolicitud_
};
var PRIVADAS = {
  sesion: function () { return { ok: true, version: APP_VERSION }; },
  logout: logout_,
  logoutTodas: logoutTodas_,
  cambiarClave: cambiarClave_,
  inicial: inicial_,
  rango: rango_,
  pedido: pedido_,
  cajaActual: function (p) { return cajaActual_(p || {}); },
  cajas: listarCajas_,
  diagnostico: diagnostico_,
  crearVenta: function (p) { return crearPedido_(p, 'panel'); },
  cambiarEstado: cambiarEstado_,
  definirDelivery: definirDelivery_,
  registrarPago: registrarPago_,
  anularPago: anularPago_,
  cancelarPedido: cancelarPedido_,
  registrarDevolucion: function (p) { return registrarDevolucion_(p); },
  reparar: reparar_,
  crearGasto: crearGasto_,
  anularGasto: anularGasto_,
  abrirCaja: abrirCaja_,
  movimientoCaja: movimientoCaja_,
  anularMovimiento: anularMovimiento_,
  cerrarCaja: cerrarCaja_,
  saveConfig: saveConfig_,
  saveCategoria: saveCategoria_,
  saveProducto: saveProducto_,
  marcarProducto: marcarProducto_,
  saveOpcion: saveOpcion_,
  reordenar: reordenar_,
  subirFoto: subirFoto_
};
var LECTURA = { sesion: true, logout: true, logoutTodas: true, cambiarClave: true, inicial: true, rango: true, pedido: true,
  cajaActual: true, cajas: true, diagnostico: true };
var DATOS = ['dat'];
var CATALOGO = ['cat'];
var INVALIDA = {
  crearVenta: DATOS, cambiarEstado: DATOS, definirDelivery: DATOS, registrarPago: DATOS, anularPago: DATOS, cancelarPedido: DATOS,
  registrarDevolucion: DATOS, reparar: DATOS, crearGasto: DATOS, anularGasto: DATOS, abrirCaja: DATOS, movimientoCaja: DATOS,
  anularMovimiento: DATOS, cerrarCaja: DATOS,
  saveConfig: CATALOGO, saveCategoria: CATALOGO, saveProducto: CATALOGO, marcarProducto: CATALOGO, saveOpcion: CATALOGO,
  reordenar: CATALOGO, subirFoto: CATALOGO
};
