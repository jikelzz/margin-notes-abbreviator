"use strict";
/* Shared dictionary + abbreviation engine. Loaded in the popup via <script src>
   and in the service worker via importScripts(). Pure JS, no DOM. */

const MARGIN_KEY = "margin.packs.v1";             // legacy single key (one-time migration only)
const MARGIN_META_KEY = "margin.packs.meta";      // sync: chunk metadata
const MARGIN_SYNC_PREFIX = "margin.packs.chunk."; // sync: chunk key prefix
const CHUNK_SIZE = 4000;                           // bytes per chunk (< 8192 sync per-item limit)
const VOWELS = /[aeiou]/gi;
const ALLCAPS = /^[A-Z]{2,}$/;

const PROTECT = new Set([
  "TCP","UDP","IP","ICMP","IGMP","ARP","RARP","OSPF","BGP","RIP","EIGRP","VLAN","VXLAN","CIDR","VLSM","NAT","PAT",
  "VPN","ACL","QOS","MTU","MAC","STP","RSTP","LACP","LAG","POE","SSID","BSSID","WPA","WEP","AES","DES","RSA","SHA",
  "SSL","TLS","SDN","WAN","LAN","WLAN","MAN","PAN","SAN","MPLS","GRE","IPSEC","PPP","PPTP","L2TP","SFTP","SSH",
  "RADIUS","TACACS","DNS","DHCP","HTTP","HTTPS","FTP","TFTP","SMTP","SNMP","LDAP","LDAPS","RDP","NTP","SIP","SMB",
  "NIC","OSI","TTL","DOS","DDOS","MITM","DMZ","POP","IMAP","WAP","AP","LB","FW","SW","UTP","VRRP","HSRP","FHRP",
  "CSMA","CDMA","TDMA","SFP","QSFP","BNC","CRC","FCS","PDU","WLC","IDS","IPS","VOIP","NTLM","CHAP","PAP"
]);

/* Built-in (read-only) packs seeded on first run. */
const DEFAULT_ADDONS = [
  {
    id:"academic", name:"Academic & General", builtin:true, enabled:true, removals:[],
    replacements:{
      "as soon as possible":"asap","on the other hand":"OTOH","with respect to":"wrt","gives rise to":"→",
      "in my opinion":"imo","in order to":"to","is equal to":"=","are equal to":"=","for example":"e.g.",
      "for instance":"e.g.","in terms of":"re","resulting in":"→","resulted in":"→","by the way":"btw",
      "greater than":">","fewer than":"<","as well as":"+","results in":"→","result in":"→","amounts to":"=",
      "amount to":"=","leading to":"→","more than":">","less than":"<","equal to":"=","such that":"s.t.",
      "such as":"e.g.","leads to":"→","lead to":"→","that is":"i.e.","due to":"→","led to":"→","at least":"≥","at most":"≤",
      because:"b/c", with:"w/", without:"w/o", within:"w/in", against:"vs", versus:"vs",
      therefore:"∴", thus:"∴", hence:"∴", and:"+", plus:"+", amount:"amt", amounts:"amt",
      approximately:"approx", about:"re", regarding:"re", between:"btwn", through:"thru", throughout:"thruout",
      example:"ex", examples:"ex", include:"incl", includes:"incl", including:"incl", additional:"add'l",
      continue:"cont", continued:"cont",
      increase:"↑", increases:"↑", increased:"↑", increasing:"↑", rise:"↑", rising:"↑", grow:"↑", growth:"↑",
      decrease:"↓", decreases:"↓", decreased:"↓", decreasing:"↓", fall:"↓", falling:"↓", drop:"↓",
      reduce:"↓", reduces:"↓", reduced:"↓",
      cause:"→", causes:"→", caused:"→", produces:"→",
      equals:"=", equal:"=", is:"=", equivalent:"=",
      change:"Δ", changes:"Δ", changed:"Δ", changing:"Δ", difference:"Δ", different:"Δ",
      government:"gov", governments:"gov", information:"info", department:"dept", departments:"dept",
      environment:"env", environmental:"env", history:"hist", historical:"hist", language:"lang", languages:"lang",
      science:"sci", scientific:"sci", technology:"tech", technological:"tech", business:"biz", businesses:"biz",
      management:"mgmt", manage:"mgmt", manager:"mgr", organization:"org", organizations:"org", education:"edu",
      economy:"econ", economic:"econ", economics:"econ", political:"pol", politics:"pol", society:"soc",
      social:"soc", population:"pop", development:"dev", develop:"dev", developed:"dev", developing:"dev",
      research:"rsch", university:"univ", professor:"prof", question:"Q", questions:"Q", answer:"ans", answers:"ans",
      problem:"prob", problems:"prob", solution:"soln", function:"fxn", functions:"fxn", equation:"eqn",
      definition:"def", define:"def", important:"impt", necessary:"nec", available:"avail",
      application:"app", applications:"app", communication:"comm", international:"intl", national:"natl",
      individual:"indiv", especially:"esp",
      minute:"min", minutes:"min", hour:"hr", hours:"hr", day:"d", days:"d", week:"wk", weeks:"wk",
      month:"mo", months:"mo", year:"yr", years:"yr", people:"ppl", person:"ppl", before:"b4", after:"aft",
      homework:"hw", today:"2day", tomorrow:"tmrw", weekend:"wknd", number:"#", numbers:"#", percent:"%",
      maximum:"max", minimum:"min", average:"avg", second:"sec", seconds:"sec", you:"u", your:"ur"
    }
  },
  {
    id:"netplus", name:"CompTIA Network+", builtin:true, enabled:true, removals:[],
    replacements:{
      "physical layer":"L1","data link layer":"L2","network layer":"L3","transport layer":"L4",
      "session layer":"L5","presentation layer":"L6","application layer":"L7",
      "layer 1":"L1","layer 2":"L2","layer 3":"L3","layer 4":"L4","layer 5":"L5","layer 6":"L6","layer 7":"L7",
      "layer 2 switch":"L2 [SW]","layer 3 switch":"L3 [SW]",
      "transmission control protocol":"TCP","user datagram protocol":"UDP","internet protocol security":"IPsec",
      "internet protocol":"IP","internet control message protocol":"ICMP","address resolution protocol":"ARP",
      "reverse address resolution protocol":"RARP","dynamic host configuration protocol":"DHCP [67/68]",
      "domain name system":"DNS [53]","hypertext transfer protocol secure":"HTTPS [443]",
      "hypertext transfer protocol":"HTTP [80]","file transfer protocol":"FTP [20/21]","secure shell":"SSH [22]",
      "simple mail transfer protocol":"SMTP [25]","simple network management protocol":"SNMP [161/162]",
      "network time protocol":"NTP [123]","remote desktop protocol":"RDP [3389]",
      "lightweight directory access protocol":"LDAP [389]","session initiation protocol":"SIP [5060/5061]",
      "network address translation":"NAT","port address translation":"PAT","virtual local area network":"VLAN",
      "virtual private network":"VPN","wireless local area network":"WLAN","local area network":"LAN",
      "wide area network":"WAN","metropolitan area network":"MAN","personal area network":"PAN",
      "storage area network":"SAN","software defined networking":"SDN","quality of service":"QoS",
      "access control list":"ACL","maximum transmission unit":"MTU","rapid spanning tree protocol":"RSTP",
      "spanning tree protocol":"STP","link aggregation control protocol":"LACP","power over ethernet":"PoE",
      "basic service set identifier":"BSSID","service set identifier":"SSID","network interface card":"NIC",
      "media access control":"MAC","open shortest path first":"OSPF","border gateway protocol":"BGP",
      "routing information protocol":"RIP","enhanced interior gateway routing protocol":"EIGRP",
      "carrier sense multiple access":"CSMA","classless inter-domain routing":"CIDR",
      "variable length subnet mask":"VLSM","time to live":"TTL","distributed denial of service":"DDoS",
      "denial of service":"DoS","man in the middle":"MITM","point to point tunneling protocol":"PPTP [1723]",
      "point to point protocol":"PPP","generic routing encapsulation":"GRE","wireless access point":"WAP",
      "access point":"AP","load balancer":"LB","default gateway":"GW","collision domain":"coll dom",
      "broadcast domain":"B-cast dom","subnet mask":"netmask",
      "unshielded twisted pair":"UTP","shielded twisted pair":"STP","twisted pair":"TP","fiber optic":"Fiber",
      "fibre optic":"Fiber","half duplex":"HDX","half-duplex":"HDX","full duplex":"FDX","full-duplex":"FDX",
      "a record":"A-rec","aaaa record":"AAAA-rec","cname record":"CNAME","mx record":"MX","ptr record":"PTR",
      "txt record":"TXT","ns record":"NS","srv record":"SRV","soa record":"SOA",
      "three way handshake":"3-way HS","three-way handshake":"3-way HS","ip address":"IP addr",
      "mac address":"MAC addr","pop3":"POP3 [110]","l2tp":"L2TP [1701]",
      ssh:"SSH [22]", http:"HTTP [80]", https:"HTTPS [443]", dns:"DNS [53]", dhcp:"DHCP [67/68]",
      ftp:"FTP [20/21]", sftp:"SFTP [22]", tftp:"TFTP [69]", telnet:"Telnet [23]", smtp:"SMTP [25]",
      imap:"IMAP [143]", snmp:"SNMP [161/162]", ldap:"LDAP [389]", ldaps:"LDAPS [636]", rdp:"RDP [3389]",
      ntp:"NTP [123]", sip:"SIP [5060/5061]", smb:"SMB [445]", syslog:"Syslog [514]", kerberos:"Kerberos [88]",
      mysql:"MySQL [3306]", netbios:"NetBIOS [137/139]", pptp:"PPTP [1723]",
      router:"[R]", routers:"[R]", switch:"[SW]", switches:"[SW]", firewall:"[FW]", firewalls:"[FW]",
      server:"srv", servers:"srv", client:"clnt", clients:"clnt", gateway:"GW", gateways:"GW",
      modem:"modem", repeater:"rptr", repeaters:"rptr", bridge:"brdg", bridges:"brdg", hub:"hub", proxy:"proxy",
      ethernet:"Eth", wireless:"wrls", coaxial:"coax", fiber:"Fiber", fibre:"Fiber", antenna:"ant", antennas:"ant",
      transceiver:"xcvr", controller:"ctrlr", access:"acc", control:"ctrl", controls:"ctrl",
      broadcast:"B-cast", broadcasts:"B-cast", broadcasting:"B-cast", multicast:"M-cast", multicasts:"M-cast",
      unicast:"U-cast", anycast:"A-cast", authentication:"Auth", authenticate:"Auth", authenticated:"Auth",
      authorization:"AuthZ", encryption:"Encr", encrypt:"Encr", encrypted:"Encr", encrypting:"Encr",
      decryption:"Decr", vulnerability:"Vuln", vulnerabilities:"Vuln", vulnerable:"Vuln",
      address:"Addr", addresses:"Addr", addressing:"Addr", protocol:"proto", protocols:"proto",
      network:"net", networks:"net", networking:"net", segment:"seg", segments:"seg", segmentation:"seg",
      packet:"pkt", packets:"pkt", header:"hdr", headers:"hdr", frame:"frame", latency:"lat", bandwidth:"BW",
      throughput:"thrpt", subnet:"subnet", subnets:"subnet", subnetting:"subnet", interface:"intf",
      interfaces:"intf", topology:"topo", topologies:"topo", redundancy:"redun", availability:"avail",
      confidentiality:"confid", integrity:"integ", mitigation:"mitig", threat:"thrt", exploit:"explt",
      malware:"malw", physical:"phys", presentation:"pres", configuration:"config", configure:"config",
      configured:"config", virtual:"virt", routing:"rtng", routed:"rtd", switching:"swtchg", forwarding:"fwd",
      forward:"fwd", forwards:"fwd", inspect:"insp", inspects:"insp", duplex:"dplx", internet:"inet",
      intranet:"intra", traffic:"trfc", session:"sess", request:"req", requests:"req", response:"resp",
      responses:"resp", source:"src", destination:"dst", command:"cmd", performance:"perf", reliability:"relb",
      monitoring:"mon", monitor:"mon",
      vlan:"VLAN", vpn:"VPN", nat:"NAT", arp:"ARP", acl:"ACL", ospf:"OSPF", bgp:"BGP", lan:"LAN", wan:"WAN",
      mac:"MAC", radius:"RADIUS", tacacs:"TACACS"
    }
  },
  {
    id:"filler", name:"Filler & Articles", builtin:true, enabled:true, replacements:{},
    removals:["the","a","an","very","really","basically","actually","simply"]
  }
];

function marginUid(){ return "p" + Math.random().toString(36).slice(2,9); }

function marginFreshState(){
  const addons = JSON.parse(JSON.stringify(DEFAULT_ADDONS));
  const custom = { id:marginUid(), name:"My Shorthand", builtin:false, enabled:true, replacements:{}, removals:[] };
  addons.push(custom);
  return { addons, selectedId:custom.id, flags:{compress:true, protect:true} };
}

function marginNormalize(raw){
  if(!raw || !Array.isArray(raw.addons) || !raw.addons.length) return marginFreshState();
  raw.flags = raw.flags || {};
  if(typeof raw.flags.compress !== "boolean") raw.flags.compress = true;
  if(typeof raw.flags.protect  !== "boolean") raw.flags.protect  = true;
  raw.addons.forEach(a=>{
    a.replacements = a.replacements || {};
    a.removals = a.removals || [];
    a.enabled = a.enabled !== false;
    a.builtin = !!a.builtin;
  });
  if(!raw.selectedId || !raw.addons.some(a=>a.id===raw.selectedId)) raw.selectedId = raw.addons[0].id;
  return raw;
}

function marginEsc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function marginCompress(w){ return w[0] + w.slice(1).replace(VOWELS, ""); }

/* Re-apply the casing of the matched source onto the abbreviation.
   ALL-CAPS  -> ALL-CAPS  (BECAUSE -> B/C)
   Capitalized -> Capitalized (Because -> B/c)
   lowercase -> unchanged  (because -> b/c) */
function marginMatchCase(src, dst){
  if(!dst) return dst;
  const letters = src.replace(/[^A-Za-z]/g, "");
  if(letters.length > 1 && letters === letters.toUpperCase()) return dst.toUpperCase();
  if(/^[A-Z]/.test(src)) return dst.charAt(0).toUpperCase() + dst.slice(1);
  return dst;
}

/* Compile enabled packs into a runnable engine. */
function marginCompile(state){
  const replMap = new Map();
  const removeSet = new Set();
  for(const a of state.addons){
    if(!a.enabled) continue;
    for(const k in a.replacements) replMap.set(k.toLowerCase(), a.replacements[k]);
    for(const r of a.removals) removeSet.add(String(r).toLowerCase());
  }
  const phraseList = [];
  const wordMap = new Map();
  replMap.forEach((abbr, low)=>{
    if(/\s/.test(low) || /[^a-z]/.test(low)){
      phraseList.push({ len:low.length, re:new RegExp("\\b"+marginEsc(low)+"\\b","gi"), out:abbr });
    }else{
      wordMap.set(low, abbr);
    }
  });
  removeSet.forEach(r=>{
    if(/\s/.test(r)) phraseList.push({ len:r.length, re:new RegExp("\\b"+marginEsc(r)+"\\b\\s*","gi"), out:"" });
  });
  phraseList.sort((a,b)=> b.len - a.len);
  const flags = { compress:!!state.flags.compress, protect:!!state.flags.protect };

  return {
    rules: replMap.size + removeSet.size,
	run(text){
		  if(!text) return "";
		  let s = text;
		  for(const p of phraseList){
			s = s.replace(p.re, (m)=> p.out === "" ? "" : marginMatchCase(m, p.out));
		  }
		  s = s.replace(/[A-Za-z]+/g, (w)=>{
			const low = w.toLowerCase();
			if(removeSet.has(low)) return "";
			if(wordMap.has(low)) return marginMatchCase(w, wordMap.get(low));
			if(flags.protect){
			  if(PROTECT.has(w.toUpperCase())) return w;
			  if(ALLCAPS.test(w)) return w;
			}
			if(flags.compress && w.length >= 6) return marginCompress(w);
			return w;
		  });
		  return s.replace(/[ \t]{2,}/g," ")
				  .replace(/^[ \t]+/gm,"")
				  .replace(/[ \t]+$/gm,"")
				  .replace(/[ \t]+([,.;:!?])/g,"$1");
		}
  };
}

/* Count user-created abbreviations (kept for reference; cap is now per active pack). */
function marginCustomAbbrCount(state){
  let n = 0;
  for(const a of state.addons){ if(!a.builtin) n += Object.keys(a.replacements).length; }
  return n;
}

/* ---- chrome.storage.sync with chunking (dodges the 8KB-per-item quota) ---- */
function marginSaveState(state){
  const json = JSON.stringify(state);
  const chunks = [];
  for(let i = 0; i < json.length; i += CHUNK_SIZE) chunks.push(json.slice(i, i + CHUNK_SIZE));
  const payload = { [MARGIN_META_KEY]: { count: chunks.length, v: 1 } };
  chunks.forEach((c, i)=> payload[MARGIN_SYNC_PREFIX + i] = c);

  return new Promise((resolve)=>{
    const sync = chrome.storage && chrome.storage.sync;
    const writeTo = (api, done)=>{
      api.get(null, (all)=>{
        const stale = Object.keys(all || {}).filter(k => k.startsWith(MARGIN_SYNC_PREFIX));
        api.remove(stale, ()=> api.set(payload, ()=>{
          if(chrome.runtime.lastError){ done(false); } else { done(true); }
        }));
      });
    };
    if(sync){
      writeTo(chrome.storage.sync, (ok)=>{
        if(ok) return resolve(true);
        // sync rejected (quota/offline) → persist locally so nothing is lost
        writeTo(chrome.storage.local, ()=> resolve(true));
      });
    }else{
      writeTo(chrome.storage.local, ()=> resolve(true));
    }
  });
}

function marginLoadState(){
  return new Promise((resolve)=>{
    const api = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
    api.get(null, (all)=>{
      all = all || {};
      const meta = all[MARGIN_META_KEY];
      if(meta && meta.count){
        let json = "";
        for(let i = 0; i < meta.count; i++) json += (all[MARGIN_SYNC_PREFIX + i] || "");
        try{ return resolve(marginNormalize(JSON.parse(json))); }catch(e){ /* fall through */ }
      }
      // one-time migration from the old local single-key build, else seed defaults
      chrome.storage.local.get(MARGIN_KEY, (loc)=>{
        const old = loc && loc[MARGIN_KEY];
        const st = (old && Array.isArray(old.addons) && old.addons.length)
          ? marginNormalize(old)
          : marginFreshState();
        marginSaveState(st).then(()=> resolve(st));
      });
    });
  });
}