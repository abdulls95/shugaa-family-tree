// V7.1 — Hijri calendar: conversion, display and dual-calendar year fields.
window.ShugaaHijri=(()=>{
  const FMT=(()=>{for(const cal of["islamic-umalqura","islamic-civil","islamic"]){try{const f=new Intl.DateTimeFormat("en-u-ca-"+cal+"-nu-latn",{year:"numeric",month:"numeric",day:"numeric",timeZone:"UTC"});const y=+f.formatToParts(new Date(Date.UTC(2000,0,1))).find(x=>x.type==="year").value;if(y>1400&&y<1430)return f;}catch(e){}}return null;})();
  const MONTHS=["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
  // tabular fallback (Kuwaiti algorithm)
  const jdFromG=(y,m,d)=>{const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;};
  const gFromJd=jd=>{const a=jd+32044,b=Math.floor((4*a+3)/146097),c=a-Math.floor(146097*b/4),d=Math.floor((4*c+3)/1461),e=c-Math.floor(1461*d/4),m=Math.floor((5*e+2)/153);return{y:100*b+d-4800+Math.floor(m/10),m:m+3-12*Math.floor(m/10),d:e-Math.floor((153*m+2)/5)+1};};
  const jdFromH=(y,m,d)=>d+Math.ceil(29.5*(m-1))+(y-1)*354+Math.floor((3+11*y)/30)+1948439-1;
  const hFromJd=jd=>{const y=Math.floor((30*(jd-1948439)+10646)/10631),m=Math.min(12,Math.ceil((jd-(29+jdFromH(y,1,1)))/29.5)+1);return{y,m,d:jd-jdFromH(y,m,1)+1};};
  function gToH(y,m,d){
    if(FMT){const parts=FMT.formatToParts(new Date(Date.UTC(y,m-1,d)));const g=t=>+parts.find(x=>x.type===t).value;return{y:g("year"),m:g("month"),d:g("day")};}
    return hFromJd(jdFromG(y,m,d));
  }
  function hToG(y,m,d){
    let g=gFromJd(jdFromH(y,m,d));
    if(FMT){for(let off=-3;off<=3;off++){const dt=new Date(Date.UTC(g.y,g.m-1,g.d+off));const h=gToH(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());if(h.y===y&&h.m===m&&h.d===d)return{y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate()};}}
    return g;
  }
  const hYearToG=h=>hToG(h,6,15).y;                       // gregorian year around the middle of hijri year h
  const gYearToH=g=>{const a=gToH(g,1,1).y,b=gToH(g,12,31).y;return a===b?String(a):`${a}/${b}`;};
  const isoToH=iso=>{const [y,m,d]=String(iso).slice(0,10).split("-").map(Number);return gToH(y,m,d);};
  const fmtHDate=h=>`${h.d} ${MONTHS[h.m-1]} ${h.y} هـ`;
  const fmtGDate=iso=>{const [y,m,d]=String(iso).slice(0,10).split("-").map(Number);return `${d}/${m}/${y} م`;};
  const getMode=()=>{try{return localStorage.getItem("shugaa_calendar")||"both";}catch(e){return "both";}};
  const setMode=v=>{try{localStorage.setItem("shugaa_calendar",v);}catch(e){}};
  // one side of a life: returns {h,g} strings (either may be "")
  function side(year,hYear,iso){
    if(iso){const h=isoToH(iso);return{h:`${h.y} هـ`,g:`${String(iso).slice(0,4)} م`,full:{h:fmtHDate(h),g:fmtGDate(iso)}};}
    if(hYear)return{h:`${hYear} هـ`,g:year?`${year} م`:`${hYearToG(hYear)} م`};
    if(year)return{h:`${gYearToH(year)} هـ`,g:`${year} م`};
    return{h:"",g:""};
  }
  const pick=(o,mode=getMode())=>!o.h&&!o.g?"":mode==="hijri"?o.h:mode==="gregorian"?o.g:`${o.h} (${o.g})`;
  return {gToH,hToG,hYearToG,gYearToH,isoToH,fmtHDate,fmtGDate,side,pick,getMode,setMode,MONTHS};
})();

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
    changeFilter: "pending",
    relativeDraft: { type:null, mode:"new" },
    relativeExistingCandidates: [],
    relativeOtherParentCandidates: [],
    familyBuilder: { spouseMode:"none", childSeq:0 }
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
      add_relatives:"إضافة أقارب",
      correction:"تصحيح بيانات",
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
    const H=window.ShugaaHijri, mode=H.getMode();
    const b=H.side(p.birth_year,p.birth_year_hijri,p.birth_date), d=H.side(p.death_year,p.death_year_hijri,p.death_date);
    const bs=mode==="both"?(b.h||b.g):H.pick(b,mode), ds=mode==="both"?(d.h||d.g):H.pick(d,mode);
    if(bs||ds) return `${bs||"؟"} — ${p.is_living ? "حتى الآن" : (ds||"؟")}`;
    return p.is_living ? "على قيد الحياة" : "التاريخ غير مسجل";
  }
  function lifeDateText(p,kind){
    const H=window.ShugaaHijri, o=kind==="death"?H.side(p.death_year,p.death_year_hijri,p.death_date):H.side(p.birth_year,p.birth_year_hijri,p.birth_date);
    if(o.full) return H.pick(o.full);
    return H.pick(o)||"غير مسجل";
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

  async function fetchGuestTree(code){
    const res=await fetch(`${cfg.supabaseUrl}/functions/v1/code-login`,{method:"POST",headers:{"Content-Type":"application/json",apikey:cfg.supabasePublishableKey},body:JSON.stringify({code})});
    const out=await res.json().catch(()=>({}));
    if(out.mode==="general"&&out.tree)return {data:out.tree};
    return {error:{message:CODE_LOGIN_ERRORS[out.error]||"الرمز غير صحيح أو منتهي."}};
  }
  async function enterCodeMode(code, expectedMode, preData=null){
    const msg = $("#codeLoginMsg");
    msg.textContent="جاري التحقق...";
    const {data,error}=preData?{data:preData}:await fetchGuestTree(code);
    if(error){ msg.textContent=error.message; return; }
    if(expectedMode==="personal" && data?.mode!=="personal"){ msg.textContent="هذا ليس كودًا شخصيًا."; return; }
    state.mode = data?.mode==="personal" ? "personal" : "general";
    state.accessCode=code; state.accessPersonId=data?.person_id || null;
    state.people=(data?.people||[]).filter(p=>p);
    state.relations=data?.relations||[]; state.marriages=data?.marriages||[];
    state.events=(data?.events||[]).filter(Boolean); state.places=[]; state.library=[]; state.libraryPeople=[]; state.branches=[];
    sessionStorage.setItem("shugaa_access_mode",state.mode); sessionStorage.setItem("shugaa_access_code",code);
    document.body.classList.add("guest-mode",`mode-${state.mode}`);
    applyModeUI(); showApp(); renderAllPublic();
    if(state.mode==="personal") await loadPersonalRequests();
    goStartView(); msg.textContent="";
  }

  const CODE_LOGIN_ERRORS={
    invalid:"الرمز غير صحيح أو منتهي. تأكد منه أو تواصل مع الإدارة.",
    rate_limited:"محاولات كثيرة خاطئة. حاول مرة ثانية بعد ربع ساعة.",
    suspended:"تم إيقاف هذا الحساب. تواصل مع إدارة العائلة.",
    person_missing:"الملف المرتبط بهذا الرمز غير متاح. تواصل مع الإدارة.",
    person_linked_other:"هذا الملف مربوط بحساب آخر. تواصل مع الإدارة.",
    account_linked_other:"هذا الحساب مربوط بملف آخر. تواصل مع الإدارة."
  };
  async function loginWithCode(raw){
    const msg=$("#codeLoginMsg"), code=String(raw||"").trim();
    if(!code) return;
    msg.textContent="جاري التحقق...";
    let out={}, res;
    try{
      res=await fetch(`${cfg.supabaseUrl}/functions/v1/code-login`,{method:"POST",headers:{"Content-Type":"application/json",apikey:cfg.supabasePublishableKey},body:JSON.stringify({code})});
      out=await res.json().catch(()=>({}));
    }catch(e){ msg.textContent="تعذر الاتصال. تأكد من الإنترنت وحاول مرة ثانية."; return; }
    if(out.mode==="general") return enterCodeMode(code,"general",out.tree);
    if(!res.ok || !out.token_hash){ msg.textContent=CODE_LOGIN_ERRORS[out.error]||"تعذر الدخول. حاول مرة ثانية."; return; }
    const {data,error}=await client.auth.verifyOtp({token_hash:out.token_hash,type:"email"});
    if(error||!data?.session){ msg.textContent="تعذر فتح الجلسة: "+(error?.message||""); return; }
    msg.textContent="";
    $("#loginCode").value="";
    if(state.mode!=="account") await enterAccount(data.session);
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

  let startViewApplied=false;
  function goStartView(){const sv=window.__shugaaStartView;window.__shugaaStartView=null;
    if(sv){startViewApplied=true;try{history.replaceState(null,"",location.pathname);}catch(_){} setTimeout(()=>setView(sv),0);} else if(!startViewApplied) setView("home");}
  async function enterAccount(session){
    state.mode="account"; state.session=session;
    try{ state.profile=await getMyProfile(); }catch(e){ $("#authMsg").textContent="تعذر قراءة الحساب."; return; }
    state.role=state.profile?.role||"viewer"; state.status=state.profile?.status||"pending";
    if(state.status!=="active"){ showStatus(state.status); return; }
    await loadPermissions();
    await maybeClaimPendingCode();
    applyModeUI(); showApp();
    try{ await loadAccountData(); }catch(e){ console.error(e); toast("تعذر تحميل بعض البيانات: "+e.message,4500); }
    goStartView();
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

  function renderAllPublic(){ renderStats(); renderPeople(); fillPersonSelects(); renderTree(); renderHealth(); syncAddStart(); try{renderHome();}catch(e){console.error("home",e);} try{syncV12();}catch(e){console.error("v12",e);} }
  function syncAddStart(){const empty=!state.people.length;$("#addStartCard")?.classList.toggle("hidden",empty);$("#rootStartNote")?.classList.toggle("hidden",!empty);$("#rootPersonFormWrap")?.classList.toggle("hidden",!empty);}
  function renderStats(){
    $("#statPeople").textContent=state.people.length;
    $("#statRelations").textContent=state.relations.length;
    $("#statMarriages").textContent=state.marriages.length;
    $("#statLibrary").textContent=state.library.length;

    const visibleTreeCount=state.people.length ? buildTreeModel().people.length : 0;
    if($("#treeMemberCount"))$("#treeMemberCount").textContent=visibleTreeCount;
    if($("#treeCapacityText"))$("#treeCapacityText").textContent=`${visibleTreeCount} فردًا في شجرة النسب`;
  }

  function getPerson(id){ return state.people.find(p=>p.id===id); }
  function getPlace(id){ return state.places.find(p=>p.id===id); }
  function personLabel(p){ if(!p)return "—"; const extras=[]; if(p.father_name_text)extras.push(`ابن ${p.father_name_text}`); if(p.record_code)extras.push(`رقم ${p.record_code}`); return extras.length ? `${p.full_name_ar} — ${extras.join(" • ")}` : p.full_name_ar; }

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

  function personCompleteness(p,f){
    const checks=[p.first_name_ar||p.full_name_ar,p.gender&&p.gender!=="unknown",p.birth_date||p.birth_year,p.lineage_code,f.father||p.father_name_text,f.mother,p.bio];
    return Math.round((checks.filter(Boolean).length/checks.length)*100);
  }
  function relativeChip(p,label){
    if(!p)return `<span class="v4-empty-relative">${esc(label||"غير مسجل")}</span>`;
    return `<button type="button" class="v4-relative-chip open-v4-relative" data-id="${esc(p.id)}"><b>${esc(p.full_name_ar)}</b><small>${esc(p.record_code||"")}</small></button>`;
  }
  function setProfileTab(name){
    $$(".v4-profile-tab").forEach(b=>b.classList.toggle("active",b.dataset.profileTab===name));
    $$(".v4-profile-panel").forEach(x=>x.classList.toggle("active",x.id===`profileTab-${name}`));
  }
  function openPerson(id){
    const p=getPerson(id); if(!p)return; state.activePersonId=id; const f=familyOf(id);
    $("#profileName").textContent=p.full_name_ar; $("#profileLife").textContent=yearText(p); $("#profileAvatar").textContent=genderIcon(p.gender);
    const fatherBtn=$("#profileFather"), motherBtn=$("#profileMother");
    fatherBtn.textContent=f.father?.full_name_ar||p.father_name_text||"—";
    motherBtn.textContent=f.mother?.full_name_ar||"—";
    fatherBtn.dataset.personId=f.father?.id||""; motherBtn.dataset.personId=f.mother?.id||"";
    fatherBtn.classList.toggle("is-linked",!!f.father); motherBtn.classList.toggle("is-linked",!!f.mother);
    $("#profileSpouses").textContent=f.spouses.length?`${f.spouses.length} مسجل` : "—";
    $("#profileChildren").textContent=f.children.length?`${f.children.length} مسجل` : "—";
    $("#profileLineageCode").textContent=p.lineage_code?`الأسرة ${p.lineage_code}`:""; $("#profileRecordCode").textContent=state.mode==="account"&&p.record_code?p.record_code:"";
    $("#profileBio").textContent=state.mode==="account"?(p.bio||"لا توجد نبذة مسجلة."):"المعلومات الخاصة غير متاحة بهذا النوع من الدخول.";
    if($("#profileCompleteness"))$("#profileCompleteness").textContent=personCompleteness(p,f)+"%";

    const parents=[];
    parents.push(relativeChip(f.father,"الأب غير مسجل"));
    parents.push(relativeChip(f.mother,"الأم غير مسجلة"));
    $("#profileParentsList").innerHTML=parents.join("");
    $("#profileSpousesList").innerHTML=f.spouses.length?f.spouses.map(x=>relativeChip(x)).join(""):'<span class="v4-empty-relative">لا يوجد زوج/زوجة مسجل</span>';
    $("#profileChildrenList").innerHTML=f.children.length?f.children.map(x=>relativeChip(x)).join(""):'<span class="v4-empty-relative">لا يوجد أبناء مسجلون</span>';
    $$(".open-v4-relative").forEach(b=>b.onclick=()=>openPerson(b.dataset.id));

    $("#profileDetailFacts").innerHTML=`
      <div class="v4-detail-fact"><span>تاريخ الميلاد</span><b>${esc(lifeDateText(p,"birth"))}</b></div>
      <div class="v4-detail-fact"><span>تاريخ الوفاة</span><b>${esc(p.is_living?"على قيد الحياة":(lifeDateText(p,"death")||"غير مسجل"))}</b></div>
      <div class="v4-detail-fact"><span>درجة التوثيق</span><b>${esc(confidenceLabel(p.record_confidence))}</b></div>
      <div class="v4-detail-fact"><span>كود السجل</span><b>${esc(p.record_code||"—")}</b></div>`;
    $("#profileMergeBtn").classList.toggle("hidden",!canMergePeople());
    $("#profileArchiveBtn").classList.toggle("hidden",!canArchivePeople());
    const canBuild=canAddPeopleDirect();
    const addBtn=$("#profileAddRelativeBtn"); addBtn?.classList.toggle("hidden",state.mode!=="account");
    if(addBtn) addBtn.textContent=canBuild?"＋ إضافة":"＋ اقتراح إضافة";
    $("#profileBuildFamilyBtn")?.classList.add("hidden");
    $("#profileBulkChildrenBtn")?.classList.toggle("hidden",!canBuild);
    $$("[data-quick-relative]").forEach(b=>b.classList.toggle("hidden",!canBuild));
    $("#profileEditBtn")?.classList.toggle("hidden",!canDirectBasicEdit());
    setProfileTab("overview");
    $("#personModal").classList.remove("hidden");
  }
  function closePerson(){ $("#personModal").classList.add("hidden"); }

  function fillPersonSelects(){
    const selectors=["#joinPerson","#smartContribPerson","#addStartPerson","#hubPerson","#bulkFather","#pFather","#pMother","#eventPerson","#libPerson","#kinshipA","#kinshipB","#lineagePerson","#contribTarget","#accessPerson"];
    selectors.forEach(sel=>{ const el=$(sel); if(!el)return; const blank=el.querySelector('option[value=""]')?.outerHTML||""; el.innerHTML=blank; state.people.forEach(p=>{ if((sel==="#pFather"||sel==="#bulkFather")&&p.gender==="female")return; if(sel==="#pMother"&&p.gender==="male")return; el.add(new Option(personLabel(p),p.id)); }); });
  }

  // V5 — clean family-tree canvas.
  // The public tree shows lineage structure only. Spouses remain fully available inside
  // the person's profile, which keeps the tree readable even when many marriages exist.
  function preferredTreeParent(childId){
    const rels=state.relations.filter(r=>
      r.child_id===childId &&
      ["father","mother","parent"].includes(r.parent_role) &&
      getPerson(r.parent_id)
    );
    if(!rels.length)return null;

    const father=rels.find(r=>r.parent_role==="father"||r.parent_role==="parent");
    const mother=rels.find(r=>r.parent_role==="mother");

    if(father&&mother){
      const fatherLinked=state.relations.some(r=>
        r.child_id===father.parent_id &&
        ["father","mother","parent"].includes(r.parent_role) &&
        getPerson(r.parent_id)
      );
      const motherLinked=state.relations.some(r=>
        r.child_id===mother.parent_id &&
        ["father","mother","parent"].includes(r.parent_role) &&
        getPerson(r.parent_id)
      );
      if(fatherLinked!==motherLinked)return fatherLinked?father.parent_id:mother.parent_id;
      return father.parent_id;
    }
    return (father||mother)?.parent_id||null;
  }

  function buildTreeModel(){
    const allPeople=state.people;
    const allIds=new Set(allPeople.map(p=>p.id));

    const parentRels=state.relations.filter(r=>
      ["father","mother","parent"].includes(r.parent_role) &&
      allIds.has(r.parent_id) &&
      allIds.has(r.child_id)
    );

    const parentsByChild=new Map();
    const childrenByParentAll=new Map();

    parentRels.forEach(r=>{
      if(!parentsByChild.has(r.child_id))parentsByChild.set(r.child_id,[]);
      parentsByChild.get(r.child_id).push({id:r.parent_id,role:r.parent_role});

      if(!childrenByParentAll.has(r.parent_id))childrenByParentAll.set(r.parent_id,[]);
      childrenByParentAll.get(r.parent_id).push(r.child_id);
    });

    const normFamily=v=>String(v||"")
      .trim()
      .replace(/[\u064B-\u065F\u0670\u0640]/g,"")
      .replace(/\s+/g," ");

    const isShugaaName=p=>{
      if(!p)return false;
      const family=normFamily(p.family_name_text);
      const full=normFamily(p.full_name_ar);
      const last=full.split(" ").filter(Boolean).pop()||"";
      return family==="شجاع" || last==="شجاع";
    };

    // Main-tree rule:
    // 1) آل شجاع men continue the visible lineage through their children.
    // 2) آل شجاع women remain visible as daughters/sisters in their paternal branch.
    // 3) If an آل شجاع woman marries outside the tribe, her husband and children
    //    are NOT shown on the main tree; they remain available only in her profile.
    // 4) If her husband is himself an آل شجاع man in the tree, their children may
    //    appear through HIS paternal branch, not through her branch.

    const visible=new Set();

    // Seed with people whose own record is clearly آل شجاع.
    allPeople.filter(isShugaaName).forEach(p=>visible.add(p.id));

    // If old records are missing the family marker, start from the largest root branch.
    if(!visible.size){
      const candidateRoots=allPeople.filter(p=>!(parentsByChild.get(p.id)||[]).length);
      const descendantMemo=new Map();

      const countDesc=id=>{
        if(descendantMemo.has(id))return descendantMemo.get(id);
        const seen=new Set();
        const stack=[id];
        while(stack.length){
          const cur=stack.pop();
          for(const child of childrenByParentAll.get(cur)||[]){
            if(!seen.has(child)){
              seen.add(child);
              stack.push(child);
            }
          }
        }
        descendantMemo.set(id,seen.size);
        return seen.size;
      };

      candidateRoots.sort((a,b)=>countDesc(b.id)-countDesc(a.id));
      if(candidateRoots[0])visible.add(candidateRoots[0].id);
      else if(allPeople[0])visible.add(allPeople[0].id);
    }

    // Pull in paternal ancestors needed to connect visible records.
    let changed=true;
    while(changed){
      changed=false;
      for(const id of [...visible]){
        const rels=parentsByChild.get(id)||[];

        // Prefer father, then generic parent. We intentionally do not pull an
        // outside mother/spouse into the main tribe tree.
        const fatherRel=rels.find(x=>x.role==="father"||x.role==="parent");
        const parentId=fatherRel?.id||null;

        if(parentId && allIds.has(parentId) && !visible.has(parentId)){
          visible.add(parentId);
          changed=true;
        }
      }
    }

    // Now expand descendants ONLY through male-line members.
    // A daughter remains visible, but her children do not continue the main tree
    // unless their father is himself a visible آل شجاع male.
    const queue=[...visible];
    const processed=new Set();

    while(queue.length){
      const parentId=queue.shift();
      if(processed.has(parentId))continue;
      processed.add(parentId);

      const parent=getPerson(parentId);
      if(!parent)continue;

      // Only men continue the main tribe lineage.
      if(parent.gender!=="male")continue;

      for(const childId of childrenByParentAll.get(parentId)||[]){
        if(!visible.has(childId)){
          visible.add(childId);
          queue.push(childId);
        }
      }
    }

    // Build exactly one structural edge per visible child.
    const parentByChild=new Map();
    const childrenByParent=new Map();

    for(const childId of visible){
      const rels=parentsByChild.get(childId)||[];

      // Father is the only preferred structural parent for the main tree.
      let parentId=(rels.find(x=>x.role==="father")||rels.find(x=>x.role==="parent"))?.id||null;

      // If that father is outside the visible tree, do not attach the child through
      // the mother. This is what hides a married-out daughter's children.
      if(parentId && !visible.has(parentId)){
        parentId=null;
      }

      if(parentId && parentId!==childId){
        parentByChild.set(childId,parentId);
        if(!childrenByParent.has(parentId))childrenByParent.set(parentId,[]);
        childrenByParent.get(parentId).push(childId);
      }
    }

    // Keep only the connected tribe structure. A spouse/outside child that slipped
    // in only because of a legacy family-name value is dropped unless it is a root
    // or connected through a visible father.
    const connected=new Set();
    const roots=[...visible].filter(id=>!parentByChild.has(id));

    // Prefer roots that are truly آل شجاع; if none, retain the first available root.
    const rootSeeds=roots.filter(id=>isShugaaName(getPerson(id)));
    if(!rootSeeds.length && roots[0])rootSeeds.push(roots[0]);

    const walk=[...rootSeeds];
    while(walk.length){
      const id=walk.shift();
      if(connected.has(id))continue;
      connected.add(id);
      for(const childId of childrenByParent.get(id)||[]){
        walk.push(childId);
      }
    }

    // If all data is legacy/malformed, don't blank the tree entirely.
    const finalVisible=connected.size?connected:visible;

    const people=allPeople.filter(p=>finalVisible.has(p.id));
    const edges=[];

    for(const [child,parent] of parentByChild){
      if(finalVisible.has(child)&&finalVisible.has(parent)){
        edges.push({parent,child});
      }
    }

    return {people,edges,parentByChild,childrenByParent,visibleIds:finalVisible};
  }

  function buildTreeElements(){
    const model=buildTreeModel();
    const out=[];

    model.people.forEach(p=>{
      const f=familyOf(p.id);
      const spouseText=f.spouses.length
        ? f.spouses.slice(0,2).map(s=>s.first_name_ar||s.full_name_ar.split(" ")[0]).join("، ")
        : "";
      out.push({
        data:{
          id:p.id,
          label:(p.first_name_ar||String(p.full_name_ar||"").split(/\s+/)[0]||"؟"),
          gender:p.gender,
          spouseText,
          hasSpouse:!!spouseText
        }
      });
    });

    model.edges.forEach(({parent,child})=>{
      out.push({
        data:{
          id:`tree-${parent}-${child}`,
          source:parent,
          target:child,
          kind:"parent"
        }
      });
    });

    return out;
  }

  // V9 — interactive tree: branch colours, lineage glow, node action bar, collapse, direction.
  const BRANCH_COLORS=["#0C3530","#9A7733","#9E5A63","#2F6F73","#5E6B2E","#4A4F7C","#8A5A2B","#3D6B53"];
  const treeUI={dir:(()=>{try{return localStorage.getItem("shugaa_tree_dir")||(window.innerWidth<700?"RL":"TB");}catch(e){return "TB";}})(),collapsed:new Set(),selected:null,didAuto:false};
  function shortYears(p){
    const H=window.ShugaaHijri, mode=H.getMode(), useG=mode==="gregorian";
    const b=H.side(p.birth_year,p.birth_year_hijri,p.birth_date), d=H.side(p.death_year,p.death_year_hijri,p.death_date);
    const cut=x=>String(useG?x.g:x.h).replace(/\s*(هـ|م)$/,"").split("/")[0];
    const bs=(useG?b.g:b.h)?cut(b):"", ds=(useG?d.g:d.h)?cut(d):"";
    if(!bs&&!ds)return "";
    return `${bs||"؟"}${p.is_living===false||ds?`–${ds||"؟"}`:""} ${useG?"م":"هـ"}`;
  }
  function renderTree(){
    const c=$("#cy");
    if(!state.people.length){ c.classList.add("hidden"); $("#treeEmpty").classList.remove("hidden"); return; }
    c.classList.remove("hidden"); $("#treeEmpty").classList.add("hidden");
    if(state.cy)state.cy.destroy();
    const els=buildTreeElements();
    // branch = child of the root a node descends from
    const parentOf=new Map(), kids=new Map();
    els.filter(e=>e.data.source).forEach(e=>{parentOf.set(e.data.target,e.data.source);(kids.get(e.data.source)||kids.set(e.data.source,[]).get(e.data.source)).push(e.data.target);});
    const branchIdx=new Map(); let next=0;
    // branches start where the trunk first splits (a single-child line from the root is the trunk)
    const trunkEnd=new Map();
    const trunkOf=root=>{if(trunkEnd.has(root))return trunkEnd.get(root);let t=root;while((kids.get(t)||[]).length===1)t=kids.get(t)[0];trunkEnd.set(root,t);return t;};
    els.filter(e=>!e.data.source).forEach(e=>{
      const id=e.data.id, p=getPerson(id); let cur=id, chain=[];
      while(parentOf.has(cur)){chain.push(cur);cur=parentOf.get(cur);}
      const tEnd=trunkOf(cur); const full=[id,...chain.slice(0,-0||undefined)];
      let top=null; for(let x=id;parentOf.has(x);x=parentOf.get(x)){if(parentOf.get(x)===tEnd){top=x;break;}}
      if(top&&!branchIdx.has(top))branchIdx.set(top,next++);
      const yrs=p?shortYears(p):"";
      Object.assign(e.data,{color:top?BRANCH_COLORS[branchIdx.get(top)%BRANCH_COLORS.length]:"#B08A3E",root:!top,
        years:yrs,deceased:p?.is_living===false,kids:(kids.get(id)||[]).length,
        text:e.data.label+(yrs?`\n${yrs}`:""),h:yrs?56:44});
    });
    if(!treeUI.didAuto){treeUI.didAuto=true; const nodes=els.filter(e=>!e.data.source);
      if(nodes.length>60){const depth=id=>{let d=0,x=id;while(parentOf.has(x)&&d<60){x=parentOf.get(x);d++;}return d;};
        nodes.forEach(e=>{if(depth(e.data.id)===2&&(kids.get(e.data.id)||[]).length)treeUI.collapsed.add(e.data.id);});}}
    const RL=treeUI.dir==="RL";
    state.cy=cytoscape({
      container:c, elements:els, wheelSensitivity:.16, minZoom:.12, maxZoom:2.8, boxSelectionEnabled:false, autoungrabify:true,
      style:[
        {selector:"node",style:{"background-color":"#ffffff","border-width":1.6,"border-color":"data(color)","label":"data(text)","text-wrap":"wrap","text-max-width":104,
          "font-family":"IBM Plex Sans Arabic, Segoe UI, sans-serif","font-size":15,"font-weight":600,"color":"#0C3530","line-height":1.35,
          "width":112,"height":"data(h)","shape":"round-rectangle","text-valign":"center","text-halign":"center","overlay-opacity":0,
          "shadow-blur":10,"shadow-opacity":0.07,"shadow-offset-y":3,"shadow-color":"#072621","transition-property":"opacity, border-width","transition-duration":"180ms"}},
        {selector:'node[gender="female"]',style:{"background-color":"#FBF5F4","color":"#6E3540"}},
        {selector:"node[?deceased]",style:{"background-color":"#F3EFE6","color":"#4A5853"}},
        {selector:"node[?root]",style:{"border-width":2.4,"border-color":"#B08A3E","background-color":"#0C3530","color":"#F6EBCF","font-family":"Amiri, IBM Plex Sans Arabic, serif","font-size":19,"width":124}},
        {selector:"node.collapsed",style:{"border-style":"double","border-width":4.5,"label":(n)=>`${n.data("text")}\n\u2066+${n.successors("node").length}\u2069 مطوي`,"height":(n)=>n.data("h")+18}},
        {selector:"edge",style:{"width":1.4,"line-color":"#C9B88F","curve-style":"taxi","taxi-direction":RL?"leftward":"downward","taxi-turn":24,"taxi-turn-min-distance":10,
          "target-arrow-shape":"none","source-endpoint":"outside-to-node","target-endpoint":"outside-to-node","overlay-opacity":0,"transition-property":"opacity, line-color, width","transition-duration":"180ms"}},
        {selector:".tree-hidden",style:{"display":"none"}},
        {selector:".dim",style:{"opacity":.28}},
        {selector:"node.lit",style:{"border-color":"#B08A3E","border-width":2.6}},
        {selector:"edge.lit",style:{"line-color":"#B08A3E","width":3}},
        {selector:"node.focus",style:{"border-width":3.4,"border-color":"#B08A3E","background-color":"#FFF8E8","color":"#0C3530"}},
        {selector:".search-hit",style:{"background-color":"#F6EBCF","border-width":2.8,"border-color":"#B08A3E"}}
      ],
      layout:{name:"preset"}
    });
    applyCollapse(false); runTreeLayout(false);
    state.cy.on("tap","node",e=>{const id=e.target.id(); if(treeUI.selected===id){openPerson(id);return;} selectTreeNode(id);});
    state.cy.on("tap",e=>{if(e.target===state.cy)clearTreeSelection();});
    state.cy.on("pan zoom resize",placeNodeBar);
    if(document.fonts&&!renderTree._fontsHooked){renderTree._fontsHooked=true;document.fonts.ready.then(()=>{if(state.cy)state.cy.style().update();});}
    syncTreeToolbar(); window.__shugaaTree=state.cy;
  }
  function runTreeLayout(animate=true,fitEles=null){
    if(!state.cy)return; const RL=treeUI.dir==="RL";
    const vis=state.cy.elements().not(".tree-hidden");
    const lay=vis.layout({name:"dagre",rankDir:treeUI.dir,rankSep:RL?90:74,nodeSep:RL?14:20,edgeSep:20,padding:60,acyclicer:"greedy",ranker:"network-simplex",animate,animationDuration:280,
      fit:false});
    lay.one("layoutstop",()=>{ if(fitEles&&fitEles.length)state.cy.animate({fit:{eles:fitEles,padding:90},duration:280}); else state.cy.fit(vis,60); placeNodeBar(); });
    lay.run();
  }
  function applyCollapse(relayout=true){
    if(!state.cy)return;
    state.cy.elements().removeClass("tree-hidden"); state.cy.nodes().removeClass("collapsed");
    treeUI.collapsed.forEach(id=>{const n=state.cy.getElementById(id); if(!n.length)return; n.addClass("collapsed"); n.successors().addClass("tree-hidden");});
    if(relayout)runTreeLayout(true,treeUI.selected?state.cy.getElementById(treeUI.selected).closedNeighborhood():null);
  }
  function selectTreeNode(id){
    const cy=state.cy, n=cy.getElementById(id); if(!n.length)return;
    treeUI.selected=id;
    cy.elements().removeClass("lit dim focus");
    const path=n.predecessors().union(n);
    cy.elements().not(path).not(n.successors()).addClass("dim");
    path.addClass("lit"); n.addClass("focus");
    placeNodeBar();
  }
  function clearTreeSelection(){treeUI.selected=null;state.cy?.elements().removeClass("lit dim focus");$("#treeNodeBar").classList.add("hidden");}
  function placeNodeBar(){
    const bar=$("#treeNodeBar"); if(!bar)return;
    const id=treeUI.selected, n=id&&state.cy?state.cy.getElementById(id):null;
    if(!n||!n.length||n.hasClass("tree-hidden")){bar.classList.add("hidden");return;}
    const p=getPerson(id), kidsCount=n.outgoers("node").length+(n.hasClass("collapsed")?1:0);
    $("#treeBarName").textContent=p?.full_name_ar||"";
    $("#treeBarAdd").classList.toggle("hidden",state.mode!=="account");
    $("#treeBarAdd").textContent=canAddPeopleDirect()?"＋ إضافة":"＋ اقتراح";
    const col=$("#treeBarCollapse"); col.classList.toggle("hidden",!kidsCount&&!treeUI.collapsed.has(id));
    col.textContent=treeUI.collapsed.has(id)?"فتح الفرع":"طي الفرع";
    bar.classList.remove("hidden");
    const pos=n.renderedPosition(), h=n.renderedOuterHeight(), stage=$("#cy").getBoundingClientRect(), bw=bar.offsetWidth, bh=bar.offsetHeight;
    let x=pos.x-bw/2, y=pos.y-h/2-bh-10; if(y<6)y=pos.y+h/2+10;
    x=Math.max(6,Math.min(x,stage.width-bw-6));
    bar.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  function syncTreeToolbar(){
    $("#treeDirBtn")&&($("#treeDirBtn").textContent=treeUI.dir==="RL"?"↕ عمودي":"↔ أفقي");
    $("#myBranchBtn")?.classList.toggle("hidden",!(state.mode==="account"&&state.profile?.person_id));
    $("#expandAllBtn")?.classList.toggle("hidden",!treeUI.collapsed.size);
  }
  $("#treeBarProfile").onclick=()=>treeUI.selected&&openPerson(treeUI.selected);
  $("#treeBarAdd").onclick=()=>treeUI.selected&&openAddHub(treeUI.selected);
  $("#treeBarCollapse").onclick=()=>{const id=treeUI.selected;if(!id)return;treeUI.collapsed.has(id)?treeUI.collapsed.delete(id):treeUI.collapsed.add(id);applyCollapse(true);syncTreeToolbar();};
  $("#treeBarFocus").onclick=()=>{const n=state.cy?.getElementById(treeUI.selected);if(n?.length)state.cy.animate({fit:{eles:n.predecessors().union(n).union(n.successors().not(".tree-hidden")),padding:80},duration:320});};
  $("#treeDirBtn").onclick=()=>{treeUI.dir=treeUI.dir==="RL"?"TB":"RL";try{localStorage.setItem("shugaa_tree_dir",treeUI.dir);}catch(e){}renderTree();};
  $("#zoomInBtn").onclick=()=>state.cy&&state.cy.animate({zoom:{level:state.cy.zoom()*1.3,renderedPosition:{x:$("#cy").clientWidth/2,y:$("#cy").clientHeight/2}},duration:180});
  $("#zoomOutBtn").onclick=()=>state.cy&&state.cy.animate({zoom:{level:state.cy.zoom()/1.3,renderedPosition:{x:$("#cy").clientWidth/2,y:$("#cy").clientHeight/2}},duration:180});
  $("#expandAllBtn").onclick=()=>{treeUI.collapsed.clear();applyCollapse(true);syncTreeToolbar();};
  $("#myBranchBtn").onclick=()=>{const id=state.profile?.person_id;if(!id||!state.cy)return;let n=state.cy.getElementById(id);if(!n.length)return toast("ملفك ما يظهر في الشجرة الرئيسية.");
    treeUI.collapsed.forEach(c=>{if(state.cy.getElementById(c).successors().contains(n))treeUI.collapsed.delete(c);}); applyCollapse(false); selectTreeNode(id);
    runTreeLayout(true,n.predecessors().union(n).union(n.successors()));};


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
    id=id||$("#lineagePerson").value; if(!id)return; const chain=ancestorsFrom(id).reverse(), stage=$("#lineageStage");
    stage.innerHTML=`<div class="journey-summary">مسار النسب الأبوي من ${esc(getPerson(id)?.full_name_ar||"")}</div><div class="lineage-path">${chain.map((pid,i)=>`<div class="journey-node" style="transition-delay:${i*180}ms"><small>${i===0?"الجد الأكبر • الجيل 1":i===chain.length-1?`الجيل ${i+1} • ${esc(firstName(getPerson(pid)))}`:`الجيل ${i+1}`}</small><br>${esc(getPerson(pid)?.full_name_ar||"؟")}</div>${i<chain.length-1?'<div class="journey-arrow">↓</div>':""}`).join("")}</div>`;
    setTimeout(()=>$$('#lineageStage .journey-node').forEach(n=>n.classList.add("show")),30);
  }

  // V10.1 — Arabic kinship term: what B is to A
  const HER={"أبوه":"أبوها","أمه":"أمها","جده":"جدها","جدته":"جدتها","ابنه":"ابنها","بنته":"بنتها","أخوه":"أخوها","أخته":"أختها","عمه":"عمها","عمته":"عمتها","خاله":"خالها","خالته":"خالتها","أبيه":"أبيها","أخيه":"أخيها","حفيده":"حفيدها","حفيدته":"حفيدتها","لأبيه":"لأبيها","لأمه":"لأمها","عمومته":"عمومتها","قريبه":"قريبها","قريبته":"قريبتها","ابنه)":"ابنها)","بنته)":"بنتها)"};
  function kinshipTerm(aId,bId){const t=kinshipTermM(aId,bId);return t&&getPerson(aId)?.gender==="female"?t.split(" ").map(w=>HER[w]||w).join(" "):t;}
  function kinshipTermM(aId,bId){
    if(aId===bId)return null;
    const pa=ancestorPaths(aId), pb=ancestorPaths(bId); let common=null,best=1e9;
    for(const [id,x] of pa){if(pb.has(id)){const sc=x.length+pb.get(id).length;if(sc<best){best=sc;common=id;}}}
    if(!common)return null;
    const A=pa.get(common), B=pb.get(common), da=A.length-1, db=B.length-1;
    const g=id=>getPerson(id)?.gender, f=g(bId)==="female";
    const side=id=>g(id)==="female"?"لأمه":"لأبيه";          // which parent of A the path goes through
    const ofParent=id=>g(id)==="female"?"أمه":"أبيه";
    const word=(m,fe)=>f?fe:m;
    const N=["","","","الثالث","الرابع","الخامس","السادس","السابع","الثامن"];
    // B is A's ancestor
    if(db===0){ if(da===1)return word("أبوه","أمه"); if(da===2)return `${word("جده","جدته")} ${side(A[1])}`; return `${word("جده","جدته")} ${N[da]?`(الجد ${N[da]})`:`(قبل ${da} أجيال)`}`; }
    // B is A's descendant
    if(da===0){ if(db===1)return word("ابنه","بنته"); if(db===2)return `${word("حفيده","حفيدته")} (${g(B[1])==="female"?"من بنته":"من ابنه"})`; return `${word("حفيده","حفيدته")} من الجيل ${db}`; }
    // siblings
    if(da===1&&db===1){const fa=familyOf(aId),fb=familyOf(bId);const full=fa.father&&fa.mother&&fa.father.id===fb.father?.id&&fa.mother.id===fb.mother?.id;
      const known=fa.father&&fa.mother&&fb.father&&fb.mother;
      return full?word("أخوه الشقيق","أخته الشقيقة"):known?`${word("أخوه","أخته")} ${g(common)==="female"?"لأمه":"لأبيه"}`:word("أخوه","أخته");}
    const ua=(par,ch)=>g(par)==="female"?(g(ch)==="female"?"خالة":"خال"):(g(ch)==="female"?"عمة":"عم");   // par: A-side person, ch: sibling on B side
    // B is sibling of an ancestor of A (uncle / great-uncle)
    if(db===1){ const base=g(A[da-1])==="female"?word("خال","خالة"):word("عم","عمة");
      if(da===2)return base+"ه"; if(da===3)return `${base} ${ofParent(A[1])}`; if(da===4)return `${base} جده ${side(A[1])}`; return `${base} الجد ${N[da-1]||""}`; }
    // B descends from A's sibling (nephew / niece)
    if(da===1){ const sib=g(B[db-1])==="female"?"أخته":"أخيه"; if(db===2)return `${word("ابن","بنت")} ${sib}`; return `${word("حفيد","حفيدة")} ${sib}`; }
    // first cousins
    if(da===2&&db===2)return `${word("ابن","بنت")} ${ua(A[1],B[1])}${g(B[1])==="female"?"ته":"ه"}`.replace("خالةته","خالته").replace("عمةته","عمته");
    // cousin of A's parent
    if(da===3&&db===2)return `${word("ابن","بنت")} ${ua(A[2],B[1])} ${ofParent(A[1])}`;
    // child of A's cousin
    if(da===2&&db===3)return `${word("ابن","بنت")} ${g(B[1])==="female"?"بنت":"ابن"} ${ua(A[1],B[2])}${g(B[2])==="female"?"ته":"ه"}`.replace("خالةته","خالته").replace("عمةته","عمته");
    if(da===db)return `${word("من أبناء عمومته","من بنات عمومته")} (الدرجة ${da-1})`;
    return `${word("قريبه","قريبته")}: يلتقيان عند الجد ${getPerson(common)?.first_name_ar||""} — ${da>db?"من جيل أعلى":"من جيل أدنى"}`;
  }
  function renderKinship(){
    const a=$("#kinshipA").value,b=$("#kinshipB").value,stage=$("#kinshipResult"); if(!a||!b)return;
    const pa=ancestorPaths(a),pb=ancestorPaths(b); let common=null,best=1e9;
    for(const [id,pathA] of pa){ if(pb.has(id)){const score=pathA.length+pb.get(id).length;if(score<best){best=score;common=id;}}}
    if(!common){stage.innerHTML='<div><h3>لم نجد جدًا مشتركًا ضمن البيانات الحالية</h3></div>';return;}
    const pathA=pa.get(common),pathB=pb.get(common), left=pathA, right=[...pathB].reverse().slice(1);
    const full=[...left,...right]; const term=kinshipTerm(a,b), back=kinshipTerm(b,a), A_=getPerson(a), B_=getPerson(b);
    stage.innerHTML=`${term?`<div class="kin-term"><p><b>${esc(B_?.full_name_ar||"")}</b> ${B_?.gender==="female"?"تكون":"يكون"}</p><h3>${esc(term)}</h3><p>لـ <b>${esc(A_?.full_name_ar||"")}</b></p>${back?`<small>وبالعكس: ${esc(A_?.first_name_ar||"")} ${A_?.gender==="female"?"تكون":"يكون"} ${esc(back)} لـ ${esc(B_?.first_name_ar||"")}</small>`:""}</div>`:""}<div class="journey-summary">الجد المشترك الأقرب: <b>${esc(getPerson(common)?.full_name_ar||"")}</b></div><div class="kinship-path">${full.map((id,i)=>`<div class="journey-node ${id===common?"common":""}" style="transition-delay:${i*150}ms">${esc(getPerson(id)?.full_name_ar||"؟")}</div>${i<full.length-1?'<div class="journey-arrow">←</div>':""}`).join("")}</div>`;
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
    if(p.smart) return smartRequestHtml(r);
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
        ${(staff||r.payload?.smart)?requestPayloadHtml(r):""}
        ${applied?`<div class="apply-result">✅ تم تنفيذ البيانات داخل الشجرة${r.applied_at?` — ${new Date(r.applied_at).toLocaleString("ar")}`:""}</div>`:""}
        ${actionable?`<div class="request-actions"><button type="button" class="btn light review-request" data-id="${esc(r.id)}" data-status="in_review">قيد المراجعة</button><button type="button" class="btn gold review-request" data-id="${esc(r.id)}" data-status="needs_info">طلب توضيح</button>${["add_family","add_relatives","correction"].includes(r.request_type)?`<button type="button" class="btn primary apply-request" data-id="${esc(r.id)}" data-type="${esc(r.request_type)}">اعتماد وتنفيذ</button>`:`<button type="button" class="btn primary review-request" data-id="${esc(r.id)}" data-status="approved">اعتماد</button>`}<button type="button" class="btn light review-request" data-id="${esc(r.id)}" data-status="rejected">رفض</button></div>`:""}
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
      box.querySelectorAll(".apply-request").forEach(b=>b.addEventListener("click",()=>applyRequest(b.dataset.id,b.dataset.type)));
    }
  }

  async function applyRequest(id,type){
    if(!confirm("اعتماد الطلب وتنفيذ بياناته داخل الشجرة؟"))return;
    const smart=["add_relatives","correction"].includes(type);
    const {data,error}=await client.rpc(smart?"staff_apply_smart_request":"staff_apply_change_request",{p_request_id:id,p_admin_note:null});
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
    const box=$("#userManagement"); box.innerHTML=state.adminUsers.filter(u=>u.status!=="pending").map(u=>`<div class="account-row"><div><strong>${esc(u.display_name||"")}</strong><small>${esc(/@members\.shugaa-family\.app$/.test(u.email||"")?"🔑 دخول بالرمز":(u.email||""))} • ${esc(getPerson(u.person_id)?.full_name_ar||(u.person_id?"ملف غير متاح":"غير مربوط بملف"))}</small></div><div class="account-actions"><select class="role-select user-role" data-id="${u.id}"><option value="viewer" ${u.role==="viewer"?"selected":""}>مشاهد</option><option value="editor" ${u.role==="editor"?"selected":""}>مدخل بيانات</option><option value="admin" ${u.role==="admin"?"selected":""}>مدير</option></select>${u.id!==state.session.user.id?`<button class="btn light toggle-user" data-id="${u.id}" data-status="${u.status}">${u.status==="suspended"?"تفعيل":"إيقاف"}</button>`:""}</div></div>`).join("");
    $$(".user-role").forEach(s=>s.onchange=()=>updateProfile(s.dataset.id,{role:s.value,status:"active"})); $$(".toggle-user").forEach(b=>b.onclick=()=>updateProfile(b.dataset.id,{status:b.dataset.status==="suspended"?"active":"suspended"}));
    const sel=$("#permissionUser"); sel.innerHTML='<option value="">— اختر —</option>'+state.adminUsers.filter(u=>u.status==="active").map(u=>`<option value="${u.id}">${esc(u.display_name||u.email)} — ${esc(roleLabel(u.role))}</option>`).join("");
  }
  async function updateProfile(id,patch){const {error}=await client.from("profiles").update(patch).eq("id",id);if(error)toast(error.message,4500);else{toast("تم تحديث الحساب ✅");await loadStaffData();}}

  function showGeneratedAccessCode(code, title="تم إنشاء الكود", personName=""){
    const box=$("#newCodeResult");
    box.classList.remove("hidden");
    const link=location.origin+location.pathname;
    const first=String(personName||"").trim().split(/\s+/)[0]||"";
    const text=`السلام عليكم${first?" "+first:""} 🌳\nهذا رمز دخولك لموقع شجرة آل شجاع:\n${code}\n\nافتح الرابط واكتب الرمز:\n${link}\n\nالرمز خاص فيك، لا تشاركه مع أحد.`;
    box.innerHTML=`<b>⚠️ ${esc(title)}${personName?` لـ ${esc(personName)}`:""} — انسخه أو أرسله</b><code>${esc(code)}</code><div class="code-share-actions"><button id="copyNewCode" type="button" class="btn gold">نسخ الكود</button><a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">إرسال بالواتساب</a></div>`;
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
          <small>${esc(({personal:"شخصي",general:"عام",invite:"دعوة"})[c.code_type]||c.code_type)}${c.code_type==="personal"?` (${esc(roleLabel(c.grant_role))})`:""} • ${esc(statusText)} • ينتهي: ${c.expires_at?new Date(c.expires_at).toLocaleDateString("ar"):"بدون انتهاء"} • استخدام ${c.use_count||0}${p?` • ${esc(p.full_name_ar)}`:""} • آخر 4: ${esc(c.code_hint||"")}</small>
        </div>
        <div class="account-actions">
          ${c.status==="active"?`${c.can_reveal?`<button class="btn primary copy-code" data-id="${c.id}">نسخ الكود</button>`:""}<button class="btn gold reissue-code" data-id="${c.id}">إصدار كود بديل</button><button class="btn light revoke-code" data-id="${c.id}">إلغاء</button>`:`<span class="meta-pill">${esc(statusText)}</span>`}
        </div>
      </div>`;
    }).join("")||"<p>لا توجد أكواد.</p>";

    $$(".copy-code").forEach(b=>b.onclick=async()=>{
      const {data:code,error}=await client.rpc("admin_reveal_access_code",{p_code_id:b.dataset.id});
      if(error)return toast("تعذر عرض الكود: "+error.message,5000);
      const c=state.accessCodes.find(x=>x.id===b.dataset.id);
      showGeneratedAccessCode(code,"الكود الحالي",getPerson(c?.person_id)?.full_name_ar);
      try{await navigator.clipboard.writeText(code);toast("تم نسخ الكود ✅");}catch(_){}
      $("#newCodeResult")?.scrollIntoView({behavior:"smooth",block:"center"});
    });
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
      if(code) showGeneratedAccessCode(code,"تم إصدار كود بديل",getPerson(state.accessCodes.find(x=>x.id===b.dataset.id)?.person_id)?.full_name_ar);
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
    setYearField("#eBirthYear",p.birth_year,p.birth_year_hijri);
    $("#eDeathDate").value=p.death_date||"";
    setYearField("#eDeathYear",p.death_year,p.death_year_hijri);
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

  function canAddPeopleDirect(){
    return state.mode==="account" && ["admin","editor"].includes(state.role) &&
      (state.role==="admin" || !!state.permissions.add_people);
  }


  function canMergePeople(){
    return state.mode==="account" && (state.role==="admin" || !!state.permissions.merge_people);
  }
  function canArchivePeople(){
    return state.mode==="account" && (state.role==="admin" || !!state.permissions.archive_people);
  }

  function fillMergePersonSelects(currentId){
    const dup=$("#mergeDuplicatePerson"), keep=$("#mergeKeepPerson");
    const options=state.people
      .filter(p=>p.record_status==="active" || !p.record_status)
      .map(p=>`<option value="${p.id}">${esc(personLabel(p))}</option>`)
      .join("");
    dup.innerHTML=options;
    keep.innerHTML='<option value="">— اختر السجل الصحيح الذي سيبقى —</option>'+options;
    dup.value=currentId||"";

    const current=getPerson(currentId);
    if(current){
      const candidates=state.people.filter(p=>
        p.id!==currentId &&
        (
          norm(p.full_name_ar)===norm(current.full_name_ar) ||
          (current.first_name_ar && norm(p.first_name_ar)===norm(current.first_name_ar) &&
           current.father_name_text && norm(p.father_name_text)===norm(current.father_name_text))
        )
      );
      if(candidates.length===1) keep.value=candidates[0].id;
    }
    updateMergePreview();
  }

  function updateMergePreview(){
    const duplicate=getPerson($("#mergeDuplicatePerson")?.value);
    const keep=getPerson($("#mergeKeepPerson")?.value);
    const box=$("#mergePreview");
    if(!box)return;
    if(!duplicate || !keep){
      box.innerHTML='<span class="muted">اختر السجل الصحيح الذي سيبقى.</span>';
      return;
    }
    box.innerHTML=`
      <div class="merge-person-box">
        <small>سيُدمج ويختفي</small>
        <strong>${esc(duplicate.full_name_ar)}</strong>
        <small>${esc(duplicate.record_code||"")} ${duplicate.lineage_code?`• ${esc(duplicate.lineage_code)}`:""}</small>
      </div>
      <div class="merge-arrow">←</div>
      <div class="merge-person-box">
        <small>السجل الرئيسي</small>
        <strong>${esc(keep.full_name_ar)}</strong>
        <small>${esc(keep.record_code||"")} ${keep.lineage_code?`• ${esc(keep.lineage_code)}`:""}</small>
      </div>`;
  }

  function openMergePerson(id){
    if(!canMergePeople())return toast("لا تملك صلاحية دمج السجلات.");
    fillMergePersonSelects(id);
    $("#mergeConfirm").checked=false;
    $("#mergePersonMsg").textContent="";
    $("#mergePersonModal").classList.remove("hidden");
  }

  function closeMergePerson(){
    $("#mergePersonModal").classList.add("hidden");
  }

  function childNameParts(){
    return {
      first:$("#childFirstName").value.trim(),
      father:$("#childFatherNameText").value.trim(),
      grand:$("#childGrandfatherNameText").value.trim(),
      great:$("#childGreatNameText").value.trim(),
      family:$("#childFamilyNameText").value.trim()
    };
  }

  function updateChildNamePreview(){
    const n=childNameParts();
    $("#childNamePreview").textContent=[n.first,n.father,n.grand,n.great,n.family].filter(Boolean).join(" ")||"—";
    $("#childDuplicateBox").classList.add("hidden");
    $("#childDuplicateConfirmWrap").classList.add("hidden");
    $("#childDuplicateConfirm").checked=false;
  }

  function fillOtherParentOptions(){
    const current=getPerson(state.activePersonId);
    const role=$("#childCurrentParentRole").value;
    const select=$("#childOtherParent");
    const currentFamily=familyOf(current?.id);
    select.innerHTML='<option value="">— غير معروف / غير مسجل —</option>';

    const spouseIds=new Set((currentFamily?.spouses||[]).map(x=>x.id));
    const candidates=state.people
      .filter(p=>p.id!==current?.id)
      .filter(p=>role==="father" ? p.gender!=="male" : p.gender!=="female")
      .sort((a,b)=>{
        const sa=spouseIds.has(a.id)?0:1, sb=spouseIds.has(b.id)?0:1;
        if(sa!==sb)return sa-sb;
        return (a.full_name_ar||"").localeCompare(b.full_name_ar||"","ar");
      });

    candidates.forEach(p=>select.add(new Option(`${spouseIds.has(p.id)?"★ ":""}${personLabel(p)}`,p.id)));

    const spouses=(currentFamily?.spouses||[]).filter(p=>role==="father" ? p.gender!=="male" : p.gender!=="female");
    if(spouses.length===1)select.value=spouses[0].id;
  }

  function deriveChildNameFromParents(){
    const current=getPerson(state.activePersonId);
    if(!current)return;
    const role=$("#childCurrentParentRole").value;
    const other=getPerson($("#childOtherParent").value);
    let father=null;
    if(role==="father")father=current;
    else if(other)father=other;

    if(father){
      $("#childFatherNameText").value=father.first_name_ar||father.full_name_ar?.split(" ")[0]||"";
      $("#childGrandfatherNameText").value=father.father_name_text||"";
      $("#childGreatNameText").value=father.grandfather_name_text||"";
      $("#childFamilyNameText").value=father.family_name_text||"";
    }else{
      $("#childFatherNameText").value="";
      $("#childGrandfatherNameText").value="";
      $("#childGreatNameText").value="";
      $("#childFamilyNameText").value=current.family_name_text||"";
    }
    updateChildNamePreview();
  }

  async function suggestChildLineageCode(){
    const current=getPerson(state.activePersonId);
    if(!current)return;
    const role=$("#childCurrentParentRole").value;
    const other=getPerson($("#childOtherParent").value);
    const parentForCode=role==="father" ? current : (other||current);
    if(!parentForCode?.id)return;
    const {data,error}=await client.rpc("suggest_lineage_code",{p_parent_id:parentForCode.id});
    if(!error&&data)$("#childLineageCode").value=data;
  }

  async function openAddChildModal(id){
    if(!canAddPeopleDirect())return toast("لا تملك صلاحية إضافة أفراد مباشرة.");
    const p=getPerson(id);if(!p)return;
    state.activePersonId=id;
    $("#addChildParentInfo").textContent=`إضافة طفل مرتبط بـ: ${p.full_name_ar}${p.record_code?` • ${p.record_code}`:""}`;
    $("#childCurrentParentRole").value=p.gender==="female"?"mother":"father";
    $("#childFirstName").value="";
    $("#childGender").value="male";
    $("#childBirthDate").value="";
    $("#childBirthYear").value="";
    $("#childConfidence").value="family_tradition";
    $("#childBio").value="";
    $("#childLineageCode").value="";
    $("#addChildMsg").textContent="";
    $("#childDuplicateBox").classList.add("hidden");
    $("#childDuplicateConfirmWrap").classList.add("hidden");
    $("#childDuplicateConfirm").checked=false;
    fillOtherParentOptions();
    deriveChildNameFromParents();
    await suggestChildLineageCode();
    $("#addChildModal").classList.remove("hidden");
  }

  function closeAddChildModal(){
    $("#addChildModal").classList.add("hidden");
  }

  async function checkChildDuplicates(){
    const n=childNameParts();
    if(!n.first)return [];
    const birth=toInt($("#childBirthYear").value)||($("#childBirthDate").value?parseInt($("#childBirthDate").value.slice(0,4),10):null);
    const {data,error}=await client.rpc("find_possible_duplicates",{
      p_first_name:n.first,
      p_father_name:n.father||null,
      p_grandfather_name:n.grand||null,
      p_birth_year:birth,
      p_exclude_id:null
    });
    if(error)throw error;
    const rows=data||[],box=$("#childDuplicateBox");
    box.classList.remove("hidden");
    if(!rows.length){
      box.innerHTML="<b>✓ لم نجد تشابهًا واضحًا.</b>";
      $("#childDuplicateConfirmWrap").classList.add("hidden");
      return rows;
    }
    box.innerHTML=`<b>⚠️ وجدنا أسماء قد تكون لنفس الشخص:</b>${rows.map(r=>`<div class="duplicate-row"><b>${esc(r.full_name_ar)}</b><small>${esc(r.record_code||"")} ${r.lineage_code?`• ${esc(r.lineage_code)}`:""} • درجة التشابه ${r.score}%</small></div>`).join("")}`;
    $("#childDuplicateConfirmWrap").classList.remove("hidden");
    return rows;
  }


  // =========================================================
  // V4 — relationship-first family builder
  // =========================================================
  const V4_REL_LABEL={father:"أب",mother:"أم",spouse:"زوج / زوجة",son:"ابن",daughter:"ابنة",brother:"أخ",sister:"أخت"};

  function v4ShowRelativeStep(n){
    [1,2,3].forEach(i=>{
      $("#relativeStep"+i)?.classList.toggle("active",i===n);
      document.querySelector(`[data-step-dot="${i}"]`)?.classList.toggle("active",i<=n);
    });
  }
  function v4FixedGender(type){ return ({father:"male",mother:"female",son:"male",daughter:"female",brother:"male",sister:"female"})[type]||null; }
  function v4OtherParentCandidates(anchor,type){
    if(!["son","daughter"].includes(type))return [];
    const fam=familyOf(anchor.id), spouseIds=new Set(fam.spouses.map(x=>x.id));
    return state.people.filter(p=>p.id!==anchor.id).filter(p=>{
      if(anchor.gender==="male")return p.gender!=="male";
      if(anchor.gender==="female")return p.gender!=="female";
      return true;
    }).sort((a,b)=>(spouseIds.has(a.id)?0:1)-(spouseIds.has(b.id)?0:1)||(a.full_name_ar||"").localeCompare(b.full_name_ar||"","ar"));
  }
  function personSearchNorm(v){
    return String(v??"")
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g,"")
      .replace(/[إأآٱ]/g,"ا")
      .replace(/ى/g,"ي")
      .replace(/ؤ/g,"و")
      .replace(/ئ/g,"ي")
      .replace(/\s+/g," ");
  }

  function v4PersonSearchCandidates(kind){
    return kind==="existing" ? state.relativeExistingCandidates : state.relativeOtherParentCandidates;
  }

  function v4PersonSearchElements(kind){
    if(kind==="existing"){
      return {
        hidden:$("#relativeExistingPerson"),
        input:$("#relativeExistingPersonSearch"),
        results:$("#relativeExistingPersonResults"),
        selected:$("#relativeExistingPersonSelected"),
        clear:$("#relativeExistingPersonClear")
      };
    }
    return {
      hidden:$("#relativeOtherParent"),
      input:$("#relativeOtherParentSearch"),
      results:$("#relativeOtherParentResults"),
      selected:$("#relativeOtherParentSelected"),
      clear:$("#relativeOtherParentClear")
    };
  }

  function v4ClosePersonSearch(kind){
    v4PersonSearchElements(kind).results?.classList.add("hidden");
  }

  function v4RenderPersonSearch(kind,query=""){
    const els=v4PersonSearchElements(kind);
    if(!els.results)return;

    const q=personSearchNorm(query);
    const rows=v4PersonSearchCandidates(kind)
      .filter(p=>{
        if(!q)return true;
        const hay=personSearchNorm([
          p.full_name_ar,
          p.record_code,
          p.first_name_ar,
          p.father_name_text,
          p.grandfather_name_text,
          p.family_name_text
        ].filter(Boolean).join(" "));
        return hay.includes(q);
      })
      .slice(0,10);

    if(!rows.length){
      els.results.innerHTML='<div class="person-search-empty">لا يوجد اسم مطابق</div>';
      els.results.classList.remove("hidden");
      return;
    }

    const anchor=getPerson(state.activePersonId);
    const fam=anchor?familyOf(anchor.id):{spouses:[]};
    const spouseIds=new Set((fam.spouses||[]).map(x=>x.id));

    els.results.innerHTML=rows.map(p=>`
      <button type="button" class="person-search-result" data-person-search-kind="${kind}" data-person-id="${p.id}">
        <span class="person-search-avatar ${p.gender==="female"?"female":p.gender==="male"?"male":""}">${esc(genderIcon(p.gender))}</span>
        <span class="person-search-result-text">
          <b>${spouseIds.has(p.id)&&kind==="other"?"★ ":""}${esc(p.full_name_ar||"بدون اسم")}</b>
          <small>${esc(p.record_code||"")} ${p.birth_year?`• ${esc(p.birth_year)}`:""}</small>
        </span>
      </button>
    `).join("");

    els.results.classList.remove("hidden");
  }

  function v4SelectPersonSearch(kind,personId,{silent=false}={}){
    const els=v4PersonSearchElements(kind);
    const p=getPerson(personId);

    if(!p){
      if(els.hidden)els.hidden.value="";
      if(els.input)els.input.value="";
      els.selected?.classList.add("hidden");
      els.clear?.classList.add("hidden");
      v4ClosePersonSearch(kind);
      if(kind==="other" && !silent){
        els.hidden?.dispatchEvent(new Event("change",{bubbles:true}));
      }
      return;
    }

    els.hidden.value=p.id;
    els.input.value=p.full_name_ar||"";
    if(els.selected){
      els.selected.innerHTML=`<span>تم الاختيار</span><b>${esc(p.full_name_ar||"")}</b><small>${esc(p.record_code||"")}</small>`;
      els.selected.classList.remove("hidden");
    }
    els.clear?.classList.remove("hidden");
    v4ClosePersonSearch(kind);

    if(kind==="other" && !silent){
      els.hidden.dispatchEvent(new Event("change",{bubbles:true}));
    }
  }

  function v4ResetPersonSearch(kind){
    const els=v4PersonSearchElements(kind);
    if(els.hidden)els.hidden.value="";
    if(els.input)els.input.value="";
    if(els.results){els.results.innerHTML="";els.results.classList.add("hidden");}
    els.selected?.classList.add("hidden");
    els.clear?.classList.add("hidden");
  }

  function v4FillExistingCandidates(){
    const type=state.relativeDraft.type,anchor=getPerson(state.activePersonId);
    if(!anchor)return;

    const fixed=v4FixedGender(type);
    state.relativeExistingCandidates=state.people
      .filter(p=>p.id!==anchor.id)
      .filter(p=>!fixed||p.gender===fixed||p.gender==="unknown")
      .sort((a,b)=>(a.full_name_ar||"").localeCompare(b.full_name_ar||"","ar"));

    v4ResetPersonSearch("existing");
  }

  function v4FillOtherParent(){
    const anchor=getPerson(state.activePersonId);
    if(!anchor)return;

    const fam=familyOf(anchor.id);
    const spouseIds=new Set(fam.spouses.map(x=>x.id));

    state.relativeOtherParentCandidates=v4OtherParentCandidates(anchor,state.relativeDraft.type);
    v4ResetPersonSearch("other");

    const spouses=state.relativeOtherParentCandidates.filter(p=>spouseIds.has(p.id));
    if(spouses.length===1){
      v4SelectPersonSearch("other",spouses[0].id,{silent:true});
    }

    v4UpdateRelativeName();
  }

  function v4InferPersonParts(p){
    if(!p)return {first:"",father:"",grand:"",great:"",family:""};

    // V5.0.4:
    // Use the visible full name as the primary source because some older records
    // have incomplete structured name columns. The structured columns are fallbacks.
    const tokens=String(p.full_name_ar||"").trim().split(/\s+/).filter(Boolean);

    const structuredFirst=String(p.first_name_ar||"").trim();
    const structuredFather=String(p.father_name_text||"").trim();
    const structuredGrand=String(p.grandfather_name_text||"").trim();
    const structuredGreat=String(p.great_grandfather_name_text||"").trim();
    const structuredFamily=String(p.family_name_text||"").trim();

    const first=tokens[0]||structuredFirst||"";

    let family=structuredFamily;
    if(!family && tokens.length>=4)family=tokens[tokens.length-1];

    const lineage=(family && tokens[tokens.length-1]===family)
      ? tokens.slice(1,-1)
      : tokens.slice(1);

    const father=lineage[0]||structuredFather||"";
    const grand=lineage[1]||structuredGrand||"";
    const great=lineage[2]||structuredGreat||"";

    return {first,father,grand,great,family};
  }

  function v4InheritedRelativeParts(){
    const a=getPerson(state.activePersonId);
    const t=state.relativeDraft.type;
    if(!a||!t)return {father:"",grand:"",great:"",family:"",source:""};

    const ap=v4InferPersonParts(a);
    const fam=familyOf(a.id);

    if(["son","daughter"].includes(t)){
      let fatherPerson=null;
      const otherId=$("#relativeOtherParent")?.value||"";
      const other=getPerson(otherId);

      // If the current person is explicitly female, the paternal chain must come
      // from the selected father. Otherwise (male OR old record with unknown gender),
      // use the current person as the paternal source unless a male other-parent
      // was explicitly selected.
      if(a.gender==="female"){
        if(other && other.gender==="male")fatherPerson=other;
      }else if(a.gender==="male"){
        fatherPerson=a;
      }else{
        fatherPerson=(other && other.gender==="male") ? other : a;
      }

      if(fatherPerson){
        const fp=v4InferPersonParts(fatherPerson);
        return {
          father:fp.first,
          grand:fp.father,
          great:fp.grand,
          family:fp.family,
          source:`من اسم الأب: ${fatherPerson.full_name_ar}`
        };
      }

      return {
        father:"",
        grand:"",
        great:"",
        family:"",
        source:a.gender==="female" ? "اختر الأب ليكتمل اسم الطفل تلقائيًا." : ""
      };
    }

    if(["brother","sister"].includes(t)){
      const fatherPerson=fam.father;
      if(fatherPerson){
        const fp=v4InferPersonParts(fatherPerson);
        return {
          father:fp.first,
          grand:fp.father,
          great:fp.grand,
          family:fp.family||ap.family,
          source:`من نفس والد ${a.full_name_ar}`
        };
      }

      return {
        father:ap.father,
        grand:ap.grand,
        great:ap.great,
        family:ap.family,
        source:`من نسب ${a.full_name_ar}`
      };
    }

    if(t==="father"){
      return {
        father:ap.grand,
        grand:ap.great,
        great:"",
        family:ap.family,
        source:`مستنتج من نسب ${a.full_name_ar}`
      };
    }

    // Mother and spouse do not inherit the anchor's paternal chain.
    return {father:"",grand:"",great:"",family:"",source:""};
  }

  function v4ApplyRelativePlaceholders(){
    const auto=v4InheritedRelativeParts();
    const fields=[
      ["#relativeFatherNameText",auto.father,"اسم الأب"],
      ["#relativeGrandfatherNameText",auto.grand,"اسم الجد"],
      ["#relativeGreatNameText",auto.great,"اسم جد الأب"],
      ["#relativeFamilyNameText",auto.family,"اسم العائلة"]
    ];

    fields.forEach(([sel,value,label])=>{
      const el=$(sel);
      if(!el)return;
      el.placeholder=value ? `${value} — تلقائي` : label;
    });

    const hint=$("#relativeAutoNameHint");
    if(hint)hint.textContent=auto.source||"";
  }

  function v4PrefillRelative(){
    const a=getPerson(state.activePersonId),t=state.relativeDraft.type;
    if(!a)return;

    const fixed=v4FixedGender(t);
    if(fixed)$("#relativeGender").value=fixed;
    else $("#relativeGender").value=a.gender==="male"?"female":a.gender==="female"?"male":"unknown";

    // Important: inherited lineage fields stay visually empty.
    // The proposed name is calculated from the relationship, not from the user having
    // to manually fill "additional information".
    $("#relativeFirstName").value="";
    $("#relativeFatherNameText").value="";
    $("#relativeGrandfatherNameText").value="";
    $("#relativeGreatNameText").value="";
    $("#relativeFamilyNameText").value="";
    $("#relativeLineageCode").value="";

    const fam=familyOf(a.id);
    const ap=v4InferPersonParts(a);

    // If we already know the father's name from the anchor, help the admin when adding him.
    if(t==="father"){
      $("#relativeFirstName").value=ap.father||fam.father?.first_name_ar||"";
    }

    v4ApplyRelativePlaceholders();
    v4UpdateRelativeName();
  }

  function v4RelativePersonData(){
    const first=$("#relativeFirstName").value.trim();
    const auto=v4InheritedRelativeParts();

    // Manual values are overrides only. If left blank, relationship-derived values are used.
    const father=$("#relativeFatherNameText").value.trim()||auto.father||"";
    const grand=$("#relativeGrandfatherNameText").value.trim()||auto.grand||"";
    const great=$("#relativeGreatNameText").value.trim()||auto.great||"";
    const family=$("#relativeFamilyNameText").value.trim()||auto.family||"";
    const date=$("#relativeBirthDate").value||null;

    return {
      first_name_ar:first,
      father_name_text:father||null,
      grandfather_name_text:grand||null,
      great_grandfather_name_text:great||null,
      family_name_text:family||null,
      full_name_ar:[first,father,grand,great,family].filter(Boolean).join(" "),
      gender:$("#relativeGender").value,
      birth_date:date,
      birth_year:toInt($("#relativeBirthYear").value)||(date?parseInt(date.slice(0,4),10):null),
      birth_year_hijri:hijriYearOf("#relativeBirthYear"),
      is_living:$("#relativeLiving").checked,
      record_confidence:$("#relativeConfidence").value,
      lineage_code:$("#relativeLineageCode").value.trim()||null,
      bio:$("#relativeBio").value.trim()||null
    };
  }

  function v4UpdateRelativeName(){
    v4ApplyRelativePlaceholders();
    const d=v4RelativePersonData();
    $("#relativeNamePreview").textContent=d.full_name_ar||"—";
    $("#relativeDuplicateBox").classList.add("hidden");
    $("#relativeDuplicateConfirmWrap").classList.add("hidden");
    $("#relativeDuplicateConfirm").checked=false;
  }

  function v4SetRelativeMode(mode){ state.relativeDraft.mode=mode; $("#relativeModeNew").classList.toggle("active",mode==="new"); $("#relativeModeExisting").classList.toggle("active",mode==="existing"); $("#relativeNewFields").classList.toggle("hidden",mode!=="new"); $("#relativeExistingFields").classList.toggle("hidden",mode!=="existing"); }
  function openRelativeBuilder(anchorId,preset=null){
    if(!canAddPeopleDirect())return toast("لا تملك صلاحية إضافة أفراد مباشرة.");
    const a=getPerson(anchorId);if(!a)return;state.activePersonId=anchorId;state.relativeDraft={type:null,mode:"new"};
    $("#relativeAnchorName").textContent=a.full_name_ar; $("#relativeBuilderMsg").textContent=""; v4SetRelativeMode("new"); v4ShowRelativeStep(1); $("#relativeBuilderModal").classList.remove("hidden");
    if(preset && !["child","parent"].includes(preset))v4ChooseRelation(preset);
  }
  function closeRelativeBuilder(){ $("#relativeBuilderModal").classList.add("hidden"); }
  async function v4ChooseRelation(type){
    const a=getPerson(state.activePersonId);if(!a)return;
    if(["father","mother"].includes(type) && !canDirectGenealogyEdit())return toast("إضافة أب أو أم لشخص موجود تحتاج صلاحية تعديل النسب مباشرة.",4500);
    if(["brother","sister"].includes(type)){const fam=familyOf(a.id);if(!fam.father&&!fam.mother)return toast("سجّل أبًا أو أمًا أولًا حتى نستطيع ربط الأخ/الأخت بشكل صحيح.",4500);}
    state.relativeDraft.type=type; $("#relativeTypeTitle").textContent=V4_REL_LABEL[type]||type; v4PrefillRelative(); v4FillExistingCandidates(); v4FillOtherParent();
    const existingSensitive=["father","mother","son","daughter","brother","sister"].includes(type)&&!canDirectGenealogyEdit();
    $("#relativeModeExisting").disabled=existingSensitive; $("#relativeModeExisting").title=existingSensitive?"ربط سجل موجود بالنسب يحتاج صلاحية تعديل النسب مباشرة":"";
    if(existingSensitive)v4SetRelativeMode("new");
    $("#relativeOtherParentWrap").classList.toggle("hidden",!["son","daughter"].includes(type));
    $("#relativeMarriageStatusWrap").classList.toggle("hidden",type!=="spouse");
    if(["son","daughter"].includes(type)){
      try{const parentForCode=a.gender==="male"?a:getPerson($("#relativeOtherParent").value);if(parentForCode){const {data}=await client.rpc("suggest_lineage_code",{p_parent_id:parentForCode.id});if(data)$("#relativeLineageCode").value=data;}}catch(_e){}
    }
    v4ShowRelativeStep(2);
  }
  async function v4CheckRelativeDuplicates(){
    const d=v4RelativePersonData(); if(!d.first_name_ar)return [];
    const {data,error}=await client.rpc("find_possible_duplicates",{p_first_name:d.first_name_ar,p_father_name:d.father_name_text,p_grandfather_name:d.grandfather_name_text,p_birth_year:d.birth_year,p_exclude_id:null}); if(error)throw error;
    const rows=data||[],box=$("#relativeDuplicateBox"); box.classList.remove("hidden");
    if(!rows.length){box.innerHTML="<b>✓ لم نجد تشابهًا واضحًا.</b>";return rows;}
    box.innerHTML=`<b>⚠️ قد يكون الشخص موجودًا:</b>${rows.slice(0,5).map(r=>`<div class="duplicate-row"><b>${esc(r.full_name_ar)}</b><small>${esc(r.record_code||"")} • تشابه ${r.score}%</small></div>`).join("")}`; $("#relativeDuplicateConfirmWrap").classList.remove("hidden");return rows;
  }
  async function v4PrepareRelativePreview(){
    const a=getPerson(state.activePersonId),t=state.relativeDraft.type;if(!a||!t)return;
    if(state.relativeDraft.mode==="new"){
      const d=v4RelativePersonData(); if(!d.first_name_ar)return toast("اكتب الاسم الأول.");
      try{const dups=await v4CheckRelativeDuplicates();if(dups.length&&!$("#relativeDuplicateConfirm").checked)return toast("راجع الأسماء المشابهة ثم أكد أن الشخص جديد.",4500);}catch(e){return toast("تعذر فحص التكرار: "+e.message,4500);}
    }else if(!$("#relativeExistingPerson").value)return toast("اختر الشخص الموجود.");
    const rp=state.relativeDraft.mode==="new"?v4RelativePersonData():getPerson($("#relativeExistingPerson").value);
    const arrow=["father","mother"].includes(t)?"↓":["son","daughter"].includes(t)?"↓":"↔";
    $("#relativePreview").innerHTML=`<div class="v4-preview-person"><small>الشخص الحالي</small><strong>${esc(a.full_name_ar)}</strong><small>${esc(a.record_code||"")}</small></div><div class="v4-preview-relation"><span>${esc(V4_REL_LABEL[t])}</span><b>${arrow}</b></div><div class="v4-preview-person"><small>${state.relativeDraft.mode==="existing"?"سجل موجود":"الاسم الذي سيُحفظ"}</small><strong>${esc(rp?.full_name_ar||"—")}</strong><small>${state.relativeDraft.mode==="existing"?esc(rp?.record_code||""):"سيصدر له رقم SHG تلقائيًا"}</small></div>`;
    v4ShowRelativeStep(3);
  }
  async function v4SaveRelative(){
    const a=getPerson(state.activePersonId),t=state.relativeDraft.type,msg=$("#relativeBuilderMsg");if(!a||!t)return;
    msg.textContent="جاري الحفظ...";
    const params={p_anchor_id:a.id,p_relation_type:t,p_existing_person_id:state.relativeDraft.mode==="existing"?$("#relativeExistingPerson").value||null:null,p_person:state.relativeDraft.mode==="new"?v4RelativePersonData():{},p_other_parent_id:$("#relativeOtherParent").value||null,p_marriage_status:$("#relativeMarriageStatus").value||"unknown"};
    const {data,error}=await client.rpc("staff_add_relative_v4",params); if(error){msg.textContent="تعذر الحفظ: "+error.message;return;}
    msg.textContent="تمت الإضافة والربط ✅"; const personId=data?.person_id; await loadAccountData(); setTimeout(()=>{closeRelativeBuilder();openPerson(personId||a.id);},400);
  }

  function familySpouseMode(mode){state.familyBuilder.spouseMode=mode;[["none","#familySpouseNone"],["existing","#familySpouseExisting"],["new","#familySpouseNew"]].forEach(([m,s])=>$(s).classList.toggle("active",m===mode));$("#familyExistingSpouseWrap").classList.toggle("hidden",mode!=="existing");$("#familyNewSpouseWrap").classList.toggle("hidden",mode!=="new");if(mode==="new")$$("#familyChildrenRows .fb-child-other").forEach(s=>s.value="__new_spouse__");v4RenderFamilyPreview();}
  function v4FamilyOtherParentOptions(anchor){const fam=familyOf(anchor.id);return fam.spouses.map(p=>`<option value="${p.id}">${esc(p.full_name_ar)}</option>`).join("");}
  function addFamilyChildRow(seed={}){
    const a=getPerson(state.activePersonId);if(!a)return; const id=++state.familyBuilder.childSeq; const div=document.createElement("div");div.className="v4-child-row";div.dataset.rowId=id;
    div.innerHTML=`<label>اسم الطفل<input class="fb-child-name" value="${esc(seed.name||"")}" placeholder="الاسم الأول" /></label><label>الجنس<select class="fb-child-gender"><option value="male">ذكر</option><option value="female">أنثى</option><option value="unknown">غير محدد</option></select></label><label>الوالد الآخر<select class="fb-child-other"><option value="">— غير محدد —</option>${v4FamilyOtherParentOptions(a)}<option value="__new_spouse__" class="fb-new-spouse-option">الزوج/الزوجة الجديد أعلاه</option></select></label><button type="button" class="remove-family-child">×</button>`;
    $("#familyChildrenRows").appendChild(div); div.querySelector(".fb-child-gender").value=seed.gender||"male"; if(state.familyBuilder.spouseMode==="new")div.querySelector(".fb-child-other").value="__new_spouse__"; else{const fam=familyOf(a.id);if(fam.spouses.length===1)div.querySelector(".fb-child-other").value=fam.spouses[0].id;}
    div.querySelectorAll("input,select").forEach(x=>x.addEventListener("input",v4RenderFamilyPreview));div.querySelector(".remove-family-child").onclick=()=>{div.remove();v4RenderFamilyPreview();};v4RenderFamilyPreview();
  }
  function openFamilyBuilder(anchorId){
    if(!canAddPeopleDirect())return toast("لا تملك صلاحية إضافة أفراد مباشرة.");const a=getPerson(anchorId);if(!a)return;state.activePersonId=anchorId;state.familyBuilder={spouseMode:"none",childSeq:0};$("#familyAnchorName").textContent=a.full_name_ar;$("#familyBuilderMsg").textContent="";
    const fam=familyOf(a.id);const spouseCandidates=state.people.filter(p=>p.id!==a.id).filter(p=>a.gender==="male"?p.gender!=="male":a.gender==="female"?p.gender!=="female":true);$("#familyExistingSpouse").innerHTML='<option value="">— اختر —</option>'+spouseCandidates.map(p=>`<option value="${p.id}">${esc(personLabel(p))}</option>`).join("");$("#familyNewSpouseGender").value=a.gender==="male"?"female":a.gender==="female"?"male":"unknown";$("#familyNewSpouseName").value="";$("#familyChildrenRows").innerHTML="";familySpouseMode("none");addFamilyChildRow();$("#familyBuilderModal").classList.remove("hidden");
  }
  function closeFamilyBuilder(){$("#familyBuilderModal").classList.add("hidden");}
  function v4FamilyChildrenPayload(){
    const a=getPerson(state.activePersonId);
    return $$("#familyChildrenRows .v4-child-row").map(row=>{
      const first=row.querySelector(".fb-child-name").value.trim();
      const gender=row.querySelector(".fb-child-gender").value;
      const other=row.querySelector(".fb-child-other").value||null;

      let father=null;
      if(a?.gender==="male")father=a;
      else if(other&&other!=="__new_spouse__")father=getPerson(other);

      const fp=v4InferPersonParts(father);
      const ap=v4InferPersonParts(a);

      const person={
        first_name_ar:first,
        gender,
        is_living:true,
        record_confidence:"family_tradition",
        father_name_text:father?fp.first:null,
        grandfather_name_text:father?fp.father:null,
        great_grandfather_name_text:father?fp.grand:null,
        family_name_text:father?(fp.family||null):(ap.family||null)
      };

      person.full_name_ar=[
        person.first_name_ar,
        person.father_name_text,
        person.grandfather_name_text,
        person.great_grandfather_name_text,
        person.family_name_text
      ].filter(Boolean).join(" ");

      return {person,other_parent_id:other};
    }).filter(x=>x.person.first_name_ar);
  }
  function v4RenderFamilyPreview(){
    const a=getPerson(state.activePersonId),box=$("#familyBuilderPreview");if(!a||!box)return;const chips=[`<span>رب الأسرة: ${esc(a.full_name_ar)}</span>`];if(state.familyBuilder.spouseMode==="existing"){const p=getPerson($("#familyExistingSpouse").value);if(p)chips.push(`<span>زوج/زوجة: ${esc(p.full_name_ar)}</span>`);}if(state.familyBuilder.spouseMode==="new"&&$("#familyNewSpouseName").value.trim())chips.push(`<span>زوج/زوجة جديد: ${esc($("#familyNewSpouseName").value.trim())}</span>`);v4FamilyChildrenPayload().forEach(x=>chips.push(`<span>${x.person.gender==="female"?"ابنة":"ابن"}: ${esc(x.person.full_name_ar||x.person.first_name_ar)}</span>`));box.innerHTML=chips.join("");
  }
  async function saveFamilyBundle(){
    const a=getPerson(state.activePersonId),msg=$("#familyBuilderMsg");if(!a)return;const children=v4FamilyChildrenPayload();if(!children.length)return toast("أضف طفلًا واحدًا على الأقل، أو استخدم «إضافة قريب» لإضافة الزوج/الزوجة فقط.");
    let spouse={mode:state.familyBuilder.spouseMode};if(spouse.mode==="existing"){spouse.existing_person_id=$("#familyExistingSpouse").value||null;if(!spouse.existing_person_id)return toast("اختر الزوج/الزوجة الموجود.");}else if(spouse.mode==="new"){const name=$("#familyNewSpouseName").value.trim();if(!name)return toast("اكتب اسم الزوج/الزوجة الجديد.");const parts=name.split(/\s+/);spouse.person={full_name_ar:name,first_name_ar:parts[0],father_name_text:parts[1]||null,grandfather_name_text:parts[2]||null,great_grandfather_name_text:parts[3]||null,family_name_text:parts.length>4?parts.slice(4).join(" "):null,gender:$("#familyNewSpouseGender").value,is_living:true,record_confidence:"family_tradition"};}
    msg.textContent="جاري حفظ الأسرة...";const {data,error}=await client.rpc("staff_add_family_bundle_v4",{p_anchor_id:a.id,p_spouse:spouse,p_children:children});if(error){msg.textContent="تعذر الحفظ: "+error.message;return;}msg.textContent=`تم حفظ الأسرة ✅ (${data?.children_count||children.length} أبناء)`;await loadAccountData();setTimeout(()=>{closeFamilyBuilder();openPerson(a.id);setProfileTab("family");},450);
  }

  function setView(name){
    const allowed = name==="library" ? state.mode==="account" : name==="contribute" ? ["personal","account"].includes(state.mode) : name==="myfamily" ? state.mode==="account"&&!!state.profile?.person_id : name==="admin" ? state.mode==="account"&&["admin","editor"].includes(state.role) : true;
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
  $("#codeLoginForm").onsubmit=e=>{e.preventDefault();loginWithCode($("#loginCode").value);};
  $("#generalCodeForm").onsubmit=e=>{e.preventDefault();enterCodeMode($("#generalCode").value.trim(),"general");};
  $("#personalCodeForm").onsubmit=e=>{e.preventDefault();enterCodeMode($("#personalCode").value.trim(),"personal");};
  $("#loginTab").onclick=()=>{$("#loginTab").classList.add("active");$("#signupTab").classList.remove("active");$("#loginForm").classList.remove("hidden");$("#signupForm").classList.add("hidden");};
  $("#signupTab").onclick=()=>{$("#signupTab").classList.add("active");$("#loginTab").classList.remove("active");$("#signupForm").classList.remove("hidden");$("#loginForm").classList.add("hidden");if(state.accessCode){$("#claimCodeWrap").classList.remove("hidden");$("#signupClaimCode").value=state.accessCode;}};
  $("#loginForm").onsubmit=async e=>{e.preventDefault();$("#authMsg").textContent="جاري الدخول...";const {data,error}=await client.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error){$("#authMsg").textContent="تعذر الدخول: "+error.message;return;}$("#authMsg").textContent="";if(state.mode!=="account")await enterAccount(data.session);};
  $("#signupForm").onsubmit=async e=>{e.preventDefault();const p1=$("#signupPassword").value,p2=$("#signupPassword2").value;if(p1!==p2){$("#authMsg").textContent="كلمتا المرور غير متطابقتين.";return;}const claim=$("#signupClaimCode").value.trim();if(claim)localStorage.setItem("shugaa_pending_claim_code",claim);const {data,error}=await client.auth.signUp({email:$("#signupEmail").value.trim(),password:p1,options:{data:{display_name:$("#signupName").value.trim()},emailRedirectTo:window.location.href}});if(error){$("#authMsg").textContent="تعذر إنشاء الحساب: "+error.message;return;}if(data.session)await enterAccount(data.session);else $("#authMsg").textContent="تم إنشاء الحساب. افتح رسالة تأكيد البريد ثم سجل الدخول، وسيتم ربطه بملفك تلقائيًا إذا أدخلت كودك الشخصي.";};
  $("#forgotBtn").onclick=async()=>{const email=$("#email").value.trim();if(!email)return $("#authMsg").textContent="اكتب بريدك أولًا.";const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});$("#authMsg").textContent=error?error.message:"تم إرسال رابط الاستعادة إذا كان البريد مسجلًا.";};

  async function exitApp(){
    if(state.mode==="account"&&state.session)await client.auth.signOut();
    if(state.cy)state.cy.destroy();state.session=null;state.profile=null;state.people=[];showGate();
  }
  $("#exitBtn").onclick=exitApp; $("#statusLogoutBtn").onclick=exitApp;

  // Navigation & common
  $$(".nav-btn[data-view]").forEach(b=>b.onclick=()=>setView(b.dataset.view));$$("[data-go]").forEach(b=>b.onclick=()=>setView(b.dataset.go));$$("[data-close-modal]").forEach(x=>x.onclick=closePerson);
  $("#peopleSearch").oninput=e=>renderPeople(e.target.value);$("#treeSearch").oninput=e=>{if(!state.cy)return;const q=norm(e.target.value);state.cy.nodes().removeClass("search-hit");if(!q)return;const hits=state.cy.nodes().filter(n=>norm(n.data("label")).includes(q));hits.addClass("search-hit");if(hits.length===1)selectTreeNode(hits[0].id());if(hits.length)state.cy.animate({fit:{eles:hits,padding:120},duration:300});};
  $("#fitTreeBtn").onclick=()=>state.cy?.animate({fit:{eles:state.cy.elements().not(".tree-hidden"),padding:60},duration:280});
  $("#relayoutBtn").onclick=()=>{treeUI.collapsed.clear();clearTreeSelection();renderTree();};

  $("#shareTreeBtn")?.addEventListener("click",async()=>{
    const url=window.location.href.split("?")[0];
    const payload={title:"شجرة آل شجاع",text:"شجرة آل شجاع",url};
    try{
      if(navigator.share)await navigator.share(payload);
      else{
        await navigator.clipboard.writeText(url);
        toast("تم نسخ رابط الشجرة ✅");
      }
    }catch(_e){}
  });

  $("#treeQuickAddBtn")?.addEventListener("click",()=>{
    if(!canAddPeopleDirect())return toast("لا تملك صلاحية الإضافة المباشرة.");
    if(!state.people.length){setView("admin");setAdminPanel("person");return;}
    const sel=state.cy?.$("node:selected");openAddHub(sel&&sel.length?sel[0].id():null);
  });
  $("#findKinshipBtn").onclick=renderKinship;$("#startLineageBtn").onclick=()=>renderLineage();
  $("#profileLineageBtn").onclick=()=>{const id=state.activePersonId;closePerson();setView("lineage");$("#lineagePerson").value=id;renderLineage(id);};
  $("#profileKinshipBtn").onclick=()=>{const id=state.activePersonId;closePerson();setView("kinship");$("#kinshipA").value=id;};
  $("#profileContributeBtn").onclick=()=>{const id=state.activePersonId;closePerson();if(state.mode==="account"&&(state.role==="admin"||state.permissions?.edit_basic_person))openEditPerson(id);else if(state.mode==="account")openCorrection(id);else{setView("contribute");$("#contribTarget").value=id;}};
  $("#profileEditBtn").onclick=()=>{const id=state.activePersonId;closePerson();openEditPerson(id);};
  $$(".v4-profile-tab").forEach(b=>b.onclick=()=>setProfileTab(b.dataset.profileTab));
  $("#profileAddRelativeBtn").onclick=()=>{const id=state.activePersonId;closePerson();openAddHub(id);};
  $("#profileBuildFamilyBtn").onclick=()=>{const id=state.activePersonId;closePerson();openFamilyBuilder(id);};
  $("#profileBulkChildrenBtn").onclick=()=>{const id=state.activePersonId;closePerson();openFamilyBuilder(id);};
  $$("[data-quick-relative]").forEach(b=>b.onclick=()=>{const id=state.activePersonId,preset=b.dataset.quickRelative;closePerson();openRelativeBuilder(id,preset);});
  $$("[data-close-relative-builder]").forEach(x=>x.onclick=closeRelativeBuilder);
  $$("[data-relative-type]").forEach(b=>b.onclick=()=>v4ChooseRelation(b.dataset.relativeType));
  $$("[data-relative-back]").forEach(b=>b.onclick=()=>v4ShowRelativeStep(Number(b.dataset.relativeBack)));
  function v4BindPersonSearch(kind){
    const els=v4PersonSearchElements(kind);
    if(!els.input)return;

    els.input.addEventListener("focus",()=>{
      v4RenderPersonSearch(kind,els.input.value);
    });

    els.input.addEventListener("input",()=>{
      // Typing after a selection means the user is searching for a different person.
      if(els.hidden.value){
        els.hidden.value="";
        els.selected?.classList.add("hidden");
        els.clear?.classList.add("hidden");
        if(kind==="other"){
          els.hidden.dispatchEvent(new Event("change",{bubbles:true}));
        }
      }
      v4RenderPersonSearch(kind,els.input.value);
    });

    els.clear?.addEventListener("click",()=>{
      v4SelectPersonSearch(kind,"");
      els.input.focus();
      v4RenderPersonSearch(kind,"");
    });
  }

  v4BindPersonSearch("existing");
  v4BindPersonSearch("other");

  document.addEventListener("click",e=>{
    const result=e.target.closest("[data-person-search-kind][data-person-id]");
    if(result){
      v4SelectPersonSearch(result.dataset.personSearchKind,result.dataset.personId);
      return;
    }

    if(!e.target.closest(".person-search-field")){
      v4ClosePersonSearch("existing");
      v4ClosePersonSearch("other");
    }
  });

  $("#relativeModeNew").onclick=()=>v4SetRelativeMode("new");
  $("#relativeModeExisting").onclick=()=>{
    v4SetRelativeMode("existing");
    setTimeout(()=>$("#relativeExistingPersonSearch")?.focus(),60);
  };
  $("#relativeOtherParent")?.addEventListener("change",async()=>{
    v4UpdateRelativeName();
    const a=getPerson(state.activePersonId);
    if(["son","daughter"].includes(state.relativeDraft.type)){
      try{
        const parentForCode=a?.gender==="male"?a:getPerson($("#relativeOtherParent").value);
        if(parentForCode){
          const {data}=await client.rpc("suggest_lineage_code",{p_parent_id:parentForCode.id});
          if(data)$("#relativeLineageCode").value=data;
        }
      }catch(_e){}
    }
  });
  ["#relativeFirstName","#relativeFatherNameText","#relativeGrandfatherNameText","#relativeGreatNameText","#relativeFamilyNameText","#relativeBirthDate","#relativeBirthYear"].forEach(s=>$(s)?.addEventListener("input",v4UpdateRelativeName));
  $("#relativeToPreviewBtn").onclick=v4PrepareRelativePreview;
  $("#saveRelativeBtn").onclick=v4SaveRelative;
  $$("[data-close-family-builder]").forEach(x=>x.onclick=closeFamilyBuilder);
  $("#familySpouseNone").onclick=()=>familySpouseMode("none");$("#familySpouseExisting").onclick=()=>familySpouseMode("existing");$("#familySpouseNew").onclick=()=>familySpouseMode("new");
  $("#familyExistingSpouse").onchange=v4RenderFamilyPreview;$("#familyNewSpouseName").oninput=v4RenderFamilyPreview;$("#addFamilyChildRow").onclick=()=>addFamilyChildRow();$("#saveFamilyBundleBtn").onclick=saveFamilyBundle;
  $("#profileAddChildBtn").onclick=()=>{const id=state.activePersonId;closePerson();openAddChildModal(id);};
  $("#profileMergeBtn").onclick=()=>{const id=state.activePersonId;closePerson();openMergePerson(id);};
  $("#profileArchiveBtn").onclick=async()=>{
    const id=state.activePersonId, p=getPerson(id);
    if(!p || !canArchivePeople())return;
    const reason=prompt(`سبب أرشفة ${p.full_name_ar}؟\nمثال: سجل مكرر أضيف بالخطأ`);
    if(reason===null)return;
    if(!confirm(`سيختفي ${p.full_name_ar} من الشجرة لكنه لن يُحذف نهائيًا. متابعة؟`))return;
    const {data,error}=await client.rpc("admin_archive_person",{p_person_id:id,p_reason:reason||null});
    if(error)return toast("تعذر الأرشفة: "+error.message,5000);
    closePerson();
    toast("تمت أرشفة السجل ✅");
    await loadAccountData();
  };

  $$("[data-close-merge]").forEach(x=>x.onclick=closeMergePerson);
  $("#mergeDuplicatePerson").onchange=updateMergePreview;
  $("#mergeKeepPerson").onchange=updateMergePreview;

  $("#mergePersonForm").onsubmit=async e=>{
    e.preventDefault();
    if(!canMergePeople())return toast("لا تملك صلاحية الدمج.");
    const duplicateId=$("#mergeDuplicatePerson").value;
    const keepId=$("#mergeKeepPerson").value;
    const msg=$("#mergePersonMsg");
    if(!duplicateId || !keepId){msg.textContent="اختر السجلين.";return;}
    if(duplicateId===keepId){msg.textContent="لا يمكن دمج السجل مع نفسه.";return;}
    if(!$("#mergeConfirm").checked){msg.textContent="فعّل مربع التأكيد قبل الدمج.";return;}

    const duplicate=getPerson(duplicateId), keep=getPerson(keepId);
    if(!confirm(`تأكيد أخير:\nسيبقى ${keep?.full_name_ar||""} (${keep?.record_code||""})\nوسيتم دمج ${duplicate?.full_name_ar||""} (${duplicate?.record_code||""}) داخله.`))return;

    msg.textContent="جاري دمج العلاقات والمعلومات...";
    const {data,error}=await client.rpc("admin_merge_people",{p_keep_id:keepId,p_duplicate_id:duplicateId});
    if(error){
      msg.textContent="تعذر الدمج: "+error.message;
      return;
    }
    msg.textContent="تم الدمج بنجاح ✅";
    await loadAccountData();
    setTimeout(()=>{closeMergePerson();openPerson(keepId);},450);
  };

  $$('[data-close-add-child]').forEach(x=>x.onclick=closeAddChildModal);

  $("#childCurrentParentRole").onchange=async()=>{
    fillOtherParentOptions();
    deriveChildNameFromParents();
    $("#childLineageCode").value="";
    await suggestChildLineageCode();
  };
  $("#childOtherParent").onchange=async()=>{
    deriveChildNameFromParents();
    $("#childLineageCode").value="";
    await suggestChildLineageCode();
  };
  ["#childFirstName","#childFatherNameText","#childGrandfatherNameText","#childGreatNameText","#childFamilyNameText","#childBirthDate","#childBirthYear"]
    .forEach(s=>$(s)?.addEventListener("input",updateChildNamePreview));

  $("#checkChildDuplicatesBtn").onclick=async()=>{
    try{await checkChildDuplicates();}catch(err){toast("تعذر فحص التكرار: "+err.message,4500);}
  };

  $("#addChildForm").onsubmit=async e=>{
    e.preventDefault();
    if(!canAddPeopleDirect())return toast("لا تملك صلاحية إضافة أفراد مباشرة.");
    const current=getPerson(state.activePersonId);if(!current)return;
    const role=$("#childCurrentParentRole").value;
    const otherId=$("#childOtherParent").value||null;
    const n=childNameParts();
    const msg=$("#addChildMsg");
    msg.textContent="جاري فحص التكرار...";
    try{
      const dups=await checkChildDuplicates();
      if(dups.length&&!$("#childDuplicateConfirm").checked){
        msg.textContent="راجع الأسماء المشابهة ثم أكد أن الطفل جديد.";
        return;
      }
      const birthDate=$("#childBirthDate").value||null;
      const birthYear=toInt($("#childBirthYear").value)||(birthDate?parseInt(birthDate.slice(0,4),10):null);
      const row={
        full_name_ar:[n.first,n.father,n.grand,n.great,n.family].filter(Boolean).join(" "),
        first_name_ar:n.first,
        father_name_text:n.father||null,
        grandfather_name_text:n.grand||null,
        great_grandfather_name_text:n.great||null,
        family_name_text:n.family||null,
        gender:$("#childGender").value,
        birth_date:birthDate,
        birth_year:birthYear,
        birth_year_hijri:hijriYearOf("#childBirthYear"),
        is_living:true,
        record_confidence:$("#childConfidence").value,
        bio:$("#childBio").value.trim()||null,
        lineage_code:$("#childLineageCode").value.trim()||null,
        created_by:state.session.user.id,
        updated_by:state.session.user.id
      };
      const {data:child,error}=await client.from("people").insert(row).select().single();
      if(error)throw error;
      const rels=[];
      if(role==="father"){
        rels.push({parent_id:current.id,child_id:child.id,parent_role:"father",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});
        if(otherId)rels.push({parent_id:otherId,child_id:child.id,parent_role:"mother",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});
      }else{
        rels.push({parent_id:current.id,child_id:child.id,parent_role:"mother",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});
        if(otherId)rels.push({parent_id:otherId,child_id:child.id,parent_role:"father",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});
      }
      const {error:relError}=await client.from("parent_child_relations").insert(rels);
      if(relError)throw relError;
      msg.textContent="تمت إضافة الطفل وربطه بالأسرة ✅";
      const childId=child.id;
      await loadAccountData();
      setTimeout(()=>{closeAddChildModal();openPerson(childId);},450);
    }catch(err){
      msg.textContent="تعذر إضافة الطفل: "+err.message;
    }
  };

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
        birth_year_hijri:hijriYearOf("#eBirthYear"),
        death_date:deathDate,
        death_year:toInt($("#eDeathYear").value)||(deathDate?parseInt(deathDate.slice(0,4),10):null),
        death_year_hijri:hijriYearOf("#eDeathYear"),
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
      const row={full_name_ar:buildDisplayName(),first_name_ar:n.first,father_name_text:n.father||null,grandfather_name_text:n.grand||null,great_grandfather_name_text:n.great||null,family_name_text:n.family||null,gender:$("#pGender").value,birth_date:$("#pBirthDate").value||null,birth_year:toInt($("#pBirthYear").value)||($("#pBirthDate").value?parseInt($("#pBirthDate").value.slice(0,4),10):null),death_date:$("#pDeathDate").value||null,death_year:toInt($("#pDeathYear").value)||($("#pDeathDate").value?parseInt($("#pDeathDate").value.slice(0,4),10):null),birth_place_id:birthPlace,death_place_id:deathPlace,birth_year_hijri:hijriYearOf("#pBirthYear"),death_year_hijri:hijriYearOf("#pDeathYear"),is_living:$("#pLiving").checked,record_confidence:$("#pConfidence").value,bio:$("#pBio").value.trim()||null,lineage_code:$("#pLineageCode").value.trim()||null,created_by:state.session.user.id,updated_by:state.session.user.id};
      const {data,error}=await client.from("people").insert(row).select().single();if(error)throw error;
      const rels=[];if($("#pFather").value)rels.push({parent_id:$("#pFather").value,child_id:data.id,parent_role:"father",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});if($("#pMother").value)rels.push({parent_id:$("#pMother").value,child_id:data.id,parent_role:"mother",relation_kind:"biological",confidence:row.record_confidence,created_by:state.session.user.id});if(rels.length){const {error:re}=await client.from("parent_child_relations").insert(rels);if(re)throw re;}
      msg.textContent="تمت إضافة الشخص ✅";e.target.reset();$("#pLiving").checked=true;updateNamePreview();$("#duplicateBox").classList.add("hidden");$("#duplicateConfirmWrap").classList.add("hidden");await loadAccountData();
    }catch(err){msg.textContent="خطأ: "+err.message;}
  };

  // Access code admin
  $("#accessCodeType").onchange=()=>{const personal=$("#accessCodeType").value==="personal";$("#accessPersonWrap").classList.toggle("hidden",!personal);$("#accessRoleWrap").classList.toggle("hidden",!personal);$("#accessMaxUsesWrap").classList.toggle("hidden",personal);};
  $("#accessCodeType").onchange();
  $("#accessCodeForm").onsubmit=async e=>{e.preventDefault();const type=$("#accessCodeType").value,person=$("#accessPerson").value||null;if(type==="personal"&&!person)return toast("اختر الشخص للكود الشخصي.");const exp=$("#accessExpires").value?new Date($("#accessExpires").value).toISOString():null;const {data,error}=await client.rpc("admin_create_access_code",{p_code_type:type,p_person_id:person,p_label:$("#accessLabel").value.trim()||null,p_expires_at:exp,p_max_uses:type==="personal"?null:toInt($("#accessMaxUses").value),p_grant_role:type==="personal"?$("#accessGrantRole").value:"viewer"});if(error)return toast(error.message,4500);const code=data?.[0]?.access_code||"";if(code)showGeneratedAccessCode(code,"تم إنشاء الكود",getPerson(person)?.full_name_ar);await loadStaffData();};

  // Permission save
  $("#savePermissionsBtn").onclick=async()=>{const uid=$("#permissionUser").value;if(!uid)return toast("اختر المستخدم.");const rows=$$("#permissionMatrix input[data-code]").map(x=>({user_id:uid,permission_code:x.dataset.code,allowed:x.checked,updated_by:state.session.user.id,updated_at:new Date().toISOString()}));const {error}=await client.from("profile_permissions").upsert(rows,{onConflict:"user_id,permission_code"});if(error)toast(error.message,4500);else{toast("تم حفظ الصلاحيات ✅");await loadStaffData();}};

  // Event and library
  $("#addEventForm").onsubmit=async e=>{e.preventDefault();try{const place=await ensurePlace($("#eventPlace").value);const evType=$("#eventType").value;const {data:evRow,error}=await client.from("life_events").insert({person_id:$("#eventPerson").value,event_type:evType,event_year:toInt($("#eventYear").value),place_id:place,title:$("#eventTitle").value.trim()||null,description:$("#eventDescription").value.trim()||null,confidence:$("#eventConfidence").value}).select("id").single();if(error)throw error;$("#eventMsg").textContent="تم حفظ الحدث ✅";e.target.reset();await loadAccountData();if(evRow?.id&&["marriage","engagement","birth","graduation","achievement","death"].includes(evType))sendEventPush(evRow.id);}catch(err){$("#eventMsg").textContent=err.message;}};
  $("#addLibraryForm").onsubmit=async e=>{e.preventDefault();try{const row={title:$("#libTitle").value.trim(),item_type:$("#libType").value,record_year:toInt($("#libYear").value),summary:$("#libSummary").value.trim()||null,confidence:"family_tradition",access_level:$("#libAccess").value,external_url:$("#libExternalUrl").value.trim()||null,created_by:state.session.user.id,updated_by:state.session.user.id,status:"published"};const {data:item,error}=await client.from("library_items").insert(row).select().single();if(error)throw error;if($("#libPerson").value)await client.from("library_item_people").insert({item_id:item.id,person_id:$("#libPerson").value});const file=$("#libFile").files[0];if(file){const path=`${item.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g,"-")}`;const {error:ue}=await client.storage.from("family-library").upload(path,file,{contentType:file.type||undefined});if(ue)throw ue;await client.from("library_items").update({file_path:path,mime_type:file.type||null}).eq("id",item.id);}$("#libraryAdminMsg").textContent="تمت الإضافة ✅";e.target.reset();await loadAccountData();}catch(err){$("#libraryAdminMsg").textContent=err.message;}};

  // V7.1 — dual-calendar year inputs. Existing code keeps reading .value as a Gregorian year;
  // when the field is in Hijri mode the typed Hijri year is kept in data-hijri and converted.
  const YEAR_FIELDS=["#pBirthYear","#pDeathYear","#eBirthYear","#eDeathYear","#relativeBirthYear","#childBirthYear"];
  const nativeInputValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");
  function hijriYearOf(sel){const el=$(sel);return el&&el.dataset.cal==="hijri"?toInt(nativeInputValue.get.call(el)):null;}
  function setYearField(sel,greg,hijri){const el=$(sel);if(!el)return;if(hijri){el._setCal?.("hijri");nativeInputValue.set.call(el,hijri);}else{el._setCal?.("gregorian");nativeInputValue.set.call(el,greg||"");}el._hint?.();}
  function enhanceYearField(el){
    if(!el||el.dataset.calReady)return; el.dataset.calReady="1"; el.dataset.cal="gregorian";
    const wrap=document.createElement("div"); wrap.className="cal-field";
    el.parentNode.insertBefore(wrap,el); wrap.appendChild(el);
    const tog=document.createElement("div"); tog.className="cal-toggle"; tog.setAttribute("role","group"); tog.setAttribute("aria-label","التقويم");
    tog.innerHTML='<button type="button" data-c="hijri">هـ</button><button type="button" data-c="gregorian" class="on">م</button>';
    wrap.appendChild(tog);
    const hint=document.createElement("small"); hint.className="cal-hint"; wrap.after(hint);
    const raw=()=>toInt(nativeInputValue.get.call(el));
    el._hint=()=>{const v=raw(),H=window.ShugaaHijri;hint.textContent=!v?"":el.dataset.cal==="hijri"?`يوافق تقريبًا ${H.hYearToG(v)} م`:`يوافق ${H.gYearToH(v)} هـ`;};
    el._setCal=c=>{el.dataset.cal=c;el.max=c==="hijri"?"1700":"3000";el.placeholder=c==="hijri"?"مثال: 1385":"مثال: 1965";tog.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.c===c));};
    Object.defineProperty(el,"value",{configurable:true,
      get(){const v=nativeInputValue.get.call(this);if(this.dataset.cal!=="hijri"||!v)return v;const n=parseInt(v,10);return Number.isFinite(n)?String(window.ShugaaHijri.hYearToG(n)):v;},
      set(v){nativeInputValue.set.call(this,v);if(this.dataset.cal==="hijri"&&!v){} el._hint?.();}});
    tog.addEventListener("click",e=>{const b=e.target.closest("button");if(!b||b.dataset.c===el.dataset.cal)return;const v=raw(),H=window.ShugaaHijri;
      el._setCal(b.dataset.c);
      if(v)nativeInputValue.set.call(el,b.dataset.c==="hijri"?String(H.side(v,null,null).h).split("/")[0].replace(" هـ",""):String(H.hYearToG(v)));
      el._hint();el.dispatchEvent(new Event("input",{bubbles:true}));});
    el.addEventListener("input",el._hint);
    el.form?.addEventListener("reset",()=>setTimeout(()=>{el._setCal("gregorian");el._hint();},0));
    el._setCal("gregorian");
  }
  YEAR_FIELDS.forEach(s=>enhanceYearField($(s)));

  // calendar display preference (per viewer)
  (()=>{const box=$(".user-box");if(!box)return;const sel=document.createElement("select");sel.id="calendarPref";sel.className="calendar-pref no-search";sel.setAttribute("aria-label","طريقة عرض التواريخ");
    sel.innerHTML='<option value="both">📅 هجري وميلادي</option><option value="hijri">📅 هجري</option><option value="gregorian">📅 ميلادي</option>';
    sel.value=window.ShugaaHijri.getMode(); box.appendChild(sel);
    sel.onchange=()=>{window.ShugaaHijri.setMode(sel.value);renderPeople($("#peopleSearch")?.value||"");if(state.activePersonId&&!$("#personModal").classList.contains("hidden"))openPerson(state.activePersonId);toast("تم تغيير طريقة عرض التاريخ");};})();

  // V8 — one way to add people: start from an existing person, pick the relation, fill a short form.
  const HUB_ERR={"Add people permission required":"لا تملك صلاحية إضافة أفراد.","Add a father or mother to the anchor person first":"سجّل أب أو أم لهذا الشخص أولًا، عشان نربط الإخوة صح.","No valid names":"اكتب اسم واحد على الأقل."};
  const hubErr=m=>HUB_ERR[m]||m;
  let hubAnchor=null, batchState={anchor:null,rel:null};
  const hubRequestMode=()=>!canAddPeopleDirect();
  function openAddHub(anchorId){
    if(state.mode!=="account")return toast("سجّل دخولك برمزك عشان تقدر تضيف.");
    hubAnchor=anchorId||null;
    $("#hubPicker").classList.toggle("hidden",!!hubAnchor);
    if(!hubAnchor) $("#hubPerson").value="";
    syncHub(); $("#addHubModal").classList.remove("hidden");
  }
  function closeAddHub(){$("#addHubModal").classList.add("hidden");}
  function syncHub(){
    const a=hubAnchor?getPerson(hubAnchor):null, f=a?familyOf(a.id):null;
    $("#hubCompass").classList.toggle("disabled",!a);
    $("#hubCenterName").textContent=a?(a.first_name_ar||a.full_name_ar.split(" ")[0]):"؟";
    $("#hubSubtitle").textContent=a?`اختر صلة القرابة حول ${a.full_name_ar}`:"اختر الشخص أولًا";
    const fb=$('[data-hub-rel="father"]'), mb=$('[data-hub-rel="mother"]');
    fb.disabled=!a||!!f?.father; fb.textContent=f?.father?"أب ✓":"أب";
    mb.disabled=!a||!!f?.mother; mb.textContent=f?.mother?"أم ✓":"أم";
    $("#hubSpouseHint").textContent=f&&f.spouses.length?`${f.spouses.length} مسجل`:"";
    $("#hubChildHint").textContent=f&&f.children.length?`${f.children.length} مسجل`:"";
    const noParents=f&&!f.father&&!f.mother;
    $('[data-hub-rel="sibling"]').disabled=!a||noParents;
    $("#hubSiblingHint").textContent=noParents?"يحتاج أب أو أم أولًا":"";
    $('[data-hub-rel="spouse"]').disabled=!a; $('[data-hub-rel="child"]').disabled=!a;
  }
  $("#hubPerson").addEventListener("change",()=>{hubAnchor=$("#hubPerson").value||null;syncHub();});
  $$("[data-close-hub]").forEach(b=>b.onclick=closeAddHub);
  $$("[data-hub-rel]").forEach(b=>b.onclick=()=>{
    const id=hubAnchor, rel=b.dataset.hubRel; if(!id||b.disabled)return;
    closeAddHub();
    if(rel==="child"||rel==="sibling"||hubRequestMode()) openBatch(id,rel); else openRelativeBuilder(id,rel);
  });
  $("#addStartBtn").onclick=()=>{const id=$("#addStartPerson").value;if(!id)return toast("اختر الشخص أولًا.");openAddHub(id);};

  function batchRow(){
    const row=document.createElement("div"); row.className="batch-row";
    const uid="b"+Math.random().toString(36).slice(2,8);
    row.innerHTML=`<div class="batch-row-head"><b class="batch-num"></b><button type="button" class="batch-remove">حذف</button></div>
      <label>الاسم الأول<input class="batch-name" placeholder="مثال: أحمد" autocomplete="off"/></label>
      <div class="batch-grid">
        <fieldset class="seg"><legend>الجنس</legend><label><input type="radio" name="g${uid}" value="male" checked><span>ذكر</span></label><label><input type="radio" name="g${uid}" value="female"><span>أنثى</span></label></fieldset>
        <fieldset class="seg"><legend>الحالة</legend><label><input type="radio" name="l${uid}" value="true" checked><span>حي</span></label><label><input type="radio" name="l${uid}" value="false"><span>متوفى</span></label><label><input type="radio" name="l${uid}" value=""><span>غير معروف</span></label></fieldset>
      </div>
      <label>سنة الميلاد (اختياري)<input class="batch-year" type="number" inputmode="numeric" min="1" max="3000"/></label>`;
    $("#batchRows").appendChild(row);
    enhanceYearField(row.querySelector(".batch-year"));
    row.querySelector(".batch-remove").onclick=()=>{row.remove();if(!$$("#batchRows .batch-row").length)batchRow();numberBatch();};
    row.querySelector(".batch-name").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();batchRow();$$("#batchRows .batch-name").pop().focus();}});
    numberBatch(); return row;
  }
  function numberBatch(){const rows=$$("#batchRows .batch-row");rows.forEach((r,i)=>{r.querySelector(".batch-num").textContent=`الفرد ${i+1}`;r.querySelector(".batch-remove").classList.toggle("hidden",rows.length===1);});}
  const BATCH_TITLE={child:"إضافة أبناء إلى",sibling:"إضافة إخوة إلى",father:"إضافة أب لـ",mother:"إضافة أم لـ",spouse:"إضافة زوج / زوجة لـ"};
  function openBatch(anchorId,rel){
    const a=getPerson(anchorId); if(!a)return; const f=familyOf(a.id);
    const req=hubRequestMode(), single=!["child","sibling"].includes(rel);
    batchState={anchor:a.id,rel,req,single};
    $("#batchTitle").textContent=`${BATCH_TITLE[rel]} ${a.full_name_ar}`;
    $("#batchCard")?.classList.toggle("single",single);
    $("#batchAddRow").classList.toggle("hidden",single);
    $("#batchReqNote").classList.toggle("hidden",!req); $("#batchReqNoteInput").value="";
    $("#batchSave").textContent=req?"إرسال للإدارة":"إضافة الأفراد";
    const existing=rel==="spouse"?f.spouses:["father","mother"].includes(rel)?[]:rel==="child"?f.children:[...new Set(state.relations.filter(r=>(f.father&&r.parent_id===f.father.id)||(f.mother&&r.parent_id===f.mother.id)).map(r=>r.child_id))].filter(id=>id!==a.id).map(getPerson).filter(Boolean);
    const box=$("#batchExisting");
    if(existing.length){box.innerHTML=`<b>${({child:"الأبناء المسجلين",sibling:"الإخوة المسجلين",spouse:"الأزواج المسجلين"})[rel]} (${existing.length}):</b> `+existing.map(c=>`<span class="meta-pill">${esc(c.first_name_ar||c.full_name_ar.split(" ")[0])}</span>`).join(" ");box.classList.remove("hidden");}else box.classList.add("hidden");
    const op=$("#batchOtherParent"); op.innerHTML='<option value="">غير محدد</option>';
    const showOther=rel==="child"&&a.gender!=="unknown"&&a.gender;
    if(showOther){$("#batchOtherParentLabel").textContent=a.gender==="male"?"الأم":"الأب";f.spouses.forEach(sp=>op.add(new Option(sp.full_name_ar,sp.id)));if(f.spouses.length===1)op.value=f.spouses[0].id;}
    $("#batchOtherParentWrap").classList.toggle("hidden",!showOther);
    $("#batchRows").innerHTML=""; const first=batchRow(); $("#batchMsg").textContent="";
    if(single){const g=rel==="father"?"male":rel==="mother"?"female":(a.gender==="male"?"female":a.gender==="female"?"male":null);
      const seg=first.querySelector(".seg");if(g){first.querySelector(`input[value="${g}"]`).checked=true;seg.classList.add("hidden");}
      first.querySelector(".batch-num").textContent="";}
    $("#batchModal").classList.remove("hidden"); setTimeout(()=>$(".batch-name")?.focus(),60);
  }
  function closeBatch(){$("#batchModal").classList.add("hidden");}
  $$("[data-close-batch]").forEach(b=>b.onclick=closeBatch);
  $("#batchAddRow").onclick=()=>{batchRow();$$("#batchRows .batch-name").pop().focus();};
  $("#batchSave").onclick=async()=>{
    const msg=$("#batchMsg"), {anchor,rel}=batchState; if(!anchor)return;
    const people=$$("#batchRows .batch-row").map(r=>{
      const y=r.querySelector(".batch-year"), hijri=y.dataset.cal==="hijri"?toInt(nativeInputValue.get.call(y)):null, greg=toInt(y.value);
      const life=r.querySelector('input[name^="l"]:checked').value;
      return {first_name_ar:r.querySelector(".batch-name").value.trim(),gender:r.querySelector('input[name^="g"]:checked').value,
        is_living:life===""?null:life==="true",birth_year:greg?String(greg):"",birth_year_hijri:hijri?String(hijri):""};
    }).filter(p=>p.first_name_ar);
    if(!people.length){msg.textContent="اكتب اسم واحد على الأقل.";return;}
    const long=people.find(p=>p.first_name_ar.split(/\s+/).length>2);
    if(long&&!confirm(`«${long.first_name_ar}» فيه أكثر من كلمتين. اكتب الاسم الأول بس، والنظام يكمل الباقي. متابعة كذا؟`))return;
    const existing=new Set(($("#batchExisting").textContent||"").split(/\s+/).map(BULK_NORM));
    const dups=people.filter(p=>existing.has(BULK_NORM(p.first_name_ar))).map(p=>p.first_name_ar);
    if(dups.length&&!confirm(`مسجلين أصلًا بنفس الاسم: ${dups.join("، ")}\nتبي تضيفهم مرة ثانية؟`))return;
    msg.textContent=batchState.req?"جاري الإرسال...":"جاري الحفظ..."; $("#batchSave").disabled=true;
    if(batchState.req){
      const payload={relation:rel,people,other_parent_id:$("#batchOtherParent").value||null,other_parent_name:$("#batchOtherParent").selectedOptions[0]?.value?$("#batchOtherParent").selectedOptions[0].textContent:null};
      const {data:code,error:e2}=await client.rpc("submit_smart_request",{p_kind:"add_relatives",p_target_person_id:anchor,p_payload:payload,p_note:$("#batchReqNoteInput").value});
      $("#batchSave").disabled=false;
      if(e2){msg.textContent="تعذر الإرسال: "+e2.message;return;}
      closeBatch(); toast(`وصل طلبك للإدارة ✅ رقمه ${code}`,5000); try{await loadAccountRequests();}catch(_){} return;
    }
    const {data,error}=await client.rpc("staff_add_people_batch",{p_anchor_id:anchor,p_relation:rel,p_people:people,p_other_parent_id:$("#batchOtherParent").value||null});
    $("#batchSave").disabled=false;
    if(error){msg.textContent="تعذر الحفظ: "+hubErr(error.message)+" (لم يُحفظ أي اسم)";return;}
    closeBatch(); toast(`تمت إضافة ${data?.count||people.length} ✅`);
    try{await loadAccountData();}catch(e){console.error(e);}
    openPerson(anchor); setProfileTab("family");
  };

  // V8.1 — smart requests: readable summary for the reviewer, and a correction form for members.
  const REL_AR={child:"أبناء",sibling:"إخوة",father:"أب",mother:"أم",spouse:"زوج / زوجة"};
  const FIELD_AR={first_name_ar:"الاسم الأول",gender:"الجنس",is_living:"الحالة",birth_year:"سنة الميلاد م",birth_year_hijri:"سنة الميلاد هـ",death_year:"سنة الوفاة م",death_year_hijri:"سنة الوفاة هـ",bio:"نبذة"};
  const fmtVal=(k,v)=>v===null||v===undefined||v===""?"—":k==="gender"?(v==="male"?"ذكر":v==="female"?"أنثى":v):k==="is_living"?(String(v)==="true"?"حي":String(v)==="false"?"متوفى":"غير معروف"):String(v);
  function smartRequestHtml(r){
    const p=r.payload||{}, t=getPerson(r.target_person_id), who=esc(r.requester_name||"عضو"), tn=esc(t?.full_name_ar||"شخص");
    if(r.request_type==="add_relatives"){
      const ppl=(p.people||[]).map(x=>`<li><b>${esc(x.first_name_ar)}</b> <small>${fmtVal("gender",x.gender)} • ${fmtVal("is_living",x.is_living)}${x.birth_year_hijri?` • ${esc(x.birth_year_hijri)} هـ`:x.birth_year?` • ${esc(x.birth_year)} م`:""}</small></li>`).join("");
      return `<div class="smart-req"><p>📝 <b>${who}</b> يطلب إضافة <b>${REL_AR[p.relation]||""}</b> لـ <b>${tn}</b>${p.other_parent_name?` (${p.relation==="child"?"من":"مع"} ${esc(p.other_parent_name)})`:""}:</p><ul>${ppl}</ul>${r.requester_relation_note?`<p class="muted">ملاحظة: ${esc(r.requester_relation_note)}</p>`:""}</div>`;
    }
    const ch=p.changes||{};
    const rows=Object.keys(ch).map(k=>`<li><span>${FIELD_AR[k]||esc(k)}:</span> <del>${esc(fmtVal(k,ch[k].from))}</del> ← <b>${esc(fmtVal(k,ch[k].to))}</b></li>`).join("");
    return `<div class="smart-req"><p>✏️ <b>${who}</b> يطلب تصحيح بيانات <b>${tn}</b>:</p><ul>${rows}</ul>${r.requester_relation_note?`<p class="muted">ملاحظة: ${esc(r.requester_relation_note)}</p>`:""}</div>`;
  }
  let corrTarget=null;
  function openCorrection(id){
    const p=getPerson(id); if(!p)return; corrTarget=p;
    $("#corrTitle").textContent=`تصحيح بيانات ${p.full_name_ar}`;
    $("#corrFirst").value=p.first_name_ar||"";
    $$('#corrModal input[name="corrG"]').forEach(i=>i.checked=i.value===(p.gender||""));
    const life=p.is_living===true?"true":p.is_living===false?"false":"";
    $$('#corrModal input[name="corrL"]').forEach(i=>i.checked=i.value===life);
    setYearField("#corrBirth",p.birth_year,p.birth_year_hijri); setYearField("#corrDeath",p.death_year,p.death_year_hijri);
    $("#corrBio").value=p.bio||""; $("#corrNote").value=""; $("#corrMsg").textContent="";
    $("#corrModal").classList.remove("hidden");
  }
  $$("[data-close-corr]").forEach(b=>b.onclick=()=>$("#corrModal").classList.add("hidden"));
  $("#corrSave").onclick=async()=>{
    const p=corrTarget; if(!p)return; const ch={};
    const put=(k,from,to)=>{const f=from??"", t=to??""; if(String(f)!==String(t))ch[k]={from:from??null,to:to===""?null:to};};
    put("first_name_ar",p.first_name_ar,$("#corrFirst").value.trim());
    const g=$('#corrModal input[name="corrG"]:checked')?.value; if(g)put("gender",p.gender,g);
    const l=$('#corrModal input[name="corrL"]:checked')?.value; if(l!==undefined)put("is_living",p.is_living,l===""?null:l==="true");
    const by=hijriYearOf("#corrBirth"), bg=toInt($("#corrBirth").value), dy=hijriYearOf("#corrDeath"), dg=toInt($("#corrDeath").value);
    if(by){put("birth_year_hijri",p.birth_year_hijri,by);put("birth_year",p.birth_year,bg);}else put("birth_year",p.birth_year,bg);
    if(dy){put("death_year_hijri",p.death_year_hijri,dy);put("death_year",p.death_year,dg);}else put("death_year",p.death_year,dg);
    put("bio",p.bio,$("#corrBio").value.trim());
    if(!Object.keys(ch).length){$("#corrMsg").textContent="ما غيّرت أي شي.";return;}
    $("#corrSave").disabled=true; $("#corrMsg").textContent="جاري الإرسال...";
    const {data:code,error}=await client.rpc("submit_smart_request",{p_kind:"correction",p_target_person_id:p.id,p_payload:{changes:ch},p_note:$("#corrNote").value});
    $("#corrSave").disabled=false;
    if(error){$("#corrMsg").textContent="تعذر الإرسال: "+error.message;return;}
    $("#corrModal").classList.add("hidden"); toast(`وصل طلب التصحيح للإدارة ✅ رقمه ${code}`,5000);
  };
  $("#smartContribAdd").onclick=()=>{const id=$("#smartContribPerson").value;if(!id)return toast("اختر الشخص أولًا.");openAddHub(id);};
  $("#smartContribFix").onclick=()=>{const id=$("#smartContribPerson").value;if(!id)return toast("اختر الشخص أولًا.");openCorrection(id);};
  YEAR_FIELDS.push("#corrBirth","#corrDeath"); enhanceYearField($("#corrBirth")); enhanceYearField($("#corrDeath"));

  // V9.1 — "more" sheet on phones
  const moreSheet=$("#moreSheet");
  $("#moreNavBtn").onclick=e=>{e.stopPropagation();moreSheet.classList.toggle("hidden");};
  $$("[data-close-more]").forEach(b=>b.onclick=()=>moreSheet.classList.add("hidden"));
  $$("#moreSheet .nav-btn[data-view]").forEach(b=>b.addEventListener("click",()=>{moreSheet.classList.add("hidden");setView(b.dataset.view);}));

  // V10 — living home page
  const EVT={marriage:{t:"زواج",k:"joy",btn:"مبروك"},engagement:{t:"خطوبة",k:"joy",btn:"مبروك"},birth:{t:"مولود",k:"joy",btn:"مبروك"},graduation:{t:"تخرج",k:"joy",btn:"مبروك"},achievement:{t:"إنجاز",k:"joy",btn:"مبروك"},
    death:{t:"وفاة",k:"grief",btn:"رحمه الله"},burial:{t:"وفاة",k:"grief",btn:"رحمه الله"},migration:{t:"انتقال",k:"note",btn:"👍"},residence:{t:"سكن",k:"note",btn:"👍"},historical:{t:"حدث تاريخي",k:"note",btn:"👍"},other:{t:"خبر",k:"note",btn:"👍"}};
  const homeState={reacts:new Map(),knowIdx:0,counted:false};
  const nameNorm=v=>String(v||"").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").trim();
  function firstName(p){return p?(p.first_name_ar||String(p.full_name_ar||"").split(/\s+/)[0]):"";}
  function treeModelLevels(){
    const m=buildTreeModel(); const kids=new Map(), hasParent=new Set();
    m.edges.forEach(({parent,child})=>{(kids.get(parent)||kids.set(parent,[]).get(parent)).push(child);hasParent.add(child);});
    const roots=m.people.filter(p=>!hasParent.has(p.id)).map(p=>p.id);
    return {kids,roots,count:m.people.length};
  }
  function renderHomeTree(){
    const svg=$("#h2Tree"); if(!svg)return; const {kids,roots}=treeModelLevels(); if(!roots.length){svg.innerHTML="";return;}
    const pos=new Map(); let leaf=0, maxD=0;
    const place=(id,d,seen)=>{if(seen.has(id))return; seen.add(id); maxD=Math.max(maxD,d); const ch=kids.get(id)||[];
      if(!ch.length){pos.set(id,{x:leaf++,d});return;} ch.forEach(c=>place(c,d+1,seen)); const xs=ch.map(c=>pos.get(c)?.x).filter(x=>x!==undefined); pos.set(id,{x:xs.length?(Math.min(...xs)+Math.max(...xs))/2:leaf++,d});};
    const seen=new Set(); roots.forEach(r=>place(r,0,seen));
    const W=1000,H=420, padX=40, step=(H-80)/Math.max(1,maxD), sx=(W-2*padX)/Math.max(1,leaf-1||1);
    const P=id=>{const q=pos.get(id);return {x:W-padX-q.x*sx, y:H-40-q.d*step};};
    let lines="", dots="";
    pos.forEach((q,id)=>{(kids.get(id)||[]).forEach(c=>{if(!pos.has(c))return;const a=P(id),b=P(c),my=(a.y+b.y)/2;
      lines+=`<path d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${a.x.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}" style="--d:${(q.d*0.35).toFixed(2)}s"/>`;});
      const pt=P(id); dots+=`<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${q.d===0?7:Math.max(2.2,4.2-q.d*0.4)}" style="--d:${(q.d*0.35+0.25).toFixed(2)}s"/>`;});
    svg.setAttribute("viewBox",`0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio","xMidYMax meet");
    svg.innerHTML=`<g class="h2-lines">${lines}</g><g class="h2-dots">${dots}</g>`;
    homeState.maxDepth=maxD;
  }
  function countUp(el,to){const t0=performance.now(),dur=1100;const tick=t=>{const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=Math.round(to*e).toLocaleString("ar-SA-u-nu-latn");if(k<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);}
  function homeFacts(){
    const ppl=buildTreeModel().people, counts=new Map();
    ppl.forEach(p=>{const n=nameNorm(firstName(p));if(n)counts.set(n,(counts.get(n)||{n:firstName(p),c:0})),counts.get(n).c++;});
    const top=[...counts.values()].sort((a,b)=>b.c-a.c).slice(0,6);
    const byKids=ppl.map(p=>({p,c:familyOf(p.id).children.length})).sort((a,b)=>b.c-a.c)[0];
    const {roots,count}=treeModelLevels(); const root=getPerson(roots[0]);
    const newest=[...ppl].filter(p=>p.created_at).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
    return {top,byKids,root,newest,count};
  }
  function knowItems(){
    const items=[], me=state.mode==="account"?getPerson(state.profile?.person_id):null, f=homeFacts();
    if(me){
      const mine=ancestorPaths(me.id), myFam=familyOf(me.id), close=new Set([me.id,...myFam.children.map(x=>x.id),...myFam.spouses.map(x=>x.id),myFam.father?.id,myFam.mother?.id].filter(Boolean));
      const pool=state.people.filter(p=>!close.has(p.id));
      const day=Math.floor(Date.now()/864e5);
      for(let k=0;k<Math.min(pool.length,40)&&items.length<4;k++){
        const o=pool[(day*7+k*13)%pool.length]; const theirs=ancestorPaths(o.id); let best=null;
        for(const [aid,pa] of mine){if(theirs.has(aid)){const sc=pa.length+theirs.get(aid).length;if(!best||sc<best.sc)best={aid,sc,da:pa.length-1,db:theirs.get(aid).length-1};}}
        if(!best||best.aid===o.id||best.aid===me.id)continue;
        const anc=getPerson(best.aid); const same=best.da===best.db;
        items.push(`تلتقي مع <button class="h2-person" data-pid="${o.id}">${esc(o.full_name_ar)}</button> عند الجد <b>${esc(firstName(anc))}</b>${same?" — وأنتم من نفس الجيل":best.db<best.da?" — وهو من جيل أعلى منك":" — وهو من جيل بعدك"}.`);
      }
    }
    if(f.top[0])items.push(`أكثر اسم تكرر في العائلة: <b>${esc(f.top[0].n)}</b> — ${f.top[0].c} مرات.`);
    if(f.byKids&&f.byKids.c>1)items.push(`أكبر أسرة مسجلة: <button class="h2-person" data-pid="${f.byKids.p.id}">${esc(f.byKids.p.full_name_ar)}</button> وعنده ${f.byKids.c} من الأبناء والبنات.`);
    if(f.root)items.push(`أقدم جد مسجل في الشجرة: <button class="h2-person" data-pid="${f.root.id}">${esc(f.root.full_name_ar)}</button>، ومنه تفرعت ${homeState.maxDepth+1||"عدة"} أجيال.`);
    if(f.newest)items.push(`آخر من انضاف للشجرة: <button class="h2-person" data-pid="${f.newest.id}">${esc(f.newest.full_name_ar)}</button>.`);
    return items;
  }
  function renderKnow(){const items=knowItems(); const box=$("#h2Know"); if(!items.length){box.innerHTML="<p class='muted'>أضف أفراد للشجرة وتطلع لك الاكتشافات هنا.</p>";return;}
    box.innerHTML=`<p class="h2-know-text">${items[homeState.knowIdx%items.length]}</p>`; box.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>openPerson(b.dataset.pid));}
  function eventDateText(e){const H=window.ShugaaHijri; if(e.event_date)return H.pick(H.side(null,null,e.event_date).full); if(e.event_year)return H.pick(H.side(e.event_year,null,null)); return "";}
  function renderHomeNews(){
    const box=$("#h2News"); const rows=[...state.events].sort((a,b)=>String(b.event_date||b.event_year||"").localeCompare(String(a.event_date||a.event_year||""))||String(b.created_at||"").localeCompare(String(a.created_at||""))).slice(0,4);
    if(!rows.length){box.innerHTML=`<div class="h2-empty"><b>ما فيه أخبار للحين</b><p>أول زواج أو مولود ينضاف، يطلع هنا ويباركون له الكل.</p>${canAddPeopleDirect()?`<button type="button" class="btn gold" id="h2AddNews">أضف أول خبر</button>`:""}</div>`;
      $("#h2AddNews")?.addEventListener("click",()=>{setView("admin");setAdminPanel("event");});return;}
    const acct=state.mode==="account";
    box.innerHTML=rows.map((e,i)=>{const m=EVT[e.event_type]||EVT.other, p=getPerson(e.person_id), r=homeState.reacts.get(e.id)||{total:0,mine:false};
      return `<div class="h2-news-item ${m.k}" style="--i:${i}">
        <div class="h2-news-badge">${esc(m.t)}</div>
        <div class="h2-news-body"><h4>${esc(e.title||m.t)}</h4>
          ${p?`<button class="h2-person" data-pid="${p.id}">${esc(p.full_name_ar)}</button>`:""}
          ${e.description?`<p>${esc(e.description)}</p>`:""}<small>${esc(eventDateText(e))}</small></div>
        ${acct?`<button type="button" class="h2-react ${r.mine?"on":""}" data-eid="${e.id}"><span>${esc(m.btn)}</span>${r.total?`<b>${r.total}</b>`:""}</button>`:(r.total?`<span class="h2-react-count">${r.total}</span>`:"")}
      </div>`;}).join("");
    box.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>openPerson(b.dataset.pid));
    box.querySelectorAll(".h2-react").forEach(b=>b.onclick=async()=>{b.disabled=true;const {data,error}=await client.rpc("toggle_event_reaction",{p_event_id:b.dataset.eid});b.disabled=false;
      if(error)return toast("تعذر: "+error.message);homeState.reacts.set(data.event_id,{total:data.total,mine:data.mine});renderHomeNews();if(data.mine)b.classList.add("pop");});
  }
  async function loadReactions(){if(state.mode!=="account")return;try{const {data}=await client.rpc("event_reactions_summary");homeState.reacts=new Map((data||[]).map(r=>[r.event_id,{total:r.total,mine:r.mine}]));renderHomeNews();}catch(_){}}
  function renderHome(){
    if(!$("#home2"))return;
    const H=window.ShugaaHijri, now=new Date(), hj=H.gToH(now.getFullYear(),now.getMonth()+1,now.getDate());
    $("#h2Date").textContent=`${now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{weekday:"long"})} • ${H.fmtHDate(hj)} • ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} م`;
    const me=state.mode==="account"?getPerson(state.profile?.person_id):null;
    const dn=String(state.profile?.display_name||""); const nm=me?firstName(me):(state.mode==="account"&&!dn.includes("@")?dn.split(/\s+/)[0]:"");
    const hr=now.getHours(); $("#h2Greeting").textContent=`${hr>=4&&hr<12?"صباح الخير":"مساء الخير"}${nm?` يا ${nm}`:""}`;
    renderHomeTree();
    const lin=$("#h2Lineage");
    if(me){const chain=ancestorsFrom(me.id).map(getPerson).filter(Boolean); $("#h2Sub").innerHTML=`أنت من <b>الجيل ${chain.length}</b> في آل شجاع`;
      lin.innerHTML=chain.map((p,i)=>`<button class="h2-chip" style="--i:${i}" data-pid="${p.id}">${esc(firstName(p))}</button>`).join('<i>←</i>'); lin.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>openPerson(b.dataset.pid));}
    else{$("#h2Sub").textContent="كل اسمٍ له قصة، وكل جيلٍ امتداد.";lin.innerHTML="";}
    const f=homeFacts(); const gens=(homeState.maxDepth||0)+1;
    const branches=(()=>{const {kids,roots}=treeModelLevels();let t=roots[0];while(t&&(kids.get(t)||[]).length===1)t=kids.get(t)[0];return t?(kids.get(t)||[]).length:0;})();
    const clan=buildTreeModel().people, living=clan.filter(p=>p.is_living!==false).length;
    const stats=[[clan.length,"فرد من آل شجاع"],[living,"على قيد الحياة"],[gens,"جيل"],[branches,"فرع"],[state.marriages.length,"زواج"]];
    $("#h2Stats").innerHTML=stats.map(([v,l])=>`<div><strong data-to="${v}">0</strong><span>${l}</span></div>`).join("");
    $$("#h2Stats strong").forEach(el=>countUp(el,+el.dataset.to));
    const max=f.top[0]?.c||1; $("#h2Names").innerHTML=f.top.map((x,i)=>`<div class="h2-name" style="--w:${Math.round(x.c/max*100)}%;--i:${i}"><span>${esc(x.n)}</span><b>${x.c}</b></div>`).join("")||"<p class='muted'>—</p>";
    homeState.knowIdx=Math.floor(Date.now()/864e5); renderKnow(); renderHomeNews(); loadReactions();
  }
  $("#h2KnowNext").onclick=()=>{homeState.knowIdx++;renderKnow();};
  $("#h2Search").addEventListener("input",e=>{const q=nameNorm(e.target.value),box=$("#h2Results");if(q.length<2){box.classList.add("hidden");return;}
    const words=q.split(/\s+/);const hits=state.people.filter(p=>{const t=nameNorm(p.full_name_ar);return words.every(w=>t.includes(w));}).slice(0,7);
    box.innerHTML=hits.length?hits.map(p=>`<button data-pid="${p.id}"><b>${esc(p.full_name_ar)}</b><small>${esc(yearText(p))}</small></button>`).join(""):"<p>ما لقيت أحد بهالاسم</p>";
    box.classList.remove("hidden"); placeHomeResults(); box.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>{box.classList.add("hidden");e.target.value="";openPerson(b.dataset.pid);});});
  function placeHomeResults(){const box=$("#h2Results"),inp=$("#h2Search");if(!box||box.classList.contains("hidden"))return;const r=inp.getBoundingClientRect();
    Object.assign(box.style,{position:"fixed",left:r.left+"px",width:r.width+"px",right:"auto",top:(r.bottom+6)+"px",maxHeight:Math.max(180,window.innerHeight-r.bottom-20)+"px",overflowY:"auto",zIndex:1000});}
  window.addEventListener("scroll",placeHomeResults,true); window.addEventListener("resize",placeHomeResults); window.visualViewport?.addEventListener("resize",placeHomeResults);
  document.addEventListener("click",e=>{if(!e.target.closest(".h2-search"))$("#h2Results")?.classList.add("hidden");});

  // V11 — install as an app
  const isStandalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  let deferredInstall=null;
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;syncInstallUI();});
  window.addEventListener("appinstalled",()=>{deferredInstall=null;try{localStorage.setItem("shugaa_installed","1");}catch(_){}syncInstallUI();toast("تم تثبيت التطبيق ✅");});
  function syncInstallUI(){
    const can=!isStandalone()&&(isIOS||!!deferredInstall||/android/i.test(navigator.userAgent));
    let dismissed=false;try{dismissed=localStorage.getItem("shugaa_install_dismissed")==="1"||localStorage.getItem("shugaa_installed")==="1";}catch(_){}
    $$(".install-entry").forEach(b=>b.classList.toggle("hidden",!can));
    $("#installBanner")?.classList.toggle("hidden",!can||dismissed);
  }
  function openInstall(){
    if(deferredInstall){deferredInstall.prompt();deferredInstall.userChoice.finally(()=>{deferredInstall=null;syncInstallUI();});return;}
    $("#installIOS").classList.toggle("hidden",!isIOS); $("#installOther").classList.toggle("hidden",isIOS);
    $("#installSheet").classList.remove("hidden");
  }
  $$("[data-install]").forEach(b=>b.addEventListener("click",()=>{$("#moreSheet")?.classList.add("hidden");openInstall();}));
  $$("[data-close-install]").forEach(b=>b.onclick=()=>$("#installSheet").classList.add("hidden"));
  $("#installBannerX")?.addEventListener("click",()=>{try{localStorage.setItem("shugaa_install_dismissed","1");}catch(_){}syncInstallUI();});
  if(isStandalone())document.documentElement.classList.add("is-app");
  syncInstallUI();
  // app shortcuts: ./?view=tree
  window.__shugaaStartView=new URLSearchParams(location.search).get("view");

  // =================== V12 ===================
  const fnUrl=name=>`${cfg.supabaseUrl}/functions/v1/${name}`;
  const NEWS_TYPES=["marriage","engagement","birth","graduation","achievement","death"];
  function syncV12(){
    $$(".general-only").forEach(e=>e.classList.toggle("hidden",state.mode!=="general"));
    syncPushEntry(); if(state.mode==="account"&&state.role==="admin")loadJoinRequests(); renderToday();
  }
  // ---------- media helpers ----------
  const urlCache=new Map();
  async function mediaUrl(path){ if(!path)return null; const c=urlCache.get(path); if(c&&c.exp>Date.now())return c.url;
    const {data,error}=await client.storage.from("family-media").createSignedUrl(path,3600); if(error)return null; urlCache.set(path,{url:data.signedUrl,exp:Date.now()+3300e3}); return data.signedUrl; }
  function shrinkImage(file,max=1400,q=.85){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?res(b):rej(new Error("صورة غير صالحة")),"image/jpeg",q);URL.revokeObjectURL(img.src);};img.onerror=()=>rej(new Error("تعذر قراءة الصورة"));img.src=URL.createObjectURL(file);});}
  async function uploadMedia(path,blob,type){const {error}=await client.storage.from("family-media").upload(path,blob,{contentType:type||blob.type,upsert:false});if(error)throw error;return path;}

  // ---------- person photo, certificate, share, stories (profile hooks) ----------
  const _openPerson=openPerson;
  openPerson=function(id){ _openPerson(id); try{afterOpenPerson(id);}catch(e){console.error(e);} };
  async function afterOpenPerson(id){
    const p=getPerson(id), av=$("#profileAvatar"); av.style.backgroundImage=""; av.classList.remove("has-photo");
    $("#profilePhotoBtn")?.classList.toggle("hidden",!(state.mode==="account"&&["admin","editor"].includes(state.role)));
    $("#storyAddBtn")?.classList.toggle("hidden",!(state.mode==="account"&&["admin","editor"].includes(state.role)));
    if(state.mode==="account"&&p?.photo_path){const u=await mediaUrl(p.photo_path);if(u&&state.activePersonId===id){av.style.backgroundImage=`url("${u}")`;av.classList.add("has-photo");}}
    if(state.mode==="account")loadStories(id); else $("#storiesList").innerHTML="";
  }
  $("#profilePhotoInput").addEventListener("change",async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;const id=state.activePersonId;
    try{toast("جاري رفع الصورة...");const blob=await shrinkImage(f,900);const path=await uploadMedia(`people/${id}/${Date.now()}.jpg`,blob,"image/jpeg");
      const {error}=await client.from("people").update({photo_path:path}).eq("id",id);if(error)throw error;const p=getPerson(id);if(p)p.photo_path=path;afterOpenPerson(id);toast("تم حفظ الصورة ✅");}
    catch(err){toast("تعذر رفع الصورة: "+err.message,5000);}});

  function nasabText(id){const chain=ancestorsFrom(id).map(getPerson).filter(Boolean);if(!chain.length)return "";const me=chain[0];
    return [firstName(me),...chain.slice(1).map((x,i)=>`${i===0&&me.gender==="female"?"بنت":"بن"} ${firstName(x)}`)].join(" ");}
  function sealSvg(size=120,stroke="#B08A3E",fill="#0C3530"){return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><g fill="none" stroke="${stroke}" stroke-width="2"><rect x="21" y="21" width="58" height="58"/><rect x="21" y="21" width="58" height="58" transform="rotate(45 50 50)"/><rect x="27" y="27" width="46" height="46" stroke-width="1"/></g><text x="50" y="62" text-anchor="middle" font-family="Amiri,serif" font-weight="700" font-size="34" fill="${fill}">ش</text></svg>`;}
  function printHtml(inner,landscape=false){
    let area=$("#printArea"); if(!area){area=document.createElement("div");area.id="printArea";document.body.appendChild(area);}
    area.innerHTML=`<style>@page{size:${landscape?"A4 landscape":"A4 portrait"};margin:10mm}</style>${inner}`;
    document.body.classList.add("printing");
    const done=()=>{document.body.classList.remove("printing");window.removeEventListener("afterprint",done);};
    window.addEventListener("afterprint",done);
    const imgs=[...area.querySelectorAll("img")].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r;}));
    Promise.all([document.fonts?.ready,...imgs]).then(()=>setTimeout(()=>{window.print();setTimeout(done,1500);},150));
  }
  $("#profileCertBtn").onclick=()=>{const id=state.activePersonId,p=getPerson(id);if(!p)return;
    const chain=ancestorsFrom(id).reverse().map(getPerson).filter(Boolean), H=window.ShugaaHijri, now=new Date(), hj=H.gToH(now.getFullYear(),now.getMonth()+1,now.getDate());
    printHtml(`<div class="cert"><div class="cert-frame">
      <div class="cert-seal">${sealSvg(110)}</div>
      <p class="cert-kicker">بسم الله الرحمن الرحيم</p><h1>وثيقة نسب</h1><p class="cert-family">شجرة آل شجاع</p>
      <p class="cert-lead">تشهد شجرة آل شجاع بأن</p><h2>${esc(p.full_name_ar)}</h2>
      <p class="cert-nasab">${esc(nasabText(id))}</p>
      <p class="cert-lead">ينتسب إلى آل شجاع وفق السلسلة التالية:</p>
      <ol class="cert-chain">${chain.map((x,i)=>`<li><span>الجيل ${i+1}</span><b>${esc(x.full_name_ar)}</b></li>`).join("")}</ol>
      <div class="cert-meta"><span>رقم السجل: ${esc(p.record_code||"—")}</span><span>كود النسب: ${esc(p.lineage_code||"—")}</span><span>صدرت في ${esc(H.fmtHDate(hj))} الموافق ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} م</span></div>
      <p class="cert-foot">${esc(location.origin+location.pathname)}</p></div></div>`);};

  async function shareCard(id){
    const p=getPerson(id); if(!p)return; toast("جاري تجهيز البطاقة...");
    try{await Promise.all([document.fonts.load('700 80px "Amiri"'),document.fonts.load('500 40px "IBM Plex Sans Arabic"')]);}catch(_){}
    const W=1080,Hh=1350,c=document.createElement("canvas");c.width=W;c.height=Hh;const x=c.getContext("2d");
    const g=x.createRadialGradient(W/2,300,50,W/2,500,1100);g.addColorStop(0,"#175349");g.addColorStop(.6,"#0C3530");g.addColorStop(1,"#072621");x.fillStyle=g;x.fillRect(0,0,W,Hh);
    x.strokeStyle="rgba(217,182,106,.45)";x.lineWidth=3;x.strokeRect(40,40,W-80,Hh-80);x.lineWidth=1.2;x.strokeRect(58,58,W-116,Hh-116);
    const seal=(cx,cy,s)=>{x.save();x.strokeStyle="#D9B66A";x.lineWidth=5;x.translate(cx,cy);x.strokeRect(-s/2,-s/2,s,s);x.rotate(Math.PI/4);x.strokeRect(-s/2,-s/2,s,s);x.restore();};
    seal(W/2,250,150);x.fillStyle="#E9CF8E";x.textAlign="center";x.direction="rtl";x.font='700 92px "Amiri", serif';x.fillText("ش",W/2,285);
    x.font='500 40px "IBM Plex Sans Arabic", sans-serif';x.fillStyle="#D9B66A";x.fillText("شجرة آل شجاع",W/2,430);
    x.font='700 92px "Amiri", serif';x.fillStyle="#F6EBCF";
    const wrap=(t,maxW,lh,y,font,color)=>{x.font=font;x.fillStyle=color;const words=t.split(" ");let line="",yy=y;for(const w of words){const test=line?line+" "+w:w;if(x.measureText(test).width>maxW&&line){x.fillText(line,W/2,yy);line=w;yy+=lh;}else line=test;}if(line)x.fillText(line,W/2,yy);return yy;};
    let y=wrap(p.full_name_ar,W-200,110,590,'700 92px "Amiri", serif',"#F6EBCF");
    const gen=ancestorsFrom(id).length;
    y=wrap(`الجيل ${gen} في آل شجاع`,W-200,60,y+90,'500 44px "IBM Plex Sans Arabic", sans-serif',"#D9B66A");
    y=wrap(nasabText(id),W-220,64,y+100,'400 42px "IBM Plex Sans Arabic", sans-serif',"#C7D6D0");
    x.font='500 30px "IBM Plex Sans Arabic", sans-serif';x.fillStyle="rgba(217,182,106,.8)";x.fillText("كل اسمٍ له قصة.. وكل جيلٍ امتداد",W/2,Hh-170);
    x.font='400 28px "IBM Plex Sans Arabic", sans-serif';x.fillStyle="rgba(199,214,208,.8)";x.fillText(location.host+location.pathname.replace(/index\.html$/,"").replace(/\/$/,""),W/2,Hh-115);
    const blob=await new Promise(r=>c.toBlob(r,"image/png"));const file=new File([blob],`${firstName(p)}-آل-شجاع.png`,{type:"image/png"});
    if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:p.full_name_ar,text:`${p.full_name_ar} — شجرة آل شجاع`});return;}catch(e){if(e.name==="AbortError")return;}}
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();a.remove();toast("تم تنزيل البطاقة ✅");
  }
  $("#profileShareBtn").onclick=()=>shareCard(state.activePersonId);

  // ---------- voice stories ----------
  async function loadStories(id){const box=$("#storiesList");box.innerHTML="<p class='muted'>جاري التحميل...</p>";
    const {data,error}=await client.from("person_stories").select("*").eq("person_id",id).order("created_at");if(state.activePersonId!==id)return;
    if(error||!data?.length){box.innerHTML="<p class='muted'>ما فيه تسجيلات للحين. صوت الكبار وحكاياتهم كنز، سجّلوها هنا 🤍</p>";return;}
    box.innerHTML=data.map(st=>`<div class="story"><div><b>${esc(st.title)}</b>${st.narrator?`<small>بصوت ${esc(st.narrator)}</small>`:""}</div><audio controls preload="none" data-path="${esc(st.file_path)}"></audio>${["admin","editor"].includes(state.role)?`<button type="button" class="story-del" data-id="${st.id}" data-path="${esc(st.file_path)}" aria-label="حذف">×</button>`:""}</div>`).join("");
    for(const a of box.querySelectorAll("audio")){const u=await mediaUrl(a.dataset.path);if(u)a.src=u;}
    box.querySelectorAll(".story-del").forEach(b=>b.onclick=async()=>{if(!confirm("حذف التسجيل؟"))return;await client.from("person_stories").delete().eq("id",b.dataset.id);await client.storage.from("family-media").remove([b.dataset.path]);loadStories(id);});}
  let rec=null,recChunks=[],recBlob=null,recTimer=null,recStart=0;
  $("#storyAddBtn").onclick=()=>{recBlob=null;$("#storyTitle").value="";$("#storyNarrator").value="";$("#storyMsg").textContent="";$("#storyPreview").classList.add("hidden");$("#recTime").textContent="";$("#recBtn").textContent="⏺ ابدأ التسجيل";$("#storyModal").classList.remove("hidden");};
  $$("[data-close-story]").forEach(b=>b.onclick=()=>{if(rec&&rec.state==="recording")rec.stop();$("#storyModal").classList.add("hidden");});
  $("#recBtn").onclick=async()=>{
    if(rec&&rec.state==="recording"){rec.stop();return;}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const type=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(t=>window.MediaRecorder?.isTypeSupported?.(t))||"";
      rec=new MediaRecorder(stream,type?{mimeType:type}:undefined);recChunks=[];rec.ondataavailable=e=>e.data.size&&recChunks.push(e.data);
      rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());clearInterval(recTimer);recBlob=new Blob(recChunks,{type:rec.mimeType||type||"audio/mp4"});const pv=$("#storyPreview");pv.src=URL.createObjectURL(recBlob);pv.classList.remove("hidden");$("#recBtn").textContent="⏺ سجّل من جديد";};
      rec.start();recStart=Date.now();$("#recBtn").textContent="⏹ إيقاف";recTimer=setInterval(()=>{const s=Math.floor((Date.now()-recStart)/1000);$("#recTime").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;if(s>=900)rec.stop();},500);
    }catch(e){toast("ما قدرنا نوصل للمايك. اسمح للموقع باستخدامه، أو ارفع ملف صوت.",5000);}
  };
  $("#storyFile").addEventListener("change",e=>{const f=e.target.files[0];e.target.value="";if(!f)return;if(f.size>15*1024*1024)return toast("الملف أكبر من 15 ميجا");recBlob=f;const pv=$("#storyPreview");pv.src=URL.createObjectURL(f);pv.classList.remove("hidden");});
  $("#storySave").onclick=async()=>{const id=state.activePersonId,title=$("#storyTitle").value.trim(),msg=$("#storyMsg");
    if(!title)return msg.textContent="اكتب عنوان للتسجيل.";if(!recBlob)return msg.textContent="سجّل أو ارفع ملف صوت أولًا.";
    msg.textContent="جاري الرفع...";$("#storySave").disabled=true;
    try{const ext=(recBlob.type.includes("webm")?"webm":recBlob.type.includes("mpeg")?"mp3":recBlob.type.includes("wav")?"wav":"m4a");
      const path=await uploadMedia(`stories/${id}/${Date.now()}.${ext}`,recBlob,recBlob.type||"audio/mp4");
      const {error}=await client.from("person_stories").insert({person_id:id,title,narrator:$("#storyNarrator").value.trim()||null,file_path:path,mime_type:recBlob.type||null,duration_sec:recStart?Math.round((Date.now()-recStart)/1000):null});
      if(error)throw error;$("#storyModal").classList.add("hidden");toast("تم حفظ التسجيل ✅");loadStories(id);}
    catch(e){msg.textContent="تعذر الحفظ: "+e.message;}finally{$("#storySave").disabled=false;}};

  // ---------- albums ----------
  let albumsCache=[],currentAlbum=null,lbList=[],lbIdx=0;
  async function renderAlbums(){$("#albumView").classList.add("hidden");$("#albumsGrid").classList.remove("hidden");const grid=$("#albumsGrid");
    const {data,error}=await client.from("albums").select("*").order("album_date",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false});
    albumsCache=data||[];if(error||!albumsCache.length){grid.innerHTML=`<div class="h2-empty"><b>ما فيه ألبومات للحين</b><p>أول ألبوم ينضاف يطلع هنا.</p></div>`;return;}
    grid.innerHTML=albumsCache.map(a=>`<button type="button" class="album-card" data-id="${a.id}"><div class="album-cover" data-path="${esc(a.cover_path||"")}"></div><b>${esc(a.title)}</b><small>${a.album_date?esc(window.ShugaaHijri.pick(window.ShugaaHijri.side(null,null,a.album_date).full)):""}</small></button>`).join("");
    grid.querySelectorAll(".album-card").forEach(b=>b.onclick=()=>openAlbum(b.dataset.id));
    for(const d of grid.querySelectorAll(".album-cover[data-path]")){if(!d.dataset.path)continue;const u=await mediaUrl(d.dataset.path);if(u)d.style.backgroundImage=`url("${u}")`;}}
  async function openAlbum(id){currentAlbum=albumsCache.find(a=>a.id===id);if(!currentAlbum)return;$("#albumsGrid").classList.add("hidden");$("#albumView").classList.remove("hidden");
    $("#albumTitle").textContent=currentAlbum.title;$("#albumDesc").textContent=currentAlbum.description||"";$("#albumUploadLbl").classList.toggle("hidden",!["admin","editor"].includes(state.role));
    const {data}=await client.from("album_photos").select("*").eq("album_id",id).order("created_at");lbList=data||[];const box=$("#albumPhotos");
    box.innerHTML=lbList.length?lbList.map((ph,i)=>`<button type="button" class="album-photo" data-i="${i}" data-path="${esc(ph.file_path)}"></button>`).join(""):"<p class='muted'>الألبوم فاضي.</p>";
    box.querySelectorAll(".album-photo").forEach(b=>b.onclick=()=>openLightbox(+b.dataset.i));
    for(const b of box.querySelectorAll(".album-photo")){const u=await mediaUrl(b.dataset.path);if(u)b.style.backgroundImage=`url("${u}")`;}}
  $("#albumBack").onclick=renderAlbums;
  $("#newAlbumBtn").onclick=()=>{$("#albumNewTitle").value="";$("#albumNewDate").value="";$("#albumNewDesc").value="";$("#albumMsg").textContent="";$("#albumModal").classList.remove("hidden");};
  $$("[data-close-album]").forEach(b=>b.onclick=()=>$("#albumModal").classList.add("hidden"));
  $("#albumCreate").onclick=async()=>{const t=$("#albumNewTitle").value.trim();if(!t)return $("#albumMsg").textContent="اكتب عنوان الألبوم.";
    const {data,error}=await client.from("albums").insert({title:t,album_date:$("#albumNewDate").value||null,description:$("#albumNewDesc").value.trim()||null}).select("*").single();
    if(error)return $("#albumMsg").textContent=error.message;$("#albumModal").classList.add("hidden");albumsCache.unshift(data);openAlbum(data.id);toast("انشأ الألبوم، أضف الصور الحين 📸");};
  $("#albumUpload").addEventListener("change",async e=>{const files=[...e.target.files];e.target.value="";if(!files.length||!currentAlbum)return;let n=0;
    for(const f of files){try{toast(`جاري رفع ${++n} من ${files.length}...`);const blob=await shrinkImage(f,1600);const path=await uploadMedia(`albums/${currentAlbum.id}/${Date.now()}-${n}.jpg`,blob,"image/jpeg");
      await client.from("album_photos").insert({album_id:currentAlbum.id,file_path:path});
      if(!currentAlbum.cover_path){currentAlbum.cover_path=path;await client.from("albums").update({cover_path:path}).eq("id",currentAlbum.id);}}catch(err){toast("تعذر رفع صورة: "+err.message,4000);}}
    toast("تمت إضافة الصور ✅");openAlbum(currentAlbum.id);});
  async function openLightbox(i){lbIdx=(i+lbList.length)%lbList.length;const ph=lbList[lbIdx];$("#lbImg").src=await mediaUrl(ph.file_path)||"";$("#lbCap").textContent=ph.caption||"";$("#lightbox").classList.remove("hidden");}
  $("#lbClose").onclick=()=>$("#lightbox").classList.add("hidden");$("#lbNext").onclick=()=>openLightbox(lbIdx+1);$("#lbPrev").onclick=()=>openLightbox(lbIdx-1);

  // ---------- views: albums + map ----------
  const _setView=setView;
  setView=function(name){const r=_setView(name);if(name==="albums"&&state.mode==="account")renderAlbums();if(name==="history")setTimeout(initMap,60);return r;};
  let leafletMap=null,addPlaceMode=false;
  function loadLeaflet(){return window.L?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=res;s.onerror=()=>rej(new Error("map"));document.head.appendChild(s);});}
  async function initMap(){
    try{await loadLeaflet();}catch(e){$("#mapEmpty").classList.remove("hidden");return;}
    const el=$("#familyMap"); if(!leafletMap){leafletMap=L.map(el,{scrollWheelZoom:false,attributionControl:true}).setView([23.9,45.1],5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(leafletMap);
      leafletMap.on("click",async ev=>{if(!addPlaceMode)return;addPlaceMode=false;$("#mapAddPlaceBtn").textContent="＋ أضف مكان";const name=prompt("اسم المكان (مثال: القرية، المدينة):");if(!name)return;
        const {error}=await client.from("places").insert({name_ar:name.trim(),latitude:+ev.latlng.lat.toFixed(6),longitude:+ev.latlng.lng.toFixed(6)});if(error)return toast(error.message,4000);await loadAccountData();initMap();toast("تمت إضافة المكان ✅");});}
    leafletMap.invalidateSize(); leafletMap.eachLayer(l=>{if(l instanceof L.Marker)leafletMap.removeLayer(l);});
    const pts=(state.places||[]).filter(p=>p.latitude!=null&&p.longitude!=null);
    $("#mapEmpty").classList.toggle("hidden",!!pts.length);
    const icon=L.divIcon({className:"map-pin",html:"<span></span>",iconSize:[26,26],iconAnchor:[13,26]});
    pts.forEach(pl=>{const born=state.people.filter(p=>p.birth_place_id===pl.id),evs=state.events.filter(e=>e.place_id===pl.id);
      const lines=[...born.map(p=>`👶 ${esc(p.full_name_ar)}`),...evs.map(e=>`📍 ${esc((EVT[e.event_type]||EVT.other).t)}: ${esc(getPerson(e.person_id)?.full_name_ar||"")}`)].slice(0,12);
      L.marker([pl.latitude,pl.longitude],{icon}).addTo(leafletMap).bindPopup(`<div class="map-pop"><b>${esc(pl.name_ar)}</b>${lines.length?`<p>${lines.join("<br>")}</p>`:""}</div>`);});
    if(pts.length)leafletMap.fitBounds(pts.map(p=>[p.latitude,p.longitude]),{padding:[40,40],maxZoom:9});
  }
  $("#mapAddPlaceBtn").onclick=()=>{addPlaceMode=!addPlaceMode;$("#mapAddPlaceBtn").textContent=addPlaceMode?"اضغط على الخريطة…":"＋ أضف مكان";if(addPlaceMode)toast("اضغط على مكانه في الخريطة");};

  // ---------- print the whole tree ----------
  $("#printTreeBtn").onclick=()=>{if(!state.cy)return;const vis=state.cy.elements().not(".tree-hidden");const bb=vis.boundingBox();const scale=Math.max(.6,Math.min(3,5000/Math.max(bb.w,bb.h)));
    const png=state.cy.png({full:true,scale,bg:"#FBF9F4"});const H=window.ShugaaHijri,now=new Date();
    printHtml(`<div class="tree-print"><div class="tp-head">${sealSvg(64)}<div><h1>شجرة آل شجاع</h1><p>${buildTreeModel().people.length} فرد • ${esc(H.fmtHDate(H.gToH(now.getFullYear(),now.getMonth()+1,now.getDate())))}</p></div></div><img src="${png}" alt="شجرة آل شجاع"/></div>`,bb.w>bb.h);};

  // ---------- on this day ----------
  function renderToday(){const card=$("#h2Today");if(!card)return;const H=window.ShugaaHijri,now=new Date(),gm=now.getMonth()+1,gd=now.getDate(),hj=H.gToH(now.getFullYear(),gm,gd);
    const hits=[];const same=iso=>{if(!iso)return false;const [y,m,d]=String(iso).slice(0,10).split("-").map(Number);if(y===now.getFullYear())return false;if(m===gm&&d===gd)return y;const h=H.gToH(y,m,d);return h.m===hj.m&&h.d===hj.d?y:false;};
    state.events.forEach(e=>{const y=same(e.event_date);if(y)hits.push({y,t:`${(EVT[e.event_type]||EVT.other).t}: ${getPerson(e.person_id)?.full_name_ar||e.title||""}`,id:e.person_id});});
    state.people.forEach(p=>{const b=same(p.birth_date);if(b)hits.push({y:b,t:`ولد ${p.full_name_ar}`,id:p.id});const d=same(p.death_date);if(d)hits.push({y:d,t:`وفاة ${p.full_name_ar} رحمه الله`,id:p.id});});
    card.classList.toggle("hidden",!hits.length);if(!hits.length)return;
    $("#h2TodayTitle").textContent=H.fmtHDate(hj);
    $("#h2TodayList").innerHTML=hits.slice(0,6).map(x=>`<button type="button" class="h2-today-item" data-pid="${x.id}"><span>قبل ${now.getFullYear()-x.y} سنة</span><b>${esc(x.t)}</b></button>`).join("");
    $$("#h2TodayList [data-pid]").forEach(b=>b.onclick=()=>openPerson(b.dataset.pid));}

  // ---------- join requests ----------
  $$("[data-join]").forEach(b=>b.addEventListener("click",()=>{$("#moreSheet")?.classList.add("hidden");$("#joinMsg").textContent="";$("#joinModal").classList.remove("hidden");}));
  $$("[data-close-join]").forEach(b=>b.onclick=()=>$("#joinModal").classList.add("hidden"));
  $("#joinSend").onclick=async()=>{const msg=$("#joinMsg"),pid=$("#joinPerson").value,name=$("#joinName").value.trim(),phone=$("#joinPhone").value.trim();
    if(!pid)return msg.textContent="اختر اسمك من الشجرة.";if(!name)return msg.textContent="اكتب اسمك.";if(!phone)return msg.textContent="اكتب رقم الواتساب عشان نرسل لك الكود.";
    const code=sessionStorage.getItem("shugaa_access_code");$("#joinSend").disabled=true;msg.textContent="جاري الإرسال...";
    const {data,error}=await client.rpc("submit_join_request",{p_family_code:code,p_person_id:pid,p_name:name,p_phone:phone,p_note:$("#joinNote").value.trim()||null});
    $("#joinSend").disabled=false;
    if(error||!data?.ok)return msg.textContent=data?.reason==="rate_limited"?"محاولات كثيرة، جرب بعد شوي.":"تعذر الإرسال، تأكد من البيانات.";
    $("#joinModal").classList.add("hidden");toast(data.duplicate?"طلبك موجود عند الإدارة، بيوصلك الكود قريب 👍":"وصل طلبك للإدارة ✅ بيوصلك كودك على الواتساب",6000);};
  async function loadJoinRequests(){const {data}=await client.from("join_requests").select("*").eq("status","pending").order("created_at");const rows=data||[];
    const cnt=$("#joinCount");if(cnt){cnt.textContent=rows.length;cnt.classList.toggle("hidden",!rows.length);}
    const box=$("#joinList");if(!box)return;
    box.innerHTML=rows.length?rows.map(r=>`<div class="join-item"><div><b>${esc(r.requester_name)}</b><small>يقول إنه: <button class="h2-person" data-pid="${r.person_id}">${esc(getPerson(r.person_id)?.full_name_ar||"—")}</button></small><small dir="ltr">${esc(r.phone||"")}</small>${r.note?`<small>“${esc(r.note)}”</small>`:""}</div>
      <div class="join-actions"><select class="no-search" data-role="${r.id}"><option value="viewer">مشاهد</option><option value="editor">مدخل بيانات</option></select><button class="btn primary" data-approve="${r.id}">اعتماد</button><button class="btn light" data-reject="${r.id}">رفض</button></div></div>`).join(""):"<p class='muted'>ما فيه طلبات جديدة.</p>";
    box.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>openPerson(b.dataset.pid));
    box.querySelectorAll("[data-approve]").forEach(b=>b.onclick=()=>decideJoin(b.dataset.approve,true,box.querySelector(`[data-role="${b.dataset.approve}"]`).value));
    box.querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>{if(confirm("رفض الطلب؟"))decideJoin(b.dataset.reject,false);});}
  async function decideJoin(id,ok,role){const {data,error}=await client.rpc("admin_decide_join_request",{p_id:id,p_approve:ok,p_role:role||"viewer"});if(error)return toast(error.message,5000);
    if(ok&&data?.code){const link=location.origin+location.pathname,first=String(data.name||"").split(/\s+/)[0];
      const text=`السلام عليكم ${first} 🌳\nهذا كودك الخاص في موقع شجرة آل شجاع:\n${data.code}\n\nافتح الرابط واكتب الكود:\n${link}\n\nالكود خاص فيك، لا تشاركه مع أحد.`;
      const phone=String(data.phone||"").replace(/[^\d]/g,"").replace(/^00/,"").replace(/^05/,"9665");
      const box=$("#joinCodeBox");box.classList.remove("hidden");box.innerHTML=`<b>✅ انعتمد طلب ${esc(data.name)} — الكود:</b><code>${esc(data.code)}</code><div class="code-share-actions"><a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(text)}">إرسال له بالواتساب</a></div>`;}
    else toast("تم رفض الطلب");loadJoinRequests();}

  // ---------- push notifications ----------
  const pushSupported=()=>"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window;
  async function syncPushEntry(){let show=false;try{if(pushSupported()){const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();show=!sub&&Notification.permission!=="denied";}else show=isIOS&&!isStandalone();}catch(_){}
    $$(".push-entry").forEach(e=>e.classList.toggle("hidden",!show));}
  const b64ToU8=b=>{const p="=".repeat((4-b.length%4)%4),r=atob((b+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from([...r].map(c=>c.charCodeAt(0)));};
  async function enablePush(){$("#moreSheet")?.classList.add("hidden");
    if(!pushSupported()){if(isIOS&&!isStandalone()){toast("في الآيفون: ثبّت التطبيق على الشاشة الرئيسية أول، وبعدها فعّل الإشعارات من داخله.",6000);openInstall();}else toast("جهازك أو متصفحك ما يدعم الإشعارات.",5000);return;}
    try{const perm=await Notification.requestPermission();if(perm!=="granted")return toast("ما انسمح بالإشعارات. تقدر تفعلها من إعدادات الجهاز.",5000);
      const kres=await fetch(fnUrl("send-push"),{method:"POST",headers:{"Content-Type":"application/json",apikey:cfg.supabasePublishableKey},body:JSON.stringify({action:"public-key"})});const {publicKey}=await kres.json();
      const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(publicKey)});
      const {error}=await client.rpc("save_push_subscription",{p_sub:sub.toJSON()});if(error)throw error;toast("تم تفعيل الإشعارات 🔔 بيوصلك كل خبر جديد");syncPushEntry();}
    catch(e){console.error(e);toast("تعذر تفعيل الإشعارات: "+e.message,5000);}}
  $$("[data-push]").forEach(b=>b.addEventListener("click",enablePush));
  async function sendEventPush(eventId){try{const {data:{session}}=await client.auth.getSession();const r=await fetch(fnUrl("send-push"),{method:"POST",headers:{"Content-Type":"application/json",apikey:cfg.supabasePublishableKey,Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({action:"send",event_id:eventId})});
    const out=await r.json().catch(()=>({}));if(out.ok)toast(`🔔 وصل إشعار الخبر لـ ${out.sent} جهاز`,4000);}catch(e){console.warn(e);}}

  // V6.3 — bulk add children + Excel export
  const BULK_NORM=v=>String(v||"").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/\s+/g," ").trim();
  function bulkAddRow(name="",gender="male"){
    const row=document.createElement("div"); row.className="bulk-row";
    row.innerHTML=`<input class="bulk-name" placeholder="الاسم الأول" value="${esc(name)}"/>
      <select class="bulk-gender no-search"><option value="male">ذكر</option><option value="female">أنثى</option></select>
      <input class="bulk-year" type="number" inputmode="numeric" min="1" max="3000" placeholder="سنة الميلاد"/>
      <label class="bulk-living"><input type="checkbox" class="bulk-alive" checked/> حي</label>
      <button type="button" class="bulk-remove" aria-label="حذف الصف">×</button>`;
    row.querySelector(".bulk-gender").value=gender;
    row.querySelector(".bulk-remove").onclick=()=>{row.remove(); if(!$$("#bulkRows .bulk-row").length) bulkAddRow();};
    row.querySelector(".bulk-name").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const next=row.nextElementSibling;if(next)next.querySelector(".bulk-name").focus();else{bulkAddRow();$$("#bulkRows .bulk-name").pop().focus();}}});
    $("#bulkRows").appendChild(row);
  }
  function bulkRefreshFather(){
    const id=$("#bulkFather").value, f=id?familyOf(id):null;
    const mSel=$("#bulkMother"); mSel.innerHTML='<option value="">— غير محددة —</option>';
    (f?.spouses||[]).filter(s=>s.gender!=="male").forEach(s=>mSel.add(new Option(s.full_name_ar,s.id)));
    $("#bulkMotherWrap").classList.toggle("hidden",!(f?.spouses||[]).length);
    const box=$("#bulkExisting");
    if(f&&f.children.length){box.innerHTML=`<b>مسجلين حاليًا (${f.children.length}):</b> `+f.children.map(c=>`<span class="meta-pill">${esc(c.first_name_ar||String(c.full_name_ar).split(" ")[0])}</span>`).join(" ");box.classList.remove("hidden");}
    else box.classList.add("hidden");
  }
  $("#bulkFather").addEventListener("change",bulkRefreshFather);
  $("#bulkAddRow").onclick=()=>{bulkAddRow();$$("#bulkRows .bulk-name").pop().focus();};
  $("#bulkPasteToggle").onclick=()=>$("#bulkPasteBox").classList.toggle("hidden");
  $("#bulkPasteApply").onclick=()=>{
    const lines=$("#bulkPaste").value.split(/\n|،|,/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length)return;
    $$("#bulkRows .bulk-row").forEach(r=>{if(!r.querySelector(".bulk-name").value.trim())r.remove();});
    lines.forEach(l=>{const female=/\((بنت|انثى|أنثى)\)|\s(بنت|انثى|أنثى)$/.test(l);bulkAddRow(l.replace(/\((بنت|انثى|أنثى)\)|\s(بنت|انثى|أنثى)$/,"").trim(),female?"female":"male");});
    $("#bulkPaste").value="";$("#bulkPasteBox").classList.add("hidden");
  };
  $("#bulkSave").onclick=async()=>{
    const msg=$("#bulkMsg"), fatherId=$("#bulkFather").value;
    if(!fatherId){msg.textContent="اختر الأب أولًا.";return;}
    const rows=$$("#bulkRows .bulk-row").map(r=>({name:r.querySelector(".bulk-name").value.trim(),gender:r.querySelector(".bulk-gender").value,year:toInt(r.querySelector(".bulk-year").value),alive:r.querySelector(".bulk-alive").checked})).filter(r=>r.name);
    if(!rows.length){msg.textContent="اكتب اسم واحد على الأقل.";return;}
    const bad=rows.find(r=>r.name.split(/\s+/).length>2);
    if(bad&&!confirm(`الاسم «${bad.name}» فيه أكثر من كلمتين. المفروض تكتب الاسم الأول بس، والنظام يكمل الباقي. متابعة كذا؟`))return;
    const existing=new Set(familyOf(fatherId).children.map(c=>BULK_NORM(c.first_name_ar||String(c.full_name_ar).split(" ")[0])));
    const dups=rows.filter(r=>existing.has(BULK_NORM(r.name))).map(r=>r.name);
    if(dups.length&&!confirm(`هذي الأسماء مسجلة أصلًا تحت نفس الأب: ${dups.join("، ")}\nتبي تضيفها مرة ثانية؟`))return;
    const mother=$("#bulkMother").value||"";
    const bulkHijri=$("#bulkCalendar")?.value==="hijri";
    const children=rows.map(r=>({person:{first_name_ar:r.name,gender:r.gender,birth_year:r.year?String(bulkHijri?window.ShugaaHijri.hYearToG(r.year):r.year):"",birth_year_hijri:bulkHijri&&r.year?String(r.year):"",is_living:r.alive},other_parent_id:mother}));
    msg.textContent="جاري الحفظ..."; $("#bulkSave").disabled=true;
    const {data,error}=await client.rpc("staff_add_family_bundle_v4",{p_anchor_id:fatherId,p_spouse:{mode:"none"},p_children:children});
    $("#bulkSave").disabled=false;
    if(error){msg.textContent="تعذر الحفظ: "+error.message+" (لم يُحفظ أي اسم)";return;}
    msg.textContent=`تم حفظ ${data?.children_count||rows.length} ✅`;
    $("#bulkRows").innerHTML=""; bulkAddRow();
    try{await loadAccountData();}catch(e){console.error(e);}
    bulkRefreshFather();
  };
  bulkAddRow();

  function loadScriptOnce(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`)&&window.XLSX)return res();const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>rej(new Error("تعذر تحميل مكتبة Excel"));document.head.appendChild(s);});}
  $("#exportExcelBtn").onclick=async()=>{
    const msg=$("#exportMsg"); msg.textContent="جاري تجهيز الملف...";
    try{
      await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const gl=g=>g==="male"?"ذكر":g==="female"?"أنثى":"غير محدد";
      const yr=(y,d)=>y||(d?parseInt(String(d).slice(0,4),10):"")||"";
      const rows=state.people.slice().sort((a,b)=>(a.lineage_code||"~").localeCompare(b.lineage_code||"~",undefined,{numeric:true})||a.full_name_ar.localeCompare(b.full_name_ar,"ar")).map(p=>{
        const f=familyOf(p.id);
        return {"رقم السجل":p.record_code||"","كود النسب":p.lineage_code||"","الاسم الكامل":p.full_name_ar||"","الاسم الأول":p.first_name_ar||"","الجنس":gl(p.gender),
          "الأب":f.father?.full_name_ar||p.father_name_text||"","الأم":f.mother?.full_name_ar||"","الزوج/الزوجة":f.spouses.map(s=>s.full_name_ar).join("، "),
          "عدد الأبناء":f.children.length,"سنة الميلاد م":yr(p.birth_year,p.birth_date),"سنة الميلاد هـ":window.ShugaaHijri.side(p.birth_year,p.birth_year_hijri,p.birth_date).h.replace(" هـ",""),"سنة الوفاة م":yr(p.death_year,p.death_date),"سنة الوفاة هـ":window.ShugaaHijri.side(p.death_year,p.death_year_hijri,p.death_date).h.replace(" هـ",""),
          "الحالة":p.is_living===true?"على قيد الحياة":p.is_living===false?"متوفى":"غير محدد","درجة التوثيق":confidenceLabel(p.record_confidence),"نبذة":p.bio||""};
      });
      const ws=XLSX.utils.json_to_sheet(rows);
      ws["!cols"]=[12,12,40,14,8,36,30,40,10,11,11,11,11,14,14,40].map(w=>({wch:w}));
      ws["!autofilter"]={ref:ws["!ref"]};
      const total=state.people.length, males=state.people.filter(p=>p.gender==="male").length, females=state.people.filter(p=>p.gender==="female").length, living=state.people.filter(p=>p.is_living===true).length;
      const ws2=XLSX.utils.aoa_to_sheet([["شجرة آل شجاع — ملخص"],[],["عدد الأفراد",total],["الذكور",males],["الإناث",females],["على قيد الحياة",living],["علاقات النسب",state.relations.length],["الزيجات",state.marriages.length],[],["تاريخ التصدير",new Date().toLocaleString("ar")]]);
      ws2["!cols"]=[{wch:22},{wch:24}];
      const wb=XLSX.utils.book_new(); wb.Workbook={Views:[{RTL:true}]};
      XLSX.utils.book_append_sheet(wb,ws,"أفراد العائلة"); XLSX.utils.book_append_sheet(wb,ws2,"ملخص");
      XLSX.writeFile(wb,`شجرة-آل-شجاع-${new Date().toISOString().slice(0,10)}.xlsx`);
      msg.textContent=`تم تصدير ${total} فرد ✅`;
    }catch(e){console.error(e);msg.textContent="تعذر التصدير: "+e.message;}
  };

  // Init
  client.auth.getSession().then(async({data})=>{
    if(data.session){await enterAccount(data.session);return;}
    const mode=sessionStorage.getItem("shugaa_access_mode"),code=sessionStorage.getItem("shugaa_access_code");
    if(code&&["general","personal"].includes(mode)) await enterCodeMode(code,mode); else showGate();
  });
  client.auth.onAuthStateChange((event,session)=>{setTimeout(async()=>{if(event==="SIGNED_OUT"&&state.mode==="account")showGate();if(session&&state.mode!=="account")await enterAccount(session);},0);});
  // V11 — web app: service worker with "update now" bar
  if("serviceWorker"in navigator)window.addEventListener("load",async()=>{
    try{
      const hadCtl0=!!navigator.serviceWorker.controller;
      const reg=await navigator.serviceWorker.register("./sw.js");
      const offer=w=>{if(!w)return;$("#updateBar").classList.remove("hidden");$("#updateNowBtn").onclick=()=>{$("#updateNowBtn").disabled=true;w.postMessage("skip-waiting");};};
      if(reg.waiting&&navigator.serviceWorker.controller)offer(reg.waiting);
      reg.addEventListener("updatefound",()=>{const w=reg.installing;w?.addEventListener("statechange",()=>{if(w.state==="installed"&&navigator.serviceWorker.controller)offer(w);});});
      const hadController=!!navigator.serviceWorker.controller; let reloaded=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{if(hadController&&!reloaded){reloaded=true;location.reload();}});
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")reg.update().catch(()=>{});});
    }catch(e){console.warn(e);}
  });
})();

// V6.1 — searchable dropdowns: any long <select> becomes "type a name, pick from results".
// The original <select> stays as the source of truth (value, onchange, form reset all keep working).
(() => {
  const MIN_OPTIONS = 12, MAX_RESULTS = 40;
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const normAr = s => String(s || "").toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ").trim();
  const escHtml = v => String(v ?? "").replace(/[&<>"']/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[s]));

  function enhance(sel) {
    sel.dataset.searchable = "1";
    const wrap = document.createElement("div");
    wrap.className = "ps-combo";
    wrap.innerHTML = `<div class="ps-field"><input type="search" class="ps-input" autocomplete="off" spellcheck="false" enterkeyhint="search"/><button type="button" class="ps-clear hidden" aria-label="مسح">×</button></div><div class="ps-list hidden" role="listbox"></div>`;
    sel.insertAdjacentElement("afterend", wrap);
    // the results list lives on <body> so no panel or overlay can cover it
    setTimeout(() => document.body.appendChild(wrap.querySelector(".ps-list")), 0);
    sel.classList.add("ps-native");
    const input = wrap.querySelector(".ps-input"), list = wrap.querySelector(".ps-list"), clear = wrap.querySelector(".ps-clear");
    if (sel.required) { input.required = true; sel.required = false; }
    let active = -1, results = [];

    const blankText = () => (sel.querySelector('option[value=""]')?.textContent || "").replace(/[—–-]/g, "").trim();
    input.placeholder = "🔍 اكتب الاسم للبحث" + (blankText() ? ` (${blankText()})` : "");

    const sync = () => {
      const opt = sel.selectedOptions[0];
      const has = opt && opt.value !== "";
      if (document.activeElement !== input) input.value = has ? opt.textContent : "";
      clear.classList.toggle("hidden", !has);
      wrap.classList.toggle("ps-disabled", sel.disabled);
      input.disabled = sel.disabled;
    };
    sel._psSync = sync;

    Object.defineProperty(sel, "value", {
      configurable: true,
      get() { return nativeValue.get.call(this); },
      set(v) { nativeValue.set.call(this, v); sync(); }
    });

    const choose = opt => {
      nativeValue.set.call(sel, opt ? opt.value : "");
      input.value = opt && opt.value ? opt.textContent : "";
      close();
      input.blur();
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
    };
    const close = () => { list.classList.add("hidden"); active = -1; };
    const render = () => {
      const q = normAr(input.value);
      const words = q.split(" ").filter(Boolean);
      const all = [...sel.options].filter(o => o.value !== "" && !o.disabled);
      results = (words.length ? all.filter(o => { const t = normAr(o.textContent); return words.every(w => t.includes(w)); }) : all)
        .sort((a, b) => (normAr(a.textContent).startsWith(q) ? 0 : 1) - (normAr(b.textContent).startsWith(q) ? 0 : 1));
      const shown = results.slice(0, MAX_RESULTS);
      list.innerHTML = shown.length
        ? shown.map((o, i) => `<div class="ps-item${i === active ? " active" : ""}${o.selected ? " selected" : ""}" data-i="${i}" role="option">${escHtml(o.textContent)}</div>`).join("")
          + (results.length > MAX_RESULTS ? `<div class="ps-more">+${results.length - MAX_RESULTS} نتيجة أخرى — اكتب أكثر لتضييق البحث</div>` : "")
        : `<div class="ps-empty">لا توجد نتائج</div>`;
      list.classList.remove("hidden"); placeList();
    };
    const placeList = () => {
      if (list.classList.contains("hidden")) return;
      const r = input.getBoundingClientRect(), below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 220 && above > below;
      Object.assign(list.style, { position: "fixed", left: r.left + "px", width: r.width + "px", right: "auto",
        top: up ? "auto" : (r.bottom + 6) + "px", bottom: up ? (window.innerHeight - r.top + 6) + "px" : "auto",
        maxHeight: Math.max(160, Math.min(320, up ? above : below)) + "px", zIndex: 1000 });
    };
    window.addEventListener("scroll", placeList, true); window.addEventListener("resize", placeList);
    window.visualViewport?.addEventListener("resize", placeList); window.visualViewport?.addEventListener("scroll", placeList);

    input.addEventListener("focus", () => { input.select(); render(); });
    input.addEventListener("input", () => { active = -1; render(); });
    input.addEventListener("keydown", e => {
      if (list.classList.contains("hidden") && ["ArrowDown", "ArrowUp"].includes(e.key)) render();
      const n = Math.min(results.length, MAX_RESULTS);
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % n; render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + n) % n; render(); }
      else if (e.key === "Enter" && !list.classList.contains("hidden")) { e.preventDefault(); if (results[active >= 0 ? active : 0]) choose(results[active >= 0 ? active : 0]); }
      else if (e.key === "Escape") { close(); input.blur(); }
    });
    list.addEventListener("mousedown", e => e.preventDefault());
    list.addEventListener("click", e => { const it = e.target.closest(".ps-item"); if (it) choose(results[+it.dataset.i]); });
    // keep the list open when the keyboard is dismissed (iPad/iPhone); close only on a tap outside
    document.addEventListener("pointerdown", e => {
      if (list.classList.contains("hidden")) return;
      if (e.target === input || wrap.contains(e.target) || list.contains(e.target)) return;
      close(); sync();
    }, true);
    clear.addEventListener("click", () => { choose(null); });
    sel.form?.addEventListener("reset", () => setTimeout(sync, 0));
    sync();
  }

  // Fixed lists written in the page (request types, roles, ...) stay normal dropdowns;
  // only lists filled with people at runtime become searchable.
  document.querySelectorAll("select").forEach(sel => { if (sel.options.length > 1) sel.classList.add("no-search"); });
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll("select").forEach(sel => {
      if (sel.dataset.searchable) { sel._psSync?.(); return; }
      if (sel.multiple || sel.classList.contains("no-search")) return;
      if (sel.options.length >= MIN_OPTIONS) enhance(sel);
    });
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("change", e => { if (e.target.matches?.("select[data-searchable]")) e.target._psSync?.(); }, true);
  queue();
})();
