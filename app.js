'use strict';

const $ = (s) => document.querySelector(s);

// ---------- Storage: everything lives in localStorage (on this device only) ----------

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// [{ id, name, frontLabel, backLabel, cards: [{ id, front, back }] }]
let decks = load('decks', []);
const saveDecks = () => save('decks', decks);

// Published decks: same shape, read from published.json in the GitHub repo.
let published = load('publishedCache', []);
const findPublished = (id) => published.find((d) => d.id === id);
const isLocal = (d) => decks.includes(d);
const findDeck = (id) => decks.find((d) => d.id === id) || findPublished(id);
// Your own decks, then published decks you don't have a copy of.
const allDecks = () => [...decks, ...published.filter((p) => !decks.some((d) => d.id === p.id))];

// ---------- Publishing through the GitHub API ----------

// On https://<user>.github.io/<repo>/ the repo is <user>/<repo>; otherwise (e.g. localhost) the default.
const REPO = location.hostname.endsWith('.github.io')
  ? `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1]}`
  : 'eytant1/anki';
const FILE_API = `https://api.github.com/repos/${REPO}/contents/published.json`;
let token = load('githubToken', '');

const toB64 = (str) => {
  let bin = '';
  for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function github(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404 && !options.method) return null;
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).message || res.statusText;
    throw new Error(`GitHub: ${res.status} ${msg}`);
  }
  return res.json();
}

// Reads published.json, applies `change` to the list, and commits it back.
async function changePublished(change, message) {
  const file = await github(`${FILE_API}?ref=main`);
  const list = file ? JSON.parse(fromB64(file.content)) : [];
  const next = change(list);
  await github(FILE_API, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toB64(JSON.stringify(next, null, 2) + '\n'), sha: file?.sha, branch: 'main' }),
  });
  setPublished(next);
}

function setPublished(list) {
  published = Array.isArray(list) ? list : [];
  save('publishedCache', published);
}

// The owner reads straight from GitHub (the site lags a minute behind after
// publishing); everyone else reads the site's copy.
async function refreshPublished() {
  try {
    if (token) {
      const file = await github(`${FILE_API}?ref=main`);
      setPublished(file ? JSON.parse(fromB64(file.content)) : []);
    } else {
      const res = await fetch('published.json', { cache: 'no-cache' });
      if (res.ok) setPublished(await res.json());
    }
  } catch { return; } // offline: keep the cached copy
  if ($('#viewStudy').hidden) route();
}

// ---------- Routing: #/ , #/deck/<id> , #/study/<id> ----------

let deck = null;          // deck currently open
let editingCardId = null; // card being edited in the card form

function route() {
  const [, view, id] = location.hash.split('/');
  deck = id ? findDeck(id) : null;
  $('#viewDecks').hidden = true;
  $('#viewDeck').hidden = true;
  $('#viewStudy').hidden = true;

  if (deck && view === 'study') return showStudy();
  if (deck && view === 'deck') return showDeck();
  showDecks();
}

const go = (hash) => { location.hash = hash; };

// ---------- Decks list ----------

function showDecks() {
  $('#viewDecks').hidden = false;
  const ul = $('#decks');
  ul.innerHTML = '';
  const list = allDecks();
  if (!list.length) {
    ul.innerHTML = '<li class="empty">No decks yet. Tap “+ New deck” to make one.</li>';
    return;
  }
  for (const d of list) {
    const li = document.createElement('li');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = d.name;
    if (findPublished(d.id)) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Published';
      name.append(badge);
    }
    const small = document.createElement('small');
    small.textContent = `${d.frontLabel} → ${d.backLabel}`;
    name.append(small);
    name.onclick = () => go(`#/deck/${d.id}`);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${d.cards.length} card${d.cards.length === 1 ? '' : 's'}`;
    li.append(name, count);
    ul.append(li);
  }
}

$('#showNewDeck').onclick = () => {
  $('#newDeckForm').hidden = false;
  $('#deckName').focus();
};
$('#cancelNewDeck').onclick = () => {
  $('#newDeckForm').reset();
  $('#newDeckForm').hidden = true;
};
$('#newDeckForm').onsubmit = (e) => {
  e.preventDefault();
  const d = {
    id: newId(),
    name: $('#deckName').value.trim(),
    frontLabel: $('#deckFront').value.trim(),
    backLabel: $('#deckBack').value.trim(),
    cards: [],
  };
  if (!d.name || !d.frontLabel || !d.backLabel) return;
  decks.push(d);
  saveDecks();
  $('#newDeckForm').reset();
  $('#newDeckForm').hidden = true;
  go(`#/deck/${d.id}`);
};

$('#repoName').textContent = REPO;
$('#showSetup').onclick = () => {
  $('#setup').hidden = !$('#setup').hidden;
  $('#token').value = token;
  $('#setupStatus').textContent = token ? 'Publishing is set up on this phone.' : '';
};
$('#setupForm').onsubmit = async (e) => {
  e.preventDefault();
  const old = token;
  token = $('#token').value.trim();
  if (!token) return;
  $('#setupStatus').textContent = 'Checking…';
  try {
    await github(`https://api.github.com/repos/${REPO}`);
    save('githubToken', token);
    $('#setupStatus').textContent = 'Saved. Open one of your decks to publish it.';
    refreshPublished();
  } catch (err) {
    token = old;
    $('#setupStatus').textContent = `That token didn't work (${err.message}).`;
  }
};
$('#removeToken').onclick = () => {
  token = '';
  save('githubToken', '');
  $('#token').value = '';
  $('#setupStatus').textContent = 'Token removed from this phone.';
};

// ---------- One deck ----------

function showDeck() {
  $('#viewDeck').hidden = false;
  const mine = isLocal(deck);
  $('#deckTitle').textContent = deck.name;
  $('#deckFields').textContent = `${deck.frontLabel} → ${deck.backLabel}`;
  $('#frontLabel').textContent = deck.frontLabel;
  $('#backLabel').textContent = deck.backLabel;
  $('#study').disabled = !deck.cards.length;
  $('#renameDeck').hidden = !mine;
  $('#deleteDeck').hidden = !mine;
  $('#cardFormCard').hidden = !mine;
  $('#readOnlyBox').hidden = mine;
  renderPublish();
  renderCards();
}

function renderPublish() {
  const box = $('#publishBox');
  box.hidden = !token || !isLocal(deck);
  if (box.hidden) return;
  const pub = findPublished(deck.id);
  const same = pub && JSON.stringify(pub) === JSON.stringify(deck);
  $('#publishStatus').textContent = !pub ? 'Only on this phone' : same ? 'Published ✓' : 'Changes not published yet';
  $('#publish').hidden = same;
  $('#publish').textContent = pub ? 'Publish changes' : 'Publish';
  $('#unpublish').hidden = !pub;
}

async function publishAction(button, change, message) {
  const d = deck;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    await changePublished(change, message);
  } catch (err) {
    alert(`Couldn't update GitHub.\n${err.message}`);
  }
  button.disabled = false;
  button.textContent = label;
  if (deck === d && !$('#viewDeck').hidden) showDeck();
}

$('#publish').onclick = () => {
  const copy = JSON.parse(JSON.stringify(deck));
  const exists = !!findPublished(deck.id);
  publishAction(
    $('#publish'),
    (list) => (list.some((d) => d.id === copy.id) ? list.map((d) => (d.id === copy.id ? copy : d)) : [...list, copy]),
    `${exists ? 'Update' : 'Publish'} deck: ${copy.name}`
  );
};

$('#unpublish').onclick = () => {
  if (!confirm(`Unpublish “${deck.name}”? It stays on this phone, but others won't get it any more.`)) return;
  const id = deck.id;
  publishAction($('#unpublish'), (list) => list.filter((d) => d.id !== id), `Unpublish deck: ${deck.name}`);
};

// Same id, so the owner can edit a published deck from another phone and publish it back.
$('#copyDeck').onclick = () => {
  decks.push(JSON.parse(JSON.stringify(deck)));
  saveDecks();
  deck = findDeck(deck.id);
  showDeck();
};

function renderCards() {
  const mine = isLocal(deck);
  const n = deck.cards.length;
  $('#cardCount').textContent = `${n} card${n === 1 ? '' : 's'}`;
  const ul = $('#cards');
  ul.innerHTML = '';
  if (!n) {
    ul.innerHTML = '<li class="empty">No cards yet. Add one above.</li>';
    return;
  }
  for (const c of deck.cards) {
    const li = document.createElement('li');
    if (c.id === editingCardId) li.className = 'editing';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = c.front;
    const small = document.createElement('small');
    small.textContent = c.back;
    name.append(small);
    li.append(name);
    ul.append(li);
    if (!mine) continue;
    name.onclick = () => startEdit(c);
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete card');
    del.onclick = () => {
      if (!confirm(`Delete “${c.front}”?`)) return;
      deck.cards = deck.cards.filter((x) => x.id !== c.id);
      if (editingCardId === c.id) stopEdit();
      saveDecks();
      showDeck();
    };
    li.append(del);
  }
}

function startEdit(c) {
  editingCardId = c.id;
  $('#cardFront').value = c.front;
  $('#cardBack').value = c.back;
  $('#cardFormTitle').textContent = 'Edit card';
  $('#saveCard').textContent = 'Save';
  $('#cancelEdit').hidden = false;
  renderCards();
  $('#cardForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function stopEdit() {
  editingCardId = null;
  $('#cardForm').reset();
  $('#cardFormTitle').textContent = 'Add a card';
  $('#saveCard').textContent = 'Add';
  $('#cancelEdit').hidden = true;
}

$('#cancelEdit').onclick = () => { stopEdit(); renderCards(); };

$('#cardForm').onsubmit = (e) => {
  e.preventDefault();
  const front = $('#cardFront').value.trim();
  const back = $('#cardBack').value.trim();
  if (!front) return;
  const existing = deck.cards.find((c) => c.id === editingCardId);
  if (existing) {
    existing.front = front;
    existing.back = back;
    stopEdit();
  } else {
    deck.cards.push({ id: newId(), front, back });
    $('#cardForm').reset();
  }
  saveDecks();
  showDeck();
  $('#cardFront').focus();
};

$('#backToDecks').onclick = () => go('#/');
$('#study').onclick = () => go(`#/study/${deck.id}`);

$('#renameDeck').onclick = () => {
  const name = prompt('Deck name', deck.name);
  if (name === null) return;
  const front = prompt('Title field', deck.frontLabel);
  if (front === null) return;
  const back = prompt('Description field', deck.backLabel);
  if (back === null) return;
  deck.name = name.trim() || deck.name;
  deck.frontLabel = front.trim() || deck.frontLabel;
  deck.backLabel = back.trim() || deck.backLabel;
  saveDecks();
  showDeck();
};

$('#deleteDeck').onclick = () => {
  const note = findPublished(deck.id) ? ' It stays published; unpublish it first to remove it for everyone.' : '';
  if (!confirm(`Delete the deck “${deck.name}” and all its cards from this phone?${note}`)) return;
  decks = decks.filter((d) => d.id !== deck.id);
  saveDecks();
  go('#/');
};

// ---------- Study ----------
// Cards are shuffled. Tap shows the description. "Again" puts the card back
// a few places later; "Got it" removes it from this session.

let queue = [];
let revealed = false;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showStudy() {
  $('#viewStudy').hidden = false;
  queue = shuffle(deck.cards.map((c) => c.id));
  showCard();
}

function showCard() {
  // Drop cards deleted elsewhere.
  queue = queue.filter((id) => deck.cards.some((c) => c.id === id));
  const done = !queue.length;
  $('#flash').hidden = done;
  $('#answer').hidden = true;
  $('#finished').hidden = !done;
  $('#progress').textContent = done ? '' : `${queue.length} left`;
  if (done) return;

  const c = deck.cards.find((x) => x.id === queue[0]);
  revealed = false;
  $('#flashFrontLabel').textContent = deck.frontLabel;
  $('#flashFront').textContent = c.front;
  $('#flashBackLabel').textContent = deck.backLabel;
  $('#flashBack').textContent = c.back || '—';
  $('#flashBackWrap').hidden = true;
  $('#tapHint').hidden = false;
}

function reveal() {
  if (revealed || !queue.length) return;
  revealed = true;
  $('#flashBackWrap').hidden = false;
  $('#tapHint').hidden = true;
  $('#answer').hidden = false;
}

function answer(good) {
  if (!revealed) return;
  const id = queue.shift();
  if (!good) {
    // Show it again after a few other cards (or at the end if few remain).
    queue.splice(Math.min(3, queue.length), 0, id);
  }
  showCard();
}

$('#flash').onclick = reveal;
$('#again').onclick = () => answer(false);
$('#good').onclick = () => answer(true);
$('#restart').onclick = showStudy;
$('#finishedBack').onclick = () => go(`#/deck/${deck.id}`);
$('#endStudy').onclick = () => go(`#/deck/${deck.id}`);

// Keyboard: space/enter to reveal, 1 = again, 2 = got it.
document.addEventListener('keydown', (e) => {
  if ($('#viewStudy').hidden || e.target.matches('input, textarea')) return;
  if ((e.key === ' ' || e.key === 'Enter') && !revealed) { e.preventDefault(); reveal(); }
  else if (e.key === '1') answer(false);
  else if (e.key === '2' || ((e.key === ' ' || e.key === 'Enter') && revealed)) { e.preventDefault(); answer(true); }
});

// ---------- Start ----------

window.addEventListener('hashchange', () => { stopEdit(); route(); window.scrollTo(0, 0); });
route();
refreshPublished();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
