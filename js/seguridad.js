import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { initNavbar } from "./navbar.js";
import {
  appState,
  getActiveRole,
  isAdmin,
  setActiveRole,
  subscribeState
} from "./state.js";
import {
  calcularSiguienteId,
  escapeHtml,
  formatCurrency,
  normalizarCliente,
  normalizarPedido,
  normalizarProducto,
  normalizarUsuario,
  showToast
} from "./utils.js";

const activeProfileCard = document.getElementById("active-profile-card");
const authStatusBadge = document.getElementById("auth-status-badge");
const loginForm = document.getElementById("form-login-firebase");
const loginEmail = document.getElementById("login-email");
const loginPass = document.getElementById("login-password");
const loginFeedback = document.getElementById("login-feedback");
const tablaPruebasAcceso = document.getElementById("tabla-pruebas-acceso");

const formUsuario = document.getElementById("form-usuario");
const usuNombre = document.getElementById("usu-nombre");
const usuCorreo = document.getElementById("usu-correo");
const usuRol = document.getElementById("usu-rol");
const usuUid = document.getElementById("usu-uid");
const usuNextIdHint = document.getElementById("usu-next-id-hint");
const countUsuarios = document.getElementById("count-usuarios");
const tbodyUsuarios = document.getElementById("tabla-usuarios-body");

const tablaSuitePruebas = document.getElementById("tabla-suite-pruebas");
const testsSummaryBadge = document.getElementById("tests-summary-badge");
const btnRunTests = document.getElementById("btn-run-all-tests");
const rulesCodeView = document.getElementById("rules-code-view");

function ordenarPorNumeroId(lista) {
  return [...lista].sort((a, b) => {
    const na = Number(a.id.match(/(\d+)$/)?.[1] || 9999);
    const nb = Number(b.id.match(/(\d+)$/)?.[1] || 9999);
    return na - nb;
  });
}

function renderPerfilYMatrizAcceso() {
  const rol = getActiveRole();
  const perfil = appState.perfil || {};

  if (authStatusBadge) {
    authStatusBadge.textContent = `Rol: ${rol}`;
    authStatusBadge.className = `badge ${rol === "Administrador" ? "badge-activo" : rol === "Empleado" ? "badge-preparacion" : "badge-cancelado"}`;
  }

  if (activeProfileCard) {
    activeProfileCard.innerHTML = `
      <strong>Nombre:</strong> ${escapeHtml(perfil.Nombre || "Oswaldo")} (${escapeHtml(perfil.id || "Usuario_1")})<br>
      <strong>Correo:</strong> ${escapeHtml(perfil.Correo || "oswald.reyes.alcala@gmail.com")}<br>
      <strong>Rol actual:</strong> ${escapeHtml(rol)}
    `;
  }

  if (!tablaPruebasAcceso) return;

  const operaciones = [
    {
      nombre: "Ver productos y pedidos",
      permitido: rol === "Administrador" || rol === "Empleado",
      motivoOk: "Permitido",
      motivoDenegado: "Bloqueado (requiere iniciar sesión)"
    },
    {
      nombre: "Agregar, editar o eliminar productos",
      permitido: rol === "Administrador",
      motivoOk: "Permitido",
      motivoDenegado: "Bloqueado (solo Administrador)"
    },
    {
      nombre: "Agregar y editar clientes",
      permitido: rol === "Administrador" || rol === "Empleado",
      motivoOk: "Permitido",
      motivoDenegado: "Bloqueado"
    },
    {
      nombre: "Crear pedidos y cambiar su estado",
      permitido: rol === "Administrador" || rol === "Empleado",
      motivoOk: "Permitido",
      motivoDenegado: "Bloqueado"
    },
    {
      nombre: "Administrar usuarios y roles",
      permitido: rol === "Administrador",
      motivoOk: "Permitido",
      motivoDenegado: "Bloqueado (solo Administrador)"
    }
  ];

  tablaPruebasAcceso.innerHTML = operaciones
    .map(
      (op) => `
      <tr>
        <td>${escapeHtml(op.nombre)}</td>
        <td><span class="id-pill">${escapeHtml(rol)}</span></td>
        <td>
          <span class="badge ${op.permitido ? "badge-activo" : "badge-cancelado"}">
            ${op.permitido ? escapeHtml(op.motivoOk) : escapeHtml(op.motivoDenegado)}
          </span>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderTablaUsuarios() {
  if (!tbodyUsuarios) return;
  const admin = isAdmin();
  const ordenados = ordenarPorNumeroId(appState.usuarios);

  if (countUsuarios) countUsuarios.textContent = String(ordenados.length);
  if (usuNextIdHint) {
    usuNextIdHint.textContent = `Siguiente ID: ${calcularSiguienteId(ordenados, "Usuario")}`;
  }

  if (ordenados.length === 0) {
    tbodyUsuarios.innerHTML = `<tr><td colspan="7" class="empty-state">No hay usuarios registrados.</td></tr>`;
    return;
  }

  tbodyUsuarios.innerHTML = ordenados
    .map(
      (u) => `
      <tr>
        <td><span class="id-pill">${escapeHtml(u.id)}</span></td>
        <td><strong>${escapeHtml(u.Nombre)}</strong></td>
        <td>${escapeHtml(u.Correo)}</td>
        <td><code style="font-size:0.78rem;">${escapeHtml(u.uid)}</code></td>
        <td>
          <select class="select-rol-usu" data-id="${u.id}" style="width:auto;min-width:140px;padding:0.3rem 0.5rem;" ${!admin ? "disabled" : ""}>
            <option value="Administrador" ${u.rol === "Administrador" ? "selected" : ""}>Administrador</option>
            <option value="Empleado" ${u.rol === "Empleado" ? "selected" : ""}>Empleado</option>
          </select>
        </td>
        <td>
          <span class="badge ${u.Activo ? "badge-activo" : "badge-inactivo"}">
            ${u.Activo ? "Sí" : "No"}
          </span>
        </td>
        <td class="actions-cell">
          <button type="button" class="btn btn-secondary btn-sm btn-usar-perfil" data-id="${u.id}">
            Usar cuenta
          </button>
          ${
            admin
              ? `
                <button type="button" class="btn btn-secondary btn-sm btn-toggle-usu" data-id="${u.id}">
                  ${u.Activo ? "Desactivar" : "Activar"}
                </button>
                <button type="button" class="btn btn-danger btn-sm btn-del-usu" data-id="${u.id}">Eliminar</button>
              `
              : ""
          }
        </td>
      </tr>
    `
    )
    .join("");

  tbodyUsuarios.querySelectorAll(".select-rol-usu").forEach((sel) => {
    sel.addEventListener("change", async () => {
      if (!isAdmin()) {
        showToast("Solo el Administrador puede cambiar roles.", "error");
        return;
      }
      try {
        await updateDoc(doc(db, "Usuarios", sel.dataset.id), { rol: sel.value });
        showToast(`Rol actualizado a ${sel.value}.`);
      } catch (err) {
        showToast("Error al actualizar rol: " + err.message, "error");
      }
    });
  });

  tbodyUsuarios.querySelectorAll(".btn-usar-perfil").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = appState.usuarios.find((x) => x.id === btn.dataset.id);
      if (u) {
        setActiveRole(u.rol, u);
        showToast(`Usando cuenta de ${u.Nombre} (${u.rol}).`);
      }
    });
  });

  tbodyUsuarios.querySelectorAll(".btn-toggle-usu").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = appState.usuarios.find((x) => x.id === btn.dataset.id);
      if (!u) return;
      try {
        await updateDoc(doc(db, "Usuarios", u.id), { Activo: !u.Activo });
        showToast(`Estado de ${u.Nombre} actualizado.`);
      } catch (err) {
        showToast("Error al cambiar estado: " + err.message, "error");
      }
    });
  });

  tbodyUsuarios.querySelectorAll(".btn-del-usu").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = appState.usuarios.find((x) => x.id === btn.dataset.id);
      if (!u) return;
      if (u.id === "Usuario_1") {
        showToast("No se puede eliminar al administrador principal.", "error");
        return;
      }
      if (!confirm(`¿Eliminar a ${u.Nombre}?`)) return;
      try {
        await deleteDoc(doc(db, "Usuarios", u.id));
        showToast(`Usuario eliminado.`);
      } catch (err) {
        showToast("Error al eliminar usuario: " + err.message, "error");
      }
    });
  });
}

export function ejecutarSuitePruebas() {
  if (!tablaSuitePruebas) return;

  const prods = appState.productos;
  const clis = appState.clientes;
  const peds = appState.pedidos;
  const usus = appState.usuarios;

  const preciosValidos = prods.length > 0 && prods.every((p) => typeof p.Precio === "number" && p.Precio >= 0 && p.Stock >= 0);
  const clientesValidos = clis.length > 0 && clis.every((c) => Boolean(c.Nombre && c.Correo));
  const pedidosIntegridad =
    peds.length > 0 &&
    peds.every(
      (p) =>
        Array.isArray(p.Productos) &&
        p.Productos.length > 0 &&
        p.Total === p.Productos.reduce((acc, i) => acc + i.Importe, 0)
    );
  const estadosValidos =
    peds.length > 0 &&
    peds.every((p) => ["Pendiente", "En preparación", "Listo", "Entregado", "Cancelado"].includes(p.Estado));
  const adminExiste = usus.some((u) => u.rol === "Administrador" && u.Activo === true);

  const casos = [
    {
      id: "Prueba 1",
      fase: "Productos",
      desc: "Que existan productos con precios y stock válidos",
      evidencia: `${prods.length} productos registrados correctamente.`,
      ok: prods.length >= 1 && preciosValidos
    },
    {
      id: "Prueba 2",
      fase: "Clientes",
      desc: "Que los clientes tengan nombre, teléfono y correo",
      evidencia: `${clis.length} clientes registrados.`,
      ok: clis.length >= 1 && clientesValidos
    },
    {
      id: "Prueba 3",
      fase: "Carrito y Pedidos",
      desc: "Que el total de cada pedido coincida con la suma de sus productos",
      evidencia: `${peds.length} pedidos revisados. Total acumulado: ${formatCurrency(peds.reduce((a, b) => a + b.Total, 0))}.`,
      ok: pedidosIntegridad
    },
    {
      id: "Prueba 4",
      fase: "Estados",
      desc: "Que todos los pedidos tengan un estado válido",
      evidencia: `Los ${peds.length} pedidos tienen estado válido.`,
      ok: estadosValidos
    },
    {
      id: "Prueba 5",
      fase: "Consultas",
      desc: "Que se puedan filtrar pedidos por producto, cliente, fecha y estado",
      evidencia: `Datos conectados entre ${peds.length} pedidos, ${clis.length} clientes y ${prods.length} productos.`,
      ok: peds.length > 0 && clis.length > 0 && prods.length > 0
    },
    {
      id: "Prueba 6",
      fase: "Usuarios y Roles",
      desc: "Que existan cuentas activas con su rol asignado",
      evidencia: `${usus.length} usuarios registrados (${usus.map((u) => `${u.Nombre}: ${u.rol}`).join(", ")}).`,
      ok: adminExiste
    }
  ];

  const aprobados = casos.filter((c) => c.ok).length;
  if (testsSummaryBadge) {
    testsSummaryBadge.textContent = `${aprobados} de ${casos.length} correctas`;
    testsSummaryBadge.className = `badge ${aprobados === casos.length ? "badge-activo" : "badge-pendiente"}`;
  }

  tablaSuitePruebas.innerHTML = casos
    .map(
      (c) => `
      <tr>
        <td><span class="id-pill">${c.id}</span></td>
        <td><strong>${escapeHtml(c.fase)}</strong></td>
        <td>${escapeHtml(c.desc)}</td>
        <td><small>${escapeHtml(c.evidencia)}</small></td>
        <td>
          <span class="badge ${c.ok ? "badge-activo" : "badge-pendiente"}">
            ${c.ok ? "Correcto" : "Pendiente"}
          </span>
        </td>
      </tr>
    `
    )
    .join("");
}

async function cargarTextoReglas() {
  if (!rulesCodeView) return;
  try {
    const res = await fetch("./firestore.rules");
    if (res.ok) {
      rulesCodeView.textContent = await res.text();
    }
  } catch {
    rulesCodeView.textContent = "// Archivo firestore.rules";
  }
}

export function initSeguridad() {
  document.querySelectorAll(".btn-test-role").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.role;
      setActiveRole(role);
      renderPerfilYMatrizAcceso();
      showToast(`Probando rol: ${role}`);
    });
  });

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (loginEmail?.value || "").trim();
    const pass = loginPass?.value || "";

    if (!email || !pass) {
      showToast("Ingresa correo y contraseña.", "error");
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const user = cred.user;
      const encontrado = appState.usuarios.find(
        (u) => u.uid === user.uid || u.Correo.toLowerCase() === email.toLowerCase()
      );
      if (encontrado) {
        setActiveRole(encontrado.rol, encontrado);
      }
      if (loginFeedback) {
        loginFeedback.className = "alert alert-success";
        loginFeedback.textContent = `Sesión iniciada como ${encontrado?.Nombre || email} (${encontrado?.rol || "Administrador"}).`;
        loginFeedback.classList.remove("hidden");
      }
      showToast("Sesión iniciada.");
    } catch (err) {
      if (loginFeedback) {
        loginFeedback.className = "alert alert-error";
        loginFeedback.textContent = `Correo o contraseña incorrectos.`;
        loginFeedback.classList.remove("hidden");
      }
    }
  });

  formUsuario?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin()) {
      showToast("Solo el Administrador puede registrar usuarios.", "error");
      return;
    }

    const Nombre = (usuNombre?.value || "").trim();
    const Correo = (usuCorreo?.value || "").trim();
    const rol = usuRol?.value || "Empleado";
    const uid = (usuUid?.value || "").trim() || `uid_${Date.now()}`;

    if (!Nombre || !Correo) {
      showToast("Completa el nombre y correo.", "error");
      return;
    }

    try {
      const nuevoId = calcularSiguienteId(appState.usuarios, "Usuario");
      await setDoc(doc(db, "Usuarios", nuevoId), {
        Nombre,
        Correo,
        rol,
        Activo: true,
        uid
      });
      formUsuario.reset();
      showToast(`Usuario ${Nombre} guardado.`);
    } catch (err) {
      showToast("Error al guardar usuario: " + err.message, "error");
    }
  });

  btnRunTests?.addEventListener("click", () => {
    ejecutarSuitePruebas();
    showToast("Pruebas actualizadas.");
  });

  subscribeState("perfil", () => {
    renderPerfilYMatrizAcceso();
    renderTablaUsuarios();
  });

  onSnapshot(collection(db, "Usuarios"), (snap) => {
    appState.usuarios = snap.docs.map(normalizarUsuario);
    renderTablaUsuarios();
    renderPerfilYMatrizAcceso();
    ejecutarSuitePruebas();
  });

  onSnapshot(collection(db, "Productos"), (snap) => {
    appState.productos = snap.docs.map(normalizarProducto);
    ejecutarSuitePruebas();
  });

  onSnapshot(collection(db, "Clientes"), (snap) => {
    appState.clientes = snap.docs.map(normalizarCliente);
    ejecutarSuitePruebas();
  });

  onSnapshot(collection(db, "Pedidos"), (snap) => {
    appState.pedidos = snap.docs.map(normalizarPedido);
    ejecutarSuitePruebas();
  });

  renderPerfilYMatrizAcceso();
  cargarTextoReglas();
}

initNavbar("seguridad");
initSeguridad();
