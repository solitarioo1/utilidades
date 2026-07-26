"""
Conversión final docx -> PDF usando LibreOffice headless (soffice), en
reemplazo de depender de la conversión propia de jsreport (no disponible
en la instancia usada). Requiere LibreOffice instalado en la máquina que
corre el backend (en el VPS vía `apt-get install libreoffice`, ver
docker/Dockerfile).

Si soffice no está instalado (ej. en una laptop de desarrollo sin LibreOffice),
la conversión simplemente no se aplica y se entrega el .docx tal cual,
sin romper el procesamiento del caso.
"""
import shutil
import subprocess
from pathlib import Path

_RUTAS_CANDIDATAS_WINDOWS = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]


def _ubicar_soffice() -> str | None:
    encontrado = shutil.which("soffice") or shutil.which("soffice.exe")
    if encontrado:
        return encontrado
    for ruta in _RUTAS_CANDIDATAS_WINDOWS:
        if Path(ruta).exists():
            return ruta
    return None


def convertir_docx_a_pdf(ruta_docx: Path, timeout_seg: int = 60) -> Path | None:
    """
    Convierte ruta_docx a PDF en la misma carpeta. Devuelve la ruta del PDF
    generado, o None si LibreOffice no está disponible o la conversión falló
    (no lanza excepción: se maneja como "sin conversión disponible").
    """
    soffice = _ubicar_soffice()
    if not soffice:
        return None

    carpeta = ruta_docx.parent
    try:
        resultado = subprocess.run(
            [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(carpeta), str(ruta_docx)],
            capture_output=True,
            timeout=timeout_seg,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None

    if resultado.returncode != 0:
        return None

    ruta_pdf = carpeta / (ruta_docx.stem + ".pdf")
    return ruta_pdf if ruta_pdf.exists() else None
