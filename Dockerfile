FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd -r -s /bin/false appuser && mkdir -p /app/data
COPY . .
RUN chown -R appuser:appuser /app/data
VOLUME /app/data
USER appuser
CMD ["python", "main.py"]
