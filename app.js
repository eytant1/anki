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
const findDeck = (id) => decks.find((d) => d.id === id);

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
  if (!decks.length) {
    ul.innerHTML = '<li class="empty">No decks yet. Tap “+ New deck” to make one.</li>';
    return;
  }
  for (const d of decks) {
    const li = document.createElement('li');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = d.name;
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

// ---------- One deck ----------

function showDeck() {
  $('#viewDeck').hidden = false;
  $('#deckTitle').textContent = deck.name;
  $('#deckFields').textContent = `${deck.frontLabel} → ${deck.backLabel}`;
  $('#frontLabel').textContent = deck.frontLabel;
  $('#backLabel').textContent = deck.backLabel;
  $('#study').disabled = !deck.cards.length;
  renderCards();
}

function renderCards() {
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
    li.append(name, del);
    ul.append(li);
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
  if (!confirm(`Delete the deck “${deck.name}” and all its cards?`)) return;
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
