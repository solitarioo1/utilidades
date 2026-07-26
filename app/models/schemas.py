from typing import Literal

from pydantic import BaseModel


class CasoPreview(BaseModel):
    id: str
    nombre_archivo: str
    fila_excel: int
    campos: dict[str, str]


class SubirExcelResponse(BaseModel):
    archivo: str
    total_pp: int
    total_pt: int
    casos_pp: list[CasoPreview]
    casos_pt: list[CasoPreview]


class PdfProcesado(BaseModel):
    archivo: str
    id: str | None = None
    acta: int | None = None
    paginas: int = 0
    jpgs: list[str] = []
    error: str | None = None


class SubirPdfsResponse(BaseModel):
    total_subidos: int
    total_ok: int
    total_error: int
    resultados: list[PdfProcesado]


class EstadoFotosCaso(BaseModel):
    id: str
    total_fotos: int
    slots: dict[str, str]


class CasoParaProcesar(BaseModel):
    id: str
    nombre_archivo: str
    campos: dict[str, str]


class ProcesarRequest(BaseModel):
    hoja: Literal["PP", "PT"]
    casos: list[CasoParaProcesar]


class ResultadoCaso(BaseModel):
    id: str
    nombre_archivo: str
    ok: bool
    error: str | None = None


class ProcesarResponse(BaseModel):
    lote: str
    total: int
    ok: int
    error: int
    resultados: list[ResultadoCaso]
    zip_url: str | None = None
