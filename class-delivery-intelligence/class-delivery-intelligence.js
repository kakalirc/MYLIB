/* Class Delivery Intelligence — read-only analytics over existing schedule and attendance records. */
(function(){
'use strict';
const SUPABASE_URL='https://kqkojscbaycolaioyarh.supabase.co';
const SUPABASE_KEY='sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq';
const root=document.getElementById('cdi-app');
let client,role='',teacherId='',teachers=[],students=[],subjects=[],schedules=[],sessions=[],period='month',filterTeacher='all',filterStudent='all',filterSubject='all',filterType='all';
const esc=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const dateText=v=>v?new Date(v+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short'}):'—';
const nameOf=(list,id)=>{const x=list.find(v=>v.id===id);return x?x.name:'Unknown';};
function message(s,bad){root.innerHTML='<main class="cdi-shell"><div class="cdi-message">'+(bad?'<b>Unable to open Class Delivery Intelligence</b><br>':'')+esc(s)+'</div></main>';}
async function readAll(table,columns,orderField){
 let out=[],start=0;
 while(true){
  const q=client.from(table).select(columns).order(orderField,{ascending:false}).order('id',{ascending:true}).range(start,start+999);
  const {data,error}=await q;
  if(error)throw new Error('Could not load '+table+': '+error.message);
  out=out.concat(data||[]);
  if(!data||data.length<1000)break;
  start+=1000;
  if(start>20000)throw new Error('The '+table+' result exceeded the safety limit. Please narrow the report period.');
 }
 return out;
}
function dateInRange(value){
 if(!value)return false;
 const d=String(value).slice(0,10),t=today();
 if(period==='all')return true;
 if(period==='month')return d.slice(0,7)===t.slice(0,7);
 const n=Number(period),from=new Date(t+'T00:00:00');from.setDate(from.getDate()-n+1);
 return d>=from.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})&&d<=t;
}
function filtered(){
 const attendance=sessions.filter(s=>dateInRange(s.date)&&
  (filterTeacher==='all'||s.teacher_id===filterTeacher)&&
  (filterStudent==='all'||s.student_id===filterStudent)&&
  (filterSubject==='all'||s.subject_id===filterSubject)&&
  (filterType==='all'||s.class_type===filterType));
 const pending=schedules.filter(s=>s.status==='Pending'&&dateInRange(s.date)&&
  (filterTeacher==='all'||s.teacher_id===filterTeacher)&&
  (filterStudent==='all'||s.student_id===filterStudent)&&
  (filterSubject==='all'||s.subject_id===filterSubject)&&
  (filterType==='all'||s.class_type===filterType));
 const scheduled=schedules.filter(s=>dateInRange(s.date)&&
  (filterTeacher==='all'||s.teacher_id===filterTeacher)&&
  (filterStudent==='all'||s.student_id===filterStudent)&&
  (filterSubject==='all'||s.subject_id===filterSubject)&&
  (filterType==='all'||s.class_type===filterType));
 return {attendance,pending,scheduled,present:attendance.filter(s=>s.status==='Present'),absent:attendance.filter(s=>s.status==='Absent'),overdue:pending.filter(s=>s.date<today()),notDue:pending.filter(s=>s.date>=today())};
}
function rate(a,b){return b?Math.round(a/b*100):0;}
function tableRows(rows,kind){
 if(!rows.length)return '<tr><td colspan="6" class="cdi-empty">No records in this period.</td></tr>';
 return rows.map(r=>{
  const name=r.name||nameOf(teachers,r.teacher_id);
  const present=r.present,absent=r.absent||0,overdue=r.overdue||0;
  const pct=kind==='teacher'?rate(present+absent,present+absent+overdue):rate(present,present+absent+overdue);
  const den=present+absent+overdue;
  return '<tr><td><b>'+esc(name)+'</b></td><td>'+present+'</td><td>'+absent+'</td><td>'+overdue+'</td><td class="cdi-rate '+(pct>=80?'cdi-good':pct<60?'cdi-warn':'')+'">'+(den?pct+'%':'—')+'</td><td>'+den+'</td></tr>';
 }).join('');
}
function summary(){
 const d=filtered(),present=d.present.length,absent=d.absent.length,overdue=d.overdue.length,notDue=d.notDue.length;
 const delivery=rate(present+absent,present+absent+overdue),attendance=rate(present,present+absent+overdue);
 const tMap=new Map(),sMap=new Map();
 function ensure(map,id,name){if(!map.has(id))map.set(id,{id,name,present:0,absent:0,overdue:0});return map.get(id);}
 d.present.forEach(s=>ensure(tMap,s.teacher_id,nameOf(teachers,s.teacher_id)).present++);
 d.absent.forEach(s=>{ensure(tMap,s.teacher_id,nameOf(teachers,s.teacher_id)).absent++;ensure(sMap,s.student_id,nameOf(students,s.student_id)).absent++;});
 d.present.forEach(s=>ensure(sMap,s.student_id,nameOf(students,s.student_id)).present++);
 d.overdue.forEach(s=>{ensure(tMap,s.teacher_id,nameOf(teachers,s.teacher_id)).overdue++;ensure(sMap,s.student_id,nameOf(students,s.student_id)).overdue++;});
 const teacherRows=[...tMap.values()].sort((a,b)=>rate(b.present+b.absent,b.present+b.absent+b.overdue)-rate(a.present+a.absent,a.present+a.absent+a.overdue));
 const studentRows=[...sMap.values()].sort((a,b)=>rate(a.present,a.present+a.absent+a.overdue)-rate(b.present,b.present+b.absent+b.overdue));
 return {d,present,absent,overdue,notDue,delivery,attendance,teacherRows,studentRows};
}
function trendHtml(rows){
 const days=[];const end=new Date(today()+'T00:00:00');
 for(let i=13;i>=0;i--){const d=new Date(end);d.setDate(d.getDate()-i);const key=d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});const list=rows.filter(x=>x.date===key);days.push({key,label:key.slice(8),present:list.filter(x=>x.status==='Present').length,absent:list.filter(x=>x.status==='Absent').length});}
 const max=Math.max(1,...days.map(x=>x.present+x.absent));
 return '<div class="cdi-trend">'+days.map(x=>'<div class="cdi-day"><b>'+(x.present+x.absent||'')+'</b><div class="cdi-stack" style="height:'+Math.max(2,(x.present+x.absent)/max*105)+'px"><i style="height:'+(x.present/(x.present+x.absent||1)*100)+'%"></i><i class="absent" style="height:'+(x.absent/(x.present+x.absent||1)*100)+'%"></i></div><span>'+x.label+'</span></div>').join('')+'</div><div class="cdi-legend"><span><i class="cdi-dot"></i>Present</span><span><i class="cdi-dot absent"></i>Absent</span></div>';
}
function selectHtml(id,label,items,value){
 return '<select id="'+id+'" aria-label="'+label+'"><option value="all">All '+label+'</option>'+items.map(x=>'<option value="'+esc(x.id)+'" '+(value===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select>';
}
function render(){
 const x=summary(),d=x.d;
 const teacherTable=x.teacherRows.map(r=>tableRows([r],'teacher')).join('');
 const studentTable=x.studentRows.map(r=>tableRows([r],'student')).join('');
 const overdueRows=d.overdue.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,15).map(s=>'<tr><td>'+dateText(s.date)+'</td><td>'+esc(nameOf(students,s.student_id))+'</td><td>'+esc(nameOf(teachers,s.teacher_id))+'</td><td>'+esc(nameOf(subjects,s.subject_id))+'</td><td>'+esc(s.class_type)+'</td></tr>').join('');
 const teacherOptions=teachers.filter(t=>!t.archived).sort((a,b)=>a.name.localeCompare(b.name));
 const studentOptions=students.filter(s=>!s.archived).sort((a,b)=>a.name.localeCompare(b.name));
 const subjectOptions=subjects.slice().sort((a,b)=>a.name.localeCompare(b.name));
 root.innerHTML='<main class="cdi-shell">'+
 '<header class="cdi-head"><div><div class="cdi-eyebrow">LIB EDUCATION · '+(role==='Admin'?'ADMIN':'TEACHER')+'</div><h1>Class Delivery Intelligence</h1><p>Read-only view of class delivery and student attendance using existing schedules and attendance records.</p></div><div class="cdi-controls"><label for="cdi-period">Period</label><select id="cdi-period"><option value="month" '+(period==='month'?'selected':'')+'>This month</option><option value="30" '+(period==='30'?'selected':'')+'>Last 30 days</option><option value="90" '+(period==='90'?'selected':'')+'>Last 90 days</option><option value="all" '+(period==='all'?'selected':'')+'>All available records</option></select><button id="cdi-refresh">Refresh</button></div></header>'+
 '<section class="cdi-filters">'+(role==='Admin'?selectHtml('cdi-teacher','teachers',teacherOptions,filterTeacher):'')+selectHtml('cdi-student','students',studentOptions,filterStudent)+selectHtml('cdi-subject','subjects',subjectOptions,filterSubject)+'<select id="cdi-type" aria-label="Class type"><option value="all">All class types</option><option value="Group" '+(filterType==='Group'?'selected':'')+'>Group</option><option value="Individual" '+(filterType==='Individual'?'selected':'')+'>Individual</option><option value="Special" '+(filterType==='Special'?'selected':'')+'>Special</option></select></section>'+
 '<section class="cdi-grid"><article class="cdi-card"><div class="cdi-label">Scheduled</div><div class="cdi-value">'+d.scheduled.length+'</div><div class="cdi-note">Schedule records in selected period</div></article><article class="cdi-card"><div class="cdi-label">Conducted</div><div class="cdi-value">'+x.present+'</div><div class="cdi-note">Attendance marked Present</div></article><article class="cdi-card"><div class="cdi-label">Absent</div><div class="cdi-value">'+x.absent+'</div><div class="cdi-note">Teacher available; class consumed</div></article><article class="cdi-card"><div class="cdi-label">Pending</div><div class="cdi-value">'+x.notDue+'</div><div class="cdi-note">Not yet overdue</div></article><article class="cdi-card"><div class="cdi-label">Overdue</div><div class="cdi-value">'+x.overdue+'</div><div class="cdi-note">Pending schedule date is in the past</div></article></section>'+
 '<section class="cdi-panels"><article class="cdi-panel"><h2>Teacher delivery rate</h2><div class="cdi-value">'+x.delivery+'%</div><p class="cdi-muted">(Present + Absent) ÷ (Present + Absent + Pending Overdue). Absent counts as teacher attendance.</p><div class="cdi-bars"><div><div class="cdi-bar-label"><span>Conducted</span><b>'+x.present+'</b></div><div class="cdi-track"><i style="width:'+x.delivery+'%"></i></div></div><div><div class="cdi-bar-label"><span>Overdue</span><b>'+x.overdue+'</b></div><div class="cdi-track"><i class="overdue" style="width:'+rate(x.overdue,x.present+x.overdue)+'%"></i></div></div></div></article><article class="cdi-panel"><h2>Student attendance rate</h2><div class="cdi-value">'+x.attendance+'%</div><p class="cdi-muted">Present ÷ (Present + Absent + Pending Overdue). Both Absent and Pending Overdue count against student attendance.</p><div class="cdi-bars"><div><div class="cdi-bar-label"><span>Present</span><b>'+x.present+'</b></div><div class="cdi-track"><i style="width:'+x.attendance+'%"></i></div></div><div><div class="cdi-bar-label"><span>Absent</span><b>'+x.absent+'</b></div><div class="cdi-track"><i class="absent" style="width:'+rate(x.absent,x.present+x.absent)+'%"></i></div></div></div></article></section>'+
 '<section class="cdi-panels"><article class="cdi-panel"><h2>Attendance trend · last 14 days</h2><p class="cdi-muted">Recorded attendance outcomes, independent of the selected period filter.</p>'+trendHtml(sessions.filter(s=>dateInRange(s.date)&& (filterTeacher==='all'||s.teacher_id===filterTeacher)&&(filterStudent==='all'||s.student_id===filterStudent)&&(filterSubject==='all'||s.subject_id===filterSubject)&&(filterType==='all'||s.class_type===filterType)).filter(s=>s.date>=new Date(new Date(today()+'T00:00:00').setDate(new Date(today()+'T00:00:00').getDate()-13)).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})))+'</article><article class="cdi-panel"><h2>Performance by teacher</h2><p class="cdi-muted">Teacher delivery counts Absent as teacher attendance and includes current Pending Overdue in the denominator; future Pending is excluded.</p><div class="cdi-table-wrap"><table class="cdi-table"><thead><tr><th>Teacher</th><th>Present</th><th>Absent</th><th>Overdue</th><th>Delivery</th><th>Denominator</th></tr></thead><tbody>'+ (teacherTable||'<tr><td colspan="6" class="cdi-empty">No teacher performance records.</td></tr>')+'</tbody></table></div></article></section>'+
 '<section class="cdi-panels"><article class="cdi-panel"><h2>Student attendance</h2><p class="cdi-muted">Student attendance includes Present, Absent and current Pending Overdue classes.</p><div class="cdi-table-wrap"><table class="cdi-table"><thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Overdue</th><th>Attendance</th><th>Denominator</th></tr></thead><tbody>'+ (studentTable||'<tr><td colspan="6" class="cdi-empty">No student attendance records.</td></tr>')+'</tbody></table></div></article><article class="cdi-panel"><h2>Current overdue classes</h2><p class="cdi-muted">Oldest outstanding Pending entries first.</p><div class="cdi-table-wrap"><table class="cdi-table"><thead><tr><th>Due date</th><th>Student</th><th>Teacher</th><th>Subject</th><th>Type</th></tr></thead><tbody>'+(overdueRows||'<tr><td colspan="5" class="cdi-empty">No overdue classes in this period.</td></tr>')+'</tbody></table></div></article></section>'+
 '<footer class="cdi-foot">Read-only analytics. Existing class statuses and functions are not modified. Conducted and Absent counts come from sessions.status; scheduled, Pending and Overdue counts come from scheduled_classes. The existing workflow can resolve or remove old overdue entries when attendance is recorded, so historical overdue backlog cannot be reconstructed from current schedule rows. Teacher delivery rate therefore uses current overdue entries within the selected date range, not a reconstructed historical backlog.</footer></main>';
 document.getElementById('cdi-period').addEventListener('change',e=>{period=e.target.value;render();});
 const t=document.getElementById('cdi-teacher');if(t)t.addEventListener('change',e=>{filterTeacher=e.target.value;render();});
 document.getElementById('cdi-student').addEventListener('change',e=>{filterStudent=e.target.value;render();});
 document.getElementById('cdi-subject').addEventListener('change',e=>{filterSubject=e.target.value;render();});
 document.getElementById('cdi-type').addEventListener('change',e=>{filterType=e.target.value;render();});
 document.getElementById('cdi-refresh').addEventListener('click',load);
}
async function load(){
 message('Loading class schedules and attendance…');
 const {data:{session},error:se}=await client.auth.getSession();
 if(se||!session){message('Sign in to My LIB first, then open Class Delivery Intelligence.',true);return;}
 const {data:profile,error:pe}=await client.from('profiles').select('role,linked_teacher_id,archived').eq('id',session.user.id).single();
 if(pe||!profile||profile.archived||!['Admin','Teacher'].includes(profile.role)){message('Access restricted. This report is available to active Admin and Teacher accounts only.',true);return;}
 role=profile.role;teacherId=profile.linked_teacher_id||'';
 if(role==='Teacher'&&!teacherId){message('Your teacher profile is not linked. Please contact Admin.',true);return;}
 const result=await Promise.all([
  readAll('scheduled_classes','id,date,time,student_id,teacher_id,subject_id,class_type,status,linked_session_id,created_at','date'),
  readAll('sessions','id,date,student_id,teacher_id,subject_id,class_type,status,count,created_at','date'),
  readAll('teachers','id,name,archived','name'),
  readAll('students','id,name,archived','name'),
  readAll('subjects','id,name,teacher_id','name')
 ]);
 schedules=result[0];sessions=result[1];teachers=result[2];students=result[3];subjects=result[4];
 render();
}
async function init(){
 if(!window.supabase){message('Supabase browser library did not load. Refresh and try again.',true);return;}
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 try{await load();}catch(e){message(e.message,true);}
}
init();
})();