# 🧪 CinePass Concurrency & Load Testing Suite (`tests/load-testing/`)

This directory contains load testing and race-condition simulation scripts to validate the **Redis distributed locking engine** and **Payment idempotency ledger** under flash-sale conditions.

---

## 💰 FinOps & AWS Free Tier Safety (Zero Cost Guarantee!)

> [!IMPORTANT]
> **Zero Cloud Cost**: All tests in this directory are engineered to run **100% locally on your machine (`localhost`)** or against local Docker containers.
> - Running these tests costs **₹0.00 (Zero Rupees)**.
> - **Karpenter was deliberately excluded** to prevent any accidental EC2 instance provisioning (`c6i`, `m6i`) that could exceed the AWS Free Tier!

---

## 1. Local 50-User Seat Race Simulation ([`seat-race-simulation.ts`](./seat-race-simulation.ts))

A lightweight, zero-external-dependency script using Node.js native `fetch` to simulate **50 users racing to grab seat `A1` simultaneously**.

### How to Run:
```bash
# Make sure booking-service is running on port 8082
npx ts-node tests/load-testing/seat-race-simulation.ts
```

### Expected Output:
```text
===============================================================
🚀 CinePass Concurrency Test: 50 Customers Racing for Seat A1
🎯 Target URL: http://localhost:8082/api/bookings/hold
===============================================================

📊 SIMULATION RESULTS:
---------------------------------------------------------------
⚡ Total Parallel Requests Fired: 50
⏱️ Total Execution Time:         48ms
🏆 Successful Seat Locks (201):   1  ✅ (PASS)
🛑 Graceful Collisions (409):     49 ✅ (PASS)
💥 Server Crashes/Errors:         0  ✅ (ZERO ERRORS)
---------------------------------------------------------------

🎉 VERDICT: ACID Distributed Locking PASSED with 100% data integrity!
👑 Winner was UserID: 1014 in 6ms
```

---

## 2. Industry-Standard k6 Flash Sale Surge ([`k6-flash-sale.js`](./k6-flash-sale.js))

Simulates a sustained **500 virtual users (VUs)** flash-sale wave over 90 seconds.

### How to Run:
```bash
# Install k6 (if not already installed: winget install k6)
k6 run tests/load-testing/k6-flash-sale.js

# Or test against custom target:
k6 run -e TARGET_URL=http://localhost tests/load-testing/k6-flash-sale.js
```

### What It Validates:
1. **Catalog Cache Throughput**: Verifies `GET /api/catalog/movies` responds under **50ms** via Redis cache.
2. **Seat Locking Contention**: Tracks `cinepass_seat_lock_success` (winners) vs `cinepass_seat_lock_collisions` (`409 Conflict`).
3. **Idempotency Replay Attack**: Fires identical payment requests to guarantee the user is **never charged twice**.

---

## 3. Best Practices to Keep AWS Bill Under ₹40–₹50

If you choose to test against real AWS infrastructure instead of local:
1. **Never leave EKS running overnight**: EKS control plane costs $0.10/hour (~₹8.50/hr). Run it for 1 hour for your interview or demo, then immediately run `terraform destroy`. Total cost: **₹8 to ₹15**!
2. **Use Spot Node Groups only**: Set to `t3.medium` Spot instances (costs ~₹1.20/hr).
3. **Free Tier Native Services**:
   - **AWS SQS**: 1,000,000 requests/month are **100% FREE**.
   - **Amazon S3**: 5 GB storage & 20,000 GET requests are **100% FREE**.
   - **Amazon CloudFront**: 1 TB data transfer/month is **100% FREE**.
   - **AWS Secrets Manager**: First 30 days free trial.
