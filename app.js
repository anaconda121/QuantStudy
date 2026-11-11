const DATA = window.QUESTION_DATA || [];
const answerOverrides = { 'quantable-2726': '5.187', 'quantable-2803': '2002', 'quantable-3131': '159880', 'a4Zb0oeHNXY9HeJachNZ': '0.1054981993' };
DATA.forEach(question => { if (answerOverrides[question.id]) question.answer = answerOverrides[question.id]; });
const COURSES = window.COURSE_DATA || [];
const GUIDANCE_ENABLED = false;
const KEY = 'quantguide-local-progress-v1';
const DB_NAME = 'quantguide-local-db';
const DB_VERSION = 2;

let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
const state = {
  view: 'dashboard', query: '', topic: 'all', difficulty: 'all', source: 'all',
  questionType: '', tag: '', selected: null, selectedCourse: null, tab: 'prompt',
  answerDraft: {}, answerFeedback: {}, correctAttempts: {}, incorrectAttempts: {}, ...saved,
};
const app = document.querySelector('#app');
const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const richContent = (html, fallback = '') => html || esc(fallback).replace(/\n/g, '<br>');
const sourceNames = ['QuantGuide', 'Quantable'];
const sourceClass = source => source.toLowerCase().replace(/[^a-z]/g, '');
const qSources = q => q.sources?.length ? q.sources : ['QuantGuide'];
const conceptTags = [...new Set(DATA.flatMap(q => q.tags || []).filter(tag => tag.startsWith('Concept: ')))].sort();
const allTags = [...new Set(DATA.flatMap(q => q.tags || []))].sort();
const topics = [...new Set(DATA.map(q => q.topic))].sort();
const difficulties = [...new Set(DATA.map(q => q.difficulty).filter(Boolean))].sort((a, b) => ({ easy: 1, medium: 2, hard: 3, extreme: 4 }[a] || 9) - ({ easy: 1, medium: 2, hard: 3, extreme: 4 }[b] || 9));

function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  state.selected = params.get('question') || null; state.selectedCourse = params.get('course') || null;
  if (state.selected) state.selectedCourse = null; if (state.selectedCourse) state.selected = null;
  if (params.get('view')) state.view = params.get('view'); if (params.has('query')) state.query = params.get('query') || '';
  if (params.has('topic')) state.topic = params.get('topic') || 'all'; if (params.has('difficulty')) state.difficulty = params.get('difficulty') || 'all';
  if (params.has('source')) state.source = params.get('source') || 'all'; if (params.has('questionType')) state.questionType = params.get('questionType') || '';
  if (params.has('tag')) state.tag = params.get('tag') || '';
}
function syncHash() {
  const params = new URLSearchParams();
  if (state.selected) params.set('question', state.selected); else if (state.selectedCourse) params.set('course', state.selectedCourse); else {
    params.set('view', state.view); if (state.query) params.set('query', state.query); if (state.topic !== 'all') params.set('topic', state.topic);
    if (state.difficulty !== 'all') params.set('difficulty', state.difficulty); if (state.source !== 'all') params.set('source', state.source);
    if (state.questionType) params.set('questionType', state.questionType); if (state.tag) params.set('tag', state.tag);
  }
  history.replaceState(null, '', `#${params.toString()}`);
}
readHash();

let db;
const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains('progress')) database.createObjectStore('progress', { keyPath: 'id' });
    if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const persist = () => {
  const snapshot = {
    version: 2,
    savedAt: Date.now(),
    completed: state.completed || {}, favorites: state.favorites || {}, notes: state.notes || {},
    ratings: state.ratings || {}, attempts: state.attempts || {}, answers: state.answerDraft || {},
    answerFeedback: state.answerFeedback || {}, correctAttempts: state.correctAttempts || {},
    incorrectAttempts: state.incorrectAttempts || {},
  };
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* IndexedDB remains the fallback */ }
  fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot), keepalive: true }).catch(() => {});
  if (!db) return;
  const transaction = db.transaction(['progress', 'snapshots'], 'readwrite');
  transaction.objectStore('snapshots').put({ id: 'latest', snapshot });
  const store = transaction.objectStore('progress');
  DATA.forEach(q => store.put({
    id: q.id, completed: !!snapshot.completed[q.id], favorite: !!snapshot.favorites[q.id],
    note: snapshot.notes[q.id] || '', rating: snapshot.ratings[q.id] || '', answer: snapshot.answers[q.id] || '',
    feedback: snapshot.answerFeedback[q.id] || '', attempts: snapshot.attempts[q.id] || 0,
    correct: snapshot.correctAttempts[q.id] || 0, incorrect: snapshot.incorrectAttempts[q.id] || 0,
    updatedAt: snapshot.savedAt,
  }));
};
const hydrateDB = async () => {
  try {
    db = await openDB();
    const storedSnapshot = await new Promise((resolve, reject) => { const request = db.transaction('snapshots').objectStore('snapshots').get('latest'); request.onsuccess = () => resolve(request.result?.snapshot); request.onerror = () => reject(request.error); });
    if (storedSnapshot?.savedAt > (saved.savedAt || 0)) saved = storedSnapshot;
    const hasSnapshot = Boolean(saved.savedAt);
    const rows = await new Promise((resolve, reject) => { const request = db.transaction('progress').objectStore('progress').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    state.completed ??= {}; state.favorites ??= {}; state.notes ??= {}; state.ratings ??= {}; state.answerDraft ??= {}; state.attempts ??= {}; state.correctAttempts ??= {}; state.incorrectAttempts ??= {};
    state.answerFeedback ??= {};
    Object.assign(state, saved);
    state.answerDraft = saved.answers || state.answerDraft;
    if (!hasSnapshot) rows.forEach(row => { state.completed[row.id] = row.completed; state.favorites[row.id] = row.favorite; state.notes[row.id] = row.note; state.ratings[row.id] = row.rating; state.answerDraft[row.id] = row.answer || ''; state.answerFeedback[row.id] = row.feedback || ''; state.attempts[row.id] = row.attempts || 0; state.correctAttempts[row.id] = row.correct || 0; state.incorrectAttempts[row.id] = row.incorrect || 0; });
    persist(); render();
  } catch { /* localStorage remains the fallback */ }
};

const completed = () => Object.values(state.completed || {}).filter(Boolean).length;
const qStatus = q => state.completed?.[q.id] ? 'done' : state.ratings?.[q.id] === 'review' ? 'review' : '';
const difficultyChip = difficulty => `<span class="chip ${esc(difficulty)}">${esc(difficulty)}</span>`;
const sourceChips = q => qSources(q).map(source => `<span class="source-chip ${sourceClass(source)}">${esc(source)}</span>`).join('');
const selectedConcepts = q => (q.tags || []).filter(tag => tag.startsWith('Concept: ')).map(tag => tag.replace(/^Concept: /, ''));
const hasTag = (q, tag) => (q.tags || []).includes(tag);
const filtered = () => DATA.filter(q => { const search = `${q.title} ${q.topic} ${(q.tags || []).join(' ')} ${(q.companies || []).join(' ')}`.toLowerCase(); return (!state.query || search.includes(state.query.toLowerCase())) && (state.topic === 'all' || q.topic === state.topic) && (state.difficulty === 'all' || q.difficulty === state.difficulty) && (state.source === 'all' || qSources(q).includes(state.source)) && (!state.tag || hasTag(q, state.tag)); });
const questionRow = q => `<div class="q-row"><span class="status ${qStatus(q)}"></span><div class="q-main"><div class="q-title">${esc(q.title)}</div><div class="q-meta">${difficultyChip(q.difficulty)}${sourceChips(q)}<span class="plain">${esc(q.topic)}</span>${selectedConcepts(q).slice(0, 2).map(tag => `<span class="plain">· ${esc(tag)}</span>`).join('')}</div></div><button class="btn alt" data-open="${esc(q.id)}">${state.completed?.[q.id] ? 'Review' : 'Open'}</button></div>`;
const progressRows = () => topics.map(topic => { const all = DATA.filter(q => q.topic === topic).length; const done = DATA.filter(q => q.topic === topic && state.completed?.[q.id]).length; return `<div class="progress-row"><div class="progress-label"><span>${esc(topic)}</span><span>${done} / ${all}</span></div><div class="bar"><i style="width:${all ? done / all * 100 : 0}%"></i></div></div>`; }).join('');

function layout(content) {
  syncHash();
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><span class="mark">∑</span><span>QuantStudy<br>Local</span></div><nav class="nav"><button class="${state.view === 'dashboard' && !state.selected && !state.selectedCourse ? 'active' : ''}" data-view="dashboard"><span class="nav-icon">⌂</span>Dashboard</button><button class="${state.view === 'library' && !state.selected ? 'active' : ''}" data-view="library"><span class="nav-icon">▤</span>Question library</button><button class="${state.view === 'types' ? 'active' : ''}" data-view="types"><span class="nav-icon">◈</span>Question types</button><button class="${state.view === 'tags' ? 'active' : ''}" data-view="tags"><span class="nav-icon">#</span>Tags & sources</button><button class="${state.view === 'courses' || state.selectedCourse ? 'active' : ''}" data-view="courses"><span class="nav-icon">▥</span>Courses</button><button class="${state.view === 'progress' ? 'active' : ''}" data-view="progress"><span class="nav-icon">↗</span>Progress</button></nav><div class="side-footer">LOCAL MODE<br>Progress is saved in this browser<br><br>${DATA.length.toLocaleString()} retained questions<br>${COURSES.length} course lessons</div></aside><main class="main"><header class="topbar"><span class="crumb">Study workspace / ${esc(state.selectedCourse ? 'courses' : state.view)}</span><div class="profile"><span>Personal practice</span><span class="avatar">P</span></div></header>${content}</main></div>`;
  bind();
}

function dashboard() {
  const recent = DATA.filter(q => state.completed?.[q.id]).slice(-5).reverse();
  const sourceStats = sourceNames.map(source => `<span class="source-stat"><i class="source-dot ${sourceClass(source)}"></i>${source} <b>${DATA.filter(q => qSources(q).includes(source)).length.toLocaleString()}</b></span>`).join('');
  return `<div class="wrap"><div class="hero"><div><div class="eyebrow">Your practice desk</div><h1>Build sharper instincts.</h1><p>A quiet, local home for QuantGuide and Quantable problem solving.</p></div><div class="hero-actions"><button class="btn coral" data-random="true">Start a random question →</button><button class="btn alt" data-view="courses">Open Quantable courses →</button></div></div><div class="source-summary">${sourceStats}</div><div class="grid"><div class="card stat"><span class="label">Questions completed</span><span class="num">${completed()}</span><span class="delta">${DATA.length ? Math.round(completed() / DATA.length * 100) : 0}% of retained archive</span></div><div class="card stat"><span class="label">In your review queue</span><span class="num">${Object.values(state.ratings || {}).filter(value => value === 'review').length}</span><span class="delta">Revisit the edges</span></div><div class="card stat"><span class="label">Favorites</span><span class="num">${Object.values(state.favorites || {}).filter(Boolean).length}</span><span class="delta">Your personal set</span></div><div class="card stat"><span class="label">Archive size</span><span class="num">${DATA.length.toLocaleString()}</span><span class="delta">${COURSES.length} lessons alongside it</span></div></div><div class="columns"><section><div class="section-head"><h2>Coverage by discipline</h2><span>completion</span></div><div class="card">${progressRows()}</div></section><section><div class="section-head"><h2>Continue practicing</h2><span>${recent.length ? 'recent' : 'start here'}</span></div><div class="card mini-list">${recent.length ? recent.map(q => `<div class="mini-item"><span>${esc(q.title)}</span><button class="btn alt" data-open="${esc(q.id)}">Open</button></div>`).join('') : '<div class="empty">Your completed questions will appear here.</div>'}</div></section></div></div>`;
}

function library() {
  const matches = filtered();
  return `<div class="wrap"><div class="hero"><div><div class="eyebrow">The merged archive</div><h1>Question library</h1><p>Search prompts, firms, concepts, and both downloaded sources.</p></div><span class="muted">${matches.length.toLocaleString()} matches</span></div><div class="library-tools"><input class="search" id="query" value="${esc(state.query)}" placeholder="Search by title, tag, or company…"><select class="select" id="source"><option value="all">All sources</option>${sourceNames.map(source => `<option value="${esc(source)}" ${state.source === source ? 'selected' : ''}>${esc(source)}</option>`).join('')}</select><select class="select" id="topic"><option value="all">All disciplines</option>${topics.map(topic => `<option value="${esc(topic)}" ${state.topic === topic ? 'selected' : ''}>${esc(topic)}</option>`).join('')}</select><select class="select" id="difficulty"><option value="all">Any difficulty</option>${difficulties.map(difficulty => `<option value="${esc(difficulty)}" ${state.difficulty === difficulty ? 'selected' : ''}>${esc(difficulty)}</option>`).join('')}</select></div><div class="question-list">${matches.length ? matches.slice(0, 100).map(questionRow).join('') : '<div class="card empty">No questions match those filters.</div>'}</div>${matches.length > 100 ? '<p class="muted list-note">Showing first 100 matches. Narrow the search to explore further.</p>' : ''}</div>`;
}

function typesView() {
  const matches = DATA.filter(q => (state.difficulty === 'all' || q.difficulty === state.difficulty) && (!state.questionType || hasTag(q, state.questionType)));
  return `<div class="wrap"><div class="hero"><div><div class="eyebrow">Targeted practice</div><h1>Question types</h1><p>Focus on the interview techniques behind each problem.</p></div><span class="muted">${matches.length.toLocaleString()} matches</span></div><div class="card type-filter"><div class="filter-title">Difficulty</div><div class="filter-pills">${['all', ...difficulties].map(difficulty => `<button class="${state.difficulty === difficulty ? 'selected' : ''}" data-difficulty="${esc(difficulty)}">${difficulty === 'all' ? 'All difficulties' : esc(difficulty[0].toUpperCase() + difficulty.slice(1))}</button>`).join('')}</div><div class="filter-title">Concept</div><div class="filter-pills">${['', ...conceptTags].map(tag => `<button class="${state.questionType === tag ? 'selected' : ''}" data-question-type="${esc(tag)}">${tag ? '# ' + esc(tag.replace(/^Concept: /, '')) : 'All concepts'}</button>`).join('')}</div></div><div class="question-list list-spaced">${matches.slice(0, 100).map(questionRow).join('') || '<div class="card empty">No questions match those filters.</div>'}</div></div>`;
}

function tagsView() {
  const groups = ['Source', 'Discipline', 'Concept', 'Firm'];
  const current = state.tag === '__review' ? DATA.filter(q => state.ratings?.[q.id] === 'review') : state.tag === '__favorites' ? DATA.filter(q => state.favorites?.[q.id]) : state.tag ? DATA.filter(q => hasTag(q, state.tag)) : DATA;
  return `<div class="wrap"><div class="hero"><div><div class="eyebrow">Organize your reps</div><h1>Tags & sources</h1><p>Every retained question has a source, discipline, and normalized concept tags.</p></div></div><div class="card"><div class="tag-cloud utility-tags"><button data-tag="">All questions · ${DATA.length.toLocaleString()}</button><button data-tag="__review">Review queue · ${Object.values(state.ratings || {}).filter(value => value === 'review').length}</button><button data-tag="__favorites">Favorites · ${Object.values(state.favorites || {}).filter(Boolean).length}</button></div>${groups.map(group => `<div class="tag-group"><div class="filter-title">${group}</div><div class="tag-cloud">${allTags.filter(tag => tag.startsWith(`${group}: `)).map(tag => `<button class="${state.tag === tag ? 'selected' : ''}" data-tag="${esc(tag)}">${esc(tag.replace(`${group}: `, ''))}</button>`).join('')}</div></div>`).join('')}</div><div class="section-head"><h2>${state.tag === '__review' ? 'Review queue' : state.tag === '__favorites' ? 'Favorites' : state.tag || 'Browse all'}</h2><span>${current.length.toLocaleString()} questions</span></div><div class="question-list">${current.slice(0, 100).map(questionRow).join('') || '<div class="card empty">Nothing here yet.</div>'}</div></div>`;
}

function progressView() {
  const reviewed = DATA.filter(q => state.ratings?.[q.id]); const good = reviewed.filter(q => state.ratings[q.id] === 'good').length;
  const attempts = Object.values(state.attempts || {}).reduce((sum, value) => sum + value, 0); const correct = Object.values(state.correctAttempts || {}).reduce((sum, value) => sum + value, 0); const wrong = Object.values(state.incorrectAttempts || {}).reduce((sum, value) => sum + value, 0);
  return `<div class="wrap"><div class="hero"><div><div class="eyebrow">Your signal</div><h1>Progress that means something.</h1><p>Every submission is tracked locally across the merged archive.</p></div></div><div class="grid"><div class="card stat"><span class="label">Total attempts</span><span class="num">${attempts}</span><span class="delta">${Object.keys(state.attempts || {}).length} questions tried</span></div><div class="card stat"><span class="label">Correct</span><span class="num">${correct}</span><span class="delta">Auto-completed when right</span></div><div class="card stat"><span class="label">Incorrect</span><span class="num">${wrong}</span><span class="delta">Use these for review</span></div><div class="card stat"><span class="label">Graded accuracy</span><span class="num">${correct + wrong ? Math.round(correct / (correct + wrong) * 100) : 0}%</span><span class="delta">${completed()} completed total</span></div></div><div class="columns"><div class="card"><div class="section-head section-tight"><h2>Practice volume</h2><span>last 8 sessions</span></div><div class="chart">${[18, 32, 28, 45, 38, 61, 55, attempts ? Math.min(100, attempts * 7) : 20].map((height, index) => `<i class="barcol" style="height:${height}%" title="Session ${index + 1}"></i>`).join('')}</div><div class="legend"><span>older</span><span>now</span></div></div><div class="card"><div class="section-head section-tight"><h2>Confidence ratings</h2></div><div class="stat"><span class="num">${reviewed.length ? Math.round(good / reviewed.length * 100) : 0}%</span><span class="label">${good} confident of ${reviewed.length} rated</span><span class="delta">Keep rating honestly</span></div></div></div><div class="section-head"><h2>Coverage by discipline</h2></div><div class="card">${progressRows()}</div></div>`;
}

function coursesView() {
  const tracks = [...new Set(COURSES.map(course => course.track))];
  return `<div class="wrap"><div class="hero"><div><div class="eyebrow">Quantable courses</div><h1>Learn the machinery.</h1><p>Original Quantable course lessons, kept as a separate reader with rendered LaTeX and lesson navigation.</p></div><span class="muted">${COURSES.length} lessons</span></div><div class="course-catalog">${tracks.map(track => `<section><div class="section-head"><h2>${esc(track)}</h2><span>${COURSES.filter(course => course.track === track).length} lessons</span></div><div class="card course-list">${COURSES.filter(course => course.track === track).sort((a, b) => a.order - b.order).map(course => `<button class="course-row" data-course="${esc(course.id)}"><span class="course-number">${String(course.order).padStart(2, '0')}</span><span class="course-title"><b>${esc(course.title)}</b><small>${esc(course.order === 0 ? 'Course overview' : 'Lesson ' + course.order)}</small></span><span class="course-arrow">→</span></button>`).join('')}</div></section>`).join('')}</div></div>`;
}

function courseDetail(course) {
  const siblings = COURSES.filter(item => item.track === course.track).sort((a, b) => a.order - b.order); const index = siblings.findIndex(item => item.id === course.id); const previous = siblings[index - 1]; const next = siblings[index + 1];
  return `<div class="wrap course-wrap"><button class="back" data-view="courses">← Back to courses</button><div class="course-heading"><div><div class="eyebrow">${esc(course.track)} · lesson ${String(course.order).padStart(2, '0')}</div><h1>${esc(course.title)}</h1><p>Quantable course material · ${index + 1} of ${siblings.length}</p></div><div class="course-nav"><button class="btn alt" ${previous ? `data-course="${esc(previous.id)}"` : 'disabled'}>← Previous</button><button class="btn" ${next ? `data-course="${esc(next.id)}"` : 'disabled'}>Next →</button></div></div><div class="course-layout"><aside class="card course-sidebar"><div class="eyebrow">${esc(course.track)}</div>${siblings.map(item => `<button class="lesson-link ${item.id === course.id ? 'active' : ''}" data-course="${esc(item.id)}"><span>${String(item.order).padStart(2, '0')}</span>${esc(item.title)}</button>`).join('')}</aside><article class="course-card"><div class="course-lesson">${richContent(course.html, course.text)}</div></article></div></div>`;
}

function detail(q) {
  state.tab = 'prompt';
  const feedback = state.answerFeedback?.[q.id]; const content = richContent(q.promptHtml, q.prompt || 'Prompt content unavailable in this snapshot.');
  const manualAnswer = !q.answerCheckable ? '<p class="manual-answer">This snapshot does not expose a reliable numeric answer key. Your attempt can still be saved locally.</p>' : '';
  const guidanceControls = GUIDANCE_ENABLED ? `<button class="tab" data-tab="hint">Hint</button><button class="tab" data-tab="solution">Solution</button>` : `<button class="tab tab-locked" disabled title="Hints are disabled in this local build">Hint <span>Disabled</span></button><button class="tab tab-locked" disabled title="Solutions are disabled in this local build">Solution <span>Disabled</span></button>`;
  return `<div class="wrap"><button class="back" data-view="library">← Back to library</button><div class="hero"><div><div class="eyebrow">${sourceChips(q)} · ${esc(q.topic)}${q.companies?.length ? ' · ' + esc(q.companies.slice(0, 2).join(' · ')) : ''}</div><h1>${esc(q.title)}</h1><p>${difficultyChip(q.difficulty)} ${q.tags.filter(tag => tag.startsWith('Concept: ')).slice(0, 6).map(tag => `<span class="chip">${esc(tag.replace(/^Concept: /, ''))}</span>`).join(' ')}</p></div><button class="btn alt" data-favorite="${esc(q.id)}">${state.favorites?.[q.id] ? '★ Favorited' : '☆ Favorite'}</button></div><div class="study-layout"><aside class="card"><div class="eyebrow">Session controls</div><h3>How did it go?</h3><p class="muted session-copy">Mark this question as you finish. Ratings feed the progress view and review queue.</p><button class="btn" style="width:100%;margin:8px 0" data-rate="good">Got it</button><button class="btn alt" style="width:100%;margin:0 0 8px" data-rate="review">Needs another pass</button><button class="btn alt" style="width:100%" data-complete="true">${state.completed?.[q.id] ? 'Completed ✓' : 'Mark complete'}</button><div class="section-head"><h2>My notes</h2><span>autosaved</span></div><textarea class="notes" id="notes" placeholder="Capture the trick, the mistake, or a cleaner solution…">${esc(state.notes?.[q.id] || '')}</textarea></aside><article class="study-card"><div class="tabbar"><button class="tab active" data-tab="prompt">Prompt</button>${guidanceControls}</div><div class="prompt">${content}</div><form class="answer-form" id="answer-form"><input class="answer" id="answer" value="${esc(state.answerDraft?.[q.id] || '')}" placeholder="Type your answer…"><button class="btn" type="submit">Submit answer</button></form>${manualAnswer}${feedback ? `<div class="answer-feedback">${esc(feedback)}</div>` : ''}</article></div></div>`;
}

function render() {
  if (state.selected) { const question = DATA.find(item => item.id === state.selected); return layout(question ? detail(question) : library()); }
  if (state.selectedCourse) { const course = COURSES.find(item => item.id === state.selectedCourse); return layout(course ? courseDetail(course) : coursesView()); }
  return layout(state.view === 'library' ? library() : state.view === 'types' ? typesView() : state.view === 'tags' ? tagsView() : state.view === 'courses' ? coursesView() : state.view === 'progress' ? progressView() : dashboard());
}

const ANSWER_TOLERANCE = 0.01;
function numericAnswer(value) { const text = String(value || '').trim().replace(/,/g, ''); if (!text) return NaN; if (/^[-+]?\d+(?:\.\d+)?\s*\/\s*[-+]?\d+(?:\.\d+)?$/.test(text)) { const [a, b] = text.split('/').map(Number); return b ? a / b : NaN; } return Number(text); }
function bind() {
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { state.view = button.dataset.view; state.selected = null; state.selectedCourse = null; state.tag = ''; if (state.view !== 'types') state.questionType = ''; render(); });
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => window.open(`${location.href.split('#')[0]}#question=${encodeURIComponent(button.dataset.open)}`, '_blank', 'noopener'));
  document.querySelectorAll('[data-course]').forEach(button => button.onclick = () => { state.selectedCourse = button.dataset.course; state.selected = null; state.view = 'courses'; render(); });
  document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { state.tab = button.dataset.tab; render(); });
  document.querySelectorAll('[data-tag]').forEach(button => button.onclick = () => { state.view = 'tags'; state.tag = button.dataset.tag; render(); });
  document.querySelectorAll('[data-difficulty]').forEach(button => button.onclick = () => { state.view = 'types'; state.difficulty = button.dataset.difficulty; render(); });
  document.querySelectorAll('[data-question-type]').forEach(button => button.onclick = () => { state.view = 'types'; state.questionType = button.dataset.questionType; render(); });
  document.querySelector('#query')?.addEventListener('input', event => {
    const cursor = event.target.selectionStart;
    state.query = event.target.value;
    render();
    const input = document.querySelector('#query');
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  });
  document.querySelector('#source')?.addEventListener('change', event => { state.source = event.target.value; render(); }); document.querySelector('#topic')?.addEventListener('change', event => { state.topic = event.target.value; render(); }); document.querySelector('#difficulty')?.addEventListener('change', event => { state.difficulty = event.target.value; render(); });
  document.querySelector('[data-random]')?.addEventListener('click', () => { state.selected = DATA[Math.floor(Math.random() * DATA.length)].id; state.selectedCourse = null; state.tab = 'prompt'; render(); });
  document.querySelector('[data-favorite]')?.addEventListener('click', event => { state.favorites ??= {}; state.favorites[event.currentTarget.dataset.favorite] = !state.favorites[event.currentTarget.dataset.favorite]; persist(); render(); });
  document.querySelector('[data-complete]')?.addEventListener('click', () => { state.completed ??= {}; state.completed[state.selected] = true; persist(); render(); });
  document.querySelectorAll('[data-rate]').forEach(button => button.onclick = () => { state.ratings ??= {}; state.ratings[state.selected] = button.dataset.rate; state.completed ??= {}; state.completed[state.selected] = true; persist(); render(); });
  document.querySelector('#notes')?.addEventListener('input', event => { state.notes ??= {}; state.notes[state.selected] = event.target.value; persist(); }); document.querySelector('#answer')?.addEventListener('input', event => { state.answerDraft ??= {}; state.answerDraft[state.selected] = event.target.value; persist(); });
  document.querySelector('#answer-form')?.addEventListener('submit', event => { event.preventDefault(); const question = DATA.find(item => item.id === state.selected); const answer = document.querySelector('#answer').value.trim(); state.answerDraft ??= {}; state.answerFeedback ??= {}; state.attempts ??= {}; state.correctAttempts ??= {}; state.incorrectAttempts ??= {}; state.ratings ??= {}; state.answerDraft[state.selected] = answer; state.attempts[state.selected] = (state.attempts[state.selected] || 0) + 1; if (question?.answerCheckable) { const right = Math.abs(numericAnswer(answer) - numericAnswer(question.answer)) <= ANSWER_TOLERANCE; if (right) { state.correctAttempts[state.selected] = (state.correctAttempts[state.selected] || 0) + 1; state.completed ??= {}; state.completed[state.selected] = true; state.ratings[state.selected] = 'good'; state.answerFeedback[state.selected] = 'Correct — this problem is now marked completed.'; } else { state.incorrectAttempts[state.selected] = (state.incorrectAttempts[state.selected] || 0) + 1; state.answerFeedback[state.selected] = 'Incorrect. Your attempt was saved; try again or add it to your review queue.'; } } else state.answerFeedback[state.selected] = 'Attempt saved, but this snapshot has no reliable numeric answer key for automatic grading.'; persist(); render(); });
}
window.addEventListener('hashchange', () => { readHash(); render(); });
render();
hydrateDB();
