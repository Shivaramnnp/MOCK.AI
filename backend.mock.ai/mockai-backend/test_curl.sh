curl -X POST http://127.0.0.1:8000/generate-questions \
-H "Content-Type: application/json" \
-d '{"exam":"SSC","subject":"Math","topic":"Time and Distance","difficulty":"Medium","count":3}'
