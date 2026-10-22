import { registerApp } from '../../core/appRegistry.js';

registerApp({
  id: 'calendar',
  title: 'Calendar & Clock',
  defaultSize: { w: 620, h: 560 },
  singleton: true,

  mount(root) {
    root.innerHTML = `
      <div class="yuva-calendar">
        <header class="cal-header">
          <div>
            <div class="cal-eyebrow">YUVA CALENDAR</div>
            <h2 class="cal-heading">Calendar</h2>
          </div>
          <div class="cal-clock">
            <div class="cal-time"></div>
            <div class="cal-today"></div>
          </div>
        </header>

        <section class="cal-layout">
          <div class="cal-month-panel">
            <div class="cal-nav">
              <button type="button" data-move="-1" aria-label="Previous month">‹</button>
              <strong class="cal-month"></strong>
              <button type="button" data-move="1" aria-label="Next month">›</button>
            </div>
            <div class="cal-weekdays">
              <span>Sun</span><span>Mon</span><span>Tue</span>
              <span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>
            <div class="cal-days"></div>
          </div>

          <aside class="cal-events-panel">
            <h3 class="cal-selected-heading">Selected day</h3>
            <p class="cal-selected-date"></p>
            <div class="cal-events"></div>
            <form class="cal-event-form">
              <label for="cal-event-title">New event</label>
              <input id="cal-event-title" name="title" maxlength="100"
                     placeholder="What do you need to do?" required>
              <label for="cal-event-date">Date</label>
              <input id="cal-event-date" name="date" type="date" required>
              <label for="cal-event-time">Time (optional)</label>
              <input id="cal-event-time" name="time" type="time">
              <button class="cal-add" type="submit">Add event</button>
            </form>
          </aside>
        </section>
        <footer class="cal-footer">
          Events are saved in this browser on this device.
        </footer>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .yuva-calendar {
        height: 100%;
        overflow: auto;
        padding: 20px;
        box-sizing: border-box;
        background: #101419;
        color: #b6beca;
        font: 14px system-ui, sans-serif;
      }
      .cal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }
      .cal-eyebrow {
        color: #78dba9;
        font-size: 10px;
        letter-spacing: 2px;
        font-weight: 700;
      }
      .cal-heading { margin: 4px 0 0; font-size: 26px; }
      .cal-clock { text-align: right; }
      .cal-time { font-size: 25px; font-weight: 650; font-variant-numeric: tabular-nums; }
      .cal-today { color: #8c929c; font-size: 12px; }
      .cal-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(190px, .8fr); gap: 18px; }
      .cal-month-panel, .cal-events-panel {
        padding: 14px;
        border: 1px solid #30373d;
        border-radius: 12px;
        min-width: 0;
      }
      .cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .cal-nav strong { font-size: 16px; }
      .yuva-calendar button {
        cursor: pointer;
        border: 1px solid #30373d;
        border-radius: 7px;
        background: #1c252c;
        color: #b6beca;
        padding: 7px 10px;
      }
      .yuva-calendar button:hover { background: #30373d; }
      .cal-weekdays, .cal-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
      .cal-weekdays { margin-bottom: 8px; color: #8c929c; text-align: center; font-size: 11px; }
      .cal-day {
        position: relative;
        min-width: 0;
        aspect-ratio: 1;
        padding: 0 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        border-color: transparent !important;
        background: transparent !important;
        font-size: 12px;
      }
      .cal-day.outside { color: #6b7078; }
      .cal-day.today { outline: 1px solid #78dba9; }
      .cal-day.selected { background: #30373d !important; border-color: #78dba9 !important; }
      .cal-day.has-events::after {
        content: "";
        position: absolute;
        bottom: 4px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #78dba9;
      }
      .cal-events-panel h3 { margin: 0 0 6px; font-size: 16px; }
      .cal-selected-date { color: #8c929c; font-size: 12px; margin: 0 0 12px; }
      .cal-events { display: grid; gap: 7px; margin-bottom: 16px; }
      .cal-event {
        padding: 9px;
        border-radius: 8px;
        background: #1c252c;
        overflow-wrap: anywhere;
      }
      .cal-event-time { color: #78dba9; font-size: 11px; margin-bottom: 3px; }
      .cal-event-title { font-weight: 550; }
      .cal-event-delete { margin-top: 6px; font-size: 11px; padding: 4px 7px !important; }
      .cal-empty { color: #8c929c; font-size: 12px; }
      .cal-event-form { display: grid; gap: 7px; }
      .cal-event-form label { color: #8c929c; font-size: 11px; }
      .cal-event-form input {
        width: 100%; min-width: 0; box-sizing: border-box;
        padding: 9px; border: 1px solid #30373d; border-radius: 7px;
        background: #0a0c0f; color: #b6beca;
      }
      .cal-event-form .cal-add { background: #78dba9; color: #0a0c0f; border: 0; font-weight: 650; }
      .cal-footer { margin-top: 14px; color: #8c929c; font-size: 11px; }
      @media (max-width: 540px) {
        .yuva-calendar { padding: 12px; }
        .cal-layout { grid-template-columns: 1fr; }
        .cal-header { align-items: flex-start; }
        .cal-time { font-size: 20px; }
      }
    `;
    root.appendChild(style);

    const $ = selector => root.querySelector(selector);
    const daysEl = $('.cal-days');
    const monthEl = $('.cal-month');
    const eventsEl = $('.cal-events');
    const selectedDateEl = $('.cal-selected-date');
    const eventForm = $('.cal-event-form');
    const eventTitle = $('#cal-event-title');
    const eventDate = $('#cal-event-date');
    const eventTime = $('#cal-event-time');
    const timeEl = $('.cal-time');
    const todayEl = $('.cal-today');

    const storageKey = 'yuva.calendar.events.v1';
    let events = [];
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) {
        events = saved.filter(e =>
          e && typeof e.id === 'string' &&
          typeof e.title === 'string' &&
          typeof e.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
          (e.time === '' || (typeof e.time === 'string' && /^\d{2}:\d{2}$/.test(e.time)))
        );
      }
    } catch { events = []; }

    const pad = n => String(n).padStart(2, '0');
    const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const parseDate = key => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    const sameDay = (a, b) => dateKey(a) === dateKey(b);

    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let selected = dateKey(now);
    let destroyed = false;

    function saveEvents() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(events));
      } catch {
        alert('Could not save events. Browser storage may be full or unavailable.');
      }
    }

    function updateClock() {
      const current = new Date();
      timeEl.textContent = current.toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      todayEl.textContent = current.toLocaleDateString([], {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
    }

    function renderEvents() {
      const chosen = events
        .filter(event => event.date === selected)
        .sort((a, b) => a.time.localeCompare(b.time));

      selectedDateEl.textContent = parseDate(selected).toLocaleDateString([], {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
      eventsEl.replaceChildren();

      if (!chosen.length) {
        const empty = document.createElement('p');
        empty.className = 'cal-empty';
        empty.textContent = 'No events for this day.';
        eventsEl.appendChild(empty);
      }

      for (const event of chosen) {
        const card = document.createElement('div');
        card.className = 'cal-event';

        if (event.time) {
          const time = document.createElement('div');
          time.className = 'cal-event-time';
          time.textContent = event.time;
          card.appendChild(time);
        }

        const title = document.createElement('div');
        title.className = 'cal-event-title';
        title.textContent = event.title;
        card.appendChild(title);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'cal-event-delete';
        remove.textContent = 'Delete event';
        remove.addEventListener('click', () => {
          events = events.filter(item => item.id !== event.id);
          saveEvents();
          renderCalendar();
          renderEvents();
        });
        card.appendChild(remove);
        eventsEl.appendChild(card);
      }
    }

    function renderCalendar() {
      monthEl.textContent = new Date(year, month, 1).toLocaleDateString([], {
        month: 'long', year: 'numeric'
      });

      daysEl.replaceChildren();

      const first = new Date(year, month, 1);
      const start = new Date(year, month, 1 - first.getDay());
      const today = new Date();

      for (let i = 0; i < 42; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const key = dateKey(date);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cal-day';
        button.textContent = date.getDate();
        button.setAttribute('aria-label', date.toLocaleDateString());

        if (date.getMonth() !== month) button.classList.add('outside');
        if (sameDay(date, today)) button.classList.add('today');
        if (key === selected) button.classList.add('selected');
        if (events.some(event => event.date === key)) button.classList.add('has-events');

        button.addEventListener('click', () => {
          selected = key;
          year = date.getFullYear();
          month = date.getMonth();
          eventDate.value = selected;
          renderCalendar();
          renderEvents();
        });

        daysEl.appendChild(button);
      }
    }

    root.querySelectorAll('[data-move]').forEach(button => {
      button.addEventListener('click', () => {
        month += Number(button.dataset.move);
        const date = new Date(year, month, 1);
        year = date.getFullYear();
        month = date.getMonth();
        renderCalendar();
      });
    });

    eventDate.value = selected;
    eventForm.addEventListener('submit', event => {
      event.preventDefault();
      const title = eventTitle.value.trim();
      const date = eventDate.value;
      const time = eventTime.value;

      if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      events.push({
        id: crypto.randomUUID(),
        title,
        date,
        time,
      });

      selected = date;
      const parsed = parseDate(date);
      year = parsed.getFullYear();
      month = parsed.getMonth();

      saveEvents();
      renderCalendar();
      renderEvents();
      eventTitle.value = '';
      eventTime.value = '';
    });

    updateClock();
    renderCalendar();
    renderEvents();

    const clockTimer = setInterval(() => {
      if (!destroyed) updateClock();
    }, 1000);

    this._cleanup = () => {
      destroyed = true;
      clearInterval(clockTimer);
      style.remove();
    };
  },

  unmount() {
    this._cleanup?.();
    this._cleanup = null;
  },
});
