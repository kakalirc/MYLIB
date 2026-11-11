/* Demo Control Centre — Admin-only unified demo and enquiry oversight.
 * Reuses the existing Demo Register, Wix booking and Knowledge Arena lead records.
 * Does not alter Teacher Login or teacher_mark_demo_done.
 */
let demoCC = { loading:false, error:'', source:'All', status:'All', teacher:'All', range:'month', search:'', followups:[], activity:[], kaLeads:[], selected:null, saving:false, message:'' };
const DEMO_CC_STATUSES = ['New','Pending','Scheduled','Done','Converted','Lost','Cancelled','Contacted','Interested','Demo Booked','Demo Completed','Converted to Student','Not Interested'];
function demoCCDate(d) { if (!d) return null; const x=new Date(d); return Number.isNaN(x.getTime())?null:x; }
function demoCCDayStart(d) { const x=new Date(d); x.setHours(0,0,0,0); return x; }
function demoCCRangeStart() {
  const now=new Date(), start=demoCCDayStart(now);
  if(demoCC.range==='today') return start;
  if(demoCC.range==='week'){start.setDate(start.getDate()-((start.getDay()+6)%7));return start;}
  if(demoCC.range==='month'){start.setDate(1);return start;}
  return null;
}
async function demoCCCallKA(body) {
  const {data:{session}}=await sb.auth.getSession();
  if(!session) throw new Error('Admin session expired. Please sign in again.');
  const res=await fetch(SUPABASE_URL+'/functions/v1/knowledge-arena',{
    method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+session.access_token},body:JSON.stringify(body)
  });
  const payload=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(payload.error||'Knowledge Arena request failed ('+res.status+').');
  return payload;
}
async function demoCCLoadAllKALeads() {
  const leads=[]; let offset=0,total=0;
  do {
    const page=await demoCCCallKA({action:'get_admin_guest_leads',limit:100,offset});
    leads.push(...(page.leads||[])); total=Number(page.total)||0; offset+=100;
  } while(offset<total&&offset<10000);
  return leads;
}
async function loadDemoControlCentre() {
  if(currentRole!=='Admin') return;
  demoCC.loading=true; demoCC.error=''; render();
  try {
    await Promise.all([loadDemoLogs(),loadWixBookings()]);
    const [fu,ac,ka]=await Promise.all([
      sb.from('demo_control_followups').select('*').order('updated_at',{ascending:false}),
      sb.from('demo_control_activity').select('*').order('changed_at',{ascending:false}).limit(1000),
      demoCCLoadAllKALeads()
    ]);
    if(fu.error) throw new Error('Follow-up data: '+fu.error.message);
    if(ac.error) throw new Error('Activity history: '+ac.error.message);
    demoCC.followups=fu.data||[];
    demoCC.activity=ac.data||[];
    demoCC.kaLeads=ka||[];
  } catch(e) { demoCC.error=e.message||'Could not load Demo Control Centre.'; }
  finally { demoCC.loading=false; render(); }
}
function demoCCFollowup(type,id) { return demoCC.followups.find(x=>x.source_type===type&&x.source_id===id)||null; }
function demoCCRecords() {
  const out=[], linked=new Set();
  (data.wixBookings||[]).forEach(b=>{
    if(b.demoLogId) linked.add(b.demoLogId);
    out.push({key:'wix:'+b.id,type:'Wix Demo Booking',source:'Wix',leadSource:b.source||'Website',id:b.id,name:b.studentName||'Unnamed enquiry',phone:b.phone||'',email:b.email||'',subject:b.subject||'',mode:b.classMode||'',status:b.status||'New',date:b.scheduledDate||b.submittedAt,teacherId:b.scheduledTeacherId||'',teacher:(data.teachers.find(t=>t.id===b.scheduledTeacherId)||{}).name||'',created:b.submittedAt,raw:b,followup:demoCCFollowup('wix',b.id)});
  });
  (data.demoLogs||[]).filter(d=>!linked.has(d.id)).forEach(d=>out.push({key:'demo:'+d.id,type:'Demo Register',source:'Admin / Demo Register',leadSource:'Admin / Demo Register',id:d.id,name:d.studentName||'Unnamed demo',phone:d.parentMobile||'',email:'',subject:subjectName(d.subjectId)||'',mode:'',status:d.status||'Pending',date:d.date,teacherId:d.teacherId||'',teacher:(data.teachers.find(t=>t.id===d.teacherId)||{}).name||'',created:d.createdAt,raw:d,followup:demoCCFollowup('demo',d.id)}));
  (demoCC.kaLeads||[]).forEach(k=>{const followup=demoCCFollowup('ka',k.id), linkedDemo=followup?.demo_log_id?(data.demoLogs||[]).find(d=>d.id===followup.demo_log_id):null;out.push({key:'ka:'+k.id,type:'Knowledge Arena Guest',source:'Knowledge Arena',leadSource:'Knowledge Arena',id:k.id,name:k.last_guest_name||'Guest enquiry',phone:k.mobile_e164||'',email:'',subject:k.last_subject||'',mode:'',status:k.lead_status||'New',date:linkedDemo?.date||k.first_seen_at,teacherId:linkedDemo?.teacherId||'',teacher:(data.teachers.find(t=>t.id===linkedDemo?.teacherId)||{}).name||'—',created:k.first_seen_at,raw:k,followup,linkedDemo});});
  const start=demoCCRangeStart(), q=(demoCC.search||'').trim().toLowerCase();
  return out.filter(x=>{
    const dt=demoCCDate(x.created||x.date);
    if(start&&(!dt||dt<start)) return false;
    if(demoCC.source!=='All'&&x.leadSource!==demoCC.source) return false;
    if(demoCC.status!=='All'&&x.status!==demoCC.status) return false;
    if(demoCC.teacher!=='All'&&x.teacherId!==demoCC.teacher) return false;
    if(q&&![x.name,x.phone,x.email,x.subject].some(v=>String(v||'').toLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b)=>(demoCCDate(b.created||b.date)?.getTime()||0)-(demoCCDate(a.created||a.date)?.getTime()||0));
}
function demoCCMetric(label,value,filter,sub) {
  return '<button class="card" style="text-align:left;cursor:pointer;min-width:0" onclick="demoCC.status='+JSON.stringify(filter)+';render()"><div style="font-size:27px;font-weight:750;color:var(--ink)">'+value+'</div><div style="font-size:13px;font-weight:650">'+esc(label)+'</div><div class="hint">'+esc(sub||'View records')+'</div></button>';
}
function demoCCOpen(key) {
  demoCC.selected=key;
  demoCC.message='';
  render();
  // The management panel is rendered after the enquiry table; bring it into view
  // so the Manage action has immediate, visible feedback on long lists.
  requestAnimationFrame(()=>document.getElementById('demoCCDetail')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function demoCCSaveFollowup(type,id) {
  const note=(document.getElementById('demoCCNote')?.value||'').trim();
  const next=document.getElementById('demoCCNext')?.value||null;
  const interest=document.getElementById('demoCCInterest')?.value||'';
  const owner=document.getElementById('demoCCOwner')?.value||null;
  demoCCSaveFollowupData(type,id,{note,next_followup_at:next||null,interest_level:interest||null,owner_user_id:owner||null});
}
async function demoCCSaveFollowupData(type,id,values) {
  if(currentRole!=='Admin') return;
  demoCC.saving=true;demoCC.message='Saving follow-up…';render();
  try {
    const existing=demoCCFollowup(type,id);
    const payload={source_type:type,source_id:id,...values,updated_at:new Date().toISOString()};
    if(existing) { const {error}=await sb.from('demo_control_followups').update(payload).eq('id',existing.id);if(error)throw error; }
    else { const {error}=await sb.from('demo_control_followups').insert(payload);if(error)throw error; }
    if(type==='ka'&&values.note) await demoCCCallKA({action:'admin_save_guest_lead_note',lead_id:id,note:values.note});
    demoCC.message='Follow-up saved.';
    await loadDemoControlCentre();
    demoCC.selected=type+':'+id;
  } catch(e) { demoCC.message='Could not save: '+(e.message||e); }
  finally {demoCC.saving=false;render();}
}
async function demoCCUpdateKA(id) {
  const row=demoCC.kaLeads.find(x=>x.id===id); if(!row)return;
  const status=document.getElementById('demoCCKAStatus')?.value||row.lead_status;
  const student=document.getElementById('demoCCKAStudent')?.value||null;
  try {
    await demoCCCallKA({action:'admin_update_guest_lead',lead_id:id,lead_status:status,converted_student_id:student});
    demoCC.message='Knowledge Arena lead updated.';
    await loadDemoControlCentre();
    demoCC.selected='ka:'+id;
  } catch(e) {demoCC.message=e.message||'Could not update lead.';}
  render();
}
async function demoCCScheduleWix(id) {
  if(currentRole!=='Admin') return;
  const teacherId=document.getElementById('demoCCScheduleTeacher')?.value||'';
  const date=document.getElementById('demoCCScheduleDate')?.value||'';
  const time=document.getElementById('demoCCScheduleTime')?.value||'';
  if(!teacherId||!date){demoCC.message='Choose a teacher and date.';render();return;}
  wixBookingScheduleDraft={id,teacherId,date,time};wixBookingActionId=id;
  await scheduleWixBooking();
  await loadDemoControlCentre();
  demoCC.selected='wix:'+id;
}
async function demoCCRescheduleWix(id) {
  if(currentRole!=='Admin') return;
  const teacherId=document.getElementById('demoCCScheduleTeacher')?.value||'';
  const date=document.getElementById('demoCCScheduleDate')?.value||'';
  const time=document.getElementById('demoCCScheduleTime')?.value||'';
  if(!teacherId||!date){demoCC.message='Choose a teacher and date.';render();return;}
  wixTimeEditId=id;wixTimeDraft={teacherId,date,time};
  await saveWixTimeChange();
  await loadDemoControlCentre();
  demoCC.selected='wix:'+id;
}
async function demoCCSaveDemoSchedule(sourceType,sourceId,demoId) {
  if(currentRole!=='Admin') return;
  const teacherId=document.getElementById('demoCCScheduleTeacher')?.value||'';
  const date=document.getElementById('demoCCScheduleDate')?.value||'';
  const time=document.getElementById('demoCCScheduleTime')?.value||'';
  if(!teacherId||!date){demoCC.message='Choose a teacher and date.';render();return;}
  const dl=(data.demoLogs||[]).find(d=>d.id===demoId);
  if(!dl||dl.status==='Cancelled'){demoCC.message='This demo record is no longer available for scheduling.';render();return;}
  demoCC.saving=true;demoCC.message='Saving schedule…';render();
  try{
    const {data:saved,error}=await sb.from('demo_logs').update({teacher_id:teacherId,date,demo_time:time||null,status:'Pending'}).eq('id',demoId).neq('status','Cancelled').select('id').maybeSingle();
    if(error)throw error;
    if(!saved)throw new Error('The demo was changed by another user. Refresh and review it.');
    Object.assign(dl,{teacherId,date,demoTime:time,status:'Pending'});
    const booking=data.wixBookings.find(b=>b.demoLogId===demoId);
    if(booking){
      const {error:bookingError}=await sb.from('wix_demo_bookings').update({status:'Scheduled',scheduled_teacher_id:teacherId,scheduled_date:date,scheduled_time:time||null}).eq('id',booking.id);
      if(bookingError)throw new Error('Demo saved, but its linked Wix booking could not be updated: '+bookingError.message);
      Object.assign(booking,{status:'Scheduled',scheduledTeacherId:teacherId,scheduledDate:date,scheduledTime:time});
    }
    demoCC.message='Schedule saved.';
    await loadDemoControlCentre();
    demoCC.selected=sourceType+':'+sourceId;
  }catch(e){demoCC.message='Could not save schedule: '+(e.message||e);}
  finally{demoCC.saving=false;render();}
}
async function demoCCScheduleKA(id) {
  if(currentRole!=='Admin') return;
  const teacherId=document.getElementById('demoCCScheduleTeacher')?.value||'';
  const date=document.getElementById('demoCCScheduleDate')?.value||'';
  const time=document.getElementById('demoCCScheduleTime')?.value||'';
  if(!teacherId||!date){demoCC.message='Choose a teacher and date.';render();return;}
  const lead=demoCC.kaLeads.find(x=>x.id===id);if(!lead)return;
  const followup=demoCCFollowup('ka',id);
  if(followup?.demo_log_id)return demoCCSaveDemoSchedule('ka',id,followup.demo_log_id);
  demoCC.saving=true;demoCC.message='Creating scheduled demo…';render();
  let insertedId='';
  try{
    const notes=['Knowledge Arena guest enquiry',lead.last_subject?'Subject: '+lead.last_subject:'',lead.last_grade_label?'Grade: '+lead.last_grade_label:''].filter(Boolean).join('. ');
    const {data:log,error:logError}=await sb.from('demo_logs').insert({
      teacher_id:teacherId,date,demo_time:time||null,student_name:lead.last_guest_name||'Guest enquiry',
      parent_mobile:lead.mobile_e164||null,notes,status:'Pending',bonus_amount:100,bonus_paid:false
    }).select('id').single();
    if(logError)throw logError;
    insertedId=log.id;
    const {error:fuError}=await sb.from('demo_control_followups').upsert({
      source_type:'ka',source_id:id,demo_log_id:insertedId,updated_at:new Date().toISOString()
    },{onConflict:'source_type,source_id'});
    if(fuError)throw new Error('The demo was created, but the Knowledge Arena link could not be saved. '+fuError.message);
    const update=await demoCCCallKA({action:'admin_update_guest_lead',lead_id:id,lead_status:'Demo Booked'});
    if(!update)throw new Error('Knowledge Arena lead status was not updated.');
    demoCC.message='Demo scheduled and linked to the Knowledge Arena enquiry.';
    await loadDemoControlCentre();demoCC.selected='ka:'+id;
  }catch(e){
    if(insertedId){
      await sb.from('demo_control_followups').update({demo_log_id:null,updated_at:new Date().toISOString()}).eq('source_type','ka').eq('source_id',id);
      await sb.from('demo_logs').delete().eq('id',insertedId);
    }
    demoCC.message='Could not schedule Knowledge Arena lead: '+(e.message||e);
  }finally{demoCC.saving=false;render();}
}
async function demoCCMarkDone(recordOrKey) {
  if(currentRole!=='Admin')return;
  const record=typeof recordOrKey==='string'?demoCCRecords().find(x=>x.key===recordOrKey):recordOrKey;
  if(!record)return;
  const dl=record.type==='Knowledge Arena Guest'?record.linkedDemo:(data.demoLogs||[]).find(d=>d.id===(record.type==='Wix Demo Booking'?record.raw.demoLogId:record.id));
  if(!dl){demoCC.message='Schedule this enquiry first so a Demo Register record exists.';render();return;}
  if(record.type==='Knowledge Arena Guest'){
    const doneAt=demoDoneDate(dl);const {error}=await sb.from('demo_logs').update({status:'Done',done_at:doneAt}).eq('id',dl.id);
    if(error){demoCC.message='Could not mark demo done: '+error.message;render();return;}
    dl.status='Done';dl.doneAt=doneAt;
    try{await demoCCCallKA({action:'admin_update_guest_lead',lead_id:record.id,lead_status:'Demo Completed'});}catch(e){demoCC.message='Demo marked Done, but Knowledge Arena status needs syncing: '+e.message;}
  }else await markDemoDone(dl.id);
  await loadDemoControlCentre();demoCC.selected=record.key;render();
}
async function demoCCMarkLost(recordOrKey) {
  if(currentRole!=='Admin')return;
  const record=typeof recordOrKey==='string'?demoCCRecords().find(x=>x.key===recordOrKey):recordOrKey;
  if(!record)return;
  const dl=record.type==='Knowledge Arena Guest'?record.linkedDemo:(data.demoLogs||[]).find(d=>d.id===(record.type==='Wix Demo Booking'?record.raw.demoLogId:record.id));
  if(!dl){demoCC.message='Schedule this enquiry first so a Demo Register record exists.';render();return;}
  const reason=document.getElementById('demoCCLostReason')?.value||'';
  const note=document.getElementById('demoCCLostNote')?.value||'';
  if(record.type==='Knowledge Arena Guest'){
    const row={status:'Lost',lost_at:todayStr,lost_reason:reason||null,lost_note:note.trim()||null,done_at:demoDoneDate(dl)};
    const {error}=await sb.from('demo_logs').update(row).eq('id',dl.id);if(error){demoCC.message='Could not mark demo lost: '+error.message;render();return;}
    Object.assign(dl,{status:'Lost',lostAt:todayStr,lostReason:row.lost_reason||'',lostNote:row.lost_note||'',doneAt:row.done_at});
    try{await demoCCCallKA({action:'admin_update_guest_lead',lead_id:record.id,lead_status:'Not Interested'});}catch(e){demoCC.message='Demo marked Lost, but Knowledge Arena status needs syncing: '+e.message;}
  }else{demoLostDraft={reason,note};await saveDemoLost(dl.id);}
  await loadDemoControlCentre();demoCC.selected=record.key;render();
}
async function demoCCConvert(recordOrKey) {
  if(currentRole!=='Admin')return;
  const record=typeof recordOrKey==='string'?demoCCRecords().find(x=>x.key===recordOrKey):recordOrKey;
  if(!record)return;
  const studentId=document.getElementById('demoCCConvertStudent')?.value||'';
  if(!studentId){demoCC.message='Choose an existing student before converting.';render();return;}
  const student=data.students.find(s=>s.id===studentId&&!s.archived);
  if(!student){demoCC.message='Choose a valid active student.';render();return;}
  const dl=record.type==='Knowledge Arena Guest'?record.linkedDemo:(data.demoLogs||[]).find(d=>d.id===(record.type==='Wix Demo Booking'?record.raw.demoLogId:record.id));
  demoCC.saving=true;demoCC.message='Converting…';render();
  try{
    if(dl){
      if(dl.status==='Cancelled')throw new Error('A cancelled demo cannot be converted.');
      if(dl.linkedStudentId&&dl.linkedStudentId!==studentId)throw new Error('This demo is already linked to another student.');
      if(!(dl.status==='Converted'&&dl.linkedStudentId===studentId)){
        let q=sb.from('demo_logs').update({linked_student_id:studentId,...demoConvertFields(dl)}).eq('id',dl.id);
        q=dl.linkedStudentId===studentId?q.eq('linked_student_id',studentId):q.is('linked_student_id',null);
        const {data:saved,error}=await q.select('id').maybeSingle();
        if(error)throw error;if(!saved)throw new Error('The demo changed in another session. Refresh and review it.');
      }
      dl.linkedStudentId=studentId;applyDemoConvert(dl);
      const linkedWix=record.type==='Wix Demo Booking'?record.raw:data.wixBookings.find(b=>b.demoLogId===dl.id);
      if(linkedWix){
        const {error}=await sb.from('wix_demo_bookings').update({status:'Converted',converted_student_id:studentId,demo_log_id:dl.id}).eq('id',linkedWix.id);
        if(error)throw new Error('Demo converted, but linked Wix booking needs syncing: '+error.message);
        Object.assign(linkedWix,{status:'Converted',convertedStudentId:studentId,demoLogId:dl.id});
      }
    }
    if(record.type==='Knowledge Arena Guest'){
      await demoCCCallKA({action:'admin_update_guest_lead',lead_id:record.id,lead_status:'Converted to Student',converted_student_id:studentId});
    }
    demoCC.message='Converted and linked to '+student.name+'.';
    await loadDemoControlCentre();demoCC.selected=record.key;
  }catch(e){demoCC.message='Conversion needs attention: '+(e.message||e);}
  finally{demoCC.saving=false;render();}
}
function demoCCSelectedDemo(record){
  if(!record)return null;
  if(record.type==='Knowledge Arena Guest')return record.linkedDemo||null;
  if(record.type==='Wix Demo Booking')return record.raw.demoLogId?(data.demoLogs||[]).find(d=>d.id===record.raw.demoLogId)||null:null;
  return (data.demoLogs||[]).find(d=>d.id===record.id)||null;
}
function renderDemoControlCentre() {
  if(currentRole!=='Admin') return '<div class="card">Admin access required.</div>';
  if(demoCC.loading) return '<div class="card"><div class="empty">Loading all demo and enquiry sources…</div></div>';
  const records=demoCCRecords(), all=demoCCRecords();
  const now=new Date(), overdue=all.filter(x=>x.followup?.next_followup_at&&new Date(x.followup.next_followup_at)<now&&!['Converted','Converted to Student','Lost','Cancelled','Not Interested'].includes(x.status));
  const newLeads=all.filter(x=>['New','Contacted'].includes(x.status)||(x.status==='Pending'&&(!x.teacherId||!x.date)));
  const scheduled=all.filter(x=>['Scheduled','Demo Booked'].includes(x.status)||(x.status==='Pending'&&!!x.teacherId&&!!x.date&&x.date>=todayStr));
  const conducted=all.filter(x=>['Done','Demo Completed'].includes(x.status));
  const converted=all.filter(x=>['Converted','Converted to Student'].includes(x.status));
  const pendingOutcome=conducted.filter(x=>!x.followup?.interest_level);
  const interested=all.filter(x=>x.status==='Interested');
  const lost=all.filter(x=>x.status==='Lost'||x.status==='Not Interested');
  const cancelled=all.filter(x=>x.status==='Cancelled');
  const followupMissing=interested.filter(x=>!x.followup?.next_followup_at);
  const pastScheduled=all.filter(x=>['Scheduled','Demo Booked','Pending'].includes(x.status)&&x.date&&new Date(x.date)<demoCCDayStart(new Date()));
  const rescheduled=demoCC.activity.filter(x=>x.event_type==='schedule_changed').length;
  const selected=all.find(x=>x.key===demoCC.selected);
  const fu=selected?.followup||{};
  const linkedDemo=demoCCSelectedDemo(selected);
  const events=selected?demoCC.activity.filter(e=>(e.source_type===(selected.source==='Wix'?'wix':selected.source==='Knowledge Arena'?'ka':'demo')&&e.source_id===selected.id)||(linkedDemo&&e.source_type==='demo'&&e.source_id===linkedDemo.id)): [];
  const sourceOptions=['All',...new Set(all.map(x=>x.leadSource).filter(Boolean))].sort((a,b)=>a==='All'?-1:a.localeCompare(b));
  const statusOptions=['All',...new Set(all.map(x=>x.status).filter(Boolean))].sort((a,b)=>a==='All'?-1:a.localeCompare(b));
  const teachers=activeTeachers();
  const list=records.map(x=>'<tr><td><b>'+esc(x.name)+'</b><div class="hint">'+esc(x.phone)+'</div></td><td>'+esc(x.leadSource||x.source)+'</td><td>'+esc(x.subject||'—')+'</td><td>'+esc(x.status)+'</td><td>'+esc(x.teacher||'—')+'</td><td>'+esc(x.date||'—')+'</td><td><button class="btn-small" onclick="demoCCOpen('+JSON.stringify(x.key)+')">Manage</button></td></tr>').join('');
  let detail='';
  if(selected){
    const type=selected.type==='Wix Demo Booking'?'wix':selected.type==='Knowledge Arena Guest'?'ka':'demo';
    const isWix=type==='wix',isKA=type==='ka';
    const canSchedule=!['Converted','Converted to Student','Lost','Not Interested','Cancelled','Done','Demo Completed'].includes(selected.status);
    const scheduleTeacher=linkedDemo?.teacherId||selected.teacherId||'';
    const scheduleDate=linkedDemo?.date||selected.date||todayStr;
    const scheduleTime=linkedDemo?.demoTime||selected.raw?.scheduledTime||'';
    const scheduleControls=canSchedule?'<div class="form-row" style="margin-top:12px"><div><label>Teacher</label><select id="demoCCScheduleTeacher"><option value="">Choose teacher…</option>'+teachers.map(t=>'<option value="'+escAttr(t.id)+'" '+(scheduleTeacher===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></div><div><label>Demo date</label><input id="demoCCScheduleDate" type="date" value="'+escAttr(String(scheduleDate||'').slice(0,10))+'"></div><div><label>Time</label><input id="demoCCScheduleTime" type="time" value="'+escAttr(String(scheduleTime||'').slice(0,5))+'"></div></div><button class="btn-small btn-primary" style="margin-top:8px" '+(demoCC.saving?'disabled':'')+' onclick="'+(isWix?(selected.status==='Scheduled'?'demoCCRescheduleWix':'demoCCScheduleWix')+'('+JSON.stringify(selected.id)+')':isKA?'demoCCScheduleKA('+JSON.stringify(selected.id)+')':'demoCCSaveDemoSchedule(\'demo\','+JSON.stringify(selected.id)+','+JSON.stringify(selected.id)+')')+'">'+(linkedDemo||selected.status==='Scheduled'?'Save schedule / reassign':'Schedule demo')+'</button>':'<div class="hint" style="margin-top:10px">Scheduling is unavailable for a closed or converted enquiry.</div>';
    const outcomeControls=linkedDemo&&['Pending','Done','Lost'].includes(linkedDemo.status)?'<div style="margin-top:14px"><b>Demo outcome</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+(linkedDemo.status==='Pending'?'<button class="btn-small btn-primary" onclick="demoCCMarkDone('+JSON.stringify(selected.key)+')">Mark demo done</button>':'')+(linkedDemo.status!=='Lost'?'<select id="demoCCLostReason"><option value="">Lost reason…</option>'+DEMO_LOST_REASONS.map(r=>'<option>'+esc(r)+'</option>').join('')+'</select><input id="demoCCLostNote" placeholder="Optional note" style="max-width:180px"><button class="btn-small" onclick="demoCCMarkLost('+JSON.stringify(selected.key)+')">Mark lost</button>':'<button class="btn-small" onclick="reopenDemoLost('+JSON.stringify(linkedDemo.id)+');loadDemoControlCentre()">Reopen lost</button>')+'</div></div>':'';
    const canConvert=!['Converted','Converted to Student','Cancelled'].includes(selected.status)&&(!isWix||!!linkedDemo);
    const convertControls=canConvert?'<div style="margin-top:14px"><b>Convert to student</b><div class="form-row" style="margin-top:6px"><div><select id="demoCCConvertStudent"><option value="">Choose existing student…</option>'+data.students.filter(s=>!s.archived).map(s=>'<option value="'+escAttr(s.id)+'">'+esc(s.name)+(s.code?' ('+esc(s.code)+')':'')+'</option>').join('')+'</select></div><div><button class="btn-small btn-primary" '+(demoCC.saving?'disabled':'')+' onclick="demoCCConvert('+JSON.stringify(selected.key)+')">Convert and link</button></div></div><div class="hint">Uses the existing student record; demo conversion remains the payroll source of truth.</div></div>':'';
    detail='<div id="demoCCDetail" class="card" style="margin-top:16px;scroll-margin-top:18px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3 style="margin:0">Enquiry management</h3><button class="btn-small" onclick="demoCC.selected=null;render()">Close</button></div><div class="stat-grid" style="margin-top:12px"><div><b>'+esc(selected.name)+'</b><div class="hint">'+esc(selected.phone)+'</div></div><div><b>'+esc(selected.source)+'</b><div class="hint">'+esc(selected.type)+'</div></div><div><b>'+esc(selected.subject||'—')+'</b><div class="hint">'+esc(selected.mode||'')+'</div></div><div><b>'+esc(selected.status)+'</b><div class="hint">'+esc(selected.teacher||'Unassigned')+'</div></div></div>'+scheduleControls+outcomeControls+convertControls+
      '<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><h3>Follow-up</h3><label>Feedback / follow-up note</label><textarea id="demoCCNote" rows="3" style="width:100%">'+esc(fu.note||'')+'</textarea><div class="form-row" style="margin-top:8px"><div><label>Interest level</label><select id="demoCCInterest"><option value="">Not recorded</option>'+['High','Medium','Low','Not interested'].map(v=>'<option '+(fu.interest_level===v?'selected':'')+'>'+v+'</option>').join('')+'</select></div><div><label>Next follow-up date</label><input id="demoCCNext" type="date" value="'+escAttr((fu.next_followup_at||'').slice(0,10))+'"></div><div><label>Owner</label><select id="demoCCOwner"><option value="">Admin team</option>'+data.users.filter(u=>u.role==='Admin').map(u=>'<option value="'+escAttr(u.id)+'" '+(fu.owner_user_id===u.id?'selected':'')+'>'+esc(u.username)+'</option>').join('')+'</select></div></div><button class="btn-small btn-primary" style="margin-top:10px" '+(demoCC.saving?'disabled':'')+' onclick="demoCCSaveFollowup('+JSON.stringify(type)+','+JSON.stringify(selected.id)+')">Save follow-up</button><span class="hint" style="margin-left:8px">'+esc(demoCC.message)+'</span></div><h3 style="margin-top:18px">Activity history</h3>'+(events.length?'<div class="hint">'+events.map(e=>'<div style="padding:7px 0;border-bottom:1px solid var(--line)"><b>'+esc((e.event_type||'updated').replace(/_/g,' '))+'</b> · '+esc(new Date(e.changed_at).toLocaleString())+'</div>').join('')+'</div>':'<div class="hint">No recorded activity yet.</div>')+'</div>';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="margin:0">Demo Control Centre</h2><div class="hint">Unified Admin view across Wix, Demo Register and Knowledge Arena guest enquiries</div></div><button class="btn-small" onclick="loadDemoControlCentre()">↻ Refresh</button></div>'+
  (demoCC.error?'<div class="card" style="color:var(--brick);margin-top:12px">'+esc(demoCC.error)+'</div>':'')+
  '<div class="stat-grid" style="margin-top:16px">'+demoCCMetric('Total enquiries',all.length,'All','Across all sources')+demoCCMetric('New / unscheduled',newLeads.length,'New','Require initial action')+demoCCMetric('Scheduled',scheduled.length,'Scheduled','Includes booked demos')+demoCCMetric('Conducted',conducted.length,'Done','Demo completed')+demoCCMetric('Outcome pending',pendingOutcome.length,'Done','Conducted without interest outcome')+demoCCMetric('Overdue follow-ups',overdue.length,'All','Next follow-up date has passed')+demoCCMetric('Converted',converted.length,'Converted','Linked conversion status')+demoCCMetric('Interested',interested.length,'Interested','Awaiting decision')+demoCCMetric('Follow-up date missing',followupMissing.length,'Interested','Interested leads without next date')+demoCCMetric('Lost / not interested',lost.length,'Lost','Closed without conversion')+demoCCMetric('Cancelled',cancelled.length,'Cancelled','Cancelled demos')+demoCCMetric('Past scheduled date',pastScheduled.length,'Scheduled','Date passed without completion')+demoCCMetric('Rescheduled events',rescheduled,'All','Recorded schedule changes')+'</div>'+
  '<div class="card" style="margin-top:14px"><div class="form-row"><div><label>Date range</label><select onchange="demoCC.range=this.value;render()"><option value="today" '+(demoCC.range==='today'?'selected':'')+'>Today</option><option value="week" '+(demoCC.range==='week'?'selected':'')+'>This week</option><option value="month" '+(demoCC.range==='month'?'selected':'')+'>This month</option><option value="all" '+(demoCC.range==='all'?'selected':'')+'>All time</option></select></div><div><label>Lead source</label><select onchange="demoCC.source=this.value;render()">'+sourceOptions.map(v=>'<option '+(demoCC.source===v?'selected':'')+'>'+v+'</option>').join('')+'</select></div><div><label>Status</label><select onchange="demoCC.status=this.value;render()">'+statusOptions.map(v=>'<option '+(demoCC.status===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></div><div><label>Teacher</label><select onchange="demoCC.teacher=this.value;render()"><option value="All">All teachers</option>'+teachers.map(t=>'<option value="'+escAttr(t.id)+'" '+(demoCC.teacher===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></div><div><label>Search</label><input value="'+escAttr(demoCC.search)+'" placeholder="Name, mobile, subject" oninput="demoCC.search=this.value;render()"></div></div></div>'+
  '<div class="card" style="margin-top:14px;overflow:auto"><h3>Enquiries ('+records.length+')</h3><table style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr><th align="left">Student / Parent</th><th align="left">Source</th><th align="left">Subject</th><th align="left">Status</th><th align="left">Teacher</th><th align="left">Demo / enquiry date</th><th></th></tr></thead><tbody>'+(list||'<tr><td colspan="7" class="hint">No matching enquiries.</td></tr>')+'</tbody></table></div>'+detail;
}
