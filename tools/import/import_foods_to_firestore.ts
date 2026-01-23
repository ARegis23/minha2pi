import fs from "fs";
import path from "path";
import admin from "firebase-admin";

type FoodDoc = {
  id: string;
  name_pt: string;
  source: "TACO" | "OFF";
  group?: string;
  nutrientsPer100g: Record<string, number | undefined>;
};

const INPUT_JSON = path.resolve(__dirname, "foods.normalized.json");

if (!fs.existsSync(INPUT_JSON)) {
  console.error("Não encontrei foods.normalized.json em:", INPUT_JSON);
  process.exit(1);
}

// ✅ Emulador: não use credentials (evita ADC)
admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT || "minha2pi",
});

const db = admin.firestore();

function normalizeSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ✅ aponta pro emulador
const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
db.settings({ host, ssl: false });

console.log("✅ Import usando Firestore Emulator:", host);
console.log("✅ ProjectId:", process.env.GCLOUD_PROJECT || "minha2pi");

async function run() {
  const raw = fs.readFileSync(INPUT_JSON, "utf-8");
  const foods: FoodDoc[] = JSON.parse(raw);

  console.log(`Importando ${foods.length} alimentos para /foods ...`);

  const batchSize = 450;
  let written = 0;

  for (let i = 0; i < foods.length; i += batchSize) {
    const chunk = foods.slice(i, i + batchSize);
    const batch = db.batch();

    for (const f of chunk) {
      const ref = db.collection("foods").doc(f.id);
      batch.set(
        ref,
        {
          name_pt: f.name_pt,
          name_search: normalizeSearch(f.name_pt),
          source: f.source,
          group: f.group ?? null,
          nutrientsPer100g: f.nutrientsPer100g ?? {},
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    written += chunk.length;
    console.log(`✅ Batch ok: ${written}/${foods.length}`);
  }

  console.log("🎉 Import concluído!");
  process.exit(0);
}

run().catch((e) => {
  console.error("Erro no import:", e);
  process.exit(1);
});
