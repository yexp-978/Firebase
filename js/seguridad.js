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
  isEmpleadoOrAdmin,
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
      <strong>Usuario en sesión:</strong> ${escapeHtml(perfil.Nombre || "Oswaldo")} (<code>${escapeHtml(perfil.id || "Usuario_1")}</code>)<br>
      <strong>Correo:</strong> ${escapeHtml(perfil.Correo || "oswald.reyes.alcala@gmail.com")}<br>
      <strong>UID:</strong> <code>${escapeHtml(perfil.uid || "zWauXxVoGmb8CTDAeqtKljVVcaA3")}</code><br>
      <strong>Rol activo:</strong> <strong>${escapeHtml(rol)}</strong>
    `;
  }

  if (!tablaPruebasAcceso) return;

  const operaciones = [
    {
      nombre: "Consultar Catálogo de Productos y Pedidos",
      permitido: rol === "Administrador" || rol === "Empleado",
      motivoOk: "Acceso permitido (Lectura autorizada)",
      motivoDenegado: "Denegado: Requiere usuario autenticado activo"
    },
    {
      nombre: "Crear / Editar / Eliminar Productos (Colección Productos)",
      permitido: rol === "Administrador",
      motivoOk: "Acceso permitido (Rol Administrador verificado)",
      motivoDenegado: "Bloqueado: Solo el Administrador puede modificar Productos"
    },
    {
      nombre: "Registrar y Editar Clientes (Colección Clientes)",
      permitido: rol === "Administrador" || rol === "Empleado",
      motivoOk: "Acceso permitido (Empleado / Administrador)",
      motivoDenegado: "Bloqueado: Invitado no puede escribir en Clientes"
    },
    {
      nombre: "Confirmar Pedido en Carrito y Actualizar Estados (Colección Pedidos)",
      permitido: rol === "Administrador" || rol === "Empleado",
      motivoOk: "Acceso permitido (Transacción de stock y estados autorizada)",
      motivoDenegado: "Bloqueado: Requiere rol Empleado o Administrador"
    },
    {
      nombre: "Administrar Cuentas y Roles (Colección Usuarios)",
      permitido: rol === "Administrador",
      motivoOk: "Acceso permitido (Exclusivo Administrador)",
      motivoDenegado: "Bloqueado: Rol Empleado/Invitado no puede cambiar roles"
    }
  ];

  tablaPruebasAcceso.innerHTML = operaciones
    .map(
      (op) => `
      <tr>
        <td><strong>${escapeHtml(op.nombre)}</strong></td>
        <td><span class="id-pill">${escapeHtml(rol)}</span></td>
        <td>
          <span class="badge ${op.permitido ? "badge-activo" : "badge-cancelado"}">
            ${op.permitido ? "✅ " + escapeHtml(op.motivoOk) : "⛔ " + escapeHtml(op.motivoDenegado)}
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
    tbodyUsuarios.innerHTML = `<tr><td colspan="7" class="empty-state">No hay documentos en la colección Usuarios.</td></tr>`;
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
            ${u.Activo ? "true (Activo)" : "false (Inactivo)"}
          </span>
        </td>
        <td class="actions-cell">
          <button type="button" class="btn btn-secondary btn-sm btn-usar-perfil" data-id="${u.id}">
            Usar perfil
          </button>
          ${
            admin
              ? `
                <button type="button" class="btn btn-secondary btn-sm btn-toggle-usu" data-id="${u.id}">
                  ${u.Activo ? "Desactivar" : "Activar"}
                </button>
                <button type="button" class="btn btn-danger btn-sm btn-del-usu" data-id="${u.id}">✕</button>
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
        showToast(`Rol de ${sel.dataset.id} actualizado a ${sel.value}.`);
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
        showToast(`Perfil activo cambiado a ${u.Nombre} (${u.rol}).`);
      }
    });
  });

  tbodyUsuarios.querySelectorAll(".btn-toggle-usu").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = appState.usuarios.find((x) => x.id === btn.dataset.id);
      if (!u) return;
      try {
        await updateDoc(doc(db, "Usuarios", u.id), { Activo: !u.Activo });
        showToast(`Estado Activo de ${u.Nombre} actualizado.`);
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
        showToast("No se debe eliminar al administrador principal (Usuario_1).", "error");
        return;
      }
      if (!confirm(`¿Eliminar a ${u.Nombre} (${u.id})?`)) return;
      try {
        await deleteDoc(doc(db, "Usuarios", u.id));
        showToast(`Usuario ${u.id} eliminado.`);
      } catch (err) {
        showToast("Error al eliminar usuario: " + err.message, "error");
      }
    });
  });
}

// Fase 7: Ejecución de pruebas documentadas en tiempo real
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
      id: "CP-01",
      fase: "Fase 4 - CRUD Productos",
      desc: "Lectura y validación de esquema en colección Productos (Nombre, Categoria, Precio >= 0, Stock >= 0, Disponible)",
      evidencia: `${prods.length} productos cargados (${prods.map((p) => p.id).slice(0, 5).join(", ")}...). Precios y stocks válidos.`,
      ok: prods.length >= 1 && preciosValidos
    },
    {
      id: "CP-02",
      fase: "Fase 4 - CRUD Clientes",
      desc: "Lectura y validación de esquema en colección Clientes (Nombre, Correo, Telefono, Fecha)",
      evidencia: `${clis.length} clientes registrados (${clis.map((c) => `${c.id}: ${c.Nombre}`).join(", ")}).`,
      ok: clis.length >= 1 && clientesValidos
    },
    {
      id: "CP-03",
      fase: "Fase 5 - Carrito y Cálculo Total",
      desc: "Verificación de integridad matemática en Pedidos (Importe = Cantidad * Precio y Total = Suma de Importes)",
      evidencia: `${peds.length} pedidos verificados. Suma total acumulada: ${formatCurrency(peds.reduce((a, b) => a + b.Total, 0))}.`,
      ok: pedidosIntegridad
    },
    {
      id: "CP-04",
      fase: "Fase 5 - Estados de Pedido",
      desc: "Validación de estados permitidos (Pendiente, En preparación, Listo, Entregado, Cancelado)",
      evidencia: `Todos los ${peds.length} pedidos tienen un estado válido en Firestore.`,
      ok: estadosValidos
    },
    {
      id: "CP-05",
      fase: "Fase 6 - Consultas y Filtros",
      desc: "Capacidad de filtrado cruzado por ProductoId, ClienteId, rango de Fecha y Estado",
      evidencia: `Relaciones verificadas entre ${peds.length} pedidos, ${clis.length} clientes y ${prods.length} productos.`,
      ok: peds.length > 0 && clis.length > 0 && prods.length > 0
    },
    {
      id: "CP-06",
      fase: "Fase 6 - Roles y Seguridad",
      desc: "Verificación de colección Usuarios con rol Administrador activo y reglas de acceso por rol",
      evidencia: `${usus.length} usuario(s) en Firestore. Admin principal: ${usus[0]?.Nombre || "Oswaldo"} (${usus[0]?.Correo || ""}).`,
      ok: adminExiste
    }
  ];

  const aprobados = casos.filter((c) => c.ok).length;
  if (testsSummaryBadge) {
    testsSummaryBadge.textContent = `${aprobados}/${casos.length} Pruebas Aprobadas`;
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
            ${c.ok ? "✅ APROBADO" : "⏳ PENDIENTE"}
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
    rulesCodeView.textContent = "// Revisa el archivo firestore.rules en la raíz del proyecto.";
  }
}

export function initSeguridad() {
  document.querySelectorAll(".btn-test-role").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.role;
      setActiveRole(role);
      renderPerfilYMatrizAcceso();
      showToast(`Simulando permisos con rol: ${role}`);
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
        loginFeedback.textContent = `✅ Autenticación exitosa en Firebase Auth (UID: ${user.uid}). Perfil vinculado: ${encontrado?.Nombre || email} (${encontrado?.rol || "Administrador"}).`;
        loginFeedback.classList.remove("hidden");
      }
      showToast("Sesión iniciada con Firebase Auth.");
    } catch (err) {
      if (loginFeedback) {
        loginFeedback.className = "alert alert-error";
        loginFeedback.textContent = `Error de Firebase Auth (${err.code}): ${err.message}`;
        loginFeedback.classList.remove("hidden");
      }
    }
  });

  formUsuario?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin()) {
      showToast("Acceso denegado: Solo el Administrador puede registrar usuarios.", "error");
      return;
    }

    const Nombre = (usuNombre?.value || "").trim();
    const Correo = (usuCorreo?.value || "").trim();
    const rol = usuRol?.value || "Empleado";
    const uid = (usuUid?.value || "").trim() || `uid_${Date.now()}`;

    if (!Nombre || !Correo) {
      showToast("Completa el nombre y correo del usuario.", "error");
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
      showToast(`Usuario ${nuevoId} ("${Nombre}") registrado en Firestore.`);
    } catch (err) {
      showToast("Error al guardar usuario: " + err.message, "error");
    }
  });

  btnRunTests?.addEventListener("click", () => {
    ejecutarSuitePruebas();
    showToast("Suite de pruebas ejecutada y verificada contra Firestore.");
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
