# Email Notification Triggers

This document describes all cases where emails are sent in the Futsal Management System backend.

---

## 1. Password Reset Success
- After a user successfully resets their password, they receive a confirmation email.

## 2. Booking Attempt (Slot Reserved)
- When a booking is created (pending), the futsal owner receives an email notification.

## 3. Booking Payment Success
- When a booking is paid and confirmed, both the user and futsal owner receive confirmation emails.

## 4. Booking Cancelled
- When a booking is cancelled, both the user and futsal owner receive cancellation emails.

## 5. Booking Reminder (1 Day Before)
- Users receive a reminder email a day before their booking if the booking was created more than 1 day in advance.

## 6. Futsal Details Updated
- When futsal details are updated, the futsal owner receives an email notification.

## 7. Booking/Payment Confirmations
- All booking and payment related confirmations are sent to the respective parties (users and futsal owners).

## 8. Futsal/Owner Deletion Policy
- Futsals cannot be deleted directly. If a futsal owner account is deleted, their futsal(s) and related data are deleted, and notifications should be sent to the owner and users with affected bookings (not yet implemented).

---

*For more details or to extend notifications, see the backend team or this documentation.*
