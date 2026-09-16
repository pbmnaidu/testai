/**
 * Client-Side Image Compression and Optimization Utility.
 *
 * Compresses images in browser memory using HTML5 Canvas downscaling and JPEG
 * quality optimization before uploading to Firebase Storage.
 * Reduces 5-15 MB camera images to ~60-100 KB (98% reduction in memory and bandwidth).
 */

export interface OptimizedImageResult {
  file: File;
  dataUrl: string;
  byteSize: number;
  originalSize: number;
  width: number;
  height: number;
  compressionRatio: string;
}

export async function optimizeImageForUpload(
  source: File | Blob,
  fileName: string = 'capture.jpg',
  options: {
    maxDimension?: number;
    quality?: number;
  } = {}
): Promise<OptimizedImageResult> {
  const maxDim = options.maxDimension || 1280;
  const quality = options.quality || 0.78;
  const originalSize = source.size;

  return new Promise<OptimizedImageResult>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed reading image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed decoding image data.'));
      img.onload = () => {
        let { width, height } = img;

        // Calculate scaled dimensions
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          reject(new Error('Could not initialize canvas context for compression.'));
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas blob encoding failed.'));
              return;
            }

            const cleanFileName = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')
              ? fileName
              : `${fileName.replace(/\.[^/.]+$/, '')}.jpg`;

            const compressedFile = new File([blob], cleanFileName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const ratio = originalSize > 0
              ? `${Math.round((1 - blob.size / originalSize) * 100)}%`
              : '0%';

            resolve({
              file: compressedFile,
              dataUrl,
              byteSize: blob.size,
              originalSize,
              width,
              height,
              compressionRatio: ratio,
            });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(source);
  });
}
