# 🔐 CinePass Auth Service (`services/auth-service`)

Enterprise Identity, Authentication, and Role-Based Access Control (RBAC) microservice for the CinePass movie ticketing platform.

---

## 🌟 Key Features
- **Stateless JWT Authentication**: Issues signed JSON Web Tokens containing `{ id, email, role, theaterId }`.
- **Role-Based Access Control (RBAC)**:
  - `CUSTOMER`: Standard ticket buyers.
  - `THEATER_ADMIN`: Multiplex managers (e.g., AMB Cinemas, PVR) managing screens and showtimes.
  - `PLATFORM_SUPERADMIN`: CinePass corporate operations managing global movie masters and platform configurations.
- **Enterprise Password Security**: Bcrypt with work factor 10.
- **Input Validation**: Strongly typed schema validations using Zod.
- **Production Hardened**:
  - Helmet for secure HTTP headers.
  - CORS with configurable origins.
  - Graceful shutdown handling (`SIGTERM`/`SIGINT`) with connection pool draining.
  - Kubernetes healthcheck endpoints (`/health`).
- **Multi-Stage Dockerfile**: Builds on `node:20-alpine`, runs as non-root user `node`.

---

## 📡 API Endpoints

### 1. Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Pavan Sai",
  "email": "pavan@example.com",
  "password": "Password123!",
  "role": "CUSTOMER"
}
```
**Response (201 Created)**:
```json
{
  "success": true,
  "message": "User registered successfully.",
  "data": {
    "user": {
      "id": 1,
      "name": "Pavan Sai",
      "email": "pavan@example.com",
      "role": "CUSTOMER",
      "createdAt": "2026-09-21T22:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. User Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "pavan@example.com",
  "password": "Password123!"
}
```
**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": {
      "id": 1,
      "name": "Pavan Sai",
      "email": "pavan@example.com",
      "role": "CUSTOMER"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 3. Get Authenticated Profile
```http
GET /api/auth/me
Authorization: Bearer <JWT_TOKEN>
```

### 4. Admin Access Verification (RBAC Guard)
```http
GET /api/auth/admin/verify-access
Authorization: Bearer <ADMIN_OR_SUPERADMIN_JWT_TOKEN>
```
- If called by `CUSTOMER` -> **403 Forbidden**.
- If called by `THEATER_ADMIN` or `PLATFORM_SUPERADMIN` -> **200 OK**.

### 5. Kubernetes Health Probe
```http
GET /health
```
**Response (200 OK)**:
```json
{
  "status": "UP",
  "service": "auth-service",
  "timestamp": "2026-09-21T22:30:00.000Z"
}
```

---

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run in development mode with auto-reload
npm run dev

# Run compiled production build
npm start
```
