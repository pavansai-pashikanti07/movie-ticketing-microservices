# 📊 CinePass Observability & Monitoring Architecture (`k8s/monitoring/`)

This directory houses the **cloud-native observability stack** for the CinePass microservices ecosystem. It implements the **Three Pillars of Observability** (Metrics, Logs, and Alerts) tailored specifically for high-throughput, flash-sale ticketing traffic.

---

## 1. Why Observability Matters in Microservices (The Flash-Sale Problem)

In a traditional monolith, a single log file or APM agent reveals system bottlenecks. However, during a **high-concurrency movie ticket flash sale** (e.g., *Salaar* or *Kalki* release), a single checkout request traverses 5 decoupled microservices:

```
[ Customer Mobile App ]
           │
           ▼
   [ Auth Service ] (JWT verification & RBAC check)
           │
           ▼
  [ Catalog Service ] (Redis cache sub-5ms lookup)
           │
           ▼
  [ Booking Service ] (Atomic Redis lock `SET NX EX 300` & collision resolution)
           │
           ▼
  [ Payment Service ] (Idempotent financial ledger & SQS event dispatch)
           │
           ▼
 [ AWS SQS Queue ]
           │
           ▼
[ Notification Service ] (QR code rendering, PDF ticket compilation, S3 upload)
```

If seat reservations fail or latency spikes, without telemetry it is impossible to identify whether:
1. Redis lock contention saturated available connections.
2. The payment gateway timed out.
3. Messages piled up in the SQS Dead Letter Queue (DLQ).
4. Node.js heap memory leaked and triggered K8s OOMKills.

---

## 2. Telemetry Architecture

### A. Microservices Metrics Instrumentation (`prom-client`)
Each of the 5 microservices exposes an internal `/metrics` endpoint adhering to OpenMetrics / Prometheus standards:

1. **Platform Golden Signals (Google SRE Standard)**:
   - **Rate**: `http_requests_total{method, route, status_code}`
   - **Errors**: Ratio of HTTP 5xx responses against total volume.
   - **Duration**: `http_request_duration_seconds_bucket{le, route}` (Quantiles: P50, P95, P99).
   - **Saturation**: Node.js event loop lag, active handles, process CPU/Memory RSS.

2. **Custom Domain Business Telemetry**:
   - **`booking-service`**:
     - `cinepass_booking_attempts_total{status="success|collision|failed"}`
     - `cinepass_booking_seat_collisions_total`: Real-time tracking of 409 Conflict rate during seat races.
   - **`catalog-service`**:
     - `cinepass_catalog_cache_hits_total` vs `cinepass_catalog_cache_misses_total`: Direct cache efficiency tracking.
   - **`payment-service`**:
     - `cinepass_payments_total{status="success|failure|idempotent_duplicate"}`
     - `cinepass_payment_sqs_events_published_total`
   - **`notification-service`**:
     - `cinepass_sqs_messages_consumed_total{status="success|failure"}`
     - `cinepass_pdf_generation_duration_seconds`: Ticket compilation latency histogram.

---

## 3. Kubernetes Prometheus Operator Configuration

### A. ServiceMonitors ([`servicemonitors.yaml`](./servicemonitors.yaml))
Declarative Custom Resource Definition (CRD) that instructs Prometheus to automatically discover and scrape all CinePass pods across the cluster every **15 seconds**:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cinepass-microservices-monitor
  namespace: cinepass-dev
spec:
  selector:
    matchExpressions:
      - key: app
        operator: In
        values: [auth-service, catalog-service, booking-service, payment-service, notification-service]
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

### B. Prometheus Alerting Rules ([`prometheus-rules.yaml`](./prometheus-rules.yaml))

| Alert Name | Condition | Severity | Actionable Resolution |
| :--- | :--- | :---: | :--- |
| **`CinePassHighHttp5xxRate`** | 5xx error rate > 5% for 2m | `critical` (P1) | Check database connection pools, downstream timeouts, or pod memory leaks. |
| **`CinePassHighP99Latency`** | P99 latency > 1.5s for 3m | `warning` (P2) | Investigate slow queries, unindexed database scans, or Redis cache misses. |
| **`CinePassFlashSaleLockContentionSpike`** | 409 collisions > 50/min | `warning` | Flash sale traffic spike detected. Verify HPA scaling triggers on `booking-service`. |
| **`CinePassSqsDlqMessagesBacklog`** | DLQ message count > 0 | `critical` (P1) | Dead Letter Queue has failed ticket events. Immediate manual replay/investigation. |
| **`CinePassPodFrequentRestarts`** | Container restarts > 3 in 15m | `critical` | Pod crash loop. Check `kubectl describe pod` for OOMKills or unhandled exceptions. |

---

## 4. Production Grafana Cockpit ([`dashboards/cinepass-overview.json`](./dashboards/cinepass-overview.json))

The pre-built dashboard provides instant executive and SRE visibility:
- **Row 1: Golden Signals**: Real-time RPS per route, P50/P95/P99 latency curves.
- **Row 2: Flash Sale Telemetry**: Redis seat collisions rate, payment status breakdown bar gauge, SQS message consumption rate.
- **Row 3: Infrastructure Saturation**: Pod CPU percentage against resource limits, working set memory (RSS) tracking.

### How to Import Dashboard into Grafana:
1. In Grafana, navigate to **Dashboards ➔ New ➔ Import**.
2. Upload `cinepass-overview.json` or paste its raw JSON content.
3. Select your Prometheus datasource and click **Import**.
