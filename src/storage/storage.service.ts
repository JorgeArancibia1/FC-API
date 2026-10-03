import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import { envs } from '../config/envs';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export interface SignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService');
  private storage?: Storage;
  private readonly bucketName: string;

  constructor() {
    this.bucketName = envs.gcsBucketName;
    if (this.bucketName) {
      // Credenciales se resuelven via GOOGLE_APPLICATION_CREDENTIALS o ADC.
      this.storage = new Storage();
    } else {
      this.logger.warn('GCS_BUCKET_NAME no configurado — uploads deshabilitados');
    }
  }

  async createPhotoUploadUrl(userId: string, contentType: string): Promise<SignedUploadResult> {
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage no configurado');
    }
    if (!ALLOWED_MIME.includes(contentType)) {
      throw new ServiceUnavailableException(
        `Tipo no permitido. Usa: ${ALLOWED_MIME.join(', ')}`,
      );
    }

    const objectKey = `player-photos/${userId}/${uuidv4()}`;
    const file = this.storage.bucket(this.bucketName).file(objectKey);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000, // 10 min
      contentType,
      extensionHeaders: {
        'x-goog-content-length-range': `0,${MAX_UPLOAD_BYTES}`,
      },
    });

    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${objectKey}`;

    return {
      uploadUrl,
      publicUrl,
      objectKey,
      expiresInSeconds: 600,
    };
  }
}
