(function () {
  'use strict';
  var TIMEOUT_MS = 15000;
  var TZ = 'МСК (UTC+3, Санкт-Петербург)';
  var KINDS = {
    helmet: ['Каска защитная', '🪖', 'Каска'], glasses: ['Очки защитные', '👓', 'Очки'],
    resp: ['Респиратор', '😷', 'Респиратор'], ears: ['Наушники', '🎧', 'Наушники'],
    suit: ['Костюм защитный', '🦺', 'Спецодежда'], gloves: ['Перчатки', '🧤', 'Перчатки'],
    boots: ['Ботинки защитные', '🥾', 'Обувь']
  };
  var ORDER = Object.keys(KINDS);
  var LOC = { in_use: 'В носке', laundry: 'На стирке', repair: 'В ремонте', written_off: 'Списан' };
  var STAT = ['Годен', 'Скоро замена', 'Списан'];
  var ICON = { 'Годен': '✔', 'Скоро замена': '▲', 'Списан': '✖' };
  var CLS = { 'Годен': 'ok', 'Скоро замена': 'warn', 'Списан': 'bad' };

  var $ = function (id) { return document.getElementById(id); };
  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  var fmtDT = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var fmtD = function (v) { return new Date(v).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }); };
  var stamp = function (d) { return fmtDT.format(d) + ' ' + TZ; };
  var validDate = function (v) { return typeof v === 'string' && !isNaN(Date.parse(v)); };

  /* ===== ИМИТАЦИЯ API: меняйте данные здесь ===== */
  // plan: вид СИЗ -> [где сейчас, дней до конца срока носки, число стирок]
  var PEOPLE = [
    { id: '78456', name: 'Иванов Алексей Сергеевич', role: 'Инженер', dept: 'Цех №3', hired: '2021-03-15',
      plan: { helmet: ['in_use', 400, 0], glasses: ['in_use', 350, 0], resp: ['in_use', 200, 0], ears: ['in_use', 500, 0], suit: ['in_use', 300, 24], gloves: ['laundry', 120, 10], boots: ['in_use', 260, 0] } },
    { id: '78502', name: 'Петрова Мария Игоревна', role: 'Технолог', dept: 'Цех №1', hired: '2019-09-02',
      plan: { helmet: ['in_use', 20, 0], glasses: ['in_use', 150, 0], resp: ['in_use', 90, 0], ears: ['in_use', 300, 0], suit: ['repair', 200, 61], gloves: ['in_use', 45, 8], boots: ['in_use', 180, 0] } },
    { id: '78619', name: 'Смирнов Дмитрий Олегович', role: 'Слесарь', dept: 'Цех №2', hired: '2023-01-23',
      plan: { helmet: ['in_use', 500, 0], glasses: ['in_use', 120, 0], resp: ['in_use', 10, 0], ears: ['in_use', 400, 0], suit: ['laundry', 250, 33], gloves: ['in_use', 60, 12], boots: ['written_off', -40, 0] } }
  ];

  function buildResponse(mode) {
    var now = Date.now(), n = 50012478;
    var emps = PEOPLE.map(function (p) {
      return {
        id: p.id, name: p.name, role: p.role, dept: p.dept, hired: p.hired,
        items: ORDER.map(function (k) {
          var pl = p.plan[k], days = pl[1];
          var it = {
            rfid: String(n++), kind: k, location: pl[0], washCycles: pl[2],
            wearUntil: new Date(now + days * 864e5).toISOString(),
            status: pl[0] === 'written_off' ? 'Списан' : days <= 30 ? 'Скоро замена' : 'Годен'
          };
          if (mode === 'partial') delete it.location;
          return it;
        })
      };
    });
    var payload = { generatedAt: new Date(now - 5 * 60000).toISOString(), employees: emps };
    if (mode === 'empty') payload.employees = [];
    if (mode === 'broken') delete payload.employees;
    return payload;
  }

  // Имитация сети. Для реального файла замените тело на:
  // return fetch('data.json', { signal: signal }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  function simulateApi(mode, signal) {
    return new Promise(function (resolve, reject) {
      var abort = function () { reject(new DOMException('Aborted', 'AbortError')); };
      if (signal.aborted) return abort();
      var t = setTimeout(function () {
        if (mode === 'error') reject(new Error('Сервер имитации вернул ошибку 503.'));
        else resolve(buildResponse(mode));
      }, mode === 'slow' ? 20000 : 700);
      signal.addEventListener('abort', function () { clearTimeout(t); abort(); });
    });
  }

  /* ===== Проверка и расчёты ===== */
  function eff(it, dt) {
    if (!it || STAT.indexOf(it.status) < 0 || !validDate(it.wearUntil)) return null;
    if (it.status === 'Списан') return 'Списан';
    return (it.status === 'Скоро замена' || Date.parse(it.wearUntil) < dt) ? 'Скоро замена' : 'Годен';
  }
  function parse(p) {
    if (!p || typeof p !== 'object') throw new Error('Ответ не является объектом.');
    if (!validDate(p.generatedAt)) throw new Error('Нет корректного поля generatedAt.');
    if (!Array.isArray(p.employees)) throw new Error('Нет массива employees.');
    p.employees.forEach(function (e) {
      if (!e || typeof e.name !== 'string' || !Array.isArray(e.items)) throw new Error('У сотрудника нет name или items.');
    });
    return { dt: Date.parse(p.generatedAt), emps: p.employees };
  }
  function metrics(all, dt) {
    var m = { t: null, s: null, r: null };
    if (all.every(function (i) { return i && typeof i.rfid === 'string' && i.rfid; })) m.t = all.length;
    if (all.every(function (i) { return i && LOC[i.location]; }))
      m.s = all.filter(function (i) { return i.location === 'laundry' || i.location === 'repair'; }).length;
    if (all.every(function (i) { return eff(i, dt); }))
      m.r = all.filter(function (i) { return eff(i, dt) === 'Скоро замена'; }).length;
    return m;
  }

  /* ===== Состояние и отрисовка ===== */
  var S = { emps: [], dt: 0, emp: 0, filter: 'all', sel: null };
  var busy = false, lastOk = null;

  function setMetric(n, v) {
    $('v' + n).textContent = v === null ? '—' : String(v);
    var note = $('n' + n);
    if (v === null) { note.textContent = 'Нет данных по этому показателю'; note.classList.add('missing'); }
    else note.classList.remove('missing');
  }
  function resetMetrics() { [1, 2, 3].forEach(function (n) { $('v' + n).textContent = '—'; $('n' + n).classList.remove('missing'); }); }
  function setStatus(kind, text, detail) {
    $('statusText').className = 'status-text ' + kind;
    $('statusText').textContent = text;
    $('statusDetail').textContent = detail || '';
    $('retryBtn').hidden = kind !== 'error';
  }
  function setBusy(f) {
    busy = f; $('refreshBtn').disabled = f; $('retryBtn').disabled = f;
    $('refreshBtn').textContent = f ? '⏳ Загрузка…' : '⟳ Обновить';
  }

  function curEmp() { return S.emps[S.emp] || null; }
  function itemOf(kind) {
    var e = curEmp();
    if (!e) return null;
    return e.items.filter(function (i) { return i.kind === kind; })[0] || null;
  }
  function chip(it) {
    var s = it ? eff(it, S.dt) : null;
    return h('span', 'chip ' + (s ? CLS[s] : 'none'), s ? ICON[s] + ' ' + s : 'нет данных');
  }

  function renderEmployee() {
    var e = curEmp();
    $('eId').textContent = e && e.id ? e.id : '—';
    $('eRole').textContent = e && e.role ? e.role : '—';
    $('eDept').textContent = e && e.dept ? e.dept : '—';
    $('eHired').textContent = e && validDate(e.hired) ? fmtD(e.hired) : '—';
  }
  function renderCats() {
    var box = $('cats'); box.textContent = '';
    [['all', '▦', 'Все СИЗ']].concat(ORDER.map(function (k) { return [k, KINDS[k][1], KINDS[k][2]]; })).forEach(function (c) {
      var b = h('button', 'cat'); b.type = 'button';
      b.appendChild(h('span', '', c[1])); b.appendChild(h('span', '', c[2]));
      b.setAttribute('aria-pressed', String(S.filter === c[0]));
      b.addEventListener('click', function () {
        S.filter = c[0];
        if (c[0] !== 'all' && itemOf(c[0])) S.sel = c[0];
        renderTwin();
      });
      box.appendChild(b);
    });
  }
  function renderSummary() {
    var e = curEmp(), box = $('summary');
    if (!e) { box.textContent = 'Нет данных'; return; }
    var bad = e.items.filter(function (i) { return eff(i, S.dt) !== 'Годен'; }).length;
    box.textContent = bad === 0 ? '✔ Все СИЗ в норме. Сроки не нарушены.' : '▲ Требуют внимания: ' + bad + ' из ' + e.items.length + '.';
  }
  function renderList() {
    var box = $('ppeList'); box.textContent = '';
    var e = curEmp();
    if (!e) { box.appendChild(h('p', 'muted', 'Нет данных')); return; }
    ORDER.forEach(function (k) {
      var it = itemOf(k);
      if (!it || (S.filter !== 'all' && S.filter !== k)) return;
      var b = h('button', 'ppe'); b.type = 'button';
      b.setAttribute('aria-pressed', String(S.sel === k));
      b.appendChild(h('span', 'ico', KINDS[k][1]));
      var d = h('span', '');
      d.appendChild(h('strong', '', KINDS[k][0])); d.appendChild(document.createElement('br'));
      d.appendChild(chip(it));
      d.appendChild(h('small', '', '№ RFID: ' + it.rfid));
      d.appendChild(h('small', '', 'До: ' + (validDate(it.wearUntil) ? fmtD(it.wearUntil) : '—')));
      b.appendChild(d);
      b.addEventListener('click', function () { S.sel = k; renderTwin(); });
      box.appendChild(b);
    });
  }
  function renderModel() {
    document.querySelectorAll('#model .part').forEach(function (g) {
      var k = g.dataset.kind, it = itemOf(k), s = it ? eff(it, S.dt) : null;
      g.setAttribute('class', 'part ' + (s ? CLS[s] : 'none') + (S.sel === k ? ' sel' : ''));
      g.setAttribute('aria-label', KINDS[k][0] + (s ? ': ' + s : ': нет данных'));
      g.setAttribute('aria-pressed', String(S.sel === k));
    });
  }
  function renderDetail() {
    var box = $('detail'); box.textContent = '';
    var it = S.sel ? itemOf(S.sel) : null;
    if (!it) { box.textContent = curEmp() ? 'Выберите элемент экипировки.' : 'Нет данных'; return; }
    box.appendChild(h('strong', '', KINDS[S.sel][0] + ' '));
    box.appendChild(chip(it));
    box.appendChild(h('div', '', 'RFID: ' + it.rfid + ' · ' + (LOC[it.location] || 'место неизвестно')));
    box.appendChild(h('div', '', 'Годен до: ' + (validDate(it.wearUntil) ? fmtD(it.wearUntil) : '—') + ' · стирок: ' + (typeof it.washCycles === 'number' ? it.washCycles : '—')));
  }
  function renderTwin() { renderEmployee(); renderCats(); renderSummary(); renderList(); renderModel(); renderDetail(); }

  function renderRows() {
    var tb = $('rows'); tb.textContent = '';
    S.emps.forEach(function (e) {
      e.items.forEach(function (it) {
        var tr = document.createElement('tr');
        var k = KINDS[it.kind];
        [it.rfid, e.name, k ? k[0] : '—', LOC[it.location] || '—'].forEach(function (v) { tr.appendChild(h('td', '', v)); });
        var td = h('td', ''); td.appendChild(chip(it)); tr.appendChild(td);
        tr.appendChild(h('td', '', validDate(it.wearUntil) ? fmtD(it.wearUntil) : '—'));
        tr.appendChild(h('td', '', typeof it.washCycles === 'number' ? String(it.washCycles) : '—'));
        tb.appendChild(tr);
      });
    });
  }
  function renderEmpSel() {
    var sel = $('empSel'); sel.textContent = '';
    S.emps.forEach(function (e, i) { var o = h('option', '', e.name); o.value = i; sel.appendChild(o); });
    sel.value = S.emp;
  }
  function clearAll() {
    S.emps = []; S.sel = null; S.emp = 0;
    resetMetrics(); renderEmpSel(); renderTwin(); renderRows();
  }

  /* ===== Загрузка ===== */
  function load() {
    if (busy) return;
    setBusy(true); clearAll();
    setStatus('loading', 'Загрузка…', '');
    var mode = new URLSearchParams(location.search).get('mode') || 'ok';
    var ctl = new AbortController(), timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctl.abort(); }, TIMEOUT_MS);

    simulateApi(mode, ctl.signal).then(function (payload) {
      var p = parse(payload);
      $('dataTime').textContent = stamp(new Date(p.dt));
      if (p.emps.length === 0) { setStatus('empty', 'Нет данных', 'Система вернула пустой список сотрудников.'); return; }
      S.emps = p.emps; S.dt = p.dt; S.emp = 0; S.sel = null;
      var all = [];
      p.emps.forEach(function (e) { all = all.concat(e.items); });
      var m = metrics(all, p.dt);
      setMetric(1, m.t); setMetric(2, m.s); setMetric(3, m.r);
      renderEmpSel(); renderTwin(); renderRows();
      lastOk = new Date(); $('loadTime').textContent = stamp(lastOk);
      var miss = [m.t, m.s, m.r].filter(function (x) { return x === null; }).length;
      setStatus('ok', miss ? 'Данные получены частично' : 'Данные получены', miss ? 'Часть показателей недоступна: в данных не хватает полей.' : 'Ответ имитации API прошёл проверку.');
    }).catch(function (err) {
      $('dataTime').textContent = '—';
      var msg = timedOut ? 'Превышено время ожидания (15 с).' : (err && err.message) || 'Неизвестная ошибка.';
      setStatus('error', 'Ошибка загрузки', msg + ' Старые значения скрыты.' + (lastOk ? ' Последняя успешная загрузка: ' + stamp(lastOk) + '.' : ''));
    }).then(function () { clearTimeout(timer); setBusy(false); });
  }

  /* ===== События ===== */
  $('refreshBtn').addEventListener('click', load);
  $('retryBtn').addEventListener('click', load);
  $('empSel').addEventListener('change', function (e) { S.emp = Number(e.target.value); S.sel = null; S.filter = 'all'; renderTwin(); });
  document.querySelectorAll('#model .part').forEach(function (g) {
    var pick = function () { if (itemOf(g.dataset.kind)) { S.sel = g.dataset.kind; renderTwin(); } };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.nav-btn').forEach(function (x) { x.removeAttribute('aria-current'); });
      b.setAttribute('aria-current', 'page');
      document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + b.dataset.view; });
    });
  });

  load();
})();