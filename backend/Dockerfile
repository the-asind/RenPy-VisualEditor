FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --omit=dev

COPY frontend/scripts ./frontend/scripts
COPY backend/ .

# Ensure the database directory exists and permissions are set
RUN mkdir -p /app/database && \
    chmod -R 755 /app/database

EXPOSE 9000

# Launch the FastAPI app using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
