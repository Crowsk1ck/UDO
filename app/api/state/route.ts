import {parseEvidenceLink} from '../../../lib/evidence';
import {projectState,mergeEmployee} from '../../../lib/access';
import {initial} from '../../data';
import type {Identity} from '../../../worker/auth';
import {env} from 'cloudflare:workers';
const getUser=(req:Request):Identity|null=>{try{return JSON.parse(req.headers.get('x-udo-user')||'null')}catch{return null}};
const json=(x:any)=>Response.json(x,{headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){const u=getUser(req);if(!u)return new Response('Unauthorized',{status:401});const row:any=await env.DB!.prepare("SELECT data,revision FROM state WHERE id='main'").first();return json({data:projectState(row?JSON.parse(row.data):initial,u),revision:row?.revision||0,user:u});}
export async function PUT(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return new Response('Forbidden',{status:403});const u=getUser(req);if(!u)return new Response('Unauthorized',{status:401});
 let payload:any;try{payload=await req.json()}catch{return new Response('Invalid data',{status:400})}let {data,revision,action}=payload;
 if(!data||!Array.isArray(data.records)||!Array.isArray(data.plans)||!Array.isArray(data.logs))return new Response('Invalid data',{status:400});
 const row:any=await env.DB!.prepare("SELECT data,revision FROM state WHERE id='main'").first();const current=row?JSON.parse(row.data):initial;
 if(revision!==(row?.revision||0))return new Response('Дані змінено в іншій вкладці. Оновіть сторінку.',{status:409});
 if(u.role==='employee'){try{data=mergeEmployee(current,data,u)}catch(e:any){return new Response(e.message,{status:403})}}
 try{for(const r of data.records){if(r.files!==undefined&&!Array.isArray(r.files))throw Error();for(const f of r.files||[])parseEvidenceLink(f.url)}}catch{return new Response('Докази мають бути HTTPS-посиланнями ImgBB.',{status:400})}
 data.logs=[{id:crypto.randomUUID(),at:new Date().toISOString(),text:u.role==='employee'?'Співробітник оновив власний рапорт / чекліст':String(action||'Оновлено дані'),by:u.username},...current.logs].slice(0,500);
 const result=revision===0?await env.DB!.prepare('INSERT OR IGNORE INTO state(id,data,revision) VALUES(?,?,1)').bind('main',JSON.stringify(data)).run():await env.DB!.prepare('UPDATE state SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(data),'main',revision).run();
 if(!result.meta.changes)return new Response('Дані змінено в іншій вкладці. Оновіть сторінку.',{status:409});return json({data:projectState(data,u),revision:revision+1});
}
