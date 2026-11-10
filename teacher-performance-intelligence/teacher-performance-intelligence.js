/* Teacher Performance Intelligence — read-only analytics. No class or attendance mutations. */
(function () {
'use strict';
const SUPABASE_URL='https://kqkojscbaycolaioyarh.supabase.co';
const SUPABASE_KEY='sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq';
const root=document.getElementById('tpi-app');
let client,role='',teacherId='',teachers=[],students=[],subjects=[],schedules=[],sessions=[];
let period='month',startDate='',endDate='',filterTeacher='all',filterStudent='all',filterSubject='all',filterType='all',sortKey='delivery',sortDir='desc';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const dateText=v=>v?new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
const nameOf=(list,id)=>{const x=list.find(v=>String(v.id)===String(id));return x?x.name:'Unknown';};
const unique=a=>[...new Set(a.filter(Boolean).map(String))];
function showMessage(s,bad){root.innerHTML='<main class="tpi-shell"><div class="tpi-message">'+(bad?'<b>Unable to open Teacher Performance Intelligence</b><br>':'')+esc(s)+'</div></main>';}
async function readAll(table,columns,orderField){
 let out=[],start=0;
 while(true){
  const {data,error}=await client.from(table).select(columns).order(orderField,{ascending:false}).order('id',{ascending:true}).range(start,start+999);
  if(error)throw new Error('Could not load '+table+': '+error.message);
  out=out.concat(data||[]);if(!data||data.length<1000)break;start+=1000;
  if(start>20000)throw new Error(table+' exceeded the safety limit. Please narrow the period.');
 }
 return out;
}
function periodBounds(){
 const end=today();if(period==='all')return {from:'0000-01-01',to:'9999-12-31'};
 if(period==='custom')return {from:startDate||end,to:endDate||end};
 if(period==='month')return {from:end.slice(0,7)+'-01',to:end};
 const d=new Date(end+'T00:00:00');d.setDate(d.getDate()-(Number(period)-1));
 return {from:d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),to:end};
}
function inRange(v,b){const d=String(v||'').slice(0,10);return d&&d>=b.from&&d<=b.to;}
function selectedData(){
 const b=periodBounds();
 const match=r=>inRange(r.date,b)&&
  (filterTeacher==='all'||String(r.teacher_id)===String(filterTeacher))&&
  (filterStudent==='all'||String(r.student_id)===String(filterStudent))&&
  (filterSubject==='all'||String(r.subject_id)===String(filterSubject))&&
  (filterType==='all'||String(r.class_type)===filterType);
 const sc=schedules.filter(match),ss=sessions.filter(match);
 const present=ss.filter(x=>x.status==='Present'),absent=ss.filter(x=>x.status==='Absent');
 const pending=sc.filter(x=>x.status==='Pending'),overdue=pending.filter(x=>String(x.date).slice(0,10)<today()),future=pending.filter(x=>String(x.date).slice(0,10)>=today());
 return {bounds:b,sc,ss,present,absent,pending,overdue,future};
}
const pct=(a,b)=>b?Math.round(a/b*100):null;
function aggregate(d){
 const map=new Map();
 const ensure=id=>{
  const key=String(id||'unassigned');
  if(!map.has(key))map.set(key,{id:key,name:nameOf(teachers,id),scheduled:0,present:0,absent:0,pending:0,overdue:0,students:new Set(),group:0,individual:0,subjects:new Set()});
  return map.get(key);
 };
 d.sc.forEach(s=>{const x=ensure(s.teacher_id);x.scheduled++;if(s.student_id)x.students.add(String(s.student_id));if(s.subject_id)x.subjects.add(String(s.subject_id));if(s.status==='Pending'){x.pending++;if(String(s.date).slice(0,10)<today())x.overdue++;}if(s.class_type==='Group')x.group++;if(s.class_type==='Individual')x.individual++;});
 d.present.forEach(s=>{const x=ensure(s.teacher_id);x.present++;if(s.student_id)x.students.add(String(s.student_id));if(s.subject_id)x.subjects.add(String(s.subject_id));});
 d.absent.forEach(s=>{const x=ensure(s.teacher_id);x.absent++;if(s.student_id)x.students.add(String(s.student_id));if(s.subject_id)x.subjects.add(String(s.subject_id));});
 return [...map.values()].map(x=>({...x,studentCount:x.students.size,delivery:pct(x.present,x.present+x.overdue),attendance:pct(x.present,x.present+x.absent)}));
}
function studentRows(d){
 const map=new Map();
 const ensure=id=>{const k=String(id||'unknown');if(!map.has(k))map.set(k,{id:k,name:nameOf(students,id),present:0,absent:0,scheduled:0,subjects:new Set()});return map.get(k);};
 d.sc.forEach(s=>{const x=ensure(s.student_id);x.scheduled++;if(s.subject_id)x.subjects.add(String(s.subject_id));});
 d.present.forEach(s=>ensure(s.student_id).present++);
 d.absent.forEach(s=>ensure(s.student_id).absent++);
 return [...map.values()].map(x=>({...x,attendance:pct(x.present,x.present+x.absent),subjectCount:x.subjects.size})).sort((a,b)=>(a.attendance??-1)-(b.attendance??-1));
}
function monthKey(v){return String(v||'').slice(0,7);}
function trendData(){
 const end=new Date(today()+'T00:00:00');const from=new Date(end.getFullYear(),end.getMonth()-5,1).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const match=x=>(filterTeacher==='all'||String(x.teacher_id)===String(filterTeacher))&&(filterStudent==='all'||String(x.student_id)===String(filterStudent))&&(filterSubject==='all'||String(x.subject_id)===String(filterSubject))&&(filterType==='all'||String(x.class_type)===filterType);
 const ss=sessions.filter(x=>String(x.date).slice(0,10)>=from&&match(x));
 const overdue=schedules.filter(x=>x.status==='Pending'&&String(x.date).slice(0,10)>=from&&String(x.date).slice(0,10)<today()&&match(x));
 const scheduled=schedules.filter(x=>String(x.date).slice(0,10)>=from&&match(x));
 return {present:ss.filter(x=>x.status==='Present'),absent:ss.filter(x=>x.status==='Absent'),overdue,scheduled};
}
function monthTrend(d){
 const keys=[];const end=new Date(today()+'T00:00:00');
 for(let i=5;i>=0;i--){const x=new Date(end.getFullYear(),end.getMonth()-i,1);keys.push(x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'));}
 return keys.map(k=>{const p=d.present.filter(x=>monthKey(x.date)===k).length,a=d.absent.filter(x=>monthKey(x.date)===k).length,o=d.overdue.filter(x=>monthKey(x.date)===k).length,scheduled=d.scheduled.filter(x=>monthKey(x.date)===k).length;return {key:k,label:new Date(k+'-01T00:00:00').toLocaleDateString('en-IN',{month:'short'}),present:p,absent:a,overdue:o,scheduled};});
}
function barChart(rows,key,label){
 const max=Math.max(1,...rows.map(x=>x[key]||0));
 if(!rows.length)return '<p class="tpi-empty">No data for this period.</p>';
 return '<div class="tpi-bars">'+rows.map(x=>'<div class="tpi-bar-row"><div><span>'+esc(x.name||x.label)+'</span><b>'+esc(x[key]||0)+'</b></div><div class="tpi-track"><i style="width:'+Math.max(0,(x[key]||0)/max*100)+'%"></i></div></div>').join('')+'</div>';
}
function trendChart(rows){
 const max=Math.max(1,...rows.map(x=>x.present+x.absent));
 return '<div class="tpi-trend">'+rows.map(x=>'<div class="tpi-trend-col"><b>'+(x.present+x.absent||'')+'</b><div class="tpi-stack"><i style="height:'+(x.present/max*100)+'%"></i><i class="absent" style="height:'+(x.absent/max*100)+'%"></i></div><span>'+esc(x.label)+'</span></div>').join('')+'</div><div class="tpi-legend"><span><i></i>Present</span><span class="absent"><i></i>Absent</span></div>';
}
function sortRows(rows){
 return rows.slice().sort((a,b)=>{let x=a[sortKey],y=b[sortKey];if(x==null)x=-1;if(y==null)y=-1;if(typeof x==='string')return sortDir==='asc'?x.localeCompare(y):y.localeCompare(x);return sortDir==='asc'?x-y:y-x;});
}
function teacherTable(rows){
 const cols=[['name','Teacher'],['scheduled','Scheduled'],['present','Conducted'],['absent','Absent'],['pending','Pending'],['overdue','Overdue'],['studentCount','Students'],['delivery','Delivery rate'],['attendance','Student attendance']];
 return '<div class="tpi-table-wrap"><table><thead><tr>'+cols.map(([k,l])=>'<th><button type="button" data-sort="'+k+'">'+l+(sortKey===k?(sortDir==='asc'?' ↑':' ↓'):'')+'</button></th>').join('')+'</tr></thead><tbody>'+(rows.length?sortRows(rows).map(x=>'<tr><td><button class="tpi-link" type="button" data-teacher="'+esc(x.id)+'">'+esc(x.name)+'</button></td><td>'+x.scheduled+'</td><td>'+x.present+'</td><td>'+x.absent+'</td><td>'+x.pending+'</td><td>'+x.overdue+'</td><td>'+x.studentCount+'</td><td>'+(x.delivery==null?'—':x.delivery+'%')+'</td><td>'+(x.attendance==null?'—':x.attendance+'%')+'</td></tr>').join(''):'<tr><td colspan="9" class="tpi-empty">No teacher activity in this period.</td></tr>')+'</tbody></table></div>';
}
function render(){
 const d=selectedData(),rows=aggregate(d),studentsData=studentRows(d);
 const own=role==='Teacher'?rows.find(x=>String(x.id)===String(teacherId)):null;
 const active=role==='Admin'?unique([...d.sc,...d.ss].map(x=>x.teacher_id)).length:studentsData.length;
 const delivery=pct(d.present.length,d.present.length+d.overdue.length),attendance=pct(d.present.length,d.present.length+d.absent.length);
 const workload=rows.slice().sort((a,b)=>b.scheduled-a.scheduled);
 const trends=monthTrend(trendData());
 const teacherSelect=role==='Admin'?'<label>Teacher<select id="tpi-teacher"><option value="all">All teachers</option>'+teachers.filter(t=>!t.archived).sort((a,b)=>a.name.localeCompare(b.name)).map(t=>'<option value="'+esc(t.id)+'" '+(String(filterTeacher)===String(t.id)?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>':'';
 const opts=(id,label,items,val)=>'<label>'+label+'<select id="'+id+'"><option value="all">All '+label.toLowerCase()+'</option>'+items.filter(x=>!x.archived).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>'<option value="'+esc(x.id)+'" '+(String(val)===String(x.id)?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>';
 const studentSelect=opts('tpi-student','Student',students,filterStudent),subjectSelect=opts('tpi-subject','Subject',subjects,filterSubject);
 const classSelect='<label>Class type<select id="tpi-type"><option value="all">All types</option><option value="Group" '+(filterType==='Group'?'selected':'')+'>Group</option><option value="Individual" '+(filterType==='Individual'?'selected':'')+'>Individual</option></select></label>';
 const periodSelect='<label>Period<select id="tpi-period"><option value="month" '+(period==='month'?'selected':'')+'>Current month</option><option value="30" '+(period==='30'?'selected':'')+'>Last 30 days</option><option value="90" '+(period==='90'?'selected':'')+'>Last 90 days</option><option value="custom" '+(period==='custom'?'selected':'')+'>Custom range</option><option value="all" '+(period==='all'?'selected':'')+'>All available records</option></select></label>';
 const custom=period==='custom'?'<label>From<input type="date" id="tpi-from" value="'+esc(startDate)+'"></label><label>To<input type="date" id="tpi-to" value="'+esc(endDate)+'"></label><button type="button" id="tpi-apply">Apply</button>':'';
 const kpis='<section class="tpi-kpis">'+[['Classes conducted',d.present.length,'Present sessions'],['Classes scheduled',d.sc.length,'Schedule records in range'],['Current overdue',d.overdue.length,'Pending schedule rows dated before today'],['Delivery rate',delivery==null?'—':delivery+'%','Present ÷ (Present + current overdue)'],['Student attendance',attendance==null?'—':attendance+'%','Present ÷ (Present + Absent)'],[role==='Admin'?'Active teachers':'Active students',active,role==='Admin'?'Teachers with activity in range':'Students with activity in range']].map(x=>'<article><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></article>').join('')+'</section>';
 const detailTeacher=role==='Admin'&&filterTeacher!=='all'?rows.find(x=>String(x.id)===String(filterTeacher)):own;
 const teacherStudents=role==='Teacher'||filterTeacher!=='all'?studentsData:'';
 root.innerHTML='<main class="tpi-shell"><header class="tpi-header"><div><div class="tpi-eyebrow">LIB EDUCATION · '+(role==='Admin'?'ADMIN':'TEACHER')+' ANALYTICS</div><h1>Teacher Performance Intelligence</h1><p>'+(role==='Admin'?'Organisation-wide teacher delivery, attendance and workload analysis.':'Your teaching delivery, workload and student engagement.')+'</p></div><button type="button" id="tpi-refresh">Refresh</button></header><section class="tpi-filters">'+periodSelect+custom+teacherSelect+studentSelect+subjectSelect+classSelect+'</section>'+kpis+
 (role==='Admin'?'<section class="tpi-panel"><div class="tpi-section-head"><div><h2>Teacher comparison</h2><p>Sort by any column. Select a teacher to inspect their detailed report.</p></div></div>'+teacherTable(rows)+'</section>':'')+
 '<section class="tpi-panels"><article class="tpi-panel"><h2>'+(role==='Admin'?'Workload distribution':'My workload')+'</h2><p>Scheduled classes by teacher, including completed and pending schedule rows.</p>'+barChart(role==='Admin'?workload.slice(0,12):[{name:'My scheduled classes',scheduled:d.sc.length}],'scheduled','Scheduled')+'</article><article class="tpi-panel"><h2>'+(role==='Admin'?'Students handled':'My students')+'</h2><div class="tpi-big">'+(detailTeacher?detailTeacher.studentCount:studentsData.length)+'</div><p>Distinct students with a schedule or attendance record in the selected period.</p><div class="tpi-mini-stats"><span>Group classes <b>'+(detailTeacher?detailTeacher.group:d.sc.filter(x=>x.class_type==='Group').length)+'</b></span><span>Individual classes <b>'+(detailTeacher?detailTeacher.individual:d.sc.filter(x=>x.class_type==='Individual').length)+'</b></span></div></article></section>'+
 '<section class="tpi-panels"><article class="tpi-panel"><h2>Monthly delivery and attendance</h2><p>Last six calendar months, using recorded Present and Absent sessions.</p>'+trendChart(trends)+'</article><article class="tpi-panel"><h2>Monthly delivery rate</h2><p>Delivery rate uses Present plus current overdue records for the corresponding month.</p>'+barChart(trends.map(x=>({name:x.label,rate:pct(x.present,x.present+x.overdue)??0})),'rate','Rate')+'</article></section><section class="tpi-panel"><h2>Monthly workload trend</h2><p>Scheduled classes in the last six calendar months, independent of the selected summary period.</p>'+barChart(trends.map(x=>({name:x.label,scheduled:x.scheduled})),'scheduled','Scheduled')+'</section>'+
 (role==='Admin'?'<section class="tpi-panel"><h2>Student engagement by teacher selection</h2><p>Select a teacher above to see their students. Without a teacher selected, the table is organisation-wide.</p>'+studentTableHtml(studentsData)+'</section>':'<section class="tpi-panel"><h2>My student engagement</h2><p>Attendance is calculated from recorded Present and Absent sessions.</p>'+studentTableHtml(studentsData)+'</section>')+
 '<section class="tpi-panel"><h2>'+(role==='Admin'?'Current overdue classes':'My current overdue classes')+'</h2><div class="tpi-table-wrap"><table><thead><tr><th>Due date</th><th>Student</th><th>Teacher</th><th>Subject</th><th>Class type</th></tr></thead><tbody>'+(d.overdue.length?d.overdue.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,50).map(s=>'<tr><td>'+dateText(s.date)+'</td><td>'+esc(nameOf(students,s.student_id))+'</td><td>'+esc(nameOf(teachers,s.teacher_id))+'</td><td>'+esc(nameOf(subjects,s.subject_id))+'</td><td>'+esc(s.class_type)+'</td></tr>').join(''):'<tr><td colspan="5" class="tpi-empty">No current overdue classes in this period.</td></tr>')+'</tbody></table></div></section>'+
 '<footer class="tpi-foot">Read-only analytics. Existing attendance and schedule records only. Absent means the teacher was available and the class remains consumed under existing rules. Teacher delivery rate excludes Absent and future Pending classes. When an overdue class is completed, the existing workflow updates its date and status; this dashboard does not alter that behaviour or reconstruct historical overdue records. A dash means the metric has no denominator.</footer></main>';
 bind();
 function studentTableHtml(list){return '<div class="tpi-table-wrap"><table><thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Scheduled</th><th>Attendance</th><th>Subjects</th></tr></thead><tbody>'+(list.length?list.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+s.present+'</td><td>'+s.absent+'</td><td>'+s.scheduled+'</td><td>'+(s.attendance==null?'—':s.attendance+'%')+'</td><td>'+s.subjectCount+'</td></tr>').join(''):'<tr><td colspan="6" class="tpi-empty">No student records for this selection.</td></tr>')+'</tbody></table></div>';}
}
function bind(){
 const on=(id,fn)=>{const e=document.getElementById(id);if(e)e.addEventListener('change',fn);};
 on('tpi-period',e=>{period=e.target.value;render();});
 on('tpi-teacher',e=>{filterTeacher=e.target.value;filterStudent='all';render();});
 on('tpi-student',e=>{filterStudent=e.target.value;render();});
 on('tpi-subject',e=>{filterSubject=e.target.value;render();});
 on('tpi-type',e=>{filterType=e.target.value;render();});
 const from=document.getElementById('tpi-from'),to=document.getElementById('tpi-to');
 const apply=document.getElementById('tpi-apply');if(apply)apply.addEventListener('click',()=>{startDate=from.value;endDate=to.value;if(startDate&&endDate&&startDate>endDate){alert('From date must be on or before To date.');return;}render();});
 const refresh=document.getElementById('tpi-refresh');if(refresh)refresh.addEventListener('click',load);
 root.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.sort;if(sortKey===k)sortDir=sortDir==='asc'?'desc':'asc';else{sortKey=k;sortDir='desc';}render();}));
 root.querySelectorAll('[data-teacher]').forEach(b=>b.addEventListener('click',()=>{filterTeacher=b.dataset.teacher;filterStudent='all';render();}));
}
async function load(){
 showMessage('Loading teacher schedules and attendance…');
 const {data:{session},error:se}=await client.auth.getSession();
 if(se||!session){showMessage('Sign in to My LIB first, then open Teacher Performance Intelligence.',true);return;}
 const {data:profile,error:pe}=await client.from('profiles').select('role,linked_teacher_id,archived').eq('id',session.user.id).single();
 if(pe||!profile||profile.archived||!['Admin','Teacher'].includes(profile.role)){showMessage('Access restricted. This report is available to active Admin and Teacher accounts only.',true);return;}
 role=profile.role;teacherId=profile.linked_teacher_id||'';
 if(role==='Teacher'&&!teacherId){showMessage('Your teacher profile is not linked. Please contact Admin.',true);return;}
 const results=await Promise.all([
  readAll('scheduled_classes','id,date,time,student_id,teacher_id,subject_id,class_type,status,linked_session_id,created_at','date'),
  readAll('sessions','id,date,student_id,teacher_id,subject_id,class_type,status,count,created_at','date'),
  readAll('teachers','id,name,archived','name'),
  readAll('students','id,name,archived','name'),
  readAll('subjects','id,name,teacher_id','name')
 ]);
 schedules=results[0];sessions=results[1];teachers=results[2];students=results[3];subjects=results[4];
 if(role==='Teacher'){
  // RLS remains the security boundary; this client-side scope is an additional presentation guard.
  schedules=schedules.filter(x=>String(x.teacher_id)===String(teacherId));
  sessions=sessions.filter(x=>String(x.teacher_id)===String(teacherId));
  teachers=teachers.filter(x=>String(x.id)===String(teacherId));
  subjects=subjects.filter(x=>String(x.teacher_id)===String(teacherId));
  const ownStudentIds=new Set([...schedules,...sessions].map(x=>String(x.student_id)).filter(Boolean));
  students=students.filter(x=>ownStudentIds.has(String(x.id)));
 }
 render();
}
async function init(){
 if(!window.supabase){showMessage('Supabase browser library did not load. Refresh and try again.',true);return;}
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 try{await load();}catch(e){showMessage(e.message,true);}
}
init();
})();