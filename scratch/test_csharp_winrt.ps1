$src = @"
using System;
using System.Threading.Tasks;
using Windows.Storage;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

public class WinOcr {
    public static string RecognizeFile(string path) {
        var task = Task.Run(async () => {
            var file = await StorageFile.GetFileFromPathAsync(path);
            using (var stream = await file.OpenAsync(FileAccessMode.Read)) {
                var decoder = await BitmapDecoder.CreateAsync(stream);
                var bitmap = await decoder.GetSoftwareBitmapAsync();
                var engine = OcrEngine.TryCreateFromUserProfileLanguages();
                var result = await engine.RecognizeAsync(bitmap);
                return result.Text;
            }
        });
        return task.GetAwaiter().GetResult();
    }
}
"@

$winmdPaths = @(
    "C:\Windows\System32\WinMetadata\Windows.Foundation.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Storage.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Graphics.winmd",
    "C:\Windows\System32\WinMetadata\Windows.Media.winmd"
)

Add-Type -TypeDefinition $src -ReferencedAssemblies $winmdPaths -Language CSharp
Write-Output "Compiled WinOcr successfully!"

$img = (Get-ChildItem -Path "downloads/images" -Filter "*.jpeg" | Select-Object -First 1).FullName
$txt = [WinOcr]::RecognizeFile($img)
Write-Output "OCR Result on $($img):"
Write-Output $txt
