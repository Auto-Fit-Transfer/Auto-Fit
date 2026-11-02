const SUPABASE_URL='https://eeeqibyssajykrhvecbv.supabase.co';
const SUPABASE_KEY='sb_publishable_Z02d5opC1lPtOlUJMWsxcg_ZD_8O31x';
const mealLabels={breakfast:'아침',lunch:'점심',dinner:'저녁',snack:'간식'};
const loginSection=document.querySelector('#login-section');
const testSection=document.querySelector('#test-section');
const statusBox=document.querySelector('#status');
const summary=document.querySelector('#summary');
const mealsElement=document.querySelector('#meals');
let accessToken=null;

function setStatus(message,kind='info') { statusBox.textContent=message; statusBox.dataset.kind=kind; }

function formatFoodQuantity(quantity,unit) {
  if(quantity===null||quantity===undefined||quantity==='') return '';
  const numericQuantity=Number(quantity);
  const isGramUnit=/^(g|gram|grams|그램)$/i.test(String(unit||'').trim());
  return isGramUnit&&Number.isFinite(numericQuantity)?String(Math.round(numericQuantity)):String(quantity);
}

document.querySelector('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.submitter; button.disabled=true;
  try {
    const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{
      method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:document.querySelector('#email').value,password:document.querySelector('#password').value})
    });
    const payload=await response.json();
    if(!response.ok) throw new Error(payload.msg||payload.error_description||'로그인 실패');
    accessToken=payload.access_token; loginSection.hidden=true; testSection.hidden=false;
    setStatus('로그인 완료. 생성 버튼을 눌러주세요.');
  } catch(error) { alert(error.message); }
  finally { button.disabled=false; }
});

document.querySelector('#generate').addEventListener('click',async event=>{
  const button=event.currentTarget; button.disabled=true; summary.replaceChildren(); mealsElement.replaceChildren();
  const started=performance.now();
  const timer=setInterval(()=>setStatus(`냉장고 맞춤 식단을 생성하고 저장 중입니다…\n${((performance.now()-started)/1000).toFixed(1)}초 경과`),100);
  try {
    const response=await fetch('/api/diet/recommendations/generate',{
      method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:'{}'
    });
    const payload=await response.json();
    if(!response.ok) throw new Error(typeof payload.detail==='string'?payload.detail:JSON.stringify(payload.detail||payload));
    const elapsed=((performance.now()-started)/1000).toFixed(1);
    const meals=payload.result.meals||[];
    const aiMeals=meals.filter(meal=>meal.source_type==='ai_generated');
    const reused=payload.reused_concurrent_result===true;
    setStatus(`${reused?'동시에 생성된 최신 식단 불러오기':'새 식단 생성·저장 완료'} · ${elapsed}초\n${meals.length}끼 중 ${aiMeals.length}끼가 AI 생성 식단입니다.`);
    [`생성기: ${payload.generator}`,`AI 식단: ${aiMeals.length}/${meals.length}`,`DB 저장: 완료`,`소요: ${elapsed}초`].forEach(value=>{
      const pill=document.createElement('span'); pill.className='pill'; pill.textContent=value; summary.append(pill);
    });
    meals.forEach(meal=>{
      const card=document.createElement('article'); card.className='meal';
      const sourceLabel=meal.source_type==='ai_generated'?'AI 생성':'DB 영양정보 조합';
      const title=document.createElement('h2'); title.textContent=`${mealLabels[meal.meal_type]||meal.meal_type} · ${sourceLabel}`;
      const list=document.createElement('ul');
      (meal.foods||[]).forEach(food=>{const item=document.createElement('li');item.textContent=`${food.food_name} ${formatFoodQuantity(food.quantity,food.unit)}${food.unit||''}`;list.append(item);});
      card.append(title,list); mealsElement.append(card);
    });
  } catch(error) { setStatus(`생성 실패: ${error.message}`,'error'); }
  finally { clearInterval(timer); button.disabled=false; }
});

document.querySelector('#logout').addEventListener('click',()=>{
  accessToken=null; testSection.hidden=true; loginSection.hidden=false; document.querySelector('#login-form').reset();
});
