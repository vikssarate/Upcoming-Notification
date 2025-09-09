// ---------- Elements ----------
const $ = (s) => document.querySelector(s);
const mount = $("#mount");
const q = $("#q");
const bodySel = $("#body");
const windowSel = $("#window");
const updated = $("#updated");
const toggleAdminBtn = $("#toggleAdmin");
const addBodyBtn = $("#addBody");
const editDlg = $("#editDlg");
const editForm = $("#editForm");
const exportCsvBtn = $("#exportCsv");
const exportJsonBtn = $("#exportJson");
const importJsonInp = $("#importJson");

// ---------- Admin & Storage ----------
const ADMIN = { enabled: false };

// localStorage keys
const LSK_USER_ITEMS = "recruit_bodywise_userItems_v2";
const LSK_USER_BODIES = "recruit_bodywise_userBodies_v1";
const LSK_OVERRIDES   = "recruit_bodywise_overrides_v1";   // { id: {partial fields} }
const LSK_DELETIONS   = "recruit_bodywise_deletions_v1";   // [ids]

// helpers
const getJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch { return d; } };
const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function getUserItems(){ return getJSON(LSK_USER_ITEMS, []); }
function setUserItems(v){ setJSON(LSK_USER_ITEMS, v); }

function getUserBodies(){ return getJSON(LSK_USER_BODIES, []); }
function setUserBodies(v){ setJSON(LSK_USER_BODIES, v); }

function getOverrides(){ return getJSON(LSK_OVERRIDES, {}); }
function setOverrides(v){ setJSON(LSK_OVERRIDES, v); }

function getDeletions(){ return getJSON(LSK_DELETIONS, []); }
function setDeletions(v){ setJSON(LSK_DELETIONS, v); }

// Allowlist for "official" domains. (Extend as needed.)
const allowedHosts = new Set([
  "ssc.gov.in","upsc.gov.in","ibps.in","rrbcdg.gov.in",
  "mpsc.gov.in","bpsc.bih.nic.in","tnpsc.gov.in","psc.nic.in",
  "ppsc.gov.in","hpsc.gov.in","gpsc.gujarat.gov.in","kpsc.kar.nic.in",
  "rpsc.rajasthan.gov.in","tspsc.gov.in","wbpsc.gov.in",
  "jkpsc.nic.in","opsc.gov.in","uppsc.up.nic.in","jpsc.gov.in"
]);

// ---------- Data ----------
let STATIC = []; // from data/exams.json

async function loadStatic(){
  try{
    const res = await fetch("./data/exams.json", { cache: "no-store" });
    STATIC = await res.json();
  } catch(e){
    console.warn("Failed to load exams.json", e);
    STATIC = [];
  }
}

// Apply local overrides/deletions to shipped (static) items
function normalizedStatic(){
  const ov = getOverrides();
  const del = new Set(getDeletions());
  return STATIC
    .filter(x => !del.has(x.id))
    .map(x => ov[x.id] ? { ...x, ...ov[x.id], id: x.id } : x);
}

function normalizeItems(){
  return [...normalizedStatic(), ...getUserItems()];
}

function uniqueBodiesAcrossAll(){
  const fromItems = [...new Set(normalizeItems().map(x=>x.body))];
  const customs = getUserBodies();
  return [...new Set([...fromItems, ...customs])].sort((a,b)=>a.localeCompare(b));
}

function labelWindow(w){
  if(!w||!w.type) return "TBD";
  switch(w.type){
    case "date": return new Date(w.date+"T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"2-digit"});
    case "month": {
      const [y,m]=w.month.split("-").map(Number);
      const d=new Date(y, m-1, 1);
      return d.toLocaleDateString(undefined,{year:"numeric",month:"long"});
    }
    case "quarter": return `${w.q} ${w.year}`;
    case "half": return `${w.half} ${w.year}`;
    case "tbd": return "TBD";
    default: return "TBD";
  }
}

function sortKey(w){
  if(!w) return 9e12;
  if(w.type==="date") return +new Date(w.date+"T00:00:00");
  if(w.type==="month"){
    const [y,m]=w.month.split("-").map(Number);
    return +new Date(y, m-1, 1);
  }
  if(w.type==="quarter"){
    const qmap={Q1:0, Q2:3, Q3:6, Q4:9};
    return +new Date(w.year, qmap[w.q]??0, 1);
  }
  if(w.type==="half"){
    const hmap={H1:0, H2:6};
    return +new Date(w.year, hmap[w.half]??0, 1);
  }
  return 9e12;
}

function hostFrom(url){
  try { return new URL(url).host.toLowerCase(); }
  catch { return ""; }
}
function isOfficial(url){
  const h = hostFrom(url);
  return h.endsWith(".gov.in") || h.endsWith(".nic.in") || allowedHosts.has(h);
}

function makeICS(item){
  const s = sortKey(item.window);
  const d = isFinite(s)? new Date(s) : new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0");
  const day = String(item.window?.type==="date" ? new Date(item.window.date).getDate() : 1).padStart(2,"0");
  const start = `${y}${m}${day}T090000`;
  const end   = `${y}${m}${day}T100000`;

  const summary = `${item.body}: ${item.exam} (${item.cycle||""}) — Tentative Notification`;
  const desc = `Tentative notification window: ${labelWindow(item.window)}. Verify on official site: ${item.official}`;

  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Recruit Bodywise//EN",
    "BEGIN:VEVENT",
    `UID:${item.id}@recruit-bodywise.local`,
    `DTSTAMP:${start}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc.replace(/\n/g," ")}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");

  const blob = new Blob([ics], {type:"text/calendar"});
  return URL.createObjectURL(blob);
}

function toCSV(rows){
  const esc = s => `"${String(s??"").replace(/"/g,'""')}"`;
  const head = ["Body","Exam","Cycle","Window","Official","Notes"];
  const lines = [head.map(esc).join(",")];
  rows.forEach(r=>{
    lines.push([r.body, r.exam, r.cycle||"", labelWindow(r.window), r.official||"", r.notes||""].map(esc).join(","));
  });
  return lines.join("\r\n");
}

// ---------- Rendering ----------
const currentFilters = { body: "__all__" };

function render(){
  const items = normalizeItems()
    .filter(x=>{
      if(windowSel.value!=="__all__" && (x.window?.type||"tbd")!==windowSel.value) return false;
      if(bodySel.value!=="__all__" && x.body!==bodySel.value) return false;
      const s = `${x.body} ${x.exam} ${x.cycle||""} ${x.notes||""}`.toLowerCase();
      return s.includes(q.value.trim().toLowerCase());
    })
    .sort((a,b)=> sortKey(a.window)-sortKey(b.window) || a.body.localeCompare(b.body) || a.exam.localeCompare(b.exam));

  // Group actual items
  const groups = {};
  items.forEach(it => { (groups[it.body] ||= []).push(it); });

  // Inject body filter options (union with custom bodies)
  const bodies = uniqueBodiesAcrossAll();
  bodySel.innerHTML = `<option value="__all__">All bodies</option>` + bodies.map(b=>`<option value="${b}">${b}</option>`).join("");
  if(currentFilters.body && bodies.includes(currentFilters.body)) bodySel.value=currentFilters.body;

  // Build UI sections for union of groups + custom bodies (so empty bodies show)
  const unionBodies = bodies;
  if(!unionBodies.length){
    mount.innerHTML = `<div class="empty">No data yet. Click <b>Add Body</b> then add exams in Admin Mode.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  const overrides = getOverrides();

  unionBodies.forEach(groupName=>{
    // Skip empty group if filtered to another body
    if(bodySel.value !== "__all__" && groupName !== bodySel.value) return;

    const section = document.createElement("section");
    section.className = "group";
    const count = (groups[groupName]?.length || 0);
    const title = document.createElement("h2");
    title.innerHTML = `<span>${groupName}</span><span class="small">${count} item(s)</span>`;
    section.appendChild(title);

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `
      <thead><tr>
        <th>Exam</th><th>Cycle</th><th>Window (Tentative)</th><th>Official</th><th style="min-width:260px">Actions</th>
      </tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    (groups[groupName] || []).forEach(item=>{
      const tr = document.createElement("tr");
      const officialOk = isOfficial(item.official);
      const overridden = !!overrides[item.id];
      const isUser = item.id?.startsWith?.("user-");

      tr.innerHTML = `
        <td>
          <div style="font-weight:600">${item.exam}</div>
          <div class="small">${item.notes? item.notes: ""} ${overridden ? `<span class="badge warn" title="Locally edited">Edited</span>` : ""}</div>
        </td>
        <td>${item.cycle||""}</td>
        <td>${labelWindow(item.window)}</td>
        <td>
          <a href="${item.official}" target="_blank" rel="noopener" class="badge">Official</a>
          ${officialOk ? "" : `<span class="badge bad" title="Link not in official allowlist">Check</span>`}
        </td>
        <td class="row-actions">
          <a href="${makeICS(item)}" download="${item.id}.ics" title="Add to Calendar">Add to Calendar</a>
          ${ADMIN.enabled ? `<button data-act="${isUser ? 'editUser' : 'editStatic'}" data-id="${item.id}">Edit</button>` : ""}
          ${ADMIN.enabled ? `<button data-act="${isUser ? 'delUser' : 'delStatic'}" data-id="${item.id}">Delete</button>` : ""}
        </td>
      `;
      tbody.appendChild(tr);
    });

    section.appendChild(table);

    const hasItems = !!(groups[groupName]?.length);
    if(!hasItems){
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No exams added for this body yet.";
      section.appendChild(empty);
    }

    if(ADMIN.enabled){
      const bar = document.createElement("div");
      bar.style = "display:flex; gap:8px; padding:10px 12px; background:#0f1427; border-top:1px solid var(--line)";
      const addBtn = document.createElement("button");
      addBtn.className = "btn";
      addBtn.textContent = `Add under ${groupName}`;
      addBtn.onclick = ()=> openEditor({body:groupName}, {mode:'new'});

      const resetBtn = document.createElement("button");
      resetBtn.className = "btn ghost";
      resetBtn.textContent = "Reset local customizations";
      resetBtn.onclick = ()=>{
        if(confirm("Clear local additions, edits, and deletions?")){
          setUserItems([]);
          setOverrides({});
          setDeletions([]);
          render();
        }
      };

      bar.append(addBtn, resetBtn);

      // If this is a custom body, allow removing it (does not delete exams)
      if(getUserBodies().includes(groupName)){
        const removeBodyBtn = document.createElement("button");
        removeBodyBtn.className = "btn ghost";
        removeBodyBtn.textContent = "Remove Body (custom)";
        removeBodyBtn.onclick = ()=>{
          if(confirm(`Remove custom body "${groupName}"? This won't delete any exams.`)){
            setUserBodies(getUserBodies().filter(b=>b!==groupName));
            render();
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

  // Row action handlers
  mount.querySelectorAll("[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      if(act==="delUser"){
        const items = getUserItems().filter(x=>x.id!==id);
        setUserItems(items);
        render();
      } else if(act==="editUser"){
        const item = getUserItems().find(x=>x.id===id);
        if(item) openEditor(item, {mode:'user'});
      } else if(act==="delStatic"){
        const del = new Set(getDeletions());
        del.add(id);
        setDeletions([...del]);
        render();
      } else if(act==="editStatic"){
        // find current effective static item
        const item = normalizedStatic().find(x=>x.id===id);
        if(item) openEditor(item, {mode:'static'});
      }
    });
  });
}

// ---------- Editor ----------
let CURRENT_CONTEXT = { mode: 'new' }; // 'new' | 'user' | 'static'

function setWindowSlots(type){
  editForm.querySelectorAll("[data-slot]").forEach(el=> el.style.display="none");
  const map = {date:"[data-slot='date']", month:"[data-slot='month']", quarter:"[data-slot='quarter']", half:"[data-slot='half']"};
  const sel = map[type];
  if(sel) editForm.querySelector(sel).style.display = "";
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
    const wtype = editForm.wtype.value;

    if(!body || !exam || !official){ alert("Body, Exam, and Official link are required."); return; }
    if(!isOfficial(official)){
      if(!confirm("This link does not look official (not gov.in/nic.in or allowlist). Keep anyway?")) return;
    }

    const winObj = (()=> {
      if(wtype==="date"){ if(!editForm.date.value) return {type:"tbd"}; return {type:"date", date: editForm.date.value}; }
      if(wtype==="month"){ if(!editForm.month.value) return {type:"tbd"}; return {type:"month", month: editForm.month.value}; }
      if(wtype==="quarter"){ return {type:"quarter", q: editForm.q.value, year: Number(editForm.qy.value)||2025}; }
      if(wtype==="half"){ return {type:"half", half: editForm.h.value, year: Number(editForm.hy.value)||2025}; }
      return {type:"tbd"};
    })();

    if(CURRENT_CONTEXT.mode === 'user' && seed.id){
      const arr = getUserItems();
      const idx = arr.findIndex(x=>x.id===seed.id);
      if(idx>-1){ arr[idx] = { ...arr[idx], body, exam, cycle, window: winObj, official, notes }; }
      setUserItems(arr);
    } else if(CURRENT_CONTEXT.mode === 'static' && seed.id){
      const ov = getOverrides();
      ov[seed.id] = { body, exam, cycle, window: winObj, official, notes };
      setOverrides(ov);
      // If this id was previously deleted, un-delete it on edit
      const dels = new Set(getDeletions()); if(dels.has(seed.id)){ dels.delete(seed.id); setDeletions([...dels]); }
    } else {
      const id = `user-${Date.now().toString(36)}`;
      const arr = getUserItems();
      arr.push({ id, body, exam, cycle, window: winObj, official, notes });
      setUserItems(arr);
    }

    // Ensure custom body exists if user typed a new one
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
document.addEventListener("keydown", (ev)=>{ if(ev.key === "/"){ ev.preventDefault(); q.focus(); } });

exportCsvBtn.addEventListener("click", ()=>{
  const rows = normalizeItems()
    .filter(x=>{
      if(windowSel.value!=="__all__" && (x.window?.type||"tbd")!==windowSel.value) return false;
      if(bodySel.value!=="__all__" && x.body!==bodySel.value) return false;
      const s = `${x.body} ${x.exam} ${x.cycle||""} ${x.notes||""}`.toLowerCase();
      return s.includes(q.value.trim().toLowerCase());
    })
    .sort((a,b)=> sortKey(a.window)-sortKey(b.window) || a.body.localeCompare(b.body) || a.exam.localeCompare(b.exam));
  const csv = toCSV(rows);
  const blob = new Blob([csv], {type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "recruitment_notifications_bodywise.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

// Export/Import full app data (user items, bodies, overrides, deletions)
exportJsonBtn.addEventListener("click", ()=>{
  const payload = {
    version: 2,
    userItems: getUserItems(),
    userBodies: getUserBodies(),
    overrides: getOverrides(),
    deletions: getDeletions()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "recruit-bodywise-appdata.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

importJsonInp.addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  try{
    const txt = await f.text();
    const data = JSON.parse(txt);
    // accept both old (array of items) and new (app data) formats
    if(Array.isArray(data)){
      // legacy: only user items
      setUserItems(data.map(o=> ({ id: o.id || `user-${crypto.randomUUID?.() || Date.now().toString(36)}`, ...o })));
    } else {
      if(data.userItems) setUserItems(data.userItems);
      if(data.userBodies) setUserBodies(data.userBodies);
      if(data.overrides) setOverrides(data.overrides);
      if(data.deletions) setDeletions(data.deletions);
    }
    render();
    alert("Imported!");
  }catch(err){ alert("Import failed: " + err.message); }
});

// Add Body button
addBodyBtn.addEventListener("click", ()=>{
  const name = prompt("Enter new Recruitment Body name (e.g., JKPSC, GPSC):");
  if(!name) return;
  const body = name.trim();
  if(!body) return;
  const set = new Set(uniqueBodiesAcrossAll());
  if(set.has(body)) { alert("Body already exists."); return; }
  setUserBodies([...getUserBodies(), body]);
  if(ADMIN.enabled && confirm("Add an exam under this body now?")){
     openEditor({ body }, {mode:'new'});
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
  render();
})();
