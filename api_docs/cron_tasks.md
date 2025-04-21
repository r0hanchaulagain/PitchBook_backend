# Cron Tasks Documentation

This document describes all scheduled (cron) jobs running in the Futsal Management System backend.

---

## 1. Booking Reminder Job
- **File:** `src/jobs/bookingReminderJob.js`
- **Schedule:** Every day at 10:00 AM
- **Purpose:**
  - Sends reminder emails to users with bookings scheduled for the next day (if booking was created more than 1 day in advance).
- **Logic:**
  - Finds all bookings for tomorrow with status 'pending' or 'confirmed'.
  - Sends reminder email to the user for each booking.

---

## 2. Owner Deletion Cascade & Hard Deletion Job
- **File:** `src/jobs/ownerDeletionJob.js`
- **Schedule:** Every hour (at minute 0)
- **Purpose:**
  - Performs hard deletion of futsal owner accounts, their futsals, and related bookings if not restored within 24 hours of scheduling deletion.
  - Sends cancellation emails to users with active bookings for deleted futsals.
- **Logic:**
  - Finds all futsal owners scheduled for deletion whose 24-hour window has expired.
  - For each, deletes all owned futsals and related bookings, then deletes the owner account.
  - Notifies users with active bookings of cancellation due to deletion.

---

## Adding More Cron Jobs
- Place new cron jobs in the `src/jobs/` directory.
- Document their schedule, purpose, and logic here for maintainability.

---

*For questions or to add new scheduled tasks, contact the backend team.*
