FROM node:20-bookworm-slim AS frontend-crdt-deps

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --omit=dev

FROM python:3.11-slim

WORKDIR /app
ENV PROJECT_GRAPH_FRONTEND_DIR=/app/frontend

COPY backend/requirements.txt ./
COPY backend/requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt

COPY frontend/package*.json ./frontend/
COPY --from=frontend-crdt-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend-crdt-deps /frontend/node_modules ./frontend/node_modules
RUN node --version

COPY frontend/scripts ./frontend/scripts
COPY backend/ .
COPY LICENSE NOTICE ./
COPY frontend/public/THIRD_PARTY_NOTICES.txt ./frontend/THIRD_PARTY_NOTICES.txt
RUN python scripts/build_third_party_notices.py

# Ensure the database directory exists and permissions are set
RUN mkdir -p /app/database && \
    chmod -R 755 /app/database

EXPOSE 9000

# Launch the FastAPI app using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000", "--ws-max-size", "1048576", "--ws-max-queue", "4"]
