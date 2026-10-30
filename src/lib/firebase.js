import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredValues = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
];

const requestedMode = import.meta.env.VITE_APP_MODE || "demo";
const validMode = requestedMode === "demo" || requestedMode === "firebase";
const hasEveryFirebaseValue = requiredValues.every(Boolean);

export const firebaseConfigError = !validMode
  ? "VITE_APP_MODE must be either demo or firebase."
  : requestedMode === "firebase" && !hasEveryFirebaseValue
    ? "Firebase mode is selected, but one or more VITE_FIREBASE_* values are missing."
    : "";

export const firebaseMode = firebaseConfigError
  ? "configuration-error"
  : requestedMode;
export const isFirebaseConfigured = firebaseMode === "firebase";

let app;
let auth;
let db;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8180);
  }
}

export { app, auth, db };
