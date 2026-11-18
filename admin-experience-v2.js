/* Admin Experience V2 — additive UX layer; existing workflows are preserved. */
(function(){
  if (window.adminExperienceV2Loaded) return;
  window.adminExperienceV2Loaded = true;
  const originalDashboard = renderDashboard;
  const QUICK = [['registrations','New Registrations','＋'],['wixbookings','Demo Bookings','▣'],['students','Students','♙'],['fees','Fees','₹'],['log','Class Log','▤'],['questionbank','Question Bank','?'],['support','Support','✉'],['payroll','Payroll','▥']];
  function safeCount(fn){try{return Number(fn())||0;}catch(e){return 0;}}
  function pendingItems(){
    const d=data||{},items=[];
    const newRegs=safeCount(regNewCount);if(newRegs)items.push({n:newRegs,label:'New registrations waiting',tab:'registrations',tone:'urgent'});
    const newDemos=(d.wixBookings||[]).filter(x=>x.status==='New').length;if(newDemos)items.push({n:newDemos,label:'New demo bookings',tab:'wixbookings',tone:'urgent',action:"wixBookingsFilter='New';setTab('wixbookings')"});
    const calls=safeCount(wixCallsDueCount);if(calls)items.push({n:calls,label:'Demo follow-up calls due',tab:'wixbookings',tone:'warning',action:"wixBookingsFilter='Calls due';setTab('wixbookings')"});
    const feeReq=(d.subscriptions||[]).filter(x=>x.kind==='Request').length;if(feeReq)items.push({n:feeReq,label:'Fee requests awaiting action',tab:'fees',tone:'warning',action:"rptPendingOpen=true;setTab('fees')"});
    const unread=safeCount(chatTotalUnread);if(unread)items.push({n:unread,label:'Unread conversations',tab:'chat',tone:'normal'});
    const openSupport=(d.supportTickets||[]).filter(x=>String(x.status||'').toLowerCase()==='open').length;if(openSupport)items.push({n:openSupport,label:'Open support tickets',tab:'support',tone:'normal'});
    const waiting=(d.demoLogs||[]).filter(x=>typeof demoWaiting==='function'&&demoWaiting(x)).length;if(waiting)items.push({n:waiting,label:'Demos waiting for result',tab:'wixbookings',tone:'warning',action:"demoLogsStatusFilter='Waiting';setTab('wixbookings')"});
    return items;
  }
  function actionHtml([tab,label,icon]){return `<button class="admin-v2-action" onclick="setTab('${tab}')" type="button"><span class="admin-v2-action-icon">${icon}</span><span>${label}</span><span class="admin-v2-arrow">→</span></button>`;}
  function enhancedDashboard(){
    if(currentRole!=='Admin'||typeof originalDashboard!=='function')return originalDashboard?originalDashboard():'';
    const old=originalDashboard(),pending=pendingItems(),now=new Date(),greeting=now.getHours()<12?'Good morning':now.getHours()<17?'Good afternoon':'Good evening';
    const queue=pending.length?`<div class="admin-v2-queue">${pending.map(x=>`<button class="admin-v2-queue-item ${x.tone||''}" onclick="${x.action||`setTab('${x.tab}')`}"><span class="admin-v2-count">${x.n}</span><span class="admin-v2-queue-label">${x.label}</span><span class="admin-v2-arrow">→</span></button>`).join('')}</div>`:`<div class="admin-v2-allclear"><span class="admin-v2-check">✓</span><div><b>You're caught up</b><div class="hint">No urgent admin items are waiting right now.</div></div></div>`;
    return `<section class="admin-v2-hero"><div><div class="admin-v2-eyebrow">ADMIN WORKSPACE</div><h1>${greeting}</h1><p>Here’s your operational snapshot for today.</p></div><button type="button" class="admin-v2-refresh" onclick="refreshAllData()">↻ Refresh data</button></section><section class="admin-v2-section"><div class="admin-v2-section-head"><h2>Needs your attention</h2><span>${pending.length} ${pending.length===1?'item':'items'}</span></div>${queue}</section><section class="admin-v2-section"><div class="admin-v2-section-head"><h2>Quick actions</h2><span>Jump straight to a task</span></div><div class="admin-v2-actions">${QUICK.map(actionHtml).join('')}</div></section><div class="admin-v2-section-head admin-v2-old-heading"><h2>Centre overview</h2><span>Live counters</span></div><div class="admin-v2-legacy">${old}</div>`;
  }
  renderDashboard=enhancedDashboard;
  let menuQuery='';
  function filterMenu(nav,q){
    nav.querySelectorAll('.sidebar-group').forEach(group=>{const items=[...group.querySelectorAll('.sidebar-item')];if(!q){group.style.display='';items.forEach(i=>i.style.display='');return;}let any=false;items.forEach(item=>{const hit=item.textContent.toLowerCase().includes(q);item.style.display=hit?'':'none';any=any||hit;});group.style.display=any?'':'none';});
    nav.querySelectorAll('.sidebar-item').forEach(item=>{if(item.closest('.sidebar-group'))return;item.style.display=!q||item.textContent.toLowerCase().includes(q)?'':'';});
  }
  function installMenuSearch(){if(currentRole!=='Admin')return;const nav=document.querySelector('.admin-layout .sidebar-nav');if(!nav||nav.querySelector('.admin-v2-menu-search'))return;const wrap=document.createElement('div');wrap.className='admin-v2-menu-search';wrap.innerHTML='<span aria-hidden="true">⌕</span><input type="search" placeholder="Search menu…" aria-label="Search admin menu" autocomplete="off">';const first=nav.querySelector('.sidebar-item');nav.insertBefore(wrap,first?first.nextSibling:nav.firstChild);const input=wrap.querySelector('input');input.value=menuQuery;input.addEventListener('input',()=>{menuQuery=input.value.trim().toLowerCase();filterMenu(nav,menuQuery);});filterMenu(nav,menuQuery);}
  const observer=new MutationObserver(installMenuSearch);observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',installMenuSearch);installMenuSearch();
})();
