import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

// Delete one or more keys from R2
export async function r2DeleteFiles(keys: string[]): Promise<void> {
  if (!isR2Configured() || keys.length === 0) return;
  const client = makeClient();
  if (!client) return;
  try {
    if (keys.length === 1) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: keys[0] }));
    } else {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: keys.map((k) => ({ Key: k })) },
      }));
    }
  } catch (err: any) {
    console.warn("[R2] Delete failed:", err?.message);
  }
}

// List all objects in the R2 bucket (paginates automatically)
export async function r2ListAllObjects(): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const client = makeClient();
  if (!client) return [];
  const results: { key: string; size: number; lastModified: Date }[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket(),
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key) results.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified ?? new Date(0) });
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  return results;
}

// Upload a local file to R2 som en stream med ContentLength.
// ContentLength er KRITISK — uden den bufferer AWS SDK hele filen i RAM.
// Kaster fejl ved fejl — kalder skal selv catch/warn.
export async function r2UploadFile(localPath: string): Promise<void> {
  if (!isR2Configured()) return;
  const client = makeClient();
  if (!client) return;
  const key = path.basename(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentType = mimeForExt(ext);
  const contentLength = fs.statSync(localPath).size;
  const stream = fs.createReadStream(localPath);
  await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: stream as any, ContentType: contentType, ContentLength: contentLength }));
}
