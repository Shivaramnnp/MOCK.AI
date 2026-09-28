# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Inform Docker that the container listens on the specified network ports at runtime
EXPOSE 8080

# Set environment variables
ENV PORT=8080
# ENV SUPADATA_API_KEY=your_key_here # Uncomment and set if needed, or pass via gcloud command

# Run gunicorn for production instead of the built-in Flask development server
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "main:app"]
