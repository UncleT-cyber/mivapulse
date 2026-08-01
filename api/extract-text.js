import { IncomingForm } from 'formidable';
import fs from 'fs';
import mammoth from 'mammoth';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Safe helper that resolves pdf-parse across all export formats (CJS, ESM, v1, v2)
async function parsePdfBuffer(buffer) {
  const loaded = require('pdf-parse');

  // Case 1: Standard v1 function export -> pdf(buffer)
  if (typeof loaded === 'function') {
    const data = await loaded(buffer);
    return data.text;
  }

  // Case 2: ESM wrapped default -> loaded.default(buffer)
  if (typeof loaded.default === 'function') {
    const data = await loaded.default(buffer);
    return data.text;
  }

  // Case 3: v2 Class constructor -> new loaded.PDFParse(...)
  if (loaded.PDFParse) {
    const parser = new loaded.PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return typeof result === 'string' ? result : result.text;
  }

  throw new Error('Unable to resolve pdf-parse module.');
}

export const config = {
  api: {
    bodyParser: false, // Required for Formidable multi-part file processing
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new IncomingForm({ keepExtensions: true, multiples: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Formidable parse error:', err);
      return res.status(500).json({ error: 'Failed to upload files.' });
    }

    try {
      let uploadedFiles = files.files;
      if (!uploadedFiles) {
        return res.status(400).json({ error: 'No files were attached.' });
      }

      if (!Array.isArray(uploadedFiles)) {
        uploadedFiles = [uploadedFiles];
      }

      let combinedText = '';

      for (const file of uploadedFiles) {
        const filePath = file.filepath || file.path;
        const mimeType = file.mimetype || file.type || '';
        const fileName = file.originalFilename || file.name || 'document';

        let extractedText = '';

        // 1. PDF Parsing
        if (mimeType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
          const buffer = fs.readFileSync(filePath);
          extractedText = await parsePdfBuffer(buffer);
        } 
        // 2. Word Document (.docx) Parsing
        else if (mimeType.includes('word') || fileName.toLowerCase().endsWith('.docx')) {
          const result = await mammoth.extractRawText({ path: filePath });
          extractedText = result.value;
        } 
        // 3. Plain Text / Fallback
        else {
          extractedText = fs.readFileSync(filePath, 'utf8');
        }

        combinedText += `\n--- SOURCE FILE: ${fileName} ---\n${extractedText}\n`;
      }

      return res.status(200).json({
        success: true,
        text: combinedText.trim(),
      });

    } catch (parseError) {
      console.error('Text extraction failed:', parseError);
      return res.status(500).json({ error: parseError.message });
    }
  });
}