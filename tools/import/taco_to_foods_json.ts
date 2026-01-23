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

const INPUT_XLSX = path.resolve(__dirname, "taco.xlsx");
const OUTPUT_JSON = path.resolve(__dirname, "foods.normalized.json");

function normalizeNumber(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;

  // TACO usa "Tr" e "NA"
  const s = String(v).trim();
  if (!s || /^na$/i.test(s) || /^tr$/i.test(s)) return undefined;

  // números podem vir como number
  if (typeof v === "number" && Number.isFinite(v)) return v;

  // se vier "1,23" ou "1.23"
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function pickHeader(headers: string[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const found = headers.find((h) => p.test(h));
    if (found) return found;
  }
  return null;
}

function isDataRow(r: Record<string, any>, colId: string, colName: string): boolean {
  const id = r[colId];
  const name = String(r[colName] ?? "").trim();
  // pula categoria tipo "Cereais e derivados"
  if (!name) return false;
  // id deve ser número
  if (typeof id === "number" && Number.isFinite(id)) return true;
  if (/^\d+$/.test(String(id ?? "").trim())) return true;
  return false;
}

if (!fs.existsSync(INPUT_XLSX)) {
  console.error("Não encontrei taco.xlsx em:", INPUT_XLSX);
  process.exit(1);
}

const wb = xlsx.readFile(INPUT_XLSX);
const sheetName = wb.SheetNames[0];
if (!sheetName) {
  console.error("Nenhuma aba encontrada no Excel.");
  process.exit(1);
}

const ws = wb.Sheets[sheetName];
if (!ws) {
  console.error("Aba não encontrada:", sheetName);
  process.exit(1);
}

// Lê como matriz para lidar com cabeçalho em múltiplas linhas
const matrix: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

// acha a linha que contém "Descrição dos alimentos"
const baseHeaderIdx = matrix.findIndex((row) =>
  row?.some((cell: any) => {
    if (typeof cell !== "string") return false;
    return /descri[cç][aã]o\s+dos\s+alimentos/i.test(cell.trim());
  })
);

if (baseHeaderIdx < 0) {
  console.error("Não encontrei a linha base do cabeçalho (Descrição dos alimentos).");
  console.log("Primeiras 8 linhas (preview):");
  console.log(matrix.slice(0, 8));
  process.exit(1);
}

// combina 3 linhas: topo + meio + unidades
const h0 = matrix[baseHeaderIdx - 2] ?? [];
const h1 = matrix[baseHeaderIdx - 1] ?? [];
const h2 = matrix[baseHeaderIdx] ?? [];

const maxLen = Math.max(h0.length, h1.length, h2.length);

const header = Array.from({ length: maxLen }, (_, i) => {
  const parts = [h0[i], h1[i], h2[i]]
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v).trim());

  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined || null;
});

const headers = header.filter(Boolean).map(String);

console.log("Aba:", sheetName);
console.log("Header base encontrado na linha:", baseHeaderIdx + 1);
console.log("Headers detectados (primeiros 40):", headers.slice(0, 40));

const data = matrix.slice(baseHeaderIdx + 1);

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

const colId = pickHeader(headers, [/n[úu]mero\s+do\s+alimento/i, /^n[úu]mero\s+do/i]);
const colName = pickHeader(headers, [/descri[cç][aã]o\s+dos\s+alimentos/i, /descri[cç][aã]o/i]);

const colKcal = pickHeader(headers, [/energia.*\(kcal\)/i, /energia.*kcal/i]);
const colProtein = pickHeader(headers, [/prote[ií]na.*\(g\)/i, /prote[ií]na/i]);
const colFat = pickHeader(headers, [/lip[ií]deos.*\(g\)/i, /lip[ií]deos/i]);
const colCarbs = pickHeader(headers, [/carbo.*idrato.*\(g\)/i, /carbo.*idrato/i]);
const colFiber = pickHeader(headers, [/fibra.*alimentar.*\(g\)/i, /fibra.*alimentar/i]);
const colSodium = pickHeader(headers, [/s[oó]dio.*\(mg\)/i, /s[oó]dio/i]);
const colCalcium = pickHeader(headers, [/c[aá]lcio.*\(mg\)/i, /c[aá]lcio/i]);
const colIron = pickHeader(headers, [/ferro.*\(mg\)/i, /ferro/i]);
const colMagnesium = pickHeader(headers, [/magn[eé]sio.*\(mg\)/i, /magn[eé]sio/i]);
const colPotassium = pickHeader(headers, [/pot[aá]ssio.*\(mg\)/i, /pot[aá]ssio/i]);

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
  console.error("Não consegui identificar colId/colName. Veja os headers detectados acima.");
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
console.log(`✅ Gerado ${path.basename(OUTPUT_JSON)} com ${foods.length} alimentos.`);
