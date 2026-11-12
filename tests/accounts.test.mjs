import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {authRoute,identity,passwordHash} from '../worker/auth.ts';
import {mergeEmployee,projectState} from '../lib/access.ts';
const employee={id:'a',username:'agent',personId:'person',role:'employee'};
const state={plans:[{tasks:['Залік']}],logs:[{text:'private'}],records:[{id:'person',section:'Особовий склад',title:'Агент'},{id:'other',section:'Особовий склад',title:'Інший'},{id:'p',section:'Посади та підвищення',personId:'person',title:'Підвищення',body:'',status:'У роботі',since:'2026-01-01',reviewer:'admin',files:[],checks:{}},{id:'order',section:'Накази',title:'Наказ'}]};
test('employee visibility and server-enforced permissions',()=>{
 const view=projectState(state,employee);assert.equal(view.logs.length,0);assert.deepEqual(view.records.map(x=>x.id),['person','p','order']);
 const update=structuredClone(view);update.records[1].checks={0:true};const merged=mergeEmployee(state,update,employee);assert.equal(merged.records.length,4);assert.equal(merged.records[2].checks[0],true);
 for(const [key,value] of [['status','Погоджено'],['reviewer','self'],['since','2020-01-01'],['personId','other'],['plan',1]]){const x=structuredClone(view);x.records[1][key]=value;assert.throws(()=>mergeEmployee(state,x,employee));}
 const x=structuredClone(view);x.records.push({id:'r',section:'Рапорти',personId:'person',title:'Рапорт',body:'Текст',status:'На перевірці',files:[]});assert.equal(mergeEmployee(state,x,employee).records.length,5);
 x.records.at(-1).personId='other';assert.throws(()=>mergeEmployee(state,x,employee));
 const y=structuredClone(view);y.records[2].title='Changed order';assert.throws(()=>mergeEmployee(state,y,employee));
 const z=structuredClone(view);z.plans=[];assert.throws(()=>mergeEmployee(state,z,employee));
});
function environment(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle/0000_simple_carmella_unuscione.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../drizzle/0001_accounts.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO state VALUES(?,?,?)').run('main',JSON.stringify(state),1);
 const wrap=(sql,args=[])=>({bind(...a){return wrap(sql,a)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}}});
 return {DB:{prepare:sql=>wrap(sql),batch:async xs=>Promise.all(xs.map(x=>x.run()))},UDO_ADMIN_PASSWORD:'test-only-admin-password-123',UDO_ADMIN_USER:'admin'};
}
const req=(path,body,method='POST',cookie)=>new Request('https://udo.test'+path,{method,headers:{Origin:'https://udo.test','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('account creation, session identity, permissions, reset and block',async()=>{
 const env=environment(),admin={id:'admin',username:'admin',role:'admin'};
 assert.equal((await authRoute(req('/api/accounts',{username:'agent',password:'employee-password-123',personId:'person'}),env,employee)).status,403);
 assert.equal((await authRoute(req('/api/accounts',{username:'agent',password:'employee-password-123',personId:'person'}),env,admin)).status,201);
 let login=await authRoute(req('/api/auth/login',{username:'agent',password:'bad'}),env,null);assert.equal(login.status,401);
 login=await authRoute(req('/api/auth/login',{username:'agent',password:'employee-password-123'}),env,null);assert.equal(login.status,200);let cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 const u=await identity(req('/',null,'GET',cookie),env);assert.equal(u.personId,'person');assert.equal(u.role,'employee');
 await authRoute(req('/api/accounts',{id:u.id,password:'replacement-password-123'},'PATCH'),env,admin);assert.equal(await identity(req('/',null,'GET',cookie),env),null);
 login=await authRoute(req('/api/auth/login',{username:'agent',password:'replacement-password-123'}),env,null);cookie=login.headers.get('set-cookie');assert.ok(await identity(req('/',null,'GET',cookie),env));
 await authRoute(req('/api/accounts',{id:u.id,active:false},'PATCH'),env,admin);assert.equal(await identity(req('/',null,'GET',cookie),env),null);
 assert.equal((await authRoute(req('/api/auth/login',{username:'agent',password:'replacement-password-123'}),env,null)).status,401);
 const a=await authRoute(req('/api/auth/login',{username:'admin',password:env.UDO_ADMIN_PASSWORD}),env,null);assert.equal((await identity(req('/',null,'GET',a.headers.get('set-cookie')),env)).role,'admin');
 env.UDO_ADMIN_PASSWORD='new-admin-password-123';assert.equal(await identity(req('/',null,'GET',a.headers.get('set-cookie')),env),null);
 const list=await (await authRoute(req('/api/accounts',null,'GET'),env,admin)).text();assert.ok(!list.includes('password_hash'));assert.ok(!list.includes('salt'));
 const csrf=new Request('https://udo.test/api/auth/login',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'});assert.equal((await authRoute(csrf,env,null)).status,403);
});
test('rate limit and salted hashes',async()=>{const env=environment();for(let i=0;i<15;i++)await authRoute(req('/api/auth/login',{username:'admin',password:'wrong'}),env,null);assert.equal((await authRoute(req('/api/auth/login',{username:'admin',password:'wrong'}),env,null)).status,429);assert.notEqual(await passwordHash('password','salt1'),await passwordHash('password','salt2'));});
