import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { setActiveRole } from "./state.js";
import { normalizarUsuario } from "./utils.js";

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const btnLogin = document.getElementById("btn-login");
const errorBox = document.getElementById("auth-error");
const successBox = document.getElementById("auth-success");

function showError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
  successBox?.classList.add("hidden");
}

function showSuccess(msg) {
  if (!successBox) return;
  successBox.textContent = msg;
  successBox.classList.remove("hidden");
  errorBox?.classList.add("hidden");
}

async function obtenerPerfilDesdeFirestore(user) {
  const snap = await getDocs(collection(db, "Usuarios"));
  const usuarios = snap.docs.map(normalizarUsuario);

  const correoAuth = (user.email || "").toLowerCase();
  const encontrado = usuarios.find(
    (u) =>
      u.uid === user.uid ||
      u.id === user.uid ||
      (u.Correo && u.Correo.toLowerCase() === correoAuth)
  );

  return encontrado || null;
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox?.classList.add("hidden");
  successBox?.classList.add("hidden");

  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";

  if (!email || !password) {
    showError("Ingresa tu correo de Gmail y tu contraseña.");
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = "Verificando cuenta...";

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const perfil = await obtenerPerfilDesdeFirestore(cred.user);

    if (!perfil) {
      await signOut(auth);
      showError(
        `Tu cuenta (${email}) inició sesión en Authentication, pero no se encontró en la colección "Usuarios" de Firestore.`
      );
      return;
    }

    if (perfil.Activo === false) {
      await signOut(auth);
      showError("Tu cuenta está desactivada. Contacta al Administrador.");
      return;
    }

    setActiveRole(perfil.rol, perfil);
    showSuccess(`¡Bienvenido, ${perfil.Nombre} (${perfil.rol})! Redirigiendo...`);

    setTimeout(() => {
      window.location.href = "./index.html";
    }, 600);
  } catch (err) {
    console.error("Error en login:", err);
    const mensajes = {
      "auth/invalid-credential": "El correo o la contraseña son incorrectos.",
      "auth/user-not-found": "No existe una cuenta registrada con ese correo.",
      "auth/wrong-password": "Contraseña incorrecta.",
      "auth/invalid-email": "El formato del correo electrónico no es válido.",
      "auth/too-many-requests": "Demasiados intentos fallidos. Intenta de nuevo en unos minutos."
    };
    showError(mensajes[err.code] || `No se pudo iniciar sesión: ${err.message}`);
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "Iniciar sesión";
  }
});
