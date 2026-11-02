/* Browser UI; uses textContent/value, never HTML from imported records. */
'use strict';
const F = window.Fulltext;
const KEY = 'fyp26-fulltext-v3-workspace';
const LEGACY_KEY = 'fyp26-fulltext-v2-workspace';
let data = F.blank();
let blocked = false;
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
function save() {
  data.export_kind = 'draft';
  data.annotated_at = new Date().toISOString();
  if (blocked) { $('save-state').textContent = 'Local save blocked to protect an unreadable previous record. Export your draft; restore a valid backup or explicitly start a new paper.'; return; }
  try { localStorage.setItem(KEY, JSON.stringify(data)); $('save-state').textContent = 'Saved in this browser. Export a JSON backup before leaving.'; }
  catch (e) { $('save-state').textContent = 'NOT saved locally. Keep this page open and export a draft now. ' + e.message; }
}
let counter = 0;
function field(parent, label, value, onChange, {choices = null, multiline = false, help = '', placeholder = 'Choose…'} = {}) {
  const id = 'field-' + (++counter);
  const wrapper = el('div'); parent.append(wrapper); parent = wrapper;
  const l = el('label', label); l.htmlFor = id; parent.append(l);
  const input = el(choices ? 'select' : multiline ? 'textarea' : 'input'); input.id = id;
  if (choices) {
    input.append(new Option(placeholder, ''));
    for (const choice of choices) {
      const [v,t] = Array.isArray(choice) ? choice : [choice, choice.replaceAll('_',' ')];
      input.append(new Option(t,v));
    }
  } else { input.maxLength = 12000; if (!multiline) input.type = 'text'; }
  input.value = value;
  if (help) { const p = el('p', help, 'help'); p.id = id + '-help'; input.setAttribute('aria-describedby',p.id); parent.append(p); }
  input.addEventListener(choices ? 'change' : 'input', () => onChange(input.value, input));
  parent.append(input);
  return input;
}
function question(parent, definition, answer, simple = false) {
  const box = el('fieldset'); box.append(el('legend', definition.label));
  box.append(el('p', definition.help, 'help'));
  if (simple) {
    field(box, definition.id === 'protein' ? 'Protein name' : 'Tag name or combination', answer.value, v => {
      answer.value = v; answer.status = v.trim() ? 'answered' : ''; save();
    });
    const optional = el('details'); optional.open = Boolean(answer.details || answer.location || answer.evidence || answer.source);
    optional.append(el('summary', 'Supporting information (optional)'));
    field(optional, 'Supporting source', answer.source, v => {answer.source = v; save();}, {choices:F.sources});
    field(optional, 'Exact location', answer.location, v => {answer.location = v; save();}, {help:'For example: Methods, “Cell line generation”; Fig. 1A; Supplementary Table S1.'});
    field(optional, 'Short summary', answer.evidence, v => {answer.evidence = v; save();}, {multiline:true});
    // Preserve older notes without adding another field to new entries.
    if (answer.details) optional.append(el('p', 'Previously saved note: '+answer.details, 'help'));
    box.append(optional); parent.append(box); return;
  }
  const area = box;
  const valuePanel = el('div');
  field(area, 'Answer status', answer.status, v => {
    answer.status = v;
    if (v !== 'answered') answer.value = '';
    drawValue(); save();
  }, {choices: definition.statuses});
  area.append(valuePanel);
  function drawValue() {
    valuePanel.replaceChildren();
    if (answer.status === 'answered') field(valuePanel, definition.choices ? 'Finding' : 'Answer', answer.value, v => {answer.value = v; save();}, {choices: definition.choices, multiline: !definition.choices});
  }
  drawValue();
  field(area, 'Details / uncertainty / where you checked', answer.details, v => {answer.details = v; save();}, {multiline:true});
  const evidence = el('details'); evidence.open = Boolean(answer.source || answer.location || answer.evidence);
  evidence.append(el('summary', 'Supporting evidence (required for answered findings)'));
  field(evidence, 'Source', answer.source, v => {answer.source = v; save();}, {choices:F.sources});
  field(evidence, 'Exact location', answer.location, v => {answer.location = v; save();}, {help:'For example: Fig. 2C; Supplementary Table S1; Methods, “Cell line generation”. Identify any earlier paper.'});
  field(evidence, 'Short quote or faithful summary', answer.evidence, v => {answer.evidence = v; save();}, {multiline:true});
  area.append(evidence); parent.append(box);
}
function render() {
  counter = 0;
  const root = $('form');
  const openTags = new Set([...root.querySelectorAll('details[data-tag-id][open]')].map(n=>n.dataset.tagId));
  root.replaceChildren();
  const meta = el('section', '', 'panel'); meta.append(el('h2', 'Paper and annotator'));
  const grid = el('div', '', 'grid'); meta.append(grid);
  field(grid, 'Your name', data.annotator, v => {data.annotator = v; save();});
  field(grid, 'Role', data.role, v => {data.role = v; save();}, {choices:['student','supervisor']});
  field(grid, 'Practice or evaluation', data.purpose, v => {data.purpose = v; save();}, {choices:['practice','evaluation']});
  field(grid, 'Paper identifier (DOI or assigned ID)', data.paper.id, v => {data.paper.id = v; save();});
  field(meta, 'Paper title', data.paper.title, v => {data.paper.title = v; save();});
  field(meta, 'Assigned target protein(s)', data.paper.target, v => {data.paper.target = v; save();});
  field(meta, 'Access to relevant paper and supplements', data.paper.access, v => {data.paper.access = v; save();}, {choices:['complete','partial','unavailable']});
  field(meta, 'Missing sources / access limitations', data.paper.access_notes, v => {data.paper.access_notes = v; save();});
  root.append(meta);
  data.proteins.forEach((p,pi) => {
    const section = el('section', '', 'panel'); section.append(el('h2', `Protein ${pi+1}`));
    question(section, F.protein, p.identity, true);
    // Add controls stay near the names; follow-up details are collapsible per tag.
    p.tags.forEach((c,ti) => {
      const article = el('article'); article.append(el('h3', `Tag ${ti+1}`));
      question(article, F.core.find(q => q.id === 'tags'), c.answers.tags, true);
      const follow = el('details'); follow.append(el('summary', 'Methods, function and depletion for this tag'));
      if (c.label) follow.append(el('p', 'Previous record label: '+c.label, 'help'));
      field(follow, 'Is this a degron tag?', c.is_degron, (v,input) => {
        const hasAnswers = F.degron.some(q => Object.values(c.answers[q.id]).some(Boolean));
        if (v !== 'yes' && hasAnswers && !confirm('This will clear the depletion answers for this tag only. Export a draft first if needed. Continue?')) {input.value=c.is_degron; return;}
        c.is_degron=v;
        if (v !== 'yes') for (const q of F.degron) c.answers[q.id]=F.blankAnswer();
        save(); render();
        document.querySelector(`[data-tag-id="${c.id}"]`).open = true;
      }, {choices:['yes','no','unclear'], placeholder:'Is this a degron tag? Select yes, no or unclear', help:'Choose unclear rather than guessing. For no/unclear the depletion section stays empty; explain uncertainty in the tag details.'});
      follow.dataset.tagId = c.id; follow.open = openTags.has(c.id);
      for (const q of F.core.filter(q => q.id !== 'tags')) question(follow,q,c.answers[q.id]);
      if (c.is_degron === 'yes') {
        follow.append(el('h3','Depletion and its consequences'));
        follow.append(el('p','Match results to dose and time. A phenotype after depletion does not prove normal function before depletion.','notice'));
        for (const q of F.degron) question(follow,q,c.answers[q.id]);
      }
      article.append(follow);
      if (p.tags.length > 1) {
        const remove = el('button','Remove tag','secondary'); remove.type='button';
        remove.onclick=()=>{if(confirm('Remove this tag and its answers? Other tags will be kept.')){p.tags.splice(ti,1);save();render();}};
        article.append(remove);
      }
      section.append(article);
    });
    const add = el('button','Add tag'); add.type='button'; add.dataset.addTag=p.id;
    add.onclick=()=>{if(!room())return;p.tags.push(F.blankConstruct(nextTagId()));save();render();}; section.append(add);
    if (data.proteins.length > 1) {
      const remove = el('button','Remove protein','secondary'); remove.type='button';
      remove.onclick=()=>{if(confirm('Remove this protein and ALL its tags and answers? Export a draft first if needed.')){data.proteins.splice(pi,1);save();render();}};
      section.append(remove);
    }
    root.append(section);
  });
}
function download(final) {
  const out = structuredClone(data); out.annotated_at = new Date().toISOString(); out.export_kind = final ? 'final' : 'draft';
  const errors = F.validate(out,final);
  if (errors.length) {message('Cannot export:\n• '+errors.join('\n• '),true);return;}
  const url = URL.createObjectURL(new Blob([JSON.stringify(out,null,2)+'\n'], {type:'application/json'}));
  const a = el('a'); a.href=url;
  const safe = s => s.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,70) || 'unnamed';
  a.download=`${safe(out.annotator)}_${safe(out.paper.id)}_${out.purpose}_${F.VERSION}_${out.export_kind}_${out.annotated_at.slice(0,10)}.json`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  message(final ? 'Completed JSON download requested. Check your Downloads folder. Form validation is not scientific verification or reference locking.' : 'Draft download requested. Check your Downloads folder; incomplete drafts can be restored.');
}
$('next-details').onclick=()=>{
  const sections=[...document.querySelectorAll('details[data-tag-id]')];
  sections.forEach(section=>{section.open=true;});
  const first=sections[0];
  if(first){
    const summary=first.querySelector('summary');
    summary.focus();
    first.style.scrollMarginTop = ($('draft').closest('.toolbar').getBoundingClientRect().height + 16) + 'px';
    first.scrollIntoView({behavior:'smooth',block:'start'});
  }
};
$('draft').onclick=()=>download(false);
$('final').onclick=()=>download(true);
function allTags(){return data.proteins.flatMap(p=>p.tags);}
function room(){if(allTags().length>=100){message('Maximum 100 tag entries per paper.',true);return false;}return true;}
function nextTagId(){return 'construct-'+(Math.max(...allTags().map(c=>Number(c.id.split('-')[1])))+1);}
$('add').onclick=()=>{
  if(!room())return;
  const next=Math.max(...data.proteins.map(p=>Number(p.id.split('-')[1])))+1;
  data.proteins.push(F.blankProtein('protein-'+next,nextTagId()));save();render();
};
$('new').onclick=()=>{
  if(!confirm('Start a new paper? This replaces the current browser workspace. Export your current draft first.'))return;
  const next=F.blank();next.annotator=data.annotator;next.role=data.role;next.purpose=data.purpose;
  try {localStorage.setItem(KEY,JSON.stringify(next));}catch(e){message('Cannot start a new paper: '+e.message+'. Current record preserved.',true);return;}
  data=next;blocked=false;render();save();message('New paper started.');
};
$('restore').onclick=()=>$('restore-file').click();
$('restore-file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>5_000_000)throw new Error('File too large (maximum 5 MB).');
    const text=await file.text();
    const oldVersion=JSON.parse(text).schema_version==='fulltext-v2';
    const next=F.restore(text);
    const descriptor=`${next.purpose}; ${next.annotator || 'no annotator'}; ${next.paper.id || 'no paper ID'}`;
    if(!confirm(`Restore ${descriptor}? This replaces the current workspace. Export your current draft first. Continue?`))return;
    // Persist before replacing the in-memory record. Storage failure preserves both.
    next.export_kind='draft';
    localStorage.setItem(KEY,JSON.stringify(next));data=next;blocked=false;render();save();message(oldVersion ? 'Restored v2 as a v3 draft without losing answers. Each old record is a separate protein entry; no protein/tag relationships were guessed. Original file unchanged.' : 'Restored. Check paper, annotator and practice/evaluation mode before continuing.');
  }catch(e){message('Restore failed; current record unchanged.\n'+e.message,true);}
  finally{event.target.value='';}
};
try {
  const stored=localStorage.getItem(KEY);
  const old=stored===null ? localStorage.getItem(LEGACY_KEY) : null;
  if(stored!==null)data=F.restore(stored);
  else if(old!==null){
    data=F.restore(old);
    message('Loaded the previous v2 workspace as a v3 draft. Answers are preserved; each old record has its own protein entry. The original v2 browser data remains untouched.');
  }
}catch(e){blocked=true;message('Previous local record could not be loaded and has NOT been overwritten. Restore a valid export or explicitly start a new paper.\n'+e.message,true);}
render();
if(blocked)$('save-state').textContent='Local saving blocked; previous stored data preserved.';
else $('save-state').textContent='Local workspace ready. Changes save automatically; export backups regularly.';
