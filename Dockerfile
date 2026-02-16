# ──────────────────────────────────────────────────────────────
# Stage 1: Build frontend
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ──────────────────────────────────────────────────────────────
# Stage 2: Production image
# ──────────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ .

# Copy built frontend
COPY --from=frontend-build /app/backend/static ./static

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment — SECRET_KEY must be provided at runtime (app refuses insecure defaults)
ENV DATABASE_URL=sqlite:///./data/kitchen_cupboard.db
# SECRET_KEY intentionally not set here — must be provided via docker-compose or env

EXPOSE 8000

VOLUME ["/app/data"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
