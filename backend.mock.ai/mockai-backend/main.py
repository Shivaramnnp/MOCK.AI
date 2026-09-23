import asyncio
from fastapi import FastAPI, HTTPException, Request
from datetime import datetime
import json
import logging

from models import QuestionRequest, NextTopicRequest, SubmitTestRequest, AdaptiveTestRequest, StudyPlanRequest, SubmitRevisionRequest, StartExamRequest, SubmitExamRequest
from logger import log_request
from config import OLLAMA_MODEL
from database import init_db, save_questions_batch
from model_service import call_ollama_api
from prompt_engine import generate_prompt
from response_validator import validate_and_parse_response
from coverage_tracker import get_next_topic, update_coverage_status, get_coverage_stats, get_detailed_coverage_stats
from quality_engine import filter_high_quality_questions
from user_performance import update_user_performance, get_user_stats
from adaptive_engine import select_adaptive_topic_and_difficulty
from rank_engine import save_test_result, generate_rank_prediction
from study_engine import generate_daily_plan, get_study_plan, mark_task_complete
from revision_engine import process_test_for_revision, get_due_revisions, update_revision
from analytics_engine import get_topic_heatmap, get_accuracy_trend, get_subject_summary, generate_insights
from exam_engine import start_exam, submit_exam, get_exam_history
from middleware import GlobalErrorMiddleware, RateLimitMiddleware, RequestLoggingMiddleware
from cache import cache

logger = logging.getLogger("mockai_logger")

app = FastAPI(title="Mock.AI Backend")

# Register middleware (order matters: outermost first)
app.add_middleware(GlobalErrorMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# Performance Metrics Global
performance_metrics = {
    "total_requests": 0,
    "success_rate": 0.0,
    "successful_requests": 0,
    "retry_count": 0,
    "validation_failures": 0,
    "quality_rejections": 0,
    "total_generation_time": 0.0,
    "avg_generation_time": 0.0
}

def update_metrics(success: bool, retries: int, val_failures: int, q_rejections: int, gen_time: float):
    performance_metrics["total_requests"] += 1
    if success:
        performance_metrics["successful_requests"] += 1
    performance_metrics["success_rate"] = (performance_metrics["successful_requests"] / performance_metrics["total_requests"]) * 100
    performance_metrics["retry_count"] += retries
    performance_metrics["validation_failures"] += val_failures
    performance_metrics["quality_rejections"] += q_rejections
    performance_metrics["total_generation_time"] += gen_time
    performance_metrics["avg_generation_time"] = performance_metrics["total_generation_time"] / performance_metrics["total_requests"]

@app.on_event("startup")
async def startup_event():
    init_db()

@app.get("/health")
async def health_check():
    """Quick health check for load balancers."""
    return {"status": "ok"}

@app.get("/system-health")
async def system_health():
    """
    Deep system health: CPU, memory, DB pool, cache, and uptime.
    """
    import os
    import psutil
    
    process = psutil.Process(os.getpid())
    mem = process.memory_info()
    
    # DB pool check
    from database import connection_pool
    db_status = "connected" if connection_pool and not connection_pool.closed else "disconnected"
    
    return {
        "status": "ok",
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "memory_mb": round(mem.rss / (1024 * 1024), 1),
        "memory_percent": round(process.memory_percent(), 1),
        "database": db_status,
        "cache": cache.stats(),
        "performance": performance_metrics
    }

@app.get("/stats")
async def stats():
    """Stats Endpoint with Performance Metrics"""
    stats_data = await asyncio.to_thread(get_coverage_stats)
    return {
        "coverage": stats_data,
        "performance": performance_metrics
    }

@app.get("/coverage-stats")
async def detailed_coverage_stats(exam: str, subject: str):
    """Detailed Coverage Stats Endpoint per Phase 6"""
    if not exam or not subject:
        raise HTTPException(status_code=400, detail="exam and subject query parameters are required")
    stats_data = await asyncio.to_thread(get_detailed_coverage_stats, exam, subject)
    return stats_data

@app.post("/generate-questions")
async def generate_questions(request_data: QuestionRequest, request: Request = None):
    """API Endpoint for generating questions"""
    if request:
        print("REQUEST METHOD:", request.method)
    request_time = datetime.now()
    error_msg = None
    db_status = "Skipped"
    questions = []
    
    retries_used = 0
    val_failures = 0
    q_rejections = 0
    
    try:
        if request_data.count <= 0:
            raise ValueError("Count must be greater than 0")
            
        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                # Prompt Optimization
                prompt = generate_prompt(
                    request_data.exam, request_data.subject, request_data.topic, request_data.difficulty, request_data.count
                )
                
                # Model Call
                response_text = await call_ollama_api(prompt)
                
                if not response_text:
                    raise ValueError("Empty response from model")
                    
                # Validate output
                parsed_questions = validate_and_parse_response(response_text)
                
                # INJECT METADATA
                for q in parsed_questions:
                    q["exam"] = request_data.exam
                    q["subject"] = request_data.subject
                    q["topic"] = request_data.topic
                    q["difficulty"] = request_data.difficulty
                
                # Quality Engine filter
                high_quality_questions = filter_high_quality_questions(parsed_questions)
                
                q_rejections += (len(parsed_questions) - len(high_quality_questions))
                
                if not high_quality_questions:
                    raise ValueError("All generated questions failed quality checks.")
                    
                questions = high_quality_questions
                break # Success
                
            except ValueError as ve:
                val_failures += 1
                if attempt > 0:
                    retries_used += 1
                logger.warning(f"Validation/Quality error on attempt {attempt+1}: {ve}")
                if attempt == max_attempts - 1:
                    raise ve
            except Exception as e:
                if attempt > 0:
                    retries_used += 1
                logger.error(f"Generation error on attempt {attempt+1}: {e}")
                if attempt == max_attempts - 1:
                    raise e
                    
        inserted_count = await asyncio.to_thread(
            save_questions_batch,
            request_data.exam,
            request_data.subject,
            request_data.topic,
            request_data.difficulty,
            questions
        )
        db_status = f"Success - Inserted {inserted_count} rows"
        
        gen_time = (datetime.now() - request_time).total_seconds()
        update_metrics(True, retries_used, val_failures, q_rejections, gen_time)
        return questions

    except ValueError as ve:
        error_msg = str(ve)
        db_status = "Failed"
        gen_time = (datetime.now() - request_time).total_seconds()
        update_metrics(False, retries_used, val_failures, q_rejections, gen_time)
        status_code = 400 if "Count" in str(ve) else 500
        raise HTTPException(status_code=status_code, detail={"status": "error", "message": error_msg})
    except TimeoutError:
        error_msg = "Model timeout"
        db_status = "Failed"
        gen_time = (datetime.now() - request_time).total_seconds()
        update_metrics(False, retries_used, val_failures, q_rejections, gen_time)
        raise HTTPException(status_code=504, detail={"status": "error", "message": "Model timeout"})
    except ConnectionError:
        error_msg = "Connection failure"
        db_status = "Failed"
        gen_time = (datetime.now() - request_time).total_seconds()
        update_metrics(False, retries_used, val_failures, q_rejections, gen_time)
        raise HTTPException(status_code=503, detail={"status": "error", "message": "Connection failure"})
    except Exception as e:
        error_msg = str(e)
        db_status = "Failed"
        gen_time = (datetime.now() - request_time).total_seconds()
        update_metrics(False, retries_used, val_failures, q_rejections, gen_time)
        raise HTTPException(status_code=500, detail={"status": "error", "message": error_msg})
    
    finally:
        log_request(
            exam=request_data.exam,
            subject=request_data.subject,
            topic=request_data.topic,
            difficulty=request_data.difficulty,
            request_time=request_time,
            response_time=datetime.now(),
            db_status=db_status,
            errors=error_msg
        )

@app.post("/generate-next-topic")
async def generate_next_topic(request: NextTopicRequest):
    """
    Intelligent Topic Selection:
    Fetches least covered topic, calculates optimal difficulty,
    generates strictly filtered questions, updates coverage metrics.
    """
    topic_data = await asyncio.to_thread(get_next_topic, request.exam, request.subject)
    
    if not topic_data:
        raise HTTPException(status_code=404, detail="Topic not found for the given criteria.")
        
    coverage_id = topic_data['id']
    combined_topic = f"{topic_data['topic']} - {topic_data['subtopic']}"
    
    q_request = QuestionRequest(
        exam=topic_data['exam'],
        subject=topic_data['subject'],
        topic=combined_topic,
        difficulty=topic_data['difficulty'], # Dynamic difficulty
        count=request.count
    )
    
    try:
        result = await generate_questions(q_request)
        
        generated_count = len(result) if isinstance(result, list) else 0
        status_value = 'completed' if generated_count > 0 else 'pending'
        
        await asyncio.to_thread(update_coverage_status, coverage_id, generated_count, status_value)
        
        return {
            "status": "success",
            "coverage_updated": True,
            "topic_info": topic_data,
            "generated_questions": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})

@app.post("/submit-test")
async def submit_test(request: SubmitTestRequest):
    """
    Evaluates a user's test submission, calculates accuracy, and updates performance.
    """
    total = len(request.answers)
    if total == 0:
        raise HTTPException(status_code=400, detail="No answers provided.")
        
    correct = sum(1 for a in request.answers if a.selected_answer.strip().lower() == a.correct_answer.strip().lower())
    
    await asyncio.to_thread(
        update_user_performance, 
        request.user_id, 
        request.exam, 
        request.subject, 
        request.topic, 
        correct, 
        total
    )
    
    await asyncio.to_thread(
        save_test_result,
        request.user_id,
        request.exam,
        request.subject,
        correct,
        total,
        request.difficulty
    )
    
    # Auto-trigger revision engine for wrong answers
    await asyncio.to_thread(
        process_test_for_revision,
        request.user_id,
        request.exam,
        request.subject,
        request.topic,
        request.answers
    )
    
    accuracy = (correct / total) * 100.0
    return {
        "status": "success",
        "message": "Performance recorded.",
        "results": {
            "total": total,
            "correct": correct,
            "accuracy": round(accuracy, 2)
        }
    }

@app.post("/adaptive-test")
async def adaptive_test(request: AdaptiveTestRequest):
    """
    Intelligently generates a customized test for the user.
    Detects weak topics, sets difficulty automatically, and guarantees fresh questions.
    """
    adaptive_data = await asyncio.to_thread(select_adaptive_topic_and_difficulty, request.user_id, request.exam, request.subject)
    
    if not adaptive_data:
        raise HTTPException(status_code=404, detail="Could not determine an adaptive topic. Database might be empty.")
        
    q_request = QuestionRequest(
        exam=request.exam,
        subject=request.subject,
        topic=adaptive_data["topic"],
        difficulty=adaptive_data["difficulty"],
        count=request.count
    )
    
    try:
        # Call the existing generator which also has the duplicate-prevention quality engine logic.
        result = await generate_questions(q_request) 
        
        return {
            "status": "success",
            "adaptive_info": adaptive_data,
            "questions": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})

@app.get("/user-stats")
async def user_stats(user_id: str):
    """
    Returns user dashboard stats including weak and strong topics.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
        
    stats = await asyncio.to_thread(get_user_stats, user_id)
    return stats

@app.get("/rank-predictor")
async def rank_predictor(user_id: str, exam: str):
    """
    Predicts user rank, percentile, and exam readiness based on historical test data.
    """
    if not user_id or not exam:
        raise HTTPException(status_code=400, detail="user_id and exam are required parameters")
        
    prediction = await asyncio.to_thread(generate_rank_prediction, user_id, exam)
    return prediction

@app.post("/generate-study-plan")
async def create_study_plan(request: StudyPlanRequest):
    """
    Generates an intelligent daily study plan based on user weaknesses,
    syllabus gaps, and exam readiness level.
    """
    plan = await asyncio.to_thread(
        generate_daily_plan, request.user_id, request.exam, request.subject
    )
    return plan

@app.get("/study-plan")
async def fetch_study_plan(user_id: str, exam: str = None, subject: str = None):
    """
    Returns the current (today's) study plan for a user.
    Falls back to the most recent plan if none exists for today.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    plan = await asyncio.to_thread(get_study_plan, user_id, exam, subject)
    return plan

@app.patch("/complete-task")
async def complete_task(id: int):
    """
    Marks a study plan task as completed.
    """
    success = await asyncio.to_thread(mark_task_complete, id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or already completed.")
    return {"status": "success", "message": f"Task {id} marked as completed."}

@app.get("/revision-tasks")
async def revision_tasks(user_id: str, exam: str = None):
    """
    Returns all topics due for revision (next_revision_at <= now).
    These are the topics the user MUST revise today based on SM-2 scheduling.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    tasks = await asyncio.to_thread(get_due_revisions, user_id, exam)
    return {
        "user_id": user_id,
        "due_count": len(tasks),
        "revisions": tasks
    }

@app.post("/submit-revision")
async def submit_revision(request: SubmitRevisionRequest):
    """
    Records a revision result and updates the SM-2 schedule.
    If correct: interval grows, ease increases.
    If wrong: interval resets to 1 day, ease decreases.
    """
    if request.result not in ("correct", "wrong"):
        raise HTTPException(status_code=400, detail="result must be 'correct' or 'wrong'")
        
    result = await asyncio.to_thread(
        update_revision,
        request.user_id,
        request.exam,
        request.subject,
        request.topic,
        request.result
    )
    return result

@app.get("/heatmap")
async def heatmap(user_id: str, exam: str, subject: str):
    """
    Returns per-topic performance heatmap with strength classifications.
    Levels: VERY_WEAK 🔴, WEAK 🟠, GOOD 🟡, STRONG 🟢, INSUFFICIENT_DATA ⚪
    """
    if not user_id or not exam or not subject:
        raise HTTPException(status_code=400, detail="user_id, exam, and subject are required")
    
    cache_key = f"heatmap:{user_id}:{exam}:{subject}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    data = await asyncio.to_thread(get_topic_heatmap, user_id, exam, subject)
    result = {
        "user_id": user_id,
        "exam": exam,
        "subject": subject,
        "topic_count": len(data),
        "heatmap": data
    }
    cache.set(cache_key, result, ttl=120)
    return result

@app.get("/performance-trend")
async def performance_trend(user_id: str):
    """
    Returns the user's last 10 test scores with trend direction
    and week-over-week improvement delta.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    cache_key = f"trend:{user_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    data = await asyncio.to_thread(get_accuracy_trend, user_id)
    cache.set(cache_key, data, ttl=120)
    return data

@app.get("/subject-summary")
async def subject_summary(user_id: str):
    """
    Returns average accuracy per subject with strongest/weakest identification.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    cache_key = f"subject:{user_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    data = await asyncio.to_thread(get_subject_summary, user_id)
    cache.set(cache_key, data, ttl=120)
    return data

@app.get("/insights")
async def insights(user_id: str, exam: str = None, subject: str = None):
    """
    Returns AI-generated coaching insights based on all available performance data.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    data = await asyncio.to_thread(generate_insights, user_id, exam, subject)
    return {
        "user_id": user_id,
        "insights": data
    }

@app.post("/start-exam")
async def api_start_exam(request: StartExamRequest):
    """
    Starts a timed mock exam session.
    Pulls questions from DB with balanced difficulty, returns them without answers.
    Modes: full (real exam length), sectional (one section), quick (10 questions).
    """
    if request.mode not in ("full", "sectional", "quick"):
        raise HTTPException(status_code=400, detail="mode must be 'full', 'sectional', or 'quick'")
    
    result, error = await asyncio.to_thread(start_exam, request.user_id, request.exam, request.mode)
    
    if error:
        raise HTTPException(status_code=404 if "No questions" in error else 500, detail=error)
    return result

@app.post("/submit-exam")
async def api_submit_exam(request: SubmitExamRequest):
    """
    Submits a completed mock exam for evaluation.
    Returns score, accuracy, percentile, estimated rank, and weak topic analysis.
    """
    answers_dicts = [{"index": a.index, "selected_answer": a.selected_answer} for a in request.answers]
    result, error = await asyncio.to_thread(submit_exam, request.session_id, request.user_id, answers_dicts)
    
    if error:
        status = 404 if "not found" in error.lower() else 400 if "already" in error.lower() else 500
        raise HTTPException(status_code=status, detail=error)
    
    # Also save to test_history for rank engine integration
    if result:
        await asyncio.to_thread(
            save_test_result,
            request.user_id,
            result["exam"],
            "Mixed",
            result["score"],
            result["total_questions"],
            "Mixed"
        )
    
    return result

@app.get("/exam-history")
async def api_exam_history(user_id: str):
    """
    Returns the user's recent mock exam sessions with scores and status.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    data = await asyncio.to_thread(get_exam_history, user_id)
    return {"user_id": user_id, "sessions": data}
