FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements-cloud.txt /app/server/requirements-cloud.txt
RUN pip install --no-cache-dir -r /app/server/requirements-cloud.txt

COPY server /app/server

ENV ENHANCER_API_KEY=""
ENV PORT=8765

EXPOSE 8765

CMD ["sh", "-c", "uvicorn server.realesrgan_api:app --host 0.0.0.0 --port ${PORT}"]
