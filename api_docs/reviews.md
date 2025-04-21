# Reviews API Documentation

## Create Review
- **POST** `/api/reviews`
- **Auth:** Required (user)
- **Body:**
  - `futsalId` (string, required)
  - `rating` (number, 1-5, required)
  - `feedback` (string, required)
- **Rules:**
  - Only users with a completed/confirmed booking for the futsal can review
  - Only one review per user per futsal
- **Response:**
  - `201 Created` with review object

## Get Reviews for Futsal
- **GET** `/api/reviews/:futsalId`
- **Response:**
  - `200 OK` with array of reviews (each includes user fullName, rating, feedback, createdAt)

## Delete Review
- **DELETE** `/api/reviews/:id`
- **Auth:** Required (user)
- **Rules:**
  - Only the review author can delete
- **Response:**
  - `200 OK` on success

---

*For more endpoints, see futsals.md, bookings.md, or contact the backend team.*
