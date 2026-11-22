import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { initNavbar } from "./navbar.js";
import { appState, isAdmin, isEmpleadoOrAdmin, subscribeState } from "./state.js";
import {
  calcularSiguienteId,
  escapeHtml,
  estadoBadgeClass,
  formatCurrency,
  formatDate,
  normalizarCliente,
  normalizarPedido,
  normalizarProducto,
  openModal,
  showToast
} from "./utils.js";

const ESTADOS_VALIDOS = ["Pendiente", "En preparación", "Listo", "Entregado", "Cancelado"];

let listaProductos = [];
let listaClientes = [];
let listaPedidos = [];
let carrito = [];

const selectCliente = document.getElementById("select-cliente");
const selectProducto = document.getElementById("select-producto");
const inputCantidad = document.getElementById("input-cantidad");
const tablaCarrito = document.getElementById("tabla-carrito");
const txtSubtotal = document.getElementById("txt-subtotal");
const txtTotal = document.getElementById("txt-total");
const btnConfirmar = document.getElementById("btn-confirmar");
const btnVaciar = document.getElementById("btn-vaciar");
const btnSeed = document.getElementById("btn-seed");
const nextIdBadge = document.getElementById("pedido-next-id");
const filtroEstado = document.getElementById("filtro-estado-pedidos");
const tablaPedidosRegistrados = document.getElementById("tabla-pedidos-registrados");
const countPedidos = document.getElementById("count-pedidos");
const roleNotice = document.getElementById("role-notice-pedidos");

export function nombreClientePorId(clienteId) {
  const cli =
    listaClientes.find((c) => c.id === clienteId) ||
    appState.clientes.find((c) => c.id === clienteId);
  return cli ? cli.Nombre : clienteId || "Sin cliente";
}

function ordenarPorNumeroId(lista) {
  return [...lista].sort((a, b) => {
    const na = Number(a.id.match(/(\d+)$/)?.[1] || 9999);
    const nb = Number(b.id.match(/(\d+)$/)?.[1] || 9999);
    return na - nb;
  });
}

function poblarSelectClientes() {
  if (!selectCliente) return;
  const prev = selectCliente.value;
  selectCliente.innerHTML = '<option value="">-- Selecciona un cliente --</option>';
  ordenarPorNumeroId(listaClientes).forEach((c) => {
    selectCliente.innerHTML += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.Nombre)} (${escapeHtml(c.id)})</option>`;
  });
  if (prev && listaClientes.some((c) => c.id === prev)) {
    selectCliente.value = prev;
  }
}

function poblarSelectProductos() {
  if (!selectProducto) return;
  const prev = selectProducto.value;
  selectProducto.innerHTML = '<option value="">-- Selecciona un producto --</option>';
  ordenarPorNumeroId(listaProductos).forEach((p) => {
    if (p.Disponible !== false && p.Stock > 0) {
      selectProducto.innerHTML += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.Nombre)} ($${p.Precio} | Stock: ${p.Stock})</option>`;
    }
  });
  if (prev && listaProductos.some((p) => p.id === prev && p.Disponible !== false && p.Stock > 0)) {
    selectProducto.value = prev;
  }
}

// 1. Cargar Clientes y Productos desde Firestore
export async function inicializar() {
  const snapClientes = await getDocs(collection(db, "Clientes"));
  listaClientes = snapClientes.docs.map(normalizarCliente);
  appState.clientes = listaClientes;
  poblarSelectClientes();

  const snapProductos = await getDocs(collection(db, "Productos"));
  listaProductos = snapProductos.docs.map(normalizarProducto);
  appState.productos = listaProductos;
  poblarSelectProductos();
}

// 2. Renderizar Carrito
function renderCarrito() {
  if (!tablaCarrito) return;
  tablaCarrito.innerHTML = "";
  let subtotal = 0;

  if (carrito.length === 0) {
    tablaCarrito.innerHTML = `<tr><td colspan="5" class="empty-state">El carrito está vacío.</td></tr>`;
    if (txtSubtotal) txtSubtotal.textContent = "0";
    if (txtTotal) txtTotal.textContent = "0";
    return;
  }

  carrito.forEach((item, index) => {
    subtotal += item.Importe;
    tablaCarrito.innerHTML += `
      <tr>
        <td><strong>${escapeHtml(item.Nombre)}</strong> <small style="color:var(--text-muted)">(${escapeHtml(item.ProductoId)})</small></td>
        <td>$${item.Precio}</td>
        <td>
          <div style="display:inline-flex;align-items:center;gap:0.35rem;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="cambiarCantidadCarrito(${index}, -1)">-</button>
            <strong>${item.Cantidad}</strong>
            <button type="button" class="btn btn-secondary btn-sm" onclick="cambiarCantidadCarrito(${index}, 1)">+</button>
          </div>
        </td>
        <td><strong>$${item.Importe}</strong></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="quitarItem(${index})">Quitar</button></td>
      </tr>
    `;
  });

  if (txtSubtotal) txtSubtotal.textContent = String(subtotal);
  if (txtTotal) txtTotal.textContent = String(subtotal);
}

window.quitarItem = (index) => {
  carrito.splice(index, 1);
  renderCarrito();
};

window.cambiarCantidadCarrito = (index, delta) => {
  const item = carrito[index];
  if (!item) return;
  const prod = listaProductos.find((p) => p.id === item.ProductoId);
  const maxStock = prod ? prod.Stock : item.Cantidad;
  const nuevaCant = item.Cantidad + delta;

  if (nuevaCant <= 0) {
    carrito.splice(index, 1);
  } else if (nuevaCant > maxStock) {
    showToast(`Stock máximo alcanzado (${maxStock} disponibles de ${item.Nombre}).`, "error");
    return;
  } else {
    item.Cantidad = nuevaCant;
    item.Importe = item.Cantidad * item.Precio;
  }
  renderCarrito();
};

// Obtener el siguiente ID consecutivo (Pedido_11, Pedido_12, etc.)
async function obtenerSiguienteIdPedido() {
  const snapPedidos = await getDocs(collection(db, "Pedidos"));
  return calcularSiguienteId(snapPedidos.docs, "Pedido");
}

// 3. Guardar pedido con transacción atómica y estructura idéntica a Pedido_1..Pedido_10
export async function guardarPedidoConTransaccion(clienteId, itemsPedido, estadoInicial = "Pendiente") {
  if (!isEmpleadoOrAdmin()) {
    throw new Error("Permiso denegado: Se requiere rol Empleado o Administrador para registrar pedidos.");
  }
  if (!clienteId) throw new Error("Debes seleccionar un cliente.");
  if (itemsPedido.length === 0) throw new Error("No se pueden generar pedidos vacíos.");

  const nuevoId = await obtenerSiguienteIdPedido();

  await runTransaction(db, async (transaction) => {
    const lecturas = [];
    for (const item of itemsPedido) {
      const prodRef = doc(db, "Productos", item.ProductoId);
      const prodSnap = await transaction.get(prodRef);

      if (!prodSnap.exists()) {
        throw new Error(`El producto ${item.Nombre} (${item.ProductoId}) ya no existe.`);
      }

      const prodData = prodSnap.data();
      const campoStock = "Stock" in prodData ? "Stock" : "stock";
      const stockActual = Number(prodData[campoStock] ?? 0);

      if (stockActual < item.Cantidad) {
        throw new Error(`Stock insuficiente para ${item.Nombre} (disponible: ${stockActual}).`);
      }

      lecturas.push({ prodRef, campoStock, nuevoStock: stockActual - item.Cantidad });
    }

    for (const { prodRef, campoStock, nuevoStock } of lecturas) {
      transaction.update(prodRef, { [campoStock]: nuevoStock });
    }

    const subtotal = itemsPedido.reduce((acc, item) => acc + item.Importe, 0);
    const nuevoPedidoRef = doc(db, "Pedidos", nuevoId);

    transaction.set(nuevoPedidoRef, {
      ClienteId: clienteId,
      Estado: estadoInicial,
      Fecha: serverTimestamp(),
      Productos: itemsPedido,
      Subtotal: subtotal,
      Total: subtotal
    });
  });

  return nuevoId;
}

// 4. Actualizar estado de un pedido en Firestore (Fase 5)
async function actualizarEstadoPedido(pedidoId, nuevoEstado) {
  if (!isEmpleadoOrAdmin()) {
    showToast("Acceso denegado: Se requiere rol Empleado o Administrador.", "error");
    renderTablaPedidos();
    return;
  }
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    showToast("Estado no válido.", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "Pedidos", pedidoId), {
      Estado: nuevoEstado
    });
    showToast(`Estado de ${pedidoId} actualizado a "${nuevoEstado}".`);
  } catch (err) {
    console.error(err);
    showToast("Error al actualizar estado: " + err.message, "error");
  }
}

async function eliminarPedido(pedido) {
  if (!isAdmin()) {
    showToast("Solo el Administrador puede eliminar un pedido.", "error");
    return;
  }
  if (!confirm(`¿Eliminar el pedido ${pedido.id} de Firestore?`)) return;
  try {
    await deleteDoc(doc(db, "Pedidos", pedido.id));
    showToast(`Pedido ${pedido.id} eliminado.`);
  } catch (err) {
    console.error(err);
    showToast("Error al eliminar pedido: " + err.message, "error");
  }
}

function verDetallePedido(pedido) {
  const nombreCli = nombreClientePorId(pedido.ClienteId);
  const filas = (pedido.Productos || [])
    .map(
      (i) => `
      <tr>
        <td><span class="id-pill">${escapeHtml(i.ProductoId)}</span></td>
        <td><strong>${escapeHtml(i.Nombre)}</strong></td>
        <td>${formatCurrency(i.Precio)}</td>
        <td>${i.Cantidad}</td>
        <td><strong>${formatCurrency(i.Importe)}</strong></td>
      </tr>
    `
    )
    .join("");

  openModal(
    `Detalle de ${pedido.id}`,
    `
      <p style="margin-bottom:0.85rem;">
        <strong>Cliente:</strong> ${escapeHtml(nombreCli)} (<code>${escapeHtml(pedido.ClienteId)}</code>)<br>
        <strong>Fecha:</strong> ${formatDate(pedido.Fecha)}<br>
        <strong>Estado:</strong> <span class="badge ${estadoBadgeClass(pedido.Estado)}">${escapeHtml(pedido.Estado)}</span>
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID Prod</th>
              <th>Producto</th>
              <th>Precio Unit.</th>
              <th>Cantidad</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div style="text-align:right;margin-top:1rem;">
        <p><strong>Subtotal:</strong> ${formatCurrency(pedido.Subtotal)}</p>
        <p style="font-size:1.15rem;"><strong>Total:</strong> ${formatCurrency(pedido.Total)}</p>
      </div>
    `
  );
}

function renderTablaPedidos() {
  if (!tablaPedidosRegistrados) return;
  const permitido = isEmpleadoOrAdmin();
  const admin = isAdmin();

  roleNotice?.classList.toggle("hidden", permitido);
  if (btnConfirmar) btnConfirmar.disabled = !permitido;

  if (nextIdBadge) {
    nextIdBadge.textContent = `Siguiente: ${calcularSiguienteId(listaPedidos, "Pedido")}`;
  }

  const estadoFiltro = filtroEstado?.value || "";
  const ordenados = ordenarPorNumeroId(listaPedidos);
  const filtrados = ordenados.filter((p) => !estadoFiltro || p.Estado === estadoFiltro);

  if (countPedidos) countPedidos.textContent = String(filtrados.length);

  if (filtrados.length === 0) {
    tablaPedidosRegistrados.innerHTML = `<tr><td colspan="7" class="empty-state">No hay pedidos que coincidan con el estado seleccionado.</td></tr>`;
    return;
  }

  tablaPedidosRegistrados.innerHTML = filtrados
    .map((p) => {
      const nombreCli = nombreClientePorId(p.ClienteId);
      const productosHtml = (p.Productos || [])
        .map(
          (item) =>
            `<div>• <strong>${item.Cantidad}x ${escapeHtml(item.Nombre)}</strong> <small style="color:var(--text-muted)">($${item.Precio} c/u = $${item.Importe})</small></div>`
        )
        .join("");

      const opcionesEstado = ESTADOS_VALIDOS.map(
        (est) => `<option value="${est}" ${p.Estado === est ? "selected" : ""}>${est}</option>`
      ).join("");

      return `
        <tr>
          <td><span class="id-pill">${escapeHtml(p.id)}</span></td>
          <td>
            <strong>${escapeHtml(nombreCli)}</strong><br>
            <small style="color:var(--text-muted)">${escapeHtml(p.ClienteId)}</small>
          </td>
          <td>${productosHtml || "—"}</td>
          <td>${formatDate(p.Fecha)}</td>
          <td>
            <small style="color:var(--text-muted)">Sub: $${p.Subtotal}</small><br>
            <strong>${formatCurrency(p.Total)}</strong>
          </td>
          <td>
            <span class="badge ${estadoBadgeClass(p.Estado)}">${escapeHtml(p.Estado)}</span>
          </td>
          <td>
            <div class="actions-cell">
              <select class="select-cambiar-estado" data-id="${p.id}" style="width:auto;min-width:140px;padding:0.35rem 0.5rem;font-size:0.84rem;" ${!permitido ? "disabled" : ""}>
                ${opcionesEstado}
              </select>
              <button type="button" class="btn btn-secondary btn-sm btn-ver-pedido" data-id="${p.id}">Ver</button>
              ${
                admin
                  ? `<button type="button" class="btn btn-danger btn-sm btn-del-pedido" data-id="${p.id}">✕</button>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  tablaPedidosRegistrados.querySelectorAll(".select-cambiar-estado").forEach((sel) => {
    sel.addEventListener("change", () => {
      actualizarEstadoPedido(sel.dataset.id, sel.value);
    });
  });

  tablaPedidosRegistrados.querySelectorAll(".btn-ver-pedido").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ped = listaPedidos.find((x) => x.id === btn.dataset.id);
      if (ped) verDetallePedido(ped);
    });
  });

  tablaPedidosRegistrados.querySelectorAll(".btn-del-pedido").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ped = listaPedidos.find((x) => x.id === btn.dataset.id);
      if (ped) eliminarPedido(ped);
    });
  });
}

export function initPedidos() {
  document.getElementById("btn-agregar")?.addEventListener("click", () => {
    const prodId = selectProducto?.value;
    const cantidad = Number(inputCantidad?.value);

    if (!prodId || Number.isNaN(cantidad) || cantidad <= 0 || !Number.isInteger(cantidad)) {
      showToast("Selecciona un producto y una cantidad entera mayor a 0.", "error");
      return;
    }

    const prod = listaProductos.find((p) => p.id === prodId);
    if (!prod) {
      showToast("Producto no encontrado.", "error");
      return;
    }

    const existente = carrito.find((item) => item.ProductoId === prodId);
    const cantidadTotal = (existente ? existente.Cantidad : 0) + cantidad;

    if (cantidadTotal > prod.Stock) {
      showToast(`Stock insuficiente. Solo quedan ${prod.Stock} unidades de ${prod.Nombre}.`, "error");
      return;
    }

    if (existente) {
      existente.Cantidad = cantidadTotal;
      existente.Importe = existente.Cantidad * existente.Precio;
    } else {
      carrito.push({
        ProductoId: prod.id,
        Nombre: prod.Nombre,
        Cantidad: cantidad,
        Precio: prod.Precio,
        Importe: prod.Precio * cantidad
      });
    }

    if (inputCantidad) inputCantidad.value = "1";
    renderCarrito();
    showToast(`${cantidad}x ${prod.Nombre} agregado al carrito.`);
  });

  btnVaciar?.addEventListener("click", () => {
    carrito = [];
    renderCarrito();
  });

  btnConfirmar?.addEventListener("click", async () => {
    if (!selectCliente?.value) {
      showToast("Selecciona un cliente antes de confirmar el pedido.", "error");
      selectCliente?.focus();
      return;
    }
    if (carrito.length === 0) {
      showToast("Agrega al menos un producto al carrito.", "error");
      return;
    }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Guardando en Firestore...";
    try {
      const nuevoId = await guardarPedidoConTransaccion(selectCliente.value, carrito, "Pendiente");
      showToast(`¡Pedido ${nuevoId} registrado y stock actualizado en Firestore!`);
      carrito = [];
      renderCarrito();
    } catch (error) {
      showToast("Error al procesar pedido: " + error.message, "error");
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "✅ Confirmar y Registrar Pedido";
    }
  });

  btnSeed?.addEventListener("click", async () => {
    const disponibles = listaProductos.filter((p) => p.Disponible !== false && p.Stock > 0);
    if (listaClientes.length === 0 || disponibles.length === 0) {
      showToast("Asegúrate de tener clientes y productos con stock en Firestore.", "error");
      return;
    }

    const snapActual = await getDocs(collection(db, "Pedidos"));
    const faltantes = Math.max(0, 10 - snapActual.size);

    if (faltantes === 0) {
      showToast(`Ya tienes ${snapActual.size} pedidos registrados en Firestore.`);
      return;
    }

    let creados = 0;
    try {
      for (let i = 0; i < faltantes; i++) {
        const clienteRandom = listaClientes[Math.floor(Math.random() * listaClientes.length)];
        const prodsConStock = listaProductos.filter((p) => p.Disponible !== false && p.Stock > 0);
        const mezclados = [...prodsConStock].sort(() => 0.5 - Math.random());
        const seleccionados = mezclados.slice(0, Math.min(2, mezclados.length));

        const itemsPrueba = seleccionados.map((prod, idx) => {
          const cant = idx === 0 ? 1 : Math.min(2, prod.Stock);
          return {
            ProductoId: prod.id,
            Nombre: prod.Nombre,
            Cantidad: cant,
            Precio: prod.Precio,
            Importe: prod.Precio * cant
          };
        });

        await guardarPedidoConTransaccion(
          clienteRandom.id,
          itemsPrueba,
          ESTADOS_VALIDOS[i % ESTADOS_VALIDOS.length]
        );
        creados++;
      }
      showToast(`¡Listo! Se crearon ${creados} pedidos nuevos.`);
    } catch (error) {
      showToast(`Se crearon ${creados} pedidos antes de detenerse: ${error.message}`, "error");
    }
  });

  filtroEstado?.addEventListener("change", renderTablaPedidos);
  subscribeState("perfil", renderTablaPedidos);

  // Suscripciones en tiempo real a Clientes, Productos y Pedidos
  onSnapshot(collection(db, "Clientes"), (snap) => {
    listaClientes = snap.docs.map(normalizarCliente);
    appState.clientes = listaClientes;
    poblarSelectClientes();
    renderTablaPedidos();
  });

  onSnapshot(collection(db, "Productos"), (snap) => {
    listaProductos = snap.docs.map(normalizarProducto);
    appState.productos = listaProductos;
    poblarSelectProductos();
  });

  onSnapshot(collection(db, "Pedidos"), (snap) => {
    listaPedidos = snap.docs.map(normalizarPedido);
    appState.pedidos = listaPedidos;
    renderTablaPedidos();
  });

  renderCarrito();
}

if (
  window.location.pathname.includes("pedidos") ||
  document.getElementById("tabla-carrito")
) {
  initNavbar("pedidos");
  initPedidos();
}
