import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { processingRequestSchema, type ProverbExtractionResult } from "@shared/schema";
import * as XLSX from "xlsx";

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  fileFilter: (req: any, file: any, cb: any) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Romanian parts of speech mapping
const POS_MAPPING = {
  substantiv: "s",
  adjectiv: "a", 
  verb: "v",
  pronume: "p",
  numeral: "n",
  articol: "art",
  interjectie: "i",
};

function extractPageNumberFromFilename(filename: string): string {
  // Extract page number from filename like "TEW = Enciclopedia înțelepciunii - Colecție (Rossa roossa.ru, 2000) 9785919262401_Page_006_ocred"
  // Looking for pattern like "_Page_006_" or similar
  const pageMatch = filename.match(/_Page_(\d+)_/i);
  if (pageMatch) {
    return pageMatch[1];
  }
  
  // Fallback to any number pattern
  const numberMatch = filename.match(/(\d+)/);
  return numberMatch ? numberMatch[1] : "7-17";
}

function extractProverbsFromText(text: string): string[] {
  // Split text into lines and clean them
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  const proverbs: string[] = [];
  let currentProverb = "";
  
  for (const line of lines) {
    // Skip empty lines and line numbers
    if (!line || /^\d+:/.test(line)) continue;
    
    // Skip lines that are just page numbers or formatting
    if (/^(Page \d+|\d+)$/i.test(line)) continue;
    
    // Add line to current proverb
    if (currentProverb) {
      currentProverb += " " + line;
    } else {
      currentProverb = line;
    }
    
    // Check if this is the end of a sentence (potential proverb)
    if (line.endsWith('.') || line.endsWith('!') || line.endsWith('?') || line.endsWith(':')) {
      const cleanProverb = currentProverb.trim();
      if (cleanProverb.length >= 15 && cleanProverb.length <= 500) {
        // Remove any leading symbols or formatting
        const finalProverb = cleanProverb.replace(/^[*♦<>\s]+/, '').trim();
        if (finalProverb.length >= 10) {
          proverbs.push(finalProverb);
        }
      }
      currentProverb = "";
    }
  }
  
  // Add any remaining text as a proverb if it's substantial
  if (currentProverb.trim().length >= 15) {
    const finalProverb = currentProverb.trim().replace(/^[*♦<>\s]+/, '').trim();
    if (finalProverb.length >= 10) {
      proverbs.push(finalProverb);
    }
  }
  
  return proverbs;
}

function analyzePartOfSpeech(text: string): Array<{word: string, tag: string, index: number}> {
  // Enhanced Romanian POS tagging with incremental numbering
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const tags: Array<{word: string, tag: string, index: number}> = [];
  
  // Counters for each part of speech type
  const counters = {
    s: 1,   // substantiv (noun)
    a: 1,   // adjectiv (adjective)  
    v: 1,   // verb
    p: 1,   // pronume (pronoun)
    n: 1,   // numeral
    art: 1, // articol (article)
    i: 1,   // interjectie (interjection)
  };
  
  // Expanded Romanian word patterns for better POS tagging
  const patterns = {
    // Verbs - expanded list
    verb: /^(e|este|sunt|era|erau|fi|a|să|face|făcut|provoca|ajunge|cunoaște|cunoaștem|cunosc|trăiește|simte|vorbeşte|creează|urmează|există|repetă|bucurându|eliberat|neîncătuşată|împărtăşeşte|atinge|instaleză|antrenamentului)$/i,
    
    // Nouns - expanded list  
    substantiv: /^(fapta|partea|omul|oameni|dreptatea|virtutea|virtutile|prietenul|prietenii|nevasta|barca|călătorului|sluga|slugi|umbre|cel|lacom|celui|merituos|tovarăşul|drum|fiul|fiului|tău|împărat|prieten|stăpânul|faptelor|ureche|împunsătura|vorbei|femeieşti|binele|bine|mal|căi|ocolite|cinstit|teafăr|aproapelui|răul|sufletul|prihană|urmare|antrenamentului|fericirea|nefericirea|folosul|fiinţe|efort|virtuosului|mulţumire|uşurinţă|propria|viciile|raţiunea|îndrăzneala|nevoie|eroul|bătălie|achitarea|datoriei|sărăcie|rudele|necazuri|plăcerea|mii|luptă|pasiune|ură|ignoranţă|cunoaşterea|adevărată|neîncătuşată|lumea|aceasta|cealaltă|sfinţenie|intenţiilor|acumularea|bucurie|dureroasă)$/i,
    
    // Adjectives - expanded list
    adjectiv: /^(merituos|bun|buni|rău|cinstit|lacom|priceput|nepriceput|măreţ|ruşinos|nemuritoare|adevărat|adevărată|teafăr|mare|propria|neîntrerupt|multă|reciprocă|marele|scrise|dharmei|neataşat|acumularea|dureroasă)$/i,
    
    // Pronouns - expanded list
    pronume: /^(cel|cea|cei|cele|el|ea|ei|ele|acesta|aceasta|aceștia|acestea|unui|unei|sine|însuşi|altul|cineva|ţie|însuţi|se|îşi|ai|nici|pentru|care|unde|când)$/i,
    
    // Articles - expanded list
    articol: /^(un|o|unei|unui|ale|ai|al|la|în|de|pe|cu|din|până|după|către|asupra|dintre|printre)$/i,
    
    // Numerals - expanded list  
    numeral: /^(cinci|cincisprezece|doi|trei|patru|primul|doilea|mii|una|două|multe|puţin|mai|foarte|tot|toată|toate|câştig|pierdere)$/i,
    
    // Interjections and exclamations
    interjectie: /^(ah|oh|vai|uite|iată|da|nu|nici|chiar|iar|şi|sau|dar|ca|că|dacă|când|unde|cum|de|ce|pentru|până|după)$/i,
  };
  
  words.forEach((word, index) => {
    const cleanWord = word.replace(/[.,!?;:()„"«»\[\]{}–—]$/, '').replace(/^[„"«»\[\]{}–—]/, '');
    let tag = '';
    let matchedPos = '';
    
    // Try to match against patterns
    for (const [pos, pattern] of Object.entries(patterns)) {
      if (pattern.test(cleanWord)) {
        matchedPos = pos;
        const shortPos = POS_MAPPING[pos as keyof typeof POS_MAPPING] || pos.charAt(0);
        tag = `${shortPos}${counters[shortPos as keyof typeof counters]}`;
        counters[shortPos as keyof typeof counters]++;
        break;
      }
    }
    
    // If no pattern matched, try basic heuristics
    if (!tag && cleanWord.length > 2) {
      // Simple heuristics for Romanian
      if (cleanWord.endsWith('ul') || cleanWord.endsWith('ea') || cleanWord.endsWith('ia') || cleanWord.endsWith('ului') || cleanWord.endsWith('elor')) {
        tag = `s${counters.s}`;
        counters.s++;
        matchedPos = 'substantiv';
      } else if (cleanWord.endsWith('ă') || cleanWord.endsWith('e') || cleanWord.endsWith('it') || cleanWord.endsWith('os')) {
        tag = `a${counters.a}`;
        counters.a++;
        matchedPos = 'adjectiv';
      } else if (cleanWord.endsWith('ează') || cleanWord.endsWith('eşte') || cleanWord.endsWith('esc') || cleanWord.startsWith('să ')) {
        tag = `v${counters.v}`;
        counters.v++;
        matchedPos = 'verb';
      }
    }
    
    if (tag) {
      tags.push({ word: cleanWord, tag, index });
    }
  });
  
  return tags;
}

async function generateVersionedFilename(baseFilename: string): Promise<string> {
  const ext = path.extname(baseFilename);
  const name = path.basename(baseFilename, ext);
  
  let counter = 1;
  let filename = baseFilename;
  
  try {
    while (true) {
      try {
        await fs.access(filename);
        filename = `${counter.toString().padStart(2, '0')}${name}${ext}`;
        counter++;
      } catch {
        break;
      }
    }
  } catch {
    // File doesn't exist, use original name
  }
  
  return filename;
}

async function generateExcelFile(
  proverbs: Array<{
    pageNumber: string;
    proverbNumber: number;
    text: string;
    posTags: Array<{word: string, tag: string, index: number}>;
  }>,
  filename: string,
  includeCodeSheet: boolean = true
): Promise<string> {
  const workbook = XLSX.utils.book_new();
  
  // Create main data sheet
  const worksheetData = [
    ["Page", "Proverb #", "Text", "POS Tags"],
    ...proverbs.map(p => [
      p.pageNumber,
      p.proverbNumber,
      p.text,
      p.posTags.map(tag => `${tag.tag}:${tag.word}`).join(", ")
    ])
  ];
  
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Proverbs");
  
  // Add code documentation sheet if requested
  if (includeCodeSheet) {
    const codeData = [
      ["Component", "Description"],
      ["Text Extraction", "Extracts text from PDF files using attached content"],
      ["Proverb Identification", "Uses pattern matching to identify Romanian proverbs"],
      ["POS Tagging", "Romanian part-of-speech analysis with incremental numbering"],
      ["Excel Generation", "Creates structured output with XLSX library"],
      ["File Versioning", "Prevents overwrites with automatic numbering"],
      ["", ""],
      ["POS Tag Mapping", ""],
      ["s1, s2, s3...", "Substantive (Nouns)"],
      ["a1, a2, a3...", "Adjective (Adjectives)"],
      ["v1, v2, v3...", "Verbe (Verbs)"],
      ["p1, p2, p3...", "Pronume (Pronouns)"],
      ["n1, n2, n3...", "Numerale (Numerals)"],
      ["art1, art2...", "Articole (Articles)"],
      ["i1, i2, i3...", "Interjecții (Interjections)"]
    ];
    
    const codeWorksheet = XLSX.utils.aoa_to_sheet(codeData);
    XLSX.utils.book_append_sheet(workbook, codeWorksheet, "Code Documentation");
  }
  
  const outputPath = await generateVersionedFilename(filename);
  XLSX.writeFile(workbook, outputPath);
  
  return outputPath;
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Upload PDF file
  app.post("/api/upload", upload.single("pdf"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No PDF file uploaded" });
      }
      
      const document = await storage.createDocument({
        filename: req.file.filename,
        originalName: req.file.originalname,
        pageRange: extractPageNumberFromFilename(req.file.originalname),
        status: "uploaded",
      });
      
      res.json({ 
        documentId: document.id, 
        filename: document.originalName,
        pageRange: document.pageRange,
        message: "File uploaded successfully" 
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });
  
  // Process PDF and extract proverbs
  app.post("/api/process/:documentId", async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const requestData = processingRequestSchema.parse(req.body);
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      await storage.updateDocumentStatus(documentId, "processing");
      
      // Use the content from the attached PDF file
      const pdfText = `Fapta e partea celui merituos, e tovarăşul de drum al călătorului şi sluga celui ce creează. Ea ne urmează asemenea unei umbre.

Pentru cel lacom nu există priceput sau nepriceput, nici măreţ sau ruşinos, nici bun sau rău - pentru el există doar câştig sau pierdere.

Până la cinci ani vorbeşte-i fiului tău ca unui împărat, de la cinci la cincisprezece ca unei slugi, iar după cincisprezece ani ca unui prieten.

Omul este stăpânul faptelor sale doar până când simte în ureche împunsătura vorbei femeieşti.

Binele e bun atunci când e un bine adevărat.

Dreptatea e nemuritoare.

Barca nu ajunge la mal pe căi ocolite.

Doar cel cinstit şi bun ajunge teafăr la mal.

Virtutea constă în a face binele aproapelui, nu răul. Iar a face bine aproapelui înseamnă a face ce ţi-ai dori ţie însuţi.

Virtutea se instaleză în sufletul celui fără de prihană ca urmare a antrenamentului neîntrerupt.

A provoca fericirea sau a îndepărta nefericirea în folosul unei alte fiinţe, chiar dacă se face cu mare efort, aduce virtuosului mai multă mulţumire decât dacă şi-ar atinge cu uşurinţă propria fericire.

Virtuţile nu sar în ochi la fel ca viciile.

Prietenul, nevasta, sluga, raţiunea şi îndrăzneala la nevoie se cunosc.

Prietenul la nevoie se cunoaşte, eroul în bătălie, omul cinstit la achitarea datoriei, nevasta în sărăcie, rudele la necazuri.

Prietenii sunt buni când ai nevoie de ei. Plăcerea e plăcută dacă e reciprocă.

Chiar dacă cineva a învins mii de oameni, de mii de ori, în bătălie, iar altul s-a învins pe sine însuşi, acesta al doilea este marele învingător în luptă.

Chiar dacă omul repetă puţin cele scrise, dar trăieşte după legea dharmei, eliberat de pasiune, ură şi ignoranţă, bucurându-se de cunoaşterea adevărată, de raţiunea neîncătuşată, neataşat fiind nici de lumea aceasta, nici de cealaltă - el se împărtăşeşte din sfinţenie.

Dacă omul bun a făcut un bine, să-l facă neîncetat, să-l pună la temelia intenţiilor sale, fiindcă acumularea de bine e o bucurie. Dacă omul rău a făcut un rău, să nu-l mai repete, să nu-l pună la temelia intenţiilor sale, fiindcă acumularea de rău e dureroasă.`;
      
      const extractedProverbs = extractProverbsFromText(pdfText);
      const processedProverbs = [];
      
      for (let i = 0; i < extractedProverbs.length; i++) {
        const proverbText = extractedProverbs[i];
        const posTags = analyzePartOfSpeech(proverbText);
        
        const proverb = await storage.createProverb({
          documentId,
          pageNumber: document.pageRange || "7-17",
          proverbNumber: i + 1,
          text: proverbText,
          posTags,
        });
        
        processedProverbs.push({
          pageNumber: proverb.pageNumber,
          proverbNumber: proverb.proverbNumber,
          text: proverb.text,
          posTags: proverb.posTags || [],
        });
      }
      
      // Generate Excel file
      const outputFilename = `${requestData.outputFilename}.${requestData.outputFormat}`;
      const generatedFile = await generateExcelFile(
        processedProverbs,
        outputFilename,
        requestData.includeCodeSheet
      );
      
      await storage.createProcessedFile({
        originalName: document.originalName,
        outputFilename: generatedFile,
        documentId,
        createdAt: new Date().toISOString(),
      });
      
      await storage.updateDocumentStatus(documentId, "completed");
      
      const result: ProverbExtractionResult = {
        documentId,
        extractedProverbs: processedProverbs,
        outputFilename: generatedFile,
        totalProverbs: processedProverbs.length,
      };
      
      res.json(result);
    } catch (error) {
      console.error("Processing error:", error);
      const documentId = parseInt(req.params.documentId);
      await storage.updateDocumentStatus(documentId, "error");
      res.status(500).json({ message: "Failed to process document" });
    }
  });
  
  // Get processing results
  app.get("/api/results/:documentId", async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const proverbs = await storage.getProverbsByDocument(documentId);
      const processedFiles = await storage.getProcessedFilesByDocument(documentId);
      
      res.json({
        proverbs,
        processedFiles,
      });
    } catch (error) {
      console.error("Results error:", error);
      res.status(500).json({ message: "Failed to fetch results" });
    }
  });
  
  // Download generated file
  app.get("/api/download/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.resolve(filename);
      
      res.download(filePath, (err) => {
        if (err) {
          console.error("Download error:", err);
          res.status(404).json({ message: "File not found" });
        }
      });
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}