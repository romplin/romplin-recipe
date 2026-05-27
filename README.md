# romplin-recipe

A Manifest V3 Chrome extension that strips recipe pages down to just what matters: **ingredients, directions, and photos**. No ads, no life stories, no pop-ups.

## How it works

1. Click the **romplin-recipe** toolbar icon on any recipe page
2. Hit **Extract Recipe**
3. The page is replaced with a clean reader view
4. Check off ingredients as you go, follow numbered steps
5. Hit **✕ Exit Reader** (or **Restore Page** in the popup) to get the original page back

## Extraction strategy

| Method | Coverage |
|---|---|
| `schema.org/Recipe` JSON-LD | ~80 % of sites (AllRecipes, Serious Eats, NYT Cooking, Food Network, Epicurious, King Arthur, Tasty, …) |
| DOM heuristics (`[class*="ingredient"]`, etc.) | Most remaining recipe sites |

## Load in Chrome (dev mode)

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. The 🍴 icon appears in your toolbar

After any code change, click the **↺ refresh** icon on the extension card at `chrome://extensions`.

## Structure

```
manifest.json
popup/
  popup.html        ← toolbar popup UI
  popup.js          ← extract / restore logic
  popup.css
background/
  service_worker.js ← clears reader state on close
content/
  content.js        ← extraction + reader view (all-in-one)
icons/
```
