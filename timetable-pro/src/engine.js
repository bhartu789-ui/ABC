/* TimeTable Pro — dependency-free scheduling engine. Runs in the browser and Node.js. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TimetableEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const uniqueId = prefix => prefix + '_' + Math.random().toString(36).slice(2, 10);
  const clean = x => String(x == null ? '' : x).trim();
  function defaultData() {
    const settings = { schoolName: 'Green Valley School', academicYear: '2026–2027', days: 5, periods: 6, start: '08:00', duration: 40, breakAfter: 3, breakMinutes: 20 };
    const classes = [
      { id: 'c6a', name: 'Grade 6 – A' }, { id: 'c6b', name: 'Grade 6 – B' },
      { id: 'c7a', name: 'Grade 7 – A' }, { id: 'c8a', name: 'Grade 8 – A' }
    ];
    const subjects = [
      {id:'eng',name:'English',code:'ENG',color:'#6f7cf5'}, {id:'math',name:'Mathematics',code:'MATH',color:'#2c9e8d'},
      {id:'sci',name:'Science',code:'SCI',color:'#ed9b53'}, {id:'sindhi',name:'Sindhi',code:'SND',color:'#9a70d6'},
      {id:'urdu',name:'Urdu',code:'URD',color:'#d86f98'}, {id:'sst',name:'Social Studies',code:'SST',color:'#5498d3'},
      {id:'comp',name:'Computer',code:'ICT',color:'#38aab9'}, {id:'pe',name:'Physical Ed.',code:'PE',color:'#8ba457'}
    ];
    const teachers = [
      {id:'t1',name:'Ayesha Shah'}, {id:'t2',name:'Ahmed Kumar'}, {id:'t3',name:'Bilal Ali'},
      {id:'t4',name:'Komal Devi'}, {id:'t5',name:'Ramesh Lal'}, {id:'t6',name:'Hina Shaikh'},
      {id:'t7',name:'Sana Bheel'}, {id:'t8',name:'Sagar Meghwar'}, {id:'t9',name:'Fatima Junejo'},
      {id:'t10',name:'Farhan Malik'}, {id:'t11',name:'Hassan Khan'}, {id:'t12',name:'Laila Rajput'},
      {id:'t13',name:'Karim Bhatti'}, {id:'t14',name:'Rafiq Samoon'}
    ];
    const mapping = [
      ['eng',6,['t1','t1','t2','t2']], ['math',6,['t3','t3','t4','t4']],
      ['sci',5,['t5','t5','t6','t6']], ['sindhi',4,['t7','t7','t8','t8']],
      ['urdu',3,['t9','t9','t10','t10']], ['sst',3,['t11','t11','t12','t12']],
      ['comp',2,['t13','t13','t13','t13']], ['pe',1,['t14','t14','t14','t14']]
    ];
    const allocations = [];
    classes.forEach((c,i)=>mapping.forEach(([subjectId,perWeek,ids])=>allocations.push({id:'a_'+c.id+'_'+subjectId,classId:c.id,subjectId,teacherId:ids[i],perWeek})));
    return { settings, classes, subjects, teachers, allocations, schedule:{},locks:{} };
  }
  function dimensions(data){return {days:Number(data.settings.days),periods:Number(data.settings.periods),size:Number(data.settings.days)*Number(data.settings.periods)};}
  function ensureMatrix(data){
    const {size}=dimensions(data);
    const schedule={},locks={};
    data.classes.forEach(c=>{
      schedule[c.id]=Array.from({length:size},(_,i)=>data.schedule?.[c.id]?.[i] || null);
      locks[c.id]=Array.from({length:size},(_,i)=>Boolean(data.locks?.[c.id]?.[i]));
    });
    return {schedule,locks};
  }
  function validateInputs(data) {
    const errors=[],warnings=[];
    const settings=data?.settings||{};
    const {days,periods,size}=dimensions({settings});
    if(!Number.isInteger(days)||days<1||days>6||!Number.isInteger(periods)||periods<1||periods>10)errors.push('Choose 1–6 school days and 1–10 periods per day.');
    if(!Number.isInteger(settings.duration)||settings.duration<20||settings.duration>90)errors.push('Period length must be 20–90 minutes.');
    if(!Number.isInteger(settings.breakMinutes)||settings.breakMinutes<0||settings.breakMinutes>60)errors.push('Break duration must be 0–60 minutes.');
    if(!Number.isInteger(settings.breakAfter)||settings.breakAfter<0||settings.breakAfter>periods)errors.push('Choose a valid break position.');
    if(!Array.isArray(data.classes)||!data.classes.length)errors.push('Add at least one class.');
    if(!Array.isArray(data.teachers)||!data.teachers.length)errors.push('Add at least one teacher.');
    if(!Array.isArray(data.subjects)||!data.subjects.length)errors.push('Add at least one subject.');
    const classes=new Map((data.classes||[]).map(x=>[x.id,x]));
    const teachers=new Map((data.teachers||[]).map(x=>[x.id,x]));
    const subjects=new Map((data.subjects||[]).map(x=>[x.id,x]));
    const classTotals=new Map(),teacherTotals=new Map(),pairs=new Set();
    for(const a of (data.allocations||[])){
      if(!classes.has(a.classId)||!teachers.has(a.teacherId)||!subjects.has(a.subjectId)){
        errors.push('A teaching allocation refers to a missing class, subject or teacher.');continue;
      }
      if(!Number.isInteger(Number(a.perWeek))||Number(a.perWeek)<1||Number(a.perWeek)>size)errors.push('Each allocation needs 1 to '+size+' periods per week.');
      const pair=a.classId+':'+a.subjectId;
      if(pairs.has(pair))errors.push('Assign each subject only once per class (combine duplicate rows).');
      pairs.add(pair);
      classTotals.set(a.classId,(classTotals.get(a.classId)||0)+Number(a.perWeek));
      teacherTotals.set(a.teacherId,(teacherTotals.get(a.teacherId)||0)+Number(a.perWeek));
    }
    for(const c of data.classes||[]){const count=classTotals.get(c.id)||0;if(count>size)errors.push(c.name+' needs '+count+' periods, but only '+size+' exist.');if(count<size)warnings.push(c.name+' has '+(size-count)+' free/study periods.');}
    for(const t of data.teachers||[]){const count=teacherTotals.get(t.id)||0;if(count>size)errors.push(t.name+' is assigned '+count+' weekly periods, but can teach at most '+size+' without clashes.');}
    if(!(data.allocations||[]).length)errors.push('Add subject/teacher allocations before generating.');
    return {errors:[...new Set(errors)],warnings,weeklyCapacity:size};
  }
  function seeded(seed) { let a=seed>>>0; return ()=>{a+=0x6d2b79f5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function validateSchedule(data) {
    const {days,periods,size}=dimensions(data);
    const {schedule}=ensureMatrix(data);
    const allocMap=new Map(data.allocations.map(a=>[a.id,a]));
    const teachers=new Map(data.teachers.map(t=>[t.id,t.name]));
    const seen=new Map(),counts=new Map(),conflicts=[],perClass=[];
    let scheduled=0;
    data.classes.forEach(c=>{
      let filled=0;
      for(let i=0;i<size;i++){
        const aid=schedule[c.id][i];if(!aid)continue;
        const a=allocMap.get(aid);
        if(!a||a.classId!==c.id){conflicts.push('Invalid lesson in '+c.name+' slot '+(i+1));continue;}
        filled++;scheduled++;counts.set(a.id,(counts.get(a.id)||0)+1);
        const k=a.teacherId+':'+i;
        if(seen.has(k)){const other=seen.get(k);conflicts.push((teachers.get(a.teacherId)||'Teacher')+' is double-booked: '+other+' and '+c.name+' ('+weekdays[Math.floor(i/periods)]+', P'+(i%periods+1)+').');}
        seen.set(k,c.name);
      }
      perClass.push({id:c.id,name:c.name,filled,total:size});
    });
    const shortages=[];
    data.allocations.forEach(a=>{
      const assigned=counts.get(a.id)||0;
      if(assigned>Number(a.perWeek)) conflicts.push('Too many '+(data.subjects.find(s=>s.id===a.subjectId)?.name||'subject')+' periods in '+(data.classes.find(c=>c.id===a.classId)?.name||'class')+'.');
      if(assigned<Number(a.perWeek))shortages.push({allocationId:a.id,missing:Number(a.perWeek)-assigned});
    });
    const required=data.allocations.reduce((n,a)=>n+Number(a.perWeek),0);
    return {valid:conflicts.length===0&&shortages.length===0,conflicts,shortages,scheduled,required,free:Math.max(0,data.classes.length*size-scheduled),perClass,days,periods};
  }
  function generateSchedule(data,{attempts=160,preserveLocked=true,seed=Date.now()}={}){
    const check=validateInputs(data);
    if(check.errors.length)return {ok:false,error:check.errors.join(' '),issues:check.errors,stats:null};
    const {size,days,periods}=dimensions(data);
    const matrix=ensureMatrix(data);
    const reqById=new Map(data.allocations.map(a=>[a.id,a]));
    const clsById=new Map(data.classes.map(c=>[c.id,c]));
    const teacherTotals=new Map();data.allocations.forEach(a=>teacherTotals.set(a.teacherId,(teacherTotals.get(a.teacherId)||0)+a.perWeek));
    const pinned=[],reserve=new Set(),pinnedCounts=new Map();
    for(const c of data.classes){
      for(let i=0;i<size;i++){
        if(!preserveLocked||!matrix.locks[c.id][i])continue;
        const aid=matrix.schedule[c.id][i];
        if(!aid)continue;
        const a=reqById.get(aid);
        if(!a||a.classId!==c.id)return {ok:false,error:'A locked slot contains an invalid lesson. Unlock it and retry.',issues:[]};
        const k=a.teacherId+':'+i;
        if(reserve.has(k))return {ok:false,error:'Two locked lessons need the same teacher at the same time. Unlock one first.',issues:[]};
        reserve.add(k);pinned.push({c:c.id,i,a});pinnedCounts.set(aid,(pinnedCounts.get(aid)||0)+1);
      }
    }
    for(const a of data.allocations)if((pinnedCounts.get(a.id)||0)>a.perWeek)return {ok:false,error:'Locked slots exceed the required weekly count for a subject.',issues:[]};
    let best=null;
    const rounds=Math.max(1,Math.min(500,Number(attempts)||160));
    for(let attempt=0;attempt<rounds;attempt++){
      const random=seeded((Number(seed)+attempt*2654435761)>>>0);
      const schedule={};
      const busy=new Set();
      const dayCounts=new Map();
      data.classes.forEach(c=>{schedule[c.id]=Array(size).fill(null);});
      pinned.forEach(({c,i,a})=>{schedule[c][i]=a.id;busy.add(a.teacherId+':'+i);dayCounts.set(a.id+':'+Math.floor(i/periods),(dayCounts.get(a.id+':'+Math.floor(i/periods))||0)+1);});
      const tasks=[];
      data.allocations.forEach(a=>{for(let i=pinnedCounts.get(a.id)||0;i<a.perWeek;i++)tasks.push(a);});
      // Assign the busiest shared teachers first, while randomizing equal-demand order.
      tasks.sort((a,b)=>{
        const load=(teacherTotals.get(b.teacherId)||0)-(teacherTotals.get(a.teacherId)||0);
        return load||(b.perWeek-a.perWeek)||((random()-.5)*2);
      });
      let assigned=pinned.length;
      let quality=0;
      for(const a of tasks){
        const options=[];
        for(let i=0;i<size;i++){
          if(schedule[a.classId][i]||busy.has(a.teacherId+':'+i))continue;
          if(preserveLocked&&matrix.locks[a.classId][i])continue;
          const day=Math.floor(i/periods),p=i%periods;
          const usedDay=dayCounts.get(a.id+':'+day)||0;
          const before=p>0?schedule[a.classId][i-1]:null;
          const after=p<periods-1?schedule[a.classId][i+1]:null;
          const sameAdjacent=(before===a.id?1:0)+(after===a.id?1:0);
          const teacherDay=Array.from({length:periods},(_,slot)=>busy.has(a.teacherId+':'+(day*periods+slot))?1:0).reduce((x,y)=>x+y,0);
          const classDay=schedule[a.classId].slice(day*periods,(day+1)*periods).filter(Boolean).length;
          const periodUsage=Array.from({length:days},(_,d)=>schedule[a.classId][d*periods+p]?1:0).reduce((x,y)=>x+y,0);
          const score=(usedDay*14)+(sameAdjacent*6)+(teacherDay*.55)+(classDay*.7)+(periodUsage*.2)+random()*11;
          options.push({i,score});
        }
        if(!options.length)continue;
        options.sort((x,y)=>x.score-y.score);
        // Usually pick the best slot; a little exploration improves hard timetables.
        const selected=options[Math.floor(random()*Math.min(3,options.length))];
        schedule[a.classId][selected.i]=a.id;
        busy.add(a.teacherId+':'+selected.i);
        const day=Math.floor(selected.i/periods);
        dayCounts.set(a.id+':'+day,(dayCounts.get(a.id+':'+day)||0)+1);
        quality+=selected.score;assigned++;
      }
      const rating=assigned*10000-quality;
      if(!best||rating>best.rating)best={schedule,rating,assigned};
      if(assigned===data.allocations.reduce((n,a)=>n+a.perWeek,0)){
        // Finish a few passes to improve distribution, without delaying the UI.
        if(attempt>=24)break;
      }
    }
    const out={...data,schedule:best.schedule,locks:preserveLocked?matrix.locks:Object.fromEntries(data.classes.map(c=>[c.id,Array(size).fill(false)]))};
    const stats=validateSchedule(out);
    return {ok:stats.valid,data:out,stats,issues:stats.conflicts,error:stats.valid?'':('Could not place '+stats.shortages.reduce((n,s)=>n+s.missing,0)+' periods without clashes. Try more teachers, fewer allocations or unlock fixed lessons.')};
  }
  function checkCell(data,classId,slot,newAllocationId){
    const {size}=dimensions(data);
    if(!data.classes.some(c=>c.id===classId)||slot<0||slot>=size||!Number.isInteger(slot))return {ok:false,error:'Invalid timetable position.'};
    if(!newAllocationId)return {ok:true};
    const allocation=data.allocations.find(a=>a.id===newAllocationId&&a.classId===classId);
    if(!allocation)return {ok:false,error:'This lesson does not belong to the selected class.'};
    const matrix=ensureMatrix(data).schedule;
    const current=matrix[classId][slot];
    const amount=matrix[classId].filter(id=>id===newAllocationId).length-(current===newAllocationId?1:0);
    if(amount>=allocation.perWeek)return {ok:false,error:'Weekly limit reached. Remove or change another '+(data.subjects.find(s=>s.id===allocation.subjectId)?.name||'subject')+' period first.'};
    for(const c of data.classes){if(c.id===classId)continue;
      const other=data.allocations.find(a=>a.id===matrix[c.id][slot]);
      if(other?.teacherId===allocation.teacherId)return {ok:false,error:(data.teachers.find(t=>t.id===allocation.teacherId)?.name||'Teacher')+' is already teaching '+c.name+' in this period.'};
    }
    return {ok:true};
  }
  function setCell(data,classId,slot,allocationId,lock=true){
    const validation=checkCell(data,classId,slot,allocationId);
    if(!validation.ok)return {ok:false,error:validation.error};
    const m=ensureMatrix(data);
    m.schedule[classId][slot]=allocationId||null;
    m.locks[classId][slot]=Boolean(lock);
    const updated={...data,...m};
    return {ok:true,data:updated,stats:validateSchedule(updated)};
  }
  function timeAt(settings,period){
    const [h,m]=String(settings.start||'08:00').split(':').map(Number);
    const minutes=h*60+m+period*settings.duration+(period>=settings.breakAfter&&settings.breakAfter>0?settings.breakMinutes:0);
    const end=minutes+settings.duration;
    const fmt=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
    return fmt(minutes)+' – '+fmt(end);
  }
  return { weekdays,defaultData,dimensions,ensureMatrix,validateInputs,validateSchedule,generateSchedule,checkCell,setCell,timeAt,uniqueId,clean };
});
