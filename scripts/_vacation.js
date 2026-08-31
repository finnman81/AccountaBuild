/**
 * Book vacation weeks for a member from the server.
 *
 * Mirrors services/vacation.ts bookVacation() exactly — same per-week flag on
 * users/{uid}/weekly, same seasonal allowance accounting, same public mirror —
 * because the scorer reads the weekly flag and the leaderboard badge reads the
 * mirror. Exists because vacation is self-serve only in the app; there is no
 * admin callable the way hibernation has one.
 */
const path=require('path');
const admin=require(path.join(process.cwd(),'functions','node_modules','firebase-admin'));
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(process.argv[2]))),projectId:'accountabuild'});
const db=admin.firestore();
const core=require(path.join(process.cwd(),'functions','mmr-core'));
const TZ='America/New_York';
const PER_SEASON=2;

const NAME=process.argv[3], WEEKS=Number(process.argv[4]), APPLY=process.argv.includes('--apply');

(async()=>{
  const pu=await db.collection('publicUsers').where('displayName','==',NAME).get();
  if(pu.empty) throw new Error('no user named '+NAME);
  const uid=pu.docs[0].id;
  const u=(await db.doc('users/'+uid).get()).data()||{};
  const season=core.seasonIdFromDate(new Date(),TZ);
  const used=Number((u.vacationUsed||{})[season])||0;
  const remaining=Math.max(0,PER_SEASON-used);

  const ids=[]; let w=core.isoWeekIdInTz(new Date(),TZ);
  for(let i=0;i<WEEKS;i++){ids.push(w); w=core.nextIsoWeekId(w,TZ);}

  // only weeks not already booked count against the allowance
  const todo=[];
  for(const id of ids){
    const d=await db.doc('users/'+uid+'/weekly/'+id).get();
    if(!(d.exists && d.data().vacation===true)) todo.push(id);
  }
  console.log(NAME+' ('+uid+')');
  console.log('  season '+season+' | used '+used+' | remaining '+remaining);
  ids.forEach(id=>{const dts=core.isoWeekDatesInTz(id,TZ);console.log('  '+id+'  '+dts[0]+' -> '+dts[6]+(todo.includes(id)?'  [book]':'  [already booked]'));});
  if(todo.length>remaining) throw new Error('only '+remaining+' vacation week(s) left this season');
  if(!APPLY) return console.log('\n[dry run] pass --apply');

  const batch=db.batch();
  todo.forEach(id=>batch.set(db.doc('users/'+uid+'/weekly/'+id),
    {vacation:true,vacationSetAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true}));
  await batch.commit();
  await db.doc('users/'+uid).set({vacationUsed:{[season]:used+todo.length}},{merge:true});
  const sorted=[...ids].sort();
  await db.doc('publicUsers/'+uid).set({
    vacationFromWeekId:sorted[0],
    vacationUntilWeekId:sorted[sorted.length-1],
    vacationWeekId:sorted.includes(core.isoWeekIdInTz(new Date(),TZ))?core.isoWeekIdInTz(new Date(),TZ):null,
  },{merge:true});
  console.log('\nbooked '+todo.length+' week(s)');
})().catch(e=>{console.error(String(e.message||e));process.exit(1)});
