FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

ARG INSTALL_SAM2=0
ARG SAM2_REPO_REF=main

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN if [ "$INSTALL_SAM2" = "1" ]; then \
      pip install --no-cache-dir torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu && \
      pip install --no-cache-dir "setuptools>=61.0" wheel && \
      git clone --depth 1 --branch "$SAM2_REPO_REF" https://github.com/facebookresearch/sam2.git /opt/sam2 && \
      cd /opt/sam2 && \
      pip install --no-cache-dir --no-build-isolation -e . ; \
    fi

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
