(() => {
  "use strict";

  let originalBodyHTML = null;
  let originalTitle    = null;

  // ─── Message router ──────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "extractRecipe") {
      const recipe = extractRecipe();
      if (!recipe) { sendResponse({ found: false }); return; }
      renderReader(recipe);
      sendResponse({ found: true, title: recipe.title });
    } else if (message.action === "restorePage") {
      restorePage();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ─── 1. Schema.org JSON-LD extraction (works on ~80 % of recipe sites) ───────

  function extractFromSchema() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const recipe = findRecipeNode(data);
        if (recipe) return normalizeSchema(recipe);
      } catch (_) {}
    }
    return null;
  }

  function findRecipeNode(node) {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findRecipeNode(item);
        if (found) return found;
      }
      return null;
    }
    const type = node["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return node;
    if (node["@graph"]) return findRecipeNode(node["@graph"]);
    return null;
  }

  function normalizeSchema(node) {
    return {
      title:        node.name || document.title,
      image:        pickImage(node.image),
      description:  node.description || "",
      prepTime:     parseDuration(node.prepTime),
      cookTime:     parseDuration(node.cookTime),
      totalTime:    parseDuration(node.totalTime),
      servings:     node.recipeYield || node.yield || "",
      ingredients:  normalizeIngredients(node.recipeIngredient),
      instructions: normalizeInstructions(node.recipeInstructions),
    };
  }

  function pickImage(raw) {
    if (!raw) return null;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) raw = raw[0];
    if (typeof raw === "object") return raw.url || raw.contentUrl || null;
    return null;
  }

  function normalizeIngredients(raw) {
    if (!raw) return [];
    if (typeof raw === "string") return [raw];
    return raw.map(i => (typeof i === "string" ? i : i.name || "")).filter(Boolean);
  }

  function normalizeInstructions(raw) {
    if (!raw) return [];
    if (typeof raw === "string") return splitSentences(raw);
    return raw.flatMap(item => {
      if (typeof item === "string") return [item];
      if (item["@type"] === "HowToStep") return [item.text || item.name || ""];
      if (item["@type"] === "HowToSection") {
        const sectionSteps = normalizeInstructions(item.itemListElement || []);
        const header = item.name ? [`§ ${item.name}`] : [];
        return [...header, ...sectionSteps];
      }
      return [item.text || item.name || ""];
    }).filter(Boolean);
  }

  function splitSentences(text) {
    return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  }

  function parseDuration(iso) {
    if (!iso) return null;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!m) return null;
    const h = parseInt(m[1] || 0, 10);
    const min = parseInt(m[2] || 0, 10);
    if (h && min) return `${h}h ${min}m`;
    if (h) return `${h}h`;
    if (min) return `${min}m`;
    return null;
  }

  // ─── 2. DOM heuristic fallback (for sites without schema) ───────────────────

  function extractFromDOM() {
    const recipe = {
      title:        "",
      image:        null,
      description:  "",
      prepTime:     null,
      cookTime:     null,
      totalTime:    null,
      servings:     "",
      ingredients:  [],
      instructions: [],
    };

    // Title
    recipe.title =
      textOf('h1[class*="recipe"], h1[class*="title"], h1[itemprop="name"]') ||
      textOf("h1") ||
      document.title;

    // Image — prefer large images inside known recipe containers
    const img = document.querySelector(
      '[class*="recipe"] img, [class*="hero"] img, article img, main img'
    );
    if (img) recipe.image = img.src || img.dataset.src || null;

    // Ingredients
    const ingContainers = document.querySelectorAll(
      '[class*="ingredient"], [id*="ingredient"], [itemprop="recipeIngredient"]'
    );
    const ingItems = new Set();
    ingContainers.forEach(el => {
      const items = el.querySelectorAll("li, p, span");
      if (items.length) {
        items.forEach(li => { const t = li.textContent.trim(); if (t) ingItems.add(t); });
      } else {
        const t = el.textContent.trim();
        if (t) ingItems.add(t);
      }
    });
    recipe.ingredients = [...ingItems].filter(t => t.length > 2 && t.length < 300);

    // Instructions
    const dirContainers = document.querySelectorAll(
      '[class*="instruction"], [class*="direction"], [class*="step"], [class*="method"],' +
      '[id*="instruction"], [id*="direction"], [itemprop="recipeInstructions"]'
    );
    const dirItems = [];
    dirContainers.forEach(el => {
      const items = el.querySelectorAll("li, p, [class*='step']");
      if (items.length) {
        items.forEach(li => { const t = li.textContent.trim(); if (t) dirItems.push(t); });
      } else {
        const t = el.textContent.trim();
        if (t) dirItems.push(...splitSentences(t));
      }
    });
    recipe.instructions = [...new Set(dirItems)].filter(t => t.length > 10);

    if (!recipe.ingredients.length && !recipe.instructions.length) return null;
    return recipe;
  }

  function textOf(selector) {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : "";
  }

  // ─── 3. Orchestrate ──────────────────────────────────────────────────────────

  function extractRecipe() {
    return extractFromSchema() || extractFromDOM();
  }

  // ─── 4. Render reader view ───────────────────────────────────────────────────

  function renderReader(recipe) {
    originalBodyHTML = document.body.innerHTML;
    originalTitle    = document.title;

    const metaParts = [
      recipe.totalTime && `⏱ ${recipe.totalTime}`,
      recipe.prepTime  && `Prep ${recipe.prepTime}`,
      recipe.cookTime  && `Cook ${recipe.cookTime}`,
      recipe.servings  && `Serves ${recipe.servings}`,
    ].filter(Boolean);

    const ingredientItems = recipe.ingredients
      .map((ing, i) => `
        <li class="rr-ing-item">
          <label>
            <input type="checkbox" id="rr-ing-${i}" />
            <span>${escHtml(ing)}</span>
          </label>
        </li>`)
      .join("");

    const instructionItems = recipe.instructions
      .map((step, i) => {
        if (step.startsWith("§ ")) {
          return `<li class="rr-section-header">${escHtml(step.slice(2))}</li>`;
        }
        return `
          <li class="rr-step">
            <span class="rr-step-num">${i + 1}</span>
            <span class="rr-step-text">${escHtml(step)}</span>
          </li>`;
      })
      .join("");

    document.body.innerHTML = `
      <div id="rr-root">
        <style>${READER_CSS}</style>

        <header id="rr-header">
          <span id="rr-brand">🍴 romplin-recipe</span>
          <button id="rr-close">✕ Exit Reader</button>
        </header>

        <main id="rr-main">

          ${recipe.image ? `<img id="rr-image" src="${escHtml(recipe.image)}" alt="" />` : ""}

          <h1 id="rr-title">${escHtml(recipe.title)}</h1>

          ${metaParts.length ? `<div id="rr-meta">${metaParts.map(p => `<span>${p}</span>`).join("")}</div>` : ""}

          ${recipe.description ? `<p id="rr-desc">${escHtml(recipe.description)}</p>` : ""}

          ${recipe.ingredients.length ? `
            <section class="rr-section">
              <h2>Ingredients</h2>
              <ul id="rr-ingredients">${ingredientItems}</ul>
            </section>` : ""}

          ${recipe.instructions.length ? `
            <section class="rr-section">
              <h2>Directions</h2>
              <ol id="rr-instructions">${instructionItems}</ol>
            </section>` : ""}

        </main>
      </div>`;

    document.title = recipe.title;

    document.getElementById("rr-close").addEventListener("click", () => {
      restorePage();
      chrome.runtime.sendMessage({ action: "readerClosed" });
    });
  }

  // ─── 5. Restore original page ────────────────────────────────────────────────

  function restorePage() {
    if (originalBodyHTML !== null) {
      document.body.innerHTML = originalBodyHTML;
      document.title = originalTitle;
      originalBodyHTML = null;
      originalTitle    = null;
    }
  }

  // ─── 6. Helpers ──────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── 7. Reader CSS (injected inline so no extra file needed) ─────────────────

  const READER_CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    #rr-root {
      font-family: Georgia, "Times New Roman", serif;
      background: #111111;
      min-height: 100vh;
      color: #f0f0f0;
    }

    #rr-header {
      position: sticky;
      top: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 24px;
      background: #141414;
      border-bottom: 1px solid #2a2a2a;
      z-index: 9999;
    }

    #rr-brand {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: #4ade80;
    }

    #rr-close {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 14px;
      background: #4ade80;
      color: #0a0a0a;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      transition: background 0.15s;
    }
    #rr-close:hover { background: #22c55e; }

    #rr-main {
      max-width: 720px;
      margin: 0 auto;
      padding: 40px 24px 80px;
    }

    #rr-image {
      width: 100%;
      max-height: 420px;
      object-fit: cover;
      border-radius: 10px;
      margin-bottom: 28px;
    }

    #rr-title {
      font-size: clamp(24px, 4vw, 36px);
      line-height: 1.2;
      font-weight: 700;
      color: #f0f0f0;
      margin-bottom: 14px;
    }

    #rr-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }

    #rr-meta span {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      background: #1e1e1e;
      color: #888;
      border: 1px solid #2a2a2a;
      padding: 4px 10px;
      border-radius: 20px;
    }

    #rr-desc {
      font-size: 15px;
      color: #888;
      line-height: 1.6;
      margin-bottom: 32px;
      font-style: italic;
    }

    .rr-section {
      margin-top: 36px;
    }

    .rr-section h2 {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #4ade80;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #2a2a2a;
    }

    /* Ingredients */
    #rr-ingredients {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .rr-ing-item label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .rr-ing-item label:hover { background: #1e1e1e; }

    .rr-ing-item input[type="checkbox"] {
      margin-top: 2px;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      accent-color: #4ade80;
      cursor: pointer;
    }

    .rr-ing-item input:checked + span {
      text-decoration: line-through;
      color: #444;
    }

    .rr-ing-item span {
      font-size: 16px;
      line-height: 1.5;
      color: #f0f0f0;
    }

    /* Instructions */
    #rr-instructions {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .rr-step {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }

    .rr-step-num {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      font-weight: 700;
      color: #0a0a0a;
      background: #4ade80;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .rr-step-text {
      font-size: 16px;
      line-height: 1.65;
      color: #f0f0f0;
    }

    .rr-section-header {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #4ade80;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px 0;
      border-bottom: 1px dashed #2a2a2a;
    }
  `;
})();
