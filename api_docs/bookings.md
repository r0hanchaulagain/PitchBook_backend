# Bookings API Documentation

## Create Booking
- **POST** `/api/bookings`
- **Auth:** Required (user)
- **Body:**
  - `futsalId` (string, required)
  - `date` (YYYY-MM-DD, required)
  - `startTime` (HH:MM, required)
  - `endTime` (HH:MM, required)
  - `bookingType` ("full" | "partial", required)
  - `teamA` (object, required)
  - `teamB` (object, required for full)
  - `specialRequests` (string, optional)
- **Rules:**
  - Duration must be 30, 60, 90, or 120 min
  - No slot overlap, future only, within operating hours
  - TeamB required for full
- **Response:**
  - `201 Created` with booking object

## Bulk Booking
- **POST** `/api/bookings/bulk`
- **Auth:** Required (user)
- **Body:**
  - `futsalId`, `startDate`, `endDate`, `startTime`, `endTime`, `daysOfWeek`, `bookingType`, `teamA`, `teamB`, `specialRequests`
- **Rules:**
  - Max 30 days, same validations as single booking
- **Response:**
  - `201 Created` with valid/invalid bookings

## Get Booking
- **GET** `/api/bookings/:id`
- **Auth:** Required (user/admin)
- **Response:**
  - `200 OK` with booking object

## Get All Bookings
- **GET** `/api/bookings`
- **Auth:** Admin only
- **Response:**
  - `200 OK` with array of bookings

## Update Booking
- **PUT** `/api/bookings/:id`
- **Auth:** Required (user/admin)
- **Body:**
  - `specialRequests` (string, optional)
- **Response:**
  - `200 OK` with updated booking

## Cancel Booking
- **DELETE** `/api/bookings/:id`
- **Auth:** Required (user/admin)
- **Response:**
  - `200 OK` on success

## Join Booking as Team B
- **POST** `/api/bookings/:id/join`
- **Auth:** Required (user)
- **Body:**
  - `teamB` (object, required)
- **Response:**
  - `200 OK` with updated booking

## Process Booking Payment
- **POST** `/api/bookings/:id/payment`
- **Auth:** Required (user)
- **Body:**
  - `token` (string, required)
  - `amount` (number, required)
- **Response:**
  - `200 OK` with updated booking (on success)

## Check Availability
- **GET** `/api/bookings/availability/:futsalId?date=YYYY-MM-DD&startTime=HH:MM&endTime=HH:MM`
- **Auth:** Required (user)
- **Response:**
  - `200 OK` with availability status or bookings for the day

---

# User API Documentation

## Register
- **POST** `/api/users/register`
- **Body:** username, email, password, fullName, phone, etc.
- **Response:** 201 Created

## Login
- **POST** `/api/users/login`
- **Body:** email, password
- **Response:** 200 OK with token

## Forgot Password
- **POST** `/api/users/forgot-password`
- **Body:** email
- **Response:** 200 OK

## Reset Password
- **POST** `/api/users/reset-password`
- **Body:** token, email, password
- **Response:** 200 OK

## Get Profile
- **GET** `/api/users/me`
- **Auth:** Required
- **Response:** 200 OK with user data

---

# Payments API Documentation

## Verify Futsal Registration Payment
- **POST** `/api/payments/verify`
- **Body:** futsalId, paymentToken, amount
- **Response:** 200 OK

## Booking Payment
- **POST** `/api/bookings/:id/payment`
- **Body:** token, amount
- **Response:** 200 OK on success, 400 on error

---

*For more endpoints, see futsals.md or contact the backend team.*
