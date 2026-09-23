import logging
from database import init_db, save_questions_batch

logging.basicConfig(level=logging.INFO)

# Initialize schema and indexes
init_db()

# Generate dummy questions for test
questions = []
for i in range(1, 11):
    questions.append({
        "question": f"What is {i} + {i}?",
        "options": [str(i), str(i+1), str(i*2), str(i*3)],
        "answer": str(i*2),
        "explanation": f"Basic addition of {i}."
    })

print("Testing first insert (10 items)...")
count1 = save_questions_batch("SSC", "Math", "Algebra", "Easy", questions)
print(f"Inserted {count1} questions.")

print("Testing duplicate insert (same 10 items)...")
count2 = save_questions_batch("SSC", "Math", "Algebra", "Easy", questions)
print(f"Inserted {count2} questions (should be 0 due to unique hash).")
