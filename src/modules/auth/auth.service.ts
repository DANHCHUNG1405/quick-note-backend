import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * REGISTER
   */
  async register(dto: RegisterDto) {
    const { email, password } = dto;

    // 1️⃣ Check email tồn tại trong DB
    const existingUser = await this.prisma.users.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    // 2️⃣ Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3️⃣ Create user (UUID do DB sinh)
    const user = await this.prisma.users.create({
      data: {
        email,
        password_hash: passwordHash,
      },
      select: {
        id: true,
        email: true,
      },
    });

    // 4️⃣ Response từ DB thật
    return {
      message: 'Register successful',
      user,
    };
  }

  /**
   * LOGIN
   */
  async login(dto: LoginDto) {
    const { email, password } = dto;

    // 1️⃣ Tìm user trong DB
    const user = await this.prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password_hash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2️⃣ So sánh password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3️⃣ Tạo JWT
    const payload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
    };
  }
}
