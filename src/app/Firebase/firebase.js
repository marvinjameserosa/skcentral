import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD0S17-SbSzipMWDi1FfnZFYaXe_910gy0",
  authDomain: "skcentralmarikina2025.firebaseapp.com",
  databaseURL: "https://skcentralmarikina2025-default-rtdb.firebaseio.com/",
  projectId: "skcentralmarikina2025",
  storageBucket: "skcentralmarikina2025.firebasestorage.app", // corrected from .firebasestorage.app
  messagingSenderId: "188469150705",
  appId: "1:188469150705:web:4de8d569ec9952ae82fa50",
  measurementId: "G-YFV54CZED3"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

const db = getFirestore(app); 
const rtdb = getDatabase(app); // This is what your components will use
const auth = getAuth(app);
const storage = getStorage(app);

export { app, analytics, db, rtdb, auth, storage };