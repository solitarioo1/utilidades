import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from app.models.schemas import CasoPreview, SubirExcelResponse
from app.services.excel_service import FilaInvalida, parse_excel_todas_las_hojas

router = APIRouter(prefix="/api/excel", tags=["excel"])

EXTENSIONES_VALIDAS = {".xlsx", ".xlsm"}


def _a_preview(casos_raw: list[dict]) -> list[CasoPreview]:
    return [
        CasoPreview(
            id=c["_id"],
            nombre_archivo=c["_nombre_archivo"],
            fila_excel=c["_fila_excel"],
            campos={k: v for k, v in c.items() if not k.startswith("_")},
        )
        for c in casos_raw
    ]


@router.post("/subir", response_model=SubirExcelResponse)
async def subir_excel(archivo: UploadFile):
    extension = Path(archivo.filename).suffix.lower()
    if extension not in EXTENSIONES_VALIDAS:
        raise HTTPException(
            status_code=400,
            detail=f"Extensión no soportada: {extension}. Usa .xlsx (recomendado) o .xlsm",
        )

    nombre_guardado = f"{uuid.uuid4().hex}{extension}"
    ruta_destino = settings.uploads_excel_dir / nombre_guardado

    try:
        with ruta_destino.open("wb") as f:
            shutil.copyfileobj(archivo.file, f)

        try:
            por_hoja = parse_excel_todas_las_hojas(ruta_destino)
        except FilaInvalida as e:
            raise HTTPException(status_code=422, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        casos_pp = _a_preview(por_hoja["PP"])
        casos_pt = _a_preview(por_hoja["PT"])

        return SubirExcelResponse(
            archivo=nombre_guardado,
            total_pp=len(casos_pp),
            total_pt=len(casos_pt),
            casos_pp=casos_pp,
            casos_pt=casos_pt,
        )
    except HTTPException:
        raise
    except Exception as e:
        # Cualquier fallo inesperado (Excel corrupto, formato raro, etc.)
        # debe seguir devolviendo JSON, nunca una respuesta vacía/texto plano.
        raise HTTPException(status_code=500, detail=f"Error inesperado leyendo el Excel: {e}")
