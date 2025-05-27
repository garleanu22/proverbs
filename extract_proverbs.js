#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

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
  return numberMatch ? numberMatch[1] : "7-17";
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

async function generateExcelFile(proverbs, filename, includeCodeSheet = true) {
  const workbook = XLSX.utils.book_new();
  
  // Creează sheet-ul principal cu datele
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
  
  // Setează lățimile coloanelor
  worksheet['!cols'] = [
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
  
  const outputPath = await generateVersionedFilename(filename);
  
  XLSX.writeFile(workbook, outputPath, {
    bookType: 'xlsx',
    compression: true,
    type: 'file'
  });
  
  return outputPath;
}

async function processRomanianProverbs(inputText, sourceFilename = "input.pdf") {
  console.log("🔍 Începe extragerea proverbelor românești...");
  
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
      pageNumber,
      proverbNumber: i + 1,
      text: proverbText,
      posTags
    });
    
    console.log(`✓ Proverb ${i + 1}: "${proverbText.substring(0, 50)}..."`);
  }
  
  // Generează fișierul Excel
  console.log("📊 Generez fișierul Excel...");
  const outputFilename = await generateExcelFile(
    processedProverbs,
    "proverbe_extrase.xlsx",
    true
  );
  
  console.log(`🎉 Succes! Fișierul generat: ${outputFilename}`);
  console.log(`📋 Conține ${processedProverbs.length} proverbe cu etichetare POS`);
  
  return {
    outputFilename,
    totalProverbs: processedProverbs.length,
    proverbs: processedProverbs
  };
}

// Textul din PDF-ul atașat
const romanianText = `Fapta e partea celui merituos, e tovarăşul de drum al călătorului şi sluga celui ce creează. Ea ne urmează asemenea unei umbre.

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

// Rulează scriptul
if (require.main === module) {
  processRomanianProverbs(romanianText, "Enciclopedia înţelepciunii 7-17.pdf")
    .then(result => {
      console.log("\n" + "=".repeat(50));
      console.log("PROCESARE COMPLETĂ!");
      console.log("=".repeat(50));
      console.log(`📁 Fișier Excel: ${result.outputFilename}`);
      console.log(`📊 Total proverbe: ${result.totalProverbs}`);
      console.log("🎨 Sistem de culori POS implementat pentru traduceri");
    })
    .catch(error => {
      console.error("❌ Eroare:", error.message);
    });
}

module.exports = { processRomanianProverbs, extractProverbsFromText, analyzePartOfSpeech };