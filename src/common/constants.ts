// Reglas de negocio transversales del club.

/** Único email autorizado con rol developer (acceso total + panel avanzado). */
export const DEVELOPER_EMAIL = 'cristobal@gmail.com';

/** Vigencia de una invitación a partido (link + código de 6 dígitos). */
export const INVITE_TTL_HOURS = 48;

/** Vigencia del token de recuperación de contraseña. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

/** Longitud del código de invitación. */
export const INVITE_CODE_LENGTH = 6;
