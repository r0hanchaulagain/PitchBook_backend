# Redis Setup

1. Install Redis (if not already):
   - On Ubuntu: `sudo apt-get install redis-server`
   - Or use Docker: `docker run --name redis -p 6379:6379 -d redis`

2. Add the following to your `.env.redis`:
   REDIS_HOST=localhost
   REDIS_PORT=6379

3. The backend uses `src/utils/redisClient.js` for Redis connection and exposes `getAsync`, `setAsync`, and `delAsync` for caching.

4. Example usage: see `getFutsalById` in `src/controllers/futsalController.js` (caches futsal details for 5 minutes).

# Docker Usage

1. Build the Docker image:
   docker build -t futsal-backend .

2. Run the Docker container:
   docker run -d -p 3000:3000 --env-file .env --env-file .env.redis --name futsal-backend futsal-backend

3. Make sure MongoDB and Redis are accessible from the container (use Docker networking if running all in Docker).

# Bulk Booking & Payment

- POST `/api/bookings/bulk` (auth required): create multiple bookings in a date range.
- POST `/api/bookings/bulk-payment` (auth required): pay for multiple bookings at once.

See `src/routes/bookingRoutes.js` for endpoints and `src/controllers/bookingController.js` for logic.

# Partial & Full Booking Logic

- Partial booking (one team): `bookingType: 'partial'`, only `teamA` provided, `teamB` is open for join.
- Full booking (both teams): `bookingType: 'full'`, both `teamA` and `teamB` provided.
- Join as team B: POST `/api/bookings/:id/join`.

See `src/controllers/bookingController.js` for all logic.
