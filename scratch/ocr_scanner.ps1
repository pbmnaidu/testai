Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
}

function Await($asyncOp) {
    $iface = $asyncOp.GetType().GetInterfaces() | Where-Object { $_.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $paramType = $iface.GetGenericArguments()[0]
    $method = $asTaskGeneric[0].MakeGenericMethod($paramType)
    $task = $method.Invoke($null, @($asyncOp))
    $task.Wait()
    return $task.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
    Write-Error "OCR Engine could not be created."
    exit 1
}

$images = Get-ChildItem -Path "downloads/images" -Filter "*.jpeg"
$images += Get-ChildItem -Path "downloads/images" -Filter "*.jpg"

$results = @{}

foreach ($img in ($images | Select-Object -First 3)) {
    try {
        Write-Output "Processing $($img.Name)..."
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($img.FullName))
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
        $softwareBitmap = Await ($decoder.GetSoftwareBitmapAsync())
        $ocrResult = Await ($engine.RecognizeAsync($softwareBitmap))

        $allText = ($ocrResult.Lines | ForEach-Object { $_.Text }) -join " "
        Write-Output "Result for $($img.Name): $allText"
    } catch {
        Write-Output "ERROR on $($img.Name): $_"
        Write-Output $_.Exception.ToString()
    }
}

$results | ConvertTo-Json | Set-Content "scratch/ocr_results.json" -Encoding UTF8
