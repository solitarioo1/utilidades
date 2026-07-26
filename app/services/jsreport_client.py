"""
Cliente para la API REST de jsreport (recipe docx).
POST /api/report/<carpeta>/<plantilla>  con el JSON de datos del caso.
"""
from typing import Literal

import httpx

from app.core.config import settings

Hoja = Literal["PP", "PT"]

TEMPLATE_POR_HOJA: dict[Hoja, str] = {
    "PP": settings.pp_template_path,
    "PT": settings.pt_template_path,
}


class JsreportError(Exception):
    pass


async def renderizar(hoja: Hoja, data: dict) -> tuple[bytes, str]:
    """
    Llama a jsreport para el caso dado. Devuelve (contenido_binario, content_type).
    Usa el formato genérico POST /api/report con el template indicado en el
    body (por nombre completo "Carpeta/plantilla"), en vez de la ruta
    /api/report/<carpeta>/<plantilla>.
    """
    plantilla = TEMPLATE_POR_HOJA[hoja]
    url = f"{settings.jsreport_url}/api/report"
    # La conversión a PDF NO se pide aquí: esta instancia de jsreport no la
    # tiene disponible. Se hace después en Python con LibreOffice
    # (services/pdf_convert_service.py).
    body = {"template": {"name": plantilla}, "data": data}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                url,
                json=body,
                auth=(settings.jsreport_user, settings.jsreport_password),
            )
        except httpx.RequestError as e:
            raise JsreportError(f"No se pudo conectar a jsreport ({url}): {e}")

    if resp.status_code != 200:
        detalle = resp.text[:500]
        raise JsreportError(f"jsreport respondió {resp.status_code}: {detalle}")

    content_type = resp.headers.get("content-type", "application/octet-stream")
    return resp.content, content_type


def extension_por_content_type(content_type: str) -> str:
    if "pdf" in content_type:
        return ".pdf"
    if "wordprocessingml" in content_type or "msword" in content_type:
        return ".docx"
    return ".bin"
