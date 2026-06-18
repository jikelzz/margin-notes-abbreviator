"use strict";
importScripts("ExtPay.js", "engine.js");

/* ===== DEV OVERRIDE: true | false to force premium state, or null for real ExtPay. DELETE before shipping. ===== */
const DEV_PREMIUM = null;

const extpay = ExtPay("my-shorthand-extension");
extpay.startBackground();

const MENU_ID = "margin-abbreviate-copy";
const TRIAL_DAYS = 3;

function premiumFromUser(user){
  if(user && user.paid) return true;
  if(user && user.trialStartedAt){
    const end = new Date(user.trialStartedAt).getTime() + TRIAL_DAYS * 864e5;
    if(Date.now() < end) return true;
  }
  return false;
}
async function isPremium(){
  if(DEV_PREMIUM !== null) return DEV_PREMIUM;
  try{ return premiumFromUser(await extpay.getUser()); }catch(e){ return false; }
}

async function refreshMenu(){
  await chrome.contextMenus.removeAll();
  if(await isPremium()){
    chrome.contextMenus.create({ id: MENU_ID, title: "Abbreviate & Copy", contexts: ["selection"] });
  }
}
chrome.runtime.onInstalled.addListener(refreshMenu);
chrome.runtime.onStartup.addListener(refreshMenu);
extpay.onPaid.addListener(refreshMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab)=>{
  if(info.menuItemId !== MENU_ID || !info.selectionText) return;
  if(!(await isPremium())) return;                       // gate again (graceful degradation)

  const state = await marginLoadState();                 // stateless: fresh read every click
  const shorthand = marginCompile(state).run(info.selectionText);
  if(!shorthand || !tab || tab.id == null) return;

  try{
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: copyToClipboard, args: [shorthand] });
    flashBadge("\u2713");
  }catch(e){
    flashBadge("\u2715");                                 // chrome://, web store, PDF viewer, etc.
  }
});

/* injected into the page on the user gesture; runs in the page DOM */
function copyToClipboard(text){
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok = false; try{ ok = document.execCommand("copy"); }catch(e){}
  document.body.removeChild(ta);
  if(!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{});
}
function flashBadge(mark){
  chrome.action.setBadgeBackgroundColor({ color: "#b9d000" });
  chrome.action.setBadgeText({ text: mark });
  setTimeout(()=> chrome.action.setBadgeText({ text: "" }), 1200);
}