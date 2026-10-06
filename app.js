(() => {
  const cfg = window.SHUGAA_CONFIG;
  const client = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

  const state = {
    session: null,
    profile: null,
    role: "viewer",
    status: "pending",
    people: [],
    relations: [],
    marriages: [],
    branches: [],
    events: [],
    places: [],
    library: [],
    libraryPeople: [],
    adminUsers: [],
    audit: [],
    cy: null,
    libraryFilter: "all",
    activePersonId: null
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const authScreen = $("#authScreen");
  const statusScreen = $("#statusScreen");
  const app = $("#app");
  const authMsg = $("#authMsg");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, s => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[s]);
  }

  function toast(msg, ms = 3000) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  function toNullInt(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  function confidenceLabel(v) {
    return ({documented:"موثق",family_tradition:"متوارث عائليًا",likely:"مرجح",uncertain:"غير مؤكد"})[v] || "غير محدد";
  }

  function roleLabel(v) {
    return ({admin:"مدير",editor:"مدخل بيانات",viewer:"مشاهد"})[v] || "مشاهد";
  }

  function statusLabel(v) {
    return ({pending:"بانتظار الموافقة",active:"نشط",rejected:"مرفوض",suspended:"موقوف"})[v] || v;
  }

  function genderIcon(g) {
    if (g === "female") return "ن";
    if (g === "male") return "ش";
    return "•";
  }

  function yearText(p) {
    const b = p.birth_year || (p.birth_date ? String(p.birth_date).slice(0,4) : "");
    const d = p.death_year || (p.death_date ? String(p.death_date).slice(0,4) : "");
    if (b || d) return `${b || "؟"} — ${p.is_living ? "حتى الآن" : (d || "؟")}`;
    return p.is_living ? "على قيد الحياة" : "التاريخ غير مسجل";
  }

  function itemTypeLabel(t) {
    return ({
      document:"وثيقة",record:"سجل",land_record:"سجل أرض / ملكية",photo:"صورة",video:"فيديو",
      audio:"تسجيل صوتي",oral_history:"رواية شفهية",genealogy:"مشجرة / نسب",correspondence:"مراسلة",
      map:"خريطة",historical_event:"مادة تاريخية",other:"أخرى"
    })[t] || "مادة أرشيفية";
  }

  function itemTypeIcon(t) {
    return ({document:"📜",record:"📚",land_record:"🧾",photo:"📷",video:"🎥",audio:"🎧",oral_history:"🎙️",genealogy:"🌳",correspondence:"✉️",map:"🗺️",historical_event:"🏺",other:"📦"})[t] || "📦";
  }

  function accessLabel(v) {
    return ({family:"كل الأعضاء",editors:"مدخلو البيانات",admins:"المدير فقط",restricted:"أشخاص محددون",vault:"الخزانة"})[v] || v;
  }

  function eventTypeLabel(t) {
    return ({birth:"ميلاد",residence:"سكن",migration:"هجرة / انتقال",marriage:"زواج",death:"وفاة",burial:"دفن",historical:"حدث تاريخي",other:"حدث"})[t] || "حدث";
  }

  async function getMyProfile() {
    const uid = state.session?.user?.id;
    if (!uid) return null;
    const { data, error } = await client.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) throw error;
    return data;
  }

  function showAuth() {
    app.classList.add("hidden");
    statusScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }

  function showStatus(status) {
    authScreen.classList.add("hidden");
    app.classList.add("hidden");
    statusScreen.classList.remove("hidden");
    const icon = $("#statusIcon"), title = $("#statusTitle"), text = $("#statusText");
    if (status === "rejected") {
      icon.textContent = "✕";
      title.textContent = "تعذر قبول طلب العضوية";
      text.textContent = "هذا الحساب غير معتمد حاليًا. تواصل مع إدارة العائلة إذا كنت تعتقد أن هناك خطأ.";
    } else if (status === "suspended") {
      icon.textContent = "⏸";
      title.textContent = "الحساب موقوف مؤقتًا";
      text.textContent = "تم إيقاف الوصول إلى الشجرة مؤقتًا. تواصل مع الإدارة لمعرفة السبب.";
    } else {
      icon.textContent = "⌛";
      title.textContent = "طلبك بانتظار الموافقة";
      text.textContent = "تم إنشاء الحساب، لكن شجرة آل شجاع خاصة بالعائلة. ستتمكن من الدخول بعد موافقة الإدارة.";
    }
  }

  function showApp() {
    authScreen.classList.add("hidden");
    statusScreen.classList.add("hidden");
    app.classList.remove("hidden");
  }

  function applyRoleUI() {
    const isAdmin = state.role === "admin";
    const isStaff = ["admin","editor"].includes(state.role);
    $$(".staff-only").forEach(el => el.classList.toggle("hidden", !isStaff));
    $$(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
    $("#userRoleBadge").textContent = roleLabel(state.role);
    $("#userWelcome").textContent = state.profile?.display_name ? `مرحبًا ${state.profile.display_name}` : "";
  }

  async function enterSession(session) {
    state.session = session;
    try {
      state.profile = await getMyProfile();
    } catch (e) {
      console.error(e);
      showAuth();
      authMsg.textContent = "تعذر قراءة ملف الحساب. جرّب تسجيل الدخول مرة أخرى.";
      return;
    }

    state.role = state.profile?.role || "viewer";
    state.status = state.profile?.status || "pending";

    if (state.status !== "active") {
      showStatus(state.status);
      return;
    }

    applyRoleUI();
    showApp();
    try {
      await loadData();
    } catch (e) {
      console.error(e);
      toast("تعذر تحميل بعض بيانات الشجرة. تحقق من تشغيل تحديث قاعدة البيانات V2.", 4500);
    }
  }

  async function signOut() {
    await client.auth.signOut();
    state.session = null;
    state.profile = null;
    state.people = [];
    state.library = [];
    if (state.cy) state.cy.destroy();
    showAuth();
  }

  async function loadData() {
    const queries = [
      client.from("people").select("*").order("full_name_ar"),
      client.from("parent_child_relations").select("*"),
      client.from("marriages").select("*"),
      client.from("branches").select("*"),
      client.from("life_events").select("*"),
      client.from("places").select("*"),
      client.from("library_items").select("*").order("created_at", {ascending:false}),
      client.from("library_item_people").select("*")
    ];
    const [peopleR, relationsR, marriagesR, branchesR, eventsR, placesR, libraryR, libraryPeopleR] = await Promise.all(queries);
    for (const r of [peopleR,relationsR,marriagesR,branchesR,eventsR,placesR,libraryR,libraryPeopleR]) {
      if (r.error) throw r.error;
    }
    state.people = peopleR.data || [];
    state.relations = relationsR.data || [];
    state.marriages = marriagesR.data || [];
    state.branches = branchesR.data || [];
    state.events = eventsR.data || [];
    state.places = placesR.data || [];
    state.library = libraryR.data || [];
    state.libraryPeople = libraryPeopleR.data || [];

    renderStats();
    renderPeople();
    renderHistory();
    renderLibrary();
    renderLatest();
    fillPersonSelects();
    renderTree();
    if (state.role === "admin") await loadAdminData();
  }

  async function loadAdminData() {
    const [usersR, auditR] = await Promise.all([
      client.from("profiles").select("*").order("requested_at", {ascending:false}),
      client.from("audit_logs").select("*").order("changed_at", {ascending:false}).limit(80)
    ]);
    if (!usersR.error) state.adminUsers = usersR.data || [];
    if (!auditR.error) state.audit = auditR.data || [];
    renderAccountRequests();
    renderUsers();
    renderAudit();
  }

  function renderStats() {
    $("#statPeople").textContent = state.people.length;
    $("#statBranches").textContent = state.branches.length;
    $("#statLibrary").textContent = state.library.length;
    $("#statEvents").textContent = state.events.length;
  }

  function renderLatest() {
    const box = $("#latestAdditions");
    const items = [];
    state.library.slice(0,3).forEach(x => items.push({time:x.created_at, icon:itemTypeIcon(x.item_type), title:x.title, meta:itemTypeLabel(x.item_type)}));
    state.people.slice(-3).forEach(x => items.push({time:x.created_at, icon:"👤", title:x.full_name_ar, meta:"فرد في الشجرة"}));
    items.sort((a,b) => new Date(b.time || 0) - new Date(a.time || 0));
    const top = items.slice(0,5);
    box.innerHTML = top.length ? top.map(i => `<div class="latest-item"><div class="latest-icon">${i.icon}</div><div><strong>${escapeHtml(i.title)}</strong><small>${escapeHtml(i.meta)}</small></div></div>`).join("") : `<div class="latest-item"><div class="latest-icon">✦</div><div><strong>المشروع بدأ للتو</strong><small>أول إضافة ستظهر هنا</small></div></div>`;
  }

  function renderPeople(filter = "") {
    const grid = $("#peopleGrid"), empty = $("#peopleEmpty");
    const q = filter.trim().toLowerCase();
    const rows = state.people.filter(p => !q || p.full_name_ar.toLowerCase().includes(q) || (p.full_name_en || "").toLowerCase().includes(q));
    grid.innerHTML = "";
    empty.classList.toggle("hidden", rows.length > 0);
    rows.forEach(p => {
      const card = document.createElement("article");
      card.className = "person-card";
      card.innerHTML = `<div class="avatar">${genderIcon(p.gender)}</div><div><h3>${escapeHtml(p.full_name_ar)}</h3><p>${escapeHtml(yearText(p))}</p><p>${escapeHtml(confidenceLabel(p.record_confidence))}</p></div>`;
      card.addEventListener("click", () => openPerson(p.id));
      grid.appendChild(card);
    });
  }

  function getPerson(id) { return state.people.find(p => p.id === id); }
  function getPlace(id) { return state.places.find(p => p.id === id); }

  function familyOf(id) {
    const fr = state.relations.find(r => r.child_id === id && r.parent_role === "father");
    const mr = state.relations.find(r => r.child_id === id && r.parent_role === "mother");
    const kids = [...new Set(state.relations.filter(r => r.parent_id === id).map(r => r.child_id))].map(getPerson).filter(Boolean);
    const spouseIds = state.marriages.flatMap(m => m.person1_id === id ? [m.person2_id] : m.person2_id === id ? [m.person1_id] : []);
    return {father:fr ? getPerson(fr.parent_id) : null,mother:mr ? getPerson(mr.parent_id) : null,children:kids,spouses:[...new Set(spouseIds)].map(getPerson).filter(Boolean)};
  }

  function openPerson(id) {
    const p = getPerson(id);
    if (!p) return;
    state.activePersonId = id;
    const f = familyOf(id);
    $("#profileName").textContent = p.full_name_ar;
    $("#profileLife").textContent = yearText(p);
    $("#profileConfidence").textContent = confidenceLabel(p.record_confidence);
    $("#profileAvatar").textContent = genderIcon(p.gender);
    $("#profileFather").textContent = f.father?.full_name_ar || "—";
    $("#profileMother").textContent = f.mother?.full_name_ar || "—";
    $("#profileSpouses").textContent = f.spouses.length ? f.spouses.map(x => x.full_name_ar).join("، ") : "—";
    $("#profileChildren").textContent = f.children.length ? f.children.map(x => x.full_name_ar).join("، ") : "—";
    $("#profileBirthPlace").textContent = getPlace(p.birth_place_id)?.name_ar || "—";
    $("#profileDeathPlace").textContent = getPlace(p.death_place_id)?.name_ar || "—";
    $("#profileBio").textContent = p.bio || "لا توجد نبذة مسجلة.";
    $("#personModal").classList.remove("hidden");
    $("#personModal").setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    $("#personModal").classList.add("hidden");
    $("#personModal").setAttribute("aria-hidden", "true");
  }

  function fillPersonSelects() {
    const ids = ["#pFather","#pMother","#eventPerson","#libPerson","#kinshipA","#kinshipB","#lineagePerson"];
    ids.forEach(sel => {
      const el = $(sel);
      if (!el) return;
      const first = el.querySelector("option[value='']")?.outerHTML || "";
      el.innerHTML = first;
      state.people.forEach(p => {
        if (sel === "#pFather" && p.gender === "female") return;
        if (sel === "#pMother" && p.gender === "male") return;
        el.add(new Option(p.full_name_ar, p.id));
      });
    });
  }

  function buildTreeElements() {
    const out = [];
    state.people.forEach(p => out.push({data:{id:p.id,label:p.full_name_ar,gender:p.gender}}));
    state.relations.forEach(r => out.push({data:{id:`pc-${r.id}`,source:r.parent_id,target:r.child_id,kind:"parent"}}));
    state.marriages.forEach(m => out.push({data:{id:`m-${m.id}`,source:m.person1_id,target:m.person2_id,kind:"marriage"}}));
    return out;
  }

  function renderTree() {
    const c = $("#cy"), empty = $("#treeEmpty");
    if (!state.people.length) {
      c.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    c.classList.remove("hidden"); empty.classList.add("hidden");
    if (state.cy) state.cy.destroy();
    state.cy = cytoscape({
      container:c,elements:buildTreeElements(),wheelSensitivity:.18,minZoom:.22,maxZoom:2.5,
      style:[
        {selector:"node",style:{"background-color":"#fffaf0","border-width":2,"border-color":"#c29d4d","label":"data(label)","text-wrap":"wrap","text-max-width":140,"font-family":"Arial","font-size":12,"font-weight":700,"color":"#173f35","width":160,"height":62,"shape":"round-rectangle","text-valign":"center","text-halign":"center","overlay-opacity":0}},
        {selector:'node[gender = "female"]',style:{"border-color":"#c799a3","background-color":"#fff8f8"}},
        {selector:'edge[kind = "parent"]',style:{"width":2,"line-color":"#245f51","target-arrow-color":"#245f51","target-arrow-shape":"triangle","curve-style":"bezier","arrow-scale":.7}},
        {selector:'edge[kind = "marriage"]',style:{"width":2,"line-style":"dashed","line-color":"#b8892d","curve-style":"bezier"}},
        {selector:".search-hit",style:{"background-color":"#f4dda4","border-width":4,"border-color":"#0f4d3f"}}
      ],
      layout:{name:"dagre",rankDir:"TB",rankSep:105,nodeSep:48,edgeSep:18,padding:40}
    });
    state.cy.on("tap","node", e => openPerson(e.target.id()));
  }

  function renderHistory() {
    const list = $("#historyList"), empty = $("#historyEmpty");
    const rows = [...state.events].sort((a,b) => (a.event_year || parseInt((a.event_date||"9999").slice(0,4),10) || 9999) - (b.event_year || parseInt((b.event_date||"9999").slice(0,4),10) || 9999));
    list.innerHTML = "";
    empty.classList.toggle("hidden", rows.length > 0);
    rows.forEach(ev => {
      const person = getPerson(ev.person_id), place = getPlace(ev.place_id);
      const year = ev.event_year || (ev.event_date ? String(ev.event_date).slice(0,4) : "—");
      const card = document.createElement("article");
      card.className = "history-card";
      card.innerHTML = `<div class="history-year">${escapeHtml(year)}</div><div><span class="badge history-badge">${escapeHtml(eventTypeLabel(ev.event_type))}</span><h3>${escapeHtml(ev.title || person?.full_name_ar || "حدث عائلي")}</h3><p>${person ? `<strong>${escapeHtml(person.full_name_ar)}</strong>` : ""}${place ? ` • ${escapeHtml(place.name_ar)}` : ""}</p>${ev.description ? `<p>${escapeHtml(ev.description)}</p>` : ""}</div>`;
      if (person) card.addEventListener("click", () => openPerson(person.id));
      list.appendChild(card);
    });
  }

  function categoryMatches(item, filter) {
    if (filter === "all") return true;
    if (filter === "documents") return ["document","correspondence"].includes(item.item_type);
    if (filter === "records") return ["record","land_record"].includes(item.item_type);
    if (filter === "photos") return item.item_type === "photo";
    if (filter === "media") return ["video","audio","oral_history"].includes(item.item_type);
    if (filter === "genealogy") return item.item_type === "genealogy";
    if (filter === "maps") return item.item_type === "map";
    if (filter === "vault") return item.access_level === "vault";
    return true;
  }

  function linkedPeopleForItem(itemId) {
    return state.libraryPeople.filter(x => x.item_id === itemId).map(x => getPerson(x.person_id)).filter(Boolean);
  }

  function renderLibrary() {
    const grid = $("#libraryGrid"), empty = $("#libraryEmpty");
    const q = ($("#librarySearch")?.value || "").trim().toLowerCase();
    const rows = state.library.filter(item => categoryMatches(item, state.libraryFilter) && (!q || [item.title,item.summary,item.reference_code,(item.keywords||[]).join(" ")].join(" ").toLowerCase().includes(q)));
    grid.innerHTML = "";
    empty.classList.toggle("hidden", rows.length > 0);
    rows.forEach(item => {
      const people = linkedPeopleForItem(item.id);
      const card = document.createElement("article");
      card.className = "library-card";
      const accessClass = item.access_level === "vault" ? "access-vault" : item.access_level === "restricted" ? "access-restricted" : "";
      card.innerHTML = `<div class="library-card-top"><span class="library-card-icon">${itemTypeIcon(item.item_type)}</span><span class="library-card-code">${escapeHtml(item.reference_code || itemTypeLabel(item.item_type))}</span></div><div class="library-card-body"><div class="library-meta"><span class="meta-pill">${escapeHtml(itemTypeLabel(item.item_type))}</span>${item.record_year ? `<span class="meta-pill">${item.record_year}</span>` : ""}<span class="meta-pill ${accessClass}">${escapeHtml(accessLabel(item.access_level))}</span><span class="meta-pill">${escapeHtml(confidenceLabel(item.confidence))}</span></div><h3>${escapeHtml(item.title)}</h3>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}${people.length ? `<p>مرتبط بـ: <strong>${escapeHtml(people.map(p=>p.full_name_ar).join("، "))}</strong></p>` : ""}<div class="library-actions">${item.file_path ? `<button class="btn light open-file" data-path="${escapeHtml(item.file_path)}">فتح المرفق</button>` : ""}${item.external_url ? `<button class="btn light open-url" data-url="${escapeHtml(item.external_url)}">فتح الرابط</button>` : ""}</div></div>`;
      grid.appendChild(card);
    });
    $$(".open-file").forEach(b => b.addEventListener("click", async () => {
      const { data, error } = await client.storage.from("family-library").createSignedUrl(b.dataset.path, 120);
      if (error || !data?.signedUrl) return toast("تعذر فتح المرفق.");
      window.open(data.signedUrl, "_blank", "noopener");
    }));
    $$(".open-url").forEach(b => b.addEventListener("click", () => window.open(b.dataset.url, "_blank", "noopener")));
  }

  function ancestorInfo(startId) {
    const dist = new Map([[startId,0]]), prev = new Map();
    const q = [startId];
    while (q.length) {
      const cur = q.shift(), d = dist.get(cur);
      const parents = state.relations.filter(r => r.child_id === cur).map(r => r.parent_id);
      for (const p of parents) {
        if (!dist.has(p)) { dist.set(p,d+1); prev.set(p,cur); q.push(p); }
      }
    }
    return {dist,prev};
  }

  function upwardPath(startId, targetId) {
    if (startId === targetId) return [startId];
    const q = [startId], seen = new Set([startId]), prev = new Map();
    while (q.length) {
      const cur = q.shift();
      const parents = state.relations.filter(r => r.child_id === cur).map(r => r.parent_id);
      for (const p of parents) {
        if (seen.has(p)) continue;
        seen.add(p); prev.set(p,cur);
        if (p === targetId) {
          const rev = [p]; let x = p;
          while (x !== startId) { x = prev.get(x); rev.push(x); }
          return rev.reverse();
        }
        q.push(p);
      }
    }
    return null;
  }

  function findCommonAncestor(a,b) {
    const A = ancestorInfo(a), B = ancestorInfo(b);
    let best = null;
    for (const [id, da] of A.dist) {
      if (!B.dist.has(id)) continue;
      const db = B.dist.get(id), score = da + db;
      if (!best || score < best.score || (score === best.score && Math.max(da,db) < Math.max(best.da,best.db))) best = {id,da,db,score};
    }
    return best;
  }

  function directMarriage(a,b) {
    return state.marriages.some(m => (m.person1_id === a && m.person2_id === b) || (m.person1_id === b && m.person2_id === a));
  }

  function renderKinship() {
    const a = $("#kinshipA").value, b = $("#kinshipB").value, box = $("#kinshipResult");
    if (!a || !b) return toast("اختر الشخصين أولًا.");
    if (a === b) { box.innerHTML = `<div class="intro-stage"><div class="stage-symbol">☺</div><h3>هذا هو الشخص نفسه</h3></div>`; return; }
    const common = findCommonAncestor(a,b);
    if (!common) {
      if (directMarriage(a,b)) box.innerHTML = `<div class="intro-stage"><div class="stage-symbol">💍</div><h3>مرتبطان بعلاقة زواج مسجلة</h3><p>لم نجد جدًا مشتركًا ضمن البيانات الحالية.</p></div>`;
      else box.innerHTML = `<div class="intro-stage"><div class="stage-symbol">?</div><h3>لم نجد مسار قرابة دمويًا</h3><p>قد تكون بعض الأجيال أو الروابط غير مسجلة بعد.</p></div>`;
      return;
    }
    const pA = upwardPath(a, common.id) || [a,common.id];
    const pB = upwardPath(b, common.id) || [b,common.id];
    const combined = [...pA, ...pB.slice(0,-1).reverse()];
    const commonPerson = getPerson(common.id);
    let label = `أقرب جد مشترك: ${commonPerson?.full_name_ar || "غير معروف"}`;
    if (common.da === 1 && common.db === 1) label = `يلتقيان عند ${commonPerson?.full_name_ar} — قرابة إخوة/أخوات`;
    box.innerHTML = `<div class="journey-summary">${escapeHtml(label)}</div><div class="kinship-path">${combined.map((id,i) => `<div class="journey-node ${id===common.id ? "common" : ""}" style="transition-delay:${i*120}ms">${escapeHtml(getPerson(id)?.full_name_ar || "؟")}</div>${i<combined.length-1 ? `<div class="journey-arrow">←</div>` : ""}`).join("")}</div>`;
    requestAnimationFrame(() => $$("#kinshipResult .journey-node").forEach(n => n.classList.add("show")));
  }

  function fatherChain(startId) {
    const out = [], seen = new Set(); let cur = startId;
    while (cur && !seen.has(cur)) {
      seen.add(cur); out.push(cur);
      const father = state.relations.find(r => r.child_id === cur && r.parent_role === "father");
      cur = father?.parent_id || null;
    }
    return out;
  }

  function renderLineage(startId) {
    const id = startId || $("#lineagePerson").value;
    const box = $("#lineageStage");
    if (!id) return toast("اختر شخصًا أولًا.");
    const chain = fatherChain(id);
    box.innerHTML = `<div class="journey-summary">مسار النسب الأبوي • ${chain.length} ${chain.length === 1 ? "اسم" : "أسماء"}</div><div class="lineage-path">${chain.map((pid,i) => `<div class="journey-node ${i===chain.length-1 ? "common" : ""}" style="transition-delay:${i*260}ms"><small>${i===0 ? "البداية" : i===chain.length-1 ? "أقدم جد مسجل" : `الجيل ${i+1}`}</small><br>${escapeHtml(getPerson(pid)?.full_name_ar || "؟")}</div>${i<chain.length-1 ? `<div class="journey-arrow">↑</div>` : ""}`).join("")}</div>`;
    setTimeout(() => $$("#lineageStage .journey-node").forEach(n => n.classList.add("show")), 30);
  }

  function renderAccountRequests() {
    if (state.role !== "admin") return;
    const box = $("#accountRequests");
    const pending = state.adminUsers.filter(u => u.status === "pending");
    $("#pendingCount").textContent = pending.length;
    if (!pending.length) { box.innerHTML = `<div class="empty-state"><div>✓</div><h3>لا توجد طلبات معلقة</h3></div>`; return; }
    box.innerHTML = pending.map(u => `<div class="account-row"><div><strong>${escapeHtml(u.display_name || "بدون اسم")}</strong><small>${escapeHtml(u.email || "")}</small></div><div><small>تاريخ الطلب</small><br>${new Date(u.requested_at).toLocaleDateString("ar")}</div><div class="account-actions"><button class="btn primary approve-user" data-id="${u.id}" data-role="viewer">قبول كمشاهد</button><button class="btn gold approve-user" data-id="${u.id}" data-role="editor">قبول كمدخل بيانات</button><button class="btn light reject-user" data-id="${u.id}">رفض</button></div></div>`).join("");
    $$(".approve-user").forEach(b => b.addEventListener("click", () => updateUserAccess(b.dataset.id,{status:"active",role:b.dataset.role,approved_at:new Date().toISOString(),approved_by:state.session.user.id}))); 
    $$(".reject-user").forEach(b => b.addEventListener("click", () => updateUserAccess(b.dataset.id,{status:"rejected"})));
  }

  function renderUsers() {
    if (state.role !== "admin") return;
    const box = $("#userManagement");
    const users = state.adminUsers.filter(u => u.status !== "pending");
    box.innerHTML = users.map(u => `<div class="account-row"><div><strong>${escapeHtml(u.display_name || "بدون اسم")}</strong><small>${escapeHtml(u.email || "")}</small></div><div><span class="meta-pill">${escapeHtml(statusLabel(u.status))}</span></div><div class="account-actions"><select class="role-select user-role" data-id="${u.id}"><option value="viewer" ${u.role==="viewer"?"selected":""}>مشاهد</option><option value="editor" ${u.role==="editor"?"selected":""}>مدخل بيانات</option><option value="admin" ${u.role==="admin"?"selected":""}>مدير</option></select>${u.id !== state.session.user.id ? `<button class="btn light toggle-user" data-id="${u.id}" data-status="${u.status}">${u.status === "suspended" ? "إعادة التفعيل" : "إيقاف"}</button>` : ""}</div></div>`).join("");
    $$(".user-role").forEach(s => s.addEventListener("change", () => updateUserAccess(s.dataset.id,{role:s.value,status:"active"})));
    $$(".toggle-user").forEach(b => b.addEventListener("click", () => updateUserAccess(b.dataset.id,{status:b.dataset.status === "suspended" ? "active" : "suspended"})));
  }

  async function updateUserAccess(id, patch) {
    const { error } = await client.from("profiles").update(patch).eq("id", id);
    if (error) return toast("تعذر تحديث الحساب: " + error.message, 4500);
    toast("تم تحديث الحساب ✅");
    await loadAdminData();
  }

  function renderAudit() {
    if (state.role !== "admin") return;
    const box = $("#auditList");
    if (!state.audit.length) { box.innerHTML = `<div class="empty-state"><div>🛡️</div><h3>لا توجد تعديلات مسجلة بعد</h3></div>`; return; }
    box.innerHTML = state.audit.map(a => `<div class="audit-row"><div>${new Date(a.changed_at).toLocaleString("ar")}</div><div><span class="meta-pill">${escapeHtml(a.action)}</span></div><div><b>${escapeHtml(a.table_name)}</b> <code>${escapeHtml((a.record_id||"").slice(0,12))}</code></div></div>`).join("");
  }

  async function ensurePlace(name) {
    const clean = (name || "").trim();
    if (!clean) return null;
    const found = state.places.find(p => p.name_ar.trim().toLowerCase() === clean.toLowerCase());
    if (found) return found.id;
    const { data, error } = await client.from("places").insert({name_ar:clean}).select().single();
    if (error) throw error;
    state.places.push(data);
    return data.id;
  }

  async function addAutomaticLifeEvents(person, birthPlaceId, deathPlaceId) {
    const rows = [];
    if (person.birth_year || birthPlaceId) rows.push({person_id:person.id,event_type:"birth",event_year:person.birth_year,place_id:birthPlaceId,title:`ميلاد ${person.full_name_ar}`,confidence:person.record_confidence});
    if (!person.is_living && (person.death_year || deathPlaceId)) rows.push({person_id:person.id,event_type:"death",event_year:person.death_year,place_id:deathPlaceId,title:`وفاة ${person.full_name_ar}`,confidence:person.record_confidence});
    if (rows.length) await client.from("life_events").insert(rows);
  }

  function setView(name) {
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
    $$(".nav-btn[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    if (name === "tree" && state.cy) setTimeout(() => {state.cy.resize();state.cy.fit(undefined,40);},50);
    if (name === "admin" && state.role === "admin") loadAdminData();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function setLibraryFilter(filter) {
    state.libraryFilter = filter;
    $$(".filter-chip").forEach(b => b.classList.toggle("active", b.dataset.filter === filter));
    setView("library");
    renderLibrary();
  }

  function setAdminPanel(name) {
    $$(".admin-panel").forEach(p => p.classList.toggle("active", p.id === `admin-${name}`));
    $$(".admin-tab").forEach(b => b.classList.toggle("active", b.dataset.adminPanel === name));
  }

  // AUTH UI
  $("#loginTab").addEventListener("click", () => {
    $("#loginTab").classList.add("active"); $("#signupTab").classList.remove("active");
    $("#loginForm").classList.remove("hidden"); $("#signupForm").classList.add("hidden"); authMsg.textContent = "";
  });
  $("#signupTab").addEventListener("click", () => {
    $("#signupTab").classList.add("active"); $("#loginTab").classList.remove("active");
    $("#signupForm").classList.remove("hidden"); $("#loginForm").classList.add("hidden"); authMsg.textContent = "";
  });

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault(); authMsg.textContent = "جاري الدخول...";
    const { data, error } = await client.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
    if (error) { authMsg.textContent = "تعذر تسجيل الدخول: " + error.message; return; }
    authMsg.textContent = ""; await enterSession(data.session);
  });

  $("#signupForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#signupName").value.trim(), email = $("#signupEmail").value.trim(), p1 = $("#signupPassword").value, p2 = $("#signupPassword2").value;
    if (p1 !== p2) { authMsg.textContent = "كلمتا المرور غير متطابقتين."; return; }
    authMsg.textContent = "جاري إنشاء الطلب...";
    const { data, error } = await client.auth.signUp({email,password:p1,options:{data:{display_name:name},emailRedirectTo:window.location.href}});
    if (error) { authMsg.textContent = "تعذر إنشاء الحساب: " + error.message; return; }
    if (data.session) { authMsg.textContent = ""; await enterSession(data.session); }
    else authMsg.textContent = "تم إنشاء الطلب. إذا كان تأكيد البريد مفعّلًا، افتح رسالة Supabase في بريدك أولًا، ثم سجّل الدخول. بعدها يبقى الحساب بانتظار موافقة الإدارة.";
  });

  $("#forgotBtn").addEventListener("click", async () => {
    const email = $("#email").value.trim();
    if (!email) { authMsg.textContent = "اكتب بريدك أولًا."; return; }
    const { error } = await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});
    authMsg.textContent = error ? "تعذر إرسال الرابط: " + error.message : "تم إرسال رابط استعادة كلمة المرور إذا كان البريد مسجلًا.";
  });

  $("#logoutBtn").addEventListener("click", signOut);
  $("#statusLogoutBtn").addEventListener("click", signOut);

  // NAVIGATION
  $$(".nav-btn[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  $$('[data-go]').forEach(b => b.addEventListener("click", () => setView(b.dataset.go)));
  $$('[data-close-modal]').forEach(el => el.addEventListener("click", closeModal));
  $$(".admin-tab").forEach(b => b.addEventListener("click", () => setAdminPanel(b.dataset.adminPanel)));
  $$("[data-library-filter]").forEach(b => b.addEventListener("click", () => setLibraryFilter(b.dataset.libraryFilter)));
  $$(".filter-chip").forEach(b => b.addEventListener("click", () => setLibraryFilter(b.dataset.filter)));

  $("#peopleSearch").addEventListener("input", e => renderPeople(e.target.value));
  $("#librarySearch").addEventListener("input", renderLibrary);
  $("#treeSearch").addEventListener("input", e => {
    if (!state.cy) return;
    const q = e.target.value.trim().toLowerCase(); state.cy.nodes().removeClass("search-hit");
    if (!q) return;
    const hits = state.cy.nodes().filter(n => (n.data("label")||"").toLowerCase().includes(q));
    hits.addClass("search-hit"); if (hits.length) state.cy.animate({fit:{eles:hits,padding:120},duration:350});
  });
  $("#fitTreeBtn").addEventListener("click", () => state.cy?.fit(undefined,40));
  $("#relayoutBtn").addEventListener("click", () => state.cy?.layout({name:"dagre",rankDir:"TB",rankSep:105,nodeSep:48,padding:40}).run());
  $("#findKinshipBtn").addEventListener("click", renderKinship);
  $("#startLineageBtn").addEventListener("click", () => renderLineage());
  $("#profileLineageBtn").addEventListener("click", () => { const id=state.activePersonId; closeModal(); setView("lineage"); $("#lineagePerson").value=id; renderLineage(id); });
  $("#profileKinshipBtn").addEventListener("click", () => { const id=state.activePersonId; closeModal(); setView("kinship"); $("#kinshipA").value=id; });

  // ADD PERSON
  $("#addPersonForm").addEventListener("submit", async e => {
    e.preventDefault(); if (!["admin","editor"].includes(state.role)) return;
    const msg = $("#adminMsg"); msg.textContent = "جاري الحفظ...";
    try {
      const birthPlaceId = await ensurePlace($("#pBirthPlace").value);
      const deathPlaceId = await ensurePlace($("#pDeathPlace").value);
      const person = {
        full_name_ar:$("#pName").value.trim(),gender:$("#pGender").value,
        birth_year:toNullInt($("#pBirthYear").value),death_year:toNullInt($("#pDeathYear").value),
        birth_place_id:birthPlaceId,death_place_id:deathPlaceId,is_living:$("#pLiving").checked,
        record_confidence:$("#pConfidence").value,bio:$("#pBio").value.trim() || null,
        created_by:state.session.user.id,updated_by:state.session.user.id
      };
      const { data, error } = await client.from("people").insert(person).select().single(); if (error) throw error;
      const rels = [];
      if ($("#pFather").value) rels.push({parent_id:$("#pFather").value,child_id:data.id,parent_role:"father",relation_kind:"biological",confidence:person.record_confidence,created_by:state.session.user.id});
      if ($("#pMother").value) rels.push({parent_id:$("#pMother").value,child_id:data.id,parent_role:"mother",relation_kind:"biological",confidence:person.record_confidence,created_by:state.session.user.id});
      if (rels.length) { const { error:re } = await client.from("parent_child_relations").insert(rels); if (re) throw re; }
      await addAutomaticLifeEvents(data,birthPlaceId,deathPlaceId);
      e.target.reset(); $("#pLiving").checked = true; msg.textContent = "تمت إضافة الشخص بنجاح ✅"; await loadData(); toast("أضيف الشخص إلى شجرة آل شجاع");
    } catch (err) { console.error(err); msg.textContent = "خطأ: " + err.message; }
  });

  // ADD EVENT
  $("#addEventForm").addEventListener("submit", async e => {
    e.preventDefault(); const msg = $("#eventMsg"); msg.textContent = "جاري الحفظ...";
    try {
      const placeId = await ensurePlace($("#eventPlace").value);
      const row = {person_id:$("#eventPerson").value,event_type:$("#eventType").value,event_year:toNullInt($("#eventYear").value),place_id:placeId,title:$("#eventTitle").value.trim()||null,description:$("#eventDescription").value.trim()||null,confidence:$("#eventConfidence").value};
      const { error } = await client.from("life_events").insert(row); if (error) throw error;
      e.target.reset(); msg.textContent = "تم حفظ الحدث ✅"; await loadData();
    } catch (err) { msg.textContent = "خطأ: " + err.message; }
  });

  // ADD LIBRARY ITEM
  $("#addLibraryForm").addEventListener("submit", async e => {
    e.preventDefault(); const msg = $("#libraryAdminMsg"); msg.textContent = "جاري إضافة المادة...";
    try {
      const keywords = $("#libKeywords").value.split(/[,،]/).map(x=>x.trim()).filter(Boolean);
      const row = {title:$("#libTitle").value.trim(),item_type:$("#libType").value,record_year:toNullInt($("#libYear").value),summary:$("#libSummary").value.trim()||null,keywords,confidence:$("#libConfidence").value,access_level:$("#libAccess").value,external_url:$("#libExternalUrl").value.trim()||null,created_by:state.session.user.id,updated_by:state.session.user.id,status:"published"};
      const { data:item, error } = await client.from("library_items").insert(row).select().single(); if (error) throw error;
      const personId = $("#libPerson").value;
      if (personId) { const { error:linkErr } = await client.from("library_item_people").insert({item_id:item.id,person_id:personId}); if (linkErr) throw linkErr; }
      const file = $("#libFile").files[0];
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g,"-");
        const path = `${item.id}/${Date.now()}-${safe}`;
        const { error:upErr } = await client.storage.from("family-library").upload(path,file,{contentType:file.type||undefined,upsert:false});
        if (upErr) throw upErr;
        const { error:updateErr } = await client.from("library_items").update({file_path:path,mime_type:file.type||null,updated_by:state.session.user.id}).eq("id",item.id);
        if (updateErr) throw updateErr;
      }
      e.target.reset(); msg.textContent = "تمت الإضافة إلى مكتبة آل شجاع ✅"; await loadData(); toast("أضيفت مادة جديدة إلى المكتبة");
    } catch (err) { console.error(err); msg.textContent = "خطأ: " + err.message; }
  });

  // INIT
  client.auth.getSession().then(async ({data}) => {
    if (data.session) await enterSession(data.session); else showAuth();
  });
  client.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT") showAuth();
    if (session && !state.session) await enterSession(session);
  });

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=2.0.0").catch(console.warn));
})();
