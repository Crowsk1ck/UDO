import type {Identity} from '../worker/auth';
export const sharedSections=['Охоронні пости','Патрулювання','Шикування','Тен-коди','Накази','Шаблони оголошень'];
export function canSee(r:any,u:Identity){return u.role==='admin'||sharedSections.includes(r.section)||(r.section==='Особовий склад'&&r.id===u.personId)||(['Рапорти','Посади та підвищення'].includes(r.section)&&r.personId===u.personId);}
export function projectState(data:any,u:Identity){return u.role==='admin'?data:{...data,records:data.records.filter((r:any)=>canSee(r,u)),logs:[]};}
const stable=(v:any):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export function mergeEmployee(current:any,incoming:any,u:Identity){
 if(stable(current.plans)!==stable(incoming.plans))throw Error('Вимоги підвищень змінює керівник');
 const visible=current.records.filter((r:any)=>canSee(r,u));const received=new Map<string,any>();
 for(const r of incoming.records){if(!r||typeof r.id!=='string'||received.has(r.id))throw Error('Некоректний запис');received.set(r.id,r);}
 for(const r of visible)if(!received.has(r.id))throw Error('Видалення записів недоступне');
 const updated=new Map<string,any>();
 for(const r of incoming.records){
  const old=current.records.find((x:any)=>x.id===r.id);
  if(old&&stable(old)===stable(r))continue;
  if(old&&!canSee(old,u))throw Error('Немає доступу до запису');
  if(!['Рапорти','Посади та підвищення'].includes(r.section)||r.personId!==u.personId)throw Error('Можна змінювати лише власні рапорти й підвищення');
  if(!['Заплановано','У роботі','На перевірці'].includes(r.status)&&!(old?.status==='На доопрацювання'&&r.status===old.status))throw Error('Рішення ухвалює керівник');
  if(old){
   if(['Погоджено','Завершено'].includes(old.status))throw Error('Погоджений запис заблоковано для редагування');
   const allowed=['body','files','checks','status'];if(r.section==='Рапорти')allowed.push('title');
   for(const key of new Set([...Object.keys(old),...Object.keys(r)]))if(!allowed.includes(key)&&stable(old[key])!==stable(r[key]))throw Error('Службові поля змінює керівник');
  }else{
   if(r.section!=='Рапорти')throw Error('Картку підвищення створює керівник');
   const allowed=['id','section','personId','title','body','status','files'];if(Object.keys(r).some(k=>!allowed.includes(k)))throw Error('Недозволені поля рапорту');
  }
  if(typeof r.title!=='string'||typeof r.body!=='string')throw Error('Вкажіть назву й текст');
  if(r.section==='Посади та підвищення'&&r.checks!==undefined){const plan=current.plans[r.plan||0];if(!plan||!r.checks||Array.isArray(r.checks)||typeof r.checks!=='object'||Object.entries(r.checks).some(([k,v])=>!/^\d+$/.test(k)||+k>=plan.tasks.length||typeof v!=='boolean'))throw Error('Некоректний чекліст');}
  updated.set(r.id,r);
 }
 return {...current,records:[...current.records.map((r:any)=>updated.get(r.id)||r),...incoming.records.filter((r:any)=>!current.records.some((x:any)=>x.id===r.id))]};
}
