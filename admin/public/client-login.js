document.getElementById('loginBtn').addEventListener('click', handleLogin);

async function handleLogin(e) {
    // если вызвано в форме — отменяем submit
    if (e && e.preventDefault) e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const msgEl = document.getElementById('loginMsg');
    msgEl.textContent = '';

    if (!email || !password) {
        msgEl.textContent = 'Введите email и пароль';
        return;
    }

    try {
        const resp = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // важно — чтобы cookie приняли браузером
            body: JSON.stringify({ email, password })
        });

        const data = await resp.json();
        if (!resp.ok) {
            msgEl.textContent = data.error || 'Ошибка входа';
            return;
        }

        // Успешный вход — редирект на admin.html
        window.location.href = '/admin.html';
    } catch (err) {
        console.error(err);
        msgEl.textContent = 'Ошибка сети';
    }
}