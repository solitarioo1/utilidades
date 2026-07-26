import io
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, UploadFile

from app.core.config import settings
from app.models.schemas import EstadoFotosCaso, PdfProcesado, SubirPdfsResponse
from app.services.pdf_service import (
    NombrePdfInvalido,
    convertir_pdf_a_jpg,
    parsear_nombre,
    slots_acta_para_caso,
)

router = APIRouter(prefix="/api/pdfs", tags=["pdfs"])


def _procesar_un_pdf(nombre_original: str, contenido: bytes) -> PdfProcesado:
    try:
        id_caso, n_acta = parsear_nombre(nombre_original)
    except NombrePdfInvalido as e:
        return PdfProcesado(archivo=nombre_original, error=str(e))

    ruta_tmp = settings.uploads_pdfs_dir / f"{uuid.uuid4().hex}.pdf"
    try:
        ruta_tmp.write_bytes(contenido)
        jpgs = convertir_pdf_a_jpg(ruta_tmp, id_caso, n_acta)
        return PdfProcesado(
            archivo=nombre_original, id=id_caso, acta=n_acta, paginas=len(jpgs), jpgs=jpgs
        )
    except Exception as e:
        return PdfProcesado(archivo=nombre_original, error=str(e))
    finally:
        ruta_tmp.unlink(missing_ok=True)


def _procesar_zip(nombre_zip: str, contenido: bytes) -> list[PdfProcesado]:
    resultados = []
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as zf:
            entradas_pdf = [
                info for info in zf.infolist()
                if not info.is_dir() and info.filename.lower().endswith(".pdf")
            ]
            if not entradas_pdf:
                return [PdfProcesado(archivo=nombre_zip, error="El ZIP no contiene ningún .pdf")]

            for info in entradas_pdf:
                nombre_pdf = Path(info.filename).name  # ignora subcarpetas dentro del zip
                contenido_pdf = zf.read(info)
                resultados.append(_procesar_un_pdf(nombre_pdf, contenido_pdf))
    except zipfile.BadZipFile:
        return [PdfProcesado(archivo=nombre_zip, error="El ZIP está corrupto o no es un ZIP válido")]
    return resultados


@router.post("/subir", response_model=SubirPdfsResponse)
async def subir_pdfs(archivos: list[UploadFile]):
    resultados: list[PdfProcesado] = []

    for archivo in archivos:
        nombre_original = archivo.filename
        contenido = await archivo.read()

        if nombre_original.lower().endswith(".zip"):
            resultados.extend(_procesar_zip(nombre_original, contenido))
        else:
            resultados.append(_procesar_un_pdf(nombre_original, contenido))

    total_error = sum(1 for r in resultados if r.error)
    return SubirPdfsResponse(
        total_subidos=len(resultados),
        total_ok=len(resultados) - total_error,
        total_error=total_error,
        resultados=resultados,
    )


@router.get("/estado", response_model=list[EstadoFotosCaso])
def estado_fotos(ids: str):
    """
    Dado ids='11274,12290,...' (los N° ID del Excel ya cargado), devuelve
    cuántas fotos hay para cada uno. Sirve para el match Excel <-> PDFs
    en la previsualización antes de procesar.
    """
    lista_ids = [i.strip() for i in ids.split(",") if i.strip()]
    resultado = []
    for id_caso in lista_ids:
        slots = slots_acta_para_caso(id_caso)
        total = sum(1 for v in slots.values() if v)
        resultado.append(EstadoFotosCaso(id=id_caso, total_fotos=total, slots=slots))
    return resultado
