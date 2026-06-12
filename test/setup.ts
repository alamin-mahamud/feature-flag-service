import { config } from 'dotenv';
config(); // loads .env before tests

// Disable rate limiting in tests — e2e tests fire many requests per tenant
process.env.THROTTLE_LIMIT = '10000';
