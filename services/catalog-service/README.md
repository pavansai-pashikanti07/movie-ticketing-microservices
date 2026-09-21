# 🎬 CinePass Catalog Service (`services/catalog-service`)

High-Throughput Movie Catalog & Showtime Scheduling microservice for the CinePass movie ticketing platform.

---

## 🌟 Key Features
- **High-Throughput Catalog Engine**: Serves 95% of user browsing traffic (Movies, Theaters, Auditoriums, Shows) without exhausting database pools.
- **Cache-Aside Architecture with Redis**:
  - Hot movie queries (`/api/catalog/movies`) and show listings cached in Redis with configurable TTL (5-10 minutes).
  - Delivers sub-5ms response times.
  - Automatic cache invalidation when admins schedule new shows or register movies.
  - Resilient DB fallback if Redis is temporarily degraded.
- **CloudFront CDN Integration**: Serves 4K movie posters and backdrops via Amazon CloudFront from S3 (`https://assets.cinepass.com`).
- **Dynamic Seating Layout Metadata**: Exposes auditorium seat matrices (Recliner, Prime, Classic rows) for client seat map rendering.
- **Admin Showtime Scheduling**: Protected endpoints for Theater Managers to schedule upcoming shows.
- **Kubernetes Production Hardened**:
  - `/health` endpoint validating both PostgreSQL and Redis cache connectivity.
  - Multi-stage Docker container build on `node:20-alpine`, non-root user `node`.

---

## 📡 API Endpoints

### 1. List Movies (Cached)
```http
GET /api/catalog/movies?language=Telugu&format=IMAX&genre=Action
```

### 2. Get Movie Details
```http
GET /api/catalog/movies/:id
```

### 3. List Multiplex Theaters
```http
GET /api/catalog/theaters?city=Hyderabad
```

### 4. Query Showtimes
```http
GET /api/catalog/shows?movieId=1&theaterId=amb-gachibowli&date=2026-10-05
```

### 5. Get Show & Auditorium Seating Layout
```http
GET /api/catalog/shows/:id
```

### 6. Create Movie (SuperAdmin)
```http
POST /api/catalog/movies
Content-Type: application/json

{
  "title": "Pushpa 2: The Rule",
  "description": "Wildfire saga...",
  "durationMins": 195,
  "languages": ["Telugu", "Hindi"],
  "genres": ["Action"],
  "formats": ["2D", "IMAX"],
  "posterUrl": "https://assets.cinepass.com/posters/pushpa2.webp",
  "releaseDate": "2026-10-05"
}
```

### 7. Schedule Showtime (Theater Admin)
```http
POST /api/catalog/shows
Content-Type: application/json

{
  "movieId": 1,
  "theaterId": "amb-gachibowli",
  "auditoriumId": "amb-screen-1",
  "showDate": "2026-10-05",
  "startTime": "11:15 AM",
  "format": "IMAX",
  "tierPricing": {
    "RECLINER": 450,
    "PRIME": 295,
    "CLASSIC": 175
  },
  "status": "BOOKINGS_OPEN"
}
```

### 8. Kubernetes Health Probe
```http
GET /health
```
```json
{
  "status": "UP",
  "service": "cinepass-catalog-service",
  "database": "CONNECTED",
  "cache": "CONNECTED",
  "timestamp": "2026-09-21T22:40:00.000Z"
}
```
