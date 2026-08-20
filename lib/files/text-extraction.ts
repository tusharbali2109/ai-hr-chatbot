import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(`Unsupported file type for "${filename}" — only PDF, DOCX, and plain text files can be read.`);
    this.name = "UnsupportedFileTypeError";
  }
}

/**
 * Extracts plain text from a recruiter-uploaded PDF/DOCX/text file so the AI
 * can actually read its content — the one text-extraction seam in this
 * codebase (candidate resumes are otherwise stored as a link only, see
 * lib/screening/candidate-data-provider.ts's comment). Used for both the
 * open-ended assessment brief and the manually-uploaded candidate
 * submission; never throws on a readable-but-empty file, only on a type it
 * cannot parse at all.
 */
export async function extractTextFromFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const lower = filename.toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (mimeType.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return buffer.toString("utf-8").trim();
  }

  throw new UnsupportedFileTypeError(filename);
}
