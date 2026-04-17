FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd -r -s /bin/false appuser
COPY . .
RUN chown -R appuser:appuser /app/data 2>/dev/null || mkdir -p /app/data && chown -R appuser:appuser /app/data
USER appuser
CMD ["python", "main.py"]
