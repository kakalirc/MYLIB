/* Student Engagement Intelligence — Admin-only, read-only analytics. */
(function(){
'use strict';
const URL='https://kqkojscbaycolaioyarh.supabase.co',KEY='sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq',root=document.getElementById('sei-app');
let db,students=[],grades=[],subjects=[],profiles=[],logins=[],schedules=[],sessions=[],enrolments=[],plans=[],homework=[],attempts=[];
let month=localMonth(),view='attention',studentView='flagged',category='all',grade='all',subject='all',search='',sort='flags',drawerId=null;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
function localMonth(){return today().slice(0,7)}
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=v=>v?new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
const dayDiff=v=>Math.floor((new Date(today()+'T00:00:00')-new Date(String(v).slice(0,10)+'T00:00:00'))/86400000);
const name=(list,id)=>{const x=list.find(z=>String(z.id)===String(id));return x?x.name:'Unknown';};
const monthName=k=>new Date(k+'-01T00:00:00').toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
async function read(table,cols,order='id'){
 let all=[],from=0;while(true){const r=await db.from(table).select(cols).order(order,{ascending:false}).range(from,from+999);if(r.error)throw new Error(table+': '+r.error.message);all=all.concat(r.data||[]);if(!r.data||r.data.length<1000)break;from+=1000;if(from>10000)throw new Error(table+' exceeded the safe read limit');}return all;
}
function msg(s,bad){root.innerHTML='<main class="sei-shell"><div class="sei-message">'+(bad?'<b>Unable to open Student Engagement Intelligence</b><br>':'')+esc(s)+'</div></main>';}
function dedupSchedules(rows){const groups=new Map();rows.forEach(x=>{const k=[x.student_id,x.subject_id,x.date,x.class_type].join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);});return [...groups.values()].map(g=>g.slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]);}
function flagsFor(s){
 const out=[],en=enrolments.filter(e=>e.student_id===s.id);
 en.forEach(e=>{
  const start=e.enrolled_at||e.created_at;if(!start||dayDiff(start)<7)return;
  const exists=plans.some(p=>p.student_id===s.id&&p.subject_id===e.subject_id);
  if(!exists)out.push({type:'Study Plan Missing',subject_id:e.subject_id,date:start,reason:'No study plan for this enrolled subject after the 7-day grace period',resolution:'Clears when a matching student + subject study plan is created'});
 });
 const sc=dedupSchedules(schedules.filter(x=>x.student_id===s.id&&x.status==='Pending'&&x.date<today()));
 sc.forEach(x=>{
  const linked=x.linked_session_id?sessions.find(z=>z.id===x.linked_session_id):null;
  if(linked&&linked.status==='Present')return;
  out.push({type:'Overdue Class',subject_id:x.subject_id,date:x.date,record:x,reason:'Scheduled date has passed and the schedule remains Pending',resolution:'Clears when marked Done, cancelled or formally rescheduled'});
 });
 const prof=profiles.find(p=>p.role==='Student'&&p.linked_student_id===s.id&&!p.archived);
 const events=prof?logins.filter(l=>l.user_id===prof.id&&l.role==='Student'&&l.event==='login').sort((a,b)=>b.created_at.localeCompare(a.created_at)):[];
 if(prof&&events.length&&dayDiff(events[0].created_at)>14)out.push({type:'Login Inactive',date:events[0].created_at,reason:'No successful Student login for more than 14 calendar days',resolution:'Clears on the next successful Student login'});
 const hw=homework.filter(h=>h.student_id===s.id);
 hw.forEach(h=>{
  if(h.due_date&&!h.submitted_at&&h.due_date<today()&&!['cancelled','void','deleted'].includes(String(h.status||'').toLowerCase()))out.push({type:'Homework Submission Overdue',subject_id:h.subject_id,date:h.due_date,record:h,reason:'Due date passed and no submission is recorded',resolution:'Clears when submitted or otherwise resolved'});
  if(h.submitted_at&&!h.reviewed_at&&dayDiff(h.submitted_at)>=2)out.push({type:'Homework Review Pending',subject_id:h.subject_id,date:h.submitted_at,record:h,reason:'Submitted homework has not been reviewed for at least 2 days',resolution:'Clears when the teacher records a review'});
 });
 return out;
}
function currentData(){
 const active=students.filter(s=>!s.archived),mapped=profiles.filter(p=>p.role==='Student'&&!p.archived&&p.linked_student_id);
 const lastLogin=new Map();mapped.forEach(p=>{const l=logins.filter(x=>x.user_id===p.id&&x.role==='Student'&&x.event==='login').sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];if(l)lastLogin.set(p.linked_student_id,l);});
 const allFlags=[];active.forEach(s=>{const fs=flagsFor(s);if(fs.length)allFlags.push({student:s,flags:fs});});
 const past=schedules.filter(x=>x.status==='Pending'&&x.date<today());
 const overdue=dedupSchedules(past).filter(x=>{const linked=x.linked_session_id?sessions.find(z=>z.id===x.linked_session_id):null;return !(linked&&linked.status==='Present');});
 const three=[];for(let i=2;i>=0;i--){const d=new Date(month+'-01T00:00:00');d.setMonth(d.getMonth()-i);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const ss=sessions.filter(x=>String(x.date).slice(0,7)===k);const present=ss.filter(x=>x.status==='Present').length,absent=ss.filter(x=>x.status==='Absent').length;three.push({key:k,present,absent,missing:ss.filter(x=>!['Present','Absent'].includes(x.status)).length,rate:present+absent?Math.round(present/(present+absent)*100):null});}
 const six=[];for(let i=5;i>=0;i--){const d=new Date(month+'-01T00:00:00');d.setMonth(d.getMonth()-i);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const ids=new Set(logins.filter(l=>l.role==='Student'&&l.event==='login'&&String(l.created_at).slice(0,7)===k).map(l=>l.user_id));six.push({key:k,events:logins.filter(l=>l.role==='Student'&&l.event==='login'&&String(l.created_at).slice(0,7)===k).length,students:ids.size});}
 const selected=logins.filter(l=>l.role==='Student'&&l.event==='login'&&String(l.created_at).slice(0,7)===month);
 const monthIds=new Set(selected.map(l=>l.user_id));
 const inactiveInMonth=mapped.filter(p=>!monthIds.has(p.id)&&lastLogin.has(p.linked_student_id)).length;
 const loginMonthStudents=monthIds.size;
 const dq=[];
 past.forEach(x=>{const linked=x.linked_session_id?sessions.find(z=>z.id===x.linked_session_id):null;if(linked&&linked.status==='Present')dq.push({type:'Pending schedule linked to Present session',id:x.id,detail:name(students,x.student_id)+' · '+dateText(x.date)});});
 schedules.filter(x=>!x.date).forEach(x=>dq.push({type:'Scheduled class missing date',id:x.id,detail:'Schedule '+x.id}));
 const dupe=new Map();schedules.filter(x=>x.status==='Pending').forEach(x=>{const k=[x.student_id,x.subject_id,x.date,x.class_type].join('|');dupe.set(k,(dupe.get(k)||0)+1);});dupe.forEach((n,k)=>{if(n>1)dq.push({type:'Potential duplicate pending schedules',id:k,detail:n+' records share student, subject, date and class type'});});
 return {active,mapped,lastLogin,flags:allFlags,overdue,three,six,selected,loginMonthStudents,inactiveInMonth,dq};
}
function filteredFlags(d){
 let rows=d.flags.filter(x=>(category==='all'||x.flags.some(f=>f.type===category))&&(grade==='all'||String(x.student.grade_id)===grade)&&(subject==='all'||x.flags.some(f=>String(f.subject_id)===subject))&&(!search||x.student.name.toLowerCase().includes(search.toLowerCase())||String(x.student.student_code||'').toLowerCase().includes(search.toLowerCase())));
 if(sort==='flags')rows.sort((a,b)=>b.flags.length-a.flags.length);else if(sort==='overdue')rows.sort((a,b)=>b.flags.filter(f=>f.type==='Overdue Class').length-a.flags.filter(f=>f.type==='Overdue Class').length);else if(sort==='login')rows.sort((a,b)=>{const la=d.lastLogin.get(a.student.id),lb=d.lastLogin.get(b.student.id);return (la?new Date(la.created_at).getTime():0)-(lb?new Date(lb.created_at).getTime():0)});else rows.sort((a,b)=>a.student.name.localeCompare(b.student.name));
 return rows;
}
function kpi(label,value,note){return '<article class="sei-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>';}
function bar(label,value,max,red){return '<div><div class="sei-bar-label"><span>'+esc(label)+'</span><b>'+value+'</b></div><div class="sei-track"><i class="'+(red?'red':'')+'" style="width:'+(max?Math.max(value?2:0,value/max*100):0)+'%"></i></div></div>';}
function render(){
 const d=currentData(),flags=filteredFlags(d),overdueStudents=new Set(d.overdue.map(x=>x.student_id)),monthEvents=d.selected.length;
 const cur=String(month),byMonth=d.six.map(x=>'<div class="sei-month"><b>'+x.events+'</b><i style="height:'+Math.max(1,x.events/Math.max(1,...d.six.map(z=>z.events))*90)+'px"></i><span>'+monthName(x.key)+'</span></div>').join('');
 const attendanceBars=d.three.map(x=>'<div><div class="sei-bar-label"><span>'+monthName(x.key)+' · '+(x.rate===null?'Insufficient data':x.rate+'%')+'</span><b>'+x.present+' present / '+x.absent+' absent</b></div><div class="sei-track"><i style="width:'+(x.rate===null?0:x.rate)+'%"></i></div><small class="sei-muted">Missing attendance records: '+x.missing+'</small></div>').join('');
 const list=(studentView==='flagged'?flags:d.active.map(s=>({student:s,flags:flagsFor(s)}))).filter(x=>(grade==='all'||String(x.student.grade_id)===grade)&&(!search||x.student.name.toLowerCase().includes(search.toLowerCase())||String(x.student.student_code||'').toLowerCase().includes(search.toLowerCase())));
 const studentRows=list.map(x=>'<tr><td><button class="sei-link" data-student="'+esc(x.student.id)+'">'+esc(x.student.name)+'</button><small style="display:block;color:#737b80">'+esc(x.student.student_code||'')+'</small></td><td>'+esc(name(grades,x.student.grade_id))+'</td><td>'+x.flags.length+'</td><td>'+x.flags.filter(f=>f.type==='Overdue Class').length+'</td><td>'+x.flags.filter(f=>f.type==='Login Inactive').length+'</td><td>'+x.flags.map(f=>'<span class="sei-flag">'+esc(f.type)+'</span>').join(' ')+'</td></tr>').join('');
 const currentOverdue=d.overdue.map(x=>'<tr><td>'+dateText(x.date)+'</td><td><button class="sei-link" data-student="'+esc(x.student_id)+'">'+esc(name(students,x.student_id))+'</button></td><td>'+esc(name(subjects,x.subject_id))+'</td><td>'+esc(x.status)+'</td></tr>').join('');
 const gradeOpts=grades.map(g=>'<option value="'+esc(g.id)+'" '+(grade===g.id?'selected':'')+'>'+esc(g.name)+'</option>').join('');
 const subjectOpts=subjects.map(s=>'<option value="'+esc(s.id)+'" '+(subject===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join('');
 const loginUnavailable=d.mapped.length-d.lastLogin.size;
 const homeworkSubmitted=homework.filter(h=>h.submitted_at).length,hwAssigned=homework.length,homeworkReview=homework.filter(h=>h.submitted_at&&!h.reviewed_at&&dayDiff(h.submitted_at)>=2).length,studyPlanMissing=enrolments.filter(e=>{const start=e.enrolled_at||e.created_at;return start&&dayDiff(start)>=7&&!plans.some(p=>p.student_id===e.student_id&&p.subject_id===e.subject_id);}).length;
 root.innerHTML='<main class="sei-shell"><header class="sei-head"><div><div class="sei-eyebrow">LIB EDUCATION · ADMIN ANALYTICS</div><h1>Student Engagement Intelligence</h1><p>Read-only operational view of attendance, overdue classes, login activity and learning activity.</p></div><button id="sei-refresh">Refresh data</button></header>'+
 '<section class="sei-filters"><label>Month<input type="month" id="sei-month" value="'+esc(month)+'" max="'+today().slice(0,7)+'"></label><label>Grade<select id="sei-grade"><option value="all">All grades</option>'+gradeOpts+'</select></label><label>Subject<select id="sei-subject"><option value="all">All subjects</option>'+subjectOpts+'</select></label><label>Student search<input id="sei-search" placeholder="Name or Student ID" value="'+esc(search)+'"></label></section>'+
 '<section class="sei-kpis">'+kpi('Active students',d.active.length,'Non-archived student records')+kpi('Students needing attention',d.flags.length,'Current independent flags')+kpi('Currently overdue classes',d.overdue.length,'Pending schedules before today')+kpi('Student logins · '+monthName(cur),monthEvents,'Successful Student login events')+'</section>'+
 '<div class="sei-tabs"><button data-view="attention" class="'+(view==='attention'?'active':'')+'">Students Needing Attention</button><button data-view="attendance" class="'+(view==='attendance'?'active':'')+'">Attendance</button><button data-view="overdue" class="'+(view==='overdue'?'active':'')+'">Overdue Classes</button><button data-view="login" class="'+(view==='login'?'active':'')+'">Login Activity</button><button data-view="learning" class="'+(view==='learning'?'active':'')+'">Learning Activities</button><button data-view="quality" class="'+(view==='quality'?'active':'')+'">Data Quality Checks</button></div>'+
 (view==='attention'?'<section class="sei-panel"><div class="sei-section-head"><div><h2>Students Needing Attention</h2><p class="sei-muted">Flags are calculated from current records and clear automatically when the underlying condition resolves.</p></div><span class="sei-chip">'+flags.length+' students flagged</span></div><div class="sei-filters"><label>View<select id="sei-student-view"><option value="flagged" '+(studentView==='flagged'?'selected':'')+'>Only students with current flags</option><option value="all" '+(studentView==='all'?'selected':'')+'>All active students</option></select></label><label>Attention category<select id="sei-category"><option value="all">All categories</option>'+['Overdue Class','Login Inactive','Study Plan Missing','Homework Submission Overdue','Homework Review Pending'].map(x=>'<option '+(category===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label>Sort<select id="sei-sort">'+[['flags','Number of flags'],['overdue','Overdue class count'],['login','Login inactivity'],['name','Student name']].map(x=>'<option value="'+x[0]+'" '+(sort===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select></label></div><div class="sei-table-wrap"><table class="sei-table"><thead><tr><th>Student</th><th>Grade</th><th>Flags</th><th>Overdue</th><th>Login</th><th>Current flags</th></tr></thead><tbody>'+(studentRows||'<tr><td colspan="6" class="sei-empty">No students match this view.</td></tr>')+'</tbody></table></div></section>':
 view==='attendance'?'<section class="sei-panel"><h2>Attendance · 3-month trend</h2><p class="sei-muted">Attendance rate = Present ÷ (Present + Absent). Missing or other status records are shown separately and are not treated as absence.</p>'+attendanceBars+'</section>':
 view==='overdue'?'<section class="sei-panel"><h2>Currently overdue classes</h2><p class="sei-muted">Pending scheduled classes dated before today. Completed, cancelled and formally rescheduled records are not included. A linked Present session suppresses the flag.</p><div class="sei-kpis">'+kpi('Overdue classes',d.overdue.length,'Current snapshot')+kpi('Affected students',overdueStudents.size,'Distinct students')+'</div><div class="sei-table-wrap"><table class="sei-table"><thead><tr><th>Scheduled date</th><th>Student</th><th>Subject</th><th>Status</th></tr></thead><tbody>'+(currentOverdue||'<tr><td colspan="4" class="sei-empty">No currently overdue classes.</td></tr>')+'</tbody></table></div></section>':
 view==='login'?'<section class="sei-grid"><article class="sei-panel"><h2>Login activity · '+monthName(cur)+'</h2><p class="sei-muted">Only login_log event = login and role = Student are counted.</p>'+kpi('Active students logged in',d.loginMonthStudents,'Distinct Student accounts with a login event')+kpi('Successful login events',monthEvents,'Events in selected month')+kpi('No login in selected month',d.inactiveInMonth,'Active Student accounts')+(loginUnavailable?'<div class="sei-warn">'+loginUnavailable+' active Student accounts have no login history in the available log. These are not classified as currently inactive.</div>':'')+'</article><article class="sei-panel"><h2>Six-month login trend</h2><p class="sei-muted">Monthly successful Student login events.</p><div class="sei-trend">'+byMonth+'</div></article></section>':
 view==='learning'?'<section class="sei-grid"><article class="sei-panel"><h2>Study Plans</h2>'+kpi('Recorded study plans',plans.length,'Existing study_plan records')+kpi('Enrolled student-subjects',enrolments.length,'Current enrolment rows')+kpi('Missing after grace period',studyPlanMissing,'Student-subjects enrolled at least 7 days')+'<div class="sei-warn">Plan coverage is assessed by exact student + subject match. Counts are current snapshots; no reliable six-month history is available.</div></article><article class="sei-panel"><h2>Homework</h2>'+kpi('Assigned homework',hwAssigned,'Existing homework records')+kpi('Submitted',homeworkSubmitted,'Records with submitted_at')+kpi('Overdue unsubmitted',homework.filter(h=>h.due_date&&!h.submitted_at&&h.due_date<today()).length,'Due date passed; no submission')+kpi('Awaiting teacher review',homeworkReview,'Submitted at least 2 days ago')+'<div class="sei-warn">Current record volume is small. Treat these as operational counts, not trend metrics.</div></article><article class="sei-panel"><h2>Knowledge Arena</h2><div class="sei-warn">Attempt data is unavailable to this Admin dashboard under current database read policies. Stage 1 does not change RLS, and no participation count is inferred.</div><p class="sei-muted">KA remains informational only; non-participation does not create an attention flag.</p></article></section>':
 '<section class="sei-panel"><h2>Data Quality Checks</h2><p class="sei-muted">Read-only exceptions detected from current records. Nothing is corrected automatically.</p><div class="sei-kpi"><span>Exceptions</span><strong>'+d.dq.length+'</strong><small>Current checks only</small></div><div class="sei-table-wrap"><table class="sei-table"><thead><tr><th>Check</th><th>Record</th><th>Details</th></tr></thead><tbody>'+(d.dq.map(x=>'<tr><td>'+esc(x.type)+'</td><td>'+esc(String(x.id).slice(0,14))+'</td><td>'+esc(x.detail)+'</td></tr>').join('')||'<tr><td colspan="3" class="sei-empty">No exceptions detected by the current checks.</td></tr>')+'</tbody></table></div><div class="sei-warn">Potential duplicate schedules are surfaced for investigation only. No record is merged, changed or deleted.</div></section>')+
 '<footer class="sei-foot">Read-only · Admin-only · Existing Supabase tables only. Student login activity uses successful login events only. Where login history is absent, the dashboard reports unavailable history rather than assuming inactivity. Learning activity trends are not shown where the available history is insufficient.</footer></main>';
 root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();}));
 ['sei-month','sei-grade','sei-subject','sei-search'].forEach(id=>{const el=document.getElementById(id);el.addEventListener(id==='sei-search'?'input':'change',e=>{if(id==='sei-month')month=e.target.value;if(id==='sei-grade')grade=e.target.value;if(id==='sei-subject')subject=e.target.value;if(id==='sei-search')search=e.target.value;render();});});
 const sv=document.getElementById('sei-student-view');if(sv)sv.addEventListener('change',e=>{studentView=e.target.value;render();});
 const cat=document.getElementById('sei-category');if(cat)cat.addEventListener('change',e=>{category=e.target.value;render();});
 const so=document.getElementById('sei-sort');if(so)so.addEventListener('change',e=>{sort=e.target.value;render();});
 root.querySelectorAll('[data-student]').forEach(b=>b.addEventListener('click',()=>openDrawer(b.dataset.student)));
 document.getElementById('sei-refresh').addEventListener('click',load);
 if(drawerId)openDrawer(drawerId);
}
function openDrawer(id){
 drawerId=id;const s=students.find(x=>x.id===id);if(!s)return;const fs=flagsFor(s),en=enrolments.filter(e=>e.student_id===id),prof=profiles.find(p=>p.role==='Student'&&p.linked_student_id===id&&!p.archived),logs=prof?logins.filter(l=>l.user_id===prof.id&&l.role==='Student'&&l.event==='login').sort((a,b)=>b.created_at.localeCompare(a.created_at)):[],hw=homework.filter(h=>h.student_id===id),ka=attempts.filter(a=>a.user_id===prof?.id);
 const row=(a,b)=>'<div class="sei-detail-row"><span>'+esc(a)+'</span><b>'+esc(b)+'</b></div>';
 const flags=fs.map(f=>'<div class="sei-detail-section"><h3>'+esc(f.type)+'</h3>'+row('Subject',name(subjects,f.subject_id)) +row('Trigger date',dateText(f.date))+'<p class="sei-muted">'+esc(f.reason)+'</p><p class="sei-muted"><b>Resolution:</b> '+esc(f.resolution)+'</p></div>').join('');
 const subjectsHtml=en.map(e=>'<div class="sei-detail-row"><span>'+esc(name(subjects,e.subject_id))+'</span><b>'+(plans.some(p=>p.student_id===id&&p.subject_id===e.subject_id)?'Study plan recorded':'No matching study plan')+'</b></div>').join('');
 const drawer=document.createElement('div');drawer.className='sei-drawer-backdrop';drawer.id='sei-drawer';drawer.innerHTML='<aside class="sei-drawer"><div class="sei-drawer-head"><div><div class="sei-eyebrow">STUDENT DETAIL · READ ONLY</div><h2>'+esc(s.name)+'</h2><p class="sei-muted">'+esc(s.student_code||'')+' · '+esc(name(grades,s.grade_id))+'</p></div><button class="sei-close" id="sei-close">Close</button></div><section class="sei-detail-section"><h3>Current attention flags ('+fs.length+')</h3>'+(flags||'<p class="sei-muted">No current attention flags.</p>')+'</section><section class="sei-detail-section"><h3>Subject-wise overview</h3>'+(subjectsHtml||'<p class="sei-muted">No active subject enrolments found.</p>')+'</section><section class="sei-detail-section"><h3>Class delivery</h3>'+row('Scheduled classes',schedules.filter(x=>x.student_id===id).length)+row('Present sessions',sessions.filter(x=>x.student_id===id&&x.status==='Present').length)+row('Absent sessions',sessions.filter(x=>x.student_id===id&&x.status==='Absent').length)+row('Currently overdue',schedules.filter(x=>x.student_id===id&&x.status==='Pending'&&x.date<today()).length)+'</section><section class="sei-detail-section"><h3>Homework</h3>'+(hw.map(h=>'<div class="sei-detail-row"><span>'+esc(h.title||'Homework')+' · '+dateText(h.due_date)+'</span><b>'+esc(h.status||'Assigned')+'</b></div>').join('')||'<p class="sei-muted">No homework records.</p>')+'</section><section class="sei-detail-section"><h3>Knowledge Arena</h3><p class="sei-muted">Attempt data is unavailable to this Admin dashboard under current read policies. No participation status is inferred.</p></section><section class="sei-detail-section"><h3>Login history</h3>'+row('Last successful Student login',logs.length?new Date(logs[0].created_at).toLocaleString('en-IN'):'Login history unavailable')+row('Available login events',logs.length)+'</section><p class="sei-foot">This panel is read-only. Existing source record navigation is not exposed here because a verified deep-link route is not available for all record types.</p></aside>';
 document.getElementById('sei-drawer')?.remove();document.body.appendChild(drawer);drawer.addEventListener('click',e=>{if(e.target===drawer||e.target.id==='sei-close'){drawer.remove();drawerId=null;}});
}
async function load(){
 msg('Loading student engagement records…');
 const {data:{session},error:se}=await db.auth.getSession();if(se||!session){msg('Sign in to My LIB first, then open Student Engagement Intelligence.',true);return;}
 const {data:p,error:pe}=await db.from('profiles').select('role,archived').eq('id',session.user.id).single();
 if(pe||!p||p.archived||p.role!=='Admin'){msg('Access restricted. Student Engagement Intelligence is available to active Admin accounts only.',true);return;}
 const cols=[
  ['students','id,name,archived,student_code,grade_id,created_at','name'],
  ['grades','id,name,archived','name'],
  ['subjects','id,name','name'],
  ['profiles','id,role,linked_student_id,archived','id'],
  ['login_log','id,user_id,username,role,event,created_at','created_at'],
  ['scheduled_classes','id,date,student_id,teacher_id,subject_id,class_type,status,linked_session_id,created_at','date'],
  ['sessions','id,date,student_id,teacher_id,subject_id,class_type,status','date'],
  ['student_subjects','id,student_id,subject_id,enrolled_at,created_at','created_at'],
  ['study_plans','id,student_id,subject_id,created_at,updated_at','updated_at'],
  ['homework','id,student_id,subject_id,title,due_date,assigned_date,status,submitted_at,reviewed_at,created_at,updated_at','created_at'],
  // KA attempts are omitted because current RLS permits owner-only reads, not Admin reads.
 ];
 const results=await Promise.all(cols.map(x=>read(x[0],x[1],x[2])));
 [students,grades,subjects,profiles,logins,schedules,enrolments,plans,homework]=results;attempts=[];
 render();
}
async function init(){if(!window.supabase){msg('Supabase client did not load.',true);return;}db=window.supabase.createClient(URL,KEY);try{await load();}catch(e){msg(e.message,true);}}
init();
})();