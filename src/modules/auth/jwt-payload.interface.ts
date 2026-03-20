export interface JwtPayload {
  sub: string;
  email: string;
  fullname?: string | null;
}
