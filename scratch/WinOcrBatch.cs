using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Windows.Storage;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

namespace WinOcrApp {
    public class OcrWordItem {
        public string text { get; set; }
        public double x { get; set; }
        public double y { get; set; }
        public double w { get; set; }
        public double h { get; set; }
    }

    public class OcrLineItem {
        public string text { get; set; }
        public double x { get; set; }
        public double y { get; set; }
        public double w { get; set; }
        public double h { get; set; }
        public List<OcrWordItem> words { get; set; }
    }

    public class DetectedGps {
        public double latitude { get; set; }
        public double longitude { get; set; }
        public string raw_text { get; set; }
        public double bbox_x_pct { get; set; }
        public double bbox_y_pct { get; set; }
        public double bbox_w_pct { get; set; }
        public double bbox_h_pct { get; set; }
        public string source { get; set; }
        public string location_name { get; set; }
        public string timestamp { get; set; }
    }

    public class ImageOcrRecord {
        public string filename { get; set; }
        public string fullpath { get; set; }
        public int pixel_width { get; set; }
        public int pixel_height { get; set; }
        public List<OcrLineItem> lines { get; set; }
        public DetectedGps gps { get; set; }
    }

    class Program {
        static readonly Regex LatRegex = new Regex(@"(?:Lat(?:itude)?|[tT]at)[:\s]*([1-9][0-9]\.[0-9]{4,8})", RegexOptions.IgnoreCase);
        static readonly Regex LonRegex = new Regex(@"(?:Long(?:itude)?|[tT]ong|[Ll]on)[:\s]*([789][0-9]\.[0-9]{4,8})", RegexOptions.IgnoreCase);

        static DetectedGps ExtractGps(List<OcrLineItem> lines, int width, int height) {
            DetectedGps bestGps = null;

            for (int i = 0; i < lines.Count; i++) {
                var l = lines[i];
                var mLat = LatRegex.Match(l.text);
                var mLon = LonRegex.Match(l.text);

                if (mLat.Success && mLon.Success) {
                    double lat = double.Parse(mLat.Groups[1].Value);
                    double lon = double.Parse(mLon.Groups[1].Value);
                    if (lat >= 8.0 && lat <= 38.0 && lon >= 68.0 && lon <= 98.0) {
                        var gps = new DetectedGps {
                            latitude = lat,
                            longitude = lon,
                            raw_text = l.text,
                            bbox_x_pct = Math.Round((l.x / width) * 100.0, 2),
                            bbox_y_pct = Math.Round((l.y / height) * 100.0, 2),
                            bbox_w_pct = Math.Round((l.w / width) * 100.0, 2),
                            bbox_h_pct = Math.Round((l.h / height) * 100.0, 2),
                            source = "Visual GPS Stamp (OCR)"
                        };
                        // If there's an address line above or timestamp line below, capture context
                        if (i > 0 && (lines[i - 1].text.Contains("Andhra") || lines[i - 1].text.Contains("India") || lines[i - 1].text.Contains("Rd"))) {
                            gps.location_name = lines[i - 1].text;
                        }
                        if (i + 1 < lines.Count && (lines[i + 1].text.Contains("202") || lines[i + 1].text.Contains("GMT") || lines[i + 1].text.Contains("AM") || lines[i + 1].text.Contains("PM"))) {
                            gps.timestamp = lines[i + 1].text;
                        }

                        // Prefer GPS Map Camera stamp over mobile overlay
                        if (l.text.Contains("Lat ") && !l.text.Contains("Lat:")) {
                            return gps;
                        }
                        if (bestGps == null) {
                            bestGps = gps;
                        }
                    }
                }
            }

            if (bestGps != null) return bestGps;

            // Also check adjacent lines if Lat is on one line and Long is on next
            for (int i = 0; i < lines.Count - 1; i++) {
                var l1 = lines[i];
                var l2 = lines[i + 1];
                var mLat = LatRegex.Match(l1.text);
                var mLon = LonRegex.Match(l2.text);
                if (mLat.Success && mLon.Success) {
                    double lat = double.Parse(mLat.Groups[1].Value);
                    double lon = double.Parse(mLon.Groups[1].Value);
                    if (lat >= 8.0 && lat <= 38.0 && lon >= 68.0 && lon <= 98.0) {
                        double minX = Math.Min(l1.x, l2.x);
                        double minY = Math.Min(l1.y, l2.y);
                        double maxX = Math.Max(l1.x + l1.w, l2.x + l2.w);
                        double maxY = Math.Max(l1.y + l1.h, l2.y + l2.h);
                        return new DetectedGps {
                            latitude = lat,
                            longitude = lon,
                            raw_text = l1.text + " " + l2.text,
                            bbox_x_pct = Math.Round((minX / width) * 100.0, 2),
                            bbox_y_pct = Math.Round((minY / height) * 100.0, 2),
                            bbox_w_pct = Math.Round(((maxX - minX) / width) * 100.0, 2),
                            bbox_h_pct = Math.Round(((maxY - minY) / height) * 100.0, 2),
                            source = "Visual GPS Stamp (OCR)"
                        };
                    }
                }
            }

            return null;
        }

        static async Task<int> Run(string dirPath, string outJsonPath) {
            var files = Directory.GetFiles(dirPath, "*.*");
            var imgList = new List<string>();
            foreach (var f in files) {
                string ext = Path.GetExtension(f).ToLowerInvariant();
                if (ext == ".jpg" || ext == ".jpeg" || ext == ".png") {
                    imgList.Add(f);
                }
            }

            Console.WriteLine(string.Format("Found {0} images in {1}", imgList.Count, dirPath));
            var engine = OcrEngine.TryCreateFromUserProfileLanguages();
            if (engine == null) {
                Console.WriteLine("Could not create OcrEngine");
                return 1;
            }

            var results = new Dictionary<string, ImageOcrRecord>();
            int processed = 0;
            int withGps = 0;

            foreach (var imgPath in imgList) {
                string fname = Path.GetFileName(imgPath);
                try {
                    var file = await WindowsRuntimeSystemExtensions.AsTask(StorageFile.GetFileFromPathAsync(imgPath));
                    using (var stream = await WindowsRuntimeSystemExtensions.AsTask(file.OpenAsync(FileAccessMode.Read))) {
                        var decoder = await WindowsRuntimeSystemExtensions.AsTask(BitmapDecoder.CreateAsync(stream));
                        var bitmap = await WindowsRuntimeSystemExtensions.AsTask(decoder.GetSoftwareBitmapAsync());
                        var ocr = await WindowsRuntimeSystemExtensions.AsTask(engine.RecognizeAsync(bitmap));

                        var record = new ImageOcrRecord {
                            filename = fname,
                            fullpath = imgPath,
                            pixel_width = bitmap.PixelWidth,
                            pixel_height = bitmap.PixelHeight,
                            lines = new List<OcrLineItem>()
                        };

                        foreach (var l in ocr.Lines) {
                            double minX = double.MaxValue, minY = double.MaxValue, maxX = 0, maxY = 0;
                            var wordList = new List<OcrWordItem>();
                            foreach (var w in l.Words) {
                                wordList.Add(new OcrWordItem {
                                    text = w.Text,
                                    x = w.BoundingRect.X,
                                    y = w.BoundingRect.Y,
                                    w = w.BoundingRect.Width,
                                    h = w.BoundingRect.Height
                                });
                                if (w.BoundingRect.X < minX) minX = w.BoundingRect.X;
                                if (w.BoundingRect.Y < minY) minY = w.BoundingRect.Y;
                                double right = w.BoundingRect.X + w.BoundingRect.Width;
                                double bottom = w.BoundingRect.Y + w.BoundingRect.Height;
                                if (right > maxX) maxX = right;
                                if (bottom > maxY) maxY = bottom;
                            }

                            if (minX == double.MaxValue) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

                            record.lines.Add(new OcrLineItem {
                                text = l.Text,
                                x = minX,
                                y = minY,
                                w = maxX - minX,
                                h = maxY - minY,
                                words = wordList
                            });
                        }

                        record.gps = ExtractGps(record.lines, bitmap.PixelWidth, bitmap.PixelHeight);
                        if (record.gps != null) {
                            withGps++;
                            Console.WriteLine(string.Format("[GPS FOUND] {0} -> Lat: {1}, Lon: {2} (Text: '{3}')",
                                fname, record.gps.latitude, record.gps.longitude, record.gps.raw_text));
                        }

                        results[fname] = record;
                    }
                } catch (Exception ex) {
                    Console.WriteLine(string.Format("[ERROR] {0}: {1}", fname, ex.Message));
                }

                processed++;
                if (processed % 25 == 0 || processed == imgList.Count) {
                    Console.WriteLine(string.Format("Progress: {0}/{1} (GPS found in {2} images)", processed, imgList.Count, withGps));
                }
            }

            var serializer = new JavaScriptSerializer();
            serializer.MaxJsonLength = int.MaxValue;
            string json = serializer.Serialize(results);
            File.WriteAllText(outJsonPath, json);
            Console.WriteLine(string.Format("Saved OCR results to {0}", outJsonPath));
            return 0;
        }

        static void Main(string[] args) {
            string dir = args.Length > 0 ? Path.GetFullPath(args[0]) : Path.GetFullPath("downloads/images");
            string outFile = args.Length > 1 ? Path.GetFullPath(args[1]) : Path.GetFullPath("data/processed/visual_ocr_results.json");
            try {
                int res = Run(dir, outFile).GetAwaiter().GetResult();
                Environment.Exit(res);
            } catch (Exception ex) {
                Console.WriteLine("Fatal error: " + ex.ToString());
                Environment.Exit(2);
            }
        }
    }
}
