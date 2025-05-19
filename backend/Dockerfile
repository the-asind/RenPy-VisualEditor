FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure the database directory exists and permissions are set
RUN mkdir -p /app/database && \
    chmod -R 755 /app/database

EXPOSE 9000

# Launch the FastAPI app using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
