# Futsal Management System Backend

A robust Node.js/Express backend for managing futsal bookings, payments, notifications, analytics, and more. Designed for clubs, owners, and players to easily manage and interact with futsal facilities.

---

## Features
- **User & Owner Management**: Registration, login, roles, and permissions
- **Futsal Listings**: Register, search, review, favorite, and manage futsals
- **Booking System**: Create, join, and manage bookings (partial or full ground)
- **Bulk Booking & Payment**: Book and pay for multiple slots/days at once
- **Notifications**: Real-time (polling) notifications for bookings, payments, and reminders
- **Reminders & Cron Jobs**: Automated reminders for upcoming bookings
- **Analytics**: Admin dashboards, revenue, usage, and cancellation stats
- **Dynamic Pricing**: Price modifiers for holidays, ratings, and peak times
- **Holiday & Closure Management**: Owners can set holidays/closures
- **Redis Caching**: Faster API responses for repeated queries
- **Dockerized**: Easy deployment and environment consistency

---

## Tech Stack
- Node.js, Express.js
- MongoDB (Mongoose)
- Redis (caching)
- Docker (containerization)
- Node-cron (scheduled jobs)

---

## Setup & Usage

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
- Copy `.env.example` to `.env` and fill in your MongoDB, JWT, and email configs.
- For Redis, use `.env.redis`:
  ```
  REDIS_HOST=localhost
  REDIS_PORT=6379
  ```

### 4. Run MongoDB and Redis
- Locally, or use Docker Compose (see below).

### 5. Start the Server
```bash
npm start
```

### 6. (Optional) Run with Docker Compose
```bash
docker-compose up --build
```

---

## API Documentation
- See the `api_docs/` folder for detailed endpoint documentation, usage, and integration guides (notifications, polling, geolocation, Docker, Redis, etc).

---

## Key Endpoints
- `POST /api/users/register` — User registration
- `POST /api/users/login` — User login
- `POST /api/bookings` — Create a booking
- `POST /api/bookings/bulk` — Bulk booking creation
- `POST /api/bookings/bulk-payment` — Bulk payment
- `GET /api/futsals/nearby` — Search futsals by location
- `GET /api/notifications` — Fetch notifications
- ...and more

---

## Contributing
Pull requests are welcome! Please see the code style and guidelines in `.prettierignore` and `api_docs/`.

---

## License
MIT
