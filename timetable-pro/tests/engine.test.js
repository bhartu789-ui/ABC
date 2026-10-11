'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../src/engine');

test('sample school has four classes, fourteen teachers and thirty lessons per class', () => {
  const school = Engine.defaultData();
  assert.equal(school.classes.length,4);
  assert.equal(school.teachers.length,14);
  assert.equal(school.allocations.length,32);
  assert.deepEqual(Engine.validateInputs(school).errors,[]);
  assert.equal(Engine.validateInputs(school).weeklyCapacity,30);
});

test('generates 120 lessons without double booking across multiple seeds', () => {
  const original=Engine.defaultData();
  for(let i=0;i<30;i++){
    const result=Engine.generateSchedule(original,{attempts:140,seed:31415+i*12});
    assert.equal(result.ok,true,'seed '+i+' failed: '+result.error);
    assert.equal(result.stats.scheduled,120);
    assert.equal(result.stats.shortages.length,0);
    assert.deepEqual(result.stats.conflicts,[]);
    assert.ok(Object.values(result.data.schedule).every(row=>row.length===30));
  }
});

test('locks survive regeneration even when other lessons move', () => {
  const sample=Engine.generateSchedule(Engine.defaultData(),{seed:10}).data;
  const classId='c6a', idx=0, lesson=sample.schedule[classId][idx];
  const edited=Engine.setCell(sample,classId,idx,lesson,true);
  assert.equal(edited.ok,true);
  const result=Engine.generateSchedule(edited.data,{seed:9284});
  assert.equal(result.ok,true);
  assert.equal(result.data.schedule[classId][idx],lesson);
  assert.equal(result.data.locks[classId][idx],true);
});

test('manual edit rejects teacher clash in the same period', () => {
  const data=Engine.defaultData();
  const a=data.allocations.find(x=>x.classId==='c6a'&&x.subjectId==='eng');
  const b=data.allocations.find(x=>x.classId==='c6b'&&x.subjectId==='eng');
  assert.equal(a.teacherId,b.teacherId);
  const scheduled=Engine.setCell(data,'c6a',0,a.id,true);
  assert.equal(scheduled.ok,true);
  const test=Engine.checkCell(scheduled.data,'c6b',0,b.id);
  assert.equal(test.ok,false);
  assert.match(test.error,/already teaching/);
});

test('manual editor respects exact subject weekly quotas', () => {
  const school=Engine.generateSchedule(Engine.defaultData(),{seed:5}).data;
  const course=school.allocations.find(a=>a.classId==='c6a'&&a.subjectId==='eng');
  const occupied=school.schedule.c6a.filter(v=>v===course.id);
  assert.equal(occupied.length,course.perWeek);
  const otherSlot=school.schedule.c6a.findIndex(v=>v!==course.id);
  const attempt=Engine.checkCell(school,'c6a',otherSlot,course.id);
  assert.equal(attempt.ok,false);
  assert.match(attempt.error,/Weekly limit/);
});

test('flags classroom overcapacity', () => {
  const data=Engine.defaultData();
  data.allocations[0].perWeek=35;
  assert.ok(Engine.validateInputs(data).errors.some(s=>s.includes('needs 59 periods')));
});

test('flags teacher overcapacity', () => {
  const data=Engine.defaultData();
  data.allocations[0].teacherId='t13';
  data.allocations[1].teacherId='t13';
  data.allocations[2].teacherId='t13';
  data.allocations[3].teacherId='t13';
  data.allocations[4].teacherId='t13';
  assert.ok(Engine.validateInputs(data).errors.some(s=>s.includes('can teach at most')));
});

test('deliberate double-booking is detected', () => {
  const data=Engine.generateSchedule(Engine.defaultData(),{seed:2}).data;
  const target=data.schedule.c6a[0];
  const teacher=data.allocations.find(a=>a.id===target).teacherId;
  const c2Course=data.allocations.find(a=>a.classId==='c6b'&&a.teacherId===teacher);
  assert.ok(c2Course);
  data.schedule.c6b[0]=c2Course.id;
  const checked=Engine.validateSchedule(data);
  assert.equal(checked.valid,false);
  assert.ok(checked.conflicts.some(s=>s.includes('double-booked')));
});

test('free periods allowed if class has fewer allocated lessons', () => {
  const data=Engine.defaultData();
  data.allocations=data.allocations.filter(a=>a.classId!=='c8a'||a.subjectId!=='pe');
  const check=Engine.validateInputs(data);
  assert.deepEqual(check.errors,[]);
  assert.ok(check.warnings.some(x=>x.includes('free/study')));
  const result=Engine.generateSchedule(data,{seed:1});
  assert.equal(result.ok,true);
  assert.equal(result.stats.free,1);
});

test('bell times account for the mid-day break correctly', () => {
  const s=Engine.defaultData().settings;
  assert.equal(Engine.timeAt(s,0),'08:00 – 08:40');
  assert.equal(Engine.timeAt(s,2),'09:20 – 10:00');
  assert.equal(Engine.timeAt(s,3),'10:20 – 11:00');
  assert.equal(Engine.timeAt(s,5),'11:40 – 12:20');
});

test('engine does not mutate school input on generation', () => {
  const data=Engine.defaultData();
  const prior=JSON.stringify(data);
  Engine.generateSchedule(data,{seed:6});
  assert.equal(JSON.stringify(data),prior);
});

test('browser UI and stylesheet contain essential workflows', () => {
  const fs=require('node:fs');const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','src','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  for(const id of ['overviewGenerate','scheduleTable','settingsForm','allocationForm','cellModal','csvBtn','printAllBtn','backupBtn','backupInput','teacherGrid','blankSchoolBtn'])assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
  for(const piece of ['generateSchedule(', 'printTable(', 'downloadCSV(', 'importBackup(', 'openEditor(', 'setCell(', 'saveEditor('])assert.ok(js.includes(piece),'Missing '+piece);
  assert.ok(css.includes('@media(max-width:570px)'));
  assert.ok(css.includes('@media print'));
  assert.doesNotThrow(()=>new Function('window','document','localStorage','location','confirm','Blob','URL','setTimeout',js));
});
