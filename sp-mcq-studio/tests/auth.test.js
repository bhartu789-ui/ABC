'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../lib/auth');
const login = require('../api/auth/login');
const getApp = require('../api/app');
const generator = require('../api/generate');

const CLIENT = '123456789-testapp.apps.googleusercontent.com';
const SECRET = 'secure-and-random-session-signing-key-for-automated-tests-123456';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'quizmetric-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function fakeGoogleKeys() {
  return Promise.resolve({
    ok: true,
    headers: { get: () => 'public, max-age=60' },
    json: async () => ({ keys: [jwk] })
  });
}
function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function jwt(overrides = {}) {
  const now = Math.floor(Date.now()/1000);
  const head = encode({ alg:'RS256', kid:jwk.kid,typ:'JWT' });
  const payload = encode({
    iss:'https://accounts.google.com',aud:CLIENT,
    sub:'123456789012345678901', name:'QuizMetric User',
    email:'student@gmail.com',email_verified:true,
    iat:now,exp:now+3600,...overrides
  });
  const message=head+'.'+payload;
  return message+'.'+crypto.sign('RSA-SHA256',Buffer.from(message),privateKey).toString('base64url');
}
function res() {
  return {
    statusCode:200,headers:{}, body:null,
    setHeader(k,v){this.headers[k.toLowerCase()]=v;},
    end(data){this.body=data||'';return this;}
  };
}
function withEnv(fn) {
  const old={GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID,SESSION_SECRET:process.env.SESSION_SECRET};
  process.env.GOOGLE_CLIENT_ID=CLIENT;
  process.env.SESSION_SECRET=SECRET;
  try {return fn();}
  finally {
    if(old.GOOGLE_CLIENT_ID==null)delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID=old.GOOGLE_CLIENT_ID;
    if(old.SESSION_SECRET==null)delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET=old.SESSION_SECRET;
  }
}

test('login remains disabled until both configured values are set', () => {
  const oldClient=process.env.GOOGLE_CLIENT_ID,oldSecret=process.env.SESSION_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  process.env.SESSION_SECRET=SECRET;
  assert.equal(auth.isAuthConfigured(),false);
  process.env.GOOGLE_CLIENT_ID=CLIENT;
  assert.equal(auth.isAuthConfigured(),true);
  if(oldClient==null)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=oldClient;
  if(oldSecret==null)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;
});

test('Google JWT signature and claims verified against official-style JWKS', async () => {
  const out=await auth.verifyGoogleToken(jwt(),{clientId:CLIENT,fetcher:fakeGoogleKeys});
  assert.equal(out.sub,'123456789012345678901');
  assert.equal(out.email,'student@gmail.com');
});

test('Google JWT with wrong audience is rejected', async () => {
  await assert.rejects(()=>auth.verifyGoogleToken(jwt({aud:'malicious.apps.googleusercontent.com'}),{clientId:CLIENT,fetcher:fakeGoogleKeys}),/verify/);
});

test('Google JWT with unverified email is rejected', async () => {
  await assert.rejects(()=>auth.verifyGoogleToken(jwt({email_verified:false}),{clientId:CLIENT,fetcher:fakeGoogleKeys}),/verify/);
});

test('Google JWT with expired token is rejected', async () => {
  const now=Math.floor(Date.now()/1000);
  await assert.rejects(()=>auth.verifyGoogleToken(jwt({iat:now-7200,exp:now-3600}),{clientId:CLIENT,fetcher:fakeGoogleKeys}),/verify/);
});

test('Google JWT with tampered signature is rejected', async () => {
  const token=jwt();
  const sections=token.split('.');
  sections[2]=(sections[2][0]==='A'?'B':'A')+sections[2].slice(1);
  await assert.rejects(()=>auth.verifyGoogleToken(sections.join('.'),{clientId:CLIENT,fetcher:fakeGoogleKeys}),/signature/);
});

test('signed session cookie validated and cannot be forged', () => withEnv(() => {
  const user={sub:'123456789012345678901',name:'Student',email:'student@gmail.com'};
  const token=auth.sessionToken(user);
  assert.equal(auth.sessionFromToken(token).name,'Student');
  const altered=token.slice(0,-3)+'aaa';
  assert.equal(auth.sessionFromToken(altered),null);
  const cookie=auth.cookieForUser(user);
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/Secure/);
  assert.match(cookie,/SameSite=Lax/);
  assert.equal(auth.sessionFromRequest({headers:{cookie}}).sub,user.sub);
}));

test('seven-day session expiry is enforced', () => withEnv(() => {
  const now=Math.floor(Date.now()/1000);
  const signed=auth.sessionToken({sub:'123456789012345678901',name:'User',email:'student@gmail.com'},now);
  assert.equal(auth.sessionFromToken(signed,now+7*86400+1),null);
}));

test('POST sign-in denies cross-origin requests before ID token processing', async () => {
  const oldId=process.env.GOOGLE_CLIENT_ID,oldSecret=process.env.SESSION_SECRET;
  process.env.GOOGLE_CLIENT_ID=CLIENT;process.env.SESSION_SECRET=SECRET;
  try {
    const response=res();
    await login({method:'POST',headers:{host:'quizmetric-ai.vercel.app',origin:'https://evil.example'},body:{credential:'x'}},response);
    assert.equal(response.statusCode,403);
  }finally{
    if(oldId==null)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=oldId;
    if(oldSecret==null)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;
  }
});

test('authenticated app is inaccessible without session once enabled', () => withEnv(() => {
  const response=res();
  getApp({method:'GET',headers:{}},response);
  assert.equal(response.statusCode,302);
  assert.equal(response.headers.location,'/login.html');
}));

test('generation API blocks guest when Google auth is enabled', async () => {
  const oldId=process.env.GOOGLE_CLIENT_ID,oldSecret=process.env.SESSION_SECRET;
  process.env.GOOGLE_CLIENT_ID=CLIENT;process.env.SESSION_SECRET=SECRET;
  try {
    const response=res();
    await generator({method:'POST',headers:{},body:{}},response);
    assert.equal(response.statusCode,401);
    assert.match(response.body,/loginRequired/);
  }finally{
    if(oldId==null)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=oldId;
    if(oldSecret==null)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;
  }
});

test('frontend scopes saved bank to Google account and has sign-out', () => {
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const loginPage=fs.readFileSync(path.join(__dirname,'..','login.html'),'utf8');
  assert.match(html,/quizmetric_question_bank_v1' \+ STORAGE_SCOPE/);
  assert.match(html,/id="logoutBtn"/);
  assert.match(loginPage,/accounts\.google\.com\/gsi\/client/);
  assert.match(loginPage,/api\/auth\/login/);
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
  assert.ok(config.routes.some(x=>x.src==='^/$'&&x.dest==='/api/app'));
  assert.ok(config.routes.some(x=>x.src==='^/index\\.html$'&&x.dest==='/api/app'));
});
