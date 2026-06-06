import { initializeApp, getApps, getApp, type App } from "firebase-admin/app";
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

export async function verifyFirebaseToken(
  authHeader: string | undefined
): Promise<{ uid: string; email: string; name?: string }> {
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
      return { uid: decoded.uid, email: decoded.email, name: decoded.name ?? undefined };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
