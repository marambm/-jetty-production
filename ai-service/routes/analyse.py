import os
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/jetty")

from fastapi import APIRouter
from pymongo import MongoClient

router = APIRouter()

@router.get("/analyse")
def analyse():
    print("[AI] Reading from MongoDB production_daily collection...")

    try:
        client = MongoClient("mongodb://localhost:27017")
        db = client["jetty"]
        collection = db["production_daily"]

        total_records = collection.count_documents({})
        latest_record = collection.find_one(sort=[("date", -1)])

        field_names = []
        if latest_record:
            field_names = [k for k in latest_record.keys() if k != "_id"]

        print(f"[AI] Analysis complete — {total_records} record(s) in production_daily.")

        client.close()

        return {
            "status": "ok",
            "total_records": total_records,
            "latest_record": {
                "date":   latest_record.get("date") if latest_record else None,
                "fields": field_names,
                "source": latest_record.get("source") if latest_record else None,
            },
            "summary": f"{total_records} record(s) available in production_daily collection.",
        }

    except Exception as e:
        print(f"[AI] Analysis error: {e}")
        return {"status": "error", "message": str(e)}