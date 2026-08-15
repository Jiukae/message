import fs from "fs";
import path from "path";
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch
} from "firebase/firestore";

let firestoreInstance: Firestore | null = null;
let firebaseAppInstance: FirebaseApp | null = null;

export function getFirestoreClient(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!config.apiKey || !config.projectId) {
      return null;
    }

    const apps = getApps();
    firebaseAppInstance = apps.length === 0 ? initializeApp(config) : apps[0];

    if (config.firestoreDatabaseId && config.firestoreDatabaseId !== "(default)") {
      firestoreInstance = getFirestore(firebaseAppInstance, config.firestoreDatabaseId);
    } else {
      firestoreInstance = getFirestore(firebaseAppInstance);
    }

    return firestoreInstance;
  } catch (err) {
    console.warn("Client Firestore initialization error:", err);
    return null;
  }
}

export { collection, doc, getDocs, setDoc, writeBatch };
