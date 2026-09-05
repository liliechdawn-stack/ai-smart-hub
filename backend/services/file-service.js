// ============================================================
// backend/services/file-service.js - File Processing Service
// ============================================================

const pdf = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Extract text from various file types
 * @param {string} fileData - Base64 encoded file data
 * @param {string} fileName - Original file name
 * @param {string} mimeType - MIME type of the file
 * @param {number} maxLength - Maximum characters to extract
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromFile(fileData, fileName, mimeType, maxLength = 5000) {
  try {
    const base64Data = fileData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    let text = "";

    if (mimeType.includes("pdf")) {
      const pdfData = await pdf(buffer);
      text = pdfData.text;
    } else if (mimeType.includes("word") || mimeType.includes("docx") || mimeType.includes("doc")) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (mimeType.includes("text") || fileName.endsWith(".txt") || fileName.endsWith(".csv")) {
      text = buffer.toString("utf-8");
    } else {
      return `[File: ${fileName}] Cannot extract text from this file type.`;
    }

    return text.substring(0, maxLength);
  } catch (err) {
    console.error("File extraction error:", err);
    return `[Error processing file: ${fileName}]`;
  }
}

/**
 * Check if file type is allowed
 * @param {string} mimeType - MIME type
 * @param {string[]} allowedTypes - Array of allowed MIME types
 * @returns {boolean}
 */
function isFileTypeAllowed(mimeType, allowedTypes = ["pdf", "word", "docx", "doc", "text", "txt", "csv"]) {
  return allowedTypes.some((type) => mimeType.includes(type));
}

/**
 * Get file size from base64 data
 * @param {string} base64Data - Base64 encoded data
 * @returns {number} Size in bytes
 */
function getFileSize(base64Data) {
  const buffer = Buffer.from(base64Data.split(",")[1] || base64Data, "base64");
  return buffer.length;
}

module.exports = {
  extractTextFromFile,
  isFileTypeAllowed,
  getFileSize,
};