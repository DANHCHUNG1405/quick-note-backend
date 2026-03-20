import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthRequest } from './auth-request.interface';
export interface CurrentUserData {
  userId: string;
  email: string;
  fullname: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest<AuthRequest>();
    return request.user as CurrentUserData;
  },
);
