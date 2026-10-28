import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Tesseract from 'tesseract.js';
import { DocumentOcrResult, OcrMethod } from '../types';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

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
 * Converts a base64 or Data URL string into a Uint8Array for PDF.js
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Detects whether the file is a PDF document based on MIME type, filename, or data URL
 */
function isPdfDocument(fileDataUrl: string, fileType?: string, fileName?: string): boolean {
  if (fileType?.toLowerCase().includes('pdf')) return true;
  if (fileName?.toLowerCase().endsWith('.pdf')) return true;
  if (fileDataUrl.startsWith('data:application/pdf')) return true;
  if (fileDataUrl.startsWith('data:text/pdf')) return true;

  // Check magic bytes in base64 if available (%PDF- is 25 50 44 46 2d -> JVBERi0)
  const base64Prefix = fileDataUrl.includes(',') ? fileDataUrl.split(',')[1].slice(0, 15) : fileDataUrl.slice(0, 15);
  if (base64Prefix.startsWith('JVBERi0')) return true;

  return false;
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
    // Render at scale 1.5 for optimal balance between OCR clarity and browser memory
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      continue;
    }

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
  }

  return {
    text: scannedPages.join('\n\n').trim(),
    pagesProcessed: totalPages,
  };
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

  const recognition = await Tesseract.recognize(imageDataUrl, language, {
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
}

/**
 * Main entry point: Extracts text from an institutional document (PDF or image).
 * 
 * - Images: Tesseract OCR (with language support).
 * - PDFs: Tries native digital text extraction first via pdfjs-dist.
 *         If native text is sparse / scanned (<30 chars), falls back to canvas page rendering + Tesseract OCR.
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

  if (!fileDataUrl) {
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

    const uint8Array = dataUrlToUint8Array(fileDataUrl);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
    });

    const pdfDoc = await loadingTask.promise;

    // Phase 1: Try native digital text extraction
    const nativeResult = await extractNativePdfText(pdfDoc, maxPdfPages, onProgress);

    if (nativeResult.hasText) {
      extractedText = nativeResult.text;
      method = 'native_pdf';
      pageCount = nativeResult.pagesProcessed;
      confidence = 98; // Digital native text is highly reliable
    } else {
      // Phase 2: PDF is scanned or rasterized without digital text layer; invoke OCR fallback
      onProgress?.({
        status: 'No digital text layer detected. Starting scanned PDF OCR fallback...',
        progress: 30,
        phase: 'rasterizing',
      });

      const scannedResult = await extractScannedPdfOcr(pdfDoc, maxPdfPages, language, onProgress);
      extractedText = scannedResult.text;
      method = 'ocr_pdf';
      pageCount = scannedResult.pagesProcessed;
      confidence = 85;
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
