import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { envs } from '../config/envs';

interface SendResult {
  delivered: boolean;
}

// Correo transaccional. Si SMTP_HOST no está configurado NO se simula un envío:
// se registra el contenido en el log y se devuelve `delivered: false` para que
// el llamador nunca reporte un correo como "enviado".
@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    this.from = envs.mailFrom || envs.smtpUser || 'no-reply@arboldevida.fc';
    this.transporter = envs.smtpHost
      ? createTransport({
          host: envs.smtpHost,
          port: envs.smtpPort,
          secure: envs.smtpSecure,
          auth: envs.smtpUser ? { user: envs.smtpUser, pass: envs.smtpPass } : undefined,
        })
      : null;

    if (!this.transporter) {
      this.logger.warn(
        'SMTP no configurado: los correos no se enviarán. Se registrará el enlace en el log (solo para desarrollo).',
      );
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendPasswordReset(to: string, name: string, resetUrl: string): Promise<SendResult> {
    const subject = 'Recupera tu contraseña — Árbol de Vida FC';
    const text = [
      `Hola ${name},`,
      '',
      'Recibimos una solicitud para restablecer tu contraseña de Árbol de Vida FC.',
      `Abre este enlace (válido por 1 hora): ${resetUrl}`,
      '',
      'Si no fuiste tú, ignora este mensaje. Tu contraseña no cambiará.',
    ].join('\n');

    const html = `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#14251e">
        <h2 style="color:#0b5c3b">Árbol de Vida FC</h2>
        <p>Hola <strong>${escapeHtml(name)}</strong>,</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#0b5c3b;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#5b6b64;font-size:13px">El enlace es válido por 1 hora. Si no solicitaste el cambio, ignora este mensaje.</p>
      </div>
    `;

    return this.dispatch(to, subject, text, html);
  }

  private async dispatch(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<SendResult> {
    if (!this.transporter) {
      this.logger.warn(`[sin SMTP] Correo para ${to} NO enviado. Contenido:\n${text}`);
      return { delivered: false };
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`Correo enviado a ${to}`);
      return { delivered: true };
    } catch (error) {
      this.logger.error(`Fallo enviando correo a ${to}: ${(error as Error).message}`);
      return { delivered: false };
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
