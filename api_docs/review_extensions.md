# Review Extensions: How to Implement in the Future

This document outlines how to extend the review system to support additional features if needed, based on the original project requirements.

---

## 1. Update Own Review
- **Endpoint:** `PUT /api/reviews/:id`
- **Logic:**
  - Only the author (user) can update their review.
  - Allow updating `rating` and `feedback` fields.
- **Sample Controller Logic:**
  ```js
  exports.updateReview = async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Not found' });
    if (review.user.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not authorized' });
    if (req.body.rating) review.rating = req.body.rating;
    if (req.body.feedback) review.feedback = req.body.feedback;
    await review.save();
    res.json(review);
  };
  ```

---

## 2. Owner Response to Review
- **Endpoint:** `POST /api/reviews/:id/response`
- **Logic:**
  - Only the futsal owner can respond to reviews for their futsal.
  - Add a `response` field to the Review schema: `{ response: String, responseAt: Date }`.
- **Sample Controller Logic:**
  ```js
  exports.respondToReview = async (req, res) => {
    const review = await Review.findById(req.params.id).populate('futsal');
    if (!review) return res.status(404).json({ message: 'Not found' });
    if (review.futsal.owner.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not authorized' });
    review.response = req.body.response;
    review.responseAt = new Date();
    await review.save();
    res.json(review);
  };
  ```

---

## 3. Like a Review
- **Endpoint:** `POST /api/reviews/:id/like`
- **Logic:**
  - Add a `likes` array to the Review schema: `[userId]`.
  - When a user likes a review, add their userId if not already present.
- **Sample Controller Logic:**
  ```js
  exports.likeReview = async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Not found' });
    if (!review.likes) review.likes = [];
    if (!review.likes.includes(req.user._id)) {
      review.likes.push(req.user._id);
      await review.save();
    }
    res.json({ likes: review.likes.length });
  };
  ```

---

## 4. Schema Changes
- Add the following fields to the Review schema as needed:
  - `response: String` (owner's reply)
  - `responseAt: Date`
  - `likes: [ObjectId]` (user IDs who liked the review)

---

## 5. API Documentation
- Document the new endpoints and fields in your API docs for frontend integration.

---

*These extensions can be added without breaking existing review functionality. Contact the backend team for implementation support.*
