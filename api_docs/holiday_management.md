# Holiday & Futsal Closure Management

This document describes how holidays and futsal-specific closures are managed in the backend.

---

## Holiday Management (Admin)
- **Endpoints:**
  - `POST /api/holidays` — Create a holiday
  - `GET /api/holidays` — List all holidays
  - `PUT /api/holidays/:id` — Update a holiday
  - `DELETE /api/holidays/:id` — Delete a holiday
- **Purpose:**
  - Allows admins to define public holidays or special dates that affect futsal pricing/availability.
  - Holidays can be one-time or recurring (e.g., every year).

## Futsal Closure Management (Owner/Admin)
- **Endpoints:**
  - `POST /api/futsals/:id/close` — Close futsal for specific dates and reasons
  - `GET /api/futsals/:id/closures` — Get futsal closure dates/reasons
- **Purpose:**
  - Allows futsal owners to mark their futsal as closed for maintenance, events, or other reasons (even if not a public holiday).
  - These closures are checked during booking and availability logic to prevent bookings on closed dates.

## Data Model
- **Holiday Schema:**
  - `name`, `date`, `isRecurring`, `recurringDetails`
- **Futsal Schema:**
  - `closures`: Array of `{ date, reason }` objects

## Usage in Pricing/Booking Logic
- The system checks both the holiday calendar and futsal-specific closures when calculating dynamic pricing and checking slot availability.
- Bookings cannot be made on futsal closure dates.
- Holiday modifiers are applied to pricing if the booking date is a holiday.

---

*For further details, see the backend team or this documentation.*
