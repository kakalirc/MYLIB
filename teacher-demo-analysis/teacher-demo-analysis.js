/* Teacher Demo Analysis — authenticated, read-only and scoped to the signed-in teacher. */
(function(){
'use strict';
const URL='https://kqkojscbaycolaioyarh.supabase.co';
const KEY='sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq';
const root=document.getElementById('teacher-demo-app');
let client, rows=[], range='all';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').trim().toLowerCase();
const dateText=v=>v?new Date(v+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
const dateOf=r=>r.scheduled_date||r.demo_date||r.submitted_at||r.created_at||'';
function message(s,bad){root.innerHTML='<main class="td-shell"><div class="td-message">'+(bad?'<b>Unable to open My Demo Analysis</b><br>':'')+esc(s)+'</div></main>';}
function classify(r){const s=norm(r.status);return {completed:!!r.done_at||['done','converted'].includes(s)||s==='completed',converted:!!r.converted_student_id||!!r.linked_student_id||s==='converted',lost:['lost','cancelled'].includes(s),pending:['new','scheduled','pending',''].includes(s)};}
function buildRows(bookings,demos,subjects){
 const logs=new Map(demos.map(d=>[d.id,d]));
 const linked=new Set();
 const out=[];
 bookings.forEach(b=>{
  const log=b.demo_log_id?logs.get(b.demo_log_id):null;
  if(log)linked.add(log.id);
  const x={id:'booking:'+b.id,booking_id:b.id,log_id:log?.id||null,name:b.student_name||log?.student_name||'Name not recorded',phone:b.phone||log?.parent_mobile||'',email:b.email||'',subject:b.subject||subjects.get(log?.subject_id)||'—',status:log?.status||b.status||'New',scheduled_date:b.scheduled_date||'',demo_date:log?.date||'',submitted_at:b.submitted_at,created_at:log?.created_at,done_at:log?.done_at||'',lost_at:log?.lost_at||'',lost_reason:log?.lost_reason||'',notes:log?.done_note||log?.lost_note||log?.notes||b.notes||'',converted_student_id:b.converted_student_id||'',linked_student_id:log?.linked_student_id||''};
  out.push(x);
 });
 demos.filter(d=>!linked.has(d.id)).forEach(d=>out.push({id:'log:'+d.id,log_id:d.id,name:d.student_name||'Name not recorded',phone:d.parent_mobile||'',subject:subjects.get(d.subject_id)||'—',status:d.status||'Pending',demo_date:d.date||'',created_at:d.created_at,done_at:d.done_at||'',lost_at:d.lost_at||'',lost_reason:d.lost_reason||'',notes:d.done_note||d.lost_note||d.notes||'',linked_student_id:d.linked_student_id||''}));
 return out.sort((a,b)=>new Date(dateOf(b)||0)-new Date(dateOf(a)||0));
}
function inPeriod(r){if(range==='all')return true;const d=dateOf(r);if(!d)return false;return new Date(d)>=new Date(Date.now()-Number(range)*86400000);}
function bars(items){if(!items.length)return '<div class="td-empty">No records in this period.</div>';const max=Math.max(1,...items.map(x=>x[1]));return '<div class="td-bars">'+items.map(([k,n])=>'<div><div class="td-bar-label"><span>'+esc(k)+'</span><b>'+n+'</b></div><div class="td-track"><i style="width:'+Math.max(2,100*n/max)+'%"></i></div></div>').join('')+'</div>';}
function render(){
 const data=rows.filter(inPeriod), completed=data.filter(r=>classify(r).completed), converted=data.filter(r=>classify(r).converted), pending=data.filter(r=>!classify(r).completed&&!classify(r).lost&&!classify(r).converted), lost=data.filter(r=>classify(r).lost);
 const rate=completed.length?Math.round(converted.length/completed.length*100):0;
 const subjectCounts={};data.forEach(r=>{const k=r.subject||'Unknown';if(!subjectCounts[k])subjectCounts[k]={completed:0,converted:0};if(classify(r).completed)subjectCounts[k].completed++;if(classify(r).converted)subjectCounts[k].converted++;});
 const subjectRows=Object.entries(subjectCounts).map(([k,v])=>[k+' · '+v.converted+'/'+v.completed+' converted',v.completed?v.converted/v.completed*100:0]).sort((a,b)=>b[1]-a[1]);
 const months=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const list=data.filter(r=>String(dateOf(r)).slice(0,7)===key);months.push({label:d.toLocaleDateString('en-IN',{month:'short'}),n:list.filter(r=>classify(r).converted).length});}
 const maxMonth=Math.max(1,...months.map(m=>m.n));
 const table=data.map(r=>'<tr><td>'+dateText(dateOf(r))+'</td><td><b>'+esc(r.name)+'</b><small>'+esc(r.phone||r.email||'Contact not recorded')+'</small></td><td>'+esc(r.subject)+'</td><td><span class="td-status">'+esc(r.status)+'</span>'+(r.lost_reason?'<small>Reason: '+esc(r.lost_reason)+'</small>':'')+(r.notes?'<small>'+esc(r.notes)+'</small>':'')+'</td><td>'+(classify(r).converted?'Yes':'—')+'</td></tr>').join('');
 root.innerHTML='<main class="td-shell"><header class="td-head"><div><div class="td-eyebrow">LIB EDUCATION · TEACHER</div><h1>My Demo Analysis</h1><p>Only demos assigned to your teacher account, from bookings and teacher demo logs.</p></div><div class="td-controls"><label for="td-range">Period</label><select id="td-range"><option value="30" '+(range==='30'?'selected':'')+'>Last 30 days</option><option value="90" '+(range==='90'?'selected':'')+'>Last 90 days</option><option value="all" '+(range==='all'?'selected':'')+'>All records</option></select><button id="td-refresh">Refresh</button></div></header>'
 +'<section class="td-grid"><article class="td-card"><div class="td-label">Assigned demos</div><div class="td-value">'+data.length+'</div><div class="td-note">Unique demos, both sources combined</div></article><article class="td-card"><div class="td-label">Completed</div><div class="td-value">'+completed.length+'</div><div class="td-note">Demo marked Done or Converted</div></article><article class="td-card"><div class="td-label">Converted</div><div class="td-value">'+converted.length+'</div><div class="td-note">Linked student or Converted status</div></article><article class="td-card"><div class="td-label">Conversion rate</div><div class="td-value">'+rate+'%</div><div class="td-note">'+converted.length+' converted / '+completed.length+' completed demos</div></article></section>'
 +'<section class="td-panels"><article class="td-panel"><h2>Demo status</h2><p class="td-muted">Your current demo outcomes.</p>'+bars([['Pending / scheduled',pending.length],['Completed',completed.length],['Converted',converted.length],['Lost / cancelled',lost.length]])+'</article><article class="td-panel"><h2>Subject conversion</h2><p class="td-muted">Converted demos divided by completed demos, by subject.</p>'+bars(subjectRows)+'</article></section>'
 +'<section class="td-panel"><h2>Monthly conversions</h2><p class="td-muted">Number of your demos converted in each month.</p><div class="td-months">'+months.map(m=>'<div class="td-month"><b>'+m.n+'</b><i style="height:'+Math.max(2,m.n/maxMonth*105)+'px"></i><span>'+m.label+'</span></div>').join('')+'</div></section>'
 +'<section class="td-panel" style="margin-top:14px"><h2>My assigned demos <span class="td-muted">('+data.length+')</span></h2><div class="td-table-wrap"><table class="td-table"><thead><tr><th>Demo date</th><th>Student / parent</th><th>Subject</th><th>Status / outcome</th><th>Converted</th></tr></thead><tbody>'+(table||'<tr><td colspan="5" class="td-empty">No assigned demos in this period.</td></tr>')+'</tbody></table></div></section><footer class="td-foot">Read-only · Personal teacher view · Booking and demo-log records linked by demo_log_id are counted once. Conversion rate uses completed demos as its denominator.</footer></main>';
 document.getElementById('td-range').addEventListener('change',e=>{range=e.target.value;render();});document.getElementById('td-refresh').addEventListener('click',load);
}
async function load(){
 message('Loading your assigned demos…');
 const {data:{session},error:se}=await client.auth.getSession();if(se||!session){message('Sign in to My LIB first, then open My Demo Analysis.',true);return;}
 const {data:profile,error:pe}=await client.from('profiles').select('role,linked_teacher_id,archived').eq('id',session.user.id).single();
 if(pe||!profile||profile.archived||profile.role!=='Teacher'||!profile.linked_teacher_id){message('Access restricted. This page is available to active teacher accounts only.',true);return;}
 const tid=profile.linked_teacher_id;
 const [b,d,s]=await Promise.all([
  client.from('wix_demo_bookings').select('id,student_name,email,phone,subject,status,scheduled_teacher_id,scheduled_date,submitted_at,demo_log_id,converted_student_id,notes').eq('scheduled_teacher_id',tid).order('submitted_at',{ascending:false}).limit(5000),
  client.from('demo_logs').select('id,teacher_id,date,subject_id,student_name,parent_mobile,notes,linked_student_id,status,created_at,demo_time,converted_at,done_at,done_note,lost_at,lost_reason,lost_note').eq('teacher_id',tid).order('created_at',{ascending:false}).limit(5000),
  client.from('subjects').select('id,name').eq('teacher_id',tid)
 ]);
 if(b.error)throw new Error('Assigned bookings: '+b.error.message);if(d.error)throw new Error('Teacher demo logs: '+d.error.message);if(s.error)throw new Error('Subjects: '+s.error.message);
 const sm=new Map((s.data||[]).map(x=>[x.id,x.name]));rows=buildRows(b.data||[],d.data||[],sm);render();
}
async function init(){if(!window.supabase){message('Supabase browser library did not load. Refresh and try again.',true);return;}client=window.supabase.createClient(URL,KEY);try{await load();}catch(e){message(e.message,true);}}
init();
})();