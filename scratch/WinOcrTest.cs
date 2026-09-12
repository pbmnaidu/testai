using System;
using System.IO;
using System.Threading.Tasks;
using Windows.Storage;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

namespace WinOcrApp {
    class Program {
        static async Task<int> Run(string[] args) {
            if (args.Length == 0) {
                Console.WriteLine("Usage: WinOcr.exe <image_path>");
                return 1;
            }
            string path = Path.GetFullPath(args[0]);
            if (!File.Exists(path)) {
                Console.WriteLine("File not found: " + path);
                return 2;
            }
            var file = await WindowsRuntimeSystemExtensions.AsTask(StorageFile.GetFileFromPathAsync(path));
            using (var stream = await WindowsRuntimeSystemExtensions.AsTask(file.OpenAsync(FileAccessMode.Read))) {
                var decoder = await WindowsRuntimeSystemExtensions.AsTask(BitmapDecoder.CreateAsync(stream));
                var bitmap = await WindowsRuntimeSystemExtensions.AsTask(decoder.GetSoftwareBitmapAsync());
                var engine = OcrEngine.TryCreateFromUserProfileLanguages();
                if (engine == null) {
                    Console.WriteLine("OcrEngine could not be initialized");
                    return 3;
                }
                var result = await WindowsRuntimeSystemExtensions.AsTask(engine.RecognizeAsync(bitmap));
                Console.WriteLine("OCR_TEXT_START");
                foreach (var line in result.Lines) {
                    Console.WriteLine(line.Text);
                }
                Console.WriteLine("OCR_TEXT_END");
            }
            return 0;
        }

        static void Main(string[] args) {
            try {
                int res = Run(args).GetAwaiter().GetResult();
                Environment.Exit(res);
            } catch (Exception ex) {
                Console.WriteLine("ERROR: " + ex.ToString());
                Environment.Exit(4);
            }
        }
    }
}
