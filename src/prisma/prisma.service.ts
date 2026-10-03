import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { envs } from '../config/envs';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('PrismaService');

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`✅ MongoDB conectada (entorno: ${envs.nodeEnv})`);
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      this.logger.log('🔌 Desconectando base de datos...');
      await app.close();
    });
  }
}
