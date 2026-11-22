import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { appState, getActiveRole, setActiveRole, subscribeState } from "./state.js";
import { escapeHtml, normalizarUsuario, showToast } from "./utils.js";

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
          <div class="ct-role-switcher" title="Cambiar rol activo para pruebas de acceso (Fase 6)">
            <label for="global-role-select">Rol:</label>
            <select id="global-role-select">
              <option value="Administrador" ${rolActual === "Administrador" ? "selected" : ""}>Administrador</option>
              <option value="Empleado" ${rolActual === "Empleado" ? "selected" : ""}>Empleado</option>
              <option value="Invitado" ${rolActual === "Invitado" ? "selected" : ""}>Invitado (Sin permiso)</option>
            </select>
          </div>
          ${
            appState.user
              ? `<button type="button" id="btn-global-logout" class="btn btn-secondary btn-sm">Salir Auth</button>`
              : ""
          }
        </div>
      </div>
    `;

    document.getElementById("global-role-select")?.addEventListener("change", (e) => {
      const nuevoRol = e.target.value;
      setActiveRole(nuevoRol);
      showToast(`Rol activo cambiado a: ${nuevoRol}`);
    });

    document.getElementById("btn-global-logout")?.addEventListener("click", async () => {
      await signOut(auth);
      appState.user = null;
      renderNav();
      showToast("Sesión de Firebase Auth cerrada.");
    });
  }

  renderNav();
  subscribeState("perfil", renderNav);

  // Sincronizar con usuario autenticado en Firebase Auth o con Usuario_1 en Firestore
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
