import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import path from "path";
import fs from "fs";

function makeClient(): S3Client | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

const bucket = () => process.env.R2_BUCKET_NAME || "forma-billeder";

export async function r2Upload(key: string, body: Buffer, contentType: string): Promise<void> {
  const client = makeClient();
  if (!client) throw new Error("R2 not configured");
  await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function r2GetStream(key: string): Promise<Readable | null> {
  const client = makeClient();
  if (!client) return null;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return res.Body as Readable;
  } catch {
    return null;
  }
}

function mimeForExt(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function generateFilename(originalname: string): string {
  const ext = path.extname(originalname) || ".jpg";
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
}

export function createR2MulterStorage(uploadDir: string): any {
  return {
    _handleFile: async (req: any, file: any, cb: Function) => {
      const filename = generateFilename(file.originalname);
      const localPath = path.join(uploadDir, filename);

      const chunks: Buffer[] = [];
      file.stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.stream.on("error", (err: Error) => cb(err));
      file.stream.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        // Always write to local disk so downstream processing (fal upload, crop, etc.) works
        try { fs.writeFileSync(localPath, buffer); } catch { /* non-fatal */ }

        // Upload to R2 (non-blocking — local disk copy handles immediate needs)
        if (isR2Configured()) {
          r2Upload(filename, buffer, file.mimetype || mimeForExt(path.extname(filename)))
            .catch((err) => console.warn("[R2] Upload failed (falling back to disk):", err?.message));
        }

        cb(null, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          encoding: file.encoding,
          mimetype: file.mimetype,
          destination: uploadDir,
          filename,
          path: localPath,
          size: buffer.length,
        });
      });
    },
    _removeFile: (_req: any, file: any, cb: Function) => {
      fs.unlink(file.path, () => cb(null));
    },
  };
}

// Upload a local file to R2 (used for generated images and videos)
export async function r2UploadFile(localPath: string): Promise<void> {
  if (!isR2Configured()) return;
  const key = path.basename(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentType = mimeForExt(ext);
  try {
    const buffer = fs.readFileSync(localPath);
    await r2Upload(key, buffer, contentType);
  } catch (err: any) {
    console.warn(`[R2] Failed to upload ${key}:`, err?.message);
  }
}
