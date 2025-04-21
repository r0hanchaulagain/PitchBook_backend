# Real-Time Notifications API

This system provides real-time notifications for booking payments and reminders, using HTTP polling as the default method. Socket-based push can be added if polling is insufficient.

---

## Notification Model
- `user`: User receiving the notification
- `message`: Notification message
- `type`: Notification type (e.g., `booking_payment`, `reminder`)
- `isRead`: Boolean
- `createdAt`: Timestamp

---

## Endpoints

### 1. Get Unread Notifications (HTTP Polling)
`GET /api/notifications`
- **Auth:** User (required)
- **Returns:** List of unread notifications for the logged-in user, sorted by `createdAt` (desc)

### 2. Mark Notifications as Read
`POST /api/notifications/mark-read`
- **Auth:** User (required)
- **Body:** `{ ids: [<notificationId>, ...] }`
- **Returns:** Success message

---

## Usage
- The frontend polls `/api/notifications` every 10–30 seconds to fetch new notifications.
- Mark notifications as read after displaying to the user.

---

## Notification Triggers
- **Booking Payment:** When a booking payment is made, a notification is created for the user (and optionally futsal owner).
- **Reminders:** Scheduled job creates a reminder notification X minutes/hours before booking time.

---

## Optional: Push via Socket.IO
- If polling is insufficient (for instant updates), integrate Socket.IO for push notifications.
- The backend emits new notifications to connected clients in real time.

---

## Example Notification Object
```json
{
  "_id": "...",
  "user": "...",
  "message": "Your booking payment was successful!",
  "type": "booking_payment",
  "isRead": false,
  "createdAt": "2025-04-21T23:07:16+05:45"
}
```

---

*For reminders, ensure a scheduled job (cron or similar) runs to create notifications ahead of booking times.*
