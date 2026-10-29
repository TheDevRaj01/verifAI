import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import type { DocumentOcrResult, OcrMethod } from '../types/index.ts';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href;
  } catch {
    // Fallback if URL resolution fails
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
  }
}

export interface OcrProgress {
  status: string;
  progress: number; // 0 - 100
  page?: number;
  totalPages?: number;
  phase?: 'loading' | 'native_parsing' | 'rasterizing' | 'ocr_recognition' | 'completed';
}

export interface OcrExtractionOptions {
  language?: string; // 'eng' | 'hin' | 'eng+hin', defaults to 'eng'
  maxPdfPages?: number; // defaults to 5
  onProgress?: (progress: OcrProgress) => void;
}

/**
 * Converts a base64 or Data URL string into a Uint8Array for PDF.js.
 * Handles whitespace, newlines, URL-safe characters, and missing padding.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  let base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  base64 = base64.replace(/[\s\r\n]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }

  let binaryString: string;
  if (typeof atob === 'function') {
    binaryString = atob(base64);
  } else if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    throw new Error('No base64 decoding method available in this environment.');
  }

  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Detects whether the file is a PDF document based on MIME type, filename, URL, or %PDF- magic bytes.
 */
function isPdfDocument(fileDataUrl: string, fileType?: string, fileName?: string): boolean {
  if (fileType?.toLowerCase().includes('pdf')) return true;
  if (fileName?.toLowerCase().endsWith('.pdf')) return true;
  if (fileDataUrl.startsWith('data:application/pdf')) return true;
  if (fileDataUrl.startsWith('data:text/pdf')) return true;

  if (fileDataUrl.startsWith('http://') || fileDataUrl.startsWith('https://')) {
    const urlClean = fileDataUrl.split('?')[0].toLowerCase();
    if (urlClean.endsWith('.pdf') || urlClean.includes('/documents/') || urlClean.includes('.pdf?')) return true;
  }

  // Check magic bytes (%PDF- is 25 50 44 46 2d -> JVBERi0)
  const base64Prefix = fileDataUrl.includes(',')
    ? fileDataUrl.split(',')[1].slice(0, 50).trim()
    : fileDataUrl.slice(0, 50).trim();

  if (base64Prefix.startsWith('JVBERi0') || base64Prefix.includes('JVBERi0')) return true;

  return false;
}

/**
 * Resolves binary bytes from either a base64 data URL or an HTTP(S) Cloud Storage URL.
 */
async function getBytesFromPayload(filePayload: string): Promise<Uint8Array> {
  if (filePayload.startsWith('http://') || filePayload.startsWith('https://')) {
    const response = await fetch(filePayload);
    if (!response.ok) {
      throw new Error(`Failed to fetch document from cloud storage: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return dataUrlToUint8Array(filePayload);
}

/**
 * Extracts native digital text from a PDF document page by page.
 * Uses text item coordinates to reconstruct clean lines.
 */
async function extractNativePdfText(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  maxPages: number,
  onProgress?: (progress: OcrProgress) => void
): Promise<{ text: string; pagesProcessed: number; hasText: boolean }> {
  const totalPages = Math.min(pdfDoc.numPages, maxPages);
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      status: `Extracting native digital text (Page ${pageNum} of ${totalPages})...`,
      progress: Math.round(((pageNum - 1) / totalPages) * 70),
      page: pageNum,
      totalPages,
      phase: 'native_parsing',
    });

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    let lastY: number | undefined;
    const lines: string[] = [];
    let currentLine = '';

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const textItem = item as { str: string; transform?: number[] };
        const currentY = textItem.transform ? textItem.transform[5] : undefined;

        if (lastY !== undefined && currentY !== undefined && Math.abs(currentY - lastY) > 5) {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }
          currentLine = textItem.str;
        } else {
          currentLine += (currentLine.length > 0 && !currentLine.endsWith(' ') ? ' ' : '') + textItem.str;
        }
        lastY = currentY;
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    const pageResult = lines.join('\n').trim();
    if (pageResult) {
      pageTexts.push(totalPages > 1 ? `--- Page ${pageNum} ---\n${pageResult}` : pageResult);
    }
  }

  const combinedText = pageTexts.join('\n\n').trim();
  const hasText = combinedText.length >= 30; // More than 30 characters means real text

  return {
    text: combinedText,
    pagesProcessed: totalPages,
    hasText,
  };
}

/**
 * Fallback for scanned/raster PDFs: Renders PDF pages to an off-screen HTML canvas
 * and applies Tesseract OCR.
 */
async function extractScannedPdfOcr(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  maxPages: number,
  language: string,
  onProgress?: (progress: OcrProgress) => void
): Promise<{ text: string; pagesProcessed: number }> {
  const totalPages = Math.min(pdfDoc.numPages, maxPages);
  const scannedPages: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      status: `Rendering page ${pageNum} of ${totalPages} for OCR recognition...`,
      progress: Math.round(((pageNum - 1) / totalPages) * 100),
      page: pageNum,
      totalPages,
      phase: 'rasterizing',
    });

    const page = await pdfDoc.getPage(pageNum);
    // Render at optimal resolution (bounded between 800px and 1800px width)
    const baseViewport = page.getViewport({ scale: 1.0 });
    const targetScale = baseViewport.width > 0
      ? Math.min(2.0, Math.max(1.0, 1400 / baseViewport.width))
      : 1.5;
    const viewport = page.getViewport({ scale: targetScale });

    if (typeof document === 'undefined') {
      // In non-browser / test environments where canvas is unavailable
      continue;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(100, Math.round(viewport.width));
    canvas.height = Math.max(100, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      continue;
    }

    try {
      await page.render({
        canvasContext: ctx,
        canvas: canvas,
        viewport: viewport,
      }).promise;

      const canvasDataUrl = canvas.toDataURL('image/png');

      onProgress?.({
        status: `Running OCR on page ${pageNum} of ${totalPages}...`,
        progress: Math.round(((pageNum - 1) / totalPages) * 100 + 10),
        page: pageNum,
        totalPages,
        phase: 'ocr_recognition',
      });

      const recognition = await Tesseract.recognize(canvasDataUrl, language, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            const pagePct = Math.round(m.progress * 100);
            const overallPct = Math.min(
              99,
              Math.round(((pageNum - 1) / totalPages) * 100 + (m.progress * (100 / totalPages)))
            );
            onProgress?.({
              status: `Page ${pageNum}/${totalPages} OCR: ${pagePct}%`,
              progress: overallPct,
              page: pageNum,
              totalPages,
              phase: 'ocr_recognition',
            });
          }
        },
      });

      const pageText = recognition.data.text.trim();
      if (pageText) {
        scannedPages.push(totalPages > 1 ? `--- Page ${pageNum} (Scanned OCR) ---\n${pageText}` : pageText);
      }
    } catch (pageErr: any) {
      console.warn(`[VerifAI OCR] Page ${pageNum} OCR processing warning:`, pageErr?.message);
    }
  }

  return {
    text: scannedPages.join('\n\n').trim(),
    pagesProcessed: totalPages,
  };
}

/**
 * Normalizes an image data URL / base64 payload to ensure standard image MIME type
 */
function normalizeImageSource(source: string): string {
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('blob:')) {
    return source;
  }

  const base64Part = source.includes(',') ? source.split(',')[1].trim() : source.trim();
  const cleanPrefix = base64Part.slice(0, 30);

  if (cleanPrefix.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${base64Part}`;
  }
  if (cleanPrefix.startsWith('iVBORw0KGgo')) {
    return `data:image/png;base64,${base64Part}`;
  }
  if (cleanPrefix.startsWith('UklGR')) {
    return `data:image/webp;base64,${base64Part}`;
  }
  if (cleanPrefix.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${base64Part}`;
  }

  if (source.startsWith('data:image/')) {
    return source;
  }

  // Default fallback to JPEG data URL
  return `data:image/jpeg;base64,${base64Part}`;
}

/**
 * Extracts text from an image (JPG, PNG, WEBP, etc.) via Tesseract OCR
 */
async function extractImageOcr(
  imageDataUrl: string,
  language: string,
  onProgress?: (progress: OcrProgress) => void
): Promise<{ text: string; confidence: number }> {
  onProgress?.({
    status: 'Initializing OCR engine for institutional image...',
    progress: 10,
    phase: 'ocr_recognition',
  });

  // If the file is actually a PDF (e.g. %PDF- magic bytes), don't pass to Tesseract image loader
  if (isPdfDocument(imageDataUrl)) {
    const pdfRes = await extractTextFromDocument(imageDataUrl, 'application/pdf', undefined, { language, onProgress });
    return {
      text: pdfRes.text,
      confidence: pdfRes.confidence || 90,
    };
  }

  const normalizedSource = normalizeImageSource(imageDataUrl);
  let inputSource: any = normalizedSource;

  if (normalizedSource.startsWith('http://') || normalizedSource.startsWith('https://')) {
    try {
      const res = await fetch(normalizedSource);
      if (res.ok) {
        inputSource = await res.blob();
      }
    } catch {
      inputSource = normalizedSource;
    }
  }

  try {
    const recognition = await Tesseract.recognize(inputSource, language, {
      logger: (m) => {
        if (typeof m.progress === 'number') {
          const pct = Math.round(m.progress * 100);
          const readableStatus =
            m.status === 'loading tesseract core'
              ? 'Loading OCR engine core...'
              : m.status === 'initializing tesseract'
              ? 'Initializing AI OCR...'
              : m.status === 'loading language traineddata'
              ? `Loading language dictionaries (${language})...`
              : m.status === 'recognizing text'
              ? `Recognizing compliance document text: ${pct}%`
              : `${m.status} (${pct}%)`;

          onProgress?.({
            status: readableStatus,
            progress: Math.max(10, Math.min(99, pct)),
            phase: 'ocr_recognition',
          });
        }
      },
    });

    return {
      text: recognition.data.text.trim(),
      confidence: Math.round(recognition.data.confidence),
    };
  } catch (err: any) {
    throw new Error(
      `Image OCR recognition failed: ${err?.message || 'Tesseract worker could not initialize'}. Please ensure a valid image format (PNG, JPEG, WEBP) and an active internet connection if downloading language assets.`
    );
  }
}

/**
 * Main entry point: Extracts text from an institutional document (PDF or image).
 * 
 * - Images: Tesseract OCR (with language support and auto-normalized MIME).
 * - PDFs: Tries native digital text extraction first via pdfjs-dist.
 *         If native text is sparse / scanned (<150 chars or <20 words), runs scanned PDF OCR fallback
 *         and picks the richer result.
 */
export async function extractTextFromDocument(
  fileDataUrl: string,
  fileType?: string,
  fileName?: string,
  options?: OcrExtractionOptions
): Promise<DocumentOcrResult> {
  const language = options?.language || 'eng';
  const maxPdfPages = options?.maxPdfPages || 5;
  const onProgress = options?.onProgress;

  if (!fileDataUrl || fileDataUrl.trim().length === 0) {
    throw new Error('No document data available for OCR extraction.');
  }

  onProgress?.({
    status: 'Inspecting document payload...',
    progress: 5,
    phase: 'loading',
  });

  const isPdf = isPdfDocument(fileDataUrl, fileType, fileName);

  let extractedText = '';
  let method: OcrMethod;
  let pageCount: number | undefined;
  let confidence: number | undefined;

  if (isPdf) {
    onProgress?.({
      status: 'Loading PDF document with PDF.js...',
      progress: 15,
      phase: 'loading',
    });

    try {
      const uint8Array = await getBytesFromPayload(fileDataUrl);
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useSystemFonts: true,
      });

      const pdfDoc = await loadingTask.promise;

      // Phase 1: Try native digital text extraction
      const nativeResult = await extractNativePdfText(pdfDoc, maxPdfPages, onProgress);
      const nativeWords = nativeResult.text.trim().split(/\s+/).filter(Boolean).length;

      // Check if native text is complete (at least 150 characters and >= 20 words)
      if (nativeResult.hasText && nativeResult.text.length >= 150 && nativeWords >= 20) {
        extractedText = nativeResult.text;
        method = 'native_pdf';
        pageCount = nativeResult.pagesProcessed;
        confidence = 98; // Digital native text is highly reliable
      } else {
        // Phase 2: PDF is scanned or has sparse text; invoke OCR fallback to capture scanned content
        onProgress?.({
          status: nativeResult.hasText
            ? 'Sparse digital text detected. Running neural OCR to extract full scanned content...'
            : 'No digital text layer detected. Starting scanned PDF OCR fallback...',
          progress: 30,
          phase: 'rasterizing',
        });

        const scannedResult = await extractScannedPdfOcr(pdfDoc, maxPdfPages, language, onProgress);

        if (scannedResult.text.length > (nativeResult.text?.length || 0)) {
          extractedText = scannedResult.text;
          method = 'ocr_pdf';
          pageCount = scannedResult.pagesProcessed;
          confidence = 88;
        } else if (nativeResult.hasText && nativeResult.text.length > 0) {
          extractedText = nativeResult.text;
          method = 'native_pdf';
          pageCount = nativeResult.pagesProcessed;
          confidence = 92;
        } else {
          extractedText = scannedResult.text;
          method = 'ocr_pdf';
          pageCount = scannedResult.pagesProcessed;
          confidence = 60;
        }
      }
    } catch (pdfErr: any) {
      console.warn('[VerifAI OCR] PDF parsing error:', pdfErr?.message);
      const isActuallyImage = !fileDataUrl.includes('JVBERi0') && (fileDataUrl.startsWith('data:image/') || /\.(jpe?g|png|webp)$/i.test(fileName || ''));
      if (isActuallyImage) {
        const imageResult = await extractImageOcr(fileDataUrl, language, onProgress);
        extractedText = imageResult.text;
        method = 'ocr_image';
        pageCount = 1;
        confidence = imageResult.confidence;
      } else {
        throw new Error(
          `Unable to parse PDF document (${pdfErr?.message || 'Invalid or password-protected PDF'}). Please verify that the PDF is not encrypted or upload a clearer scan.`
        );
      }
    }
  } else {
    // Process as an image directly via Tesseract OCR
    const imageResult = await extractImageOcr(fileDataUrl, language, onProgress);
    extractedText = imageResult.text;
    method = 'ocr_image';
    pageCount = 1;
    confidence = imageResult.confidence;
  }

  // Finalize result
  // Limit max text to 50,000 characters to prevent excessive storage bloat
  if (extractedText.length > 50000) {
    extractedText = extractedText.slice(0, 50000) + '\n\n[... Truncated for display & storage performance ...]';
  }

  onProgress?.({
    status: 'Extraction completed successfully.',
    progress: 100,
    phase: 'completed',
  });

  const words = extractedText.trim() ? extractedText.trim().split(/\s+/).filter(Boolean).length : 0;

  return {
    text: extractedText,
    method,
    extractedAt: new Date().toISOString(),
    charCount: extractedText.length,
    wordCount: words,
    pageCount,
    confidence,
    language,
  };
}
