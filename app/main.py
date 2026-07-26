from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings

app = FastAPI(title="Automatización de Convenios de Ajuste")

app.mount("/static/actas", StaticFiles(directory=str(settings.actas_jpg_dir)), name="actas")
app.mount("/frontend", StaticFiles(directory="frontend", html=True), name="frontend")


@app.exception_handler(Exception)
async def excepcion_no_controlada(request: Request, exc: Exception):
    # Red de seguridad: el frontend siempre espera JSON, nunca debe recibir
    # una respuesta vacía o texto plano aunque algo truene inesperadamente.
    return JSONResponse(status_code=500, content={"detail": f"Error interno: {exc}"})


@app.get("/health")
def health():
    return {"status": "ok"}


from app.api import routes_excel, routes_pdfs, routes_procesar

app.include_router(routes_excel.router)
app.include_router(routes_pdfs.router)
app.include_router(routes_procesar.router)
