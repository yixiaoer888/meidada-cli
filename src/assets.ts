import { basename, extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { ApiClient } from "./api-client";

const MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

type UploadSignature = {
  uploadUrl: string;
  accessUrl: string;
  objectName: string;
};

async function uploadBuffer(
  client: ApiClient,
  input: { fileName: string; fileType: string; data: Uint8Array },
): Promise<{ accessUrl: string; objectName: string }> {
  const signature = await client.post<UploadSignature>("/uploads/image-url", {
    fileName: input.fileName,
    fileType: input.fileType,
  });
  const response = await fetch(signature.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.fileType },
    body: Uint8Array.from(input.data).buffer as ArrayBuffer,
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) throw new Error(`素材上传失败：${input.fileName} (HTTP ${response.status})`);
  return { accessUrl: signature.accessUrl, objectName: signature.objectName };
}

export async function uploadDocumentImage(
  client: ApiClient,
  input: { fileName: string; fileType: string; data: Uint8Array },
): Promise<string> {
  if (!input.fileType.startsWith("image/")) throw new Error(`不支持的文档图片格式：${input.fileType}`);
  return (await uploadBuffer(client, input)).accessUrl;
}

export type UploadedAsset = {
  file: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  accessUrl: string;
  objectName: string;
};

export async function uploadAsset(client: ApiClient, file: string): Promise<UploadedAsset> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`不是文件：${file}`);
  const extension = extname(file).toLowerCase();
  const fileType = MIME_TYPES[extension];
  if (!fileType) throw new Error(`不支持的素材格式：${extension || file}`);
  const fileName = basename(file);
  const endpoint = fileType.startsWith("video/") ? "/uploads/video-url" : "/uploads/image-url";
  const signature = await client.post<UploadSignature>(endpoint, {
    fileName,
    fileType,
    ...(fileType.startsWith("video/") ? { fileSize: info.size } : {}),
  });
  const response = await fetch(signature.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": fileType },
    body: await readFile(file),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) throw new Error(`素材上传失败：${fileName} (HTTP ${response.status})`);
  return {
    file,
    fileName,
    fileType,
    fileSize: info.size,
    accessUrl: signature.accessUrl,
    objectName: signature.objectName,
  };
}

export async function uploadAssets(client: ApiClient, files: string[], concurrency = 3) {
  const limit = Math.max(1, Math.min(10, Math.trunc(concurrency) || 3));
  const results: Array<
    { file: string; ok: true; asset: UploadedAsset } |
    { file: string; ok: false; error: string }
  > = new Array(files.length);
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index]!;
      try {
        results[index] = { file, ok: true, asset: await uploadAsset(client, file) };
      } catch (error) {
        results[index] = { file, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, () => worker()));
  return {
    total: files.length,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}
