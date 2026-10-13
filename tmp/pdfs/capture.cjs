const { chromium } = require('../../frontend/node_modules/playwright');
const path = require('path');
const out = __dirname;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1.5,reducedMotion:'reduce'});
 const page=await context.newPage();
 page.setDefaultTimeout(60000);
 const base='http://127.0.0.1:3001';
 async function shot(name){await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));await page.addStyleTag({content:'nextjs-portal { display:none !important; }'});await page.screenshot({path:path.join(out,name+'.png')});console.log(name);}
 await page.goto(base+'/auth');await page.getByRole('heading',{name:'Welcome back'}).waitFor();await shot('01-login');
 await page.goto(base);
 const ids=await page.evaluate(()=>{
 const id=crypto.randomUUID(),second=crypto.randomUUID(),blank=crypto.randomUUID();
 const projects=[{id,title:'Social Media Use and Academic Performance',research_problem:'How do students describe the relationship between social media use and study routines?',citation_style:'apa',structure:'five-chapter',revision:0},{id:second,title:'Feedback and Student Engagement',research_problem:'How do students use teacher feedback to improve their work?',citation_style:'apa',structure:'five-chapter',revision:0},{id:blank,title:'A New Research Question',research_problem:'What would you like to investigate?',citation_style:'apa',structure:'blank',revision:0}];
 const paragraphs=['This illustrative draft explores how students describe social media use in relation to their daily study routines. It is sample content for a UI walkthrough, not a completed research study.','The proposed study distinguishes between using online platforms for academic collaboration and using them for leisure. A student might discuss an assignment with classmates, watch a tutorial, or switch between schoolwork and personal messages. These activities should be examined separately rather than treated as one behavior.','The research question focuses on students’ experiences: when do they use these platforms, what purposes do they report, and how do they organize their study time? Interviews and a short study diary are possible methods to explore these questions.','A review of related literature would compare definitions, methods, findings, and limitations across verified sources. References and claims should be added only after the original papers have been checked. No published findings or citations are asserted in this example.','The next step is to define the scope of the study, identify suitable participants, and prepare a transparent plan for gathering and analyzing the evidence.'];
 const sections=['Introduction','Review of related literature','Methodology','Results and discussion','Conclusions'].map((title,position)=>({id:crypto.randomUUID(),project_id:id,title,position,parent_id:null,revision:0,content:{type:'doc',content:position===0?paragraphs.map(text=>({type:'paragraph',content:[{type:'text',text}]})):[{type:'paragraph'}]}}));
 localStorage.setItem('thesisdesk-drafts-v1',JSON.stringify({version:1,projects,sections}));localStorage.setItem('thesisdesk-theme','light');return {id,blank};});
 await page.reload();await page.getByRole('link',{name:/Social Media Use/}).waitFor();await shot('02-dashboard');
 await page.goto(base+'/project/'+ids.id);await page.getByRole('textbox',{name:'Chapter content',exact:true}).waitFor();await shot('03-editor');
 await page.getByRole('button',{name:'Open Otto assistant'}).click();await page.getByRole('dialog',{name:'Otto assistant'}).waitFor();await shot('04-otto');
 await page.getByRole('button',{name:'Dock',exact:true}).click();await shot('05-docked');
 await page.getByRole('button',{name:'Close Otto'}).click();await page.getByRole('button',{name:'Upload PDF',exact:true}).click();await page.getByRole('heading',{name:/Sources/}).waitFor();await shot('06-sources');
 await page.getByRole('button',{name:'Open evidence viewer'}).click();await page.locator('.reader-excerpt').waitFor();await shot('07-evidence');
 await page.goto(base+'/project/'+ids.blank);await page.getByRole('heading',{name:'Start your first section'}).waitFor();await shot('08-empty');
 await page.goto(base+'/project/'+ids.id);await page.getByRole('textbox',{name:'Chapter content',exact:true}).waitFor();await page.getByRole('button',{name:'Use dark theme'}).click();await shot('09-dark');
 await page.getByRole('button',{name:'Use light theme'}).click();await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('textbox',{name:'Chapter content',exact:true}).waitFor();await shot('10-mobile');
 await page.getByRole('navigation',{name:'Mobile workspace'}).getByRole('button',{name:'Assistant',exact:true}).click();await shot('11-mobile-otto');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

