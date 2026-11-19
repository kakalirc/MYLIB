/* Admin Experience V2 — layered UX enhancements; existing app workflows preserved. */
(function(){
  if (window.adminExperienceV2Loaded) return;
  window.adminExperienceV2Loaded=true;
  const originalDashboard=renderDashboard;
  const ALL_KEYS=['dashboard','log','registrations','chat','wixbookings','democontrol','support','rebuildclasses','questionbank','fees','payroll','expenses','reports','students','attendancerewards','onboarding','setup','parents','staradmin','researchmonitor','appusage','aiusage','studyplans','homework','qbmonitoring','teacherappraisal','knowledgearena','users','admins','ai','audit','superadmin','admissionsintelligence','studentjourney','classdelivery','studentengagement','revenueintelligence','teacherperformance','loginmanagement'];
  const LABELS={wixbookings:'Demo Bookings',democontrol:'Demo Control Centre',rebuildclasses:'Rebuild Classes',questionbank:'Question Bank',attendancerewards:'Attendance Rewards',staradmin:'Star Admin',researchmonitor:'Research Monitor',appusage:'App Usage',aiusage:'AI Usage',qbmonitoring:'Question Bank Monitoring',teacherappraisal:'Teacher Appraisal',knowledgearena:'Knowledge Arena',admissionsintelligence:'Admissions Intelligence',studentjourney:'Student Journey',classdelivery:'Class Delivery',studentengagement:'Student Engagement',revenueintelligence:'Revenue Intelligence',teacherperformance:'Teacher Performance',superadmin:'Super Admin',loginmanagement:'Login Management'};
  const QUICK=[['registrations','New Registrations','＋'],['wixbookings','Demo Bookings','▣'],['students','Students','♙'],['fees','Fees','₹'],['log','Class Log','▤'],['questionbank','Question Bank','?'],['support','Support','✉'],['payroll','Payroll','▥']];
  const STORE_RECENT='lib_admin_v2_recent_tabs',STORE_FAV='lib_admin_v2_favorite_tabs';
  let menuQuery='',paletteOpen=false,paletteQuery='',recent=[],favorites=[];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(e){return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}};
  recent=read(STORE_RECENT,[]);favorites=read(STORE_FAV,[]);
  const escapeHtml=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function navItems(){
    const nav=document.querySelector('.admin-layout .sidebar-nav');if(!nav)return [];
    const seen=new Set(),items=[];
    nav.querySelectorAll('.sidebar-item[onclick]').forEach(el=>{
      const m=el.getAttribute('onclick').match(/setTab\(['"]([^'"]+)['"]\)/);if(!m||seen.has(m[1]))return;
      seen.add(m[1]);const label=el.textContent.trim().replace(/\s+/g,' ');
      items.push({key:m[1],label:label||m[1]});
    });
    ALL_KEYS.forEach(key=>{if(key==='superadmin'&&!(typeof isCurrentUserSuperuserAdmin==='function'&&isCurrentUserSuperuserAdmin()))return;if(!seen.has(key)){seen.add(key);items.push({key,label:LABELS[key]||key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,c=>c.toUpperCase())});}});
    return items;
  }
  function pendingItems(){
    const items=[];
    try { const n=regNewCount(); if(n) items.push({n,label:'New registrations waiting',tab:'registrations',tone:'urgent'}); } catch(e){}
    try { const n=wixCallsDueCount(); if(n) items.push({n,label:'Demo follow-up calls due',tab:'wixbookings',tone:'warning',action:"setTab('wixbookings')"}); } catch(e){}
    try { const n=data.subscriptions.filter(x=>x.kind==='Request').length; if(n) items.push({n,label:'Fee requests awaiting action',tab:'fees',tone:'warning',action:"rptPendingOpen=true;setTab('fees')"}); } catch(e){}
    try { const n=chatTotalUnread(); if(n) items.push({n,label:'Unread conversations',tab:'chat',tone:'normal'}); } catch(e){}
    try { const n=(data.supportTickets||[]).filter(x=>String(x.status||'').toLowerCase()==='open').length; if(n) items.push({n,label:'Open support tickets',tab:'support',tone:'normal'}); } catch(e){}
    return items;
  }
  function quickHtml([tab,label,icon]){return `<button class="admin-v2-action" onclick="setTab('${tab}')" type="button"><span class="admin-v2-action-icon">${icon}</span><span>${label}</span><span class="admin-v2-arrow">→</span></button>`;}
  function enhancedDashboard(){
    if(currentRole!=='Admin')return originalDashboard();
    const old=originalDashboard(),pending=pendingItems(),now=new Date(),greeting=now.getHours()<12?'Good morning':now.getHours()<17?'Good afternoon':'Good evening';
    const queue=pending.length?`<div class="admin-v2-queue">${pending.map(x=>`<button class="admin-v2-queue-item ${x.tone||''}" onclick="${x.action||`setTab('${x.tab}')`}"><span class="admin-v2-count">${x.n}</span><span class="admin-v2-queue-label">${x.label}</span><span class="admin-v2-arrow">→</span></button>`).join('')}</div>`:`<div class="admin-v2-allclear"><span class="admin-v2-check">✓</span><div><b>You're caught up</b><div class="hint">No urgent admin items are waiting right now.</div></div></div>`;
    const favItems=navItems().filter(x=>favorites.includes(x.key));
    return `<section class="admin-v2-hero"><div><div class="admin-v2-eyebrow">ADMIN WORKSPACE</div><h1>${greeting}</h1><p>Operational snapshot and shortcuts for today.</p></div><button type="button" class="admin-v2-refresh" onclick="refreshAllData()">↻ Refresh data</button></section>
      <section class="admin-v2-section"><div class="admin-v2-section-head"><h2>Needs your attention</h2><span>${pending.length} ${pending.length===1?'item':'items'}</span></div>${queue}</section>
      ${favItems.length?`<section class="admin-v2-section"><div class="admin-v2-section-head"><h2>Starred pages</h2><span>Personal shortcuts</span></div><div class="admin-v2-actions">${favItems.map(x=>quickHtml([x.key,x.label,'★'])).join('')}</div></section>`:''}
      <section class="admin-v2-section"><div class="admin-v2-section-head"><h2>Quick actions</h2><span>Jump straight to a task</span></div><div class="admin-v2-actions">${QUICK.map(quickHtml).join('')}</div></section>
      <section class="admin-v2-section"><div class="admin-v2-section-head"><h2>Recently visited</h2><span>Quickly return to your last pages</span></div><div class="admin-v2-actions">${recent.filter(k=>navItems().some(x=>x.key===k)).slice(0,5).map(k=>{const x=navItems().find(y=>y.key===k);return quickHtml([k,x.label,'↻']);}).join('')||'<div class="hint">Your recently visited pages will appear here.</div>'}</div></section>
      <div class="admin-v2-section-head admin-v2-old-heading"><h2>Centre overview</h2><span>Existing live dashboard</span></div><div class="admin-v2-legacy">${old}</div>`;
  }
  renderDashboard=enhancedDashboard;
  function filterMenu(nav,q){
    nav.querySelectorAll('.sidebar-group').forEach(group=>{const items=[...group.querySelectorAll('.sidebar-item')];if(!q){group.style.display='';items.forEach(i=>i.style.display='');return;}let any=false;items.forEach(item=>{const hit=item.textContent.toLowerCase().includes(q);item.style.display=hit?'':'none';any=any||hit;});group.style.display=any?'':'none';});
    nav.querySelectorAll('.sidebar-item').forEach(item=>{if(item.closest('.sidebar-group'))return;item.style.display=!q||item.textContent.toLowerCase().includes(q)?'':'';});
  }
  function installMenuSearch(){
    if(currentRole!=='Admin')return;const nav=document.querySelector('.admin-layout .sidebar-nav');if(!nav||nav.querySelector('.admin-v2-menu-search'))return;
    const wrap=document.createElement('div');wrap.className='admin-v2-menu-search';wrap.innerHTML='<span aria-hidden="true">⌕</span><input type="search" placeholder="Search menu…" aria-label="Search admin menu" autocomplete="off"><button type="button" title="Open command palette (Ctrl+K)">⌘K</button>';
    const first=nav.querySelector('.sidebar-item');nav.insertBefore(wrap,first?first.nextSibling:nav.firstChild);const input=wrap.querySelector('input');input.value=menuQuery;
    input.addEventListener('input',()=>{menuQuery=input.value.trim().toLowerCase();filterMenu(nav,menuQuery);});
    wrap.querySelector('button').addEventListener('click',openPalette);filterMenu(nav,menuQuery);
    navItems().forEach(x=>{if(favorites.includes(x.key))return;});
  }
  function recordTab(tab){if(currentRole!=='Admin')return;recent=[tab,...recent.filter(x=>x!==tab)].slice(0,8);write(STORE_RECENT,recent);updatePalette();}
  const originalSetTab=setTab;
  setTab=function(tab){if(currentRole==='Admin')recordTab(tab);return originalSetTab(tab);};
  function toggleFavorite(tab){favorites=favorites.includes(tab)?favorites.filter(x=>x!==tab):[tab,...favorites];write(STORE_FAV,favorites);updatePalette();}
  function openPalette(){if(currentRole!=='Admin')return;paletteOpen=true;paletteQuery='';renderPalette();setTimeout(()=>document.querySelector('#adminV2Palette input')?.focus(),20);}
  function closePalette(){paletteOpen=false;document.getElementById('adminV2Palette')?.remove();}
  function renderPalette(){
    // Re-render the overlay without changing paletteOpen; closePalette() resets that state.
    document.getElementById('adminV2Palette')?.remove();if(!paletteOpen)return;
    const all=navItems(),q=paletteQuery.toLowerCase(),ordered=[...all.filter(x=>favorites.includes(x.key)),...all.filter(x=>recent.includes(x.key)&&!favorites.includes(x.key)),...all.filter(x=>!favorites.includes(x.key)&&!recent.includes(x.key))];
    const matches=ordered.filter(x=>!q||x.label.toLowerCase().includes(q)||x.key.toLowerCase().includes(q)).slice(0,14);
    const overlay=document.createElement('div');overlay.id='adminV2Palette';overlay.className='admin-v2-palette-overlay';overlay.innerHTML=`<div class="admin-v2-palette" role="dialog" aria-modal="true" aria-label="Admin command palette"><div class="admin-v2-palette-input"><span>⌕</span><input placeholder="Search pages and actions…" value="${escapeHtml(paletteQuery)}"><kbd>ESC</kbd></div><div class="admin-v2-palette-list">${matches.map(x=>`<div class="admin-v2-palette-row" data-tab="${x.key}"><button class="admin-v2-palette-open"><span>${favorites.includes(x.key)?'★':recent.includes(x.key)?'↻':'›'}</span><span>${escapeHtml(x.label)}</span><kbd>Enter</kbd></button><button class="admin-v2-palette-star" title="${favorites.includes(x.key)?'Unstar':'Star'} page">${favorites.includes(x.key)?'★':'☆'}</button></div>`).join('')||'<div class="admin-v2-palette-empty">No matching pages</div>'}</div><div class="admin-v2-palette-footer"><span>↑↓ navigate</span><span>Enter open</span><span>★ star page</span><span>Ctrl+K toggle</span></div></div>`;
    overlay.addEventListener('click',e=>{if(e.target===overlay)closePalette();});
    document.body.appendChild(overlay);const input=overlay.querySelector('input');input.addEventListener('input',()=>{paletteQuery=input.value;const pos=input.selectionStart;renderPalette();const next=document.querySelector('#adminV2Palette input');next?.focus();try{next?.setSelectionRange(pos,pos);}catch(e){}});
    input.addEventListener('keydown',e=>{if(e.key==='Escape'){closePalette();e.stopPropagation();}if(e.key==='Enter'){const active=overlay.querySelector('.admin-v2-palette-row.is-active')||overlay.querySelector('.admin-v2-palette-row');if(active)openTab(active.dataset.tab);}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const rows=[...overlay.querySelectorAll('.admin-v2-palette-row')];if(!rows.length)return;let i=rows.findIndex(r=>r.classList.contains('is-active'));i=e.key==='ArrowDown'?(i+1)%rows.length:(i<=0?rows.length-1:i-1);rows.forEach(r=>r.classList.remove('is-active'));rows[i].classList.add('is-active');rows[i].scrollIntoView({block:'nearest'});}});
    overlay.querySelectorAll('.admin-v2-palette-row').forEach(row=>{row.querySelector('.admin-v2-palette-open').onclick=()=>openTab(row.dataset.tab);row.querySelector('.admin-v2-palette-star').onclick=()=>toggleFavorite(row.dataset.tab);});
  }
  function updatePalette(){if(paletteOpen)renderPalette();}
  function openTab(tab){closePalette();setTab(tab);}
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();paletteOpen?closePalette():openPalette();}if(e.key==='Escape'&&paletteOpen)closePalette();});
  window.adminExperienceV2={openPalette,toggleFavorite,closePalette};
  const observer=new MutationObserver(()=>installMenuSearch());observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',installMenuSearch);installMenuSearch();
})();
