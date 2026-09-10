"""TF-IDF + linear SVM classifier backed by the supplied sector cost reference."""
import re
import numpy as np
import pandas as pd
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.svm import LinearSVC
    HAS_SKLEARN = True
except Exception:
    HAS_SKLEARN = False

MPLADS_SECTOR_MATRIX = {
    "SEC01": {
        "name": "Drinking Water Facility",
        "min_cost": 45000, "max_cost": 2500000,
        "min_days": 7, "max_days": 120,
        "primary_risk": "Invoice Inflation / Overlapping Site Duplication"
    },
    "SEC02": {
        "name": "Education",
        "min_cost": 300000, "max_cost": 1000000,
        "min_days": 15, "max_days": 180,
        "primary_risk": "Project Splitting / Hardware Kickbacks"
    },
    "SEC03": {
        "name": "Public Health & Sanitation",
        "min_cost": 800000, "max_cost": 3500000,
        "min_days": 30, "max_days": 270,
        "primary_risk": "Cost Escalation / Fake Asset Procurement"
    },
    "SEC04": {
        "name": "Roads, Pathways & Bridges",
        "min_cost": 300000, "max_cost": 3000000,
        "min_days": 60, "max_days": 120,
        "primary_risk": "Cost Inflation per Meter / Ghost Infrastructure"
    },
    "SEC05": {
        "name": "Electricity & Energy",
        "min_cost": 18000, "max_cost": 450000,
        "min_days": 7, "max_days": 30,
        "primary_risk": "Back-to-Back Splitting / Phantom Inventory"
    },
    "SEC06": {
        "name": "Agriculture & Allied",
        "min_cost": 500000, "max_cost": 4000000,
        "min_days": 45, "max_days": 270,
        "primary_risk": "Private Trust Exploitation / Ownership Fraud"
    },
    "SEC07": {
        "name": "Irrigation & Flood Control",
        "min_cost": 200000, "max_cost": 2500000,
        "min_days": 15, "max_days": 150,
        "primary_risk": "Paper-Only Earthwork / False Engineering Clearances"
    },
    "SEC08": {
        "name": "Sports & Youth Welfare",
        "min_cost": 200000, "max_cost": 5000000,
        "min_days": 15, "max_days": 365,
        "primary_risk": "Equipment Maintenance Bypassing / Delayed Completion"
    },
    "SEC09": {
        "name": "Railways & Utilities",
        "min_cost": 500000, "max_cost": 4000000,
        "min_days": 60, "max_days": 240,
        "primary_risk": "Jurisdictional Delay Fund Hoarding / Tender Collusion"
    },
    "SEC10": {
        "name": "Community Buildings",
        "min_cost": 600000, "max_cost": 3000000,
        "min_days": 120, "max_days": 270,
        "primary_risk": "Rapid Payout Risk / Banned Commercial Space Allocation"
    },
    "SEC11": {
        "name": "Public Safety & Security",
        "min_cost": 200000, "max_cost": 1200000,
        "min_days": 30, "max_days": 90,
        "primary_risk": "Overpriced Software & Hardware Licensing Fees"
    }
}

SECTOR_PHRASES = {
    "Tube Well & Hand Pump": ["tube well", "tubewell", "hand pump", "borewell", "bore well", "deep tube well"],
    "Piped Water System": ["water supply", "drinking water", "water pipeline", "water tank", "overhead tank", "oht", "piped water"],
    "Primary School Classroom": ["school", "classroom", "school building", "school room", "education", "student hostel", "public library", "primary school", "secondary school"],
    "School Computer Lab": ["computer lab", "computer laboratory", "computer equipment"],
    "Sub-Centre Building": ["hospital", "health centre", "health center", "phc", "primary health", "sub centre", "sub-centre", "dispensary", "clinic", "community toilet", "public toilet"],
    "Government Ambulance": ["ambulance", "government ambulance"],
    "Concrete Village Road (Per KM)": ["cc road", "concrete road", "cement concrete road", "village road", "approach road", "link road", "road construction", "pedestrian path", "concrete path", "pathway"],
    "Culvert / Small Bridge": ["bridge", "culvert", "causeway", "rcc bridge", "small bridge"],
    "Solar Street Lights (Per Unit)": ["solar street", "solar light", "solar lights", "solar streetlight"],
    "Street Light System (Unspecified)": ["street light", "led street light", "led light"],
    "High Mast Light System (12m/9-Light)": ["12m high mast", "12 m high mast", "9 light high mast", "12m/9"],
    "High Mast Light System (9m/3-Light)": ["9m high mast", "9 m high mast", "3 light high mast", "9m/3"],
    "High Mast Light System (Unspecified)": ["highmast lights", "high mast lights", "highmast light", "high mast light", "high-mast electric"],
    "Common Storage Godown": ["godown", "storage shed", "storage building", "warehouse", "storage godown", "crop drying yard", "drying yard"],
    "Check Dam Construction": ["check dam", "irrigation canal", "canal", "water harvesting", "farm pond", "desilting", "village pond", "storm water drain", "stormwater drain", "village drain"],
    "Open Gym & Playground Development": ["open gym", "playground", "play ground", "sports ground", "stadium", "sports complex", "sports hall"],
    "Passenger Platform Shelter": ["railway", "railway platform", "platform shelter", "footbridge", "foot over bridge", "railway station"],
    "Community Hall / Sansad Bhavan": ["community hall", "community bhavan", "sansad bhavan", "multipurpose hall", "public hall", "senior citizen shelter", "panchayat office extension"],
    "Strategic Intersection CCTV Network": ["cctv", "surveillance camera", "intersection camera", "cctv network", "crime monitoring"],
}

def _clean(value):
    text = re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", "" if pd.isna(value) else str(value).lower())).strip()
    replacements = {
        "streetlights": "street light", "street lights": "street light",
        "led lights": "led light", "solar lights": "solar light",
        "highmast lights": "high mast light", "highmast light": "high mast light",
        "purchased": "purchase", "procured": "purchase", "procurement": "purchase",
        "bhawans": "bhavan", "bridges": "bridge", "roads": "road",
        "culverts": "culvert", "classrooms": "classroom", "toilets": "toilet",
    }
    for source, target in replacements.items():
        text = re.sub(r"(?<!\w)" + re.escape(source) + r"(?!\w)", target, text)
    return text

def _quantity(text):
    patterns = [
        # Pattern 1: e.g. 286 pc, 286 pcs, 10 nos, 50 units, 100 lights, 5 sets, 20 classrooms
        r"(?<!\w)(\d+(?:\.\d+)?)\s*(?:pcs?\.?|pieces?|nos?\.?|numbers?|units?|poles?|lights?|classrooms?|rooms?|ambulances?|hand pumps?|tube wells?|culverts?|bridges?|sets?)\b",
        # Pattern 2: e.g. 12m high mast 5 lights, 10 high mast lights
        r"(?<!\w)(\d+(?:\.\d+)?)\s*(?:(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*)?(?:led\s+)?(?:highmast|high\s+mast|solar\s+street|solar)\s*(?:\s+electric)?\s+lights?\b",
        # Pattern 3: kilometers / meters
        r"\b(\d+(?:\.\d+)?)\s*(?:km|kilomet(?:er|re)s?|meters?|mtrs?)\b",
        # Pattern 4: unit keyword followed by number e.g. "pc 286", "nos 50"
        r"\b(?:pc|pcs|pieces|nos|no|units|sets|lights|poles)\s*(\d+(?:\.\d+)?)\b",
    ]
    for pattern in patterns:
        hit = re.search(pattern, text, re.I)
        if hit:
            val = float(hit.group(1))
            if val > 0:
                return val, "units", "description"
    return None, None, None

def classify_and_cost(df, reference_path):
    ref = pd.read_csv(reference_path)
    descriptions = df["sanctioned_work_description"].fillna(df["description"]).map(_clean)
    quantities = [_quantity(text) for text in descriptions]
    labels, confidence, matched = [], [], []
    for text in descriptions:
        hits = [(len(p), label, p) for label, phrases in SECTOR_PHRASES.items() for p in phrases if re.search(r"(?<!\w)" + re.escape(p) + r"(?!\w)", text)]
        if hits:
            hits.sort(reverse=True); labels.append(hits[0][1]); confidence.append(0.98 if len(hits[0][2].split()) > 1 else 0.92); matched.append([x[2] for x in hits])
        else:
            labels.append("Unclassified"); confidence.append(0.0); matched.append([])
    rule_mask = np.array(confidence) >= .92
    if HAS_SKLEARN and rule_mask.sum() >= 20 and len(set(np.array(labels)[rule_mask])) > 1:
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), analyzer="word", min_df=2, max_features=60000)
        model = LinearSVC(class_weight="balanced", random_state=42)
        model.fit(vectorizer.fit_transform(descriptions[rule_mask]), np.array(labels)[rule_mask])
        unknown = np.flatnonzero(~rule_mask)
        if len(unknown):
            decision = model.decision_function(vectorizer.transform(descriptions.iloc[unknown]))
            if decision.ndim == 1: decision = np.column_stack([-decision, decision])
            order = np.argsort(decision, axis=1)
            for pos, idx in enumerate(unknown):
                margin = float(decision[pos, order[pos, -1]] - decision[pos, order[pos, -2]])
                if margin >= 0.25:
                    labels[idx] = model.classes_[order[pos, -1]]; confidence[idx] = min(0.89, 0.60 + margin / 4); matched[idx] = []
    electricity_unspecified = {"High Mast Light System (Unspecified)", "Street Light System (Unspecified)"}
    result = pd.DataFrame({"sector_id": [ref.loc[ref.Sub_Sector.eq(x), "Sector_ID"].iloc[0] if x != "Unclassified" and any(ref.Sub_Sector.eq(x)) else ("SEC05" if x in electricity_unspecified else None) for x in labels], "main_sector": [ref.loc[ref.Sub_Sector.eq(x), "Main_Sector"].iloc[0] if x != "Unclassified" and any(ref.Sub_Sector.eq(x)) else ("Electricity" if x in electricity_unspecified else "Other / Unclassified") for x in labels], "ai_work_category": labels, "effective_work_category": labels, "work_subcategory": labels, "category_confidence": np.round(confidence, 3), "category_source": ["RULE" if m else ("SVM" if c else "FALLBACK") for m, c in zip(matched, confidence)], "category_keywords_matched": matched}, index=df.index)
    result["classification_reason"] = result.apply(lambda r: "Matched indicators: " + ", ".join(r.category_keywords_matched[:5]) if r.category_keywords_matched else "SVM classification or no reference phrase matched", axis=1)
    result["quantity_detected"] = [q[0] for q in quantities]
    result["quantity_unit"] = [q[1] for q in quantities]
    result["quantity_source"] = [q[2] for q in quantities]
    result["base_avg_cost_inr"] = [float(ref.loc[ref.Sub_Sector.eq(x), "Base_Avg_Cost_INR"].iloc[0]) if x != "Unclassified" and any(ref.Sub_Sector.eq(x)) else np.nan for x in labels]
    state = df["state"].fillna("").astype(str).str.upper()
    result["regional_multiplier"] = np.where(state.isin(["UTTAR PRADESH", "BIHAR"]), 1.0, np.where(state.str.contains("ARUNACHAL|ASSAM|MANIPUR|MEGHALAYA|MIZORAM|NAGALAND|SIKKIM|TRIPURA", regex=True), 1.5, np.where(state.isin(["KARNATAKA", "TAMIL NADU", "TELANGANA", "ANDHRA PRADESH", "KERALA"]), 1.1, 1.1)))
    result["reference_expected_cost_inr"] = result["base_avg_cost_inr"] * result["regional_multiplier"]
    result["reference_unit_cost_inr"] = result["reference_expected_cost_inr"]
    result["reference_total_cost_inr"] = result["reference_unit_cost_inr"] * result["quantity_detected"]
    # A generic high-mast description has no height/light-count subtype. Keep
    # both supplied SEC05 prices as an indicative range rather than inventing
    # a subtype, and use the midpoint only for contextual comparison.
    hm = result["ai_work_category"].eq("High Mast Light System (Unspecified)")
    result["reference_unit_cost_min_inr"] = np.where(hm, 180000 * result["regional_multiplier"], result["reference_unit_cost_inr"])
    result["reference_unit_cost_max_inr"] = np.where(hm, 450000 * result["regional_multiplier"], result["reference_unit_cost_inr"])
    result["reference_total_cost_min_inr"] = result["reference_unit_cost_min_inr"] * result["quantity_detected"]
    result["reference_total_cost_max_inr"] = result["reference_unit_cost_max_inr"] * result["quantity_detected"]
    result["reference_total_cost_inr"] = result["reference_total_cost_inr"].where(~hm, (result["reference_total_cost_min_inr"] + result["reference_total_cost_max_inr"]) / 2)
    result["reference_unit_cost_inr"] = result["reference_unit_cost_inr"].where(~hm, (result["reference_unit_cost_min_inr"] + result["reference_unit_cost_max_inr"]) / 2)
    replace = [c for c in result.columns if c in df.columns]
    return pd.concat([df.drop(columns=replace), result], axis=1)
