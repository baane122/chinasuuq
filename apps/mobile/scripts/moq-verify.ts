// Temporary verification harness for the YiwuGo MOQ capture bug (deleted after use).
// Run: npx -y tsx scripts/moq-verify.ts  (from apps/mobile)
//
// Case A is the exact line from the live bug report (screenshot IMG_2129):
// a machine-translated YiwuGo page showing "360 minimum purchase".
import { extractMoqLocal, selectMoqEvidence, resolveMoq } from "../src/lib/moqIngest";
import { PRODUCT_CAPTURE_SCRIPT } from "../src/lib/webviewScripts";
import { VISION_SNAPSHOT_SCRIPT } from "../src/lib/webviewScripts.risk";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

// ── Case A: the reported YiwuGo page (translated to English) ──────────────
const yiwugoPage = [
  "Dog Toys Pet Chew Toys Squeaky Rubber Ball",
  "$2.83",
  "360 minimum purchase",
  "Purchasing by piece (360 pieces/piece)",
  "Express: ¥5.00起",
  "Ships to Somalia",
].join("\n");

const a = extractMoqLocal(yiwugoPage);
check("A: moq = 360", a.moq === 360, a);
check("A: confidence >= 0.8 (enforceable)", a.confidence >= 0.8, a);
check("A: raw cites the line", (a.raw ?? "").includes("360"), a.raw);

// ── Case B: label-first English form, alone on the page ──────────────────
const b = extractMoqLocal("Minimum purchase: 24");
check("B: label-first 'Minimum purchase: 24'", b.moq === 24 && b.confidence >= 0.8, b);

// ── Case C: untranslated Chinese still works ──────────────────────────────
const c = extractMoqLocal("2件起批\n¥12.5");
check("C: 2件起批 → 2", c.moq === 2, c);

// ── Evidence selector must keep the line for the AI fallback ───────────────
const ev = selectMoqEvidence(yiwugoPage);
check("evidence keeps '360 minimum purchase'", ev.includes("360 minimum purchase"), ev);

// ── resolveMoq end-to-end: no stored MOQ, only captured text ───────────────
const r = resolveMoq({ moq: null, moq_source: null }, yiwugoPage);
check("resolve: displayMoq = 360", r.displayMoq === 360, r);
check("resolve: enforce = true", r.enforce === true, r);

// ── Regression: shipping ¥N起 must NOT be mistaken for a product price line
// (parser side: ¥ lines only matter when capture ships them; ensure the
//  '起批' rule doesn't fire on '¥5.00起')
const d = extractMoqLocal("Express: ¥5.00起");
check("D: shipping line alone yields no MOQ", d.moq === null, d);

/* ─── The injected WebView scripts themselves ───────────────────────
 * These are plain strings evaluated by the WebView, so the typechecker never
 * sees inside them: a stray bracket parses as a broken page script on device
 * only. Syntax-check them here, then run the regex that is ACTUALLY in the
 * shipped string (not a copy in this file) against real page lines.
 */
const probes: Array<[string, boolean]> = [
  ["360 minimum purchase", true],
  ["Minimum purchase: 24", true],
  ["Min. order: 20 Pieces", true],
  ["360件起购", true],
  ["起订量: 5", true],
  ["Ships to Somalia", false],
];

for (const [name, src] of [
  ["PRODUCT_CAPTURE_SCRIPT", PRODUCT_CAPTURE_SCRIPT],
  ["VISION_SNAPSHOT_SCRIPT", VISION_SNAPSHOT_SCRIPT],
] as Array<[string, string]>) {
  let parses = true;
  try {
    // Compiling the injected body is what the WebView does; it throws on a
    // syntax error without needing a DOM.
    new Function(src);
  } catch (e) {
    parses = false;
    console.log(`FAIL  ${name} syntax`, (e as Error).message);
  }
  check(`${name} parses as JS`, parses);

  const literal = src.match(/var moqRe = (\/.+\/[a-z]*);/);
  check(`${name} still declares moqRe`, Boolean(literal));
  if (!literal) continue;
  const lastSlash = literal[1].lastIndexOf("/");
  const re = new RegExp(literal[1].slice(1, lastSlash), literal[1].slice(lastSlash + 1));
  for (const [text, want] of probes) {
    re.lastIndex = 0;
    check(`${name} moqRe ${want ? "keeps" : "drops"}: ${text}`, re.test(text) === want);
  }
}

// ── Cross-marketplace regression suite ────────────────────────────────────
const cases: Array<[string, string, number | null]> = [
  ["1688 label: 起订量: 5", "起订量: 5", 5],
  ["1688 native: 100件起批", "100件起批", 100],
  ["1688 label 起购", "起购 30", 30],
  ["YiwuGo untranslated: 360件起购", "360件起购", 360],
  ["MOQ: 10", "MOQ: 10", 10],
  ["Min. order: 20 Pieces", "Min. order: 20 Pieces", 20],
  ["Minimum Order Quantity 30 units", "Minimum Order Quantity 30 units", 30],
  ["number-first: 50 minimum", "50 minimum", 50],
  ["ladder: 2-19件 ¥12 / 20-99件 ¥10 / ≥100件 ¥8", "2-19件 ¥12\n20-99件 ¥10\n≥100件 ¥8", 2],
  ["50件以上", "50件以上", 50],
  ["Chinese numeral: 十件起批", "十件起批", 10],
  ["noise: no MOQ", "Dog Toys Pet Chew Toys\nShips to Somalia", null],
];
for (const [name, text, want] of cases) {
  const got = extractMoqLocal(text).moq;
  check(`regress: ${name} → ${want}`, got === want, got);
}
// Ambiguity guard still holds: two same-strength labels = multi-SKU page.
const amb = extractMoqLocal("起订量 5\n起订量 50");
check("ambiguity: two labels cap confidence", amb.moq !== null && amb.confidence <= 0.7 && amb.alternatives.length > 0, amb);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
if (failures > 0) throw new Error(`${failures} MOQ verification(s) failed`);
