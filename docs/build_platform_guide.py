from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, PageBreak, KeepTogether
)

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "MPLADS_Platform_User_and_Model_Guide.pdf"
SOURCE = ROOT / "MPLADS_PLATFORM_GUIDE.md"


class Workflow(Flowable):
    """Compact pictograph of the end-to-end analytics workflow."""
    def __init__(self):
        super().__init__()
        self.width = 170 * mm
        self.height = 58 * mm

    def draw(self):
        c = self.canv
        boxes = [
            (5, 31, 27, 16, "1\nCSV /\nParquet"),
            (38, 31, 27, 16, "2\nClean +\nvalidate"),
            (71, 31, 27, 16, "3\nClassify\nsector"),
            (104, 31, 27, 16, "4\nRun risk\nmodels"),
            (137, 31, 27, 16, "5\nDashboard +\nAPI"),
        ]
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.HexColor("#123B5D"))
        c.setStrokeColor(colors.HexColor("#2C6E91"))
        for x, y, w, h, txt in boxes:
            c.setFillColor(colors.HexColor("#EAF4F8"))
            c.roundRect(x * mm, y * mm, w * mm, h * mm, 2 * mm, fill=1, stroke=1)
            c.setFillColor(colors.HexColor("#123B5D"))
            lines = txt.split("\n")
            for i, line in enumerate(lines):
                c.drawCentredString((x + w / 2) * mm, (y + h - 5 - i * 4) * mm, line)
        c.setStrokeColor(colors.HexColor("#D88B3A"))
        c.setLineWidth(1.3)
        for x in [32, 65, 98, 131]:
            c.line(x * mm, 39 * mm, (x + 5) * mm, 39 * mm)
            c.line((x + 5) * mm, 39 * mm, (x + 3) * mm, 40.5 * mm)
            c.line((x + 5) * mm, 39 * mm, (x + 3) * mm, 37.5 * mm)
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor("#123B5D"))
        c.drawString(7 * mm, 22 * mm, "Parallel model checks")
        labels = ["Financial anomaly", "Compliance rules", "Duplicate / split", "Completion delay"]
        for i, label in enumerate(labels):
            x = 7 + i * 33
            c.setFillColor(colors.HexColor("#FFF4E5"))
            c.setStrokeColor(colors.HexColor("#D88B3A"))
            c.roundRect(x * mm, 10 * mm, 29 * mm, 8 * mm, 1.5 * mm, fill=1, stroke=1)
            c.setFillColor(colors.HexColor("#593B16"))
            c.setFont("Helvetica", 6.3)
            c.drawCentredString((x + 14.5) * mm, 13 * mm, label)
        c.setStrokeColor(colors.HexColor("#D88B3A"))
        c.line(90 * mm, 31 * mm, 90 * mm, 18 * mm)
        c.line(90 * mm, 18 * mm, 90 * mm, 18 * mm)
        c.setFillColor(colors.HexColor("#123B5D"))
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(90 * mm, 4 * mm, "Composite risk = compliance-first decision layer + explainable evidence")


def page_header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D9E3EA"))
    canvas.line(18 * mm, 15 * mm, 192 * mm, 15 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#5C6B73"))
    canvas.drawString(18 * mm, 10 * mm, "MPLADS Intelligence Platform | User and Model Guide")
    canvas.drawRightString(192 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=colors.HexColor("#123B5D"), alignment=TA_CENTER, spaceAfter=8))
styles.add(ParagraphStyle(name="Subtitle", parent=styles["Normal"], fontSize=10, leading=14, alignment=TA_CENTER, textColor=colors.HexColor("#5C6B73"), spaceAfter=14))
styles.add(ParagraphStyle(name="H1Custom", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#123B5D"), spaceBefore=12, spaceAfter=7))
styles.add(ParagraphStyle(name="H2Custom", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=colors.HexColor("#1D5978"), spaceBefore=9, spaceAfter=4))
styles.add(ParagraphStyle(name="BodyCustom", parent=styles["BodyText"], fontSize=8.8, leading=12.2, spaceAfter=5, textColor=colors.HexColor("#26343B")))
styles.add(ParagraphStyle(name="BulletCustom", parent=styles["BodyText"], fontSize=8.5, leading=11.5, leftIndent=12, firstLineIndent=-7, bulletIndent=2, spaceAfter=2, textColor=colors.HexColor("#26343B")))
styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=7.4, leading=9.5, textColor=colors.HexColor("#40515A")))


def clean(text):
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    return text.replace("&", "&amp;") if "<font" not in text and "<b>" not in text else text


def make_table(rows):
    data = [[clean(x.strip()) for x in row] for row in rows]
    if not data:
        return Spacer(1, 1)
    cols = len(data[0])
    widths = [175 * mm / cols] * cols
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DCECF3")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#123B5D")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("LEADING", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#AFC5CF")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAFB")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def build_story():
    story = [
        Spacer(1, 14 * mm),
        Paragraph("MPLADS Intelligence Platform", styles["TitleCustom"]),
        Paragraph("Complete website, data, workflow, model and operations guide", styles["Subtitle"]),
        Paragraph("Purpose", styles["H2Custom"]),
        Paragraph("This guide explains what the website does, how data moves through it, what every model checks, which conditions trigger findings, how risk is calculated, and what an operator should do with the results. It reflects the integrated 2023 MPLADS guidelines used by the current build.", styles["BodyCustom"]),
        Workflow(), Spacer(1, 6),
        Paragraph("Reading this guide", styles["H2Custom"]),
        Paragraph("The platform is an explainable screening and decision-support system. A model finding is evidence for review, not an automatic legal conclusion. Final sanction, rejection, inspection and release decisions remain with the authorized administration.", styles["BodyCustom"]),
        PageBreak(),
    ]
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    i = 0
    skip_intro = True
    while i < len(lines):
        line = lines[i].rstrip()
        if skip_intro:
            if line.startswith("## "):
                skip_intro = False
            else:
                i += 1
                continue
        if not line:
            i += 1
            continue
        if line.startswith("## "):
            story.append(Paragraph(clean(line[3:]), styles["H1Custom"]))
            i += 1
            continue
        if line.startswith("### "):
            story.append(Paragraph(clean(line[4:]), styles["H2Custom"]))
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                raw = [x.strip() for x in lines[i].strip().strip("|").split("|")]
                if not all(set(x) <= set("-: ") for x in raw):
                    rows.append(raw)
                i += 1
            if rows:
                story += [make_table(rows), Spacer(1, 5)]
            continue
        if line.startswith("- ") or line.startswith("* "):
            story.append(Paragraph("• " + clean(line[2:]), styles["BulletCustom"]))
            i += 1
            continue
        if re.match(r"^\d+\. ", line):
            story.append(Paragraph(clean(line), styles["BulletCustom"]))
            i += 1
            continue
        if line.startswith("> "):
            story.append(Paragraph(clean(line[2:]), styles["Small"]))
            i += 1
            continue
        para = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(##|###|[-*] |\||> |\d+\. )", lines[i]):
            para.append(lines[i].strip())
            i += 1
        story.append(Paragraph(clean(" ".join(para)), styles["BodyCustom"]))
    return story


def main():
    frame = Frame(18 * mm, 20 * mm, 174 * mm, 257 * mm, id="normal", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc = BaseDocTemplate(str(OUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=18 * mm, bottomMargin=20 * mm, title="MPLADS Intelligence Platform - Complete User and Model Guide", author="SIH")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page_header_footer)])
    doc.build(build_story())
    print(OUT)


if __name__ == "__main__":
    main()
