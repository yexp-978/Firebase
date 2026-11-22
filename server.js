const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".rules": "text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const rawUrl = (req.url || "/").split("?")[0];
  let safePath = decodeURIComponent(rawUrl);

  if (safePath === "/") {
    safePath = "/index.html";
  } else if (!path.extname(safePath)) {
    const htmlCandidate = path.join(ROOT, safePath + ".html");
    if (fs.existsSync(htmlCandidate)) {
      safePath = safePath + ".html";
    }
  }

  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Acceso denegado");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>404 - No encontrado</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;">
  <h2>Página no encontrada: ${safePath}</h2>
  <p><a href="/index.html">Volver al inicio de CoffeeTech</a></p>
</body>
</html>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function startServer(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Puerto ${port} ocupado, intentando con ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Error al iniciar el servidor:", err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log("====================================================");
    console.log("  ☕ CoffeeTech - Servidor de Desarrollo Activo");
    console.log("====================================================");
    console.log(`  Login (Sesión):   http://localhost:${port}/login.html`);
    console.log(`  Inicio / Panel:   http://localhost:${port}/index.html`);
    console.log(`  Productos (CRUD): http://localhost:${port}/productos.html`);
    console.log(`  Clientes (CRUD):  http://localhost:${port}/clientes.html`);
    console.log(`  Pedidos (Fase 5): http://localhost:${port}/pedidos.html`);
    console.log(`  Consultas (F. 6): http://localhost:${port}/consultas.html`);
    console.log(`  Seguridad/Pruebas:http://localhost:${port}/seguridad.html`);
    console.log("====================================================");
    console.log("  Presiona Ctrl + C para detener el servidor.");
  });
}

startServer(PORT);
