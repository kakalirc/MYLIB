(() => {
  const $ = (id) => document.getElementById(id);
  if (new URLSearchParams(window.location.search).get('view') === 'student') {
    const adminNav = document.querySelector('.nav-btn[data-view="admin"]');
    if (adminNav) adminNav.remove();
  }
  const views = ['play','daily','achievements','leaderboard','admin'];
  let currentGame = 'Quick Quiz', questions = [], index = 0, score = 0, answered = false, dailyMode = false, xp = 120;
  const bank = [
    {c:'GENERAL KNOWLEDGE',q:'Which planet is known as the Red Planet?',a:['Venus','Mars','Jupiter','Mercury'],k:1,e:'Mars looks reddish because of iron oxide on its surface.'},
    {c:'SCIENCE',q:'Which part of a plant mainly absorbs water from the soil?',a:['Flower','Leaf','Root','Stem'],k:2,e:'Roots absorb water and minerals from the soil.'},
    {c:'MATHEMATICS',q:'What is 12 × 8?',a:['84','88','96','108'],k:2,e:'12 multiplied by 8 equals 96.'},
    {c:'LANGUAGE',q:'Which word is the opposite of “ancient”?',a:['Old','Modern','Historic','Early'],k:1,e:'Modern means relating to the present or recent times.'},
    {c:'GEOGRAPHY',q:'Which is the largest ocean on Earth?',a:['Atlantic','Indian','Arctic','Pacific'],k:3,e:'The Pacific Ocean is the largest and deepest ocean.'},
    {c:'LOGIC',q:'What comes next: 2, 4, 8, 16, …?',a:['18','24','32','30'],k:2,e:'Each number doubles, so 16 × 2 = 32.'},
    {c:'SCIENCE',q:'Which gas do plants take in during photosynthesis?',a:['Oxygen','Carbon dioxide','Nitrogen','Hydrogen'],k:1,e:'Plants use carbon dioxide, water and light to make food.'},
    {c:'GENERAL KNOWLEDGE',q:'How many sides does a hexagon have?',a:['Five','Six','Seven','Eight'],k:1,e:'A hexagon is a six-sided polygon.'},
    {c:'LANGUAGE',q:'Choose the correctly spelled word.',a:['Beautifull','Beutiful','Beautiful','Beautifal'],k:2,e:'Beautiful is spelled B-E-A-U-T-I-F-U-L.'},
    {c:'GEOGRAPHY',q:'Which imaginary line divides Earth into Northern and Southern Hemispheres?',a:['Prime Meridian','Equator','Tropic of Cancer','Arctic Circle'],k:1,e:'The Equator is at 0 degrees latitude.'}
  ];
  function showView(name){views.forEach(v=>$('view-'+v).classList.toggle('hidden',v!==name));$('quiz').classList.add('hidden');$('results').classList.add('hidden');document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}
  function start(game,isDaily=false){currentGame=game;dailyMode=isDaily;questions=[...bank].sort(()=>Math.random()-.5).slice(0,isDaily?5:5);index=0;score=0;answered=false;views.forEach(v=>$('view-'+v).classList.add('hidden'));$('results').classList.add('hidden');$('quiz').classList.remove('hidden');render();}
  function render(){const q=questions[index];$('quiz-count').textContent='QUESTION '+(index+1)+' OF '+questions.length;$('quiz-progress').style.width=((index)/questions.length*100)+'%';$('quiz-category').textContent=q.c;$('quiz-question').textContent=q.q;$('quiz-feedback').textContent='';$('next-question').classList.add('hidden');$('answers').innerHTML='';answered=false;q.a.forEach((a,i)=>{const b=document.createElement('button');b.className='answer';b.textContent=String.fromCharCode(65+i)+'.  '+a;b.addEventListener('click',()=>choose(i));$('answers').appendChild(b);});}
  function choose(n){if(answered)return;answered=true;const q=questions[index];[...$('answers').children].forEach((b,i)=>{b.disabled=true;if(i===q.k)b.classList.add('correct');if(i===n&&n!==q.k)b.classList.add('wrong');});if(n===q.k){score++;$('quiz-feedback').textContent='Correct! '+q.e;}else{$('quiz-feedback').textContent='Not quite. '+q.e;}$('next-question').textContent=index===questions.length-1?'See results →':'Next question →';$('next-question').classList.remove('hidden');$('quiz-progress').style.width=((index+1)/questions.length*100)+'%';}
  function finish(){const earned=score*10+10;xp+=earned;$('hero-xp').textContent=xp;$('leader-xp').textContent=xp;$('result-score').textContent=score+' / '+questions.length;$('result-title').textContent=score===questions.length?'Perfect score!':score>=3?'Well played!':'Good effort!';$('result-message').textContent='You earned '+earned+' sample Game XP. Keep practising to improve your score.';$('quiz').classList.add('hidden');$('results').classList.remove('hidden');}
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  document.querySelectorAll('.launch').forEach(b=>b.addEventListener('click',()=>start(b.dataset.game)));
  $('filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.game-card').forEach(c=>c.classList.toggle('hidden',b.dataset.filter!=='all'&&c.dataset.kind!==b.dataset.filter));});
  $('start-featured').addEventListener('click',()=>start('Quick Quiz'));
  $('start-daily').addEventListener('click',()=>start("Today's Knowledge Mix",true));
  $('quit-quiz').addEventListener('click',()=>showView(dailyMode?'daily':'play'));
  $('next-question').addEventListener('click',()=>{if(index<questions.length-1){index++;render();}else finish();});
  $('back-to-games').addEventListener('click',()=>showView('play'));
})();