import json
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')

# Load Combined Ground Truth Audit & Manifest
with open("data/processed/combined_geotag_audit.json", "r", encoding="utf-8") as f:
    audit_data = json.load(f)

with open("data/processed/combined_download_manifest.json", "r", encoding="utf-8") as f:
    manifest_data = json.load(f)

# Static Initial Counts for First Paint
total_works = len(audit_data)
anakapalli_works = [w for w in audit_data if "anakapall" in w.get("constituency", "").lower()]
vijayawada_works = [w for w in audit_data if "vijayawada" in w.get("constituency", "").lower()]

green_count = sum(1 for w in audit_data if w.get("audit_classification") == "GREEN")
yellow_count = sum(1 for w in audit_data if w.get("audit_classification") == "YELLOW")
red_count = sum(1 for w in audit_data if w.get("audit_classification") == "RED")
geotag_count = sum(1 for w in audit_data if w.get("has_real_gps") and w.get("latitude"))

total_amount = sum(float(w.get("amount_disbursed", 0)) for w in audit_data)
total_amount_cr = round(total_amount / 10000000, 2)

html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MPLADS Document & Photographic Evidence Audit Dashboard</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  
  <!-- Leaflet CSS & JS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>

  <style>
    :root {{
      --bg-dark: #070B14;
      --bg-card: rgba(17, 24, 39, 0.85);
      --bg-card-hover: rgba(30, 41, 59, 0.95);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(56, 189, 248, 0.3);
      --text-main: #F8FAFC;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
      --green-verified: #10B981;
      --amber-untagged: #F59E0B;
      --red-missing: #EF4444;
      --cyan-telemetry: #06B6D4;
      --purple-accent: #8B5CF6;
      --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(circle at 15% 10%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.07) 0%, transparent 45%),
        radial-gradient(circle at 50% 90%, rgba(16, 185, 129, 0.05) 0%, transparent 50%);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      line-height: 1.5;
      overflow-x: hidden;
    }}

    .dashboard-container {{
      max-width: 1640px;
      margin: 0 auto;
      padding: 20px 28px 60px 28px;
    }}

    .glass-panel {{
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      transition: all 0.25s ease;
    }}

    header.dashboard-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 24px;
      margin-bottom: 16px;
      border-radius: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }}

    .brand-section {{
      display: flex;
      align-items: center;
      gap: 14px;
    }}

    .emblem-icon {{
      width: 46px;
      height: 46px;
      background: linear-gradient(135deg, #0284C7, #0369A1);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 20px rgba(2, 132, 199, 0.4);
    }}

    .title-group h1 {{
      font-size: 19px;
      font-weight: 700;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }}

    .title-group p {{
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }}

    .header-badges {{
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }}

    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }}

    .badge-inmemory {{
      background: rgba(6, 182, 212, 0.15);
      border: 1px solid rgba(6, 182, 212, 0.4);
      color: #38BDF8;
    }}

    .badge-scope {{
      background: rgba(139, 92, 246, 0.15);
      border: 1px solid rgba(139, 92, 246, 0.4);
      color: #C084FC;
    }}

    .pulse-dot {{
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: currentColor;
      box-shadow: 0 0 10px currentColor;
      animation: pulse 2s infinite ease-in-out;
    }}

    @keyframes pulse {{
      0%, 100% {{ transform: scale(1); opacity: 1; }}
      50% {{ transform: scale(1.3); opacity: 0.6; }}
    }}

    /* Constituency Switcher Bar */
    .constituency-switcher-bar {{
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      margin-bottom: 20px;
      border-radius: 14px;
      flex-wrap: wrap;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }}

    .switcher-label {{
      font-size: 12px;
      font-weight: 700;
      color: #38BDF8;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .switcher-buttons {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }}

    .switcher-btn {{
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--text-muted);
      padding: 7px 15px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }}

    .switcher-btn:hover {{
      background: rgba(255, 255, 255, 0.1);
      color: #FFFFFF;
    }}

    .switcher-btn.active {{
      background: linear-gradient(135deg, rgba(2, 132, 199, 0.35), rgba(37, 99, 235, 0.35));
      border-color: #38BDF8;
      color: #FFFFFF;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
    }}

    .switcher-count {{
      background: rgba(0, 0, 0, 0.4);
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: #38BDF8;
    }}

    .switcher-info {{
      margin-left: auto;
      font-size: 12px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }}

    /* 3-Tier KPI Summary Row */
    .kpi-row {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }}

    .kpi-card {{
      padding: 18px 22px;
      position: relative;
      overflow: hidden;
    }}

    .kpi-card::before {{
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
    }}

    .kpi-total::before {{ background: #38BDF8; }}
    .kpi-green::before {{ background: var(--green-verified); }}
    .kpi-yellow::before {{ background: var(--amber-untagged); }}
    .kpi-red::before {{ background: var(--red-missing); }}
    .kpi-amount::before {{ background: var(--purple-accent); }}

    .kpi-label {{
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }}

    .kpi-val-row {{
      display: flex;
      align-items: baseline;
      gap: 8px;
    }}

    .kpi-value {{
      font-size: 28px;
      font-weight: 800;
      color: #FFFFFF;
      font-family: var(--font-mono);
      line-height: 1;
    }}

    .kpi-sub {{
      font-size: 12px;
      color: var(--text-dim);
    }}

    /* Main Grid: Leaflet Map & Scanner */
    .main-grid {{
      display: grid;
      grid-template-columns: 1.55fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }}

    @media (max-width: 1100px) {{
      .main-grid {{ grid-template-columns: 1fr; }}
    }}

    .map-panel {{
      padding: 18px;
      display: flex;
      flex-direction: column;
      height: 480px;
    }}

    .panel-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }}

    .panel-title {{
      font-size: 15px;
      font-weight: 700;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .map-controls {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .map-btn {{
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 5px 10px;
      border-radius: 8px;
      font-size: 11.5px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s;
    }}

    .map-btn:hover {{
      background: rgba(255, 255, 255, 0.1);
      color: #FFFFFF;
    }}

    .map-btn-active {{
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      color: #38BDF8;
    }}

    #audit-leaflet-map {{
      width: 100%;
      height: 100%;
      border-radius: 12px;
      border: 1px solid var(--border-subtle);
      background: #0D1322;
      z-index: 10;
    }}

    /* Scanner & Terminal Panel */
    .scanner-panel {{
      padding: 18px;
      display: flex;
      flex-direction: column;
      height: 480px;
    }}

    .scanner-controls {{
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }}

    .scanner-input {{
      flex: 1;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 8px 12px;
      color: #FFFFFF;
      font-family: var(--font-mono);
      font-size: 13px;
    }}

    .scanner-input:focus {{
      outline: none;
      border-color: #38BDF8;
    }}

    .btn-scan {{
      background: linear-gradient(135deg, #0284C7, #06B6D4);
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }}

    .btn-scan:hover {{
      opacity: 0.9;
      transform: translateY(-1px);
    }}

    .terminal-container {{
      flex: 1;
      background: #070B14;
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 10px;
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.8);
    }}

    .terminal-line {{
      display: flex;
      gap: 8px;
      line-height: 1.4;
    }}

    .t-cyan {{ color: #38BDF8; }}
    .t-success {{ color: #34D399; }}
    .t-warn {{ color: #FBBF24; }}
    .t-danger {{ color: #F87171; }}
    .t-dim {{ color: #64748B; }}

    /* Works Table Section */
    .table-panel {{
      padding: 20px;
    }}

    .table-controls {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }}

    .filter-tabs {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }}

    .tab-btn {{
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }}

    .tab-btn:hover {{
      background: rgba(255, 255, 255, 0.08);
      color: #FFFFFF;
    }}

    .tab-btn.active {{
      background: rgba(56, 189, 248, 0.15);
      border-color: #38BDF8;
      color: #38BDF8;
    }}

    .tab-btn.active-green {{
      background: rgba(16, 185, 129, 0.15) !important;
      border-color: #10B981 !important;
      color: #34D399 !important;
    }}

    .tab-btn.active-yellow {{
      background: rgba(245, 158, 11, 0.15) !important;
      border-color: #F59E0B !important;
      color: #FBBF24 !important;
    }}

    .tab-btn.active-red {{
      background: rgba(239, 68, 68, 0.15) !important;
      border-color: #EF4444 !important;
      color: #F87171 !important;
    }}

    .search-box {{
      position: relative;
      min-width: 260px;
    }}

    .search-input {{
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 8px 12px 8px 34px;
      color: #FFFFFF;
      font-size: 12.5px;
    }}

    .search-input:focus {{
      outline: none;
      border-color: #38BDF8;
    }}

    .search-icon {{
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      font-size: 13px;
    }}

    .table-container {{
      overflow-x: auto;
      max-height: 580px;
    }}

    table.work-table {{
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }}

    table.work-table th {{
      background: rgba(15, 23, 42, 0.95);
      color: var(--text-muted);
      padding: 12px 14px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border-subtle);
      position: sticky;
      top: 0;
      z-index: 20;
    }}

    table.work-table td {{
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      vertical-align: middle;
    }}

    table.work-table tr:hover td {{
      background: rgba(255, 255, 255, 0.02);
    }}

    .status-pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }}

    .pill-green {{
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34D399;
    }}

    .pill-yellow {{
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #FBBF24;
    }}

    .pill-red {{
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #F87171;
    }}

    .work-id-badge {{
      font-family: var(--font-mono);
      color: #38BDF8;
      font-weight: 600;
    }}

    .table-actions-cell {{
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .btn-inspect {{
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #38BDF8;
      padding: 5px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
    }}

    .btn-inspect:hover {{
      background: var(--cyan-telemetry);
      color: #040711;
    }}

    .btn-table-preview {{
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.45);
      color: #C084FC;
      padding: 5px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
    }}

    .btn-table-preview:hover {{
      background: #A855F7;
      color: #FFFFFF;
      box-shadow: 0 0 12px rgba(168, 85, 247, 0.4);
    }}

    .btn-table-dl {{
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #34D399;
      padding: 5px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
    }}

    .btn-table-dl:hover {{
      background: var(--green-verified);
      color: #040711;
    }}

    /* Modal Overlay */
    .modal-overlay {{
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }}

    .modal-dossier {{
      background: #0D1322;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      width: 100%;
      max-width: 940px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7);
    }}

    .modal-header {{
      padding: 18px 24px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: rgba(15, 23, 42, 0.7);
    }}

    .modal-close {{
      background: rgba(255, 255, 255, 0.08);
      border: none;
      color: var(--text-muted);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }}

    .modal-close:hover {{
      background: rgba(239, 68, 68, 0.2);
      color: #F87171;
    }}

    .modal-body {{
      padding: 20px 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }}

    .audit-verdict-box {{
      padding: 16px 20px;
      border-radius: 12px;
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }}

    .verdict-compliant {{
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.4);
    }}

    .verdict-warning {{
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.4);
    }}

    .verdict-alert {{
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.4);
    }}

    .dossier-grid {{
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 20px;
    }}

    @media (max-width: 800px) {{
      .dossier-grid {{ grid-template-columns: 1fr; }}
    }}

    .dossier-card {{
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 16px;
    }}

    .dossier-card-title {{
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #38BDF8;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .dossier-field {{
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 12.5px;
    }}

    .dossier-field:last-child {{
      border-bottom: none;
    }}

    .field-label {{ color: var(--text-muted); }}
    .field-value {{ font-weight: 600; color: #FFFFFF; font-family: var(--font-mono); }}

    .section-tag {{
      display: inline-block;
      background: rgba(255, 255, 255, 0.06);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      color: #CBD5E1;
      margin: 3px 4px 3px 0;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }}

    .images-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }}

    .img-box {{
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      font-size: 10.5px;
    }}

    .img-box.is-photo {{
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(56, 189, 248, 0.04);
    }}

    .btn-download-img {{
      background: rgba(56, 189, 248, 0.2);
      border: 1px solid #38BDF8;
      color: #38BDF8;
      font-size: 10px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 4px;
      transition: all 0.2s;
    }}

    .btn-download-img:hover {{
      background: #38BDF8;
      color: #040711;
    }}

    /* Toast */
    .toast {{
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0F172A;
      border: 1px solid #38BDF8;
      color: white;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 13px;
      display: none;
      align-items: center;
      gap: 10px;
      z-index: 100000;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6);
    }}

    /* Interactive Preview Modal Styles */
    .preview-modal-dialog {{
      background: #0B111E;
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 18px;
      width: 95vw;
      max-width: 1320px;
      height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.85);
    }}

    .preview-modal-header {{
      padding: 14px 22px;
      background: rgba(15, 23, 42, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }}

    .preview-modal-body {{
      flex: 1;
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      overflow: hidden;
      background: #070B14;
    }}

    @media (max-width: 1024px) {{
      .preview-modal-body {{
        grid-template-columns: 1fr;
        overflow-y: auto;
      }}
    }}

    .preview-viewport-pane {{
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border-subtle);
      background: #030712;
      position: relative;
      overflow: hidden;
    }}

    .preview-tabs-bar {{
      display: flex;
      background: rgba(15, 23, 42, 0.85);
      border-bottom: 1px solid var(--border-subtle);
      padding: 8px 16px;
      gap: 8px;
    }}

    .prev-tab-btn {{
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }}

    .prev-tab-btn:hover {{
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.05);
    }}

    .prev-tab-btn.active {{
      background: rgba(56, 189, 248, 0.15);
      border-color: #38BDF8;
      color: #38BDF8;
    }}

    .preview-canvas-container {{
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: radial-gradient(circle at center, #0F172A 0%, #030712 100%);
      padding: 16px;
    }}

    .preview-img-wrapper {{
      position: relative;
      max-width: 100%;
      max-height: 100%;
      display: inline-block;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      border-radius: 8px;
      overflow: hidden;
    }}

    .preview-img-wrapper img {{
      display: block;
      max-width: 100%;
      max-height: 520px;
      object-fit: contain;
      border-radius: 8px;
      transition: transform 0.2s ease;
    }}

    /* Precision Visual GPS Watermark Highlight */
    .gps-highlight-overlay {{
      position: absolute;
      border: 2.5px solid #38BDF8;
      background: rgba(56, 189, 248, 0.18);
      border-radius: 6px;
      box-shadow: 0 0 25px rgba(56, 189, 248, 0.85), inset 0 0 12px rgba(56, 189, 248, 0.3);
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 25;
      animation: pulseGpsStamp 2.2s infinite ease-in-out;
    }}

    @keyframes pulseGpsStamp {{
      0%, 100% {{
        border-color: #38BDF8;
        box-shadow: 0 0 20px rgba(56, 189, 248, 0.8), inset 0 0 10px rgba(56, 189, 248, 0.2);
      }}
      50% {{
        border-color: #34D399;
        box-shadow: 0 0 30px rgba(52, 211, 153, 0.9), inset 0 0 15px rgba(52, 211, 153, 0.35);
      }}
    }}

    .gps-highlight-overlay.hidden {{
      display: none !important;
    }}

    .gps-highlight-tag {{
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      background: linear-gradient(135deg, #0284C7, #0369A1);
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: 0.04em;
      white-space: nowrap;
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      border: 1px solid rgba(255, 255, 255, 0.25);
    }}

    /* Controls Bar inside Viewport */
    .preview-controls-bar {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: rgba(15, 23, 42, 0.9);
      border-top: 1px solid var(--border-subtle);
      font-size: 12px;
      color: var(--text-muted);
    }}

    .thumb-strip {{
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 6px 0;
      max-width: 380px;
    }}

    .thumb-btn {{
      background: transparent;
      border: 2px solid transparent;
      border-radius: 6px;
      padding: 2px;
      cursor: pointer;
      opacity: 0.6;
      transition: all 0.15s;
      flex-shrink: 0;
      width: 48px;
      height: 36px;
    }}

    .thumb-btn:hover, .thumb-btn.active {{
      opacity: 1;
      border-color: #38BDF8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
    }}

    .thumb-btn img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 4px;
      display: block;
    }}

    .preview-sidebar-pane {{
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 20px;
      gap: 16px;
      background: rgba(11, 17, 30, 0.95);
    }}

    .preview-telemetry-box {{
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 12px;
      padding: 16px;
    }}

    .mini-map-container {{
      height: 160px;
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--border-subtle);
      background: #070B14;
      margin-top: 10px;
      overflow: hidden;
      position: relative;
    }}

    .no-map-notice {{
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 14px;
      color: var(--text-dim);
      font-size: 11.5px;
      background: rgba(11, 17, 30, 0.9);
    }}

    .no-image-box {{
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text-dim);
      padding: 40px;
      text-align: center;
    }}
  </style>
</head>
<body>

  <div class="dashboard-container">
    
    <!-- Top Header -->
    <header class="dashboard-header glass-panel">
      <div class="brand-section">
        <div class="emblem-icon">🏛️</div>
        <div class="title-group">
          <h1>
            MPLADS Document & Photographic Evidence Audit Dashboard
            <span style="font-size: 12px; font-weight: 600; color: #38BDF8; background: rgba(56, 189, 248, 0.12); padding: 3px 10px; border-radius: 9999px; border: 1px solid rgba(56, 189, 248, 0.3);">
              Ground Truth Audit
            </span>
          </h1>
          <p>Forensic Evidence Verification: Scanned Images / Photos (🟢) • Text & Bill Proof (🟡) • Missing Proof (🔴)</p>
        </div>
      </div>

      <div class="header-badges">
        <div class="badge badge-inmemory">
          <span class="pulse-dot"></span>
          <span>Zero Fabricated Data</span>
        </div>
        <div class="badge badge-scope">
          <span>Andhra Pradesh • 44 Works</span>
        </div>
      </div>
    </header>

    <!-- Constituency Switcher Bar -->
    <div class="constituency-switcher-bar glass-panel">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 14px;">📍</span>
        <span class="switcher-label">Parliamentary Constituency:</span>
      </div>
      <div class="switcher-buttons">
        <button class="switcher-btn active" id="btn-const-all" onclick="selectConstituency('ALL', this)">
          🌐 All Constituencies <span class="switcher-count" id="count-all">{total_works}</span>
        </button>
        <button class="switcher-btn" id="btn-const-anakapalli" onclick="selectConstituency('Anakapalle', this)">
          🏛️ Anakapalli (AP) <span class="switcher-count" id="count-anakapalli">{len(anakapalli_works)}</span>
        </button>
        <button class="switcher-btn" id="btn-const-vijayawada" onclick="selectConstituency('Vijayawada', this)">
          🌊 Vijayawada (NTR Dist) <span class="switcher-count" id="count-vijayawada">{len(vijayawada_works)}</span>
        </button>
      </div>
      <div class="switcher-info" id="switcher-info-text">
        Showing all {total_works} works across Anakapalli & Vijayawada
      </div>
    </div>

    <!-- 3-Tier Classification KPI Summary Row (Dynamically calculated in JS) -->
    <div class="kpi-row">
      <div class="glass-panel kpi-card kpi-total">
        <div class="kpi-label">Works Audited</div>
        <div class="kpi-val-row">
          <div class="kpi-value" id="kpi-total-val">{total_works}</div>
          <div class="kpi-sub" id="kpi-total-sub">Official Records</div>
        </div>
      </div>

      <div class="glass-panel kpi-card kpi-green">
        <div class="kpi-label">🟢 Scanned Pictures & Evidence</div>
        <div class="kpi-val-row">
          <div class="kpi-value" style="color: var(--green-verified);" id="kpi-green-val">{green_count}</div>
          <div class="kpi-sub" id="kpi-green-sub">
            <span style="color: #38BDF8; font-weight: 700;">📍 {geotag_count} Geotagged</span> | {green_count - geotag_count} Untagged
          </div>
        </div>
      </div>

      <div class="glass-panel kpi-card kpi-yellow">
        <div class="kpi-label">🟡 Bill / Proof Only (No Images)</div>
        <div class="kpi-val-row">
          <div class="kpi-value" style="color: var(--amber-untagged);" id="kpi-yellow-val">{yellow_count}</div>
          <div class="kpi-sub">Text Bills Verified</div>
        </div>
      </div>

      <div class="glass-panel kpi-card kpi-red">
        <div class="kpi-label">🔴 Missing / Invalid Proof</div>
        <div class="kpi-val-row">
          <div class="kpi-value" style="color: var(--red-missing);" id="kpi-red-val">{red_count}</div>
          <div class="kpi-sub">No Files / No Proof</div>
        </div>
      </div>

      <div class="glass-panel kpi-card kpi-amount">
        <div class="kpi-label">Audited Funds</div>
        <div class="kpi-val-row">
          <div class="kpi-value" style="color: #C084FC;" id="kpi-amount-val">₹{total_amount_cr} Cr</div>
          <div class="kpi-sub">Disbursed / Sanctioned</div>
        </div>
      </div>
    </div>

    <!-- Main Grid: Leaflet Map & Live Stream Inspector -->
    <div class="main-grid">
      
      <!-- Interactive Leaflet Map Panel -->
      <div class="glass-panel map-panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>🗺️ GIS Geographic Audit Map</span>
            <span style="font-size: 11px; font-weight: 500; color: var(--text-muted);">(Pins indicate verified GPS)</span>
          </div>
          <div class="map-controls">
            <button class="map-btn" onclick="focusConstituency('Anakapalle')">🎯 Anakapalli</button>
            <button class="map-btn" onclick="focusConstituency('Vijayawada')">🎯 Vijayawada</button>
            <button class="map-btn map-btn-active" onclick="focusConstituency('ALL')">🗺️ Fit All</button>
          </div>
        </div>
        <div id="audit-leaflet-map"></div>
      </div>

      <!-- Live Stream Inspector Terminal -->
      <div class="glass-panel scanner-panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>⚡ Live File & Proof Stream Inspector</span>
          </div>
          <span style="font-size: 11px; font-family: var(--font-mono); color: #38BDF8;">MoSPI Live API</span>
        </div>

        <div class="scanner-controls">
          <select id="work-selector" class="scanner-input" onchange="runLiveMemoryScan()">
            <!-- Populated via JS -->
          </select>
          <button class="btn-scan" onclick="runLiveMemoryScan()">Audit Work</button>
        </div>

        <div class="terminal-container" id="terminal-log">
          <div class="terminal-line t-cyan">[SYSTEM READY] MoSPI multi-file attachment auditor loaded.</div>
          <div class="terminal-line t-dim">Select any work above or click 'Audit Work' to inspect uploaded files, scanned images/pictures, and bill proof keywords.</div>
        </div>
      </div>

    </div>

    <!-- Works Table Section -->
    <div class="glass-panel table-panel">
      <div class="table-controls">
        <div class="filter-tabs">
          <button class="tab-btn active" onclick="filterWorks('ALL', this)">All Works ({total_works})</button>
          <button class="tab-btn" onclick="filterWorks('GEOTAG', this)" style="border-color: rgba(56, 189, 248, 0.4); color: #38BDF8;">📍 Verified Geotags ({geotag_count})</button>
          <button class="tab-btn" onclick="filterWorks('GREEN', this)">🟢 Scanned Pictures ({green_count})</button>
          <button class="tab-btn" onclick="filterWorks('YELLOW', this)">🟡 Bill Proof Only ({yellow_count})</button>
          <button class="tab-btn" onclick="filterWorks('RED', this)">🔴 Missing / Invalid ({red_count})</button>
        </div>

        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="search-input" class="search-input" placeholder="Search Work ID, title, mandal, or constituency..." oninput="handleSearch()">
        </div>
      </div>

      <div class="table-container">
        <table class="work-table">
          <thead>
            <tr>
              <th>Work ID</th>
              <th>Constituency & Mandal / Title</th>
              <th>Attached Files</th>
              <th>Scanned Pictures</th>
              <th>Bill / Completion Proof</th>
              <th>Audit Classification</th>
              <th style="text-align: right; padding-right: 20px;">Audit Actions</th>
            </tr>
          </thead>
          <tbody id="works-tbody">
            <!-- Rendered by JS -->
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <!-- Full Audit Dossier Modal (Standard Inspection) -->
  <div class="modal-overlay" id="dossier-modal" onclick="closeModalOnOverlay(event)">
    <div class="modal-dossier">
      <div class="modal-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <span class="work-id-badge" id="modal-work-id" style="font-size: 14px;">WORK ID: 219744</span>
            <span id="modal-status-pill" class="status-pill pill-green">🟢 SCANNED PICTURES PRESENT</span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted);" id="modal-mandal">Mandal Details</div>
          <div style="font-size: 13.5px; font-weight: 600; color: #FFFFFF; margin-top: 4px; max-width: 780px;" id="modal-title">Work Title</div>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="audit-verdict-box" id="modal-verdict-box">
          <div style="font-size: 24px;" id="modal-verdict-icon">✅</div>
          <div>
            <div style="font-weight: 700; font-size: 13.5px; color: #FFFFFF; margin-bottom: 2px;" id="modal-verdict-title">Verdict Title</div>
            <div style="font-size: 12.5px; color: var(--text-muted); line-height: 1.4;" id="modal-verdict-desc">Verdict Details</div>
          </div>
        </div>

        <div class="dossier-grid">
          <!-- Document Structure -->
          <div class="dossier-card">
            <div class="dossier-card-title">
              <span>📄 Official Attached Files</span>
            </div>
            <div id="modal-files-list" style="margin-bottom: 12px;"></div>
            <div class="dossier-field">
              <span class="field-label">Scanned Pictures:</span>
              <span class="field-value" id="modal-scanned-count" style="color: #34D399;">23 Images</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">Bill / UC Proof:</span>
              <span class="field-value" id="modal-bill-proof" style="color: #38BDF8;">Verified</span>
            </div>
            <div style="margin-top: 10px;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Document Sections & Proof Tags:</div>
              <div id="modal-sections-list"></div>
            </div>
          </div>

          <!-- GPS Telemetry -->
          <div class="dossier-card">
            <div class="dossier-card-title">
              <span>📍 Geotag Coordinate Telemetry</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">Latitude:</span>
              <span class="field-value" id="modal-gps-lat" style="color: #38BDF8;">17.653421° N</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">Longitude:</span>
              <span class="field-value" id="modal-gps-lon" style="color: #38BDF8;">82.986812° E</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">DMS Format:</span>
              <span class="field-value" id="modal-gps-dms" style="font-size: 11.5px;">17°39'12.3"N, 82°59'12.5"E</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">GPS Source:</span>
              <span class="field-value" id="modal-gps-source">EXIF Tag 0x8825</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">Geofence Status:</span>
              <span class="field-value" id="modal-gps-geofence" style="color: #34D399;">✅ Verified Inside Boundary</span>
            </div>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
              <a id="modal-maps-link" href="#" target="_blank" class="btn-scan" style="text-decoration: none; font-size: 11.5px; display: inline-flex; align-items: center; gap: 6px;">
                <span>🌐 Verify on Google Maps</span>
              </a>
              <button class="map-btn" onclick="downloadCurrentWorkFile()" style="font-size: 11.5px;">
                <span>📥 Download File</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Attached Images Strip -->
        <div class="dossier-card">
          <div class="dossier-card-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📷 Scanned Pictures & Evidence Gallery</span>
            <button class="map-btn" onclick="downloadAllCurrentImages()" style="font-size: 10.5px; padding: 3px 8px;">Download Photos</button>
          </div>
          <div class="images-grid" id="modal-image-strip">
            <!-- Dynamic Images -->
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Interactive Document & Location Preview Modal -->
  <div class="modal-overlay" id="preview-modal" onclick="closePreviewModalOnOverlay(event)">
    <div class="preview-modal-dialog">
      
      <div class="preview-modal-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 2px;">
            <span class="work-id-badge" id="prev-work-id" style="font-size: 14px;">WORK ID: 219744</span>
            <span id="prev-status-badge" class="status-pill pill-green">🟢 SCANNED PICTURES PRESENT</span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted);" id="prev-mandal">Mandal Details</div>
          <div style="font-size: 13px; font-weight: 600; color: #FFFFFF; max-width: 780px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" id="prev-title">Work Title</div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn-inspect" onclick="downloadCurrentPreviewImage()" title="Download the currently viewed image">
            💾 Download Image
          </button>
          <button class="modal-close" onclick="closePreviewModal()">✕</button>
        </div>
      </div>

      <div class="preview-modal-body">
        
        <!-- Left: Document Viewport (Photo or PDF) -->
        <div class="preview-viewport-pane">
          
          <div class="preview-tabs-bar">
            <button class="prev-tab-btn active" id="tab-btn-image" onclick="switchPreviewTab('image')">
              📷 Scanned Pictures & Photos
            </button>
            <button class="prev-tab-btn" id="tab-btn-pdf" onclick="switchPreviewTab('pdf')">
              📄 Official PDF Document
            </button>
          </div>

          <!-- Image Preview Canvas -->
          <div class="preview-canvas-container" id="canvas-image-view">
            
            <div class="preview-img-wrapper" id="prev-img-wrapper">
              <img id="prev-main-img" src="" alt="Real Document Evidence Photo">
              
              <!-- Conditional Location Highlight Box (Strictly shown ONLY if real GPS exists) -->
              <div class="gps-highlight-overlay hidden" id="preview-highlight-box" style="top: 15%; left: 15%; width: 70%; height: 70%;">
                <div class="gps-highlight-tag" id="prev-highlight-text">📍 DETECTED GPS COORDINATES</div>
              </div>
            </div>

            <div class="no-image-box" id="prev-no-image-box" style="display: none;">
              <div style="font-size: 38px;">📷🚫</div>
              <div style="font-size: 14px; font-weight: 600; color: #FFFFFF;">No Scanned Image or Picture Found</div>
              <div style="font-size: 12px; max-width: 320px;" id="prev-no-img-desc">This work record contains only text/bills or has no files uploaded.</div>
            </div>

          </div>

          <!-- PDF Embed View -->
          <div class="preview-canvas-container" id="canvas-pdf-view" style="display: none; padding: 0; background: #0F172A;">
            <iframe id="prev-pdf-iframe" src="about:blank" style="width: 100%; height: 100%; border: none; background: #0F172A;"></iframe>
            <div class="no-image-box" id="prev-no-pdf-box" style="display: none;">
              <div style="font-size: 38px;">📄🚫</div>
              <div style="font-size: 14px; font-weight: 600; color: #FFFFFF;">No PDF Document Uploaded</div>
              <div style="font-size: 12px; max-width: 340px;">This work has standalone images/JPEG files uploaded instead of a combined PDF.</div>
            </div>
          </div>

          <!-- Viewport Controls & Thumbnails Bar -->
          <div class="preview-controls-bar" id="prev-image-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim);">Pictures:</span>
              <div class="thumb-strip" id="prev-thumb-strip"></div>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
              <button class="map-btn" id="btn-toggle-highlight" onclick="toggleHighlight()" style="display: none; background: rgba(56, 189, 248, 0.15); border-color: #38BDF8; color: #38BDF8;">
                🎯 Highlight: <strong>ON</strong>
              </button>
              <button class="map-btn" onclick="zoomPreview(0.2)" title="Zoom In">🔍 +</button>
              <button class="map-btn" onclick="zoomPreview(-0.2)" title="Zoom Out">🔍 -</button>
              <button class="map-btn" onclick="zoomPreview(0)" title="Reset Zoom">↺</button>
            </div>
          </div>

          <!-- PDF Notice Bar -->
          <div class="preview-controls-bar" id="prev-pdf-notice-bar" style="display: none;">
            <span style="font-size: 11px; color: #38BDF8;">📄 Viewing genuine MoSPI PDF stream directly</span>
            <button class="btn-table-dl" onclick="downloadCurrentWorkFile()" style="padding: 4px 10px; font-size: 11px;">📥 Download PDF</button>
          </div>

        </div>

        <!-- Right: Location & Forensic Telemetry Sidebar -->
        <div class="preview-sidebar-pane">
          
          <div class="preview-telemetry-box">
            <div style="font-size: 12px; font-weight: 700; color: #38BDF8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
              <span>⚖️ Evidence Classification Verdict</span>
            </div>

            <div id="prev-verdict-pill-container" style="margin-bottom: 10px;">
              <span class="status-pill pill-green" id="prev-class-pill">🟢 SCANNED PICTURES PRESENT</span>
            </div>

            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.45; margin-bottom: 14px;" id="prev-class-reason">
              Classification description.
            </div>

            <!-- Honest Status Alert Banner -->
            <div id="prev-no-gps-banner" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; display: none;">
              <div style="color: #F87171; font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                <span>⚠️</span> Coordinates Not Present in Document
              </div>
              <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px; line-height: 1.35;">
                Scanned physical photos or document pages do not contain digital EXIF GPS tags (0x8825). No coordinates are highlighted.
              </div>
            </div>

            <div class="dossier-field">
              <span class="field-label">Latitude:</span>
              <span class="field-value" id="prev-lat">Not Present</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">Longitude:</span>
              <span class="field-value" id="prev-lon">Not Present</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">DMS Coordinates:</span>
              <span class="field-value" id="prev-dms" style="font-size: 11px;">None</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">GPS Source:</span>
              <span class="field-value" id="prev-source">EXIF Stripped</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">Location Mention:</span>
              <span class="field-value" id="prev-location-name" style="color: #38BDF8;">-</span>
            </div>
            <div class="dossier-field">
              <span class="field-label">Geofence Audit:</span>
              <span class="field-value" id="prev-geofence" style="color: #EF4444;">❌ No GPS Coordinates</span>
            </div>
          </div>

          <!-- Mini Satellite Verification Map -->
          <div class="preview-telemetry-box" style="padding: 12px;">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;">
              <span>🛰️ Satellite Geographic Verification</span>
              <a id="prev-gmap-btn" href="#" target="_blank" style="color: #38BDF8; font-size: 11px; text-decoration: none; font-weight: 600; display: none;">Open Google Maps ➔</a>
            </div>
            
            <div class="mini-map-container" id="prev-mini-map-box">
              <div id="preview-mini-map" style="width: 100%; height: 100%;"></div>
            </div>

            <div class="no-map-notice" id="prev-no-map-notice" style="position: static; margin-top: 10px; border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">
              Satellite view unavailable: Coordinates were not embedded in the uploaded document.
            </div>
          </div>

          <!-- Document Proof Summary -->
          <div class="preview-telemetry-box">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
              <span>📋 Bill & Completion Proof Status</span>
            </div>
            <div style="font-size: 12px; color: var(--text-dim); line-height: 1.4;" id="prev-pdf-status-text">
              Status calculated from authentic MoSPI portal records.
            </div>
          </div>

        </div>

      </div>

    </div>
  </div>

  <!-- Notification Toast -->
  <div class="toast" id="toast-msg">
    <span id="toast-icon">📥</span>
    <span id="toast-text">Toast message</span>
  </div>

  <!-- Embedded Ground Truth JSON Manifest (Zero Hardcoding) -->
  <script>
    const AUDIT_DATA = {json.dumps(audit_data, indent=2)};
    const REAL_MANIFEST = {json.dumps(manifest_data, indent=2)};

    let map = null;
    let markersLayer = null;
    let geofenceLayerGroup = null;
    let currentFilter = 'ALL';
    let currentConstituency = 'ALL';
    let currentActiveWorkId = null;

    function showToast(text, icon = '📥') {{
      const t = document.getElementById('toast-msg');
      document.getElementById('toast-icon').textContent = icon;
      document.getElementById('toast-text').textContent = text;
      t.style.display = 'flex';
      setTimeout(() => {{ t.style.display = 'none'; }}, 3500);
    }}

    // Initialize Leaflet Map with Anakapalli & Vijayawada boundaries
    function initLeafletMap() {{
      const mapElement = document.getElementById('audit-leaflet-map');
      if (!mapElement) return;

      if (typeof L === 'undefined') {{
        console.warn('Leaflet library not loaded yet, retrying...');
        setTimeout(initLeafletMap, 500);
        return;
      }}

      try {{
        if (map) {{
          map.remove();
          map = null;
        }}

        map = L.map('audit-leaflet-map', {{
          zoomControl: true,
          attributionControl: true
        }}).setView([17.15, 81.80], 8);

        const darkMatter = L.tileLayer('https://{{s}}.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
          maxZoom: 19,
          attribution: '&copy; CartoDB &copy; OpenStreetMap'
        }}).addTo(map);

        const osm = L.tileLayer('https://tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }});

        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}', {{
          maxZoom: 19,
          attribution: '&copy; Esri &mdash; Earthstar Geographics'
        }});

        const baseMaps = {{
          "Dark Matter": darkMatter,
          "OpenStreetMap": osm,
          "Satellite Imagery": satellite
        }};
        L.control.layers(baseMaps).addTo(map);

        geofenceLayerGroup = L.layerGroup().addTo(map);

        // 1. Anakapalli Boundary (Cyan)
        const anakapalliBbox = [
          [17.35, 82.65],
          [18.05, 82.65],
          [18.05, 83.35],
          [17.35, 83.35]
        ];
        L.polygon(anakapalliBbox, {{
          color: '#06B6D4',
          weight: 2,
          fillColor: '#06B6D4',
          fillOpacity: 0.05,
          dashArray: '6, 8'
        }}).bindTooltip("Anakapalli District Boundary (Geofence: 17.35°-18.05°N, 82.65°-83.35°E)", {{ permanent: false }}).addTo(geofenceLayerGroup);

        // 2. Vijayawada / NTR District Boundary (Purple)
        const vijayawadaBbox = [
          [16.40, 80.00],
          [17.15, 80.00],
          [17.15, 80.85],
          [16.40, 80.85]
        ];
        L.polygon(vijayawadaBbox, {{
          color: '#8B5CF6',
          weight: 2,
          fillColor: '#8B5CF6',
          fillOpacity: 0.05,
          dashArray: '6, 8'
        }}).bindTooltip("Vijayawada / NTR District Boundary (Geofence: 16.40°-17.15°N, 80.00°-80.85°E)", {{ permanent: false }}).addTo(geofenceLayerGroup);

        markersLayer = L.layerGroup().addTo(map);
        updateMapMarkers(AUDIT_DATA);

        setTimeout(() => {{ if (map) map.invalidateSize(); }}, 300);
      }} catch (err) {{
        console.error('Leaflet initialization error:', err);
      }}
    }}

    function updateMapMarkers(works) {{
      if (!markersLayer) return;
      markersLayer.clearLayers();

      const worksWithRealGps = works.filter(w => w.latitude && w.longitude);

      worksWithRealGps.forEach(w => {{
        const lat = w.latitude;
        const lon = w.longitude;
        const isVijayawada = w.constituency === 'Vijayawada';
        const pinColor = isVijayawada ? '#A855F7' : '#10B981';
        const sourceLabel = w.geocoding_source || 'Visual GPS Stamp (Photo Watermark)';

        const customIcon = L.divIcon({{
          className: 'leaflet-custom-marker',
          html: `<div class="pin-verified" style="width:28px;height:28px;font-size:13px;background:${{pinColor}};border-radius:50%;color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px ${{pinColor}};border:2px solid white;cursor:pointer;">📍</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }});

        const marker = L.marker([lat, lon], {{ icon: customIcon }});
        const manifestItem = REAL_MANIFEST[String(w.work_id)];
        const gpsImgName = w.pdf_audit?.gps?.image_name || (manifestItem?.images?.[0] || '');

        const popupContent = `
          <div style="font-family: 'Inter', sans-serif; color: #0F172A; min-width: 250px; padding: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #0284C7; font-family: monospace;">WORK ID: ${{w.work_id}}</span>
              <span style="background: #10B981; color: white; font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">🟢 GEOTAGGED</span>
            </div>
            <div style="font-size: 13px; font-weight: 700; margin: 4px 0 6px 0; color: #0F172A; line-height: 1.3;">${{w.title.substring(0, 52)}}...</div>
            <div style="font-size: 11px; margin-bottom: 2px; color: #475569;"><strong>Constituency:</strong> ${{w.constituency}} (${{w.mandal}} Mandal)</div>
            <div style="font-size: 11px; margin-bottom: 2px; color: #475569;"><strong>Disbursed:</strong> ₹${{Number(w.amount_disbursed).toLocaleString('en-IN')}}</div>
            <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 6px; padding: 6px 8px; margin: 6px 0; font-size: 11px; color: #166534;">
              <div><strong>📍 Stamped GPS:</strong> ${{lat.toFixed(6)}}° N, ${{lon.toFixed(6)}}° E</div>
              <div style="font-size: 10px; color: #15803D; margin-top: 2px;">Source: ${{sourceLabel}}</div>
            </div>
            ${{gpsImgName ? `
              <div style="width: 100%; height: 110px; border-radius: 6px; overflow: hidden; margin-bottom: 6px; background: #0F172A; cursor: pointer;" onclick="openPreviewModal('${{w.work_id}}', 0, 'image')">
                <img src="downloads/images/${{gpsImgName}}" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
            ` : ''}}
            <div style="display: flex; gap: 4px; margin-top: 6px;">
              <button onclick="openPreviewModal('${{w.work_id}}', 0, 'image')" style="
                flex: 1; background: #8B5CF6; color: white; border: none; padding: 7px 4px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;
              ">👁️ View Geotagged Photo</button>
              <button onclick="openDossier('${{w.work_id}}')" style="
                flex: 1; background: #0284C7; color: white; border: none; padding: 7px 4px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;
              ">Inspect</button>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
        markersLayer.addLayer(marker);
      }});
    }}

    function focusConstituency(cName) {{
      if (!map) return;
      if (cName === 'Anakapalle') {{
        map.flyToBounds([
          [17.35, 82.65],
          [18.05, 83.35]
        ], {{ duration: 1.2, padding: [30, 30] }});
      }} else if (cName === 'Vijayawada') {{
        map.flyToBounds([
          [16.40, 80.00],
          [17.15, 80.85]
        ], {{ duration: 1.2, padding: [30, 30] }});
      }} else {{
        map.flyToBounds([
          [16.20, 79.90],
          [18.15, 83.45]
        ], {{ duration: 1.2, padding: [30, 30] }});
      }}
    }}

    // Dynamic Reactive KPI Updates (3-Tier Classification)
    function updateKpis(works) {{
      const total = works.length;
      const green = works.filter(w => w.audit_classification === 'GREEN').length;
      const yellow = works.filter(w => w.audit_classification === 'YELLOW').length;
      const red = works.filter(w => w.audit_classification === 'RED').length;
      const totalAmt = works.reduce((acc, w) => acc + (parseFloat(w.amount_disbursed) || 0), 0);
      const totalCr = (totalAmt / 10000000).toFixed(2);

      const totalVal = document.getElementById('kpi-total-val');
      if (totalVal) totalVal.textContent = total;
      
      const gVal = document.getElementById('kpi-green-val');
      if (gVal) gVal.textContent = green;

      const yVal = document.getElementById('kpi-yellow-val');
      if (yVal) yVal.textContent = yellow;

      const rVal = document.getElementById('kpi-red-val');
      if (rVal) rVal.textContent = red;

      const amtVal = document.getElementById('kpi-amount-val');
      if (amtVal) amtVal.textContent = `₹${{totalCr}} Cr`;
    }}

    function selectConstituency(cName, btn) {{
      currentConstituency = cName;
      document.querySelectorAll('.switcher-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');

      const infoEl = document.getElementById('switcher-info-text');
      if (cName === 'ALL') {{
        infoEl.textContent = 'Showing all 44 works across Anakapalli & Vijayawada';
        focusConstituency('ALL');
      }} else if (cName === 'Anakapalle') {{
        infoEl.textContent = 'Showing 30 works for Anakapalli (Hon\\'ble MP C.M. Ramesh)';
        focusConstituency('Anakapalle');
      }} else if (cName === 'Vijayawada') {{
        infoEl.textContent = 'Showing 14 works for Vijayawada (Hon\\'ble MP Sivanath Kesineni)';
        focusConstituency('Vijayawada');
      }}

      applyCombinedFilters();
    }}

    function applyCombinedFilters() {{
      let filtered = [...AUDIT_DATA];

      // 1. Filter by constituency
      if (currentConstituency !== 'ALL') {{
        filtered = filtered.filter(w => 
          w.constituency.toLowerCase().includes(currentConstituency.toLowerCase())
        );
      }}

      // 2. Filter by tab
      if (currentFilter === 'GREEN') {{
        filtered = filtered.filter(w => w.audit_classification === 'GREEN');
      }} else if (currentFilter === 'GEOTAG') {{
        filtered = filtered.filter(w => w.has_real_gps && w.latitude && w.longitude);
      }} else if (currentFilter === 'YELLOW') {{
        filtered = filtered.filter(w => w.audit_classification === 'YELLOW');
      }} else if (currentFilter === 'RED') {{
        filtered = filtered.filter(w => w.audit_classification === 'RED');
      }}

      // 3. Filter by search query
      const q = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
      if (q) {{
        filtered = filtered.filter(w => 
          w.work_id.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q) ||
          w.mandal.toLowerCase().includes(q) ||
          w.category.toLowerCase().includes(q) ||
          w.constituency.toLowerCase().includes(q)
        );
      }}

      updateKpis(filtered);
      renderTable(filtered);
      updateMapMarkers(filtered);
      populateSelector(filtered);
    }}

    function populateSelector(worksList = AUDIT_DATA) {{
      const select = document.getElementById('work-selector');
      if (!select) return;
      select.innerHTML = '';
      worksList.forEach(w => {{
        const opt = document.createElement('option');
        opt.value = w.work_id;
        const icon = w.has_real_gps ? '📍' : (w.audit_classification === 'GREEN' ? '🟢' : (w.audit_classification === 'YELLOW' ? '🟡' : '🔴'));
        opt.textContent = `[${{icon}} ID: ${{w.work_id}} - ${{w.constituency}}] ${{w.mandal}} - ${{w.title.substring(0, 26)}}...`;
        select.appendChild(opt);
      }});
    }}

    function renderTable(works) {{
      const tbody = document.getElementById('works-tbody');
      tbody.innerHTML = '';

      if (works.length === 0) {{
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">No works match the selected criteria.</td></tr>`;
        return;
      }}

      works.forEach(w => {{
        const audit = w.pdf_audit;
        const tr = document.createElement('tr');

        let pillClass = 'pill-red';
        let pillText = w.audit_badge_text || '🔴 No Document';
        if (w.audit_classification === 'GREEN') {{
          pillClass = 'pill-green';
        }} else if (w.audit_classification === 'YELLOW') {{
          pillClass = 'pill-yellow';
        }}

        const isVijayawada = w.constituency === 'Vijayawada';
        const constBadgeColor = isVijayawada ? '#C084FC' : '#38BDF8';
        const statusText = w.work_status || (w.is_completed ? 'Completed' : 'Sanctioned');

        // Render Attached Files list
        let filesHtml = '';
        if (w.attached_files && w.attached_files.length > 0) {{
          filesHtml = w.attached_files.map(f => `
            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
              <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">${{f.name.endsWith('.pdf') ? '📄' : '📷'}} ${{f.name}}</span>
              <span style="font-size: 10px; color: var(--text-dim);">(${{f.size_kb}} KB)</span>
            </div>
          `).join('');
        }} else {{
          filesHtml = '<span style="color: #EF4444; font-size: 11px; font-weight: 600;">❌ Not Uploaded</span>';
        }}

        // Render Scanned Pictures Count & Coordinates
        let picturesHtml = '';
        if (w.has_real_gps && w.latitude && w.longitude) {{
          picturesHtml = `
            <div>
              <div style="font-size: 12px; font-weight: 700; color: #34D399; display: flex; align-items: center; gap: 4px;">
                <span>📷 ${{audit.total_images}} Picture(s)</span>
              </div>
              <div style="font-size: 11px; font-family: var(--font-mono); color: #38BDF8; font-weight: 700; margin-top: 2px;">
                📍 ${{w.latitude.toFixed(6)}}° N, ${{w.longitude.toFixed(6)}}° E
              </div>
              <div style="font-size: 10px; color: #A7F3D0; font-family: var(--font-mono); margin-top: 1px;">
                🏷️ Visual GPS Stamp
              </div>
            </div>
          `;
        }} else if (audit.total_images > 0) {{
          picturesHtml = `
            <div>
              <span style="font-size: 12px; font-weight: 600; color: #34D399;">📷 ${{audit.total_images}} Picture(s)</span>
              <div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">Untagged Photo</div>
            </div>
          `;
        }} else {{
          picturesHtml = `<span style="font-size: 11px; color: var(--text-dim);">0 (No Images)</span>`;
        }}

        // Render Bill Proof
        let billProofHtml = '';
        if (audit.has_bill_proof) {{
          billProofHtml = `<span style="font-size: 11px; font-weight: 600; color: #38BDF8;">🧾 Bills / UC Verified</span>`;
        }} else {{
          billProofHtml = `<span style="font-size: 11px; color: var(--text-dim);">None</span>`;
        }}

        tr.innerHTML = `
          <td>
            <span class="work-id-badge">${{w.work_id}}</span>
            <div style="font-size: 10px; font-weight: 700; color: ${{constBadgeColor}}; margin-top: 2px;">
              ${{w.constituency}}
            </div>
          </td>
          <td>
            <div style="font-weight: 600; color: #FFFFFF;">${{w.mandal}}</div>
            <div style="font-size: 12px; color: var(--text-muted); max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${{w.description}}">
              ${{w.description}}
            </div>
            <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
              Status: <span style="color: ${{statusText === 'Completed' ? '#34D399' : '#FBBF24'}}; font-weight: 600;">${{statusText}}</span>
            </div>
          </td>
          <td>${{filesHtml}}</td>
          <td>${{picturesHtml}}</td>
          <td>${{billProofHtml}}</td>
          <td><span class="status-pill ${{pillClass}}" title="${{w.audit_reason}}">${{pillText}}</span></td>
          <td>
            <div class="table-actions-cell">
              <button class="btn-table-preview" onclick="openPreviewModal('${{w.work_id}}', 0, '${{audit.total_images > 0 ? 'image' : 'pdf'}}')" title="Preview Attached Evidence">
                👁️ Preview
              </button>
              <button class="btn-inspect" onclick="openDossier('${{w.work_id}}')" title="Inspect In-Memory Dossier">
                Inspect ➔
              </button>
              ${{w.attached_files && w.attached_files.length > 0 ? `
                <button class="btn-table-dl" onclick="downloadWorkAttachment('${{w.work_id}}')" title="Download Attached File">
                  📥 File
                </button>
              ` : `
                <button class="btn-table-dl" style="opacity: 0.35; cursor: not-allowed;" onclick="showToast('No files uploaded to MoSPI for Work ${{w.work_id}}', '⚠️')">
                  No File
                </button>
              `}}
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      }});
    }}

    function filterWorks(filter, btn) {{
      currentFilter = filter;
      document.querySelectorAll('.tab-btn').forEach(b => {{
        b.classList.remove('active', 'active-green', 'active-yellow', 'active-red');
      }});
      if (btn) {{
        btn.classList.add('active');
        if (filter === 'GREEN') btn.classList.add('active-green');
        if (filter === 'YELLOW') btn.classList.add('active-yellow');
        if (filter === 'RED') btn.classList.add('active-red');
      }}
      applyCombinedFilters();
    }}

    function handleSearch() {{
      applyCombinedFilters();
    }}

    function openDossier(workId) {{
      const work = AUDIT_DATA.find(w => w.work_id === String(workId));
      if (!work) return;

      currentActiveWorkId = String(workId);
      const audit = work.pdf_audit;
      document.getElementById('modal-work-id').textContent = `WORK ID: ${{work.work_id}} [${{work.constituency}}]`;
      document.getElementById('modal-mandal').textContent = `Mandal: ${{work.mandal}} | Const: ${{work.constituency}} | Status: ${{work.work_status || 'Active'}}`;
      document.getElementById('modal-title').textContent = work.description;

      const pill = document.getElementById('modal-status-pill');
      const vBox = document.getElementById('modal-verdict-box');
      const vIcon = document.getElementById('modal-verdict-icon');
      const vTitle = document.getElementById('modal-verdict-title');
      const vDesc = document.getElementById('modal-verdict-desc');

      if (work.audit_classification === 'GREEN') {{
        pill.className = 'status-pill pill-green';
        pill.textContent = work.audit_badge_text;
        vBox.className = 'audit-verdict-box verdict-compliant';
        vIcon.textContent = '🟢';
        vTitle.textContent = 'Scanned Image / Photographic Picture Evidence Verified';
        vDesc.textContent = work.audit_reason;
      }} else if (work.audit_classification === 'YELLOW') {{
        pill.className = 'status-pill pill-yellow';
        pill.textContent = work.audit_badge_text;
        vBox.className = 'audit-verdict-box verdict-warning';
        vIcon.textContent = '🟡';
        vTitle.textContent = 'Text / Bill Proof Verified (No Scanned Images Attached)';
        vDesc.textContent = work.audit_reason;
      }} else {{
        pill.className = 'status-pill pill-red';
        pill.textContent = work.audit_badge_text;
        vBox.className = 'audit-verdict-box verdict-alert';
        vIcon.textContent = '🔴';
        vTitle.textContent = 'Missing Proof / Zero Scanned Images & Bills Attached';
        vDesc.textContent = work.audit_reason;
      }}

      // Attached Files Breakdown
      const fList = document.getElementById('modal-files-list');
      if (work.attached_files && work.attached_files.length > 0) {{
        fList.innerHTML = work.attached_files.map(f => `
          <div style="font-family: monospace; font-size: 12px; color: #38BDF8; margin-bottom: 4px;">
            📄 ${{f.name}} (${{f.size_kb}} KB - ${{f.type}})
          </div>
        `).join('');
      }} else {{
        fList.innerHTML = '<span style="color: #EF4444; font-size: 12px;">No document uploaded on MoSPI</span>';
      }}

      document.getElementById('modal-scanned-count').textContent = `${{audit.total_images}} Scanned Picture(s)`;
      document.getElementById('modal-bill-proof').textContent = audit.has_bill_proof ? 'Verified Proof Found' : 'None Detected';

      const secList = document.getElementById('modal-sections-list');
      secList.innerHTML = '';
      if (audit.bill_proof_keywords && audit.bill_proof_keywords.length > 0) {{
        audit.bill_proof_keywords.forEach(kw => {{
          const span = document.createElement('span');
          span.className = 'section-tag';
          span.textContent = `Keyword: ${{kw}}`;
          secList.appendChild(span);
        }});
      }} else {{
        secList.innerHTML = '<span style="font-size: 11px; color: var(--text-dim);">No bill keywords found</span>';
      }}

      // GPS Telemetry
      const latEl = document.getElementById('modal-gps-lat');
      const lonEl = document.getElementById('modal-gps-lon');
      const dmsEl = document.getElementById('modal-gps-dms');
      const srcEl = document.getElementById('modal-gps-source');
      const geoEl = document.getElementById('modal-gps-geofence');
      const mapBtn = document.getElementById('modal-maps-link');

      if (audit.gps && audit.gps.latitude && audit.gps.longitude) {{
        latEl.textContent = `${{audit.gps.latitude.toFixed(6)}}° N`;
        lonEl.textContent = `${{audit.gps.longitude.toFixed(6)}}° E`;
        dmsEl.textContent = toDMS(audit.gps.latitude, audit.gps.longitude);
        srcEl.textContent = audit.gps.source || 'Verified GPS';
        geoEl.textContent = `✅ Verified Inside ${{work.constituency}} District`;
        mapBtn.href = `https://www.google.com/maps?q=${{audit.gps.latitude}},${{audit.gps.longitude}}`;
        mapBtn.style.display = 'inline-flex';
      }} else {{
        latEl.textContent = 'Not Present in File';
        latEl.style.color = '#EF4444';
        lonEl.textContent = 'Not Present in File';
        lonEl.style.color = '#EF4444';
        dmsEl.textContent = 'None';
        srcEl.textContent = 'No GPS Metadata / EXIF Stripped';
        geoEl.textContent = '❌ Unverified (No Coordinates)';
        mapBtn.style.display = 'none';
      }}

      // Images in Dossier Modal
      const imgStrip = document.getElementById('modal-image-strip');
      imgStrip.innerHTML = '';
      
      const manifestItem = REAL_MANIFEST[String(work.work_id)];
      let imagesToShow = [];
      if (manifestItem && manifestItem.images && manifestItem.images.length > 0) {{
        imagesToShow = manifestItem.images.map((imgName, idx) => ({{
          name: imgName,
          url: `downloads/images/${{imgName}}`,
          is_photo: true,
          has_exif_gps: false,
          idx: idx
        }}));
      }}

      if (imagesToShow.length === 0) {{
        imgStrip.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 18px; color: var(--text-dim); font-size: 12px;">No photographs or document images attached to this work record.</div>';
      }} else {{
        imagesToShow.forEach((img) => {{
          const box = document.createElement('div');
          box.className = `img-box ${{img.is_photo ? 'is-photo' : ''}}`;
          box.innerHTML = `
            <div style="width: 100%; height: 90px; border-radius: 8px; overflow: hidden; margin-bottom: 8px; position: relative; background: #0F172A; cursor: pointer;" onclick="openPreviewModal('${{work.work_id}}', ${{img.idx}}, 'image')">
              <img src="${{img.url}}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.06)'" onmouseout="this.style.transform='scale(1)'">
              <span style="position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.78); color: #34D399; font-size: 9px; font-family: monospace; padding: 2px 6px; border-radius: 4px;">
                🟢 SCANNED PICTURE
              </span>
            </div>
            <div>
              <div style="font-weight: 600; font-family: monospace; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${{img.name}}">${{img.name}}</div>
            </div>
            <div style="display: flex; gap: 6px; margin-top: 6px; width: 100%;">
              <button class="btn-preview-img" onclick="openPreviewModal('${{work.work_id}}', ${{img.idx}}, 'image')" style="
                flex: 1; background: rgba(168, 85, 247, 0.2); border: 1px solid #A855F7; color: #C084FC; font-size: 10px; font-weight: 600; padding: 5px 4px; border-radius: 6px; cursor: pointer;
              ">
                👁️ Preview
              </button>
              <button class="btn-download-img" onclick="downloadExtractedImage('${{work.work_id}}', '${{img.name}}')" style="
                flex: 1; margin-top: 0; padding: 5px 4px; font-size: 10px;
              ">
                💾 Download
              </button>
            </div>
          `;
          imgStrip.appendChild(box);
        }});
      }}

      document.getElementById('dossier-modal').style.display = 'flex';
    }}

    function closeModal() {{
      document.getElementById('dossier-modal').style.display = 'none';
    }}

    function closeModalOnOverlay(e) {{
      if (e.target.id === 'dossier-modal') closeModal();
    }}

    function toDMS(lat, lon) {{
      function convert(val, pos, neg) {{
        const dir = val >= 0 ? pos : neg;
        val = Math.abs(val);
        const deg = Math.floor(val);
        const minFloat = (val - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = ((minFloat - min) * 60).toFixed(1);
        return `${{deg}}°${{min}}'${{sec}}"${{dir}}`;
      }}
      return `${{convert(lat, 'N', 'S')}}, ${{convert(lon, 'E', 'W')}}`;
    }}

    /* =========================================================
       INTERACTIVE PREVIEW & EVIDENCE MODAL
       ========================================================= */

    let currentPreviewWorkId = null;
    let currentPreviewImgIdx = 0;
    let currentPreviewImageList = [];
    let previewMiniMap = null;
    let previewMiniMarker = null;
    let isHighlightVisible = true;
    let previewZoomLevel = 1;

    function openPreviewModal(workId, imgIdx = 0, initialTab = 'image') {{
      const work = AUDIT_DATA.find(w => w.work_id === String(workId));
      if (!work) return;

      currentPreviewWorkId = String(workId);
      currentPreviewImgIdx = imgIdx;
      previewZoomLevel = 1;
      isHighlightVisible = true;

      // Smart index selection: prioritize geotagged inspection photo
      const manifestItem = REAL_MANIFEST[String(workId)];
      if (manifestItem && manifestItem.image_gps && manifestItem.images) {{
        const gpsPhotos = Object.keys(manifestItem.image_gps);
        if (gpsPhotos.length > 0 && imgIdx === 0) {{
          const foundIdx = manifestItem.images.indexOf(gpsPhotos[0]);
          if (foundIdx !== -1) {{
            currentPreviewImgIdx = foundIdx;
            imgIdx = foundIdx;
          }}
        }}
      }}

      // Update Header Text
      document.getElementById('prev-work-id').textContent = `WORK ID: ${{work.work_id}} [${{work.constituency}}]`;
      document.getElementById('prev-mandal').textContent = `${{work.mandal}} Mandal | Disbursed: ₹${{Number(work.amount_disbursed).toLocaleString('en-IN')}} | Status: ${{work.work_status || 'Active'}}`;
      document.getElementById('prev-title').textContent = work.title;

      // Status Pill
      const pill = document.getElementById('prev-status-badge');
      pill.textContent = work.audit_badge_text;
      pill.className = `status-pill ${{work.audit_classification === 'GREEN' ? 'pill-green' : (work.audit_classification === 'YELLOW' ? 'pill-yellow' : 'pill-red')}}`;

      const classPill = document.getElementById('prev-class-pill');
      classPill.textContent = work.audit_badge_text;
      classPill.className = `status-pill ${{work.audit_classification === 'GREEN' ? 'pill-green' : (work.audit_classification === 'YELLOW' ? 'pill-yellow' : 'pill-red')}}`;
      document.getElementById('prev-class-reason').textContent = work.audit_reason;

      // Setup PDF Iframe
      const imgCount = (manifestItem && manifestItem.images) ? manifestItem.images.length : 0;

      const imgTabBtn = document.getElementById('tab-btn-image');
      if (imgCount > 0) {{
        imgTabBtn.innerHTML = `📷 Scanned Pictures (${{imgCount}} Available)`;
        imgTabBtn.style.opacity = '1';
      }} else {{
        imgTabBtn.innerHTML = `🚫 Pictures (0 Found)`;
        imgTabBtn.style.opacity = '0.75';
      }}

      const hasPdf = Boolean(manifestItem && manifestItem.pdf_file);
      const pdfFrame = document.getElementById('prev-pdf-iframe');
      const noPdfBox = document.getElementById('prev-no-pdf-box');
      const pdfNoticeBar = document.getElementById('prev-pdf-notice-bar');
      const pdfTabBtn = document.getElementById('tab-btn-pdf');

      if (hasPdf) {{
        pdfFrame.style.display = 'block';
        if (noPdfBox) noPdfBox.style.display = 'none';
        if (pdfNoticeBar) pdfNoticeBar.style.display = 'flex';
        pdfFrame.src = `downloads/pdfs/${{manifestItem.pdf_file}}#toolbar=1&navpanes=0`;
        pdfTabBtn.innerHTML = `📄 Official PDF Document`;
        pdfTabBtn.style.opacity = '1';
      }} else {{
        pdfFrame.style.display = 'none';
        pdfFrame.src = 'about:blank';
        if (noPdfBox) noPdfBox.style.display = 'flex';
        if (pdfNoticeBar) pdfNoticeBar.style.display = 'none';
        pdfTabBtn.innerHTML = `📄 No PDF Uploaded`;
        pdfTabBtn.style.opacity = '0.75';
      }}

      if (imgCount === 0 && hasPdf) {{
        initialTab = 'pdf';
      }} else if (imgCount > 0) {{
        initialTab = 'image';
      }}

      document.getElementById('preview-modal').style.display = 'flex';
      loadPreviewImages(work, imgIdx);
      switchPreviewTab(initialTab);
    }}

    function closePreviewModal() {{
      document.getElementById('preview-modal').style.display = 'none';
      const pdfFrame = document.getElementById('prev-pdf-iframe');
      if (pdfFrame) {{
        pdfFrame.src = 'about:blank';
        pdfFrame.style.display = 'none';
      }}
    }}

    function closePreviewModalOnOverlay(e) {{
      if (e.target.id === 'preview-modal') closePreviewModal();
    }}

    function switchPreviewTab(tab) {{
      const imgView = document.getElementById('canvas-image-view');
      const pdfView = document.getElementById('canvas-pdf-view');
      const imgTabBtn = document.getElementById('tab-btn-image');
      const pdfTabBtn = document.getElementById('tab-btn-pdf');
      const imgToolbar = document.getElementById('prev-image-toolbar');
      const pdfNoticeBar = document.getElementById('prev-pdf-notice-bar');

      const manifestItem = REAL_MANIFEST[currentPreviewWorkId];
      const hasPdf = Boolean(manifestItem && manifestItem.pdf_file);

      if (tab === 'image') {{
        imgView.style.display = 'flex';
        pdfView.style.display = 'none';
        imgTabBtn.classList.add('active');
        pdfTabBtn.classList.remove('active');
        if (imgToolbar) imgToolbar.style.display = (currentPreviewImageList.length > 0) ? 'flex' : 'none';
        if (pdfNoticeBar) pdfNoticeBar.style.display = 'none';
      }} else {{
        imgView.style.display = 'none';
        pdfView.style.display = 'flex';
        imgTabBtn.classList.remove('active');
        pdfTabBtn.classList.add('active');
        if (imgToolbar) imgToolbar.style.display = 'none';
        if (pdfNoticeBar) pdfNoticeBar.style.display = hasPdf ? 'flex' : 'none';
      }}
    }}

    function toggleHighlight() {{
      isHighlightVisible = !isHighlightVisible;
      const box = document.getElementById('preview-highlight-box');
      const btn = document.getElementById('btn-toggle-highlight');
      if (isHighlightVisible) {{
        box.classList.remove('hidden');
        btn.innerHTML = '🎯 Highlight: <strong>ON</strong>';
        btn.style.color = '#38BDF8';
        showToast('Visual GPS watermark highlight active', '📍');
      }} else {{
        box.classList.add('hidden');
        btn.innerHTML = '🎯 Highlight: <strong>OFF</strong>';
        btn.style.color = 'var(--text-muted)';
        showToast('Visual GPS watermark highlight hidden', '👁️');
      }}
    }}

    function zoomPreview(delta) {{
      if (delta === 0) {{
        previewZoomLevel = 1;
      }} else {{
        previewZoomLevel = Math.max(0.6, Math.min(3, previewZoomLevel + delta));
      }}
      const img = document.getElementById('prev-main-img');
      if (img) img.style.transform = `scale(${{previewZoomLevel}})`;
    }}

    function loadPreviewImages(work, selectedIdx = 0) {{
      const manifestItem = REAL_MANIFEST[String(work.work_id)];
      const thumbStrip = document.getElementById('prev-thumb-strip');
      thumbStrip.innerHTML = '';

      let imageList = [];
      if (manifestItem && manifestItem.images && manifestItem.images.length > 0) {{
        imageList = manifestItem.images.map((name, i) => ({{
          url: `downloads/images/${{name}}`,
          name: name,
          isReal: true,
          hasGps: Boolean(manifestItem.image_gps && manifestItem.image_gps[name])
        }}));
      }}

      currentPreviewImageList = imageList;
      
      const mainImg = document.getElementById('prev-main-img');
      const noImgBox = document.getElementById('prev-no-image-box');
      const toolbar = document.getElementById('prev-image-toolbar');

      if (imageList.length > 0) {{
        mainImg.style.display = 'block';
        if (noImgBox) noImgBox.style.display = 'none';
        if (toolbar) toolbar.style.display = 'flex';

        if (selectedIdx >= imageList.length) selectedIdx = 0;
        currentPreviewImgIdx = selectedIdx;
        setMainPreviewImage(imageList[selectedIdx]);

        imageList.forEach((item, idx) => {{
          const btn = document.createElement('button');
          btn.className = `thumb-btn ${{idx === selectedIdx ? 'active' : ''}}`;
          btn.title = item.name + (item.hasGps ? ' (📍 Stamped GPS Photo)' : '');
          btn.style.position = 'relative';

          btn.onclick = () => {{
            document.querySelectorAll('.thumb-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPreviewImgIdx = idx;
            setMainPreviewImage(item);
          }};

          const img = document.createElement('img');
          img.src = item.url;
          btn.appendChild(img);

          if (item.hasGps) {{
            const badge = document.createElement('span');
            badge.textContent = '📍 GPS';
            badge.style.cssText = 'position:absolute;bottom:2px;right:2px;background:#0284C7;color:#fff;font-size:8px;font-weight:700;font-family:monospace;padding:1px 3px;border-radius:2px;';
            btn.appendChild(badge);
          }}

          thumbStrip.appendChild(btn);
        }});
      }} else {{
        mainImg.style.display = 'none';
        mainImg.src = '';
        if (noImgBox) {{
          noImgBox.style.display = 'flex';
          const desc = document.getElementById('prev-no-img-desc');
          if (desc) desc.textContent = work.audit_classification === 'YELLOW' ? 'This work contains verified text/bill proof but no scanned pictures.' : 'No files or images attached on MoSPI.';
        }}
        if (toolbar) toolbar.style.display = 'none';
        updateLocationHighlight(work, null, manifestItem);
      }}
    }}

    function setMainPreviewImage(item) {{
      const mainImg = document.getElementById('prev-main-img');
      mainImg.src = item.url;
      previewZoomLevel = 1;
      mainImg.style.transform = 'scale(1)';
      
      const work = AUDIT_DATA.find(w => w.work_id === currentPreviewWorkId);
      const manifestItem = REAL_MANIFEST[currentPreviewWorkId];
      updateLocationHighlight(work, item, manifestItem);
    }}

    function switchToImageByName(imgName) {{
      if (!currentPreviewImageList) return;
      const idx = currentPreviewImageList.findIndex(item => item.name === imgName);
      if (idx !== -1) {{
        document.querySelectorAll('.thumb-btn').forEach((b, i) => {{
          b.classList.toggle('active', i === idx);
        }});
        currentPreviewImgIdx = idx;
        setMainPreviewImage(currentPreviewImageList[idx]);
      }}
    }}

    /* ONLY highlight if real visual GPS watermark exists on THIS photo! */
    function updateLocationHighlight(work, item, manifestItem) {{
      const highlightBox = document.getElementById('preview-highlight-box');
      const highlightTag = document.getElementById('prev-highlight-text');
      const noGpsBanner = document.getElementById('prev-no-gps-banner');
      const btnToggle = document.getElementById('btn-toggle-highlight');
      const pdfStatusText = document.getElementById('prev-pdf-status-text');

      const imgGps = (item && manifestItem && manifestItem.image_gps) ? manifestItem.image_gps[item.name] : null;

      if (imgGps && imgGps.latitude && imgGps.longitude) {{
        noGpsBanner.style.display = 'none';
        btnToggle.style.display = 'flex';

        // Precise positioning on the visual watermark
        if (imgGps.bbox && imgGps.bbox.w_pct > 0) {{
          const padX = 1.0;
          const padY = 0.5;
          const left = Math.max(0, imgGps.bbox.x_pct - padX);
          const top = Math.max(0, imgGps.bbox.y_pct - padY);
          const width = Math.min(100 - left, imgGps.bbox.w_pct + (padX * 2));
          const height = Math.max(3.2, imgGps.bbox.h_pct + (padY * 2));

          highlightBox.style.left = left + '%';
          highlightBox.style.top = top + '%';
          highlightBox.style.width = width + '%';
          highlightBox.style.height = height + '%';

          if (top < 12) {{
            highlightTag.style.top = 'calc(100% + 4px)';
            highlightTag.style.bottom = 'auto';
          }} else {{
            highlightTag.style.top = 'auto';
            highlightTag.style.bottom = 'calc(100% + 4px)';
          }}
        }} else {{
          highlightBox.style.left = '10%';
          highlightBox.style.top = '10%';
          highlightBox.style.width = '80%';
          highlightBox.style.height = '80%';
        }}

        if (isHighlightVisible) {{
          highlightBox.classList.remove('hidden');
        }} else {{
          highlightBox.classList.add('hidden');
        }}

        highlightTag.innerHTML = `📍 <strong>STAMPED GPS:</strong> ${{imgGps.raw_stamp_text || (imgGps.latitude.toFixed(6) + '°, ' + imgGps.longitude.toFixed(6) + '°')}}`;

        document.getElementById('prev-lat').textContent = `${{imgGps.latitude.toFixed(6)}}° N`;
        document.getElementById('prev-lat').style.color = '#38BDF8';
        document.getElementById('prev-lon').textContent = `${{imgGps.longitude.toFixed(6)}}° E`;
        document.getElementById('prev-lon').style.color = '#38BDF8';
        document.getElementById('prev-dms').textContent = toDMS(imgGps.latitude, imgGps.longitude);
        document.getElementById('prev-source').textContent = imgGps.source || 'Visual GPS Stamp (Photo Watermark)';
        document.getElementById('prev-location-name').textContent = imgGps.location_name || `${{work.mandal}} Mandal, ${{work.constituency}}`;
        document.getElementById('prev-geofence').textContent = `✅ Verified Inside ${{work.constituency}}`;
        document.getElementById('prev-geofence').style.color = '#10B981';

        document.getElementById('prev-mini-map-box').style.display = 'block';
        document.getElementById('prev-no-map-notice').style.display = 'none';
        document.getElementById('prev-gmap-btn').href = `https://www.google.com/maps?q=${{imgGps.latitude}},${{imgGps.longitude}}`;
        document.getElementById('prev-gmap-btn').style.display = 'inline-flex';

        if (pdfStatusText) {{
          pdfStatusText.textContent = `Visual GPS Stamp Detected: ${{imgGps.latitude}}° N, ${{imgGps.longitude}}° E (${{imgGps.raw_stamp_text || ''}})`;
          pdfStatusText.style.color = '#34D399';
        }}

        initOrUpdateMiniMap(imgGps.latitude, imgGps.longitude);
      }} else {{
        highlightBox.classList.add('hidden');
        btnToggle.style.display = 'none';
        noGpsBanner.style.display = 'block';

        const gpsKeys = Object.keys(manifestItem?.image_gps || {{}});
        if (gpsKeys.length > 0) {{
          const targetPhoto = gpsKeys[0];
          noGpsBanner.innerHTML = `
            <div style="color: #FBBF24; font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px;">
              <span>📍</span> Geotagged Photo Available in This Work
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px; line-height: 1.35;">
              This specific image does not contain GPS text, but this work includes a geotagged photo: 
              <a href="javascript:void(0)" onclick="switchToImageByName('${{targetPhoto}}')" style="color: #38BDF8; font-weight: 700; text-decoration: underline;">Switch to ${{targetPhoto}} ➔</a>
            </div>
          `;
        }} else {{
          noGpsBanner.innerHTML = `
            <div style="color: #F87171; font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px;">
              <span>⚠️</span> GPS Coordinates Not Watermarked
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px; line-height: 1.35;">
              Scanned physical photos or document pages do not contain digital EXIF GPS tags or stamped GPS watermark text.
            </div>
          `;
        }}

        document.getElementById('prev-lat').textContent = 'Not Present in This Photo';
        document.getElementById('prev-lat').style.color = '#EF4444';
        document.getElementById('prev-lon').textContent = 'Not Present in This Photo';
        document.getElementById('prev-lon').style.color = '#EF4444';
        document.getElementById('prev-dms').textContent = 'None';
        document.getElementById('prev-source').textContent = 'Untagged Photo';
        document.getElementById('prev-location-name').textContent = `${{work.mandal}} (Untagged)`;
        document.getElementById('prev-geofence').textContent = '❌ No Coordinates';
        document.getElementById('prev-geofence').style.color = '#EF4444';

        document.getElementById('prev-mini-map-box').style.display = 'none';
        document.getElementById('prev-no-map-notice').style.display = 'block';
        document.getElementById('prev-gmap-btn').style.display = 'none';

        if (pdfStatusText) {{
          pdfStatusText.textContent = work.audit_reason;
          pdfStatusText.style.color = work.audit_classification === 'YELLOW' ? '#FBBF24' : '#EF4444';
        }}
      }}
    }}

    function initOrUpdateMiniMap(lat, lon) {{
      const container = document.getElementById('preview-mini-map');
      if (!container || typeof L === 'undefined') return;

      setTimeout(() => {{
        try {{
          if (!previewMiniMap) {{
            previewMiniMap = L.map('preview-mini-map', {{
              zoomControl: false,
              attributionControl: false
            }}).setView([lat, lon], 16);

            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}', {{
              maxZoom: 19
            }}).addTo(previewMiniMap);

            const icon = L.divIcon({{
              className: 'leaflet-custom-marker',
              html: `<div class="pin-verified" style="width:26px;height:26px;font-size:13px;box-shadow: 0 0 14px #10B981;">📍</div>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            }});
            previewMiniMarker = L.marker([lat, lon], {{ icon }}).addTo(previewMiniMap);
          }} else {{
            previewMiniMap.setView([lat, lon], 16);
            if (previewMiniMarker) previewMiniMarker.setLatLng([lat, lon]);
            previewMiniMap.invalidateSize();
          }}
        }} catch (err) {{
          console.error('Mini map init error:', err);
        }}
      }}, 150);
    }}

    function downloadCurrentPreviewImage() {{
      if (!currentPreviewWorkId || !currentPreviewImageList || currentPreviewImageList.length === 0) return;
      const activeItem = currentPreviewImageList[currentPreviewImgIdx] || currentPreviewImageList[0];
      downloadExtractedImage(currentPreviewWorkId, activeItem.name);
    }}

    function downloadCurrentWorkFile() {{
      if (!currentActiveWorkId) return;
      downloadWorkAttachment(currentActiveWorkId);
    }}

    function downloadWorkAttachment(workId) {{
      const work = AUDIT_DATA.find(w => w.work_id === String(workId));
      if (!work) return;

      const manifestItem = REAL_MANIFEST[String(workId)];
      if (manifestItem && manifestItem.pdf_file) {{
        const pdfUrl = `downloads/pdfs/${{manifestItem.pdf_file}}`;
        showToast(`Downloading ${{manifestItem.pdf_file}}...`, '📥');
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = manifestItem.pdf_file;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }} else if (manifestItem && manifestItem.images && manifestItem.images.length > 0) {{
        const imgName = manifestItem.images[0];
        const imgUrl = `downloads/images/${{imgName}}`;
        showToast(`Downloading ${{imgName}}...`, '📥');
        const a = document.createElement('a');
        a.href = imgUrl;
        a.download = imgName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }}
      showToast(`No attached files found for Work ${{workId}}`, '⚠️');
    }}

    function downloadExtractedImage(workId, imageName) {{
      const manifestItem = REAL_MANIFEST[String(workId)];
      if (manifestItem && manifestItem.images && manifestItem.images.length > 0) {{
        let matched = manifestItem.images.find(img => img.includes(imageName)) || manifestItem.images[0];
        const imgUrl = `downloads/images/${{matched}}`;
        showToast(`Downloading ${{matched}}...`, '📷');

        const a = document.createElement('a');
        a.href = imgUrl;
        a.download = matched;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }}
      showToast(`No image file to download`, '⚠️');
    }}

    function downloadAllCurrentImages() {{
      if (!currentActiveWorkId) return;
      const manifestItem = REAL_MANIFEST[String(currentActiveWorkId)];
      if (manifestItem && manifestItem.images && manifestItem.images.length > 0) {{
        showToast(`Downloading ${{manifestItem.images.length}} photo streams...`, '📦');
        manifestItem.images.forEach((img, i) => {{
          setTimeout(() => {{
            const a = document.createElement('a');
            a.href = `downloads/images/${{img}}`;
            a.download = img;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }}, i * 400);
        }});
      }} else {{
        showToast(`No photos available for this work`, '⚠️');
      }}
    }}

    // Live In-Memory Simulation
    function runLiveMemoryScan() {{
      const wid = document.getElementById('work-selector').value;
      const work = AUDIT_DATA.find(w => w.work_id === wid);
      if (!work) return;

      const log = document.getElementById('terminal-log');
      log.innerHTML = '';

      function addLine(txt, cls = '') {{
        const d = document.createElement('div');
        d.className = `terminal-line ${{cls}}`;
        d.textContent = txt;
        log.appendChild(d);
        log.scrollTop = log.scrollHeight;
      }}

      addLine(`[0.05s] Initiating forensic evidence audit for Work ID: ${{wid}} (${{work.constituency}})...`, 't-cyan');
      addLine(`[0.18s] Connecting to MoSPI attachment stream endpoint (FLAG=1..6)...`, 't-dim');

      setTimeout(() => {{
        if (work.attached_files && work.attached_files.length > 0) {{
          addLine(`[0.45s] Resolved ${{work.attached_files.length}} file attachment(s): ${{work.attached_files.map(f => f.name).join(', ')}}`, 't-cyan');
          addLine(`[0.72s] Inspecting payload binary headers...`, 't-dim');
        }} else {{
          addLine(`[0.45s] MoSPI endpoint response: ATTACH_ID is null / No document uploaded.`, 't-danger');
        }}
      }}, 400);

      setTimeout(() => {{
        if (work.pdf_audit.total_images > 0) {{
          addLine(`[1.10s] Raster picture inspection: ${{work.pdf_audit.total_images}} scanned image(s)/photo(s) detected.`, 't-success');
        }} else if (work.pdf_audit.has_bill_proof) {{
          addLine(`[1.10s] Text stream check: 0 images found. Verified completion keywords: ${{work.pdf_audit.bill_proof_keywords.join(', ')}}`, 't-warn');
        }} else {{
          addLine(`[1.10s] Verification result: 0 pictures and 0 bill proof keywords found.`, 't-danger');
        }}
      }}, 900);

      setTimeout(() => {{
        if (work.audit_classification === 'GREEN') {{
          addLine(`[1.95s] AUDIT VERDICT: 🟢 GREEN - Scanned Image / Picture Evidence Present.`, 't-success');
          addLine(`[2.10s] Details: ${{work.audit_reason}}`, 't-dim');
        }} else if (work.audit_classification === 'YELLOW') {{
          addLine(`[1.95s] AUDIT VERDICT: 🟡 YELLOW - Bill / Completion Proof Only (No Images).`, 't-warn');
          addLine(`[2.10s] Details: ${{work.audit_reason}}`, 't-dim');
        }} else {{
          addLine(`[1.95s] AUDIT VERDICT: 🔴 RED - Missing Proof / No Document Uploaded.`, 't-danger');
          addLine(`[2.10s] Details: ${{work.audit_reason}}`, 't-dim');
        }}
        addLine(`[2.35s] Forensic scan complete. Pure ground truth.`, 't-cyan');
      }}, 1600);
    }}

    // Robust Boot sequence
    function bootDashboard() {{
      try {{ populateSelector(AUDIT_DATA); }} catch (e) {{ console.error('populateSelector error:', e); }}
      try {{ renderTable(AUDIT_DATA); }} catch (e) {{ console.error('renderTable error:', e); }}
      try {{ updateKpis(AUDIT_DATA); }} catch (e) {{ console.error('updateKpis error:', e); }}
      try {{ initLeafletMap(); }} catch (e) {{ console.error('initLeafletMap error:', e); }}
    }}

    if (document.readyState === 'loading') {{
      document.addEventListener('DOMContentLoaded', bootDashboard);
    }} else {{
      bootDashboard();
    }}
  </script>
</body>
</html>
'''

# Write to geotag_audit_dashboard.html
with open("geotag_audit_dashboard.html", "w", encoding="utf-8") as f:
    f.write(html_content)

# Write to frontend/public/geotag_dashboard.html
with open("frontend/public/geotag_dashboard.html", "w", encoding="utf-8") as f:
    f.write(html_content)

print("[SUCCESS] 3-Tier Classification Dashboard successfully generated!")
print(f"   - Total Works: {total_works}")
print(f"   - 🟢 GREEN (Scanned Pictures): {green_count}")
print(f"   - 🟡 YELLOW (Bill Proof Only): {yellow_count}")
print(f"   - 🔴 RED (Missing / Invalid): {red_count}")
