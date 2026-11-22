import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { initNavbar } from "./navbar.js";
import {
  escapeHtml,
  estadoBadgeClass,
  formatCurrency,
  formatDate,
  normalizarCliente,
  normalizarPedido,
  normalizarProducto,
  toDateObj
} from "./utils.js";

initNavbar("index");

let mapaClientes = new Map();
let listaPedidos = [];

const kpiProductos = document.getElementById("home-kpi-productos");
const kpiClientes = document.getElementById("home-kpi-clientes");
const kpiPedidos = document.getElementById("home-kpi-pedidos");
const kpiVentas = document.getElementById("home-kpi-ventas");
const tbodyPedidos = document.getElementById("home-tabla-pedidos");

function renderUltimosPedidos() {
  if (!tbodyPedidos) return;

  const ordenados = [...listaPedidos].sort((a, b) => {
    const da = toDateObj(a.Fecha)?.getTime() || 0;
    const dbTime = toDateObj(b.Fecha)?.getTime() || 0;
    return dbTime - da;
  });

  const validos = listaPedidos.filter((p) => p.Estado !== "Cancelado");
  const totalVentas = validos.reduce((acc, p) => acc + p.Total, 0);

  if (kpiPedidos) kpiPedidos.textContent = String(listaPedidos.length);
  if (kpiVentas) kpiVentas.textContent = formatCurrency(totalVentas);

  if (ordenados.length === 0) {
    tbodyPedidos.innerHTML = `<tr><td colspan="6" class="empty-state">No hay pedidos registrados.</td></tr>`;
    return;
  }

  tbodyPedidos.innerHTML = ordenados
    .slice(0, 8)
    .map((p) => {
      const nombreCli = mapaClientes.get(p.ClienteId) || p.ClienteId;
      const detalle = p.Productos.map((i) => `${i.Cantidad}x ${escapeHtml(i.Nombre)}`).join(", ");
      return `
        <tr>
          <td><span class="id-pill">${escapeHtml(p.id)}</span></td>
          <td><strong>${escapeHtml(nombreCli)}</strong> <small style="color:var(--text-muted)">(${escapeHtml(p.ClienteId)})</small></td>
          <td>${detalle || "—"}</td>
          <td>${formatDate(p.Fecha)}</td>
          <td><strong>${formatCurrency(p.Total)}</strong></td>
          <td><span class="badge ${estadoBadgeClass(p.Estado)}">${escapeHtml(p.Estado)}</span></td>
        </tr>
      `;
    })
    .join("");
}

onSnapshot(collection(db, "Productos"), (snap) => {
  const prods = snap.docs.map(normalizarProducto);
  const disponibles = prods.filter((p) => p.Disponible && p.Stock > 0).length;
  if (kpiProductos) {
    kpiProductos.textContent = `${prods.length} (${disponibles} con stock)`;
  }
});

onSnapshot(collection(db, "Clientes"), (snap) => {
  const clientes = snap.docs.map(normalizarCliente);
  mapaClientes = new Map(clientes.map((c) => [c.id, c.Nombre]));
  if (kpiClientes) {
    kpiClientes.textContent = String(clientes.length);
  }
  renderUltimosPedidos();
});

onSnapshot(collection(db, "Pedidos"), (snap) => {
  listaPedidos = snap.docs.map(normalizarPedido);
  renderUltimosPedidos();
});
