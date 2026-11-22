/**
 * Escapa caracteres HTML para evitar inyección al renderizar plantillas.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Formatea un número en pesos mexicanos ($0.00 MXN).
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return `$${num.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} MXN`;
}

/**
 * Convierte un Timestamp de Firestore o Date a objeto Date válido o null.
 */
export function toDateObj(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts === "object" && typeof ts.seconds === "number") {
    return new Date(ts.seconds * 1000);
  }
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Convierte un Timestamp de Firestore o Date a texto legible.
 */
export function formatDate(ts) {
  const date = toDateObj(ts);
  if (!date) return "—";
  return date.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Muestra una notificación flotante temporal.
 */
export function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3800);
}

/**
 * Abre un modal global (creándolo si no existe en la página actual).
 */
export function openModal(title, bodyHtml) {
  let backdrop = document.getElementById("modal-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "modal-backdrop";
    backdrop.className = "modal-backdrop hidden";
    backdrop.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 id="modal-title">Detalle</h3>
          <button type="button" id="btn-cerrar-modal" class="btn btn-secondary btn-sm">Cerrar</button>
        </div>
        <div id="modal-body"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") closeModal();
    });
    document.getElementById("btn-cerrar-modal")?.addEventListener("click", closeModal);
  }

  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = bodyHtml;
  backdrop.classList.remove("hidden");
}

export function closeModal() {
  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) {
    backdrop.classList.add("hidden");
  }
}

export function estadoBadgeClass(estado) {
  const map = {
    "Pendiente": "badge-pendiente",
    "En preparación": "badge-preparacion",
    "Listo": "badge-listo",
    "Entregado": "badge-entregado",
    "Cancelado": "badge-cancelado"
  };
  return map[estado] || "badge-pendiente";
}

/**
 * Normaliza un documento de Producto desde Firestore respetando PascalCase.
 */
export function normalizarProducto(docSnap) {
  const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  const id = docSnap.id || data.id || "";
  return {
    id,
    Nombre: data.Nombre ?? data.nombre ?? id,
    Categoria: data.Categoria ?? data.categoria ?? "General",
    Descripcion: data.Descripcion ?? data.descripcion ?? "",
    Precio: Number(data.Precio ?? data.precio ?? 0),
    Stock: Number(data.Stock ?? data.stock ?? 0),
    Disponible: data.Disponible ?? data.disponible ?? true
  };
}

/**
 * Normaliza un documento de Cliente desde Firestore respetando PascalCase.
 */
export function normalizarCliente(docSnap) {
  const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  const id = docSnap.id || data.id || "";
  return {
    id,
    Nombre: data.Nombre ?? data.nombre ?? id,
    Correo: data.Correo ?? data.correo ?? "",
    Telefono: String(data.Telefono ?? data.telefono ?? ""),
    Fecha: data.Fecha ?? data.fecha ?? data.fechaRegistro ?? null
  };
}

/**
 * Normaliza un documento de Pedido desde Firestore respetando PascalCase.
 */
export function normalizarPedido(docSnap) {
  const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  const id = docSnap.id || data.id || "";
  const rawItems = Array.isArray(data.Productos)
    ? data.Productos
    : Array.isArray(data.productos)
      ? data.productos
      : [];

  const Productos = rawItems.map((item) => ({
    ProductoId: item.ProductoId ?? item.productoId ?? "",
    Nombre: item.Nombre ?? item.nombre ?? "",
    Cantidad: Number(item.Cantidad ?? item.cantidad ?? 0),
    Precio: Number(item.Precio ?? item.precio ?? item.precioUnitario ?? 0),
    Importe: Number(item.Importe ?? item.importe ?? 0)
  }));

  const Subtotal = Number(
    data.Subtotal ?? data.subtotal ?? Productos.reduce((acc, i) => acc + i.Importe, 0)
  );
  const Total = Number(data.Total ?? data.total ?? Subtotal);

  return {
    id,
    ClienteId: data.ClienteId ?? data.clienteId ?? "",
    Estado: data.Estado ?? data.estado ?? "Pendiente",
    Fecha: data.Fecha ?? data.fecha ?? null,
    Productos,
    Subtotal,
    Total
  };
}

/**
 * Normaliza un documento de Usuario desde Firestore respetando PascalCase y camelCase (`rol`, `uid`).
 */
export function normalizarUsuario(docSnap) {
  const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  const id = docSnap.id || data.id || "";
  return {
    id,
    Nombre: data.Nombre ?? data.nombre ?? "Usuario",
    Correo: data.Correo ?? data.correo ?? "",
    rol: data.rol ?? data.Rol ?? "Empleado",
    Activo: data.Activo ?? data.activo ?? true,
    uid: data.uid ?? data.UID ?? id
  };
}

/**
 * Calcula el siguiente ID consecutivo con prefijo (ej. Prod_11, Cliente_6, Pedido_11, Usuario_2).
 */
export function calcularSiguienteId(docsSnapOrArray, prefix) {
  const regex = new RegExp(`^${prefix}_(\\d+)$`, "i");
  let maxNum = 0;
  let count = 0;

  docsSnapOrArray.forEach((d) => {
    count++;
    const id = d.id || "";
    const match = id.match(regex);
    if (match) {
      const num = Number(match[1]);
      if (num > maxNum) maxNum = num;
    }
  });

  const siguiente = Math.max(maxNum, count) + 1;
  return `${prefix}_${siguiente}`;
}
