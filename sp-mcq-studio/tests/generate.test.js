const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuestions, makePrompt } = require('../api/generate')._test;

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
