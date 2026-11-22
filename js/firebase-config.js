import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDUP3MOAbHvZvoxQhMB2RhUGDrHrStSlS8",
  authDomain: "coffeetech-fd815.firebaseapp.com",
  projectId: "coffeetech-fd815",
  storageBucket: "coffeetech-fd815.firebasestorage.app",
  messagingSenderId: "888546059999",
  appId: "1:888546059999:web:a021dff0de874c34232b6a"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "default");
export const auth = getAuth(app);

export function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === "SecondaryAuthApp");
  const secApp = existing || initializeApp(firebaseConfig, "SecondaryAuthApp");
  return getAuth(secApp);
}
