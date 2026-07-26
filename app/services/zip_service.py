import zipfile
from pathlib import Path


def zipear_carpeta(carpeta: Path, destino_zip: Path) -> Path:
    with zipfile.ZipFile(destino_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for archivo in carpeta.iterdir():
            if archivo.is_file():
                zf.write(archivo, arcname=archivo.name)
    return destino_zip
