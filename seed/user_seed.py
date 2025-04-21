import pymongo
from faker import Faker
import random
from dotenv import load_dotenv
import os

fake = Faker()

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/futsal")  # Change if needed

roles = ["admin", "user", "futsalOwner"]

users = []
for _ in range(10):
    users.append({
        "fullName": fake.name(),
        "username": fake.user_name() + str(random.randint(1000, 9999)),
        "email": fake.unique.email(),
        "phone": fake.unique.msisdn()[0:10],
        "password": fake.password(length=10),  # You may want to hash this manually for real tests
        "role": random.choice(roles),
        "profileImage": fake.image_url(),
        "favoritesFutsal": [],
        "bookingHistory": [],
        "isActive": True,
    })

client = pymongo.MongoClient(MONGODB_URI)
db = client.get_database()
users_col = db["users"]

users_col.delete_many({})  # Clear existing for test repeatability
result = users_col.insert_many(users)
print(f"Inserted {len(result.inserted_ids)} users.")
