import os
import datetime
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from dotenv import load_dotenv
import openai
from bson.objectid import ObjectId
from typing import List, Dict, Any,Optional
import datetime
# Load environment variables
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "ecommerce_sentiment")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your_openai_api_key")
openai.api_key = OPENAI_API_KEY

app = FastAPI(title="Customer Feedback Dashboard Backend")

# Enable CORS so frontend can access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = MongoClient(MONGO_URI)
db = client[DB_NAME]
reviews_collection = db["sentimental_analysis"]

# --- Pydantic Models ---
class OverallReport(BaseModel):
    overall_sentiment: dict       # stores percentages { "positive": 80.4, ... }
    total_reviews: int
    last_updated: datetime.datetime
    sentiment_counts: Dict[str, int] = {}  # NEW: store raw counts { "positive": 120, ... }


class DetailedReport(BaseModel):
    overall_sentiment: dict
    overall_sentiment_detail: dict
    overall_sentimental_category: dict
    total_reviews: int
    last_updated: datetime.datetime

class TrendReport(BaseModel):
    trends: list  # List of dicts: { "month": "YYYY-MM", "positive": X, "negative": Y, "neutral": Z }

class NegativeTrendReport(BaseModel):
    trends: list  # List of dicts: { "month": "YYYY-MM", "negative": X }

class PlatformComparisonReport(BaseModel):
    comparison: dict  # e.g., { "gorgias": {"positive": ..., "negative": ..., "neutral": ...}, ... }

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
        return datetime.datetime.fromisoformat(date_str)
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
    # If platform is provided
    if platform:
        match["platform"] = platform
    # If company is provided, add it to the filter
    if company:
        match["company"] = company
    # If time filter is provided
    time_filter = build_time_filter(start_date, end_date)
    if time_filter:
        match["time_period"] = time_filter
    return match

def humanize_snake_case(value: str) -> str:
    """
    Convert snake_case text to capitalized words, e.g.
    'missing_sheet_in_partial_delivery' -> 'Missing Sheet In Partial Delivery'.
    """
    # Replace underscores with spaces
    spaced = value.replace("_", " ")
    # Capitalize each word
    return spaced.title()


# 1) Overall Sentiment Distribution (platform wise)



@app.get("/report/overall_by_platform", response_model=OverallReport)
def overall_by_platform(
    platform: str = Query(None),
    days: Optional[int] = Query(None),  # Optional; later you can update this to apply a date range.
    company: str = Query(None)
):
    if days is not None:
        now = datetime.datetime.utcnow()
        start = now - datetime.timedelta(days=days)
        start_str, end_str = start.isoformat(), now.isoformat()
    else:
        start_str, end_str = None, None  # No date filtering for overall analysis.
    
    base_match = common_match(platform, start_str, end_str, company)
    
    total = reviews_collection.count_documents(base_match)
    if total == 0:
        raise HTTPException(status_code=404, detail="No review data found")
    
    pipeline = [
        {"$match": {**base_match, "overall_sentiment": {"$ne": ""}}},
        {"$group": {"_id": "$overall_sentiment", "count": {"$sum": 1}}}
    ]

    results = list(reviews_collection.aggregate(pipeline))
    
    overall_sentiment = {
        doc["_id"]: round((doc["count"] / total) * 100, 2)
        for doc in results
    }
    sentiment_counts = {
        doc["_id"]: doc["count"]
        for doc in results
    }

    latest_doc = reviews_collection.find_one(base_match, sort=[("time_period", -1)])
    last_updated = latest_doc.get("time_period", datetime.datetime.utcnow())

    return {
        "overall_sentiment": overall_sentiment,    # e.g. { "positive": 80.4, ... }
        "total_reviews": total,
        "last_updated": last_updated,
        "sentiment_counts": sentiment_counts       # e.g. { "positive": 250, ... }
    }


# 2) Line chart for overall sentiment trends (monthly aggregation)
from typing import Optional

@app.get("/report/trends", response_model=TrendReport)
def report_trends(
    platform: str = Query(None),
    days: Optional[int] = Query(None),  # Optional; if not provided, overall data is returned.
    company: str = Query(None)
):
    try:
        if days is not None:
            now = datetime.datetime.utcnow()
            start = now - datetime.timedelta(days=days)
            start_str, end_str = start.isoformat(), now.isoformat()
        else:
            start_str, end_str = None, None  # Overall data (no date filtering)
        
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
        
        results = list(reviews_collection.aggregate(pipeline))
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


# 2.1 to get report monthly feedback
from typing import List
from pydantic import BaseModel

class MonthlyFeedbackItem(BaseModel):
    month: str
    top_positive: List[dict]   # e.g. [ { "category": "XYZ", "count": 12 }, ... ]
    top_negative: List[dict]

class MonthlyFeedbackResponse(BaseModel):
    data: List[MonthlyFeedbackItem]

@app.get("/report/monthly_feedback", response_model=MonthlyFeedbackResponse)
def monthly_feedback(
    platform: Optional[str] = None,
    days: Optional[int] = None,
    company: Optional[str] = None
):
    # 1) Build time range if 'days' is given
    if days is not None:
        now = datetime.datetime.utcnow()
        start = now - datetime.timedelta(days=days)
        start_str, end_str = start.isoformat(), now.isoformat()
    else:
        start_str, end_str = None, None

    # 2) Build a base match using your existing 'common_match' function
    base_match = common_match(platform, start_str, end_str, company)
    # We only care about positive/negative docs with a valid time_period
    base_match["overall_sentiment"] = {"$in": ["positive", "negative"]}
    base_match["time_period"] = {"$exists": True, "$ne": None}

    # 3) Create the aggregation pipeline
    pipeline = [
        {"$match": base_match},
        {
            "$project": {
                "year_month": {
                    "$dateToString": {"format": "%Y-%m", "date": "$time_period"}
                },
                "category": "$overall_sentimental_category",
                "sentiment": "$overall_sentiment"
            }
        },
        {
            "$group": {
                "_id": {
                    "month": "$year_month",
                    "category": "$category",
                    "sentiment": "$sentiment"
                },
                "count": {"$sum": 1}
            }
        },
        {
            "$group": {
                "_id": "$_id.month",
                "categoryData": {
                    "$push": {
                        "category": "$_id.category",
                        "sentiment": "$_id.sentiment",
                        "count": "$count"
                    }
                }
            }
        },
        {"$sort": {"_id": 1}}
    ]

    # 4) Run the pipeline
    results = list(reviews_collection.aggregate(pipeline))

    # 5) Build the output structure
    output = []
    for doc in results:
        month = doc["_id"]
        category_data = doc["categoryData"]  # list of {category, sentiment, count}

        # Separate positives & negatives
        positives = [d for d in category_data if d["sentiment"] == "positive"]
        negatives = [d for d in category_data if d["sentiment"] == "negative"]

        # Sort descending by count and keep top 3 each
        positives.sort(key=lambda x: x["count"], reverse=True)
        negatives.sort(key=lambda x: x["count"], reverse=True)
        top_pos = positives[:3]
        top_neg = negatives[:3]

        # Humanize snake_case categories
        for item in top_pos:
            item["category"] = humanize_snake_case(item["category"])
        for item in top_neg:
            item["category"] = humanize_snake_case(item["category"])

        output.append({
            "month": month,          # e.g. "2025-03"
            "top_positive": top_pos, # e.g. [{"category": "Price Dissatisfaction", "sentiment": "positive", "count": 3}, ...]
            "top_negative": top_neg
        })

    # 6) Return the final data
    return {"data": output}


# 3) Average negative trends and monthly spike analysis (platform & overall)
@app.get("/report/negative_trends", response_model=NegativeTrendReport)
def negative_trends(
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
            {"$project": {
                "year_month": {"$dateToString": {"format": "%Y-%m", "date": "$time_period"}}
            }},
            {"$group": {
                "_id": "$year_month",
                "negative_count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = list(reviews_collection.aggregate(pipeline))
        trends = []
        for doc in results:
            trends.append({"month": doc["_id"], "negative": doc["negative_count"]})
        return NegativeTrendReport(trends=trends)
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

# 4) Pros and Cons via GPT: Top 10 repeated positive as pros and top 10 negative as cons
@app.get("/report/pros_cons", response_model=ProsConsReport)
def pros_cons(
    platform: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    company: str = Query(None)
):
    """
    Returns a structured list of pros and cons from GPT,
    each as { "text": <string>, "count": <int> } objects.
    """
    try:
        match = common_match(platform, start_date, end_date, company)

        positive_pipeline = [
            {"$match": {**match, "overall_sentiment": "positive"}},
            {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        negative_pipeline = [
            {"$match": {**match, "overall_sentiment": "negative"}},
            {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]

        pos_results = list(reviews_collection.aggregate(positive_pipeline))
        neg_results = list(reviews_collection.aggregate(negative_pipeline))

        pros_text = " ; ".join([doc["_id"] for doc in pos_results if doc["_id"]])
        cons_text = " ; ".join([doc["_id"] for doc in neg_results if doc["_id"]])

        prompt = (
            f"Here are the top positive points:\n{pros_text}\n\n"
            f"And here are the top negative points:\n{cons_text}\n\n"
            "Please summarize them in the format:\n\n"
            "Pros:\n- <pro1>\n- <pro2>\n\nCons:\n- <con1>\n- <con2>\n"
            "No extra text, just a clear list of pros and cons with dashes."
        )

        response = openai.ChatCompletion.create(
            model="gpt-4o",  # or your chosen model
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=200
        )
        reply_str = response.choices[0].message.content.strip()

        pros_list = []
        cons_list = []
        current_section = None

        for line in reply_str.splitlines():
            line_stripped = line.strip()
            line_lower = line_stripped.lower()

            if line_lower.startswith("pros:"):
                current_section = "pros"
                continue
            elif line_lower.startswith("cons:"):
                current_section = "cons"
                continue

            if current_section == "pros" and line_stripped.startswith("-"):
                item_text = line_stripped.lstrip("-").strip()
                if item_text:
                    pros_list.append({"text": item_text, "count": 1})
            elif current_section == "cons" and line_stripped.startswith("-"):
                item_text = line_stripped.lstrip("-").strip()
                if item_text:
                    cons_list.append({"text": item_text, "count": 1})

        return ProsConsReport(pros=pros_list, cons=cons_list)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 5) Table for top 10 negative, positive, neutral categories (grouped by overall_sentimental_category)
@app.get("/report/category_table")
def category_table(
    platform: str = Query(None),
    sentiment: str = Query(None),
    limit: int = Query(10),
    start_date: str = Query(None),
    end_date: str = Query(None),
    company: str = Query(None)
):
    try:
        match = common_match(platform, start_date, end_date, company)
        match["overall_sentimental_category"] = {"$ne": ""}
        if sentiment:
            match["overall_sentiment"] = sentiment
        
        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$overall_sentimental_category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        results = list(reviews_collection.aggregate(pipeline))

        # Here we transform snake_case -> human-friendly
        table = []
        for doc in results:
            raw_category = doc["_id"]  # e.g. "damaged_gas_solution"
            count = doc["count"]
            
            # Convert to "Damaged Gas Solution"
            human_category = humanize_snake_case(raw_category)

            table.append({
                "category": human_category,
                "count": count
            })

        return {"table": table}
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))


# 6) Filter control for time period for overall sentiment, detail, and category
@app.get("/report/detailed", response_model=DetailedReport)
def detailed_report(
    platform: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    limit: int = Query(10),
    company: str = Query(None)
):
    try:
        base_match = common_match(platform, start_date, end_date, company)
        base_match["overall_sentiment"] = {"$in": ["positive", "negative", "neutral"]}
        total = reviews_collection.count_documents(base_match)
        if total == 0:
            raise HTTPException(status_code=404, detail="No review data found")
        pipeline_overall = [
            {"$match": base_match},
            {"$group": {"_id": "$overall_sentiment", "count": {"$sum": 1}}}
        ]
        overall_results = list(reviews_collection.aggregate(pipeline_overall))
        overall = {doc["_id"]: round((doc["count"] / total) * 100, 2) for doc in overall_results}
        pipeline_detail = [
            {"$match": {**base_match, "overall_sentiment_detail": {"$ne": ""}}},
            {"$group": {"_id": "$overall_sentiment_detail", "count": {"$sum": 1}}}
        ]
        detail_results = list(reviews_collection.aggregate(pipeline_detail))
        detail = {doc["_id"]: round((doc["count"] / total) * 100, 2) for doc in detail_results}
        pipeline_category = [
            {"$match": {**base_match, "overall_sentimental_category": {"$ne": ""}}},
            {"$group": {"_id": "$overall_sentimental_category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        category_results = list(reviews_collection.aggregate(pipeline_category))
        category = {doc["_id"]: doc["count"] for doc in category_results}
        latest_doc = reviews_collection.find_one(base_match, sort=[("time_period", -1)])
        last_updated = latest_doc.get("time_period", datetime.datetime.utcnow())
        return DetailedReport(
            overall_sentiment=overall,
            overall_sentiment_detail=detail,
            overall_sentimental_category=category,
            total_reviews=total,
            last_updated=last_updated
        )
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

# 7) Top 5 pros and top 5 cons summary (from review text frequency)
@app.get("/report/top_pros_cons", response_model=TopProsConsReport)
def top_pros_cons(
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
        pos_results = list(reviews_collection.aggregate(pos_pipeline))
        neg_results = list(reviews_collection.aggregate(neg_pipeline))
        top_pros = {doc["_id"]: doc["count"] for doc in pos_results}
        top_cons = {doc["_id"]: doc["count"] for doc in neg_results}
        return TopProsConsReport(top_pros=top_pros, top_cons=top_cons)
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

# 8) Platform Comparison: grouped bar chart comparing each platform's sentiment distribution
class PlatformComparisonItem(BaseModel):
    platform: str
    positive: float
    negative: float
    neutral: float

class PlatformComparisonResponse(BaseModel):
    platforms: List[PlatformComparisonItem]

@app.get("/report/platform_comparison", response_model=PlatformComparisonResponse)
def platform_comparison(
    days: int = Query(60),
    company: str = Query(None)
):
    try:
        now = datetime.datetime.utcnow()
        start = now - datetime.timedelta(days=days)
        
        platforms = ["gorgias", "trustpilot", "opencx"]
        data_list = []
        
        for p in platforms:
            match = common_match(p, start.isoformat(), now.isoformat(), company)
            match["overall_sentiment"] = {"$in": ["positive", "negative", "neutral"]}
            
            total = reviews_collection.count_documents(match)
            if total == 0:
                data_list.append({
                    "platform": p,
                    "positive": 0,
                    "negative": 0,
                    "neutral": 0
                })
                continue
            
            pipeline = [
                {"$match": match},
                {"$group": {"_id": "$overall_sentiment", "count": {"$sum": 1}}}
            ]
            results = list(reviews_collection.aggregate(pipeline))
            
            pos, neg, neu = 0.0, 0.0, 0.0
            for doc in results:
                if doc["_id"] == "positive":
                    pos = round((doc["count"] / total) * 100, 2)
                elif doc["_id"] == "negative":
                    neg = round((doc["count"] / total) * 100, 2)
                elif doc["_id"] == "neutral":
                    neu = round((doc["count"] / total) * 100, 2)
            
            data_list.append({
                "platform": p,
                "positive": pos,
                "negative": neg,
                "neutral":  neu
            })
        
        return PlatformComparisonResponse(platforms=data_list)
    
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

# 9) Potential Risks: Textual highlight for negative sentiment spike
from typing import List
import datetime
from pydantic import BaseModel

class SingleAlert(BaseModel):
    message: str
    severity: str
    timestamp: str

class RiskAlertsResponse(BaseModel):
    alerts: List[SingleAlert]

@app.get("/reviews")
def get_reviews(
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
        reviews = list(reviews_collection.find(query).skip(skip).limit(limit))
        for review in reviews:
            review["_id"] = str(review["_id"])
        return {"reviews": reviews}
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=str(e))

class OverallDetailReport(BaseModel):
    overall_sentiment_detail: Dict[str, Dict[str, float]]  # e.g. {"happy": {"count": 120, "percentage": 40.0}, ...}
    total_reviews: int
    last_updated: datetime.datetime

@app.get("/report/overall_detail", response_model=OverallDetailReport)
def overall_detail(
    platform: str = Query(None),
    days: Optional[int] = Query(None),
    company: str = Query(None)
):
    now = datetime.datetime.utcnow()
    if days is not None:
        start = now - datetime.timedelta(days=days)
        start_str, end_str = start.isoformat(), now.isoformat()
    else:
        start_str, end_str = None, None

    match = common_match(platform, start_str, end_str, company)
    total = reviews_collection.count_documents(match)
    if total == 0:
        raise HTTPException(status_code=404, detail="No review data found for sentiment detail")

    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$overall_sentiment_detail", "count": {"$sum": 1}}}
    ]
    results = list(reviews_collection.aggregate(pipeline))

    detail_distribution = {}
    for doc in results:
        detail_name = doc["_id"]
        # Filter out entries with no label (None, empty string, or only whitespace)
        if not detail_name or (isinstance(detail_name, str) and detail_name.strip() == ""):
            continue

        count = doc["count"]
        percentage = round((count / total) * 100, 2)
        # Filter out entries with zero count or percentage below threshold (e.g., less than 1%)
        if count == 0 or percentage < 1.0:
            continue

        detail_distribution[detail_name] = {
            "count": count,
            "percentage": percentage
        }

    latest_doc = reviews_collection.find_one(match, sort=[("time_period", -1)])
    last_updated = latest_doc.get("time_period", now) if latest_doc else now

    return OverallDetailReport(
        overall_sentiment_detail=detail_distribution,
        total_reviews=total,
        last_updated=last_updated
    )



@app.get("/report/category_sentiment_details")
def category_sentiment_details(
    platform: str = Query(None),
    days: int = Query(60),
    company: str = Query(None)
):
    now = datetime.datetime.utcnow()
    start = now - datetime.timedelta(days=days)
    
    match_query = common_match(platform, start.isoformat(), now.isoformat(), company)
    match_query["category"] = {"$ne": ""}
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {
                "category": "$category",
                "sentiment": "$overall_sentiment",
                "subcat": "$overall_sentimental_category"
            },
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.category": 1}}
    ]
    
    results = list(reviews_collection.aggregate(pipeline))
    
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

class DetailCategoryItem(BaseModel):
    overall_sentiment_detail: str
    categories: List[str]
    overall_sentimental_categories: List[str]
    summary: str = ""  # New field for the summary

class DetailCategoryReport(BaseModel):
    details: List[DetailCategoryItem]

@app.get("/report/detail_categories", response_model=DetailCategoryReport)
def detail_categories(
    platform: str = Query(None),
    days: int = Query(30),
    company: str = Query(None)
):
    """
    For each overall_sentiment_detail (e.g., "satisfied", "frustrated"),
    returns the overall_sentimental_categories and summary from the 
    sentimental_analysis_pre_save_data collection.
    """
    now = datetime.datetime.utcnow()
    start = now - datetime.timedelta(days=days)
    
    # Build a filter based on the created_at time window and non-empty sentiment detail.
    match = {
        "created_at": {"$gte": start, "$lte": now},
        "overall_sentiment_detail": {"$ne": ""}
    }
    # Optionally, filter by platform if your pre-saved data includes a platform field.
    if platform:
        match["platform"] = platform
    # Add company filter specifically
    if company:
        match["company"] = company
    
    pre_saved_collection = db["sentimental_emotion_analysis_detail"]
    results = list(pre_saved_collection.find(match))
    
    details_dict = {}
    for doc in results:
        sentiment_detail = doc.get("overall_sentiment_detail")
        if sentiment_detail not in details_dict:
            details_dict[sentiment_detail] = {
                "overall_sentiment_detail": sentiment_detail,
                "categories": doc.get("categories", []),
                "overall_sentimental_categories": doc.get("overall_sentimental_categories", []),
                "summary": doc.get("summary", "")
            }
    
    details = list(details_dict.values())
    details.sort(key=lambda x: x["overall_sentiment_detail"])
    
    return DetailCategoryReport(details=details)

class CategoryAnalysis(BaseModel):
    category: str
    sentiment_counts: Dict[str, float]
    detail_counts: Dict[str, int]
    pros: List[str]
    cons: List[str]
    # sentimental_categories: List[str]  # Uncomment if needed

@app.get("/report/category_analysis")
def get_category_analysis(category: str, company: str = Query(None)):
    """
    Return the shape:
    {
      "category": str,
      "sentiment_counts": {"positive": float, "negative": float, "neutral": float},
      "detail_counts": { emotionName: number, ... },
      "pros": [str, ...],
      "cons": [str, ...],
      "sentimental_categories": [str, ...]
    }
    """
    match_query = {"category": category}
    if company:
        match_query["company"] = company
    
    total_docs = reviews_collection.count_documents(match_query)
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
    sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}
    for doc in reviews_collection.aggregate(pipeline_sentiment):
        if doc["_id"] in sentiment_counts:
            sentiment_counts[doc["_id"]] = round((doc["count"] / total_docs) * 100, 2)

    pipeline_detail = [
        {"$match": match_query},
        {"$group": {"_id": "$overall_sentiment_detail", "count": {"$sum": 1}}}
    ]
    detail_counts = {}
    for doc in reviews_collection.aggregate(pipeline_detail):
        if doc["_id"]:
            detail_counts[doc["_id"]] = doc["count"]

    pipeline_pros = [
        {"$match": {**match_query, "overall_sentiment": "positive", "overall_summary": {"$ne": ""}}},
        {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    pros = []
    for doc in reviews_collection.aggregate(pipeline_pros):
        pros.append(doc["_id"])

    pipeline_cons = [
        {"$match": {**match_query, "overall_sentiment": "negative", "overall_summary": {"$ne": ""}}},
        {"$group": {"_id": "$overall_summary", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    cons = []
    for doc in reviews_collection.aggregate(pipeline_cons):
        cons.append(doc["_id"])

    pipeline_sentcats = [
        {"$match": match_query},
        {"$group": {"_id": "$overall_sentimental_category"}}
    ]
    sentimental_categories = []
    for doc in reviews_collection.aggregate(pipeline_sentcats):
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

def convert_object_ids(obj):
    # Recursively convert ObjectId values to strings.
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, list):
        return [convert_object_ids(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_object_ids(value) for key, value in obj.items()}
    else:
        return obj

@app.get("/report/issue_details")
def issue_details(
    category: str = Query(...), 
    sentiment: str = Query(None),
    company: str = Query(None),
    limit: int = Query(20)
):
    try:
        match = {}
        if company:
            match["company"] = company

        # Convert the provided category to snake_case
        snake_case_cat = category.lower().replace(" ", "_")
        match["overall_sentimental_category"] = snake_case_cat

        # If sentiment is provided, filter by it
        if sentiment:
            match["overall_sentiment"] = sentiment

        docs = list(reviews_collection.find(match).limit(limit))
        
        # Convert _id and other ObjectIds recursively, and format time_period
        docs = [convert_object_ids(doc) for doc in docs]
        for d in docs:
            if "time_period" in d and d["time_period"]:
                # Format the datetime as "YYYY-MM-DD HH:MM:SS"
                d["time_period"] = d["time_period"].strftime("%Y-%m-%d %H:%M:%S")
        
        return {"reviews": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

################################### Shopify Data ################################################################

# Lifetime Shopify Data
shopify_insights_lifetime_collection = db["shopify_insights_lifetime"]

@app.get("/shopify_insights")
def get_shopify_insights():
    # Fetch one document from the collection
    document = shopify_insights_lifetime_collection.find_one()
    if not document:
        raise HTTPException(status_code=404, detail="Data not found")
    
    # Return only the specified keys
    return {
        "company": document.get("company"),
        "total_gross_sales": document.get("total_gross_sales"),
        "total_customers": document.get("total_customers"),
        "total_orders":document.get("total_orders"),
        "best_selling_products": document.get("best_selling_products"),
    }

# Chat endpoint remains the same
# @app.post("/chat")
# def chat_with_report(chat: ChatMessage, company: str = Query(None)):
#     try:
#         overall_report = overall_by_platform(platform=None, days=60, company=company)
#         context = "Overall sentiment: " + ", ".join([f"{k}: {v}%" for k, v in overall_report.overall_sentiment.items()])
#     except Exception:
#         context = "No report data available."
#     prompt = f"Report Context: {context}\nUser: {chat.message}\n"
#     if chat.history:
#         for h in chat.history:
#             prompt += f"{h.get('role')}: {h.get('content')}\n"
#     try:
#         response = openai.ChatCompletion.create(
#             model="gpt-4o",
#             messages=[{"role": "user", "content": prompt}],
#             temperature=0.7,
#             max_tokens=250
#         )
#         reply = response.choices[0].message.content.strip()
#         return {"session_id": chat.session_id, "reply": reply}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
    # uvicorn.run("main:app", host="127.0.0.1", port=8080, reload=True)