from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    jsreport_url: str = "http://localhost:5488"
    jsreport_user: str = ""
    jsreport_password: str = ""

    pp_template_path: str = "/PP_convenios/pp-convenios"
    pt_template_path: str = "/PT_convenios/pt-convenios"

    public_base_url: str = "http://localhost:8000"

    # Apagado mientras se resuelve el tema de la fuente con licencia (LibreOffice
    # sustituye la fuente al convertir a PDF si no está instalada en el servidor).
    # En false: se entrega el .docx tal cual sale de jsreport.
    convertir_a_pdf: bool = False

    storage_dir: Path = BASE_DIR / "storage"
    uploads_excel_dir: Path = storage_dir / "uploads" / "excel"
    uploads_pdfs_dir: Path = storage_dir / "uploads" / "pdfs"
    actas_jpg_dir: Path = storage_dir / "actas_jpg"
    output_dir: Path = storage_dir / "output"
    tmp_dir: Path = storage_dir / "tmp"

    class Config:
        env_file = ".env"


settings = Settings()

for d in [
    settings.uploads_excel_dir,
    settings.uploads_pdfs_dir,
    settings.actas_jpg_dir,
    settings.output_dir,
    settings.tmp_dir,
]:
    d.mkdir(parents=True, exist_ok=True)
