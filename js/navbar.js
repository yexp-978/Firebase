import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { appState, getActiveRole, setActiveRole, subscribeState } from "./state.js";
import { escapeHtml, normalizarUsuario } from "./utils.js";

const NAV_LINKS = [
  { href: "index.html", label: "🏠 Inicio", id: "index" },
  { href: "productos.html", label: "🥐 Productos (Fase 4)", id: "productos" },
  { href: "clientes.html", label: "👥 Clientes (Fase 4)", id: "clientes" },
  { href: "pedidos.html", label: "🛒 Pedidos y Carrito (Fase 5)", id: "pedidos" },
  { href: "consultas.html", label: "🔎 Consultas y Filtros (Fase 6)", id: "consultas" },
  { href: "seguridad.html", label: "🔐 Seguridad y Pruebas (F. 6 y 7)", id: "seguridad" }
];

export function initNavbar(activePageId = "") {
  let navHost = document.getElementById("coffeetech-navbar");
  if (!navHost) {
    navHost = document.createElement("header");
    navHost.id = "coffeetech-navbar";
    document.body.prepend(navHost);
  }

  const currentFile =
    activePageId ||
    window.location.pathname.split("/").pop()?.replace(".html", "") ||
    "index";

  function renderNav() {
    const rolActual = getActiveRole();
    const nombreUsuario = appState.perfil?.Nombre || "Oswaldo";
    const correoUsuario = appState.perfil?.Correo || "oswald.reyes.alcala@gmail.com";

    const linksHtml = NAV_LINKS.map((item) => {
      const isActive = currentFile === item.id;
      return `<a href="./${item.href}" class="ct-nav-link ${isActive ? "active" : ""}">${item.label}</a>`;
    }).join("");

    navHost.innerHTML = `
      <div class="ct-topbar">
        <div class="ct-brand">
          <a href="./index.html" class="ct-brand-link">
            <span class="ct-logo">☕</span>
            <div>
              <strong>CoffeeTech</strong>
              <small>Firebase Cloud Firestore</small>
            </div>
          </a>
        </div>

        <nav class="ct-nav-links">
          ${linksHtml}
        </nav>

        <div class="ct-user-controls">
          <div class="ct-user-info">
            <span class="ct-user-name">${escapeHtml(nombreUsuario)}</span>
            <small class="ct-user-email">${escapeHtml(correoUsuario)}</small>
          </div>
          <span class="badge ${rolActual === "Administrador" ? "badge-activo" : "badge-preparacion"}">
            ${escapeHtml(rolActual)}
          </span>
          <a href="./login.html" id="btn-ir-login" class="btn btn-secondary btn-sm">
            ${appState.user ? "Cambiar cuenta" : "Iniciar sesión"}
          </a>
          ${
            appState.user
              ? `<button type="button" id="btn-global-logout" class="btn btn-danger btn-sm">Cerrar sesión</button>`
              : ""
          }
        </div>
      </div>
    `;

    document.getElementById("btn-global-logout")?.addEventListener("click", async () => {
      await signOut(auth);
      localStorage.removeItem("coffeetech_active_user");
      localStorage.removeItem("coffeetech_active_role");
      appState.user = null;
      window.location.href = "./login.html";
    });
  }

  renderNav();
  subscribeState("perfil", renderNav);

  // Sincronizar automáticamente con el usuario que inició sesión en Firebase Auth (Administrador o Empleado)
  onAuthStateChanged(auth, async (user) => {
    appState.user = user;
    try {
      const snap = await getDocs(collection(db, "Usuarios"));
      const usuarios = snap.docs.map(normalizarUsuario);
      appState.usuarios = usuarios;

      if (user) {
        const match = usuarios.find(
          (u) =>
            u.uid === user.uid ||
            u.id === user.uid ||
            u.Correo.toLowerCase() === (user.email || "").toLowerCase()
        );
        if (match) {
          setActiveRole(match.rol, match);
        }
      } else if (usuarios.length > 0 && !localStorage.getItem("coffeetech_active_user")) {
        const adminDefault = usuarios[0];
        setActiveRole(getActiveRole(), adminDefault);
      }
    } catch (err) {
      console.warn("Aviso al sincronizar Usuarios:", err.message);
    }
    renderNav();
  });
}
