# Futsal API - Query Parameters Documentation

## Endpoint

`GET /api/v1/futsals`

## Query Parameters

| Query Param | Type   | Description                                                            | Example               |
|-------------|--------|------------------------------------------------------------------------|-----------------------|
| search      | string | Search by futsal name (case-insensitive, partial match)                | `?search=arena`       |
| city        | string | Filter by city (exact match, case-sensitive)                           | `?city=Kathmandu`     |
| district    | string | Filter by district (exact match, case-sensitive)                       | `?district=Lalitpur`  |
| page        | int    | Page number for pagination (defaults to 1 if not provided)             | `?page=2`             |
| limit       | int    | Number of results per page (defaults to 15 if not provided)            | `?limit=20`           |
| minRating   | float  | Filter by minimum average rating (inclusive)                           | `?minRating=4.0`      |

## Example Requests

- Get all futsals in Kathmandu, 20 per page, page 2:
  ```http
  GET /api/v1/futsals?city=Kathmandu&limit=20&page=2
  ```
- Search futsals with "arena" in their name, in Lalitpur district:
  ```http
  GET /api/v1/futsals?search=arena&district=Lalitpur
  ```
- Get the first 15 futsals (default):
  ```http
  GET /api/v1/futsals
  ```
- Get futsals with average rating ≥ 4.0:
  ```http
  GET /api/v1/futsals?minRating=4.0
  ```

---

> **Note:** All parameters are optional. Pagination is enabled by default with a limit of 15 per page.

---

## Get Nearby Futsals
- **GET** `/api/futsals/nearby?lng=NUMBER&lat=NUMBER&radius=NUMBER`
- **Query Params:**
  - `lng` (Number, required): Longitude of user location
  - `lat` (Number, required): Latitude of user location
  - `radius` (Number, optional, meters, default 3000): Search radius
- **Response:**
  - `200 OK` with array of futsals sorted by distance
  - Each futsal includes its coordinates, name, pricing, and other info

## Example React Integration

```js
// Example: Fetch nearby futsals from React frontend
const fetchNearbyFutsals = async (lng, lat, radius = 3000) => {
  const res = await fetch(`/api/futsals/nearby?lng=${lng}&lat=${lat}&radius=${radius}`);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

// Usage in a React component
useEffect(() => {
  navigator.geolocation.getCurrentPosition(pos => {
    fetchNearbyFutsals(pos.coords.longitude, pos.coords.latitude)
      .then(data => setFutsals(data.futsals));
  });
}, []);

---

## Dynamic Pricing
- Each futsal has a `pricing` object:
  - `basePrice`: Default price per hour
  - `rules`: Array of dynamic pricing rules:
    - `day`: e.g. 'saturday', 'holiday', or 'any'
    - `start`/`end`: Time range ("HH:MM")
    - `price`: Price for that slot
  - `ratingModifier`: Price modifier based on average rating
  - `distanceModifier`: Price modifier based on distance (if location provided)
  - `dynamicPrice`: Final price after all modifiers
- **How it works:**
  - When creating a booking, backend uses these rules to determine the price for the selected day and time.
  - Example:
    ```json
    {
      "basePrice": 2000,
      "rules": [
        { "day": "saturday", "start": "18:00", "end": "22:00", "price": 2500 },
        { "day": "any", "start": "06:00", "end": "09:00", "price": 1500 }
      ],
      "ratingModifier": 0.1, // +10% for avg. rating ≥ 4.5
      "distanceModifier": 0.05, // +5% for distance > 5km
      "dynamicPrice": 2200
    }
    ```

- **Frontend integration:**
  - Fetch futsal details and show pricing calendar or slot picker.
  - To preview price for a slot, send booking details to backend, or replicate pricing logic in JS for instant feedback.

---

## Rating-based Dynamic Pricing and Filtering
- You can now filter futsals by average rating using the `minRating` query param:
  - Example: `/api/futsals?minRating=4.0` (returns futsals with avg. rating ≥ 4.0)
- Each futsal response includes:
  - `avgRating` (average rating)
  - `reviewCount` (number of reviews)
- Dynamic pricing now includes a rating modifier:
  - **+10%** if average rating ≥ 4.5
  - **+5%** if average rating ≥ 4.0
  - **-10%** if average rating ≤ 2.5
- The response includes `ratingModifier` in the pricing object.

---

*For more endpoints, see bookings.md or contact the backend team.*
