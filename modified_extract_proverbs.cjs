#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// Directoarele de intrare și ieșire
const INPUT_DIR = 'C:\\Users\\adria\\OneDrive\\02 Stefan - Proverbe\\99 replit\\02 terminal verison - root\\02 - V2\\uploads';
const OUTPUT_DIR = 'C:\\Users\\adria\\OneDrive\\02 Stefan - Proverbe\\99 replit\\02 terminal verison - root\\02 - V2\\01_out';

// Maparea părților de vorbire în română
const POS_MAPPING = {
  substantiv: "s",
  adjectiv: "a", 
  verb: "v",
  pronume: "p",
  numeral: "n",
  articol: "art",
  interjectie: "i",
};

function extractPageNumberFromFilename(filename) {
  // Extrage numărul paginii din numele fișierului
  const pageMatch = filename.match(/_Page_(\d+)_/i);
  if (pageMatch) {
    return pageMatch[1];
  }
  
  const numberMatch = filename.match(/(\d+(?:-\d+)?)/);
  return numberMatch ? numberMatch[1] : "N/A";
}

function extractProverbsFromText(text) {
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  const proverbs = [];
  let currentProverb = "";
  
  for (const line of lines) {
    if (!line || /^\d+:/.test(line)) continue;
    if (/^(Page \d+|\d+)$/i.test(line)) continue;
    
    if (currentProverb) {
      currentProverb += " " + line;
    } else {
      currentProverb = line;
    }
    
    if (line.endsWith('.') || line.endsWith('!') || line.endsWith('?') || line.endsWith(':')) {
      const cleanProverb = currentProverb.trim();
      if (cleanProverb.length >= 15 && cleanProverb.length <= 500) {
        const finalProverb = cleanProverb.replace(/^[*♦<>\s]+/, '').trim();
        if (finalProverb.length >= 10) {
          proverbs.push(finalProverb);
        }
      }
      currentProverb = "";
    }
  }
  
  if (currentProverb.trim().length >= 15) {
    const finalProverb = currentProverb.trim().replace(/^[*♦<>\s]+/, '').trim();
    if (finalProverb.length >= 10) {
      proverbs.push(finalProverb);
    }
  }
  
  return proverbs;
}

function analyzePartOfSpeech(text) {
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const tags = [];
  
  const counters = {
    s: 1, a: 1, v: 1, p: 1, n: 1, art: 1, i: 1,
  };
  
  const patterns = {
    verb: /^(e|este|sunt|era|erau|fi|a|să|face|făcut|provoca|ajunge|cunoaște|cunoaștem|cunosc|trăiește|simte|vorbeşte|creează|urmează|există|repetă|bucurându|eliberat|neîncătuşată|împărtăşeşte|atinge|instaleză)$/i,
    substantiv: /^(fapta|partea|omul|oameni|dreptatea|virtutea|prietenul|prietenii|nevasta|barca|călătorului|sluga|slugi|umbre|cel|lacom|celui|merituos|tovarăşul|drum|fiul|împărat|prieten|stăpânul|faptelor|ureche|împunsătura|vorbei|binele|bine|mal|căi|cinstit|teafăr|aproapelui|răul|sufletul|prihană|urmare|fericirea|nefericirea|folosul|fiinţe|efort|virtuosului|mulţumire|propria|viciile|raţiunea|îndrăzneala|nevoie|eroul|bătălie|achitarea|datoriei|sărăcie|rudele|necazuri|plăcerea|mii|luptă|pasiune|ură|ignoranţă|cunoaşterea|lumea|aceasta|cealaltă|sfinţenie|intenţiilor|acumularea|bucurie)$/i,
    adjectiv: /^(merituos|bun|buni|rău|cinstit|lacom|priceput|nepriceput|măreţ|ruşinos|nemuritoare|adevărat|adevărată|teafăr|mare|propria|neîntrerupt|multă|reciprocă|marele|scrise|dharmei|neataşat|dureroasă)$/i,
    pronume: /^(cel|cea|cei|cele|el|ea|ei|ele|acesta|aceasta|aceștia|acestea|unui|unei|sine|însuşi|altul|cineva|ţie|însuţi|se|îşi|ai|nici|pentru|care|unde|când)$/i,
    articol: /^(un|o|unei|unui|ale|ai|al|la|în|de|pe|cu|din|până|după|către|asupra|dintre|printre)$/i,
    numeral: /^(cinci|cincisprezece|doi|trei|patru|primul|doilea|mii|una|două|multe|puţin|mai|foarte|tot|toată|toate|câştig|pierdere)$/i,
    interjectie: /^(ah|oh|vai|uite|iată|da|nu|nici|chiar|iar|şi|sau|dar|ca|că|dacă|când|unde|cum|de|ce|pentru|până|după)$/i,
  };
  
  words.forEach((word, index) => {
    const cleanWord = word.replace(/[.,!?;:()„"«»\[\]{}–—]$/, '').replace(/^[„"«»\[\]{}–—]/, '');
    let tag = '';
    
    for (const [pos, pattern] of Object.entries(patterns)) {
      if (pattern.test(cleanWord)) {
        const shortPos = POS_MAPPING[pos] || pos.charAt(0);
        tag = `${shortPos}${counters[shortPos]}`;
        counters[shortPos]++;
        break;
      }
    }
    
    if (!tag && cleanWord.length > 2) {
      if (cleanWord.endsWith('ul') || cleanWord.endsWith('ea') || cleanWord.endsWith('ia') || cleanWord.endsWith('ului') || cleanWord.endsWith('elor')) {
        tag = `s${counters.s}`;
        counters.s++;
      } else if (cleanWord.endsWith('ă') || cleanWord.endsWith('e') || cleanWord.endsWith('it') || cleanWord.endsWith('os')) {
        tag = `a${counters.a}`;
        counters.a++;
      } else if (cleanWord.endsWith('ează') || cleanWord.endsWith('eşte') || cleanWord.endsWith('esc')) {
        tag = `v${counters.v}`;
        counters.v++;
      }
    }
    
    if (tag) {
      tags.push({ word: cleanWord, tag, index });
    }
  });
  
  return tags;
}

async function generateVersionedFilename(baseFilename) {
  const ext = path.extname(baseFilename);
  const name = path.basename(baseFilename, ext);
  
  let counter = 1;
  let filename = baseFilename;
  
  while (fs.existsSync(filename)) {
    filename = `${counter.toString().padStart(2, '0')}${name}${ext}`;
    counter++;
  }
  
  return filename;
}

async function generateExcelFile(allProverbs, filename, includeCodeSheet = true) {
  const workbook = XLSX.utils.book_new();
  
  // Creează sheet-ul principal cu datele
  const worksheetData = [
    ["Filename", "Page", "Proverb #", "Text", "POS Tags"],
    ...allProverbs.map(p => [
      p.sourceFilename,
      p.pageNumber,
      p.proverbNumber,
      p.text,
      p.posTags.map(tag => `${tag.tag}:${tag.word}`).join(", ")
    ])
  ];
  
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Setează lățimile coloanelor
  worksheet['!cols'] = [
    { width: 30 },  // Filename
    { width: 10 },  // Page
    { width: 12 },  // Proverb #
    { width: 80 },  // Text
    { width: 50 }   // POS Tags
  ];
  
  XLSX.utils.book_append_sheet(workbook, worksheet, "Proverbs");
  
  // Adaugă sheet-ul cu documentația codului
  if (includeCodeSheet) {
    const codeData = [
      ["Component", "Description"],
      ["Text Extraction", "Extrage textul din fișierele PDF"],
      ["Proverb Identification", "Identifică proverbele românești"],
      ["POS Tagging", "Analiză morfologică cu numerotare incrementală"],
      ["Excel Generation", "Creează fișier Excel structurat"],
      ["File Versioning", "Previne suprascrierea cu numerotare automată"],
      ["", ""],
      ["POS Tag Mapping", ""],
      ["s1, s2, s3...", "Substantive"],
      ["a1, a2, a3...", "Adjective"],
      ["v1, v2, v3...", "Verbe"],
      ["p1, p2, p3...", "Pronume"],
      ["n1, n2, n3...", "Numerale"],
      ["art1, art2...", "Articole"],
      ["i1, i2, i3...", "Interjecții"]
    ];
    
    const codeWorksheet = XLSX.utils.aoa_to_sheet(codeData);
    XLSX.utils.book_append_sheet(workbook, codeWorksheet, "Code Documentation");
  }
  
  // Adaugă un sheet cu statistici
  const stats = calculateStats(allProverbs);
  const statsData = [
    ["Statistică", "Valoare"],
    ["Total fișiere procesate", stats.totalFiles],
    ["Total proverbe extrase", stats.totalProverbs],
    ["Proverb cel mai lung", stats.longestProverb.text],
    ["Lungime (caractere)", stats.longestProverb.length],
    ["Proverb cel mai scurt", stats.shortestProverb.text],
    ["Lungime (caractere)", stats.shortestProverb.length],
    ["Lungime medie proverb", stats.averageLength.toFixed(2)],
    ["", ""],
    ["Distribuție POS", ""],
    ["Substantive", stats.posDistribution.s || 0],
    ["Adjective", stats.posDistribution.a || 0],
    ["Verbe", stats.posDistribution.v || 0],
    ["Pronume", stats.posDistribution.p || 0],
    ["Numerale", stats.posDistribution.n || 0],
    ["Articole", stats.posDistribution.art || 0],
    ["Interjecții", stats.posDistribution.i || 0]
  ];
  
  const statsWorksheet = XLSX.utils.aoa_to_sheet(statsData);
  XLSX.utils.book_append_sheet(workbook, statsWorksheet, "Statistics");
  
  // Asigură-te că directorul de ieșire există
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const outputPath = path.join(OUTPUT_DIR, await generateVersionedFilename(filename));
  
  XLSX.writeFile(workbook, outputPath, {
    bookType: 'xlsx',
    compression: true,
    type: 'file'
  });
  
  return outputPath;
}

function calculateStats(allProverbs) {
  let totalProverbs = allProverbs.length;
  let longestProverb = { text: "", length: 0 };
  let shortestProverb = { text: "", length: Number.MAX_SAFE_INTEGER };
  let totalLength = 0;
  let posDistribution = {};
  
  allProverbs.forEach(proverb => {
    const length = proverb.text.length;
    totalLength += length;
    
    if (length > longestProverb.length) {
      longestProverb = { text: proverb.text, length };
    }
    
    if (length < shortestProverb.length) {
      shortestProverb = { text: proverb.text, length };
    }
    
    // Calculează distribuția POS
    proverb.posTags.forEach(tag => {
      const posType = tag.tag.replace(/\d+$/, '');
      posDistribution[posType] = (posDistribution[posType] || 0) + 1;
    });
  });
  
  return {
    totalFiles: new Set(allProverbs.map(p => p.sourceFilename)).size,
    totalProverbs,
    longestProverb,
    shortestProverb,
    averageLength: totalProverbs > 0 ? totalLength / totalProverbs : 0,
    posDistribution
  };
}

async function processRomanianProverbsFromPDF(pdfBuffer, sourceFilename) {
  try {
    console.log(`🔍 Procesez fișierul: ${sourceFilename}`);
    
    // Extrage textul din PDF
    const data = await pdfParse(pdfBuffer);
    const inputText = data.text;
    
    // Extrage numărul paginii din numele fișierului
    const pageNumber = extractPageNumberFromFilename(sourceFilename);
    console.log(`📄 Pagina identificată: ${pageNumber}`);
    
    // Extrage proverbele din text
    const extractedProverbs = extractProverbsFromText(inputText);
    console.log(`📚 Proverbe găsite: ${extractedProverbs.length}`);
    
    const processedProverbs = [];
    
    // Procesează fiecare proverb
    for (let i = 0; i < extractedProverbs.length; i++) {
      const proverbText = extractedProverbs[i];
      const posTags = analyzePartOfSpeech(proverbText);
      
      processedProverbs.push({
        sourceFilename,
        pageNumber,
        proverbNumber: i + 1,
        text: proverbText,
        posTags
      });
      
      console.log(`✓ Proverb ${i + 1}: "${proverbText.substring(0, 50)}..."`);
    }
    
    return processedProverbs;
  } catch (error) {
    console.error(`❌ Eroare la procesarea fișierului ${sourceFilename}:`, error.message);
    return [];
  }
}

async function findPDFFiles(directory) {
  try {
    const files = await readdir(directory);
    const pdfFiles = [];
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      const fileStat = await stat(filePath);
      
      if (fileStat.isFile() && path.extname(file).toLowerCase() === '.pdf') {
        pdfFiles.push(filePath);
      } else if (fileStat.isDirectory()) {
        // Recursiv pentru subdirectoare
        const subDirPDFs = await findPDFFiles(filePath);
        pdfFiles.push(...subDirPDFs);
      }
    }
    
    return pdfFiles;
  } catch (error) {
    console.error('Eroare la căutarea fișierelor PDF:', error.message);
    return [];
  }
}

async function processAllPDFs() {
  try {
    console.log(`🔎 Caut fișiere PDF în: ${INPUT_DIR}`);
    const pdfFiles = await findPDFFiles(INPUT_DIR);
    
    if (pdfFiles.length === 0) {
      console.log('❌ Nu s-au găsit fișiere PDF în directorul specificat.');
      return;
    }
    
    console.log(`🔍 Am găsit ${pdfFiles.length} fișiere PDF pentru procesare.`);
    
    let allProverbs = [];
    
    // Procesează fiecare PDF
    for (const pdfPath of pdfFiles) {
      const pdfFilename = path.basename(pdfPath);
      const pdfBuffer = await readFile(pdfPath);
      
      const proverbsFromPDF = await processRomanianProverbsFromPDF(pdfBuffer, pdfFilename);
      allProverbs = allProverbs.concat(proverbsFromPDF);
      
      console.log(`✅ Fișier procesat: ${pdfFilename} - ${proverbsFromPDF.length} proverbe extrase`);
    }
    
    if (allProverbs.length === 0) {
      console.log('❌ Nu s-au găsit proverbe în fișierele PDF procesate.');
      return;
    }
    
    // Generează fișierul Excel cu toate proverbele
    console.log("📊 Generez fișierul Excel cu toate proverbele...");
    const outputFilename = await generateExcelFile(
      allProverbs,
      "proverbe_extrase_toate.xlsx",
      true
    );
    
    console.log("\n" + "=".repeat(50));
    console.log("PROCESARE COMPLETĂ!");
    console.log("=".repeat(50));
    console.log(`📁 Fișier Excel: ${outputFilename}`);
    console.log(`📊 Total proverbe: ${allProverbs.length}`);
    console.log(`📚 Total fișiere procesate: ${pdfFiles.length}`);
    console.log("🎨 Sistem de culori POS implementat pentru traduceri");
    
    return {
      outputFilename,
      totalProverbs: allProverbs.length,
      totalFiles: pdfFiles.length
    };
  } catch (error) {
    console.error("❌ Eroare:", error.message);
  }
}

// Rulează scriptul
if (require.main === module) {
  processAllPDFs()
    .catch(error => {
      console.error("❌ Eroare globală:", error.message);
    });
}

module.exports = { 
  processAllPDFs, 
  processRomanianProverbsFromPDF, 
  extractProverbsFromText, 
  analyzePartOfSpeech 
};
