import 'dotenv/config';
import * as Joi from 'joi';
import { Logger } from '@nestjs/common';

const logger = new Logger('EnvConfig');

type NodeEnv = 'development' | 'production' | 'test';

export interface EnvConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  throttleTtl: number;
  throttleLimit: number;
  gcsBucketName: string;
  // Correo transaccional (opcional). Sin SMTP_HOST no se envían correos.
  appPublicUrl: string;
  mailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  supportEmail: string;
}

interface RawEnvSchema {
  NODE_ENV: NodeEnv;
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  GCS_BUCKET_NAME: string;
  APP_PUBLIC_URL: string;
  MAIL_FROM: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_SECURE: boolean;
  SUPPORT_EMAIL: string;
}

export const envs: EnvConfig = build(process.env);

function build(envConfig: Record<string, unknown>): EnvConfig {
  const schema = Joi.object<RawEnvSchema>({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    PORT: Joi.number().default(3000),
    DATABASE_URL: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_EXPIRES_IN: Joi.string().default('30m'),
    REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('30d'),
    THROTTLE_TTL: Joi.number().default(60000),
    THROTTLE_LIMIT: Joi.number().default(30),
    GCS_BUCKET_NAME: Joi.string().allow('').default(''),
    APP_PUBLIC_URL: Joi.string().allow('').default('http://localhost:5173'),
    MAIL_FROM: Joi.string().allow('').default(''),
    SMTP_HOST: Joi.string().allow('').default(''),
    SMTP_PORT: Joi.number().default(587),
    SMTP_USER: Joi.string().allow('').default(''),
    SMTP_PASS: Joi.string().allow('').default(''),
    SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
    SUPPORT_EMAIL: Joi.string().allow('').default(''),
  });

  const { error, value } = schema.validate(envConfig, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    logger.error(`Config validation error: ${error.message}`);
    throw new Error(`Config validation failed: ${error.message}`);
  }

  const v = value as RawEnvSchema;

  return {
    nodeEnv: v.NODE_ENV,
    port: v.PORT,
    databaseUrl: v.DATABASE_URL,
    jwtSecret: v.JWT_SECRET,
    jwtExpiresIn: v.JWT_EXPIRES_IN,
    refreshTokenExpiresIn: v.REFRESH_TOKEN_EXPIRES_IN,
    throttleTtl: v.THROTTLE_TTL,
    throttleLimit: v.THROTTLE_LIMIT,
    gcsBucketName: v.GCS_BUCKET_NAME,
    appPublicUrl: v.APP_PUBLIC_URL,
    mailFrom: v.MAIL_FROM,
    smtpHost: v.SMTP_HOST,
    smtpPort: v.SMTP_PORT,
    smtpUser: v.SMTP_USER,
    smtpPass: v.SMTP_PASS,
    smtpSecure: v.SMTP_SECURE,
    supportEmail: v.SUPPORT_EMAIL,
  };
}
