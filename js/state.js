const ROLE_STORAGE_KEY = "coffeetech_active_role";
const USER_STORAGE_KEY = "coffeetech_active_user";

const savedRole = localStorage.getItem(ROLE_STORAGE_KEY) || "Administrador";
let savedUser = null;
try {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (raw) savedUser = JSON.parse(raw);
} catch {
  savedUser = null;
}

export const appState = {
  user: null,
  perfil: savedUser || {
    id: "Usuario_1",
    Nombre: "Oswaldo",
    Correo: "oswald.reyes.alcala@gmail.com",
    rol: savedRole,
    Activo: true,
    uid: "zWauXxVoGmb8CTDAeqtKljVVcaA3"
  },
  productos: [],
  clientes: [],
  pedidos: [],
  usuarios: []
};

const listeners = {
  productos: new Set(),
  clientes: new Set(),
  pedidos: new Set(),
  usuarios: new Set(),
  perfil: new Set()
};

export function subscribeState(key, fn) {
  listeners[key]?.add(fn);
}

export function notifyState(key) {
  listeners[key]?.forEach((fn) => fn(appState[key]));
}

export function getActiveRole() {
  return appState.perfil?.rol || localStorage.getItem(ROLE_STORAGE_KEY) || "Administrador";
}

export function setActiveRole(rol, customPerfil = null) {
  localStorage.setItem(ROLE_STORAGE_KEY, rol);
  if (customPerfil) {
    appState.perfil = { ...customPerfil, rol };
  } else if (appState.perfil) {
    appState.perfil.rol = rol;
  } else {
    appState.perfil = {
      id: "Usuario_1",
      Nombre: rol === "Administrador" ? "Oswaldo" : "Empleado Demo",
      Correo: rol === "Administrador" ? "oswald.reyes.alcala@gmail.com" : "empleado@coffeetech.com",
      rol,
      Activo: true
    };
  }
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(appState.perfil));
  notifyState("perfil");
}

export function isAdmin() {
  return getActiveRole() === "Administrador";
}

export function isEmpleadoOrAdmin() {
  const r = getActiveRole();
  return r === "Administrador" || r === "Empleado";
}
