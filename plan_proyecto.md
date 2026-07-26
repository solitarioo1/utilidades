# Plan del proyecto — Automatización de Convenios de Ajuste

## Decisión
Uso interno (no producto externo). Automatizar la generación de convenios de ajuste
(siniestros de seguros agrícolas) reemplazando el flujo manual en Word por una web
que arma el documento vía **jsreport** (recipe `docx`).

Pivote clave: **ya no se genera el documento con Python/LibreOffice** (enfoque viejo,
descartado). Python pasa a ser el **backend** que orquesta datos + imágenes y llama
a la API de jsreport.

## Dominio / entorno
- Test: local.
- Producción futura: `convenios.miagentepersonal.me`.
- Stack: **FastAPI** (backend) + HTML/JS (frontend, sin framework pesado por ahora).
- jsreport: instancia con usuario/password ya creada, plantillas `PP` y `PT` subidas
  en carpetas `PP_convenios` / `PT_convenios`.

## Plantillas jsreport (estado: LISTAS y probadas)
Archivos en `plantillas/`:
- `PP-TODOS LOS COMERCIALIZADORES.docx`
- `PT-TODOS LOS COMERCIALIZADORES.docx`

Conversión realizada:
- Todos los `MERGEFIELD` de Word → `{{CAMPO}}` (handlebars), incluyendo pie de página
  (`ENDOSATARIO`, `RUC`, `DNI_`). Se corrigió un bug real (un `{` suelto en el
  código de campo de `NOMBRES_COMPLETOS_DEL_ASEGURADO` en el footer de PP).
- Los 6 slots de fotos (`INCLUDEPICTURE` nativo de Word, mecanismo que jsreport no
  entiende) fueron reconstruidos como imagen real + alt-text:
  `{{#if ACTAn}}{{docxImage src=ACTAn width=10cm height=13cm}}{{/if}}` para
  `n = 1..6`. Probado en jsreport Studio, funciona (error inicial de sintaxis
  `docxImage` sin `src=` y sin unidad en `width/height` ya corregido).
- Pendiente real: las URLs de `ACTAn` en las pruebas son de ejemplo
  (`picsum.photos`); en producción las va a generar el backend con la URL pública
  real del VPS.

## Mapeo de campos (MERGEFIELD ↔ columna Excel) — verificado campo por campo
Confirmado carácter por carácter (tildes, espacios, guiones bajos) contra las hojas
`PP` y `PT` del Excel `TABLA PARA CONVENIOS-TODOS LOS COMERCIALIZADORES.xlsm`
(este Excel ya quedó limpio: solo hojas `PP` y `PT`, se eliminaron `E|ICA`,
`E|SUL`, `E|FQ` y `DATOS` por decisión del usuario — no se usan).

Columnas del Excel que el Word **no** usa (auxiliares, no se imprimen):
`REGISTRO`, `CÓDIGO`, columnas "sin 2" que solo alimentaban fórmulas viejas,
`FECHA DE STRO REAL`, `FECHA AVISO`, `FECHA DE FLORACIÓN`, `FECHA DE SIEMBRA`,
`OBSERVACIONES GENERALES`, `LOTES POR PAGAR` (sin 2), `N_FOTOS`, todas las
`ACTA*_BORRADOR`. `NOMBRE DE ARCHIVO` se usa para renombrar el PDF de salida,
no dentro del documento.

Nota importante: el Excel que se sube a la web **es plano, sin fórmulas ni macros**
(el Excel original con fórmulas es interno/histórico). Campos vacíos (ej.
`OBSERVACIONES_PARA_CONVENIO`) son normales y deben imprimirse vacíos, no como error.

## Manejo de fotos (actas) — separado del Excel
Las columnas `ACTA*` del Excel ya **no se usan** para resolver fotos (siguen
existiendo en el archivo pero vestigiales). El flujo real es:

1. El usuario sube uno o más **PDFs de actas** por caso a la web (no fotos sueltas).
2. El backend convierte cada PDF a imágenes JPG, una por página.
3. Convención de nombres: `{ID}_{n° de acta}_{n° de página}`.
   - Ej. caso con 1 acta de 3 hojas → `12345_1_1.jpg`, `12345_1_2.jpg`, `12345_1_3.jpg`.
   - Ej. caso con 2 actas (3 hojas + 2 hojas) → agrega `12345_2_1.jpg`, `12345_2_2.jpg`
     (hasta 6 fotos en total: 3+2, cubre el peor caso).
4. El backend arma las URLs públicas (imágenes servidas desde el propio servidor,
   no Drive) y llena `ACTA1..ACTA6` en el JSON — dejando vacíos los slots que no
   existan (el `{{#if}}` de la plantilla se encarga de no dejar hueco).

## Flujo funcional de la web (a construir)
1. **Subir Excel** (PP o PT, el usuario elige/queda claro por hoja) — 1 fila = 1 caso.
2. **Subir PDFs de actas** — conversión automática a JPG según el patrón de arriba.
3. Backend hace match por `N° ID` entre Excel y PDFs subidos.
4. Arma el JSON por caso (texto + URLs de `ACTA1..6`) y llama a la API de jsreport
   (`POST /api/report/<carpeta>/<plantilla>`, Basic Auth con user/password).
5. Junta todos los PDFs de salida (renombrados con `NOMBRE DE ARCHIVO`) en un **ZIP**.
6. **Panel de control** en la web: cuántos casos se procesaron OK, cuántos con error
   (y cuál).

## Decisiones de producto pendientes / abiertas
- Confirmar si además de subir el Excel se agrega una opción "pegar tabla" como
  plan B (no reemplaza la subida de Excel, que es la vía principal para lotes).
- Sin login por ahora (fase de testing).
- Diseño visual: fondo blanco, tarjetas con borde sutil sobre gris claro, acento
  **naranja** (botón/tab activo), acento **cian/menta** (tarjeta destacada tipo KPI),
  tipografía tipo mono/slab para títulos, labels pequeños en mayúscula gris
  (referencia visual: captura de `isf-peru.miagentepersonal.me`).

## Pendientes técnicos (jsreport)
- Confirmar si `docx.convertTo: "pdf"` funciona en la versión open source de
  jsreport instalada o si requiere Pro (para salida final en PDF, no solo docx).
- Confirmar recursos reales del servidor para tiempos de procesamiento en lote
  (antes se estimaba 2-3h manual → objetivo ~3-6 min para 50 casos, sin medir aún).
- Probar con 5 casos reales antes de correr un lote completo.

## Próximo paso inmediato
Scaffold del backend FastAPI: endpoints para subir Excel, subir PDFs, procesar
(match + conversión a imagen + llamada jsreport), descargar ZIP, y endpoint de
estado para el panel de control.
