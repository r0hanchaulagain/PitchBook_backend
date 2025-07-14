# ALTCHA CAPTCHA Implementation

This document provides an overview of the ALTCHA CAPTCHA implementation in the backend.

## Overview

ALTCHA is a privacy-focused, open-source CAPTCHA system that doesn't track users. It works by having the client solve a computational challenge that is then verified by the server.

## Configuration

### Environment Variables

Add the following to your `.env` file:

```
# ALTCHA Configuration
ALTCHA_HMAC_KEY=your-secure-hmac-key  # Generate a secure random key (min 32 chars)
```

If `ALTCHA_HMAC_KEY` is not set, a random key will be generated at startup, but this is not recommended for production.

## API Endpoints

### 1. Get a New Challenge

**Endpoint:** `GET /api/v1/altcha/challenge`

**Response:**
```json
{
  "success": true,
  "data": {
    "algorithm": "sha256",
    "challenge": "random-challenge-string",
    "salt": "random-salt",
    "hash": "hmac-hash",
    "signature": "challenge-signature",
    "publicKey": "public-key-content",
    "maxNumber": 1000000,
    "timestamp": 1644567890123
  }
}
```

### 2. Verify a Challenge

**Endpoint:** `POST /api/v1/altcha/verify`

**Request Body:**
```json
{
  "altcha": {
    "algorithm": "sha256",
    "challenge": "challenge-from-client",
    "signature": "signature-from-client",
    "salt": "salt-from-client",
    "hash": "hash-from-client"
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "CAPTCHA verified successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error message"
}
```

## Frontend Integration

1. Include the ALTCHA JavaScript library in your frontend:

```html
<script src="https://cdn.jsdelivr.net/npm/@altcha/umd@latest/dist/altcha-umd.js"></script>
```

2. Initialize the widget:

```javascript
// Initialize ALTCHA
const altcha = new ALTCHA({
  // Your server's challenge endpoint
  challenge: '/api/v1/altcha/challenge',
  
  // Callback when the challenge is completed
  onVerify: function(token) {
    // The token contains the challenge response
    console.log('ALTCHA verified:', token);
    
    // Include the token in your form submission
    document.querySelector('form').addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Add the token to your form data
      const formData = new FormData(this);
      formData.append('altcha', token);
      
      // Submit the form with the ALTCHA token
      fetch('/your-endpoint', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        console.log('Success:', data);
      })
      .catch(error => {
        console.error('Error:', error);
      });
    });
  }
});

// Render the widget
document.addEventListener('DOMContentLoaded', function() {
  altcha.render('altcha-container');
});
```

3. Add the container to your HTML:

```html
<form>
  <!-- Your form fields here -->
  
  <div id="altcha-container"></div>
  
  <button type="submit">Submit</button>
</form>
```

## Protecting Routes

To protect a route with ALTCHA verification, use the `verifyAltcha` middleware:

```javascript
const { verifyAltcha } = require('../middlewares/security/altcha');

// Protect a route with ALTCHA
router.post('/protected-route', verifyAltcha, (req, res) => {
  // This code will only run if the ALTCHA verification passes
  res.json({ success: true, message: 'Protected route accessed' });
});
```

## Security Considerations

1. Always use HTTPS in production to prevent man-in-the-middle attacks.
2. Set a strong `ALTCHA_HMAC_KEY` in your environment variables.
3. Monitor and rate limit the challenge generation endpoint to prevent abuse.
4. Consider implementing additional security measures like IP-based rate limiting.

## Troubleshooting

- If you see `Invalid ALTCHA hash` errors, ensure the `ALTCHA_HMAC_KEY` is the same across server restarts.
- If challenges expire too quickly, adjust the `maxChallengeAge` in the ALTCHA configuration.
- For other issues, check the server logs for detailed error messages.
