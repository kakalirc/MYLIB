// Reports & Exports module. Loaded before the main application script.
// Shared state and business-logic helpers intentionally remain in index.html.

function renderReports(only) {
  const balTotals = { grand: 0, totalUsed: 0, totalLeft: 0 };
  TYPES.forEach(ty => { balTotals[ty] = { sub:0, used:0, left:0 }; });

  const zeroBalanceRows = renewalRows();
  const zeroBalanceHtml = zeroBalanceRows.length ? `
    <div class="table-scroll"><table>
      <tr><th>Student</th><th>Subject</th><th>Type</th><th>Subscribed</th><th>Used</th><th>Remaining</th><th></th></tr>
      ${zeroBalanceRows.map(r=>`<tr><td>${esc(r.studentName)}</td><td>${esc(r.subjectName)}</td><td>${r.neverSubscribed ? '<span class="hint">Never subscribed</span>' : r.type}</td><td>${r.subscribed}</td><td>${r.used}</td><td class="low">${r.remaining}</td><td><button class="btn-small btn-primary" onclick="goToFeeCalculator('${r.studentId}','${r.subjectId}','${r.type}')">Request Fees</button>${aiRenewalHtml(r.studentId)}  </td></tr>`).join('')}
    </table></div>` : '<div class="empty">No active students currently need renewal.</div>';

  const pendingRequestRows = data.subscriptions.filter(s=>s.kind==='Request')
    .slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const pendingRequestsHtml = pendingFeeRequestsByFamilyHtml();

  let studentPoolForBalances = data.students;
  if (studentBalanceStatusFilter === 'active') studentPoolForBalances = studentPoolForBalances.filter(s=>!s.archived);
  else if (studentBalanceStatusFilter === 'archived') studentPoolForBalances = studentPoolForBalances.filter(s=>s.archived);
  // 'all' — no status filter applied

  // No teacher picked yet (the default) shows nothing; 'ALL' means every teacher (unscoped,
  // same as the original behavior); a specific id scopes both the student pool and every
  // balance number to that one teacher's own subjects.
  const balanceTeacherId = (studentBalanceTeacherFilter && studentBalanceTeacherFilter !== 'ALL') ? studentBalanceTeacherFilter : null;
  if (studentBalanceTeacherFilter === '') {
    studentPoolForBalances = [];
  } else if (balanceTeacherId) {
    const idsForTeacher = new Set(studentsForTeacher(balanceTeacherId).map(s=>s.id));
    studentPoolForBalances = studentPoolForBalances.filter(s=>idsForTeacher.has(s.id));
  }

  const studentBalanceCandidates = byName(studentPoolForBalances).map(s => {
    let totalUsed=0, totalLeft=0, grand=0;
    const perType = TYPES.map(ty=>{
      const sub=studentSubscribedAny(s.id,ty,balanceTeacherId), used=studentUsedAny(s.id,ty,balanceTeacherId), left=sub-used;
      totalUsed+=used; totalLeft+=left; grand+=sub;
      return { sub, used, left };
    });
    return { s, perType, totalUsed, totalLeft, grand };
  }).filter(r => {
    if (studentBalanceBalanceFilter === 'available') return r.totalLeft > 0;
    if (studentBalanceBalanceFilter === 'zero') return r.totalLeft === 0;
    if (studentBalanceBalanceFilter === 'negative') return r.totalLeft < 0;
    return true;
  });

  const studentBalanceStatusOptions = `
    <option value="active" ${studentBalanceStatusFilter==='active'?'selected':''}>Active students</option>
    <option value="archived" ${studentBalanceStatusFilter==='archived'?'selected':''}>Archived students</option>
    <option value="all" ${studentBalanceStatusFilter==='all'?'selected':''}>All students</option>`;
  const studentBalanceFilterOptions = `
    <option value="" ${studentBalanceBalanceFilter===''?'selected':''}>All balances</option>
    <option value="available" ${studentBalanceBalanceFilter==='available'?'selected':''}>Available balance</option>
    <option value="zero" ${studentBalanceBalanceFilter==='zero'?'selected':''}>Zero balance</option>
    <option value="negative" ${studentBalanceBalanceFilter==='negative'?'selected':''}>Negative balance</option>`;
  const studentBalanceTeacherOptions = `
    <option value="" ${studentBalanceTeacherFilter===''?'selected':''}>Pick a teacher…</option>
    <option value="ALL" ${studentBalanceTeacherFilter==='ALL'?'selected':''}>All teachers</option>
    ${byName(data.teachers).map(t=>`<option value="${t.id}" ${studentBalanceTeacherFilter===t.id?'selected':''}>${esc(teacherLabel(t))}${t.archived?' (archived)':''}</option>`).join('')}`;

  // ---- Students linked to Teachers ----
  const studentsByTeacherOptions = `
    <option value="" ${studentsByTeacherFilter===''?'selected':''}>Pick a teacher…</option>
    <option value="ALL" ${studentsByTeacherFilter==='ALL'?'selected':''}>All Teachers</option>
    ${byName(data.teachers).map(t=>`<option value="${t.id}" ${studentsByTeacherFilter===t.id?'selected':''}>${esc(teacherLabel(t))}${t.archived?' (archived)':''}</option>`).join('')}`;
  const teacherPoolForS4 = studentsByTeacherFilter === '' ? [] : (studentsByTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===studentsByTeacherFilter));
  const studentsByTeacherRows = [];
  const studentsByTeacherHtml = studentsByTeacherFilter === '' ? '<div class="empty">Pick a teacher above to see their students.</div>' : (byName(teacherPoolForS4).map(t => {
    let studentPool = studentsForTeacher(t.id);
    if (studentsByTeacherStatusFilter === 'active') studentPool = studentPool.filter(s=>!s.archived);
    else if (studentsByTeacherStatusFilter === 'archived') studentPool = studentPool.filter(s=>s.archived);
    studentPool = byName(studentPool);
    studentPool.forEach(s => studentsByTeacherRows.push({ teacher: t, student: s }));
    const listHtml = studentPool.length
      ? `<ul class="plain">${studentPool.map(s=>`<li>${esc(studentLabel(s))}${s.archived?' <span class="hint">(archived)</span>':''}</li>`).join('')}</ul>`
      : '<div class="empty" style="margin-bottom:10px">No matching students.</div>';
    return `<div style="margin-bottom:14px"><h3 style="margin-bottom:4px">${esc(teacherLabel(t))}</h3>${listHtml}</div>`;
  }).join('') || '<div class="empty">No teachers yet.</div>');

  // ---- Teachers linked to Students ----
  const teachersByStudentOptions = `
    <option value="" ${teachersByStudentFilter===''?'selected':''}>Pick a student…</option>
    <option value="ALL" ${teachersByStudentFilter==='ALL'?'selected':''}>All Students</option>
    ${byName(data.students).map(s=>`<option value="${s.id}" ${teachersByStudentFilter===s.id?'selected':''}>${esc(studentLabel(s))}${s.archived?' (archived)':''}</option>`).join('')}`;
  const studentPoolForS5 = teachersByStudentFilter === '' ? [] : (teachersByStudentFilter === 'ALL' ? data.students : data.students.filter(s=>s.id===teachersByStudentFilter));
  const teachersByStudentRows = [];
  const teachersByStudentHtml = teachersByStudentFilter === '' ? '<div class="empty">Pick a student above to see their teachers.</div>' : (byName(studentPoolForS5).map(s => {
    let teacherPool = teachersForStudent(s.id);
    if (teachersByStudentStatusFilter === 'active') teacherPool = teacherPool.filter(t=>!t.archived);
    else if (teachersByStudentStatusFilter === 'archived') teacherPool = teacherPool.filter(t=>t.archived);
    teacherPool = byName(teacherPool);
    teacherPool.forEach(t => teachersByStudentRows.push({ student: s, teacher: t }));
    const listHtml = teacherPool.length
      ? `<ul class="plain">${teacherPool.map(t=>`<li>${esc(teacherLabel(t))}${t.archived?' <span class="hint">(archived)</span>':''}</li>`).join('')}</ul>`
      : '<div class="empty" style="margin-bottom:10px">No matching teachers.</div>';
    return `<div style="margin-bottom:14px"><h3 style="margin-bottom:4px">${esc(studentLabel(s))}${s.archived?' <span class="hint">(archived)</span>':''}</h3>${listHtml}</div>`;
  }).join('') || '<div class="empty">No students yet.</div>');

  const studentRows = studentBalanceCandidates.length ? `
    <div class="table-scroll"><table>
      <tr><th rowspan="2" style="vertical-align:bottom">Student</th>
        ${TYPES.map(ty=>`<th colspan="3" style="text-align:center" class="cat-divider">${ty} classes</th>`).join('')}
        <th rowspan="2" style="vertical-align:bottom">Total used</th>
        <th rowspan="2" style="vertical-align:bottom">Total left</th>
        <th rowspan="2" style="vertical-align:bottom">Grand total</th></tr>
      <tr>${TYPES.map(()=>`<th>Sub</th><th>Used</th><th class="cat-divider">Left</th>`).join('')}</tr>
      ${studentBalanceCandidates.map(r=>{
        const s = r.s;
        TYPES.forEach((ty,i) => { balTotals[ty].sub+=r.perType[i].sub; balTotals[ty].used+=r.perType[i].used; balTotals[ty].left+=r.perType[i].left; });
        balTotals.totalUsed+=r.totalUsed; balTotals.totalLeft+=r.totalLeft; balTotals.grand+=r.grand;
        const cells = r.perType.map(p=>`<td>${p.sub}</td><td>${p.used}</td><td class="cat-divider ${p.left<=2?'low':'ok'}">${p.left}</td>`).join('');
        return `<tr><td>${esc(studentLabel(s))}${s.archived?' <span class="hint">(archived)</span>':''}</td>${cells}<td>${r.totalUsed}</td><td class="${r.totalLeft<=2?'low':'ok'}">${r.totalLeft}</td><td><b>${r.grand}</b></td></tr>`;
      }).join('')}
      <tr class="total">
        <td>All shown students</td>
        ${TYPES.map(ty=>`<td>${balTotals[ty].sub}</td><td>${balTotals[ty].used}</td><td class="cat-divider">${balTotals[ty].left}</td>`).join('')}
        <td>${balTotals.totalUsed}</td><td>${balTotals.totalLeft}</td><td>${balTotals.grand}</td>
      </tr>
    </table></div>` : (studentBalanceTeacherFilter==='' ? '<div class="empty">Pick a teacher above to see student balances.</div>' : '<div class="empty">No students match this filter.</div>');

  const monthSessions = data.sessions.filter(s=>s.date.startsWith(payrollMonth));
  const payrollTeacherPool = payrollTeacherFilter === '' ? [] : byName(payrollTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===payrollTeacherFilter));
  const payrollRows = payrollTeacherPool.map(t=>{
    const mine = monthSessions.filter(s=>s.teacherId===t.id);
    const byCatType = {};
    let pay = 0;
    let countedClasses = 0;
    let missingRateClasses = 0;
    const rateMap = {};
    const rateStudentsMap = {};
    categories.forEach(c=>{
      TYPES.forEach(ty=>{
        const inGroup = mine.filter(s=>{ const subj=subject(s.subjectId); return subj && subj.category===c.id && s.classType===ty; });
        const count = inGroup.reduce((a,s)=>a+s.count,0);
        byCatType[c.id+'_'+ty] = count;
        RATE_MODES.forEach(md => {
          const modeCount = inGroup.filter(s=>s.mode===md).reduce((a,s)=>a+s.count,0);
          if (modeCount <= 0) return;
          countedClasses += modeCount;
          const key = rateKey(c.id,ty,md);
          const savedRate = t.rates ? t.rates[key] : undefined;
          const numericRate = Number(savedRate);
          const hasRate = savedRate !== undefined && savedRate !== null && savedRate !== '' && Number.isFinite(numericRate);
          const rate = hasRate ? numericRate : 0;
          pay += modeCount * rate;
          if (!hasRate || !Number.isFinite(rate)) {
            missingRateClasses += modeCount;
          } else {
            rateMap[rate] = (rateMap[rate]||0) + modeCount;
            if (!rateStudentsMap[rate]) rateStudentsMap[rate] = {};
            inGroup.filter(s=>s.mode===md).forEach(session=>{
              const studentId = session.studentId;
              const student = data.students.find(st=>st.id===studentId);
              const studentName = student ? studentLabel(student) : 'Unknown student';
              const studentKey = studentId || studentName;
              rateStudentsMap[rate][studentKey] = rateStudentsMap[rate][studentKey] || { name: studentName, count: 0 };
              rateStudentsMap[rate][studentKey].count += Number(session.count)||0;
            });
          }
        });
      });
    });
    // Only configured rates appear in the rate-wise breakdown. Missing rates are
    // reported separately so they cannot be mistaken for an intentionally zero rate.
    const breakdown = Object.entries(rateMap).sort((a,b)=>Number(b[0])-Number(a[0]))
      .map(([rate,cnt])=>({
        rate: Number(rate), cnt, earn: Number(rate)*cnt,
        students: Object.values(rateStudentsMap[rate]||{}).sort((a,b)=>a.name.localeCompare(b.name))
      }));
    return { t, name: teacherLabel(t), byCatType, pay, breakdown, countedClasses, missingRateClasses, uncounted: payrollUncountedClasses(mine) };
  });
  // Include demo bonuses (Converted, in the selected month) in each teacher's payroll row
  payrollRows.forEach(r => {
    if (r.t) {
      const demoLines = data.demoLogs.filter(d => d.teacherId === r.t.id && d.status === 'Converted' && (d.convertedAt || d.date||'').startsWith(payrollMonth))
        .map(d => ({ studentName: d.studentName || (d.linkedStudentId ? (data.students.find(s=>s.id===d.linkedStudentId)||{name:'?'}).name : 'Unknown'), amount: d.bonusAmount }));
      r.demoLines = demoLines;
      r.bonus = demoLines.reduce((a,l)=>a+l.amount,0);
      r.pay += r.bonus;
      // Adjustment from payroll record
      const pr = payrollRecord(r.t.id, payrollMonth);
      r.adjustment = pr ? pr.adjustment : 0;
      r.adjustmentNote = pr ? pr.adjustmentNote : '';
      r.paid = pr ? pr.paid : false;
      r.paidDate = pr ? pr.paidDate : '';
      r.paidReference = pr ? pr.paidReference : '';
      r.paidAmount = pr && pr.paid && pr.paidAmount != null ? pr.paidAmount : null;
      r.net = r.pay + r.adjustment;
    } else {
      r.demoLines = []; r.bonus = 0; r.adjustment = 0; r.adjustmentNote = ''; r.paid = false; r.paidDate = ''; r.paidReference = ''; r.net = r.pay;
    }
  });
  const grandTotal = payrollRows.reduce((a,r)=>a+r.net,0);

  // ---- Net profit for a month or a financial year: total fee collection minus total teacher payroll ----
  // Has its own independent teacher filter (separate from the Teacher payroll report's
  // filter above) — when a specific teacher is picked, both collection and payroll are
  // scoped to just that teacher's subjects; "All Teachers" gives the whole-institute figure.
  const netProfitTeacherPool = netProfitTeacherFilter === '' ? [] : byName(netProfitTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===netProfitTeacherFilter));
  const netProfitTeacherOptions = `
    <option value="" ${netProfitTeacherFilter===''?'selected':''}>Pick a teacher…</option>
    <option value="ALL" ${netProfitTeacherFilter==='ALL'?'selected':''}>All Teachers</option>
    ${byName(data.teachers).map(t=>`<option value="${t.id}" ${netProfitTeacherFilter===t.id?'selected':''}>${esc(teacherLabel(t))}${t.archived?' (archived)':''}</option>`).join('')}`;
  const netProfitFYRange = fyDateRange(netProfitFY);
  const netProfitInRange = (d) => netProfitViewMode === 'fy'
    ? (d && d >= netProfitFYRange.start && d <= netProfitFYRange.end)
    : (d || '').startsWith(netProfitMonth);
  let netProfitCollection = 0, netProfitPayroll = 0, netProfitExpenses = 0, netProfitValue = 0;
  if (netProfitTeacherPool.length) {
    const scopedSubjectIds = new Set(data.subjects.filter(s=>netProfitTeacherPool.some(t=>t.id===s.teacherId)).map(s=>s.id));
    netProfitCollection = data.subscriptions
      .filter(s => (s.kind === 'Payment' || s.kind === 'Refund') && netProfitInRange(s.date) && scopedSubjectIds.has(s.subjectId))
      .reduce((a,s)=>a+(s.amountPaid||0), 0);
    const netProfitMonthSessions = data.sessions.filter(s=>netProfitInRange(s.date));
    netProfitTeacherPool.forEach(t => {
      const mine = netProfitMonthSessions.filter(s=>s.teacherId===t.id);
      categories.forEach(c => {
        TYPES.forEach(ty => {
          const inGroup = mine.filter(s=>{ const subj=subject(s.subjectId); return subj && subj.category===c.id && s.classType===ty; });
          RATE_MODES.forEach(md => {
            const modeCount = inGroup.filter(s=>s.mode===md).reduce((a,s)=>a+s.count,0);
            netProfitPayroll += modeCount * (t.rates[rateKey(c.id,ty,md)]||0);
          });
        });
      });
      // Same extras as the Teacher payroll card: converted-demo bonuses and the month's +/- adjustment.
      netProfitPayroll += data.demoLogs
        .filter(d => d.teacherId === t.id && d.status === 'Converted' && netProfitInRange((d.convertedAt || d.date || '').slice(0, 10)))
        .reduce((a, d) => a + (d.bonusAmount || 0), 0);
      netProfitPayroll += data.teacherPayrollRecords
        .filter(r => r.teacherId === t.id && netProfitInRange(r.month + '-01'))
        .reduce((a, r) => a + (r.adjustment || 0), 0);
    });
    // Institute-wide expenses (rent and so on) don't belong to any one teacher, so they are
    // only counted for the whole-institute view.
    if (netProfitTeacherFilter === 'ALL') {
      netProfitExpenses = expenseList.filter(e => netProfitInRange(e.date)).reduce((a,e)=>a+e.amount, 0);
    }
    netProfitValue = netProfitCollection - netProfitPayroll - netProfitExpenses;
  }

  const payrollTeacherOptions = `
    <option value="" ${payrollTeacherFilter===''?'selected':''}>Pick a teacher…</option>
    <option value="ALL" ${payrollTeacherFilter==='ALL'?'selected':''}>All Teachers</option>
    ${byName(data.teachers).map(t=>`<option value="${t.id}" ${payrollTeacherFilter===t.id?'selected':''}>${esc(teacherLabel(t))}${t.archived?' (archived)':''}</option>`).join('')}`;

  const payrollHtml = payrollTeacherPool.length ? `
    <div class="row-form" style="margin-bottom:6px"><button class="btn-small" onclick="togglePayrollDetails()">${payrollShowDetails ? 'Hide' : 'Show'} class type &amp; category breakdown</button></div>
    <div class="table-scroll"><table class="no-stack">
      ${payrollShowDetails ? `
      <tr><th rowspan="2" style="vertical-align:bottom">Teacher</th>
        ${categories.map(c=>`<th colspan="${TYPES.length}" style="text-align:center">${c.name}</th>`).join('')}
        <th rowspan="2" style="vertical-align:bottom">Payable</th>
        <th rowspan="2" style="vertical-align:bottom">Adjustment</th>
        <th rowspan="2" style="vertical-align:bottom">Net</th>
        <th rowspan="2" style="vertical-align:bottom">Status</th></tr>
      <tr>${categories.map(()=>TYPES.map(ty=>`<th>${ty}</th>`).join('')).join('')}</tr>
      ${payrollRows.map(r=>`
        <tr><td>${esc(r.name)}</td>${categories.map(c=>TYPES.map(ty=>`<td>${r.byCatType[c.id+'_'+ty]}</td>`).join('')).join('')}
          <td>${r.pay.toFixed(2)}</td>
          <td style="color:${r.adjustment<0?'var(--brick)':r.adjustment>0?'var(--forest)':'inherit'}">${r.adjustment!==0?(r.adjustment>0?'+':'')+r.adjustment.toFixed(2):'-'}</td>
          <td><b>₹${r.net.toFixed(2)}</b></td>
          <td>${r.paid?'<span class="tag" style="background:var(--forest);color:#fff">✓ Paid</span>':'<span class="tag absent">Unpaid</span>'}</td></tr>
      `).join('')}
      <tr class="total"><td colspan="${categories.length*TYPES.length+1}">Total net payable</td><td></td><td>₹${grandTotal.toFixed(2)}</td><td></td></tr>
      ` : `
      <tr><th>Teacher</th><th style="text-align:right">Payable</th><th>Calculation</th><th>Adjustment</th><th style="text-align:right">Net payable</th><th>Status</th></tr>
      ${payrollRows.map(r=>{
        const tid = r.t ? r.t.id : '';
        const adjDraft = payrollAdjDraft[tid] || {};
        const adjAmount = adjDraft.amount !== undefined ? adjDraft.amount : (r.adjustment !== 0 ? r.adjustment : '');
        const adjNote   = adjDraft.note   !== undefined ? adjDraft.note   : r.adjustmentNote;
        const isMarkingPaid = payrollMarkingPaidId === tid;
        const adjHtml = `<div style="display:flex;flex-direction:column;gap:4px;min-width:160px">
          <input type="number" step="0.01" placeholder="0 (+ bonus / − deduct)" value="${escAttr(String(adjAmount))}"
            style="width:100%;font-size:12px;padding:3px 6px"
            oninput="(function(el){if(!payrollAdjDraft['${tid}'])payrollAdjDraft['${tid}']={};payrollAdjDraft['${tid}'].amount=el.value;})(this)"
            onblur="savePayrollAdjustment('${tid}')">
          <input type="text" placeholder="Reason (optional)" value="${escAttr(adjNote)}"
            style="width:100%;font-size:11px;padding:2px 6px"
            oninput="(function(el){if(!payrollAdjDraft['${tid}'])payrollAdjDraft['${tid}']={};payrollAdjDraft['${tid}'].note=el.value;})(this)"
            onblur="savePayrollAdjustment('${tid}')">
          ${r.adjustment !== 0 ? `<span style="font-size:11px;color:${r.adjustment<0?'var(--brick)':'var(--forest)'}">${r.adjustment>0?'+':''}₹${r.adjustment.toFixed(2)}${r.adjustmentNote?' — '+esc(r.adjustmentNote):''}</span>` : ''}
        </div>`;
        const statusHtml = r.paid
          ? `<div style="display:flex;flex-direction:column;gap:3px">
              <span class="tag" style="background:var(--forest);color:#fff;white-space:nowrap">✓ Paid${r.paidDate?' '+r.paidDate:''}</span>
              ${r.paidReference?`<span style="font-size:11px;color:var(--hint)">${esc(r.paidReference)}</span>`:''}
              ${r.paidAmount != null && Math.abs(r.paidAmount - r.net) > 0.005 ? `<span style="font-size:11px;color:var(--brick)">⚠ Paid ₹${r.paidAmount.toFixed(2)}; classes changed since, now ₹${r.net.toFixed(2)}</span>` : ''}
              <button class="btn-small" style="font-size:10px" onclick="printSalarySlip('${tid}','${payrollMonth}')">📄 Salary Slip</button>
              ${payrollUndoPaidId === tid
                ? `<div style="display:flex;flex-direction:column;gap:4px;padding:6px 0">
                    <span style="font-size:11px;color:var(--brick)">Reverse this payment?</span>
                    <div style="display:flex;gap:6px">
                      <button class="btn-small" style="color:var(--brick);border-color:var(--brick)" onclick="markPayrollUnpaid('${tid}')">Yes, reverse</button>
                      <button class="btn-small" onclick="cancelPayrollUndoPaid()">Cancel</button>
                    </div>
                  </div>`
                : `<button class="btn-small" style="font-size:10px;color:var(--brick);border-color:var(--brick)" onclick="startPayrollUndoPaid('${tid}')">Reverse</button>`}
            </div>`
          : isMarkingPaid
            ? `<div style="display:flex;flex-direction:column;gap:4px;min-width:160px;padding:8px;border:1px solid var(--forest);border-radius:6px;background:rgba(60,94,66,0.06)">
                <b style="font-size:12px">Confirm payment</b>
                <label style="font-size:12px">Date <input type="date" id="prPaidDate_${tid}" value="${todayStr}" style="width:130px"></label>
                <label style="font-size:12px">Reference <input type="text" id="prPaidRef_${tid}" placeholder="UPI / cash / cheque…" style="width:130px"></label>
                <div style="display:flex;gap:6px">
                  <button class="btn-small btn-primary" onclick="confirmPayrollMarkPaid('${tid}')">Mark Paid</button>
                  <button class="btn-small" onclick="cancelPayrollMarkPaid()">Cancel</button>
                </div>
              </div>`
            : `<div style="display:flex;flex-direction:column;gap:4px">
                <button class="btn-small btn-primary" onclick="startPayrollMarkPaid('${tid}')">Mark Paid</button>
                <button class="btn-small" style="font-size:10px" onclick="printSalarySlip('${tid}','${payrollMonth}')">📄 Salary Slip</button>
              </div>`;
        return `<tr style="vertical-align:top">
          <td>${esc(r.name)}</td>
          <td style="text-align:right;white-space:nowrap">₹${r.pay.toFixed(2)}</td>
          <td style="font-size:12px;color:var(--hint);padding-left:8px">
            ${r.breakdown.map(b=>`${fmtN(b.cnt)} × ₹${b.rate} = ₹${b.earn.toFixed(2)}${b.students.length ? `<br><span style="display:block;padding-left:10px;font-size:11px;color:var(--muted)">${b.students.map(st=>`${esc(st.name)} (${fmtN(st.count)})`).join(', ')}</span>` : ''}`).join('<br>')}
            ${r.demoLines && r.demoLines.length ? r.demoLines.map(l=>`<br><span style="color:var(--forest)">+ ₹${l.amount.toFixed(0)} demo bonus — ${esc(l.studentName)}</span>`).join('') : ''}
            ${r.demoLines && r.demoLines.length ? `<br><b style="color:var(--ink)">= ₹${r.pay.toFixed(0)} total</b>` : ''}
            ${r.countedClasses===0 ? '<span style="color:var(--muted)">No attendance recorded for this month.</span>' : ''}
            ${r.missingRateClasses>0 ? `<br><span style="color:var(--brick)">⚠ Rate missing for ${fmtN(r.missingRateClasses)} class${r.missingRateClasses===1?'':'es'} — check Teacher Maintenance.</span>` : ''}
            ${r.uncounted ? `<br><span style="color:var(--brick)">⚠ ${fmtN(r.uncounted)} class${r.uncounted===1?'':'es'} not counted — subject or category missing</span>` : ''}
          </td>
          <td>${adjHtml}</td>
          <td style="text-align:right;white-space:nowrap"><b>₹${r.net.toFixed(2)}</b></td>
          <td>${statusHtml}</td>
        </tr>`;
      }).join('')}
      <tr class="total"><td colspan="4">Total net payable</td><td style="text-align:right">₹${grandTotal.toFixed(2)}</td><td></td></tr>
      `}
    </table></div>` : (payrollTeacherFilter==='' ? '<div class="empty">Pick a teacher above to see their payroll.</div>' : '<div class="empty">No teachers yet.</div>');

  const classesPerTeacherMonthSessions = data.sessions.filter(s => {
    if (!s.date.startsWith(classesPerTeacherMonth)) return false;
    if (classesPerTeacherTypeFilter && s.classType !== classesPerTeacherTypeFilter) return false;
    if (classesPerTeacherModeFilter && s.mode !== classesPerTeacherModeFilter) return false;
    return true;
  });
  const classesPerTeacherPool = classesPerTeacherFilter === '' ? [] : byName(classesPerTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===classesPerTeacherFilter));
  const teacherClassRows = classesPerTeacherPool.map(t => {
    const mine = classesPerTeacherMonthSessions.filter(s=>s.teacherId===t.id);
    const present = mine.filter(s=>s.status==='Present');
    const byType = {};
    let totalPresent = 0;
    TYPES.forEach(ty => { const c = present.filter(s=>s.classType===ty).reduce((a,s)=>a+s.count,0); byType[ty]=c; totalPresent+=c; });
    const totalAbsent = mine.filter(s=>s.status==='Absent').reduce((a,s)=>a+s.count,0);
    const distinctStudents = new Set(present.map(s=>s.studentId)).size;
    return { name: teacherLabel(t), byType, totalPresent, totalAbsent, grandTotal: totalPresent + totalAbsent, distinctStudents };
  });
  const classGrand = { totalPresent: teacherClassRows.reduce((a,r)=>a+r.totalPresent,0), totalAbsent: teacherClassRows.reduce((a,r)=>a+r.totalAbsent,0) };
  classGrand.grandTotal = classGrand.totalPresent + classGrand.totalAbsent;
  TYPES.forEach(ty => { classGrand[ty] = teacherClassRows.reduce((a,r)=>a+r.byType[ty],0); });

  const classesPerTeacherOptions = `
    <option value="" ${classesPerTeacherFilter===''?'selected':''}>Pick a teacher…</option>
    <option value="ALL" ${classesPerTeacherFilter==='ALL'?'selected':''}>All Teachers</option>
    ${byName(data.teachers).map(t=>`<option value="${t.id}" ${classesPerTeacherFilter===t.id?'selected':''}>${esc(teacherLabel(t))}${t.archived?' (archived)':''}</option>`).join('')}`;

  const teacherClassHtml = teacherClassRows.length ? `
    <div class="table-scroll"><table class="no-stack">
      <tr><th>Teacher</th>${TYPES.map(ty=>`<th>${ty} (Present)</th>`).join('')}<th>Total Present</th><th>Total Absent</th><th>Grand Total</th><th>Students taught</th></tr>
      ${teacherClassRows.map(r=>`
        <tr><td>${esc(r.name)}</td>${TYPES.map(ty=>`<td>${r.byType[ty]}</td>`).join('')}<td><b>${r.totalPresent}</b></td><td${r.totalAbsent>0?' style="color:var(--brick)"':''}>${r.totalAbsent}</td><td>${r.grandTotal}</td><td>${r.distinctStudents}</td></tr>
      `).join('')}
      <tr class="total"><td>All shown teachers</td>${TYPES.map(ty=>`<td>${classGrand[ty]}</td>`).join('')}<td>${classGrand.totalPresent}</td><td>${classGrand.totalAbsent}</td><td>${classGrand.grandTotal}</td><td></td></tr>
    </table></div>` : (classesPerTeacherFilter==='' ? '<div class="empty">Pick a teacher above to see their class counts.</div>' : (classesPerTeacherFilter==='ALL' ? '<div class="empty">No teachers yet.</div>' : '<div class="empty">No matching classes for this teacher.</div>'));

  // ---- teacher-wise attendance register: month + teacher filter (pick first) ----
  const registerTeacherPool = registerTeacherFilter === '' ? [] : byName(registerTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===registerTeacherFilter));
  const registerTeacherOptions = `
    <option value="" ${registerTeacherFilter===''?'selected':''}>Pick a teacher…</option>
    <option value="ALL" ${registerTeacherFilter==='ALL'?'selected':''}>All Teachers</option>
    ${byName(data.teachers).map(t=>`<option value="${t.id}" ${registerTeacherFilter===t.id?'selected':''}>${esc(teacherLabel(t))}${t.archived?' (archived)':''}</option>`).join('')}`;
  const registerHtml = registerTeacherFilter === '' ? '<div class="empty">Pick a teacher above to see their attendance register.</div>' : (registerTeacherPool.length ? registerTeacherPool.map(t => {
    const entries = teacherRegisterEntries(t.id, registerMonth);
    const body = entries.length ? `
      <div class="table-scroll"><table>
        <tr><th>Date</th><th>Student</th><th>Subject</th><th>Type</th><th>Mode</th><th>Status</th><th>Classes</th></tr>
        ${entries.map(e=>`
          <tr>
            <td>${dayDate(e.date)}${savedAtHtml(e.createdAt, e.date)}</td><td>${esc(e.studentName)}</td><td>${esc(e.subjectName)}</td>
            <td>${e.classType}</td><td>${e.mode}</td>
            <td>${e.status==='Present' ? '<span class="tag">Present</span>' : '<span class="tag absent">Absent</span>'}</td>
            <td>${e.count}</td>
          </tr>`).join('')}
      </table></div>` : '<div class="empty">No classes logged for this teacher this month.</div>';
    return `<h3>${esc(teacherLabel(t))}</h3>${body}`;
  }).join('') : '<div class="empty">No teachers yet.</div>');


  const reportStudentOptions = `<option value="">Select a student…</option>` + byName(data.students).map(s=>{const lb=subjectsForStudent(s.id).flatMap(subj=>TYPES.filter(ty=>data.subscriptions.some(p=>p.studentId===s.id&&p.subjectId===subj.id&&p.type===ty&&['Payment','TransferIn'].includes(p.kind))).map(ty=>studentRemaining(s.id,subj.id,ty))).reduce((a,v)=>Math.min(a,v),Infinity);const bal=isFinite(lb)?` [${lb<=0?'⚠ ':' '}${lb}]`:'';return `<option value="${s.id}" ${reportStudentId===s.id?'selected':''}>${esc(studentLabel(s))}${bal}</option>`;}).join('');
  let studentReportHtml = '<div class="hint">Pick a student and month above to see their attendance, balances, and payment history.</div>';
  if (reportStudentId) {
    const rStudent = data.students.find(s=>s.id===reportStudentId);
    if (rStudent) {
      const rMonthSessions = data.sessions.filter(s=>s.studentId===reportStudentId && s.date.startsWith(reportMonth)).sort((a,b)=>a.date.localeCompare(b.date));
      const attHtml = rMonthSessions.length ? `
        <div class="table-scroll"><table>
          <tr><th>Date</th><th>Subject</th><th>Teacher</th><th>Type</th><th>Mode</th><th>Status</th><th>Classes</th></tr>
          ${rMonthSessions.map(s=>`
            <tr>
              <td>${dayDate(s.date)}${savedAtHtml(s.createdAt, s.date)}</td><td>${esc(subjectName(s.subjectId))}</td><td>${esc(teacherNameWithCode(s.teacherId))}</td>
              <td>${s.classType}</td><td>${s.mode}</td>
              <td>${s.status==='Present' ? '<span class="tag">Present</span>' : '<span class="tag absent">Absent</span>'}</td>
              <td>${s.count}</td>
            </tr>`).join('')}
        </table></div>` : '<div class="empty">No classes recorded for this month.</div>';

      const rEnrolledSubjects = byName(subjectsForStudent(reportStudentId));
      const rBalRows = rEnrolledSubjects.length ? rEnrolledSubjects.map(subj => TYPES.map(ty=>{
        const sub=studentSubscribed(reportStudentId,subj.id,ty), used=studentUsed(reportStudentId,subj.id,ty), left=sub-used;
        if (sub===0 && used===0) return '';
        return `<tr><td>${esc(subj.name)}</td><td>${ty}</td><td>${sub}</td><td>${used}</td><td class="${left<=2?'low':'ok'}">${left}</td></tr>`;
      }).join('')).join('') : '<tr><td colspan="5" class="hint">Not enrolled in any subject.</td></tr>';

      const rPayments = allSubscriptionRows().filter(r=>r.studentId===reportStudentId);
      const rTransfers = transferHistoryRows(reportStudentId);
      const rPaymentsHtml = (rPayments.length || rTransfers.length) ? `
        <div class="table-scroll"><table>
          <tr><th>Subject</th><th>Type</th><th>Classes</th><th>Amount</th><th>Date</th><th>Status</th><th>Used</th><th>Remaining</th><th>Reference</th></tr>
          ${rPayments.map(r=>`
            <tr${r.status==='Refund'?' style="color:var(--brick)"':''}><td>${esc(r.subjectName)}</td><td>${r.type}</td><td>${r.classes}</td><td>${(r.amountPaid||0).toFixed(2)}</td><td>${r.date||'—'}${savedAtHtml(r.createdAt, r.date)}</td>
              <td>${subscriptionStatusCellHtml(r)}</td><td>${r.status==='Refund'?'—':r.usedHere}</td><td>${r.status==='Refund'?'—':r.remainingHere}</td><td>${r.paymentReference?esc(r.paymentReference):'<span class="hint">—</span>'}</td></tr>`).join('')}
          ${transferRowsHtml(rTransfers, 9, false)}
        </table></div>` : '<div class="empty">No subscription payments recorded yet.</div>';

      studentReportHtml = `
        <h3 style="margin-top:0">Attendance — ${reportMonth}</h3>
        ${attHtml}
        <h3>Subscription balances</h3>
        <div class="table-scroll"><table><tr><th>Subject</th><th>Type</th><th>Subscribed</th><th>Used</th><th>Remaining</th></tr>${rBalRows}</table></div>
        <h3>Payment history</h3>
        ${rPaymentsHtml}
        <div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportStudentReport()">Export this report</button></div>
      `;
    }
  }

  // ---- refunds issued report ----
  const refundRows = allSubscriptionRows().filter(r => r.status === 'Refund' && (r.date||'').startsWith(refundReportMonth));
  const refundTotalClasses = refundRows.reduce((a,r)=>a+Math.abs(r.classes),0);
  const refundTotalAmount = refundRows.reduce((a,r)=>a+Math.abs(r.amountPaid||0),0);
  const refundsHtml = refundRows.length ? `
    <div class="table-scroll"><table>
      <tr><th>Student</th><th>Subject</th><th>Type</th><th>Classes refunded</th><th>Amount refunded</th><th>Date</th></tr>
      ${refundRows.map(r=>`<tr><td>${esc(r.studentName)}</td><td>${esc(r.subjectName)}</td><td>${r.type}</td><td>${Math.abs(r.classes)}</td><td>${Math.abs(r.amountPaid||0).toFixed(2)}</td><td>${r.date||'—'}${savedAtHtml(r.createdAt, r.date)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">Total</td><td>${refundTotalClasses}</td><td>${refundTotalAmount.toFixed(2)}</td><td></td></tr>
    </table></div>` : '<div class="empty">No refunds issued this month.</div>';

  const payrollCardHtml = `
    <div class="card">
      <h2>Teacher payroll <button class="help-btn" onclick="openHelp('payroll',event)">?</button></h2>
      <div class="row-form">
        <input type="month" value="${payrollMonth}" onchange="setPayrollMonth(this.value)">
        <input type="text" id="payrollTeacherSearchBox" placeholder="Search by name, ID, or mobile…" oninput="filterPayrollTeacherPicker()" style="width:200px">
        <select id="payrollTeacherPickerSelect" onchange="setPayrollTeacherFilter(this.value)">${payrollTeacherOptions}</select>
      </div>
      ${payrollMsg ? `<div class="hint" style="color:var(--brick);margin-bottom:8px">${esc(payrollMsg)}</div>` : ''}
      ${payrollHtml}
      ${payrollTeacherPool.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportTeacherPayroll()">Export Teacher Payroll report</button>${payrollTeacherPool.length > 1 ? `<button class="btn-small" onclick="printAllSalarySlips()">📄 Print all salary slips</button>` : ''}</div>` : ''}
    </div>
  `;
  if (only === 'payroll') return payrollCardHtml;
  return `
    ${centreStudentsCardHtml()}
    <div class="card">
      <h2>Student report</h2>
      <div class="hint">Pick a student and a month to see their attendance record, subscription balances, and payment history in one place.</div>
      <div class="row-form">
        <input type="text" id="reportStudentSearchBox" placeholder="Search by name, ID, parent, or mobile…" oninput="filterReportStudentPicker()" style="width:220px">
      </div>
      <div class="row-form">
        <select id="reportStudentPickerSelect" onchange="setReportStudent(this.value)">${reportStudentOptions}</select>
        <input type="month" value="${reportMonth}" onchange="setReportMonth(this.value)">
      </div>
      ${studentReportHtml}
    </div>
    <div class="card">
      <h2>Student balances</h2>
      <div class="row-form">
        <select onchange="setStudentBalanceTeacherFilter(this.value)">${studentBalanceTeacherOptions}</select>
        <select onchange="setStudentBalanceStatusFilter(this.value)">${studentBalanceStatusOptions}</select>
        <select onchange="setStudentBalanceBalanceFilter(this.value)">${studentBalanceFilterOptions}</select>
      </div>
      ${studentRows}
      ${studentBalanceCandidates.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportStudentBalance()">Export Student Balance report</button></div>` : ''}
    </div>

    <div class="card">
      <h2>Students linked to Teachers</h2>
      <div class="hint">For each teacher, which students they're linked to (via subject enrollment).</div>
      <div class="row-form">
        <input type="text" id="studentsByTeacherSearchBox" placeholder="Search by teacher name, ID, or mobile…" oninput="filterStudentsByTeacherPicker()" style="width:220px">
      </div>
      <div class="row-form">
        <select id="studentsByTeacherPickerSelect" onchange="setStudentsByTeacherFilter(this.value)">${studentsByTeacherOptions}</select>
        <select onchange="setStudentsByTeacherStatusFilter(this.value)">
          <option value="active" ${studentsByTeacherStatusFilter==='active'?'selected':''}>Active students</option>
          <option value="archived" ${studentsByTeacherStatusFilter==='archived'?'selected':''}>Archived students</option>
          <option value="all" ${studentsByTeacherStatusFilter==='all'?'selected':''}>All students</option>
        </select>
      </div>
      ${studentsByTeacherHtml}
      ${studentsByTeacherRows.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportStudentsByTeacher()">Export this report</button></div>` : ''}
    </div>

    <div class="card">
      <h2>Teachers linked to Students</h2>
      <div class="hint">For each student, which teachers they're linked to (via subject enrollment).</div>
      <div class="row-form">
        <input type="text" id="teachersByStudentSearchBox" placeholder="Search by student name, ID, parent, or mobile…" oninput="filterTeachersByStudentPicker()" style="width:220px">
      </div>
      <div class="row-form">
        <select id="teachersByStudentPickerSelect" onchange="setTeachersByStudentFilter(this.value)">${teachersByStudentOptions}</select>
        <select onchange="setTeachersByStudentStatusFilter(this.value)">
          <option value="active" ${teachersByStudentStatusFilter==='active'?'selected':''}>Active teachers</option>
          <option value="archived" ${teachersByStudentStatusFilter==='archived'?'selected':''}>Archived teachers</option>
          <option value="all" ${teachersByStudentStatusFilter==='all'?'selected':''}>All teachers</option>
        </select>
      </div>
      ${teachersByStudentHtml}
      ${teachersByStudentRows.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportTeachersByStudent()">Export this report</button></div>` : ''}
    </div>

    ${aiAttendanceGapCardHtml()}
    ${aiAtRiskCardHtml()}
    <div class="card">
      <h2>Razorpay payments <button class="help-btn" onclick="openHelp('razorpay-report',event)">?</button></h2>
      <div class="hint">Every payment Razorpay reported to the app (from 23 Oct 2026), and what was done with it. Refunds made in Razorpay are not shown.</div>
      <div class="row-form">
        <input type="month" value="${rzpReportMonth}" onchange="setRzpReportMonth(this.value)">
        <select onchange="rzpReportFilter=this.value;render()">${['All', 'Fee', 'Demo', 'Set aside', 'Waiting'].map(f => `<option value="${f}" ${rzpReportFilter === f ? 'selected' : ''}>${f === 'All' ? 'All payments' : f}</option>`).join('')}</select>
        <button class="btn-small" onclick="setRzpReportMonth(rzpReportMonth)">↻ Refresh</button>
      </div>
      ${razorpayReportHtml()}
      ${rzpReportRows && rzpReportRows.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportRazorpayReport()">Export Razorpay payments report</button></div>` : ''}
    </div>
    <div class="card">
      <h2>Refunds issued <button class="help-btn" onclick="openHelp('refunds',event)">?</button></h2>
      <div class="hint">Classes and money refunded for unused subscriptions, by month.</div>
      <div class="row-form"><input type="month" value="${refundReportMonth}" onchange="setRefundReportMonth(this.value)"></div>
      ${refundsHtml}
      ${refundRows.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportRefunds()">Export Refunds report</button></div>` : ''}
    </div>
    <div class="card">
      <h2>Net profit — fee collection minus teacher payroll and other expenses</h2>
      <div class="hint">Total money collected (payments minus refunds) minus what's owed for classes given, for the period below — scoped to whichever teacher is picked, or the whole institute under "All Teachers." Other expenses (from the Expenses tab) are institute-wide, so they are only subtracted under "All Teachers."</div>
      <div class="row-form">
        <select onchange="setNetProfitViewMode(this.value)">
          <option value="month" ${netProfitViewMode==='month'?'selected':''}>By month</option>
          <option value="fy" ${netProfitViewMode==='fy'?'selected':''}>By financial year</option>
        </select>
        ${netProfitViewMode === 'fy'
          ? `<select onchange="setNetProfitFY(this.value)">${fyOptionsList(8).map(fy=>`<option value="${fy}" ${netProfitFY===fy?'selected':''}>FY ${fy}</option>`).join('')}</select>`
          : `<input type="month" value="${netProfitMonth}" onchange="setNetProfitMonth(this.value)">`}
        <select onchange="setNetProfitTeacherFilter(this.value)">${netProfitTeacherOptions}</select>
      </div>
      ${netProfitViewMode === 'fy' ? `<div class="hint">FY ${netProfitFY} runs ${netProfitFYRange.start} to ${netProfitFYRange.end}.</div>` : ''}
      ${netProfitTeacherFilter === '' ? '<div class="empty">Pick a teacher above to see net profit for them, or choose All Teachers for the whole institute.</div>' : `
      <div class="table-scroll"><table>
        <tr><td>Total fee collection</td><td style="text-align:right">${netProfitCollection.toFixed(2)}</td></tr>
        <tr><td>Total teacher payroll <span style="color:var(--muted);font-size:12px">(incl. demo bonuses and adjustments)</span></td><td style="text-align:right">${netProfitPayroll.toFixed(2)}</td></tr>
        <tr><td>Other expenses${netProfitTeacherFilter==='ALL'?'':' <span style="color:var(--muted);font-size:12px">(institute-wide — only counted under All Teachers)</span>'}</td><td style="text-align:right">${netProfitTeacherFilter==='ALL' ? netProfitExpenses.toFixed(2) : '—'}</td></tr>
        <tr class="total"><td>Net profit</td><td style="text-align:right;color:${netProfitValue<0?'var(--brick)':'var(--forest)'}">${netProfitValue.toFixed(2)}</td></tr>
      </table></div>
      <div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportNetProfitReport()">Export Net Profit report</button></div>
      `}
    </div>
    <div class="card">
      <h2>Classes per teacher — ${classesPerTeacherMonth}</h2>
      <div class="hint">Attendance-only view (no pay figures). Present and Absent are broken out separately, so no-shows never inflate the class count.</div>
      <div class="row-form">
        <input type="month" value="${classesPerTeacherMonth}" onchange="setClassesPerTeacherMonth(this.value)">
        <select onchange="setClassesPerTeacherFilter(this.value)">${classesPerTeacherOptions}</select>
        <select onchange="setClassesPerTeacherTypeFilter(this.value)">
          <option value="" ${classesPerTeacherTypeFilter===''?'selected':''}>Group &amp; Individual</option>
          ${TYPES.map(ty=>`<option value="${ty}" ${classesPerTeacherTypeFilter===ty?'selected':''}>${ty} only</option>`).join('')}
        </select>
        <select onchange="setClassesPerTeacherModeFilter(this.value)">
          <option value="" ${classesPerTeacherModeFilter===''?'selected':''}>Online &amp; Offline</option>
          ${RATE_MODES.map(md=>`<option value="${md}" ${classesPerTeacherModeFilter===md?'selected':''}>${md} only</option>`).join('')}
        </select>
      </div>
      ${teacherClassHtml}
      ${teacherClassRows.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportTeacherClasses()">Export Teacher Classes report</button></div>` : ''}
    </div>
    <div class="card">
      <h2>Teacher-wise attendance register</h2>
      <div class="hint">For each teacher, every student mapped to them by subject — classes present/absent this month, total subscribed, and pending.</div>
      <div class="row-form">
        <input type="month" value="${registerMonth}" onchange="setRegisterMonth(this.value)">
        <input type="text" id="registerTeacherSearchBox" placeholder="Search by name, ID, or mobile…" oninput="filterRegisterTeacherPicker()" style="width:200px">
        <select id="registerTeacherPickerSelect" onchange="setRegisterTeacherFilter(this.value)">${registerTeacherOptions}</select>
      </div>
      ${registerHtml}
      ${registerTeacherPool.length ? `<div class="row-form" style="margin-top:12px"><button class="btn-gold" onclick="exportTeacherRegister()">Export Teacher Register</button></div>` : ''}
    </div>
  `;
}

function exportStudentReport() {
  if (!reportStudentId) return;
  const student = data.students.find(s=>s.id===reportStudentId);
  if (!student) return;
  const wb = XLSX.utils.book_new();

  const monthSessions = data.sessions.filter(s=>s.studentId===reportStudentId && s.date.startsWith(reportMonth)).sort((a,b)=>a.date.localeCompare(b.date));
  const attRows = monthSessions.map(s => ({
    Date: s.date, Subject: subjectName(s.subjectId), Teacher: teacherName(s.teacherId),
    Type: s.classType, Mode: s.mode, Status: s.status, Classes: s.count, Remarks: s.remarks||''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attRows.length?attRows:[{Date:'',Subject:'',Teacher:'',Type:'',Mode:'',Status:'',Classes:'',Remarks:''}]), 'Attendance ' + reportMonth);

  const enrolledSubjectsForExport = byName(subjectsForStudent(student.id));
  const balRows = [];
  enrolledSubjectsForExport.forEach(subj => {
    TYPES.forEach(ty => {
      const sub=studentSubscribed(student.id,subj.id,ty), used=studentUsed(student.id,subj.id,ty);
      balRows.push({ Subject: subj.name, Type: ty, Subscribed: sub, Used: used, Remaining: sub-used });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(balRows.length?balRows:[{Subject:'',Type:'',Subscribed:'',Used:'',Remaining:''}]), 'Balances');

  const payRows = allSubscriptionRows().filter(r=>r.studentId===reportStudentId).map(r => ({
    Subject: r.subjectName, Type: r.type, Classes: r.classes, Amount_Paid: r.amountPaid||0, Payment_Date: r.date, Status: r.status, Used: r.usedHere, Expired: r.expiredClasses||0, Remaining: r.remainingHere, Expires_On: r.expiresOn||''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payRows.length?payRows:[{Subject:'',Type:'',Classes:'',Amount_Paid:'',Payment_Date:'',Status:'',Used:'',Remaining:''}]), 'Payment History');

  // Class transfers get their own sheet (their columns don't fit the payment sheet); only added when the student has any.
  const xferRows = transferHistoryRows(reportStudentId).map(r => ({
    Date: r.date, From_Student: r.fromStudent || '', To_Student: r.toStudent || '', From_Subject: r.fromName, From_Teacher: r.fromTeacher, To_Subject: r.toName, To_Teacher: r.toTeacher,
    Type: r.type, Classes: r.classes, Different_Teacher: r.crossTeacher ? 'Yes' : 'No', Reference: r.reference||'', Remarks: r.remarks||''
  }));
  if (xferRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(xferRows), 'Transfers');

  XLSX.writeFile(wb, 'student-report-' + student.name.replace(/[^a-z0-9]+/gi,'_') + '-' + reportMonth + '.xlsx');
}

function exportStudentBalance() {
  const wb = XLSX.utils.book_new();
  let pool = data.students;
  if (studentBalanceStatusFilter === 'active') pool = pool.filter(s=>!s.archived);
  else if (studentBalanceStatusFilter === 'archived') pool = pool.filter(s=>s.archived);
  const balanceTeacherId = (studentBalanceTeacherFilter && studentBalanceTeacherFilter !== 'ALL') ? studentBalanceTeacherFilter : null;
  if (studentBalanceTeacherFilter === '') {
    pool = [];
  } else if (balanceTeacherId) {
    const idsForTeacher = new Set(studentsForTeacher(balanceTeacherId).map(s=>s.id));
    pool = pool.filter(s=>idsForTeacher.has(s.id));
  }
  const rows = byName(pool).map(s => {
    const row = { Student: studentLabel(s), Archived: s.archived ? 'Yes' : 'No' };
    let totalUsed = 0, totalLeft = 0, grand = 0;
    TYPES.forEach(ty => {
      const sub = studentSubscribedAny(s.id,ty,balanceTeacherId), used = studentUsedAny(s.id,ty,balanceTeacherId), left = sub-used;
      row[ty+'_Subscribed'] = sub; row[ty+'_Used'] = used; row[ty+'_Remaining'] = left;
      totalUsed += used; totalLeft += left; grand += sub;
    });
    row['Total_Used'] = totalUsed; row['Total_Remaining'] = totalLeft; row['Grand_Total'] = grand;
    return row;
  }).filter(row => {
    if (studentBalanceBalanceFilter === 'available') return row.Total_Remaining > 0;
    if (studentBalanceBalanceFilter === 'zero') return row.Total_Remaining === 0;
    if (studentBalanceBalanceFilter === 'negative') return row.Total_Remaining < 0;
    return true;
  });
  const totals = { Student: 'TOTAL', Archived: '' };
  Object.keys(rows[0]||{}).forEach(k => { if (k!=='Student' && k!=='Archived') totals[k] = rows.reduce((a,r)=>a+r[k],0); });
  if (rows.length) rows.push(totals);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{Student:'None'}]), 'Student Balances');
  XLSX.writeFile(wb, 'student-balance-report.xlsx');
}

function exportStudentsByTeacher() {
  const wb = XLSX.utils.book_new();
  const teacherPool = studentsByTeacherFilter === '' ? [] : (studentsByTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===studentsByTeacherFilter));
  const rows = [];
  byName(teacherPool).forEach(t => {
    let studentPool = studentsForTeacher(t.id);
    if (studentsByTeacherStatusFilter === 'active') studentPool = studentPool.filter(s=>!s.archived);
    else if (studentsByTeacherStatusFilter === 'archived') studentPool = studentPool.filter(s=>s.archived);
    byName(studentPool).forEach(s => rows.push({ Teacher: teacherLabel(t), Student: studentLabel(s), StudentArchived: s.archived ? 'Yes' : 'No' }));
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{Teacher:'None'}]), 'Students by Teacher');
  XLSX.writeFile(wb, 'students-linked-to-teachers.xlsx');
}

function exportTeachersByStudent() {
  const wb = XLSX.utils.book_new();
  const studentPool = teachersByStudentFilter === '' ? [] : (teachersByStudentFilter === 'ALL' ? data.students : data.students.filter(s=>s.id===teachersByStudentFilter));
  const rows = [];
  byName(studentPool).forEach(s => {
    let teacherPool = teachersForStudent(s.id);
    if (teachersByStudentStatusFilter === 'active') teacherPool = teacherPool.filter(t=>!t.archived);
    else if (teachersByStudentStatusFilter === 'archived') teacherPool = teacherPool.filter(t=>t.archived);
    byName(teacherPool).forEach(t => rows.push({ Student: studentLabel(s), StudentArchived: s.archived ? 'Yes' : 'No', Teacher: teacherLabel(t), TeacherArchived: t.archived ? 'Yes' : 'No' }));
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{Student:'None'}]), 'Teachers by Student');
  XLSX.writeFile(wb, 'teachers-linked-to-students.xlsx');
}

function exportRazorpayReport() {
  const wb = XLSX.utils.book_new();
  const rows = rzpReportItems().filter(x => rzpReportFilter === 'All' || x.status === rzpReportFilter).map(x => ({
    Date: x.date, Time: x.time, Amount: x.amount, Razorpay_Fee: x.p.fee == null ? '' : Number(x.p.fee), Phone: x.p.contact || '', Email: x.p.email || '',
    Name_Typed: x.name, Method: x.p.method || '', Payment_ID: x.p.id, What_Happened: x.status, Details: x.detail.replace(/\n/g, '; '),
    Recorded_In_App: x.status === 'Fee' || x.status === 'Demo' ? x.recorded : ''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Date: 'None' }]), 'Razorpay ' + rzpReportMonth);
  XLSX.writeFile(wb, 'razorpay-payments-' + rzpReportMonth + '.xlsx');
}

function exportRefunds() {
  const wb = XLSX.utils.book_new();
  const rows = allSubscriptionRows()
    .filter(r => r.status === 'Refund' && (r.date||'').startsWith(refundReportMonth))
    .map(r => ({
      Student: r.studentName, Subject: r.subjectName, Type: r.type,
      Classes_Refunded: Math.abs(r.classes), Amount_Refunded: Math.abs(r.amountPaid||0), Date: r.date
    }));
  const totalsRow = { Student: 'TOTAL', Subject: '', Type: '',
    Classes_Refunded: rows.reduce((a,r)=>a+r.Classes_Refunded,0),
    Amount_Refunded: Number(rows.reduce((a,r)=>a+r.Amount_Refunded,0).toFixed(2)), Date: '' };
  if (rows.length) rows.push(totalsRow);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{Student:'None'}]), 'Refunds ' + refundReportMonth);
  XLSX.writeFile(wb, 'refunds-issued-' + refundReportMonth + '.xlsx');
}

function exportNetProfitReport() {
  const wb = XLSX.utils.book_new();
  const teacherPool = netProfitTeacherFilter === '' ? [] : (netProfitTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===netProfitTeacherFilter));
  const scopedSubjectIds = new Set(data.subjects.filter(s=>teacherPool.some(t=>t.id===s.teacherId)).map(s=>s.id));
  const range = fyDateRange(netProfitFY);
  const inRange = (d) => netProfitViewMode === 'fy' ? (d && d >= range.start && d <= range.end) : (d || '').startsWith(netProfitMonth);
  const collection = data.subscriptions
    .filter(s => (s.kind === 'Payment' || s.kind === 'Refund') && inRange(s.date) && scopedSubjectIds.has(s.subjectId))
    .reduce((a,s)=>a+(s.amountPaid||0), 0);
  const periodSessions = data.sessions.filter(s=>inRange(s.date));
  let payroll = 0;
  teacherPool.forEach(t => {
    const mine = periodSessions.filter(s=>s.teacherId===t.id);
    categories.forEach(c => {
      TYPES.forEach(ty => {
        const inGroup = mine.filter(s=>{ const subj=subject(s.subjectId); return subj && subj.category===c.id && s.classType===ty; });
        RATE_MODES.forEach(md => {
          const modeCount = inGroup.filter(s=>s.mode===md).reduce((a,s)=>a+s.count,0);
          payroll += modeCount * (t.rates[rateKey(c.id,ty,md)]||0);
        });
      });
    });
    payroll += data.demoLogs
      .filter(d => d.teacherId === t.id && d.status === 'Converted' && inRange((d.convertedAt || d.date || '').slice(0, 10)))
      .reduce((a, d) => a + (d.bonusAmount || 0), 0);
    payroll += data.teacherPayrollRecords
      .filter(r => r.teacherId === t.id && inRange(r.month + '-01'))
      .reduce((a, r) => a + (r.adjustment || 0), 0);
  });
  const expenses = netProfitTeacherFilter === 'ALL' ? expenseList.filter(e => inRange(e.date)).reduce((a,e)=>a+e.amount, 0) : 0;
  const teacherLabelForFile = (netProfitTeacherFilter && netProfitTeacherFilter !== 'ALL') ? (teacherPool[0] ? teacherPool[0].name : 'Teacher') : 'All Teachers';
  const periodLabel = netProfitViewMode === 'fy' ? ('FY ' + netProfitFY) : netProfitMonth;
  const rows = [
    { Item: 'Total fee collection', Amount: Number(collection.toFixed(2)) },
    { Item: 'Total teacher payroll', Amount: Number(payroll.toFixed(2)) },
    { Item: netProfitTeacherFilter === 'ALL' ? 'Other expenses' : 'Other expenses (not applied — institute-wide, only counted under All Teachers)', Amount: Number(expenses.toFixed(2)) },
    { Item: 'Net profit', Amount: Number((collection-payroll-expenses).toFixed(2)) },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Net Profit ' + periodLabel);
  XLSX.writeFile(wb, 'net-profit-' + teacherLabelForFile.replace(/[^a-z0-9]+/gi,'_') + '-' + periodLabel.replace(/[^a-z0-9]+/gi,'_') + '.xlsx');
}

function exportTeacherClasses() {
  const wb = XLSX.utils.book_new();
  const monthSessions = data.sessions.filter(s => {
    if (!s.date.startsWith(classesPerTeacherMonth)) return false;
    if (classesPerTeacherTypeFilter && s.classType !== classesPerTeacherTypeFilter) return false;
    if (classesPerTeacherModeFilter && s.mode !== classesPerTeacherModeFilter) return false;
    return true;
  });
  const pool = classesPerTeacherFilter === '' ? [] : (classesPerTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===classesPerTeacherFilter));
  const rows = byName(pool).map(t => {
    const mine = monthSessions.filter(s=>s.teacherId===t.id);
    const present = mine.filter(s=>s.status==='Present');
    const row = { Teacher: teacherLabel(t) };
    let totalPresent = 0;
    TYPES.forEach(ty => { const c = present.filter(s=>s.classType===ty).reduce((a,s)=>a+s.count,0); row[ty+'_Present'] = c; totalPresent += c; });
    row['Total_Present'] = totalPresent;
    row['Total_Absent'] = mine.filter(s=>s.status==='Absent').reduce((a,s)=>a+s.count,0);
    row['Grand_Total'] = row['Total_Present'] + row['Total_Absent'];
    row['Students_Taught'] = new Set(present.map(s=>s.studentId)).size;
    return row;
  });
  const totalsRow = { Teacher: 'TOTAL' };
  TYPES.forEach(ty => { totalsRow[ty+'_Present'] = rows.reduce((a,r)=>a+r[ty+'_Present'],0); });
  totalsRow['Total_Present'] = rows.reduce((a,r)=>a+r['Total_Present'],0);
  totalsRow['Total_Absent'] = rows.reduce((a,r)=>a+r['Total_Absent'],0);
  totalsRow['Grand_Total'] = totalsRow['Total_Present'] + totalsRow['Total_Absent'];
  totalsRow['Students_Taught'] = '';
  rows.push(totalsRow);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Classes ' + classesPerTeacherMonth);
  XLSX.writeFile(wb, 'teacher-classes-' + classesPerTeacherMonth + '.xlsx');
}

function exportTeacherRegister() {
  const wb = XLSX.utils.book_new();
  const teacherPool = registerTeacherFilter === '' ? [] : byName(registerTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===registerTeacherFilter));
  const rows = [];
  teacherPool.forEach(t => {
    teacherRegisterEntries(t.id, registerMonth).forEach(e => {
      rows.push({
        Teacher: teacherLabel(t), Date: e.date, Student: e.studentName, Subject: e.subjectName,
        Type: e.classType, Mode: e.mode, Status: e.status, Classes: e.count
      });
    });
  });
  const filenameLabel = (registerTeacherFilter && registerTeacherFilter !== 'ALL') ? (teacherPool[0] ? teacherPool[0].name : 'Teacher') : 'All Teachers';
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{Teacher:'None'}]), 'Register ' + registerMonth);
  XLSX.writeFile(wb, 'teacher-register-' + filenameLabel.replace(/[^a-z0-9]+/gi,'_') + '-' + registerMonth + '.xlsx');
}

function exportTeacherPayroll() {
  const wb = XLSX.utils.book_new();
  const monthSessions = data.sessions.filter(s=>s.date.startsWith(payrollMonth));
  const teacherPool = payrollTeacherFilter === '' ? [] : byName(payrollTeacherFilter === 'ALL' ? data.teachers : data.teachers.filter(t=>t.id===payrollTeacherFilter));
  const colKeys = [];
  categories.forEach(c => { TYPES.forEach(ty => colKeys.push(c.name+' '+ty)); });
  const rows = teacherPool.map(t => {
    const mine = monthSessions.filter(s=>s.teacherId===t.id);
    const row = { Teacher: teacherLabel(t) };
    let pay = 0;
    categories.forEach(c => {
      TYPES.forEach(ty => {
        const inGroup = mine.filter(s=>{ const subj=subject(s.subjectId); return subj && subj.category===c.id && s.classType===ty; });
        const count = inGroup.reduce((a,s)=>a+s.count,0);
        row[c.name+' '+ty] = count;
        RATE_MODES.forEach(md => {
          const modeCount = inGroup.filter(s=>s.mode===md).reduce((a,s)=>a+s.count,0);
          pay += modeCount * (t.rates[rateKey(c.id,ty,md)]||0);
        });
      });
    });
    row['Total Payable'] = Number(pay.toFixed(2));
    const bkd={};
    categories.forEach(cc=>{ TYPES.forEach(ty=>{ const ig=mine.filter(s=>{const subj=subject(s.subjectId);return subj&&subj.category===cc.id&&s.classType===ty;});
      RATE_MODES.forEach(md=>{const cnt=ig.filter(s=>s.mode===md).reduce((a,s)=>a+s.count,0);const rt=t.rates[rateKey(cc.id,ty,md)]||0;if(cnt>0 && rt>0)bkd[rt]=(bkd[rt]||0)+cnt;}); }); });
    const bkdEntries=Object.entries(bkd).sort((a,b)=>Number(b[0])-Number(a[0]));
    const bkdTotal=bkdEntries.reduce((a,[rt,cnt])=>a+Number(rt)*cnt,0);
    row['Calculation']=bkdEntries.length ? bkdEntries.map(([rt,cnt])=>cnt+' x Rs'+rt).join(' + ')+' = Rs'+bkdTotal.toFixed(0) : '';
    return row;
  });
  const totalsRow = { Teacher: 'TOTAL' };
  colKeys.forEach(k => { totalsRow[k] = rows.reduce((a,r)=>a+(r[k]||0),0); });
  totalsRow['Total Payable'] = Number(rows.reduce((a,r)=>a+r['Total Payable'],0).toFixed(2));
  rows.push(totalsRow);
  const sheetLabel = (payrollTeacherFilter && payrollTeacherFilter !== 'ALL') ? (teacherPool[0] ? teacherPool[0].name : 'Teacher') : 'All Teachers';
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Payroll ' + payrollMonth);
  XLSX.writeFile(wb, 'teacher-payroll-' + sheetLabel.replace(/[^a-z0-9]+/gi,'_') + '-' + payrollMonth + '.xlsx');
}
