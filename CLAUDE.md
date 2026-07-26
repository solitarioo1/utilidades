# Instrucciones de proyecto — Automatización de Convenios de Ajuste

Ver `plan_proyecto.md` para el contexto funcional completo (decisiones, mapeo de
campos, flujo de fotos, diseño). Este archivo es sobre **cómo trabajar** en el repo.

## Rol
Actuar como desarrollador backend/frontend de este proyecto: FastAPI (Python) +
HTML/JS plano, integrando con una instancia de jsreport externa (recipe `docx`).
No se repite manipulación manual de XML de Word salvo que se pida explícitamente
tocar las plantillas en `plantillas/`.

## Reglas fijas del proyecto (no volver a preguntar)
- Backend: **FastAPI**. Frontend: HTML/JS sin framework pesado (por ahora).
- Sin autenticación mientras esté en fase de testing.
- Salida: ZIP con todos los PDFs generados, renombrados con la columna
  `NOMBRE DE ARCHIVO` del Excel.
- Debe existir un panel/endpoint de estado: cuántos casos procesados OK vs error.
- Las fotos **no** se gestionan vía columnas `ACTA*` del Excel (esas quedaron
  vestigiales). Se gestionan subiendo PDFs de actas, que el backend convierte a
  JPG con el patrón `{ID}_{n°acta}_{n°página}.jpg`, hasta 6 fotos por caso.
- Excel de entrada: plano, sin fórmulas ni macros. Campos vacíos son válidos y
  deben imprimirse vacíos (no error).
- Paleta visual: fondo blanco, tarjetas sobre gris claro, acento naranja
  (`--color-orange`), acento cian/menta (`--color-cyan`), tipografía tipo
  mono/slab en títulos. Definido en `frontend/css/styles.css`.
- El proyecto se dockerizará: mantener la config en `app/core/config.py` vía
  variables de entorno (`.env`), no hardcodear rutas ni credenciales de jsreport.

## Plantillas jsreport — estado
`plantillas/PP-TODOS LOS COMERCIALIZADORES.docx` y
`plantillas/PT-TODOS LOS COMERCIALIZADORES.docx` ya están convertidas a sintaxis
jsreport (`{{CAMPO}}` + `{{#if ACTAn}}{{docxImage src=ACTAn width=10cm height=13cm}}{{/if}}`
para las 6 fotos) y probadas en jsreport Studio. No volver a re-convertir desde
cero sin verificar primero el estado real del archivo (leer el XML interno del
docx, no asumir).

⚠️ Estos archivos (y el Excel de `plantillas/`) contienen **datos reales de
clientes** (DNI, RUC, nombres, montos) de pruebas anteriores. Tratarlos como
información sensible: no subir a repos públicos, no compartir fuera de este
contexto de trabajo.

## Estructura del repo
```
app/
  main.py            # entrypoint FastAPI
  core/config.py      # settings vía .env
  api/                 # routers (excel, pdfs, procesar, estado)
  services/            # lógica: excel, conversión pdf->jpg, cliente jsreport, zip
  models/              # schemas Pydantic
  static/actas/         # imágenes servidas públicamente (montado en /static/actas)
frontend/               # HTML/JS/CSS servido en /frontend
storage/                 # datos runtime (gitignored): uploads, actas_jpg, output, tmp
plantillas/              # plantillas Word + Excel de referencia (datos sensibles)
docker/                  # Dockerfile + docker-compose (uso futuro)
plan_proyecto.md         # contexto funcional del proyecto
```

## Convenciones de código
- Nombres de campo del JSON hacia jsreport deben coincidir EXACTO con los
  `MERGEFIELD` de las plantillas (ver tabla de mapeo en `plan_proyecto.md`),
  incluyendo tildes y guiones bajos.
- Antes de tocar cualquier `.docx` de `plantillas/`, verificar el estado real
  leyendo el XML (zipfile + regex/ElementTree), nunca asumir por el nombre del
  archivo.
