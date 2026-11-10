/* LIB Admissions Intelligence — read-only dashboard using existing records only. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://kqkojscbaycolaioyarh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq';
  const root = document.getElementById('admissions-app');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateText = v => v ? new Date(v).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const monthStart = days => { const d=new Date(); d.setDate(d.getDate()-days); d.setHours(0,0,0,0); return d.toISOString(); };
  let client, all = {}, range = 'all';

  function setMessage(message, bad) {
    root.innerHTML = '<main class="ai-shell"><div class="ai-message '+(bad?'bad':'')+'">'+esc(message)+'</div></main>';
  }
  function metric(label, value, note) {
    return '<article class="ai-metric"><div class="ai-metric-label">'+esc(label)+'</div><div class="ai-metric-value">'+esc(value)+'</div><div class="ai-metric-note">'+esc(note||'')+'</div></article>';
  }
  function barRows(items, total) {
    if (!items.length) return '<p class="ai-empty">No records in this period.</p>';
    return items.map(([label,n]) => '<div class="ai-bar-row"><div class="ai-bar-label"><span>'+esc(label)+'</span><b>'+n+'</b></div><div class="ai-track"><i style="width:'+Math.max(n?2:0, total?100*n/total:0)+'%"></i></div></div>').join('');
  }
  function countBy(rows, key, unknown) {
    const m = {};
    rows.forEach(r => { const k = String(r[key] || unknown || 'Unknown').trim() || 'Unknown'; m[k]=(m[k]||0)+1; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  }
  function filtered(rows, field) {
    if (range === 'all') return rows;
    const from = monthStart(Number(range));
    return rows.filter(r => r[field] && new Date(r[field]).toISOString() >= from);
  }
  function render() {
    const bookings=filtered(all.bookings||[],'submitted_at');
    const demos=filtered(all.demos||[],'created_at');
    const regs=filtered(all.registrations||[],'created_at');
    const calls=filtered(all.calls||[],'called_at');
    const leads=filtered(all.leads||[],'created_at');
    const paid=bookings.filter(x=>x.paid===true || Number(x.amount||0)>0 && !!x.paid_at).length;
    const converted=bookings.filter(x=>!!x.converted_student_id || String(x.status||'').toLowerCase()==='converted').length;
    const accepted=regs.filter(x=>String(x.status||'').toLowerCase()==='accepted').length;
    const activeLinked=new Set(bookings.map(x=>x.converted_student_id).filter(Boolean)).size;
    const sources=countBy(bookings,'source','Unknown');
    const regSources=countBy(regs,'heard_from','Unknown');
    const statuses=countBy(bookings,'status','Unknown');
    const subjects=countBy(bookings,'subject','Not specified');
    const recent=[...bookings.map(x=>({date:x.submitted_at,name:x.student_name,kind:'Demo booking',status:x.status,subject:x.subject,source:x.source})),
      ...regs.map(x=>({date:x.created_at,name:x.student_name,kind:'Registration',status:x.status,subject:Array.isArray(x.subjects)?x.subjects.join(', '):(x.subjects||''),source:x.heard_from}))].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,12);
    root.innerHTML = '<main class="ai-shell">'
      + '<header class="ai-header"><div><div class="ai-eyebrow">LIB EDUCATION · ADMIN</div><h1>Admissions Intelligence</h1><p>Admissions activity from existing LIB records. No manual enquiry entry.</p></div><div class="ai-controls"><label for="ai-range">Period</label><select id="ai-range"><option value="30" '+(range==='30'?'selected':'')+'>Last 30 days</option><option value="90" '+(range==='90'?'selected':'')+'>Last 90 days</option><option value="all" '+(range==='all'?'selected':'')+'>All records</option></select><button id="ai-refresh">Refresh</button></div></header>'
      + '<section class="ai-grid">'+metric('Demo bookings / prospects',bookings.length,'Each booking counts as one prospect')+metric('Converted demo bookings',converted,'Linked student or Converted status')+metric('Registrations',regs.length,accepted+' accepted')+metric('Paid demo bookings',paid,'Based on existing payment fields')+'</section>'
      + '<section class="ai-panels"><article class="ai-panel"><h2>Demo booking sources</h2><p class="ai-sub">Every booking is counted independently. Missing source is shown as Unknown.</p>'+barRows(sources,bookings.length)+'</article>'
      + '<article class="ai-panel"><h2>Demo booking status</h2>'+barRows(statuses,bookings.length)+'</article>'
      + '<article class="ai-panel"><h2>Registration sources</h2><p class="ai-sub">Based on the existing “heard from” field.</p>'+barRows(regSources,regs.length)+'</article>'
      + '<article class="ai-panel"><h2>Course interest</h2>'+barRows(subjects,bookings.length)+'</article></section>'
      + '<section class="ai-grid ai-grid-small">'+metric('Demo logs',demos.length,'Recorded demo outcomes')+metric('Follow-up calls',calls.length,'Existing call history')+metric('Knowledge Arena leads',leads.length,'Guest leads recorded')+metric('Distinct converted students',activeLinked,'From demo booking links')+'</section>'
      + '<section class="ai-panel"><h2>Recent admissions activity</h2><div class="ai-table-wrap"><table><thead><tr><th>Date</th><th>Prospect</th><th>Record</th><th>Interest</th><th>Source</th><th>Status</th></tr></thead><tbody>'
      +(recent.length?recent.map(x=>'<tr><td>'+dateText(x.date)+'</td><td>'+esc(x.name||'—')+'</td><td>'+esc(x.kind)+'</td><td>'+esc(x.subject||'—')+'</td><td>'+esc(x.source||'Unknown')+'</td><td><span class="ai-status">'+esc(x.status||'—')+'</span></td></tr>').join(''):'<tr><td colspan="6" class="ai-empty">No activity in this period.</td></tr>')
      + '</tbody></table></div></section>'
      + '<footer class="ai-foot">Read-only dashboard · Existing database records only · No AI calls · No manual data entry</footer></main>';
    document.getElementById('ai-range').addEventListener('change',e=>{range=e.target.value;render();});
    document.getElementById('ai-refresh').addEventListener('click',loadData);
  }
  async function loadData() {
    setMessage('Loading admissions records…');
    const specs=[
      ['bookings','wix_demo_bookings','id,order_number,submitted_at,student_name,email,phone,subject,class_mode,status,amount,paid,paid_at,converted_student_id,source'],
      ['demos','demo_logs','id,created_at,date,student_name,parent_mobile,subject_id,status,linked_student_id,converted_at,lost_at'],
      ['calls','wix_booking_calls','id,booking_id,called_at,outcome,comment,call_again_on,student_id'],
      ['registrations','registrations','id,created_at,student_name,subjects,heard_from,status,student_id,decided_at'],
      ['leads','ka_guest_leads','id,created_at,first_seen_at,last_seen_at,lead_status,converted_student_id,games_completed']
    ];
    const results=await Promise.all(specs.map(async ([key,table,columns])=>{
      const {data,error}=await client.from(table).select(columns).order(key==='demos'?'created_at':key==='calls'?'called_at':key==='leads'?'created_at':key==='registrations'?'created_at':'submitted_at',{ascending:false}).limit(5000);
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
  init();
})();