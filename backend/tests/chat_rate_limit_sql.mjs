import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.argv[2]);
const db=new PGlite();
const uid='00000000-0000-4000-8000-000000000001';
let checks=0;
const check=(v)=>{assert.ok(v);checks++;};
try {
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(readFileSync(new URL('../sql/chat_rate_limits.sql',import.meta.url),'utf8'));
 const consume=async(user,bucket)=>(await db.query('select consume_chat_rate_limit($1::uuid,$2::text) as r',[user,bucket])).rows[0].r;
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>consume(uid,'answers'),/permission denied/);checks++;
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 for(let i=0;i<10;i++)check((await consume(uid,'answers')).allowed);
 const denied=await consume(uid,'answers');
 check(!denied.allowed && denied.retry_after>=1 && denied.retry_after<=60);
 check((await consume(uid,'requests')).allowed);
 check((await consume('00000000-0000-4000-8000-000000000002','answers')).allowed);
 for(let i=1;i<60;i++)assert.ok((await consume(uid,'requests')).allowed);
 check(!(await consume(uid,'requests')).allowed);
 await db.exec('reset role');
 await db.query("update chat_rate_limit_events set created_at=clock_timestamp()-interval '61 seconds' where user_id=$1",[uid]);
 await db.exec('set role service_role');
 check((await consume(uid,'answers')).allowed);
 await assert.rejects(()=>consume(uid,'unknown'),/INVALID_RATE_LIMIT_INPUT/);checks++;
 console.log(`${checks} SQL quota checks passed (isolated DB; not concurrency proof).`);
} finally {await db.close();}
