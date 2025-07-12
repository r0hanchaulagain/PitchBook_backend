import random
from dotenv import load_dotenv
import os
import csv
from bson.objectid import ObjectId
from pymongo import MongoClient
from faker import Faker
# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

MONGODB_URI = os.getenv("MONGODB_URI")  # Change if needed

cities = ["Kathmandu", "Lalitpur", "Bhaktapur"]
districts = ["Bagmati", "Kathmandu", "Lalitpur"]

# Path to the CSV file
csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'google_places_futsals.csv')

with open(csv_path, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    columns = reader.fieldnames
    print('Columns:')
    print(columns)
    print('\nFirst 10 rows:')
    for i, row in enumerate(reader):
        if i >= 10:
            break
        print(row)

# === CONFIGURATION ===
OWNER_ID = ObjectId('685a115092bce5aa299d6470')  # <-- Replace with your actual owner ObjectId
OWNER_EMAIL = 'growth.mate01+f@gmail.com'     # <-- Replace with your actual owner email

AMENITIES = [
    'basic futsal facilities',
    'private locker',
    'free wifi',
    'parking',
    'cafeteria',
    'free water bottles',
    'changing room'
]
IMAGES = [
    "https://www.goalnepal.com/uploads/news/1627182357.jpg",
    "https://www.sourcenepal.com/wp-content/uploads/2020/09/Futsal-Ground-Kathmandu-500x376.jpg",
    "https://anilblon.wordpress.com/wp-content/uploads/2015/08/futsal-in-nepal.jpg",
    "https://republicaimg.nagariknewscdn.com/shared/web/uploads/media/1604754889_footsal-1200x560_20210708152121.jpg",
    "https://lexlimbu.com/wp-content/uploads/SKY-GOALS-Kathmandu.jpg",
    "https://assets-cdn.kathmandupost.com/uploads/source/news/2022/third-party/0bizline-1647006537.jpg",
    "https://5.imimg.com/data5/SELLER/Default/2021/5/EY/RW/SB/3103550/futsal-court-construction-1000x1000.jpg",
    "https://5.imimg.com/data5/SELLER/Default/2023/5/310700433/BD/XR/JE/5974440/futsal-ground-artificial-grass-1000x1000.png",
    "https://himelectronics.com/MediaThumb/orginal/Media/Blogs/Inter-Depart%20Futsal/img4.png",
    "https://pbs.twimg.com/media/FI6QW0-aMAE6ydE.jpg"
]
INTRO_PARAGRAPHS = [
    "Experience the thrill of the game at our state-of-the-art futsal ground, perfect for players of all levels.",
    "Join a vibrant community of football enthusiasts and enjoy top-notch facilities at our futsal center.",
    "Our futsal arena offers a safe, clean, and energetic environment for your next match or practice.",
    "Step onto the pitch and feel the excitement—our futsal ground is designed for unforgettable moments.",
    "From friendly matches to competitive tournaments, our venue is the go-to spot for futsal in the city.",
    "Enjoy modern amenities, professional turf, and a welcoming atmosphere every time you play.",
    "Whether you're a beginner or a pro, our futsal ground is the perfect place to sharpen your skills.",
    "Book your slot today and discover why we're the favorite futsal destination for so many players.",
    "Our facility combines convenience, comfort, and quality for the ultimate futsal experience.",
    "Bring your friends and make memories—our futsal ground is where passion meets play."
]
OPENING_HOURS_OPTIONS = [6, 7, 8, 9]
SIDES_DISTRIBUTION = ([5]*45 + [6]*30 + [7]*25)
fake=Faker()
# Generate 10 random users
def generate_random_users():
    users = []
    for i in range(10):
        user = {
            '_id': ObjectId(),
            'fullName': f'User {i+1}',
            'email': f'user{i+1}@example.com',
            'role': 'user',
            'password': 'hashedpassword',
            'isActive': True,
            'phone': fake.phone_number()  # Generate unique phone number
        }
        users.append(user)
    return users

# Parse reviews_summary string into list of (rating, feedback)
def parse_reviews_summary(summary):
    if not summary:
        return []
    reviews = []
    for part in summary.split('|'):
        part = part.strip()
        if part.startswith('★'):
            try:
                rating = int(part[1])
                feedback = part[3:].strip(': ').strip()
                if feedback:
                    reviews.append({'rating': rating, 'feedback': feedback})
            except Exception:
                continue
    return reviews

# Main seeding logic
def main():
    client = MongoClient(MONGODB_URI)
    db = client.get_database("test")  # Change if needed
    futsals_col = db['futsals']
    users_col = db['users']
    reviews_col = db['reviews']

    # Insert random users
    users = generate_random_users()
    users_col.delete_many({'email': {'$regex': r'^user[0-9]+@example.com$'}})
    users_col.insert_many(users)
    user_ids = [u['_id'] for u in users]

    # Read futsal CSV
    futsals = []
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for i, row in enumerate(reader):
            # Assign 2-4 images, allow reuse after pool is exhausted
            num_images = random.randint(2, 4)
            images = random.sample(IMAGES, num_images)

            # Amenities: always include 'basic futsal facilities', randomize rest
            amenities = ['basic futsal facilities']
            other_amenities = [a for a in AMENITIES if a != 'basic futsal facilities']
            random.shuffle(other_amenities)
            num_other = random.randint(0, len(other_amenities))
            amenities += other_amenities[:num_other]

            # Side: random from distribution
            side = random.choice(SIDES_DISTRIBUTION)

            # Base price
            base_price = 500 + 50 * (len(amenities) - 1) + 50 * (side - 5)

            # Pricing rules
            pricing_rules = []
            for day in ['monday','tuesday','wednesday','thursday','friday']:
                pricing_rules.append({
                    'day': day,
                    'start': '06:00',
                    'end': '21:00',
                    'price': base_price
                })
            for day in ['saturday','sunday']:
                pricing_rules.append({
                    'day': day,
                    'start': '06:00',
                    'end': '21:00',
                    'price': int(base_price * 1.1)
                })

            # Operating hours (new schema)
            opening_hour = random.choice(OPENING_HOURS_OPTIONS)
            operating_hours = {
                "weekdays": {"open": f"{opening_hour:02d}:00", "close": "21:00"},
                "weekends": {"open": f"{opening_hour:02d}:00", "close": "21:00"},
                "holidays": {"open": f"{opening_hour:02d}:00", "close": "21:00"}
            }

            # Pricing modifiers (new schema)
            pricing_modifiers = {
                "timeOfDay": {
                    "enabled": True,
                    "morning": 0.05,
                    "midday": 0,
                    "evening": 0.1
                },
                "holiday": {
                    "enabled": True,
                    "percentage": 0.13
                },
                "weekend": {
                    "enabled": True,
                    "percentage": 0.07
                },
                "location": {
                    "enabled": False,
                    "near": 0.1,
                    "far": -0.05
                }
            }

            # Info
            info = random.choice(INTRO_PARAGRAPHS)

            # Location
            try:
                latitude = float(row['latitude']) if row['latitude'] else 0.0
                longitude = float(row['longitude']) if row['longitude'] else 0.0
            except Exception:
                latitude, longitude = 0.0, 0.0
            location = {
                'address': row['address'],
                'city': row['area'],
                'coordinates': {
                    'type': 'Point',
                    'coordinates': [longitude, latitude]
                }
            }

            # Contact info
            contact_info = {
                'phone': row['phone'] or row['international_phone'],
                'email': OWNER_EMAIL,
                'website': row['website']
            }

            # Parse reviews
            parsed_reviews = parse_reviews_summary(row.get('reviews_summary', ''))
            # If not enough, generate random
            while len(parsed_reviews) < 10:
                parsed_reviews.append({
                    'rating': random.randint(3, 5),
                    'feedback': random.choice([
                        'Great futsal experience!',
                        'Nice turf and friendly staff.',
                        'Good location and facilities.',
                        'Enjoyed playing here.',
                        'Would recommend to friends.',
                        'Clean and well maintained.',
                        'Affordable and accessible.',
                        'Spacious ground and good lighting.',
                        'Fun place for regular games.',
                        'Excellent service and environment.'
                    ])
                })
            parsed_reviews = parsed_reviews[:10]

            # Insert reviews and collect IDs
            review_ids = []
            for idx, review in enumerate(parsed_reviews):
                review_doc = {
                    'futsal': None,  # to be updated after futsal insert
                    'user': user_ids[idx % len(user_ids)],
                    'rating': review['rating'],
                    'feedback': review['feedback'],
                    'createdAt': random.choice([
                        None,  # let Mongo default
                        ])
                }
                review_ids.append(reviews_col.insert_one(review_doc).inserted_id)

            # Futsal doc
            futsal_doc = {
                'name': row['name'],
                'owner': OWNER_ID,
                'operatingHours': operating_hours,
                'amenities': amenities,
                'pricing': {
                    'basePrice': base_price,
                    'rules': pricing_rules,
                    'modifiers': pricing_modifiers
                },
                'location': location,
                'contactInfo': contact_info,
                'images': images,
                'info': info,
                'side': side,
                'reviews': review_ids,
                'bookings': [],
                'closures': [],
                'createdAt': None,
                'updatedAt': None,
                'isActive': True
            }
            futsal_id = futsals_col.insert_one(futsal_doc).inserted_id

            # Update reviews with futsal id
            reviews_col.update_many({'_id': {'$in': review_ids}}, {'$set': {'futsal': futsal_id}})

            futsals.append(futsal_id)

    print(f"Inserted {len(users)} users, {len(futsals)} futsals, and {len(futsals)*10} reviews.")

if __name__ == '__main__':
    main()
