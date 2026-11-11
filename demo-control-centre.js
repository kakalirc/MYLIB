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
  (demoCC.kaLeads||[]).forEach(k=>out.push({key:'ka:'+k.id,type:'Knowledge Arena Guest',source:'Knowledge Arena',leadSource:'Knowledge Arena',id:k.id,name:k.last_guest_name||'Guest enquiry',phone:k.mobile_e164||'',email:'',subject:k.last_subject||'',mode:'',status:k.lead_status||'New',date:k.first_seen_at,teacherId:'',teacher:'—',created:k.first_seen_at,raw:k,followup:demoCCFollowup('ka',k.id)}));
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
function demoCCOpen(key) { demoCC.selected=key; demoCC.message=''; render(); }
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
function renderDemoControlCentre() {
  if(currentRole!=='Admin') return '<div class="card">Admin access required.</div>';
  if(demoCC.loading) return '<div class="card"><div class="empty">Loading all demo and enquiry sources…</div></div>';
  const records=demoCCRecords(), all=demoCCRecords();
  const now=new Date(), overdue=all.filter(x=>x.followup?.next_followup_at&&new Date(x.followup.next_followup_at)<now&&!['Converted','Converted to Student','Lost','Cancelled','Not Interested'].includes(x.status));
  const newLeads=all.filter(x=>['New','Pending','Contacted'].includes(x.status));
  const scheduled=all.filter(x=>['Scheduled','Demo Booked'].includes(x.status));
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
  const events=selected?demoCC.activity.filter(e=>e.source_type===(selected.source==='Wix'?'wix':selected.source==='Knowledge Arena'?'ka':'demo')&&e.source_id===selected.id):[];
  const sourceOptions=['All',...new Set(all.map(x=>x.leadSource).filter(Boolean))].sort((a,b)=>a==='All'?-1:a.localeCompare(b));
  const statusOptions=['All',...new Set(all.map(x=>x.status).filter(Boolean))].sort((a,b)=>a==='All'?-1:a.localeCompare(b));
  const list=records.map(x=>'<tr><td><b>'+esc(x.name)+'</b><div class="hint">'+esc(x.phone)+'</div></td><td>'+esc(x.leadSource||x.source)+'</td><td>'+esc(x.subject||'—')+'</td><td>'+esc(x.status)+'</td><td>'+esc(x.teacher||'—')+'</td><td>'+esc(x.date||'—')+'</td><td><button class="btn-small" onclick="demoCCOpen('+JSON.stringify(x.key)+')">View / Follow up</button></td></tr>').join('');
  const detail=selected?'<div class="card" style="margin-top:16px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3 style="margin:0">Enquiry details</h3><button class="btn-small" onclick="demoCC.selected=null;render()">Close</button></div><div class="stat-grid" style="margin-top:12px"><div><b>'+esc(selected.name)+'</b><div class="hint">'+esc(selected.phone)+'</div></div><div><b>'+esc(selected.source)+'</b><div class="hint">'+esc(selected.type)+'</div></div><div><b>'+esc(selected.subject||'—')+'</b><div class="hint">'+esc(selected.mode||'')+'</div></div><div><b>'+esc(selected.status)+'</b><div class="hint">'+esc(selected.teacher||'Unassigned')+'</div></div></div>'+
  (selected.source==='Knowledge Arena'?'<div style="margin-top:12px"><label>Lead status</label><select id="demoCCKAStatus">'+['New','Contacted','Interested','Demo Booked','Demo Completed','Converted to Student','Not Interested'].map(v=>'<option '+(selected.status===v?'selected':'')+'>'+v+'</option>').join('')+'</select><label style="display:block;margin-top:8px">Link existing student (required for conversion)</label><select id="demoCCKAStudent"><option value="">Choose student…</option>'+data.students.filter(x=>!x.archived).map(x=>'<option value="'+escAttr(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select><button class="btn-small btn-primary" style="margin-top:8px" onclick="demoCCUpdateKA('+JSON.stringify(selected.id)+')">Save lead status</button></div>':'<div class="hint" style="margin-top:10px">Manage scheduling, assignment and demo outcome in the original '+esc(selected.type)+' workflow to preserve existing payroll and conversion rules. <button class="btn-small" onclick="setTab('+JSON.stringify(selected.source==='Wix'?'wixbookings':'log')+')">Open original record screen</button></div>')+
  '<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><h3>Follow-up</h3><label>Feedback / follow-up note</label><textarea id="demoCCNote" rows="3" style="width:100%">'+esc(fu.note||'')+'</textarea><div class="form-row" style="margin-top:8px"><div><label>Interest level</label><select id="demoCCInterest"><option value="">Not recorded</option>'+['High','Medium','Low','Not interested'].map(v=>'<option '+(fu.interest_level===v?'selected':'')+'>'+v+'</option>').join('')+'</select></div><div><label>Next follow-up date</label><input id="demoCCNext" type="date" value="'+escAttr((fu.next_followup_at||'').slice(0,10))+'"></div><div><label>Owner</label><select id="demoCCOwner"><option value="">Admin team</option>'+data.users.filter(u=>u.role==='Admin').map(u=>'<option value="'+escAttr(u.id)+'" '+(fu.owner_user_id===u.id?'selected':'')+'>'+esc(u.username)+'</option>').join('')+'</select></div></div><button class="btn-small btn-primary" style="margin-top:10px" '+(demoCC.saving?'disabled':'')+' onclick="demoCCSaveFollowup('+JSON.stringify(selected.source==='Wix'?'wix':selected.source==='Knowledge Arena'?'ka':'demo')+','+JSON.stringify(selected.id)+')">Save follow-up</button><span class="hint" style="margin-left:8px">'+esc(demoCC.message)+'</span></div><h3 style="margin-top:18px">Activity history</h3>'+(events.length?'<div class="hint">'+events.map(e=>'<div style="padding:7px 0;border-bottom:1px solid var(--line)"><b>'+esc(e.event_type.replace(/_/g,' '))+'</b> · '+esc(new Date(e.changed_at).toLocaleString())+'</div>').join('')+'</div>':'<div class="hint">No recorded activity yet. New changes will appear here after the audit migration is applied.</div>')+'</div>':'';
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="margin:0">Demo Control Centre</h2><div class="hint">Unified Admin view across Wix, Demo Register and Knowledge Arena guest enquiries</div></div><button class="btn-small" onclick="loadDemoControlCentre()">↻ Refresh</button></div>'+
  (demoCC.error?'<div class="card" style="color:var(--brick);margin-top:12px">'+esc(demoCC.error)+'</div>':'')+
  '<div class="stat-grid" style="margin-top:16px">'+demoCCMetric('Total enquiries',all.length,'All','Across all sources')+demoCCMetric('New / unscheduled',newLeads.length,'New','Require initial action')+demoCCMetric('Scheduled',scheduled.length,'Scheduled','Includes booked demos')+demoCCMetric('Conducted',conducted.length,'Done','Demo completed')+demoCCMetric('Outcome pending',pendingOutcome.length,'Done','Conducted without interest outcome')+demoCCMetric('Overdue follow-ups',overdue.length,'All','Next follow-up date has passed')+demoCCMetric('Converted',converted.length,'Converted','Linked conversion status')+demoCCMetric('Interested',interested.length,'Interested','Awaiting decision')+demoCCMetric('Follow-up date missing',followupMissing.length,'Interested','Interested leads without next date')+demoCCMetric('Lost / not interested',lost.length,'Lost','Closed without conversion')+demoCCMetric('Cancelled',cancelled.length,'Cancelled','Cancelled demos')+demoCCMetric('Past scheduled date',pastScheduled.length,'Scheduled','Date passed without completion')+demoCCMetric('Rescheduled events',rescheduled,'All','Recorded schedule changes')+'</div>'+
  '<div class="card" style="margin-top:14px"><div class="form-row"><div><label>Date range</label><select onchange="demoCC.range=this.value;render()"><option value="today" '+(demoCC.range==='today'?'selected':'')+'>Today</option><option value="week" '+(demoCC.range==='week'?'selected':'')+'>This week</option><option value="month" '+(demoCC.range==='month'?'selected':'')+'>This month</option><option value="all" '+(demoCC.range==='all'?'selected':'')+'>All time</option></select></div><div><label>Lead source</label><select onchange="demoCC.source=this.value;render()">'+sourceOptions.map(v=>'<option '+(demoCC.source===v?'selected':'')+'>'+v+'</option>').join('')+'</select></div><div><label>Status</label><select onchange="demoCC.status=this.value;render()">'+statusOptions.map(v=>'<option '+(demoCC.status===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></div><div><label>Teacher</label><select onchange="demoCC.teacher=this.value;render()"><option value="All">All teachers</option>'+activeTeachers().map(t=>'<option value="'+escAttr(t.id)+'" '+(demoCC.teacher===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></div><div><label>Search</label><input value="'+escAttr(demoCC.search)+'" placeholder="Name, mobile, subject" oninput="demoCC.search=this.value;render()"></div></div></div>'+
  '<div class="card" style="margin-top:14px;overflow:auto"><h3>Enquiries ('+records.length+')</h3><table style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr><th align="left">Student / Parent</th><th align="left">Source</th><th align="left">Subject</th><th align="left">Status</th><th align="left">Teacher</th><th align="left">Demo / enquiry date</th><th></th></tr></thead><tbody>'+ (list||'<tr><td colspan="7" class="hint">No matching enquiries.</td></tr>')+'</tbody></table></div>'+detail;
}
