/**
 * CinePass High-Concurrency Seat Race Simulation (Zero External Dependency)
 * 
 * Simulates a high-traffic flash sale where 50 users simultaneously try to 
 * reserve the exact same seat ('A1') for the exact same show (showId: 1).
 * 
 * Verification Goal:
 * - Exactly 1 customer wins the Redis lock (HTTP 201 Created)
 * - Exactly 49 customers receive graceful collision notice (HTTP 409 Conflict)
 * - Zero unhandled exceptions or 500 server crashes!
 * - Runs 100% locally with ZERO AWS charges!
 */

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:8082';

interface SimulationResult {
  userId: number;
  statusCode: number;
  durationMs: number;
  message: string;
}

async function runSeatRaceSimulation() {
  console.log('===============================================================');
  console.log('🚀 CinePass Concurrency Test: 50 Customers Racing for Seat A1');
  console.log(`🎯 Target URL: ${BOOKING_SERVICE_URL}/api/bookings/hold`);
  console.log('===============================================================\n');

  const SHOW_ID = 1;
  const CONTESTED_SEATS = ['A1'];
  const CONCURRENT_CLIENTS = 50;

  const promises: Promise<SimulationResult>[] = [];

  const overallStart = Date.now();

  for (let i = 1; i <= CONCURRENT_CLIENTS; i++) {
    const userId = 1000 + i;
    const clientPromise = (async (): Promise<SimulationResult> => {
      const start = Date.now();
      try {
        const response = await fetch(`${BOOKING_SERVICE_URL}/api/bookings/hold`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            showId: SHOW_ID,
            seats: CONTESTED_SEATS,
            userId: userId,
            totalAmount: 250,
          }),
        });

        const durationMs = Date.now() - start;
        const body = (await response.json()) as any;

        return {
          userId,
          statusCode: response.status,
          durationMs,
          message: body.message || 'No message',
        };
      } catch (err: any) {
        return {
          userId,
          statusCode: 500,
          durationMs: Date.now() - start,
          message: err.message,
        };
      }
    })();

    promises.push(clientPromise);
  }

  // Fire all 50 requests simultaneously!
  const results = await Promise.all(promises);
  const totalDuration = Date.now() - overallStart;

  // Aggregate results
  const winners = results.filter((r) => r.statusCode === 201);
  const collisions = results.filter((r) => r.statusCode === 409);
  const errors = results.filter((r) => r.statusCode !== 201 && r.statusCode !== 409);

  console.log('📊 SIMULATION RESULTS:');
  console.log('---------------------------------------------------------------');
  console.log(`⚡ Total Parallel Requests Fired: ${CONCURRENT_CLIENTS}`);
  console.log(`⏱️ Total Execution Time:         ${totalDuration}ms`);
  console.log(`🏆 Successful Seat Locks (201):   ${winners.length} ${winners.length === 1 ? '✅ (PASS)' : '❌ (FAIL - Race Condition!)'}`);
  console.log(`🛑 Graceful Collisions (409):     ${collisions.length} ${collisions.length === CONCURRENT_CLIENTS - 1 ? '✅ (PASS)' : '⚠️'}`);
  console.log(`💥 Server Crashes/Errors:         ${errors.length} ${errors.length === 0 ? '✅ (ZERO ERRORS)' : '❌ (FAIL)'}`);
  console.log('---------------------------------------------------------------\n');

  if (winners.length === 1 && collisions.length === CONCURRENT_CLIENTS - 1) {
    console.log('🎉 VERDICT: ACID Distributed Locking PASSED with 100% data integrity!');
    console.log(`👑 Winner was UserID: ${winners[0].userId} in ${winners[0].durationMs}ms`);
  } else {
    console.log('⚠️ VERDICT: Please check if booking-service and Redis are running locally.');
  }
}

runSeatRaceSimulation();
