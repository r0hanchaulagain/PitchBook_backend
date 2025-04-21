# Redis, Docker, Polling, and Maps/Location: Developer Guide

This guide explains the concepts and practical steps for working with Redis caching, Docker containerization, polling for real-time data, and integrating geolocation/maps in your Futsal project.

---

## 1. Redis Caching vs. Normal API Responses

### What is Redis Caching?
- **Normal API:** Each request is processed by the backend, which fetches data from the database every time.
- **With Redis:** Frequently requested data is temporarily stored in Redis (an in-memory data store). When a request comes in, the backend first checks Redis. If data is found (cache hit), it returns immediately—much faster than querying the database. If not (cache miss), it fetches from the database, returns the data, and stores it in Redis for next time.

### Benefits
- **Faster responses** for repeated requests (e.g., fetching futsal details).
- **Reduced database load.**

### How to Implement in Frontend?
- **No changes needed on the frontend.** You call the API endpoints as usual. Caching is handled transparently by the backend.
- **Tip:** If you want the freshest data (e.g., after a booking is made), you can force a reload or call an endpoint that invalidates the cache.

## Redis Caching Example (Backend)

```js
// src/controllers/futsalController.js
const { getAsync, setAsync, delAsync } = require('../utils/redisClient');

exports.getFutsalById = async (req, res) => {
  const cacheKey = `futsal:${req.params.id}`;
  const cached = await getAsync(cacheKey);
  if (cached) return res.json(JSON.parse(cached));
  // ...fetch from DB as usual...
  await setAsync(cacheKey, JSON.stringify(response), 'EX', 60 * 5); // Cache 5 min
  res.json(response);
};

// Invalidate cache after booking/payment:
await delAsync(`futsal:${futsalId}`);
```

---

## 2. Dockerized Codebase vs. Normal Codebase

### Normal Codebase
- You install Node, MongoDB, Redis, and dependencies directly on your machine.
- Environment differences can cause bugs ("works on my machine" issues).

### Dockerized Codebase
- **Docker** packages your app and its environment into a container. This container runs the same way everywhere (your laptop, server, cloud).
- All dependencies, OS, and configs are bundled.

### Why is Docker Superior?
- **Consistency:** Same environment everywhere.
- **Isolation:** No conflicts with other projects or system packages.
- **Easy deployment:** Build once, run anywhere.
- **Scalability:** Run multiple containers for load balancing.

### How to Use in This Project?
- Build: `docker build -t futsal-backend .`
- Run: `docker run -d -p 3000:3000 --env-file .env --env-file .env.redis --name futsal-backend futsal-backend`
- Use Docker Compose to run backend, MongoDB, and Redis together (optional, but recommended for production).

## Docker Compose Example

To run MongoDB, Redis, and the backend together:

```yaml
# docker-compose.yml
version: '3.8'
services:
  mongo:
    image: mongo:4.4
    ports:
      - "27017:27017"
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
  backend:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
      - .env.redis
    depends_on:
      - mongo
      - redis
```

**Basic Docker commands:**
- Build: `docker build -t futsal-backend .`
- Run: `docker run ...`
- Compose up: `docker-compose up -d`
- View logs: `docker logs futsal-backend`
- Stop: `docker stop futsal-backend` or `docker-compose down`

---

## 3. Frontend Integration for Geolocation/Maps

### Use Cases
- Show futsals near the user.
- Let users search by city/district or by map.

### Steps for Integration
1. **Get User Location:**
   - Use the browser’s Geolocation API:
     ```js
     navigator.geolocation.getCurrentPosition((pos) => {
       const { latitude, longitude } = pos.coords;
       // Use these to call the backend
     });
     ```
2. **Call Backend API:**
   - Example endpoint: `/api/futsals/nearby?lng=...&lat=...&radius=...`
   - Pass user's coordinates to get a list of futsals nearby.
3. **Display on Map:**
   - Use a map library (e.g., Google Maps JS API, Leaflet, Mapbox GL JS).
   - Plot futsal locations using their coordinates from the API response.

### Example (React + Leaflet)
```js
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

function FutsalMap({ futsals, userLocation }) {
  return (
    <MapContainer center={userLocation} zoom={13} style={{ height: '400px' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {futsals.map(f => (
        <Marker key={f._id} position={f.location.coordinates}>
          <Popup>{f.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

## Geolocation Error Handling & API Response Format

- **Error Handling:**
```js
navigator.geolocation.getCurrentPosition(
  (pos) => { /* Success */ },
  (err) => { alert('Location access denied, showing default results.'); }
);
```
- **API Response Format:**
  - Each futsal object in `/api/futsals/nearby` response includes:
    ```json
    {
      "_id": "...",
      "name": "...",
      "location": {
        "coordinates": [longitude, latitude],
        ...
      },
      ...
    }
    ```

---

## 4. Polling for Real-Time Data (Bonus)
- Polling means the frontend regularly requests the latest notifications (e.g., every 10 seconds).
- Use `setInterval` in your frontend to call the notifications endpoint and update the UI.

## Polling Example (Frontend)

```js
// Poll notifications every 10 seconds
useEffect(() => {
  const interval = setInterval(() => {
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setNotifications(data.notifications));
  }, 10000);
  return () => clearInterval(interval);
}, [token]);
```

---

## Summary Table
| Topic      | Backend Change Needed | Frontend Change Needed |
|------------|----------------------|-----------------------|
| Redis      | Yes (already done)   | No (transparent)      |
| Docker     | Yes (already done)   | No                    |
| Geolocation| No                   | Yes (see above)       |
| Polling    | No                   | Yes (setInterval)     |

---

If you want code samples or a step-by-step for any of these, let me know!
