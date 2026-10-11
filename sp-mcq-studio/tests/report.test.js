'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = page.indexOf('function calculateQuizReport(');
const end = page.indexOf('\nfunction reportDate(', start);
assert.ok(start >= 0 && end > start, 'Report-calculation helper must exist');
const calculateQuizReport = new Function(page.slice(start, end) + '\nreturn calculateQuizReport;')();

function fixture(total, correct, skipped = 0) {
  const questions = Array.from({ length: total }, (_, i) => ({
    question: 'Question ' + (i + 1),
    answer: i % 4
  }));
  const picks = {};
  for (let i = 0; i < total - skipped; i++) {
    picks[i] = i < correct ? (i % 4) : ((i + 1) % 4);
  }
  return calculateQuizReport(questions, picks);
}

test('8 of 10 produces a graded report with correct statistics', () => {
  const r = fixture(10, 8);
  assert.equal(r.total, 10);
  assert.equal(r.correct, 8);
  assert.equal(r.incorrect, 2);
  assert.equal(r.skipped, 0);
  assert.equal(r.percent, 80);
  assert.equal(r.grade, 'A');
  assert.equal(r.performance, 'Excellent');
});

test('50 fully correct answers generate a complete report', () => {
  const r = fixture(50, 50);
  assert.equal(r.percent, 100);
  assert.equal(r.grade, 'A+');
  assert.equal(r.correct, 50);
  assert.equal(r.details.length, 50);
});

test('50 questions at 60 percent are graded consistently', () => {
  const r = fixture(50, 30);
  assert.equal(r.percent, 60);
  assert.equal(r.grade, 'C');
  assert.equal(r.incorrect, 20);
});

test('zero correct answers are handled without misleading results', () => {
  const r = fixture(5, 0);
  assert.equal(r.percent, 0);
  assert.equal(r.grade, 'E');
  assert.equal(r.incorrect, 5);
});

test('unanswered questions are tracked separately', () => {
  const r = fixture(5, 3, 2);
  assert.equal(r.skipped, 2);
  assert.equal(r.incorrect, 0);
  assert.equal(r.correct, 3);
});

test('student identity and report actions appear only in completed quiz workflow', () => {
  assert.match(page, /id="studentNameInput"/);
  assert.match(page, /id="reportCard"/);
  assert.match(page, /mode==='quiz'&&resultShown/);
  assert.match(page, /id="reportPrintBtn"/);
  assert.match(page, /id="reportReviewBtn"/);
  assert.match(page, /id="reportRetakeBtn"/);
  assert.match(page, /finish(?:edAt)?=new Date\(\)/);
});

test('main application script parses with report card included', () => {
  const script = page.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'Expected inline JavaScript');
  assert.doesNotThrow(() => new Function(script[1]));
});
