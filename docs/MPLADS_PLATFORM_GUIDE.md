# MPLADS AI Monitoring, Anomaly Detection and Risk Intelligence Platform

## What the website does

This website is a decision-support and early-warning platform for monitoring MPLADS works. It joins allocation, recommendation, sanction, completion and expenditure records; calculates financial, compliance, completion and duplicate/split-work indicators; and presents the results for human review.

It does not legally adjudicate fraud, corruption or ineligibility. Its language is deliberately non-accusatory: risk indicator, potential anomaly, candidate duplicate, compliance gap and requires review.

## End-to-end workflow

1. Raw government files are loaded from `data/raw`.
2. `src/preprocessing/cleaner.py` standardizes work IDs, text, dates, amounts and status fields.
3. `src/data/master_builder.py` joins the sanctioned works base to recommendations, completions and payment transactions.
4. Work descriptions are classified by `work_classifier.py` and `sector_classifier.py`.
5. Material context is calculated conservatively by `material_context.py` when a description contains explicit material quantities.
6. Financial, duplicate, compliance and completion-risk engines run over the master dataset.
7. `composite_risk_engine.py` merges model outputs, applies compliance-first priority, and writes `master_project_risk_scores.parquet`.
8. FastAPI serves the final data to the existing React/TypeScript UI.
9. Officials inspect the queue, open a work detail record, read the evidence explanation, and decide what manual verification is required.

## Data foundation

| Dataset | Purpose |
|---|---|
| T1 Allocated limits | MP/constituency entitlement and allocation context |
| T2 Calamity consents | Calamity-related consent amounts and dates |
| T3 Works recommended | Recommendation date, proposed description and amount |
| T4 Works sanctioned | Main work-level sanctioned record and sanction amount |
| T5 Works completed | Completion date, completed disbursal and evidence-image flag |
| T6 Expenditure | Payment date, amount and payment status |

The pipeline creates processed Parquet files, an analytical master, model feature files and a final composite-risk master. Work IDs are normalized with regex extraction and deterministic fallback IDs when the source identifier is missing.

## Website components

### Overview / Executive Dashboard

Shows portfolio totals, sanctioned and disbursed amounts, completed works, risk distribution, state/category aggregation and review volume. It is for situational awareness and prioritization, not a final audit conclusion.

### Risk Intelligence Monitor

Provides a paginated review queue. Records can be filtered by state, constituency, category, severity, search text and component risk thresholds. Sorting can focus on composite, financial, duplicate, compliance or schedule risk.

### Project Detail / 360-degree view

Shows the work identity, description, sanction and expenditure values, completion/evidence information, component scores, explanations, peer baseline, schedule indicators and candidate duplicates.

### Financial Analytics

Shows expenditure outliers, peer comparison, historical median context, anomaly type, deviation, sample size, unit-price context when available and a plain-language explanation of why a record requires review.

### Compliance Monitor

Shows guideline and data-integrity conditions, triggered rules, severity and the required follow-up. Compliance is the highest-priority component.

### Duplicate Inspector

Shows candidate pairs side by side, including descriptions, sector/category compatibility, dates, IDs, similarity, timing and split-work investigation evidence.

### Schedule & Progress Risk

Compares elapsed or completed duration and expenditure progress against historical sector/category completion behavior and the one-year general guideline target.

### MP Intelligence

Provides portfolio-level work counts, expenditure totals, completion counts and suspicious-work review records for the selected existing portfolio filters. It does not introduce national/state/constituency selector UI from the source application; it preserves the target application’s existing interface.

### Data Sync & System Status

Connects to the official MOSPI REST endpoint every 15 days for six tiles: allocated limits, recommended works, sanctioned works, completed works, expenditure, and calamity consent. It stages the responses concurrently, validates source columns, previews NEW/MODIFIED/REMOVED records by `WORK_ID + WORK_RECOMMENDATION_DTL_ID`, creates timestamped SHA-256 snapshots, and only then promotes data and queues background retraining. A direct full pipeline run over locally edited dataset files also creates a snapshot/history event with the same counters, so manual dataset changes are visible in Data Sync. Manual review uses `Sync Now & Compare`; failed or incomplete six-table fetches leave the active dataset untouched. The REST adapter bypasses inherited dead proxy variables by default; set `MPLADS_PROXY_URL` only when the deployment requires an explicit corporate proxy.

### Model Monitoring

Reports the registered financial model, version, run history and tracked anomaly metrics from the local MLflow-style registry metadata.

### AI Assistant

Remains the existing target-application assistant and is not replaced by the source project’s UI.

## Model and rule reference

### 1. Work classification and sector-cost model

**Code:** `src/modules/work_classifier.py`, `src/modules/sector_classifier.py`

**Purpose:** Convert free-text work descriptions into consistent groups and MPLADS sectors so that comparisons use relevant peers instead of unrelated works.

**Inputs:** description/sanctioned work description, source work category, state, sanction amount and explicit quantity/unit text.

**Detection logic:**

- Normalize text, punctuation and common variants.
- Apply high-confidence phrase rules for roads, bridges, water, lighting, education, healthcare, drainage, irrigation, buildings, sanitation, sports and other groups.
- If enough high-confidence examples exist, use TF-IDF features and a supervised text classifier for uncertain descriptions.
- Map recognized subcategories to the sector reference matrix.
- Extract quantities such as pieces, units, kilometres, metres, square feet and similar explicit units without inventing quantities.
- Apply the regional multiplier and reference cost data only as contextual information.

**Outputs:** `sector_id`, `main_sector`, `ai_work_category`, `effective_work_category`, confidence, matched keywords, classification reason, quantity, unit, reference unit/total cost and cost range fields.

### 2. Material context model

**Code:** `src/modules/material_context.py`

**Purpose:** Add a low-priority material-cost context signal where the description explicitly names a material and gives a material-native quantity.

**Inputs:** description, state, sanction/recommendation year and material benchmark reference data.

**Detection logic:**

- Detect cement, TMT steel, aggregate and brick indicators.
- Detect explicit quantities such as kg, tonne, bags or pieces.
- Match state/material/year benchmarks when available.
- Calculate a reference material cost only when a reliable quantity and price exist.

**Outputs:** detected materials, source of detection, quantity, benchmark price, reference material cost, context score, availability status and explanation.

Material context contributes only a small supporting portion of financial risk. It never replaces the completed-work financial baseline.

### 3. Financial anomaly model

**Code:** `src/modules/financial_anomaly.py`

**Purpose:** Identify unusual expenditure or cost patterns against comparable completed works.

**Inputs:** sanctioned amount, effective expenditure, completion status/date, constituency, sector/category, description quantity/unit, payment count, dates, reference-cost context and data-integrity fields.

**Historical baseline:** Completed works with positive expenditure are the primary historical reference. The model groups by classified category/sector and constituency. It calculates median, mean, quartiles, IQR, sample size and upper fence.

**Unit-price branch:** If the description contains a reliable quantity and unit, the model calculates `current_expenditure / quantity` and compares it with the historical median unit price for comparable completed works.

**No-quantity branch:** If there is no reliable quantity, it compares total current expenditure with the median total expenditure of comparable completed works. It does not create an artificial unit price.

**ML branch:** Isolation Forest uses normalized financial features including unit/total cost context, expenditure, peer ratio, payment count, expenditure-to-sanction ratio and quantity context. This is a supporting signal, not the sole decision.

**Risk conditions:** high peer deviation, high percentile, IQR upper-fence breach, expenditure above sanction, invalid financial values, date-order errors, missing core information, sector cost bounds and unusual ML pattern.

**Outputs:** anomaly flag/type/severity, financial score/level, expected median, current expenditure, deviation percentage, sample size, comparison basis, sector/category, constituency, comparable count, unit, quantity, current unit price, historical median unit price, confidence, explanation, risk description and structured reasons.

### 4. Compliance and guideline model

**Code:** `src/modules/compliance_engine.py`

**Purpose:** Apply deterministic, explainable administrative, financial-integrity and 2023 MPLADS guideline checks.

**Inputs:** recommendation/sanction/start/completion dates, work status, description, constituency, sanctioned amount, expenditure, sector, work type and available work metadata.

**Current conditions include:**

- Sanction or rejection not issued within 45 days.
- Date ordering violations.
- Similar recommendation timing signal.
- Completion that is implausibly fast.
- Incomplete work beyond the general one-year period.
- Severe ongoing delay beyond the extended threshold.
- Status/completion-date mismatch.
- Expenditure exceeding sanction.
- Negative or invalid amount combinations.
- Missing dates, short description or missing constituency.
- Sector cost and completion-duration reference bounds.
- Normal minimum work amount below ₹2.5 lakh, marked for exception review rather than automatic ineligibility.
- Residential buildings, commercial/private works, operation/maintenance, grants/loans, relief-fund contributions, land acquisition, reimbursement, individual/family benefit, CSR pooling, religious works, Swagat Dwar/welcome gates and unauthorized-colony works.
- Repair/renovation review for the 10% annual authorization cap and reasonable gap requirement.
- Movable-asset review for eligible government/government-aided institution and committee conditions.

Each rule produces a rule ID, name, source, condition, threshold, required fields, pass/fail status, severity and explanation. Missing source fields are treated as evidence gaps requiring manual verification, not proof of wrongdoing.

### 5. Completion and schedule-risk model

**Code:** `src/modules/delay_risk.py`

**Purpose:** Identify works whose elapsed/completed duration or financial progress is materially worse than comparable historical behavior.

**Inputs:** sanction date, completion date, status, effective expenditure, sanction amount, classified sector/category, description and reference date.

**Detection logic:**

- Calculate completed duration for historical completed works.
- Calculate sector/category median completion period and sample size.
- Use that historical median as expected completion period, falling back to the general one-year target when needed.
- Compare current elapsed/completed period, expenditure progress and expected timeline progress.
- Add overdue, progress-gap, peer-progress, one-year and calamity-duration signals.

**Outputs:** expected completion period, actual/elapsed period, sector median completion period, deviation, schedule/completion score and category, overdue days, progress gap and explanation.

### 6. Duplicate and possible split-work model

**Code:** `src/modules/duplicate_detection.py`

**Purpose:** Identify candidate duplicates or possible split works for manual verification.

**Inputs:** sanctioned description, normalized keywords, state, constituency, sector/category, work ID, sanction date and amount.

**Detection logic:**

- Compare works within the same state/constituency/category block.
- Combine the recommended (T3) and sanctioned (T4) descriptions for each logical work, then calculate TF-IDF/cosine similarity over that combined corpus. The inspector retains both source descriptions for review.
- Use the same sanctioned description as the primary trigger for stronger investigation.
- Check same/compatible sector, timing within 180 days, numeric work-ID distance of up to 10 and surrounding record distance of up to 5 where available.
- Avoid labeling every similar description as a duplicate.
- Mark the pattern as suspected duplicate/possible split work and require manual verification.

**Outputs:** pair IDs, descriptions, similarity score, categories/sectors, amounts, dates, same-description flag, days between works, ID/record proximity, split-work investigation flag, risk level and explanation.

### 7. Final composite-risk model

**Code:** `src/risk/composite_risk_engine.py`

The final score combines compliance, financial, duplicate and schedule signals with compliance-first weights. Compliance is the controlling priority. A critical compliance result cannot be diluted by lower financial, duplicate or schedule scores. Financial risk is next, followed by duplicate/split-work risk and schedule context.

**Final outputs:** overall score/category, separate component scores/categories, highest-priority reason, risk description, recommended action, evidence summary and confidence.

The final wording always identifies the most important review reason first and preserves the individual component signals.

## API reference

| Endpoint | Purpose |
|---|---|
| `/api/health` | Service health and loaded-record count |
| `/api/overview` | Portfolio totals, risk distribution, state/category summaries |
| `/api/mp-intelligence` | Existing portfolio intelligence and suspicious works |
| `/api/risk-monitor` | Paginated, filterable review queue |
| `/api/work-detail` | Complete work-level detail and candidate duplicates |
| `/api/duplicate-candidates` | Pairwise duplicate/split-work candidates |
| `/api/schedule-risk` | Schedule and completion-risk analytics |
| `/api/filters` | State, constituency, MP, category and severity values |
| `/api/analytics/material-context` | Material context for one work |
| `/api/analytics/classification` | Work classification for one work |
| `/api/analytics/sector-cost` | Sector and reference-cost context for one work |
| `/api/sectors` | Sector reference matrix |
| `/api/compliance/rules` | Current 2023 guideline thresholds and prohibited categories |
| `/api/sync/status` | Latest sync/snapshot status |
| `/api/sync/history` | Historical synchronization records |
| `/api/sync/preview-diff` | Stage official REST data and return paginated record-level deltas |
| `/api/sync/commit-diff` | Promote a reviewed preview, snapshot it, and queue retraining |
| `/api/sync/training-status` | Background training progress, validation, drift, and rollback status |
| `/api/model/status` | Model registry and production status |
| `/api/model/experiments` | Model run summaries |

## Operating the project

Install dependencies with `pip install -r requirements.txt`. Run the complete pipeline with `python src/run_pipeline.py`. Start the backend with `python src/backend/app.py` or Uvicorn. Start the frontend from `frontend` using its package scripts.

The regenerated current dataset contains 79,068 sanctioned works. Always treat the model outputs as prioritization evidence. A reviewer should validate source documents, approvals, site conditions, user-agency commitments, procurement records, payment vouchers and applicable exceptions before taking administrative action.

## Important limitations

- Text rules cannot prove ownership, location, agency eligibility or statutory clearance when those fields are absent.
- Sector cost ranges are reference context, not legal ceilings unless the applicable guideline or sanctioned schedule of rates makes them so.
- A missing photo or field is an evidence gap, not evidence that a work is fraudulent.
- Duplicate models identify patterns for investigation; they do not establish fraud or intentional splitting.
- The supplied document is named `mplads_2023_guidelines_including_changes.pdf`; its clauses and amendments are the compliance reference used by the current implementation.
