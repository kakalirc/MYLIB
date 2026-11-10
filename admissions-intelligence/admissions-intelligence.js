/* LIB Admissions Intelligence — read-only, source-aware admissions dashboard. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://kqkojscbaycolaioyarh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq';
  const root = document.getElementById('admissions-app');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateText = v => v ? new Date(v).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const dateTimeText = v => v ? new Date(v).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
  const monthStart = days => { const d=new Date(); d.setDate(d.getDate()-days); d.setHours(0,0,0,0); return d.toISOString(); };
  const norm = v => String(v||'').trim().toLowerCase();
  let client, all = {}, range = 'all', activeStage = null;

  function setMessage(message, bad) {
    root.innerHTML = '<main class="ai-shell"><div class="ai-message '+(bad?'bad':'')+'">'+esc(message)+'</div></main>';
  }
  function metric(label, value, note, stage) {
    return '<button type="button" class="ai-metric ai-metric-button" data-stage="'+esc(stage||'')+'"><span class="ai-metric-label">'+esc(label)+'</span><strong class="ai-metric-value">'+esc(value)+'</strong><span class="ai-metric-note">'+esc(note||'')+'</span><span class="ai-click-hint">View records ↗</span></button>';
  }
  function barRows(items, total) {
    if (!items.length) return '<p class="ai-empty">No records in this period.</p>';
    return items.map(([label,n]) => '<div class="ai-bar-row"><div class="ai-bar-label"><span>'+esc(label)+'</span><b>'+n+'</b></div><div class="ai-track"><i style="width:'+Math.max(n?2:0,total?100*n/total:0)+'%"></i></div></div>').join('');
  }
  function countBy(rows, getter) {
    const m={}; rows.forEach(r=>{const k=String(getter(r)||'Unknown').trim()||'Unknown';m[k]=(m[k]||0)+1;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  }
  function inRange(row, field) {
    if(range==='all') return true;
    return !!row[field] && new Date(row[field]).toISOString()>=monthStart(Number(range));
  }
  function buildRecords() {
    const bookings=(all.bookings||[]).filter(x=>inRange(x,'submitted_at'));
    const registrations=(all.registrations||[]).filter(x=>!x.archived && inRange(x,'created_at'));
    const calls=all.calls||[], demos=all.demos||[];
    const bookedDemoIds=new Set((all.bookings||[]).map(x=>x.demo_log_id).filter(Boolean));
    const records=[];
    bookings.forEach(x=>{
      const history=calls.filter(c=>c.booking_id===x.id).sort((a,b)=>new Date(b.called_at)-new Date(a.called_at));
      const log=demos.find(d=>d.id===x.demo_log_id)||null;
      const status=norm(x.status);
      const admitted=!!x.converted_student_id || status==='converted' || !!(log&&log.linked_student_id);
      records.push({key:'booking:'+x.id,id:x.id,kind:'Demo booking',source:x.source||'Unknown',date:x.submitted_at,name:x.student_name,phone:x.phone,email:x.email,interest:x.subject,mode:x.class_mode,status:x.status||'—',studentId:x.converted_student_id||(log&&log.linked_student_id)||null,booking:x,log,calls:history,followed:history.length>0,booked:!!x.scheduled_date||status==='scheduled'||!!x.demo_log_id,completed:!!(log&&(log.done_at||['done','converted'].includes(norm(log.status)))),admitted});
    });
    registrations.forEach(x=>{
      records.push({key:'registration:'+x.id,id:x.id,kind:'Registration',source:x.heard_from||'Unknown',date:x.created_at,name:x.student_name,phone:x.parent_mobile||x.student_mobile,email:x.email,interest:Array.isArray(x.subjects)?x.subjects.join(', '):'',mode:x.mode_preference,status:x.status||'—',studentId:x.student_id||null,registration:x,calls:[],followed:false,booked:false,completed:norm(x.status)==='accepted',admitted:!!x.student_id||norm(x.status)==='accepted'});
    });
    demos.filter(d=>!bookedDemoIds.has(d.id)&&inRange(d,'created_at')).forEach(x=>{
      records.push({key:'demo:'+x.id,id:x.id,kind:'Teacher-entered demo',source:'Teacher-entered demo',date:x.created_at||x.date,name:x.student_name,phone:x.parent_mobile,interest:'',status:x.status||'—',studentId:x.linked_student_id||null,log:x,calls:[],followed:false,booked:true,completed:!!x.done_at||['done','converted'].includes(norm(x.status)),admitted:!!x.linked_student_id||norm(x.status)==='converted'});
    });
    // Students created directly in LIB, or whose original acquisition record is not present in the source tables.
    const linkedIds=new Set(records.map(r=>r.studentId).filter(Boolean));
    (all.students||[]).filter(s=>!s.archived&&s.onboarding_source&&inRange(s,'created_at')&&!linkedIds.has(s.id)).forEach(s=>{
      records.push({key:'student:'+s.id,id:s.id,kind:'Direct student admission',source:s.onboarding_source||'Direct admission',date:s.created_at,name:s.name,phone:s.mobile_number,email:s.email,interest:'',status:'Admitted',studentId:s.id,student:s,calls:[],followed:false,booked:false,completed:false,admitted:true});
    });
    return records.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  }
  function uniqueAdmissions(records) {
    const m=new Map();
    records.filter(r=>r.studentId&&r.admitted).forEach(r=>{
      const old=m.get(r.studentId);
      if(old){old.sources.add(r.source);old.records.push(r);if(new Date(r.date||0)>new Date(old.date||0))old.date=r.date;}
      else m.set(r.studentId,{studentId:r.studentId,name:r.name,date:r.date,source:r.source,sources:new Set([r.source]),records:[r]});
    });
    return [...m.values()];
  }
  function stageRecords(records, stage) {
    if(stage==='all') return records;
    if(stage==='followup') return records.filter(r=>r.followed);
    if(stage==='demo') return records.filter(r=>r.booked);
    if(stage==='completed') return records.filter(r=>r.completed);
    if(stage==='admissions') return uniqueAdmissions(records).map(a=>({key:'admission:'+a.studentId,id:a.studentId,kind:'Admission',source:[...a.sources].join(', '),date:a.date,name:a.name,status:'Admitted',studentId:a.studentId,records:a.records}));
    if(stage==='open') return records.filter(r=>!r.admitted&&!['lost','cancelled','rejected'].includes(norm(r.status)));
    if(stage==='lost') return records.filter(r=>['lost','cancelled','rejected'].includes(norm(r.status)));
    return records;
  }
  function recordRow(r) {
    const history=(r.calls||[]).map(c=>'<div class="ai-history-item"><b>'+esc(c.outcome||'Call logged')+'</b><span>'+dateTimeText(c.called_at)+'</span>'+(c.comment?'<p>'+esc(c.comment)+'</p>':'')+(c.call_again_on?'<small>Call again: '+dateText(c.call_again_on)+'</small>':'')+'</div>').join('');
    const log=r.log;
    const demoInfo=log?'<div class="ai-detail-line"><b>Demo:</b> '+esc(log.status||'Recorded')+(log.done_at?' · Completed '+dateText(log.done_at):'')+(log.lost_at?' · Lost '+dateText(log.lost_at):'')+'</div>':'';
    const regInfo=r.registration?'<div class="ai-detail-line"><b>Registration:</b> '+esc(r.registration.status||'—')+'</div>':'';
    return '<tr><td>'+dateText(r.date)+'</td><td><b>'+esc(r.name||'Name not recorded')+'</b><small>'+esc(r.phone||r.email||'Contact not recorded')+'</small></td><td>'+esc(r.kind)+'</td><td>'+esc(r.interest||'—')+'</td><td>'+esc(r.source||'Unknown')+'</td><td><span class="ai-status">'+esc(r.status||'—')+'</span>'+demoInfo+regInfo+(history?'<details class="ai-history"><summary>'+r.calls.length+' follow-up record(s)</summary>'+history+'</details>':'')+'</td></tr>';
  }
  function openStage(stage) {
    activeStage=stage;
    const records=buildRecords(), selected=stageRecords(records,stage);
    const labels={all:'All acquisition records',followup:'Follow-up recorded',demo:'Demo booked / recorded',completed:'Demo completed or registration accepted',admissions:'Admissions',open:'Open prospects',lost:'Lost / cancelled / rejected'};
    const rows=selected.map(recordRow).join('');
    const html='<div class="ai-modal-backdrop" data-close-modal="1"><section class="ai-modal" role="dialog" aria-modal="true" aria-label="'+esc(labels[stage]||'Prospect records')+'"><header class="ai-modal-head"><div><div class="ai-eyebrow">PROSPECT RECORDS</div><h2>'+esc(labels[stage]||'Records')+'</h2><p>'+selected.length+' record(s) · '+(stage==='admissions'?'Unique linked students':'Source records; bookings are not deduplicated')+'</p></div><button class="ai-close" type="button" data-close-modal="1" aria-label="Close">×</button></header><div class="ai-table-wrap"><table><thead><tr><th>Date</th><th>Prospect / student</th><th>Route</th><th>Interest</th><th>Source</th><th>Status & history</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="ai-empty">No matching records.</td></tr>')+'</tbody></table></div></section></div>';
    root.insertAdjacentHTML('beforeend',html);
  }
  function render() {
    const records=buildRecords(), admissions=uniqueAdmissions(records);
    const total=records.length, followed=records.filter(r=>r.followed).length, demo=records.filter(r=>r.booked).length, completed=records.filter(r=>r.completed).length;
    const open=records.filter(r=>!r.admitted&&!['lost','cancelled','rejected'].includes(norm(r.status))).length;
    const lost=records.filter(r=>['lost','cancelled','rejected'].includes(norm(r.status))).length;
    const sourceRows=countBy(records,r=>r.source);
    const typeRows=countBy(records,r=>r.kind);
    const subjectRows=countBy(records.filter(r=>r.interest),r=>r.interest);
    const recent=records.slice(0,12);
    root.innerHTML='<main class="ai-shell">'
      +'<header class="ai-header"><div><div class="ai-eyebrow">LIB EDUCATION · ADMIN</div><h1>Admissions Intelligence</h1><p>One view of acquisition, follow-ups, demos and admissions across recorded LIB sources.</p></div><div class="ai-controls"><label for="ai-range">Period</label><select id="ai-range"><option value="30" '+(range==='30'?'selected':'')+'>Last 30 days</option><option value="90" '+(range==='90'?'selected':'')+'>Last 90 days</option><option value="all" '+(range==='all'?'selected':'')+'>All records</option></select><button id="ai-refresh">Refresh</button></div></header>'
      +'<section class="ai-grid">'+metric('All acquisition records',total,'Bookings, registrations, standalone demos and direct admissions','all')+metric('Follow-up recorded',followed,'Booking call history exists','followup')+metric('Demo booked / recorded',demo,'Bookings and standalone teacher demos','demo')+metric('Unique admissions',admissions.length,'Distinct linked student IDs','admissions')+'</section>'
      +'<section class="ai-panel ai-funnel"><div class="ai-section-heading"><div><h2>Unified admissions funnel</h2><p class="ai-sub">Click any stage to inspect its underlying records. Stages reflect recorded milestones, not an assumed linear path.</p></div></div>'
      +'<div class="ai-funnel-grid">'+[['All prospects / records',total,'all'],['Follow-up recorded',followed,'followup'],['Demo booked / recorded',demo,'demo'],['Demo completed / registration accepted',completed,'completed'],['Admissions',admissions.length,'admissions']].map((s,i)=>'<button type="button" class="ai-funnel-stage" data-stage="'+s[2]+'"><span class="ai-stage-name">'+esc(s[0])+'</span><strong>'+s[1]+'</strong><span class="ai-stage-action">View records ↗</span></button>').join('')+'</div><div class="ai-outcomes"><button type="button" data-stage="open">Open prospects <b>'+open+'</b></button><button type="button" data-stage="lost">Lost / cancelled / rejected <b>'+lost+'</b></button></div></section>'
      +'<section class="ai-panels"><article class="ai-panel"><h2>Acquisition source performance</h2><p class="ai-sub">Source values from existing records; missing attribution remains Unknown.</p>'+barRows(sourceRows,total)+'</article>'
      +'<article class="ai-panel"><h2>Record types</h2><p class="ai-sub">Separate routes into the LIB admissions journey.</p>'+barRows(typeRows,total)+'</article>'
      +'<article class="ai-panel"><h2>Course interest</h2>'+barRows(subjectRows,records.filter(r=>r.interest).length)+'</article>'
      +'<article class="ai-panel"><h2>Outcome snapshot</h2>'+barRows([['Admissions',admissions.length],['Open prospects',open],['Lost / cancelled / rejected',lost]],Math.max(total,1))+'</article></section>'
      +'<section class="ai-panel ai-recent"><div class="ai-section-heading"><div><h2>Recent admissions activity</h2><p class="ai-sub">Open a row's follow-up history to review recorded contact activity.</p></div><button type="button" class="ai-secondary" data-stage="all">View all records</button></div><div class="ai-table-wrap"><table><thead><tr><th>Date</th><th>Prospect / student</th><th>Route</th><th>Interest</th><th>Source</th><th>Status & history</th></tr></thead><tbody>'+(recent.length?recent.map(recordRow).join(''):'<tr><td colspan="6" class="ai-empty">No activity in this period.</td></tr>')+'</tbody></table></div></section>'
      +'<footer class="ai-foot">Read-only · Existing LIB records only · No AI calls · No manual data entry · Demo bookings remain individual prospects; admissions are counted by distinct student ID.</footer></main>';
    document.getElementById('ai-range').addEventListener('change',e=>{range=e.target.value;render();});
    document.getElementById('ai-refresh').addEventListener('click',loadData);
  }
  async function loadData() {
    setMessage('Loading admissions records…');
    const specs=[
      ['bookings','wix_demo_bookings','id,order_number,submitted_at,student_name,email,phone,subject,class_mode,status,scheduled_date,scheduled_time,demo_log_id,amount,paid,paid_at,converted_student_id,source'],
      ['demos','demo_logs','id,created_at,date,student_name,parent_mobile,subject_id,status,linked_student_id,converted_at,done_at,lost_at'],
      ['calls','wix_booking_calls','id,booking_id,called_at,outcome,comment,call_again_on,student_id,spoke_to'],
      ['registrations','registrations','id,created_at,student_name,subjects,heard_from,status,student_id,decided_at,archived,parent_mobile,student_mobile,email,mode_preference'],
      ['students','students','id,name,created_at,student_code,parent_name,mobile_number,email,onboarding_source,archived']
    ];
    const results=await Promise.all(specs.map(async ([key,table,columns])=>{
      const order=key==='demos'?'created_at':key==='calls'?'called_at':key==='registrations'?'created_at':key==='students'?'created_at':'submitted_at';
      const {data,error}=await client.from(table).select(columns).order(order,{ascending:false}).limit(5000);
      if(error) throw new Error(table+': '+error.message);
      return [key,data||[]];
    }));
    all=Object.fromEntries(results);
    render();
  }
  async function init() {
    if(!window.supabase){setMessage('Supabase client library did not load. Reload this page.',true);return;}
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    const {data:{session},error:sessionError}=await client.auth.getSession();
    if(sessionError||!session){setMessage('Please sign in to My LIB first, then open Admissions Intelligence again.',true);return;}
    const {data:profile,error}=await client.from('profiles').select('role,archived').eq('id',session.user.id).single();
    if(error||!profile||profile.archived||profile.role!=='Admin'){setMessage('Access restricted. Admissions Intelligence is available to Admin accounts only.',true);return;}
    try{await loadData();}catch(e){setMessage('Could not load admissions data: '+e.message,true);}
  }
  root.addEventListener('click',e=>{
    const stageButton=e.target.closest('[data-stage]');
    if(stageButton){openStage(stageButton.getAttribute('data-stage'));return;}
    if(e.target.closest('[data-close-modal]')){const modal=root.querySelector('.ai-modal-backdrop');if(modal)modal.remove();}
  });
  init();
})();
