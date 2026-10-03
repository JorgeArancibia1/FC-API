import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { CurrentUser } from '../interfaces';

export const User = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUser => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) {
      throw new InternalServerErrorException(
        'No se encontró el usuario en la solicitud (AuthGuard no se ejecutó)',
      );
    }
    return request.user;
  },
);
