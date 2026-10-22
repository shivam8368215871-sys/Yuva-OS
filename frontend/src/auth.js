export async function initAuthGate({ desktop, taskbar }) {
  desktop.style.display = 'none';
  taskbar.style.display = 'none';

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = '/auth.css';
  document.head.appendChild(style);

  const screen = document.createElement('main');
  screen.id = 'auth-screen';
  screen.innerHTML = `
    <section class="auth-card">
      <div class="auth-mark">Y</div>
      <p class="auth-eyebrow">YOUR PERSONAL DESKTOP</p>
      <h1>Welcome to YuVA</h1>
      <p class="auth-subtitle">Your workspace. Your ideas. Your space.</p>

      <div class="auth-tabs">
        <button type="button" data-mode="login" class="selected">Log in</button>
        <button type="button" data-mode="signup">Create account</button>
      </div>

      <form id="auth-form">
        <label id="username-label" hidden for="auth-username">Username</label>
        <input id="auth-username" name="username" autocomplete="username"
          placeholder="Username" minlength="3" maxlength="32" hidden>

        <label id="email-label" hidden for="auth-email">Email</label>
        <input id="auth-email" name="email" type="email" autocomplete="email"
          placeholder="Email address" maxlength="254" hidden>

        <label for="auth-identifier" id="identifier-label">Username or email</label>
        <input id="auth-identifier" name="identifier" autocomplete="username"
          placeholder="Username or email" required maxlength="254">

        <label for="auth-password">Password</label>
        <input id="auth-password" name="password" type="password"
          autocomplete="current-password" placeholder="Password" required>

        <p id="auth-hint" class="auth-hint">Use your YuVA account to continue.</p>
        <p id="auth-error" class="auth-error" role="alert" hidden></p>
        <button id="auth-submit" class="auth-submit" type="submit">Log in</button>
      </form>

      <p class="auth-footer">A personal desktop, ready when you are.</p>
    </section>
  `;
  document.body.appendChild(screen);

  const form = screen.querySelector('#auth-form');
  const username = screen.querySelector('#auth-username');
  const email = screen.querySelector('#auth-email');
  const identifier = screen.querySelector('#auth-identifier');
  const password = screen.querySelector('#auth-password');
  const usernameLabel = screen.querySelector('#username-label');
  const emailLabel = screen.querySelector('#email-label');
  const identifierLabel = screen.querySelector('#identifier-label');
  const errorBox = screen.querySelector('#auth-error');
  const submit = screen.querySelector('#auth-submit');
  const hint = screen.querySelector('#auth-hint');
  const tabs = [...screen.querySelectorAll('[data-mode]')];

  let mode = 'login';

  function setMode(nextMode) {
    mode = nextMode;
    const signup = mode === 'signup';

    tabs.forEach((tab) => {
      const selected = tab.dataset.mode === mode;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });

    username.hidden = usernameLabel.hidden = !signup;
    email.hidden = emailLabel.hidden = !signup;
    identifier.hidden = identifierLabel.hidden = signup;

    username.required = signup;
    email.required = signup;
    identifier.required = !signup;
    password.autocomplete = signup ? 'new-password' : 'current-password';

    submit.textContent = signup ? 'Create account' : 'Log in';
    hint.textContent = signup
      ? 'Username: 3–32 lowercase letters, numbers or underscores. Password: at least 12 characters.'
      : 'Use your YuVA username or email and password.';

    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

  async function request(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';

    try {
      if (mode === 'signup') {
        await request('/api/auth/signup', {
          username: username.value,
          email: email.value,
          password: password.value,
        });
      } else {
        await request('/api/auth/login', {
          identifier: identifier.value,
          password: password.value,
        });
      }

      window.location.reload();
    } catch (error) {
      errorBox.textContent = error.message || 'Unable to authenticate.';
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = mode === 'signup' ? 'Create account' : 'Log in';
    }
  });

  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Unable to check your session.');
    const data = await response.json();

    if (data.authenticated && data.user) {
      screen.remove();
      desktop.style.display = '';
      taskbar.style.display = '';

      const account = document.createElement('div');
      account.className = 'yuva-account';
      account.innerHTML = `
        <span class="yuva-account-name"></span>
        <button type="button" class="yuva-logout">Log out</button>
      `;
      account.querySelector('.yuva-account-name').textContent = data.user.username;
      taskbar.appendChild(account);

      account.querySelector('.yuva-logout').addEventListener('click', async () => {
        const button = account.querySelector('button');
        button.disabled = true;
        button.textContent = 'Logging out…';

        try {
          const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
          });
          if (!response.ok) throw new Error('Logout failed.');
          window.location.reload();
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Log out';
          window.alert(error.message || 'Unable to log out.');
        }
      });
    } else {
      setMode('login');
    }
  } catch (error) {
    screen.querySelector('#auth-error').textContent =
      `${error.message} Refresh the page to try again.`;
    screen.querySelector('#auth-error').hidden = false;
    screen.querySelector('#auth-submit').disabled = true;
  }
}
