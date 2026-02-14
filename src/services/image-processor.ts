import type { SlackFile, ImageData, ImageAnalysisResult } from '../types/index.js';
import { SlackClient } from './slack-client.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class ImageProcessor {
  private slackClient: SlackClient;
  private workerUrl: string;

  constructor(slackClient: SlackClient, workerUrl: string) {
    this.slackClient = slackClient;
    this.workerUrl = workerUrl;
  }

  /**
   * Slack에서 이미지 다운로드 → Base64 변환
   * 5MB 초과 시 Slack 썸네일로 자동 폴백
   */
  async downloadAndEncode(file: SlackFile): Promise<ImageData | null> {
    let downloadUrl = file.url_private;

    // 5MB 초과 시 Slack 썸네일 사용
    if (file.size > MAX_FILE_SIZE) {
      if (file.thumb_1024) {
        downloadUrl = file.thumb_1024;
        console.log(`File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB, using thumb_1024`);
      } else if (file.thumb_720) {
        downloadUrl = file.thumb_720;
        console.log(`File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB, using thumb_720`);
      } else {
        console.warn(`File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB with no thumbnail, skipping`);
        return null;
      }
    }

    try {
      const buffer = await this.slackClient.downloadFile(downloadUrl);
      const bytes = new Uint8Array(buffer);

      // ArrayBuffer → Base64 (Cloudflare Workers compatible)
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      return {
        data: base64,
        mimeType: file.mimetype,
        fileName: file.name,
        size: bytes.length,
      };
    } catch (error) {
      console.error(`Failed to download image ${file.name}:`, error);
      return null;
    }
  }

  /**
   * 여러 이미지를 다운로드 (실패한 것은 스킵)
   */
  async downloadAll(files: SlackFile[]): Promise<ImageData[]> {
    const results = await Promise.allSettled(
      files.map(file => this.downloadAndEncode(file))
    );

    const images: ImageData[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        images.push(result.value);
      }
    }

    console.log(`Downloaded ${images.length}/${files.length} images successfully`);
    return images;
  }

  /**
   * Worker Vision API로 이미지 분석 (POST /)
   */
  async analyzeImages(
    imageDataList: ImageData[],
    context?: string
  ): Promise<ImageAnalysisResult> {
    try {
      const response = await fetch(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'slack-linear-sync/1.0',
        },
        body: JSON.stringify({
          images: imageDataList.map(img => ({
            data: img.data,
            mimeType: img.mimeType,
          })),
          context: context || '',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Vision API error: ${response.status} - ${errorText}`);
        return { title: '', description: '', success: false, error: `Vision API error: ${response.status}` };
      }

      return await response.json() as ImageAnalysisResult;
    } catch (error) {
      console.error('Vision analysis failed:', error);
      return {
        title: '',
        description: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Worker R2 업로드 (POST /upload)
   */
  async uploadImages(imageDataList: ImageData[]): Promise<string[]> {
    const urls: string[] = [];

    const results = await Promise.allSettled(
      imageDataList.map(async (img) => {
        const response = await fetch(`${this.workerUrl}/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'slack-linear-sync/1.0',
          },
          body: JSON.stringify({
            data: img.data,
            mimeType: img.mimeType,
            fileName: img.fileName,
          }),
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }

        const result = await response.json() as { url: string };
        return result.url;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        urls.push(result.value);
      } else {
        console.error('Image upload failed:', result.reason);
      }
    }

    console.log(`Uploaded ${urls.length}/${imageDataList.length} images to R2`);
    return urls;
  }
}
