import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const evidence=path.resolve(process.env.INBOX_EVIDENCE_DIR||'');
assert.ok(process.env.INBOX_EVIDENCE_DIR&&!evidence.startsWith(process.cwd()+path.sep),'External evidence directory required');
mkdirSync(evidence,{recursive:true});
const data=[];for await(const b of process.stdin)data.push(b);
const fixture=JSON.parse(Buffer.concat(data).toString('utf8'));data.forEach(b=>b.fill(0));
const origin='http://127.0.0.1:5187',report={checks:[],errors:[],http:[],layouts:[]};
const save=()=>writeFileSync(path.join(evidence,'evidence.json'),JSON.stringify(report,null,2));
const browser=await chromium.launch({channel:'chrome',headless:true});let stage='login';
const actors=[];
async function call(actor,method,url,status,body){
 const res=await actor.ctx.request.fetch(origin+'/api/v1'+url,{method,headers:{Authorization:'Bearer '+actor.token},data:body,maxRedirects:0});
 report.http.push({id:actor.id,method,url,status:res.status()});assert.equal(res.status(),status,method+' '+url);
 return res.json();
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,why){for(let i=0;i<100;i++){if(await fn())return;await pause(100);}throw Error(why);}
function record(s){report.checks.push(s);save();}
const titles=p=>p.locator('.inbox-card > header > strong,.membership-inbox-card > strong');
async function layout(m,width){
 await m.p.setViewportSize({width,height:900});
 await pause(400);
 await until(async()=>await m.p.locator(".toast-stack .toast").count()===0,"toast animation complete");
 const measured=await m.p.locator('.inbox-card').evaluateAll(cards=>cards.map(c=>{
  const s=getComputedStyle(c),b=c.getBoundingClientRect();return {pad:parseFloat(s.paddingLeft),width:b.width,right:b.right,left:b.left,scroll:c.scrollWidth,client:c.clientWidth};
 }));
 const documentWidth=await m.p.evaluate(()=>document.documentElement.scrollWidth);
 report.layouts.push({member:m.id,width,documentWidth,cards:measured});
 assert.ok(measured.length>0);
 assert.ok(measured.every(b=>b.pad>=14&&b.scroll<=b.client+1&&b.left>=0&&b.right<=width+1),
  'Card overflows at '+width+'px');
 assert.ok(documentWidth<=width+1,'Document overflows at '+width+'px');
 await m.p.screenshot({path:path.join(evidence,'member-'+m.id+'-'+width+'.png'),fullPage:true});
}
try{
 for(const a of fixture.actors){
  const ctx=await browser.newContext({timezoneId:'Asia/Ho_Chi_Minh',viewport:{width:1365,height:900},serviceWorkers:'block'});
  const p=await ctx.newPage();p.setDefaultTimeout(11000);p.on('pageerror',e=>report.errors.push(e.name));
  let streamOpened=false;
  p.on('response',response=>{
   if(new URL(response.url()).pathname==='/api/v1/notifications/stream'&&response.ok()
    &&response.headers()['content-type']?.startsWith('text/event-stream'))streamOpened=true;
  });
  await ctx.route(/^https?:\/\//,r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await p.goto(origin+'/login');await p.getByLabel('Địa chỉ email').fill(a.email);await p.getByLabel('Mật khẩu',{exact:true}).fill(a.password);
  const [res]=await Promise.all([p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/users/login'),p.getByRole('button',{name:'Đăng nhập',exact:true}).click()]);assert.equal(res.status(),200);
  const login=await res.json();assert.equal(login.user.id,a.id);assert.equal(login.user.roleName,a.role);
  actors.push({id:a.id,role:a.role,p,ctx,token:login.token,hasStream:()=>streamOpened});
  await p.locator('#main-sidebar').waitFor();
 }
 const [member,other,staff,manager]=actors;
 stage='preflight';
 const a=await call(member,'GET','/classes/'+fixture.first,200),b=await call(member,'GET','/classes/'+fixture.second,200);
 assert.ok(a.className.startsWith('Lớp xác nhận A'));assert.equal(a.scheduleTime.slice(0,16),fixture.time.slice(0,16));
 for(const m of [member,other]){
  await m.p.locator('#main-sidebar a[href="/notifications"]').click();await m.p.getByText('Chưa nhận thông báo nào',{exact:true}).waitFor();
  await until(m.hasStream,'SSE stream did not open');m.start=await m.p.evaluate(()=>performance.timeOrigin);
 }
 stage='booking';
 const booking=await call(member,'POST','/classes/'+a.id+'/book',201);
 await member.p.locator('.member-inbox').getByText('Đăng ký lớp thành công',{exact:true}).waitFor();
 assert.ok(await member.p.getByText(new RegExp(a.className)).count());assert.equal(await member.p.locator('.inbox-card').count(),1);
 assert.equal(await other.p.locator('.inbox-card').count(),0);record('Member booking one live confirmation, correct recipient');
 await call(member,'POST','/classes/'+a.id+'/book',400);await pause(400);assert.equal(await member.p.locator('.inbox-card').count(),1);
 await call(staff,'POST','/classes/'+a.id+'/book?memberId='+other.id,201);await other.p.locator('.member-inbox').getByText('Đăng ký lớp thành công',{exact:true}).waitFor();assert.equal(await other.p.locator('.inbox-card').count(),1);record('duplicate rejected and assisted booking confirms once');
 await call(member,'POST','/classes/'+fixture.overlap+'/book',201);await until(async()=>await member.p.locator('.inbox-card').count()===2,'second confirmation');
 let history=await call(member,'GET','/notifications?page=0&size=100',200);
 assert.ok(history.content[0].content.includes('Lớp giao nhau'));assert.ok((await member.p.locator('.inbox-card').first().innerText()).includes('Lớp giao nhau'));record('newest notification prepended by SSE');
 await call(member,'POST','/classes/'+b.id+'/book',400);assert.equal((await call(member,'GET','/notifications?page=0&size=100',200)).content.length,2);
 await call(manager,'PUT','/classes/'+a.id,409,{scheduleTime:a.scheduleTime.slice(0,10)+'T11:30:00'});
 assert.equal((await call(member,'GET','/classes/'+a.id,200)).scheduleTime,a.scheduleTime);assert.equal((await call(member,'GET','/notifications?page=0&size=100',200)).content.length,2);record('failed booking and HTTP 409 produce no notification');
 await member.p.getByRole('button',{name:'Đánh dấu đã đọc',exact:true}).first().click();await member.p.getByText('Đã đọc',{exact:true}).waitFor();record('read state saved');
 stage='change';
 await call(manager,'PUT','/classes/'+a.id,200,{scheduleTime:a.scheduleTime.slice(0,10)+'T14:00:00'});
 for(const m of [member,other]){await m.p.locator('.member-inbox').getByText('Lớp học thay đổi lịch',{exact:true}).waitFor();assert.equal(await titles(m.p).first().innerText(),'Lớp học thay đổi lịch');assert.equal(await m.p.evaluate(()=>performance.timeOrigin),m.start);}
 record('reschedule SSE and sorting in both inboxes');
 stage='responsive';await layout(member,1365);await layout(member,390);await layout(other,390);
 await member.p.reload();await member.p.getByText('Đã đọc',{exact:true}).waitFor();assert.equal(await titles(member.p).first().innerText(),'Lớp học thay đổi lịch');record('F5 retains history order and read state');
 stage='cancel';await call(manager,'POST','/classes/'+a.id+'/cancel',200);
 for(const m of [member,other]){await m.p.locator('.member-inbox').getByText('Lớp học đã hủy',{exact:true}).waitFor();assert.equal(await titles(m.p).first().innerText(),'Lớp học đã hủy');assert.ok((await call(m,'GET','/members/'+m.id+'/bookings',200)).some(x=>x.classId===a.id&&x.status==='CANCELLED'));}
 record('cancellation SSE preserved');
 stage='rebook';
 const historyUrl='/notifications?page=0&size=100';
 const before=(await call(member,'GET',historyUrl,200)).content;
 const otherBefore=(await call(other,'GET',historyUrl,200)).content;
 const target=(await call(member,'GET','/members/'+member.id+'/bookings',200)).find(x=>x.classId===fixture.overlap);
 const documentStart=await member.p.evaluate(()=>performance.timeOrigin);
 await call(member,'DELETE','/bookings/'+target.id,200);
 await until(async()=>await titles(member.p).first().innerText()==='Hủy đăng ký lớp thành công','cancel booking SSE');
 await call(member,'DELETE','/bookings/'+target.id,400);
 await call(member,'POST','/classes/'+fixture.overlap+'/book',201);
 await until(async()=>await titles(member.p).first().innerText()==='Đăng ký lớp thành công','rebook confirmation');
 history=await call(member,'GET',historyUrl,200);
 const cycle=history.content.filter(n=>n.content.includes('Lớp giao nhau'));
 assert.deepEqual(cycle.map(n=>n.title),['Đăng ký lớp thành công','Hủy đăng ký lớp thành công','Đăng ký lớp thành công']);
 assert.ok(cycle.every(n=>/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(n.content)));
 assert.equal(history.content.length,before.length+2);
 assert.equal(new Set(history.content.map(n=>n.id)).size,history.content.length);
 assert.equal(await member.p.evaluate(()=>performance.timeOrigin),documentStart);
 assert.deepEqual((await call(other,'GET',historyUrl,200)).content,otherBefore);
 assert.equal(await other.p.locator('.inbox-card').count(),otherBefore.length);
 record('book, cancel and rebook produce three ordered entries and live isolation');
 async function verifyPersistedCycle(){
  const inbox=member.p.locator('.member-inbox');
  await inbox.getByText('Hủy đăng ký lớp thành công',{exact:true}).waitFor();
  assert.equal(await inbox.locator('.inbox-card').filter({hasText:'Lớp giao nhau'}).count(),3);
  await inbox.locator('.inbox-card').filter({hasText:'Lớp giao nhau'}).getByText('Đã đọc',{exact:true}).waitFor();
 }
 await member.p.reload();
 await verifyPersistedCycle();
 record('F5 preserves all three entries and read state');
 stage='logout';
 await member.p.setViewportSize({width:1365,height:900});
 await member.p.getByRole('button',{name:'Mở menu tài khoản'}).click();
 await member.p.getByRole('button',{name:'Đăng xuất',exact:true}).click();
 await member.p.goto(origin+'/login');
 stage='login again';
 const account=fixture.actors[0];
 await member.p.getByLabel('Địa chỉ email').fill(account.email);
 await member.p.getByLabel('Mật khẩu',{exact:true}).fill(account.password);
 const [signIn]=await Promise.all([member.p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/users/login'),member.p.getByRole('button',{name:'Đăng nhập',exact:true}).click()]);
 assert.equal(signIn.status(),200);
 member.token=(await signIn.json()).token;
 stage='open inbox after login';
 await member.p.locator('#main-sidebar a[href="/notifications"]').click();
 await verifyPersistedCycle();
 record('logout and login preserve all three entries and read state');
 stage='long text';
 const longTitle='Thông báo kiểm thử '+ 'A'.repeat(115);
 await call(manager,'POST','/notifications',202,{recipientIds:[member.id],title:longTitle,content:'Bài tập '+ 'b'.repeat(550),kind:'GENERAL',link:'/schedule'});
 await member.p.locator('.member-inbox').getByText(longTitle,{exact:true}).waitFor();
 await layout(member,320);await layout(member,390);await layout(member,1365);record('long text wraps at 320, 390 and 1365 pixels');
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=stage+': '+String(e.message).split('\n')[0].slice(0,220);process.exitCode=1;}
finally{await browser.close();save();console.log(JSON.stringify({checks:report.checks,pass:report.pass,failure:report.failure}));}
