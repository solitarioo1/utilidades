const API_BASE = ""; // mismo origen (FastAPI sirve /frontend y /api)
const STORAGE_KEY = "convenios_estado_v2";

const estado = {
  archivoExcel: null,
  nombreExcelMostrado: "",
  casosPP: [],
  casosPT: [],
  hojaVista: "PP", // filtra la tabla del panel de casos (paso 3)
  fotosPorId: {},
  seleccionados: new Set(), // checkboxes del panel (paso 3) -> usado por el filtro "seleccionados"
  pdfsSubidosCount: 0,
  resultados: {}, // { id: {ok, error, nombre_archivo, hoja, lote} }
  filtroProcesar: "todos", // todos | PP | PT | seleccionados
  filtroDescarga: "todos", // todos | PP | PT
  buscarDescarga: "",
};

// ---- Persistencia local (sobrevive a refresh / cierre de pestaña / caída de internet) ----
function guardarEstado() {
  const paraGuardar = { ...estado, seleccionados: [...estado.seleccionados] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paraGuardar));
}

function cargarEstado() {
  const crudo = localStorage.getItem(STORAGE_KEY);
  if (!crudo) return;
  try {
    const guardado = JSON.parse(crudo);
    Object.assign(estado, guardado);
    estado.seleccionados = new Set(guardado.seleccionados || []);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function limpiarTodo() {
  if (!confirm("¿Limpiar todo y empezar un lote nuevo? (los archivos ya subidos al servidor no se borran)")) return;
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(estado, {
    archivoExcel: null,
    nombreExcelMostrado: "",
    casosPP: [],
    casosPT: [],
    fotosPorId: {},
    seleccionados: new Set(),
    pdfsSubidosCount: 0,
    resultados: {},
    filtroProcesar: "todos",
    filtroDescarga: "todos",
    buscarDescarga: "",
  });
  document.getElementById("buscarDescarga").value = "";
  marcarCompletado("cardExcel", false);
  marcarCompletado("cardPdfs", false);
  marcarCompletado("cardProcesar", false);

  document.getElementById("dropExcel").hidden = false;
  document.getElementById("doneExcel").hidden = true;
  document.getElementById("dropPdfs").hidden = false;
  document.getElementById("donePdfs").hidden = true;
  excelStatus.textContent = "";
  pdfsStatus.textContent = "";
  document.getElementById("countPP").textContent = "0";
  document.getElementById("countPT").textContent = "0";

  setFiltroActivo("filtroProcesar", "todos");
  setFiltroActivo("filtroDescarga", "todos");
  actualizarAyudaFiltro();
  renderTablaCasos();
  renderTablaDescargas();
  actualizarKpis();
  actualizarBotonProcesar();
  actualizarBotonZip();
}

document.getElementById("btnLimpiar").addEventListener("click", limpiarTodo);

// ---- Tabs del panel de casos (paso 3): solo filtran esa tabla ----
const tabs = document.querySelectorAll("#tabsHoja .tab");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    estado.hojaVista = tab.dataset.hoja;
    renderTablaCasos();
  });
});

// ---- Filtros de "Procesar" (paso 4) ----
function setFiltroActivo(grupoId, valor) {
  document.querySelectorAll(`#${grupoId} .filtro-btn`).forEach((b) => {
    b.classList.toggle("active", b.dataset.filtro === valor);
  });
}

document.querySelectorAll("#filtroProcesar .filtro-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    estado.filtroProcesar = btn.dataset.filtro;
    setFiltroActivo("filtroProcesar", btn.dataset.filtro);
    actualizarAyudaFiltro();
    actualizarBotonProcesar();
    renderTablaCasos();
    guardarEstado();
  });
});

function actualizarAyudaFiltro() {
  const ayuda = document.getElementById("ayudaFiltro");
  const textos = {
    todos: "Se generarán todos los casos cargados (PP + PT).",
    PP: "Se generarán solo los casos PP.",
    PT: "Se generarán solo los casos PT.",
    seleccionados: `Se generarán solo los casos marcados con checkbox en el panel de casos (${estado.seleccionados.size} seleccionado(s)).`,
  };
  ayuda.textContent = textos[estado.filtroProcesar];
}

function gruposParaProcesar() {
  const f = estado.filtroProcesar;
  if (f === "PP") return { PP: estado.casosPP, PT: [] };
  if (f === "PT") return { PP: [], PT: estado.casosPT };
  if (f === "seleccionados") {
    return {
      PP: estado.casosPP.filter((c) => estado.seleccionados.has(c.id)),
      PT: estado.casosPT.filter((c) => estado.seleccionados.has(c.id)),
    };
  }
  return { PP: estado.casosPP, PT: estado.casosPT }; // todos
}

// ---- Filtros de "Descargar" (paso 5) ----
document.querySelectorAll("#filtroDescarga .filtro-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    estado.filtroDescarga = btn.dataset.filtro;
    setFiltroActivo("filtroDescarga", btn.dataset.filtro);
    renderTablaDescargas();
    guardarEstado();
  });
});

document.getElementById("buscarDescarga").addEventListener("input", (e) => {
  estado.buscarDescarga = e.target.value.trim().toLowerCase();
  renderTablaDescargas();
});

// ---- Dropzone genérico ----
function activarDropzone(dropzoneEl, inputEl, onFiles) {
  dropzoneEl.addEventListener("click", () => inputEl.click());
  inputEl.addEventListener("change", () => onFiles(inputEl.files));

  ["dragover", "dragleave", "drop"].forEach((evt) => {
    dropzoneEl.addEventListener(evt, (e) => e.preventDefault());
  });
  dropzoneEl.addEventListener("dragover", () => dropzoneEl.classList.add("dragover"));
  dropzoneEl.addEventListener("dragleave", () => dropzoneEl.classList.remove("dragover"));
  dropzoneEl.addEventListener("drop", (e) => {
    dropzoneEl.classList.remove("dragover");
    onFiles(e.dataTransfer.files);
  });
}

// ---- Lectura segura de respuestas (evita el "Unexpected end of JSON input") ----
async function leerJsonSeguro(resp) {
  const texto = await resp.text();
  if (!texto) throw new Error(`El servidor respondió vacío (HTTP ${resp.status})`);
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`Respuesta no válida del servidor (HTTP ${resp.status}): ${texto.slice(0, 200)}`);
  }
}

function marcarCompletado(idCard, completado) {
  document.getElementById(idCard).classList.toggle("completado", completado);
}

function todosLosIds() {
  return [...estado.casosPP, ...estado.casosPT].map((c) => c.id);
}

// ---- Excel (uno solo, con hojas PP y PT) ----
const dropExcel = document.getElementById("dropExcel");
const inputExcel = document.getElementById("inputExcel");
const excelStatus = document.getElementById("excelStatus");
const doneExcel = document.getElementById("doneExcel");
const doneExcelTexto = document.getElementById("doneExcelTexto");

async function subirExcel(archivo) {
  excelStatus.textContent = `Leyendo ${archivo.name}...`;
  excelStatus.className = "status";

  const formData = new FormData();
  formData.append("archivo", archivo);

  try {
    const resp = await fetch(`${API_BASE}/api/excel/subir`, { method: "POST", body: formData });
    const data = await leerJsonSeguro(resp);
    if (!resp.ok) throw new Error(data.detail || "Error al leer el Excel");

    estado.archivoExcel = data.archivo;
    estado.nombreExcelMostrado = archivo.name;
    estado.casosPP = data.casos_pp;
    estado.casosPT = data.casos_pt;
    estado.seleccionados = new Set();
    estado.resultados = {};

    excelStatus.textContent = "";
    document.getElementById("countPP").textContent = data.total_pp;
    document.getElementById("countPT").textContent = data.total_pt;

    dropExcel.hidden = true;
    doneExcel.hidden = false;
    doneExcelTexto.textContent = `✔ ${archivo.name} — ${data.total_pp} PP, ${data.total_pt} PT`;
    marcarCompletado("cardExcel", true);

    await refrescarEstadoFotos();
    renderTablaCasos();
    renderTablaDescargas();
    actualizarKpis();
    actualizarBotonProcesar();
    guardarEstado();
  } catch (err) {
    excelStatus.textContent = `✖ ${err.message}`;
    excelStatus.className = "status error";
  }
}

activarDropzone(dropExcel, inputExcel, (files) => {
  if (files.length) subirExcel(files[0]);
});

document.getElementById("btnCambiarExcel").addEventListener("click", () => {
  const seguro = confirm(
    "Al subir un nuevo Excel se REEMPLAZA por completo el actual (no se suman los casos). " +
    "Los PDFs/fotos ya subidos se mantienen. ¿Continuar?"
  );
  if (!seguro) return;
  dropExcel.hidden = false;
  doneExcel.hidden = true;
});

// ---- PDFs de actas: subida real + conversión a JPG en el backend ----
const dropPdfs = document.getElementById("dropPdfs");
const inputPdfs = document.getElementById("inputPdfs");
const pdfsStatus = document.getElementById("pdfsStatus");
const donePdfs = document.getElementById("donePdfs");
const donePdfsTexto = document.getElementById("donePdfsTexto");

async function subirPdfs(files) {
  const lista = Array.from(files);
  pdfsStatus.textContent = `Subiendo y convirtiendo ${lista.length} PDF(s)...`;
  pdfsStatus.className = "status";

  const formData = new FormData();
  lista.forEach((f) => formData.append("archivos", f));

  try {
    const resp = await fetch(`${API_BASE}/api/pdfs/subir`, { method: "POST", body: formData });
    const data = await leerJsonSeguro(resp);
    if (!resp.ok) throw new Error(data.detail || "Error al subir los PDFs");

    estado.pdfsSubidosCount += data.total_ok;

    pdfsStatus.textContent = data.total_error
      ? `✔ ${data.total_ok} OK · ✖ ${data.total_error} con error (revisa nombres tipo 12345_1.pdf)`
      : "";
    pdfsStatus.className = data.total_error ? "status error" : "status";

    dropPdfs.hidden = true;
    donePdfs.hidden = false;
    donePdfsTexto.textContent = `✔ ${estado.pdfsSubidosCount} PDF(s) convertidos en total`;
    marcarCompletado("cardPdfs", true);

    await refrescarEstadoFotos();
    renderTablaCasos();
    guardarEstado();
  } catch (err) {
    pdfsStatus.textContent = `✖ ${err.message}`;
    pdfsStatus.className = "status error";
  }
}

activarDropzone(dropPdfs, inputPdfs, (files) => {
  if (files.length) subirPdfs(files);
});

document.getElementById("btnAgregarPdfs").addEventListener("click", () => {
  dropPdfs.hidden = false;
  donePdfs.hidden = true;
});

// ---- Match de fotos por caso (paso 3: previsualización Excel <-> PDFs) ----
async function refrescarEstadoFotos() {
  const ids = todosLosIds();
  if (!ids.length) {
    estado.fotosPorId = {};
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/api/pdfs/estado?ids=${ids.join(",")}`);
    const data = await leerJsonSeguro(resp);
    if (!resp.ok) throw new Error(data.detail || "Error consultando estado de fotos");

    estado.fotosPorId = {};
    data.forEach((item) => {
      estado.fotosPorId[item.id] = item;
    });
  } catch (err) {
    console.error("No se pudo refrescar el estado de fotos:", err.message);
  }
}

// ---- Panel de casos (paso 3, filtrado por tabs PP/PT, con checkboxes) ----
function casosVisibles() {
  return estado.hojaVista === "PP" ? estado.casosPP : estado.casosPT;
}

function renderTablaCasos() {
  const tbody = document.querySelector("#tablaCasos tbody");
  tbody.innerHTML = "";

  const casos = casosVisibles();
  if (!casos.length) {
    tbody.innerHTML = `<tr class="tabla-vacia"><td colspan="5">Sin casos ${estado.hojaVista} en el Excel subido.</td></tr>`;
    actualizarChkTodos();
    return;
  }

  casos.forEach((caso) => {
    const fotos = estado.fotosPorId[caso.id];
    const totalFotos = fotos ? fotos.total_fotos : 0;
    const fotosHtml = totalFotos > 0
      ? `<span class="foto-ok">✔ ${totalFotos} foto(s)</span>`
      : `<span class="foto-warn">⚠ sin fotos</span>`;

    const marcado = estado.seleccionados.has(caso.id);
    const resultado = estado.resultados[caso.id];
    let estadoHtml = '<span class="pill pill-pendiente">Pendiente</span>';
    if (resultado) {
      estadoHtml = resultado.ok
        ? '<span class="pill pill-ok">✔ OK</span>'
        : `<span class="pill pill-error" title="${resultado.error || ''}">✖ Error</span>`;
    } else if (estado.filtroProcesar === "seleccionados" && !marcado) {
      estadoHtml = '<span class="pill pill-no-incluido">No incluido</span>';
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="chk-caso" data-id="${caso.id}" ${marcado ? "checked" : ""} /></td>
      <td>${caso.id}</td>
      <td>${caso.nombre_archivo}</td>
      <td>${fotosHtml}</td>
      <td>${estadoHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".chk-caso").forEach((chk) => {
    chk.addEventListener("change", () => {
      if (chk.checked) estado.seleccionados.add(chk.dataset.id);
      else estado.seleccionados.delete(chk.dataset.id);
      actualizarChkTodos();
      actualizarAyudaFiltro();
      actualizarBotonProcesar();
      guardarEstado();
    });
  });

  actualizarChkTodos();
}

const chkTodos = document.getElementById("chkTodos");

function actualizarChkTodos() {
  const casos = casosVisibles();
  const marcados = casos.filter((c) => estado.seleccionados.has(c.id)).length;
  chkTodos.checked = casos.length > 0 && marcados === casos.length;
  chkTodos.indeterminate = marcados > 0 && marcados < casos.length;
}

chkTodos.addEventListener("change", () => {
  const casos = casosVisibles();
  if (chkTodos.checked) casos.forEach((c) => estado.seleccionados.add(c.id));
  else casos.forEach((c) => estado.seleccionados.delete(c.id));
  renderTablaCasos();
  actualizarAyudaFiltro();
  actualizarBotonProcesar();
  guardarEstado();
});

// ---- KPIs (paso 4), desglosados por PP/PT ----
function actualizarKpis() {
  const total = estado.casosPP.length + estado.casosPT.length;
  const entradas = Object.entries(estado.resultados);

  const contarPor = (hoja, ok) =>
    entradas.filter(([, r]) => r.hoja === hoja && r.ok === ok).length;

  const okPP = contarPor("PP", true);
  const okPT = contarPor("PT", true);
  const errPP = contarPor("PP", false);
  const errPT = contarPor("PT", false);
  const totalOk = okPP + okPT;
  const totalErr = errPP + errPT;

  document.getElementById("kpiTotal").textContent = total || "—";
  document.getElementById("kpiTotalDesglose").textContent =
    total ? `PP: ${estado.casosPP.length} · PT: ${estado.casosPT.length}` : "";

  document.getElementById("kpiOk").textContent = entradas.length ? totalOk : "—";
  document.getElementById("kpiOkDesglose").textContent =
    entradas.length ? `PP: ${okPP} · PT: ${okPT}` : "";

  document.getElementById("kpiError").textContent = entradas.length ? totalErr : "—";
  document.getElementById("kpiErrorDesglose").textContent =
    entradas.length ? `PP: ${errPP} · PT: ${errPT}` : "";
}

// ---- Botón procesar (paso 4) ----
function actualizarBotonProcesar() {
  const btn = document.getElementById("btnProcesar");
  const { PP, PT } = gruposParaProcesar();
  const total = PP.length + PT.length;
  btn.disabled = total === 0;
  if (!btn.dataset.procesando) {
    btn.textContent = `Generar convenios (${total})`;
  }
}

async function procesarGrupo(hoja, casos) {
  const resp = await fetch(`${API_BASE}/api/procesar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hoja,
      casos: casos.map((c) => ({ id: c.id, nombre_archivo: c.nombre_archivo, campos: c.campos })),
    }),
  });
  const data = await leerJsonSeguro(resp);
  if (!resp.ok) throw new Error(data.detail || `Error procesando ${hoja}`);
  return data;
}

document.getElementById("btnProcesar").addEventListener("click", async () => {
  const { PP, PT } = gruposParaProcesar();
  if (!PP.length && !PT.length) return;

  const btn = document.getElementById("btnProcesar");
  btn.disabled = true;
  btn.dataset.procesando = "1";
  btn.textContent = "Procesando...";

  try {
    for (const [hoja, grupo] of [["PP", PP], ["PT", PT]]) {
      if (!grupo.length) continue;
      const data = await procesarGrupo(hoja, grupo);
      data.resultados.forEach((r) => {
        estado.resultados[r.id] = {
          ok: r.ok,
          error: r.error,
          nombre_archivo: r.nombre_archivo,
          hoja,
          lote: data.lote,
        };
      });
    }
    marcarCompletado("cardProcesar", true);
    guardarEstado();
  } catch (err) {
    alert(`Error al procesar: ${err.message}`);
  } finally {
    delete btn.dataset.procesando;
    renderTablaCasos();
    renderTablaDescargas();
    actualizarKpis();
    actualizarBotonProcesar();
    actualizarBotonZip();
  }
});

// ---- Paso 5: Descargar ----
function lotesUnicos(filtro) {
  const vistos = new Set();
  const lotes = [];
  Object.values(estado.resultados).forEach((r) => {
    if (!r.ok) return;
    if (filtro !== "todos" && r.hoja !== filtro) return;
    const clave = `${r.hoja}:${r.lote}`;
    if (!vistos.has(clave)) {
      vistos.add(clave);
      lotes.push({ hoja: r.hoja, lote: r.lote });
    }
  });
  return lotes;
}

function actualizarBotonZip() {
  const btn = document.getElementById("btnDescargarZip");
  const lotes = lotesUnicos(estado.filtroDescarga);
  btn.disabled = lotes.length === 0;
}

document.getElementById("btnDescargarZip").addEventListener("click", () => {
  lotesUnicos(estado.filtroDescarga).forEach((l) => {
    window.open(`${API_BASE}/api/procesar/descargar/${l.lote}`, "_blank");
  });
});

function renderTablaDescargas() {
  const tbody = document.querySelector("#tablaDescargas tbody");
  tbody.innerHTML = "";

  const q = estado.buscarDescarga;
  const filas = Object.entries(estado.resultados)
    .filter(([, r]) => estado.filtroDescarga === "todos" || r.hoja === estado.filtroDescarga)
    .filter(([id, r]) => !q || id.toLowerCase().includes(q) || r.nombre_archivo.toLowerCase().includes(q));

  if (!filas.length) {
    tbody.innerHTML = '<tr class="tabla-vacia"><td colspan="4">Todavía no se ha procesado nada.</td></tr>';
    actualizarBotonZip();
    return;
  }

  filas.forEach(([id, r]) => {
    const tr = document.createElement("tr");
    if (r.ok) {
      tr.innerHTML = `
        <td>${id}</td>
        <td>${r.nombre_archivo}</td>
        <td>${r.hoja}</td>
        <td><button class="btn-sm" data-lote="${r.lote}" data-archivo="${r.nombre_archivo}">Descargar</button></td>
      `;
    } else {
      tr.innerHTML = `
        <td>${id}</td>
        <td class="muted">${r.nombre_archivo}</td>
        <td>${r.hoja}</td>
        <td><span class="pill pill-error" title="${r.error || ''}">✖ Error</span></td>
      `;
    }
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-sm").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = `${API_BASE}/api/procesar/archivo/${btn.dataset.lote}/${encodeURIComponent(btn.dataset.archivo)}`;
      window.open(url, "_blank");
    });
  });

  actualizarBotonZip();
}

// ---- Restaurar estado guardado al cargar la página ----
(function restaurarAlCargar() {
  cargarEstado();

  if (estado.archivoExcel) {
    dropExcel.hidden = true;
    doneExcel.hidden = false;
    doneExcelTexto.textContent = `✔ ${estado.nombreExcelMostrado} — ${estado.casosPP.length} PP, ${estado.casosPT.length} PT`;
    document.getElementById("countPP").textContent = estado.casosPP.length;
    document.getElementById("countPT").textContent = estado.casosPT.length;
    marcarCompletado("cardExcel", true);
  }

  if (estado.pdfsSubidosCount > 0) {
    dropPdfs.hidden = true;
    donePdfs.hidden = false;
    donePdfsTexto.textContent = `✔ ${estado.pdfsSubidosCount} PDF(s) convertidos en total`;
    marcarCompletado("cardPdfs", true);
  }

  if (Object.keys(estado.resultados).length > 0) {
    marcarCompletado("cardProcesar", true);
  }

  document.getElementById("buscarDescarga").value = estado.buscarDescarga || "";
  setFiltroActivo("filtroProcesar", estado.filtroProcesar);
  setFiltroActivo("filtroDescarga", estado.filtroDescarga);
  actualizarAyudaFiltro();

  renderTablaCasos();
  renderTablaDescargas();
  actualizarKpis();
  actualizarBotonProcesar();
  actualizarBotonZip();
})();
