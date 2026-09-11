from __future__ import annotations

import os
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_DIR = os.path.join(ROOT, "output", "pdf")
TODAY = date.today().isoformat()

NAVY = colors.HexColor("#0F172A")
INDIGO = colors.HexColor("#1E3A8A")
BLUE = colors.HexColor("#2563EB")
TEAL = colors.HexColor("#0F766E")
AMBER = colors.HexColor("#B45309")
ROSE = colors.HexColor("#BE123C")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#CBD5E1")
PALE = colors.HexColor("#F8FAFC")
PALE_BLUE = colors.HexColor("#EFF6FF")
PALE_TEAL = colors.HexColor("#F0FDFA")
PALE_AMBER = colors.HexColor("#FFFBEB")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="DocTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25,
    leading=30, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="DocSubtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=11,
    leading=16, textColor=SLATE, spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="Kicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8,
    leading=10, textColor=BLUE, tracking=1.3, uppercase=True, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="H1Custom", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=16,
    leading=20, textColor=NAVY, spaceBefore=8, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="H2Custom", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11,
    leading=14, textColor=INDIGO, spaceBefore=8, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BodyCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.7,
    leading=12.5, textColor=SLATE, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="SmallCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.4,
    leading=10, textColor=MUTED, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="TableCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.3,
    leading=9.2, textColor=SLATE, spaceAfter=0,
))
styles.add(ParagraphStyle(
    name="TableHeadCustom", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=7.3,
    leading=9.2, textColor=colors.white, spaceAfter=0,
))
styles.add(ParagraphStyle(
    name="CodeCustom", parent=styles["Code"], fontName="Courier", fontSize=7.4,
    leading=9.5, textColor=NAVY, backColor=PALE, borderColor=LINE, borderWidth=0.4,
    borderPadding=5, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="CoverMeta", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5,
    leading=13, textColor=MUTED, alignment=TA_LEFT,
))


def P(text: str, style: str = "BodyCustom") -> Paragraph:
    return Paragraph(escape(str(text)).replace("\n", "<br/>"), styles[style])


def rich(text: str, style: str = "BodyCustom") -> Paragraph:
    return Paragraph(text, styles[style])


def title(text: str, subtitle: str | None = None):
    flow = [P(text, "DocTitle")]
    if subtitle:
        flow.append(P(subtitle, "DocSubtitle"))
    return flow


def h1(text: str):
    return [P(text, "H1Custom"), HRFlowable(width="100%", thickness=0.7, color=LINE, spaceAfter=8)]


def h2(text: str):
    return [P(text, "H2Custom")]


def bullets(items: list[str], style: str = "BodyCustom"):
    return [P("- " + item, style) for item in items]


def callout(label: str, text: str, background=PALE_BLUE, accent=BLUE):
    content = Table([[P(label.upper(), "Kicker"), P(text, "BodyCustom")]], colWidths=[34 * mm, 132 * mm])
    content.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.7, accent),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [content, Spacer(1, 5)]


def data_table(headers: list[str], rows: list[list[str]], widths: list[float] | None = None, header_color=NAVY):
    table_rows = [[P(item, "TableHeadCustom") for item in headers]]
    table_rows += [[P(item, "TableCustom") for item in row] for row in rows]
    table = Table(table_rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def model_card(name: str, purpose: str, data_used: str, basis: str, calculation: str,
               outputs: str, limitations: str):
    """Compact, code-grounded explanation of one analytical component."""
    rows = [
        ["Purpose / type", purpose],
        ["Data used", data_used],
        ["Calculation basis", basis],
        ["How it calculates", calculation],
        ["Outputs", outputs],
        ["Limitations / review point", limitations],
    ]
    return [
        P(name, "H2Custom"),
        data_table(["Trace item", "Implementation detail"], rows, [37 * mm, 129 * mm]),
        Spacer(1, 4),
    ]


def model_trace_story():
    """Shared model-by-model calculation trace used in both reference PDFs."""
    story = []
    story += h1("Model-by-model calculation trace")
    story += [P("This section answers four questions for every analytical component: which source records it reads, which fields become inputs, what comparison or rule basis it uses, and how the final value is calculated. The word model is used broadly here. Work and sector classification can use lightweight machine learning; compliance, schedule, duplicate evidence, financial context, composite risk, and state analytics are primarily deterministic or statistical comparison engines. None of these outputs is a legal finding.")]
    story += callout("Reading the scores", "Component scores are evidence-prioritization values on a 0 to 100 scale unless stated otherwise. Missing evidence can produce NOT_EVALUATED, NOT_AVAILABLE, INSUFFICIENT_HISTORY, or uncertainty flags. A high score means review first; it does not mean the underlying allegation is proven.", PALE_AMBER, AMBER)

    story += model_card(
        "1. Data preparation, identity, and master-record builder",
        "Foundation layer; not a predictive model. It makes source records comparable and auditable.",
        "Raw/local T1, T3, T4, T5, T6, and T7 tables. Key fields include work_id, work_recommendation_dtl_id, dates, sanctioned/recommended amounts, expenditure_amount, description, state, constituency, category, status, and completion evidence.",
        "T4 sanctioned works form the master base. Delta identity uses the work identifier plus recommendation-detail identifier where present. Original source values remain separate from derived fields.",
        "cleaner.py parses currency, dates, text, administrative values, and identifiers. master_builder aggregates T6 by work_id: total_expenditure = sum(expenditure_amount), plus average payment, maximum payment, payment count, first payment, and last payment. It links T3 descriptions/dates and T5 completion fields, then sets effective_expenditure = total_expenditure when present, otherwise completed_disbursed_amount. Derived duration and cost fields are then calculated.",
        "master_analytical.parquet, stable IDs, normalized dates/amounts, effective_work_category, main_sector, material context, effective_expenditure, cost_overrun_pct, and sanction_to_completion_days.",
        "A fallback ID is deterministic but is not the same as a source-issued identity. Missing or conflicting identifiers and missing source fields must be resolved against the official record before formal reporting.",
    )

    story += model_card(
        "2. Work-description classifier",
        "Hybrid rule classifier with optional TF-IDF plus LogisticRegression for uncertain descriptions.",
        "Master descriptions and the source work_category. Text is normalized to lowercase word tokens. Rule groups cover Roads, Bridges and Culverts, Lighting/Electrification, Water, Drainage, Irrigation, Education, Healthcare, Community, Sanitation, Walls, Sports, Public Buildings, and Repair/Renovation.",
        "High-confidence phrase rules are preferred. The text model is only trained from rows already labelled by those rules; it is not trained from independently verified human ground truth.",
        "For each description, matching phrases are found. A multi-word phrase gets confidence 0.98; a single-word phrase gets 0.92. If at least 20 high-confidence rows and at least two classes exist, TF-IDF word 1-2 grams feed LogisticRegression. An uncertain row is replaced only when predicted probability >= 0.75. effective_work_category uses the predicted label at >= 0.75, otherwise a non-generic source category, otherwise Other / Unclassified.",
        "ai_work_category, effective_work_category, category_confidence, confidence band, category_source, matched keywords, work_domain, and classification_reason.",
        "Confidence is model confidence, not correctness. Because labels originate from rules, the optional classifier can reproduce rule bias. Generic, abbreviated, multilingual, or poorly described works may remain uncertain and need human validation.",
    )

    story += model_card(
        "3. Sector and cost-reference classifier",
        "Reference-taxonomy classifier; used to assign a sector context, not to decide risk by itself.",
        "sanctioned_work_description or description plus data/reference/mplads_sector_cost_reference.csv. The reference supplies sector_id, main_sector, and sub-sector labels. The text parser also looks for explicit quantity and unit expressions.",
        "Phrase matches from the supplied taxonomy are preferred. Unknown text can be classified by a TF-IDF word 1-2 gram LinearSVC trained on high-confidence phrase labels.",
        "A multi-word phrase receives 0.98 confidence and a single-word phrase 0.92. For unknown rows, the SVM decision-margin must be >= 0.25; confidence is capped at 0.89 and calculated as min(0.89, 0.60 + margin / 4). Labels are mapped back to the reference table. Unmatched rows become Other / Unclassified.",
        "sector_id, main_sector, effective_work_category, sub-category, confidence, source RULE/SVM/FALLBACK, matched phrases, classification reason, quantity_detected, quantity_unit, and quantity_source.",
        "The reference taxonomy and text are not an engineering estimate or an approval decision. An SVM margin is not a probability. Quantity extraction from a description is only contextual unless a bill of quantities or official measurement supports it.",
    )

    story += model_card(
        "4. Material, quantity, and benchmark context",
        "Conservative rule-based context model for material signals; it does not replace a bill of quantities.",
        "Description, state, sanction_date or recommended_date, detected work type, explicit material words, explicit quantities, and state/material benchmark data under the repository reference data.",
        "A benchmark is selected by state and material, using the work year when available and otherwise the latest benchmark year. Explicit material-native units are required for a direct reference-cost calculation.",
        "The parser extracts materials and quantities. For kg, tonne/MT, bags, or pieces, reference_material_cost = explicit_quantity * benchmark_price when both are available. The context score is min(100, 25 if benchmark exists + 35 if explicit quantity exists + 20 if work type exists + 20 if state and benchmark exist). A length or area quantity is not treated as material quantity without a supported bill of quantities.",
        "Detected materials, quantity/unit, benchmark year/state, benchmark price, reference material cost, material_cost_context_status, context score, explanation, and data-quality flags.",
        "A benchmark is contextual and may not match procurement quality, local specification, freight, labour, taxes, or the actual BOQ. The module explicitly reports benchmark-only or unavailable cases rather than inventing a cost.",
    )

    story += model_card(
        "5. Financial anomaly and historical cost analyzer",
        "Historical peer-comparison analyzer; no active ML anomaly score and no universal price ceiling.",
        "sanction_amount, effective_expenditure, completed_disbursed_amount, completion_date, constituency, main_sector, effective_work_category, quantity_detected, and quantity_unit.",
        "Completed records with a valid completion date, positive historical cost, constituency, sector, and comparable work type form the history. Comparisons are within constituency + sector + comparable work type; unit-price comparisons also require the same quantity unit. MIN_HISTORY_RECORDS = 2.",
        "Current cost = sanction_amount. Historical cost = effective_expenditure, falling back to completed_disbursed_amount. current_unit_price = current_cost / explicit_quantity. For each peer key, compute historical min, max, median, and count. A value is outside the range when it is above the historical maximum or below the historical minimum. financial_deviation_from_median = max(abs(current - median) / median) across available cost and unit signals, but only for outliers. Flagged rows receive a percentile rank from 0 to 100 among flagged rows; median and 75th-percentile rank cutoffs label MEDIUM and HIGH.",
        "Cost and unit comparison status, peer range and median, current cost/unit price, outlier flag, financial_risk_score, level, confidence, evidence, explanation, rank, and model_version historical-cost-unit-v1.",
        "A range comparison is not proof of overpayment. Small peer samples, changed specifications, inflation, geography, and missing quantity data reduce comparability. The MLflow registry may contain IsolationForest metadata, but this active module does not execute that model in the current calculation path.",
    )

    story += model_card(
        "6. Duplicate, overlap, and artificial-splitting detector",
        "Evidence-weighted candidate detector for related work records; it does not declare duplication.",
        "Recommended T3 and sanctioned T4 descriptions, work IDs, state, constituency, main sector, effective category, sanctioned/recommended amounts, recommendation/sanction dates, and explicit quantity signatures.",
        "Records are blocked within state + constituency + main_sector + effective_work_category. Generic government wording is removed while asset, location, technical tokens, quantities, dates, IDs, and costs are retained.",
        "TF-IDF cosine similarity >= 0.55 helps create candidates for smaller blocks; the final meaningful-token similarity uses Jaccard overlap, with exact meaningful descriptions forced to at least 0.72. A pair must have similarity >= 0.72 and at least one support: related quantity, close/nearby work ID, same/close recommendation or sanction date, closely related or mathematically divided costs, or shared asset/location terms. score = min(100, similarity * 42 + min(number_of_supports, 4) * 10 + 10 if same_meaningful_description + 8 if quantity MATCH). possible_split_work additionally requires same meaningful text or similarity >= 0.88, at least two supports, and a close ID or same date.",
        "Pair score, content similarity, quantity relation, ID/date gaps, amount ratio, indicators, possible_split_work, review classification, connected-component clusters, and work-level duplicate score.",
        "Boilerplate can still create candidates and different physical assets can share wording. The detector is a review queue. Check site, scope, measurement, implementing agency, sanction, and payment documents before calling two records the same work.",
    )

    story += model_card(
        "7. Guideline-backed compliance engine",
        "Deterministic rule engine grounded in the supplied MPLADS 2023 guideline document.",
        "Recommended/sanction dates, completion date, work status, description, work category, sanctioned amount, calamity text, movable-asset terms, and constituency allocation records.",
        "The code matrix separates WORK rules from CONSTITUENCY aggregate observations and NON_GUIDELINE_HEURISTIC rules. Work-level points can enter the individual score; aggregate observations have zero work-risk points.",
        "For each work, evaluate rule predicates. Examples: sanction date > recommendation date + 45 days -> 85 points; sanctioned amount < INR 250,000 -> 35; completion or current observation beyond 365 days -> 35; calamity rehabilitation beyond 548 days -> 45; stopped/abandoned or movable-asset indicators -> 35/25; each prohibited-description indicator -> 85. Sum triggered points and cap at 100. Levels are LOW <35, MEDIUM >=35, HIGH >=65, CRITICAL >=85. Missing fields yield NOT_EVALUATED or data-quality notes rather than a fabricated pass.",
        "Triggered rule IDs, findings, guideline basis, what happened, why it matters, evidence details, compliance_risk_score, level, review status, and separate constituency analysis for SC 15%, ST 7.5%, repair 10%, entity 10%, and Bar library 0.1% observations.",
        "Text indicators are screening evidence and can be false positives. Constituency allocation analysis needs official area/entitlement evidence. Duplicate text and sector-cost heuristics are explicitly not converted into compliance findings.",
    )

    story += model_card(
        "8. Schedule and progress risk engine",
        "Transparent duration and progress-gap scoring engine with a historical category baseline.",
        "sanction_date, completion_date, estimated completion date when present, effective_work_category/work_category, state, work description, sanctioned amount, and effective_expenditure.",
        "Completed works provide the median completion period by effective category; if unavailable, the baseline is 365 days and planned duration has a 30-day minimum. The runtime reference date in the current module is 2026-09-09.",
        "planned_duration = max(category median, 30), else 365. expected_timeline_progress = clip(elapsed_days / planned_duration * 100, 0, 100). expenditure_progress = clip(effective_expenditure / sanction_amount * 100, 0, 100). progress_gap = max(expected_timeline_progress - expenditure_progress, 0). Add 55/35/20 for gap >50/>30/>15; add 35/25/15 for overdue or completion delay >180/>90/>30; add 25 for elapsed or delay >365; add 20 for calamity wording with elapsed or delay >240; add 10 when the estimated date is missing. Cap at 100.",
        "Planned and elapsed days, expected and expenditure progress, progress gap, overdue days, completion delay, peer median/deviation, schedule_risk_score, level, narrative, and completion deviation.",
        "Expenditure progress is a financial proxy, not physical progress. A revised approved schedule, site milestone, weather event, or data-lag can change interpretation. Always review the work file and implementing-agency explanation.",
    )

    story += model_card(
        "9. Composite risk and audit-priority engine",
        "Weighted prioritization layer that combines component evidence; it is not a separate fraud classifier.",
        "Financial, compliance, duplicate, and schedule component fields produced from the same master work record and feature artifacts.",
        "Component values are expected on a 0 to 100 scale. Compliance receives the highest weight because it represents direct guideline evidence; priority floors preserve severe compliance or financial signals.",
        "base_composite = 0.42 * compliance + 0.28 * financial + 0.15 * duplicate + 0.15 * schedule, rounded to one decimal. impact_score = composite * (unspent sanction in lakhs + 1). Set CRITICAL at >=85, HIGH at >=65, MEDIUM at >=35, otherwise LOW. If compliance >=85, force the composite minimum to 85; if compliance >=65 or financial >=85, force the minimum to 65. requires_audit_action = composite >=35.",
        "Component scores, composite_score, impact_score, overall risk level, priority reason, evidence summary, recommended action, and audit-action flag.",
        "The weighted score is only as reliable as its component data and comparability. Changing weights or thresholds changes queue size and priority; preserve the methodology/version in formal reports.",
    )

    story += model_card(
        "10. State risk analytics and record traceability",
        "Aggregation and retrieval layer; not a predictive model.",
        "The active validated work-level records and their component scores. The API uses the same data_version and analysis_version metadata as the risk artifacts.",
        "State metrics are calculated from individual works, not from an independent state model. A work is flagged when any dimension score is >=35. The state risk percentage is flagged works divided by total works.",
        "Group records by state; count total works and works over the audit threshold; count financial, compliance, duplicate, and schedule flags; calculate risk percentage; sort highest-risk works by the maximum component/composite signal. The API returns original source fields separately from derived analysis fields.",
        "State totals, risk percentage, dimension counts, methodology text, highest-risk work list, original record, analysis record, data_version, analysis_version, generated_at, and stale_analysis.",
        "Aggregates inherit record-level missingness and stale-analysis status. A state percentage is not a finding about every work or every official. Resolve version mismatch before formal reporting.",
    )

    story += model_card(
        "11. Training, drift, and model-registry controls",
        "Operational governance layer for reproducibility and safe promotion; not a risk score by itself.",
        "Current validated snapshot, prior feature artifacts, pipeline outputs, required Parquet files, finite-score checks, registry metadata, and training status events.",
        "Training is isolated from synchronization. The active analysis version must be tied to a dataset version; the registry records model name, parameters, dataset snapshot, and stage for governance continuity.",
        "TrainingManager stages a full pipeline run, checks required artifacts and finite score columns, compares summary/drift against the prior artifacts, backs up the active set, and atomically promotes the new set. On failure it restores the previous set and reports FAILED_ROLLED_BACK. stale_analysis = true when the active analysis data version differs from the current data version.",
        "Training status, phase, timestamps, analysis/data versions, drift summaries, rollback status, registry experiments, and model metadata such as the current IsolationForest record.",
        "Registry metadata is not evidence that every registered model is active in every engine. Confirm the source code path, artifact version, and status before describing a model as deployed or production-authoritative.",
    )
    return story


class FlowDiagram(Flowable):
    def __init__(self, items: list[tuple[str, str]], width=170 * mm, box_height=18 * mm):
        super().__init__()
        self.items = items
        self.width = width
        self.box_height = box_height
        self.height = len(items) * (box_height + 7 * mm) - 7 * mm

    def draw(self):
        canvas = self.canv
        x = 5 * mm
        box_w = self.width - 10 * mm
        for index, (label, detail) in enumerate(self.items):
            y = self.height - (index + 1) * self.box_height - index * 7 * mm
            fill = PALE_BLUE if index in (0, len(self.items) - 1) else colors.white
            canvas.setFillColor(fill)
            canvas.setStrokeColor(BLUE if index in (0, len(self.items) - 1) else MUTED)
            canvas.setLineWidth(0.8)
            canvas.roundRect(x, y, box_w, self.box_height, 4, fill=1, stroke=1)
            canvas.setFillColor(NAVY)
            canvas.setFont("Helvetica-Bold", 8)
            canvas.drawCentredString(self.width / 2, y + self.box_height - 10, label.upper())
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(SLATE)
            canvas.drawCentredString(self.width / 2, y + 8, detail)
            if index < len(self.items) - 1:
                arrow_y = y - 4 * mm
                canvas.setStrokeColor(MUTED)
                canvas.line(self.width / 2, arrow_y + 5, self.width / 2, arrow_y - 1)
                canvas.line(self.width / 2, arrow_y - 1, self.width / 2 - 3, arrow_y + 2)
                canvas.line(self.width / 2, arrow_y - 1, self.width / 2 + 3, arrow_y + 2)


class ArchitectureStrip(Flowable):
    def __init__(self, items: list[str], width=170 * mm):
        super().__init__()
        self.items = items
        self.width = width
        self.height = 25 * mm

    def draw(self):
        canvas = self.canv
        gap = 2 * mm
        box_w = (self.width - (len(self.items) - 1) * gap) / len(self.items)
        for index, item in enumerate(self.items):
            x = index * (box_w + gap)
            canvas.setFillColor([PALE_BLUE, PALE_TEAL, PALE_AMBER, colors.HexColor("#FDF2F8")][index % 4])
            canvas.setStrokeColor([BLUE, TEAL, AMBER, ROSE][index % 4])
            canvas.roundRect(x, 8 * mm, box_w, 12 * mm, 3, fill=1, stroke=1)
            canvas.setFillColor(NAVY)
            canvas.setFont("Helvetica-Bold", 6.6)
            words = item.split(" ")
            line_one = " ".join(words[: max(1, len(words) // 2)])
            line_two = " ".join(words[max(1, len(words) // 2):])
            canvas.drawCentredString(x + box_w / 2, 14 * mm, line_one.upper())
            if line_two:
                canvas.drawCentredString(x + box_w / 2, 11 * mm, line_two.upper())
            if index < len(self.items) - 1:
                canvas.setStrokeColor(MUTED)
                canvas.line(x + box_w, 14 * mm, x + box_w + gap, 14 * mm)
                canvas.line(x + box_w + gap - 2, 15 * mm, x + box_w + gap, 14 * mm)
                canvas.line(x + box_w + gap - 2, 13 * mm, x + box_w + gap, 14 * mm)


def header_footer(canvas, doc, short_title: str):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, height - 14 * mm, width - 18 * mm, height - 14 * mm)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(NAVY)
    canvas.drawString(18 * mm, height - 10 * mm, "MPLADS AI RISK INTELLIGENCE")
    canvas.setFont("Helvetica", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 18 * mm, height - 10 * mm, short_title)
    canvas.line(18 * mm, 13 * mm, width - 18 * mm, 13 * mm)
    canvas.setFont("Helvetica", 7.2)
    canvas.drawString(18 * mm, 8 * mm, "Code-grounded documentation refresh: " + TODAY)
    canvas.drawRightString(width - 18 * mm, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_doc(path: str, short_title: str, story: list):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc = BaseDocTemplate(
        path, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=21 * mm, bottomMargin=19 * mm, title=short_title,
        author="MPLADS AI Risk Intelligence Platform",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=lambda c, d: header_footer(c, d, short_title))])
    doc.build(story)


def common_cover(kicker: str, heading: str, subtitle: str, scope: str):
    story = [Spacer(1, 26 * mm), P(kicker, "Kicker"), P(heading, "DocTitle"), P(subtitle, "DocSubtitle")]
    story += [ArchitectureStrip(["Official source", "Validated data", "Risk engines", "Review dashboard"]), Spacer(1, 12 * mm)]
    story += callout("Scope", scope, PALE_BLUE, BLUE)
    story += [Spacer(1, 7 * mm), P("Document control", "H2Custom")]
    rows = [
        ["Repository", r"P:\\SIH\\mplads_updated-main"],
        ["Refresh date", TODAY],
        ["Source artifacts", "Current codebase plus the two supplied PDFs as reference inputs"],
        ["Verified active data version", "SNAP-2026-09-11T055903Z"],
        ["Verified analysis version", "VALIDATION-SNAPSHOT; dashboard reports stale_analysis=true"],
    ]
    story += [data_table(["Item", "Current value"], rows, [42 * mm, 124 * mm])]
    story += [Spacer(1, 10 * mm), P("Important reading note: metrics in this document are a verification snapshot. Runtime dashboard values are served by the backend and should be treated as authoritative when the active dataset changes.", "SmallCustom"), PageBreak()]
    return story


def technology_story():
    story = common_cover(
        "Updated technical reference",
        "MPLADS AI Monitoring - Technology Deep Dive",
        "Current architecture, analytical engines, sync reliability, API contracts, and implementation traceability",
        "This edition replaces statements that had become stale in the original 12-page technology PDF. It describes the code that is currently present, including the new version-aware analytics and asynchronous synchronization paths.",
    )

    story += h1("1. Current system position")
    story += [P("The platform is a decision-support system for MPLADS monitoring. It does not adjudicate fraud, corruption, eligibility, or legal liability. It produces explainable risk indicators and evidence trails for an officer or auditor to review.")]
    story += callout("Verified snapshot", "The active canonical master currently contains 79,827 works across 36 states and Union Territories. The current API reports INR 42.06 billion sanctioned and INR 27.51 billion effective expenditure. The promoted analytical artifacts currently report a validation snapshot of 79,068 rows, so the backend exposes the data version, analysis version, generated time, and a stale-analysis flag.", PALE_AMBER, AMBER)
    story += [P("Current risk distribution from GET /api/overview: LOW 20,302; MEDIUM 905; HIGH 2,293; CRITICAL 56,327. The audit queue threshold is a composite score of 35 or more; severity labels are assigned at 35, 65, and 85.", "BodyCustom")]

    story += h1("2. Architecture and technology stack")
    story += [ArchitectureStrip(["Raw CSV/XLSX", "Processed Parquet", "Feature engines", "FastAPI APIs", "React UI"])]
    story += [Spacer(1, 5), data_table(["Layer", "Current implementation", "Responsibility"], [
        ["Source and ingestion", "Official MoSPI REST endpoint plus local raw files", "Fetch, parse, normalize, validate, and stage six monitored tables."],
        ["Canonical data", "data/processed/*.parquet", "Stable T1, T3, T4, T5, T6, and T7 tables with normalized IDs, dates, amounts, and administrative fields."],
        ["Analytics", "Pandas, NumPy, scikit-learn where used", "Build master analytical data, classification context, financial comparisons, duplicate evidence, compliance findings, and schedule risk."],
        ["Risk store", "data/features/*.parquet", "Persist component scores, narratives, evidence, reviewer actions, and composite scores."],
        ["Serving", "FastAPI in src/backend/app.py", "Cache validated artifacts, expose JSON contracts, sanitize records, and provide lazy work lookup."],
        ["Presentation", "React 18, TypeScript, Vite, Recharts, Lucide", "Render API-backed tables, charts, filters, state risk analysis, work details, sync status, and model status."],
    ], [34 * mm, 62 * mm, 70 * mm])]

    story += h1("3. Repository and execution map")
    story += [P("The current executable path is intentionally explicit:")]
    story += [FlowDiagram([
        ("Preprocessing", "src/preprocessing/cleaner.py"),
        ("Master build", "src/data/master_builder.py"),
        ("Component engines", "src/modules/*.py"),
        ("Composite risk", "src/risk/composite_risk_engine.py"),
        ("API serving", "src/backend/app.py"),
        ("React dashboard", "frontend/src/")], width=170 * mm)]
    story += [P("The full local pipeline is orchestrated by src/run_pipeline.py. TrainingManager runs the pipeline in an isolated staging directory, validates the resulting artifacts, and promotes them atomically with rollback protection.")]

    story += h1("4. Data foundation and canonical records")
    story += h2("4.1 Monitored source tables")
    story += [data_table(["Key", "Canonical file", "Observed current rows", "Role"], [
        ["t1", "t1_allocated_limits.parquet", "543", "MP allocation and entitlement reference."],
        ["t3", "t3_works_recommended.parquet", "107,574", "Recommended works and recommendation dates."],
        ["t4", "t4_works_sanctioned.parquet", "79,827", "Sanctioned-work base used for the master dataset."],
        ["t5", "t5_works_completed.parquet", "34,902", "Completion dates, disbursed amount, and evidence-image flag."],
        ["t6", "t6_expenditure.parquet", "84,585", "Expenditure transactions aggregated by work in master_builder."],
        ["t7", "t7_calamity_consents.parquet", "12", "Calamity consent records."],
    ], [18 * mm, 58 * mm, 26 * mm, 64 * mm])]
    story += h2("4.2 Normalization and identity")
    story += bullets([
        "cleaner.py normalizes currency, text, dates, state, constituency, MP, and work identifiers.",
        "Work IDs are extracted from source values with deterministic fallback IDs when the source is missing an identifier.",
        "master_builder uses the T4 sanctioned table as the base, links T3 recommendation, T5 completion, and aggregated T6 expenditure, then adds sector and material context.",
        "The source adapter validates required identifier, location, description, expenditure, and calamity fields before a staged dataset can be promoted.",
        "Original values are retained separately from derived classification, risk scores, explanations, and reviewer guidance.",
    ])

    story += h1("5. Analytical engines")
    story += h2("5.1 Work classification and material context")
    story += [P("work_classifier.py applies rule labels and, when enough high-confidence examples exist, a lightweight TF-IDF plus LogisticRegression classifier for uncertain descriptions. sector_classifier.py adds main-sector information from the repository reference. material_context.py extracts explicit quantities and materials from descriptions; it does not invent quantities when the source text does not contain them.")]
    story += h2("5.2 Financial risk")
    story += [P("The current financial module is constituency-specific and historical-data-led. It compares a work with completed works in the same constituency, effective category, comparable work type, and, for unit pricing, quantity unit. It produces historical min, max, median, count, cost-comparison status, unit-comparison status, evidence, and a cautious reviewer narrative. The current source module does not use a hardcoded sector price ceiling or an external price list as a risk rule.")]
    story += [P("Core formulas: Peer-style cost context is built from comparable completed records; unit price is expenditure divided by an explicitly detected quantity; insufficient-history cases are labelled rather than assigned a fabricated benchmark.")]
    story += h2("5.3 Candidate duplicate and artificial-splitting detector")
    story += [P("duplicate_detection.py uses a hybrid evidence detector. It normalizes descriptions, removes generic government-work wording, preserves technical identifiers and quantities, combines recommended and sanctioned descriptions, and uses TF-IDF cosine similarity when scikit-learn is available. A candidate must also have supporting evidence such as related quantities, close record numbers, close dates, shared asset terms, or cost relationships. The output includes possible_split_work, structured indicators, record pairs, clusters, and reviewer explanations.")]
    story += h2("5.4 Guideline-backed compliance")
    story += [P("compliance_engine.py is deterministic and cites mplads_2023_guidelines_including_changes.pdf. The current scope matrix distinguishes work-level rules from constituency-level aggregate observations and non-guideline heuristics. Work rules include sanction timing, minimum sanction review, completion-period review, calamity completion, stopped or abandoned works, movable-asset eligibility, and prohibited descriptions such as operation and maintenance, residential buildings, private establishments, land acquisition, reimbursement, CSR pooling, religious work, Swagat Dwar, unauthorized colonies, and recurring expenditure. Constituency observations include SC/ST allocation evidence and aggregate caps. Aggregate observations never enter the individual work risk order.")]
    story += h2("5.5 Schedule and progress")
    story += [P("delay_risk.py uses historical completion duration by effective category, with a 365-day fallback when history is unavailable. It derives elapsed days, planned duration, expected timeline progress, expenditure progress, progress gap, overdue days, completion delay, and peer progress deviation. The schedule score is a transparent sum of gap, overdue/delay, long elapsed duration, calamity context, and missing-date signals, capped at 100.")]
    story += model_trace_story()

    story += h1("6. Composite risk and reviewer governance")
    story += [P("composite_risk_engine.py combines four component signals using the current weights below. The score is not a finding of wrongdoing; it is a prioritization signal.")]
    story += [data_table(["Signal", "Weight", "Primary meaning"], [
        ["Compliance", "0.42", "Guideline-backed work-level evidence and eligibility observations."],
        ["Financial", "0.28", "Constituency-specific historical cost and unit-price context."],
        ["Duplicate", "0.15", "Candidate overlap or artificial-splitting evidence."],
        ["Schedule", "0.15", "Timeline, completion, and expenditure-progress mismatch."],
    ], [45 * mm, 22 * mm, 99 * mm])]
    story += [P("Severity: LOW <35, MEDIUM 35-64.99, HIGH 65-84.99, CRITICAL >=85. In addition to the weighted score, the current engine preserves priority: compliance >=85 sets a minimum CRITICAL score; compliance >=65 or financial >=85 sets a minimum HIGH score. The output includes component scores, risk level, evidence narrative, priority reason, and recommended reviewer action.")]
    story += callout("Governance", "Use terms such as risk indicator, potential anomaly, candidate duplicate pair, compliance evidence gap, and requires review. Do not present an analytical signal as proof of fraud, corruption, illegality, or liability.", PALE_TEAL, TEAL)

    story += h1("7. Training and model governance")
    story += [P("Training is separate from data synchronization. After a successful sync promotion, TrainingManager queues an isolated full pipeline run. A manual Run Analysis action is also available from Data Sync & System Status. Training writes status events, validates required artifacts and finite risk scores, computes drift summaries against the current feature store, backs up the active artifacts, and atomically promotes the new set. A failure restores the previous artifact set.")]
    story += [data_table(["State", "Meaning in the current UI"], [
        ["QUEUED", "A background run is waiting to start."],
        ["RUNNING", "The pipeline is executing a named analytical phase."],
        ["COMPLETED", "Validation passed and artifacts were promoted."],
        ["FAILED_ROLLED_BACK", "The new result was rejected and the prior result remains active."],
        ["stale_analysis=true", "The active analytical version does not match the current data version."],
    ], [42 * mm, 124 * mm])]
    story += [P("The repository also contains an MLflow-compatible JSON registry. Its current records describe an IsolationForest financial model and parameters for governance continuity; the source financial engine should remain the authority for the active calculation path. This distinction is now documented to prevent registry metadata from being mistaken for an independently verified model execution.")]

    story += h1("8. Synchronization reliability architecture")
    story += [FlowDiagram([
        ("Sync Now or scheduler", "POST /api/sync/start or configured interval"),
        ("Background job", "QUEUED -> RUNNING with job status file"),
        ("Official source", "six table requests, retry and timeout control"),
        ("Stage and validate", "required fields, parsing, page counts, errors"),
        ("Delta and promote", "NEW / MODIFIED / REMOVED with atomic file replace"),
        ("Snapshot and analysis", "SHA-256 metadata, training queue, cache refresh"),
    ], width=170 * mm)]
    story += h2("8.1 Traceability")
    story += [P("Every synchronization history record carries a sync ID, source, dataset list, start and completion timestamps, requested/received/inserted/updated/skipped/failed counters where available, pages fetched, API requests, retry count, training and risk-analysis flags, error count, last successful sync, snapshot ID, delta, and the user-facing error message. Request telemetry in sync_audit.jsonl includes request ID, endpoint, dataset, page, status, response time, retry count, and error without secrets.")]
    story += h2("8.2 Retry and pagination")
    story += bullets([
        "Temporary HTTP, connection, timeout, reset, and JSON-response failures use a bounded retry loop with exponential backoff.",
        "Common pagination metadata such as next_page, has_next, and total_pages is followed until completion; page counts are reported from real fetch events.",
        "The source adapter sends no credentials to the browser and supports an explicitly configured proxy through MPLADS_PROXY_URL.",
        "A failed or incomplete validation never replaces the prior promoted dataset.",
    ])
    story += h2("8.3 Configuration")
    story += [P("MPLADS_DATA_SOURCE_URL changes the source endpoint; MPLADS_SYNC_INTERVAL_HOURS controls the cadence; MPLADS_SYNC_DAILY_TIME enables a fixed UTC time; MPLADS_SYNC_TIMEOUT_SECONDS controls request timeout; MPLADS_SYNC_RETRIES controls bounded retries; MPLADS_VERIFY_SSL controls certificate verification; MPLADS_AUTOMATION_ENABLED enables or disables the scheduler. The repository default is 360 hours, but the schedule is configuration-driven.")]

    story += h1("9. Backend API contract")
    story += [P("The FastAPI app in src/backend/app.py is the single serving layer. Analytical responses carry data_version, analysis_version, generated_at, and stale_analysis where relevant. Work detail and original-record routes preserve original values separately from derived analysis.")]
    api_rows = [
        ["GET", "/api/health", "Backend load health."],
        ["GET", "/api/overview", "National portfolio, risk distribution, state metrics, metadata."],
        ["GET", "/api/analytics/overview", "Versioned analytics overview alias."],
        ["GET", "/api/analytics/states", "State-level risk aggregation and methodology."],
        ["GET", "/api/analytics/states/{state}/highest-risk", "Highest-priority work records with original fields."],
        ["GET", "/api/analytics/original-records", "Paginated original values plus derived analysis."],
        ["GET", "/api/state-risk-summary", "Four-signal state profile."],
        ["GET", "/api/risk-monitor", "Filterable paginated audit queue."],
        ["GET", "/api/work-detail[/{work_id}]", "360-degree work record and candidate duplicates."],
        ["GET", "/api/duplicate-candidates, /api/duplicate-clusters", "Pair and cluster review views."],
        ["GET", "/api/mp-intelligence, /api/schedule-risk", "MP portfolio and schedule analytics."],
        ["GET", "/api/compliance/rules, /api/compliance/summary, /api/compliance/constituency", "Guideline matrix and aggregate observations."],
        ["GET", "/api/sync/status, /api/sync/health, /api/sync/history", "Sync status, source telemetry, and audit history."],
        ["POST", "/api/sync/start", "Queue non-blocking synchronization."],
        ["POST", "/api/sync/preview-diff, /api/sync/commit-diff", "Compatibility review and staged commit workflow."],
        ["POST", "/api/sync/training/start", "Queue analysis independently of synchronization."],
        ["GET", "/api/sync/training-status, /api/model/status, /api/model/experiments", "Training and registry status."],
    ]
    story += [data_table(["HTTP", "Route", "Purpose"], api_rows, [18 * mm, 67 * mm, 81 * mm])]

    story += h1("10. Frontend contract and current views")
    story += [P("The React app uses a typed service layer in frontend/src/services/api.ts and typed interfaces in frontend/src/types/index.ts. It uses conditional active-tab rendering in App.tsx rather than React Router. All dashboard values are fetched from the backend; the frontend formats and visualizes responses rather than rebuilding risk logic.")]
    story += [data_table(["View", "Current component", "Current responsibility"], [
        ["Executive Dashboard", "OverviewPage.tsx", "National financial and risk summary with state matrix and charts."],
        ["MP Works and Fund Intelligence", "MpIntelligencePage.tsx", "Cascading state, constituency, and MP portfolio review."],
        ["Risk Intelligence Monitor", "RiskMonitorPage.tsx", "All-signal, financial, duplicate, compliance, and schedule queues."],
        ["State Risk and Records", "StateRiskAnalyticsPage.tsx", "State distribution, highest-risk works, and record inspection."],
        ["Duplicate Inspector", "DuplicateInspectorPage.tsx", "Candidate pair and cluster review."],
        ["Financial Analytics", "FinancialAnalyticsPage.tsx", "Historical cost and anomaly context."],
        ["Data Sync and System Status", "DataSyncPage.tsx", "Background sync, live counters, health, history, and Run Analysis."],
        ["Model Monitoring", "ModelMonitoringPage.tsx", "Registry and training status."],
        ["Project Detail", "ProjectDetailPage.tsx", "Original record, evidence, component explanations, and reviewer action."],
    ], [42 * mm, 48 * mm, 76 * mm])]

    story += h1("11. Security, safety, and limitations")
    story += bullets([
        "No API key, access token, or secret is placed in frontend code or user-visible primary error text.",
        "Raw source records and derived analysis are separated in API contracts and the original-record view.",
        "Current state aggregation is a work-level aggregation of actual records; it is not a precomputed arbitrary state score.",
        "Risk flags are evidence prompts. Missing source fields can result in NOT_EVALUATED, insufficient-history, or partial-evidence states.",
        "Constituency compliance uses observed text and available allocation references; it explicitly tells the reviewer when official area or entitlement evidence is still needed.",
        "The current refresh snapshot has data_version SNAP-2026-09-11T055903Z and analysis_version VALIDATION-SNAPSHOT, so users should resolve the stale-analysis indicator before treating new data as fully analyzed.",
    ])

    story += h1("12. Changed since the previous technology PDF")
    story += bullets([
        "Updated the active data reference from the former 79,068-work documentation snapshot to the current 79,827-work canonical snapshot, while documenting the separate 79,068-row validation artifact state.",
        "Replaced the fixed 15-day sync description with configuration-driven scheduling and a live background job model.",
        "Added /api/sync/start, /api/sync/health, /api/sync/training/start, analytics overview/state/highest-risk/original-record routes, and version metadata.",
        "Added request-level observability, retries, common pagination handling, dataset counters, atomic promotion, and friendly failure handling.",
        "Added State Risk and Records to the UI, with traceable original/derived record separation.",
        "Documented the current guideline-backed compliance scope matrix and historical constituency-specific financial context instead of relying on old hardcoded rule-card claims.",
        "Corrected the frontend description: the app uses conditional tab navigation and backend-driven values, not an independent hardcoded chart-data layer.",
    ])
    story += h1("13. Operating and verification commands")
    story += [P("Install and run:")]
    story += [P("pip install -r requirements.txt\npython src/run_pipeline.py\npython -m uvicorn src.backend.app:app --host 127.0.0.1 --port 8000\ncd frontend\nnpm install\nnpm run dev", "CodeCustom")]
    story += [P("Verification for this refresh passed Python compilation, direct backend smoke checks, and the production frontend build. A live official synchronization was not triggered; that remains an operational action for an authorized deployment.", "SmallCustom")]
    return story


def monitoring_story():
    story = common_cover(
        "Updated operating and monitoring reference",
        "MPLADS AI Monitoring - Detailed Documentation",
        "Reviewer workflows, data lineage, risk interpretation, synchronization operations, APIs, and current repository state",
        "This edition updates the prior 17-page monitoring guide to match the current codebase and adds the operational controls implemented since that guide was written.",
    )

    story += h1("1. Executive summary and system vision")
    story += [P("MPLADS AI Monitoring is an analytical decision-support platform for public-works review. Its job is to help an official move from a portfolio statistic to a specific source record, the derived signal that caused attention, and a recommended verification action.")]
    story += callout("Decision support", "The system uses non-adjudicative governance language. A risk score is not a finding of fraud, corruption, illegality, or ineligible expenditure. It is a prioritization signal that requires source-file and field verification.", PALE_TEAL, TEAL)
    story += [P("The current repository has a version-aware single-source path: official or local source data -> validated Parquet -> master analytical dataset -> component engines -> composite risk artifacts -> FastAPI -> React dashboard. State charts and original-record views are downstream of the same active analytical data, not independent frontend calculations.")]

    story += h1("2. Current architecture")
    story += [ArchitectureStrip(["Official / local data", "Validation + staging", "Canonical Parquet", "Analysis + risk", "API + dashboard"])]
    story += [P("Six monitored table keys are active in the sync adapter: t1 allocation limits, t3 works recommended, t4 works sanctioned, t5 works completed, t6 expenditure, and t7 calamity consents. The t4 sanctioned table is the current master base. The backend observes feature-file changes and clears its in-memory data cache when the promoted master risk artifact changes.")]
    story += [FlowDiagram([
        ("1. Source", "REST endpoint or local raw files"),
        ("2. Normalize", "IDs, dates, amounts, text, administrative fields"),
        ("3. Build", "master_analytical.parquet and feature context"),
        ("4. Score", "financial, duplicate, compliance, schedule, composite"),
        ("5. Publish", "versioned API responses and reviewer views"),
    ], width=170 * mm)]

    story += h1("3. Current data state")
    story += [data_table(["Item", "Current verification value"], [
        ["Active data version", "SNAP-2026-09-11T055903Z"],
        ["Active canonical works", "79,827"],
        ["States and Union Territories in aggregation", "36"],
        ["Completed work records linked", "34,236 in current overview"],
        ["Audit queue threshold", "Composite score >=35; 59,525 current works"],
        ["Current CRITICAL count", "56,327"],
        ["Current analysis version", "VALIDATION-SNAPSHOT"],
        ["Analysis freshness", "Stale relative to active data version; UI exposes this explicitly"],
    ], [62 * mm, 104 * mm])]
    story += [P("The values above are an audit-time snapshot. The dashboard and API are the source of truth after another sync or analysis run.")]

    story += h1("4. End-to-end implementation steps")
    implementation_rows = [
        ["1", "Ingest and standardize", "src/preprocessing/cleaner.py", "Normalize raw source files into processed Parquet."],
        ["2", "Build master", "src/data/master_builder.py", "Link T3, T4, T5, and T6; add classification and material context."],
        ["3", "Financial context", "src/modules/financial_anomaly.py", "Compare against same-constituency completed-work history."],
        ["4", "Duplicate evidence", "src/modules/duplicate_detection.py", "Compare meaningful text and structured evidence within state and constituency."],
        ["5", "Guideline compliance", "src/modules/compliance_engine.py", "Apply work and constituency scope rules with source references."],
        ["6", "Schedule risk", "src/modules/delay_risk.py", "Measure duration, progress gap, overdue days, and peer deviation."],
        ["7", "Composite priority", "src/risk/composite_risk_engine.py", "Combine signals and preserve priority floors."],
        ["8", "Serve", "src/backend/app.py", "Expose sanitized, versioned analytics and original records."],
        ["9", "Operate", "src/data/sync/*.py", "Sync, validate, snapshot, train, observe, and roll back safely."],
        ["10", "Review", "frontend/src/", "Show charts, queues, state drill-down, evidence, and system status."],
    ]
    story += [data_table(["Step", "Capability", "Code", "Current behavior"], implementation_rows, [12 * mm, 35 * mm, 53 * mm, 66 * mm])]

    story.append(PageBreak())
    story += h1("5. Core analytical modules")
    story += h2("5.1 Financial anomaly and cost context")
    story += [P("The active financial implementation is deliberately cautious. It uses completed works in the same constituency and comparable category/work type, computes historical cost and unit-price ranges when evidence exists, and labels insufficient history. It preserves cost_comparison_status, unit_comparison_status, historical ranges, current cost, quantity, and a plain-language explanation. It does not apply a universal external sector price ceiling.")]
    story += h2("5.2 Duplicate, overlap, and split-work candidates")
    story += [P("The detector starts with a state/constituency comparison block, normalizes description text, excludes generic words, retains technical tokens and quantity signatures, and combines content similarity with dates, work-ID distance, cost ratio, quantities, and shared asset/location terms. The output is a candidate relationship for review. Connected components become duplicate or split-work clusters, and the API exposes both pairwise and cluster views.")]
    story += h2("5.3 Compliance and guideline evidence")
    story += [P("Compliance is deterministic and source-backed. The implementation reads the supplied MPLADS 2023 guideline source name into each finding. Work-level rules carry guideline section, required fields, threshold, what happened, why it matters, evidence quality, and review priority. Constituency-level rules are aggregate observations and are kept out of the individual work risk order. A non-guideline heuristic is labelled as such rather than silently converted into a legal rule.")]
    story += [data_table(["Scope", "Examples", "Output treatment"], [
        ["Work", "45-day sanction timing, minimum sanction, completion period, prohibited descriptions, stopped work, movable asset review", "Contributes to work-level compliance evidence and risk."],
        ["Constituency", "SC/ST allocation evidence, repair cap, entity assistance cap, Bar library cap", "Aggregate observation; verify official entitlement and area evidence."],
        ["Non-guideline heuristic", "Duplicate text or sector cost rule", "Kept separate from guideline compliance; not scored as a legal finding."],
    ], [30 * mm, 72 * mm, 64 * mm])]
    story += h2("5.4 Schedule and progress")
    story += [P("The schedule engine derives expected completion from historical category duration when available, otherwise uses a one-year fallback. It compares expected timeline progress with expenditure progress, records overdue days and completion delay, and creates a cautious explanation. The reviewer must verify actual site milestones, revised schedules, and implementing-agency records.")]
    story += h2("5.5 Composite score")
    story += [P("Base score = 0.42 compliance + 0.28 financial + 0.15 duplicate + 0.15 schedule. Severity is LOW below 35, MEDIUM 35-64.99, HIGH 65-84.99, and CRITICAL at 85 or more. The engine applies priority preservation: high compliance and critical compliance cannot be diluted by low scores in other dimensions. The resulting record includes an explainable audit summary and recommended reviewer action.")]
    story += model_trace_story()

    story += h1("6. Reviewer workflows and traceability")
    story += h2("6.1 National and state review")
    story += [P("Executive Overview reads /api/overview. State Risk and Records reads /api/analytics/states and /api/analytics/states/{state}/highest-risk. A state row shows total works, audit-threshold works, risk percentage, financial risks, compliance risks, duplicate risks, and schedule risks. Selecting a state returns the highest-priority source records with risk type, level, score, explanation, constituency, sector, and an original-record block.")]
    story += h2("6.2 Original analysis data")
    story += [P("/api/analytics/original-records returns each item with two explicit objects: original and analysis. Original contains work ID, state, constituency, MP, description, category, dates, status, sanctioned amount, and expenditure. Analysis contains component scores, composite score, overall level, explanations, and triggered rules. This makes a chart finding traceable to the records behind it.")]
    story += h2("6.3 Work detail")
    story += [P("ProjectDetailPage shows the source-facing work profile, component score cards, risk evidence, supporting dates and amounts, classification context, and candidate duplicate records. The UI uses cautious explanations and directs the reviewer to inspect documents and field evidence.")]

    story += h1("7. Synchronization and analysis operations")
    story += [FlowDiagram([
        ("Officer clicks Sync Now", "POST /api/sync/start returns immediately"),
        ("Live job", "QUEUED / RUNNING status is polled by the UI"),
        ("Fetch", "six datasets, retry, timeout, page tracking"),
        ("Validate", "required columns, normalized values, no corrupt promotion"),
        ("Promote", "delta, atomic Parquet replacement, SHA-256 snapshot"),
        ("Analyze", "automatic queue or independent Run Analysis action"),
    ], width=170 * mm)]
    story += h2("7.1 Sync Now behavior")
    story += bullets([
        "The browser does not wait for the full official fetch. It receives a job status and keeps showing the last validated dataset.",
        "The live card reports dataset states, records received, records processed, pages fetched, API requests, and retry count from backend events.",
        "Friendly failure text keeps raw technical details out of the primary message; an optional technical-details disclosure is available for troubleshooting.",
        "The prior promoted dataset remains active if a dataset is missing, invalid, partially retrieved, or fails validation.",
    ])
    story += h2("7.2 Schedule and configuration")
    story += [P("The scheduler is configured by environment variables. Default cadence is 360 hours, equivalent to the former 15-day deployment default, but it is not hardcoded in the UI. MPLADS_SYNC_DAILY_TIME can specify a UTC time, and MPLADS_AUTOMATION_ENABLED can turn automatic scheduling off. Source URL, timeout, retry count, SSL verification, and explicit proxy are server-side configuration.")]
    story += h2("7.3 Analysis update")
    story += [P("Run Analysis queues TrainingManager against the current validated snapshot. The manager stages processed inputs and features, runs the full risk pipeline, validates required artifacts and finite score columns, records drift, backs up production artifacts, and promotes with rollback. The UI shows the real named phase and status; it does not invent a sync percentage.")]

    story += h1("8. API reference")
    api_rows = [
        ["Portfolio", "GET /api/health; /api/overview; /api/analytics/overview", "Backend health, national summary, and versioned overview."],
        ["State analytics", "GET /api/analytics/states; /api/analytics/states/{state}/highest-risk; /api/state-risk-summary", "State aggregation, highest-risk works, and four-signal profile."],
        ["Original records", "GET /api/analytics/original-records", "Paginated original and derived data side by side."],
        ["Audit queue", "GET /api/risk-monitor; /api/schedule-risk", "Filterable risk records and schedule-progress records."],
        ["Record detail", "GET /api/work-detail; /api/work-detail/{work_id}", "Full work profile and candidate duplicates."],
        ["Duplicate review", "GET /api/duplicate-candidates; /api/duplicate-clusters", "Candidate pairs and connected clusters."],
        ["MP and compliance", "GET /api/mp-intelligence; /api/compliance/rules; /api/compliance/summary; /api/compliance/constituency", "Portfolio filtering and guideline evidence."],
        ["Sync operations", "GET /api/sync/status; /api/sync/health; /api/sync/history", "State, telemetry, and durable history."],
        ["Sync commands", "POST /api/sync/start; /api/sync/preview-diff; /api/sync/commit-diff; /api/sync/run-now", "Background sync and compatibility staging actions."],
        ["Training and registry", "GET /api/sync/training-status; /api/model/status; /api/model/experiments; POST /api/sync/training/start", "Analysis lifecycle and model governance."],
        ["Supporting analytics", "GET /api/analytics/material-context; /api/analytics/classification; /api/analytics/sector-cost; /api/sectors; /api/filters", "Traceable context and filter metadata."],
    ]
    story += [data_table(["Area", "Routes", "Contract"], api_rows, [30 * mm, 75 * mm, 59 * mm])]

    story += h1("9. Frontend operating surface")
    story += [data_table(["Navigation", "Current page/component", "What a reviewer can do"], [
        ["Core Portfolio", "OverviewPage.tsx", "See national metrics, state matrix, and dashboard charts."],
        ["Core Portfolio", "MpIntelligencePage.tsx", "Filter by state, constituency, MP, and inspect suspicious works."],
        ["Core Portfolio", "RiskMonitorPage.tsx", "Use all-signal or dimension-specific risk queues."],
        ["Core Portfolio", "StateRiskAnalyticsPage.tsx", "Compare state metrics and open highest-risk records."],
        ["Anomaly and Audits", "DuplicateInspectorPage.tsx", "Review candidate pairs and clusters."],
        ["Anomaly and Audits", "FinancialAnalyticsPage.tsx", "Review historical cost and unit-price context."],
        ["Anomaly and Audits", "RiskMonitorPage.tsx", "Open compliance and schedule dimensions through the shared queue."],
        ["Platform Engine", "DataSyncPage.tsx", "Sync, inspect progress, review health/history, and run analysis."],
        ["Platform Engine", "ModelMonitoringPage.tsx", "Inspect model registry metadata and training runs."],
        ["Any queue", "ProjectDetailPage.tsx", "Open the full record and evidence explanation."],
    ], [32 * mm, 54 * mm, 78 * mm])]

    story += h1("10. Observability, data safety, and limitations")
    story += bullets([
        "sync_history.json is the durable operational history; sync_audit.jsonl is the event trail; sync_job_status.json is the live job state; data/training/status.json is the live analysis state.",
        "Source telemetry records request ID, sync ID, dataset, endpoint, page, timestamp, status, response time, retry count, and error without credentials.",
        "Dataset snapshots store record counts and SHA-256 file hashes under data/snapshots.",
        "Delta identity uses stable work and recommendation-detail identifiers and categorizes NEW, MODIFIED, REMOVED, and unchanged records.",
        "The frontend uses the backend response for values; it does not contain the current portfolio counts or risk percentages as hardcoded dashboard facts.",
        "The active data and analysis versions may diverge. The stale-analysis indicator is intentional and should be acted on before formal reporting.",
        "Results depend on source field quality, descriptions, dates, amounts, evidence flags, and available local comparison history. A candidate relationship is not proof of duplication.",
    ])

    story += h1("11. Changed since the previous monitoring PDF")
    story += bullets([
        "Updated the portfolio baseline from 79,068 to the current active canonical 79,827 works and documented the current 36-state output.",
        "Added State Risk and Records with highest-risk work drill-down and original-versus-derived record separation.",
        "Changed Sync Now from a blocking preview-first interaction to a background job with live status and failure-safe retention of the previous dataset.",
        "Added independent Run Analysis, source health telemetry, request IDs, response time, retry tracking, pagination handling, and version metadata.",
        "Expanded the API catalog to include analytics, original-record, health, training, compliance summary, and duplicate cluster routes.",
        "Updated the compliance description to the current guideline scope matrix and aggregate-versus-work distinction.",
        "Updated navigation and frontend architecture to reflect conditional tab rendering and the current routed page components.",
    ])

    story += h1("12. Verification and operating steps")
    story += [P("Install dependencies, run the pipeline or use an existing validated snapshot, then start the backend and frontend:")]
    story += [P("pip install -r requirements.txt\npython src/run_pipeline.py\npython -m uvicorn src.backend.app:app --host 127.0.0.1 --port 8000\ncd frontend\nnpm install\nnpm run dev", "CodeCustom")]
    story += [P("For a controlled verification, open /docs for the generated API contract, GET /api/overview for version metadata, GET /api/analytics/states for state aggregation, GET /api/analytics/original-records for traceability, and the Data Sync page for health and job status. The documentation refresh itself verified Python compilation, direct backend smoke calls, and the production frontend build; it did not initiate an external official sync.")]
    return story


def main():
    build_doc(os.path.join(OUTPUT_DIR, "MPLADS_AI_Technology_Deep_Dive_Documentation_updated.pdf"), "Technology Deep Dive - Updated", technology_story())
    build_doc(os.path.join(OUTPUT_DIR, "MPLADS_AI_Monitoring_Detailed_Documentation_updated.pdf"), "Detailed Monitoring Documentation - Updated", monitoring_story())


if __name__ == "__main__":
    main()
