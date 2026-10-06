(() => {
  const cfg = window.SHUGAA_CONFIG;
  const client = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

  const state = {
    mode: null, // general | personal | account
    accessCode: null,
    accessPersonId: null,
    session: null,
    profile: null,
    role: "viewer",
    status: "pending",
    permissions: {},
    people: [],
    relations: [],
    marriages: [],
    branches: [],
    events: [],
    places: [],
    library: [],
    libraryPeople: [],
    adminUsers: [],
    accessCodes: [],
    changeRequests: [],
    permissionCatalog: [],
    profilePermissions: [],
    audit: [],
    cy: null,
    activePersonId: null,
    libraryFilter: "all",
    lastDuplicateCheckKey: "",
    changeFilter: "pending"
  };

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const gate = $("#gateScreen"), statusScreen = $("#statusScreen"), app = $("#app");

  const esc = v => String(v ?? "").replace(/[&<>"']/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[s]));
  const norm = v => String(v ?? "").trim().toLowerCase();
  const toInt = v => { const n = parseInt(v,10); return Number.isFinite(n) ? n : null; };

  function toast(msg, ms=3000){ const e=$("#toast"); e.textContent=msg; e.classList.remove("hidden"); clearTimeout(e._t); e._t=setTimeout(()=>e.classList.add("hidden"),ms); }
  function roleLabel(v){ return ({admin:"مدير",editor:"مدخل بيانات",viewer:"مشاهد"})[v] || "مشاهد"; }
  function statusLabel(v){ return ({pending:"بانتظار المراجعة",in_review:"قيد المراجعة",needs_info:"نحتاج توضيحًا",approved:"معتمد",partially_approved:"معتمد جزئيًا",rejected:"مرفوض",withdrawn:"مسحوب"})[v] || v; }
  function requestTypeLabel(t){
    return ({
      add_person:"إضافة شخص",
      add_family:"إضافة أسرة",
      correct_name:"تصحيح اسم",
      add_parent:"إضافة أب",
      change_parent:"تصحيح الأب",
      add_mother:"إضافة أم",
      change_mother:"تصحيح الأم",
      add_spouse:"إضافة زوج/زوجة",
      add_child:"إضافة ابن/ابنة",
      life_event:"معلومة تاريخية",
      library_evidence:"دليل / وثيقة",
      duplicate_report:"تكرار محتمل",
      merge_request:"طلب دمج",
      relation_correction:"تصحيح صلة قرابة",
      profile_claim:"ربط الحساب بالملف",
      other:"طلب آخر"
    })[t] || t || "طلب";
  }
  function confidenceLabel(v){ return ({documented:"موثق",family_tradition:"متوارث عائليًا",likely:"مرجح",uncertain:"غير مؤكد"})[v] || "غير محدد"; }
  function genderIcon(v){ return v==="female" ? "ن" : v==="male" ? "ش" : "•"; }
  function yearText(p){
    const b=p.birth_year || (p.birth_date ? String(p.birth_date).slice(0,4) : "");
    const d=p.death_year || (p.death_date ? String(p.death_date).slice(0,4) : "");
    if(b||d) return `${b||"؟"} — ${p.is_living ? "حتى الآن" : (d||"؟")}`;
    return p.is_living ? "على قيد الحياة" : "التاريخ غير مسجل";
  }
  function itemTypeLabel(t){ return ({document:"وثيقة",record:"سجل",land_record:"سجل أرض / ملكية",photo:"صورة",video:"فيديو",audio:"تسجيل صوتي",oral_history:"رواية شفهية",genealogy:"مشجرة / نسب",correspondence:"مراسلة",map:"خريطة",historical_event:"مادة تاريخية",other:"أخرى"})[t]||"مادة"; }
  function itemTypeIcon(t){ return ({document:"📜",record:"📚",land_record:"🧾",photo:"📷",video:"🎥",audio:"🎧",oral_history:"🎙️",genealogy:"🌳",correspondence:"✉️",map:"🗺️",historical_event:"🏺",other:"📦"})[t]||"📦"; }

  function showGate(){
    state.mode=null; state.accessCode=null; state.accessPersonId=null;
    sessionStorage.removeItem("shugaa_access_mode"); sessionStorage.removeItem("shugaa_access_code");
    document.body.classList.remove("guest-mode","mode-general","mode-personal");
    gate.classList.remove("hidden"); statusScreen.classList.add("hidden"); app.classList.add("hidden");
    $$(".gate-form").forEach(x=>x.classList.add("hidden")); $$(".gate-cards").forEach(x=>x.classList.remove("hidden"));
  }
  function showApp(){ gate.classList.add("hidden"); statusScreen.classList.add("hidden"); app.classList.remove("hidden"); }
  function showStatus(s){
    gate.classList.add("hidden"); app.classList.add("hidden"); statusScreen.classList.remove("hidden");
    if(s==="rejected"){ $("#statusIcon").textContent="✕"; $("#statusTitle").textContent="الحساب غير معتمد"; $("#statusText").textContent="تواصل مع إدارة العائلة إذا كنت تعتقد أن هناك خطأ."; }
    else if(s==="suspended"){ $("#statusIcon").textContent="⏸"; $("#statusTitle").textContent="الحساب موقوف"; $("#statusText").textContent="تم إيقاف الوصول مؤقتًا."; }
    else { $("#statusIcon").textContent="⌛"; $("#statusTitle").textContent="طلبك بانتظار الموافقة"; $("#statusText").textContent="سيتم فتح الحساب بعد موافقة الإدارة."; }
  }

  async function enterCodeMode(code, expectedMode){
    const msg = expectedMode==="general" ? $("#generalCodeMsg") : $("#personalCodeMsg");
    msg.textContent="جاري التحقق...";
    const {data,error}=await client.rpc("guest_tree_by_code",{p_code:code});
    if(error){ msg.textContent="تعذر الدخول: "+error.message; return; }
    if(expectedMode==="personal" && data?.mode!=="personal"){ msg.textContent="هذا ليس كودًا شخصيًا."; return; }
    state.mode = data?.mode==="personal" ? "personal" : "general";
    state.accessCode=code; state.accessPersonId=data?.person_id || null;
    state.people=(data?.people||[]).filter(p=>p);
    state.relations=data?.relations||[]; state.marriages=data?.marriages||[];
    state.events=[]; state.places=[]; state.library=[]; state.libraryPeople=[]; state.branches=[];
    sessionStorage.setItem("shugaa_access_mode",state.mode); sessionStorage.setItem("shugaa_access_code",code);
    document.body.classList.add("guest-mode",`mode-${state.mode}`);
    applyModeUI(); showApp(); renderAllPublic();
    if(state.mode==="personal") await loadPersonalRequests();
    setView("home"); msg.textContent="";
  }

  async function getMyProfile(){
    const uid=state.session?.user?.id; if(!uid) return null;
    const {data,error}=await client.from("profiles").select("*").eq("id",uid).maybeSingle();
    if(error) throw error; return data;
  }

  async function loadPermissions(){
    state.permissions={};
    if(!state.session || !["admin","editor"].includes(state.role)) return;
    const codes=["add_people","add_events","add_library","edit_basic_person","edit_genealogy_direct","merge_people","archive_people","review_basic_requests","review_sensitive_requests","manage_access_codes","manage_users","view_vault"];
    await Promise.all(codes.map(async c=>{ const {data}=await client.rpc("has_permission",{p_permission:c}); state.permissions[c]=!!data; }));
  }

  async function enterAccount(session){
    state.mode="account"; state.session=session;
    try{ state.profile=await getMyProfile(); }catch(e){ $("#authMsg").textContent="تعذر قراءة الحساب."; return; }
    state.role=state.profile?.role||"viewer"; state.status=state.profile?.status||"pending";
    if(state.status!=="active"){ showStatus(state.status); return; }
    await loadPermissions();
    await maybeClaimPendingCode();
    applyModeUI(); showApp();
    try{ await loadAccountData(); }catch(e){ console.error(e); toast("تعذر تحميل بعض البيانات: "+e.message,4500); }
    setView("home");
  }

  async function maybeClaimPendingCode(){
    const code=localStorage.getItem("shugaa_pending_claim_code"); if(!code || state.profile?.person_id) return;
    const {data,error}=await client.rpc("claim_my_profile_with_code",{p_code:code});
    if(!error && data?.linked){ localStorage.removeItem("shugaa_pending_claim_code"); state.profile=await getMyProfile(); toast(`تم ربط حسابك بملف ${data.person_name} ✅`,4500); }
  }

  function applyModeUI(){
    const account=state.mode==="account", personal=state.mode==="personal";
    $$(".account-only").forEach(e=>e.classList.toggle("hidden",!account));
    $$(".contribution-only").forEach(e=>e.classList.toggle("hidden",!(personal||account)));
    $$(".personal-mode-only").forEach(e=>e.classList.toggle("hidden",!personal));
    const staff=account&&["admin","editor"].includes(state.role), admin=account&&state.role==="admin";
    $$(".staff-only").forEach(e=>e.classList.toggle("hidden",!staff));
    $$(".admin-only").forEach(e=>e.classList.toggle("hidden",!admin));
    $$(".linked-account-only").forEach(e=>e.classList.toggle("hidden",!(account&&state.profile?.person_id)));
    $("#userRoleBadge").textContent = account ? roleLabel(state.role) : personal ? "كود شخصي" : "دخول العائلة";
    $("#userWelcome").textContent = account ? (state.profile?.display_name||"") : personal ? (getPerson(state.accessPersonId)?.full_name_ar||"مساهم") : "";
    $("#modeSubtitle").textContent = account ? "Shugaa Family Tree" : personal ? "بوابة المساهمة العائلية" : "عرض النسب العائلي";
    $("#homeKicker").textContent = account ? "متحف آل شجاع الرقمي" : personal ? "بوابة المساهمة العائلية" : "عرض النسب وصلة القرابة";
    $("#homeIntro").textContent = account ? "استكشف النسب والتاريخ والمكتبة حسب صلاحيتك." : personal ? "استعرض الشجرة، ثم أضف أسرتك أو أرسل تصحيحًا للإدارة." : "استعرض شجرة النسب، ابحث عن الأسماء، واكتشف صلة القرابة — دون فتح الصور أو الوثائق أو السجلات.";
    if(personal){
      const p=getPerson(state.accessPersonId);
      $("#contribName").value=p?.full_name_ar||"";
      $("#linkedSignupName").value=p?.full_name_ar||"";
    }
  }

  async function loadAccountData(){
    const [pr,rr,mr,br,er,pl,lr,lpr]=await Promise.all([
      client.from("people").select("*").eq("record_status","active").order("full_name_ar"),
      client.from("parent_child_relations").select("*"),
      client.from("marriages").select("*"),
      client.from("branches").select("*"),
      client.from("life_events").select("*"),
      client.from("places").select("*"),
      client.from("library_items").select("*").order("created_at",{ascending:false}),
      client.from("library_item_people").select("*")
    ]);
    for(const r of [pr,rr,mr,br,er,pl,lr,lpr]) if(r.error) throw r.error;
    state.people=pr.data||[]; state.relations=rr.data||[]; state.marriages=mr.data||[]; state.branches=br.data||[]; state.events=er.data||[]; state.places=pl.data||[]; state.library=lr.data||[]; state.libraryPeople=lpr.data||[];
    renderAllPublic(); renderLibrary(); renderHistory(); renderLatest(); renderMyFamily();
    if(["admin","editor"].includes(state.role)) await loadStaffData();
  }

  async function loadStaffData(){
    const tasks=[];
    if(state.role==="admin"){
      tasks.push(client.from("profiles").select("*").order("requested_at",{ascending:false}).then(r=>{if(!r.error)state.adminUsers=r.data||[];}));
      tasks.push(client.from("access_codes").select("*").order("created_at",{ascending:false}).then(r=>{if(!r.error)state.accessCodes=r.data||[];}));
      tasks.push(client.from("audit_logs").select("*").order("changed_at",{ascending:false}).limit(100).then(r=>{if(!r.error)state.audit=r.data||[];}));
      tasks.push(client.from("permission_catalog").select("*").order("permission_code").then(r=>{if(!r.error)state.permissionCatalog=r.data||[];}));
      tasks.push(client.from("profile_permissions").select("*").then(r=>{if(!r.error)state.profilePermissions=r.data||[];}));
    }
    tasks.push(client.from("change_requests").select("*").order("created_at",{ascending:false}).limit(100).then(r=>{if(!r.error)state.changeRequests=r.data||[];}));
    await Promise.all(tasks);
    renderAdminAll();
  }

  function renderAllPublic(){ renderStats(); renderPeople(); fillPersonSelects(); renderTree(); renderHealth(); }
  function renderStats(){ $("#statPeople").textContent=state.people.length; $("#statRelations").textContent=state.relations.length; $("#statMarriages").textContent=state.marriages.length; $("#statLibrary").textContent=state.library.length; }

  function getPerson(id){ return state.people.find(p=>p.id===id); }
  function getPlace(id){ return state.places.find(p=>p.id===id); }
  function personLabel(p){ if(!p)return "—"; const extras=[]; if(p.father_name_text)extras.push(`ابن ${p.father_name_text}`); if(p.lineage_code)extras.push(`كود ${p.lineage_code}`); return extras.length ? `${p.full_name_ar} — ${extras.join(" • ")}` : p.full_name_ar; }

  function familyOf(id){
    const fr=state.relations.find(r=>r.child_id===id&&r.parent_role==="father"), mr=state.relations.find(r=>r.child_id===id&&r.parent_role==="mother");
    const kids=[...new Set(state.relations.filter(r=>r.parent_id===id).map(r=>r.child_id))].map(getPerson).filter(Boolean);
    const sids=state.marriages.flatMap(m=>m.person1_id===id?[m.person2_id]:m.person2_id===id?[m.person1_id]:[]);
    return {father:fr?getPerson(fr.parent_id):null,mother:mr?getPerson(mr.parent_id):null,children:kids,spouses:[...new Set(sids)].map(getPerson).filter(Boolean)};
  }

  function renderPeople(filter=""){
    const q=norm(filter), rows=state.people.filter(p=>!q||norm([p.full_name_ar,p.record_code,p.lineage_code,p.father_name_text,p.grandfather_name_text].join(" ")).includes(q));
    const grid=$("#peopleGrid"); grid.innerHTML=""; $("#peopleEmpty").classList.toggle("hidden",!!rows.length);
    rows.forEach(p=>{ const c=document.createElement("article"); c.className="person-card"; c.innerHTML=`<div class="avatar">${genderIcon(p.gender)}</div><div><h3>${esc(p.full_name_ar)}</h3><p>${esc(yearText(p))}</p><p>${p.lineage_code?`كود الأسرة: ${esc(p.lineage_code)}`:""}${state.mode==="account"&&p.record_code?` • ${esc(p.record_code)}`:""}</p></div>`; c.onclick=()=>openPerson(p.id); grid.appendChild(c); });
  }

  function openPerson(id){
    const p=getPerson(id); if(!p)return; state.activePersonId=id; const f=familyOf(id);
    $("#profileName").textContent=p.full_name_ar; $("#profileLife").textContent=yearText(p); $("#profileAvatar").textContent=genderIcon(p.gender);
    const fatherBtn=$("#profileFather"), motherBtn=$("#profileMother");
    fatherBtn.textContent=f.father?.full_name_ar||p.father_name_text||"—";
    motherBtn.textContent=f.mother?.full_name_ar||"—";
    fatherBtn.dataset.personId=f.father?.id||""; motherBtn.dataset.personId=f.mother?.id||"";
    fatherBtn.classList.toggle("is-linked",!!f.father); motherBtn.classList.toggle("is-linked",!!f.mother);
    $("#profileSpouses").textContent=f.spouses.length?f.spouses.map(x=>x.full_name_ar).join("، "):"—"; $("#profileChildren").textContent=f.children.length?f.children.map(x=>x.full_name_ar).join("، "):"—";
    $("#profileLineageCode").textContent=p.lineage_code?`الأسرة ${p.lineage_code}`:""; $("#profileRecordCode").textContent=state.mode==="account"&&p.record_code?p.record_code:"";
    $("#profileBio").textContent=state.mode==="account"?(p.bio||"لا توجد نبذة مسجلة."):"المعلومات الخاصة غير متاحة بهذا النوع من الدخول.";
    $("#personModal").classList.remove("hidden");
  }
  function closePerson(){ $("#personModal").classList.add("hidden"); }

  function fillPersonSelects(){
    const selectors=["#pFather","#pMother","#eventPerson","#libPerson","#kinshipA","#kinshipB","#lineagePerson","#contribTarget","#accessPerson"];
    selectors.forEach(sel=>{ const el=$(sel); if(!el)return; const blank=el.querySelector('option[value=""]')?.outerHTML||""; el.innerHTML=blank; state.people.forEach(p=>{ if(sel==="#pFather"&&p.gender==="female")return; if(sel==="#pMother"&&p.gender==="male")return; el.add(new Option(personLabel(p),p.id)); }); });
  }

  function buildTreeElements(){
    const out=[]; state.people.forEach(p=>out.push({data:{id:p.id,label:p.full_name_ar,gender:p.gender}}));
    state.relations.forEach(r=>{ if(getPerson(r.parent_id)&&getPerson(r.child_id)) out.push({data:{id:`r-${r.id}`,source:r.parent_id,target:r.child_id,kind:"parent"}}); });
    state.marriages.forEach(m=>{ if(getPerson(m.person1_id)&&getPerson(m.person2_id)) out.push({data:{id:`m-${m.id}`,source:m.person1_id,target:m.person2_id,kind:"marriage"}}); });
    return out;
  }
  function renderTree(){
    const c=$("#cy"); if(!state.people.length){c.classList.add("hidden");$("#treeEmpty").classList.remove("hidden");return;} c.classList.remove("hidden");$("#treeEmpty").classList.add("hidden");
    if(state.cy)state.cy.destroy();
    state.cy=cytoscape({container:c,elements:buildTreeElements(),wheelSensitivity:.18,minZoom:.2,maxZoom:2.6,
      style:[
        {selector:"node",style:{"background-color":"#fffaf0","border-width":2,"border-color":"#c29d4d","label":"data(label)","text-wrap":"wrap","text-max-width":140,"font-family":"Arial","font-size":12,"font-weight":700,"color":"#173f35","width":160,"height":62,"shape":"round-rectangle","text-valign":"center","text-halign":"center","overlay-opacity":0}},
        {selector:'node[gender="female"]',style:{"border-color":"#c799a3","background-color":"#fff8f8"}},
        {selector:'edge[kind="parent"]',style:{"width":2,"line-color":"#245f51","target-arrow-color":"#245f51","target-arrow-shape":"triangle","curve-style":"bezier","arrow-scale":.7}},
        {selector:'edge[kind="marriage"]',style:{"width":2,"line-style":"dashed","line-color":"#b8892d","curve-style":"bezier"}},
        {selector:".search-hit",style:{"background-color":"#f4dda4","border-width":4,"border-color":"#0f4d3f"}}
      ],layout:{name:"dagre",rankDir:"TB",rankSep:105,nodeSep:48,padding:40}});
    state.cy.on("tap","node",e=>openPerson(e.target.id()));
  }

  function ancestorsFrom(id){
    const parentMap=new Map(); state.relations.filter(r=>r.parent_role==="father"||r.parent_role==="parent").forEach(r=>{ if(!parentMap.has(r.child_id))parentMap.set(r.child_id,r.parent_id); });
    const chain=[]; const seen=new Set(); let cur=id; while(cur&&!seen.has(cur)){seen.add(cur);chain.push(cur);cur=parentMap.get(cur);} return chain;
  }
  function ancestorPaths(id){
    const map=new Map();
    function walk(pid,path,depth){ if(!pid||depth>50||path.includes(pid))return; if(!map.has(pid))map.set(pid,path.concat(pid)); const ps=state.relations.filter(r=>r.child_id===pid).map(r=>r.parent_id); ps.forEach(x=>walk(x,path.concat(pid),depth+1)); }
    walk(id,[],0); return map;
  }
  function renderLineage(id){
    id=id||$("#lineagePerson").value; if(!id)return; const chain=ancestorsFrom(id), stage=$("#lineageStage");
    stage.innerHTML=`<div class="journey-summary">مسار النسب الأبوي من ${esc(getPerson(id)?.full_name_ar||"")}</div><div class="lineage-path">${chain.map((pid,i)=>`<div class="journey-node" style="transition-delay:${i*180}ms"><small>${i===0?"البداية":`الجيل ${i+1}`}</small><br>${esc(getPerson(pid)?.full_name_ar||"؟")}</div>${i<chain.length-1?'<div class="journey-arrow">↑</div>':""}`).join("")}</div>`;
    setTimeout(()=>$$('#lineageStage .journey-node').forEach(n=>n.classList.add("show")),30);
  }
  function renderKinship(){
    const a=$("#kinshipA").value,b=$("#kinshipB").value,stage=$("#kinshipResult"); if(!a||!b)return;
    const pa=ancestorPaths(a),pb=ancestorPaths(b); let common=null,best=1e9;
    for(const [id,pathA] of pa){ if(pb.has(id)){const score=pathA.length+pb.get(id).length;if(score<best){best=score;common=id;}}}
    if(!common){stage.innerHTML='<div><h3>لم نجد جدًا مشتركًا ضمن البيانات الحالية</h3></div>';return;}
    const pathA=pa.get(common),pathB=pb.get(common), left=pathA, right=[...pathB].reverse().slice(1);
    const full=[...left,...right]; stage.innerHTML=`<div class="journey-summary">الجد المشترك الأقرب: <b>${esc(getPerson(common)?.full_name_ar||"")}</b></div><div class="kinship-path">${full.map((id,i)=>`<div class="journey-node ${id===common?"common":""}" style="transition-delay:${i*150}ms">${esc(getPerson(id)?.full_name_ar||"؟")}</div>${i<full.length-1?'<div class="journey-arrow">←</div>':""}`).join("")}</div>`;
    setTimeout(()=>$$('#kinshipResult .journey-node').forEach(n=>n.classList.add("show")),30);
  }

  function renderLatest(){
    const box=$("#latestAdditions"); if(!box)return; const items=[];
    state.library.slice(0,3).forEach(x=>items.push({time:x.created_at,icon:itemTypeIcon(x.item_type),title:x.title,meta:itemTypeLabel(x.item_type)}));
    state.people.slice(-3).forEach(x=>items.push({time:x.created_at,icon:"👤",title:x.full_name_ar,meta:"فرد في الشجرة"}));
    items.sort((a,b)=>new Date(b.time||0)-new Date(a.time||0)); box.innerHTML=items.slice(0,5).map(i=>`<div class="latest-item"><div class="latest-icon">${i.icon}</div><div><strong>${esc(i.title)}</strong><small>${esc(i.meta)}</small></div></div>`).join("")||'<p class="muted">لا توجد إضافات بعد.</p>';
  }

  function renderHistory(){
    const list=$("#historyList"); if(!list)return; const rows=[...state.events].sort((a,b)=>(a.event_year||9999)-(b.event_year||9999)); list.innerHTML=""; $("#historyEmpty").classList.toggle("hidden",!!rows.length);
    rows.forEach(ev=>{const p=getPerson(ev.person_id),pl=getPlace(ev.place_id);const c=document.createElement("article");c.className="history-card";c.innerHTML=`<div class="history-year">${esc(ev.event_year||"—")}</div><div><h3>${esc(ev.title||p?.full_name_ar||"حدث")}</h3><p>${p?esc(p.full_name_ar):""}${pl?` • ${esc(pl.name_ar)}`:""}</p>${ev.description?`<p>${esc(ev.description)}</p>`:""}</div>`;list.appendChild(c);});
  }

  function renderLibrary(){
    const grid=$("#libraryGrid"); if(!grid)return; const q=norm($("#librarySearch")?.value||""); const f=state.libraryFilter;
    const rows=state.library.filter(x=>{const typeOk=f==="all"||f==="documents"&&["document","correspondence"].includes(x.item_type)||f==="records"&&["record","land_record"].includes(x.item_type)||f==="photos"&&x.item_type==="photo"||f==="media"&&["video","audio","oral_history"].includes(x.item_type)||f==="genealogy"&&x.item_type==="genealogy"||f==="vault"&&x.access_level==="vault"; return typeOk&&(!q||norm([x.title,x.summary,(x.keywords||[]).join(" ")].join(" ")).includes(q));});
    grid.innerHTML=""; $("#libraryEmpty").classList.toggle("hidden",!!rows.length);
    rows.forEach(item=>{const c=document.createElement("article");c.className="library-card";c.innerHTML=`<div class="library-card-top"><span class="library-card-icon">${itemTypeIcon(item.item_type)}</span><span>${esc(item.reference_code||"")}</span></div><div class="library-card-body"><h3>${esc(item.title)}</h3><p>${esc(item.summary||"")}</p><div class="library-meta"><span class="meta-pill">${esc(itemTypeLabel(item.item_type))}</span>${item.record_year?`<span class="meta-pill">${item.record_year}</span>`:""}</div><div class="library-actions">${item.file_path?`<button class="btn light open-file" data-path="${esc(item.file_path)}">فتح المرفق</button>`:""}${item.external_url?`<button class="btn light open-url" data-url="${esc(item.external_url)}">فتح الرابط</button>`:""}</div></div>`;grid.appendChild(c);});
    $$(".open-file").forEach(b=>b.onclick=async()=>{const {data,error}=await client.storage.from("family-library").createSignedUrl(b.dataset.path,120);if(error)toast(error.message);else window.open(data.signedUrl,"_blank");});
    $$(".open-url").forEach(b=>b.onclick=()=>window.open(b.dataset.url,"_blank"));
  }

  function renderMyFamily(){
    const box=$("#myFamilyContent"); if(!box||!state.profile?.person_id)return; const p=getPerson(state.profile.person_id); if(!p)return; const f=familyOf(p.id);
    box.innerHTML=`<section class="family-self"><small>ملفي المرتبط</small><h3>${esc(p.full_name_ar)}</h3><p>${esc(p.record_code||"")} ${p.lineage_code?`• كود الأسرة ${esc(p.lineage_code)}`:""}</p><button class="btn gold request-own-change" data-type="other">طلب تعديل معلوماتي</button></section><section class="panel"><h3>الزوج / الزوجة</h3><div class="family-members">${f.spouses.map(x=>`<div class="family-mini-card"><h4>${esc(x.full_name_ar)}</h4><button class="btn light open-person" data-id="${x.id}">فتح الملف</button></div>`).join("")||"<p>لا يوجد مسجل.</p>"}</div><button class="btn light request-own-change" data-type="add_spouse">إضافة زوج/زوجة</button></section><section class="panel"><h3>الأبناء</h3><div class="family-members">${f.children.map(x=>`<div class="family-mini-card"><h4>${esc(x.full_name_ar)}</h4><button class="btn light open-person" data-id="${x.id}">فتح الملف</button></div>`).join("")||"<p>لا يوجد أبناء مسجلون.</p>"}</div><button class="btn light request-own-change" data-type="add_child">إضافة ابن/ابنة</button></section>`;
    $$(".open-person").forEach(b=>b.onclick=()=>openPerson(b.dataset.id));
    $$(".request-own-change").forEach(b=>b.onclick=()=>{setView("contribute");$("#contribType").value=b.dataset.type;$("#contribTarget").value=p.id;toggleContributionFields();});
  }

  async function loadPersonalRequests(){
    if(state.mode!=="personal"||!state.accessCode)return;
    const {data,error}=await client.rpc("personal_requests_by_code",{p_code:state.accessCode});
    if(error){$("#myRequestsList").innerHTML=`<p class="form-msg">${esc(error.message)}</p>`;return;}
    renderRequestList(data||[],false);
  }
  async function loadAccountRequests(){
    if(state.mode!=="account"||!state.session)return;
    const {data,error}=await client.from("change_requests").select("*").eq("requester_user_id",state.session.user.id).order("created_at",{ascending:false});
    if(!error)renderRequestList(data||[],false);
  }
  function requestPayloadHtml(r){
    const p=r.payload||{};
    if(r.request_type==="add_family"){
      const fam=p.family||{};
      const kids=Array.isArray(fam.children)?fam.children:[];
      return `<div class="request-family-summary">
        <div class="family-line"><span>رب الأسرة</span><b>${esc(fam.father_or_head||r.target_person_name||"—")}</b></div>
        <div class="family-line"><span>الزوج/الزوجة</span><b>${esc(fam.mother_or_spouse||"—")}</b></div>
        <div class="family-line"><span>الأبناء</span><div class="request-children">${kids.length?kids.map(x=>`<span>${esc(x)}</span>`).join(""):"—"}</div></div>
        ${p.details?`<div class="family-line"><span>ملاحظات</span><div>${esc(p.details)}</div></div>`:""}
      </div>`;
    }
    if(p.details) return `<div class="request-family-summary"><div class="family-line"><span>التفاصيل</span><div>${esc(p.details)}</div></div></div>`;
    return `<details><summary>عرض بيانات الطلب</summary><pre>${esc(JSON.stringify(p,null,2))}</pre></details>`;
  }

  function requestStatusOf(r){
    return r?.status || r?.request_status || "pending";
  }

  function requestCardHtml(r,staff){
    try{
      const st=requestStatusOf(r);
      const actionable=staff&&["pending","in_review","needs_info"].includes(st);
      const oldApprovedNeedsApply=staff&&st==="approved"&&r.request_type==="add_family"&&!r.applied_at;
      const applied=!!r.applied_at;
      return `<article class="request-card ${st==="approved"?"approved-card":""} ${st==="rejected"?"rejected-card":""}">
        <div class="request-head"><div><h4>${esc(r.request_code||"طلب")}</h4><small>${esc(requestTypeLabel(r.request_type||"other"))}</small></div><span class="meta-pill status-${esc(st)}">${esc(statusLabel(st))}</span></div>
        ${r.target_person_name?`<p>مرتبط بـ: <b>${esc(r.target_person_name)}</b></p>`:""}
        ${r.requester_name&&staff?`<p>المرسل: <b>${esc(r.requester_name)}</b> ${r.requester_contact?`• ${esc(r.requester_contact)}`:""}${r.requester_country?` • ${esc(r.requester_country)}`:""}</p>`:""}
        ${r.admin_note?`<p><b>ملاحظة الإدارة:</b> ${esc(r.admin_note)}</p>`:""}
        ${staff?requestPayloadHtml(r):""}
        ${applied?`<div class="apply-result">✅ تم تنفيذ البيانات داخل الشجرة${r.applied_at?` — ${new Date(r.applied_at).toLocaleString("ar")}`:""}</div>`:""}
        ${actionable?`<div class="request-actions"><button type="button" class="btn light review-request" data-id="${esc(r.id)}" data-status="in_review">قيد المراجعة</button><button type="button" class="btn gold review-request" data-id="${esc(r.id)}" data-status="needs_info">طلب توضيح</button>${r.request_type==="add_family"?`<button type="button" class="btn primary apply-request" data-id="${esc(r.id)}">اعتماد وتنفيذ</button>`:`<button type="button" class="btn primary review-request" data-id="${esc(r.id)}" data-status="approved">اعتماد</button>`}<button type="button" class="btn light review-request" data-id="${esc(r.id)}" data-status="rejected">رفض</button></div>`:""}
        ${oldApprovedNeedsApply?`<div class="request-actions"><button type="button" class="btn primary apply-request" data-id="${esc(r.id)}">تنفيذ البيانات الآن</button></div>`:""}
      </article>`;
    }catch(err){
      console.error("Request render failed",r,err);
      return `<article class="request-card"><div class="request-head"><div><h4>${esc(r?.request_code||"طلب")}</h4><small>تعذر عرض تفاصيل الطلب</small></div></div><p class="form-msg">الطلب موجود، لكن تعذر عرض بعض تفاصيله. اضغط «تحديث الطلبات»، وإذا استمر أرسل صورة للشاشة.</p></article>`;
    }
  }

  function renderRequestList(rows,staff){
    const box=staff?$("#changeRequestsList"):$("#myRequestsList"); if(!box)return;
    rows=Array.isArray(rows)?rows:[];
    if(staff){
      const filter=state.changeFilter||"pending";
      rows=rows.filter(r=>requestStatusOf(r)===filter);
    }
    box.style.display="grid";
    box.style.visibility="visible";
    if(!rows.length){box.innerHTML='<div class="empty-state"><div>✓</div><h3>لا توجد طلبات في هذا القسم</h3></div>';return;}
    box.innerHTML=rows.map(r=>requestCardHtml(r,staff)).join("");
    if(staff){
      box.querySelectorAll(".review-request").forEach(b=>b.addEventListener("click",()=>reviewRequest(b.dataset.id,b.dataset.status)));
      box.querySelectorAll(".apply-request").forEach(b=>b.addEventListener("click",()=>applyRequest(b.dataset.id)));
    }
  }

  async function applyRequest(id){
    if(!confirm("اعتماد الطلب وتنفيذ بياناته داخل الشجرة؟"))return;
    const {data,error}=await client.rpc("staff_apply_change_request",{p_request_id:id,p_admin_note:null});
    if(error)return toast("تعذر تنفيذ الطلب: "+error.message,6000);
    toast("تم اعتماد الطلب وتنفيذ البيانات في الشجرة ✅",4500);
    state.changeFilter="approved";
    await loadAccountData();
    await loadStaffData();
  }

  async function reviewRequest(id,status){
    let note=""; if(["needs_info","rejected"].includes(status))note=prompt(status==="needs_info"?"ما التوضيح المطلوب؟":"سبب الرفض؟")||"";
    const {error}=await client.rpc("staff_update_request",{p_request_id:id,p_status:status,p_admin_note:note||null});
    if(error)return toast("تعذر تحديث الطلب: "+error.message,4500);
    toast("تم نقل الطلب إلى قسم «"+statusLabel(status)+"» ✅");
    state.changeFilter=status;
    await loadStaffData();
  }

  function renderAdminAll(){
    if(state.role==="admin"){renderAccountRequests();renderUsers();renderAccessCodes();renderPermissions();renderAudit();}
    const count=s=>state.changeRequests.filter(r=>requestStatusOf(r)===s).length;
    if($("#rqCountPending")) $("#rqCountPending").textContent=count("pending");
    if($("#rqCountReview")) $("#rqCountReview").textContent=count("in_review");
    if($("#rqCountInfo")) $("#rqCountInfo").textContent=count("needs_info");
    if($("#rqCountApproved")) $("#rqCountApproved").textContent=count("approved");
    if($("#rqCountRejected")) $("#rqCountRejected").textContent=count("rejected");
    $("#changeCount").textContent=count("pending")+count("needs_info")+count("in_review");
    $$(".request-status-tab").forEach(b=>{
      const active=b.dataset.requestFilter===state.changeFilter;
      b.classList.toggle("active",active);
      b.setAttribute("aria-pressed",active?"true":"false");
    });
    renderRequestList(state.changeRequests,true); renderHealth();
  }

  function renderAccountRequests(){
    const pending=state.adminUsers.filter(u=>u.status==="pending"), box=$("#accountRequests"); $("#pendingCount").textContent=pending.length;
    box.innerHTML=pending.length?pending.map(u=>`<div class="account-row"><div><strong>${esc(u.display_name||"بدون اسم")}</strong><small>${esc(u.email||"")}</small></div><div class="account-actions"><button class="btn primary approve-account" data-id="${u.id}" data-role="viewer">قبول كمشاهد</button><button class="btn gold approve-account" data-id="${u.id}" data-role="editor">قبول كمدخل بيانات</button><button class="btn light reject-account" data-id="${u.id}">رفض</button></div></div>`).join(""):'<p>لا توجد طلبات معلقة.</p>';
    $$(".approve-account").forEach(b=>b.onclick=()=>updateProfile(b.dataset.id,{status:"active",role:b.dataset.role,approved_at:new Date().toISOString(),approved_by:state.session.user.id}));
    $$(".reject-account").forEach(b=>b.onclick=()=>updateProfile(b.dataset.id,{status:"rejected"}));
  }
  function renderUsers(){
    const box=$("#userManagement"); box.innerHTML=state.adminUsers.filter(u=>u.status!=="pending").map(u=>`<div class="account-row"><div><strong>${esc(u.display_name||"")}</strong><small>${esc(u.email||"")} • ${esc(u.person_id||"غير مربوط بملف")}</small></div><div class="account-actions"><select class="role-select user-role" data-id="${u.id}"><option value="viewer" ${u.role==="viewer"?"selected":""}>مشاهد</option><option value="editor" ${u.role==="editor"?"selected":""}>مدخل بيانات</option><option value="admin" ${u.role==="admin"?"selected":""}>مدير</option></select>${u.id!==state.session.user.id?`<button class="btn light toggle-user" data-id="${u.id}" data-status="${u.status}">${u.status==="suspended"?"تفعيل":"إيقاف"}</button>`:""}</div></div>`).join("");
    $$(".user-role").forEach(s=>s.onchange=()=>updateProfile(s.dataset.id,{role:s.value,status:"active"})); $$(".toggle-user").forEach(b=>b.onclick=()=>updateProfile(b.dataset.id,{status:b.dataset.status==="suspended"?"active":"suspended"}));
    const sel=$("#permissionUser"); sel.innerHTML='<option value="">— اختر —</option>'+state.adminUsers.filter(u=>u.status==="active").map(u=>`<option value="${u.id}">${esc(u.display_name||u.email)} — ${esc(roleLabel(u.role))}</option>`).join("");
  }
  async function updateProfile(id,patch){const {error}=await client.from("profiles").update(patch).eq("id",id);if(error)toast(error.message,4500);else{toast("تم تحديث الحساب ✅");await loadStaffData();}}

  function showGeneratedAccessCode(code, title="تم إنشاء الكود"){
    const box=$("#newCodeResult");
    box.classList.remove("hidden");
    box.innerHTML=`<b>⚠️ ${esc(title)} — يظهر كاملًا الآن فقط، انسخه واحفظه</b><code>${esc(code)}</code><button id="copyNewCode" type="button" class="btn gold">نسخ الكود</button>`;
    $("#copyNewCode").onclick=()=>navigator.clipboard?.writeText(code).then(()=>toast("تم نسخ الكود ✅"));
    box.scrollIntoView({behavior:"smooth",block:"center"});
  }

  function renderAccessCodes(){
    const box=$("#accessCodeList");
    box.innerHTML=state.accessCodes.map(c=>{
      const p=getPerson(c.person_id);
      const statusText=c.status==="active"?"فعّال":c.status==="revoked"?"ملغي":"منتهي";
      return `<div class="access-code-row">
        <div>
          <b>${esc(c.label||c.code_type)}</b>
          <small>${esc(c.code_type)} • ${esc(statusText)} • ينتهي: ${c.expires_at?new Date(c.expires_at).toLocaleDateString("ar"):"بدون انتهاء"} • استخدام ${c.use_count||0}${p?` • ${esc(p.full_name_ar)}`:""} • آخر 4: ${esc(c.code_hint||"")}</small>
        </div>
        <div class="account-actions">
          ${c.status==="active"?`<button class="btn gold reissue-code" data-id="${c.id}">إصدار كود بديل</button><button class="btn light revoke-code" data-id="${c.id}">إلغاء</button>`:`<span class="meta-pill">${esc(statusText)}</span>`}
        </div>
      </div>`;
    }).join("")||"<p>لا توجد أكواد.</p>";

    $$(".revoke-code").forEach(b=>b.onclick=async()=>{
      if(!confirm("إلغاء هذا الكود؟ لن يعمل بعد الإلغاء."))return;
      const {error}=await client.rpc("admin_revoke_access_code",{p_code_id:b.dataset.id});
      if(error)toast(error.message,4500);else{toast("تم إلغاء الكود");await loadStaffData();}
    });

    $$(".reissue-code").forEach(b=>b.onclick=async()=>{
      if(!confirm("سيتم إلغاء الكود الحالي وإصدار كود جديد بديل. متابعة؟"))return;
      const {data,error}=await client.rpc("admin_rotate_access_code",{p_code_id:b.dataset.id});
      if(error)return toast("تعذر إصدار البديل: "+error.message,5000);
      const code=data?.[0]?.access_code||"";
      if(code) showGeneratedAccessCode(code,"تم إصدار كود بديل");
      await loadStaffData();
    });
  }

  function renderPermissions(){
    const sel=$("#permissionUser"); if(!sel)return;
    const render=()=>{const uid=sel.value,box=$("#permissionMatrix");if(!uid){box.innerHTML="<p>اختر مستخدمًا.</p>";return;}const user=state.adminUsers.find(u=>u.id===uid);box.innerHTML=state.permissionCatalog.map(p=>{const ex=state.profilePermissions.find(x=>x.user_id===uid&&x.permission_code===p.permission_code);const checked=ex?ex.allowed:(user?.role==="editor"?p.editor_default:false);return `<label class="permission-row"><input type="checkbox" data-code="${p.permission_code}" ${checked?"checked":""}/><span><b>${esc(p.label_ar)}</b><small>${esc(p.description_ar||"")}</small></span></label>`;}).join("");}; sel.onchange=render; render();
  }

  function renderAudit(){const box=$("#auditList");if(!box)return;box.innerHTML=state.audit.map(a=>`<div class="audit-row"><div>${new Date(a.changed_at).toLocaleString("ar")}</div><div>${esc(a.action)}</div><div><b>${esc(a.table_name)}</b> <code>${esc((a.record_id||"").slice(0,12))}</code></div></div>`).join("")||"<p>لا توجد تعديلات.</p>";}
  function renderHealth(){if(!$("#healthNoFather"))return;const fathers=new Set(state.relations.filter(r=>r.parent_role==="father").map(r=>r.child_id)),mothers=new Set(state.relations.filter(r=>r.parent_role==="mother").map(r=>r.child_id));$("#healthNoFather").textContent=state.people.filter(p=>!fathers.has(p.id)).length;$("#healthNoMother").textContent=state.people.filter(p=>!mothers.has(p.id)).length;$("#healthNoCode").textContent=state.people.filter(p=>!p.lineage_code).length;$("#healthUncertain").textContent=state.people.filter(p=>p.record_confidence==="uncertain").length;}

  async function ensurePlace(name){const clean=(name||"").trim();if(!clean)return null;const f=state.places.find(p=>norm(p.name_ar)===norm(clean));if(f)return f.id;const {data,error}=await client.from("places").insert({name_ar:clean}).select().single();if(error)throw error;state.places.push(data);return data.id;}

  function nameParts(){return {first:$("#pFirstName").value.trim(),father:$("#pFatherNameText").value.trim(),grand:$("#pGrandfatherNameText").value.trim(),great:$("#pGreatNameText").value.trim(),family:$("#pFamilyNameText").value.trim()};}
  function buildDisplayName(){const x=nameParts();return [x.first,x.father,x.grand,x.great,x.family].filter(Boolean).join(" ");}
  function updateNamePreview(){ $("#pNamePreview").textContent=buildDisplayName()||"—"; state.lastDuplicateCheckKey=""; $("#duplicateBox").classList.add("hidden"); $("#duplicateConfirmWrap").classList.add("hidden"); $("#duplicateConfirm").checked=false; }

  async function checkDuplicates(){
    const n=nameParts(); if(!n.first)return [];
    const birth=toInt($("#pBirthYear").value); const {data,error}=await client.rpc("find_possible_duplicates",{p_first_name:n.first,p_father_name:n.father||null,p_grandfather_name:n.grand||null,p_birth_year:birth,p_exclude_id:null}); if(error)throw error;
    const rows=data||[],box=$("#duplicateBox"); state.lastDuplicateCheckKey=JSON.stringify([n,birth]);
    if(!rows.length){box.classList.remove("hidden");box.innerHTML="<b>✓ لم نجد تشابهًا واضحًا.</b>";$("#duplicateConfirmWrap").classList.add("hidden");return rows;}
    box.classList.remove("hidden");box.innerHTML=`<b>⚠️ وجدنا أسماء قد تكون لنفس الشخص:</b>${rows.map(r=>`<div class="duplicate-row"><b>${esc(r.full_name_ar)}</b><small>${esc(r.record_code||"")} ${r.lineage_code?`• ${esc(r.lineage_code)}`:""} • درجة التشابه ${r.score}%</small></div>`).join("")}`;$("#duplicateConfirmWrap").classList.remove("hidden");return rows;
  }

  async function suggestLineageFromFather(){
    const id=$("#pFather").value;if(!id)return;
    const father=getPerson(id); if(father){$("#pFatherNameText").value=father.first_name_ar||father.full_name_ar.split(" ")[0]||"";$("#pGrandfatherNameText").value=father.father_name_text||"";updateNamePreview();}
    if(!$("#pLineageCode").value){const {data}=await client.rpc("suggest_lineage_code",{p_parent_id:id});if(data)$("#pLineageCode").value=data;}
  }

  async function submitContribution(e){
    e.preventDefault();const type=$("#contribType").value,target=$("#contribTarget").value||null;
    const payload={details:$("#contribDetails").value.trim()||null};
    if(type==="add_family"){payload.family={father_or_head:$("#reqFatherName").value.trim()||null,mother_or_spouse:$("#reqMotherName").value.trim()||null,children:$("#reqChildren").value.split("\n").map(x=>x.trim()).filter(Boolean)};}
    const msg=$("#contribMsg"); msg.textContent="جاري الإرسال...";
    if(state.mode==="personal"){
      const {data,error}=await client.rpc("submit_personal_request",{p_code:state.accessCode,p_requester_name:$("#contribName").value.trim(),p_requester_contact:$("#contribContact").value.trim(),p_requester_country:$("#contribCountry").value.trim(),p_requester_relation_note:$("#contribRelation").value.trim(),p_request_type:type,p_target_person_id:target,p_payload:payload});
      if(error){msg.textContent="خطأ: "+error.message;return;}msg.textContent=`تم إرسال الطلب ${data?.[0]?.request_code||""} ✅`;await loadPersonalRequests();
    }else if(state.mode==="account"){
      const {data,error}=await client.rpc("submit_account_change_request",{p_request_type:type,p_target_person_id:target,p_payload:payload,p_relation_note:$("#contribRelation").value.trim()||null});
      if(error){msg.textContent="خطأ: "+error.message;return;}msg.textContent=`تم إرسال الطلب ${data||""} ✅`;await loadAccountRequests();
    }
  }

  function toggleContributionFields(){const family=$("#contribType").value==="add_family";$("#familyRequestFields").classList.toggle("hidden",!family);}


  function canDirectBasicEdit(){
    return state.mode==="account" && ["admin","editor"].includes(state.role) &&
      (state.role==="admin" || !!state.permissions.edit_basic_person);
  }
  function canDirectGenealogyEdit(){
    return state.mode==="account" && (state.role==="admin" || !!state.permissions.edit_genealogy_direct);
  }

  function editNameParts(){
    return {
      first:$("#eFirstName").value.trim(),
      father:$("#eFatherNameText").value.trim(),
      grand:$("#eGrandfatherNameText").value.trim(),
      great:$("#eGreatNameText").value.trim(),
      family:$("#eFamilyNameText").value.trim()
    };
  }
  function updateEditNamePreview(){
    const n=editNameParts();
    $("#eNamePreview").textContent=[n.first,n.father,n.grand,n.great,n.family].filter(Boolean).join(" ")||"—";
  }

  function populateEditParentSelects(personId){
    const father=$("#eFather"),mother=$("#eMother");
    father.innerHTML='<option value="">— غير مربوط —</option>';
    mother.innerHTML='<option value="">— غير مربوطة —</option>';
    state.people.forEach(p=>{
      if(p.id===personId)return;
      if(p.gender!=="female") father.add(new Option(personLabel(p),p.id));
      if(p.gender!=="male") mother.add(new Option(personLabel(p),p.id));
    });
  }

  function openEditPerson(id){
    if(!canDirectBasicEdit())return toast("لا تملك صلاحية التعديل المباشر.");
    const p=getPerson(id); if(!p)return;
    state.activePersonId=id;
    const f=familyOf(id);

    $("#editPersonRecordInfo").textContent=`${p.record_code||""}${p.lineage_code?` • كود الأسرة ${p.lineage_code}`:""}`;
    $("#eFirstName").value=p.first_name_ar||p.full_name_ar?.split(" ")[0]||"";
    $("#eFatherNameText").value=p.father_name_text||"";
    $("#eGrandfatherNameText").value=p.grandfather_name_text||"";
    $("#eGreatNameText").value=p.great_grandfather_name_text||"";
    $("#eFamilyNameText").value=p.family_name_text||"";
    $("#eGender").value=p.gender||"unknown";
    $("#eLineageCode").value=p.lineage_code||"";
    $("#eBirthDate").value=p.birth_date||"";
    $("#eBirthYear").value=p.birth_year||"";
    $("#eDeathDate").value=p.death_date||"";
    $("#eDeathYear").value=p.death_year||"";
    $("#eLiving").checked=!!p.is_living;
    $("#eConfidence").value=p.record_confidence||"family_tradition";
    $("#eBio").value=p.bio||"";
    updateEditNamePreview();

    populateEditParentSelects(id);
    $("#eFather").value=f.father?.id||"";
    $("#eMother").value=f.mother?.id||"";
    $("#editGenealogySection").classList.toggle("hidden",!canDirectGenealogyEdit());

    $("#editPersonMsg").textContent="";
    $("#editPersonModal").classList.remove("hidden");
  }

  function closeEditPerson(){
    $("#editPersonModal").classList.add("hidden");
  }

  async function reconcileParentLink(personId, role, newParentId){
    const existing=state.relations.filter(r=>r.child_id===personId && r.parent_role===role);
    const currentId=existing[0]?.parent_id||"";
    if(currentId===(newParentId||""))return;

    if(existing.length){
      const ids=existing.map(x=>x.id);
      const {error}=await client.from("parent_child_relations").delete().in("id",ids);
      if(error)throw error;
    }
    if(newParentId){
      const {error}=await client.from("parent_child_relations").insert({
        parent_id:newParentId,
        child_id:personId,
        parent_role:role,
        relation_kind:"biological",
        confidence:$("#eConfidence").value,
        created_by:state.session.user.id
      });
      if(error)throw error;
    }
  }

  function setView(name){
    const allowed = name==="library"||name==="history" ? state.mode==="account" : name==="contribute" ? ["personal","account"].includes(state.mode) : name==="myfamily" ? state.mode==="account"&&!!state.profile?.person_id : name==="admin" ? state.mode==="account"&&["admin","editor"].includes(state.role) : true;
    if(!allowed)return toast("هذه الصفحة غير متاحة بنوع الدخول الحالي.");
    $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));$$(".nav-btn[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
    if(name==="tree"&&state.cy)setTimeout(()=>{state.cy.resize();state.cy.fit(undefined,40);},50);
    if(name==="contribute"){if(state.mode==="personal")loadPersonalRequests();else loadAccountRequests();}
    if(name==="admin"&&["admin","editor"].includes(state.role))loadStaffData();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function setAdminPanel(name){$$(".admin-panel").forEach(p=>p.classList.toggle("active",p.id===`admin-${name}`));$$(".admin-tab").forEach(b=>b.classList.toggle("active",b.dataset.adminPanel===name));}

  // Gate interactions
  $$("[data-gate]").forEach(b=>b.onclick=()=>{$$(".gate-cards").forEach(x=>x.classList.add("hidden"));$("#gate-"+b.dataset.gate).classList.remove("hidden");});
  $$(".back-gate").forEach(b=>b.onclick=()=>{$$(".gate-form").forEach(x=>x.classList.add("hidden"));$$(".gate-cards").forEach(x=>x.classList.remove("hidden"));});
  $("#generalCodeForm").onsubmit=e=>{e.preventDefault();enterCodeMode($("#generalCode").value.trim(),"general");};
  $("#personalCodeForm").onsubmit=e=>{e.preventDefault();enterCodeMode($("#personalCode").value.trim(),"personal");};
  $("#loginTab").onclick=()=>{$("#loginTab").classList.add("active");$("#signupTab").classList.remove("active");$("#loginForm").classList.remove("hidden");$("#signupForm").classList.add("hidden");};
  $("#signupTab").onclick=()=>{$("#signupTab").classList.add("active");$("#loginTab").classList.remove("active");$("#signupForm").classList.remove("hidden");$("#loginForm").classList.add("hidden");if(state.accessCode){$("#claimCodeWrap").classList.remove("hidden");$("#signupClaimCode").value=state.accessCode;}};
  $("#loginForm").onsubmit=async e=>{e.preventDefault();$("#authMsg").textContent="جاري الدخول...";const {data,error}=await client.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error){$("#authMsg").textContent="تعذر الدخول: "+error.message;return;}$("#authMsg").textContent="";await enterAccount(data.session);};
  $("#signupForm").onsubmit=async e=>{e.preventDefault();const p1=$("#signupPassword").value,p2=$("#signupPassword2").value;if(p1!==p2){$("#authMsg").textContent="كلمتا المرور غير متطابقتين.";return;}const claim=$("#signupClaimCode").value.trim();if(claim)localStorage.setItem("shugaa_pending_claim_code",claim);const {data,error}=await client.auth.signUp({email:$("#signupEmail").value.trim(),password:p1,options:{data:{display_name:$("#signupName").value.trim()},emailRedirectTo:window.location.href}});if(error){$("#authMsg").textContent="تعذر إنشاء الحساب: "+error.message;return;}if(data.session)await enterAccount(data.session);else $("#authMsg").textContent="تم إنشاء الحساب. افتح رسالة تأكيد البريد ثم سجل الدخول، وسيتم ربطه بملفك تلقائيًا إذا أدخلت كودك الشخصي.";};
  $("#forgotBtn").onclick=async()=>{const email=$("#email").value.trim();if(!email)return $("#authMsg").textContent="اكتب بريدك أولًا.";const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});$("#authMsg").textContent=error?error.message:"تم إرسال رابط الاستعادة إذا كان البريد مسجلًا.";};

  async function exitApp(){
    if(state.mode==="account"&&state.session)await client.auth.signOut();
    if(state.cy)state.cy.destroy();state.session=null;state.profile=null;state.people=[];showGate();
  }
  $("#exitBtn").onclick=exitApp; $("#statusLogoutBtn").onclick=exitApp;

  // Navigation & common
  $$(".nav-btn[data-view]").forEach(b=>b.onclick=()=>setView(b.dataset.view));$$("[data-go]").forEach(b=>b.onclick=()=>setView(b.dataset.go));$$("[data-close-modal]").forEach(x=>x.onclick=closePerson);
  $("#peopleSearch").oninput=e=>renderPeople(e.target.value);$("#treeSearch").oninput=e=>{if(!state.cy)return;const q=norm(e.target.value);state.cy.nodes().removeClass("search-hit");if(!q)return;const hits=state.cy.nodes().filter(n=>norm(n.data("label")).includes(q));hits.addClass("search-hit");if(hits.length)state.cy.animate({fit:{eles:hits,padding:120},duration:300});};
  $("#fitTreeBtn").onclick=()=>state.cy?.fit(undefined,40);$("#relayoutBtn").onclick=()=>state.cy?.layout({name:"dagre",rankDir:"TB",rankSep:105,nodeSep:48,padding:40}).run();
  $("#findKinshipBtn").onclick=renderKinship;$("#startLineageBtn").onclick=()=>renderLineage();
  $("#profileLineageBtn").onclick=()=>{const id=state.activePersonId;closePerson();setView("lineage");$("#lineagePerson").value=id;renderLineage(id);};
  $("#profileKinshipBtn").onclick=()=>{const id=state.activePersonId;closePerson();setView("kinship");$("#kinshipA").value=id;};
  $("#profileContributeBtn").onclick=()=>{const id=state.activePersonId;closePerson();setView("contribute");$("#contribTarget").value=id;};
  $("#profileEditBtn").onclick=()=>{const id=state.activePersonId;closePerson();openEditPerson(id);};
  $("#profileFather").onclick=()=>{const id=$("#profileFather").dataset.personId;if(id)openPerson(id);};
  $("#profileMother").onclick=()=>{const id=$("#profileMother").dataset.personId;if(id)openPerson(id);};

  ["#eFirstName","#eFatherNameText","#eGrandfatherNameText","#eGreatNameText","#eFamilyNameText"].forEach(s=>$(s)?.addEventListener("input",updateEditNamePreview));
  $$("[data-close-edit-person]").forEach(x=>x.onclick=closeEditPerson);

  $("#editPersonForm").onsubmit=async e=>{
    e.preventDefault();
    if(!canDirectBasicEdit())return toast("لا تملك صلاحية التعديل المباشر.");
    const id=state.activePersonId,p=getPerson(id); if(!p)return;
    const msg=$("#editPersonMsg"),n=editNameParts();
    msg.textContent="جاري حفظ التعديلات...";
    try{
      const birthDate=$("#eBirthDate").value||null, deathDate=$("#eDeathDate").value||null;
      const patch={
        first_name_ar:n.first,
        father_name_text:n.father||null,
        grandfather_name_text:n.grand||null,
        great_grandfather_name_text:n.great||null,
        family_name_text:n.family||null,
        full_name_ar:[n.first,n.father,n.grand,n.great,n.family].filter(Boolean).join(" "),
        gender:$("#eGender").value,
        lineage_code:$("#eLineageCode").value.trim()||null,
        birth_date:birthDate,
        birth_year:toInt($("#eBirthYear").value)||(birthDate?parseInt(birthDate.slice(0,4),10):null),
        death_date:deathDate,
        death_year:toInt($("#eDeathYear").value)||(deathDate?parseInt(deathDate.slice(0,4),10):null),
        is_living:$("#eLiving").checked,
        record_confidence:$("#eConfidence").value,
        bio:$("#eBio").value.trim()||null,
        updated_by:state.session.user.id
      };
      const {error}=await client.from("people").update(patch).eq("id",id);
      if(error)throw error;

      if(canDirectGenealogyEdit()){
        await reconcileParentLink(id,"father",$("#eFather").value||"");
        await reconcileParentLink(id,"mother",$("#eMother").value||"");
      }

      msg.textContent="تم حفظ التعديلات مباشرة ✅";
      await loadAccountData();
      setTimeout(()=>{closeEditPerson();openPerson(id);},450);
    }catch(err){
      msg.textContent="تعذر الحفظ: "+err.message;
    }
  };

  $("#requestStatusTabs")?.addEventListener("click",e=>{
    const b=e.target.closest(".request-status-tab");
    if(!b)return;
    e.preventDefault();
    state.changeFilter=b.dataset.requestFilter||"pending";
    $$(".request-status-tab").forEach(x=>{
      const active=x===b;
      x.classList.toggle("active",active);
      x.setAttribute("aria-pressed",active?"true":"false");
    });
    renderRequestList(state.changeRequests,true);
  });
  $("#refreshChangeRequestsBtn")?.addEventListener("click",async()=>{
    toast("جاري تحديث الطلبات...");
    await loadStaffData();
    toast("تم تحديث الطلبات ✅");
  });
  $$(".filter-chip").forEach(b=>b.onclick=()=>{state.libraryFilter=b.dataset.filter;$$(".filter-chip").forEach(x=>x.classList.toggle("active",x===b));renderLibrary();});
  $("#librarySearch").oninput=renderLibrary;$$(".admin-tab").forEach(b=>b.onclick=()=>setAdminPanel(b.dataset.adminPanel));

  // Contribution
  $("#contribType").onchange=toggleContributionFields;toggleContributionFields();$("#contributionForm").onsubmit=submitContribution;$("#refreshRequestsBtn").onclick=()=>state.mode==="personal"?loadPersonalRequests():loadAccountRequests();

  // Create account from personal code
  $("#openCreateLinkedAccount").onclick=()=>{$("#linkedAccountModal").classList.remove("hidden");$("#linkedSignupName").value=getPerson(state.accessPersonId)?.full_name_ar||"";};
  $$("[data-close-linked]").forEach(x=>x.onclick=()=>$("#linkedAccountModal").classList.add("hidden"));
  $("#linkedSignupForm").onsubmit=async e=>{e.preventDefault();const msg=$("#linkedSignupMsg");localStorage.setItem("shugaa_pending_claim_code",state.accessCode);const {data,error}=await client.auth.signUp({email:$("#linkedSignupEmail").value.trim(),password:$("#linkedSignupPassword").value,options:{data:{display_name:$("#linkedSignupName").value.trim()},emailRedirectTo:window.location.href}});if(error){msg.textContent=error.message;return;}if(data.session){await enterAccount(data.session);$("#linkedAccountModal").classList.add("hidden");}else msg.textContent="تم إنشاء الحساب. افتح رسالة التأكيد ثم سجل الدخول؛ الربط سيتم تلقائيًا.";};

  // Structured person
  ["#pFirstName","#pFatherNameText","#pGrandfatherNameText","#pGreatNameText","#pFamilyNameText","#pBirthYear"].forEach(s=>$(s).addEventListener("input",updateNamePreview));
  $("#pFather").onchange=suggestLineageFromFather;$("#checkDuplicatesBtn").onclick=async()=>{try{await checkDuplicates();}catch(e){toast(e.message,4500);}};
  $("#addPersonForm").onsubmit=async e=>{
    e.preventDefault(); if(!state.permissions.add_people&&state.role!=="admin")return toast("لا تملك صلاحية إضافة أفراد.");
    const msg=$("#adminMsg"),n=nameParts(),key=JSON.stringify([n,toInt($("#pBirthYear").value)]);
    msg.textContent="جاري الفحص...";
    let dups=[];try{dups=await checkDuplicates();}catch(err){msg.textContent="تعذر فحص التكرار: "+err.message;return;}
    if(dups.length&&!$("#duplicateConfirm").checked){msg.textContent="راجع الأسماء المشابهة ثم أكد أن الشخص جديد.";return;}
    try{
      const birthPlace=await ensurePlace($("#pBirthPlace").value),deathPlace=await ensurePlace($("#pDeathPlace").value);
      const row={full_name_ar:buildDisplayName(),first_name_ar:n.first,father_name_text:n.father||null,grandfather_name_text:n.grand||null,great_grandfather_name_text:n.great||null,family_name_text:n.family||null,gender:$("#pGender").value,birth_date:$("#pBirthDate").value||null,birth_year:toInt($("#pBirthYear").value)||($("#pBirthDate").value?parseInt($("#pBirthDate").value.slice(0,4),10):null),death_date:$("#pDeathDate").value||null,death_year:toInt($("#pDeathYear").value)||($("#pDeathDate").value?parseInt($("#pDeathDate").value.slice(0,4),10):null),birth_place_id:birthPlace,death_place_id:deathPlace,is_living:$("#pLiving").checked,record_confidence:$("#pConfidence").value,bio:$("#pBio").value.trim()||null,lineage_code:$("#pLineageCode").value.trim()||null,created_by:state.session.user.id,updated_by:state.session.user.id};
      const {data,error}=await client.from("people").insert(row).select().single();if(error)throw error;
      const rels=[];if($("#pFather").value)rels.push({parent_id:$("#pFather").value,child_id:data.id,parent_role:"father",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});if($("#pMother").value)rels.push({parent_id:$("#pMother").value,child_id:data.id,parent_role:"mother",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});if(rels.length){const {error:re}=await client.from("parent_child_relations").insert(rels);if(re)throw re;}
      msg.textContent="تمت إضافة الشخص ✅";e.target.reset();$("#pLiving").checked=true;updateNamePreview();$("#duplicateBox").classList.add("hidden");$("#duplicateConfirmWrap").classList.add("hidden");await loadAccountData();
    }catch(err){msg.textContent="خطأ: "+err.message;}
  };

  // Access code admin
  $("#accessCodeType").onchange=()=>$("#accessPersonWrap").classList.toggle("hidden",$("#accessCodeType").value!=="personal");
  $("#accessCodeForm").onsubmit=async e=>{e.preventDefault();const type=$("#accessCodeType").value,person=$("#accessPerson").value||null;if(type==="personal"&&!person)return toast("اختر الشخص للكود الشخصي.");const exp=$("#accessExpires").value?new Date($("#accessExpires").value).toISOString():null;const {data,error}=await client.rpc("admin_create_access_code",{p_code_type:type,p_person_id:person,p_label:$("#accessLabel").value.trim()||null,p_expires_at:exp,p_max_uses:toInt($("#accessMaxUses").value)});if(error)return toast(error.message,4500);const code=data?.[0]?.access_code||"";if(code)showGeneratedAccessCode(code,"تم إنشاء الكود");await loadStaffData();};

  // Permission save
  $("#savePermissionsBtn").onclick=async()=>{const uid=$("#permissionUser").value;if(!uid)return toast("اختر المستخدم.");const rows=$$("#permissionMatrix input[data-code]").map(x=>({user_id:uid,permission_code:x.dataset.code,allowed:x.checked,updated_by:state.session.user.id,updated_at:new Date().toISOString()}));const {error}=await client.from("profile_permissions").upsert(rows,{onConflict:"user_id,permission_code"});if(error)toast(error.message,4500);else{toast("تم حفظ الصلاحيات ✅");await loadStaffData();}};

  // Event and library
  $("#addEventForm").onsubmit=async e=>{e.preventDefault();try{const place=await ensurePlace($("#eventPlace").value);const {error}=await client.from("life_events").insert({person_id:$("#eventPerson").value,event_type:$("#eventType").value,event_year:toInt($("#eventYear").value),place_id:place,title:$("#eventTitle").value.trim()||null,description:$("#eventDescription").value.trim()||null,confidence:$("#eventConfidence").value});if(error)throw error;$("#eventMsg").textContent="تم حفظ الحدث ✅";e.target.reset();await loadAccountData();}catch(err){$("#eventMsg").textContent=err.message;}};
  $("#addLibraryForm").onsubmit=async e=>{e.preventDefault();try{const row={title:$("#libTitle").value.trim(),item_type:$("#libType").value,record_year:toInt($("#libYear").value),summary:$("#libSummary").value.trim()||null,confidence:"family_tradition",access_level:$("#libAccess").value,external_url:$("#libExternalUrl").value.trim()||null,created_by:state.session.user.id,updated_by:state.session.user.id,status:"published"};const {data:item,error}=await client.from("library_items").insert(row).select().single();if(error)throw error;if($("#libPerson").value)await client.from("library_item_people").insert({item_id:item.id,person_id:$("#libPerson").value});const file=$("#libFile").files[0];if(file){const path=`${item.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g,"-")}`;const {error:ue}=await client.storage.from("family-library").upload(path,file,{contentType:file.type||undefined});if(ue)throw ue;await client.from("library_items").update({file_path:path,mime_type:file.type||null}).eq("id",item.id);}$("#libraryAdminMsg").textContent="تمت الإضافة ✅";e.target.reset();await loadAccountData();}catch(err){$("#libraryAdminMsg").textContent=err.message;}};

  // Init
  client.auth.getSession().then(async({data})=>{
    if(data.session){await enterAccount(data.session);return;}
    const mode=sessionStorage.getItem("shugaa_access_mode"),code=sessionStorage.getItem("shugaa_access_code");
    if(code&&["general","personal"].includes(mode)) await enterCodeMode(code,mode); else showGate();
  });
  client.auth.onAuthStateChange(async(event,session)=>{if(event==="SIGNED_OUT"&&state.mode==="account")showGate();if(session&&state.mode!=="account")await enterAccount(session);});
  if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js?v=3.0.0").catch(console.warn));
})();
