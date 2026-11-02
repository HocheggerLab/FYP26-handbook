/* Shared form definition and validation. No paper data or answers included. */
(function (root) {
  'use strict';
  const VERSION = 'fulltext-v3';
  const legacy = typeof module !== 'undefined' && module.exports ? require('./fulltext-v2-core.js') : root.FulltextV2;
  const statuses = ['answered', 'not_reported', 'unclear', 'source_unavailable'];
  const q = (id, label, help, choices = null, extra = []) => ({id, label, help, choices, statuses: [...statuses, ...extra]});
  const protein = q('protein', 'Which protein was tagged?', 'Use the protein name given in the paper. Include an isoform only if specified.');
  const core = [
    q('model', 'Organism and experimental model', 'Species, cell line/tissue and clone identifier if given.'),
    q('tags', 'Which tag was used?', 'Enter a combined tag such as mAID–GFP as one entry. Use Add tag for another separately tested tagged version of this protein.'),
    q('locus', 'Expression strategy', 'Describe this tagged version, not every experiment in the paper.', ['endogenous', 'exogenous']),
    q('targeting', 'Gene-targeting or expression method', 'For example CRISPR–Cas9 with HDR, homologous recombination, transfection or lentiviral integration. CRISPR use alone does not establish endogenous tagging.'),
    q('position', 'Tag position', 'Use Add tag for a separately tested version with a different tag position.', ['N-terminal', 'C-terminal', 'internal', 'both termini']),
    q('architecture', 'Fusion architecture and linker', 'Describe component order and linker sequence/length if reported. State which details are missing.'),
    q('alleles', 'Allele status', 'Record the reported genotype/copy status, including untagged copies, deleted alleles or mixed populations. Do not assume diploidy.', null, ['not_applicable']),
    q('donor', 'Targeting/expression construct availability', 'Give the donor map, sequence, plasmid identifier or repository location. A description is not necessarily a complete sequence.', ['described_here', 'available_elsewhere', 'described_here_and_elsewhere']),
    q('validation', 'Validation of the intended construct', 'Junction PCR, sequencing, immunoblot, etc. Explain what was checked, not just that the line exists.', null, ['not_tested']),
    q('function', 'Function of the tagged protein BEFORE depletion', 'Record assay → comparator → result. For non-degrons, assess the tagged protein under the conditions studied. Expression, localisation and survival alone do not establish normal function.', ['retained_in_assays_tested', 'impaired', 'mixed', 'inconclusive'], ['not_tested'])
  ];
  const degron = [
    q('induction', 'How was depletion induced?', 'Degrader, concentration, exposure time and required machinery/variant (for example OsTIR1 F74G).', null, ['not_tested']),
    q('measurement', 'How was depletion measured?', 'Immunoblot, microscopy, flow cytometry or proteomics; include comparator, normalisation and whether total protein or a local pool was measured.', null, ['not_tested']),
    q('efficiency', 'How efficient was depletion?', 'Reported % depleted OR % remaining, dose and time. Explicitly name which percentage is used. Preserve qualitative claims if no number is given; do not estimate from blot images.', ['quantified', 'qualitative_only'], ['not_tested']),
    q('kinetics', 'How quickly did depletion occur?', 'Reported time course or half-life. A single endpoint is not a half-life.', null, ['not_tested']),
    q('basal', 'Was there basal depletion without inducer?', 'Give the comparison, measurement and result. Lower abundance is not by itself proof of degradation.', ['detected', 'not_detected', 'inconclusive'], ['not_tested']),
    q('recovery', 'Did protein recover after washout?', 'Record washout conditions, recovery time and extent, if tested.', ['recovered', 'partially_recovered', 'not_recovered', 'inconclusive'], ['not_tested']),
    q('post_function', 'Functional assays AFTER depletion', 'Record assay → comparator → biological outcome. This does not show that the tag was harmless before depletion.', null, ['not_tested']),
    q('specificity', 'Was the phenotype linked specifically to target loss?', 'Describe controls and results: degradation-resistant rescue, inducer-treated untagged cells, inactive compound, etc. Do not transfer rescue evidence to a different construct.', null, ['not_tested'])
  ];
  const questions = [...core, ...degron];
  const sources = ['main_paper', 'supplement', 'cited_source', 'multiple_sources'];
  const blankAnswer = () => ({status: '', value: '', details: '', source: '', location: '', evidence: ''});
  const blankConstruct = (id) => ({id, label: '', is_degron: '', answers: Object.fromEntries(questions.map(x => [x.id, blankAnswer()]))});
  const blankProtein = (id, tagId) => ({id, identity: blankAnswer(), tags: [blankConstruct(tagId)]});
  const blank = () => ({schema_version: VERSION, stage: 'fulltext', export_kind: 'draft', annotated_at: new Date().toISOString(), annotator: '', role: 'student', purpose: 'practice', paper: {id: '', title: '', target: '', access: '', access_notes: ''}, proteins: [blankProtein('protein-1', 'construct-1')]});
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const keys = (x, expected) => object(x) && Object.keys(x).length === expected.length && expected.every(k => Object.hasOwn(x, k));
  function validate(d, final = false) {
    const errors = [];
    const fail = m => errors.push(m);
    if (!keys(d, ['schema_version','stage','export_kind','annotated_at','annotator','role','purpose','paper','proteins'])) return ['Invalid full-text file structure.'];
    if (d.schema_version !== VERSION || d.stage !== 'fulltext') fail('Wrong schema or stage; expected fulltext-v3. Abstract and fulltext-v1 files cannot be restored here.');
    if (!['draft','final'].includes(d.export_kind)) fail('Invalid export kind.');
    if (typeof d.annotated_at !== 'string' || !Number.isFinite(Date.parse(d.annotated_at))) fail('Invalid timestamp.');
    if (typeof d.annotator !== 'string' || d.annotator.length > 200) fail('Invalid annotator.');
    if (!['student','supervisor'].includes(d.role)) fail('Only independent human records can be restored here.');
    if (!['practice','evaluation'].includes(d.purpose)) fail('Invalid practice/evaluation purpose.');
    if (!keys(d.paper, ['id','title','target','access','access_notes']) || Object.values(d.paper).some(v => typeof v !== 'string' || v.length > 12000)) return [...errors, 'Invalid paper metadata.'];
    if (!['','complete','partial','unavailable'].includes(d.paper.access)) fail('Invalid source access.');
    if (!Array.isArray(d.proteins) || d.proteins.length < 1 || d.proteins.length > 100) return [...errors, 'Expected 1–100 protein entries.'];
    const ids = new Set();
    const proteinIds = new Set();
    let total = 0;
    for (const [pi,p] of d.proteins.entries()) {
      if (!keys(p, ['id','identity','tags']) || typeof p.id !== 'string' || !/^protein-[1-9][0-9]*$/.test(p.id) || !Array.isArray(p.tags) || p.tags.length < 1 || p.tags.length > 100) {fail('Invalid protein entry.'); continue;}
      if (proteinIds.has(p.id)) fail('Duplicate protein ID.');
      proteinIds.add(p.id); total += p.tags.length;
      checkAnswer(protein, p.identity, `Protein ${pi+1}`, final, false);
      for (const [i,c] of p.tags.entries()) {
      const prefix = `Protein ${pi+1}, tag ${i+1}`;
      if (!keys(c,['id','label','is_degron','answers']) || typeof c.id !== 'string' || !/^construct-[1-9][0-9]*$/.test(c.id) || typeof c.label !== 'string' || c.label.length > 1000) { fail(`${prefix}: invalid structure.`); continue; }
      if (ids.has(c.id)) fail('Duplicate construct ID.');
      ids.add(c.id);
      if (!['','yes','no','unclear'].includes(c.is_degron)) fail(`${prefix}: invalid degron choice.`);
      if (!keys(c.answers, questions.map(q => q.id))) { fail(`${prefix}: missing or unknown question fields.`); continue; }
      for (const field of questions) {
        const a = c.answers[field.id];
        const name = `${prefix} — ${field.label}`;
        const active = core.includes(field) || c.is_degron === 'yes';
        const valid = checkAnswer(field, a, name, final && active, field.id !== 'tags');
        if (valid && c.is_degron !== 'yes' && degron.includes(field) && Object.values(a).some(Boolean)) fail(`${name}: inactive degron answers must be empty.`);
      }
      if (final && !c.is_degron) fail(`${prefix}: answer whether this tag is a degron.`);
      }
    }
    if (total > 100) fail('Maximum 100 tag entries per paper.');
    function checkAnswer(field, a, name, completed, requireEvidence) {
      if (!keys(a,['status','value','details','source','location','evidence']) || Object.values(a).some(v => typeof v !== 'string' || v.length > 12000)) {fail(`${name}: invalid answer structure.`); return false;}
      if (a.status && !field.statuses.includes(a.status)) fail(`${name}: invalid status.`);
      if (a.source && !sources.includes(a.source)) fail(`${name}: invalid source.`);
      if (field.choices && a.value && !field.choices.includes(a.value)) fail(`${name}: invalid choice.`);
      if (a.status !== 'answered' && a.value) fail(`${name}: answer value requires status answered.`);
      if (completed) {
        if (!a.status) fail(`${name}: choose an answer status or enter a name.`);
        if (a.status === 'answered' && !a.value.trim()) fail(`${name}: give an answer.`);
        if (a.status === 'answered' && requireEvidence && (!a.evidence.trim() || !a.location.trim() || !a.source)) fail(`${name}: provide evidence, its source and location.`);
        if (a.status === 'answered' && field.choices && !a.details.trim()) fail(`${name}: describe the supporting experiment or tagging details.`);
        if (a.status && a.status !== 'answered' && !a.details.trim()) fail(`${name}: explain the uncertainty, absence, or inapplicability and where you checked.`);
      }
      return true;
    }
    if (final) {
      if (!d.annotator.trim()) fail('Enter your name.');
      if (!d.paper.id.trim() || !d.paper.title.trim() || !d.paper.target.trim() || !d.paper.access) fail('Complete the paper identifier, title, target and source access.');
      if (d.paper.access !== 'complete' && !d.paper.access_notes.trim()) fail('Explain missing source material.');
    }
    return errors;
  }
  function restore(text) {
    if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('File too large (maximum 5 MB).');
    let data = JSON.parse(text);
    if (data && data.schema_version === 'fulltext-v2') {
      const old = legacy.restore(text);
      const {constructs, ...metadata} = old;
      data = {...metadata, schema_version: VERSION, export_kind: 'draft', proteins: constructs.map((c,i) => {
        const {protein: identity, ...answers} = c.answers;
        return {id: 'protein-'+(i+1), identity, tags: [{...c, answers}]};
      })};
    }
    const errors = validate(data, data && data.export_kind === 'final');
    if (errors.length) throw new Error(errors.join('\n'));
    return data;
  }
  const api = {VERSION, protein, core, degron, questions, sources, blankAnswer, blankConstruct, blankProtein, blank, validate, restore};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Fulltext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
