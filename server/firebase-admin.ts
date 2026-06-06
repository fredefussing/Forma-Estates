import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "nordic-homebuilding1",
  });
}

export async function verifyFirebaseToken(authHeader: string | undefined): Promise<{ uid: string; email: string; name?: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Ingen token");
  }
  const token = authHeader.split("Bearer ")[1];
  const decoded = await getAuth().verifyIdToken(token);
  if (!decoded.email) {
    throw new Error("Ingen email i token");
  }
  return { uid: decoded.uid, email: decoded.email, name: decoded.name ?? undefined };
}
