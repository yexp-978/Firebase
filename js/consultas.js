import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { initNavbar } from "./navbar.js";
import { appState } from "./state.js";
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

const filtroProducto = document.getElementById("rep-producto");
const filtroCliente = document.getElementById("rep-cliente");
const filtroEstado = document.getElementById("rep-estado");
const filtroDesde = document.getElementById("rep-desde");
const filtroHasta = document.getElementById("rep-hasta");
const btnLimpiar = document.getElementById("btn-rep-limpiar");
const resumenFiltros = document.getElementById("rep-resumen-filtros");

const kpiVentas = document.getElementById("kpi-ventas");
const kpiPedidos = document.getElementById("kpi-pedidos");
const kpiTicket = document.getElementById("kpi-ticket");
const kpiUnidades = document.getElementById("kpi-unidades");
const tbodyTop = document.getElementById("tabla-top-productos");
const tbodyPedidos = document.getElementById("tabla-reportes-pedidos");

function ordenarPorNumeroId(lista) {
  return [...lista].sort((a, b) => {
    const na = Number(a.id.match(/(\d+)$/)?.[1] || 9999);
    const nb = Number(b.id.match(/(\d+)$/)?.[1] || 9999);
    return na - nb;
  });
}

function nombreCliente(clienteId) {
  const c = appState.clientes.find((x) => x.id === clienteId);
  return c ? `${c.Nombre} (${c.id})` : clienteId;
}

function poblarSelectsConsulta() {
  if (filtroCliente) {
    const prev = filtroCliente.value;
    const opts = ordenarPorNumeroId(appState.clientes)
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.Nombre)} (${escapeHtml(c.id)})</option>`)
      .join("");
    filtroCliente.innerHTML = `<option value="">Todos los clientes</option>${opts}`;
    if (prev) filtroCliente.value = prev;
  }

  if (filtroProducto) {
    const prev = filtroProducto.value;
    const opts = ordenarPorNumeroId(appState.productos)
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.Nombre)} (${escapeHtml(p.id)})</option>`)
      .join("");
    filtroProducto.innerHTML = `<option value="">Todos los productos</option>${opts}`;
    if (prev) filtroProducto.value = prev;
  }
}

export function renderConsultas() {
  if (!tbodyPedidos) return;

  const productoId = filtroProducto?.value || "";
  const clienteId = filtroCliente?.value || "";
  const estado = filtroEstado?.value || "";
  const desdeStr = filtroDesde?.value || "";
  const hastaStr = filtroHasta?.value || "";

  const desdeDate = desdeStr ? new Date(`${desdeStr}T00:00:00`) : null;
  const hastaDate = hastaStr ? new Date(`${hastaStr}T23:59:59.999`) : null;

  const activos = [];
  if (productoId) activos.push(`Producto: ${productoId}`);
  if (clienteId) activos.push(`Cliente: ${clienteId}`);
  if (estado) activos.push(`Estado: ${estado}`);
  if (desdeStr) activos.push(`Desde: ${desdeStr}`);
  if (hastaStr) activos.push(`Hasta: ${hastaStr}`);
  if (resumenFiltros) {
    resumenFiltros.textContent =
      activos.length > 0 ? `Filtros activos: ${activos.join(" | ")}` : "Mostrando todos los pedidos";
  }

  const ordenados = ordenarPorNumeroId(appState.pedidos);
  const filtrados = ordenados.filter((p) => {
    if (estado && p.Estado !== estado) return false;
    if (clienteId && p.ClienteId !== clienteId) return false;
    if (
      productoId &&
      !(Array.isArray(p.Productos) && p.Productos.some((item) => item.ProductoId === productoId))
    ) {
      return false;
    }

    const fecha = toDateObj(p.Fecha);
    if (desdeDate && (!fecha || fecha < desdeDate)) return false;
    if (hastaDate && (!fecha || fecha > hastaDate)) return false;

    return true;
  });

  const validosParaVenta = filtrados.filter((p) => p.Estado !== "Cancelado");
  const ventasTotales = validosParaVenta.reduce((sum, p) => sum + (Number(p.Total) || 0), 0);
  const ticketPromedio = validosParaVenta.length > 0 ? ventasTotales / validosParaVenta.length : 0;

  let totalUnidades = 0;
  const acumuladoProductos = new Map();

  validosParaVenta.forEach((p) => {
    (p.Productos || []).forEach((item) => {
      if (productoId && item.ProductoId !== productoId) return;
      totalUnidades += Number(item.Cantidad) || 0;

      const actual = acumuladoProductos.get(item.ProductoId) || {
        id: item.ProductoId,
        nombre: item.Nombre,
        pedidosCount: 0,
        unidades: 0,
        ingresos: 0
      };
      actual.pedidosCount += 1;
      actual.unidades += Number(item.Cantidad) || 0;
      actual.ingresos += Number(item.Importe) || 0;
      acumuladoProductos.set(item.ProductoId, actual);
    });
  });

  if (kpiPedidos) kpiPedidos.textContent = `${filtrados.length} de ${appState.pedidos.length}`;
  if (kpiVentas) kpiVentas.textContent = formatCurrency(ventasTotales);
  if (kpiTicket) kpiTicket.textContent = formatCurrency(ticketPromedio);
  if (kpiUnidades) kpiUnidades.textContent = `${totalUnidades} uds`;

  if (filtrados.length === 0) {
    tbodyPedidos.innerHTML = `<tr><td colspan="7" class="empty-state">No se encontraron pedidos con los criterios seleccionados.</td></tr>`;
  } else {
    tbodyPedidos.innerHTML = filtrados
      .map((p) => {
        const itemsTxt = (p.Productos || [])
          .map((i) => {
            const resaltado = productoId && i.ProductoId === productoId;
            return `<span style="${resaltado ? "background:#fffaeb;padding:2px 6px;border-radius:4px;font-weight:700;" : ""}">${i.Cantidad}x ${escapeHtml(i.Nombre)} ($${i.Importe})</span>`;
          })
          .join(", ");

        return `
          <tr>
            <td><span class="id-pill">${escapeHtml(p.id)}</span></td>
            <td>${formatDate(p.Fecha)}</td>
            <td><strong>${escapeHtml(nombreCliente(p.ClienteId))}</strong></td>
            <td>${itemsTxt}</td>
            <td>${formatCurrency(p.Subtotal)}</td>
            <td><strong>${formatCurrency(p.Total)}</strong></td>
            <td><span class="badge ${estadoBadgeClass(p.Estado)}">${escapeHtml(p.Estado)}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  const topLista = Array.from(acumuladoProductos.values()).sort((a, b) => b.unidades - a.unidades);
  if ( tbodyTop ) {
    if (topLista.length === 0) {
      tbodyTop.innerHTML = `<tr><td colspan="5" class="empty-state">Sin productos vendidos en el filtro actual.</td></tr>`;
    } else {
      tbodyTop.innerHTML = topLista
        .map(
          (t) => `
          <tr>
            <td><span class="id-pill">${escapeHtml(t.id)}</span></td>
            <td><strong>${escapeHtml(t.nombre)}</strong></td>
            <td>${t.pedidosCount} pedido(s)</td>
            <td><strong>${t.unidades} uds</strong></td>
            <td><strong>${formatCurrency(t.ingresos)}</strong></td>
          </tr>
        `
        )
        .join("");
    }
  }
}

export function initConsultas() {
  [filtroProducto, filtroCliente, filtroEstado, filtroDesde, filtroHasta].forEach((el) => {
    el?.addEventListener("change", renderConsultas);
  });

  btnLimpiar?.addEventListener("click", () => {
    if (filtroProducto) filtroProducto.value = "";
    if (filtroCliente) filtroCliente.value = "";
    if (filtroEstado) filtroEstado.value = "";
    if (filtroDesde) filtroDesde.value = "";
    if (filtroHasta) filtroHasta.value = "";
    renderConsultas();
  });

  onSnapshot(collection(db, "Clientes"), (snap) => {
    appState.clientes = snap.docs.map(normalizarCliente);
    poblarSelectsConsulta();
    renderConsultas();
  });

  onSnapshot(collection(db, "Productos"), (snap) => {
    appState.productos = snap.docs.map(normalizarProducto);
    poblarSelectsConsulta();
    renderConsultas();
  });

  onSnapshot(collection(db, "Pedidos"), (snap) => {
    appState.pedidos = snap.docs.map(normalizarPedido);
    renderConsultas();
  });
}

initNavbar("consultas");
initConsultas();
