from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(
    title="Student Academic AI - ML Service",
    description="Microservice for academic predictive modeling, risk assessment, and trend forecasting",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """Health check endpoint required by platform quality gates."""
    return {"status": "ok"}

@app.get("/")
def root():
    return {
        "service": "student-academic-ai-ml",
        "status": "online",
        "endpoints": ["/health", "/docs"]
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
