import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";
import path from "path";
import fs from "fs";
import { isLoadTestMode } from "./load-test";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";

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

function requireR2Configuration(): S3Client {
  const client = makeClient();
  if (!client || !process.env.R2_BUCKET_NAME) {
    throw new Error("Durable media storage is not configured. Set all R2_* variables before accepting customer media.");
  }
  return client;
}
export async function r2Upload(key: string, body: Buffer, contentType: string): Promise<void> {
  const client = requireR2Configuration();
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

export async function r2ObjectExists(key: string): Promise<boolean> {
  const client = requireR2Configuration();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (error: any) {
    const code = error?.$metadata?.httpStatusCode;
    if (code === 404 || error?.name === "NotFound") return false;
    throw error;
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
        try {
          const buffer = Buffer.concat(chunks);
          // Keep a local working copy for downstream transformations, but do not
          // hand the request to a route until the durable copy has been accepted.
          fs.writeFileSync(localPath, buffer);
          // The capacity harness runs only under NODE_ENV=test and deliberately
          // avoids external writes. Every real customer upload waits for R2.
          if (!isLoadTestMode()) {
            await r2Upload(filename, buffer, file.mimetype || mimeForExt(path.extname(filename)));
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
        } catch (error) {
          fs.promises.unlink(localPath).catch(() => {});
          cb(error);
        }
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

// Return a short-lived presigned GET URL for a key (default: 1 hour).
// Returns null when R2 is not configured.
export async function r2GetSignedUrl(key: string, expiresInSeconds = 3600): Promise<string | null> {
  const client = makeClient();
  if (!client) return null;
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
      { expiresIn: expiresInSeconds },
    );
    return url;
  } catch {
    return null;
  }
}

// Return the public base URL for R2 direct access.
// Set R2_PUBLIC_URL to a Cloudflare custom domain (e.g. https://assets.example.com)
// or the r2.dev public subdomain. When not set, falls back to presigned URLs.
export function r2GetPublicUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${encodeURIComponent(key)}`;
}

// Upload a local file to R2 som en stream med ContentLength.
// ContentLength er KRITISK — uden den bufferer AWS SDK hele filen i RAM.
// Kaster fejl ved fejl — kalder skal selv catch/warn.
export async function r2UploadFile(localPath: string, key = path.basename(localPath)): Promise<void> {
  const client = requireR2Configuration();
  const ext = path.extname(localPath).toLowerCase();
  const contentType = mimeForExt(ext);
  const contentLength = fs.statSync(localPath).size;
  const stream = fs.createReadStream(localPath);
  await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: stream as any, ContentType: contentType, ContentLength: contentLength }));
}
