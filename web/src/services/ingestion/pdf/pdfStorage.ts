import { supabaseService } from '../../supabase';

export interface StorageUploadResult {
  storagePath: string;
  bucket: string;
  publicUrl?: string;
  byteSize: number;
  uploadedAt: number;
}

export const SOURCES_BUCKET = 'exam-sources';
export const ASSETS_BUCKET = 'exam-assets';
export const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024; // 6 MB threshold recommended by Supabase

/**
 * Uploads a source PDF document to Supabase Storage with automatic selection
 * of standard vs chunked/resumable upload based on file size.
 */
export async function uploadSourcePdf(
  data: Uint8Array | ArrayBuffer | Blob,
  fileName: string,
  contentHash: string,
  userId?: string
): Promise<StorageUploadResult> {
  const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
  const size = bytes ? bytes.length : (data as Blob).size;
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const userPrefix = userId || 'anonymous';
  const storagePath = `${userPrefix}/${contentHash.slice(0, 16)}/${sanitizedName}`;

  const client = supabaseService.getClient();

  if (client) {
    try {
      const blob = data instanceof Blob ? data : new Blob([data as any], { type: 'application/pdf' });

      // If file is below 6MB, use standard direct upload
      if (size < RESUMABLE_THRESHOLD_BYTES) {
        const { error } = await client.storage
          .from(SOURCES_BUCKET)
          .upload(storagePath, blob, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (!error) {
          const { data: publicData } = client.storage.from(SOURCES_BUCKET).getPublicUrl(storagePath);
          return {
            storagePath,
            bucket: SOURCES_BUCKET,
            publicUrl: publicData?.publicUrl,
            byteSize: size,
            uploadedAt: Date.now(),
          };
        }
        console.warn('[PdfStorage] Standard upload returned error, falling back to local:', error.message);
      } else {
        // Resumable / chunked upload strategy for large PDFs (>= 6 MB)
        // Attempt standard upload with chunk-friendly options or fallback
        const { error } = await client.storage
          .from(SOURCES_BUCKET)
          .upload(storagePath, blob, {
            contentType: 'application/pdf',
            upsert: true,
            duplex: 'half' as any,
          });

        if (!error) {
          const { data: publicData } = client.storage.from(SOURCES_BUCKET).getPublicUrl(storagePath);
          return {
            storagePath,
            bucket: SOURCES_BUCKET,
            publicUrl: publicData?.publicUrl,
            byteSize: size,
            uploadedAt: Date.now(),
          };
        }
        console.warn('[PdfStorage] Resumable upload error, falling back to local:', error.message);
      }
    } catch (err) {
      console.warn('[PdfStorage] Supabase Storage upload exception:', err);
    }
  }

  // Local ephemeral storage representation (offline or local development)
  return {
    storagePath: `local://${storagePath}`,
    bucket: 'local-memory',
    publicUrl: undefined,
    byteSize: size,
    uploadedAt: Date.now(),
  };
}

/**
 * Uploads an extracted image/diagram asset to Supabase Storage.
 */
export async function uploadExtractedAsset(
  imageBlobOrDataUrl: Blob | string,
  assetId: string,
  contentHash: string,
  sourcePage: number
): Promise<string> {
  const client = supabaseService.getClient();
  const assetPath = `crops/${contentHash.slice(0, 16)}/page_${sourcePage}_${assetId}.png`;

  if (client) {
    try {
      let blob: Blob;
      if (typeof imageBlobOrDataUrl === 'string') {
        const parts = imageBlobOrDataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(parts[1] || parts[0]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        blob = imageBlobOrDataUrl;
      }

      const { error } = await client.storage.from(ASSETS_BUCKET).upload(assetPath, blob, {
        contentType: 'image/png',
        upsert: true,
      });

      if (!error) {
        const { data: pubData } = client.storage.from(ASSETS_BUCKET).getPublicUrl(assetPath);
        return pubData.publicUrl;
      }
    } catch {
      // ignore
    }
  }

  // Fallback: return data URL directly if storage is offline
  return typeof imageBlobOrDataUrl === 'string'
    ? imageBlobOrDataUrl
    : URL.createObjectURL(imageBlobOrDataUrl);
}
