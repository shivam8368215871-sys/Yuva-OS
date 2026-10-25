import { registerApp } from '../../core/appRegistry.js';
import { el, btn, C, page } from '../../core/ui.js';

const HISTORY_KEY = 'yuva_companion_history';
const MAX_HISTORY = 50;

registerApp({
  id: 'companion',
  title: 'AI Companion',
  icon: '✨',
  defaultSize: { w: 720, h: 520 },
  singleton: true,

  mount(container) {
    container.style.cssText = page;

    const root = el('div', `
      display:flex;
      flex-direction:column;
      height:100%;
      min-height:0;
      background:${C.bg};
      color:${C.text};
      font:14px system-ui,sans-serif;
    `);

    const header = el('div', `
      display:flex;
      align-items:center;
      gap:10px;
      padding:14px 16px;
      border-bottom:1px solid #30373d;
      background:${C.panel};
    `);

    const headingGroup = el('div', `
      display:flex;
      flex-direction:column;
      min-width:0;
    `);

    const heading = el('div', `
      font-size:15px;
      font-weight:650;
    `, 'AI Companion');

    const subtitle = el('div', `
      margin-top:3px;
      font-size:12px;
      color:${C.dim};
    `, 'Your personal assistant inside YuVA');

    headingGroup.append(heading, subtitle);

    const status = el('span', `
      margin-left:auto;
      font-size:11px;
      color:${C.dim};
      white-space:nowrap;
    `, 'Connecting…');

    const screenButton = btn('Share Screen', () => {}, C.accent);
    screenButton.style.cssText += `
      height:32px;
      border-radius:8px;
      color:#101419;
      font-weight:650;
      white-space:nowrap;
    `;

    const analyzeButton = btn('Analyze Screen', () => {}, C.accent);
    analyzeButton.style.cssText += `
      height:32px;
      border-radius:8px;
      color:#101419;
      font-weight:650;
      white-space:nowrap;
    `;
    analyzeButton.disabled = true;

    header.append(headingGroup, status, screenButton, analyzeButton);

    let screenStream = null;

    screenButton.addEventListener('click', async () => {
      try {
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
          screenStream = null;
          analyzeButton.disabled = true;
          screenButton.textContent = 'Share Screen';
          status.textContent = 'Screen sharing stopped';
          return;
        }

        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: 5,
          },
          audio: false,
        });

        const videoTrack = screenStream.getVideoTracks()[0];

        if (!videoTrack) {
          throw new Error('No screen video track was selected.');
        }

        videoTrack.addEventListener('ended', () => {
          screenStream = null;
          analyzeButton.disabled = true;
          screenButton.textContent = 'Share Screen';
          status.textContent = 'Screen sharing stopped';
        });

        analyzeButton.disabled = false;
        screenButton.textContent = 'Stop Sharing';
        status.textContent = 'Screen shared';
      } catch (error) {
        screenStream = null;
        analyzeButton.disabled = true;
        status.textContent = 'Screen permission denied';
        console.error('Screen sharing error:', error.message);
      }
    });

    analyzeButton.addEventListener('click', async () => {
      if (!screenStream || busy) return;

      const track = screenStream.getVideoTracks()[0];

      if (!track || track.readyState !== 'live') {
        status.textContent = 'Share your screen first';
        return;
      }

      analyzeButton.disabled = true;
      status.textContent = 'Capturing screen…';

      try {
        const video = document.createElement('video');
        video.srcObject = screenStream;
        video.muted = true;
        video.playsInline = true;

        await video.play();

        await new Promise(resolve => {
          if (video.videoWidth && video.videoHeight) {
            resolve();
          } else {
            video.addEventListener('loadedmetadata', resolve, { once: true });
          }
        });

        const canvas = document.createElement('canvas');
        const maxWidth = 1280;
        const scale = Math.min(1, maxWidth / video.videoWidth);

        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Could not capture screenshot.');
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        const base64 = dataUrl.split(',')[1];

        video.pause();
        video.srcObject = null;

        status.textContent = 'Analyzing screen…';

        const response = await fetch('/api/companion/screen', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: 'Describe what is visible on my screen and help me understand it.',
            image: {
              mimeType: 'image/jpeg',
              data: base64,
            },
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Screen analysis failed.');
        }

        addMessage('assistant', result.reply);
        status.textContent = 'Screen analyzed';
      } catch (error) {
        addMessage('assistant', `Screen analysis failed: ${error.message}`);
        status.textContent = 'Analysis error';
        console.error('Screen analysis error:', error.message);
      } finally {
        analyzeButton.disabled = !screenStream;
      }
    });

    const messages = el('div', `
      display:flex;
      flex-direction:column;
      gap:12px;
      flex:1;
      min-height:0;
      overflow-y:auto;
      padding:18px;
    `);

    function addMessage(role, text) {
      const bubble = el('div', `
        align-self:${role === 'user' ? 'flex-end' : 'flex-start'};
        max-width:min(85%,560px);
        padding:11px 14px;
        border:1px solid ${role === 'user' ? '#456b59' : '#30373d'};
        border-radius:12px;
        background:${role === 'user' ? '#243b31' : C.panel};
        color:${C.text};
        line-height:1.6;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
      `, text);

      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    function readHistory() {
      try {
        const history = JSON.parse(
          localStorage.getItem(HISTORY_KEY) || '[]'
        );

        if (!Array.isArray(history)) return [];

        return history
          .filter(item =>
            item &&
            ['user', 'assistant'].includes(item.role) &&
            typeof item.text === 'string'
          )
          .slice(-MAX_HISTORY);
      } catch {
        return [];
      }
    }

    function saveHistory(history) {
      try {
        localStorage.setItem(
          HISTORY_KEY,
          JSON.stringify(history.slice(-MAX_HISTORY))
        );
      } catch {
        // Chat remains usable if local storage is unavailable.
      }
    }

    const welcome = el('div', `
      max-width:520px;
      padding:16px;
      border:1px solid #30373d;
      border-radius:12px;
      background:${C.panel};
      line-height:1.6;
    `);

    welcome.append(
      el('div', `
        margin-bottom:6px;
        font-size:15px;
        font-weight:650;
      `, 'Hello! 👋'),
      el('div', `
        color:${C.text};
        line-height:1.6;
      `, 'I’m your YuVA AI Companion. Ask me questions, learn concepts, or get help with your work.')
    );

    messages.appendChild(welcome);

    const history = readHistory();

    for (const item of history) {
      addMessage(item.role, item.text);
    }

    const composer = el('form', `
      display:flex;
      align-items:flex-end;
      gap:8px;
      padding:12px;
      border-top:1px solid #30373d;
      background:${C.panel};
    `);

    const input = el('textarea', `
      flex:1;
      min-width:0;
      min-height:42px;
      max-height:120px;
      resize:vertical;
      padding:11px 12px;
      border:1px solid #30373d;
      border-radius:9px;
      outline:none;
      background:${C.bg};
      color:${C.text};
      font:14px system-ui,sans-serif;
      line-height:1.5;
    `);

    input.placeholder = 'Message your AI Companion…';
    input.setAttribute('aria-label', 'Message your AI Companion');
    input.rows = 1;

    const send = btn('Send', () => {}, C.accent);
    send.type = 'submit';
    send.style.cssText += `
      min-width:68px;
      height:42px;
      border-radius:9px;
      color:#101419;
      font-weight:650;
    `;

    let busy = false;

    async function sendMessage(text) {
      if (busy || !text.trim()) return;

      busy = true;
      input.disabled = true;
      send.disabled = true;
      send.style.opacity = '0.6';

      const previousHistory = [...history];

      addMessage('user', text);

      history.push({
        role: 'user',
        text,
        timestamp: Date.now(),
      });

      saveHistory(history);
      status.textContent = 'Thinking…';

      try {
        const response = await fetch('/api/companion/chat', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: text,
            history: previousHistory.slice(-20).map(item => ({
              role: item.role,
              text: item.text,
            })),
          }),
        });

        let data;

        try {
          data = await response.json();
        } catch {
          throw new Error('The server returned an invalid response.');
        }

        if (!response.ok) {
          throw new Error(
            data.error || `Request failed with HTTP ${response.status}.`
          );
        }

        if (typeof data.reply !== 'string' || !data.reply.trim()) {
          throw new Error('The Companion returned an empty response.');
        }

        addMessage('assistant', data.reply);

        history.push({
          role: 'assistant',
          text: data.reply,
          timestamp: Date.now(),
        });

        saveHistory(history);
        status.textContent = 'Connected';
      } catch (error) {
        const message = error.message || 'Unable to contact Companion.';

        addMessage('assistant', `Sorry, I couldn't respond.\n\n${message}`);

        status.textContent = 'Connection error';
        console.error('Companion frontend error:', message);
      } finally {
        busy = false;
        input.disabled = false;
        send.disabled = false;
        send.style.opacity = '1';
        input.focus();
      }
    }

    composer.addEventListener('submit', event => {
      event.preventDefault();

      const text = input.value.trim();
      if (!text || busy) return;

      input.value = '';
      sendMessage(text);
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });

    composer.append(input, send);
    root.append(header, messages, composer);
    container.appendChild(root);

    status.textContent = 'Ready';

    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
      }

      root.remove();
    };
  },
});
