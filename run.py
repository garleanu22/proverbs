import os
import re
import sys
import subprocess
from datetime import datetime
import pandas as pd

# ========== CONFIGURARE ==========
pdf_folder = r"C:\Users\adria\OneDrive\02 Stefan - Proverbe\99 replit\02 terminal verison - root\02 - V2\02_input_pdf"
output_dir = r"C:\Users\adria\OneDrive\02 Stefan - Proverbe\99 replit\02 terminal verison - root\02 - V2\01_out"
VARIANTA = "v6.4"
COMENTARII = """
- Separare doar la patternuri clare de început de proverb (*, -, numerotare, linii goale duble).
- Nu se mai separă la punct și literă mare (pentru a păstra proverbele compuse).
- Filtrare titluri, linii scurte, majuscule, artefacte OCR.
- Output robust, fiecare proverb pe rând separat, cod complet, 4 sheet-uri.
- Ușor de adaptat pentru excepții noi.
"""

ULTIMUL_PROMPT = """este bine, dar a spart aceleasi 2 proverbe"""

os.makedirs(output_dir, exist_ok=True)

def get_next_output_filename(base_dir, base_name="proverbe_extrase", var=VARIANTA):
    base_name = f"{base_name}_{var}.xlsx"
    base_path = os.path.join(base_dir, base_name)
    if not os.path.exists(base_path):
        return base_path
    i = 2
    while True:
        new_name = f"{str(i).zfill(2)}proverbe_extrase_{var}.xlsx"
        new_path = os.path.join(base_dir, new_name)
        if not os.path.exists(new_path):
            return new_path
        i += 1

def extract_page_number(filename):
    match = re.search(r'Page[_\-]?(\d{3})', filename)
    if match:
        return match.group(1)
    return "NA"

def is_title_line(line):
    title_patterns = [
        r"cugetări ale lumii antice",
        r"proverbe ale lumii antice",
        r"proverbe indiene",
        r"proverbe",
        r"cugetări",
        r"maxime",
        r"pag[\. ]*\d+",
        r"^capitolul\b",
        r"^partea\b"
    ]
    line_low = line.lower().strip(" *«”\"'-—")
    for pat in title_patterns:
        if re.match(pat, line_low):
            return True
    if len(line_low.split()) <= 5 and line_low == line_low.upper() and re.search(r'[A-Z]', line_low):
        return True
    return False

def clean_proverb(line):
    line = re.sub(r'^([*«“”0-9\s\.\-]+)', '', line)
    line = re.sub(r'[\*\«\”\“]+$', '', line)
    if len(line) < 5 or re.match(r'^[A-Z\s]+$', line) or 'FRLDOIZPSI' in line or 'IAT' in line or 'IIIT' in line:
        return ''
    if is_title_line(line):
        return ''
    return line.strip()

def split_proverbs_pattern(lines):
    """
    Separă doar la patternuri clare de început de proverb:
    - Linie care începe cu *, -, numerotare (ex: 1., 2., 3.), sau linii goale duble
    - Dacă nu există patternuri, tot blocul devine un singur proverb
    """
    proverbs = []
    buffer = []
    pattern = re.compile(r'^(\*|-|•|\d+\.)\s+')
    for line in lines:
        if not line:
            if buffer:
                proverbs.append(' '.join(buffer).strip())
                buffer = []
            continue
        if pattern.match(line):
            if buffer:
                proverbs.append(' '.join(buffer).strip())
                buffer = []
            # Scoate markerul de început
            line = pattern.sub('', line)
        buffer.append(line)
    if buffer:
        proverbs.append(' '.join(buffer).strip())
    return [p for p in proverbs if p]

def codare_inline(proverb):
    return " ".join([f"{w}(w)" for w in proverb.split()])

def open_file(filepath):
    try:
        if sys.platform.startswith('darwin'):
            subprocess.call(('open', filepath))
        elif os.name == 'nt':
            os.startfile(filepath)
        elif os.name == 'posix':
            subprocess.call(('xdg-open', filepath))
        print(f"Am deschis automat fișierul: {filepath}")
    except Exception as e:
        print(f"Nu am putut deschide automat fișierul Excel: {e}")

import PyPDF2


all_rows = []

for filename in os.listdir(pdf_folder):
    if filename.lower().endswith('.pdf'):
        pdf_path = os.path.join(pdf_folder, filename)
        page_number = extract_page_number(filename)
        try:
            with open(pdf_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page_idx, page in enumerate(reader.pages):
                    text = page.extract_text()
                    if not text:
                        continue
                    # Curățare și unificare linii
                    lines = [clean_proverb(line) for line in text.split('\n')]
                    # Liniile goale devin separatoare
                    proverbs = split_proverbs_pattern(lines)
                    print(proverbs)
                    f=open("output.txt", "w",encoding="utf8")
                    proverbs=proverbs.replace(["\u0103", "\u021b"], "")
                    f.write(str(proverbs))
                    # for idx, proverb in enumerate(proverbs, 1):
                    #     all_rows.append({
                    #         "Pagina": page_number,
                    #         "Nr Proverb": idx,
                    #         "Proverb": proverb,
                    #         "Codare": codare_inline(proverb)
                    #     })
        except Exception as e:
            print(f"Eroare la procesarea {filename}: {e}")

# df = pd.DataFrame(all_rows)
# df = df.drop_duplicates(subset=["Proverb"])

# output_xlsx = get_next_output_filename(output_dir)

# with pd.ExcelWriter(output_xlsx, engine='openpyxl') as writer:
#     df.to_excel(writer, index=False, sheet_name="Proverbe")
#     try:
#         with open(__file__, "r", encoding="utf-8") as f:
#             code_text = f.read()
#         code_df = pd.DataFrame({"Cod sursă": code_text.splitlines()})
#         code_df.to_excel(writer, index=False, sheet_name="Cod_sursa")
#     except Exception as e:
#         code_df = pd.DataFrame({"Cod sursă": ["Codul sursă nu a putut fi încărcat automat.", str(e)]})
#         code_df.to_excel(writer, index=False, sheet_name="Cod_sursa")
#     var_df = pd.DataFrame({
#         "Varianta": [VARIANTA],
#         "Comentarii": [COMENTARII.strip()]
#     })
#     var_df.to_excel(writer, index=False, sheet_name="Varianta_si_comentarii")
#     prompt_df = pd.DataFrame({"Ultimul prompt": ULTIMUL_PROMPT.strip().splitlines()})
#     prompt_df.to_excel(writer, index=False, sheet_name="Ultimul_prompt")

# ora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
# print(f"Salvat xls la calea: {output_xlsx} la ora: {ora}")

# open_file(output_xlsx)
