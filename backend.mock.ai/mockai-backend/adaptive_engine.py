from user_performance import get_user_weak_topics
from coverage_tracker import get_next_topic
from revision_engine import get_due_revisions

def select_adaptive_topic_and_difficulty(user_id: str, exam: str, subject: str):
    """
    Selects the best topic and difficulty for a user based on their performance history.
    Priority order:
    1. Overdue revisions (spaced repetition)
    2. Weakest topics from user performance
    3. Fallback to global syllabus coverage engine
    """
    # HIGHEST PRIORITY: overdue spaced repetition topics
    due_revisions = get_due_revisions(user_id, exam)
    for rev in due_revisions:
        if rev["subject"] == subject:
            return {
                "topic": rev["topic"],
                "difficulty": "Easy",  # Revision starts easy to rebuild confidence
                "source": "spaced_repetition_overdue"
            }

    # SECOND: weak topics from performance history
    weak_topics = get_user_weak_topics(user_id, exam, subject)
    
    if weak_topics:
        # Prioritize the very weakest topic
        target = weak_topics[0]
        topic_name = target["topic"]
        strength = target["strength"]
        
        # Adaptive Difficulty Mapping
        if strength == "VERY WEAK":
            difficulty = "Easy"
        elif strength == "WEAK":
            difficulty = "Medium"
        else: # STRONG
            difficulty = "Hard"
            
        return {
            "topic": topic_name,
            "difficulty": difficulty,
            "source": "adaptive_user_history"
        }
    
    # Fallback to general syllabus coverage if no history or no weak topics
    fallback_data = get_next_topic(exam, subject)
    if fallback_data:
        topic_name = f"{fallback_data['topic']} - {fallback_data['subtopic']}"
        return {
            "topic": topic_name,
            "difficulty": fallback_data["difficulty"], # from global distribution
            "source": "global_syllabus_coverage"
        }
        
    return None

