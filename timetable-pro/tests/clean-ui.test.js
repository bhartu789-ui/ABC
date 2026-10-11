'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'clean.css'),'utf8');

function renderSetupSteps(data,stats){
  const start=app.indexOf('  function renderSteps(){');
  const end=app.indexOf('  function go(newPage){',start);
  assert.ok(start!==-1&&end>start,'The workflow step renderer must exist');
  const build=new Function('data','currentMetrics','$',app.slice(start,end)+';return renderSteps;');
  const elements=new Map();
  const lookup=id=>{
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{textContent:'',classList:{
        toggle(className,active){if(active)classes.add(className);else classes.delete(className);},
        contains(className){return classes.has(className);}
      }});
    }
    return elements.get(id);
  };
  build(data,()=>stats,lookup)();
  return lookup;
}

test('clean homepage has a concise action panel and three setup steps',()=>{
  assert.match(html,/rel="stylesheet" href="clean.css"/);
  assert.match(html,/id="homeBlankBtn"/);
  assert.match(html,/id="workflowSteps"/);
  for(const key of ['School','Lessons','Generate']){
    assert.match(html,new RegExp('id="step'+key+'"'));
    assert.match(html,new RegExp('id="step'+key+'Status"'));
    assert.match(html,new RegExp('id="step'+key+'Hint"'));
  }
  assert.doesNotMatch(html,/class="hero-visual"/);
});

test('all workflow DOM controls are connected to the scheduler',()=>{
  assert.match(app,/renderStats\(\);renderSteps\(\);renderOverview\(\)/);
  assert.match(app,/\$\('homeBlankBtn'\)\.addEventListener/);
  assert.match(app,/\$\('blankSchoolBtn'\)\.click\(\)/);
  assert.doesNotThrow(()=>new Function(app));
});

test('empty school guides the user instead of claiming success',()=>{
  const dom=renderSetupSteps(
    {classes:[],teachers:[],subjects:[],allocations:[]},
    {valid:true,required:0,scheduled:0}
  );
  assert.equal(dom('stepSchoolStatus').textContent,'To do');
  assert.equal(dom('stepLessonsStatus').textContent,'To do');
  assert.equal(dom('stepGenerateStatus').textContent,'To do');
  assert.equal(dom('stepGenerate').classList.contains('done'),false);
});

test('complete school allocations and timetable show readiness',()=>{
  const dom=renderSetupSteps(
    {classes:[{id:'class-1'}],teachers:[{id:'teacher-1'}],subjects:[{id:'subject-1'}],
      allocations:[{classId:'class-1',perWeek:5}]},
    {valid:true,required:5,scheduled:5}
  );
  for(const id of ['School','Lessons','Generate']){
    assert.equal(dom('step'+id+'Status').textContent,'Ready');
    assert.equal(dom('step'+id).classList.contains('done'),true);
  }
});

test('partial teaching allocations keep the next steps pending',()=>{
  const dom=renderSetupSteps(
    {classes:[{id:'class-1'},{id:'class-2'}],teachers:[{id:'teacher-1'}],subjects:[{id:'subject-1'}],
      allocations:[{classId:'class-1',perWeek:5}]},
    {valid:false,required:5,scheduled:1}
  );
  assert.equal(dom('stepSchoolStatus').textContent,'Ready');
  assert.equal(dom('stepLessonsStatus').textContent,'To do');
  assert.equal(dom('stepGenerateStatus').textContent,'To do');
});

test('clean stylesheet includes mobile layout and keyboard focus',()=>{
  assert.match(css,/workflow-panel\{display:grid/);
  assert.match(css,/@media\(max-width:690px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media print/);
});
