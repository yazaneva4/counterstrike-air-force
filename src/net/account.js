// Account card on the title screen: log in, sign up, or continue with Google.
// A signed-in player's cloud save id comes from their account, so the same
// progress loads on every device. On a host without the accounts API (or
// without AUTH_SECRET) the card stays hidden and the game plays as a guest.

const ID_KEY = 'csaf-cloud-id';
const NAME_KEY = 'csaf-account-name';
const SYNCED = 'csaf-account-synced';
const API = 'api/auth';
const card = document.getElementById('accountCard');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
};
const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function call(action, body) {
  const r = await fetch(API + '?action=' + action, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { cache: 'no-store' });
  if (!(r.headers.get('content-type') || '').includes('application/json')) throw new Error('unavailable');
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v; else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}
const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);

function showSignedIn(user) {
  const out = el('button', { type: 'button', class: 'ghost' }, 'Log out');
  const note = el('div', { class: 'note' }, 'Your progress is saved to this account and loads on every device.');
  out.addEventListener('click', async () => {
    out.disabled = true;
    try { await call('logout', {}); } catch (e) { /* the cookie expires on its own */ }
    store.set(ID_KEY, randomId()); // back to a fresh guest save
    store.del(NAME_KEY);
    sessionStorage.removeItem(SYNCED);
    location.reload();
  });
  card.replaceChildren(el('h3', {}, 'Account'), el('div', { class: 'sub' }, 'Signed in as ' + user.name), note, el('div', { class: 'roomRow' }, out));
}

function showGuest(google) {
  let mode = 'login';
  const user = el('input', { maxlength: '20', autocomplete: 'username', spellcheck: 'false', autocapitalize: 'none', required: '' });
  const pass = el('input', { type: 'password', maxlength: '128', autocomplete: 'current-password', required: '' });
  const status = el('div', { class: 'note', role: 'status', 'aria-live': 'polite' }, 'Playing as a guest. Log in or sign up to keep your progress on every device.');
  const submit = el('button', { type: 'submit', class: 'ghost' }, 'Log in');
  const tabs = {
    login: el('button', { type: 'button', class: 'on', 'aria-pressed': 'true' }, 'Log in'),
    signup: el('button', { type: 'button', 'aria-pressed': 'false' }, 'Sign up'),
  };
  const setMode = (next) => {
    mode = next;
    for (const [key, btn] of Object.entries(tabs)) { btn.classList.toggle('on', key === mode); btn.setAttribute('aria-pressed', String(key === mode)); }
    submit.textContent = mode === 'login' ? 'Log in' : 'Create account';
    pass.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
    status.textContent = mode === 'login' ? 'Log in to load your saved progress.' : 'Pick a username (3-20 letters, numbers or _) and a password of at least 8 characters. Your current guest progress moves into the account.';
  };
  tabs.login.addEventListener('click', () => setMode('login'));
  tabs.signup.addEventListener('click', () => setMode('signup'));

  const form = el('form', { novalidate: '' },
    field('Username', user), field('Password', pass), el('div', { class: 'roomRow' }, submit));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true; status.textContent = 'One moment...';
    try {
      const body = { username: user.value, password: pass.value };
      if (mode === 'signup') body.adoptId = store.get(ID_KEY);
      const data = await call(mode === 'signup' ? 'register' : 'login', body);
      store.set(ID_KEY, data.user.saveId); store.set(NAME_KEY, data.user.name);
      sessionStorage.setItem(SYNCED, '1');
      location.reload(); // the cloud save reloads under the account's id
    } catch (err) {
      status.textContent = err.message === 'unavailable' ? 'Accounts are unavailable right now.' : err.message;
      submit.disabled = false;
    }
  });

  const kids = [el('h3', {}, 'Account'), el('div', { class: 'seg', role: 'group', 'aria-label': 'Account mode' }, tabs.login, tabs.signup), form];
  if (google) {
    const g = el('button', { type: 'button', class: 'ghost' }, 'Continue with Google');
    g.addEventListener('click', () => { location.href = API + '?action=google&adopt=' + encodeURIComponent(store.get(ID_KEY) || ''); });
    kids.push(el('div', { class: 'roomRow' }, g));
  }
  kids.push(status);
  card.replaceChildren(...kids);
}

async function init() {
  if (!card) return;
  let me;
  try { me = await call('me'); } catch (e) { return; } // no API on this host
  if (!me.configured) return;
  if (me.user) {
    if (store.get(ID_KEY) !== me.user.saveId && !sessionStorage.getItem(SYNCED)) {
      // Arrived from a Google sign-in or another device: switch to the account's save once.
      store.set(ID_KEY, me.user.saveId); store.set(NAME_KEY, me.user.name);
      sessionStorage.setItem(SYNCED, '1');
      location.reload();
      return;
    }
    showSignedIn(me.user);
  } else {
    store.del(NAME_KEY); // session ended; the save id keeps working as a guest
    showGuest(me.google);
  }
  card.hidden = false;
}
init();
