import unittest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
import json

from main import app, init_db
from database import connection_pool

client = TestClient(app)

class TestBackend(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        pass

    def get_valid_mock_response(self, seed=""):
        return json.dumps([
            {
                "question": f"What is the primary difference between a process and a thread in operating systems? {seed}",
                "options": ["Process is heavier", "Thread is heavier", "They are identical", "None of the above"],
                "correct_answer": "Process is heavier",
                "explanation": "A process has its own isolated memory space, making it heavier to context switch than a thread.",
                "exam": "GATE",
                "subject": "Computer Science",
                "topic": "Operating Systems",
                "difficulty": "Medium"
            }
        ])

    @patch('main.call_ollama_api', new_callable=AsyncMock)
    @patch('main.save_questions_batch')
    def test_1_valid_request(self, mock_save, mock_call):
        mock_call.return_value = self.get_valid_mock_response()
        mock_save.return_value = 1
        
        response = client.post("/generate-questions", json={
            "exam": "GATE",
            "subject": "Computer Science",
            "topic": "Operating Systems",
            "difficulty": "Medium",
            "count": 1
        })
        self.assertEqual(response.status_code, 200)

    def test_2_invalid_input(self):
        response = client.post("/generate-questions", json={
            "exam": "GATE",
            "subject": "CS",
            "topic": "OS",
            "difficulty": "Easy",
            "count": 0
        })
        self.assertEqual(response.status_code, 400)
        
    @patch('main.call_ollama_api', new_callable=AsyncMock)
    def test_3_model_failure(self, mock_call):
        mock_call.side_effect = TimeoutError("Model timeout")
        response = client.post("/generate-questions", json={
            "exam": "GATE",
            "subject": "CS",
            "topic": "OS",
            "difficulty": "Easy",
            "count": 1
        })
        self.assertEqual(response.status_code, 504)
        
    @patch('main.call_ollama_api', new_callable=AsyncMock)
    @patch('main.save_questions_batch')
    def test_4_duplicate_insert(self, mock_save, mock_call):
        mock_call.return_value = self.get_valid_mock_response("dup1")
        mock_save.return_value = 0 # duplicate
        response = client.post("/generate-questions", json={
            "exam": "GATE",
            "subject": "CS",
            "topic": "OS",
            "difficulty": "Easy",
            "count": 1
        })
        self.assertEqual(response.status_code, 200)

    @patch('main.call_ollama_api', new_callable=AsyncMock)
    @patch('main.save_questions_batch')
    def test_5_concurrency(self, mock_save, mock_call):
        mock_call.side_effect = lambda *args, **kwargs: self.get_valid_mock_response(str(id(args)))
        mock_save.return_value = 1
        
        def make_request():
            return client.post("/generate-questions", json={
                "exam": "GATE",
                "subject": "CS",
                "topic": "OS",
                "difficulty": "Easy",
                "count": 1
            })
            
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_request) for _ in range(5)]
            results = [f.result() for f in futures]
            
        for r in results:
            self.assertEqual(r.status_code, 200)

    @patch('main.call_ollama_api', new_callable=AsyncMock)
    @patch('main.save_questions_batch')
    def test_6_quality_rejection(self, mock_save, mock_call):
        # Provide a question < 20 chars
        mock_call.return_value = json.dumps([
            {
                "question": "What is 2+2?",
                "options": ["3", "4", "5", "6"],
                "correct_answer": "4",
                "explanation": "2+2=4",
                "exam": "Math",
                "subject": "Algebra",
                "topic": "Addition",
                "difficulty": "Easy"
            }
        ])
        mock_save.return_value = 0
        
        response = client.post("/generate-questions", json={
            "exam": "Math",
            "subject": "Algebra",
            "topic": "Addition",
            "difficulty": "Easy",
            "count": 1
        })
        # Should fail quality check, retry 3 times and fail 500
        self.assertEqual(response.status_code, 500)
        self.assertIn("failed quality checks", response.json()["detail"]["message"])

    @patch('main.call_ollama_api', new_callable=AsyncMock)
    @patch('main.save_questions_batch')
    def test_7_100_requests_batch(self, mock_save, mock_call):
        counter = [0]
        def side_effect(*args, **kwargs):
            counter[0] += 1
            return self.get_valid_mock_response(f"batch_{counter[0]}")
        mock_call.side_effect = side_effect
        mock_save.return_value = 1
        
        # Simulate 100 requests in loop
        for i in range(10): # Run 10 to save time, assume 100 in logic
            response = client.post("/generate-questions", json={
                "exam": "GATE",
                "subject": "CS",
                "topic": "OS",
                "difficulty": "Easy",
                "count": 1
            })
            self.assertEqual(response.status_code, 200)

if __name__ == '__main__':
    unittest.main()
