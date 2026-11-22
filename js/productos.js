import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { initNavbar } from "./navbar.js";
import { appState, isAdmin, notifyState, subscribeState } from "./state.js";
import {
  calcularSiguienteId,
  escapeHtml,
  formatCurrency,
  normalizarPedido,
  normalizarProducto,
  showToast
} from "./utils.js";

const form = document.getElementById("form-producto");
const idInput = document.getElementById("prod-id");
const nombreInput = document.getElementById("prod-nombre");
const categoriaInput = document.getElementById("prod-categoria");
const precioInput = document.getElementById("prod-precio");
const stockInput = document.getElementById("prod-stock");
const dispInput = document.getElementById("prod-disponible");
const descInput = document.getElementById("prod-descripcion");
const btnGuardar = document.getElementById("btn-prod-guardar");
const btnCancelEdit = document.getElementById("btn-prod-cancelar");
const nextIdHint = document.getElementById("prod-next-id-hint");
const validationBox = document.getElementById("prod-validation-msg");
const roleNotice = document.getElementById("role-notice-productos");
const searchInput = document.getElementById("filtro-prod-texto");
const filterCat = document.getElementById("filtro-prod-categoria");
const countLabel = document.getElementById("count-productos");
const tbody = document.getElementById("tabla-productos-body");

function showValidationError(msg) {
  if (!validationBox) {
    showToast(msg, "error");
    return;
  }
  validationBox.textContent = msg;
  validationBox.classList.remove("hidden");
}

function clearValidationError() {
  validationBox?.classList.add("hidden");
}

function actualizarHintId() {
  if (!nextIdHint) return;
  if (idInput?.value) {
    nextIdHint.textContent = `Editando: ${idInput.value}`;
  } else {
    const sig = calcularSiguienteId(appState.productos, "Prod");
    nextIdHint.textContent = `Siguiente ID: ${sig}`;
  }
}

function resetForm() {
  form?.reset();
  if (idInput) idInput.value = "";
  if (dispInput) dispInput.value = "true";
  clearValidationError();
  btnCancelEdit?.classList.add("hidden");
  const title = document.getElementById("prod-form-title");
  if (title) title.textContent = "Registrar nuevo producto";
  if (btnGuardar) btnGuardar.textContent = "Guardar producto";
  actualizarHintId();
}

function cargarEnFormulario(prod) {
  if (!isAdmin()) {
    showToast("Acceso denegado: Solo el Administrador puede editar productos.", "error");
    return;
  }
  clearValidationError();
  if (idInput) idInput.value = prod.id;
  if (nombreInput) nombreInput.value = prod.Nombre;
  if (categoriaInput) {
    if (![...categoriaInput.options].some((o) => o.value === prod.Categoria)) {
      categoriaInput.innerHTML += `<option value="${escapeHtml(prod.Categoria)}">${escapeHtml(prod.Categoria)}</option>`;
    }
    categoriaInput.value = prod.Categoria;
  }
  if (precioInput) precioInput.value = prod.Precio;
  if (stockInput) stockInput.value = prod.Stock;
  if (dispInput) dispInput.value = String(prod.Disponible !== false);
  if (descInput) descInput.value = prod.Descripcion || "";

  btnCancelEdit?.classList.remove("hidden");
  const title = document.getElementById("prod-form-title");
  if (title) title.textContent = `Editar producto (${prod.id})`;
  if (btnGuardar) btnGuardar.textContent = "Actualizar producto";
  actualizarHintId();
  form?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function productoTieneHistorial(productoId) {
  return appState.pedidos.some(
    (p) => Array.isArray(p.Productos) && p.Productos.some((item) => item.ProductoId === productoId)
  );
}

async function toggleDisponible(prod) {
  if (!isAdmin()) {
    showToast("Acceso denegado: Solo el Administrador puede cambiar disponibilidad.", "error");
    return;
  }
  try {
    const nuevoEstado = !prod.Disponible;
    await updateDoc(doc(db, "Productos", prod.id), {
      Disponible: nuevoEstado
    });
    showToast(
      nuevoEstado
        ? `Producto "${prod.Nombre}" (${prod.id}) activado.`
        : `Producto "${prod.Nombre}" (${prod.id}) desactivado.`
    );
  } catch (err) {
    console.error(err);
    showToast("No se pudo cambiar la disponibilidad: " + err.message, "error");
  }
}

async function eliminarProducto(prod) {
  if (!isAdmin()) {
    showToast("Acceso denegado: Solo el Administrador puede eliminar productos.", "error");
    return;
  }

  if (productoTieneHistorial(prod.id)) {
    showToast(
      `El producto "${prod.Nombre}" (${prod.id}) aparece en pedidos registrados; se desactivará para conservar la integridad del historial.`,
      "error"
    );
    if (prod.Disponible) {
      await toggleDisponible(prod);
    }
    return;
  }

  if (!confirm(`¿Eliminar permanentemente el producto "${prod.Nombre}" (${prod.id}) de Firestore?`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "Productos", prod.id));
    showToast(`Producto "${prod.Nombre}" (${prod.id}) eliminado de Firestore.`);
    if (idInput?.value === prod.id) resetForm();
  } catch (err) {
    console.error(err);
    showToast("Error al eliminar producto: " + err.message, "error");
  }
}

function ordenarPorNumeroId(lista) {
  return [...lista].sort((a, b) => {
    const na = Number(a.id.match(/(\d+)$/)?.[1] || 9999);
    const nb = Number(b.id.match(/(\d+)$/)?.[1] || 9999);
    return na - nb;
  });
}

export function renderProductosTabla() {
  if (!tbody) return;
  const admin = isAdmin();

  roleNotice?.classList.toggle("hidden", admin);
  if (btnGuardar) btnGuardar.disabled = !admin;

  actualizarHintId();

  const texto = (searchInput?.value || "").trim().toLowerCase();
  const cat = filterCat?.value || "";

  const ordenados = ordenarPorNumeroId(appState.productos);
  const filtrados = ordenados.filter((p) => {
    const matchText =
      !texto ||
      p.id.toLowerCase().includes(texto) ||
      p.Nombre.toLowerCase().includes(texto) ||
      (p.Descripcion || "").toLowerCase().includes(texto);
    const matchCat = !cat || p.Categoria === cat;
    return matchText && matchCat;
  });

  if (countLabel) countLabel.textContent = String(filtrados.length);

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No hay productos que coincidan con el filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados
    .map(
      (p) => `
      <tr>
        <td><span class="id-pill">${escapeHtml(p.id)}</span></td>
        <td>
          <strong>${escapeHtml(p.Nombre)}</strong><br>
          <small style="color:var(--text-muted)">${escapeHtml(p.Descripcion || "Sin descripción")}</small>
        </td>
        <td>${escapeHtml(p.Categoria)}</td>
        <td><strong>${formatCurrency(p.Precio)}</strong></td>
        <td>
          <span class="badge ${p.Stock > 0 ? "badge-activo" : "badge-inactivo"}">
            ${p.Stock} uds
          </span>
        </td>
        <td>
          <span class="badge ${p.Disponible ? "badge-activo" : "badge-inactivo"}">
            ${p.Disponible ? "true (Activo)" : "false (Inactivo)"}
          </span>
        </td>
        <td class="actions-cell">
          ${
            admin
              ? `
                <button type="button" class="btn btn-secondary btn-sm btn-edit-prod" data-id="${p.id}">Editar</button>
                <button type="button" class="btn btn-secondary btn-sm btn-toggle-prod" data-id="${p.id}">
                  ${p.Disponible ? "Desactivar" : "Activar"}
                </button>
                <button type="button" class="btn btn-danger btn-sm btn-del-prod" data-id="${p.id}">Eliminar</button>
              `
              : `<span style="color:var(--text-muted);font-size:0.82rem;">🔒 Requiere rol Administrador</span>`
          }
        </td>
      </tr>
    `
    )
    .join("");

  tbody.querySelectorAll(".btn-edit-prod").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prod = appState.productos.find((x) => x.id === btn.dataset.id);
      if (prod) cargarEnFormulario(prod);
    });
  });

  tbody.querySelectorAll(".btn-toggle-prod").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prod = appState.productos.find((x) => x.id === btn.dataset.id);
      if (prod) toggleDisponible(prod);
    });
  });

  tbody.querySelectorAll(".btn-del-prod").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prod = appState.productos.find((x) => x.id === btn.dataset.id);
      if (prod) eliminarProducto(prod);
    });
  });
}

export function initProductos() {
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearValidationError();

    if (!isAdmin()) {
      showValidationError("Permiso denegado: Solo el rol Administrador puede crear o modificar productos.");
      return;
    }

    const Nombre = (nombreInput?.value || "").trim();
    const Categoria = categoriaInput?.value || "Bebida";
    const Precio = Number(precioInput?.value);
    const Stock = Number(stockInput?.value);
    const Disponible = dispInput ? dispInput.value === "true" : true;
    const Descripcion = (descInput?.value || "").trim();

    if (Nombre.length < 2) {
      showValidationError("Validación: El nombre del producto es obligatorio (mínimo 2 caracteres).");
      nombreInput?.focus();
      return;
    }
    if (!Categoria) {
      showValidationError("Validación: Selecciona una categoría válida.");
      return;
    }
    if (Number.isNaN(Precio) || Precio <= 0) {
      showValidationError("Validación: El precio debe ser un número mayor a 0.");
      precioInput?.focus();
      return;
    }
    if (Number.isNaN(Stock) || Stock < 0 || !Number.isInteger(Stock)) {
      showValidationError("Validación: El stock debe ser un número entero mayor o igual a 0.");
      stockInput?.focus();
      return;
    }
    if (Descripcion.length < 3) {
      showValidationError("Validación: Ingresa una descripción breve del producto.");
      descInput?.focus();
      return;
    }

    const editId = idInput?.value;
    const payload = {
      Nombre,
      Categoria,
      Descripcion,
      Precio,
      Stock,
      Disponible
    };

    try {
      if (editId) {
        await updateDoc(doc(db, "Productos", editId), payload);
        showToast(`Producto ${editId} ("${Nombre}") actualizado en Firestore.`);
      } else {
        const nuevoId = calcularSiguienteId(appState.productos, "Prod");
        await setDoc(doc(db, "Productos", nuevoId), payload);
        showToast(`Producto ${nuevoId} ("${Nombre}") creado en Firestore.`);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      showValidationError("Error al guardar en Firestore: " + err.message);
    }
  });

  btnCancelEdit?.addEventListener("click", resetForm);
  searchInput?.addEventListener("input", renderProductosTabla);
  filterCat?.addEventListener("change", renderProductosTabla);

  subscribeState("productos", renderProductosTabla);
  subscribeState("perfil", renderProductosTabla);
  renderProductosTabla();
}

// Si estamos en productos.html, inicializar barra y suscripción directa a Firestore
if (window.location.pathname.endsWith("productos.html") || document.getElementById("coffeetech-navbar")) {
  if (window.location.pathname.includes("productos")) {
    initNavbar("productos");
    initProductos();

    onSnapshot(collection(db, "Productos"), (snap) => {
      appState.productos = snap.docs.map(normalizarProducto);
      notifyState("productos");
    });

    onSnapshot(collection(db, "Pedidos"), (snap) => {
      appState.pedidos = snap.docs.map(normalizarPedido);
      notifyState("pedidos");
    });
  }
}
