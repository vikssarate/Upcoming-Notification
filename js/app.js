// ---------- Elements ----------
const $ = (s) => document.querySelector(s);
const mount = $("#mount");
const q = $("#q");
const bodySel = $("#body");
const windowSel = $("#window");
const updated = $("#updated");
const toggleAdminBtn = $("#toggleAdmin");
const editDlg = $("#editDlg");
const editForm = $("#editForm");
const exportCsvBtn = $("#exportCsv");
const exportJsonBtn = $("#exportJson");
const importJsonInp = $("#importJson");

// ---------- Admin & Storage ----------
const ADMIN = { enabled: false };
const LSK = "recruit_bodywise_userItems_v1";

// Allowlist for "official" domains. (Extend as needed.)
const allowedHosts = new Set([
  "ssc.gov.in","upsc.gov.in","ibps.in","rrbcdg.gov.in",
  "mpsc.gov.in","bpsc.bih.nic.in","tnpsc.gov.in","psc.nic.in",
  "ppsc.gov.in","hpsc.gov.in","gpsc.gujarat.gov.in","kpsc.kar.nic.in",
  "rpsc.rajasthan.gov.in","tspsc.gov.in","bpsc.bih.nic.in","wbpsc.gov.in",
  "jkpsc.nic.in","opsc.gov.in","uppsc.up.nic.in","jpsc.gov.in",
]);

function getUserItems(){ try { return JSON.parse(localStorage.getItem(LSK) || "[]"); } catch { return []; } }
function setUserItems(items){ localStorage.setItem(LSK, JSON.stringify(items)); }

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

function normalizeItems(){
  return [...STATIC, ...getUserItems()];
}

function uniqueBodies(items){
  return [...new Set(items.map(x=>x.body))].sort((a,b)=>a.localeCompare(b));
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

  const groups = {};
  items.forEach(it => { (groups[it.body] ||= []).push(it); });

  const bodies = uniqueBodies(normalizeItems());
  bodySel.innerHTML = `<option value="__all__">All bodies</option>` + bodies.map(b=>`<option value="${b}">${b}</option>`).join("");
  if(currentFilters.body && bodies.includes(currentFilters.body)) bodySel.value=currentFilters.body;

  if(!items.length){
    mount.innerHTML = `<div class="empty">No matches. Try clearing filters.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  Object.keys(groups).sort((a,b)=>a.localeCompare(b)).forEach(groupName=>{
    const section = document.createElement("section");
    section.className = "group";
    const title = document.createElement("h2");
    title.innerHTML = `<span>${groupName}</span><span class="small">${groups[groupName].length} item(s)</span>`;
    section.appendChild(title);

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `
      <thead><tr>
        <th>Exam</th><th>Cycle</th><th>Window (Tentative)</th><th>Official</th><th style="min-width:230px">Actions</th>
      </tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    groups[groupName].forEach(item=>{
      const tr = document.createElement("tr");
      const officialOk = isOfficial(item.official);
      tr.innerHTML = `
        <td><div style="font-weight:600">${item.exam}</div><div class="small">${item.notes? item.notes: ""}</div></td>
        <td>${item.cycle||""}</td>
        <td>${labelWindow(item.window)}</td>
        <td>
          <a href="${item.official}" target="_blank" rel="noopener" class="badge">Official</a>
          ${officialOk ? "" : `<span class="badge bad" title="Link not in official allowlist">Check</span>`}
        </td>
        <td class="row-actions">
          <a href="${makeICS(item)}" download="${item.id}.ics" title="Add to Calendar">Add to Calendar</a>
          ${ADMIN.enabled && item.id.startsWith("user-") ? `<button data-act="edit" data-id="${item.id}" title="Edit (local)">Edit</button>` : ""}
          ${ADMIN.enabled && item.id.startsWith("user-") ? `<button data-act="del" data-id="${item.id}" title="Delete (local)">Delete</button>` : ""}
        </td>
      `;
      tbody.appendChild(tr);
    });

    section.appendChild(table);

    if(ADMIN.enabled){
      const bar = document.createElement("div");
      bar.style = "display:flex; gap:8px; padding:10px 12px; background:#0f1427; border-top:1px solid var(--line)";
      const addBtn = document.createElement("button");
      addBtn.className = "btn";
      addBtn.textContent = `Add under ${groupName}`;
      addBtn.onclick = ()=> openEditor({body:groupName});
      const resetBtn = document.createElement("button");
      resetBtn.className = "btn ghost";
      resetBtn.textContent = "Reset local additions";
      resetBtn.onclick = ()=>{
        if(confirm("Remove all locally added/edited entries?")){
          setUserItems([]);
          render();
        }
      };
      bar.append(addBtn, resetBtn);
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
      if(act==="del"){
        const items = getUserItems().filter(x=>x.id!==id);
        setUserItems(items);
        render();
      } else if(act==="edit"){
        const item = getUserItems().find(x=>x.id===id);
        if(item) openEditor(item);
      }
    });
  });
}

// ---------- Editor ----------
function setWindowSlots(type){
  editForm.querySelectorAll("[data-slot]").forEach(el=> el.style.display="none");
  const map = {date:"[data-slot='date']", month:"[data-slot='month']", quarter:"[data-slot='quarter']", half:"[data-slot='half']"};
  const sel = map[type];
  if(sel) editForm.querySelector(sel).style.display = "";
}

function openEditor(seed={}){
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

    const window = (()=> {
      if(wtype==="date"){ if(!editForm.date.value) return {type:"tbd"}; return {type:"date", date: editForm.date.value}; }
      if(wtype==="month"){ if(!editForm.month.value) return {type:"tbd"}; return {type:"month", month: editForm.month.value}; }
      if(wtype==="quarter"){ return {type:"quarter", q: editForm.q.value, year: Number(editForm.qy.value)||2025}; }
      if(wtype==="half"){ return {type:"half", half: editForm.h.value, year: Number(editForm.hy.value)||2025}; }
      return {type:"tbd"};
    })();

    const userItems = getUserItems();
    if(seed.id){
      const idx = userItems.findIndex(x=>x.id===seed.id);
      if(idx>-1){ userItems[idx] = { ...userItems[idx], body, exam, cycle, window, official, notes }; }
    } else {
      const id = `user-${Date.now().toString(36)}`;
      userItems.push({ id, body, exam, cycle, window, official, notes });
    }
    setUserItems(userItems);
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

exportJsonBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(getUserItems(), null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "user-items.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

importJsonInp.addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  try{
    const txt = await f.text();
    const arr = JSON.parse(txt);
    if(!Array.isArray(arr)) throw new Error("Invalid JSON: expected array");
    // simple shape check
    arr.forEach(o=>{ if(!o.body || !o.exam) throw new Error("Each item must have 'body' and 'exam'"); });
    // tag as user items with ids
    const normalized = arr.map(o=> ({ id: o.id || `user-${crypto.randomUUID?.() || Date.now().toString(36)}`, ...o }));
    setUserItems(normalized); render();
    alert("Imported!");
  }catch(err){ alert("Import failed: " + err.message); }
});

// ---------- Init ----------
(async function init(){
  updated.textContent = new Date().toLocaleString();
  await loadStatic();
  render();
  // Toggle Admin button
  toggleAdminBtn.addEventListener("click", ()=>{
    ADMIN.enabled = !ADMIN.enabled;
    toggleAdminBtn.classList.toggle("ghost", !ADMIN.enabled);
    toggleAdminBtn.textContent = ADMIN.enabled ? "Admin Mode: ON" : "Admin Mode";
    render();
  });
})();
