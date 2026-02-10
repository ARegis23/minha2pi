import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// =============================================
// 📦 PADRÃO DE RESPOSTA DA API
// =============================================

function sendOk(res: any, data: any, status = 200) {
  res.status(status).json({
    ok: true,
    data,
    timestamp: Date.now(),
  });
}

function sendError(res: any, message: string, status = 400) {
  res.status(status).json({
    ok: false,
    error: message,
    timestamp: Date.now(),
  });
}

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
      sendError(res, "Use GET", 405);
      return;
    }

    const qRaw = String(req.query.q ?? "");
    const q = qRaw.trim();
    const qNorm = normalizeSearch(qRaw);
    const limit = Math.min(Math.max(toInt(req.query.limit, 20), 1), 50);

    // se não mandar q, retorna alguns alimentos (primeiros)
    if (!qNorm) {
      const snap = await db.collection("foods").orderBy("name_pt").limit(limit).get();
      sendOk(res, {
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

    sendOk(res, {
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
    sendError(res, e?.message ?? "Erro interno", 500);
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
      sendError(res, "Use GET", 405);
      return;
    }

    // path: /food?id=123 (modo simples) OU /food/123 (se você colocar rewrites mais tarde)
    const id = String(req.query.id ?? "").trim();

    if (!id) {
      sendError(res, "Informe ?id= (ex: ?id=1)", 400);
      return;
    }

    const doc = await db.collection("foods").doc(id).get();

    if (!doc.exists) {
      sendError(res, "Food não encontrado", 404);
      return;
    }

    sendOk(res, {
      id: doc.id,
      ...doc.data(),
    });
  } catch (e: any) {
    console.error(e);
    sendError(res, e?.message ?? "Erro interno", 500);
  }
});

// =========================
// 1) GET/POST /recipes
// =========================
export const recipes = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return void res.status(204).send("");

    if (req.method === "GET") {
      const q = String(req.query.q ?? "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);

      let query = db.collection("recipes").orderBy("updatedAt", "desc").limit(limit);

      // MVP: se tiver q, filtra no client (simples e funciona)
      // (Depois evoluímos para name_search + prefix query)
      const snap = await query.get();
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((r) => {
          if (!q) return true;
          const hay = normalizeSearch(r.name_pt ?? "");
          return hay.includes(normalizeSearch(q));
        })
        .map((r) => ({
          id: r.id,
          name_pt: r.name_pt ?? null,
          servings: r.servings ?? null,
          prep_minutes: r.prep_minutes ?? null,
          updatedAt: r.updatedAt ?? null,
        }));

      return void sendOk(res, { query: q, count: items.length, items });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const name_pt = String(body.name_pt ?? "").trim();
      const description = String(body.description ?? "").trim();
      const servings = Number(body.servings ?? 1);
      const prep_minutes = body.prep_minutes != null ? Number(body.prep_minutes) : null;

      if (!name_pt) {
        sendError(res, "name_pt é obrigatório", 400);
        return;
      }
      if (!Number.isFinite(servings) || servings <= 0) {
        return void sendError(res, "servings deve ser > 0", 400);
      }

      const doc = {
        name_pt,
        name_search: normalizeSearch(name_pt),
        description: description || null,
        servings,
        prep_minutes: Number.isFinite(prep_minutes as number) ? prep_minutes : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const ref = await db.collection("recipes").add(doc);
      return void sendOk(res, { id: ref.id, name_pt, servings, description });
    }

    return void sendError(res, "Método não permitido", 405);
  } catch (e: any) {
    console.error(e);
    return void sendError(res, e?.message ?? "Erro interno", 500);
  }
});

// =========================
// 2) GET /recipe?id=xxx
// =========================
export const recipe = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");

    const id = String(req.query.id ?? "").trim();
    if (!id) return void sendError(res, "id é obrigatório", 400);

    const ref = db.collection("recipes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return void sendError(res, "Recipe não encontrada", 404);

    const recipeData = snap.data() as any;

    const ingSnap = await ref.collection("ingredients").orderBy("order", "asc").get();
    const ingredients = ingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    return void sendOk(res, {
      id,
      recipe: {
        name_pt: recipeData.name_pt ?? null,
        description: recipeData.description ?? null,
        servings: recipeData.servings ?? null,
        prep_minutes: recipeData.prep_minutes ?? null,
        createdAt: recipeData.createdAt ?? null,
        updatedAt: recipeData.updatedAt ?? null,
      },
      ingredients,
    });
  } catch (e: any) {
    console.error(e);
    return void sendError(res, e?.message ?? "Erro interno", 500);
  }
});

// =========================
// 3) POST /recipeAddIngredient?id=xxx
// =========================
export const recipeAddIngredient = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return void res.status(204).send("");
    if (req.method !== "POST") return void sendError(res, "Use POST", 405);

    const recipeId = String(req.query.id ?? "").trim();
    if (!recipeId) return void sendError(res, "id (recipeId) é obrigatório", 400);

    const { foodId, grams, note, order } = req.body ?? {};
    const foodIdStr = String(foodId ?? "").trim();
    const gramsNum = Number(grams);

    if (!foodIdStr) return void sendError(res, "foodId é obrigatório", 400);
    if (!Number.isFinite(gramsNum) || gramsNum <= 0) {
      return void sendError(res, "grams deve ser > 0", 400);
    }

    // valida se o food existe
    const foodSnap = await db.collection("foods").doc(foodIdStr).get();
    if (!foodSnap.exists) return void sendError(res, "Food não encontrado", 404);

    const recipeRef = db.collection("recipes").doc(recipeId);
    const recipeSnap = await recipeRef.get();
    if (!recipeSnap.exists) return void sendError(res, "Recipe não encontrada", 404);

    const doc = {
      foodId: foodIdStr,
      grams: gramsNum,
      note: note ? String(note).trim() : null,
      order: Number.isFinite(Number(order)) ? Number(order) : 999,
      createdAt: FieldValue.serverTimestamp(),
    };

    const ref = await recipeRef.collection("ingredients").add(doc);
    await recipeRef.update({ updatedAt: FieldValue.serverTimestamp() });

    return void sendOk(res, { id: ref.id, ...doc }, 201);
  } catch (e: any) {
    console.error(e);
    return void sendError(res, e?.message ?? "Erro interno", 500);
  }
});

// =========================
// 4) GET /recipeNutrition?id=xxx&servings=Y
// =========================
export const recipeNutrition = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  try {
    res.set("Access-Control-Allow-Origin", "*");

    const id = String(req.query.id ?? "").trim();
    if (!id) return void sendError(res, "id é obrigatório", 400);

    const recipeRef = db.collection("recipes").doc(id);
    const recipeSnap = await recipeRef.get();
    if (!recipeSnap.exists) return void sendError(res, "Recipe não encontrada", 404);

    const recipeData = recipeSnap.data() as any;

    const ingSnap = await recipeRef.collection("ingredients").get();
    const ingredients = ingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // servings: usa query > recipe.servings > 1
    const servings = Number(req.query.servings ?? recipeData.servings ?? 1);
    const servingsSafe = Number.isFinite(servings) && servings > 0 ? servings : 1;

    // soma nutrientes
    const totals: Record<string, number> = {};
    const details: any[] = [];

    // =========================
    // ✅ Versão otimizada: busca foods em paralelo (Promise.all)
    // =========================

    // 1) pega ids únicos de foods usados nos ingredientes
    const uniqueFoodIds = Array.from(
      new Set(
        ingredients
          .map((ing) => String(ing.foodId ?? "").trim())
          .filter((id) => id.length > 0)
      )
    );

    // 2) busca todos os foods de uma vez (em paralelo)
    const foodSnaps = await Promise.all(
      uniqueFoodIds.map((foodId) => db.collection("foods").doc(foodId).get())
    );

    // 3) monta um "mapa" foodId -> dados do food
    const foodsMap = new Map<string, any>();
    for (const snap of foodSnaps) {
      if (!snap.exists) continue;
      foodsMap.set(snap.id, snap.data());
    }

    // 4) agora calcula usando o mapa (sem novas leituras no Firestore)
    for (const ing of ingredients) {
      const foodId = String(ing.foodId ?? "").trim();
      const grams = Number(ing.grams ?? 0);
      if (!foodId || !Number.isFinite(grams) || grams <= 0) continue;

      const food = foodsMap.get(foodId);
      if (!food) continue;

      const per100 = (food.nutrientsPer100g ?? {}) as Record<string, number>;
      const factor = grams / 100;

      const ingNutrients: Record<string, number> = {};
      for (const [k, v] of Object.entries(per100)) {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;

        const add = n * factor;
        totals[k] = Number(((totals[k] ?? 0) + add).toFixed(6));
        ingNutrients[k] = Number(add.toFixed(6));
      }

      details.push({
        foodId,
        name_pt: food.name_pt ?? null,
        grams,
        nutrients: ingNutrients,
      });
    }

    // por porção
    const perServing: Record<string, number> = {};
    for (const [k, v] of Object.entries(totals)) {
      perServing[k] = Number((v / servingsSafe).toFixed(6));
    }

    return void sendOk(res, {
      id,
      recipe: { name_pt: recipeData.name_pt ?? null, servings: recipeData.servings ?? null },
      servings_used: servingsSafe,
      totals,
      perServing,
      ingredients_count: ingredients.length,
      details,
    });
  } catch (e: any) {
    console.error(e);
    return void sendError(res, e?.message ?? "Erro interno", 500);
  }
})

export const debugEnv = onRequest({ region: "southamerica-east1" }, (req, res) => {
  sendOk(res, {
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? null,
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT ?? null,
    FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR ?? null,
  });
});
