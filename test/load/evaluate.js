/**
 * k6 load test for POST /api/v1/evaluate/bulk
 *
 * Usage:
 *   k6 run test/load/evaluate.js
 *   k6 run --env BASE_URL=https://your-cloud-run-url test/load/evaluate.js
 *
 * Requires a running instance with a seeded tenant:
 *   make db-seed   # populates demo tenant + flags
 *   export LOAD_TEST_API_KEY=ff-<your-key>
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const bulkLatency = new Trend('bulk_eval_latency');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up to 20 VUs
    { duration: '1m',  target: 50 },   // hold at 50 VUs
    { duration: '30s', target: 100 },  // spike to 100 VUs
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY  = __ENV.LOAD_TEST_API_KEY || 'ff-changeme';

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
};

export default function () {
  const userId = `user-${Math.floor(Math.random() * 10000)}`;

  const res = http.post(
    `${BASE_URL}/api/v1/evaluate/bulk`,
    JSON.stringify({
      environment: 'production',
      userId,
      context: { plan: Math.random() > 0.5 ? 'premium' : 'free' },
    }),
    { headers: HEADERS },
  );

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has data':   (r) => JSON.parse(r.body).success === true,
  });

  errorRate.add(!ok);
  bulkLatency.add(res.timings.duration);

  sleep(0.1);
}
