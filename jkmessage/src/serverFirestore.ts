import fs from "fs";
import path from "path";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let firestoreInstance: Firestore | null = null;

export function getFirestoreDB(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!config.projectId) {
      return null;
    }

    const apps = getApps();
    const app = apps.length === 0 ? initializeApp({ projectId: config.projectId }) : apps[0];

    if (config.firestoreDatabaseId && config.firestoreDatabaseId !== "(default)") {
      firestoreInstance = getFirestore(app, config.firestoreDatabaseId);
    } else {
      firestoreInstance = getFirestore(app);
    }

    return firestoreInstance;
  } catch (err) {
    console.warn("Firestore initialization skipped or failed, falling back to local storage:", err);
    return null;
  }
}
