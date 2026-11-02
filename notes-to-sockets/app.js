// ================================================================
//  Sockets, explained visually. Plain JavaScript, no libraries.
//  Sections below follow the chapters in index.html.
// ================================================================

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setCap = (id, html) => { $(id).innerHTML = html; };

/**
 * Fly a small label from one element to another inside a stage.
 * Resolves true when it arrived, false when it was "lost" on the way.
 */
function fly(stage, from, to, label, { cls = '', dur = 800, lost = false } = {}) {
  const s = stage.getBoundingClientRect();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();

  const p = document.createElement('div');
  p.className = `packet ${cls}`;
  p.textContent = label;
  stage.appendChild(p);

  const w = p.offsetWidth, h = p.offsetHeight;
  const at = (r) => ({
    x: r.left - s.left + r.width / 2 - w / 2,
    y: r.top - s.top + r.height / 2 - h / 2,
  });
  const start = at(a), end = at(b);
  const t = (x, y) => `translate(${x}px, ${y}px)`;

  let frames;
  if (lost) {
    // travels 60% of the way, then vanishes
    const mx = start.x + (end.x - start.x) * 0.6;
    const my = start.y + (end.y - start.y) * 0.6;
    p.textContent = label + ' ✖';
    frames = [
      { transform: t(start.x, start.y), opacity: 1 },
      { transform: t(mx, my), opacity: 1, offset: 0.7 },
      { transform: t(mx, my + 14), opacity: 0 },
    ];
  } else {
    frames = [{ transform: t(start.x, start.y) }, { transform: t(end.x, end.y) }];
  }

  return p.animate(frames, { duration: dur, easing: 'ease-in-out', fill: 'forwards' })
    .finished.then(() => { p.remove(); return !lost; });
}

const clearPackets = (stage) => stage.querySelectorAll('.packet').forEach((p) => p.remove());
const setNode = (el, state) => { el.classList.remove('on', 'warn', 'bad'); if (state) el.classList.add(state); };

/** Makes a "Next step / Reset" player out of a list of async step functions. */
function stepper({ next, reset, steps, onReset }) {
  let i = 0, busy = false;
  $(next).onclick = async () => {
    if (busy || i >= steps.length) return;
    busy = true;
    await steps[i]();
    i++;
    busy = false;
    if (i >= steps.length) $(next).disabled = true;
  };
  $(reset).onclick = () => { i = 0; busy = false; $(next).disabled = false; onReset(); };
}

// ================================================================
//  Page behaviour: reveal on scroll, progress bar, active menu link
// ================================================================
const revealer = new IntersectionObserver((entries) => {
  entries.forEach((e) => e.isIntersecting && e.target.classList.add('show'));
}, { threshold: 0 });
document.querySelectorAll('.reveal').forEach((el) => revealer.observe(el));

const links = [...document.querySelectorAll('#menu a')];
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
  });
}, { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('.chapter').forEach((c) => spy.observe(c));

addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  $('progress').style.width = (scrollY / max) * 100 + '%';
});

// ================================================================
//  Hero: two computers saying hi forever
// ================================================================
(async function heroLoop() {
  const stage = $('heroStage');
  while (true) {
    await fly(stage, $('hA'), $('hB'), 'Hi! 👋', { cls: 'green', dur: 1400 });
    await fly(stage, $('hB'), $('hA'), 'Hey! 😄', { cls: 'pink', dur: 1400 });
  }
})();

// ================================================================
//  Chapter 1: letters (HTTP) vs phone call (socket)
// ================================================================
$('httpAsk').onclick = async () => {
  const st = $('httpStage');
  setCap('httpCap', 'Client sends a request…');
  await fly(st, $('httpC'), $('httpS'), 'GET /news');
  await fly(st, $('httpS'), $('httpC'), '200 OK', { cls: 'green' });
  setCap('httpCap', '✅ Server answered. <b>Now the line is closed again.</b> For more news the client must ask again.');
};
$('httpPush').onclick = async () => {
  const st = $('httpStage');
  setCap('httpCap', 'Server has news and tries to send it…');
  setNode($('httpS'), 'warn');
  await fly(st, $('httpS'), $('httpC'), 'News!', { cls: 'orange', lost: true });
  setNode($('httpS'), 'bad');
  setCap('httpCap', '❌ Not possible. In HTTP the server can only <b>answer</b>, never start. It must wait until the client asks.');
  await sleep(1200);
  setNode($('httpS'), null);
};
$('sockAsk').onclick = async () => {
  await fly($('sockStage'), $('sockC'), $('sockS'), 'Hello server');
  setCap('sockCap', '✅ Client spoke. The line is still open.');
};
$('sockPush').onclick = async () => {
  await fly($('sockStage'), $('sockS'), $('sockC'), 'New message!', { cls: 'green' });
  setCap('sockCap', '✅ Server spoke first, with no request. <b>This is the magic of sockets.</b>');
};

// ================================================================
//  Chapter 2: layers + wrapping a message
// ================================================================
const LAYERS = [
  { n: 5, name: 'Application', small: 'HTTP · WebSocket · Socket.IO', info: '<b>Application layer.</b> Your chat app lives here. It decides <i>what</i> the message means ("send chat text"). HTTP, WebSocket and Socket.IO are rules at this level.' },
  { n: 4, name: 'Transport', small: 'TCP · UDP', info: '<b>Transport layer.</b> Gets data from <i>program to program</i> using <b>ports</b>. TCP also fixes lost or out-of-order packets. <b>Sockets live at the border of this layer.</b>' },
  { n: 3, name: 'Network (Internet)', small: 'IP', info: '<b>Network layer.</b> Gets data from <i>computer to computer</i> across the world using <b>IP addresses</b>. Routers pick the path hop by hop.' },
  { n: 2, name: 'Link', small: 'Wi-Fi · Ethernet', info: '<b>Link layer.</b> Moves data between two devices that are directly connected, like your laptop and your router.' },
  { n: 1, name: 'Physical', small: 'cables · radio waves · light', info: '<b>Physical layer.</b> The real signals: electricity in copper, light in fibre, radio in the air. Just 0s and 1s.' },
];
const layersBox = $('layers');
LAYERS.forEach((L) => {
  const d = document.createElement('div');
  d.className = 'layer';
  d.innerHTML = `<span class="n">${L.n}</span><div><b>${L.name}</b><small>${L.small}</small></div>`;
  d.onclick = () => {
    layersBox.querySelectorAll('.layer').forEach((x) => x.classList.remove('active'));
    d.classList.add('active');
    setCap('layerInfo', L.info);
  };
  layersBox.appendChild(d);
});

// nested "envelopes": 0 = just data ... 3 = all headers added
let wrapLevel = 0;
function drawWrap() {
  const box = (label, color, inner) =>
    `<div style="border:2px solid ${color};border-radius:12px;padding:12px;background:${color}22;transition:.4s"><div style="font-size:12px;color:${color};margin-bottom:6px;font-weight:700">${label}</div>${inner}</div>`;
  let html = `<div class="packet green" style="position:static;display:inline-block;font-size:15px">"hello" (your data)</div>`;
  if (wrapLevel >= 1) html = box('TCP header: from port 51234 → to port 5000', '#ffb454', html);
  if (wrapLevel >= 2) html = box('IP header: from 192.168.1.5 → to 203.0.113.9', '#5b8cff', html);
  if (wrapLevel >= 3) html = box('Wi-Fi frame header: to router MAC address', '#ff7ad9', html);
  $('wrapBox').innerHTML = html;
}
$('wrapBtn').onclick = () => { wrapLevel = Math.min(3, wrapLevel + 1); drawWrap(); };
$('unwrapBtn').onclick = () => { wrapLevel = Math.max(0, wrapLevel - 1); drawWrap(); };
drawWrap();

// ================================================================
//  Chapter 3: doors (ports)
// ================================================================
const PORTS = [
  { port: 80, text: '<b>Port 80</b>: normal web pages (HTTP).' },
  { port: 443, text: '<b>Port 443</b>: secure web pages (HTTPS). Encrypted.' },
  { port: 5173, text: '<b>Port 5173</b>: our <b>Vite</b> dev server. It serves the React page and forwards <code>/api</code> and <code>/socket.io</code> to port 5000.' },
  { port: 5000, text: '<b>Port 5000</b>: our <b>Node.js + Express + Socket.IO</b> server. The chat brain.' },
  { port: 27017, text: '<b>Port 27017</b>: <b>MongoDB</b> database. Only our server talks to it.' },
];
PORTS.forEach((p) => {
  const b = document.createElement('button');
  b.className = 'btn small ghost';
  b.textContent = '🚪 ' + p.port;
  b.onclick = () => {
    $('doors').querySelectorAll('button').forEach((x) => x.classList.remove('ghost') || x.classList.add('ghost'));
    b.classList.remove('ghost');
    setCap('doorInfo', `🏢 <code>127.0.0.1:${p.port}</code> → ${p.text}`);
  };
  $('doors').appendChild(b);
});

// ================================================================
//  Chapter 4: TCP handshake + packet loss
// ================================================================
const tcpStage = $('tcpStage');
function resetTcp() {
  clearPackets(tcpStage);
  $('tcpStage').querySelector('.pipe').classList.remove('open');
  setNode($('tcpC'), null); setNode($('tcpS'), null);
  $('tcpCs').textContent = 'closed'; $('tcpSs').textContent = 'listening';
  setCap('tcpCap', 'Press <b>Next step</b>.');
}
stepper({
  next: 'tcpNext', reset: 'tcpReset', onReset: resetTcp,
  steps: [
    async () => {
      $('tcpCs').textContent = 'SYN sent';
      setCap('tcpCap', '<b>1. SYN</b>: Client says <i>"Hello, can we talk? My counting starts at 100."</i>');
      await fly(tcpStage, $('tcpC'), $('tcpS'), 'SYN seq=100', { cls: 'orange' });
      $('tcpSs').textContent = 'SYN received';
    },
    async () => {
      setCap('tcpCap', '<b>2. SYN-ACK</b>: Server says <i>"Yes, I heard you (101). My counting starts at 500."</i>');
      await fly(tcpStage, $('tcpS'), $('tcpC'), 'SYN-ACK 500, ack=101', { cls: 'purple' });
      $('tcpCs').textContent = 'SYN-ACK received';
    },
    async () => {
      setCap('tcpCap', '<b>3. ACK</b>: Client says <i>"Great, I heard you too (501)."</i>');
      await fly(tcpStage, $('tcpC'), $('tcpS'), 'ACK ack=501', { cls: 'green' });
      tcpStage.querySelector('.pipe').classList.add('open');
      setNode($('tcpC'), 'on'); setNode($('tcpS'), 'on');
      $('tcpCs').textContent = 'ESTABLISHED'; $('tcpSs').textContent = 'ESTABLISHED';
      setCap('tcpCap', '✅ <b>Connection open!</b> Both sides are sure the other is alive. Total cost: 1.5 trips across the network.');
    },
    async () => {
      setCap('tcpCap', 'Now real data flows. Every byte has a number, so the receiver can spot missing pieces and ask again.');
      await fly(tcpStage, $('tcpC'), $('tcpS'), '"hello" #101', { cls: 'blue' });
      await fly(tcpStage, $('tcpS'), $('tcpC'), 'ACK 106', { cls: 'green' });
    },
    async () => {
      setCap('tcpCap', '<b>FIN</b>: Someone says <i>"I am done."</i> The other side agrees and the pipe closes politely.');
      await fly(tcpStage, $('tcpC'), $('tcpS'), 'FIN', { cls: 'red' });
      await fly(tcpStage, $('tcpS'), $('tcpC'), 'FIN-ACK', { cls: 'red' });
      tcpStage.querySelector('.pipe').classList.remove('open');
      setNode($('tcpC'), null); setNode($('tcpS'), null);
      $('tcpCs').textContent = 'closed'; $('tcpSs').textContent = 'closed';
    },
  ],
});

$('lossGo').onclick = async () => {
  $('lossGo').disabled = true;
  const LOSS = 0.34;
  let tcpGot = 0, udpGot = 0, resent = 0, udpLost = 0;
  const upd = () => {
    $('lossTr').textContent = `got: ${tcpGot}/6`;
    $('lossUr').textContent = `got: ${udpGot}/6`;
  };
  upd();

  const tcp = async () => {
    for (let i = 1; i <= 6; i++) {
      let arrived = false;
      while (!arrived) {
        const lost = Math.random() < LOSS;
        arrived = await fly($('lossT'), $('lossTC'), $('lossTS'), '#' + i, { cls: lost ? 'red' : 'blue', lost, dur: 600 });
        if (!arrived) resent++;
      }
      tcpGot++; upd();
    }
  };
  const udp = async () => {
    for (let i = 1; i <= 6; i++) {
      const lost = Math.random() < LOSS;
      const ok = await fly($('lossU'), $('lossUC'), $('lossUS'), '#' + i, { cls: lost ? 'red' : 'blue', lost, dur: 600 });
      if (ok) udpGot++; else udpLost++;
      upd();
      await sleep(150);
    }
  };
  await Promise.all([tcp(), udp()]);
  setNode($('lossTS'), 'on');
  setNode($('lossUS'), udpGot === 6 ? 'on' : 'bad');
  setCap('lossCap', `📦 TCP: all 6 arrived (it had to <b>send again ${resent} time${resent === 1 ? '' : 's'}</b>). 📢 UDP: <b>${udpLost} lost</b>, nobody noticed or resent. Run it again for a different result.`);
  $('lossGo').disabled = false;
  await sleep(1500);
  setNode($('lossTS'), null); setNode($('lossUS'), null);
};

// ================================================================
//  Chapter 5: life of a socket (with code highlighting)
// ================================================================
const lifeStage = $('lifeStage');
function highlight(line) {
  document.querySelectorAll('#srvCode [data-l], #cliCode [data-l]').forEach((s) =>
    s.classList.toggle('hl', Number(s.dataset.l) === line));
}
function resetLife() {
  clearPackets(lifeStage);
  lifeStage.querySelector('.pipe').classList.remove('open');
  setNode($('lifeC'), null); setNode($('lifeS'), null);
  $('lifeCs').textContent = 'nothing yet'; $('lifeSs').textContent = 'nothing yet';
  highlight(-1);
  setCap('lifeCap', 'Press <b>Next step</b>.');
}
stepper({
  next: 'lifeNext', reset: 'lifeReset', onReset: resetLife,
  steps: [
    async () => { highlight(0); setCap('lifeCap', 'Server loads <code>socket.io</code>, client loads <code>socket.io-client</code>. They already know how to talk to each other.'); },
    async () => {
      highlight(1);
      setNode($('lifeS'), 'warn');
      $('lifeSs').textContent = 'listening on :5000';
      setCap('lifeCap', '<b>Server:</b> <code>new Server(5000)</code> asks the OS for a TCP socket, <b>binds</b> port 5000 and <b>listens</b>. It now just waits.');
    },
    async () => {
      highlight(2);
      $('lifeSs').textContent = 'waiting for clients';
      setCap('lifeCap', '<b>Server:</b> <code>io.on("connection", ...)</code> registers what to do when a client arrives. Nothing happens yet, it is only a plan.');
    },
    async () => {
      highlight(3);
      $('lifeCs').textContent = 'connecting…';
      setCap('lifeCap', '<b>Client:</b> <code>io("http://localhost:5000")</code>. Under the hood: TCP handshake, then Socket.IO’s HTTP handshake, then an upgrade to WebSocket (chapters 4, 7, 10).');
      await fly(lifeStage, $('lifeC'), $('lifeS'), 'TCP handshake', { cls: 'orange', dur: 600 });
      await fly(lifeStage, $('lifeS'), $('lifeC'), 'sid + settings', { cls: 'purple', dur: 600 });
      await fly(lifeStage, $('lifeC'), $('lifeS'), 'upgrade → WebSocket', { cls: 'green', dur: 600 });
      lifeStage.querySelector('.pipe').classList.add('open');
      setNode($('lifeC'), 'on'); setNode($('lifeS'), 'on');
      $('lifeCs').textContent = 'connected'; $('lifeSs').textContent = '1 client connected';
      setCap('lifeCap', '✅ The server’s <code>"connection"</code> callback runs with a <code>socket</code> for this client. The client’s <code>"connect"</code> event fires. Pipe is open!');
    },
    async () => {
      highlight(4);
      setCap('lifeCap', '<b>Client</b> emits event <code>"chat"</code> with "hello". The server’s <code>socket.on("chat")</code> runs. On the wire: <code>42["chat","hello"]</code>.');
      await fly(lifeStage, $('lifeC'), $('lifeS'), 'chat: "hello"', { cls: 'blue' });
      $('lifeSs').textContent = 'got "hello"';
    },
    async () => {
      highlight(5);
      setCap('lifeCap', '<b>Server</b> emits <code>"chat"</code> back with "echo: hello". The client’s <code>socket.on("chat")</code> runs and prints it.');
      await fly(lifeStage, $('lifeS'), $('lifeC'), 'chat: "echo: hello"', { cls: 'green' });
      $('lifeCs').textContent = 'got echo';
    },
    async () => {
      highlight(6);
      setCap('lifeCap', '<b>Client</b> calls <code>disconnect()</code>. The server’s <code>"disconnect"</code> event runs and it forgets this socket and its rooms.');
      await fly(lifeStage, $('lifeC'), $('lifeS'), 'close', { cls: 'red', dur: 600 });
      lifeStage.querySelector('.pipe').classList.remove('open');
      setNode($('lifeC'), null); setNode($('lifeS'), 'warn');
      $('lifeCs').textContent = 'disconnected'; $('lifeSs').textContent = 'waiting for clients';
    },
  ],
});

// ================================================================
//  Chapter 6: polling vs long polling vs SSE vs WebSocket
// ================================================================
const MODES = {
  polling: { name: 'Polling', info: 'Client asks <b>every second</b>: "anything new?" Most answers are "no".' },
  long: { name: 'Long polling', info: 'Client asks once. Server <b>holds the answer</b> until it has news, then client asks again.' },
  sse: { name: 'SSE', info: 'One request stays open. Server <b>streams</b> news whenever it wants (one direction).' },
  ws: { name: 'WebSocket', info: 'Upgrade once. Then a <b>two-way</b> pipe stays open forever.' },
};
let evoMode = 'polling', evoRun = 0;
Object.entries(MODES).forEach(([key, m]) => {
  const b = document.createElement('button');
  b.className = 'btn small ' + (key === evoMode ? '' : 'ghost');
  b.textContent = m.name;
  b.onclick = () => {
    evoMode = key; evoRun++;
    $('evoTabs').querySelectorAll('button').forEach((x) => x.classList.add('ghost'));
    b.classList.remove('ghost');
    resetEvo();
    setCap('evoCap', m.info);
  };
  $('evoTabs').appendChild(b);
});
function resetEvo() {
  clearPackets($('evoStage'));
  $('evoPipe').classList.remove('open');
  setNode($('evoC'), null); setNode($('evoS'), null);
  $('evoReq').textContent = '0'; $('evoDelay').textContent = '–';
  $('evoGo').disabled = false;
}
$('evoGo').onclick = async () => {
  resetEvo();
  const run = ++evoRun;
  const alive = () => run === evoRun;
  const st = $('evoStage'), C = $('evoC'), S = $('evoS');
  $('evoGo').disabled = true;
  setCap('evoCap', MODES[evoMode].info);
  let requests = 0;
  const addReq = () => { requests++; $('evoReq').textContent = requests; };
  const t0 = performance.now();
  const NEWS_AT = 2500;
  let newsTime = null;   // when the server got the news
  let gotTime = null;    // when the client got it
  const got = () => { gotTime = performance.now() - t0; setNode(C, 'on'); $('evoDelay').textContent = Math.max(0, (gotTime - newsTime) / 1000).toFixed(1) + ' s'; };
  const newsHappens = (async () => { await sleep(NEWS_AT); if (alive()) { newsTime = performance.now() - t0; setNode(S, 'warn'); } })();

  if (evoMode === 'polling') {
    while (performance.now() - t0 < 6000 && alive()) {
      addReq();
      await fly(st, C, S, 'any news?', { dur: 350 });
      const hasNews = newsTime !== null && gotTime === null;
      await fly(st, S, C, hasNews ? '💬 NEWS!' : 'no', { cls: hasNews ? 'green' : 'red', dur: 350 });
      if (hasNews) got();
      await sleep(300);
    }
  } else if (evoMode === 'long') {
    addReq();
    await fly(st, C, S, 'any news? (wait)', { dur: 350 });
    setCap('evoCap', 'Server is <b>holding</b> the request open…');
    while (newsTime === null && alive()) await sleep(50);
    if (alive()) {
      await fly(st, S, C, '💬 NEWS!', { cls: 'green', dur: 350 });
      got();
      addReq();
      await fly(st, C, S, 'any news? (wait)', { dur: 350 });
      setCap('evoCap', 'Client already re-asked. Each cycle repeats full HTTP headers.');
    }
  } else {
    addReq();
    await fly(st, C, S, evoMode === 'sse' ? 'GET /events' : 'Upgrade: websocket', { dur: 350 });
    await fly(st, S, C, evoMode === 'sse' ? '200 stream' : '101 Switching', { cls: 'green', dur: 350 });
    $('evoPipe').classList.add('open');
    while (newsTime === null && alive()) await sleep(50);
    if (alive()) {
      await fly(st, S, C, '💬 NEWS!', { cls: 'green', dur: 350 });
      got();
      if (evoMode === 'ws') {
        await sleep(400);
        await fly(st, C, S, 'thanks!', { cls: 'pink', dur: 350 });
        setCap('evoCap', 'Client replied on the <b>same</b> pipe. Two-way, one request in total.');
      }
    }
  }
  await newsHappens;
  if (alive()) $('evoGo').disabled = false;
};

// ================================================================
//  Chapter 7: WebSocket upgrade handshake
// ================================================================
const wsStage = $('wsStage');
function resetWs() {
  clearPackets(wsStage);
  $('wsPipe').classList.remove('open');
  setNode($('wsC'), null); setNode($('wsS'), null);
  $('wsCs').textContent = 'HTTP'; $('wsSs').textContent = 'HTTP';
  $('wsCode').textContent = 'Press "Next step"';
  setCap('wsCap', 'Press <b>Next step</b>.');
}
stepper({
  next: 'wsNext', reset: 'wsReset', onReset: resetWs,
  steps: [
    async () => {
      $('wsCode').textContent =
`GET /chat HTTP/1.1
Host: localhost:5000
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13`;
      setCap('wsCap', '<b>1.</b> Browser sends a normal-looking HTTP request, with the special headers <code>Upgrade: websocket</code> and a random <code>Key</code>.');
      await fly(wsStage, $('wsC'), $('wsS'), 'HTTP GET + Upgrade', { cls: 'orange' });
    },
    async () => {
      $('wsCode').textContent =
`HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`;
      setCap('wsCap', '<b>2.</b> Server agrees: <code>101 Switching Protocols</code>. The <code>Accept</code> value is made from the browser\'s Key, which proves the server really understands WebSocket.');
      await fly(wsStage, $('wsS'), $('wsC'), '101 Switching', { cls: 'green' });
      $('wsPipe').classList.add('open');
      setNode($('wsC'), 'on'); setNode($('wsS'), 'on');
      $('wsCs').textContent = 'WebSocket'; $('wsSs').textContent = 'WebSocket';
    },
    async () => {
      $('wsCode').textContent = `Frame: [FIN=1] [opcode=text] [len=5] "hello"\n(only ~6 bytes of overhead!)`;
      setCap('wsCap', '<b>3.</b> Now both sides send <b>frames</b>, tiny packets with a 2–14 byte header. No more HTTP.');
      await fly(wsStage, $('wsC'), $('wsS'), '"hello"', { cls: 'blue' });
      await fly(wsStage, $('wsS'), $('wsC'), '"hi there"', { cls: 'pink' });
    },
    async () => {
      $('wsCode').textContent = `Frame: [opcode=ping]  →  Frame: [opcode=pong]`;
      setCap('wsCap', '<b>4.</b> Ping / pong frames check that the other side is still alive.');
      await fly(wsStage, $('wsS'), $('wsC'), 'ping 🏓', { cls: 'orange', dur: 600 });
      await fly(wsStage, $('wsC'), $('wsS'), 'pong 🏓', { cls: 'green', dur: 600 });
    },
    async () => {
      $('wsCode').textContent = `Frame: [opcode=close] code=1000 (normal closure)`;
      setCap('wsCap', '<b>5.</b> Either side sends a <b>close</b> frame with a code (1000 = all good). Then the TCP connection ends.');
      await fly(wsStage, $('wsC'), $('wsS'), 'close 1000', { cls: 'red' });
      $('wsPipe').classList.remove('open');
      setNode($('wsC'), null); setNode($('wsS'), null);
      $('wsCs').textContent = 'closed'; $('wsSs').textContent = 'closed';
    },
  ],
});

// ================================================================
//  Chapter 9: rooms playground
// ================================================================
const roomsOf = { Alice: new Set(['General', 'Games']), Bob: new Set(['General']), Cara: new Set(['Games']), Dev: new Set() };
const names = Object.keys(roomsOf);
function drawUsers() {
  const box = $('roomUsers');
  box.innerHTML = '';
  names.forEach((n) => {
    const d = document.createElement('div');
    d.className = 'user'; d.id = 'u-' + n;
    const badges = [...roomsOf[n]].map((r) => `<span class="badge ${r === 'Games' ? 'b2' : ''}">#${r}</span>`).join('') || '<span class="muted" style="color:var(--muted)">no rooms</span>';
    d.innerHTML = `<div class="nm">${n}</div><div class="badges">${badges}</div><div class="inbox" id="in-${n}"></div>`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    ['General', 'Games'].forEach((r) => {
      const b = document.createElement('button');
      b.className = 'chip' + (roomsOf[n].has(r) ? ' on' : '');
      b.textContent = (roomsOf[n].has(r) ? 'leave ' : 'join ') + r;
      b.onclick = () => {
        roomsOf[n].has(r) ? roomsOf[n].delete(r) : roomsOf[n].add(r);
        drawUsers();
        setCap('roomCap', `<code>socket.${roomsOf[n].has(r) ? 'join' : 'leave'}("${r}")</code> ran for <b>${n}</b>.`);
      };
      row.appendChild(b);
    });
    d.appendChild(row);
    box.appendChild(d);
  });
  $('roomFrom').innerHTML = names.map((n) => `<option>${n}</option>`).join('');
}
drawUsers();
document.querySelectorAll('[data-send]').forEach((btn) => {
  btn.onclick = () => {
    const from = $('roomFrom').value, target = btn.dataset.send;
    if (target !== 'ALL' && !roomsOf[from].has(target)) {
      setCap('roomCap', `🚫 Server refuses: <b>${from}</b> is not a member of <b>#${target}</b>. (Our app checks this in MongoDB.)`);
      return;
    }
    const receivers = names.filter((n) => target === 'ALL' || roomsOf[n].has(target));
    receivers.forEach((n) => {
      $('u-' + n).classList.add('flash');
      $('in-' + n).textContent = `📩 "hi" from ${from}`;
    });
    setTimeout(() => document.querySelectorAll('.user').forEach((u) => u.classList.remove('flash')), 1100);
    const code = target === 'ALL' ? 'io.emit("msg", ...)' : `io.to("${target}").emit("msg", ...)`;
    setCap('roomCap', `<code>${code}</code> → delivered to <b>${receivers.join(', ') || 'nobody'}</b>.` +
      (target === 'ALL' ? ' Everyone gets it, even people in no room.' : ' Only members of the room get it.'));
  };
});

// ================================================================
//  Chapter 10: packet builder
// ================================================================
function drawPacket() {
  const ev = $('pkEvent').value, raw = $('pkData').value;
  const ns = $('pkNs').value, ack = $('pkAck').value;
  let data = raw;
  try { data = JSON.parse(raw); } catch { /* keep as plain string */ }
  const out = $('pkOut');
  out.innerHTML = '';
  const add = (text, cls) => {
    const s = document.createElement('span');
    s.className = cls; s.textContent = text; out.appendChild(s);
  };
  add('4', 'seg1'); add('2', 'seg1');
  if (ns) add(ns, 'seg2');
  if (ack) add(ack, 'seg3');
  add(JSON.stringify([ev, data]), 'seg2');
  $('pkExplain').innerHTML =
    '<span class="seg1" style="padding:2px 6px;border-radius:6px">4</span> Engine.IO: <b>message</b> &nbsp; ' +
    '<span class="seg1" style="padding:2px 6px;border-radius:6px">2</span> Socket.IO: <b>event</b> &nbsp; ' +
    (ns ? 'namespace <b>/chat</b> &nbsp; ' : '') +
    (ack ? '<span class="seg3" style="padding:2px 6px;border-radius:6px">7</span> ack id: the reply will come back as <code>37[...]</code> &nbsp; ' : '') +
    'then the <b>event name + your data</b> as JSON.';
}
['pkEvent', 'pkData', 'pkNs', 'pkAck'].forEach((id) => $(id).addEventListener('input', drawPacket));
drawPacket();

// ================================================================
//  Chapter 11: middleware gates
// ================================================================
(function middlewareDemo() {
  const st = $('mwStage');
  const ids = ['mwC', 'mw1', 'mw2', 'mw3', 'mwS'];
  let busy = false;
  const reset = () => ids.forEach((id) => setNode($(id), null));

  const SCENES = {
    ok: { failAt: -1 },
    badtoken: { failAt: 2, msg: 'Unauthorized', gate: 'Gate 2 (JWT) calls <code>next(new Error("Unauthorized"))</code>.' },
    flood: { failAt: 3, msg: 'Too many connections', gate: 'Gate 3 (rate limit) calls <code>next(new Error("Too many connections"))</code>.' },
  };

  document.querySelectorAll('[data-mw]').forEach((btn) => {
    btn.onclick = async () => {
      if (busy) return;
      busy = true; reset();
      const sc = SCENES[btn.dataset.mw];
      setNode($('mwC'), 'warn');
      setCap('mwCap', 'Client calls <code>io()</code>. The handshake reaches the server…');
      for (let g = 1; g <= 3; g++) {
        await fly(st, $(ids[g - 1]), $(ids[g]), g === 1 ? 'connect + auth' : 'next()', { cls: 'blue', dur: 550 });
        if (sc.failAt === g) {
          setNode($(ids[g]), 'bad');
          await fly(st, $(ids[g]), $('mwC'), 'connect_error', { cls: 'red', dur: 900 });
          setNode($('mwC'), 'bad');
          setCap('mwCap', `❌ ${sc.gate} The chain <b>stopped</b>. The client receives <code>connect_error</code> with message "<b>${sc.msg}</b>". Gates after it never run, and your <code>"connection"</code> handler never ran.`);
          busy = false; return;
        }
        setNode($(ids[g]), 'on');
        if (g === 2) setCap('mwCap', '🔑 Gate 2 verified the token and stored the user in <code>socket.data.user</code>, then called <code>next()</code>.');
      }
      await fly(st, $('mw3'), $('mwS'), 'next()', { cls: 'green', dur: 550 });
      setNode($('mwS'), 'on'); setNode($('mwC'), 'on');
      setCap('mwCap', '✅ All gates passed. Now <code>io.on("connection", ...)</code> runs and the client gets <code>connect</code>.');
      busy = false;
    };
  });
})();

// ================================================================
//  Chapter 12: binary size demo
// ================================================================
(function binaryDemo() {
  const LIMIT = 1_000_000; // maxHttpBufferSize default: 1 MB
  const range = $('binSize'), mode = $('binMode');
  const fmt = (b) => (b >= 1_000_000 ? (b / 1_000_000).toFixed(2) + ' MB' : (b / 1000).toFixed(0) + ' KB');
  const sizes = () => {
    const raw = Number(range.value) * 1000;
    const sent = mode.value === 'b64' ? Math.ceil(raw / 3) * 4 : raw;
    return { raw, sent };
  };
  function describe() {
    const { raw, sent } = sizes();
    $('binLabel').textContent = 'file: ' + fmt(raw);
    const over = sent > LIMIT;
    setCap('binCap',
      `File ${fmt(raw)} → sent as <b>${mode.value === 'b64' ? 'base64 text' : 'binary'}</b> = <b>${fmt(sent)}</b>` +
      (mode.value === 'b64' ? ' (+33%)' : '') +
      '. Limit is 1 MB → ' + (over ? '<b style="color:var(--red)">too big, the server will reject it</b>.' : '<b style="color:var(--green)">fits</b>.'));
  }
  range.oninput = mode.onchange = describe;
  describe();

  $('binSend').onclick = async () => {
    const st = $('binStage');
    const { sent } = sizes();
    $('binSend').disabled = true;
    setNode($('binC'), null); setNode($('binS'), null);
    if (mode.value === 'bin') {
      await fly(st, $('binC'), $('binS'), 'text: 51-["upload",{placeholder}]', { cls: 'blue', dur: 700 });
      await fly(st, $('binC'), $('binS'), 'binary frame ' + fmt(sent), { cls: sent > LIMIT ? 'red' : 'purple', dur: 800, lost: sent > LIMIT });
    } else {
      const ok = sent <= LIMIT;
      await fly(st, $('binC'), $('binS'), 'text: "iVBORw0KGgo…" ' + fmt(sent), { cls: ok ? 'orange' : 'red', dur: 900, lost: !ok });
    }
    if (sent > LIMIT) {
      setNode($('binS'), 'bad'); $('binSs').textContent = 'closed connection!';
      setCap('binCap', '❌ Message bigger than <code>maxHttpBufferSize</code>. The server <b>closes the connection</b> to protect its memory. The client sees <code>disconnect</code> and reconnects. Upload big files over HTTP instead.');
    } else {
      setNode($('binS'), 'on'); $('binSs').textContent = 'received ✔';
      setCap('binCap', mode.value === 'bin'
        ? '✅ Two frames arrived: a text frame with a placeholder, then the binary frame. Socket.IO glued them into <code>(meta, buffer)</code> for your handler.'
        : '✅ Arrived as one long text string. You must call <code>Buffer.from(str, "base64")</code> to get the bytes back.');
    }
    await sleep(1500);
    $('binSs').textContent = 'limit 1 MB'; setNode($('binS'), null);
    $('binSend').disabled = false;
  };
})();

// ================================================================
//  Chapter 13: CORS / origin check + connect_error scenarios
// ================================================================
(function corsDemo() {
  const out = () => {
    const page = $('orgPage').value, tr = $('orgTransport').value, chk = $('orgCheck').value;
    let ok, text;
    if (page === 'good') {
      ok = true; text = 'The page is from the site the server allows. Normal, allowed connection.';
    } else if (chk === 'yes') {
      ok = false; text = '<code>allowRequest</code> sees <code>Origin: https://evil.com</code> and answers "no". Refused for <b>both</b> transports.';
    } else if (tr === 'polling') {
      ok = false; text = 'The request is sent, but the server does not send <code>Access-Control-Allow-Origin: evil.com</code>. The <b>browser blocks</b> evil.com from reading the answer, so the handshake fails. CORS works here.';
    } else {
      ok = true; text = '<b>Connection succeeds!</b> Browsers do not apply CORS to WebSocket. If your login relied on cookies, evil.com could now act as the user. Add the <code>allowRequest</code> origin check (and use token auth).';
    }
    $('orgOut').innerHTML = (ok ? '✅ ' : '🚫 ') + text;
    $('orgOut').style.borderColor = (page === 'evil' && ok) ? 'var(--red)' : '';
  };
  ['orgPage', 'orgTransport', 'orgCheck'].forEach((id) => { $(id).onchange = out; });
  out();
})();

(function connectErrorDemo() {
  const CASES = [
    { name: 'Middleware says no', node: 'bad', send: 'connect + auth', reply: 'connect_error',
      html: '<b>Event:</b> <code>connect_error</code><br><b>err.message:</b> "Unauthorized"<br><b>socket.active:</b> <b style="color:var(--red)">false</b> → the library will <b>NOT</b> retry.<br><b>You do:</b> refresh the token, then call <code>socket.connect()</code>. If the refresh fails, send the user to login.' },
    { name: 'Server is down', node: 'warn', send: 'request', lost: true,
      html: '<b>Event:</b> <code>connect_error</code><br><b>err.message:</b> "websocket error" or "xhr poll error"<br><b>socket.active:</b> <b style="color:var(--green)">true</b> → retries automatically with growing waits.<br><b>You do:</b> show "Reconnecting…" and wait.' },
    { name: 'CORS blocked', node: 'warn', send: 'request', lost: true,
      html: '<b>Event:</b> <code>connect_error</code><br><b>err.message:</b> "xhr poll error" (the browser hides the details, look in the DevTools Console)<br><b>socket.active:</b> true, but it will <b>keep failing</b>.<br><b>You do:</b> fix <code>cors.origin</code> on the server (or use a same-origin proxy like our Vite setup).' },
    { name: 'Server kicked you', node: 'bad', send: 'connected', reply: 'disconnect',
      html: '<b>Event:</b> <code>disconnect</code><br><b>reason:</b> "io server disconnect"<br><b>Auto reconnect:</b> <b style="color:var(--red)">no</b>.<br><b>You do:</b> call <code>socket.connect()</code> yourself if it makes sense (or stay out if you were banned).' },
    { name: 'Wi-Fi dropped', node: 'warn', send: 'ping', lost: true,
      html: '<b>Event:</b> <code>disconnect</code> after about 45 s (or at once if the OS tells us)<br><b>reason:</b> "ping timeout" or "transport close"<br><b>Auto reconnect:</b> <b style="color:var(--green)">yes</b>, with backoff.<br><b>You do:</b> on the next <code>connect</code>, re-join rooms (<code>room:open</code>) and load missed messages.' },
  ];
  let busy = false;
  CASES.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'btn small ' + (i ? 'ghost' : '');
    b.textContent = c.name;
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      $('ceTabs').querySelectorAll('button').forEach((x) => x.classList.add('ghost'));
      b.classList.remove('ghost');
      setNode($('ceC'), null); setNode($('ceS'), null);
      setCap('ceOut', 'Trying…');
      await fly($('ceStage'), $('ceC'), $('ceS'), c.send, { cls: 'blue', dur: 600, lost: !!c.lost });
      if (c.reply) await fly($('ceStage'), $('ceS'), $('ceC'), c.reply, { cls: 'red', dur: 600 });
      setNode($('ceC'), c.node);
      setCap('ceOut', c.html);
      busy = false;
    };
    $('ceTabs').appendChild(b);
  });
  setCap('ceOut', 'Pick a failure above.');
})();

// ================================================================
//  Chapter 14: TLS handshake + spy
// ================================================================
(function tlsDemo() {
  const st = $('tlsStage');
  stepper({
    next: 'tlsNext', reset: 'tlsReset',
    onReset: () => {
      clearPackets(st); $('tlsPipe').classList.remove('open');
      setNode($('tlsC'), null); setNode($('tlsS'), null);
      $('tlsCs').textContent = 'plain'; $('tlsSs').textContent = 'has certificate';
      setCap('tlsCap', 'Press <b>Next step</b>.');
    },
    steps: [
      async () => {
        setCap('tlsCap', '<b>1. ClientHello:</b> Browser says <i>"Hi! I speak TLS 1.3. Here are the ciphers I know, and here is my half of a secret-making puzzle (key share)."</i>');
        await fly(st, $('tlsC'), $('tlsS'), 'ClientHello + key share', { cls: 'orange' });
      },
      async () => {
        setCap('tlsCap', '<b>2. ServerHello + Certificate:</b> Server picks a cipher, sends its half of the puzzle and its <b>certificate</b>. Both sides can now compute the <b>same secret key</b> without ever sending it.');
        await fly(st, $('tlsS'), $('tlsC'), 'ServerHello + certificate', { cls: 'purple' });
        $('tlsSs').textContent = 'key ready 🔑';
      },
      async () => {
        setCap('tlsCap', '<b>3. Browser checks the certificate:</b> Is it for <code>chat.example.com</code>? Not expired? Signed by a trusted CA? If any answer is "no" you get the red warning page.');
        setNode($('tlsC'), 'warn');
        await sleep(900);
        setNode($('tlsC'), 'on');
        $('tlsCs').textContent = 'cert OK, key ready 🔑';
      },
      async () => {
        setCap('tlsCap', '<b>4. Finished:</b> Both send a "Finished" message, already encrypted, to prove they got the same key.');
        await Promise.all([
          fly(st, $('tlsC'), $('tlsS'), 'Finished 🔒', { cls: 'green', dur: 700 }),
          fly(st, $('tlsS'), $('tlsC'), 'Finished 🔒', { cls: 'green', dur: 700 }),
        ]);
        $('tlsPipe').classList.add('open'); setNode($('tlsS'), 'on');
        $('tlsCs').textContent = 'encrypted'; $('tlsSs').textContent = 'encrypted';
      },
      async () => {
        setCap('tlsCap', '<b>5. Encrypted data:</b> Now the WebSocket upgrade, Socket.IO packets and your chat messages all travel inside the tunnel. A spy only sees scrambled bytes.');
        await fly(st, $('tlsC'), $('tlsS'), '🔒 GET /socket.io', { cls: 'blue' });
        await fly(st, $('tlsS'), $('tlsC'), '🔒 42["message:new"…]', { cls: 'pink' });
      },
    ],
  });

  const scramble = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(' ');
  $('tlsSend').onclick = async () => {
    const wss = $('tlsProto').value === 'wss';
    const st2 = $('spyStage');
    $('tlsSend').disabled = true;
    $('spyOut').textContent = 'The spy sees: …';
    await fly(st2, $('spyC'), $('spyEye'), wss ? '🔒 ???' : 'email=sam&password=abc123', { cls: wss ? 'green' : 'red', dur: 700 });
    $('spyOut').textContent = wss
      ? 'The spy sees:\n' + scramble(24) + '\n' + scramble(24) + '\n(random-looking bytes, useless)'
      : 'The spy sees:\n42["login",{"email":"sam","password":"abc123"}]\n(readable, and can even be changed on the way!)';
    setNode($('spyEye'), wss ? null : 'bad');
    await fly(st2, $('spyEye'), $('spyS'), wss ? '🔒 ???' : 'email=sam&password=abc123', { cls: wss ? 'green' : 'red', dur: 700 });
    await sleep(1200);
    setNode($('spyEye'), null);
    $('tlsSend').disabled = false;
  };
})();

// ================================================================
//  Chapter 15: server options (problem map, transports, heartbeat calculator, presets)
// ================================================================
(function optionsChapter() {
  // ---- "Which option solves my problem?" ----
  const PROBLEMS = [
    ['My site is on another domain', 'opt-cors'],
    ['Block other sites from WebSockets', 'opt-allowRequest'],
    ['Stop huge messages', 'opt-maxHttpBufferSize'],
    ['Notice dead users faster', 'opt-pingInterval'],
    ['Faster first connection', 'opt-transports'],
    ['Idle connections pile up', 'opt-connectTimeout'],
    ['Run many servers', 'opt-adapter'],
    ['Keep rooms after a short drop', 'opt-connectionStateRecovery'],
    ['Save bandwidth', 'opt-perMessageDeflate'],
    ['Use a custom URL', 'opt-path'],
  ];
  PROBLEMS.forEach(([label, target]) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.onclick = () => {
      const el = $(target);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1800);
    };
    $('optMap').appendChild(b);
  });

  // ---- Transports playground ----
  $('trGo').onclick = async () => {
    const st = $('trStage'), C = $('trC'), S = $('trS');
    const server = $('trServer').value, net = $('trNet').value;
    $('trGo').disabled = true;
    setNode(C, null); setNode(S, null); $('trCs').textContent = 'connecting…';
    setCap('trCap', 'Client (set to the same <code>transports</code>) connects…');

    const polling = async () => {
      await fly(st, C, S, 'GET /socket.io/?transport=polling', { cls: 'orange', dur: 600 });
      await fly(st, S, C, 'sid + upgrades:["websocket"]', { cls: 'green', dur: 600 });
    };

    if (server === 'poll') {
      await polling();
      setNode(C, 'warn'); setNode(S, 'warn'); $('trCs').textContent = 'polling';
      setCap('trCap', '🟡 Connected over <b>HTTP polling only</b>. Works everywhere, but every message costs a full HTTP request, so it is slower and heavier.');
    } else if (server === 'ws') {
      const ok = await fly(st, C, S, 'WebSocket upgrade', { cls: 'purple', dur: 700, lost: net === 'nows' });
      if (ok) {
        setNode(C, 'on'); setNode(S, 'on'); $('trCs').textContent = 'websocket';
        setCap('trCap', '🟢 <b>One step</b>: straight to WebSocket. Fastest start. No polling means no sticky-session worries with many servers.');
      } else {
        setNode(C, 'bad'); $('trCs').textContent = 'connect_error';
        setCap('trCap', '🔴 The office proxy blocks WebSocket and polling is not allowed, so <b>this user cannot connect at all</b> (<code>connect_error: websocket error</code>). WebSocket-only is a risk for users behind strict networks.');
      }
    } else {
      await polling();
      setNode(C, 'warn'); $('trCs').textContent = 'polling';
      setCap('trCap', 'Connected over polling first. Now the client tries to <b>upgrade</b>…');
      const ok = await fly(st, C, S, 'upgrade probe (ws)', { cls: 'purple', dur: 700, lost: net === 'nows' });
      if (ok) {
        setNode(C, 'on'); setNode(S, 'on'); $('trCs').textContent = 'websocket';
        setCap('trCap', '🟢 Upgrade worked. Connected over <b>WebSocket</b>. This default is the safest choice: it tries the best transport and falls back when needed.');
      } else {
        setNode(C, 'warn'); setNode(S, 'warn');
        setCap('trCap', '🟡 Upgrade was blocked by the proxy, but the user <b>is still connected over polling</b>. The default setting saved the day. This is why both transports are on by default.');
      }
    }
    $('trGo').disabled = false;
  };

  // ---- Heartbeat calculator ----
  const hcUpdate = () => {
    const I = Number($('hcInt').value), T = Number($('hcTo').value), N = Number($('hcUsers').value);
    $('hcIntLabel').textContent = I + ' s';
    $('hcToLabel').textContent = T + ' s';
    $('hcUsersLabel').textContent = N.toLocaleString();
    const perSec = N / I;
    const notes = [];
    if (I < 10) notes.push('⚠️ Very chatty. Mobile batteries and data will suffer.');
    if (I + T > 90) notes.push('⚠️ Dead users stay "online" for a long time.');
    notes.push(`Your reverse proxy idle timeout must be longer than <b>${I} s</b> (e.g. nginx <code>proxy_read_timeout ${I * 2}s</code>).`);
    setCap('hcOut',
      `⏱️ A silently dead connection is noticed within about <b>${I + T} seconds</b> (interval + timeout).<br>` +
      `📨 Each client gets a ping every ${I} s = <b>${Math.round(3600 / I)}</b> pings per hour.<br>` +
      `🖥️ With ${N.toLocaleString()} users the server sends about <b>${Math.round(perSec).toLocaleString()} pings/second</b> and receives the same number of pongs.<br>` +
      notes.join('<br>'));
  };
  ['hcInt', 'hcTo', 'hcUsers'].forEach((id) => { $(id).oninput = hcUpdate; });
  hcUpdate();

  // ---- Presets ----
  const PRESETS = [
    {
      name: 'Development (like our app now)',
      code: `const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", credentials: true },
});`,
      why: 'Minimum needed. Everything else uses safe defaults. Fine while learning and building.',
    },
    {
      name: 'Production chat (recommended for us)',
      code: `const io = new Server(httpServer, {
  cors: { origin: "https://chat.example.com", credentials: true },
  allowRequest: (req, cb) =>
    cb(null, req.headers.origin === "https://chat.example.com"),
  maxHttpBufferSize: 1e5,     // 100 KB, chat text is tiny
  connectTimeout: 10000,      // drop clients that never finish connecting
  serveClient: false,         // we bundle socket.io-client ourselves
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});`,
      why: 'Origin check stops cross-site WebSocket use. A small size limit and a short connect timeout protect memory. Recovery gives users their rooms and missed messages back after a short drop.',
    },
    {
      name: 'Small files / images',
      code: `const io = new Server(httpServer, {
  cors: { origin: "https://chat.example.com", credentials: true },
  maxHttpBufferSize: 5e6,                 // 5 MB per message
  perMessageDeflate: { threshold: 1024 }, // compress only bigger messages
});`,
      why: 'Only raise the limit if you really send small files over the socket. For anything big, upload over HTTP and send the URL. Compression helps text-like payloads, not already-compressed images.',
    },
    {
      name: 'Live game / presence',
      code: `const io = new Server(httpServer, {
  transports: ["websocket"],   // client: io({ transports: ["websocket"] })
  pingInterval: 10000,
  pingTimeout: 5000,           // dead player noticed in ~15 s
  perMessageDeflate: false,
  parser: require("socket.io-msgpack-parser"), // smaller packets than JSON
});`,
      why: 'WebSocket only for the fastest start, short heartbeat so "online" dots stay honest, and MessagePack to shrink frequent small updates. Both sides must use the same transports and parser.',
    },
    {
      name: 'Many servers',
      code: `const { createAdapter } = require("@socket.io/redis-adapter");

const io = new Server(httpServer, {
  transports: ["websocket"],            // no polling = no sticky sessions needed
  adapter: createAdapter(pubClient, subClient),
  cors: { origin: "https://chat.example.com", credentials: true },
});`,
      why: 'The adapter lets servers share broadcasts and rooms. WebSocket-only removes the need for sticky sessions. If you keep polling, configure sticky sessions on the load balancer (or the cookie option).',
    },
    {
      name: 'Behind nginx on a sub-path',
      code: `const io = new Server(httpServer, {
  path: "/api/chat-socket/",
  cors: { origin: "https://chat.example.com", credentials: true },
  allowRequest: (req, cb) =>
    cb(null, req.headers.origin === "https://chat.example.com"),
  pingInterval: 20000,   // keep below nginx proxy_read_timeout
});
// client: io({ path: "/api/chat-socket/" })
// nginx:  location /api/chat-socket/ { proxy_pass http://127.0.0.1:5000; ... Upgrade headers ... }`,
      why: 'The path must match in three places: server option, client option and the proxy location. The ping interval must stay shorter than the proxy idle timeout.',
    },
  ];
  PRESETS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'btn small ' + (i ? 'ghost' : '');
    b.textContent = p.name;
    b.onclick = () => {
      $('presetTabs').querySelectorAll('button').forEach((x) => x.classList.add('ghost'));
      b.classList.remove('ghost');
      $('presetCode').textContent = p.code;
      setCap('presetWhy', '💡 ' + p.why);
    };
    $('presetTabs').appendChild(b);
    if (i === 0) b.click();
  });
})();

// ================================================================
//  Chapter 16: server instance vs socket instance
// ================================================================
(function instancesChapter() {
  // ---------- Animation 1: who receives? ----------
  const SOCKETS = [
    { name: 'Alice · tab 1', id: 'a1f3', rooms: ['General', 'user:alice'] },
    { name: 'Alice · tab 2', id: 'b7c2', rooms: ['user:alice'] },
    { name: 'Bob', id: 'c9d4', rooms: ['General', 'user:bob'] },
    { name: 'Cara', id: 'd2e8', rooms: ['Games', 'user:cara'] },
  ];
  const box = $('whoSockets');
  SOCKETS.forEach((s, i) => {
    const n = document.createElement('div');
    n.className = 'node';
    n.id = 'whoN' + i;
    n.style.textAlign = 'left';
    n.innerHTML = `<b>${s.name}</b><small>socket.id = ${s.id}</small>` +
      s.rooms.map((r) => `<span class="badge ${r === 'Games' ? 'b2' : ''}">${r}</span>`).join('');
    box.appendChild(n);
  });

  const me = () => Number($('whoFrom').value);
  const markMe = () => SOCKETS.forEach((_, i) => {
    $('whoN' + i).style.outline = i === me() ? '2px dashed var(--pink)' : 'none';
    $('whoN' + i).style.outlineOffset = '3px';
  });
  $('whoFrom').onchange = markMe;
  markMe();

  const inRoom = (i, room) => SOCKETS[i].rooms.includes(room);
  const ALL = SOCKETS.map((_, i) => i);
  const STYLES = [
    { code: 'io.emit("x")', from: 'io', who: () => ALL, why: 'The <b>server instance</b> speaks to <b>everyone</b>.' },
    { code: 'socket.emit("x")', from: 'me', who: () => [me()], why: 'A <b>socket instance</b> speaks only to <b>its own client</b>.' },
    { code: 'socket.broadcast.emit("x")', from: 'me', who: () => ALL.filter((i) => i !== me()), why: 'Everyone <b>except</b> the sender.' },
    { code: 'io.to("General").emit("x")', from: 'io', who: () => ALL.filter((i) => inRoom(i, 'General')), why: 'Everyone <b>in the room</b> General, including the sender if they are in it.' },
    { code: 'socket.to("General").emit("x")', from: 'me', who: () => ALL.filter((i) => inRoom(i, 'General') && i !== me()), why: 'Room members <b>except the sender</b>. Perfect for "typing…" or "user joined".' },
    { code: 'io.to("user:alice").emit("x")', from: 'io', who: () => ALL.filter((i) => inRoom(i, 'user:alice')), why: 'A <b>per-user room</b> reaches <b>all tabs and devices</b> of that person.' },
    { code: 'io.except("General").emit("x")', from: 'io', who: () => ALL.filter((i) => !inRoom(i, 'General')), why: 'Everyone <b>not</b> in General.' },
    { code: 'io.to(socket.id).emit("x")', from: 'io', who: () => [me()], why: 'Every socket sits in a <b>private room named by its id</b>, so this reaches exactly one socket. You can use another socket\'s id too, from anywhere in your code.' },
  ];

  let busy = false;
  STYLES.forEach((st) => {
    const b = document.createElement('button');
    b.className = 'btn small ghost';
    b.style.fontFamily = 'Consolas, monospace';
    b.textContent = st.code;
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      SOCKETS.forEach((_, i) => setNode($('whoN' + i), null));
      setNode($('whoIO'), null);
      const stage = $('whoStage');
      const receivers = st.who();
      setCap('whoCap', `Running <code>${st.code}</code>…`);

      if (st.from === 'me') {
        await fly(stage, $('whoN' + me()), $('whoIO'), 'emit', { cls: 'pink', dur: 500 });
      }
      setNode($('whoIO'), 'warn');
      await Promise.all(receivers.map((i) => fly(stage, $('whoIO'), $('whoN' + i), 'x', { cls: 'green', dur: 700 })));
      receivers.forEach((i) => setNode($('whoN' + i), 'on'));
      setNode($('whoIO'), null);

      const names = receivers.map((i) => SOCKETS[i].name);
      setCap('whoCap',
        `<code>${st.code}</code> → ` +
        (names.length ? `received by <b>${names.join(', ')}</b>` : '<b>nobody</b>') +
        `.<br>${st.why}`);
      busy = false;
    };
    $('whoBtns').appendChild(b);
  });

  // ---------- Animation 2: life of a server-side socket ----------
  const stage = $('lcStage');
  let sock = null; // the "server-side socket" being drawn

  const drawState = () => {
    if (!sock) { $('lcState').textContent = '// nothing yet'; return; }
    const rooms = sock.rooms.map((r) => `"${r}"`).join(', ');
    $('lcState').textContent =
`Socket {
  id: "${sock.id}",
  connected: ${sock.connected},
  rooms: Set { ${rooms} },${sock.rooms.length ? '   // first one = its own private room' : ''}
  data: ${sock.data ? JSON.stringify(sock.data) : '{}'},
  handshake: {
    auth: { token: "eyJhbGci…" },
    address: "203.0.113.9",
    headers: { origin, user-agent… }
  },
  conn: { transport: "${sock.transport}" }
}`;
  };
  const drawList = () => {
    const l = $('lcList');
    l.innerHTML = '';
    if (!sock || !sock.alive) return;
    const n = document.createElement('div');
    n.className = 'node on';
    n.id = 'lcSock';
    n.innerHTML = `<b>socket</b><small>${sock.id}</small>` + sock.rooms.map((r) => `<span class="badge">${r}</span>`).join('');
    l.appendChild(n);
  };
  const countText = () => { $('lcIOs').textContent = sock && sock.alive ? '1 socket' : '0 sockets'; };

  function resetLife() {
    clearPackets(stage);
    sock = null;
    setNode($('lcC'), null); setNode($('lcIO'), null);
    $('lcCs').textContent = 'no socket';
    $('lcIOs').textContent = '0 sockets';
    drawList(); drawState();
    setCap('lcCap', 'Press <b>Next step</b>.');
  }

  stepper({
    next: 'lcNext', reset: 'lcReset', onReset: resetLife,
    steps: [
      async () => {
        $('lcCs').textContent = 'socket created, connected: false';
        setNode($('lcC'), 'warn');
        setCap('lcCap', '<b>1. Client:</b> <code>const socket = io()</code> creates the <b>client-side socket object</b>. It is not connected yet, and the server knows nothing about it.');
      },
      async () => {
        setCap('lcCap', '<b>2. Handshake arrives.</b> The server instance <code>io</code> runs its middleware (<code>io.use</code>) on the handshake data. No socket object exists yet.');
        $('lcState').textContent = '// middleware is running…\n// socket.handshake.auth = { token: "eyJhbGci…" }\n// (the socket object is only created if middleware calls next())';
        await fly(stage, $('lcC'), $('lcIO'), 'handshake + auth', { cls: 'orange', dur: 800 });
        setNode($('lcIO'), 'warn');
        $('lcIOs').textContent = 'running middleware…';
      },
      async () => {
        sock = { id: 'k3Jx9', connected: true, rooms: ['k3Jx9'], data: null, transport: 'polling', alive: true };
        setCap('lcCap', '<b>3. Socket instance is born.</b> Middleware said <code>next()</code>, so <code>io</code> creates a <b>server-side socket</b>, gives it a unique <code>id</code>, puts it in a <b>private room named by that id</b>, and fires <code>"connection"</code>.');
        await fly(stage, $('lcIO'), $('lcC'), 'connect  id=k3Jx9', { cls: 'green', dur: 800 });
        setNode($('lcIO'), 'on'); setNode($('lcC'), 'on');
        $('lcCs').textContent = 'connected, id k3Jx9';
        countText(); drawList(); drawState();
      },
      async () => {
        sock.data = { user: { id: 'u1', username: 'alice' } };
        setCap('lcCap', '<b>4. You store your own info.</b> Our middleware did <code>socket.data.user = user</code>. Every later handler on this socket can read it, with no database call. <code>socket.data</code> belongs to <b>this one socket</b>.');
        drawState();
      },
      async () => {
        sock.rooms.push('room:42');
        sock.transport = 'websocket';
        setCap('lcCap', '<b>5. Join a room.</b> The client sent <code>room:open</code>. The server checked membership in MongoDB, then called <code>socket.join("room:42")</code>. Meanwhile the transport upgraded to WebSocket.');
        await fly(stage, $('lcC'), $('lcIO'), 'room:open', { cls: 'blue', dur: 600 });
        drawList(); drawState();
      },
      async () => {
        setCap('lcCap', '<b>6. Talk.</b> <code>socket.on("message:send")</code> fires on <b>this socket</b>. Then the <b>server instance</b> broadcasts with <code>io.to("room:42").emit("message:new")</code>, which reaches every socket in that room, including this one.');
        await fly(stage, $('lcC'), $('lcIO'), 'message:send', { cls: 'blue', dur: 600 });
        await fly(stage, $('lcIO'), $('lcC'), 'message:new', { cls: 'pink', dur: 600 });
      },
      async () => {
        setCap('lcCap', '<b>7a. Tab closes.</b> First the <code>"disconnecting"</code> event fires. The socket object is <b>still alive</b> and <code>socket.rooms</code> is still full, so this is the moment to tell the room "Alice left".');
        await fly(stage, $('lcC'), $('lcIO'), 'close', { cls: 'red', dur: 600 });
        sock.connected = false;
        setNode($('lcC'), 'bad');
        $('lcCs').textContent = 'disconnected';
        drawState();
        await sleep(1800);
        setCap('lcCap', '<b>7b. Socket instance dies.</b> Now <code>"disconnect"</code> fires. The socket leaves all its rooms and is <b>removed from <code>io</code></b>. Everything in <code>socket.data</code> is gone. If the client comes back, it gets a <b>brand-new socket with a new id and no rooms</b>.');
        sock.rooms = []; sock.alive = false;
        $('lcState').textContent = '// object destroyed\n// rooms: gone\n// data: gone\n// a reconnect creates a NEW socket (new id)';
        setNode($('lcIO'), null);
        countText(); drawList();
      },
    ],
  });
  resetLife();
})();

// ================================================================
//  Chapter 17: heartbeat + reconnect
// ================================================================
(function heartbeat() {
  const st = $('hbStage'), C = $('hbC'), S = $('hbS');
  let cut = false, connected = true;
  const log = (t) => {
    const l = document.createElement('div');
    l.textContent = '• ' + t;
    $('hbLog').prepend(l);
  };
  const state = (ok) => {
    connected = ok;
    setNode(C, ok ? 'on' : 'bad'); setNode(S, ok ? 'on' : 'bad');
    $('hbPipe').classList.toggle('open', ok && !cut);
    $('hbCs').textContent = ok ? 'connected' : 'disconnected';
    $('hbSs').textContent = ok ? 'connected' : 'socket closed';
  };

  $('hbCut').onclick = () => {
    cut = true;
    $('hbCut').disabled = true; $('hbFix').disabled = false;
    $('hbPipe').classList.remove('open');
    setNode(C, 'warn'); setNode(S, 'warn');
    setCap('hbCap', '✂️ Network is cut. Pings will not get answered…');
    log('Network cut');
  };
  $('hbFix').onclick = () => {
    cut = false;
    $('hbCut').disabled = false; $('hbFix').disabled = true;
    log('Network restored');
  };

  (async function loop() {
    let missed = 0;
    while (true) {
      if (connected) {
        await sleep(1500);
        const ping = await fly(st, S, C, 'ping', { cls: 'orange', dur: 600, lost: cut });
        if (ping) {
          await fly(st, C, S, 'pong', { cls: 'green', dur: 600 });
          missed = 0;
        } else {
          missed++;
          log(`No pong (${missed}/2)`);
          if (missed >= 2) {
            state(false);
            setCap('hbCap', '💀 Server: <b>ping timeout</b>. It closes the socket and forgets its rooms. Client starts reconnecting with <b>growing waits</b>.');
            log('Ping timeout → disconnected');
            missed = 0;
          }
        }
      } else {
        // reconnect with exponential backoff (1s, 2s, 4s, 8s, 8s…) + a little random jitter
        for (let attempt = 0; !connected; attempt++) {
          const wait = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 400;
          log(`Reconnect attempt ${attempt + 1} in ${(wait / 1000).toFixed(1)}s`);
          await sleep(wait);
          const ok = await fly(st, C, S, 'connect?', { cls: 'pink', dur: 600, lost: cut });
          if (ok) {
            state(true);
            log('Reconnected with a NEW socket id. Rooms are empty, so the app must join again.');
            setCap('hbCap', '✅ Reconnected! Remember: it is a <b>new</b> socket, so send <code>room:open</code> again.');
          } else {
            log('Attempt failed');
          }
        }
      }
    }
  })();
})();

// ================================================================
//  Chapter 18: scaling with a Redis adapter
// ================================================================
(function scale() {
  const st = $('scaleStage');
  let redis = false;
  const nodes = ['scA', 'scB', 'scS1', 'scS2', 'scRedis', 'scLB'].map($);

  $('scToggle').onclick = () => {
    redis = !redis;
    $('scToggle').textContent = 'Redis adapter: ' + (redis ? 'ON' : 'OFF');
    $('scRedis').style.opacity = redis ? 1 : 0.25;
    setCap('scCap', redis ? 'Servers are now connected through Redis. Try again.' : 'Servers are islands again.');
  };
  $('scSend').onclick = async () => {
    $('scSend').disabled = true;
    nodes.forEach((n) => setNode(n, null));
    setCap('scCap', 'Alice is connected to Server 1 and sends "hi"…');
    await fly(st, $('scA'), $('scS1'), 'hi', { cls: 'blue', dur: 600 });
    setNode($('scS1'), 'on');
    await fly(st, $('scS1'), $('scA'), 'hi', { cls: 'green', dur: 500 });
    setNode($('scA'), 'on');

    if (!redis) {
      setNode($('scB'), 'bad');
      setCap('scCap', '❌ <code>io.emit()</code> on Server 1 only reaches <b>clients of Server 1</b>. Bob is on Server 2 and never sees the message. Turn the adapter ON.');
    } else {
      setCap('scCap', 'Server 1 publishes the message to Redis…');
      await fly(st, $('scS1'), $('scRedis'), 'publish', { cls: 'orange', dur: 600 });
      setNode($('scRedis'), 'warn');
      await fly(st, $('scRedis'), $('scS2'), 'hi', { cls: 'orange', dur: 600 });
      setNode($('scS2'), 'on');
      await fly(st, $('scS2'), $('scB'), 'hi', { cls: 'green', dur: 500 });
      setNode($('scB'), 'on');
      setCap('scCap', '✅ Redis passed the message to Server 2, which delivered it to Bob. The adapter makes many servers act like one.');
    }
    $('scSend').disabled = false;
  };
})();

// ================================================================
//  Chapter 20: attacks & defences lab (tabs + attack simulations)
// ================================================================
(function attackLab() {
  // ---------- Tabs ----------
  const TABS = [
    ['eaves', '🕵️ Eavesdropping'], ['cswsh', '🎭 Cross-site hijack'], ['token', '🎫 Tokens'],
    ['authz', '🚪 Room access'], ['spoof', '🥸 Spoofing'], ['inject', '💉 Injection'],
    ['flood', '🌊 Floods'], ['payload', '💥 Bad payloads'], ['leak', '🫗 Data leaks'], ['score', '📋 Our scorecard'],
  ];
  const tabBar = $('atkTabs');
  const show = (key) => {
    TABS.forEach(([k]) => $('tab-' + k).classList.toggle('active', k === key));
    tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
  };
  TABS.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.dataset.tab = key;
    b.textContent = label;
    b.onclick = () => show(key);
    tabBar.appendChild(b);
  });
  show('eaves');

  // ---------- Simulations ----------
  // Each op: [from, to, label, colour, lost?]   (nodes: A = attacker side, S = server, T = target)
  const SIMS = {
    eaves: {
      order: ['T', 'A', 'S'],
      nodes: { A: ['🕵️', 'Spy', 'on the Wi-Fi'], S: ['🖥️', 'Server', ''], T: ['👩', 'You', 'logging in'] },
      attack: { ops: [['T', 'A', 'password=abc123', 'red'], ['A', 'S', 'password=abc123', 'red']], state: { T: 'bad' },
        text: '😱 <b>No defence (ws://, http://):</b> the spy read the password in plain text and could have changed it. Plain text is a postcard.' },
      defend: { ops: [['T', 'A', '🔒 9f3a…c1', 'green'], ['A', 'S', '🔒 9f3a…c1', 'green']], state: { T: 'on', S: 'on' },
        text: '✅ <b>TLS (wss://, https://):</b> the spy only sees scrambled bytes. Any change is detected and the connection is dropped.' },
    },
    cswsh: {
      order: ['A', 'T', 'S'],
      nodes: { A: ['😈', 'evil.com', 'bad web page'], S: ['🖥️', 'Chat server', ''], T: ['👩', 'Victim browser', 'logged in'] },
      attack: { ops: [['T', 'A', 'opens evil.com', 'orange'], ['A', 'T', 'hidden script', 'red'], ['T', 'S', 'ws connect + cookie', 'orange'], ['S', 'T', 'connected as victim ✔', 'red'], ['T', 'A', "victim's messages", 'red']], state: { T: 'bad', S: 'bad' },
        text: '😱 <b>No origin check:</b> the browser attached the victim\'s cookie, the server trusted it, and the evil page now reads and sends messages as the victim.' },
      defend: { ops: [['T', 'A', 'opens evil.com', 'orange'], ['A', 'T', 'hidden script', 'red'], ['T', 'S', 'ws connect, Origin: evil.com', 'orange'], ['S', 'T', '403 refused ✖', 'green']], state: { S: 'on', T: 'on' },
        text: '✅ <b>Origin check + token auth:</b> the server sees <code>Origin: evil.com</code> and refuses. And without the token in <code>auth</code>, the evil page could not log in anyway.' },
    },
    token: {
      order: ['A', 'S', 'T'],
      nodes: { A: ['🥷', 'Attacker', 'no account'], S: ['🖥️', 'Server', ''], T: ['👩', 'Alice', 'real user'] },
      attack: { ops: [['A', 'S', 'forged token (cracked weak secret)', 'red'], ['S', 'A', 'Welcome, Alice! ✔', 'red']], state: { S: 'bad', T: 'bad' },
        text: '😱 <b>Weak secret or unpinned algorithm:</b> the attacker signed their own token as "Alice", and the server believed it.' },
      defend: { ops: [['A', 'S', 'forged token', 'red'], ['S', 'A', 'Unauthorized ✖', 'green']], state: { S: 'on', T: 'on' },
        text: '✅ <b>Strong secret + pinned HS256:</b> the signature does not match, so <code>io.use</code> answers <code>connect_error: Unauthorized</code>.' },
    },
    authz: {
      order: ['A', 'S', 'T'],
      nodes: { A: ['🥷', 'Mallory', 'not a member'], S: ['🖥️', 'Server', ''], T: ['🔒', 'Private room', 'secret chat'] },
      attack: { ops: [['A', 'S', 'room:open #secret', 'orange'], ['S', 'T', 'join', 'orange'], ['T', 'A', 'all private messages', 'red']], state: { T: 'bad' },
        text: '😱 <b>Only checked "logged in":</b> Mallory is authenticated, so the server let her into a room she does not belong to.' },
      defend: { ops: [['A', 'S', 'room:open #secret', 'orange'], ['S', 'T', 'is Mallory a member?', 'blue'], ['T', 'S', 'no', 'red'], ['S', 'A', 'denied ✖', 'green']], state: { S: 'on', T: 'on' },
        text: '✅ <b>Membership checked in the database on every action.</b> Logged in is not the same as allowed.' },
    },
    spoof: {
      order: ['A', 'S', 'T'],
      nodes: { A: ['🥷', 'Mallory', 'normal user'], S: ['🖥️', 'Server', ''], T: ['👩', 'Bob', 'reads chat'] },
      attack: { ops: [['A', 'S', '{sender:"admin", text:"send money"}', 'orange'], ['S', 'T', 'admin: send money', 'red']], state: { T: 'bad' },
        text: '😱 <b>Sender copied from the payload:</b> Bob sees a message "from admin" that Mallory wrote.' },
      defend: { ops: [['A', 'S', '{sender:"admin", text:"send money"}', 'orange'], ['S', 'T', 'mallory: send money', 'green']], state: { S: 'on', T: 'on' },
        text: '✅ <b>Identity comes from <code>socket.data.user</code></b> (the verified token). The claimed "admin" is ignored.' },
    },
    inject: {
      order: ['A', 'S', 'T'],
      nodes: { A: ['🥷', 'Attacker', 'sends a message'], S: ['🖥️', 'Server', ''], T: ['👥', 'Other users', 'read the chat'] },
      attack: { ops: [['A', 'S', '<img onerror=steal()>', 'orange'], ['S', 'T', '<img onerror=steal()>', 'red']], state: { T: 'bad' },
        text: '😱 <b>Shown with innerHTML:</b> the browser ran the attacker\'s script in <b>every</b> viewer\'s page. The same happens with <code>{"$ne":null}</code> placed in a database query.' },
      defend: { ops: [['A', 'S', '<img onerror=steal()>', 'orange'], ['S', 'T', 'shown as plain text', 'green']], state: { S: 'on', T: 'on' },
        text: '✅ <b>Escaped output + validated input:</b> the text is just text. Wrong-shaped data (objects instead of strings) is rejected by the schema.' },
    },
    flood: {
      order: ['A', 'S', 'T'],
      nodes: { A: ['🤖', 'Bot swarm', 'thousands of msgs'], S: ['🖥️', 'Server', ''], T: ['👩', 'Real users', 'want to chat'] },
      attack: { ops: [['A', 'S', 'msg', 'red'], ['A', 'S', 'msg', 'red'], ['A', 'S', 'msg', 'red'], ['A', 'S', 'msg', 'red'], ['T', 'S', 'hello?', 'blue', true]], state: { S: 'bad' },
        text: '😱 <b>No limits:</b> the server is busy with the flood, and real users get no answer (denial of service).' },
      defend: { ops: [['A', 'S', 'msg', 'red'], ['A', 'S', 'msg', 'red'], ['S', 'A', 'rate limit ✖', 'orange'], ['T', 'S', 'hello', 'blue'], ['S', 'T', 'delivered ✔', 'green']], state: { S: 'on', T: 'on' },
        text: '✅ <b>Rate limits and size limits:</b> the abuser is slowed or cut off, and normal users are served.' },
    },
    payload: {
      order: ['A', 'S', 'T'],
      nodes: { A: ['🥷', 'Attacker', 'logged-in user'], S: ['🖥️', 'Node server', ''], T: ['👥', 'All users', 'chatting'] },
      attack: { ops: [['A', 'S', 'message:send  null', 'red'], ['S', 'T', '💥 server crashed', 'red', true]], state: { S: 'bad', T: 'bad' },
        text: '😱 <b>Unvalidated payload:</b> destructuring <code>null</code> throws an uncaught error, the Node process dies, and <b>everyone</b> is disconnected. (This was our real bug.)' },
      defend: { ops: [['A', 'S', 'message:send  null', 'red'], ['S', 'A', 'Bad message (schema)', 'orange']], state: { S: 'on', T: 'on' },
        text: '✅ <b>Schema validation first:</b> the bad payload is refused with a polite error, and nothing else is affected.' },
    },
    leak: {
      order: ['T', 'S', 'A'],
      nodes: { T: ['🍃', 'Database', 'user records'], S: ['🖥️', 'Server', ''], A: ['🥷', 'Any user', 'opens DevTools'] },
      attack: { ops: [['T', 'S', 'whole user object', 'orange'], ['S', 'A', 'sender:{email, passwordHash…}', 'red']], state: { S: 'bad' },
        text: '😱 <b>Whole objects broadcast:</b> every client can read the emails and hashes in the WebSocket frames.' },
      defend: { ops: [['T', 'S', 'whole user object', 'orange'], ['S', 'A', 'sender:{id, username}', 'green']], state: { S: 'on' },
        text: '✅ <b>Public view only</b> (<code>toPublic()</code>): the client receives just what it needs.' },
    },
  };

  const COLOURS = { red: 'red', green: 'green', orange: 'orange', blue: 'blue' };

  document.querySelectorAll('.sim').forEach((root) => {
    const cfg = SIMS[root.dataset.sim];
    if (!cfg) return;
    let defended = false, busy = false;

    root.innerHTML =
      '<div class="demo-title" style="margin-bottom:8px">Attack simulator</div>' +
      '<div class="stage" style="min-height:150px"></div>' +
      '<div class="controls"><button class="btn small def-btn">Defence: OFF</button><button class="btn small">Launch attack ▶</button></div>' +
      '<div class="caption">Press <b>Launch attack</b>. Then switch <b>Defence ON</b> and launch again.</div>';

    const stage = root.querySelector('.stage');
    const [defBtn, goBtn] = root.querySelectorAll('.controls button');
    const cap = root.querySelector('.caption');
    const els = {};

    cfg.order.forEach((k) => {
      const [icon, name, sub] = cfg.nodes[k];
      const n = document.createElement('div');
      n.className = 'node' + (k === 'A' ? ' attacker' : '');
      n.innerHTML = `<span class="big">${icon}</span><b>${name}</b><small>${sub}</small>`;
      stage.appendChild(n);
      els[k] = n;
    });

    defBtn.onclick = () => {
      defended = !defended;
      defBtn.textContent = 'Defence: ' + (defended ? 'ON' : 'OFF');
      defBtn.classList.toggle('on', defended);
    };

    goBtn.onclick = async () => {
      if (busy) return;
      busy = true;
      Object.values(els).forEach((n) => setNode(n, null));
      clearPackets(stage);
      const plan = defended ? cfg.defend : cfg.attack;
      cap.innerHTML = defended ? 'Attack launched, but defences are <b>ON</b>…' : 'Attack launched with <b>no defence</b>…';
      for (const [from, to, label, colour, lost] of plan.ops) {
        await fly(stage, els[from], els[to], label, { cls: COLOURS[colour] || '', dur: 700, lost: !!lost });
      }
      Object.entries(plan.state).forEach(([k, s]) => setNode(els[k], s));
      cap.innerHTML = plan.text;
      busy = false;
    };
  });
})();

// ================================================================
//  Chapter 21: the journey of one chat message in our app
// ================================================================
const appStage = $('appStage');
const appNodes = ['apA', 'apS', 'apDB', 'apB'].map($);
stepper({
  next: 'apNext', reset: 'apReset',
  onReset: () => { clearPackets(appStage); appNodes.forEach((n) => setNode(n, null)); setCap('apCap', 'Press <b>Next step</b>.'); },
  steps: [
    async () => {
      setNode($('apA'), 'on');
      setCap('apCap', '<b>1. Alice sends.</b> <code>socket.emitWithAck("message:send", {roomId, text})</code>. On the wire: <code>42["message:send",{...}]</code> through the WebSocket.');
      await fly(appStage, $('apA'), $('apS'), 'message:send', { cls: 'blue' });
    },
    async () => {
      setNode($('apS'), 'on');
      setCap('apCap', '<b>2. Server checks.</b> Who is it? (<code>socket.data.user</code>, set from the JWT). Text 1–1000 chars? Not flooding? Then asks MongoDB: is Alice a member of this room?');
      await fly(appStage, $('apS'), $('apDB'), 'member?', { cls: 'orange', dur: 600 });
      setNode($('apDB'), 'on');
      await fly(appStage, $('apDB'), $('apS'), 'yes ✔', { cls: 'green', dur: 600 });
    },
    async () => {
      setCap('apCap', '<b>3. Save.</b> <code>Message.create(...)</code> stores it, so people who join later can read history.');
      await fly(appStage, $('apS'), $('apDB'), 'save message', { cls: 'purple', dur: 600 });
    },
    async () => {
      setCap('apCap', '<b>4. Broadcast.</b> <code>io.to("room:ID").emit("message:new", ...)</code> sends to every member currently listening, including Alice and Bob.');
      await Promise.all([
        fly(appStage, $('apS'), $('apA'), 'message:new', { cls: 'pink' }),
        fly(appStage, $('apS'), $('apB'), 'message:new', { cls: 'pink' }),
      ]);
      setNode($('apB'), 'on');
    },
    async () => {
      setCap('apCap', '<b>5. Acknowledge.</b> The server calls <code>ack({ok:true})</code>, so Alice\'s <code>emitWithAck</code> finishes and her screen knows it worked. ✅ Bob already sees the text.');
      await fly(appStage, $('apS'), $('apA'), 'ack {ok:true}', { cls: 'green', dur: 600 });
    },
  ],
});

// ================================================================
//  Chapter 22: quiz
// ================================================================
const QUIZ = [
  { q: 'What is a socket?', o: ['A kind of cable', 'One end of a two-way connection between programs', 'A web page'], a: 1 },
  { q: 'Which one is the "door number" of a program on a computer?', o: ['IP address', 'Port', 'Header'], a: 1 },
  { q: 'Why do chat apps prefer TCP over UDP?', o: ['It is reliable and keeps order', 'It is invisible', 'It has no handshake'], a: 0 },
  { q: 'In plain HTTP, can the server send you news without being asked?', o: ['Yes, any time', 'No, it can only answer requests', 'Only on Tuesdays'], a: 1 },
  { q: 'A WebSocket begins as…', o: ['A UDP packet', 'A normal HTTP request asking to upgrade', 'An email'], a: 1 },
  { q: 'Which code sends a message to everyone in one room?', o: ['io.emit()', 'socket.emit()', 'io.to("room").emit()'], a: 2 },
  { q: 'After a reconnect, what must the app do?', o: ['Nothing, rooms are kept', 'Join the rooms again', 'Reinstall Node'], a: 1 },
  { q: 'Which call refuses a connection inside io.use()?', o: ['next()', 'next(new Error("Unauthorized"))', 'socket.emit("no")'], a: 1 },
  { q: 'Your client gets connect_error and socket.active is false. What now?', o: ['Wait, it retries by itself', 'Fix the cause (e.g. refresh the token) and call socket.connect()', 'Nothing can be done'], a: 1 },
  { q: 'Does CORS stop another website from opening a WebSocket to your server?', o: ['Yes, always', 'No, so check the Origin header yourself', 'Only on Fridays'], a: 1 },
  { q: 'Best way to share a 50 MB video in chat?', o: ['Send it through emit() in one message', 'Upload over HTTP, then send its URL over the socket', 'Convert to base64 first'], a: 1 },
  { q: 'An HTTPS page tries ws://example.com. What happens?', o: ['Works fine', 'Browser blocks it (mixed content), use wss://', 'It becomes UDP'], a: 1 },
  { q: 'You want to notice dead connections faster. Which options do you lower?', o: ['maxHttpBufferSize', 'pingInterval and pingTimeout', 'serveClient'], a: 1 },
  { q: 'Which option lets rooms and missed events come back after a short disconnect?', o: ['connectionStateRecovery', 'allowUpgrades', 'wsEngine'], a: 0 },
  { q: 'An Express route (HTTP) wants to tell every user a room was created. What does it use?', o: ['socket.emit()', 'The server instance: io.emit()', 'It cannot'], a: 1 },
  { q: 'One user has 3 browser tabs open. How many server-side sockets exist?', o: ['1', '3, each with its own socket.id', '0'], a: 1 },
  { q: 'Which sends to everyone in room "x" except the sender?', o: ['io.to("x").emit()', 'socket.to("x").emit()', 'socket.emit()'], a: 1 },
  { q: 'Why can a bad website open a WebSocket to your server with the victim\'s cookie?', o: ['CORS does not apply to WebSocket, so you must check Origin', 'WebSocket is not encrypted', 'Cookies are public'], a: 0 },
  { q: 'A client sends message:send with null. What protects the server?', o: ['Nothing, Node handles it', 'Validating the payload with a schema before using it', 'A bigger server'], a: 1 },
  { q: 'Where must the sender of a chat message come from?', o: ['The payload the client sends', 'The verified token (socket.data.user)', 'The URL'], a: 1 },
  { q: 'With 2 servers, why does Server 1 not reach clients of Server 2?', o: ['Servers are islands without an adapter like Redis', 'Port numbers are different', 'JSON is too big'], a: 0 },
];
(function quiz() {
  let score = 0, answered = 0;
  QUIZ.forEach((item, qi) => {
    const wrap = document.createElement('div');
    wrap.className = 'q';
    wrap.innerHTML = `<p>${qi + 1}. ${item.q}</p>`;
    const buttons = item.o.map((text, oi) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => {
        buttons.forEach((x) => (x.disabled = true));
        const right = oi === item.a;
        b.classList.add(right ? 'right' : 'wrong');
        if (!right) buttons[item.a].classList.add('right');
        if (right) score++;
        answered++;
        if (answered === QUIZ.length) {
          $('score').textContent = `Score: ${score} / ${QUIZ.length} ` + (score === QUIZ.length ? '🏆 Perfect!' : score >= 5 ? '👏 Great job!' : '📖 Read the chapters again and retry.');
        }
      };
      wrap.appendChild(b);
      return b;
    });
    $('quiz').appendChild(wrap);
  });
})();
