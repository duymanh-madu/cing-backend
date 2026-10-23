'use strict';const test=require('node:test'),assert=require('node:assert/strict');
const {createKdsOperationsBridgeV1}=require('../cingKdsOperationsBridgeV1');
const branch={pos_parent:'BRAND-DQIR',pos_id:'109664'};
const value=canReport=>({branch,sampled_at:'2026-10-23T06:00:00Z',orders:[],policy:{warning_minutes:20,critical_minutes:40},capabilities:{transitions_enabled:true,can_report:canReport},history_range:{from:'2026-10-22T00:00:00Z',to:'2026-10-23T00:00:00Z'}});
async function read(canReport,query={}){let status,body;const h=createKdsOperationsBridgeV1({verifyToken:()=>({id:'2',role:'super_admin'}),rpc:async()=>({data:value(canReport)})});
 await h.snapshot({headers:{authorization:'Bearer test'},query:{...branch,...query}},{setHeader(){},status(x){status=x;return this;},json(x){body=x;return this;}});return {status,body};}
test('report authority comes only from database capability, never caller role',async()=>{
 const data=await read(false);assert.equal(data.status,200);assert.equal(data.body.capabilities.can_report,false);assert.deepEqual(data.body.history,[]);assert.deepEqual(data.body.performance,[]);assert.equal(data.body.history_range,null);
 assert.equal((await read(false,{duration_min:'1'})).status,403);
});
test('explicit report authority preserves the report range for Super Admin',async()=>{const data=await read(true);assert.equal(data.status,200);assert.equal(data.body.capabilities.can_report,true);assert.ok(data.body.history_range);});
