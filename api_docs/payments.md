# Payments API Documentation

## Verify Futsal Registration Payment
- **POST** `/api/payments/verify`
- **Body:**
  - `futsalId` (string, required)
  - `paymentToken` (string, required)
  - `amount` (number, required)
- **Response:**
  - `200 OK` on success

## Booking Payment (Planned)
- **POST** `/api/bookings/:id/payment`
- **Body:**
  - `bookingId` (string, required)
  - `token` (string, required)
  - `amount` (number, required)
- **Response:**
  - `200 OK` on success, `400` on error

---

*For more endpoints, see bookings.md or contact the backend team.*
