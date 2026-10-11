(() => {
  'use strict';
  const E = window.TimetableEngine;
  if (!E) { document.body.textContent = 'Could not load the timetable planner. Please refresh.'; return; }
  const STORAGE = 'timetable_pro_workspace_v1';
  const $ = id => document.getElementById(id);
  const escape = str => String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const weekdays = E.weekdays;
  const shorter = name => (String(name||'').split(' ').filter(Boolean).map(w=>w.charAt(0)).slice(0,2).join('')||'T').toUpperCase();
  const TONE = ['#6f7cf5','#2c9e8d','#ed9b53','#9a70d6','#d86f98','#5498d3','#38aab9','#8ba457','#9570c9','#cc8d48'];
  const validColor = c => /^#[a-f0-9]{6}$/i.test(String(c)) ? String(c) : '#5c75c2';
  const tint = c => validColor(c)+'16';
  const rgbInk = c => validColor(c);
  const itemOf = (arr,id) => arr.find(x=>x.id===id);
  const niceNumber = n => Number(n).toLocaleString('en-US');
  const exportFilename = name => String(name || 'school').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,32)||'school';
  let data = loadWorkspace();
  let page = 'overview';
  let isDemo = (() => { try { const saved=JSON.parse(localStorage.getItem(STORAGE)||'null'); return saved ? Boolean(saved.isDemo) : true; } catch { return true; } })();
  let tableType = 'class';
  let selectedClass = data.classes[0]?.id||'';
  let selectedTeacher = data.teachers[0]?.id||'';
  let allocationFilter = 'all';
  let modalSlot = null;
  let overlayTimer = null;
  const pathPage = new Set(['overview','timetable','setup','teachers','guide']);

  function loadWorkspace(){
    try {
      const saved = localStorage.getItem(STORAGE);
      if (!saved) return initialDemo();
      const obj = JSON.parse(saved);
      return normalizeBackup(obj);
    } catch { return initialDemo(); }
  }
  function initialDemo(){
    const demo=E.defaultData();
    const result=E.generateSchedule(demo,{attempts:120,seed:11889});
    return result.data||demo;
  }
  function persist(markEdited=false){
    try { localStorage.setItem(STORAGE,JSON.stringify({format:'timetable-pro-v1',...data,isDemo:markEdited?false:isDemo})); }
    catch { notify('Browser storage is unavailable. Download a JSON backup instead.', 'warning'); }
    if (markEdited) isDemo=false;
  }
  function normalizeBackup(obj){
    if (!obj || typeof obj!=='object') throw new Error('Backup must be an object.');
    if(!obj.settings||!Array.isArray(obj.classes)||!Array.isArray(obj.teachers)||!Array.isArray(obj.subjects)||!Array.isArray(obj.allocations))throw new Error('This is not a valid TimeTable Pro backup.');
    if(obj.classes.length>60||obj.teachers.length>120||obj.subjects.length>80||obj.allocations.length>1500)throw new Error('Backup exceeds supported size limits.');
    const cleanId=id=>{if(typeof id!=='string'||!/^[a-z0-9_-]{1,70}$/i.test(id))throw new Error('Invalid record ID.');return id;};
    const readName=(s,max=90)=>{if(typeof s!=='string'||!s.trim()||s.length>max)throw new Error('Invalid record name.');return s.trim();};
    const readItems=(arr,extra)=>arr.map(x=>{
      if(!x||typeof x!=='object')throw new Error('Invalid backup record.');
      return {id:cleanId(x.id),name:readName(x.name),...extra(x)};
    });
    const settings = {
      schoolName:readName(obj.settings.schoolName),
      academicYear:String(obj.settings.academicYear||'').slice(0,30),
      days:Number(obj.settings.days), periods:Number(obj.settings.periods),
      start:String(obj.settings.start||'08:00'),duration:Number(obj.settings.duration),
      breakAfter:Number(obj.settings.breakAfter),breakMinutes:Number(obj.settings.breakMinutes)
    };
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.start))throw new Error('Start time is not valid.');
    const classes=readItems(obj.classes,()=>({}));
    const teachers=readItems(obj.teachers,()=>({}));
    const subjects=readItems(obj.subjects,x=>({code:readName(x.code,7),color:validColor(x.color)}));
    const allocations=obj.allocations.map(a=>{
      if(!a||typeof a!=='object')throw new Error('Invalid allocation row.');
      return {id:cleanId(a.id),classId:cleanId(a.classId),subjectId:cleanId(a.subjectId),teacherId:cleanId(a.teacherId),perWeek:Number(a.perWeek)};
    });
    for(const list of [classes,teachers,subjects,allocations])if(new Set(list.map(x=>x.id)).size!==list.length)throw new Error('Duplicate IDs in backup.');
    const candidate={settings,classes,teachers,subjects,allocations,schedule:{},locks:{}};
    const capacity=settings.days*settings.periods;
    if(settings.days<1||settings.days>6||settings.periods<1||settings.periods>10||settings.duration<20||settings.duration>90||settings.breakMinutes<0||settings.breakMinutes>60||settings.breakAfter<0||settings.breakAfter>settings.periods)throw new Error('Invalid school schedule settings.');
    const allocationIds=new Set(allocations.map(a=>a.id));
    for(const c of classes){
      const row=obj.schedule?.[c.id];const locks=obj.locks?.[c.id];
      if(row!=null&&!Array.isArray(row))throw new Error('Invalid timetable grid.');
      if(locks!=null&&!Array.isArray(locks))throw new Error('Invalid fixed timetable slots.');
      candidate.schedule[c.id]=Array.from({length:capacity},(_,i)=>{
        const aid=row?.[i];if(aid==null||aid==='')return null;
        if(!allocationIds.has(aid))throw new Error('Backup references a missing lesson.');
        return aid;
      });
      candidate.locks[c.id]=Array.from({length:capacity},(_,i)=>Boolean(locks?.[i]));
    }
    // Keep imported schedules editable even when they contain conflicts; issues are visible on screen.
    if(!classes.length||!teachers.length||!subjects.length)return candidate;
    const refErrors=E.validateInputs(candidate).errors.filter(t=>/missing class|subject only once|Choose 1|Period length|Break duration|break position/.test(t));
    if(refErrors.length)throw new Error(refErrors[0]);
    return candidate;
  }
  function notify(message,type='success'){
    const host=$('toastStack');
    const item=document.createElement('div');item.className='toast'+(type==='success'?'':' '+type);item.textContent=message;
    host.appendChild(item);
    if(host.children.length>4)host.firstChild.remove();
    setTimeout(()=>item.remove(),4300);
  }
  function currentMetrics(){return E.validateSchedule(data)}
  function subject(id){return itemOf(data.subjects,id)}
  function teacher(id){return itemOf(data.teachers,id)}
  function classItem(id){return itemOf(data.classes,id)}
  function allocation(id){return itemOf(data.allocations,id)}
  function getSchedule(){return E.ensureMatrix(data).schedule}
  function ensureSelection(){
    if(!data.classes.some(c=>c.id===selectedClass))selectedClass=data.classes[0]?.id||'';
    if(!data.teachers.some(t=>t.id===selectedTeacher))selectedTeacher=data.teachers[0]?.id||'';
  }
  function renderAll(){
    ensureSelection();
    $('workspaceBadge').textContent=isDemo?'Demo workspace':'Your school';
    $('workspaceBadge').classList.toggle('custom',!isDemo);
    renderStats();renderSteps();renderOverview();renderTimetable();renderSetup();renderTeachers();
  }
  function renderSteps(){
    const hasSchool = data.classes.length>0 && data.teachers.length>0 && data.subjects.length>0;
    const perClass = new Set(data.allocations.map(a=>a.classId));
    const hasLessons = hasSchool && data.allocations.length>0 && data.classes.every(c=>perClass.has(c.id));
    const checks = currentMetrics();
    const done = hasLessons && checks.valid && checks.required>0;
    const states = [
      {id:'School',ok:hasSchool,status:hasSchool?'Ready':'To do',hint:hasSchool
        ? data.classes.length+' classes · '+data.teachers.length+' teachers · '+data.subjects.length+' subjects'
        : 'Add classes, teachers and subjects.'},
      {id:'Lessons',ok:hasLessons,status:hasLessons?'Ready':'To do',hint:data.allocations.length
        ? data.allocations.reduce((n,a)=>n+a.perWeek,0)+' lessons assigned'+(!hasLessons?' · check each class':'')
        : 'Assign subjects and weekly periods to classes.'},
      {id:'Generate',ok:done,status:done?'Ready':'To do',hint:done
        ? checks.scheduled+' of '+checks.required+' lessons scheduled'
        : hasLessons?'Generate the timetable and review any conflicts.':'Finish school setup and lesson allocations first.'}
    ];
    for(const state of states){
      $('step'+state.id).classList.toggle('done',state.ok);
      $('step'+state.id+'Status').textContent=state.status;
      $('step'+state.id+'Hint').textContent=state.hint;
    }
  }
  function go(newPage){
    if(!pathPage.has(newPage))newPage='overview';
    page=newPage;
    document.querySelectorAll('.page').forEach(section=>section.classList.toggle('active',section.id==='page-'+page));
    document.querySelectorAll('[data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
    $('breadcrumb').textContent=({overview:'Overview',timetable:'Timetables',setup:'School setup',teachers:'Teachers & workload',guide:'How it works'})[page];
    document.title=({overview:'Overview',timetable:'Timetables',setup:'School Setup',teachers:'Teacher Workloads',guide:'Help'})[page]+' | TimeTable Pro';
    window.location.hash=page;
    closeMobile();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function closeMobile(){$('sidebar').classList.remove('open');$('mobileOverlay').classList.remove('show');}
  function renderStats(){
    const stats=currentMetrics();
    const nFilled=stats.scheduled,capacity=stats.required;
    const cards=[
      {label:'Active classes',value:data.classes.length,foot:'Sections in workspace',tone:'blue',icon:'▦'},
      {label:'Teachers',value:data.teachers.length,foot:'Teaching staff',tone:'purple',icon:'♙'},
      {label:'Weekly lessons',value:capacity,foot:niceNumber(nFilled)+' scheduled',tone:'orange',icon:'▤'},
      {label:'Teacher clashes',value:stats.conflicts.filter(x=>x.includes('double-booked')).length,foot:stats.valid?'All lessons placed':stats.shortages.length+' unmet allocations',tone:'green',icon:'✓'}
    ];
    $('statsCards').innerHTML=cards.map(c=>`<div class="stat-card"><div class="stat-card-top"><span class="stat-label">${c.label}</span><span class="stat-icon ${c.tone}">${c.icon}</span></div><div class="stat-value">${niceNumber(c.value)}</div><div class="stat-foot">${escape(c.foot)}</div></div>`).join('');
  }
  function slotHTML(classId,index,compact=false,forTeacher=false){
    const schedule=getSchedule();const aid=schedule[classId]?.[index];const a=allocation(aid);
    const isPinned=Boolean(data.locks?.[classId]?.[index]);
    if(!a){
      if(compact)return '<span class="preview-chip" style="color:#bcc6d5">—</span>';
      if(forTeacher)return '<div class="lesson-cell static"><span class="lesson-empty">—</span><span class="lesson-free">Free period</span></div>';
      return `<button type="button" class="lesson-cell" data-edit-class="${escape(classId)}" data-edit-slot="${index}" title="Select to assign a lesson"><span class="lesson-empty">+</span><span class="lesson-free">Free / Study</span>${isPinned?'<span class="lesson-pin">◆</span>':''}</button>`;
    }
    const subj=subject(a.subjectId),t=teacher(a.teacherId),c=classItem(classId);
    const bg=tint(subj?.color),color=rgbInk(subj?.color);
    if(compact)return `<span class="preview-chip" style="background:${bg};color:${color}">${escape(subj?.code||'?')}<small>${escape((t?.name||'').split(' ')[0])}</small></span>`;
    const detail=forTeacher?c?.name:t?.name;
    const inner=`<span class="lesson-code">${escape(subj?.code||'')}</span><span class="lesson-name">${escape(subj?.name||'Lesson')}</span><span class="lesson-teacher">${escape(detail||'')}</span>${isPinned?'<span class="lesson-pin" aria-label="Fixed lesson">◆</span>':''}`;
    const style=`style="background:${bg};color:${color}"`;
    if(forTeacher)return `<div class="lesson-cell static" ${style}>${inner}</div>`;
    return `<button type="button" class="lesson-cell" ${style} data-edit-class="${escape(classId)}" data-edit-slot="${index}" aria-label="Edit ${escape(subj?.name||'lesson')} in ${escape(c?.name||'class')}">${inner}</button>`;
  }
  function renderOverview(){
    const today=new Date();$('welcomeDate').textContent=today.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
    const cls=data.classes[0],{days,periods}=E.dimensions(data);
    if(!cls){$('overviewPreview').innerHTML='<div class="table-placeholder"><strong>Start with a class</strong>Open School setup to add classes.</div>';}else{
      const samplePeriods=Math.min(periods,4);
      $('overviewPreview').innerHTML=`<div class="overview-caption">${escape(cls.name)} · ${escape(data.settings.schoolName)}</div><table class="preview-grid"><thead><tr><th>PERIOD</th>${weekdays.slice(0,days).map(d=>`<th>${d.slice(0,3).toUpperCase()}</th>`).join('')}</tr></thead><tbody>${Array.from({length:samplePeriods},(_,p)=>`<tr><td>Period ${p+1}</td>${Array.from({length:days},(_,d)=>`<td>${slotHTML(cls.id,d*periods+p,true)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    const stats=currentMetrics();const inputs=E.validateInputs(data);
    const ready=stats.valid&&!inputs.errors.length&&stats.required>0;
    const emptySchool=!data.classes.length||!data.teachers.length||!data.subjects.length;
    const totalClashes=stats.conflicts.filter(x=>x.includes('double-booked')).length;
    const healthTitle=emptySchool?'Finish your school setup':ready?'Your timetable is ready':'Your timetable needs attention';
    const healthDetail=emptySchool?'Add classes, teachers and subjects to continue.':ready
      ?stats.scheduled+' lessons placed · no teacher conflicts'
      :stats.shortages.reduce((n,x)=>n+x.missing,0)+' unscheduled lessons · '+totalClashes+' teacher clashes';
    $('healthCard').className='health-card'+(ready?'':' warning');
    $('healthCard').innerHTML=`<div class="health-icon">${ready?'✓':'!'}</div><div><strong>${escape(healthTitle)}</strong><small>${escape(healthDetail)}</small></div>`;
  }
  function renderTimetable(){
    ensureSelection();
    $('classViewBtn').classList.toggle('active',tableType==='class');
    $('teacherViewBtn').classList.toggle('active',tableType==='teacher');
    const entities=tableType==='class'?data.classes:data.teachers;
    const curr=tableType==='class'?selectedClass:selectedTeacher;
    $('entitySelect').innerHTML=entities.length?entities.map(x=>`<option value="${escape(x.id)}" ${x.id===curr?'selected':''}>${escape(x.name)}</option>`).join(''):'<option value="">No records yet</option>';
    const stats=currentMetrics();
    const days=data.settings.days,periods=data.settings.periods;
    const currently=tableType==='class'?classItem(selectedClass):teacher(selectedTeacher);
    const count=tableType==='class'?data.allocations.filter(a=>a.classId===selectedClass).reduce((n,a)=>n+a.perWeek,0):data.allocations.filter(a=>a.teacherId===selectedTeacher).reduce((n,a)=>n+a.perWeek,0);
    $('timetableSummary').innerHTML=`<span class="summary-strong">${escape(currently?.name||'Select a '+tableType)}</span><span class="summary-dot"></span><span>${days} school days</span><span class="summary-dot"></span><span>${periods} periods / day</span><span class="summary-dot"></span><span>${count} allocated lessons / week</span>`;
    if(!currently){$('scheduleTable').innerHTML='<div class="table-placeholder"><strong>No '+tableType+' available</strong>Go to School setup to add one.</div>';
      $('timetableLegend').textContent='';renderIssues(stats);return;}
    const schedule=getSchedule();
    let content=`<table class="schedule-grid"><thead><tr><th>PERIOD / TIME</th>${weekdays.slice(0,days).map(day=>`<th>${day.toUpperCase()}</th>`).join('')}</tr></thead><tbody>`;
    for(let p=0;p<periods;p++){
      content+=`<tr><td class="time-col"><strong>Period ${p+1}</strong><small>${E.timeAt(data.settings,p)}</small></td>`;
      for(let d=0;d<days;d++){
        const i=d*periods+p;
        if(tableType==='class')content+=`<td>${slotHTML(selectedClass,i)}</td>`;
        else {
          const busy=data.classes.find(c=>{const a=allocation(schedule[c.id]?.[i]);return a?.teacherId===selectedTeacher;});
          content+=`<td>${busy?slotHTML(busy.id,i,false,true):'<div class="lesson-cell static"><span class="lesson-empty">—</span><span class="lesson-free">Free period</span></div>'}</td>`;
        }
      }
      content+='</tr>';
      if(data.settings.breakAfter===p+1&&data.settings.breakMinutes>0){
        content+=`<tr class="break-row"><td>${data.settings.breakMinutes} MIN</td><td colspan="${days}">☕ &nbsp; SCHOOL BREAK &nbsp; · &nbsp; ${data.settings.breakMinutes} MINUTES</td></tr>`;
      }
    }
    content+='</tbody></table>';
    $('scheduleTable').innerHTML=content;
    $('scheduleTable').querySelectorAll('[data-edit-slot]').forEach(cell=>cell.addEventListener('click',()=>openEditor(cell.dataset.editClass,Number(cell.dataset.editSlot))));
    const usedSubjects=new Set(data.allocations.filter(a=>tableType==='class'?a.classId===selectedClass:a.teacherId===selectedTeacher).map(a=>a.subjectId));
    $('timetableLegend').innerHTML=[...usedSubjects].slice(0,4).map(id=>{const s=subject(id);return `<span class="legend-item"><i style="background:${validColor(s?.color)}"></i>${escape(s?.code||'')}</span>`}).join('');
    renderIssues(stats);
  }
  function renderIssues(stats){
    const place=$('scheduleIssues');
    const info=E.validateInputs(data);
    const complaints=[...info.errors,...stats.conflicts];
    const shortage=stats.shortages.reduce((n,x)=>n+x.missing,0);
    const full=stats.valid&&complaints.length===0;
    place.className='panel message-panel visible'+(full?' good':'');
    if(full){place.innerHTML='<strong>✓ &nbsp; Schedule checked — all required lessons are placed without teacher clashes.</strong><p>Click a class period to make a change. Fixed periods are marked with ◆.</p>';return;}
    const messages=complaints.slice(0,7).map(x=>`<li>${escape(x)}</li>`).join('');
    const more=complaints.length>7?`<li>And ${complaints.length-7} more issues</li>`:'';
    place.innerHTML=`<strong>Schedule check: ${shortage} lessons still need a place</strong><ul>${messages}${more}${shortage?`<li>${shortage} unassigned weekly lessons. Generate or adjust your allocations.</li>`:''}</ul>`;
  }
  function fillOptions(selectId,items,placeholder){
    const sel=$(selectId),old=sel.value;
    sel.innerHTML=(placeholder?`<option value="">${escape(placeholder)}</option>`:'')+items.map(x=>`<option value="${escape(x.id)}">${escape(x.name)}</option>`).join('');
    if(items.some(x=>x.id===old))sel.value=old;
  }
  function renderSetup(){
    const s=data.settings;
    for(const id of ['schoolName','academicYear','days','periods','start','duration','breakAfter','breakMinutes'])$(id).value=s[id];
    for(const [k,a] of [['classCount',data.classes],['teacherCount',data.teachers],['subjectCount',data.subjects]])$(k).textContent=a.length;
    for(const [id,arr,type] of [['classesList',data.classes,'class'],['teachersList',data.teachers,'teacher'],['subjectsList',data.subjects,'subject']]){
      $(id).innerHTML=arr.length?arr.map(x=>`<span class="item-tag">${type==='subject'?`<i class="color-indicator" style="background:${validColor(x.color)}"></i>`:''}${escape(x.name)}${type==='subject'?` <small>· ${escape(x.code)}</small>`:''}<button type="button" title="Remove ${escape(x.name)}" aria-label="Remove ${escape(x.name)}" data-remove-type="${type}" data-remove-id="${escape(x.id)}">×</button></span>`).join(''):'<span class="empty-note">No '+type+' added yet.</span>';
      $(id).querySelectorAll('[data-remove-type]').forEach(button=>button.addEventListener('click',()=>removeItem(button.dataset.removeType,button.dataset.removeId)));
    }
    fillOptions('allocationClass',data.classes,'Choose class');fillOptions('allocationSubject',data.subjects,'Choose subject');fillOptions('allocationTeacher',data.teachers,'Choose teacher');
    const old=allocationFilter;
    $('allocationFilter').innerHTML='<option value="all">All classes</option>'+data.classes.map(c=>`<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
    $('allocationFilter').value=old==='all'||data.classes.some(c=>c.id===old)?old:'all';
    allocationFilter=$('allocationFilter').value;
    $('allocationCount').textContent=data.allocations.length+' allocations';
    const {size}=E.dimensions(data);
    const target=allocationFilter==='all'?null:classItem(allocationFilter);
    const weekly=target?data.allocations.filter(a=>a.classId===target.id).reduce((n,a)=>n+a.perWeek,0):data.allocations.reduce((n,a)=>n+a.perWeek,0);
    $('allocationCapacity').textContent=target?`${weekly} / ${size} weekly slots`:`${weekly} lessons across ${data.classes.length} classes`;
    const display=data.allocations.filter(a=>allocationFilter==='all'||a.classId===allocationFilter);
    $('allocationsBody').innerHTML=display.length?display.map(a=>{
      const c=classItem(a.classId),subj=subject(a.subjectId),t=teacher(a.teacherId);
      const options=data.teachers.map(tt=>`<option value="${escape(tt.id)}" ${tt.id===a.teacherId?'selected':''}>${escape(tt.name)}</option>`).join('');
      return `<tr><td><strong>${escape(c?.name||'—')}</strong></td><td><span class="allocation-pill" style="background:${tint(subj?.color)};color:${rgbInk(subj?.color)}">${escape(subj?.name||'—')}</span></td><td><select class="inline-teacher" data-allocation-teacher="${escape(a.id)}" aria-label="Teacher for ${escape(subj?.name)}">${options}</select></td><td><input class="inline-number" type="number" min="1" max="${size}" value="${a.perWeek}" data-allocation-count="${escape(a.id)}" aria-label="Weekly periods for ${escape(subj?.name)}"></td><td><button class="delete-btn" aria-label="Remove allocation" data-allocation-remove="${escape(a.id)}">✕</button></td></tr>`;
    }).join(''):'<tr><td colspan="5" style="text-align:center;padding:30px;color:#a4b1c4">No allocations for this filter. Add one above.</td></tr>';
    $('allocationsBody').querySelectorAll('[data-allocation-teacher]').forEach(el=>el.addEventListener('change',()=>updateAllocation(el.dataset.allocationTeacher,{teacherId:el.value})));
    $('allocationsBody').querySelectorAll('[data-allocation-count]').forEach(el=>el.addEventListener('change',()=>updateAllocation(el.dataset.allocationCount,{perWeek:Number(el.value)})));
    $('allocationsBody').querySelectorAll('[data-allocation-remove]').forEach(el=>el.addEventListener('click',()=>deleteAllocation(el.dataset.allocationRemove)));
  }
  function renderTeachers(){
    const perSlot=data.settings.days*data.settings.periods;
    $('teacherGrid').innerHTML=data.teachers.length?data.teachers.map(t=>{
      const own=data.allocations.filter(a=>a.teacherId===t.id);
      const count=own.reduce((n,a)=>n+a.perWeek,0);
      const subjects=[...new Set(own.map(a=>a.subjectId))].map(id=>subject(id)).filter(Boolean);
      const names=[...new Set(own.map(a=>a.classId))].map(id=>classItem(id)?.name).filter(Boolean);
      const percent=perSlot?Math.round(count/perSlot*100):0;
      return `<article class="teacher-card"><div class="teacher-card-top"><span class="teacher-initial">${escape(shorter(t.name))}</span><div><strong>${escape(t.name)}</strong><small>${names.length} class${names.length===1?'':'es'} assigned</small></div></div><div class="teacher-load"><span>Weekly workload</span><b>${count} / ${perSlot} periods (${percent}%)</b></div><div class="load-track"><div class="load-fill" style="width:${Math.min(100,percent)}%"></div></div><div class="teacher-subjects">${subjects.length?subjects.map(sub=>`<span>${escape(sub.name)}</span>`).join(''):'<span>No assignments yet</span>'}</div><button class="teacher-view-link" data-teacher-view="${escape(t.id)}">View weekly schedule →</button></article>`;
    }).join(''):'<div class="table-placeholder"><strong>No teachers yet</strong>Add teachers in School setup to manage their workload.</div>';
    $('teacherGrid').querySelectorAll('[data-teacher-view]').forEach(el=>el.addEventListener('click',()=>{selectedTeacher=el.dataset.teacherView;tableType='teacher';renderTimetable();go('timetable');}));
  }
  function generate({quiet=false}={}){
    const issues=E.validateInputs(data);
    if(issues.errors.length){notify(issues.errors[0],'error');go('setup');return false;}
    const button=$('overviewGenerate');
    if(button)button.disabled=true;
    const result=E.generateSchedule(data,{attempts:220,preserveLocked:true});
    if(result.data){data=result.data;persist(true)}
    renderAll();
    if(button)button.disabled=false;
    if(result.ok){if(!quiet)notify('Complete timetable generated. No teacher clashes found.');go('timetable');return true;}
    notify(result.error||'Could not complete the timetable. Review the setup.','warning');go('timetable');return false;
  }
  function openEditor(classId,slot){
    const cls=classItem(classId);if(!cls)return;
    modalSlot={classId,slot};
    const p=slot%data.settings.periods,d=Math.floor(slot/data.settings.periods);
    $('modalTitle').textContent=`${cls.name} · Period ${p+1}`;
    $('modalSub').textContent=weekdays[d]+'  ·  '+E.timeAt(data.settings,p);
    const options=data.allocations.filter(a=>a.classId===classId);
    $('modalAllocation').innerHTML='<option value="">— Free / Study Period —</option>'+options.map(a=>{
      const s=subject(a.subjectId),t=teacher(a.teacherId);
      return `<option value="${escape(a.id)}">${escape(s?.name||'Lesson')} — ${escape(t?.name||'Teacher')}</option>`;
    }).join('');
    $('modalAllocation').value=getSchedule()[classId][slot]||'';
    $('modalLock').checked=Boolean(data.locks?.[classId]?.[slot])||!getSchedule()[classId][slot];
    $('cellModal').classList.remove('hidden');
    $('modalAllocation').focus();
  }
  function closeEditor(){$('cellModal').classList.add('hidden');modalSlot=null;}
  function saveEditor(){
    if(!modalSlot)return;
    const chosen=$('modalAllocation').value;
    const next=E.setCell(data,modalSlot.classId,modalSlot.slot,chosen,$('modalLock').checked);
    if(!next.ok){notify(next.error,'error');return;}
    data=next.data;persist(true);closeEditor();renderAll();notify('Period updated. Fixed lessons will be respected next time.');
  }
  function addItem(type,name,extra={}){
    const arr=type==='class'?data.classes:type==='teacher'?data.teachers:data.subjects;
    const trimmed=E.clean(name);
    if(trimmed.length<2){notify('Enter a name of at least 2 characters.','error');return;}
    if(arr.some(x=>x.name.toLowerCase()===trimmed.toLowerCase())){notify('This '+type+' already exists.','warning');return;}
    if(arr.length>=({class:60,teacher:120,subject:80})[type]){notify('Workspace record limit reached.','error');return;}
    arr.push({id:E.uniqueId(type[0]),name:trimmed,...extra});
    persist(true);renderAll();notify(trimmed+' added.');
  }
  function removeItem(type,id){
    const arr=type==='class'?data.classes:type==='teacher'?data.teachers:data.subjects;
    const entry=itemOf(arr,id);if(!entry)return;
    const key={class:'classId',teacher:'teacherId',subject:'subjectId'}[type];
    if(data.allocations.some(a=>a[key]===id)){notify('Remove the teaching allocations for '+entry.name+' first.','warning');return;}
    if(!confirm('Remove '+entry.name+' from your workspace?'))return;
    const ix=arr.findIndex(x=>x.id===id);arr.splice(ix,1);
    if(type==='class'){delete data.schedule[id];delete data.locks[id];}
    persist(true);renderAll();notify(entry.name+' removed.');
  }
  function addAllocation(e){
    e.preventDefault();const classId=$('allocationClass').value,subjectId=$('allocationSubject').value,teacherId=$('allocationTeacher').value,perWeek=Number($('allocationPeriods').value);
    if(!classItem(classId)||!subject(subjectId)||!teacher(teacherId)||!Number.isInteger(perWeek)||perWeek<1){notify('Complete each allocation field.','error');return;}
    if(data.allocations.some(a=>a.classId===classId&&a.subjectId===subjectId)){notify('This class already has this subject. Edit its allocation below.','warning');return;}
    const {size}=E.dimensions(data);
    if(perWeek>size){notify('Only '+size+' weekly periods are available per class.','error');return;}
    const next={id:E.uniqueId('a'),classId,subjectId,teacherId,perWeek};
    const tentative={...data,allocations:[...data.allocations,next]};
    const error=E.validateInputs(tentative).errors[0];
    if(error){notify(error,'warning');return;}
    data.allocations.push(next);persist(true);renderAll();notify('Teaching allocation added. Regenerate to place the new periods.');
  }
  function updateAllocation(id,changes){
    const idx=data.allocations.findIndex(a=>a.id===id);if(idx<0)return;
    const changed={...data.allocations[idx],...changes};
    const {size}=E.dimensions(data);
    if(!Number.isInteger(changed.perWeek)||changed.perWeek<1||changed.perWeek>size){notify('Weekly periods must be between 1 and '+size+'.','error');renderSetup();return;}
    const next=[...data.allocations];next[idx]=changed;
    const errors=E.validateInputs({...data,allocations:next}).errors;
    if(errors.length){notify(errors[0],'warning');renderSetup();return;}
    data.allocations=next;
    // Existing slots for a changed teacher may no longer fit; make that conflict visible.
    persist(true);renderAll();notify('Allocation updated. Review or regenerate the timetable.');
  }
  function deleteAllocation(id){
    const a=allocation(id);if(!a)return;
    const c=classItem(a.classId),s=subject(a.subjectId);
    if(!confirm('Remove '+(s?.name||'lesson')+' from '+(c?.name||'class')+'?'))return;
    data.allocations=data.allocations.filter(x=>x.id!==id);
    const matrix=E.ensureMatrix(data);
    for(const klass of data.classes)matrix.schedule[klass.id]=matrix.schedule[klass.id].map((x,i)=>{if(x===id){matrix.locks[klass.id][i]=false;return null;}return x;});
    data.schedule=matrix.schedule;data.locks=matrix.locks;
    persist(true);renderAll();notify('Allocation removed.');
  }
  function saveSettings(e){
    e.preventDefault();
    const s={schoolName:$('schoolName').value.trim(),academicYear:$('academicYear').value.trim(),days:Number($('days').value),periods:Number($('periods').value),start:$('start').value,duration:Number($('duration').value),breakAfter:Number($('breakAfter').value),breakMinutes:Number($('breakMinutes').value)};
    const next={...data,settings:s};
    const errors=E.validateInputs(next).errors.filter(msg=> !/Add at least one|Add subject\/teacher allocations before generating/.test(msg));
    if(errors.length){notify(errors[0],'error');return;}
    const resizes=s.days!==data.settings.days||s.periods!==data.settings.periods;
    if(resizes&&Object.values(data.schedule).some(arr=>arr.some(Boolean))&&!confirm('Changing the number of days or periods will clear your current timetable. Continue?')){renderSetup();return;}
    data.settings=s;
    if(resizes){data.schedule={};data.locks={};}
    persist(true);renderAll();notify('School settings saved.'+(resizes?' Generate a new timetable.':''));
  }
  function blobDownload(text,filename,mime){
    const blob=new Blob([text],{type:mime});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function backup(){
    const payload={format:'timetable-pro-v1',exportedAt:new Date().toISOString(),...data,isDemo};
    blobDownload(JSON.stringify(payload,null,2),'timetable-pro-'+exportFilename(data.settings.schoolName)+'.json','application/json');
    notify('Complete school backup downloaded.');
  }
  async function importBackup(file){
    if(!file)return;if(file.size>750000){notify('Backup must be smaller than 750 KB.','error');return;}
    try{
      const obj=JSON.parse(await file.text());
      const normalized=normalizeBackup(obj);
      if(!confirm('Import this backup? It will replace the current workspace on this browser.'))return;
      data=normalized;isDemo=Boolean(obj.isDemo);tableType='class';selectedClass=data.classes[0]?.id||'';selectedTeacher=data.teachers[0]?.id||'';allocationFilter='all';persist(false);renderAll();go('overview');notify('Your school backup was restored successfully.');
    }catch(e){notify(e.message||'Could not read backup file.','error');}
  }
  function csvEsc(text){
    let s=String(text??'');
    if(/^[\s]*[=+@-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function downloadCSV(){
    const {days,periods}=E.dimensions(data),schedule=getSchedule();
    const rows=[['School','Class','Day','Period','Time','Subject','Subject Code','Teacher','Fixed']];
    for(const c of data.classes)for(let d=0;d<days;d++)for(let p=0;p<periods;p++){
      const slot=d*periods+p,a=allocation(schedule[c.id]?.[slot]),sub=subject(a?.subjectId),teach=teacher(a?.teacherId);
      rows.push([data.settings.schoolName,c.name,weekdays[d],p+1,E.timeAt(data.settings,p),sub?.name||'Free / Study',sub?.code||'',teach?.name||'',data.locks?.[c.id]?.[slot]?'Yes':'No']);
    }
    blobDownload('\uFEFF'+rows.map(row=>row.map(csvEsc).join(',')).join('\r\n'),'timetable-pro-'+exportFilename(data.settings.schoolName)+'.csv','text/csv;charset=utf-8');
    notify('Excel-compatible CSV downloaded.');
  }
  function printTable({all=false}={}){
    const {days,periods}=E.dimensions(data);const schedule=getSchedule();
    const entities=all?data.classes:tableType==='class'?[classItem(selectedClass)].filter(Boolean):[teacher(selectedTeacher)].filter(Boolean);
    if(!entities.length){notify('Add a class or teacher first.','warning');return;}
    const useTeacher=tableType==='teacher'&&!all;
    function printedSlot(entity,slot){
      const cls=useTeacher?data.classes.find(c=>allocation(schedule[c.id]?.[slot])?.teacherId===entity.id):entity;
      if(!cls)return '<span class="free">FREE</span>';
      const a=allocation(schedule[cls.id]?.[slot]),sub=subject(a?.subjectId),t=teacher(a?.teacherId);
      if(!a||!sub)return '<span class="free">STUDY / FREE</span>';
      return `<div class="printed-lesson" style="background:${tint(sub.color)};border-color:${validColor(sub.color)}38"><strong style="color:${validColor(sub.color)}">${escape(sub.name)}</strong><small>${escape(useTeacher?cls.name:t?.name||'')}</small></div>`;
    }
    const tables=entities.map(entity=>{
      let body='';
      for(let p=0;p<periods;p++){
        body+=`<tr><th class="time">P${p+1}<small>${escape(E.timeAt(data.settings,p))}</small></th>${Array.from({length:days},(_,d)=>`<td>${printedSlot(entity,d*periods+p)}</td>`).join('')}</tr>`;
        if(p+1===data.settings.breakAfter&&data.settings.breakMinutes>0)body+=`<tr class="break-print"><td colspan="${days+1}">SCHOOL BREAK — ${data.settings.breakMinutes} MINUTES</td></tr>`;
      }
      return `<section class="page-sheet"><div class="sheet-top"><div><span class="print-brand">▦ TIMETABLE PRO</span><h1>${escape(data.settings.schoolName)}</h1><p>Weekly Timetable · ${escape(data.settings.academicYear)}</p></div><span class="sheet-stamp">${useTeacher?'TEACHER':'CLASS'} SCHEDULE</span></div><h2>${escape(entity.name)}</h2><table class="print-grid"><thead><tr><th>PERIOD</th>${weekdays.slice(0,days).map(day=>`<th>${day.toUpperCase()}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><div class="sheet-footer">TimeTable Pro · Prepared for ${escape(data.settings.schoolName)} <span>Developed by Bharat Kumar</span></div></section>`;
    }).join('');
    const styles=`@page{size:A4 landscape;margin:12mm 12mm 13mm 12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#22344f;font-family:Arial,'Noto Sans',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-size:10px}.page-sheet{page-break-after:always;break-after:page;width:100%;}.page-sheet:last-child{page-break-after:auto;break-after:auto}.sheet-top{display:flex;justify-content:space-between;border-bottom:2px solid #375fb2;padding-bottom:4mm;margin-bottom:5mm}.print-brand{font-size:9px;font-weight:900;letter-spacing:1.5px;color:#5271b9}.sheet-top h1{font-size:20px;margin:2mm 0 1mm}.sheet-top p{margin:0;color:#7b8da4;font-size:10px}.sheet-stamp{font-size:9px;color:#54709c;letter-spacing:1px;font-weight:800}.page-sheet h2{font-size:15px;margin:0 0 4mm}.print-grid{table-layout:fixed;width:100%;border-collapse:collapse}.print-grid th{background:#eef3fc;padding:3mm 1mm;font-size:9px;color:#455b81;border:1px solid #d9e2ee}.print-grid thead th:first-child{width:15%}.print-grid td{padding:2mm 2mm;border:1px solid #dce5ef;text-align:center;vertical-align:middle;height:16mm}.print-grid tbody th{background:#fafcff;text-align:left;padding:2mm 2.5mm}.print-grid tbody th small{display:block;color:#96a5b7;font-size:8px;margin-top:1mm}.printed-lesson{border:1px solid;border-radius:4px;padding:2mm 1mm;min-height:10mm;display:grid;align-content:center}.printed-lesson strong{font-size:9px}.printed-lesson small{font-size:8px;color:#66758c;margin-top:1.3mm}.free{color:#aeb9c8;font-size:9px}.break-print td{background:#f4f7fb;text-align:center;color:#8496ae;letter-spacing:1.6px;font-size:9px;padding:1.5mm;height:7mm}.sheet-footer{margin-top:5mm;padding-top:2mm;border-top:1px solid #d9e3ee;color:#889aaf;font-size:8px}.sheet-footer span{float:right}@media screen{body{max-width:297mm;margin:20px auto}.page-sheet{padding:15px;border:1px solid #ddd;margin-bottom:20px}}`;
    const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TimeTable Pro — School timetable</title><style>'+styles+'</style></head><body>'+tables+'</body></html>';
    const frame=document.createElement('iframe');
    frame.title='Timetable printable document';
    frame.style.cssText='position:fixed;bottom:0;right:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    let triggered=false;
    const cleanup=()=>{if(frame.isConnected)frame.remove();};
    frame.onload=()=>{if(triggered)return;triggered=true;setTimeout(()=>{
      try{const w=frame.contentWindow;w.addEventListener('afterprint',()=>setTimeout(cleanup,500),{once:true});w.focus();w.print();setTimeout(cleanup,90000);}
      catch{cleanup();notify('Could not open the print dialog. Please try again.','error');}
    },160);};
    frame.srcdoc=html;
  }
  function bind(){
    document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.page)));
    document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.go)));
    $('menuBtn').addEventListener('click',()=>{$('sidebar').classList.add('open');$('mobileOverlay').classList.add('show');});
    $('mobileOverlay').addEventListener('click',closeMobile);
    $('navExport').addEventListener('click',()=>{go('setup');$('backupBtn').scrollIntoView({behavior:'smooth',block:'end'});});
    $('overviewGenerate').addEventListener('click',()=>generate());
    $('homeBlankBtn').addEventListener('click',()=> $('blankSchoolBtn').click());
    $('setupGenerate').addEventListener('click',()=>generate());
    $('shuffleBtn').addEventListener('click',()=>generate());
    $('quickPrint').addEventListener('click',()=>{go('timetable');printTable();});
    $('csvBtn').addEventListener('click',downloadCSV);
    $('exportPrintBtn').addEventListener('click',()=>printTable());
    $('printAllBtn').addEventListener('click',()=>printTable({all:true}));
    $('classViewBtn').addEventListener('click',()=>{tableType='class';renderTimetable()});
    $('teacherViewBtn').addEventListener('click',()=>{tableType='teacher';renderTimetable()});
    $('entitySelect').addEventListener('change',e=>{if(tableType==='class')selectedClass=e.target.value;else selectedTeacher=e.target.value;renderTimetable();});
    $('teachersOpenTimetable').addEventListener('click',()=>{tableType='teacher';renderTimetable();go('timetable');});
    $('settingsForm').addEventListener('submit',saveSettings);
    $('classForm').addEventListener('submit',e=>{e.preventDefault();addItem('class',$('className').value);$('className').value='';});
    $('teacherForm').addEventListener('submit',e=>{e.preventDefault();addItem('teacher',$('teacherName').value);$('teacherName').value='';});
    $('subjectForm').addEventListener('submit',e=>{e.preventDefault();const name=$('subjectName').value;let code=$('subjectCode').value.trim().toUpperCase();if(!/^[A-Z0-9_-]{2,7}$/.test(code)){notify('Subject code should be 2–7 letters or numbers.','warning');return;}addItem('subject',name,{code,color:$('subjectColor').value});$('subjectName').value='';$('subjectCode').value='';});
    $('allocationForm').addEventListener('submit',addAllocation);
    $('allocationFilter').addEventListener('change',e=>{allocationFilter=e.target.value;renderSetup()});
    $('closeModal').addEventListener('click',closeEditor);$('cancelModal').addEventListener('click',closeEditor);$('saveModal').addEventListener('click',saveEditor);
    $('cellModal').addEventListener('click',e=>{if(e.target.id==='cellModal')closeEditor();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEditor();});
    $('blankSchoolBtn').addEventListener('click',()=>{
      if(!confirm('Start a new blank school? This will replace the current workspace on this browser. Export a backup first if needed.'))return;
      const fresh=E.defaultData();
      data={...fresh,classes:[],teachers:[],subjects:[],allocations:[],schedule:{},locks:{}};
      isDemo=false;selectedClass='';selectedTeacher='';allocationFilter='all';
      persist(true);renderAll();go('setup');notify('Blank school created. Start by adding classes, teachers and subjects.');
    });
    $('resetDemoBtn').addEventListener('click',()=>{
      if(!confirm('Replace your current timetable and settings with the demonstration school? Download a backup first if needed.'))return;
      data=initialDemo();isDemo=true;selectedClass=data.classes[0]?.id||'';selectedTeacher=data.teachers[0]?.id||'';allocationFilter='all';persist(false);renderAll();notify('Example school data loaded.');
    });
    $('backupBtn').addEventListener('click',backup);
    $('importBtn').addEventListener('click',()=>$('backupInput').click());
    $('backupInput').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';await importBackup(file)});
    window.addEventListener('hashchange',()=>{const p=window.location.hash.slice(1);if(pathPage.has(p)&&p!==page)go(p)});
  }
  bind();renderAll();go(pathPage.has(location.hash.slice(1))?location.hash.slice(1):'overview');
})();
