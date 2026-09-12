Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
$img = (Get-ChildItem -Path "downloads/images" -Filter "*.jpeg" | Select-Object -First 1).FullName
$op = [Windows.Storage.StorageFile]::GetFileFromPathAsync($img)
Write-Output "Type: $($op.GetType().FullName)"
Write-Output "Interfaces:"
$op.GetType().GetInterfaces() | ForEach-Object { Write-Output "  $($_.FullName)" }
