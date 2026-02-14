import type { SlackFile, ImageData, ImageAnalysisResult } from '../types/index.js';
import { SlackClient } from './slack-client.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class ImageProcessor {
  private slackClient: SlackClient;
  private workerUrl: string;
  private aiWorker?: Fetcher;

  constructor(slackClient: SlackClient, workerUrl: string, aiWorker?: Fetcher) {
    this.slackClient = slackClient;
    this.workerUrl = workerUrl;
    this.aiWorker = aiWorker;
  }

  /**
   * fetch via Service Binding (Worker-to-Worker) or fallback to regular fetch
   */
  private async workerFetch(path: string, init: RequestInit): Promise<Response> {
    if (this.aiWorker) {
      // Service Binding: URL host is ignored, path is used for routing
      return this.aiWorker.fetch(new Request(`https://ai-worker${path}`, init));
    }
    return fetch(`${this.workerUrl}${path}`, init);
  }

  async downloadAndEncode(file: SlackFile): Promise<ImageData | null> {
    let downloadUrl = file.url_private;
    let usedThumbnail = false;

    if (file.size > MAX_FILE_SIZE) {
      if (file.thumb_1024) {
        downloadUrl = file.thumb_1024;
        usedThumbnail = true;
        console.log(`File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB, using thumb_1024`);
      } else if (file.thumb_720) {
        downloadUrl = file.thumb_720;
        usedThumbnail = true;
        console.log(`File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB, using thumb_720`);
      } else {
        console.warn(`File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB with no thumbnail, skipping`);
        return null;
      }
    }

    try {
      console.log(`Downloading: ${file.name} (${file.mimetype}, ${file.size}B, thumb:${usedThumbnail})`);

      const downloadUrlAlt = usedThumbnail ? undefined : file.url_private_download;
      const buffer = await this.slackClient.downloadFile(downloadUrl, downloadUrlAlt);
      const bytes = new Uint8Array(buffer);

      console.log(`Downloaded ${bytes.length}B, magic:[${bytes[0]},${bytes[1]},${bytes[2]},${bytes[3]}]`);

      // Validate image magic bytes
      const isPng = bytes[0] === 137 && bytes[1] === 80;
      const isJpeg = bytes[0] === 255 && bytes[1] === 216;
      const isGif = bytes[0] === 71 && bytes[1] === 73;
      const isWebp = bytes[0] === 82 && bytes[1] === 73;
      if (!isPng && !isJpeg && !isGif && !isWebp) {
        console.error(`Invalid image data for ${file.name} - not a valid image format`);
        const textPreview = new TextDecoder().decode(bytes.slice(0, 200));
        console.error(`Data preview: ${textPreview}`);
        return null;
      }

      // ArrayBuffer to Base64
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      console.log(`Encoded: ${base64.length} chars`);

      return {
        data: base64,
        mimeType: file.mimetype,
        fileName: file.name,
        size: bytes.length,
      };
    } catch (error) {
      console.error(`Failed to download ${file.name}:`, error);
      return null;
    }
  }

  async downloadAll(files: SlackFile[]): Promise<ImageData[]> {
    const results = await Promise.allSettled(
      files.map(file => this.downloadAndEncode(file))
    );

    const images: ImageData[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        images.push(result.value);
      } else if (result.status === 'rejected') {
        console.error('Download rejected:', result.reason);
      }
    }

    console.log(`Downloaded ${images.length}/${files.length} images`);
    return images;
  }

  async analyzeImages(
    imageDataList: ImageData[],
    context?: {
      projects?: Array<{ id: string; name: string; description?: string; recentIssueTitles?: string[] }>;
      users?: Array<{ id: string; name: string }>;
    }
  ): Promise<ImageAnalysisResult> {
    try {
      const requestBody = {
        images: imageDataList.map(img => ({
          data: img.data,
          mimeType: img.mimeType,
        })),
        context: context || undefined,
        model: 'haiku',
        language: 'ko',
      };

      console.log(`Vision API: ${imageDataList.length} images, body ~${Math.round(JSON.stringify(requestBody).length / 1024)}KB`);

      const response = await this.workerFetch('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'slack-linear-sync/1.0',
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`Vision API response: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Vision API error: ${response.status} - ${errorText.slice(0, 500)}`);
        return { title: '', description: '', success: false, error: `Vision API: ${response.status}` };
      }

      const result = await response.json() as ImageAnalysisResult;
      console.log(`Vision result: success=${result.success}, title="${result.title}"`);
      return result;
    } catch (error) {
      console.error('Vision failed:', error);
      return {
        title: '',
        description: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async uploadImages(imageDataList: ImageData[]): Promise<string[]> {
    try {
      const response = await this.workerFetch('/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'slack-linear-sync/1.0',
        },
        body: JSON.stringify({
          images: imageDataList.map(img => ({
            data: img.data,
            mimeType: img.mimeType,
            fileName: img.fileName,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`R2 upload error: ${response.status} - ${errorText.slice(0, 200)}`);
        return [];
      }

      const result = await response.json() as { success: boolean; urls?: string[]; error?: string };
      if (!result.success || !result.urls) {
        console.error('R2 upload failed:', result.error);
        return [];
      }

      console.log(`R2 uploaded: ${result.urls.join(', ')}`);
      return result.urls;
    } catch (error) {
      console.error('Upload failed:', error);
      return [];
    }
  }
}
