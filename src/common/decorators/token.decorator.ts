import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';

export const Token = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.token) {
      throw new InternalServerErrorException(
        'No se encontró el token en la solicitud (AuthGuard no se ejecutó)',
      );
    }
    return request.token;
  },
);
