import pymongo
from faker import Faker
import random
from dotenv import load_dotenv
import os

fake = Faker()

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/futsal")  # Change if needed

cities = ["Kathmandu", "Lalitpur", "Bhaktapur"]
districts = ["Bagmati", "Kathmandu", "Lalitpur"]

futsals = []
for _ in range(10):
    futsals.append({
        "name": fake.company() + " Futsal",
        "location": {
            "city": random.choice(cities),
            "district": random.choice(districts),
            "address": fake.address(),
            "coordinates": {
                "latitude": float(fake.latitude()),
                "longitude": float(fake.longitude())
            }
        },
        "contactInfo": {
            "phone": fake.unique.msisdn()[0:10],
            "email": fake.unique.email(),
            "website": fake.url()
        },
        "pricing": {
            "basePrice": random.randint(1000, 3000)
        },
        "amenities": fake.words(nb=3),
        "images": [fake.image_url() for _ in range(2)],
        "isActive": True,
    })

client = pymongo.MongoClient(MONGODB_URI)
db = client.get_database()
futsals_col = db["futsals"]

futsals_col.delete_many({})  # Clear existing for test repeatability
result = futsals_col.insert_many(futsals)
print(f"Inserted {len(result.inserted_ids)} futsals.")
