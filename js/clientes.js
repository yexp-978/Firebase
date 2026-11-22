import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { initNavbar } from "./navbar.js";
import { appState, isEmpleadoOrAdmin, notifyState, subscribeState } from "./state.js";
import {
  calcularSiguienteId,
  escapeHtml,
  estadoBadgeClass,
  formatCurrency,
  formatDate,
  normalizarCliente,
  normalizarPedido,
  openModal,
  showToast
} from "./utils.js";

const form = document.getElementById("form-cliente");
const idInput = document.getElementById("cli-id");
const nombreInput = document.getElementById("cli-nombre");
const telefonoInput = document.getElementById("cli-telefono");
const correoInput = document.getElementById("cli-correo");
const btnGuardar = document.getElementById("btn-cli-guardar");
const btnCancel = document.getElementById("btn-cli-cancelar");
const nextIdHint = document.getElementById("cli-next-id-hint");
const validationBox = document.getElementById("cli-validation-msg");
const roleNotice = document.getElementById("role-notice-clientes");
const searchInput = document.getElementById("filtro-cli-texto");
const countLabel = document.getElementById("count-clientes");
const tbody = document.getElementById("tabla-clientes-body");

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
    const sig = calcularSiguienteId(appState.clientes, "Cliente");
    nextIdHint.textContent = `Siguiente ID: ${sig}`;
  }
}

function resetForm() {
  form?.reset();
  if (idInput) idInput.value = "";
  clearValidationError();
  btnCancel?.classList.add("hidden");
  const title = document.getElementById("cli-form-title");
  if (title) title.textContent = "Registrar nuevo cliente";
  if (btnGuardar) btnGuardar.textContent = "Guardar cliente";
  actualizarHintId();
}

function cargarEnFormulario(cli) {
  if (!isEmpleadoOrAdmin()) {
    showToast("Acceso denegado: Se requiere rol Empleado o Administrador.", "error");
    return;
  }
  clearValidationError();
  if (idInput) idInput.value = cli.id;
  if (nombreInput) nombreInput.value = cli.Nombre;
  if (telefonoInput) telefonoInput.value = cli.Telefono;
  if (correoInput) correoInput.value = cli.Correo;

  btnCancel?.classList.remove("hidden");
  const title = document.getElementById("cli-form-title");
  if (title) title.textContent = `Editar cliente (${cli.id})`;
  if (btnGuardar) btnGuardar.textContent = "Actualizar cliente";
  actualizarHintId();
  form?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function verHistorialCliente(cli) {
  const pedidosCliente = appState.pedidos.filter((p) => p.ClienteId === cli.id);

  if (pedidosCliente.length === 0) {
    openModal(
      `Historial de ${cli.Nombre} (${cli.id})`,
      `<p class="empty-state">Este cliente aún no tiene pedidos registrados en la colección <code>Pedidos</code>.</p>`
    );
    return;
  }

  const totalGastado = pedidosCliente
    .filter((p) => p.Estado !== "Cancelado")
    .reduce((sum, p) => sum + (Number(p.Total) || 0), 0);

  const rows = pedidosCliente
    .map((p) => {
      const detalle = (p.Productos || [])
        .map((item) => `${item.Cantidad}x ${escapeHtml(item.Nombre)} ($${item.Importe})`)
        .join(", ");
      return `
        <tr>
          <td><span class="id-pill">${escapeHtml(p.id)}</span></td>
          <td>${formatDate(p.Fecha)}</td>
          <td>${detalle}</td>
          <td><strong>${formatCurrency(p.Total)}</strong></td>
          <td><span class="badge ${estadoBadgeClass(p.Estado)}">${escapeHtml(p.Estado)}</span></td>
        </tr>
      `;
    })
    .join("");

  openModal(
    `Historial de ${cli.Nombre} (${cli.id})`,
    `
      <p style="margin-bottom:0.85rem;">
        <strong>Pedidos realizados:</strong> ${pedidosCliente.length} &nbsp;|&nbsp;
        <strong>Total acumulado (sin cancelados):</strong> ${formatCurrency(totalGastado)}
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Productos</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  );
}

async function eliminarCliente(cli) {
  if (!isEmpleadoOrAdmin()) {
    showToast("Acceso denegado: Se requiere rol Empleado o Administrador.", "error");
    return;
  }

  const pedidosAsociados = appState.pedidos.filter((p) => p.ClienteId === cli.id);
  if (pedidosAsociados.length > 0) {
    showToast(
      `No se puede eliminar a "${cli.Nombre}" (${cli.id}) porque tiene ${pedidosAsociados.length} pedido(s) registrados en Firestore.`,
      "error"
    );
    return;
  }

  if (!confirm(`¿Eliminar al cliente "${cli.Nombre}" (${cli.id}) de Firestore?`)) return;

  try {
    await deleteDoc(doc(db, "Clientes", cli.id));
    showToast(`Cliente "${cli.Nombre}" (${cli.id}) eliminado.`);
    if (idInput?.value === cli.id) resetForm();
  } catch (err) {
    console.error(err);
    showToast("Error al eliminar cliente: " + err.message, "error");
  }
}

function ordenarPorNumeroId(lista) {
  return [...lista].sort((a, b) => {
    const na = Number(a.id.match(/(\d+)$/)?.[1] || 9999);
    const nb = Number(b.id.match(/(\d+)$/)?.[1] || 9999);
    return na - nb;
  });
}

export function renderClientesTabla() {
  if (!tbody) return;
  const permitido = isEmpleadoOrAdmin();

  roleNotice?.classList.toggle("hidden", permitido);
  if (btnGuardar) btnGuardar.disabled = !permitido;
  actualizarHintId();

  const texto = (searchInput?.value || "").trim().toLowerCase();
  const ordenados = ordenarPorNumeroId(appState.clientes);

  const filtrados = ordenados.filter((c) => {
    if (!texto) return true;
    return (
      c.id.toLowerCase().includes(texto) ||
      c.Nombre.toLowerCase().includes(texto) ||
      (c.Telefono || "").toLowerCase().includes(texto) ||
      (c.Correo || "").toLowerCase().includes(texto)
    );
  });

  if (countLabel) countLabel.textContent = String(filtrados.length);

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No hay clientes que coincidan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados
    .map((c) => {
      const numPedidos = appState.pedidos.filter((p) => p.ClienteId === c.id).length;
      return `
        <tr>
          <td><span class="id-pill">${escapeHtml(c.id)}</span></td>
          <td><strong>${escapeHtml(c.Nombre)}</strong></td>
          <td>${escapeHtml(c.Telefono)}</td>
          <td>${escapeHtml(c.Correo)}</td>
          <td>${formatDate(c.Fecha)}</td>
          <td><span class="badge badge-preparacion">${numPedidos} pedido(s)</span></td>
          <td class="actions-cell">
            <button type="button" class="btn btn-secondary btn-sm btn-hist-cli" data-id="${c.id}">Historial</button>
            ${
              permitido
                ? `
                  <button type="button" class="btn btn-secondary btn-sm btn-edit-cli" data-id="${c.id}">Editar</button>
                  <button type="button" class="btn btn-danger btn-sm btn-del-cli" data-id="${c.id}">Eliminar</button>
                `
                : `<span style="color:var(--text-muted);font-size:0.82rem;">🔒 Sin permiso</span>`
            }
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".btn-hist-cli").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cli = appState.clientes.find((x) => x.id === btn.dataset.id);
      if (cli) verHistorialCliente(cli);
    });
  });

  tbody.querySelectorAll(".btn-edit-cli").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cli = appState.clientes.find((x) => x.id === btn.dataset.id);
      if (cli) cargarEnFormulario(cli);
    });
  });

  tbody.querySelectorAll(".btn-del-cli").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cli = appState.clientes.find((x) => x.id === btn.dataset.id);
      if (cli) eliminarCliente(cli);
    });
  });
}

export function initClientes() {
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearValidationError();

    if (!isEmpleadoOrAdmin()) {
      showValidationError("Permiso denegado: Se requiere rol Empleado o Administrador.");
      return;
    }

    const Nombre = (nombreInput?.value || "").trim();
    const Telefono = (telefonoInput?.value || "").trim();
    const Correo = (correoInput?.value || "").trim();

    if (Nombre.length < 2) {
      showValidationError("Validación: El nombre del cliente es obligatorio (mínimo 2 caracteres).");
      nombreInput?.focus();
      return;
    }

    const soloDigitos = Telefono.replace(/\D/g, "");
    if (soloDigitos.length < 10) {
      showValidationError("Validación: Ingresa un número de teléfono válido de al menos 10 dígitos.");
      telefonoInput?.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Correo)) {
      showValidationError("Validación: Ingresa un correo electrónico con formato válido (ejemplo@dominio.com).");
      correoInput?.focus();
      return;
    }

    const editId = idInput?.value;
    try {
      if (editId) {
        await updateDoc(doc(db, "Clientes", editId), {
          Nombre,
          Telefono: soloDigitos,
          Correo
        });
        showToast(`Cliente ${editId} ("${Nombre}") actualizado en Firestore.`);
      } else {
        const nuevoId = calcularSiguienteId(appState.clientes, "Cliente");
        await setDoc(doc(db, "Clientes", nuevoId), {
          Nombre,
          Telefono: soloDigitos,
          Correo,
          Fecha: serverTimestamp()
        });
        showToast(`Cliente ${nuevoId} ("${Nombre}") registrado en Firestore.`);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      showValidationError("Error al guardar cliente: " + err.message);
    }
  });

  btnCancel?.addEventListener("click", resetForm);
  searchInput?.addEventListener("input", renderClientesTabla);

  subscribeState("clientes", renderClientesTabla);
  subscribeState("pedidos", renderClientesTabla);
  subscribeState("perfil", renderClientesTabla);
  renderClientesTabla();
}

if (window.location.pathname.includes("clientes")) {
  initNavbar("clientes");
  initClientes();

  onSnapshot(collection(db, "Clientes"), (snap) => {
    appState.clientes = snap.docs.map(normalizarCliente);
    notifyState("clientes");
  });

  onSnapshot(collection(db, "Pedidos"), (snap) => {
    appState.pedidos = snap.docs.map(normalizarPedido);
    notifyState("pedidos");
  });
}
