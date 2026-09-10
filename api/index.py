import os
import sys

# Add repo root to sys.path so src.backend.app can be resolved
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src.backend.app import app
from mangum import Mangum

# Mangum wraps the FastAPI ASGI app for AWS Lambda / Vercel serverless runtime
handler = Mangum(app, lifespan="off")
