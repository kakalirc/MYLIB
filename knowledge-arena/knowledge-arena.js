(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SUPABASE_URL = 'https://kqkojscbaycolaioyarh.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Jmq';
  const API_URL = SUPABASE_URL + '/functions/v1/knowledge-arena';
  const GAME_NAMES = {word_master:'Word Master',number_quest:'Number Quest',science_explorer:'Science Explorer',quick_quiz:'Quick Quiz',brain_teaser:'Brain Teaser',memory_challenge:'Memory Challenge'};
  const GAME_ICONS = {word_master:'Aa',number_quest:'∑',science_explorer:'⚛',quick_quiz:'?',brain_teaser:'◇',memory_challenge:'◉'};
  const studentView = new URLSearchParams(location.search).get('view') === 'student';
  let client=null, session=null, catalog=null, currentQuestions=[], selectedAnswers=[], currentIndex=0, currentGame='', currentChallengeId=null, startedAt=0, lastFeedback=[], daily=null, currentView='play', memoryTimer=null;
  const setMessage=(message,type='')=>{const el=$('global-message');el.textContent=message;el.className='notice'+(type?' '+type:'');};
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(v)=>'₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  async function api(action,payload={}){
    if(!session) throw new Error('Your LIB login session has expired. Return to Student Login and sign in again.');
    const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+session.access_token},body:JSON.stringify({action,...payload})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||('Knowledge Arena service returned '+response.status+'.'));
    return data;
  }
  function showView(name){
    currentView=name;
    ['play','daily','achievements','leaderboard','admin'].forEach(v=>$('view-'+v).classList.toggle('hidden',v!==name));
    $('quiz').classList.add('hidden');$('results').classList.add('hidden');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    if(name==='achievements') loadAchievements();
    if(name==='leaderboard') loadLeaderboard();
    if(name==='admin') loadAdmin();
  }
  function updateProgress(stats={}){
    const xp=Number(stats.game_xp||0), level=Math.floor(xp/100)+1, into=xp%100;
    $('hero-xp').textContent=xp.toLocaleString('en-IN');
    $('hero-level').textContent='LEVEL '+level+' · '+(level<3?'EXPLORER':level<6?'ACHIEVER':'CHAMPION');
    $('hero-progress').style.width=into+'%';
    $('xp-next').textContent=(100-into)+' XP to the next level';
  }
  function populateSelect(select,items,placeholder){
    select.innerHTML='';
    if(placeholder){const opt=document.createElement('option');opt.value='';opt.textContent=placeholder;select.appendChild(opt);}
    (items||[]).forEach(item=>{const opt=document.createElement('option');opt.value=item;opt.textContent=item;select.appendChild(opt);});
  }
  function renderGames(){
    const grid=$('game-grid');
    grid.querySelectorAll('.game-card').forEach(card=>{
      const id=card.dataset.game,enabled=(catalog.games||[]).some(g=>g.id===id);
      card.classList.toggle('disabled-game',!enabled);
      const btn=card.querySelector('button');btn.disabled=!enabled;btn.textContent=enabled?'Choose game →':'Currently unavailable';
    });
    populateSelect($('game-select'),(catalog.games||[]).map(g=>g.id),'Select a game');
    Array.from($('game-select').options).forEach(o=>{if(o.value)o.textContent=GAME_NAMES[o.value]||o.value;});
    populateSelect($('subject-select'),catalog.subjects,'Select a subject');
    $('grade-label').textContent='Your learning band: '+(catalog.grade_label||'General');
    updateProgress(catalog.progress||{});
  }
  async function loadCatalog(){
    const data=await api('get_catalog');catalog=data;renderGames();
    if(!data.games_enabled)setMessage('Student games are currently paused by LIB Admin.','error');
    else setMessage('You are securely connected to LIB Knowledge Arena. Your Game XP is saved to your student account.','success');
    $('session-state').textContent='LIB student session';
    loadDailySummary();
  }
  function selectGame(id){
    if(!(catalog?.games||[]).some(g=>g.id===id)){setMessage('This game is currently unavailable.','error');return;}
    $('game-select').value=id;
    $('practice-setup').scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function startPractice(gameType,subject,difficulty='',challengeId=null,questions=null){
    if(!gameType||(!challengeId&&!subject)){setMessage('Choose a game and subject first.','error');return;}
    setMessage('Loading questions for your session…');
    let qs=questions;
    if(!qs){const data=await api('get_questions',{game_type:gameType,subject,difficulty,limit:10});qs=data.questions||[];}
    if(!qs.length){setMessage('There are no published questions for this selection yet. Please try another subject or return later.','error');return;}
    if(qs.some(q=>q.game_type!==gameType)){throw new Error('This challenge contains mixed game mechanics and cannot be submitted as one attempt. Please contact LIB Admin.');}
    currentQuestions=qs;selectedAnswers=[];currentIndex=0;currentGame=gameType;currentChallengeId=challengeId;startedAt=Date.now();lastFeedback=[];
    $('view-play').classList.add('hidden');$('view-daily').classList.add('hidden');$('quiz').classList.remove('hidden');$('results').classList.add('hidden');
    $('memory-preview').classList.add('hidden');
    if(gameType==='memory_challenge') await memoryPreview();
    renderQuestion();
    setMessage('Your session is in progress. Your answers are evaluated securely when you finish.','success');
  }
  async function memoryPreview(){
    const preview=$('memory-preview');
    preview.innerHTML='<b>Memory round:</b> Study these '+currentQuestions.length+' questions and options. They will disappear before you answer.';
    currentQuestions.forEach((q,i)=>{preview.innerHTML+='<div><b>'+(i+1)+'. '+esc(q.prompt)+'</b><br>'+q.options.map(esc).join(' · ')+'</div>';});
    preview.classList.remove('hidden');$('quiz-question').textContent='Remember the questions and answer choices…';$('answers').innerHTML='';
    await new Promise(resolve=>{memoryTimer=setTimeout(resolve,6500);});
    preview.classList.add('hidden');
  }
  function renderQuestion(){
    const q=currentQuestions[currentIndex];if(!q)return;
    $('quiz-count').textContent='QUESTION '+(currentIndex+1)+' OF '+currentQuestions.length;
    $('quiz-progress').style.width=(currentIndex/currentQuestions.length*100)+'%';
    $('quiz-category').textContent=(q.subject||'KNOWLEDGE ARENA').toUpperCase()+' · '+(q.difficulty||'').toUpperCase();
    $('quiz-question').textContent=q.prompt;$('quiz-feedback').textContent='';$('next-question').classList.add('hidden');$('answers').innerHTML='';
    q.options.forEach((option,index)=>{const b=document.createElement('button');b.className='answer';b.textContent=String.fromCharCode(65+index)+'.  '+option;b.addEventListener('click',()=>chooseAnswer(index));$('answers').appendChild(b);});
  }
  function chooseAnswer(index){
    if(selectedAnswers[currentIndex])return;
    selectedAnswers[currentIndex]={question_id:currentQuestions[currentIndex].id,option_index:index};
    Array.from($('answers').children).forEach((b,i)=>{b.disabled=true;if(i===index)b.classList.add('selected');});
    $('quiz-feedback').textContent='Answer saved for this session.';
    $('next-question').textContent=currentIndex===currentQuestions.length-1?'Submit answers →':'Next question →';
    $('next-question').classList.remove('hidden');
  }
  async function nextQuestion(){
    if(!selectedAnswers[currentIndex])return;
    if(currentIndex<currentQuestions.length-1){currentIndex++;renderQuestion();return;}
    $('next-question').disabled=true;$('next-question').textContent='Checking your answers…';
    try{
      const data=await api('submit_attempt',{game_type:currentGame,answers:selectedAnswers,challenge_id:currentChallengeId,duration_seconds:Math.min(86400,Math.round((Date.now()-startedAt)/1000))});
      lastFeedback=data.feedback||[];showResults(data);
    }catch(e){setMessage(e.message,'error');$('next-question').disabled=false;$('next-question').textContent='Try submitting again →';}
  }
  function showResults(data){
    $('quiz').classList.add('hidden');$('results').classList.remove('hidden');
    $('result-score').textContent=data.correct_count+' / '+data.question_count;
    $('result-title').textContent=data.accuracy===100?'Perfect score!':data.accuracy>=70?'Well played!':'Good effort!';
    $('result-message').textContent='Accuracy: '+data.accuracy+'%. You earned '+data.xp_awarded+' Game XP. XP is subject to the daily cap.';
    const feedback=$('result-feedback');feedback.innerHTML='';
    (data.feedback||[]).forEach((f,i)=>{const q=currentQuestions[i];const article=document.createElement('article');article.innerHTML='<b>'+(f.correct?'✓ Correct — ':'✕ Review — ')+esc(q?.prompt||'Question')+'</b><span>'+esc(q?.options?.[f.correct_option]||'')+'</span><p>'+esc(f.explanation||'')+'</p>';feedback.appendChild(article);});
    setMessage('Your attempt has been saved to your LIB student account.','success');
    refreshMyProgress();
  }
  async function refreshMyProgress(){
    try{const d=await api('get_my_progress');updateProgress(d.stats||{});}catch(e){console.warn(e);}
  }
  async function loadDailySummary(){
    try{
      const data=await api('get_daily_challenge');daily=data.challenge?{...data.challenge,questions:data.questions||[]}:null;
      if(data.paused){$('daily-status').textContent='Daily challenges are temporarily paused by LIB Admin.';return;}
      if(!daily){$('daily-status').textContent='Today’s challenge has not been published yet. Please check again later.';$('daily-meta').innerHTML='<span>Awaiting today’s publication</span>';return;}
      $('daily-title').textContent=daily.title;$('daily-description').textContent=daily.description||'A shared daily challenge for LIB students.';
      $('daily-meta').innerHTML='<span>'+daily.questions.length+' questions</span><span>Unlimited practice</span><span>Game XP applies</span>';
      $('start-daily').disabled=!daily.questions.length;
      $('daily-status').textContent=daily.questions.length?'Your grade-appropriate challenge is ready.':'The challenge has no questions available for your grade today.';
    }catch(e){$('daily-status').textContent=e.message;}
  }
  async function startDaily(){
    if(!daily?.questions?.length)return;
    const types=[...new Set(daily.questions.map(q=>q.game_type))];
    if(types.length!==1){setMessage('Today’s challenge is not configured as a single game type. Please contact LIB Admin.','error');return;}
    await startPractice(types[0],null,'',daily.id,daily.questions);
  }
  async function loadAchievements(){
    const box=$('achievement-grid');box.innerHTML='<p class="muted">Loading achievements…</p>';
    try{const data=await api('get_my_progress');const earned=new Map((data.achievements||[]).map(a=>[a.achievement?.code,a]));
      const all=[['first_game','First Steps','Complete your first game','🚀'],['accuracy_ace','Accuracy Ace','Score 90% or higher','🎯'],['seven_day_streak','On a Roll','Play on 7 different days','🔥'],['ten_games','Brain Builder','Complete 10 games','🧠']];
      box.innerHTML=all.map(a=>{const yes=earned.has(a[0]);return '<article class="achievement '+(yes?'':'locked')+'"><span>'+a[3]+'</span><div><b>'+a[1]+'</b><small>'+a[2]+'</small></div><i>'+(yes?'Unlocked':'Locked')+'</i></article>';}).join('');
      if(!all.some(a=>earned.has(a[0]))&&data.achievements?.length)box.innerHTML=(data.achievements||[]).map(a=>'<article class="achievement"><span>'+esc(a.achievement?.icon||'✦')+'</span><div><b>'+esc(a.achievement?.title||'Achievement')+'</b><small>'+esc(a.achievement?.description||'')+'</small></div><i>Unlocked</i></article>').join('');
    }catch(e){box.textContent=e.message;}
  }
  async function loadLeaderboard(){
    const box=$('leaderboard-rows');box.innerHTML='<p class="muted">Loading leaderboard…</p>';
    try{const data=await api('get_leaderboard');box.innerHTML=(data.leaderboard||[]).map(p=>'<div class="leader-row '+(p.is_me?'you':'')+'"><b class="rank">'+p.rank+'</b><span>'+esc(p.display_name)+(p.is_me?'<small>You</small>':'')+'</span><b>'+Number(p.game_xp||0).toLocaleString('en-IN')+'</b></div>').join('')||'<p class="muted">No players have recorded a game yet.</p>';}
    catch(e){box.textContent=e.message;}
  }
  function metric(label,value,sub){return '<article class="metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub)+'</span></article>';}
  async function loadAdmin(){
    try{
      const [s,j]=await Promise.all([api('get_admin_summary'),api('get_admin_jobs')]);const a=s.summary||{},settings=a.automation||{};
      $('admin-metrics').innerHTML=metric('Registered student logins',a.registered_players||0,'Linked LIB student accounts')+metric('Games played today',a.games_played_today||0,'Completed attempts')+metric('Published questions',a.question_bank_published||0,'Available to eligible students')+metric('Average accuracy',a.average_accuracy_30d==null?'—':a.average_accuracy_30d+'%','Last 30 days');
      $('daily-budget').value=settings.daily_ai_budget_inr??100;$('monthly-budget').value=settings.monthly_ai_budget_inr??1000;
      $('generation-toggle').checked=!!settings.generation_enabled;$('games-toggle').checked=!!settings.games_enabled;$('daily-toggle').checked=!!settings.daily_challenge_enabled;
      $('budget-usage').innerHTML='<div><small>Today · '+money(a.ai_cost_inr_today)+' / '+money(settings.daily_ai_budget_inr)+'</small><b>'+money(a.ai_cost_inr_today)+' used</b></div><div><small>This month · '+money(a.ai_cost_inr_month)+' / '+money(settings.monthly_ai_budget_inr)+'</small><b>'+money(a.ai_cost_inr_month)+' used</b></div>';
      populateSelect($('job-subject'),a.subjects||[],'Select a subject');populateSelect($('job-grade'),['General',...(a.grades||[])],'Select a grade');
      renderJobs(j.jobs||[]);
    }catch(e){setMessage(e.message,'error');$('admin-metrics').innerHTML='<p class="muted">'+esc(e.message)+'</p>';}
  }
  function renderJobs(jobs){
    const box=$('job-list');if(!jobs.length){box.innerHTML='<p class="muted">No generation jobs have been queued.</p>';return;}
    box.innerHTML=jobs.map(j=>'<div class="job-item"><div><b>'+esc(j.subject||'—')+' · '+esc(j.grade_label||'—')+'</b><small>'+esc(GAME_NAMES[j.game_type]||j.game_type)+' · '+esc(j.difficulty)+' · '+j.requested_count+' requested · '+j.published_count+' published</small></div><div><b>'+esc(j.status)+'</b><small>'+esc(j.error_summary||j.error_code||j.created_at||'')+'</small></div><div class="job-actions">'+(j.status==='queued'?'<button data-job="'+j.id+'" data-action="pause_job">Pause</button>':'')+(j.status==='paused'?'<button data-job="'+j.id+'" data-action="resume_job">Resume</button>':'')+'</div></div>').join('');
  }
  async function adminControl(control,payload={}){
    const data=await api('admin_control',{control,...payload});return data;
  }
  async function saveBudgets(){
    const daily=Number($('daily-budget').value),monthly=Number($('monthly-budget').value);
    if(!Number.isFinite(daily)||!Number.isFinite(monthly)||daily<0||monthly<0||daily>monthly){$('budget-message').textContent='Enter valid limits. Daily limit cannot exceed monthly limit.';return;}
    $('budget-message').textContent='Saving…';
    try{await adminControl('set_ai_budgets',{daily_ai_budget_inr:daily,monthly_ai_budget_inr:monthly});$('budget-message').textContent='Budget limits saved.';await loadAdmin();}
    catch(e){$('budget-message').textContent=e.message;}
  }
  async function toggleFeature(control,enabled){
    try{await adminControl(control,{enabled});$('feature-message').textContent='Setting updated.';await loadAdmin();}
    catch(e){$('feature-message').textContent=e.message;await loadAdmin();}
  }
  async function queueJob(){
    const payload={grade_label:$('job-grade').value,subject:$('job-subject').value,game_type:$('job-game').value,difficulty:$('job-difficulty').value,requested_count:Number($('job-count').value),topic:$('job-topic').value};
    $('job-message').textContent='Queueing…';
    try{const d=await adminControl('queue_generation',payload);$('job-message').textContent='Job queued: '+d.job.id;await loadAdmin();}
    catch(e){$('job-message').textContent=e.message;}
  }
  function bindEvents(){
    document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
    document.querySelectorAll('.game-card .launch').forEach(b=>b.addEventListener('click',()=>selectGame(b.closest('.game-card').dataset.game)));
    $('filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.game-card').forEach(c=>c.classList.toggle('hidden',b.dataset.filter!=='all'&&c.dataset.kind!==b.dataset.filter));});
    $('start-practice').addEventListener('click',()=>startPractice($('game-select').value,$('subject-select').value,$('difficulty-select').value).catch(e=>setMessage(e.message,'error')));
    $('start-daily').addEventListener('click',()=>startDaily().catch(e=>setMessage(e.message,'error')));
    $('next-question').addEventListener('click',nextQuestion);
    $('quit-quiz').addEventListener('click',()=>{if(memoryTimer)clearTimeout(memoryTimer);$('quiz').classList.add('hidden');showView(currentChallengeId?'daily':'play');});
    $('back-to-games').addEventListener('click',()=>showView('play'));
    $('save-budgets').addEventListener('click',saveBudgets);
    $('generation-toggle').addEventListener('change',e=>toggleFeature('set_generation_enabled',e.target.checked));
    $('games-toggle').addEventListener('change',e=>toggleFeature('set_games_enabled',e.target.checked));
    $('daily-toggle').addEventListener('change',e=>toggleFeature('set_daily_challenge_enabled',e.target.checked));
    $('queue-job').addEventListener('click',queueJob);
    $('refresh-jobs').addEventListener('click',loadAdmin);
    $('job-list').addEventListener('click',async e=>{const b=e.target.closest('[data-job]');if(!b)return;try{await adminControl(b.dataset.action,{job_id:b.dataset.job});await loadAdmin();}catch(err){setMessage(err.message,'error');}});
  }
  async function init(){
    bindEvents();
    if(!window.supabase?.createClient){setMessage('Secure login library could not be loaded. Refresh this page after checking your internet connection.','error');return;}
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    const {data,error}=await client.auth.getSession();if(error||!data.session){$('session-state').textContent='Not signed in';setMessage('Please return to LIB Student Login and sign in before opening Knowledge Arena.','error');return;}
    session=data.session;
    if(studentView){$('admin-nav').remove();}
    let isStudent=false,isAdmin=false;
    try{await loadCatalog();isStudent=true;}
    catch(studentError){
      if(studentView){$('session-state').textContent='Student access unavailable';setMessage(studentError.message,'error');return;}
      try{await api('get_admin_summary');isAdmin=true;}
      catch(adminError){$('session-state').textContent='Account not authorised';setMessage('This account is not authorised to use Knowledge Arena. Please sign in with a linked LIB Student or Admin account.','error');return;}
    }
    if(isAdmin){
      $('session-state').textContent='LIB Admin session';
      document.querySelectorAll('.nav-btn:not(#admin-nav)').forEach(b=>b.remove());
      $('admin-nav').classList.remove('hidden');
      $('hero-score').classList.add('hidden');
      $('grade-label').textContent='Administrative controls and shared service health';
      document.querySelector('.hero h1').innerHTML='Knowledge Arena<br><em>control centre.</em>';
      showView('admin');
    }else if(isStudent&&!studentView){
      try{await api('get_admin_summary');$('admin-nav').classList.remove('hidden');}
      catch(e){$('admin-nav').remove();}
    }
    client.auth.onAuthStateChange((_event,next)=>{if(!next){session=null;setMessage('Your LIB session has ended. Please sign in again.','error');$('session-state').textContent='Signed out';}else session=next;});
  }
  init().catch(e=>setMessage(e.message,'error'));
})();