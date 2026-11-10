/* Revenue Intelligence — Admin-only, read-only reporting over attendance and maintained rates. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://kqkojscbaycolaioyarh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq';
  const root = document.getElementById('ri');
  const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  const state = { from: new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'}).slice(0,7), to: new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'}).slice(0,7), tab:'overview', teacher:'all', student:'all', subject:'all', type:'all', mode:'all' };
  let db, data = {};
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const monthOf = v => String(v || '').slice(0,7);
  const dateOf = v => String(v || '').slice(0,10);
  const monthInRange = v => monthOf(v) >= state.from && monthOf(v) <= state.to;
  const money = v => v == null ? '—' : new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(v);
  const pct = v => v == null || !Number.isFinite(v) ? '—' : v.toFixed(1)+'%';

  function fail(message) {
    root.innerHTML = '<main class="ri-shell"><div class="ri-alert ri-error">'+esc(message)+'</div></main>';
  }
  async function readAll(table, columns, orderField) {
    const rows = [];
    for (let offset=0; offset<50000; offset+=1000) {
      const result = await db.from(table).select(columns).order(orderField,{ascending:true}).order('id',{ascending:true}).range(offset,offset+999);
      if (result.error) throw new Error('Could not load '+table+': '+result.error.message);
      rows.push.apply(rows,result.data||[]);
      if (!result.data || result.data.length<1000) return rows;
    }
    throw new Error('The '+table+' report exceeded the 50,000-row safety limit.');
  }
  async function readAudit(tableName) {
    const rows=[];
    for(let offset=0;offset<10000;offset+=1000){
      const result=await db.from('audit_log').select('table_name,record_id,old_data,new_data,created_at').eq('table_name',tableName).order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+999);
      if(result.error){data.auditWarning=true;return rows;}
      rows.push.apply(rows,result.data||[]);
      if(!result.data||result.data.length<1000)return rows;
    }
    return rows;
  }
  function ratesSnapshot(events,currentRates,date) {
    const day=dateOf(date);
    const usable=(events||[]).filter(e=>(e.new_data&&e.new_data.rates)||(e.old_data&&e.old_data.rates));
    const past=usable.filter(e=>dateOf(e.created_at)<=day);
    if(past.length){const rates=past[past.length-1].new_data&&past[past.length-1].new_data.rates;if(rates)return rates;}
    const future=usable.find(e=>dateOf(e.created_at)>day);
    if(future&&future.old_data&&future.old_data.rates)return future.old_data.rates;
    return currentRates||{};
  }
  function rateValue(v){if(v===undefined||v===null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
  function feeFor(s,subject){
    const overrides=data.studentRates.filter(r=>String(r.student_id)===String(s.student_id)&&String(r.subject_id)===String(s.subject_id)&&r.class_type===s.class_type&&dateOf(r.from_date)<=dateOf(s.date)&&(!r.to_date||dateOf(r.to_date)>=dateOf(s.date))).sort((a,b)=>dateOf(b.from_date).localeCompare(dateOf(a.from_date)));
    if(overrides.length){const r=overrides[0],v=rateValue(s.mode==='Offline'?r.offline_rate:r.rate);if(v!==null)return{value:v,source:'Individual fee'};}
    if(!subject||!subject.category)return{value:null,source:'Missing subject category'};
    const rates=ratesSnapshot(data.feeRateHistory,data.feeSettings&&data.feeSettings.rates,s.date);
    const v=rateValue(rates[subject.category+'_'+s.class_type+'_'+s.mode]);
    return{value:v,source:v===null?'Missing app fee':'App-level fee'};
  }
  function teacherRateFor(s,subject){
    const teacher=data.teacherById.get(String(s.teacher_id));
    if(!teacher)return{value:null,source:'Missing teacher'};
    if(!subject||!subject.category)return{value:null,source:'Missing subject category'};
    const events=data.teacherRateEvents.get(String(s.teacher_id))||[];
    const rates=ratesSnapshot(events,teacher.rates,s.date);
    const v=rateValue(rates[subject.category+'_'+s.class_type+'_'+s.mode]);
    return{value:v,source:v===null?'Missing teacher rate':'Teacher maintenance'};
  }
  function buildRows(){
    const rows=[],issues=[];
    data.sessions.forEach(s=>{
      if(s.status!=='Present'&&s.status!=='Absent')return;
      const subject=data.subjectById.get(String(s.subject_id)),student=data.studentById.get(String(s.student_id)),teacher=data.teacherById.get(String(s.teacher_id)),category=subject&&data.categoryById.get(String(subject.category));
      const count=Number(s.count),validCount=Number.isFinite(count)&&count>0,fee=feeFor(s,subject),pay=teacherRateFor(s,subject);
      const revenue=validCount&&fee.value!==null?fee.value*count:null,cost=validCount&&pay.value!==null?pay.value*count:null,contribution=revenue!==null&&cost!==null?revenue-cost:null;
      const row={id:s.id,date:dateOf(s.date),month:monthOf(s.date),studentId:s.student_id,student:student?student.name:'Unknown student',teacherId:s.teacher_id,teacher:teacher?teacher.name:'Unknown teacher',subjectId:s.subject_id,subject:subject?subject.name:'Deleted subject',category:category?category.name:'Uncategorised',classType:s.class_type||'Unknown',mode:s.mode||'Unknown',status:s.status,count:validCount?count:0,feeRate:fee.value,feeSource:fee.source,teacherRate:pay.value,teacherRateSource:pay.source,revenue,cost,contribution};
      rows.push(row);
      if(!validCount)issues.push({issue:'Invalid class count',row});
      if(fee.value===null)issues.push({issue:fee.source,row});
      if(pay.value===null)issues.push({issue:pay.source,row});
      if(pay.value===0)issues.push({issue:'Zero teacher rate configured',row});
      if(!subject||!subject.category)issues.push({issue:'Missing subject/category mapping',row});
    });
    return{rows,issues};
  }
  function filteredRows(){
    return data.attendanceRows.filter(r=>monthInRange(r.date)&&(state.teacher==='all'||String(r.teacherId)===state.teacher)&&(state.student==='all'||String(r.studentId)===state.student)&&(state.subject==='all'||String(r.subjectId)===state.subject)&&(state.type==='all'||r.classType===state.type)&&(state.mode==='all'||r.mode===state.mode));
  }
  function aggregate(rows,key){
    const map=new Map();
    rows.forEach(r=>{
      const id=String(r[key]||'unknown');let x=map.get(id);
      if(!x){x={id,name:r[key==='studentId'?'student':key==='teacherId'?'teacher':'subject'],sessions:0,units:0,present:0,absent:0,revenue:0,cost:0,contribution:0,contributionRevenue:0};map.set(id,x);}
      x.sessions++;x.units+=r.count;if(r.status==='Present')x.present++;if(r.status==='Absent')x.absent++;
      if(r.revenue!==null)x.revenue+=r.revenue;if(r.cost!==null)x.cost+=r.cost;
      if(r.contribution!==null){x.contribution+=r.contribution;x.contributionRevenue+=r.revenue;}
    });
    return Array.from(map.values()).map(x=>Object.assign(x,{margin:x.contributionRevenue?x.contribution/x.contributionRevenue*100:null})).sort((a,b)=>b.contribution-a.contribution);
  }
  function aggregateSubjects(rows){
    const map=new Map();
    rows.forEach(r=>{
      const name=String(r.subject||'Deleted subject').trim()||'Deleted subject';
      const key=name.toLocaleLowerCase();
      let x=map.get(key);
      if(!x){x={id:key,name,categorySet:new Set(),sessions:0,units:0,present:0,absent:0,revenue:0,cost:0,contribution:0,contributionRevenue:0};map.set(key,x);}
      x.categorySet.add(r.category||'Uncategorised');
      x.sessions++;x.units+=r.count;
      if(r.status==='Present')x.present++;if(r.status==='Absent')x.absent++;
      if(r.revenue!==null)x.revenue+=r.revenue;
      if(r.cost!==null)x.cost+=r.cost;
      if(r.contribution!==null){x.contribution+=r.contribution;x.contributionRevenue+=r.revenue;}
    });
    return Array.from(map.values()).map(x=>({
      ...x,
      category:x.categorySet.size===1?Array.from(x.categorySet)[0]:'Multiple',
      margin:x.contributionRevenue?x.contribution/x.contributionRevenue*100:null
    })).sort((a,b)=>b.contribution-a.contribution);
  }
  function payrollRows(){return data.payroll.filter(r=>monthInRange(r.month));}
  function previousPayrollMonth(){const d=new Date(state.to+'-01T00:00:00');d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7);}
  function payrollByTeacher(){
    const map=new Map();
    data.payroll.filter(r=>monthOf(r.month)===previousPayrollMonth()).forEach(r=>{const id=String(r.teacher_id);let x=map.get(id)||{paid:0,adjustment:0,paidRows:0,missingPaidAmount:0};if(r.paid){x.paidRows++;if(r.paid_amount==null)x.missingPaidAmount++;else x.paid+=Number(r.paid_amount)||0;}x.adjustment+=Number(r.adjustment)||0;map.set(id,x);});
    return map;
  }
  function cashRows(){return data.subscriptions.filter(r=>monthInRange(r.date)&&(r.kind==='Payment'||r.kind==='Refund'));}
  function expenseRows(){return data.expenses.filter(r=>monthInRange(r.expense_date));}
  function metrics(rows){
    const x={sessions:rows.length,units:0,present:0,absent:0,revenue:0,cost:0,contribution:0,contributionRevenue:0,missingFee:0,missingCost:0,zeroCost:0,fullyRatedUnits:0};
    rows.forEach(r=>{x.units+=r.count;if(r.status==='Present')x.present++;if(r.status==='Absent')x.absent++;if(r.revenue===null)x.missingFee+=r.count;else x.revenue+=r.revenue;if(r.cost===null)x.missingCost+=r.count;else x.cost+=r.cost;if(r.teacherRate===0)x.zeroCost+=r.count;if(r.contribution!==null){x.contribution+=r.contribution;x.contributionRevenue+=r.revenue;x.fullyRatedUnits+=r.count;}});
    x.margin=x.contributionRevenue?x.contribution/x.contributionRevenue*100:0;return x;
  }
  function cell(v){return '<td>'+esc(v)+'</td>';}
  function table(headers,rows,empty){
    return '<div class="ri-table-wrap"><table class="ri-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr>'+r.map(cell).join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'" class="ri-empty">'+esc(empty||'No records for this period.')+'</td></tr>')+'</tbody></table></div>';
  }
  function metric(label,value,note){return '<article class="ri-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>';}
  function options(items,selected,label){return '<option value="all">All '+esc(label)+'</option>'+items.map(x=>'<option value="'+esc(x.id)+'"'+(String(x.id)===String(selected)?' selected':'')+'>'+esc(x.name)+'</option>').join('');}
  function trend(rows){
    const map=new Map();rows.forEach(r=>{let x=map.get(r.month)||{month:r.month,revenue:0,cost:0,contribution:0};if(r.revenue!==null)x.revenue+=r.revenue;if(r.cost!==null)x.cost+=r.cost;if(r.contribution!==null)x.contribution+=r.contribution;map.set(r.month,x);});
    const items=Array.from(map.values()).sort((a,b)=>a.month.localeCompare(b.month)).slice(-6);if(!items.length)return '<div class="ri-empty">No attendance in the selected period.</div>';
    const max=Math.max(1,...items.map(x=>Math.max(x.revenue,x.cost,x.contribution)));
    return '<div class="ri-trend">'+items.map(x=>'<div class="ri-trend-row"><span>'+esc(new Date(x.month+'-01T00:00:00').toLocaleDateString('en-IN',{month:'short',year:'2-digit'}))+'</span><div class="ri-trend-bars"><i class="revenue" style="width:'+(x.revenue/max*100)+'%"></i><i class="cost" style="width:'+(x.cost/max*100)+'%"></i><i class="contribution" style="width:'+(x.contribution/max*100)+'%"></i></div><b>'+money(x.contribution)+'</b></div>').join('')+'</div><div class="ri-legend"><span><i class="revenue"></i>Fee value</span><span><i class="cost"></i>Teacher cost</span><span><i class="contribution"></i>Gross contribution</span></div>';
  }
  function renderOverview(rows,t){
    const cash=cashRows().reduce((a,r)=>a+(Number(r.amount_paid)||0),0),payroll=payrollRows().filter(r=>r.paid&&r.paid_amount!=null).reduce((a,r)=>a+(Number(r.paid_amount)||0),0);
    const mix=new Map();rows.forEach(r=>{const k=r.classType+' · '+r.mode;let x=mix.get(k)||{label:k,units:0,revenue:0,cost:0,contribution:0};x.units+=r.count;if(r.revenue!==null)x.revenue+=r.revenue;if(r.cost!==null)x.cost+=r.cost;if(r.contribution!==null)x.contribution+=r.contribution;mix.set(k,x);});
    const mixRows=Array.from(mix.values()).sort((a,b)=>a.label.localeCompare(b.label)).map(x=>[x.label,number.format(x.units),money(x.revenue),money(x.cost),money(x.contribution)]);
    return '<section class="ri-metrics">'+metric('Fee value of consumed classes',money(t.revenue),'Effective student fee × class count')+metric('Teacher delivery cost',money(t.cost),'Teacher Maintenance rate × class count')+metric('Gross contribution',money(t.contribution),'Fee value less teacher delivery cost')+metric('Contribution margin',pct(t.margin),'Contribution ÷ fully rated fee value')+metric('Actual student collections',money(cash),'Period total; transaction-date basis')+metric('Actual teacher payroll paid',money(payroll),'Period total; all teachers')+'</section>'+
      '<section class="ri-panel"><h2>Contribution by class type and mode</h2><p>Attendance determines the class type and delivery mode.</p>'+table(['Class type · mode','Class units','Fee value','Teacher cost','Gross contribution'],mixRows,'No class mix in this period.')+'</section>'+
      '<section class="ri-panel"><h2>Monthly contribution trend</h2><p>Last six months within the selected period.</p>'+trend(rows)+'</section>'+
      '<section class="ri-note"><b>Calculation rules</b><p>Student revenue uses an effective-dated individual fee override where available; otherwise the app-level fee by subject category, class type and mode. Teacher cost uses the teacher-maintained rate for the same category, class type and mode. Each attendance row represents a student; Group teacher cost is therefore calculated per student per class. Both Present and Absent sessions count because both consume class credits. The attendance count (including fractional or multiple class units) multiplies both rates.</p><p>Actual collections and actual payroll paid are shown separately on a cash basis. Recorded expenses are not deducted from gross contribution. Missing rates are excluded from the relevant amount and listed under Data Quality.</p></section>';
  }
  function renderStudents(rows){
    return '<section class="ri-panel"><h2>Student profitability</h2><p>Contribution by student. Group teacher cost is calculated directly for each student attendance record.</p>'+table(['Student','Sessions','Class units','Fee value','Teacher cost','Gross contribution','Margin'],aggregate(rows,'studentId').map(x=>[x.name,x.sessions,number.format(x.units),money(x.revenue),money(x.cost),money(x.contribution),pct(x.margin)]),'No student attendance records.')+'</section>';
  }
  function renderTeachers(rows){
    const payroll=payrollByTeacher();
    return '<section class="ri-panel"><h2>Teacher profitability</h2><p>Projected cost is based on attendance recorded in the selected month so far and applicable teacher rates; it is not a forecast of the remaining month. Payroll paid is shown separately from current-month class profitability.</p>'+table(['Teacher','Sessions','Class units','Fee value','Projected cost – current month','Gross contribution','Payroll Paid – Previous Month','Payroll adjustment'],aggregate(rows,'teacherId').map(x=>{const p=payroll.get(x.id)||{paid:0,adjustment:0};return[x.name,x.sessions,number.format(x.units),money(x.revenue),money(x.cost),money(x.contribution),money(p.paid),money(p.adjustment)];}),'No teacher attendance records.')+'<div class="ri-note">Projected cost – current month = recorded attendance class units × applicable teacher rate. Gross contribution and margin use selected-month attendance and rates. Payroll figures are records marked Paid for the month immediately before the selected To month; they are shown separately from current-period class profitability.</div></section>';
  }
  function renderSubjects(rows){
    return '<section class="ri-panel"><h2>Subject profitability</h2><p>Subject-level contribution using each student’s applicable fee and the teacher’s maintained rate for the subject category.</p>'+table(['Subject','Category','Sessions','Class units','Fee value','Teacher cost','Gross contribution','Margin'],aggregateSubjects(rows).map(x=>[x.name,x.category,x.sessions,number.format(x.units),money(x.revenue),money(x.cost),money(x.contribution),pct(x.margin)]),'No subject attendance records.')+'</section>';
  }
  function renderPayrollReconciliation(){
    const paidInPeriod=data.payroll.filter(r=>r.paid&&r.paid_date&&monthInRange(r.paid_date));
    const unpaidCarry=data.payroll.filter(r=>!r.paid&&String(r.month)<state.from);
    const paidTotal=paidInPeriod.reduce((a,r)=>a+(Number(r.paid_amount)||0),0);
    const outstandingCount=unpaidCarry.length;
    const months=new Map();
    const add=(r,kind)=>{const key=String(r.month||'Unknown');let x=months.get(key)||{month:key,paid:0,paidCount:0,outstanding:0,outstandingCount:0,outstandingAmountMissing:false,adjustment:0};if(kind==='paid'){x.paid+=Number(r.paid_amount)||0;x.paidCount++;}else{x.outstanding+=Number(r.paid_amount)||0;x.outstandingCount++;if(r.paid_amount==null)x.outstandingAmountMissing=true;}x.adjustment+=Number(r.adjustment)||0;months.set(key,x);};
    paidInPeriod.forEach(r=>add(r,'paid'));unpaidCarry.forEach(r=>add(r,'outstanding'));
    const summary=Array.from(months.values()).sort((a,b)=>b.month.localeCompare(a.month)).map(x=>[x.month,x.paidCount,money(x.paid),x.outstandingCount,(x.outstandingAmountMissing?'Not recorded':money(x.outstanding)),money(x.adjustment)]);
    const details=paidInPeriod.map(r=>[r.month,(data.teacherById.get(String(r.teacher_id))||{}).name||'Unknown teacher',dateOf(r.paid_date),money(r.paid_amount),money(r.adjustment),r.paid_reference||'—']);
    const pending=unpaidCarry.map(r=>[r.month,(data.teacherById.get(String(r.teacher_id))||{}).name||'Unknown teacher','Not marked paid',(r.paid_amount==null?'Not recorded':money(r.paid_amount)),money(r.adjustment),'—']);
    return '<section class="ri-metrics">'+metric('Payroll paid in selected period',money(paidTotal),'Actual payment date falls within selected month range')+metric('Earlier-month payroll still unpaid',String(outstandingCount)+' records','Unpaid payroll records for delivery months before the selected period; amount not stored on unpaid records')+'</section>'+
      '<section class="ri-panel"><h2>Payroll & delivery-month reconciliation</h2><p>This view separates the month the classes were delivered (Payroll month) from the date the teacher was actually paid (Paid date). For example, a payroll record for October marked Paid on 5 November appears as October delivery payroll paid during November.</p>'+table(['Classes delivered in','Teachers paid in selected period','Amount paid in selected period','Unpaid teacher records','Outstanding amount','Payroll adjustments'],summary,'No payroll payments or earlier-month unpaid payroll records for this period.')+'</section>'+
      '<section class="ri-panel"><h2>Payments made in selected period</h2><p>Actual paid amounts, grouped by the payroll month they relate to.</p>'+table(['Delivery month','Teacher','Paid date','Paid amount','Adjustment','Payment reference'],details,'No teacher payroll payments were recorded in the selected payment period.')+'</section>'+
      '<section class="ri-panel"><h2>Earlier delivery months still unpaid</h2><p>Payroll records for months before the selected period that are not marked Paid. The payroll table does not store an amount until a record is marked Paid, so unpaid records are counted and listed but are not assigned an invented outstanding amount.</p>'+table(['Delivery month','Teacher','Status','Stored amount','Adjustment','Payment reference'],pending,'No earlier-month unpaid payroll records.')+'</section>'+
      '<div class="ri-note">This reconciliation uses teacher_payroll_records.month as the class-delivery/payroll month and paid_date as the cash-payment date. It does not infer payroll payment from attendance rates and does not change gross contribution or projected delivery cost.</div>';
  }
  function renderCash(){
    const collections=cashRows().sort((a,b)=>dateOf(b.date).localeCompare(dateOf(a.date))),payroll=payrollRows().sort((a,b)=>String(b.month).localeCompare(String(a.month))),expenses=expenseRows().sort((a,b)=>dateOf(b.expense_date).localeCompare(dateOf(a.expense_date)));
    const cash=collections.reduce((a,r)=>a+(Number(r.amount_paid)||0),0),paid=payroll.filter(r=>r.paid&&r.paid_amount!=null).reduce((a,r)=>a+(Number(r.paid_amount)||0),0),spent=expenses.reduce((a,r)=>a+(Number(r.amount)||0),0);
    return '<section class="ri-metrics">'+metric('Net student collections',money(cash),'Payments plus refunds')+metric('Teacher payroll paid',money(paid),'Only records marked Paid')+metric('Recorded expenses',money(spent),'Expenses register; not deducted from gross contribution')+'</section><div class="ri-note">Cash, payroll and expense totals are period-wide. Attendance filters do not reallocate these financial transactions.</div>'+
      '<section class="ri-panel"><h2>Student collections</h2><p>Cash receipts are based on Payment and Refund entries by transaction date, not class delivery date.</p>'+table(['Date','Student','Subject','Type','Amount','Reference'],collections.map(r=>[dateOf(r.date),(data.studentById.get(String(r.student_id))||{}).name||'Unknown student',(data.subjectById.get(String(r.subject_id))||{}).name||'—',r.kind,money(Number(r.amount_paid)||0),r.payment_reference||r.payment_remarks||'—']),'No payment or refund transactions.')+'</section>'+
      '<section class="ri-panel"><h2>Teacher payroll</h2><p>Monthly payment records; not assigned to individual students or subjects.</p>'+table(['Month','Teacher','Status','Paid amount','Adjustment','Paid date'],payroll.map(r=>[r.month,(data.teacherById.get(String(r.teacher_id))||{}).name||'Unknown teacher',r.paid?'Paid':'Not marked paid',money(r.paid_amount),money(r.adjustment),dateOf(r.paid_date)||'—']),'No payroll records.')+'</section>'+
      '<section class="ri-panel"><h2>Recorded expenses</h2><p>Shown for context only. This dashboard reports gross contribution, not full net profit.</p>'+table(['Date','Category','Amount','Notes'],expenses.map(r=>[dateOf(r.expense_date),r.category,money(r.amount),r.notes||'—']),'No recorded expenses.')+'</section>';
  }
  function renderQuality(rows){
    const issues=data.issues.filter(i=>monthInRange(i.row.date)&&(state.teacher==='all'||String(i.row.teacherId)===state.teacher)&&(state.student==='all'||String(i.row.studentId)===state.student)&&(state.subject==='all'||String(i.row.subjectId)===state.subject)&&(state.type==='all'||i.row.classType===state.type)&&(state.mode==='all'||i.row.mode===state.mode));
    const missingFee=issues.filter(i=>i.issue==='Missing app fee'||i.issue==='Missing subject category').length,missingTeacher=issues.filter(i=>i.issue==='Missing teacher rate'||i.issue==='Missing teacher').length,zero=issues.filter(i=>i.issue==='Zero teacher rate configured').length,invalid=issues.filter(i=>i.issue==='Invalid class count').length;
    return '<section class="ri-metrics">'+metric('Missing student fee',String(missingFee),'Attendance rows without fee rate')+metric('Missing teacher rate',String(missingTeacher),'Attendance rows without teacher rate')+metric('Zero teacher rate',String(zero),'Configured zero rates; verify intent')+metric('Invalid class count',String(invalid),'Rows excluded from rate multiplication')+'</section>'+
      '<section class="ri-panel"><h2>Financial data quality</h2><p>Resolve missing mappings or rates before relying on profitability totals.</p>'+table(['Issue','Date','Student','Teacher','Subject','Class type · mode','Class units'],issues.map(i=>[i.issue,i.row.date,i.row.student,i.row.teacher,i.row.subject,i.row.classType+' · '+i.row.mode,number.format(i.row.count)]),'No rate or class-count issues for this period.')+'</section>'+
      '<section class="ri-note"><b>Rate mapping</b><p>Student fee overrides are effective-dated and subject-specific. App fees and teacher payment rates are keyed by subject category, class type and delivery mode. Historical snapshots are taken from Audit Log where available.'+(data.auditWarning?' Audit Log history could not be read; current maintenance rates are used.':'')+'</p></section>';
  }
  function render(){
    const rows=filteredRows(),totals=metrics(rows),tabs=[['overview','Overview'],['students','Student Profitability'],['teachers','Teacher Profitability'],['subjects','Subject Profitability'],['cash','Collections & Costs'],['payroll-recon','Payroll Reconciliation'],['quality','Data Quality']];
    const body=state.tab==='students'?renderStudents(rows):state.tab==='teachers'?renderTeachers(rows):state.tab==='subjects'?renderSubjects(rows):state.tab==='cash'?renderCash():state.tab==='payroll-recon'?renderPayrollReconciliation():state.tab==='quality'?renderQuality(rows):renderOverview(rows,totals);
    const teachers=data.teachers.filter(x=>!x.archived).sort((a,b)=>a.name.localeCompare(b.name)),students=data.students.filter(x=>!x.archived).sort((a,b)=>a.name.localeCompare(b.name)),subjects=data.subjects.slice().sort((a,b)=>a.name.localeCompare(b.name));
    root.innerHTML='<main class="ri-shell"><header class="ri-header"><div><div class="ri-eyebrow">LIB EDUCATION · ADMIN ANALYTICS</div><h1>Revenue Intelligence</h1><p>Class-level fee value, teacher delivery cost and gross contribution.</p></div><button type="button" id="ri-refresh">Refresh</button></header>'+
      '<section class="ri-filters"><label>From month<input id="ri-from" type="month" value="'+esc(state.from)+'"></label><label>To month<input id="ri-to" type="month" value="'+esc(state.to)+'"></label>'+
      '<label>Teacher<select id="ri-teacher">'+options(teachers,state.teacher,'teachers')+'</select></label><label>Student<select id="ri-student">'+options(students,state.student,'students')+'</select></label><label>Subject<select id="ri-subject">'+options(subjects,state.subject,'subjects')+'</select></label>'+
      '<label>Class type<select id="ri-type"><option value="all">All types</option><option value="Group"'+(state.type==='Group'?' selected':'')+'>Group</option><option value="Individual"'+(state.type==='Individual'?' selected':'')+'>Individual</option></select></label>'+
      '<label>Mode<select id="ri-mode"><option value="all">Online + Offline</option><option value="Online"'+(state.mode==='Online'?' selected':'')+'>Online</option><option value="Offline"'+(state.mode==='Offline'?' selected':'')+'>Offline</option></select></label><button type="button" id="ri-export">Export class-level CSV</button></section>'+
      '<nav class="ri-tabs">'+tabs.map(x=>'<button type="button" data-tab="'+x[0]+'" class="'+(state.tab===x[0]?'active':'')+'">'+x[1]+'</button>').join('')+'</nav>'+
      ((totals.missingFee||totals.missingCost)?'<div class="ri-alert ri-warning">Some attendance class units have missing rates. Gross contribution includes only rows with both fee and teacher rates; see Data Quality.</div>':'')+
      body+'<footer class="ri-foot">Read-only report. Attendance is the source of truth for class type, delivery mode and class count. Present and Absent sessions are included; pending schedule rows are excluded. Cash collections, payroll payments and recorded expenses are separate from class-level gross contribution.</footer></main>';
    root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;render();}));
    ['from','to','teacher','student','subject','type','mode'].forEach(key=>{const el=document.getElementById('ri-'+key);if(el)el.addEventListener('change',ev=>{state[key]=ev.target.value;if(key==='from'&&state.from>state.to)state.to=state.from;if(key==='to'&&state.to<state.from)state.from=state.to;render();});});
    document.getElementById('ri-refresh').addEventListener('click',load);
    document.getElementById('ri-export').addEventListener('click',()=>exportCsv(rows));
  }
  function exportCsv(rows){
    const header=['Date','Student','Teacher','Subject','Category','Class type','Mode','Attendance status','Class units','Student fee rate','Fee source','Fee value','Teacher rate','Teacher rate source','Teacher cost','Gross contribution'];
    const records=rows.map(r=>[r.date,r.student,r.teacher,r.subject,r.category,r.classType,r.mode,r.status,r.count,r.feeRate==null?'':r.feeRate,r.feeSource,r.revenue==null?'':r.revenue,r.teacherRate==null?'':r.teacherRate,r.teacherRateSource,r.cost==null?'':r.cost,r.contribution==null?'':r.contribution]);
    const csv=[header].concat(records).map(row=>row.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download='lib-revenue-intelligence-'+state.from+'-to-'+state.to+'.csv';link.click();URL.revokeObjectURL(url);
  }
  async function load(){
    root.innerHTML='<main class="ri-shell"><div class="ri-loading">Loading attendance, fee rates and payroll records…</div></main>';
    const r=await Promise.all([
      readAll('sessions','id,date,student_id,teacher_id,subject_id,class_type,mode,status,count,created_at','date'),
      readAll('students','id,name,archived','name'),
      readAll('teachers','id,name,archived,rates','name'),
      readAll('subjects','id,name,category','name'),
      readAll('categories','id,name,archived','name'),
      readAll('student_fee_rates','id,student_id,subject_id,class_type,rate,offline_rate,from_date,to_date','from_date'),
      readAll('fee_settings','id,rates,updated_at','updated_at'),
      readAll('subscriptions','id,student_id,subject_id,classes,amount_paid,date,kind,payment_reference,payment_remarks,transfer_group_id,expires_on','date'),
      readAll('teacher_payroll_records','id,teacher_id,month,adjustment,paid,paid_date,paid_reference,paid_amount','month'),
      readAll('expenses','id,expense_date,category,amount,notes','expense_date'),
      readAudit('teachers'),readAudit('fee_settings')
    ]);
    data.sessions=r[0];data.students=r[1];data.teachers=r[2];data.subjects=r[3];data.categories=r[4];data.studentRates=r[5];
    data.feeSettings=r[6].slice().sort((a,b)=>String(a.updated_at).localeCompare(String(b.updated_at))).slice(-1)[0]||{};
    data.subscriptions=r[7];data.payroll=r[8];data.expenses=r[9];data.teacherRateHistory=r[10];data.feeRateHistory=r[11];
    data.teacherById=new Map(data.teachers.map(x=>[String(x.id),x]));data.studentById=new Map(data.students.map(x=>[String(x.id),x]));
    data.subjectById=new Map(data.subjects.map(x=>[String(x.id),x]));data.categoryById=new Map(data.categories.map(x=>[String(x.id),x]));
    data.teacherRateEvents=new Map();
    data.teacherRateHistory.forEach(e=>{const id=String(e.record_id);if(!data.teacherRateEvents.has(id))data.teacherRateEvents.set(id,[]);data.teacherRateEvents.get(id).push(e);});
    const built=buildRows();data.attendanceRows=built.rows;data.issues=built.issues;render();
  }
  async function init(){
    if(!window.supabase||!window.supabase.createClient){fail('Supabase client did not load. Refresh and try again.');return;}
    db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    try{
      const auth=await db.auth.getSession();
      if(auth.error||!auth.data||!auth.data.session){fail('Sign in to My LIB first, then open Revenue Intelligence.');return;}
      const profile=await db.from('profiles').select('role,archived').eq('id',auth.data.session.user.id).single();
      if(profile.error||!profile.data||profile.data.role!=='Admin'||profile.data.archived){fail('Access restricted. Revenue Intelligence is available to active Admin accounts only.');return;}
      await load();
    }catch(error){fail(error&&error.message?error.message:'Could not load Revenue Intelligence.');}
  }
  init();
})();