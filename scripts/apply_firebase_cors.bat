@echo off
echo =========================================================================
echo MPLADS Platform: Apply CORS and Security Rules to Firebase Storage Bucket
echo =========================================================================
echo.

set BUCKET=gs://nirikshan-ai-44.firebasestorage.app

echo [1/3] Checking Google Cloud / Firebase credentials...
call firebase login --reauth

echo [2/3] Applying cors.json to %BUCKET%...
where gsutil >nul 2>nul
if %ERRORLEVEL% equ 0 (
    gsutil cors set cors.json %BUCKET%
    goto deploy_rules
)

where gcloud >nul 2>nul
if %ERRORLEVEL% equ 0 (
    gcloud storage buckets update %BUCKET% --cors-file=cors.json
    goto deploy_rules
)

echo Notice: Neither gsutil nor gcloud was found in PATH.
echo To apply CORS configuration to your Firebase Storage bucket manually:
echo   1. Install Google Cloud SDK or use Google Cloud Console Cloud Shell
echo   2. Run: gcloud storage buckets update %BUCKET% --cors-file=cors.json
echo.

:deploy_rules
echo [3/3] Deploying Firestore and Storage security rules...
call firebase deploy --only firestore:rules,storage

echo.
echo =========================================================================
echo Configuration complete!
echo =========================================================================
