import os
import datetime
import logging
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError
from dotenv import load_dotenv
from bson.objectid import ObjectId
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from passlib.context import CryptContext
import jwt
import os
from motor.motor_asyncio import AsyncIOMotorClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "ecommerce_sentiment")
# For OpenAI, etc.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your_openai_api_key")
# (Assuming you use OpenAI API key somewhere in your code)
# openai.api_key = OPENAI_API_KEY

app = FastAPI(title="Customer Feedback Dashboard Backend")

# Enable CORS so frontend can access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use Motor's AsyncIOMotorClient instead of synchronous MongoClient
client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]
reviews_collection = db["sentimental_analysis"]
monthly_reports_collection = db["sentimental_monthly_reports"]
users_collection = db["sentimental_dashboard_users"]


# # JWT & Password Setup
SECRET_KEY = os.getenv("SECRET_KEY", "your_secret_key")  # Update for production
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/signin")

# Pydantic model for user input
class UserIn(BaseModel):
    email: str
    password: str

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# Sign-Up Endpoint (only allows emails ending with "@joineverestgroup.com")
@app.post("/api/signup")
async def signup(user_in: UserIn):
    required_domain = "joineverestgroup.com"
    if not user_in.email.endswith(f"@{required_domain}"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {required_domain} domain emails can register"
        )
    # Check if user already exists
    existing_user = await users_collection.find_one({"email": user_in.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    # Store the new user with hashed password
    hashed_password = get_password_hash(user_in.password)
    user_doc = {
        "email": user_in.email,
        "hashed_password": hashed_password,
        "created_at": datetime.utcnow()
    }
    result = await users_collection.insert_one(user_doc)
    
    access_token = create_access_token(
        data={"sub": user_in.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Sign-In Endpoint
@app.post("/api/signin")
async def signin(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await users_collection.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    access_token = create_access_token(
        data={"sub": user["email"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Verify Token Endpoint
@app.get("/api/verify")
async def verify_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"email": email}
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# --- Pydantic Models ---
class OverallReport(BaseModel):
    overall_sentiment: dict       # e.g. { "positive": 80.4, ... }
    total_reviews: int
    last_updated: datetime
    sentiment_counts: Dict[str, int] = {}

class DetailedReport(BaseModel):
    overall_sentiment: dict
    overall_sentiment_detail: dict
    overall_sentimental_category: dict
    total_reviews: int
    last_updated: datetime

class TrendReport(BaseModel):
    trends: list  # List of dicts: { "month": "YYYY-MM", "positive": X, "negative": Y, "neutral": Z }

class NegativeTrendReport(BaseModel):
    trends: list  # List of dicts: { "month": "YYYY-MM", "negative": X }

class PlatformComparisonReport(BaseModel):
    comparison: dict

class RiskAlert(BaseModel):
    alert: str

class ProsConsReport(BaseModel):
    pros: List[Dict[str, Any]]
    cons: List[Dict[str, Any]]

class TopProsConsReport(BaseModel):
    top_pros: dict  # e.g., { "feature1": count, ... }
    top_cons: dict

class ChatMessage(BaseModel):
    session_id: str
    message: str
    history: list = []

# --- Helper Functions ---
def parse_date(date_str: str):
    try:
        return datetime.fromisoformat(date_str)
    except Exception:
        return None

def build_time_filter(start_date: str = None, end_date: str = None):
    filter_query = {}
    if start_date:
        sd = parse_date(start_date)
        if sd:
            filter_query["$gte"] = sd
    if end_date:
        ed = parse_date(end_date)
        if ed:
            filter_query["$lte"] = ed
    return filter_query if filter_query else None

def common_match(platform: str = None, start_date: str = None, end_date: str = None, company: str = None):
    match = {}
    if platform:
        match["platform"] = platform
    if company:
        match["company"] = company
    time_filter = build_time_filter(start_date, end_date)
    if time_filter:
        match["time_period"] = time_filter
    return match

def humanize_snake_case(value: str) -> str:
    spaced = value.replace("_", " ")
    return spaced.title()

def convert_object_ids(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, list):
        return [convert_object_ids(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_object_ids(value) for key, value in obj.items()}
    else:
        return obj

############################################
# 1) Overall Sentiment Distribution Endpoint
############################################
@app.get("/report/overall_by_platform", response_model=OverallReport)
async def overall_by_platform(
    platform: str = Query(None),
    days: Optional[int] = Query(None),
    company: str = Query(None)
):
    if days is not None:
        now = datetime.utcnow()
        start = now - timedelta(days=days)
        start_str, end_str = start.isoformat(), now.isoformat()
    else:
        start_str, end_str = None, None

    base_match = common_match(platform, start_str, end_str, company)
    
    total = await reviews_collection.count_documents(base_match)
    if total == 0:
        raise HTTPException(status_code=404, detail="No review data found")
    
    pipeline = [
        {"$match": {**base_match, "overall_sentiment": {"$ne": ""}}},
        {"$group": {"_id": "$overall_sentiment", "count": {"$sum": 1}}}
    ]
    results = await reviews_collection.aggregate(pipeline).to_list(length=None)
    
    overall_sentiment = {
        doc["_id"]: round((doc["count"] / total) * 100, 2)
        for doc in results
    }
    sentiment_counts = {
        doc["_id"]: doc["count"]
        for doc in results
    }
    latest_doc = await reviews_collection.find_one(base_match, sort=[("time_period", -1)])
    last_updated = latest_doc.get("time_period", datetime.utcnow()) if latest_doc else datetime.utcnow()

    return {
        "overall_sentiment": overall_sentiment,
        "total_reviews": total,
        "last_updated": last_updated,
        "sentiment_counts": sentiment_counts
    }

############################################
# 2) Sentiment Trends Endpoint
############################################
@app.get("/report/trends", response_model=TrendReport)
async def report_trends(
    platform: str = Query(None),
    days: Optional[int] = Query(None),
    company: str = Query(None)
):
    try:
        if days is not None:
            now = datetime.utcnow()
            start = now - timedelta(days=days)
            start_str, end_str = start.isoformat(), now.isoformat()
        else:
            start_str, end_str = None, None

        match = common_match(platform, start_str, end_str, company)
        match["overall_sentiment"] = {"$in": ["positive", "negative", "neutral"]}

        pipeline = [
            {"$match": match},
            {"$project": {
                "year_month": {"$dateToString": {"format": "%Y-%m", "date": "$time_period"}},
                "overall_sentiment": 1
            }},
            {"$group": {
                "_id": {"year_month": "$year_month", "sentiment": "$overall_sentiment"},
                "count": {"$sum": 1}
            }},
            {"$group": {
                "_id": "$_id.year_month",
                "sentiments": {"$push": {"sentiment": "$_id.sentiment", "count": "$count"}}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        results = await reviews_collection.aggregate(pipeline).to_list(length=None)
        trends = []
        for doc in results:
            month = doc["_id"]
            data = {"month": month, "positive": 0, "negative": 0, "neutral": 0}
            for item in doc["sentiments"]:
                data[item["sentiment"]] = item["count"]
            trends.append(data)
        
        return TrendReport(trends=trends)
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 2.1) Monthly Feedback Endpoint
############################################
class MonthlyFeedbackItem(BaseModel):
    month: str
    top_positive: List[dict]
    top_negative: List[dict]

class MonthlyFeedbackResponse(BaseModel):
    data: List[MonthlyFeedbackItem]

@app.get("/report/monthly_feedback", response_model=MonthlyFeedbackResponse)
async def monthly_feedback(
    platform: Optional[str] = None,
    days: Optional[int] = None,
    company: Optional[str] = None
):
    if days is not None:
        now = datetime.utcnow()
        start = now - timedelta(days=days)
        start_str, end_str = start.isoformat(), now.isoformat()
    else:
        start_str, end_str = None, None

    base_match = common_match(platform, start_str, end_str, company)
    base_match["overall_sentiment"] = {"$in": ["positive", "negative"]}
    base_match["time_period"] = {"$exists": True, "$ne": None}

    pipeline = [
        {"$match": base_match},
        {"$project": {
            "year_month": {"$dateToString": {"format": "%Y-%m", "date": "$time_period"}},
            "category": "$overall_sentimental_category",
            "sentiment": "$overall_sentiment"
        }},
        {"$group": {
            "_id": {"month": "$year_month", "category": "$category", "sentiment": "$sentiment"},
            "count": {"$sum": 1}
        }},
        {"$group": {
            "_id": "$_id.month",
            "categoryData": {"$push": {
                "category": "$_id.category",
                "sentiment": "$_id.sentiment",
                "count": "$count"
            }}
        }},
        {"$sort": {"_id": 1}}
    ]
    results = await reviews_collection.aggregate(pipeline).to_list(length=None)

    output = []
    for doc in results:
        month = doc["_id"]
        category_data = doc["categoryData"]

        positives = [d for d in category_data if d["sentiment"] == "positive"]
        negatives = [d for d in category_data if d["sentiment"] == "negative"]

        positives.sort(key=lambda x: x["count"], reverse=True)
        negatives.sort(key=lambda x: x["count"], reverse=True)
        top_pos = positives[:3]
        top_neg = negatives[:3]

        for item in top_pos:
            item["category"] = humanize_snake_case(item["category"])
        for item in top_neg:
            item["category"] = humanize_snake_case(item["category"])

        output.append({
            "month": month,
            "top_positive": top_pos,
            "top_negative": top_neg
        })

    return {"data": output}

############################################
# 3) Negative Trends Endpoint
############################################
@app.get("/report/negative_trends", response_model=NegativeTrendReport)
async def negative_trends(
    platform: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    company: str = Query(None)
):
    try:
        match = common_match(platform, start_date, end_date, company)
        match["overall_sentiment"] = "negative"
        pipeline = [
            {"$match": match},
            {"$project": {"year_month": {"$dateToString": {"format": "%Y-%m", "date": "$time_period"}}}},
            {"$group": {"_id": "$year_month", "negative_count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        results = await reviews_collection.aggregate(pipeline).to_list(length=None)
        trends = [{"month": doc["_id"], "negative": doc["negative_count"]} for doc in results]
        return NegativeTrendReport(trends=trends)
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 4) Category Table for Pros/Cons Endpoint
############################################
@app.get("/report/category_table")
async def category_table_pros_cons(
    platform: str = Query(None),
    sentiment: str = Query(None),
    limit: int = Query(10),
    start_date: str = Query(None),
    end_date: str = Query(None),
    company: str = Query(None)
):
    try:
        match = common_match(platform, start_date, end_date, company)
        match["category"] = {"$ne": ""}
        if sentiment:
            match["overall_sentiment"] = sentiment
        
        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        results = await reviews_collection.aggregate(pipeline).to_list(length=None)
        table = []
        for doc in results:
            raw_category = doc["_id"]
            count = doc["count"]
            human_category = humanize_snake_case(raw_category)
            table.append({"category": human_category, "count": count})
        return {"table": table}
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 5.1) Overall Sentimental Category Pros/Cons
############################################
@app.get("/report/overall_sentimental_category_pros_cons")
async def overall_sentimental_category_pros_cons(
    parent_category: str = Query(..., description="The parent category to filter on (e.g., 'Returns & Refunds')"),
    sentiment: str = Query(None, description="Sentiment to filter on (e.g., 'positive' or 'negative')"),
    company: str = Query(None),
    limit: int = Query(5)
):
    try:
        match = {}
        if company:
            match["company"] = company
        match["category"] = parent_category
        match["overall_sentimental_category"] = {"$ne": ""}
        if sentiment:
            match["overall_sentiment"] = sentiment
        
        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$overall_sentimental_category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        results = await reviews_collection.aggregate(pipeline).to_list(length=None)
        table = []
        for doc in results:
            table.append({
                "category": humanize_snake_case(doc["_id"]),
                "count": doc["count"]
            })
        return {"table": table}
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 5.2) Issue Details Endpoint
############################################
@app.get("/report/issue_details")
async def issue_details(
    category: str = Query(...), 
    sentiment: str = Query(None),
    company: str = Query(None),
    limit: int = Query(20)
):
    try:
        match = {}
        if company:
            match["company"] = company

        snake_case_cat = category.lower().replace(" ", "_")
        match["overall_sentimental_category"] = snake_case_cat
        if sentiment:
            match["overall_sentiment"] = sentiment

        docs_cursor = reviews_collection.find(match).limit(limit)
        docs = await docs_cursor.to_list(length=limit)
        docs = [convert_object_ids(doc) for doc in docs]
        for d in docs:
            if "time_period" in d and d["time_period"]:
                d["time_period"] = d["time_period"].strftime("%Y-%m-%d %H:%M:%S")
        return {"reviews": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 6) Detailed Report Endpoint
############################################
@app.get("/report/detailed", response_model=DetailedReport)
async def detailed_report(
    platform: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    limit: int = Query(10),
    company: str = Query(None)
):
    try:
        base_match = common_match(platform, start_date, end_date, company)
        base_match["overall_sentiment"] = {"$in": ["positive", "negative", "neutral"]}
        total = await reviews_collection.count_documents(base_match)
        if total == 0:
            raise HTTPException(status_code=404, detail="No review data found")
        
        pipeline_overall = [
            {"$match": base_match},
            {"$group": {"_id": "$overall_sentiment", "count": {"$sum": 1}}}
        ]
        overall_results = await reviews_collection.aggregate(pipeline_overall).to_list(length=None)
        overall = {doc["_id"]: round((doc["count"] / total) * 100, 2) for doc in overall_results}
        
        pipeline_detail = [
            {"$match": {**base_match, "overall_sentiment_detail": {"$ne": ""}}},
            {"$group": {"_id": "$overall_sentiment_detail", "count": {"$sum": 1}}}
        ]
        detail_results = await reviews_collection.aggregate(pipeline_detail).to_list(length=None)
        detail = {doc["_id"]: round((doc["count"] / total) * 100, 2) for doc in detail_results}
        
        pipeline_category = [
            {"$match": {**base_match, "overall_sentimental_category": {"$ne": ""}}},
            {"$group": {"_id": "$overall_sentimental_category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        category_results = await reviews_collection.aggregate(pipeline_category).to_list(length=None)
        category = {doc["_id"]: doc["count"] for doc in category_results}
        latest_doc = await reviews_collection.find_one(base_match, sort=[("time_period", -1)])
        last_updated = latest_doc.get("time_period", datetime.utcnow()) if latest_doc else datetime.utcnow()
        return DetailedReport(
            overall_sentiment=overall,
            overall_sentiment_detail=detail,
            overall_sentimental_category=category,
            total_reviews=total,
            last_updated=last_updated
        )
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 7) Top Pros/Cons Endpoint
############################################
@app.get("/report/top_pros_cons", response_model=TopProsConsReport)
async def top_pros_cons(
    platform: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    company: str = Query(None)
):
    try:
        match = common_match(platform, start_date, end_date, company)
        pos_pipeline = [
            {"$match": {**match, "overall_sentiment": "positive", "overall_summary": {"$ne": ""}}},
            {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        neg_pipeline = [
            {"$match": {**match, "overall_sentiment": "negative", "overall_summary": {"$ne": ""}}},
            {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        pos_results = await reviews_collection.aggregate(pos_pipeline).to_list(length=None)
        neg_results = await reviews_collection.aggregate(neg_pipeline).to_list(length=None)
        top_pros = {doc["_id"]: doc["count"] for doc in pos_results}
        top_cons = {doc["_id"]: doc["count"] for doc in neg_results}
        return TopProsConsReport(top_pros=top_pros, top_cons=top_cons)
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 9) Reviews Endpoint
############################################
@app.get("/reviews")
async def get_reviews(
    sentiment: str = Query(None),
    platform: str = Query(None),
    skip: int = Query(0),
    limit: int = Query(20),
    company: str = Query(None)
):
    query = {}
    if sentiment:
        query["overall_sentiment"] = sentiment
    if platform:
        query["platform"] = platform
    if company:
        query["company"] = company
    try:
        cursor = reviews_collection.find(query).skip(skip).limit(limit)
        reviews = await cursor.to_list(length=limit)
        for review in reviews:
            review["_id"] = str(review["_id"])
        return {"reviews": reviews}
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 10) Overall Detail Endpoint
############################################
class OverallDetailReportModel(BaseModel):
    overall_sentiment_detail: Dict[str, Dict[str, float]]
    total_reviews: int
    last_updated: datetime

@app.get("/report/overall_detail", response_model=OverallDetailReportModel)
async def overall_detail(
    platform: str = Query(None),
    days: Optional[int] = Query(None),
    company: str = Query(None)
):
    now = datetime.utcnow()
    if days is not None:
        start = now - timedelta(days=days)
        start_str, end_str = start.isoformat(), now.isoformat()
    else:
        start_str, end_str = None, None

    match = common_match(platform, start_str, end_str, company)
    total = await reviews_collection.count_documents(match)
    if total == 0:
        raise HTTPException(status_code=404, detail="No review data found for sentiment detail")

    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$overall_sentiment_detail", "count": {"$sum": 1}}}
    ]
    results = await reviews_collection.aggregate(pipeline).to_list(length=None)
    detail_distribution = {}
    for doc in results:
        detail_name = doc["_id"]
        if not detail_name or (isinstance(detail_name, str) and detail_name.strip() == ""):
            continue
        count = doc["count"]
        percentage = round((count / total) * 100, 2)
        if count == 0 or percentage < 1.0:
            continue
        detail_distribution[detail_name] = {"count": count, "percentage": percentage}

    latest_doc = await reviews_collection.find_one(match, sort=[("time_period", -1)])
    last_updated = latest_doc.get("time_period", now) if latest_doc else now

    return OverallDetailReportModel(
        overall_sentiment_detail=detail_distribution,
        total_reviews=total,
        last_updated=last_updated
    )

############################################
# 11) Category Sentiment Details Endpoint
############################################
@app.get("/report/category_sentiment_details")
async def category_sentiment_details(
    platform: str = Query(None),
    days: int = Query(60),
    company: str = Query(None)
):
    now = datetime.utcnow()
    start = now - timedelta(days=days)
    
    match_query = common_match(platform, start.isoformat(), now.isoformat(), company)
    match_query["category"] = {"$ne": ""}
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {"category": "$category", "sentiment": "$overall_sentiment", "subcat": "$overall_sentimental_category"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.category": 1}}
    ]
    
    results = await reviews_collection.aggregate(pipeline).to_list(length=None)
    
    data_map = {}
    
    for doc in results:
        cat = doc["_id"]["category"]
        sentiment = doc["_id"]["sentiment"]
        subcat = doc["_id"]["subcat"]
        count = doc["count"]
        
        if cat not in data_map:
            data_map[cat] = {
                "category": cat,
                "positive_count": 0,
                "negative_count": 0,
                "positive_subcats": {},
                "negative_subcats": {}
            }
        
        if sentiment == "positive":
            data_map[cat]["positive_count"] += count
            data_map[cat]["positive_subcats"].setdefault(subcat, 0)
            data_map[cat]["positive_subcats"][subcat] += count
        elif sentiment == "negative":
            data_map[cat]["negative_count"] += count
            data_map[cat]["negative_subcats"].setdefault(subcat, 0)
            data_map[cat]["negative_subcats"][subcat] += count
    
    final_list = list(data_map.values())
    
    return {"category_sentiment": final_list}

############################################
# 12) Detail Categories Endpoint
############################################
class DetailCategoryItem(BaseModel):
    overall_sentiment_detail: str
    categories: List[str]
    overall_sentimental_categories: List[str]
    summary: str = ""  # new field for summary

class DetailCategoryReportModel(BaseModel):
    details: List[DetailCategoryItem]

@app.get("/report/detail_categories", response_model=DetailCategoryReportModel)
async def detail_categories(
    platform: str = Query(None),
    days: int = Query(30),
    company: str = Query(None)
):
    try:
        logger.info(f"detail_categories called with platform={platform}, days={days}, company={company}")
        
        now = datetime.utcnow()
        start = now - timedelta(days=days)
        
        match = {
            "created_at": {"$gte": start, "$lte": now},
            "overall_sentiment_detail": {"$ne": ""}
        }
        if platform:
            match["platform"] = platform
        if company:
            match["company"] = company
        
        logger.info(f"Querying pre-saved collection with match: {match}")
        
        # Try to access the pre-saved collection first
        pre_saved_collection = db["sentimental_emotion_analysis_detail"]
        
        try:
            results = await pre_saved_collection.find(match).to_list(length=None)
            logger.info(f"Pre-saved collection returned {len(results)} results")
        except Exception as collection_error:
            # If the collection doesn't exist or query fails, fall back to main collection
            logger.warning(f"Pre-saved collection error: {collection_error}")
            results = []
        
        # If no results from pre-saved collection, try to get data from main reviews collection
        if not results:
            logger.info("No results from pre-saved collection, trying fallback to main collection")
            # Fallback to main reviews collection
            fallback_match = {
                "time_period": {"$gte": start, "$lte": now},
                "overall_sentiment_detail": {"$ne": "", "$exists": True}
            }
            if platform:
                fallback_match["platform"] = platform
            if company:
                fallback_match["company"] = company
            
            logger.info(f"Fallback query match: {fallback_match}")
            
            # Get unique sentiment details from main collection
            pipeline = [
                {"$match": fallback_match},
                {"$group": {
                    "_id": "$overall_sentiment_detail",
                    "categories": {"$addToSet": "$category"},
                    "overall_sentimental_categories": {"$addToSet": "$overall_sentimental_category"},
                    "sample_summary": {"$first": "$overall_summary"}
                }},
                {"$project": {
                    "overall_sentiment_detail": "$_id",
                    "categories": {"$filter": {"input": "$categories", "cond": {"$ne": ["$$this", ""]}}},
                    "overall_sentimental_categories": {"$filter": {"input": "$overall_sentimental_categories", "cond": {"$ne": ["$$this", ""]}}},
                    "summary": {"$ifNull": ["$sample_summary", ""]}
                }}
            ]
            
            try:
                fallback_results = await reviews_collection.aggregate(pipeline).to_list(length=None)
                logger.info(f"Fallback query returned {len(fallback_results)} results")
                # Convert to expected format
                results = []
                for doc in fallback_results:
                    results.append({
                        "overall_sentiment_detail": doc["overall_sentiment_detail"],
                        "categories": doc.get("categories", []),
                        "overall_sentimental_categories": doc.get("overall_sentimental_categories", []),
                        "summary": doc.get("summary", "")
                    })
            except Exception as fallback_error:
                logger.error(f"Fallback query error: {fallback_error}")
                results = []
        
        details_dict = {}
        for doc in results:
            sentiment_detail = doc.get("overall_sentiment_detail")
            if sentiment_detail and sentiment_detail not in details_dict:
                details_dict[sentiment_detail] = {
                    "overall_sentiment_detail": sentiment_detail,
                    "categories": doc.get("categories", []),
                    "overall_sentimental_categories": doc.get("overall_sentimental_categories", []),
                    "summary": doc.get("summary", "")
                }
        
        details = list(details_dict.values())
        details.sort(key=lambda x: x["overall_sentiment_detail"])
        
        logger.info(f"Returning {len(details)} detail categories")
        return DetailCategoryReportModel(details=details)
    
    except Exception as e:
        logger.error(f"Error in detail_categories endpoint: {str(e)}", exc_info=True)
        # Return empty response instead of 500 error
        return DetailCategoryReportModel(details=[])

############################################
# 13) Category Analysis Endpoint
############################################
@app.get("/report/category_analysis")
async def get_category_analysis(category: str, company: str = Query(None)):
    match_query = {"category": category}
    if company:
        match_query["company"] = company
    
    total_docs = await reviews_collection.count_documents(match_query)
    if total_docs == 0:
        return {
            "category": category,
            "sentiment_counts": {"positive": 0, "negative": 0, "neutral": 0},
            "detail_counts": {},
            "pros": [],
            "cons": [],
            "sentimental_categories": []
        }
    
    pipeline_sentiment = [
        {"$match": match_query},
        {"$group": {"_id": "$overall_sentiment", "count": {"$sum": 1}}}
    ]
    sentiment_cursor = reviews_collection.aggregate(pipeline_sentiment)
    sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}
    async for doc in sentiment_cursor:
        if doc["_id"] in sentiment_counts:
            sentiment_counts[doc["_id"]] = round((doc["count"] / total_docs) * 100, 2)
    
    pipeline_detail = [
        {"$match": match_query},
        {"$group": {"_id": "$overall_sentiment_detail", "count": {"$sum": 1}}}
    ]
    detail_cursor = reviews_collection.aggregate(pipeline_detail)
    detail_counts = {}
    async for doc in detail_cursor:
        if doc["_id"]:
            detail_counts[doc["_id"]] = doc["count"]
    
    pipeline_pros = [
        {"$match": {**match_query, "overall_sentiment": "positive", "overall_summary": {"$ne": ""}}},
        {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    pros_cursor = reviews_collection.aggregate(pipeline_pros)
    pros = []
    async for doc in pros_cursor:
        pros.append(doc["_id"])
    
    pipeline_cons = [
        {"$match": {**match_query, "overall_sentiment": "negative", "overall_summary": {"$ne": ""}}},
        {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    cons_cursor = reviews_collection.aggregate(pipeline_cons)
    cons = []
    async for doc in cons_cursor:
        cons.append(doc["_id"])
    
    pipeline_sentcats = [
        {"$match": match_query},
        {"$group": {"_id": "$overall_sentimental_category"}}
    ]
    sentcats_cursor = reviews_collection.aggregate(pipeline_sentcats)
    sentimental_categories = []
    async for doc in sentcats_cursor:
        if doc["_id"]:
            sentimental_categories.append(doc["_id"])
    
    return {
        "category": category,
        "sentiment_counts": sentiment_counts,
        "detail_counts": detail_counts,
        "pros": pros,
        "cons": cons,
        "sentimental_categories": sentimental_categories
    }

############################################
# 14.1) Available Months Endpoint
############################################
@app.get("/report/available_months")
async def get_available_months(company: str = Query(..., description="Company name")):
    """Get available months for monthly analysis data for a specific company (up to March 2025)"""
    try:
        # Set maximum allowed date to March 2025
        max_allowed_date = datetime(2025, 3, 31)
        
        pipeline = [
            {"$match": {
                "company": company,
                "time_period": {"$lte": max_allowed_date}  # Only include data up to March 2025
            }},
            {"$project": {
                "year": {"$year": "$time_period"},
                "month": {"$month": "$time_period"},
                "time_period": 1
            }},
            {"$group": {
                "_id": {
                    "year": "$year",
                    "month": "$month"
                },
                "latest_time_period": {"$max": "$time_period"}
            }},
            {"$sort": {"_id.year": -1, "_id.month": -1}},
            {"$limit": 12}  # Get last 12 months of available data
        ]
        
        results = await monthly_reports_collection.aggregate(pipeline).to_list(length=None)
        
        available_months = []
        for doc in results:
            year = doc["_id"]["year"]
            month = doc["_id"]["month"]
            
            # Double-check the date limit
            if year > 2025 or (year == 2025 and month > 3):
                continue
                
            # Format as YYYY-MM
            month_str = f"{year}-{month:02d}"
            available_months.append({
                "value": month_str,
                "label": f"{year}-{month:02d}",
                "year": year,
                "month": month
            })
        
        return {"available_months": available_months}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

############################################
# 14) Monthly Analysis Endpoint
############################################
from dateutil.relativedelta import relativedelta

@app.get("/report/monthly_analysis")
async def get_monthly_analysis(
    company: str = Query(..., description="Company name, e.g., 'cook_and_pan'"),
    year: int = Query(..., description="Year, e.g., 2025"),
    month: int = Query(..., description="Month as an integer, e.g., 4")
):
    # Check if requested date is beyond March 2025
    if year > 2025 or (year == 2025 and month > 3):
        raise HTTPException(
            status_code=400, 
            detail={
                "message": f"Data access is limited to March 2025 and earlier. Requested: {year}-{month:02d}",
                "max_allowed": "2025-03",
                "requested_month": f"{year}-{month:02d}",
                "company": company
            }
        )
    
    start_date = datetime(year, month, 1)
    end_date = start_date + relativedelta(months=1)
    
    query = {
        "company": company,
        "time_period": {"$gte": start_date, "$lt": end_date}
    }
    
    doc = await monthly_reports_collection.find_one(query)
    if not doc:
        # If no data found, get available months for this company (up to March 2025)
        max_allowed_date = datetime(2025, 3, 31)
        pipeline = [
            {"$match": {
                "company": company,
                "time_period": {"$lte": max_allowed_date}
            }},
            {"$project": {
                "year": {"$year": "$time_period"},
                "month": {"$month": "$time_period"},
                "time_period": 1
            }},
            {"$group": {
                "_id": {
                    "year": "$year",
                    "month": "$month"
                },
                "latest_time_period": {"$max": "$time_period"}
            }},
            {"$sort": {"_id.year": -1, "_id.month": -1}},
            {"$limit": 3}  # Get last 3 months of available data
        ]
        
        available_results = await monthly_reports_collection.aggregate(pipeline).to_list(length=None)
        
        available_months = []
        for result in available_results:
            year_avail = result["_id"]["year"]
            month_avail = result["_id"]["month"]
            
            # Double-check the date limit
            if year_avail > 2025 or (year_avail == 2025 and month_avail > 3):
                continue
                
            available_months.append(f"{year_avail}-{month_avail:02d}")
        
        error_detail = f"No monthly data found for {company} in {year}-{month:02d}."
        if available_months:
            error_detail += f" Available months: {', '.join(available_months)}"
        
        raise HTTPException(
            status_code=404, 
            detail={
                "message": error_detail,
                "available_months": available_months,
                "requested_month": f"{year}-{month:02d}",
                "company": company
            }
        )
    
    doc = convert_object_ids(doc)
    if "time_period" in doc and isinstance(doc["time_period"], datetime):
        doc["time_period"] = doc["time_period"].isoformat()
    
    return doc

############################################
# 15) Shopify Insights Endpoint
############################################
shopify_insights_lifetime_collection = db["shopify_insights_lifetime"]

@app.get("/shopify_insights")
async def get_shopify_insights():
    document = await shopify_insights_lifetime_collection.find_one()
    if not document:
        raise HTTPException(status_code=404, detail="Data not found")
    
    return {
        "company": document.get("company"),
        "total_gross_sales": document.get("total_gross_sales"),
        "total_customers": document.get("total_customers"),
        "total_orders": document.get("total_orders"),
        "best_selling_products": document.get("best_selling_products"),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
    # uvicorn.run("main:app", host="127.0.0.1", port=8080, reload=True)

