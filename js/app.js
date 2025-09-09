// ---------- Elements ----------
const $ = (s) => document.querySelector(s);
const mount = $("#mount");
const q = $("#q");
const bodySel = $("#body");
const levelSel = $("#level");     // Level filter
const regionSel = $("#region");   // State/UT filter (for State/Local)
const localTypeSel = $("#localType"); // OPTIONAL: Local type filter (if present)
const windowSel = $("#window");
const updated = $("#updated");
const toggleAdminBtn = $("#toggleAdmin");
const addBodyBtn = $("#addBody");
const addExamBtn = $("#addExam"); // NEW: top-bar Add Exam
const editDlg = $("#editDlg");
const editForm = $("#editForm");
const exportCsvBtn = $("#exportCsv");
const exportJsonBtn = $("#exportJson");
const importJsonInp = $("#importJson");

// ---------- Admin & Storage ----------
const ADMIN = { enabled: false };
const LSK_USER_ITEMS = "recruit_bodywise_userItems_v3";
const LSK_USER_BODIES = "recruit_bodywise_userBodies_v1";
const LSK_OVERRIDES   = "recruit_bodywise_overrides_v2";
const LSK_DELETIONS   = "recruit_bodywise_deletions_v1";

const getJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch { return d; } };
const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const getUserItems = () => getJSON(LSK_USER_ITEMS, []);
const setUserItems = (v) => setJSON(LSK_USER_ITEMS, v);
const getUserBodies = () => getJSON(LSK_USER_BODIES, []);
const setUserBodies = (v) => setJSON(LSK_USER_BODIES, v);
const getOverrides  = () => getJSON(LSK_OVERRIDES, {});
const setOverrides  = (v) => setJSON(LSK_OVERRIDES, v);
const getDeletions  = () => getJSON(LSK_DELETIONS, []);
const setDeletions  = (v) => setJSON(LSK_DELETIONS, v);

// ---------- Official allowlist ----------
const allowedHosts = new Set([
  "ssc.gov.in","upsc.gov.in","ibps.in","rrbcdg.gov.in",
  "mpsc.gov.in","bpsc.bih.nic.in","tnpsc.gov.in","psc.nic.in",
  "ppsc.gov.in","hpsc.gov.in","gpsc.gujarat.gov.in","kpsc.kar.nic.in",
  "rpsc.rajasthan.gov.in","tspsc.gov.in","wbpsc.gov.in",
  "jkpsc.nic.in","opsc.gov.in","uppsc.up.nic.in","jpsc.gov.in",
  // Local bodies examples:
  "portal.mcgm.gov.in",           // BMC
  "punezp.mkcl.org"               // Pune Zilla Parishad portal
]);

// ---------- Data ----------
let STATIC = [];
async function loadStatic(){
  try{
    const res = await fetch("./data/exams.json", { cache: "no-store" });
    STATIC = await res.json();
  } catch { STATIC = []; }
}

// Fallback inference for legacy records without level/region
const STATE_MAP = {
  "MPSC":"Maharashtra","BPSC":"Bihar","TNPSC":"Tamil Nadu","RPSC":"Rajasthan","GPSC":"Gujarat",
  "KPSC":"Karnataka","WBPSC":"West Bengal","OPSC":"Odisha","JKPSC":"Jammu & Kashmir",
  "HPSC":"Haryana","PPSC":"Punjab","JPSC":"Jharkhand","TSPSC":"Telangana","UPPSC":"Uttar Pradesh"
};
function inferLevel(body){
  if(!body) return "central";
  const b = body.toUpperCase();
  if(["SSC","UPSC","IBPS","RRB"].includes(b)) return "central";
  if(STATE_MAP[b]) return "state";
  return "local"; // unknown bodies default to local (can edit in UI)
}
function inferRegion(body){
  const b = (body||"").toUpperCase();
  return STATE_MAP[b] || "";
}

// apply overrides/deletions to shipped items
function normalizedStatic(){
  const ov = getOverrides(), del = new Set(getDeletions());
  return STATIC
    .filter(x => !del.has(x.id))
    .map(x => ov[x.id] ? { ...x, ...ov[x.id], id:x.id } : x);
}
function normalizeItems(){ return [...normalizedStatic(), ...getUserItems()]; }
function uniqueBodiesAcrossAll(){
  const fromItems = [...new Set(normalizeItems().map(x=>x.body))];
  const customs = getUserBodies();
  return [...new Set([...fromItems, ...customs])].sort((a,b)=>a.localeCompare(b));
}
function uniqueRegions(items){
  const r = new Set();
  items.forEach(x=>{
    const lvl = (x.level || inferLevel(x.body));
    if(lvl === "state" || lvl === "local"){
      const region = (x.region || inferRegion(x.body) || "").trim();
      if(region) r.add(region);
    }
  });
  return [...r].sort((a,b)=>a.localeCompare(b));
}

// ---------- date helpers (Rotation-compatible) ----------
function labelWindow(w){
  if(!w||!w.type) return "TBD";
  switch(w.type){
    case "date": return new Date(w.date+"T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"2-digit"});
    case "month": { const [y,m]=w.month.split("-").map(Number); return new Date(y, m-1, 1).toLocaleDateString(undefined,{year:"numeric",month:"long"}); }
    case "quarter": return `${w.q} ${w.year}`;
    case "half": return `${w.half} ${w.year}`;
    default: return "TBD";
  }
}
function sortKey(w){
  if(!w) return 9e12;
  if(w.type==="date") return +new Date(w.date+"T00:00:00");
  if(w.type==="month"){ const [y,m]=w.month.split("-").map(Number); return +new Date(y, m-1, 1); }
  if(w.type==="quarter"){ const qmap={Q1:0,Q2:3,Q3:6,Q4:9}; return +new Date(w.year, qmap[w.q]??0, 1); }
  if(w.type==="half"){ const hmap={H1:0,H2:6}; return +new Date(w.year, hmap[w.half]??0, 1); }
  return 9e12;
}
function bodiesFrom(list){
  return [...new Set(list.map(x => x.body))].sort((a,b)=>a.localeCompare(b));
}
// Rotation helpers (kept compact)
function approxDateFromWindow(w){
  if(!w) return null;
  if(w.type==="date") return new Date(w.date+"T09:00:00");
  if(w.type==="month"){ const [y,m]=w.month.split("-").map(Number); return new Date(y, m-1, 1, 9); }
  if(w.type==="quarter"){ const qmap={Q1:0,Q2:3,Q3:6,Q4:9}; return new Date(w.year, qmap[w.q]??0, 1, 9); }
  if(w.type==="half"){ const hmap={H1:0,H2:6}; return new Date(w.year, hmap[w.half]??0, 1, 9); }
  return null;
}
function parseHistoryDate(s){
  const t = String(s||"").trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(t+"T09:00:00");
  if(/^\d{4}-\d{2}$/.test(t)){ const [y,m]=t.split("-").map(Number); return new Date(y, m-1, 1, 9); }
  if(/^\d{4}$/.test(t)) return new Date(Number(t), 0, 1, 9);
  return null;
}
function historyDates(item){
  const arr = Array.isArray(item.history) ? item.history : [];
  return arr.map(parseHistoryDate).filter(d=>d && isFinite(+d)).sort((a,b)=>a-b);
}
function yearsBetween(a,b){ return Math.abs(+b - +a) / (365.25*24*3600*1000); }
function fmtYears(y){ if(!isFinite(y)) return "—"; return y<1 ? `${Math.round(y*12)} mo` : `${(Math.round(y*10)/10).toFixed(1)} y`; }
function rotationInfo(item){
  const next = approxDateFromWindow(item.window);
  if(!next) return {gap:null, avg:null, last:null, next:null};
  const hist = historyDates(item);
  if(!hist.length) return {gap:null, avg:null, last:null, next};
  const last = hist.filter(d => d <= next).slice(-1)[0] || hist.slice(-1)[0];
  const gap = yearsBetween(last, next);
  let avg = null;
  if(hist.length>=2){
    const diffs = []; for(let i=1;i<hist.length;i++) diffs.push(yearsBetween(hist[i-1], hist[i]));
    avg = diffs.reduce((a,b)=>a+b,0)/diffs.length;
  }
  return {gap, avg, last, next};
}

// ---------- misc ----------
function hostFrom(url){ try { return new URL(url).host.toLowerCase(); } catch { return ""; } }
function isOfficial(url){
  const h = hostFrom(url);
  return h.endsWith(".gov.in") || h.endsWith(".nic.in") || allowedHosts.has(h);
}
function makeICS(item){
  const s = sortKey(item.window);
  const d = isFinite(s)? new Date(s) : new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(item.window?.type==="date" ? new Date(item.window.date).getDate() : 1).padStart(2,"0");
  const start = `${y}${m}${day}T090000`, end = `${y}${m}${day}T100000`;
  const summary = `${item.body}: ${item.exam} (${item.cycle||""}) — Tentative Notification`;
  const desc = `Tentative notification window: ${labelWindow(item.window)}. Verify on official site: ${item.official}`;
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Recruit Bodywise//EN","BEGIN:VEVENT",
    `UID:${item.id}@recruit-bodywise.local`,`DTSTAMP:${start}`,`DTSTART:${start}`,`DTEND:${end}`,
    `SUMMARY:${summary}`,`DESCRIPTION:${desc.replace(/\n/g," ")}`, "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  return URL.createObjectURL(new Blob([ics], {type:"text/calendar"}));
}
function toCSV(rows){
  const esc = s => `"${String(s??"").replace(/"/g,'""')}"`;
  const head = ["Body","Level","State/UT","Exam","Cycle","Rotation (next gap)","Avg rotation","Window","Official","Notes"];
  const lines = [head.map(esc).join(",")];
  rows.forEach(r=>{
    const lvl = r.level || inferLevel(r.body);
    const reg = r.region || (lvl!=="central" ? inferRegion(r.body) : "");
    const rot = rotationInfo(r);
    lines.push([r.body,lvl,reg||"",r.exam,r.cycle||"",fmtYears(rot.gap),fmtYears(rot.avg),labelWindow(r.window),r.official||"",r.notes||""].map(esc).join(","));
  });
  return lines.join("\r\n");
}

// ---------- Rendering ----------
const currentFilters = { body: "__all__", level: "__all__", region: "__all__", localType: "__all__" };

function applyFilters(list){
  return list.filter(x=>{
    if(windowSel.value!=="__all__" && (x.window?.type||"tbd")!==windowSel.value) return false;
    if(bodySel.value!=="__all__" && x.body!==bodySel.value) return false;

    const lvl = (x.level || inferLevel(x.body));
    if(levelSel.value!=="__all__" && lvl !== levelSel.value) return false;

    if(regionSel.value!=="__all__"){
      const reg = (x.region || inferRegion(x.body) || "").toLowerCase();
      if(!reg || reg !== regionSel.value.toLowerCase()) return false;
    }

    // optional Local Type filter
    if(levelSel.value === "local" && localTypeSel && currentFilters.localType !== "__all__"){
      const orgt = (x.orgtype || "other");
      if(orgt !== currentFilters.localType) return false;
    }

    const s = `${x.body} ${x.exam} ${x.cycle||""} ${x.notes||""}`.toLowerCase();
    return s.includes(q.value.trim().toLowerCase());
  });
}

function render(){
  // Apply ALL filters
  const items = applyFilters(normalizeItems())
    .sort((a,b)=> sortKey(a.window)-sortKey(b.window) || a.body.localeCompare(b.body) || a.exam.localeCompare(b.exam));

  // Build Body options from the FILTERED items only
  const bodies = bodiesFrom(items);

  // Regions list also built from FILTERED items
  const regions = uniqueRegions(items);
  if(regionSel){
    regionSel.innerHTML = `<option value="__all__">All States/UT</option>` + regions.map(r=>`<option value="${r}">${r}</option>`).join("");
    if(currentFilters.region !== "__all__" && !regions.includes(currentFilters.region)){
      currentFilters.region = "__all__"; regionSel.value = "__all__";
    }
    regionSel.style.display = (levelSel.value === "state" || levelSel.value === "local") ? "" : "none";
  }

  // If the current Body is not in the filtered set, reset to All
  bodySel.innerHTML = `<option value="__all__">All bodies</option>` + bodies.map(b=>`<option value="${b}">${b}</option>`).join("");
  if(!bodies.includes(currentFilters.body)){
    currentFilters.body = "__all__"; bodySel.value = "__all__";
  } else {
    bodySel.value = currentFilters.body;
  }

  // Nothing matches? Empty state
  if(!items.length){
    mount.innerHTML = `<div class="empty">No results for the current filters. Try changing Level/State/Body.</div>`;
    return;
  }

  // Group by body (only filtered items exist here)
  const groups = {};
  items.forEach(it => { (groups[it.body] ||= []).push(it); });

  // Render ONLY bodies with items
  const frag = document.createDocumentFragment();
  const overrides = getOverrides();

  Object.keys(groups).sort((a,b)=>a.localeCompare(b)).forEach(groupName=>{
    const section = document.createElement("section");
    section.className = "group";
    const count = groups[groupName].length;
    const title = document.createElement("h2");
    title.innerHTML = `<span>${groupName}</span><span class="small">${count} item(s)</span>`;
    section.appendChild(title);

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `
      <thead><tr>
        <th>Exam</th><th>Cycle</th><th>Level</th><th>Rotation</th><th>Window (Tentative)</th><th>Official</th><th style="min-width:260px">Actions</th>
      </tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    groups[groupName].forEach(item=>{
      const tr = document.createElement("tr");
      const officialOk = isOfficial(item.official);
      const overridden = !!overrides[item.id];
      const isUser = item.id?.startsWith?.("user-");
      const ri = rotationInfo(item);
      const lvl = item.level || inferLevel(item.body);
      const reg = item.region || (lvl!=="central" ? inferRegion(item.body) : "");
      const typeLabel = (lvl==="local" && item.orgtype)
        ? item.orgtype.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())
        : null;
      const levelBadge = (lvl==="central")
        ? "Central"
        : (lvl==="state" ? `State${reg? " — "+reg : ""}` : `Local${typeLabel? " — "+typeLabel : ""}${reg? " — "+reg : ""}`);
      const rotText = ri.gap ? `≈ ${fmtYears(ri.gap)}${ri.avg? ` (avg ${fmtYears(ri.avg)})`: ""}` : "—";
      const rotTitle = `Last: ${ri.last? ri.last.toLocaleDateString(): "—"} • Next: ${ri.next? ri.next.toLocaleDateString(): "—"}${ri.avg? ` • Avg: ${fmtYears(ri.avg)}`:""}`;

      tr.innerHTML = `
        <td>
          <div style="font-weight:600">${item.exam}</div>
          <div class="small">${item.notes? item.notes: ""} ${overridden ? `<span class="badge warn" title="Locally edited">Edited</span>` : ""}</div>
        </td>
        <td>${item.cycle||""}</td>
        <td><span class="badge">${levelBadge}</span></td>
        <td title="${rotTitle}">${rotText}</td>
        <td>${labelWindow(item.window)}</td>
        <td>
          <a href="${item.official}" target="_blank" rel="noopener" class="badge">Official</a>
          ${officialOk ? "" : `<span class="badge bad" title="Link not in official allowlist">Check</span>`}
        </td>
        <td class="row-actions">
          <a href="${makeICS(item)}" download="${item.id}.ics">Add to Calendar</a>
          ${ADMIN.enabled ? `<button data-act="${isUser ? 'editUser' : 'editStatic'}" data-id="${item.id}">Edit</button>` : ""}
          ${ADMIN.enabled ? `<button data-act="${isUser ? 'delUser' : 'delStatic'}" data-id="${item.id}">Delete</button>` : ""}
        </td>
      `;
      tbody.appendChild(tr);
    });

    section.appendChild(table);

    // NEW: Admin bar under each body
    if (ADMIN.enabled) {
      const bar = document.createElement("div");
      bar.style = "display:flex; gap:8px; padding:10px 12px; background:#0f1427; border-top:1px solid var(--line)";
      const addBtn = document.createElement("button");
      addBtn.className = "btn";
      addBtn.textContent = `Add under ${groupName}`;
      addBtn.onclick = () => {
        openEditor(
          { body: groupName, level: inferLevel(groupName), region: inferRegion(groupName) },
          { mode: "new" }
        );
      };
      const resetBtn = document.createElement("button");
      resetBtn.className = "btn ghost";
      resetBtn.textContent = "Reset local customizations";
      resetBtn.onclick = () => {
        if (confirm("Clear local additions, edits, and deletions?")) {
          setUserItems([]); setOverrides({}); setDeletions([]); render();
        }
      };
      bar.append(addBtn, resetBtn);

      if (getUserBodies().includes(groupName)) {
        const removeBodyBtn = document.createElement("button");
        removeBodyBtn.className = "btn ghost";
        removeBodyBtn.textContent = "Remove Body (custom)";
        removeBodyBtn.onclick = () => {
          if (confirm(`Remove custom body "${groupName}"? This won't delete any exams.`)) {
            setUserBodies(getUserBodies().filter(b=>b!==groupName)); render();
          }
        };
        bar.append(removeBodyBtn);
      }

      section.appendChild(bar);
    }

    frag.appendChild(section);
  });

  mount.innerHTML = "";
  mount.appendChild(frag);

  // Row actions
  mount.querySelectorAll("[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      if(act==="delUser"){ setUserItems(getUserItems().filter(x=>x.id!==id)); render(); }
      else if(act==="editUser"){ const item = getUserItems().find(x=>x.id===id); if(item) openEditor(item,{mode:'user'}); }
      else if(act==="delStatic"){ const del = new Set(getDeletions()); del.add(id); setDeletions([...del]); render(); }
      else if(act==="editStatic"){ const item = normalizedStatic().find(x=>x.id===id); if(item) openEditor(item,{mode:'static'}); }
    });
  });
}

// ---------- Editor ----------
let CURRENT_CONTEXT = { mode: 'new' };
function setWindowSlots(type){
  editForm.querySelectorAll("[data-slot]").forEach(el=> el.style.display="none");
  const map = {date:"[data-slot='date']", month:"[data-slot='month']", quarter:"[data-slot='quarter']", half:"[data-slot='half']"};
  const sel = map[type]; if(sel) editForm.querySelector(sel).style.display = "";
}
// Extend to show Region for State/Local and OrgType only for Local (if those inputs exist in HTML)
function setLevelSlots(level){
  const showRegion = (level==="state" || level==="local");
  const regionDiv = editForm.querySelector("[data-slot-level='region']");
  if(regionDiv) regionDiv.style.display = showRegion ? "" : "none";
  const orgtypeDiv = editForm.querySelector("[data-slot-level='orgtype']");
  if(orgtypeDiv) orgtypeDiv.style.display = (level==="local") ? "" : "none";
}

function openEditor(seed={}, context={mode:'new'}){
  CURRENT_CONTEXT = context;
  $("#dlgTitle").textContent = seed.id ? "Edit entry" : "Add entry";
  editForm.reset();

  editForm.body.value = seed.body || "";
  editForm.exam.value = seed.exam || "";
  editForm.cycle.value = seed.cycle || "";
  editForm.official.value = seed.official || "";
  editForm.notes.value = seed.notes || "";
  editForm.history.value = Array.isArray(seed.history) ? seed.history.join(", ") : "";

  // Level/Region/OrgType
  const lvl = seed.level || inferLevel(seed.body);
  editForm.level.value = lvl;
  setLevelSlots(lvl);
  editForm.region.value = seed.region || (lvl!=="central" ? inferRegion(seed.body) : "");
  const orgtypeField = editForm.querySelector("[name='orgtype']");
  if(orgtypeField) orgtypeField.value = seed.orgtype || "municipal_corporation";
  editForm.level.addEventListener("change", e=> setLevelSlots(e.target.value), {once:true});

  // Window
  const w = seed.window || {type:"date"};
  editForm.wtype.value = w.type || "date";
  setWindowSlots(w.type);
  if(w.type==="date" && w.date) editForm.date.value = w.date;
  if(w.type==="month" && w.month) editForm.month.value = w.month;
  if(w.type==="quarter"){ editForm.q.value = w.q||"Q1"; editForm.qy.value = w.year||2025; }
  if(w.type==="half"){ editForm.h.value = w.half||"H1"; editForm.hy.value = w.year||2025; }

  editDlg.returnValue = "";
  editDlg.showModal();

  editForm.onsubmit = (e)=>{
    e.preventDefault();
    const body = editForm.body.value.trim();
    const exam = editForm.exam.value.trim();
    const cycle = editForm.cycle.value.trim();
    const official = editForm.official.value.trim();
    const notes = editForm.notes.value.trim();
    const level = editForm.level.value;
    const region = (level==="state" || level==="local") ? (editForm.region.value||"").trim() : "";
    const orgtypeField = editForm.querySelector("[name='orgtype']");
    const orgtype = (level==="local" && orgtypeField) ? orgtypeField.value : undefined;
    const hist = editForm.history.value.split(",").map(s=>s.trim()).filter(Boolean);
    const wtype = editForm.wtype.value;

    if(!body || !exam || !official){ alert("Body, Exam, and Official link are required."); return; }
    if(!isOfficial(official)){
      if(!confirm("This link does not look official (not gov.in/nic.in or allowlist). Keep anyway?")) return;
    }

    const window = (()=> {
      if(wtype==="date"){ if(!editForm.date.value) return {type:"tbd"}; return {type:"date", date: editForm.date.value}; }
      if(wtype==="month"){ if(!editForm.month.value) return {type:"tbd"}; return {type:"month", month: editForm.month.value}; }
      if(wtype==="quarter"){ return {type:"quarter", q: editForm.q.value, year: Number(editForm.qy.value)||2025}; }
      if(wtype==="half"){ return {type:"half", half: editForm.h.value, year: Number(editForm.hy.value)||2025}; }
      return {type:"tbd"};
    })();

    if(CURRENT_CONTEXT.mode === 'user' && seed.id){
      const arr = getUserItems();
      const idx = arr.findIndex(x=>x.id===seed.id);
      if(idx>-1){ arr[idx] = { ...arr[idx], body, exam, cycle, window, official, notes, level, region, history: hist, ...(orgtype? {orgtype}: {}) }; }
      setUserItems(arr);
    } else if(CURRENT_CONTEXT.mode === 'static' && seed.id){
      const ov = getOverrides();
      ov[seed.id] = { body, exam, cycle, window, official, notes, level, region, history: hist, ...(orgtype? {orgtype}: {}) };
      setOverrides(ov);
      const dels = new Set(getDeletions()); if(dels.has(seed.id)){ dels.delete(seed.id); setDeletions([...dels]); }
    } else {
      const id = `user-${Date.now().toString(36)}`;
      const arr = getUserItems();
      arr.push({ id, body, exam, cycle, window, official, notes, level, region, history: hist, ...(orgtype? {orgtype}: {}) });
      setUserItems(arr);
    }

    if(!uniqueBodiesAcrossAll().includes(body)){
      setUserBodies([...new Set([...getUserBodies(), body])]);
    }
    editDlg.close(); render();
  };
}

editForm.wtype.addEventListener("change", (e)=> setWindowSlots(e.target.value));

// ---------- Events ----------
q.addEventListener("input", render);
windowSel.addEventListener("change", render);
bodySel.addEventListener("change", e=>{ currentFilters.body = e.target.value; render(); });

levelSel.addEventListener("change", e=>{
  currentFilters.level = e.target.value;

  // Reset Body to "All" whenever Level changes
  currentFilters.body = "__all__";
  bodySel.value = "__all__";

  // Region applies only to State/Local
  const isCentral = (currentFilters.level === "__all__" || currentFilters.level === "central");
  if(isCentral){
    currentFilters.region = "__all__";
    if(regionSel){ regionSel.value="__all__"; regionSel.style.display = "none"; }
  } else {
    if(regionSel){ regionSel.style.display = ""; }
  }

  // Local Type applies only to Local
  if(localTypeSel){
    const showLocalType = (currentFilters.level === "local");
    localTypeSel.style.display = showLocalType ? "" : "none";
    if(!showLocalType){
      currentFilters.localType = "__all__";
      localTypeSel.value = "__all__";
    }
  }

  render();
});
regionSel.addEventListener("change", e=>{ currentFilters.region = e.target.value; render(); });
if(localTypeSel){
  localTypeSel.addEventListener("change", e=>{ currentFilters.localType = e.target.value; render(); });
}

document.addEventListener("keydown", (ev)=>{ if(ev.key === "/"){ ev.preventDefault(); q.focus(); } });

// NEW: Top-bar Add Exam (prefills from current filters)
if (addExamBtn) {
  addExamBtn.addEventListener("click", () => {
    const seed = {};
    if (currentFilters.body && currentFilters.body !== "__all__") seed.body = currentFilters.body;
    if (levelSel && levelSel.value !== "__all__") seed.level = levelSel.value;
    if (regionSel && regionSel.value !== "__all__" && (seed.level === "state" || seed.level === "local")) {
      seed.region = regionSel.value;
    }
    if (seed.level === "local" && localTypeSel && localTypeSel.value !== "__all__") {
      seed.orgtype = localTypeSel.value;
    }
    openEditor(seed, { mode: "new" });
  });
}

exportCsvBtn.addEventListener("click", ()=>{
  const rows = applyFilters(normalizeItems())
    .sort((a,b)=> sortKey(a.window)-sortKey(b.window) || a.body.localeCompare(b.body) || a.exam.localeCompare(b.exam));
  const csv = toCSV(rows);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  a.download = "recruitment_notifications_bodywise.csv";
  a.click();
});

exportJsonBtn.addEventListener("click", ()=>{
  const payload = {
    version: 5,
    userItems: getUserItems(),
    userBodies: getUserBodies(),
    overrides: getOverrides(),
    deletions: getDeletions()
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"}));
  a.download = "recruit-bodywise-appdata.json";
  a.click();
});
importJsonInp.addEventListener("change", async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  try{
    const data = JSON.parse(await f.text());
    if(Array.isArray(data)){ setUserItems(data.map(o=> ({ id: o.id || `user-${Date.now().toString(36)}`, ...o }))); }
    else{
      if(data.userItems) setUserItems(data.userItems);
      if(data.userBodies) setUserBodies(data.userBodies);
      if(data.overrides) setOverrides(data.overrides);
      if(data.deletions) setDeletions(data.deletions);
    }
    render(); alert("Imported!");
  }catch(err){ alert("Import failed: " + err.message); }
});

addBodyBtn.addEventListener("click", ()=>{
  const name = prompt("Enter new Recruitment Body name (e.g., Pune Zilla Parishad, BMC):");
  if(!name) return;
  const body = name.trim(); if(!body) return;
  const set = new Set(uniqueBodiesAcrossAll());
  if(set.has(body)) { alert("Body already exists."); return; }
  setUserBodies([...getUserBodies(), body]);
  if(ADMIN.enabled && confirm("Add an exam under this body now?")){
     openEditor({ body, level: "local" }, {mode:'new'}); // default to Local
  } else {
     render();
  }
});

// Toggle Admin
toggleAdminBtn.addEventListener("click", ()=>{
  ADMIN.enabled = !ADMIN.enabled;
  toggleAdminBtn.classList.toggle("ghost", !ADMIN.enabled);
  toggleAdminBtn.textContent = ADMIN.enabled ? "Admin Mode: ON" : "Admin Mode";
  render();
});

// ---------- Init ----------
(async function init(){
  updated.textContent = new Date().toLocaleString();
  await loadStatic();

  // Initialize visibility of region/localType on first load
  if(regionSel){ regionSel.style.display = (levelSel.value==="state" || levelSel.value==="local") ? "" : "none"; }
  if(localTypeSel){ localTypeSel.style.display = (levelSel.value==="local") ? "" : "none"; }

  render();
})();
