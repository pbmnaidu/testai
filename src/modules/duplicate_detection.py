import os
import re
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

def run_duplicate_work_detection():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    processed_dir = os.environ.get("PROCESSED_DIR", os.path.join(base_dir, "data", "processed"))
    features_dir = os.environ.get("FEATURES_DIR", os.path.join(base_dir, "data", "features"))
    
    t4_path = os.path.join(processed_dir, "t4_works_sanctioned.parquet")
    master_path = os.path.join(features_dir, "master_analytical.parquet")
    
    if not os.path.exists(t4_path):
        raise FileNotFoundError(f"Sanctioned works dataset missing at {t4_path}")
        
    print("=== EXECUTING MODULE 4: POTENTIAL DUPLICATE WORK ENGINE (NLP) ===")
    df = pd.read_parquet(t4_path)
    if os.path.exists(master_path):
        # Older target datasets do not yet carry the source classifier output.
        # Keep the richer category-aware grouping when available and fall back
        # to the sanctioned work category otherwise.
        available = pd.read_parquet(master_path, engine="pyarrow").columns
        category_column = "effective_work_category" if "effective_work_category" in available else "work_category"
        categories = pd.read_parquet(master_path, columns=["work_id", category_column])
        categories = categories.rename(columns={category_column: "effective_work_category"})
        df = df.merge(categories, on="work_id", how="left")
    else:
        df["effective_work_category"] = df.get("work_category", "Other / Unclassified")
    df["effective_work_category"] = df["effective_work_category"].fillna(df.get("work_category", "Other / Unclassified"))
    print(f"Loaded sanctioned works base: {len(df):,} records")

    # 1. Clean & Filter Descriptions
    df["norm_desc"] = df["description"].apply(normalize_description)
    
    # Filter works with meaningful descriptions (length >= 10 chars)
    df_valid = df[df["norm_desc"].str.len() >= 10].copy()
    df_valid["_record_position"] = np.arange(len(df))[df["norm_desc"].str.len().ge(10)]
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

        try:
            if HAS_SKLEARN:
                vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
                tfidf_matrix = vectorizer.fit_transform(descriptions)
                sim_matrix = cosine_similarity(tfidf_matrix)

                # Find upper triangle pairs above threshold (>= 0.70)
                rows, cols = np.where(sim_matrix >= 0.70)
                for r, c in zip(rows, cols):
                    if r < c: # Unique pairs only
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
                            "recommended_date_1": recommended_dates[r], "recommended_date_2": recommended_dates[c]
                        })
            else:
                # Pure python Jaccard similarity fallback
                n = len(descriptions)
                token_sets = [set(d.split()) for d in descriptions]
                for r in range(n):
                    for c in range(r + 1, n):
                        if work_ids[r] == work_ids[c]: continue
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
                                "recommended_date_1": recommended_dates[r], "recommended_date_2": recommended_dates[c]
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
                date_a, date_b = pd.to_datetime(a.get("sanction_date"), errors="coerce"), pd.to_datetime(b.get("sanction_date"), errors="coerce")
                recommendation_a = pd.to_datetime(a.get("recommended_date"), errors="coerce")
                recommendation_b = pd.to_datetime(b.get("recommended_date"), errors="coerce")
                days = abs((date_a - date_b).days) if pd.notna(date_a) and pd.notna(date_b) else None
                id_a, id_b = _numeric_id(a.get("work_id")), _numeric_id(b.get("work_id"))
                id_distance = abs(id_a - id_b) if id_a is not None and id_b is not None else None
                record_distance = abs(int(a.get("_record_position", 0)) - int(b.get("_record_position", 0)))
                same_recommended_date = pd.notna(recommendation_a) and pd.notna(recommendation_b) and recommendation_a == recommendation_b
                same_sanction_date = pd.notna(date_a) and pd.notna(date_b) and date_a == date_b
                possible_split_work = bool(same_recommended_date and same_sanction_date and id_distance is not None and id_distance <= 10)
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
            & pairs_df["same_recommended_date"]
            & pairs_df["same_sanction_date"]
            & pairs_df["within_10_ids"]
        )
        pairs_df["split_work_investigation"] = pairs_df["possible_split_work"]
        pairs_df["nlp_explanation"] = pairs_df.apply(lambda r: (
            "Possible splitting of one work to reduce cost: 100% sanctioned work-description match, the same recommendation and sanction dates, and work IDs within 10 records. Manual verification is required."
            if bool(r["possible_split_work"]) else
            "The sanctioned work descriptions are identical, but the same-date and work-ID-range split-work conditions were not all met; manual verification is required."
            if bool(r["same_description_match"]) else
            f"These two work descriptions are {r['similarity_score']:.1f}% similar in {r['constituency']}; manual verification is required."
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
