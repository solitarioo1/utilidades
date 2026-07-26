"""
Conversión de PDFs de actas a JPG, siguiendo el patrón acordado:
  {ID}_{n° de acta}_{n° de página}.jpg

El nombre del PDF subido debe venir como {ID}_{n° de acta}.pdf, ej:
  12345_1.pdf  -> 12345_1_1.jpg, 12345_1_2.jpg, ... (una por página)
  12345_2.pdf  -> 12345_2_1.jpg, ...  (segunda acta del mismo caso)

Máximo 6 fotos por caso en total (según lo acordado en plan_proyecto.md), pero
esta capa no lo limita: el límite de 6 slots se aplica más adelante al armar
el JSON para jsreport (services/jsreport_client.py).
"""
import re
from pathlib import Path

import fitz  # PyMuPDF

from app.core.config import settings

NOMBRE_PDF_CON_ACTA_RE = re.compile(r"^(?P<id>[A-Za-z0-9]+)_(?P<acta>\d+)$")
NOMBRE_PDF_SOLO_ID_RE = re.compile(r"^(?P<id>[A-Za-z0-9]+)$")

DPI_RENDER = 150


class NombrePdfInvalido(Exception):
    pass


def parsear_nombre(nombre_archivo: str) -> tuple[str, int]:
    """
    Extrae (id_caso, n_acta) del nombre del PDF.
    - '12345_1.pdf' -> ('12345', 1)
    - '12345.pdf'   -> ('12345', 1)  (sin número de acta = se asume acta 1,
      el caso más común: un solo PDF por cliente)
    """
    stem = Path(nombre_archivo).stem
    m = NOMBRE_PDF_CON_ACTA_RE.match(stem)
    if m:
        return m.group("id"), int(m.group("acta"))

    m = NOMBRE_PDF_SOLO_ID_RE.match(stem)
    if m:
        return m.group("id"), 1

    raise NombrePdfInvalido(
        f"'{nombre_archivo}' no sigue el patrón esperado '{{ID}}_{{n_acta}}.pdf' o '{{ID}}.pdf' "
        f"(ej. 12345_1.pdf o 12345.pdf)"
    )


def convertir_pdf_a_jpg(ruta_pdf: Path, id_caso: str, n_acta: int) -> list[str]:
    """
    Convierte cada página del PDF a JPG en settings.actas_jpg_dir, con el
    patrón {id_caso}_{n_acta}_{n_pagina}.jpg. Devuelve la lista de nombres
    de archivo JPG generados (en orden de página).
    """
    generados = []
    doc = fitz.open(ruta_pdf)
    try:
        matriz = fitz.Matrix(DPI_RENDER / 72, DPI_RENDER / 72)
        for i, pagina in enumerate(doc, start=1):
            pix = pagina.get_pixmap(matrix=matriz)
            nombre_jpg = f"{id_caso}_{n_acta}_{i}.jpg"
            destino = settings.actas_jpg_dir / nombre_jpg
            pix.save(str(destino), jpg_quality=80)
            generados.append(nombre_jpg)
    finally:
        doc.close()
    return generados


def url_publica(nombre_jpg: str) -> str:
    return f"{settings.public_base_url}/static/actas/{nombre_jpg}"


FOTO_RE = re.compile(r"^(?P<id>[A-Za-z0-9]+)_(?P<acta>\d+)_(?P<pagina>\d+)\.jpg$")

MAX_SLOTS = 6


def slots_acta_para_caso(id_caso: str) -> dict[str, str]:
    """
    Busca en actas_jpg_dir todas las fotos de un caso, las ordena por
    (n_acta, n_pagina) y las mapea posicionalmente a ACTA1..ACTA6 (URL
    pública), dejando "" en los slots que no existan. Máximo 6 en total,
    cubriendo el caso de 2 actas (ej. 3 hojas + 2 hojas = 5 fotos).
    """
    encontradas = []
    for archivo in settings.actas_jpg_dir.glob(f"{id_caso}_*_*.jpg"):
        m = FOTO_RE.match(archivo.name)
        if m and m.group("id") == id_caso:
            encontradas.append((int(m.group("acta")), int(m.group("pagina")), archivo.name))

    encontradas.sort(key=lambda t: (t[0], t[1]))

    slots = {f"ACTA{i}": "" for i in range(1, MAX_SLOTS + 1)}
    for i, (_, _, nombre) in enumerate(encontradas[:MAX_SLOTS], start=1):
        slots[f"ACTA{i}"] = url_publica(nombre)

    return slots
