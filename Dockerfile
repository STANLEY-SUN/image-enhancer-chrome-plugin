FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements-cloud.txt /app/server/requirements-cloud.txt
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir --use-pep517 -r /app/server/requirements-cloud.txt

COPY server /app/server

ENV ENHANCER_API_KEY=""
ENV PORT=8765

EXPOSE 8765

CMD ["sh", "-c", "uvicorn server.realesrgan_api:app --host 0.0.0.0 --port ${PORT}"]
