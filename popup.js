"use strict";

/* ===== DEV OVERRIDE: "free" | "trial" | "paid" to simulate, or null for real ExtPay. DELETE before shipping. ===== */
const DEV_TIER = null;

const extpay = ExtPay("my-shorthand-extension");
const TRIAL_DAYS = 3;
const MAX_FREE_PACKS = 2;

let state = marginFreshState();
let ENGINE = null;
let tier = { tier: "free", daysLeft: 0 };

/* ---------- tier ---------- */
function tierFromUser(user){
  if(DEV_TIER) return DEV_TIER === "trial" ? { tier:"trial", daysLeft:TRIAL_DAYS } : { tier:DEV_TIER, daysLeft:0 };
  if(user && user.paid) return { tier:"paid", daysLeft:0 };
  if(user && user.trialStartedAt){
    const end = new Date(user.trialStartedAt).getTime() + TRIAL_DAYS * 864e5;
    const d = Math.ceil((end - Date.now()) / 864e5);
    if(d > 0) return { tier:"trial", daysLeft:d };
  }
  return { tier:"free", daysLeft:0 };
}
const isPremium = ()=> tier.tier === "paid" || tier.tier === "trial";
const enabledPackCount = ()=> state.addons.filter(a => a.enabled).length;

/* ---------- storage / engine ---------- */
function save(){ marginSaveState(state); }
function rebuild(){ ENGINE = marginCompile(state); }
function selected(){ return state.addons.find(a => a.id === state.selectedId) || null; }
function packCount(a){ return Object.keys(a.replacements).length + a.removals.length; }
function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

/* free tier may only have MAX_FREE_PACKS enabled; on expiry, disable extras (never delete) */
function enforceCap(){
  if(isPremium()) return false;
  let on = 0, changed = false;
  for(const a of state.addons){
    if(a.enabled){ on++; if(on > MAX_FREE_PACKS){ a.enabled = false; changed = true; } }
  }
  return changed;
}
function tryToggle(addon, wantOn){
  if(wantOn && !isPremium() && enabledPackCount() >= MAX_FREE_PACKS) return false;
  addon.enabled = wantOn;
  return true;
}

/* ---------- element refs ---------- */
const input = document.getElementById("input");
const output = document.getElementById("output");
const sIn = document.getElementById("s-in"), sOut = document.getElementById("s-out"),
      sSaved = document.getElementById("s-saved"), sPct = document.getElementById("s-pct");
const manager = document.getElementById("manager");
const addonList = document.getElementById("addonList");
const activeCount = document.getElementById("activeCount");
const selName = document.getElementById("selName");
const selBadge = document.getElementById("selBadge");
const ruleList = document.getElementById("ruleList");
const forms = document.getElementById("forms");
const readonlyNote = document.getElementById("readonlyNote");
const newAddonName = document.getElementById("newAddonName");
const ruleTerm = document.getElementById("ruleTerm");
const ruleAbbr = document.getElementById("ruleAbbr");
const removeTerm = document.getElementById("removeTerm");
const tierBanner = document.getElementById("tierBanner");
const upgradeBtn = document.getElementById("upgradeBtn");

/* ---------- processing ---------- */
function process(){
  const raw = input.value;
  const out = ENGINE.run(raw);
  output.textContent = out;
  const a = raw.length, b = out.length, saved = Math.max(0, a - b);
  sIn.textContent = a; sOut.textContent = b; sSaved.textContent = saved;
  sPct.textContent = a ? Math.round(saved / a * 100) + "%" : "0%";
}
input.addEventListener("input", process);

function commit(rerender){
  save(); rebuild(); process();
  if(rerender){ renderAddons(); renderRules(); renderTier(); }
}

/* ---------- tier UI ---------- */
function renderTier(){
  upgradeBtn.hidden = (tier.tier === "paid");
  tierBanner.className = "tier-banner " + tier.tier;

  if(tier.tier === "paid"){
    tierBanner.textContent = "★ Premium active — unlimited dictionaries & right-click Abbreviate & Copy.";
  }else if(tier.tier === "trial"){
    tierBanner.textContent = "★ Trial — " + tier.daysLeft + " day" + (tier.daysLeft === 1 ? "" : "s") + " left of unlimited premium.";
  }else{
    const used = Math.min(enabledPackCount(), MAX_FREE_PACKS);
    if(tier.everTrialed){
      tierBanner.innerHTML = used + "/" + MAX_FREE_PACKS +
        " dictionaries active — <b>Upgrade for unlimited</b> + copy/paste anywhere.";
    }else{
      tierBanner.innerHTML =
        'Free tier — <b>start your 3-day premium trial</b> for unlimited dictionaries &amp; copy/paste anywhere. ' +
        '<button id="startTrialBtn" class="btn" style="margin-left:6px">Start trial</button>';
    }
  }
}
function applyTier(t){
  tier = t;
  if(enforceCap()){ save(); rebuild(); process(); }
  renderTier(); renderAddons(); renderRules();
}
function flashCapWarning(){
  tierBanner.classList.add("warn");
  tierBanner.innerHTML = "Free tier allows " + MAX_FREE_PACKS + " active dictionaries. <b>Upgrade for unlimited →</b>";
  setTimeout(()=>{ tierBanner.classList.remove("warn"); renderTier(); }, 2600);
  extpay.openPaymentPage();
}
upgradeBtn.addEventListener("click", ()=> extpay.openPaymentPage());

// Start-trial button is created dynamically inside the banner, so delegate.
document.addEventListener("click", (e)=>{
  if(e.target && e.target.id === "startTrialBtn"){
    extpay.openTrialPage("3 days");   // <-- trial length lives here; keep in sync with TRIAL_DAYS
  }
});

/* ---------- rendering ---------- */
function renderFooter(){
  let active = 0, on = 0;
  for(const a of state.addons){ if(a.enabled){ active += packCount(a); on++; } }
  document.getElementById("footRules").textContent = active;
  document.getElementById("footPacks").textContent = on;
}

function renderAddons(){
  let active = 0, on = 0;
  for(const a of state.addons){ if(a.enabled){ active += packCount(a); on++; } }
  activeCount.textContent = active + " rules · " + on + "/" + state.addons.length + " on";
  const capFull = !isPremium() && enabledPackCount() >= MAX_FREE_PACKS;

  addonList.innerHTML = state.addons.map(a=>{
    const sel = a.id === state.selectedId ? " sel" : "";
    const off = a.enabled ? "" : " off";
    const locked = (capFull && !a.enabled) ? " locked" : "";
    const del = a.builtin
      ? '<span class="lock" title="Built-in">🔒</span>'
      : '<button class="xbtn" type="button" data-action="del-addon" data-id="'+a.id+'" title="Delete" aria-label="Delete">×</button>';
    return '<div class="addon'+sel+off+locked+'" data-action="select" data-id="'+a.id+'">'+
      '<label class="switch">'+
        '<input type="checkbox" data-action="toggle" data-id="'+a.id+'"'+(a.enabled?" checked":"")+'>'+
        '<span class="track"></span>'+
      '</label>'+
      '<span class="meta"><span class="nm">'+escHtml(a.name)+'</span>'+
        '<span class="ct">'+Object.keys(a.replacements).length+' rules · '+a.removals.length+' strips</span></span>'+
      del +
    '</div>';
  }).join("");

  renderFooter();
}

function renderRules(){
  const A = selected();
  if(!A){
    selName.textContent = "No dictionary selected"; selBadge.textContent = "—"; selBadge.className = "pill";
    forms.classList.add("hidden"); readonlyNote.hidden = true;
    ruleList.innerHTML = '<div class="empty">Create a dictionary to add rules.</div>'; return;
  }
  selName.textContent = A.name;
  selBadge.textContent = A.enabled ? "Active" : "Off";
  selBadge.className = "pill" + (A.enabled ? " on" : "");

  const ro = A.builtin;
  forms.classList.toggle("hidden", ro);
  readonlyNote.hidden = !ro;

  const keys = Object.keys(A.replacements);
  let html = '<div class="group-head">Abbreviations ('+keys.length+')</div>';
  html += keys.length ? keys.map(k=>(
      '<div class="rule-row'+(ro?' ro':'')+'">'+
        '<span class="term" title="'+escHtml(k)+'">'+escHtml(k)+'</span>'+
        '<span class="to">→</span>'+
        '<span class="abbr" title="'+escHtml(A.replacements[k])+'">'+escHtml(A.replacements[k])+'</span>'+
        (ro?'':'<button class="xbtn" type="button" data-action="del-rule" data-key="'+escHtml(k)+'" title="Delete" aria-label="Delete">×</button>')+
      '</div>'
    )).join("") : '<div class="empty">No abbreviations yet.</div>';

  html += '<div class="group-head">Removals ('+A.removals.length+')</div>';
  html += A.removals.length ? A.removals.map(t=>(
      '<div class="rule-row removal'+(ro?' ro':'')+'">'+
        '<span class="term" title="'+escHtml(t)+'">'+escHtml(t)+'</span>'+
        '<span class="strip">stripped</span>'+
        (ro?'':'<button class="xbtn" type="button" data-action="del-removal" data-term="'+escHtml(t)+'" title="Delete" aria-label="Delete">×</button>')+
      '</div>'
    )).join("") : '<div class="empty">No removals yet.</div>';

  ruleList.innerHTML = html;
}

function syncFlags(){
  document.getElementById("flagCompress").checked = !!state.flags.compress;
  document.getElementById("flagProtect").checked  = !!state.flags.protect;
}

/* ---------- view switching ---------- */
function showView(name){
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
}
document.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", ()=> showView(el.dataset.view)));

/* ---------- manager events ---------- */
manager.addEventListener("change", (e)=>{
  const t = e.target;
  if(t.dataset.action === "toggle"){
    const a = state.addons.find(x => x.id === t.dataset.id);
    if(a){
      if(!tryToggle(a, t.checked)){ t.checked = false; flashCapWarning(); return; }
      commit(true);
    }
  }else if(t.dataset.action === "flag"){
    state.flags[t.dataset.flag] = t.checked; commit(false);
  }
});

manager.addEventListener("click", (e)=>{
  const el = e.target.closest("[data-action]");
  if(!el) return;
  const act = el.dataset.action;

  if(act === "select"){
    if(e.target.closest(".switch")) return;   // clicked the toggle, not the row → let it toggle
    state.selectedId = el.dataset.id; save(); renderAddons(); renderRules();
  }else if(act === "del-addon"){
    const a = state.addons.find(x => x.id === el.dataset.id);
    if(!a || a.builtin) return;
    if(packCount(a) > 0 && !confirm('Delete the "'+a.name+'" dictionary and its '+packCount(a)+' rules?')) return;
    state.addons = state.addons.filter(x => x.id !== a.id);
    if(state.selectedId === a.id){ const c = state.addons.find(x => !x.builtin) || state.addons[0]; state.selectedId = c ? c.id : null; }
    commit(true);
  }else if(act === "del-rule"){
    const a = selected(); if(!a || a.builtin) return;
    delete a.replacements[el.dataset.key]; commit(true);
  }else if(act === "del-removal"){
    const a = selected(); if(!a || a.builtin) return;
    a.removals = a.removals.filter(x => x !== el.dataset.term); commit(true);
  }else if(act === "create"){
    createAddon();
  }else if(act === "export"){
    exportDictionary(selected());
  }else if(act === "import"){
    document.getElementById("importFile").click();
  }else if(act === "add-rule"){
    addRule();
  }else if(act === "add-removal"){
    addRemoval();
  }else if(act === "reset"){
    if(confirm("Restore the default dictionaries? This removes your custom dictionaries and edits.")){
      state = marginFreshState(); enforceCap(); save(); syncFlags(); rebuild(); process();
      renderAddons(); renderRules(); renderTier();
    }
  }
});

function createAddon(){
  const name = newAddonName.value.trim();
  if(!name){ newAddonName.focus(); return; }
  const a = {
    id: marginUid(), name: name.slice(0, 40), builtin: false,
    enabled: isPremium() || enabledPackCount() < MAX_FREE_PACKS,  // auto-enable only if there's room
    replacements: {}, removals: []
  };
  state.addons.push(a); state.selectedId = a.id; newAddonName.value = "";
  commit(true); ruleTerm.focus();
}

function exportDictionary(a){
  if(!a){ return; }
  const data = { margin: 1, name: a.name, replacements: a.replacements, removals: a.removals };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = (a.name || "dictionary").replace(/[^\w\-]+/g, "_").toLowerCase() + ".margin.json";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

function importDictionaryFromFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    let data;
    try{ data = JSON.parse(reader.result); }
    catch(e){ alert("That file isn't valid JSON."); return; }
    const reps = (data && typeof data.replacements === "object" && data.replacements) ? data.replacements : null;
    const rems = (data && Array.isArray(data.removals)) ? data.removals : null;
    if(!reps && !rems){ alert("That doesn't look like a Margin dictionary."); return; }
    const clean = {};
    for(const k in (reps || {})){ if(typeof reps[k] === "string") clean[String(k).slice(0,80)] = reps[k].slice(0,80); }
    const cleanRem = (rems || []).filter(x => typeof x === "string").map(x => x.slice(0,80));
    const a = {
      id: marginUid(),
      name: (data && typeof data.name === "string" && data.name.trim()) ? data.name.trim().slice(0,40) : "Imported dictionary",
      builtin: false,
      enabled: isPremium() || enabledPackCount() < MAX_FREE_PACKS,
      replacements: clean,
      removals: cleanRem
    };
    state.addons.push(a);
    state.selectedId = a.id;
    commit(true);
  };
  reader.readAsText(file);
}

document.getElementById("importFile").addEventListener("change", (e)=>{
  const f = e.target.files && e.target.files[0];
  if(f) importDictionaryFromFile(f);
  e.target.value = "";   // let the same file be re-imported later
});

function addRule(){
  const a = selected();
  if(!a || a.builtin) return;
  const term = ruleTerm.value.trim();
  const abbr = ruleAbbr.value;
  if(!term){ ruleTerm.focus(); return; }
  const low = term.toLowerCase();
  for(const k of Object.keys(a.replacements)){ if(k.toLowerCase() === low) delete a.replacements[k]; }
  a.replacements[term] = abbr;
  ruleTerm.value = ""; ruleAbbr.value = "";
  commit(true); ruleTerm.focus();
}
function addRemoval(){
  const a = selected();
  if(!a || a.builtin) return;
  const term = removeTerm.value.trim();
  if(!term){ removeTerm.focus(); return; }
  const low = term.toLowerCase();
  if(!a.removals.some(x => x.toLowerCase() === low)) a.removals.push(term);
  removeTerm.value = ""; commit(true); removeTerm.focus();
}

newAddonName.addEventListener("keydown", e=>{ if(e.key === "Enter"){ e.preventDefault(); createAddon(); }});
ruleTerm.addEventListener("keydown",   e=>{ if(e.key === "Enter"){ e.preventDefault(); ruleAbbr.focus(); }});
ruleAbbr.addEventListener("keydown",   e=>{ if(e.key === "Enter"){ e.preventDefault(); addRule(); }});
removeTerm.addEventListener("keydown", e=>{ if(e.key === "Enter"){ e.preventDefault(); addRemoval(); }});

/* copy */
const copyBtn = document.getElementById("copy");
copyBtn.addEventListener("click", async ()=>{
  const text = output.textContent;
  if(!text) return;
  try{ await navigator.clipboard.writeText(text); copyBtn.textContent = "Copied ✓"; }
  catch(e){ copyBtn.textContent = "Copy"; }
  setTimeout(()=> copyBtn.textContent = "Copy", 1200);
});

/* ---------- boot ---------- */
(async function init(){
  state = await marginLoadState();
  syncFlags(); rebuild(); renderAddons(); renderRules(); renderTier(); process();

  // Resolve real license state. No tab is opened automatically anymore —
  // the trial only starts when the user clicks "Start trial".
  extpay.getUser()
    .then(user => applyTier(tierFromUser(user)))
    .catch(() => applyTier(tierFromUser(null)));

  extpay.onPaid.addListener(user => applyTier(tierFromUser(user)));
})();