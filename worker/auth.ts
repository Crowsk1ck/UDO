export type Identity = {id:string; username:string; role:'admin'|'employee'; personId?:string};
const encoder = new TextEncoder();
const hex = (a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
export const digest = async(s:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
const cookie=(value:string,age:number)=>`udo_session=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const loginPage=()=>new Response(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вхід · УДО</title><style>body{margin:0;background:#12141a;color:#e8eaed;font:16px system-ui;display:grid;place-items:center;min-height:100dvh}form{width:min(360px,85vw);padding:32px;background:#1a1d26;border:1px solid #303642;border-radius:16px}label{display:block;margin:20px 0}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:8px;border:1px solid #424b58;background:#12141a;color:inherit;margin-top:8px;font:inherit}button{background:#9db9c6;color:#12141a;cursor:pointer}p{color:#9ba1ad}#error{color:#ffb3b3}</style><form id="login"><h1>Вхід до УДО</h1><p>Введіть облікові дані, які видав керівник.</p><label>Логін<input name="username" autocomplete="username" required maxlength="64"></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button>Увійти</button><p id="error" role="alert"></p></form><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});if(r.ok)location.replace('/');else document.querySelector('#error').textContent=await r.text()}catch{document.querySelector('#error').textContent='Помилка з’єднання. Спробуйте ще раз.'}finally{b.disabled=false}};</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
export async function identity(req:Request,env:Cloudflare.Env):Promise<Identity|null>{
 const token=req.headers.get('Cookie')?.match(/(?:^|;\s*)udo_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;
 const session:any=await env.DB!.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').bind(await digest(token),Date.now()).first();if(!session)return null;
 if(session.account_id==='admin'){if(!env.UDO_ADMIN_PASSWORD||env.UDO_ADMIN_PASSWORD.length<16||session.admin_key!==await digest(env.UDO_ADMIN_PASSWORD))return null;return {id:'admin',username:env.UDO_ADMIN_USER||'admin',role:'admin'};}
 const a:any=await env.DB!.prepare('SELECT id,username,person_id FROM accounts WHERE id=? AND active=1').bind(session.account_id).first();return a?{id:a.id,username:a.username,personId:a.person_id,role:'employee'}:null;
}
export async function authRoute(req:Request,env:Cloudflare.Env,user:Identity|null):Promise<Response|null>{
 const path=new URL(req.url).pathname;
 if(path==='/login')return req.method==='GET'?loginPage():new Response('Method not allowed',{status:405});
 if(!path.startsWith('/api/auth/')&&path!=='/api/accounts')return null;
 if(req.method!=='GET'&&req.headers.get('origin')!==new URL(req.url).origin)return new Response('Forbidden',{status:403});
 if(path==='/api/auth/login'&&req.method==='POST'){
  if(Number(req.headers.get('content-length')||0)>4096)return new Response('Завеликий запит',{status:413});
  let body:any;try{body=await req.json()}catch{return new Response('Некоректний запит',{status:400})}
  const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');if(!username||username.length>64||password.length>256)return new Response('Неправильний логін або пароль',{status:401});
  const now=Date.now();const keys=await Promise.all(['user:'+username,'ip:'+(req.headers.get('cf-connecting-ip')||'local')].map(digest));
  for(const key of keys){const r:any=await env.DB!.prepare('INSERT INTO login_limits(key,count,until_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until_at<=? THEN 1 ELSE count+1 END, until_at=CASE WHEN until_at<=? THEN excluded.until_at ELSE until_at END RETURNING count').bind(key,now+900000,now,now).first();if(r.count>15)return new Response('Забагато спроб. Спробуйте через 15 хвилин.',{status:429});}
  let accountId='',adminKey:string|null=null;
  if(username===(env.UDO_ADMIN_USER||'admin').toLowerCase()){
   if(!env.UDO_ADMIN_PASSWORD||env.UDO_ADMIN_PASSWORD.length<16)return new Response('Керівник має налаштувати UDO_ADMIN_PASSWORD у Cloudflare.',{status:503});
   if(await digest(password)===await digest(env.UDO_ADMIN_PASSWORD)){accountId='admin';adminKey=await digest(env.UDO_ADMIN_PASSWORD);}
  }else{const a:any=await env.DB!.prepare('SELECT * FROM accounts WHERE username=? AND active=1').bind(username).first();const h=await passwordHash(password,a?.salt||'dummy-salt-for-unknown-user');if(a&&h===a.password_hash)accountId=a.id;}
  if(!accountId)return new Response('Неправильний логін або пароль',{status:401});
  const token=random();await env.DB!.batch([env.DB!.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),env.DB!.prepare('DELETE FROM login_limits WHERE until_at<=?').bind(now),env.DB!.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digest(token),accountId,adminKey,now+43200000)]);
  return new Response('{}',{headers:{'Set-Cookie':cookie(token,43200),'Cache-Control':'no-store','Content-Type':'application/json'}});
 }
 if(path==='/api/auth/logout'&&req.method==='POST'){const token=req.headers.get('Cookie')?.match(/udo_session=([a-f0-9]{64})/)?.[1];if(token)await env.DB!.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return new Response('{}',{headers:{'Set-Cookie':cookie('',0),'Cache-Control':'no-store'}});}
 if(!user)return new Response('Увійдіть до панелі',{status:401});
 if(path==='/api/auth/me')return json(user);
 if(path!=='/api/accounts')return new Response('Not found',{status:404});
 if(user.role!=='admin')return new Response('Лише керівник може керувати акаунтами',{status:403});
 if(req.method==='GET')return json((await env.DB!.prepare('SELECT id,username,person_id,active,created_at FROM accounts ORDER BY created_at DESC').all()).results);
 if(!['POST','PATCH'].includes(req.method))return new Response('Method not allowed',{status:405});
 let body:any;try{body=await req.json()}catch{return new Response('Некоректний запит',{status:400})}
 if(req.method==='POST'){
  const username=String(body.username||'').trim().toLowerCase();const password=String(body.password||'');
  if(!/^[a-z0-9_.-]{3,32}$/.test(username)||username===(env.UDO_ADMIN_USER||'admin').toLowerCase())return new Response('Логін: 3–32 латинські літери, цифри, крапка, дефіс або _. Логін керівника зарезервований.',{status:400});
  if(password.length<16||password.length>128)return new Response('Пароль: від 16 до 128 символів',{status:400});
  const row:any=await env.DB!.prepare("SELECT data FROM state WHERE id='main'").first();const records=row?JSON.parse(row.data).records:[];
  if(!records.some((r:any)=>r.id===body.personId&&r.section==='Особовий склад'))return new Response('Спочатку створіть особову справу співробітника',{status:400});
  const salt=random();try{await env.DB!.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,1,?)').bind(crypto.randomUUID(),username,await passwordHash(password,salt),salt,body.personId,new Date().toISOString()).run()}catch{return new Response('Логін або особова справа вже має акаунт',{status:409})}return json({ok:true},201);
 }
 const a:any=await env.DB!.prepare('SELECT id FROM accounts WHERE id=?').bind(String(body.id||'')).first();if(!a)return new Response('Акаунт не знайдено',{status:404});
 if(body.password!==undefined){const password=String(body.password);if(password.length<16||password.length>128)return new Response('Пароль: від 16 до 128 символів',{status:400});const salt=random();await env.DB!.batch([env.DB!.prepare('UPDATE accounts SET password_hash=?,salt=? WHERE id=?').bind(await passwordHash(password,salt),salt,a.id),env.DB!.prepare('DELETE FROM sessions WHERE account_id=?').bind(a.id)]);}
 else if(typeof body.active==='boolean')await env.DB!.batch([env.DB!.prepare('UPDATE accounts SET active=? WHERE id=?').bind(body.active?1:0,a.id),env.DB!.prepare('DELETE FROM sessions WHERE account_id=?').bind(a.id)]);
 else return new Response('Вкажіть пароль або стан акаунта',{status:400});
 return json({ok:true});
}
