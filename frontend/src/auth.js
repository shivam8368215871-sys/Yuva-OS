export async function initAuthGate({ desktop, taskbar }) {
  desktop.style.display = 'none';
  taskbar.style.display = 'none';

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = '/auth.css';
  document.head.appendChild(style);

  const screen = document.createElement('div');
  screen.id = 'auth-screen';

  screen.innerHTML = `
    <section class="auth-card">
      <h1>YuVA OS</h1>
      <p>Your personal workspace</p>

      <div class="auth-role-tabs">
        <button type="button" data-role="student" class="active">
          Student
        </button>
        <button type="button" data-role="admin">
          Admin
        </button>
      </div>

      <div class="auth-mode-tabs">
        <button type="button" data-mode="login" class="active">
          Login
        </button>
        <button type="button" data-mode="signup">
          Register
        </button>
      </div>

      <form id="auth-form">
        <div id="auth-fullname-group" hidden>
          <label for="auth-fullname">Full name</label>
          <input
            id="auth-fullname"
            name="full_name"
            autocomplete="name"
            maxlength="100"
          />
        </div>

        <label for="auth-username">Username</label>
        <input
          id="auth-username"
          name="username"
          autocomplete="username"
          minlength="3"
          maxlength="32"
          required
        />

        <div id="auth-email-group" hidden>
          <label for="auth-email">Email address</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autocomplete="email"
            maxlength="254"
          />
        </div>

        <label for="auth-password">Password</label>
        <input
          id="auth-password"
          name="password"
          type="password"
          autocomplete="current-password"
          minlength="12"
          required
        />

        <div id="auth-confirm-group" hidden>
          <label for="auth-confirm">Confirm password</label>
          <input
            id="auth-confirm"
            name="confirm_password"
            type="password"
            autocomplete="new-password"
            minlength="12"
          />
        </div>

        <p id="auth-error" hidden></p>

        <button id="auth-submit" type="submit">
          Login
        </button>
      </form>
    </section>
  `;

  document.body.appendChild(screen);

  const form = screen.querySelector('#auth-form');
  const fullName = screen.querySelector('#auth-fullname');
  const fullNameGroup = screen.querySelector('#auth-fullname-group');
  const username = screen.querySelector('#auth-username');
  const email = screen.querySelector('#auth-email');
  const emailGroup = screen.querySelector('#auth-email-group');
  const password = screen.querySelector('#auth-password');
  const confirmPassword = screen.querySelector('#auth-confirm');
  const confirmGroup = screen.querySelector('#auth-confirm-group');
  const submit = screen.querySelector('#auth-submit');
  const errorBox = screen.querySelector('#auth-error');
  const modeTabs = screen.querySelector('.auth-mode-tabs');

  let selectedRole = 'student';
  let mode = 'login';

  function updateUI() {
    const signup = mode === 'signup';
    const admin = selectedRole === 'admin';

    fullNameGroup.hidden = !signup;
    fullName.required = signup;

    emailGroup.hidden = !signup;
    email.required = signup;

    confirmGroup.hidden = !signup;
    confirmPassword.required = signup;

    password.autocomplete = signup
      ? 'new-password'
      : 'current-password';

    modeTabs.hidden = admin;

    submit.textContent = admin
      ? 'Admin Login'
      : signup
        ? 'Create Student Account'
        : 'Student Login';

    screen.querySelectorAll('[data-role]').forEach((button) => {
      const active = button.dataset.role === selectedRole;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    screen.querySelectorAll('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  async function request(path, body = {}) {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || data.message || `Request failed (${response.status})`
      );
    }

    return data;
  }

  function openAdminRegistration() {
    if (document.querySelector('.auth-admin-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'auth-admin-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'admin-registration-title');

    modal.innerHTML = `
      <section class="auth-admin-card">
        <button
          type="button"
          class="auth-admin-close"
          aria-label="Close admin registration"
        >&times;</button>

        <h2 id="admin-registration-title">Create Admin</h2>
        <p>Create another administrator account for YuVA OS.</p>

        <form id="admin-registration-form">
          <label for="admin-fullname">Full name</label>
          <input
            id="admin-fullname"
            name="full_name"
            autocomplete="name"
            maxlength="100"
            required
          />

          <label for="admin-username">Username</label>
          <input
            id="admin-username"
            name="username"
            autocomplete="username"
            minlength="3"
            maxlength="32"
            required
          />

          <label for="admin-email">Email address</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            autocomplete="email"
            maxlength="254"
            required
          />

          <label for="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autocomplete="new-password"
            minlength="12"
            required
          />

          <label for="admin-confirm-password">Confirm password</label>
          <input
            id="admin-confirm-password"
            name="confirm_password"
            type="password"
            autocomplete="new-password"
            minlength="12"
            required
          />

          <p id="admin-registration-message" role="status" hidden></p>

          <button id="admin-registration-submit" type="submit">
            Create Admin Account
          </button>
        </form>
      </section>
    `;

    document.body.appendChild(modal);

    const adminForm = modal.querySelector('#admin-registration-form');
    const adminSubmit = modal.querySelector('#admin-registration-submit');
    const message = modal.querySelector('#admin-registration-message');
    const closeButton = modal.querySelector('.auth-admin-close');

    function closeModal() {
      modal.remove();
    }

    closeButton.addEventListener('click', closeModal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });

    adminForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      message.hidden = true;
      adminSubmit.disabled = true;

      try {
        const data = await request('/api/auth/admins', {
          full_name: modal.querySelector('#admin-fullname').value.trim(),
          username: modal.querySelector('#admin-username').value.trim(),
          email: modal.querySelector('#admin-email').value.trim(),
          password: modal.querySelector('#admin-password').value,
          confirm_password: modal.querySelector('#admin-confirm-password').value,
        });

        message.textContent =
          `Administrator ${data.user.full_name || data.user.username} created successfully.`;
        message.hidden = false;

        adminForm.reset();
      } catch (error) {
        message.textContent = error.message || 'Unable to create administrator.';
        message.hidden = false;
      } finally {
        adminSubmit.disabled = false;
      }
    });

    modal.querySelector('#admin-fullname').focus();
  }

  function showDesktop(user) {
    screen.remove();

    desktop.style.display = '';
    taskbar.style.display = '';

    const account = document.createElement('div');
    account.className = 'auth-account';

    const name = document.createElement('span');
    name.textContent = user.full_name || user.username;

    const role = document.createElement('span');
    role.textContent = user.role === 'admin' ? 'Administrator' : 'Student';

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'auth-logout';
    logout.textContent = 'Logout';

    logout.addEventListener('click', async () => {
      logout.disabled = true;

      try {
        await request('/api/auth/logout');
        window.location.reload();
      } catch (error) {
        logout.disabled = false;
        alert(error.message);
      }
    });

    account.append(name, role);

    if (user.role === 'admin') {
      const createAdmin = document.createElement('button');
      createAdmin.type = 'button';
      createAdmin.className = 'auth-admin-manage';
      createAdmin.textContent = 'Create Admin';
      createAdmin.addEventListener('click', openAdminRegistration);
      account.appendChild(createAdmin);
    }

    account.appendChild(logout);
    taskbar.appendChild(account);
  }

  async function authenticate() {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
      });

      if (!response.ok) return;

      const data = await response.json();
      const user = data.user;

      if (!data.authenticated || !user) return;

      // A session already exists. Open the desktop for its actual role.
      showDesktop(user);
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  }

  screen.querySelectorAll('[data-role]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedRole = button.dataset.role;
      mode = 'login';

      errorBox.hidden = true;
      form.reset();
      updateUI();
    });
  });

  screen.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      if (selectedRole === 'admin') return;

      mode = button.dataset.mode;
      errorBox.hidden = true;
      form.reset();
      updateUI();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    errorBox.hidden = true;
    submit.disabled = true;

    try {
      const credentials = {
        identifier: username.value.trim(),
        password: password.value,
      };

      let data;

      if (mode === 'signup' && selectedRole === 'student') {
        data = await request('/api/auth/signup', {
          full_name: fullName.value.trim(),
          username: username.value.trim(),
          email: email.value.trim(),
          password: password.value,
          confirm_password: confirmPassword.value,
        });
      } else {
        data = await request('/api/auth/login', credentials);
      }

      const user = data.user;

      if (!user || !user.username) {
        throw new Error('The server did not return a valid user.');
      }

      if (user.role !== selectedRole) {
        await request('/api/auth/logout');

        throw new Error(
          `This account is registered as ${user.role}, not ${selectedRole}.`
        );
      }

      showDesktop(user);
    } catch (error) {
      showError(error.message || 'Unable to authenticate.');
    } finally {
      submit.disabled = false;
    }
  });

  updateUI();
  await authenticate();
}
