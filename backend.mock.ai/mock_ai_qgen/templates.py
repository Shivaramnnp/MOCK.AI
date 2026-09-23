from dataclasses import dataclass
from typing import Callable, Dict, List, Tuple


DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"]
COGNITIVE_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
QUESTION_TYPES = [
    "MCQ",
    "True/False",
    "Fill in the blanks",
    "Match the following",
    "Assertion-Reason",
    "Numerical problems",
    "Case study questions",
    "Diagram-based questions",
    "Programming questions",
]

EXAM_BLUEPRINT: List[Dict[str, str]] = [
    {"exam_name": "JEE Main", "exam_category": "Engineering", "organization": "NTA", "state": ""},
    {"exam_name": "JEE Advanced", "exam_category": "Engineering", "organization": "IIT", "state": ""},
    {"exam_name": "GATE", "exam_category": "Engineering", "organization": "IISc/IITs", "state": ""},
    {"exam_name": "BITSAT", "exam_category": "Engineering", "organization": "BITS Pilani", "state": ""},
    {"exam_name": "VITEEE", "exam_category": "Engineering", "organization": "VIT", "state": ""},
    {"exam_name": "SRMJEEE", "exam_category": "Engineering", "organization": "SRMIST", "state": ""},
    {"exam_name": "WBJEE", "exam_category": "Engineering", "organization": "WBJEEB", "state": "West Bengal"},
    {"exam_name": "KCET", "exam_category": "Engineering", "organization": "KEA", "state": "Karnataka"},
    {"exam_name": "COMEDK", "exam_category": "Engineering", "organization": "COMEDK", "state": "Karnataka"},
    {"exam_name": "TS EAMCET", "exam_category": "Engineering", "organization": "TSCHE", "state": "Telangana"},
    {"exam_name": "AP EAMCET", "exam_category": "Engineering", "organization": "APSCHE", "state": "Andhra Pradesh"},
    {"exam_name": "UPSC Civil Services", "exam_category": "Government", "organization": "UPSC", "state": ""},
    {"exam_name": "UPSC NDA", "exam_category": "Defense", "organization": "UPSC", "state": ""},
    {"exam_name": "UPSC CDS", "exam_category": "Defense", "organization": "UPSC", "state": ""},
    {"exam_name": "UPSC CAPF", "exam_category": "Government", "organization": "UPSC", "state": ""},
    {"exam_name": "UPSC IES", "exam_category": "Government", "organization": "UPSC", "state": ""},
    {"exam_name": "SSC CGL", "exam_category": "Government", "organization": "SSC", "state": ""},
    {"exam_name": "SSC CHSL", "exam_category": "Government", "organization": "SSC", "state": ""},
    {"exam_name": "SSC JE", "exam_category": "Government", "organization": "SSC", "state": ""},
    {"exam_name": "SSC MTS", "exam_category": "Government", "organization": "SSC", "state": ""},
    {"exam_name": "SSC GD", "exam_category": "Government", "organization": "SSC", "state": ""},
    {"exam_name": "IBPS PO", "exam_category": "Banking", "organization": "IBPS", "state": ""},
    {"exam_name": "IBPS Clerk", "exam_category": "Banking", "organization": "IBPS", "state": ""},
    {"exam_name": "IBPS RRB", "exam_category": "Banking", "organization": "IBPS", "state": ""},
    {"exam_name": "SBI PO", "exam_category": "Banking", "organization": "SBI", "state": ""},
    {"exam_name": "SBI Clerk", "exam_category": "Banking", "organization": "SBI", "state": ""},
    {"exam_name": "RBI Grade B", "exam_category": "Banking", "organization": "RBI", "state": ""},
    {"exam_name": "LIC AAO", "exam_category": "Insurance", "organization": "LIC", "state": ""},
    {"exam_name": "NABARD Grade A", "exam_category": "Banking", "organization": "NABARD", "state": ""},
    {"exam_name": "IDBI Executive", "exam_category": "Banking", "organization": "IDBI", "state": ""},
    {"exam_name": "RRB NTPC", "exam_category": "Railway", "organization": "RRB", "state": ""},
    {"exam_name": "RRB Group D", "exam_category": "Railway", "organization": "RRB", "state": ""},
    {"exam_name": "RRB JE", "exam_category": "Railway", "organization": "RRB", "state": ""},
    {"exam_name": "RRB ALP", "exam_category": "Railway", "organization": "RRB", "state": ""},
    {"exam_name": "AFCAT", "exam_category": "Defense", "organization": "Indian Air Force", "state": ""},
    {"exam_name": "Indian Navy", "exam_category": "Defense", "organization": "Indian Navy", "state": ""},
    {"exam_name": "Indian Army", "exam_category": "Defense", "organization": "Indian Army", "state": ""},
    {"exam_name": "Indian Air Force", "exam_category": "Defense", "organization": "Indian Air Force", "state": ""},
    {"exam_name": "CTET", "exam_category": "Teaching", "organization": "CBSE", "state": ""},
    {"exam_name": "TET", "exam_category": "Teaching", "organization": "State Education Board", "state": "Various"},
    {"exam_name": "UGC NET", "exam_category": "Teaching", "organization": "NTA", "state": ""},
    {"exam_name": "SET", "exam_category": "Teaching", "organization": "State Agency", "state": "Various"},
    {"exam_name": "DSSSB", "exam_category": "Teaching", "organization": "DSSSB", "state": "Delhi"},
    {"exam_name": "NEET UG", "exam_category": "Medical", "organization": "NTA", "state": ""},
    {"exam_name": "NEET PG", "exam_category": "Medical", "organization": "NBE", "state": ""},
    {"exam_name": "AIIMS", "exam_category": "Medical", "organization": "AIIMS", "state": ""},
    {"exam_name": "JIPMER", "exam_category": "Medical", "organization": "JIPMER", "state": "Puducherry"},
    {"exam_name": "TSPSC", "exam_category": "State Government", "organization": "TSPSC", "state": "Telangana"},
    {"exam_name": "APPSC", "exam_category": "State Government", "organization": "APPSC", "state": "Andhra Pradesh"},
    {"exam_name": "TNPSC", "exam_category": "State Government", "organization": "TNPSC", "state": "Tamil Nadu"},
    {"exam_name": "KPSC", "exam_category": "State Government", "organization": "KPSC", "state": "Karnataka"},
    {"exam_name": "MPSC", "exam_category": "State Government", "organization": "MPSC", "state": "Maharashtra"},
    {"exam_name": "BPSC", "exam_category": "State Government", "organization": "BPSC", "state": "Bihar"},
    {"exam_name": "UPPSC", "exam_category": "State Government", "organization": "UPPSC", "state": "Uttar Pradesh"},
    {"exam_name": "MPPSC", "exam_category": "State Government", "organization": "MPPSC", "state": "Madhya Pradesh"},
    {"exam_name": "RPSC", "exam_category": "State Government", "organization": "RPSC", "state": "Rajasthan"},
    {"exam_name": "State Police SI", "exam_category": "Police", "organization": "State Police Recruitment Board", "state": "Various"},
    {"exam_name": "State Police Constable", "exam_category": "Police", "organization": "State Police Recruitment Board", "state": "Various"},
    {"exam_name": "State Police DSP", "exam_category": "Police", "organization": "State PSC", "state": "Various"},
    {"exam_name": "Judiciary Exams", "exam_category": "Judicial", "organization": "State Judiciary Recruitment", "state": "Various"},
    {"exam_name": "Civil Judge", "exam_category": "Judicial", "organization": "State Judicial Service", "state": "Various"},
    {"exam_name": "Public Prosecutor", "exam_category": "Judicial", "organization": "State PSC", "state": "Various"},
    {"exam_name": "GIC", "exam_category": "Insurance", "organization": "GIC", "state": ""},
    {"exam_name": "NIC", "exam_category": "Insurance", "organization": "NIC", "state": ""},
    {"exam_name": "CUET", "exam_category": "Entrance", "organization": "NTA", "state": ""},
    {"exam_name": "CLAT", "exam_category": "Entrance", "organization": "Consortium of NLUs", "state": ""},
    {"exam_name": "NIFT", "exam_category": "Entrance", "organization": "NIFT", "state": ""},
    {"exam_name": "NID", "exam_category": "Entrance", "organization": "NID", "state": ""},
    {"exam_name": "CA", "exam_category": "Entrance", "organization": "ICAI", "state": ""},
    {"exam_name": "CS", "exam_category": "Entrance", "organization": "ICSI", "state": ""},
    {"exam_name": "CMA", "exam_category": "Entrance", "organization": "ICMAI", "state": ""},
]

SUBJECT_TOPIC_MAP: Dict[str, List[Tuple[str, str, str]]] = {
    "Mathematics": [("Algebra", "Linear Equations"), ("Calculus", "Derivatives"), ("Arithmetic", "Speed-Time-Distance")],
    "Reasoning": [("Logical Reasoning", "Syllogism"), ("Analytical Reasoning", "Series"), ("Puzzles", "Arrangement")],
    "Quantitative Aptitude": [("Percentage", "Basic Percentage"), ("Ratio", "Proportion"), ("Time and Work", "Efficiency")],
    "General Knowledge": [("Indian Geography", "Rivers"), ("Indian History", "Freedom Movement"), ("Indian Polity", "Constitution")],
    "General Awareness": [("Current Affairs", "National"), ("Current Affairs", "International"), ("Banking Awareness", "NPA")],
    "Current Affairs": [("Science and Technology", "Space Missions"), ("Economy", "Policy Updates"), ("Sports", "Major Events")],
    "English": [("Grammar", "Tenses"), ("Vocabulary", "Synonyms"), ("Comprehension", "Inference")],
    "Computer Science": [("Computer Fundamentals", "Memory"), ("Programming", "Control Flow"), ("Software Engineering", "Testing")],
    "Physics": [("Mechanics", "Newton Laws"), ("Electricity", "Ohm Law"), ("Optics", "Reflection")],
    "Chemistry": [("Atomic Structure", "Periodic Trends"), ("Organic Chemistry", "Hydrocarbons"), ("Physical Chemistry", "Mole Concept")],
    "Biology": [("Cell Biology", "Organelles"), ("Genetics", "DNA"), ("Physiology", "Circulation")],
    "History": [("Ancient India", "Vedic Age"), ("Medieval India", "Delhi Sultanate"), ("Modern India", "National Movement")],
    "Geography": [("Physical Geography", "Earthquakes"), ("Indian Geography", "Monsoon"), ("Human Geography", "Population")],
    "Polity": [("Constitution", "Fundamental Rights"), ("Parliament", "Lok Sabha"), ("Local Government", "Panchayati Raj")],
    "Economics": [("Macroeconomics", "GDP"), ("Banking", "Repo Rate"), ("Public Finance", "Fiscal Deficit")],
    "Environment": [("Ecology", "Food Chain"), ("Climate Change", "Mitigation"), ("Pollution", "Air Quality")],
    "Science": [("General Physics", "Units"), ("General Chemistry", "Acids-Bases"), ("General Biology", "Nutrition")],
    "Data Structures": [("Arrays", "Traversal"), ("Trees", "BST"), ("Graphs", "BFS")],
    "Algorithms": [("Sorting", "Complexity"), ("Graph Algorithms", "Shortest Path"), ("Greedy", "Optimization")],
    "Operating Systems": [("Processes", "Scheduling"), ("Memory", "Paging"), ("Synchronization", "Deadlock")],
    "Computer Networks": [("OSI Model", "Layers"), ("TCP/IP", "Protocols"), ("Routing", "Basics")],
    "DBMS": [("SQL", "Queries"), ("Normalization", "3NF"), ("Transactions", "ACID")],
    "AI": [("Search", "A*"), ("Knowledge Representation", "Logic"), ("Planning", "State Space")],
    "ML": [("Supervised Learning", "Regression"), ("Classification", "Metrics"), ("Model Validation", "Cross Validation")],
    "Statistics": [("Central Tendency", "Mean"), ("Dispersion", "Variance"), ("Hypothesis Testing", "p-value")],
}


@dataclass
class RenderedQuestion:
    question_type: str
    question: str
    options: List[str]
    correct_answer: str
    explanation: str
    marks: str
    negative_marks: str
    time_limit_seconds: str


def _difficulty_range(difficulty: str) -> Tuple[int, int]:
    if difficulty == "Easy":
        return 2, 20
    if difficulty == "Medium":
        return 20, 200
    return 200, 2000


def render_numerical(rng, difficulty: str, language: str) -> RenderedQuestion:
    lo, hi = _difficulty_range(difficulty)
    distance = int(rng.integers(lo * 5, hi * 5))
    t_low = max(1, lo // 2)
    t_high = max(t_low + 1, hi // 20 + 1)
    time = int(rng.integers(t_low, t_high))
    speed = round(distance / time, 2)
    if language == "Hindi":
        q = f"यदि एक ट्रेन {distance} किमी दूरी {time} घंटे में तय करती है, तो उसकी गति क्या होगी?"
        exp = f"गति = दूरी/समय = {distance}/{time} = {speed} किमी/घंटा।"
    else:
        q = f"If a train travels {distance} km in {time} hours, find the speed."
        exp = f"Speed = distance/time = {distance}/{time} = {speed} km/h."
    return RenderedQuestion(
        question_type="Numerical problems",
        question=q,
        options=[],
        correct_answer=f"{speed} km/h",
        explanation=exp,
        marks="1" if difficulty == "Easy" else ("2" if difficulty == "Medium" else "4"),
        negative_marks="0" if difficulty == "Easy" else ("0.5" if difficulty == "Medium" else "1"),
        time_limit_seconds="45" if difficulty == "Easy" else ("75" if difficulty == "Medium" else "120"),
    )


def render_mcq_formula(rng, difficulty: str, language: str) -> RenderedQuestion:
    lo, hi = _difficulty_range(difficulty)
    a = int(rng.integers(lo, hi))
    b = int(rng.integers(lo, hi))
    c = a + b
    distractors = [c + int(rng.integers(1, 4)), c - int(rng.integers(1, 4)), c + int(rng.integers(5, 9))]
    options = [str(c), *(str(x) for x in distractors)]
    rng.shuffle(options)
    if language == "Hindi":
        q = f"{a} + {b} का मान क्या है?"
        exp = f"योग = {a} + {b} = {c}।"
    else:
        q = f"What is the value of {a} + {b}?"
        exp = f"Sum = {a} + {b} = {c}."
    return RenderedQuestion(
        question_type="MCQ",
        question=q,
        options=options,
        correct_answer=str(c),
        explanation=exp,
        marks="1" if difficulty == "Easy" else ("2" if difficulty == "Medium" else "4"),
        negative_marks="0.25" if difficulty != "Hard" else "1",
        time_limit_seconds="30" if difficulty == "Easy" else ("50" if difficulty == "Medium" else "90"),
    )


def render_true_false(rng, difficulty: str, language: str) -> RenderedQuestion:
    statements = [
        ("In a BST, inorder traversal returns sorted keys.", "True", "BST inorder traversal yields sorted order."),
        ("CPU stands for Central Process Unit.", "False", "Correct expansion is Central Processing Unit."),
        ("Water boils at 100 C at sea level.", "True", "Standard boiling point at 1 atm is 100 C."),
    ]
    i = int(rng.integers(0, len(statements)))
    q, ans, exp = statements[i]
    if language == "Hindi":
        q = q.replace("In a BST, inorder traversal returns sorted keys.", "BST में inorder traversal क्रमबद्ध keys देता है।")
        q = q.replace("CPU stands for Central Process Unit.", "CPU का पूर्ण रूप Central Process Unit है।")
        q = q.replace("Water boils at 100 C at sea level.", "समुद्र तल पर पानी 100 C पर उबलता है।")
        exp = exp.replace("Correct expansion is Central Processing Unit.", "सही पूर्ण रूप Central Processing Unit है।")
    return RenderedQuestion(
        question_type="True/False",
        question=q,
        options=["True", "False"] if language == "English" else ["सत्य", "असत्य"],
        correct_answer=ans if language == "English" else ("सत्य" if ans == "True" else "असत्य"),
        explanation=exp,
        marks="1",
        negative_marks="0",
        time_limit_seconds="25" if difficulty == "Easy" else "40",
    )


def render_fill_blank(rng, difficulty: str, language: str) -> RenderedQuestion:
    rows = [
        ("RBI is the ____ bank of India.", "central", "RBI is India's central bank."),
        ("The capital of India is ____.", "New Delhi", "New Delhi is the national capital."),
        ("SQL stands for Structured Query ____.", "Language", "SQL expands to Structured Query Language."),
    ]
    i = int(rng.integers(0, len(rows)))
    q, ans, exp = rows[i]
    if language == "Hindi":
        if i == 0:
            q, ans, exp = "RBI भारत का ____ बैंक है।", "केंद्रीय", "RBI भारत का केंद्रीय बैंक है।"
        elif i == 1:
            q, ans, exp = "भारत की राजधानी ____ है।", "नई दिल्ली", "नई दिल्ली भारत की राजधानी है।"
        else:
            q, ans, exp = "SQL का पूर्ण रूप Structured Query ____ है।", "Language", "SQL का पूर्ण रूप Structured Query Language है।"
    return RenderedQuestion(
        question_type="Fill in the blanks",
        question=q,
        options=[],
        correct_answer=ans,
        explanation=exp,
        marks="1",
        negative_marks="0",
        time_limit_seconds="30",
    )


def render_match(rng, difficulty: str, language: str) -> RenderedQuestion:
    q_en = "Match: (A) CPU, (B) RAM, (C) HDD with (1) Storage, (2) Processing, (3) Temporary Memory."
    options = ["A-2, B-3, C-1", "A-1, B-3, C-2", "A-2, B-1, C-3", "A-3, B-2, C-1"]
    q_hi = "मिलान कीजिए: (A) CPU, (B) RAM, (C) HDD और (1) संग्रहण, (2) प्रसंस्करण, (3) अस्थायी मेमोरी।"
    return RenderedQuestion(
        question_type="Match the following",
        question=q_hi if language == "Hindi" else q_en,
        options=options,
        correct_answer="A-2, B-3, C-1",
        explanation="CPU performs processing, RAM is temporary memory, HDD is storage.",
        marks="2",
        negative_marks="0.5",
        time_limit_seconds="80",
    )


def render_assertion_reason(rng, difficulty: str, language: str) -> RenderedQuestion:
    q_en = (
        "Assertion (A): Repo rate affects lending rates. "
        "Reason (R): Repo rate is the rate at which RBI lends to commercial banks."
    )
    q_hi = (
        "कथन (A): रेपो रेट ऋण दरों को प्रभावित करती है। "
        "कारण (R): रेपो रेट वह दर है जिस पर RBI वाणिज्यिक बैंकों को उधार देता है।"
    )
    opts_en = [
        "Both A and R are true and R is the correct explanation",
        "Both A and R are true but R is not the correct explanation",
        "A is true but R is false",
        "A is false but R is true",
    ]
    opts_hi = [
        "A और R दोनों सही हैं और R, A की सही व्याख्या है",
        "A और R दोनों सही हैं पर R, A की सही व्याख्या नहीं है",
        "A सही है पर R गलत है",
        "A गलत है पर R सही है",
    ]
    return RenderedQuestion(
        question_type="Assertion-Reason",
        question=q_hi if language == "Hindi" else q_en,
        options=opts_hi if language == "Hindi" else opts_en,
        correct_answer=opts_hi[0] if language == "Hindi" else opts_en[0],
        explanation="Repo rate is a policy signal that propagates to loan pricing.",
        marks="2" if difficulty != "Hard" else "4",
        negative_marks="0.5" if difficulty != "Hard" else "1",
        time_limit_seconds="90",
    )


def render_case_study(rng, difficulty: str, language: str) -> RenderedQuestion:
    deposits = [int(rng.integers(30, 90)) for _ in range(3)]
    labels = ["A", "B", "C"]
    mx_i = int(max(range(3), key=lambda i: deposits[i]))
    if language == "Hindi":
        q = (
            f"एक बैंक रिपोर्ट में शाखा जमा (करोड़ में) A={deposits[0]}, B={deposits[1]}, C={deposits[2]} हैं। "
            "सबसे अधिक जमा किस शाखा में है?"
        )
        exp = f"अधिकतम मान {deposits[mx_i]} है, इसलिए शाखा {labels[mx_i]} सही है।"
    else:
        q = (
            f"A bank report shows branch deposits (in crore): A={deposits[0]}, B={deposits[1]}, C={deposits[2]}. "
            "Which branch has the highest deposits?"
        )
        exp = f"Maximum value is {deposits[mx_i]}, so branch {labels[mx_i]} is correct."
    return RenderedQuestion(
        question_type="Case study questions",
        question=q,
        options=labels,
        correct_answer=labels[mx_i],
        explanation=exp,
        marks="2" if difficulty == "Medium" else "3",
        negative_marks="0.5",
        time_limit_seconds="120",
    )


def render_diagram_based(rng, difficulty: str, language: str) -> RenderedQuestion:
    q = "Select the correct mirror image of the given figure."
    if language == "Hindi":
        q = "दिए गए चित्र की सही दर्पण छवि चुनिए।"
    return RenderedQuestion(
        question_type="Diagram-based questions",
        question=q,
        options=["Option A", "Option B", "Option C", "Option D"],
        correct_answer="Option B",
        explanation="Option B correctly preserves mirrored orientation.",
        marks="2",
        negative_marks="0.5",
        time_limit_seconds="70",
    )


def render_programming(rng, difficulty: str, language: str) -> RenderedQuestion:
    n = int(rng.integers(2, 50))
    q_en = f"Write a Python expression to check if number {n} is even."
    q_hi = f"संख्या {n} के सम होने की जांच के लिए Python अभिव्यक्ति लिखिए।"
    return RenderedQuestion(
        question_type="Programming questions",
        question=q_hi if language == "Hindi" else q_en,
        options=[],
        correct_answer=f"{n} % 2 == 0",
        explanation="A number is even if remainder with 2 is zero.",
        marks="2" if difficulty != "Hard" else "4",
        negative_marks="0",
        time_limit_seconds="120",
    )


RENDERERS: List[Callable] = [
    render_numerical,
    render_mcq_formula,
    render_true_false,
    render_fill_blank,
    render_match,
    render_assertion_reason,
    render_case_study,
    render_diagram_based,
    render_programming,
]
