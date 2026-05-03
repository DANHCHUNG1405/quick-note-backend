# QuickNote Backend

Chào mừng bạn đến với repo mã nguồn backend của dự án **QuickNote**. Đây là hệ thống API được xây dựng để cung cấp các dịch vụ quản lý ghi chú, xử lý dữ liệu theo thời gian thực và quản lý các tác vụ nền cho ứng dụng QuickNote.

## 🚀 Giới thiệu dự án

QuickNote Backend là một ứng dụng máy chủ mạnh mẽ, có tính mở rộng cao, được thiết kế theo kiến trúc module. Hệ thống cung cấp các API cho việc:
- Xác thực và phân quyền người dùng.
- Quản lý ghi chú (CRUD).
- Đồng bộ hóa dữ liệu theo thời gian thực.
- Xử lý các tác vụ nền như gửi email thông báo, xử lý dữ liệu nặng.

## 🛠 Các công nghệ sử dụng

Dự án được xây dựng dựa trên hệ sinh thái **Node.js** cùng với các công nghệ và thư viện hiện đại nhất:

### Core Framework & Ngôn ngữ
- **[NestJS](https://nestjs.com/)**: Framework Node.js được sử dụng để xây dựng các ứng dụng server-side hiệu quả, đáng tin cậy và có khả năng mở rộng.
- **[TypeScript](https://www.typescriptlang.org/)**: Ngôn ngữ lập trình chính của dự án, giúp code an toàn, rõ ràng và dễ bảo trì hơn với typing tĩnh.

### Cơ sở dữ liệu & ORM
- **[Prisma](https://www.prisma.io/)**: Next-generation Node.js và TypeScript ORM. Giúp tương tác với cơ sở dữ liệu một cách an toàn và dễ dàng với auto-generated query builder.

### Real-time & WebSockets
- **[Socket.IO](https://socket.io/)**: Thư viện cho phép giao tiếp hai chiều, thời gian thực và dựa trên sự kiện giữa trình duyệt (frontend) và máy chủ (backend).

### Background Jobs & Caching
- **[BullMQ](https://docs.bullmq.io/)**: Hệ thống Message Queue mạnh mẽ, nhanh và đáng tin cậy dành cho NodeJS dựa trên Redis. Dùng để xử lý các tác vụ nền (background jobs).
- **[Redis](https://redis.io/) (thông qua `ioredis`)**: In-memory data structure store, được sử dụng làm cơ sở dữ liệu, bộ nhớ cache và message broker (đặc biệt kết hợp với BullMQ).

### Xác thực & Bảo mật (Auth & Security)
- **[JWT (JSON Web Token)](https://jwt.io/) & [Passport](https://www.passportjs.org/)**: Cơ chế xác thực người dùng an toàn và phổ biến.
- **Bcrypt**: Thư viện mã hóa mật khẩu an toàn.
- **Rate Limiting (`@nestjs/throttler`)**: Ngăn chặn brute-force và DDoS attacks bằng cách giới hạn số lượng request từ một IP.

### Tiện ích khác
- **[Nodemailer](https://nodemailer.com/)**: Thư viện hỗ trợ việc gửi email thông báo từ Node.js server.
- **Class Validator & Class Transformer**: Xác thực và biến đổi dữ liệu đầu vào (DTOs) dễ dàng và an toàn.

---

## ⚙️ Hướng dẫn cài đặt và chạy dự án (Local)

### 1. Cài đặt các dependencies
```bash
npm install
```

### 2. Thiết lập biến môi trường
Tạo file `.env` ở thư mục gốc (copy từ `.env.example` nếu có) và cấu hình các thông số cần thiết (Database URL, Redis URL, JWT Secret, v.v.).

### 3. Chạy dự án
```bash
# Chế độ phát triển (watch mode)
npm run dev

# Hoặc chế độ thông thường
npm run start
```

## 🧪 Testing

```bash
# Chạy Unit Tests
npm run test

# Chạy E2E Tests
npm run test:e2e

# Xem Test Coverage
npm run test:cov
```
