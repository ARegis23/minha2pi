import fs from "fs";
import path from "path";
import * as xlsx from "xlsx";

type Nutrients = {
  kcal?: number;
  carbs_g?: number;
  protein_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  magnesium_mg?: number;
  potassium_mg?: number;
};

type FoodDoc = {
  id: string;
  name_pt: string;
  source: "TACO";
  group?: string;
  nutrientsPer100g: Nutrients;
};

const DEFAULT_INPUT = path.resolve(__dirname, "taco.xlsx");
const DEFAULT_OUTPUT = path.resolve(__dirname, "foods.normalized.json");

const args = process.argv.slice(2);
const getArgValue = (flag: string) => {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
};

const INPUT_FILE = getArgValue("--input") ?? process.env.INPUT_FILE ?? DEFAULT_INPUT;
const OUTPUT_JSON = getArgValue("--output") ?? process.env.OUTPUT_JSON ?? DEFAULT_OUTPUT;
const SHEET_NAME = getArgValue("--sheet") ?? process.env.SHEET_NAME ?? undefined;
const HEADER_LABEL =
  getArgValue("--header-label") ?? process.env.HEADER_LABEL ?? "Descricao dos alimentos";
const HEADER_LINES =
  Number(getArgValue("--header-lines") ?? process.env.HEADER_LINES ?? 3) || 3;
const HEADER_ROW = Number(getArgValue("--header-row") ?? process.env.HEADER_ROW ?? 0) || 0;

function normalizeNumber(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;

  const s = String(v).trim();
  if (!s || /^na$/i.test(s) || /^tr$/i.test(s)) return undefined;

  if (typeof v === "number" && Number.isFinite(v)) return v;

  let cleaned = s.replace(/\s+/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickHeader(headers: string[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const found = headers.find((h) => p.test(normalizeText(h)));
    if (found) return found;
  }
  return null;
}

function isDataRow(r: Record<string, any>, colId: string, colName: string): boolean {
  const id = r[colId];
  const name = String(r[colName] ?? "").trim();

  if (!name) return false;

  if (typeof id === "number" && Number.isFinite(id)) return true;
  if (/^\d+$/.test(String(id ?? "").trim())) return true;
  return false;
}

if (!fs.existsSync(INPUT_FILE)) {
  console.error("Nao encontrei o arquivo de entrada em:", INPUT_FILE);
  process.exit(1);
}

const wb = xlsx.readFile(INPUT_FILE);
if (!wb.SheetNames.length) {
  console.error("Nenhuma aba encontrada no Excel.");
  process.exit(1);
}

if (SHEET_NAME && !wb.SheetNames.includes(SHEET_NAME)) {
  console.error("Aba informada nao encontrada:", SHEET_NAME);
  console.error("Abas disponiveis:", wb.SheetNames.join(", "));
  process.exit(1);
}

const sheetName = SHEET_NAME ?? wb.SheetNames[0];
if (!sheetName) {
  console.error("Nenhuma aba encontrada no Excel.");
  process.exit(1);
}

const ws = wb.Sheets[sheetName];
if (!ws) {
  console.error("Aba nao encontrada:", sheetName);
  process.exit(1);
}

const matrix: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
if (!matrix.length) {
  console.error("Planilha vazia.");
  process.exit(1);
}

const headerNeedle = normalizeText(HEADER_LABEL);
const baseHeaderIdx =
  HEADER_ROW > 0
    ? HEADER_ROW - 1
    : matrix.findIndex((row) =>
        row?.some((cell: any) => {
          if (typeof cell !== "string") return false;
          return normalizeText(cell).includes(headerNeedle);
        })
      );

if (baseHeaderIdx < 0 || baseHeaderIdx >= matrix.length) {
  if (HEADER_ROW > 0) {
    console.error(`Linha de cabecalho invalida (--header-row=${HEADER_ROW}).`);
    process.exit(1);
  }

  const firstRow = matrix[0] ?? [];
  const stringCols = firstRow.filter((v) => typeof v === "string" && String(v).trim() !== "").length;
  if (stringCols >= 2) {
    console.warn(`Cabecalho '${HEADER_LABEL}' nao encontrado. Usando primeira linha como cabecalho.`);
  } else {
    console.error(`Nao encontrei a linha base do cabecalho (${HEADER_LABEL}).`);
    console.log("Primeiras 8 linhas (preview):");
    console.log(matrix.slice(0, 8));
    process.exit(1);
  }
}

const effectiveHeaderIdx =
  baseHeaderIdx >= 0 && baseHeaderIdx < matrix.length ? baseHeaderIdx : 0;
const headerLines = Math.max(1, HEADER_LINES);
const headerStartIdx = Math.max(0, effectiveHeaderIdx - (headerLines - 1));
const headerRows = matrix.slice(headerStartIdx, effectiveHeaderIdx + 1);
const maxLen = Math.max(...headerRows.map((r) => r.length), 0);

const header = Array.from({ length: maxLen }, (_, i) => {
  const parts = headerRows
    .map((r) => r[i])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v).trim());

  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined || null;
});

const headers = header.filter(Boolean).map(String);

console.log("Arquivo:", path.basename(INPUT_FILE));
console.log("Aba:", sheetName);
console.log("Header base encontrado na linha:", effectiveHeaderIdx + 1);
console.log("Headers detectados (primeiros 40):", headers.slice(0, 40));

const data = matrix.slice(effectiveHeaderIdx + 1);

const rows: Record<string, any>[] = data
  .filter((r) => r && r.some((v: any) => v !== null && v !== ""))
  .map((r) => {
    const obj: Record<string, any> = {};
    header.forEach((key: any, idx: number) => {
      if (!key) return;
      obj[String(key)] = r[idx];
    });
    return obj;
  });

const colId = pickHeader(headers, [/numero\s+do\s+alimento/i, /^numero\s+do/i, /^numero$/i, /^id_alimento$/i, /^id$/i]);
const colName = pickHeader(headers, [/descricao\s+dos\s+alimentos/i, /^descricao/i, /^nome_exibicao$/i, /^nome_base$/i, /^nome$/i]);

const colKcal = pickHeader(headers, [/energia.*\(kcal\)/i, /energia.*kcal/i, /^energia_kcal$/i]);
const colProtein = pickHeader(headers, [/proteina.*\(g\)/i, /proteina/i, /^proteina_g$/i]);
const colFat = pickHeader(headers, [/lipideos.*\(g\)/i, /lipideos/i, /^lipideos_g$/i, /^gordura.*_g$/i]);
const colCarbs = pickHeader(headers, [/carbo.*idrato.*\(g\)/i, /carbo.*idrato/i, /^carboidrato_g$/i]);
const colFiber = pickHeader(headers, [/fibra.*alimentar.*\(g\)/i, /fibra.*alimentar/i, /^fibra_alimentar_g$/i]);
const colSodium = pickHeader(headers, [/sodio.*\(mg\)/i, /sodio/i, /^sodio_mg$/i]);
const colCalcium = pickHeader(headers, [/calcio.*\(mg\)/i, /calcio/i, /^calcio_mg$/i]);
const colIron = pickHeader(headers, [/ferro.*\(mg\)/i, /ferro/i, /^ferro_mg$/i]);
const colMagnesium = pickHeader(headers, [/magnesio.*\(mg\)/i, /magnesio/i, /^magnesio_mg$/i]);
const colPotassium = pickHeader(headers, [/potassio.*\(mg\)/i, /potassio/i, /^potassio_mg$/i]);

console.log("Colunas escolhidas:", {
  colId,
  colName,
  colKcal,
  colCarbs,
  colProtein,
  colFat,
  colFiber,
  colSodium,
  colCalcium,
  colIron,
  colMagnesium,
  colPotassium,
});

if (!colId || !colName) {
  console.error("Nao consegui identificar colId/colName. Veja os headers detectados acima.");
  process.exit(1);
}

const foods: FoodDoc[] = [];

for (const r of rows) {
  if (!isDataRow(r, colId, colName)) continue;

  const id = String(r[colId]).trim();
  const name_pt = String(r[colName] ?? "").trim();
  if (!id || !name_pt) continue;

  const nutrientsPer100g: Nutrients = {
    kcal: colKcal ? normalizeNumber(r[colKcal]) : undefined,
    carbs_g: colCarbs ? normalizeNumber(r[colCarbs]) : undefined,
    protein_g: colProtein ? normalizeNumber(r[colProtein]) : undefined,
    fat_g: colFat ? normalizeNumber(r[colFat]) : undefined,
    fiber_g: colFiber ? normalizeNumber(r[colFiber]) : undefined,
    sodium_mg: colSodium ? normalizeNumber(r[colSodium]) : undefined,
    calcium_mg: colCalcium ? normalizeNumber(r[colCalcium]) : undefined,
    iron_mg: colIron ? normalizeNumber(r[colIron]) : undefined,
    magnesium_mg: colMagnesium ? normalizeNumber(r[colMagnesium]) : undefined,
    potassium_mg: colPotassium ? normalizeNumber(r[colPotassium]) : undefined,
  };

  foods.push({
    id,
    name_pt,
    source: "TACO",
    nutrientsPer100g,
  });
}

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(foods, null, 2), "utf-8");
console.log(`Gerado ${path.basename(OUTPUT_JSON)} com ${foods.length} alimentos.`);
