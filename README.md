Worked for 18s




Paste this in the README:
:: Backend
cd /d P:\SIH\mplads_updated-main

python -m venv .venv
.venv\Scripts\activate

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

python -m uvicorn src.backend.app:app --reload --host 127.0.0.1 --port 8000
Open a second CMD window for the frontend:
cd /d P:\SIH\mplads_updated-main\frontend

npm install
npm run dev
Open:
Frontend: http://localhost:3000
Backend API: http://127.0.0.1:8000
API docs: http://127.0.0.1:8000/docs
To run the backend later after setup:
cd /d P:\SIH\mplads_updated-main
.venv\Scripts\activate
python -m uvicorn src.backend.app:app --reload


2:31 AM









# MPLADS AI-Powered Monitoring, Anomaly Detection & Risk Intelligence Platform

## Complete user and model guide

See the complete current guide at [docs/MPLADS_PLATFORM_GUIDE.md](docs/MPLADS_PLATFORM_GUIDE.md) and the generated [MPLADS Platform User and Model Guide PDF](docs/MPLADS_Platform_User_and_Model_Guide.pdf). It documents the website workflow, UI pages, APIs, data inputs, every model, detection conditions, outputs, risk-priority logic, limitations and operating steps.

## AI & Backend Decision-Support System Architecture

An AI-powered analytical and decision-support backend engine designed to inspect administrative, financial, duplicate-work, schedule, and compliance risk factors across the Members of Parliament Local Area Development Scheme (MPLADS).

### Repository Structure

```text
SIH2026/
├── data/
│   ├── raw/          # Raw CSV/Excel datasets (T1 to T6)
│   ├── processed/    # Cleaned, type-validated parquet datasets
│   └── features/     # Feature-engineered risk matrices & duplicate match database
├── docs/             # Technical specifications & data dictionaries
├── requirements.txt  # Python backend dependencies (FastAPI, pandas, uvicorn, scikit-learn)
├── PROJECT_DOCUMENTATION.md # Comprehensive mathematical & architectural specification
└── src/
    ├── preprocessing/# Data cleaning, type parsing, and validation (cleaner.py)
    ├── modules/      # Analytical Engines:
    │                 #   - financial_anomaly.py (Category median ratio & expenditure z-score)
    │                 #   - duplicate_detection.py (TF-IDF vectorizer & cosine text similarity)
    │                 #   - compliance_engine.py (Site photo proof & completion audit)
    ├── risk/         # Composite Risk Engine (composite_risk_engine.py)
    ├── backend/      # FastAPI Decision-Support API (app.py)
    └── run_pipeline.py # Master analytical pipeline execution script
```

### Installation & Execution

1. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run Full AI Risk & Feature Engineering Pipeline**:
   ```bash
   python src/run_pipeline.py
   ```

3. **Start Backend Decision-Support API Server**:
   ```bash
   python src/backend/app.py
   ```
   Or via Uvicorn:
   ```bash
   uvicorn src.backend.app:app --host 127.0.0.1 --port 8000 --reload
   ```

### API Endpoints
- `GET /api/health` - Health check and project database record count.
- `GET /api/overview` - Portfolio-wide fund allocation, expenditure disbursals, and state/category aggregations.
- `GET /api/risk-monitor` - Filterable audit queue sorted by composite risk score.
- `GET /api/work-detail?work_id=WS/...` - 360° decision-support profile and evidence audit matrix for a specific work record.
- `GET /api/duplicate-candidates` - Candidate duplicate pairs extracted via NLP cosine text similarity.
"# testai" 
