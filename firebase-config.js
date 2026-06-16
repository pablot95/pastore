// Configuración e inicialización compartida de Firebase para Estudio Pastore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth }      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCwpc7mGR3lHTUnzE_KnVqp2XyeqreCe_c",
  authDomain: "pastore-2822b.firebaseapp.com",
  projectId: "pastore-2822b",
  storageBucket: "pastore-2822b.firebasestorage.app",
  messagingSenderId: "442171041000",
  appId: "1:442171041000:web:127f835b13ae41a6ae155d"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
