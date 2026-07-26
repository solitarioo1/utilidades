import re
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.models.schemas import ProcesarRequest, ProcesarResponse, ResultadoCaso
from app.services.jsreport_client import JsreportError, extension_por_content_type, renderizar
from app.services.pdf_convert_service import convertir_docx_a_pdf
from app.services.pdf_service import slots_acta_para_caso
from app.services.zip_service import zipear_carpeta

router = APIRouter(prefix="/api/procesar", tags=["procesar"])


def _nombre_archivo_seguro(nombre: str) -> str:
    limpio = re.sub(r'[<>:"/\\|?*]', "_", nombre).strip() or "convenio"
    return limpio


@router.post("", response_model=ProcesarResponse)
async def procesar(payload: ProcesarRequest):
    if not payload.casos:
        raise HTTPException(status_code=400, detail="No se enviaron casos para procesar")

    lote_id = uuid.uuid4().hex[:12]
    carpeta_lote = settings.output_dir / lote_id
    carpeta_lote.mkdir(parents=True, exist_ok=True)

    resultados: list[ResultadoCaso] = []

    for caso in payload.casos:
        data = dict(caso.campos)
        data.update(slots_acta_para_caso(caso.id))

        try:
            contenido, content_type = await renderizar(payload.hoja, data)
            ext = extension_por_content_type(content_type)
            nombre_base = _nombre_archivo_seguro(caso.nombre_archivo)
            ruta_generada = carpeta_lote / f"{nombre_base}{ext}"
            ruta_generada.write_bytes(contenido)

            nombre_final = ruta_generada.name
            if ext == ".docx":
                ruta_pdf = convertir_docx_a_pdf(ruta_generada)
                if ruta_pdf is not None:
                    ruta_generada.unlink(missing_ok=True)
                    nombre_final = ruta_pdf.name

            resultados.append(ResultadoCaso(id=caso.id, nombre_archivo=nombre_final, ok=True))
        except JsreportError as e:
            resultados.append(
                ResultadoCaso(id=caso.id, nombre_archivo=caso.nombre_archivo, ok=False, error=str(e))
            )
        except Exception as e:
            resultados.append(
                ResultadoCaso(id=caso.id, nombre_archivo=caso.nombre_archivo, ok=False, error=f"Error inesperado: {e}")
            )

    total_ok = sum(1 for r in resultados if r.ok)
    zip_url = None
    if total_ok > 0:
        destino_zip = settings.output_dir / f"{lote_id}.zip"
        zipear_carpeta(carpeta_lote, destino_zip)
        zip_url = f"/api/procesar/descargar/{lote_id}"

    return ProcesarResponse(
        lote=lote_id,
        total=len(resultados),
        ok=total_ok,
        error=len(resultados) - total_ok,
        resultados=resultados,
        zip_url=zip_url,
    )


@router.get("/descargar/{lote_id}")
def descargar_zip(lote_id: str):
    ruta_zip = settings.output_dir / f"{lote_id}.zip"
    if not ruta_zip.exists():
        raise HTTPException(status_code=404, detail="Ese lote no existe o no generó ningún archivo")
    return FileResponse(ruta_zip, filename=f"convenios_{lote_id}.zip", media_type="application/zip")


@router.get("/archivo/{lote_id}/{nombre_archivo}")
def descargar_archivo(lote_id: str, nombre_archivo: str):
    if "/" in nombre_archivo or "\\" in nombre_archivo or ".." in nombre_archivo:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")

    ruta_archivo = settings.output_dir / lote_id / nombre_archivo
    if not ruta_archivo.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(ruta_archivo, filename=nombre_archivo)
