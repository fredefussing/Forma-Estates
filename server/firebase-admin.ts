import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Accept tokens from both old and new Firebase project
const ACCEPTED_PROJECTS = [
  process.env.FIREBASE_PROJECT_ID || "nordic-homebuilding",
  "nordic-homebuilding1",
];

function getOrCreateApp(projectId: string): App {
  try {
    return getApp(projectId);
  } catch {
    return initializeApp({ projectId }, projectId);
  }
}

// Updates a Firebase user's password using a service-account credential.
// Requires FIREBASE_SERVICE_ACCOUNT_JSON to be set (JSON string).
export async function updateFirebasePassword(uid: string, newPassword: string): Promise<void> {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON er ikke konfigureret");
  const serviceAccount = JSON.parse(json);
  const appName = "admin-sa";
  let saApp: App;
  try {
    saApp = getApp(appName);
  } catch {
    saApp = initializeApp({ credential: cert(serviceAccount) }, appName);
  }
  await getAuth(saApp).updateUser(uid, { password: newPassword });
}

export async function verifyFirebaseToken(
  authHeader: string | undefined
): Promise<{ uid: string; email: string; name?: string; emailVerified?: boolean }> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Ingen token");
  }
  const token = authHeader.split("Bearer ")[1];

  let lastError: unknown;
  for (const projectId of ACCEPTED_PROJECTS) {
    try {
      const app = getOrCreateApp(projectId);
      const decoded = await getAuth(app).verifyIdToken(token);
      if (!decoded.email) throw new Error("Ingen email i token");
      return { uid: decoded.uid, email: decoded.email, name: decoded.name ?? undefined, emailVerified: decoded.email_verified === true };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
