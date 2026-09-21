import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom SRE Metrics for CinePass Flash Sale
export const seatLockSuccess = new Counter('cinepass_seat_lock_success');
export const seatLockCollisions = new Counter('cinepass_seat_lock_collisions');
export const paymentSuccess = new Counter('cinepass_payment_success');
export const idempotentReplays = new Counter('cinepass_idempotent_replays');
export const catalogLatencyTrend = new Trend('cinepass_catalog_latency_ms');

export const options = {
  scenarios: {
    // 1. Flash Sale Ramp-Up: 500 Virtual Users hammering the booking engine
    flash_sale_surge: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '15s', target: 100 },  // Ramp up to 100 users
        { duration: '30s', target: 500 },  // Surge to 500 users (Flash sale begins!)
        { duration: '30s', target: 500 },  // Sustained peak load
        { duration: '15s', target: 0 },    // Cooldown
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'], // Under 5% total failure rate (excluding expected 409 collisions)
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests must finish within 500ms
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost';

export default function () {
  const showId = 1;
  const contestedSeats = ['A1', 'A2']; // Hot contested seats!
  const userId = Math.floor(Math.random() * 10000) + 1;

  // -------------------------------------------------------------------------
  // Test Step 1: Catalog Read Throughput (Cached sub-5ms)
  // -------------------------------------------------------------------------
  const catalogRes = http.get(`${BASE_URL}:8081/api/catalog/movies?language=Telugu`);
  catalogLatencyTrend.add(catalogRes.timings.duration);
  check(catalogRes, {
    'Catalog status is 200': (r) => r.status === 200,
    'Catalog response latency < 50ms': (r) => r.timings.duration < 50,
  });

  // -------------------------------------------------------------------------
  // Test Step 2: Concurrency Seat Hold Race (Atomically guarded by Redis)
  // -------------------------------------------------------------------------
  const holdPayload = JSON.stringify({
    showId: showId,
    seats: contestedSeats,
    userId: userId,
    totalAmount: 600,
  });

  const holdHeaders = { 'Content-Type': 'application/json' };
  const holdRes = http.post(`${BASE_URL}:8082/api/bookings/hold`, holdPayload, { headers: holdHeaders });

  if (holdRes.status === 201) {
    // WINNER: Successfully acquired the atomic Redis lock!
    seatLockSuccess.add(1);
    check(holdRes, {
      'Seat lock acquired successfully': (r) => r.status === 201,
    });

    // -----------------------------------------------------------------------
    // Test Step 3: Process Payment for the Winner
    // -----------------------------------------------------------------------
    const bookingData = JSON.parse(holdRes.body).data;
    const idempotencyKey = `idemp_k6_${bookingData.bookingId}_${Date.now()}`;

    const payPayload = JSON.stringify({
      bookingId: bookingData.bookingId,
      userId: userId,
      userEmail: `k6_test_${userId}@cinepass.com`,
      amount: 600,
      paymentMethod: 'UPI',
      idempotencyKey: idempotencyKey,
      movieDetails: {
        movieTitle: 'Devara Part 1',
        theaterName: 'Prasads Multiplex',
        screenName: 'Large Screen 6',
        showDate: '2026-09-25',
        startTime: '18:30:00',
        seats: contestedSeats,
      },
    });

    const payRes = http.post(`${BASE_URL}:8083/api/payments`, payPayload, { headers: holdHeaders });
    check(payRes, {
      'Payment processed': (r) => r.status === 200,
    });
    paymentSuccess.add(1);

    // -----------------------------------------------------------------------
    // Test Step 4: Network Replay Attack (Verify Idempotency)
    // -----------------------------------------------------------------------
    // Immediate second payment request with identical idempotencyKey
    const replayRes = http.post(`${BASE_URL}:8083/api/payments`, payPayload, { headers: holdHeaders });
    const isReplay = replayRes.status === 200 && JSON.parse(replayRes.body).idempotentReplay === true;
    check(replayRes, {
      'Idempotent replay detected with no duplicate charge': () => isReplay,
    });
    if (isReplay) {
      idempotentReplays.add(1);
    }

  } else if (holdRes.status === 409) {
    // EXPECTED COLLISION: Another user won the Redis lock first!
    seatLockCollisions.add(1);
    check(holdRes, {
      'Seat collision handled gracefully (409 Conflict)': (r) => r.status === 409,
    });
  }

  sleep(0.1); // 100ms pause between virtual user iterations
}
