const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuestions, makePrompt, splitCount } = require('../api/generate')._test;

test('valid four options and answer index accepted', () => {
  const q = normalizeQuestions({ questions: [{ question:'2 + 2?', options:['3','4','5','6'], answer:1, explanation:'Addition' }] }, 1);
  assert.equal(q[0].answer, 1);
  assert.equal(q[0].id, 1);
});
test('alphabet answer normalized', () => {
  const q = normalizeQuestions({ questions: [{ question:'Test?', options:['a','b','c','d'], answer:'C' }] }, 1);
  assert.equal(q[0].answer, 2);
});
test('rejects missing option', () => {
  assert.throws(() => normalizeQuestions({ questions: [{question:'X',options:['a','b'],answer:1}] },1));
});
test('requires exact question count', () => {
  assert.throws(() => normalizeQuestions({questions:[]},5));
});
test('prompt uses correct language and exact count', () => {
  const p = makePrompt({ topic:'Force',source:'',grade:9,count:10,difficulty:'Medium',language:'Sindhi' });
  assert.ok(p.includes('Sindhi'));
  assert.ok(p.includes('EXACTLY 10'));
});

test('duplicate options are rejected', () => {
  assert.throws(() => normalizeQuestions({questions:[{question:'Example?',options:['same','Same','Other','Fourth'],answer:0}]},1),/duplicate options/);
});
test('duplicate question stems are rejected', () => {
  const q={question:'What is force?',options:['a','b','c','d'],answer:0};
  assert.throws(() => normalizeQuestions({questions:[q,{...q,question:'WHAT is force?'}]},2),/duplicate questions/);
});

test('supports every multiple of five through fifty', () => {
  for (let count = 5; count <= 50; count += 5) {
    const batches = splitCount(count);
    assert.equal(batches.reduce((a, b) => a + b, 0), count);
    assert.ok(batches.every(n => n >= 5 && n <= 20));
  }
});
test('fifty questions split into three reliable requests', () => {
  assert.deepEqual(splitCount(50), [20, 20, 10]);
  assert.deepEqual(splitCount(35), [20, 15]);
});
test('rejects unsupported question counts', () => {
  assert.throws(() => splitCount(51));
  assert.throws(() => splitCount(21));
});
test('prompts vary subject focus between batches', () => {
  const params={ topic:'Force',source:'',grade:9,count:20,difficulty:'Medium',language:'Sindhi',batchTotal:3 };
  const first=makePrompt({...params,batchIndex:0});
  const second=makePrompt({...params,batchIndex:1});
  assert.notEqual(first,second);
  assert.ok(first.includes('batch 1 of 3'));
  assert.ok(second.includes('batch 2 of 3'));
});
