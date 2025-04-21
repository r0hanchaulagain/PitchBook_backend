# Users API Documentation

## Register
- **POST** `/api/users/register`
- **Body:**
  - `username` (string, required)
  - `email` (string, required)
  - `password` (string, required)
  - `fullName` (string, required)
  - `phone` (string, required)
- **Response:**
  - `201 Created` with user object

## Login
- **POST** `/api/users/login`
- **Body:**
  - `email` (string, required)
  - `password` (string, required)
- **Response:**
  - `200 OK` with user info (no tokens in response)
  - **Sets `accessToken` and `refreshToken` as HttpOnly cookies.**

## Forgot Password
- **POST** `/api/users/forgot-password`
- **Body:**
  - `email` (string, required)
- **Response:**
  - `200 OK` (always, for security)

## Reset Password
- **POST** `/api/users/reset-password`
- **Body:**
  - `token` (string, required)
  - `email` (string, required)
  - `password` (string, required)
- **Response:**
  - `200 OK` with success/fail

## Refresh Token
- **POST** `/api/users/refresh-token`
- **Cookies:**
  - Requires `refreshToken` cookie (set at login)
- **Response:**
  - `200 OK` with message
  - **Sets new `accessToken` as HttpOnly cookie.**

## Logout
- **POST** `/api/users/logout`
- **Cookies:**
  - Requires `refreshToken` cookie
- **Response:**
  - `200 OK` with message
  - **Clears both `accessToken` and `refreshToken` cookies.**

## Get Profile
- **GET** `/api/users/me`
- **Auth:**
  - Requires `accessToken` cookie (set at login/refresh)
- **Response:**
  - `200 OK` with user data

---

## Other Endpoints (planned or admin)
- Get all users, get user by ID, update/delete user, etc.

*For more endpoints, see futsals.md or contact the backend team.*

**Note:**
All authentication and authorization now use secure HttpOnly cookies. The frontend must send requests with `credentials: 'include'` for cookies to be sent/received.
