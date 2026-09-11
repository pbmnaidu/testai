import os
import re
from decimal import Decimal, InvalidOperation
import pandas as pd
import numpy as np
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    HAS_SKLEARN = True
except Exception:
    HAS_SKLEARN = False

def normalize_description(text):
    if pd.isna(text):
        return ""
    # Lowercase
    s = str(text).lower()
    # Strip Work ID prefixes if present in description text
    s = re.sub(r"ws/mp[a-z0-9/\-_]+", "", s)
    # Strip punctuation and numbers
    s = re.sub(r"[^\w\s]", " ", s)
    # Strip excess whitespaces
    s = re.sub(r"\s+", " ", s).strip()
    return s


# These are document-reference placeholders, not descriptions of the work.
# They must not create a duplicate candidate merely because two records both
# say "as per attachment" (including common spelling variants in exports).
_GENERIC_DESCRIPTION_PATTERNS = (
    re.compile(r"^(?:as per|as given in|as mentioned in|as shown in)\s+(?:the\s+)?(?:attached|attachment|attachement|attechment|enclosure|annexure|annex|estimate|proposal|drawing|details?)$"),
    re.compile(r"^(?:attached|attachment|attachement|attechment|enclosure|annexure|annex|details?)\s+(?:as per|as given|as mentioned|as above)$"),
    re.compile(r"^(?:same as|refer to|see)\s+(?:attached|attachment|attachement|attechment|enclosure|annexure|annex|details?)$"),
)


def is_generic_description(text):
    """Return True when text is only a document-reference placeholder."""
    normalized = normalize_description(text)
    return not normalized or any(pattern.fullmatch(normalized) for pattern in _GENERIC_DESCRIPTION_PATTERNS)


def _preferred_similarity_description(recommended, sanctioned):
    """Choose the description used for cross-work similarity.

    Recommendation text is the primary work identity.  A sanctioned value is
    used only when the recommendation is missing or is a document-reference
    placeholder.  This prevents a repeated "as per attachment" value from
    overriding the actual recommended work description.
    """
    for value in (recommended, sanctioned):
        if _not_blank(value) and not is_generic_description(value):
            return str(value).strip()
    return ""


# Numeric quantities are part of a work's identity.  A text-only similarity
# model treats "47 high mast lights" and "65 high mast lights" as almost the
# same work, although they represent different procurements.  These aliases
# are deliberately grouped by physical dimension so equivalent spellings
# (for example km/m or kW/watt) can be compared safely.
_NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
    "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}

_UNIT_PHRASES = {
    # Count / procurement quantities.
    "piece": ("count", 1.0), "pieces": ("count", 1.0), "pc": ("count", 1.0),
    "pcs": ("count", 1.0), "no": ("count", 1.0), "nos": ("count", 1.0),
    "number": ("count", 1.0), "numbers": ("count", 1.0), "unit": ("count", 1.0),
    "units": ("count", 1.0), "item": ("count", 1.0), "items": ("count", 1.0),
    "place": ("count", 1.0), "places": ("count", 1.0), "light": ("count", 1.0),
    "lights": ("count", 1.0), "pole": ("count", 1.0), "poles": ("count", 1.0),
    "mast": ("count", 1.0), "masts": ("count", 1.0), "road": ("count", 1.0),
    "roads": ("count", 1.0), "bridge": ("count", 1.0), "bridges": ("count", 1.0),
    # Length / area / weight / capacity.
    "km": ("length_m", 1000.0), "kms": ("length_m", 1000.0),
    "kilometer": ("length_m", 1000.0), "kilometers": ("length_m", 1000.0),
    "kilometre": ("length_m", 1000.0), "kilometres": ("length_m", 1000.0),
    "m": ("length_m", 1.0), "meter": ("length_m", 1.0), "meters": ("length_m", 1.0),
    "metre": ("length_m", 1.0), "metres": ("length_m", 1.0),
    "cm": ("length_m", 0.01), "mm": ("length_m", 0.001),
    "ft": ("length_m", 0.3048), "feet": ("length_m", 0.3048),
    "foot": ("length_m", 0.3048), "acre": ("area_m2", 4046.8564224),
    "acres": ("area_m2", 4046.8564224), "hectare": ("area_m2", 10000.0),
    "hectares": ("area_m2", 10000.0), "ha": ("area_m2", 10000.0),
    "sqm": ("area_m2", 1.0), "kg": ("weight_kg", 1.0), "kgs": ("weight_kg", 1.0),
    "kilogram": ("weight_kg", 1.0), "kilograms": ("weight_kg", 1.0),
    "ton": ("weight_kg", 1000.0), "tons": ("weight_kg", 1000.0),
    "tonne": ("weight_kg", 1000.0), "tonnes": ("weight_kg", 1000.0),
    "litre": ("volume_l", 1.0), "litres": ("volume_l", 1.0),
    "liter": ("volume_l", 1.0), "liters": ("volume_l", 1.0),
    "ml": ("volume_l", 0.001), "millilitre": ("volume_l", 0.001),
    "millilitres": ("volume_l", 0.001),
    # Equipment specifications and monetary quantities are also identity
    # signals when present in the work description.
    "w": ("power_w", 1.0), "watt": ("power_w", 1.0), "watts": ("power_w", 1.0),
    "kw": ("power_w", 1000.0), "kva": ("power_va", 1000.0), "va": ("power_va", 1.0),
    "hp": ("power_hp", 1.0), "volt": ("voltage_v", 1.0), "volts": ("voltage_v", 1.0),
    "v": ("voltage_v", 1.0), "rs": ("money_inr", 1.0),
    "rupee": ("money_inr", 1.0), "rupees": ("money_inr", 1.0),
    "inr": ("money_inr", 1.0), "lakh": ("money_inr", 100000.0),
    "lakhs": ("money_inr", 100000.0), "lac": ("money_inr", 100000.0),
    "lacs": ("money_inr", 100000.0), "crore": ("money_inr", 10000000.0),
    "crores": ("money_inr", 10000000.0),
}

_COMPOUND_UNIT_PHRASES = {
    ("sq", "ft"): ("area_m2", 0.092903),
    ("sq", "feet"): ("area_m2", 0.092903),
    ("square", "ft"): ("area_m2", 0.092903),
    ("square", "foot"): ("area_m2", 0.092903),
    ("square", "feet"): ("area_m2", 0.092903),
    ("sq", "m"): ("area_m2", 1.0),
    ("square", "m"): ("area_m2", 1.0),
    ("square", "meter"): ("area_m2", 1.0),
    ("square", "meters"): ("area_m2", 1.0),
    ("square", "metre"): ("area_m2", 1.0),
    ("square", "metres"): ("area_m2", 1.0),
}

_TOKEN_RE = re.compile(r"\d+(?:,\d{3})*(?:\.\d+)?|[a-z]+")


def _quantity_number(token):
    """Return a numeric token value, including common number words."""
    if token in _NUMBER_WORDS:
        return float(_NUMBER_WORDS[token])
    try:
        return float(Decimal(token.replace(",", "")))
    except (InvalidOperation, ValueError):
        return None


def _quantity_unit_after(tokens, index):
    """Find a unit immediately after a number, allowing one connector word."""
    if index > 0 and tokens[index - 1] in {"rs", "rupee", "rupees", "inr"}:
        return "money_inr", 1.0
    for phrase, unit in _COMPOUND_UNIT_PHRASES.items():
        end = index + 1 + len(phrase)
        if tuple(tokens[index + 1:end]) == phrase:
            return unit
    for offset in (1, 2):
        if index + offset >= len(tokens):
            continue
        token = tokens[index + offset]
        if token in {"of", "in", "at", "long", "wide", "high", "capacity"}:
            continue
        if token in _UNIT_PHRASES:
            return _UNIT_PHRASES[token]
        # A non-unit directly after the number means this is a bare count;
        # do not scan farther and accidentally attach a later specification.
        if offset == 1:
            break
    return "count", 1.0


def extract_quantity_signature(text):
    """Extract normalized quantity/unit identity from a work description.

    The signature is intentionally conservative: if either description
    contains a quantity, both descriptions must expose the same normalized
    quantities for the pair to be a duplicate candidate.  Years are ignored,
    while bare quantities are retained because government descriptions often
    say ``47 lights`` or ``65 places`` without an explicit unit token.
    """
    if not _not_blank(text):
        return ()
    tokens = _TOKEN_RE.findall(str(text).lower())
    quantities = set()
    for index, token in enumerate(tokens):
        value = _quantity_number(token)
        if value is None or (1900 <= value <= 2100 and value.is_integer()):
            continue
        unit, multiplier = _quantity_unit_after(tokens, index)
        normalized = round(value * multiplier, 6)
        # Treat the same quantity repeated in Recommended and Sanctioned
        # descriptions as one identity signal, not as two quantities.
        quantities.add((unit, normalized))
    return tuple(sorted(quantities))


def _quantity_signature_text(signature):
    return "; ".join(f"{unit}={value:g}" for unit, value in signature) if signature else ""


def _quantity_pair_compatibility(left, right):
    """Return whether both works have the same quantity/unit identity."""
    left_signature = extract_quantity_signature(left)
    right_signature = extract_quantity_signature(right)
    return _quantity_signature_compatibility(left_signature, right_signature)


def _quantity_signature_compatibility(left_signature, right_signature):
    """Compare two already-extracted quantity signatures."""
    # A missing quantity is not an identity match.  Otherwise two generic or
    # quantity-free descriptions would be treated as duplicates because an
    # empty signature compared equal to another empty signature.
    if not left_signature or not right_signature:
        return False, "MISSING_QUANTITY"
    if left_signature == right_signature:
        return True, "MATCH"
    return False, "MISMATCH"


def _not_blank(value):
    if value is None:
        return False
    try:
        if pd.isna(value):
            return False
    except (TypeError, ValueError):
        pass
    return bool(str(value).strip())


def _comparison_identity(work_id):
    """Align the recommended and sanctioned IDs for the same logical work."""
    value = str(work_id or "").strip()
    return re.sub(r"/(?:REC|SANC|RECOMMENDED|SANCTIONED)(?=/|$)", "", value, flags=re.IGNORECASE)


def _first_value(frame, column):
    if column not in frame.columns:
        return None
    for value in frame[column].tolist():
        if _not_blank(value):
            return value
    return None


def _unique_description_values(*values):
    result = []
    seen = set()
    for value in values:
        if not _not_blank(value):
            continue
        text = str(value).strip()
        normalized = normalize_description(text)
        if normalized and normalized not in seen:
            result.append(text)
            seen.add(normalized)
    return result


def _load_comparison_corpus(processed_dir):
    """Combine recommended and sanctioned descriptions for duplicate analysis.

    T3 and T4 use different prefixes in some local exports (for example
    ``WS/REC/000001`` and ``WS/SANC/000001``).  The stage segment is removed
    only for comparison identity, while the sanctioned ID remains the
    user-facing ID when both stages are present.
    """
    source_files = (
        ("recommended", os.path.join(processed_dir, "t3_works_recommended.parquet")),
        ("sanctioned", os.path.join(processed_dir, "t4_works_sanctioned.parquet")),
    )
    parts = []
    part_map = {}
    needed_columns = [
        "work_id", "description", "state", "constituency", "mp_name", "work_category",
        "sanction_amount", "sanction_date", "work_status", "recommended_amount", "recommended_date",
    ]
    for source, path in source_files:
        if not os.path.exists(path):
            continue
        frame = pd.read_parquet(path)
        if frame.empty:
            continue
        frame = frame.copy()
        if "work_id" not in frame.columns:
            continue
        frame["work_id"] = frame["work_id"].fillna("").astype(str).str.strip()
        frame = frame[frame["work_id"].ne("")].copy()
        for column in needed_columns:
            if column not in frame.columns:
                frame[column] = np.nan if column.endswith(("_amount", "_date")) else ""
        frame = frame[needed_columns].copy()
        frame["source_description"] = frame["description"].fillna("").astype(str).str.strip()
        frame["comparison_identity"] = frame["work_id"].map(_comparison_identity)
        frame = frame.drop_duplicates("comparison_identity", keep="first").set_index("comparison_identity")
        parts.append(frame)
        part_map[source] = frame

    if not parts:
        return pd.DataFrame()

    recommended = part_map.get("recommended")
    sanctioned = part_map.get("sanctioned")
    identities = []
    for frame in (recommended, sanctioned):
        if frame is not None:
            identities.extend(frame.index.tolist())
    identities = pd.Index(dict.fromkeys(identities), name="comparison_identity")
    result = pd.DataFrame(index=identities)

    def stage_column(frame, column, default=""):
        if frame is None or column not in frame.columns:
            return pd.Series(default, index=identities)
        return frame[column].reindex(identities).fillna(default)

    rec_id = stage_column(recommended, "work_id")
    sanc_id = stage_column(sanctioned, "work_id")
    rec_desc = stage_column(recommended, "source_description")
    sanc_desc = stage_column(sanctioned, "source_description")
    result["recommended_description"] = rec_desc
    result["sanctioned_description"] = sanc_desc
    result["similarity_description"] = [
        _preferred_similarity_description(rec, sanc)
        for rec, sanc in zip(rec_desc.tolist(), sanc_desc.tolist())
    ]
    result["recommended_work_id"] = rec_id
    result["sanctioned_work_id"] = sanc_id
    result["work_id"] = sanc_id.where(sanc_id.astype(str).str.strip().ne(""), rec_id)
    result["description"] = [
        " | ".join(_unique_description_values(rec, sanc))
        for rec, sanc in zip(rec_desc.tolist(), sanc_desc.tolist())
    ]
    has_rec = rec_id.astype(str).str.strip().ne("")
    has_sanc = sanc_id.astype(str).str.strip().ne("")
    result["comparison_source"] = np.select(
        [has_rec & has_sanc, has_rec, has_sanc],
        ["recommended+sanctioned", "recommended", "sanctioned"],
        default="",
    )

    # Keep sanctioned context when both stages contain the work, while
    # preserving recommendation-specific amount/date fields.
    for column in ("state", "constituency", "mp_name", "work_category", "sanction_amount", "sanction_date", "work_status"):
        sanc_values = stage_column(sanctioned, column, np.nan if column.endswith(("_amount", "_date")) else "")
        rec_values = stage_column(recommended, column, np.nan if column.endswith(("_amount", "_date")) else "")
        has_sanctioned_value = sanc_values.notna() if column.endswith(("_amount", "_date")) else sanc_values.astype(str).str.strip().ne("")
        result[column] = sanc_values.where(has_sanctioned_value, rec_values)
    for column in ("recommended_amount", "recommended_date"):
        rec_values = stage_column(recommended, column, np.nan)
        sanc_values = stage_column(sanctioned, column, np.nan)
        result[column] = rec_values.where(rec_values.notna(), sanc_values)
    return result.reset_index()


def _pair_metadata(row, suffix):
    return {
        f"source_dataset_{suffix}": row.get("comparison_source", ""),
        f"recommended_description_{suffix}": row.get("recommended_description", ""),
        f"sanctioned_description_{suffix}": row.get("sanctioned_description", ""),
        f"recommended_work_id_{suffix}": row.get("recommended_work_id", ""),
        f"sanctioned_work_id_{suffix}": row.get("sanctioned_work_id", ""),
    }


def _pair_quantity_metadata(left, right):
    left_signature = left.get("quantity_signature_data")
    right_signature = right.get("quantity_signature_data")
    if not isinstance(left_signature, tuple):
        left_signature = extract_quantity_signature(left.get("description", ""))
    if not isinstance(right_signature, tuple):
        right_signature = extract_quantity_signature(right.get("description", ""))
    compatible, status = _quantity_signature_compatibility(left_signature, right_signature)
    return {
        "quantity_signature_1": _quantity_signature_text(left_signature),
        "quantity_signature_2": _quantity_signature_text(right_signature),
        "quantity_identity_match": compatible,
        "quantity_identity_status": status,
    }

def run_duplicate_work_detection():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    processed_dir = os.environ.get("PROCESSED_DIR", os.path.join(base_dir, "data", "processed"))
    features_dir = os.environ.get("FEATURES_DIR", os.path.join(base_dir, "data", "features"))
    
    master_path = os.path.join(features_dir, "master_analytical.parquet")

    t3_path = os.path.join(processed_dir, "t3_works_recommended.parquet")
    t4_path = os.path.join(processed_dir, "t4_works_sanctioned.parquet")
    if not os.path.exists(t3_path) and not os.path.exists(t4_path):
        raise FileNotFoundError(f"Recommended and sanctioned works datasets are missing from {processed_dir}")
        
    print("=== EXECUTING MODULE 4: POTENTIAL DUPLICATE WORK ENGINE (NLP) ===")
    df = _load_comparison_corpus(processed_dir)
    if df.empty:
        raise ValueError("Recommended and sanctioned datasets contain no comparable work records")
    if os.path.exists(master_path):
        # Older target datasets do not yet carry the source classifier output.
        # Keep the richer category-aware grouping when available and fall back
        # to the sanctioned work category otherwise.
        available = pd.read_parquet(master_path, engine="pyarrow").columns
        category_column = "effective_work_category" if "effective_work_category" in available else "work_category"
        if category_column in available:
            categories = pd.read_parquet(master_path, columns=["work_id", category_column])
            categories = categories.drop_duplicates("work_id").rename(columns={category_column: "effective_work_category"})
            df = df.merge(categories, on="work_id", how="left")
    else:
        df["effective_work_category"] = df.get("work_category", "Other / Unclassified")
    if "effective_work_category" not in df.columns:
        df["effective_work_category"] = df.get("work_category", "Other / Unclassified")
    df["effective_work_category"] = df["effective_work_category"].fillna(df.get("work_category", "Other / Unclassified"))
    print(f"Loaded recommended + sanctioned comparison corpus: {len(df):,} logical works")

    # 1. Clean & Filter Descriptions.  Similarity uses the recommended work
    # description first, with sanctioned text only as a fallback.  The raw
    # combined description is retained for audit display.
    df["norm_desc"] = df["similarity_description"].apply(normalize_description)
    df["quantity_signature_data"] = df["similarity_description"].apply(extract_quantity_signature)
    df["quantity_signature"] = df["quantity_signature_data"].apply(_quantity_signature_text)
    
    # A candidate requires both a meaningful description and an explicit
    # quantity/unit identity.  Text overlap alone is not sufficient.
    valid_mask = (
        df["norm_desc"].str.len().ge(10)
        & df["quantity_signature_data"].map(bool)
    )
    df_valid = df[valid_mask].copy()
    df_valid["_record_position"] = np.flatnonzero(valid_mask.to_numpy())
    print(f"Valid work descriptions for NLP comparison: {len(df_valid):,} records")

    candidate_pairs = []
    
    # 2. Group comparison by State & Constituency to avoid O(N^2) explosion
    print("Performing TF-IDF & Cosine Similarity vector search per constituency block...")
    groups = df_valid.groupby(["state", "constituency", "effective_work_category"])
    
    group_count = 0
    for (state, const, category), group in groups:
        if len(group) < 2:
            continue
            
        group_count += 1
        descriptions = group["norm_desc"].tolist()
        work_ids = group["work_id"].tolist()
        raw_descs = group["description"].tolist()
        amounts = group["sanction_amount"].tolist()
        dates = group["sanction_date"].tolist()
        recommended_dates = group["recommended_date"].tolist() if "recommended_date" in group.columns else [pd.NaT] * len(group)
        quantity_signatures = group["quantity_signature_data"].tolist()

        try:
            if HAS_SKLEARN:
                vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
                tfidf_matrix = vectorizer.fit_transform(descriptions)
                sim_matrix = cosine_similarity(tfidf_matrix)

                # Find upper triangle pairs above threshold (>= 0.70)
                rows, cols = np.where(sim_matrix >= 0.70)
                for r, c in zip(rows, cols):
                    if r < c: # Unique pairs only
                        quantity_match, _ = _quantity_signature_compatibility(quantity_signatures[r], quantity_signatures[c])
                        if not quantity_match:
                            continue
                        sim_score = round(float(sim_matrix[r, c]) * 100, 1)
                        if work_ids[r] == work_ids[c]: continue
                        candidate_pairs.append({
                            "work_id_1": work_ids[r], "work_id_2": work_ids[c],
                            "state": state, "constituency": const,
                            "effective_work_category_1": category, "effective_work_category_2": category,
                            "category_compatibility": "COMPATIBLE", "similarity_score": sim_score,
                            "sanction_amount_1": amounts[r], "sanction_amount_2": amounts[c],
                            "description_1": raw_descs[r], "description_2": raw_descs[c],
                            "sanction_date_1": dates[r], "sanction_date_2": dates[c],
                            "recommended_date_1": recommended_dates[r], "recommended_date_2": recommended_dates[c],
                            **_pair_metadata(group.iloc[r], "1"), **_pair_metadata(group.iloc[c], "2"),
                            **_pair_quantity_metadata(group.iloc[r], group.iloc[c]),
                        })
            else:
                # Pure python Jaccard similarity fallback
                n = len(descriptions)
                token_sets = [set(d.split()) for d in descriptions]
                for r in range(n):
                    for c in range(r + 1, n):
                        if work_ids[r] == work_ids[c]: continue
                        quantity_match, _ = _quantity_signature_compatibility(quantity_signatures[r], quantity_signatures[c])
                        if not quantity_match:
                            continue
                        s1, s2 = token_sets[r], token_sets[c]
                        if not s1 or not s2: continue
                        jaccard = len(s1 & s2) / float(len(s1 | s2))
                        if jaccard >= 0.60:
                            candidate_pairs.append({
                                "work_id_1": work_ids[r], "work_id_2": work_ids[c],
                                "state": state, "constituency": const,
                                "effective_work_category_1": category, "effective_work_category_2": category,
                                "category_compatibility": "COMPATIBLE", "similarity_score": round(jaccard * 100, 1),
                                "sanction_amount_1": amounts[r], "sanction_amount_2": amounts[c],
                                "description_1": raw_descs[r], "description_2": raw_descs[c],
                                "sanction_date_1": dates[r], "sanction_date_2": dates[c],
                                "recommended_date_1": recommended_dates[r], "recommended_date_2": recommended_dates[c],
                                **_pair_metadata(group.iloc[r], "1"), **_pair_metadata(group.iloc[c], "2"),
                                **_pair_quantity_metadata(group.iloc[r], group.iloc[c]),
                            })
        except Exception:
            continue

    # Primary sanctioned-description investigation. Exact normalized
    # descriptions are only elevated when sector/constituency, timing and
    # work-ID proximity also support a possible split-work pattern.
    def _numeric_id(value):
        hits = re.findall(r"\d+", str(value))
        return int(hits[-1]) if hits else None

    exact_groups = df_valid.groupby(["state", "constituency", "effective_work_category", "norm_desc"], sort=False)
    for (_, _, category, norm_desc), group in exact_groups:
        rows = list(group.to_dict("records"))
        # Compare local neighbours only. This preserves the specified
        # surrounding-record/ID-proximity rule and prevents quadratic work on
        # boilerplate descriptions repeated across a constituency.
        for left in range(len(rows)):
            for right in range(left + 1, min(len(rows), left + 11)):
                a, b = rows[left], rows[right]
                quantity_match, _ = _quantity_signature_compatibility(
                    a.get("quantity_signature_data", ()), b.get("quantity_signature_data", ())
                )
                if not quantity_match:
                    continue
                date_a, date_b = pd.to_datetime(a.get("sanction_date"), errors="coerce"), pd.to_datetime(b.get("sanction_date"), errors="coerce")
                recommendation_a = pd.to_datetime(a.get("recommended_date"), errors="coerce")
                recommendation_b = pd.to_datetime(b.get("recommended_date"), errors="coerce")
                days = abs((date_a - date_b).days) if pd.notna(date_a) and pd.notna(date_b) else None
                id_a, id_b = _numeric_id(a.get("work_id")), _numeric_id(b.get("work_id"))
                id_distance = abs(id_a - id_b) if id_a is not None and id_b is not None else None
                record_distance = abs(int(a.get("_record_position", 0)) - int(b.get("_record_position", 0)))
                same_recommended_date = pd.notna(recommendation_a) and pd.notna(recommendation_b) and recommendation_a == recommendation_b
                same_sanction_date = pd.notna(date_a) and pd.notna(date_b) and date_a == date_b
                # Nearby IDs plus an exact recommended-description and
                # quantity/unit match are the primary split-work signal. Dates
                # are supporting evidence, not a requirement: a work may be
                # divided into nearby records and sanctioned on different days.
                possible_split_work = bool(id_distance is not None and id_distance <= 10)
                if days is not None and days > 180:
                    continue
                if id_distance is not None and id_distance > 10 and record_distance > 5:
                    continue
                candidate_pairs.append({
                    "work_id_1": a["work_id"], "work_id_2": b["work_id"], "state": a["state"], "constituency": a["constituency"],
                    "effective_work_category_1": category, "effective_work_category_2": category, "category_compatibility": "EXACT_MATCH",
                    "similarity_score": 100.0, "sanction_amount_1": a["sanction_amount"], "sanction_amount_2": b["sanction_amount"],
                    "description_1": a["description"], "description_2": b["description"], "sanction_date_1": a["sanction_date"], "sanction_date_2": b["sanction_date"],
                    "recommended_date_1": a.get("recommended_date"), "recommended_date_2": b.get("recommended_date"),
                    **_pair_metadata(pd.Series(a), "1"), **_pair_metadata(pd.Series(b), "2"),
                    **_pair_quantity_metadata(pd.Series(a), pd.Series(b)),
                    "same_description_match": True, "same_recommended_date": same_recommended_date, "same_sanction_date": same_sanction_date,
                    "days_between_works": days, "work_id_numeric_distance": id_distance,
                    "record_distance": record_distance, "within_180_days": days is not None and days <= 180,
                    "within_10_ids": id_distance is not None and id_distance <= 10, "within_5_records": record_distance <= 5,
                    "possible_split_work": possible_split_work, "split_work_investigation": possible_split_work,
                })

    pairs_df = pd.DataFrame(candidate_pairs)
    if len(pairs_df) > 0:
        pairs_df["pair_key"] = pairs_df.apply(lambda r: "|".join(sorted([str(r["work_id_1"]), str(r["work_id_2"])])), axis=1)
        # Exact sanctioned-description candidates are appended after TF-IDF
        # candidates. Keep the last row so stronger exact-match evidence is
        # retained when the same pair was found by both methods.
        pairs_df = pairs_df.drop_duplicates("pair_key", keep="last").drop(columns=["pair_key"])
        if "same_description_match" not in pairs_df.columns:
            pairs_df["same_description_match"] = False
        else:
            pairs_df["same_description_match"] = pairs_df["same_description_match"].fillna(False)
        for column, default in {
            "recommended_date_1": pd.NaT,
            "recommended_date_2": pd.NaT,
            "work_id_numeric_distance": np.nan,
            "within_10_ids": False,
        }.items():
            if column not in pairs_df.columns:
                pairs_df[column] = default
        date_delta = (pd.to_datetime(pairs_df["sanction_date_1"], errors="coerce") - pd.to_datetime(pairs_df["sanction_date_2"], errors="coerce")).dt.days.abs()
        pairs_df["days_between_works"] = pairs_df.get("days_between_works", date_delta).fillna(date_delta)
        pairs_df["within_180_days"] = pairs_df["days_between_works"].le(180)
        recommendation_delta = (pd.to_datetime(pairs_df["recommended_date_1"], errors="coerce") - pd.to_datetime(pairs_df["recommended_date_2"], errors="coerce")).dt.days.abs()
        pairs_df["same_recommended_date"] = recommendation_delta.eq(0).fillna(False)
        pairs_df["same_sanction_date"] = pairs_df["days_between_works"].eq(0).fillna(False)

        def id_distance(row):
            left, right = _numeric_id(row["work_id_1"]), _numeric_id(row["work_id_2"])
            return abs(left - right) if left is not None and right is not None else np.nan

        pairs_df["work_id_numeric_distance"] = pairs_df["work_id_numeric_distance"].where(
            pairs_df["work_id_numeric_distance"].notna(), pairs_df.apply(id_distance, axis=1)
        )
        pairs_df["within_10_ids"] = pairs_df["work_id_numeric_distance"].le(10).fillna(False)
        pairs_df["possible_split_work"] = (
            pairs_df["same_description_match"].astype(bool)
            & pairs_df.get("quantity_identity_match", pd.Series(False, index=pairs_df.index)).fillna(False).astype(bool)
            & pairs_df["within_10_ids"]
        )
        pairs_df["split_work_investigation"] = pairs_df["possible_split_work"]
        pairs_df["nlp_explanation"] = pairs_df.apply(lambda r: (
            "Probable work division/splitting pattern to reduce cost: the recommended descriptions are identical, the explicit quantity/unit identity matches, and the work IDs are within 10 records. This is an investigative signal, not a confirmed duplicate; manual verification is required."
            if bool(r["possible_split_work"]) else
            "The selected recommended work descriptions and explicit quantity/unit identity match, but the same-date and work-ID-range split-work conditions were not all met; manual verification is required."
            if bool(r["same_description_match"]) else
            f"These recommended-first work descriptions are {r['similarity_score']:.1f}% similar in {r['constituency']}; the explicit quantity/unit identity also matches, so manual verification is required."
        ), axis=1)
    print(f"Discovered {len(pairs_df):,} candidate duplicate pairs across {group_count:,} constituency blocks!")

    if len(pairs_df) > 0:
        # Assign risk levels
        def assign_dup_level(score):
            if score >= 85:
                return "HIGH"
            elif score >= 70:
                return "MEDIUM"
            return "LOW"

        pairs_df["duplicate_risk_level"] = pairs_df["similarity_score"].apply(assign_dup_level)
        pairs_df.loc[pairs_df["possible_split_work"].astype(bool), "duplicate_risk_level"] = "SPLIT-WORK"
        pairs_df["review_classification"] = np.where(
            pairs_df["possible_split_work"].astype(bool),
            "PROBABLE_WORK_DIVISION",
            "DUPLICATE_OVERLAP_REVIEW",
        )
        out_pairs = os.path.join(features_dir, "duplicate_work_candidates.parquet")
        pairs_df.to_parquet(out_pairs, index=False)
        print(f"Candidate duplicate pairs saved to: {out_pairs}")
        
        # 3. Create Work-Level Maximum Duplicate Score mapping for Master Dataset
        max_dup_1 = pairs_df.groupby("work_id_1")["similarity_score"].max().reset_index().rename(
            columns={"work_id_1": "work_id", "similarity_score": "duplicate_risk_score"}
        )
        max_dup_2 = pairs_df.groupby("work_id_2")["similarity_score"].max().reset_index().rename(
            columns={"work_id_2": "work_id", "similarity_score": "duplicate_risk_score"}
        )
        work_dup_summary = pd.concat([max_dup_1, max_dup_2]).groupby("work_id")["duplicate_risk_score"].max().reset_index()
        
        out_work_dup = os.path.join(features_dir, "work_duplicate_scores.parquet")
        work_dup_summary.to_parquet(out_work_dup, index=False)

    print("\n=== MODULE 4 EXECUTION SUMMARY ===")
    print(f"Total Duplicate Candidate Pairs Found (>=70% match): {len(pairs_df):,}")
    if len(pairs_df) > 0:
        print("Duplicate Risk Level Breakdown (Pairs):")
        print(pairs_df["duplicate_risk_level"].value_counts().to_string())
        print(f"High Similarity Candidates (>=85% match): {(pairs_df['similarity_score'] >= 85).sum():,}")

if __name__ == "__main__":
    run_duplicate_work_detection()
