const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const {weekWindow}=require('../domain/cingBlockPuzzleWeekWindow');
test('weekly rollover is Monday 00:00 Vietnam, independent of host timezone',()=>{
 assert.deepEqual(weekWindow(Date.parse('2026-10-25T16:59:59Z')),{starts_at:'2026-10-18T17:00:00.000Z',ends_at:'2026-10-25T17:00:00.000Z'});
 assert.deepEqual(weekWindow(Date.parse('2026-10-25T17:00:00Z')),{starts_at:'2026-10-25T17:00:00.000Z',ends_at:'2026-11-01T17:00:00.000Z'});
});
test('snapshot uses existing weekly best-score leaderboard and authenticated personal baseline',async()=>{
 const filters=[];const query={};for(const method of ['select','eq','gte','lt','order','limit'])query[method]=(...args)=>{filters.push([method,...args]);return query;};
 query.then=(resolve,reject)=>Promise.resolve({data:[{score:100}],error:null}).then(resolve,reject);
 let options;
 const mocks={
  '../../../supabase':{from:()=>query},
  '../../leaderboardService':{getGameLeaderboard:async(_game,opts)=>{options=opts;return [{user_id:'other',score:200,rank:1,player_name:'A'},{user_id:'me',score:100,rank:2},{user_id:'below',score:80,rank:3}];}},
  './cingBlockPuzzleSessionService':{resolveAuthenticatedUserId:()=> 'me'},
 };
 const filename=require.resolve('../cingBlockPuzzleWeeklyProgressService');delete require.cache[filename];const load=Module._load;
 Module._load=function(name,parent,isMain){return mocks[name]||load.call(this,name,parent,isMain);};let service;
 try{service=require(filename);}finally{Module._load=load;}
 const snapshot=await service.getWeeklyProgress({customer:{}});
 assert.equal(snapshot.self.best_score,100);assert.equal(snapshot.self.rank,2);assert.equal(snapshot.scoring,'weekly_best');
 assert.deepEqual(snapshot.rivals.map(row=>row.user_id),['other']);assert.ok(filters.some(row=>row[0]==='eq'&&row[1]==='user_id'&&row[2]==='me'));
 assert.equal(options.weekly,true);assert.equal(options.weekStart,snapshot.period.starts_at);
});
