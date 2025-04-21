# Admin Analytics API Documentation

All endpoints are `GET` and require admin authentication.

---

## 1. Platform Overview

### `GET /api/admin/analytics/overview`
- **Returns:**
  - User stats (by role)
  - Futsal stats (active/inactive/verified)
  - Booking stats (by status)
  - Total revenue
  - Transaction stats (by type)

---

## 2. Time Series Analytics

### `GET /api/admin/analytics/registrations?period=monthly|weekly|daily`
- **Returns:** User registrations count over time.

### `GET /api/admin/analytics/bookings?period=monthly|weekly|daily`
- **Returns:** Bookings count over time.

### `GET /api/admin/analytics/revenue?period=monthly|weekly|daily`
- **Returns:** Revenue generated over time.

---

## 3. Top/Bottom Performers

### `GET /api/admin/analytics/top-futsals?limit=10&period=monthly|all`
- **Returns:** Top futsals by bookings and revenue.

### `GET /api/admin/analytics/top-users?limit=10&period=monthly|all`
- **Returns:** Most active users by bookings.

### `GET /api/admin/analytics/low-performing-futsals?limit=10&period=monthly|all`
- **Returns:** Futsals with least bookings/revenue.

---

## 4. Geographical Analytics

### `GET /api/admin/analytics/futsals-by-location`
- **Returns:** Number of futsals by city/district.

### `GET /api/admin/analytics/bookings-by-location`
- **Returns:** Number of bookings by city/district.

---

## 5. Other Useful Stats

### `GET /api/admin/analytics/active-vs-inactive-futsals`
- **Returns:** Number of active vs inactive futsals.

### `GET /api/admin/analytics/cancellations`
- **Returns:** Booking cancellation rates (overall, by futsal, by user).

### `GET /api/admin/analytics/holiday-impact`
- **Returns:** Bookings and revenue on holidays vs regular days.

---

## Notes
- All endpoints return JSON.
- Query parameters (e.g., `period`, `limit`) are optional and have sensible defaults.
- For advanced filtering, extend endpoints as needed.
