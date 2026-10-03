import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB para avatar
const HERO_MAX_BYTES = 8 * 1024 * 1024; // 8MB para hero (cuerpo entero, más resolución)
const PLAYERS_DIR = join(process.cwd(), 'uploads', 'players');
const HEROES_DIR = join(process.cwd(), 'uploads', 'heroes');
const PLAYERS_PREFIX = '/uploads/players';
const HEROES_PREFIX = '/uploads/heroes';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class LocalPhotoUploader {
  private readonly logger = new Logger('LocalPhotoUploader');

  save(userId: string, file: UploadedFile): Promise<string> {
    return this.write(userId, file, PLAYERS_DIR, PLAYERS_PREFIX, MAX_BYTES);
  }

  saveHero(userId: string, file: UploadedFile): Promise<string> {
    return this.write(userId, file, HEROES_DIR, HEROES_PREFIX, HERO_MAX_BYTES);
  }

  private async write(
    userId: string,
    file: UploadedFile,
    dir: string,
    publicPrefix: string,
    maxBytes: number,
  ): Promise<string> {
    if (!file?.buffer) {
      throw new BadRequestException('No se recibió archivo');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipo no permitido. Usa: ${[...ALLOWED_MIME].join(', ')}`,
      );
    }
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      throw new BadRequestException(`Imagen demasiado grande (máximo ${mb} MB)`);
    }

    await fs.mkdir(dir, { recursive: true });

    const ext = pickExt(file);
    const filename = `${userId}-${uuidv4()}${ext}`;
    const absolutePath = join(dir, filename);
    await fs.writeFile(absolutePath, file.buffer);

    this.logger.log(`✅ Foto guardada: ${filename}`);
    return `${publicPrefix}/${filename}`;
  }
}

function pickExt(file: UploadedFile): string {
  const original = extname(file.originalname).toLowerCase();
  if (original === '.jpg' || original === '.jpeg') return '.jpg';
  if (original === '.png') return '.png';
  if (original === '.webp') return '.webp';
  if (file.mimetype === 'image/jpeg') return '.jpg';
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  return '.bin';
}
