import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp({ projectId: "minha2pi" });
const db = admin.firestore();

// 🔧 Força conexão com o Firestore Emulator quando estiver disponível
if (process.env.FIRESTORE_EMULATOR_HOST) {
  db.settings({ host: "127.0.0.1:8080", ssl: false });
  console.log("✅ Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST);
} else {
  console.log("⚠️ FIRESTORE_EMULATOR_HOST não definido; usando Firestore padrão (produção).");
}

// helpers
function toInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function normalizeSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ✅ GET /foods?q=arroz&limit=20
export const foods = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  try {
    // CORS simples (para uso no Flutter/web)
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Use GET" });
      return;
    }

    const qRaw = String(req.query.q ?? "");
    const q = qRaw.trim();
    const qNorm = normalizeSearch(qRaw);
    const limit = Math.min(Math.max(toInt(req.query.limit, 20), 1), 50);

    // se não mandar q, retorna alguns alimentos (primeiros)
    if (!qNorm) {
      const snap = await db.collection("foods").orderBy("name_pt").limit(limit).get();
      res.json({
        query: q,
        count: snap.size,
        items: snap.docs.map((d) => ({
          id: d.id,
          name_pt: d.get("name_pt"),
          source: d.get("source"),
        })),
      });
      return;
    }

    const snap = await db
      .collection("foods")
      .orderBy("name_search")
      .startAt(qNorm)
      .endAt(qNorm + "\uf8ff")
      .limit(limit)
      .get();

    res.json({
      query: q,
      normalized: qNorm,
      count: snap.size,
      items: snap.docs.map((d) => ({
        id: d.id,
        name_pt: d.get("name_pt"),
        source: d.get("source"),
        nutrientsPer100g: d.get("nutrientsPer100g") ?? {},
      })),
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ✅ GET /food/:id  (detalhe)
export const food = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Use GET" });
      return;
    }

    // path: /food?id=123 (modo simples) OU /food/123 (se você colocar rewrites mais tarde)
    const id = String(req.query.id ?? "").trim();

    if (!id) {
      res.status(400).json({ error: "Informe ?id= (ex: ?id=1)" });
      return;
    }

    const doc = await db.collection("foods").doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: "Food não encontrado", id });
      return;
    }

    res.json({
      id: doc.id,
      ...doc.data(),
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

export const debugEnv = onRequest({ region: "southamerica-east1" }, (req, res) => {
  res.json({
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? null,
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT ?? null,
    FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR ?? null,
  });
});
