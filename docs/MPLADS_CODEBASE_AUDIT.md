# MPLADS AI Monitoring Platform

## Complete codebase audit, technical documentation, and viva guide

**Audit date:** 12 September 2026  
**Repository audited:** P:\SIH\mplads_updated-main  
**Primary evidence:** Python, TypeScript/React, configuration, and currently generated data files in this repository  
**Source-of-truth rule:** the code is authoritative. Existing README files, old PDFs, model labels, comments, and previous documentation are treated as claims to verify, not as proof that a feature exists.

This document is written at two levels:

1. **ELI10:** what the system does in simple language.
2. **Technical trace:** the exact data, calculation, threshold, model/rule, output, and implementation file responsible.

Status labels:

- **IMPLEMENTED:** present and executable in the audited code.
- **PARTIALLY IMPLEMENTED:** some of the workflow or interface exists, but an important part is missing, misleading, hard-coded, or not production-complete.
- **PLANNED / NOT CURRENTLY IMPLEMENTED:** no executable implementation was found for the claimed behavior.

## Executive verdict

The repository contains a working MPLADS monitoring platform built around:

- official MPLADS data tables;
- cleaning and work-ID normalization;
- a master analytical dataset;
- rule-based work and sector classification;
- historical completed-work financial benchmarking;
- duplicate and possible split-work detection;
- guideline-based compliance checks;
- schedule/progress risk checks;
- a weighted composite risk score;
- FastAPI APIs;
- a React dashboard with risk, benchmark, compliance, duplicate, sync, and model-status views.

The strongest implemented capability is **auditable historical comparison and evidence generation**. A work can be compared with completed works from the same constituency, state, or all-India peer group, and the result includes the comparison range, median, comparison tier, reason, and review action.

The most important accuracy point is this:

> The current financial engine is not an active Isolation Forest implementation. It uses historical completed-work ranges and percentile ranking. Isolation Forest appears in JSON registry metadata, progress labels, README/old documentation, and the model-monitoring UI, but no current IsolationForest fit/predict path was found in the active financial analyzer.

The sync and training screens are useful operational scaffolding, but the system does not currently prove that a newly trained ML model is better than the previous model. The training job reruns the analytical pipeline, validates generated artifacts, computes simple score drift, backs up feature files, and records metadata. It does not train, evaluate, compare, approve, or deploy a serialized ML model.

## 1. Coverage against the MPLADS problem statement

| Problem-statement need | What the repository actually implements | Status |
|---|---|---|
| Analyze sanctions, expenditure, cost, progress, payments, and asset creation | T1/T3/T4/T5/T6/T7 ingestion; master joins; financial, schedule, compliance, and duplicate feature files | **IMPLEMENTED** |
| Detect expenditure and cost anomalies | Completed-work range comparison, median/min/max, cost out-of-range flag, financial risk rank | **IMPLEMENTED** |
| Detect duplicate works | Candidate-pair search using normalized descriptions, tokens, quantities, dates, IDs, cost relations, and connected components | **IMPLEMENTED** |
| Detect possible artificial splitting/group projects | Pair and cluster logic checks repeated or divided works, close IDs/dates, related descriptions, and cost patterns | **IMPLEMENTED**, review signal only |
| Detect delayed works | Estimated completion, elapsed duration, expected-vs-expenditure progress gap, overdue days, delay score | **IMPLEMENTED**, with a hard-coded audit reference date |
| Check MPLADS compliance | Work-level guideline indicators and constituency-level allocation/cap checks | **IMPLEMENTED**, with scope/data limitations |
| Use AI/ML/NLP | Rule classifiers, optional LogisticRegression work classifier, optional LinearSVC sector classifier, TF-IDF duplicate candidate generation | **PARTIALLY IMPLEMENTED** |
| Use an Isolation Forest anomaly model | No active fit/predict implementation in the current financial engine | **PLANNED / NOT CURRENTLY IMPLEMENTED** |
| Generate risk-based alerts | Risk fields, queue APIs, dashboard filtering, review-required flags, evidence text | **IMPLEMENTED** |
| Predictive insights | Baseline duration and peer progress are calculated; no verified predictive model or accuracy evaluation | **PARTIALLY IMPLEMENTED** |
| State, constituency, MP, and Ministry dashboards | FastAPI aggregates and React pages provide these views; exact location coordinates are not in the source dataset | **IMPLEMENTED**, geography is attribute-based |
| Automated source synchronization | Official API adapter, retries, staging, diff preview, commit, snapshots, scheduler | **PARTIALLY IMPLEMENTED** |
| Automated retraining | Background pipeline rerun and artifact promotion exist | **PARTIALLY IMPLEMENTED** |
| Real MLflow tracking and model registry | JSON metadata tracker only; no MLflow dependency or server/model artifact registry | **PLANNED / NOT CURRENTLY IMPLEMENTED** |
| Tamper-free data handling | Raw files are read; derived files are written separately; sync uses staging, review, and backups | **IMPLEMENTED** as a pipeline convention, not cryptographic immutability |

## 2. System overview

### ELI10

The system receives public MPLADS records, cleans them, puts related records together, checks each work for several kinds of warning signs, and shows the findings in a web dashboard.

It does not automatically declare that a person committed fraud. It identifies records that deserve human verification.

### Technical architecture

The real executable flow is:

~~~text
Raw CSV/XLSX files or official MPLADS API
        |
        v
Source adapter / cleaner / staging validation
        |
        v
Processed T1, T3, T4, T5, T6, T7 Parquet files
        |
        v
Master analytical dataset
        |
        +--> work classifier and sector classifier
        +--> material benchmark context
        +--> financial historical comparison
        +--> duplicate and split-work detection
        +--> compliance rules
        +--> schedule/progress rules
        |
        v
Composite risk engine
        |
        v
Feature Parquet files and JSON registry/status files
        |
        v
FastAPI endpoints
        |
        v
React dashboard
~~~

### Main implementation map

| Layer | Main files | Responsibility |
|---|---|---|
| Deployment entry points | api/index.py, render.yaml, vercel.json | FastAPI/Mangum serverless entry and Render/Vercel configuration |
| Pipeline coordinator | src/run_pipeline.py | Orders preprocessing, master creation, risk modules, and optional sync bookkeeping |
| Cleaning | src/preprocessing/cleaner.py | Reads source tables, normalizes amounts/text/dates/IDs, writes processed Parquet |
| Master data | src/data/master_builder.py | Joins recommendations, sanctions, completions, expenditure, classifications, and derived fields |
| Work classification | src/modules/work_classifier.py | Phrase rules plus optional TF-IDF/LogisticRegression uncertainty classification |
| Sector classification | src/modules/sector_classifier.py | Sector/subcategory rules plus optional TF-IDF/LinearSVC and quantity extraction |
| Material context | src/modules/material_context.py | Material keyword, quantity, and reference-price context |
| Financial risk | src/modules/financial_anomaly.py | Tiered historical cost/unit comparison and out-of-range ranking |
| Benchmark tab | src/data/build_financial_benchmarks.py | Constituency/state/all-India completed-work benchmark rows |
| Duplicate risk | src/modules/duplicate_detection.py | Pair candidates, evidence supports, split indicators, and connected clusters |
| Compliance | src/modules/compliance_engine.py | Work-level and constituency-level guideline checks |
| Schedule risk | src/modules/delay_risk.py | Duration, expected progress, expenditure-progress proxy, overdue and delay scoring |
| Composite risk | src/risk/composite_risk_engine.py | Weighted score, gates, impact score, final level, action narrative |
| Official sync | src/data/sync/source_adapter.py, delta_engine.py, sync_runner.py | API fetch, normalization, diff, preview, commit, snapshots, scheduler |
| Background analysis | src/data/sync/training_manager.py | Isolated pipeline rerun, validation, drift summary, backup/promotion |
| Model metadata | src/utils/mlflow_tracker.py | JSON run/version metadata; not the MLflow package |
| Backend | src/backend/app.py | FastAPI routes, lazy Parquet reads, filtering, aggregates, JSON conversion |
| Frontend | frontend/src/App.tsx, frontend/src/pages, frontend/src/services/api.ts | Navigation, API calls, tables, charts, details, filters, sync controls |

## 3. Current data and storage inventory

### ELI10

The original source records are kept in a raw-data area. The system makes cleaned copies and analysis results in other folders. The analytical files can be rebuilt from the sources; the raw files are not edited by the analytics modules.

### Source tables

| Table | Meaning | Current raw file observed |
|---|---|---|
| T1 | Allocated limit for Hon'ble MPs | data/raw/Allocated Limit for Honble MPs.xlsx |
| T3 | Works recommended | data/raw/Works Recommended.csv |
| T4 | Works sanctioned | data/raw/Works Sanctioned.csv |
| T5 | Works completed | data/raw/Works Completed.csv |
| T6 | Expenditure on completed and ongoing works | data/raw/Expenditure on Completed and On-going Works as on Date.csv |
| T7 | Amount consented for calamity | data/raw/Amount consented for Calamity.xlsx |

### Processed and derived storage

| Location | Contents |
|---|---|
| data/processed | Cleaned T1/T3/T4/T5/T6/T7 Parquet files |
| data/features | Master data, risk outputs, duplicate pairs/clusters, benchmarks, classification outputs |
| data/reference | Sector-cost and material-price reference CSVs |
| data/validation | Work-classification validation sample/template |
| data/mlflow_model_registry.json | JSON metadata registry produced by the local tracker |
| data/sync_* | Current local sync status/history/audit state where present |
| data/snapshots | Sync snapshots when generated; ignored by Git in the current .gitignore |
| data/training | Isolated training/status/artifact cache; ignored by Git |

### Audit snapshot of currently generated analytical artifacts

The following is a point-in-time snapshot of the files present during this audit. It is not a permanent promise: a later pipeline run can change the counts.

| Artifact | Rows observed |
|---|---:|
| master_project_risk_scores.parquet | 79,827 |
| financial_anomalies.parquet | 79,827 |
| schedule_risk_analysis.parquet | 79,827 |
| compliance_risk_analysis.parquet | 79,827 |
| duplicate_work_candidates.parquet | 42,451 pairs |
| duplicate_work_clusters.parquet | 2,146 clusters |
| work_duplicate_scores.parquet | 10,038 work rows |
| financial_peer_benchmarks.parquet | 5,286 benchmark rows |
| constituency_compliance_analysis.parquet | 1,344 constituency-period rows |

Observed current master coverage was 37 states and 537 constituencies. Current overall risk levels in the generated master were approximately:

- CRITICAL: 56,327
- LOW: 20,200
- HIGH: 2,375
- MEDIUM: 925

These counts describe the generated snapshot, not a fixed algorithmic threshold for every future dataset.

### Raw-data integrity conclusion

The audited analytical modules write to data/processed and data/features; they do not rewrite the CSV/XLSX files under data/raw. The sync workflow also fetches into staging and only promotes after a diff/commit step. That supports the claim that the current analytical pipeline does not intentionally tamper with the supplied raw records.

This is not the same as cryptographic immutability. There is no hash-chain ledger, digital signature, database audit log, or read-only filesystem enforcement in the repository. A production deployment would need those controls if “no tampering” must be a formal audit guarantee.

### Storage architecture in one view

~~~text
data/raw
  original CSV/XLSX source records
      |
      v
data/processed
  cleaned T1/T3/T4/T5/T6/T7 Parquet
      |
      v
data/features
  master analytical data, risk outputs, benchmarks, duplicate artifacts
      |
      +--> data/validation
      +--> data/mlflow_model_registry.json
      +--> data/snapshots and data/training when sync is used
~~~

Parquet is the analytical storage format. There is no relational database schema, ORM, migration system, or remote feature store in the current codebase.

## 4. Preprocessing and master dataset

### ELI10

The system first gives every work a stable name, turns money into numbers, removes messy spaces, and connects the sanctioned work to any recommendation, completion, and payment information that has the same work ID.

### Technical behavior

Implementation: src/preprocessing/cleaner.py and src/data/master_builder.py.

#### Work IDs

extract_work_id first searches for a pattern like:

~~~text
WS/<alphanumeric-or-hyphen>/<YYYY-YYYY>/<number>
~~~

If that is unavailable, it accepts a shorter WS/.../<number> form. If no usable ID exists, it creates a deterministic fallback in the form WS/<prefix>/<six-digit-row-index>.

This makes joins possible, but a generated fallback ID is not evidence that the source system supplied a genuine work ID. Such rows should be treated as lower-confidence joins.

#### Amounts and text

- Currency cleaning removes the rupee symbol and commas and converts the result to numeric.
- Invalid or non-numeric amounts become missing values.
- Text is stripped and missing text becomes an empty string.
- State, constituency, and MP fields are normalized to uppercase in the relevant processed tables.

#### Master join

The sanctioned T4 table is the base. T6 expenditure rows are grouped by work ID and contribute:

- total expenditure;
- average payment;
- maximum payment;
- payment count;
- first payment date;
- last payment date.

T5 completion records are de-duplicated by work ID and contribute completion date, completed disbursed amount, and an evidence-image flag. T3 recommendation records contribute the recommended description. Classification and derived risk inputs are then added.

Important master calculations:

~~~text
effective_expenditure =
    total_expenditure if it is available
    otherwise completed_disbursed_amount

cost_overrun_pct =
    100 × (effective_expenditure - sanction_amount) / sanction_amount
    when both amounts are positive

sanction_to_completion_days =
    completion_date - sanction_date
~~~

The master is analytical data. It should not be interpreted as a replacement for original sanction orders, payment vouchers, completion certificates, or physical inspection.

### Current ingestion gap

The current raw directory contains T1 and T7 as XLSX files, while cleaner.py looks for the CSV names Allocated Limit for Honble MPs.csv and Amount consented for Calamity.csv. Existing processed T1/T7 Parquet files are available, but a fresh clean run against only the current raw directory can skip those two tables.

Status: **PARTIALLY IMPLEMENTED.**

Recommended fix: make the cleaner read both CSV and XLSX through an explicit table manifest, and fail loudly when a required table is missing instead of silently continuing with an older processed artifact.

## 5. Model and rules inventory

### ELI10

Different questions use different tools:

- work classification reads words in a description;
- sector classification maps a work to a sector and sub-sector;
- financial analysis compares money with completed history;
- duplicate detection compares descriptions and supporting clues;
- compliance checks rules;
- schedule analysis checks time and reported expenditure progress;
- the composite engine combines the warning scores.

### Technical inventory

| Component | Actual method | Output | Status |
|---|---|---|---|
| Work classifier | Phrase rules; optional TF-IDF word 1–2 grams plus LogisticRegression for uncertain rows | category, confidence, source, matched keywords, domain/subcategory | **IMPLEMENTED** |
| Sector classifier | Phrase rules; optional TF-IDF word 1–2 grams plus LinearSVC; quantity regex | sector, subcategory, quantity, confidence, reason | **IMPLEMENTED** |
| Material context | Rule-based material/work-type/quantity extraction and reference-price lookup | benchmark context, reference cost when calculable, status | **IMPLEMENTED**, not a composite risk component |
| Financial engine | Historical min/max/median comparisons by fallback tiers; percentile rank among flagged rows | cost/unit comparison, outlier flag, risk rank, explanation | **IMPLEMENTED**, statistical not Isolation Forest |
| Duplicate detector | Normalized text, token/Jaccard similarity, optional TF-IDF candidate generation, evidence supports, graph components | candidate pairs, risk levels, clusters, split indicators | **IMPLEMENTED**, candidate review |
| Compliance engine | Explicit guideline indicators and allocation/cap checks | rule findings, score, level, review status | **IMPLEMENTED**, evidence-limited |
| Schedule engine | Historical median duration, date arithmetic, progress-gap rules | progress, delay, score, level | **IMPLEMENTED**, hard-coded reference date |
| Composite engine | Weighted component scores plus compliance/financial gates | overall score, level, priority reason, action narrative | **IMPLEMENTED** |
| Isolation Forest | No active estimator import/fit/predict in financial execution path | Registry metadata only | **PLANNED / NOT CURRENTLY IMPLEMENTED** |
| Real MLflow | No mlflow package dependency or tracking server | JSON registry file | **PLANNED / NOT CURRENTLY IMPLEMENTED** |

## 6. Work and sector classification

### Work classification

Implementation: src/modules/work_classifier.py.

#### ELI10

The system looks for words such as “road”, “culvert”, “school”, “ambulance”, “drainage”, or “street light”. If it finds a strong phrase, it assigns the corresponding category. If the description is uncertain and enough rule-labelled examples exist, a small text model may classify it.

#### Technical behavior

1. Text is lowercased, punctuation is removed, and spaces are normalized.
2. Phrase rules are scored first.
3. Multi-word phrase matches receive confidence approximately 0.98; single-word matches approximately 0.92.
4. If there are at least 20 rule-labelled rows and at least two classes, the optional model is trained with TfidfVectorizer using word 1–2 grams, min_df=2, max_features=50000, followed by LogisticRegression(max_iter=300, class_weight=balanced).
5. The model is used for uncertain rows only when its maximum class probability is at least 0.75.
6. Otherwise, a non-generic source category can be retained; if not, the effective category becomes Other / Unclassified.
7. Confidence bands are HIGH at least 0.90, MEDIUM at least 0.75, LOW at least 0.60, and UNCERTAIN otherwise.

The result includes original category, AI category, effective category, confidence, source, matched keywords, model scores, domain, subcategory, uncertainty, and primary asset fields.

### Sector classification

Implementation: src/modules/sector_classifier.py.

#### ELI10

This is a more detailed map. “High mast light”, “tube well”, “concrete road”, “primary school”, or “community hall” can be assigned to a main sector and a more specific subcategory. The description may also contain a quantity such as 5 nos, 2 km, or 12 metres.

#### Technical behavior

- Explicit phrase mappings cover reference sectors, including high-mast and street-light unspecified variants.
- Multi-word and single-word rule confidence follows the same approximate 0.98/0.92 pattern.
- An optional LinearSVC(class_weight=balanced, random_state=42) uses word TF-IDF 1–2 grams with min_df=2 and max_features=60000.
- Unknown classifications use the model only when the decision margin is at least 0.25.
- Model confidence is capped at 0.89 and derived as min(0.89, 0.60 + margin / 4).
- Quantities are extracted with patterns for pieces, numbers, units, poles, lights, classrooms, rooms, kilometres/metres, and similar units.

Explicit unspecified labels such as High Mast Light System (Unspecified) are mapped to the electricity/public-utility family when the sector rule recognizes them. That sector mapping is useful for cost fallback, but it does not make the original work type specific enough for unit-price analysis.

### Material context

Implementation: src/modules/material_context.py.

The material layer recognizes cement, TMT, aggregate, brick, and configured material/work-type terms. It extracts explicit quantities and looks up state/material/year reference prices from the material benchmark CSV.

The context score is capped at 100 and is built from:

- 25 points for benchmark presence;
- 35 points for an explicit quantity;
- 20 points for a recognized work type;
- 20 points for state plus benchmark context.

Statuses include REFERENCE_COST_CALCULABLE, BENCHMARK_CONTEXT_ONLY, and NOT_AVAILABLE.

The material context is exposed through an API, but the current composite-risk formula does not directly add it to the four component scores. It is supporting evidence, not a fifth composite signal.

## 7. Financial anomaly detection

Implementation: src/modules/financial_anomaly.py. Benchmark table writer: src/data/build_financial_benchmarks.py.

### ELI10

For a new work, the system asks:

1. What does this work cost?
2. Which completed works are genuinely comparable?
3. What were the lowest cost, middle cost, and highest cost in that peer group?
4. Is the current proposed/sanctioned cost outside that observed range?
5. If the work has a clear type and a reliable quantity, is its cost per unit outside the exact same-type history?

When a description says only “High Mast Light System (Unspecified)”, the system keeps that original label, creates the informative family High Mast Light System for cost peer grouping, and does not calculate unit price. The family is not treated as a precise physical specification.

### Current-cost choice

The financial engine uses sanction_amount as the current cost being tested.

Historical completed-work cost is:

~~~text
historical_cost =
    effective_expenditure when effective_expenditure > 0
    otherwise completed_disbursed_amount
~~~

This distinction matters. A dashboard label such as “disbursed amount” or “utilization” must not be confused with the financial comparison current sanction_amount.

### Category ambiguity and peer family

Ambiguous tokens are:

~~~text
unspecified, unclassified, unknown, other
~~~

peer_category removes an ambiguity marker in parentheses or at the end of a label:

~~~text
High Mast Light System (Unspecified)
        -> High Mast Light System
~~~

Generic labels such as Unclassified do not create a synthetic family. This prevents unrelated unknown works from being compared together.

The original effective category remains available in the output. The generated family is separately exposed as peer_category and peer_category_auto_generated.

### Exact cost-comparison hierarchy

The first tier with at least two eligible completed records is selected in this exact order:

| Priority | Scope | Level | Grouping keys |
|---:|---|---|---|
| 1 | Constituency | Effective category / peer family | state + constituency + main sector + peer family |
| 2 | Constituency | Subsector | state + constituency + main sector + subcategory |
| 3 | Constituency | Main sector | state + constituency + main sector |
| 4 | State | Effective category / peer family | state + main sector + peer family |
| 5 | State | Subsector | state + main sector + subcategory |
| 6 | State | Main sector | state + main sector |
| 7 | All India | Effective category / peer family | main sector + peer family |
| 8 | All India | Subsector | main sector + subcategory |
| 9 | All India | Main sector | main sector |

The selection is not “always use the constituency median”. It is “use the narrowest available valid completed-work group, then widen only when the narrower group has fewer than two valid records”.

For an unspecified work, the unit comparison is skipped, but the cost comparison can still use the informative peer family. If that family is unavailable, the code falls through to constituency subsector/main sector, then state, then all India.

### Historical statistics

For each selected peer group, the code calculates:

~~~text
count = number of positive completed costs
minimum = smallest positive completed cost
median = middle completed cost
maximum = largest positive completed cost
~~~

There is no IQR, standard deviation, z-score, or percentile band used as the financial baseline in the current engine.

### Unit-price eligibility

Unit price is used only when all of the following are true:

- quantity is numeric;
- quantity is greater than 0;
- quantity is less than 1,000,000;
- a normalized quantity unit is present;
- the description does not look like a contact/phone/mobile/telephone string;
- the original effective work category is specific, meaning it contains none of the ambiguous tokens.

The current unit price is:

~~~text
current_unit_price = sanction_amount / detected_quantity
~~~

Historical unit price is:

~~~text
historical_unit_price = historical_completed_cost / detected_quantity
~~~

Historical unit comparisons use only the exact-category tier and the same normalized unit. Unit values are never generalized to a subsector or main sector. This prevents ₹ per item from being compared to ₹ per metre or a broad category from being treated as a precise specification.

For an unspecified category, the output uses:

~~~text
unit_comparison_status = NOT_APPLICABLE_AMBIGUOUS_WORK_TYPE
unit_price_comparison_eligible = False
unit_price_skip_reason =
  work type is unspecified or too broad for a like-for-like unit-price comparison
~~~

### Cost status

If current cost or the selected history is unavailable:

~~~text
INSUFFICIENT_HISTORY
~~~

Otherwise:

~~~text
if current_cost > historical_cost_max:
    ABOVE_HISTORICAL_RANGE
elif current_cost < historical_cost_min:
    BELOW_HISTORICAL_RANGE
else:
    WITHIN_HISTORICAL_RANGE
~~~

The same range logic is applied to eligible unit prices.

### Financial outlier and financial risk score

is_financial_outlier is true when either cost or eligible unit price is above or below its historical range.

Only flagged rows are percentile-ranked:

~~~text
financial_risk_rank =
    percentile rank of the row among financial-outlier rows × 100
~~~

The current financial risk level is:

~~~text
rank >= 75:
    HIGH
rank >= 50:
    MEDIUM
otherwise:
    LOW
~~~

Rows that are not outliers are LOW. This is a relative rank among flagged records, not a rupee threshold and not an Isolation Forest score.

Confidence is HIGH when the selected cost peer group has at least five records, MEDIUM when it has at least two, and LOW when it has fewer than two.

### Financial deviation

When a comparison is available, the engine calculates relative deviation from the historical median for cost and eligible unit price. The reported financial deviation is the largest absolute available relative deviation, and it is primarily meaningful for outlier rows.

In conceptual form:

~~~text
cost_deviation = abs(current_cost - median_cost) / median_cost
unit_deviation = abs(current_unit_price - median_unit_price) / median_unit_price
financial_deviation = max(available deviations)
~~~

The exact output fields and evidence text are created in run_financial_anomaly_detection.

### Financial benchmark tab

build_financial_benchmarks.py writes data/features/financial_peer_benchmarks.parquet.

It materializes rows for:

- constituency × effective category/peer family;
- constituency × subcategory;
- constituency × main sector;
- state versions of the same;
- all-India versions of the same.

Each row contains scope, level, state, constituency, main sector, subcategory, effective/peer category, whether the peer family was auto-generated, completed count, current-work count, outlier count, cost low/median/high/count, and unit statistics where exact-category unit comparison is valid.

Groups with fewer than two completed costs are not emitted as usable benchmarks. This is why a benchmark page can legitimately show no row for a sparse filter.

### Observed example: unspecified high-mast category

For a record displayed as:

~~~text
Effective category: High Mast Light System (Unspecified)
Domain/subcategory: Public Utilities / High Mast Light System (Unspecified)
Peer group: High Mast Light System
~~~

the code should be read as follows:

1. High Mast Light System (Unspecified) remains the original/effective label.
2. High Mast Light System is the generated peer family.
3. Cost statistics may use the family, then the constituency subcategory/main sector, then state/all-India fallbacks.
4. Unit-price comparison is disabled because “unspecified” does not prove the pole height, number of lights, wattage, foundation, or other physical specification.
5. The displayed range must be identified by comparison_scope, comparison_level, comparison_peer_category, and comparison_benchmark_id, not inferred from the label alone.

One observed generated sample had a historical cost median around ₹2,488,890. The exact current cost, state, and constituency are record-specific; the backend must supply those fields from the work-detail response.

### Financial limitations

- The engine compares against observed completed costs, not a government-approved schedule of rates unless such a rate is independently supplied to the reference layer.
- A high cost is a review signal, not proof of fraud.
- A missing or poor description weakens peer assignment.
- A range with two observations is mathematically available but statistically weak.
- The current cost uses sanction amount, while the historical baseline uses completed expenditure/disbursed amount; these are not perfectly identical economic quantities.
- No inflation adjustment, work-year normalization, terrain factor, material escalation, or engineering scope normalization is implemented in this module.

## 8. Duplicate, duplicate-pair, and possible split-work detection

Implementation: src/modules/duplicate_detection.py.

### ELI10

The system compares descriptions of works. It removes unhelpful words, keeps meaningful words and quantities, and looks for supporting clues such as nearby IDs, similar dates, same location, and related amounts. It then groups connected candidate pairs into clusters.

The output says “candidate”, “possible split work”, or “review”. It does not declare fraud.

### Comparison corpus

The detector combines T3 recommended and T4 sanctioned records. It normalizes IDs by removing recommendation/sanction suffixes and prefers a useful description between the two source tables.

Generic boilerplate is removed from meaningful tokens. Technical tokens such as MSME-A, Road-5, and Phase-II are preserved.

### Quantity signatures

The detector extracts quantities with units and normalizes common units such as km, m, cm, ft, area, weight, and volume. It also understands number words. Years from 1900 through 2100 are ignored as quantities.

Quantity relations are classified as exact, approximately related (within about 10%), different units, or missing.

### Candidate generation

Works are blocked by state, constituency, main sector, and effective work category. For smaller groups, token and exact-description blocks are used. When available, TF-IDF cosine similarity can generate additional candidates for groups up to the configured size. Large groups rely more heavily on exact meaningful descriptions to control runtime. Candidate pairs are capped during generation and the final stored pair artifact is capped at 50,000 highest-scoring pairs.

### Similarity calculation

The final meaningful-text similarity is Jaccard similarity:

~~~text
similarity =
    number of shared meaningful tokens
    /
    number of tokens in the union of both descriptions
~~~

An exact meaningful description may receive a minimum similarity of approximately 0.72 when the optional sklearn path is available.

### Evidence supports

A pair must pass the similarity threshold of approximately 0.72 and have at least one supporting signal. Supports include:

- related quantity;
- close work IDs, within approximately 10 or 50 depending on the indicator;
- same or close recommendation dates, including 0 or up to 30 days;
- same or close sanction dates, including 0 or up to 30 days;
- closely related cost ratio at least 0.85;
- mathematically divided cost ratio in the approximately 0.30–0.55 band;
- at least two shared meaningful tokens;
- asset/location wording support.

Technical conflicts can reject a pair.

### Pair score and levels

The pair score is capped at 100 and is built conceptually as:

~~~text
pair_score =
    similarity × 42
    + min(number_of_supports, 4) × 10
    + 10 if meaningful descriptions are exact
    + 8 if quantities are an exact match
~~~

Levels:

- SPLIT-WORK when the possible-split conditions are met;
- otherwise HIGH at score at least 75;
- otherwise MEDIUM.

Possible split conditions combine very high/exact similarity, at least two supports, and a close ID or same recommendation/sanction date.

### Cluster formation

Candidate pairs become an undirected graph. Connected components become work clusters. Cluster risk is derived from the highest pair score and split evidence:

- HIGH when a split candidate is present and the cluster is large enough or the score is high;
- HIGH for very high score or multiple split pairs;
- MEDIUM at score at least 60;
- otherwise LOW.

The code also checks cost splitting:

- at least two smaller amounts sum to within approximately 15% of the largest; or
- amounts are within approximately 10% of their mean.

Separate IDs are included as an indicator.

### Limitations

There is no sentence-transformer embedding model, no geospatial distance calculation, no graph database, and no physical site verification in the current detector. Similar wording can be legitimate, especially for standard public works. Human review remains necessary.

### Duplicate versus related work versus group/split candidate

These labels must not be treated as synonyms:

- **Exact or near duplicate:** descriptions and meaningful tokens are highly similar, and one or more supporting clues also agree.
- **Related works:** works share a sector, asset family, or wording but may have different locations, quantities, dates, or scopes. Related does not mean duplicate.
- **Group or possible split candidate:** a cluster contains multiple strongly related works and may also show repeated text, close IDs/dates, divided cost ratios, or cost-sum evidence. This is a review hypothesis, not proof that the works were improperly split.

The code stores evidence such as similarity, quantity relation, date gaps, ID gaps, cost ratio, shared tokens, split indicators, and cluster membership so an auditor can inspect why a pair was surfaced.

## 9. Compliance engine

Implementation: src/modules/compliance_engine.py. The declared source is mplads_2023_guidelines_including_changes.pdf.

### ELI10

The compliance engine is a checklist. It looks for timing, minimum amount, completion, stopped-work, movable-asset, prohibited-description, and constituency-allocation warning signs. A warning is a prompt to inspect records, not a final legal conclusion.

### Work-level rules

| Rule ID | Guideline reference/scope | Trigger | Points |
|---|---|---|---:|
| C_SANCTION_TIMING | Para 3.2.4 | Sanction more than 45 days after recommendation; missing sanction after the deadline can be review-needed | 85 |
| C_MINIMUM_SANCTION | Para 3.2.9 | Positive sanction amount below ₹250,000 | 35 |
| C_COMPLETION_PERIOD_REVIEW | Para 3.2.12 | More than 365 days from sanction to completion/current review date | 35 |
| C_CALAMITY_COMPLETION_REVIEW | Para 8.12.1 | Calamity-related work beyond 548 days | 45 |
| C_STOPPED_WORK_REVIEW | Para 3.2.19 | Stopped, suspended, abandoned, or dropped status text | 35 |
| C_MOVABLE_ASSET_REVIEW | Paras 5.1.2–5.1.3 | Purchase/procure/supply/buying language plus asset terms such as vehicle, furniture, computer, equipment, ambulance, books, lab, or smart board | 25 |
| Prohibited-description rules | Guideline scope matrix in code | Operation/maintenance, residential, commercial/private, naming, grant/loan, relief funds, land acquisition, reimbursement, individual/family, CSR pooling, religious, swagat dwar, unauthorized colony, recurring expenditure indicators | 85 each |

The work score is:

~~~text
work_compliance_score = min(100, sum(points for triggered indicators))
~~~

Risk level:

- LOW below 35;
- MEDIUM at least 35;
- HIGH at least 65;
- CRITICAL at least 85.

The engine retrieves recommendation dates from T3 when needed. For missing sanction/completion dates it may use the current execution date for a timing review, which means the result is time-sensitive.

The output includes primary finding, supporting details, triggered rules, guideline references, scope, review status, and flags. The code marks REVIEW_REQUIRED and is_work_level_compliance_risk at score at least 20, which is lower than the MEDIUM risk-level threshold of 35. This is intentional in the code but should be explained in the UI to avoid confusing “needs review” with “medium risk”.

### Constituency-level rules

The aggregation groups by state, constituency, MP, and derived financial year. It checks:

- SC allocation at least 15%;
- ST allocation at least 7.5%;
- repair/renovation cap at most 10%;
- society/trust cap at most 10%;
- bar/library cap at most 0.1%.

Where available, T1 allocation is used as the official denominator. Otherwise, sanctioned amount is used as an observed proxy. The output explicitly marks partial evidence when the official denominator or beneficiary classification is not available.

The SC/ST logic is aggregate. It does not attach a definitive SC/ST beneficiary label to every individual work.

### Compliance limitations

- The engine uses description/status/amount/date indicators, not legal document verification.
- It does not parse sanction letters, bills, vouchers, inspection reports, or PDF attachments in the compliance path.
- Keyword presence can generate false positives.
- A passed rule check is not proof that the work is compliant.

## 10. Schedule, delay, and progress risk

Implementation: src/modules/delay_risk.py.

### ELI10

The system estimates how long a work normally takes, checks how much time has passed, and compares expected timeline progress with money reported as spent. It is a warning system, not a physical construction measurement system.

### Technical calculations

The code currently uses the hard-coded audit date 2026-09-09 as ref_date. That is stale relative to this audit date and must be changed to a configurable run date or an explicit data-as-of date for production use.

For works without an estimated completion date, the default is:

~~~text
estimated_completion_date = sanction_date + 365 days
~~~

Historical completed duration is:

~~~text
completion_date - sanction_date
~~~

The median duration is calculated by effective work category. When unavailable, the fallback is 365 days. Planned duration is at least 30 days when a positive median exists, otherwise 365.

For ongoing work:

~~~text
elapsed_days = max(ref_date - sanction_date, 0)
~~~

When dates are missing, the code uses a fallback elapsed value of 180 days for its calculation path.

Expected timeline progress:

~~~text
expected_progress =
    clip(100 × elapsed_days / planned_duration, 0, 100)
~~~

Expenditure progress proxy:

~~~text
expenditure_progress =
    clip(100 × effective_expenditure / sanction_amount, 0, 100)
~~~

This is not physical completion. It assumes expenditure is a rough proxy.

Progress gap:

~~~text
progress_gap = max(expected_progress - expenditure_progress, 0)
~~~

Peer progress median is grouped by work category and state with a fallback of 25. Peer deviation is expenditure progress minus the peer median.

### Schedule score additions

The score is capped at 100:

- progress gap above 50: +55;
- gap above 30: +35;
- gap above 15: +20;
- ongoing overdue or completed delay above 180: +35;
- above 90: +25;
- above 30: +15;
- elapsed or delay above 365: +25;
- calamity terms with elapsed/delay above 240: +20;
- missing estimated completion: +10.

Levels are LOW below 35, MEDIUM at least 35, HIGH at least 65, and CRITICAL at least 85.

### Limitation

No sensor, inspection photo, GIS progress measurement, milestone completion, or physical quantity survey is used. A project that spends money early may look advanced; a project with delayed billing may look behind.

## 11. Composite risk scoring

Implementation: src/risk/composite_risk_engine.py.

### ELI10

The system gives each work four warning scores and combines them. Compliance is given the largest weight. Some very serious compliance or financial findings can raise the overall level even if the average is lower.

### Technical formula

Component scores are:

- compliance;
- financial;
- duplicate;
- schedule.

Weights:

~~~text
compliance = 0.42
financial  = 0.28
duplicate  = 0.15
schedule   = 0.15
~~~

Composite:

~~~text
composite =
    0.42 × compliance_risk_score
    + 0.28 × financial_risk_score
    + 0.15 × duplicate_risk_score
    + 0.15 × schedule_risk_score
~~~

The value is rounded to one decimal place.

Impact score:

~~~text
impact_score =
    composite × (max(sanction_amount - effective_expenditure, 0) / 100000 + 1)
~~~

Initial overall levels:

- CRITICAL at least 85;
- HIGH at least 65;
- MEDIUM at least 35;
- LOW otherwise.

Gates then apply:

- compliance at least 85 forces at least CRITICAL;
- compliance at least 65 forces at least HIGH;
- financial at least 85 forces at least HIGH;
- duplicate and schedule do not have an equivalent upward gate.

requires_audit_action is true at overall score at least 35.

### Interpretation

The composite is a prioritization score. It is not a probability of fraud, a legal finding, or a loss estimate. The explanation field joins component narratives and gives a priority reason, normally choosing critical/high compliance first, then high financial, duplicate, or schedule evidence.

## 12. Backend/API inventory

Implementation: src/backend/app.py.

### General behavior

- FastAPI application version is 2.0.0.
- Parquet data is loaded through in-memory/lazy caches.
- Master cache invalidates when the master file modification time changes.
- Benchmark cache reloads when the benchmark file changes.
- JSON conversion recursively handles NumPy/Pandas values, arrays, and missing values.
- _analytics_metadata compares data and analysis versions and reports stale analysis when they differ.

### Endpoint table

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | Basic service/data health |
| GET | /api/overview | National overview, totals, states, categories, risk counts |
| GET | /api/analytics/overview | Overview alias |
| GET | /api/analytics/states | State-level analytics |
| GET | /api/analytics/states/{state}/highest-risk | Highest-priority works for a state |
| GET | /api/analytics/original-records | Paginated original/risk records with filters |
| GET | /api/state-risk-summary | Selected-state component averages and counts |
| GET | /api/mp-intelligence | MP/constituency work and fund intelligence |
| GET | /api/schedule-risk | Schedule-risk queue and summary |
| GET | /api/sync/status | Current sync state |
| GET | /api/sync/health | Source request telemetry |
| POST | /api/sync/start | Queue a background synchronization |
| GET | /api/sync/history | Sync history |
| POST | /api/sync/preview-diff | Fetch and preview record-level changes |
| POST | /api/sync/commit-diff | Commit a reviewed preview token |
| POST | /api/sync/run-now | Queue immediate sync |
| GET | /api/sync/training-status | Background analysis/training status |
| POST | /api/sync/training/start | Start analysis refresh when a valid snapshot exists |
| GET | /api/model/status | JSON model/registry metadata |
| GET | /api/model/experiments | Recorded registry runs |
| GET | /api/analytics/material-context | Material evidence for a work |
| GET | /api/analytics/classification | Work classification evidence |
| GET | /api/analytics/sector-cost | Sector/peer/cost context for a work |
| GET | /api/financial/benchmarks | Filtered benchmark rows by scope/state/constituency/sector/subsector |
| GET | /api/sectors | Sector matrix/reference values |
| GET | /api/compliance/rules | Public compliance scope matrix |
| GET | /api/compliance/constituency | Constituency compliance aggregates |
| GET | /api/compliance/summary | Work/constituency compliance summary |
| GET | /api/risk-monitor | Main risk queue with dimensions, severity, search, and sort |
| GET | /api/work-detail | Work detail by query parameter |
| GET | /api/work-detail/{work_id:path} | Work detail by path |
| GET | /api/duplicate-candidates | Candidate duplicate pairs |
| GET | /api/duplicate-clusters | Duplicate/split clusters |
| GET | /api/filters | Available state, constituency, category, and risk filter values |

### API calculation notes

/api/overview sums allocation from T1, sanctioned amount and effective expenditure from master data, calamity consent from T7, and completed counts. Review cases are overall MEDIUM/HIGH/CRITICAL. State “high risk” counts include all of those three levels, so the label should be read as “requires review”, not only the literal HIGH category.

/api/state-risk-summary computes component averages and counts at least 35. /api/mp-intelligence calculates utilization approximately as:

~~~text
effective_expenditure / (sanctioned_amount + 0.00001) × 100
~~~

The small denominator addition prevents division by zero; it is not a policy adjustment.

/api/risk-monitor uses is_financial_outlier as the authoritative financial-only filter. Other dimensions use their risk scores. Sort directions and field names are implemented in the route.

### State-wise risk semantics

State analytics are built from work-level rows filtered to a state. The backend calculates work count, sanctioned/effective expenditure totals, average overall score, a high/review count, risk percentage, and separate component counts for financial, compliance, duplicate, and schedule scores at least 35.

The highest-risk endpoint selects a priority component by taking the maximum among the four component scores and sorts by that priority and then composite score. “High risk works” in the state aggregates includes MEDIUM, HIGH, and CRITICAL overall levels. The dashboard should therefore describe that card as high-priority or review-level volume when precision matters.

## 12.1. Error handling and edge cases

The system generally chooses a safe review state instead of fabricating a result:

- a missing Parquet artifact produces a backend health/error response or an empty safe fallback depending on the endpoint;
- a missing current amount or peer history produces an insufficient-history financial result;
- an unspecified work type disables unit-price comparison;
- a missing estimated completion date uses the configured one-year schedule fallback;
- missing dates and missing text are normalized before most calculations;
- an invalid or unavailable source sync does not promote staging data;
- a failed training refresh attempts to restore the previous feature files;
- JSON serialization converts NaN, NumPy scalars, arrays, and timestamps into API-safe values;
- pagination is applied in backend endpoints rather than requiring the browser to load every row.

The main operational caveat is that safe GET fallbacks can make an unavailable service look like an empty result in the frontend. Production deployments should display source/error state separately from “zero records”.

## 13. Frontend/dashboard

Implementation: frontend/src/App.tsx, frontend/src/services/api.ts, and files under frontend/src.

### ELI10

The website is a visual window into the API. Pages request filtered data, show cards/charts/tables, and link to a work detail page. The browser does not independently recalculate the official risk scores; the backend feature outputs are the main source.

### Navigation

The current application mounts:

- Overview;
- MP Works & Fund Intelligence;
- Risk Intelligence Monitor;
- State Risk & Records;
- Duplicate Inspector;
- Financial Anomaly Analytics;
- Compliance Evidence Gaps;
- Schedule & Progress Risk;
- Data Sync & Status;
- MLflow Model Monitoring.

The financial benchmark page is reached from the financial analytics page rather than being a dedicated sidebar item.

### Important routing nuance

App.tsx currently renders RiskMonitorPage with initialDimension=compliance for the compliance tab and initialDimension=schedule for the schedule tab. Standalone ComplianceMonitorPage.tsx and ScheduleProgressPage.tsx files exist but are not the mounted page components in the current router.

Status: **PARTIALLY IMPLEMENTED** as a page-architecture cleanup item, although the main dashboard dimensions are available.

### Frontend data flow

frontend/src/services/api.ts uses VITE_API_BASE_URL when set and defaults to /api. It provides safe fetch fallbacks for many GET endpoints and throws on failed POST actions.

The pages call the backend for:

- overview and state aggregates;
- risk queue and filters;
- work details and evidence;
- duplicate candidates/clusters;
- financial benchmarks;
- compliance rules/summary;
- sync status/history/health;
- training status;
- model metadata.

Persistent filter state is implemented through frontend/src/hooks and is used by the major pages so that filters survive tab changes. The UI changes do not alter the source data.

### Work-detail presentation

WorkInfoCards.tsx displays:

- state and constituency when present;
- effective category;
- domain/main sector/subcategory;
- peer group;
- auto-generated peer-family note;
- financial comparison scope/level/range;
- unit-price eligibility and skip reason.

RiskEvidencePanel.tsx displays component evidence and review language. The wording is intentionally a review recommendation rather than a fraud verdict.

### Light/dark mode

frontend/src/index.css contains the current light/dark and contrast overrides. The code includes fixes for dark-blue surfaces, readable text, hover states, and wrapped sync URLs. These are presentation improvements; they do not change risk calculations.

### Build and deployment

- Frontend build: npm run build in frontend.
- Backend local command: uvicorn src.backend.app:app --host 0.0.0.0 --port 8000.
- Render: Python service using requirements.txt and Uvicorn.
- Vercel: builds frontend and publishes frontend/dist.
- api/index.py: wraps FastAPI with Mangum(app, lifespan=off).

The dependency list includes FastAPI, Uvicorn, Pandas, NumPy, PyArrow, scikit-learn, python-multipart, and Mangum. There is no mlflow dependency.

## 14. Official data synchronization

Implementation: src/data/sync/sync_config.py, source_adapter.py, delta_engine.py, snapshot_manager.py, and sync_runner.py.

### ELI10

The sync feature asks the official source for fresh tables, places them in a temporary area, compares them with the current data, shows what is new/changed/removed, and promotes the new version only after commit. If the update fails, the previous validated analysis is retained.

### Source and configuration

Default source:

~~~text
https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData
~~~

Environment configuration includes:

- MPLADS_DATA_SOURCE_URL;
- MPLADS_SYNC_INTERVAL_HOURS, default 360 hours;
- optional MPLADS_SYNC_DAILY_TIME;
- MPLADS_SYNC_TIMEOUT_SECONDS, default 300;
- MPLADS_VERIFY_SSL, default false;
- optional MPLADS_PROXY_URL;
- MPLADS_SYNC_RETRIES, default 3;
- MPLADS_AUTOMATION_ENABLED.

The default interval is about 15 days, not daily.

### API adapter

The adapter posts a payload shaped like:

~~~text
{"combo": "0,0,0,2", "key": "<tile key>"}
~~~

It fetches six monitored tables concurrently, retries failures with capped exponential delays, unwraps nested JSON/data/result/response/payload/records structures, infers table shapes, normalizes columns, validates required column groups, and writes staging Parquet.

Request telemetry is written without credentials to sync_audit.jsonl.

### Delta and promotion

The delta engine:

- aliases API column names;
- normalizes work IDs and recommendation detail IDs;
- builds a composite key work_id::detail_id;
- falls back to a row/index key only when necessary;
- formats dates and numeric values consistently;
- creates stable row hashes;
- classifies new, modified, removed, and unchanged records.

Preview does not promote data. Commit uses a preview token, commits staging atomically through a temporary file and os.replace, creates a snapshot, records history, starts analysis refresh, and removes staging.

### Scheduler

FastAPI startup starts a daemon scheduler thread unless disabled. The scheduler is process-local and does not have a distributed lock. In a multi-instance deployment, more than one process could schedule work unless the deployment adds an external scheduler/lock.

/api/sync/preview-diff performs a blocking preview in the request handler, even though start/run-now are background queued. Large official tables may therefore occupy a web worker.

### Sync status

The sync UI can show:

- operational status;
- current snapshot;
- new/modified/removed counts;
- next automatic sync;
- official source URL;
- request count/error rate/response time;
- training progress;
- record-level change preview.

## 15. Automatic analysis refresh and “retraining”

Implementation: src/data/sync/training_manager.py.

### What actually happens

When a valid sync snapshot is committed, the manager:

1. validates required artifacts and finite risk columns;
2. copies processed inputs into an isolated training workspace;
3. sets PROCESSED_DIR and FEATURES_DIR;
4. calls run_entire_pipeline with preprocessing disabled;
5. writes progress messages;
6. computes simple count/mean deltas for selected score columns;
7. backs up current feature files;
8. promotes the isolated generated artifacts atomically;
9. copies artifacts into a run directory under data/training/mlruns;
10. records a run using the local JSON tracker;
11. restores feature backups when an exception occurs.

### What does not happen

The manager does not currently:

- fit an Isolation Forest;
- train and serialize a model object;
- compare predictive quality with the previous model;
- evaluate labelled precision/recall/F1;
- perform cross-validation;
- approve a challenger model against a champion;
- use a model registry server;
- roll back to a prior model version based on quality;
- run statistical distribution-drift tests.

The progress label FINANCIAL_ISOLATION_FOREST is therefore a stale/misleading label for the current financial implementation.

Status: **PARTIALLY IMPLEMENTED.**

## 16. MLflow and model monitoring truth

Implementation: src/utils/mlflow_tracker.py, data/mlflow_model_registry.json, /api/model/*, and ModelMonitoringPage.tsx.

### ELI10

The website shows a notebook-like record of analysis runs. It is useful as a status screen, but it is not currently a real MLflow server managing a live model.

### Technical facts

The local tracker:

- writes JSON to data/mlflow_model_registry.json;
- generates a run ID;
- increments a version from the number of stored runs;
- labels the stage as Production;
- records an algorithm string, dataset row count, feature-set version, parameters, metrics, and artifact path.

The current registry metadata says IsolationForest, n_estimators=100, contamination=0.05, random_state=42, and max_samples=auto. The current active financial module does not execute those settings.

The generated registry metadata is also stale relative to the current master snapshot: it contains an older production version/dataset count while the current master contains 79,827 rows. The UI should not present this metadata as proof of a live model.

Model-monitoring limitations:

- no real mlruns tracking backend;
- no serialized estimator loaded for inference;
- no model artifact download/load path;
- no model-quality metric computed from truth labels;
- no champion/challenger comparison;
- no automatic approval gate;
- no statistical drift test;
- no alert policy for model degradation.

Status: **PLANNED / NOT CURRENTLY IMPLEMENTED** for real MLflow/model monitoring. The metadata/status screen is **IMPLEMENTED**.

## 17. Complete calculation inventory

| Area | Calculation | Main implementation |
|---|---|---|
| ID quality | Regex extraction and deterministic fallback work ID | cleaner.py |
| Amount cleaning | Remove rupee/comma; numeric conversion | cleaner.py |
| Payment aggregation | Sum/mean/max/count/first/last payment date by work | master_builder.py |
| Effective expenditure | Total expenditure or completed disbursed fallback | master_builder.py |
| Cost overrun | (effective expenditure - sanction) / sanction × 100 | master_builder.py |
| Work classification | Phrase confidence and optional LogisticRegression probability | work_classifier.py |
| Sector classification | Phrase confidence and optional LinearSVC margin | sector_classifier.py |
| Quantity extraction | Numeric/unit regex and high-mast/street-light patterns | sector_classifier.py |
| Material context | Benchmark/quantity/work-type/state context score, capped at 100 | material_context.py |
| Historical cost count | Positive completed records in selected group | financial_anomaly.py |
| Historical cost min/median/max | Descriptive statistics of positive completed cost | financial_anomaly.py |
| Current unit price | sanction_amount / quantity | financial_anomaly.py |
| Historical unit price | completed_cost / quantity | financial_anomaly.py |
| Financial status | Above/below/within historical range | financial_anomaly.py |
| Financial outlier | Cost or eligible unit status outside range | financial_anomaly.py |
| Financial risk rank | Percentile rank among outliers × 100 | financial_anomaly.py |
| Duplicate similarity | Meaningful-token Jaccard; optional TF-IDF candidate similarity | duplicate_detection.py |
| Quantity relation | Exact/approximately related/different units/missing | duplicate_detection.py |
| Pair score | Similarity plus capped supports/exactness/quantity bonuses | duplicate_detection.py |
| Cluster score | Highest pair/split evidence in connected component | duplicate_detection.py |
| Cost-split check | Smaller sums within 15% of largest or values within 10% of mean | duplicate_detection.py |
| Compliance work score | Sum of triggered guideline points, capped at 100 | compliance_engine.py |
| Compliance level | 35/65/85 thresholds | compliance_engine.py |
| SC/ST/cap percentages | Relevant amount divided by denominator × 100 | compliance_engine.py |
| Planned duration | Category median completed duration, fallback 365 days | delay_risk.py |
| Expected progress | Elapsed/planned × 100 clipped to 0–100 | delay_risk.py |
| Expenditure progress | Effective expenditure/sanction × 100 clipped to 0–100 | delay_risk.py |
| Progress gap | Maximum of expected minus expenditure progress and zero | delay_risk.py |
| Schedule score | Threshold-based additions, capped at 100 | delay_risk.py |
| Composite | Weighted compliance/financial/duplicate/schedule score | composite_risk_engine.py |
| Impact score | Composite × unspent-amount factor | composite_risk_engine.py |
| Final level | 35/65/85 plus compliance/financial gates | composite_risk_engine.py |
| Utilization | Effective expenditure / sanctioned amount with tiny zero guard | app.py |
| State aggregates | Counts, sums, means, high/review counts, component counts | app.py |
| Sync hash | Normalized row serialization hashed for diff detection | delta_engine.py |
| Drift summary | Current versus previous mean/count deltas for score columns | training_manager.py |

## 18. Complete condition and rule inventory

### Data and quality conditions

- missing numeric values become NaN;
- missing text becomes empty;
- missing/invalid dates become missing;
- a generated work ID is used when no usable source ID exists;
- a work cannot receive a valid historical comparison unless current cost and at least two eligible completed peer costs are available;
- unit comparison requires a specific category, positive bounded quantity, a unit, a non-contact description, and at least two exact-category records with the same normalized unit;
- generic category labels do not create an artificial peer family;
- duplicate pairs can be rejected by technical conflicts;
- non-finite risk columns invalidate a training artifact set.

### Financial conditions

- ambiguous category: skip unit price;
- exact category/peer family is tried before subcategory/main sector;
- constituency is tried before state and all India;
- fewer than two history rows: insufficient history;
- current cost above max: above range;
- current cost below min: below range;
- otherwise within range;
- outlier if cost or eligible unit is out of range.

### Duplicate conditions

- similarity threshold about 0.72;
- at least one supporting signal;
- exact/very-high similarity plus two supports and close ID/date can be a possible split;
- pair score 75 is high; 60 is a cluster threshold;
- stored pairs are capped at 50,000.

### Compliance conditions

- 45-day sanction timing;
- ₹250,000 minimum sanction review;
- 365-day completion review;
- 548-day calamity review;
- stopped/abandoned/suspended/dropped terms;
- movable-asset wording;
- prohibited-description indicators;
- SC/ST and category-cap aggregates.

### Schedule conditions

- default estimated completion is sanction plus 365 days;
- gap thresholds 15, 30, 50;
- overdue/delay thresholds 30, 90, 180;
- elapsed/delay threshold 365;
- calamity threshold 240;
- missing estimate adds 10.

### Composite conditions

- overall review action at score at least 35;
- compliance at least 85 forces critical;
- compliance at least 65 forces high;
- financial at least 85 forces high.

## 19. End-to-end worked examples

### Example A: unspecified high-mast work

#### ELI10

The system recognizes that the work is probably in the high-mast-light family, but it does not know the exact model/specification. It can compare the total cost with similar completed high-mast works, but it must not calculate a misleading price per unit.

#### Technical trace

1. sector_classifier.py maps the text to the electricity/public-utility sector and high-mast family.
2. financial_anomaly.py detects the ambiguity token unspecified.
3. peer_category derives High Mast Light System.
4. The tier selector tries constituency peer-family cost history, then constituency subcategory/main sector, then state and all India.
5. current_cost is sanction amount.
6. Historical cost is positive effective expenditure or completed disbursed amount.
7. Cost min/median/max are returned if at least two history rows exist.
8. Unit price is not calculated, and the output explicitly states why.
9. The benchmark endpoint can show the generated peer family and peer_category_auto_generated=true.

### Example B: specific quantity-bearing work

#### ELI10

If the description says a specific work type and says how many metres or pieces it contains, the system may compare its price per metre or piece with exactly the same type and unit.

#### Technical trace

For a specific category with quantity 100 metres:

~~~text
current_unit_price = sanction_amount / 100
~~~

The historical unit group must contain at least two positive completed records of the same effective category and normalized unit. A different sector or broad main-sector unit is not substituted.

### Example C: insufficient history

#### ELI10

If there are zero or one completed comparable works, the system says there is not enough evidence. It does not invent a median.

#### Technical trace

historical_cost_count < 2 leads to INSUFFICIENT_HISTORY; the record is not called a financial outlier only because the peer sample is empty.

## 20. Frontend to backend to feature trace

~~~text
Sidebar/tab
  -> App.tsx page selection
  -> page useEffect/useCallback
  -> frontend/src/services/api.ts
  -> FastAPI route in src/backend/app.py
  -> Parquet feature/master reader
  -> filter/aggregate/clean_record_for_json
  -> JSON response
  -> page cards/table/chart/detail panel
~~~

Examples:

- Financial detail:
  FinancialAnalyticsPage.tsx -> /api/risk-monitor -> master_project_risk_scores.parquet -> financial queue and evidence.

- Benchmark:
  FinancialBenchmarkPage.tsx -> /api/financial/benchmarks -> financial_peer_benchmarks.parquet -> scope/sector/category filters and low/median/high table.

- Work detail:
  ProjectDetailPage.tsx -> /api/work-detail -> master plus financial/compliance/schedule/duplicate context -> WorkInfoCards and RiskEvidencePanel.

- Sync:
  DataSyncPage.tsx -> /api/sync/status, /api/sync/health, /api/sync/history -> sync JSON state and background manager status.

## 21. File-level implementation map

~~~text
P:\SIH\mplads_updated-main
|
+-- api\index.py
|   +-- Mangum wrapper for serverless deployment
|
+-- data\
|   +-- raw\                         original CSV/XLSX inputs
|   +-- processed\                   cleaned table Parquet
|   +-- features\                    analysis outputs
|   +-- reference\                   sector/material reference CSVs
|   +-- validation\                  classifier review template
|   +-- mlflow_model_registry.json   JSON metadata, not real MLflow
|
+-- src\
|   +-- preprocessing\cleaner.py
|   +-- data\master_builder.py
|   +-- data\build_financial_benchmarks.py
|   +-- data\sync\
|   |   +-- source_adapter.py
|   |   +-- delta_engine.py
|   |   +-- snapshot_manager.py
|   |   +-- sync_runner.py
|   |   +-- training_manager.py
|   +-- modules\
|   |   +-- work_classifier.py
|   |   +-- sector_classifier.py
|   |   +-- material_context.py
|   |   +-- financial_anomaly.py
|   |   +-- duplicate_detection.py
|   |   +-- compliance_engine.py
|   |   +-- delay_risk.py
|   +-- risk\composite_risk_engine.py
|   +-- backend\app.py
|   +-- utils\mlflow_tracker.py
|   +-- run_pipeline.py
|
+-- frontend\
|   +-- src\App.tsx
|   +-- src\services\api.ts
|   +-- src\pages\
|   +-- src\components\
|   +-- src\hooks\
|   +-- src\index.css
|
+-- docs\
    +-- MPLADS_CODEBASE_AUDIT.md       this source-traceable audit
    +-- MPLADS_PLATFORM_GUIDE.md      earlier guide; verify against code
    +-- PROJECT_DOCUMENTATION.md       older documentation; not authoritative
~~~

## 22. Security, reliability, and operational audit

### Implemented protections

- sync staging is separate from current data;
- preview/commit separates inspection from promotion;
- backup and restore exists around analysis artifact promotion;
- source request telemetry avoids credentials;
- API JSON cleaning avoids serialization failures from NaN/NumPy values;
- GET pages use safe fallbacks for many unavailable endpoints;
- raw source tables are not rewritten by analysis modules;
- .gitignore excludes node modules, build output, sync runtime state, training caches, and downloaded PDFs.

### Material gaps

1. FastAPI CORS is wildcard (allow_origins=["*"]) with credentials/methods/headers enabled. This is unsafe for a production authenticated deployment.
2. No authentication or authorization layer is implemented.
3. No rate limiting is implemented.
4. Sync SSL verification defaults to false. This should be changed to true unless a documented trusted proxy/certificate exception exists.
5. The scheduler is process-local and has no distributed lock.
6. The preview endpoint can block a web worker on a large fetch.
7. The source adapter includes a standalone PDF downloader with SSL verification disabled and a downloaded-PDF directory. It is an optional utility, not part of the core risk pipeline.
8. There is no cryptographic immutability for raw data or feature files.
9. The application reads local Parquet files; there is no database transaction layer or multi-user audit trail.
10. Missing official coordinates mean exact GIS proximity/duplicate distance is not implemented. State/constituency attributes are used.

## 23. Hard-coded versus dynamic behavior

### Configuration or data-driven

- raw file paths and output paths;
- official source URL, with environment override;
- sync interval, retry count, timeout, proxy, and SSL setting;
- sector phrases and reference table;
- material benchmark values;
- historical cost and unit statistics;
- completed-work counts;
- category duration medians;
- state/category peer progress medians;
- state/constituency/MP aggregates;
- dashboard filters and pagination.

### Hard-coded business logic

- ambiguity tokens;
- minimum historical sample size of 2;
- quantity upper bound of 1,000,000;
- classifier confidence/margin thresholds;
- duplicate similarity/support/score thresholds;
- compliance point values and thresholds;
- schedule score additions and thresholds;
- composite weights and gates;
- fallback duration/progress values;
- current schedule reference date 2026-09-09.

## 24. What the system does not currently claim

The audited code does not support these claims as implemented facts:

- The system proves fraud.
- The system uses a live Isolation Forest for every financial decision.
- The system uses real MLflow model registry and model artifacts.
- The system predicts fraud probability with a validated accuracy.
- The system measures physical construction completion from sensors or images.
- The system performs exact geospatial duplicate detection.
- The system verifies every guideline requirement from original legal documents.
- A financial outlier is automatically illegal.
- A duplicate candidate is automatically a duplicate.
- The generated peer median is an official schedule-of-rates benchmark.
- The raw files are cryptographically tamper-proof.

These are appropriate future claims only after the corresponding implementations and evidence are added.

## 25. Priority improvements

### P0: accuracy and trust

1. Fix T1/T7 ingestion so CSV/XLSX are both supported and missing required tables are explicit errors.
2. Replace the hard-coded schedule reference date with an as_of_date supplied by the data snapshot.
3. Rename or remove the Isolation Forest/MLflow labels in the UI and registry until a real model is implemented.
4. Show comparison_scope, comparison_level, peer_category, and sample count beside every benchmark result.
5. Keep the unit-price-disabled explanation for unspecified categories; do not infer a unit price from a broad family.

### P1: model and MLOps completeness

1. Add a real estimator only if it improves the auditable rule/statistical approach and can be explained.
2. Serialize model artifacts and load the exact production version during inference.
3. Add labelled evaluation, precision/recall, false-positive review, and a champion/challenger gate.
4. Use the actual MLflow package/server or rename the local JSON component to “run metadata registry”.
5. Add statistical data-drift tests and alert thresholds.

### P1: security and production operation

1. Restrict CORS to the deployed frontend origin.
2. Add authentication, authorization, and audit logging.
3. Turn SSL verification on by default.
4. Move scheduling to a managed job or add a distributed lock.
5. Move large source pulls out of request handlers.

### P2: analytical depth

1. Add inflation/year adjustment and engineering-scope normalization to financial peer comparisons.
2. Add validated coordinates before using proximity-based duplicate detection.
3. Separate sanction amount, expenditure, disbursement, and physical completion more explicitly in labels.
4. Add official document/attachment extraction only with evidence provenance.
5. Add a material-price component to the composite only after validating its data quality and avoiding double counting.

## 25.1. Documentation drift found during the audit

Several older artifacts describe behavior that is not the current executable behavior. They should not be used as implementation evidence without checking this audit and the source files:

- PROJECT_DOCUMENTATION.md contains older model/count/route assumptions.
- docs/MPLADS_AI_Platform_Technical_Documentation.md includes claims such as active Isolation Forest, Haversine/Benford-style analysis, and other capabilities that were not found in the current execution path.
- The current model-monitoring UI describes an active production Isolation Forest and displays Isolation Forest parameters because it reads the local JSON metadata.
- The progress text FINANCIAL_ISOLATION_FOREST remains in src/run_pipeline.py and training_manager.py even though financial_anomaly.py uses historical range comparison.
- data/mlflow_model_registry.json records older dataset snapshots and metrics than the currently generated master data.

This audit is the recommended source for explaining what is implemented as of the audit date. The older documents may still be useful as presentation drafts, but their claims require source verification.

## 26. Presentation-ready architecture

~~~text
                   +---------------------------+
                   | Official MPLADS source    |
                   | API + supplied CSV/XLSX   |
                   +-------------+-------------+
                                 |
                                 v
                   +---------------------------+
                   | Ingestion and validation  |
                   | retries, schema, staging  |
                   +-------------+-------------+
                                 |
                                 v
                   +---------------------------+
                   | Cleaned Parquet tables    |
                   | T1/T3/T4/T5/T6/T7         |
                   +-------------+-------------+
                                 |
                                 v
                   +---------------------------+
                   | Master analytical layer   |
                   | joins + IDs + categories  |
                   +------+------+-------------+
                          |      |       |
             +------------+      |       +----------------+
             v                   v                        v
   +------------------+  +------------------+  +----------------------+
   | Financial peers  |  | Duplicate graph  |  | Compliance + schedule |
   | cost/unit ranges |  | pairs/clusters   |  | rule evidence         |
   +---------+--------+  +---------+--------+  +----------+-----------+
             \                   |                         /
              \                  |                        /
               +-----------------v-----------------------+
               | Composite risk and audit explanations   |
               +-----------------+-----------------------+
                                 |
                                 v
               +-----------------------------------------+
               | FastAPI + React dashboards              |
               | filters, queues, details, sync status   |
               +-----------------------------------------+
~~~

## 27. Panel and viva answers

### What is the project?

It is an AI-assisted MPLADS monitoring platform. It combines cleaned government expenditure data, explainable classification, historical financial benchmarking, duplicate/split-work detection, guideline checks, schedule analysis, and dashboard-based review queues.

### Why did you use AI?

The data contains inconsistent free-text descriptions and large numbers of works. Text classification and similarity methods reduce manual grouping effort. The risk decision remains explainable because the platform also shows peer groups, rules, thresholds, and evidence.

### What models are actually used?

The current code uses optional LogisticRegression for uncertain work-category classification, optional LinearSVC for sector classification, TF-IDF for some duplicate-candidate generation, and statistical historical comparisons for financial risk. A live Isolation Forest is not implemented in the current execution path.

### Why use the median?

The median is less affected by a few unusually expensive or cheap completed works than a mean. The code reports min, median, and max; the median is the central peer reference, while the range is used for the current out-of-range decision.

### How does the financial engine handle unspecified categories?

It creates an informative peer family only when the label contains useful family words. For example, High Mast Light System (Unspecified) becomes the peer family High Mast Light System. It can use that family for total-cost benchmarking, but unit-price analysis remains disabled because the exact specification is unknown. If the peer family lacks enough history, the engine widens to constituency subcategory/main sector, then state, then all India.

### How do you avoid false unit-price comparisons?

The unit comparison requires a specific category, positive bounded quantity, a unit, a non-contact description, and at least two exact-category records with the same normalized unit. It never generalizes unit price to a broad sector.

### How do you detect duplicates?

The system normalizes descriptions, extracts meaningful tokens and quantities, compares works inside geographic/category blocks, calculates token similarity, and requires supporting evidence such as matching dates, nearby IDs, related quantities, or related costs. Connected pairs become clusters. The result is a review candidate, not a fraud conclusion.

### How do you detect artificial splitting?

It looks for highly similar or exact works with multiple supports, close IDs/dates, divided cost relationships, repeated descriptions, and connected cluster structure. It produces a possible split-work indicator and a cluster explanation.

### How do you check compliance?

The compliance engine converts configured guideline indicators into findings and points. It checks timing, minimum sanction, completion duration, calamity duration, stopped status, movable assets, prohibited descriptions, and aggregate allocation/cap rules. It reports the rule and evidence for human review.

### How do you check SC/ST allocation?

The engine performs constituency-period aggregation and checks the configured SC and ST percentage thresholds. It does not claim to identify an SC/ST beneficiary for every work when the source data does not provide that evidence.

### How is schedule risk calculated?

It estimates planned duration from completed-work category medians or a 365-day fallback, computes expected timeline progress, compares it to expenditure progress, adds overdue/delay/calamity/missing-estimate points, and caps the score at 100. Expenditure progress is a proxy, not physical progress.

### How is final risk calculated?

The composite is 42% compliance, 28% financial, 15% duplicate, and 15% schedule. Scores at least 35 require audit action. High/critical compliance and severe financial conditions can apply upward gates.

### How does synchronization work?

The source adapter fetches six official tables with retries and validation, writes staging data, computes new/modified/removed/unchanged records, shows a preview, and promotes only after commit. A failed refresh keeps the previous validated feature set.

### When is the model retrained?

The current background process reruns the analytical pipeline after a validated sync snapshot. It does not currently fit and deploy a serialized anomaly model. It should be described as analysis refresh/recalculation unless a real model-training implementation is added.

### How does MLflow help?

At present, the local JSON tracker records run metadata and artifact paths. A real MLflow server, model artifact registry, champion/challenger evaluation, and production model loading are not implemented yet.

### What happens if there is insufficient data?

The financial engine returns INSUFFICIENT_HISTORY, the benchmark table omits groups with fewer than two completed costs, and unit price is marked not available or not applicable. The system does not fabricate a median.

### Is an outlier proof of fraud?

No. It is an evidence-based prioritization signal. An auditor must verify scope, quantity, estimate, approvals, bills, completion evidence, location, and applicable guidelines.

## 28. Final audit summary

The codebase addresses the central MPLADS monitoring problem with a real end-to-end analytical application. It has meaningful implemented functionality beyond a static dashboard: it builds derived data, compares works to peer history, identifies duplicate candidates, checks explicit guideline indicators, calculates schedule risk, and produces explainable composite queues.

The codebase should be presented accurately as:

> An explainable AI-assisted and statistical MPLADS audit-prioritization platform that combines NLP classification, historical peer benchmarking, similarity-based duplicate detection, guideline rules, schedule analysis, and weighted risk scoring.

It should not currently be presented as:

> A validated fraud-prediction model using a live Isolation Forest and production MLflow registry.

The code supports the unspecified-category requirement: create a useful peer family only when the label contains an informative family, use the family for total-cost median/range comparison, fall back through constituency subsector/main sector to state and all India, and never calculate unit price when the category is unspecified. The benchmark tab is backed by a separate generated artifact and exposes constituency, state, all-India, sector, sub-sector, and peer-family statistics when at least two completed records exist.

For a trustworthy submission, the highest-priority work is to correct the T1/T7 file-format ingestion mismatch, replace the schedule hard-coded date, align the model-monitoring labels with the actual implementation, and add real model evaluation/registry controls before claiming automated ML retraining.
