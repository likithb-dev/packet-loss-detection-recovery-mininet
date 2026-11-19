/* netsim.js - Review 2 working model: packets, loss, detection, recovery and the backup path.
   Same logic as code/udp_sender.py, code/udp_receiver.py and the path monitor in code/mininet_reroute.py,
   on the same 4-switch topology:
        Server A - s1 - s2 - s4 - Server B      main path   (s1-s2 cable has the loss)
                     \- s3 -/                   backup path
*/
(function () {
  'use strict';
  const V3 = (x, z) => new THREE.Vector3(x, 0.55, z);
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const C = { gold: 0xe0b452, gold2: 0xf2d083, olive: 0x8fb36a, olive2: 0xb6d48f, red: 0xef6b5b, amber: 0xf0a04b, cream: 0xe9e4d4, dim: 0x27334a, netA: 0x6b9bd8, netB: 0x59b8a8 };

  const MS = 10;            // 1 second of animation = 10 ms of network time (slowed down 100x)
  const SPEED = 7;          // board units per animation second on a 5 ms cable
  const GAP = 0.55;         // spacing between packets leaving Server A
  const WINDOW = 4;
  const TIMEOUT = 8.5;      // animation seconds = 85 ms
  const MON = 0.5;          // path monitor check interval

  const NODES = {
    A: { x: -9.3, z: 0, name: 'SERVER A', sub: 'sender · Network A<br>10.1.1.10', srv: 'A' },
    s1: { x: -5.0, z: 0, name: 's1', sub: 'decides the path' },
    s2: { x: 0, z: -3.2, name: 's2', sub: 'main route' },
    s3: { x: 0, z: 3.2, name: 's3', sub: 'backup route' },
    s4: { x: 5.0, z: 0, name: 's4', sub: 'paths join here' },
    B: { x: 9.3, z: 0, name: 'SERVER B', sub: 'receiver · Network B<br>10.2.2.20', srv: 'B' }
  };
  const LINKS = [
    { a: 'A', b: 's1', kind: 'edge' },
    { a: 's1', b: 's2', kind: 'main', lossy: true },
    { a: 's2', b: 's4', kind: 'main' },
    { a: 's1', b: 's3', kind: 'backup', slow: true },
    { a: 's3', b: 's4', kind: 'backup', slow: true },
    { a: 's4', b: 'B', kind: 'edge' }
  ];
  const key = (a, b) => [a, b].sort().join('-');
  const LINK = {}; LINKS.forEach((l) => { LINK[key(l.a, l.b)] = l; });

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function NetSim(root) {
    const self = this;
    root.classList.add('ns');
    root.innerHTML =
      '<canvas class="ns-pcb" width="1280" height="720"></canvas>' +
      '<div class="ns-hud"><div class="ns-brand"><span class="ns-ico"></span>Packet Loss Project</div>' +
      '<div class="ns-who"><b>LIVE</b><span>Working model</span>· Lahaarika Rajuu · Likhit B · Krithik V</div><div class="ns-rev">CN Mini Project · Review 2</div></div>' +
      '<div class="ns-eye"><b>Simulation</b> every packet, every event <i>udp_sender.py · udp_receiver.py · mininet_reroute.py</i></div>' +
      '<h2 class="ns-h">Send, lose, detect, recover, <span>and reroute through the backup path.</span></h2>' +
      '<div class="ns-term">' +
      '  <div class="ns-tbar"><span class="ns-dots"><i></i><i></i><i></i></span>' +
      '    <div class="ns-view"><button data-v="con" class="on">Terminal</button><button data-v="tr">Transcript<i class="ns-badge"></i></button></div>' +
      '    <div class="ns-seg" data-k="loss"><em>loss</em><button data-v="0">0%</button><button data-v="0.1" class="on">10%</button><button data-v="0.2">20%</button></div>' +
      '    <div class="ns-seg" data-k="speed" style="margin-left:6px"><em>speed</em><button data-v="1" class="on">1×</button><button data-v="2">2×</button></div></div>' +
      '  <div class="ns-tabs"></div>' +
      '  <div class="ns-con"><div class="ns-out"></div><form class="ns-in"><span class="ns-ps">mininet&gt;</span><input spellcheck="false" autocomplete="off" placeholder="click a command above, or type one · help"></form></div>' +
      '  <div class="ns-tr" hidden><div class="ns-thead"><span>time</span><span>packet</span><span>path</span><span>what happened</span></div><div class="ns-body"></div>' +
      '    <div class="ns-opts"><label><input type="checkbox" class="ns-acks"> show ACK rows</label><button class="ns-csv">download transcript (.csv)</button></div></div>' +
      '  <div class="ns-foot"></div>' +
      '</div>' +
      '<div class="ns-v3"><canvas></canvas><div class="ns-labs"></div>' +
      '  <div class="ns-ov ns-cap"><small>what is happening</small><span>Press <b>▶ Full story</b> to start.</span></div>' +
      '  <div class="ns-ov ns-route">traffic is using<b>MAIN · A→s1→s2→s4→B</b></div>' +
      '  <div class="ns-ov ns-hint">drag to rotate · scroll to zoom</div></div>' +
      '<div class="ns-wave"><canvas></canvas><div class="ns-ov ns-wt">packet timeline · one row per packet</div>' +
      '  <div class="ns-ov ns-wl"><span><i style="background:#e0b452"></i>main</span><span><i style="background:#8fb36a"></i>backup</span>' +
      '  <span><i style="background:#ef6b5b"></i>lost</span><span>◆ delivered</span><span style="color:#f2d083">◆ recovered</span></div></div>';
    const q = (s) => root.querySelector(s);
    const P = { tabs: q('.ns-tabs'), body: q('.ns-body'), foot: q('.ns-foot'), cap: q('.ns-cap'), route: q('.ns-route b'),
      labs: q('.ns-labs'), v3: q('.ns-v3'), wave: q('.ns-wave canvas'), acks: q('.ns-acks'), out: q('.ns-out'), con: q('.ns-con'), tr: q('.ns-tr'),
      badge: q('.ns-badge'), input: q('.ns-in input'), ps: q('.ns-ps') };
    drawPcb(q('.ns-pcb'));

    // ------------------------------------------------------------------ 3D board
    const renderer = new THREE.WebGLRenderer({ canvas: q('.ns-v3 canvas'), antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(36, 1.9, 0.1, 200);
    cam.position.set(0, 16.8, 13.4);
    const controls = new THREE.OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 0, -1.3); controls.enableDamping = true; controls.enablePan = false;
    controls.minDistance = 12; controls.maxDistance = 34; controls.maxPolarAngle = 1.25;
    scene.add(new THREE.AmbientLight(0xdfe8ff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(-6, 14, 9); scene.add(sun);
    const fill = new THREE.PointLight(0x6b9bd8, 0.5, 40); fill.position.set(0, 6, -4); scene.add(fill);

    const board = new THREE.Mesh(new THREE.BoxGeometry(24, 0.3, 12), new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.8, metalness: 0.25 }));
    board.position.y = -0.15; scene.add(board);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: 0x4a5b78, transparent: true, opacity: 0.8 }));
    rim.position.copy(board.position); scene.add(rim);

    const labels = [];
    function label(cls, html, pos, dy) { const d = el('div', 'ns-lab ' + cls, html); P.labs.appendChild(d); const L = { d, pos, dy: dy || 0 }; labels.push(L); return L; }

    const GLOW = glowTex();
    function glow(color, size, op) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.set(size, size, 1); return sp;
    }
    label('zone a', 'NETWORK A<small>10.1.1.0/24 · sender site</small>', new THREE.Vector3(-7.6, 0, 4.4));
    label('zone b', 'NETWORK B<small>10.2.2.0/24 · receiver site</small>', new THREE.Vector3(7.6, 0, 4.4));

    // nodes
    for (const id in NODES) {
      const n = NODES[id];
      n.p = V3(n.x, n.z);
      const g = new THREE.Group(); g.position.set(n.x, 0, n.z);
      if (n.srv === 'A') {            // Server A: a tower machine, blue (Network A)
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 1.7), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45, metalness: 0.65 }));
        body.position.y = 1.15; g.add(body);
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: C.netA })).translateY(1.15));
        n.leds = [];
        for (let i = 0; i < 5; i++) {
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: 0x24324a }));
          led.position.set(0, 0.5 + i * 0.36, 0.86); g.add(led); n.leds.push(led);
        }
        const halo = glow(C.netA, 4.2, 0.18); halo.position.y = 1.2; g.add(halo);
        n.lab = label('node srv a', n.name + '<small>' + n.sub + '</small>', V3(n.x, n.z).setY(2.75));
      } else if (n.srv === 'B') {     // Server B: a rack server, teal (Network B)
        n.leds = [];
        for (let i = 0; i < 4; i++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 1.5), new THREE.MeshStandardMaterial({ color: 0x0f1c22, roughness: 0.45, metalness: 0.65 }));
          blade.position.y = 0.26 + i * 0.47; g.add(blade);
          g.add(new THREE.LineSegments(new THREE.EdgesGeometry(blade.geometry), new THREE.LineBasicMaterial({ color: C.netB, transparent: true, opacity: 0.8 })).translateY(blade.position.y));
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: 0x1d3a3a }));
          led.position.set(0.55, blade.position.y, 0.76); g.add(led); n.leds.push(led);
        }
        const halo = glow(C.netB, 4.2, 0.18); halo.position.y = 1.1; g.add(halo);
        n.lab = label('node srv b', n.name + '<small>' + n.sub + '</small>', V3(n.x, n.z).setY(2.55));
      } else {                        // switches: chips with their name printed on top
        const chip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 1.9), new THREE.MeshStandardMaterial({ color: 0x0c111b, roughness: 0.3, metalness: 0.55 }));
        chip.position.y = 0.2; g.add(chip);
        const top = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: chipTex(n.name, id === 's3' ? '#b6d48f' : '#f2d083'), transparent: true }));
        top.rotation.x = -Math.PI / 2; top.position.y = 0.405; g.add(top);
        const ring = new THREE.LineSegments(new THREE.EdgesGeometry(chip.geometry), new THREE.LineBasicMaterial({ color: 0x3a4a66 }));
        ring.position.y = 0.2; g.add(ring); n.ring = ring.material;
        for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) {
          const pin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.24), new THREE.MeshStandardMaterial({ color: 0xb9c2cf, metalness: 0.95, roughness: 0.25 }));
          pin.position.set(i * 0.23, 0.04, s * 1.06); g.add(pin);
          const pin2 = pin.clone(); pin2.rotation.y = Math.PI / 2; pin2.position.set(s * 1.06, 0.04, i * 0.23); g.add(pin2);
        }
        n.halo = glow(C.gold, 3.2, 0); n.halo.position.y = 0.5; g.add(n.halo);
        n.lab = label('node sw', n.sub, V3(n.x, n.z + 1.3).setY(0.1));
        if (id === 's1' || id === 's4') n.rule = label('rule', '', V3(n.x, n.z - 1.55).setY(0.1));
      }
      n.g = g; scene.add(g);
    }

    // cables: PCB traces with 45-degree bends, plus a faint glow and flowing "current" dots
    function routePts(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.abs(dz) < 0.01) return [a, b];
      const run = (Math.abs(dx) - Math.abs(dz)) / 2, sx = Math.sign(dx);
      const p1 = { x: a.x + sx * run, z: a.z }, p2 = { x: p1.x + sx * Math.abs(dz), z: b.z };
      return [a, p1, p2, b];
    }
    LINKS.forEach((l) => {
      const A = NODES[l.a], B = NODES[l.b];
      l.pts = routePts({ x: A.x, z: A.z }, { x: B.x, z: B.z });
      l.cum = [0];
      for (let i = 1; i < l.pts.length; i++) l.cum.push(l.cum[i - 1] + Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].z - l.pts[i - 1].z));
      l.len = l.cum[l.cum.length - 1];
      l.speed = l.slow ? SPEED * 0.72 : SPEED;
      const path = new THREE.CurvePath();
      for (let i = 1; i < l.pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(l.pts[i - 1].x, 0.04, l.pts[i - 1].z), new THREE.Vector3(l.pts[i].x, 0.04, l.pts[i].z)));
      l.mat = new THREE.MeshStandardMaterial({ color: C.dim, emissive: C.dim, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.3 });
      l.mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 48, l.kind === 'edge' ? 0.07 : 0.09, 6, false), l.mat);
      scene.add(l.mesh);
      l.gmat = new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.26, 8, false), l.gmat));
      l.dots = [];
      for (let i = 0; i < 5; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0 }));
        d.userData.off = i / 5; scene.add(d); l.dots.push(d);
      }
      const mid = pointAt(l, l.len / 2, true);
      if (l.lossy) l.lab = label('link loss', 'loss zone · 10%', new THREE.Vector3(mid.x + 1.9, 0.2, mid.z + 1.25));
      if (l.kind === 'backup') l.lab = label('link bk', 'backup', new THREE.Vector3(mid.x + (l.a === 's1' ? -0.9 : 0.9), 0.2, mid.z + 1.0));
    });

    // ------------------------------------------------------------------ state
    const cfg = { N: 12, loss: 0.1, speed: 1 };
    let st, packets = [], running = false;
    const pk = [];  // pool of packet meshes

    function reset(keepNet) {
      const prevNet = st && keepNet ? { cableOK: st.cableOK, s2OK: st.s2OK, rule: st.rule } : null;
      packets.forEach(removePacket); packets = [];
      st = {
        t: 0, rule: 'main', cableOK: true, s2OK: true, nextMon: MON, pendingRule: null,
        base: 0, next: 0, acked: new Set(), sentAt: {}, attempts: {}, queue: [], lastSend: -99, resent: 0,
        received: new Set(), highest: -1, missing: new Set(), recovered: new Set(), dups: 0,
        lost: 0, viaBackup: new Set(), done: false, story: false, rows: [], tl: [], marks: [], plain: !!cfg.plain,
        storyBroke: false, unseen: 0, failAt: null, detectAt: null
      };
      if (prevNet) Object.assign(st, prevNet);
      P.body.innerHTML = ''; P.badge.textContent = '';
      running = false;
      caption('Click <b>sudo python3 live_demo.py</b> in the terminal to run the full story.', '');
      setRoute();
      paintLinks();
      foot();
      drawWave();
      row(0, '', '', 'Ready. Server A will send ' + cfg.N + ' numbered packets (#0 – #' + (cfg.N - 1) + ') to Server B. ' +
        (st.plain ? 'Mode: plain UDP, nothing is resent.' : 'Mode: our method (ACK + resend + backup path).'), 'info');
    }

    // ------------------------------------------------------------------ transcript
    const fmt = (t) => (t * MS).toFixed(1) + ' ms';
    function row(t, pkt, path, text, cls) {
      st.rows.push({ t: (t * MS).toFixed(1), pkt, path, text: text.replace(/<[^>]+>/g, ''), cls });
      if (cls === 'ack' && !P.acks.checked) return;
      const r = el('div', 'ns-row ' + (cls || ''));
      const pill = path ? '<span class="ns-pill ' + path + '">' + path.toUpperCase() + '</span>' : '<span class="ns-pill none">—</span>';
      r.innerHTML = '<span class="t">' + (t ? fmt(t) : '0.0 ms') + '</span><span class="p">' + (pkt === '' ? '' : pkt) + '</span>' + pill + '<span class="e">' + text + '</span>';
      P.body.appendChild(r);
      P.body.scrollTop = P.body.scrollHeight;
      if (P.tr.hidden && cls !== 'info') { st.unseen++; P.badge.textContent = st.unseen; }
    }
    function caption(html, tone) {
      P.cap.className = 'ns-ov ns-cap ' + (tone || '');
      P.cap.innerHTML = '<small>what is happening</small><span>' + html + '</span>';
    }
    function setRoute() {
      const b = st.rule === 'backup';
      P.route.className = b ? 'backup' : '';
      P.route.textContent = b ? 'BACKUP · A→s1→s3→s4→B' : 'MAIN · A→s1→s2→s4→B';
      for (const id of ['s1', 's4']) {
        const r = NODES[id].rule.d;
        r.textContent = id + ' rule → ' + (b ? 's3 (backup)' : 's2 (main)');
        r.classList.toggle('backup', b);
      }
    }
    function linkUp(l) {
      if (key(l.a, l.b) === 's1-s2' && !st.cableOK) return false;
      if ((l.a === 's2' || l.b === 's2') && !st.s2OK) return false;
      return true;
    }
    function paintLinks() {
      LINKS.forEach((l) => {
        const up = linkUp(l);
        const active = l.kind === 'edge' || (l.kind === 'main' ? st.rule === 'main' : st.rule === 'backup');
        let col = l.kind === 'backup' ? C.olive : C.gold;
        if (!up) col = 0x3b1512;
        l.mat.color.setHex(active || !up ? col : C.dim);
        l.mat.emissive.setHex(!up ? 0x5a1a12 : active ? col : C.dim);
        l.mat.emissiveIntensity = active && up ? 0.8 : 0.25;
        l.gmat.color.setHex(l.kind === 'backup' ? C.olive : C.gold); l.gmat.opacity = active && up ? 0.13 : 0;
        l.live = active && up; l.dots.forEach((d) => d.material.color.setHex(l.kind === 'backup' ? C.olive2 : C.gold2));
        if (l.lossy) {
          l.lab.d.className = 'ns-lab link ' + (up ? 'loss' : 'broken');
          l.lab.d.textContent = up ? 'loss zone · ' + Math.round((st.story ? 0.1 : cfg.loss) * 100) + '%' : '✕ cable broken';
        }
        if (l.kind === 'backup') l.lab.d.classList.toggle('on', st.rule === 'backup');
      });
      const mainOn = st.rule === 'main', bkOn = st.rule === 'backup';
      NODES.s2.ring.color.setHex(!st.s2OK ? C.red : mainOn ? C.gold : 0x3a4a66);
      NODES.s2.halo.material.color.setHex(st.s2OK ? C.gold : C.red); NODES.s2.halo.material.opacity = !st.s2OK ? 0.6 : mainOn ? 0.28 : 0;
      NODES.s3.ring.color.setHex(bkOn ? C.olive2 : 0x3a4a66);
      NODES.s3.halo.material.color.setHex(C.olive); NODES.s3.halo.material.opacity = bkOn ? 0.4 : 0;
      for (const id of ['s1', 's4']) { NODES[id].ring.color.setHex(bkOn ? C.olive2 : C.gold); NODES[id].halo.material.color.setHex(bkOn ? C.olive : C.gold); NODES[id].halo.material.opacity = 0.22; }
      NODES.s2.lab.d.textContent = st.s2OK ? 'main route' : '✕ switch failed'; NODES.s2.lab.d.classList.toggle('bad', !st.s2OK);
    }
    function foot() {
      const sent = Object.values(st.attempts).reduce((a, b) => a + b, 0);
      const items = [['Sent', sent, '#f2d083'], ['Lost', st.lost, '#ef6b5b'], ['Found missing', st.missing.size, '#ffb3a6'],
        ['Resent', st.resent, '#f0a04b'], ['Via backup', st.viaBackup.size, '#b6d48f'], ['Delivered', st.received.size + '/' + cfg.N, '#e9e4d4']];
      if (!P.foot.children.length) P.foot.innerHTML = items.map((i) => '<div><span>' + i[0] + '</span><b style="color:' + i[2] + '">0</b></div>').join('');
      items.forEach((it, i) => {
        const b = P.foot.children[i].querySelector('b');
        if (b.textContent !== String(it[1])) { b.textContent = it[1]; b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
      });
    }

    // ------------------------------------------------------------------ packets
    function makeMesh(kind, path) {
      const isAck = kind === 'ack';
      const col = isAck ? C.cream : path === 'backup' ? C.olive2 : C.gold;
      const m = new THREE.Mesh(isAck ? new THREE.SphereGeometry(0.2, 14, 10) : new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.3 }));
      const gl = glow(col, isAck ? 1.1 : 1.9, isAck ? 0.5 : 0.75); m.add(gl); m.userData.glow = gl;
      scene.add(m);
      return m;
    }
    function launch(kind, seq, attempt) {
      const p = { kind, seq, attempt, at: kind === 'data' ? 'A' : 'B', path: st.rule, d: 0, drop: null, dead: 0, backup: false };
      p.to = nextHop(p, p.at);
      p.mesh = makeMesh(kind, 'main');
      if (kind === 'data') p.lab = label('pkt', '#' + seq + (attempt > 1 ? ' resend' : ''), new THREE.Vector3(), 0);
      enter(p);
      packets.push(p);
      return p;
    }
    function nextHop(p, at) {
      if (p.kind === 'data') {
        if (at === 'A') return 's1';
        if (at === 's1') return st.rule === 'main' ? 's2' : 's3';
        if (at === 's2' || at === 's3') return 's4';
        if (at === 's4') return 'B';
      } else {
        if (at === 'B') return 's4';
        if (at === 's4') return st.rule === 'main' ? 's2' : 's3';
        if (at === 's2' || at === 's3') return 's1';
        if (at === 's1') return 'A';
      }
      return null;
    }
    function enter(p) {
      const l = LINK[key(p.at, p.to)];
      p.link = l; p.d = 0; p.drop = null;
      if (p.to === 's3' || p.at === 's3') {
        if (!p.backup) {
          p.backup = true; setPktColor(p, 'backup');
          if (p.kind === 'data') {
            st.viaBackup.add(p.seq);
            if (p.path === 'main') row(st.t, '#' + p.seq, 'backup', 'Rerouted at s1: this packet now goes through the <b>backup path</b> (s1 → s3 → s4)', 'net');
          }
        }
      }
      if (!linkUp(l)) { p.drop = 0; p.reason = l.lossy ? 'cable s1–s2 is broken' : 'switch s2 is down'; return; }
      if (l.lossy && p.kind === 'data') {
        const forced = st.story && st.forceLoss[p.seq] === p.attempt;
        if (forced || (!st.story && Math.random() < cfg.loss)) { p.drop = l.len * (0.42 + Math.random() * 0.16); p.reason = 'lost on cable s1–s2'; }
      }
      if (l.lossy && p.kind === 'ack' && !st.story && Math.random() < cfg.loss) { p.drop = l.len * 0.5; p.reason = 'ACK lost on cable s1–s2'; }
    }
    function setPktColor(p, path) {
      const col = path === 'backup' ? C.olive2 : C.gold;
      if (p.kind === 'data') { p.mesh.material.color.setHex(col); p.mesh.material.emissive.setHex(col); p.mesh.userData.glow.material.color.setHex(col); p.lab.d.classList.toggle('backup', path === 'backup'); }
    }
    function removePacket(p) {
      scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); p.mesh.userData.glow.material.dispose();
      if (p.lab) { p.lab.d.remove(); labels.splice(labels.indexOf(p.lab), 1); }
    }
    function kill(p) {
      p.dead = 0.001;
      p.mesh.material.color.setHex(C.red); p.mesh.material.emissive.setHex(C.red); p.mesh.userData.glow.material.color.setHex(C.red);
      const path = p.backup ? 'backup' : 'main';
      if (p.kind === 'data') {
        st.lost++;
        p.lab.d.className = 'ns-lab pkt dead'; p.lab.d.textContent = '#' + p.seq + ' LOST';
        row(st.t, '#' + p.seq, path, 'LOST: ' + p.reason + '. Server B never gets this copy.', 'lost');
        caption('Packet <b>#' + p.seq + '</b> was <b style="color:#ef6b5b">lost</b> (' + p.reason + '). Nobody knows yet.', 'bad');
        const a = st.tl.find((x) => x.seq === p.seq && x.attempt === p.attempt); if (a) { a.t1 = st.t; a.res = 'lost'; }
      } else {
        row(st.t, 'ack ' + p.seq, path, p.reason + '. Server A will think #' + p.seq + ' was lost.', 'ack');
      }
    }

    // receiver - udp_receiver.py
    function onData(p) {
      const seq = p.seq, path = p.backup ? 'backup' : 'main';
      const a = st.tl.find((x) => x.seq === seq && x.attempt === p.attempt); if (a) { a.t1 = st.t; a.res = 'ok'; }
      blink(NODES.B, p.backup ? C.olive2 : C.netB);
      if (st.received.has(seq)) { st.dups++; row(st.t, '#' + seq, path, 'Duplicate (its ACK was lost). Server B ignores it and ACKs again.', 'ack'); }
      else {
        if (seq > st.highest + 1) {
          const gap = []; for (let s = st.highest + 1; s < seq; s++) if (!st.received.has(s)) gap.push(s);
          if (gap.length) {
            gap.forEach((s) => st.missing.add(s));
            const g = gap.map((s) => '#' + s).join(', ');
            row(st.t, '#' + seq, path, 'Server B got #' + seq + ' but not ' + g + ' → <b>LOSS DETECTED: ' + g + ' missing</b>', 'miss');
            tprint('[h2 receiver] LOSS DETECTED: expected ' + gap[0] + ', got ' + seq + ', missing [' + gap.join(', ') + ']', 'red');
            caption('Server B received <b>#' + seq + '</b> but never got <b>' + g + '</b>. The numbers have a gap, so ' + g + (gap.length > 1 ? ' are' : ' is') + ' <b style="color:#ef6b5b">missing</b>.', 'bad');
          }
        }
        st.received.add(seq); st.highest = Math.max(st.highest, seq);
        if (st.missing.has(seq)) {
          st.recovered.add(seq); if (a) a.rec = true;
          row(st.t, '#' + seq, path, 'RECOVERED: #' + seq + ' arrived on its ' + ord(p.attempt) + ' try' + (p.backup ? ', through the <b>backup path</b>' : ''), 'rec');
          tprint('[h2 receiver] RECOVERED: packet ' + seq + ' arrived after retransmission' + (p.backup ? '   (via backup s1 -> s3 -> s4)' : ''), 'gold');
          caption('Packet <b>#' + seq + '</b> is <b style="color:#f2d083">recovered</b>' + (p.backup ? ': the resent copy came through the <b style="color:#b6d48f">backup path s1 → s3 → s4</b>' : '') + '. Nothing is missing any more.', 'gold');
        } else row(st.t, '#' + seq, path, 'Delivered to Server B', 'ok');
      }
      if (!st.plain) { launch('ack', seq, 1); row(st.t, 'ack ' + seq, st.rule, 'Server B → Server A: "got #' + seq + '"', 'ack'); }
    }
    // sender - udp_sender.py
    function onAck(p) {
      if (st.acked.has(p.seq)) return;
      st.acked.add(p.seq);
      blink(NODES.A, C.cream);
      row(st.t, 'ack ' + p.seq, p.backup ? 'backup' : 'main', 'Server A got the ACK. #' + p.seq + ' is confirmed.', 'ack');
      while (st.acked.has(st.base)) st.base++;
    }
    function sendTick() {
      if (st.plain) { if (st.next < cfg.N && !st.queue.includes(st.next)) st.queue.push(st.next++); }
      else {
        while (st.next < st.base + WINDOW && st.next < cfg.N) st.queue.push(st.next++);
        for (let s = st.base; s < st.next; s++) {
          if (!st.acked.has(s) && st.sentAt[s] != null && st.t - st.sentAt[s] > TIMEOUT && !st.queue.includes(s)) {
            st.sentAt[s] = null; st.resent++;
            row(st.t, '#' + s, st.rule, 'TIMEOUT: no ACK for #' + s + ' after ' + (TIMEOUT * MS).toFixed(0) + ' ms → Server A will resend it' + (st.rule === 'backup' ? ' (now via backup)' : ''), 'tmo');
            caption('Server A waited ' + (TIMEOUT * MS).toFixed(0) + ' ms and got no "got it" for <b>#' + s + '</b>, so it <b style="color:#f0a04b">sends it again</b>' +
              (st.rule === 'backup' ? ' — this time s1 sends it through the <b style="color:#b6d48f">backup path</b>.' : '.'), st.rule === 'backup' ? 'good' : '');
            tprint('[h1 sender]   timeout for packet ' + s + ', retransmitting' + (st.rule === 'backup' ? '   (s1 now sends it via s3)' : ''), 'amber');
            st.queue.unshift(s);
          }
        }
      }
      if (st.queue.length && st.t - st.lastSend >= GAP) {
        const s = st.queue.shift();
        st.attempts[s] = (st.attempts[s] || 0) + 1;
        st.sentAt[s] = st.t; st.lastSend = st.t;
        const at = st.attempts[s];
        launch('data', s, at);
        st.tl.push({ seq: s, attempt: at, t0: st.t, t1: null, res: null, path: st.rule });
        blink(NODES.A, C.netA);
        row(st.t, '#' + s, st.rule, (at > 1 ? 'Resent' : 'Sent') + ' by Server A' + (at > 1 ? ' (' + ord(at) + ' try)' : '') + ' → ' + (st.rule === 'main' ? 'main path' : '<b>backup path</b>'), at > 1 ? 'resent' : '');
        if (s === 0 && at === 1) caption('Server A starts sending packets <b>#0 to #' + (cfg.N - 1) + '</b>. Gold cubes take the <b style="color:#f2d083">main path</b> s1 → s2 → s4.', '');
      }
    }
    // path monitor - mininet_reroute.py
    function monitorTick() {
      if (st.pendingRule && st.t >= st.pendingRule.at) {
        st.rule = st.pendingRule.rule; st.pendingRule = null;
        setRoute(); paintLinks();
        st.marks.push({ t: st.t, label: st.rule === 'backup' ? 'rerouted → backup' : 'back on main', col: st.rule === 'backup' ? '#b6d48f' : '#f2d083' });
        if (st.rule === 'backup') {
          tprint('[monitor] s1, s4 flow rules changed: in_port=1 actions=output:3  (traffic -> backup s1 -> s3 -> s4)', 'olive');
          row(st.t, '', 'backup', 'REROUTED: s1 and s4 rules changed (ovs-ofctl). All traffic now goes A → s1 → s3 → s4 → B', 'net');
          caption('The path monitor changed the rules in <b>s1</b> and <b>s4</b>. Every packet now takes the <b style="color:#b6d48f">backup path s1 → s3 → s4</b>.', 'good');
        } else {
          row(st.t, '', 'main', 'Main path is healthy again. Rules changed back: traffic uses s1 → s2 → s4', 'net');
          tprint('[monitor] main path healthy again -> rules back to output:2 (s1 -> s2 -> s4)', 'gold');
          caption('The main path works again, so the monitor moved traffic back to it.', '');
        }
      }
      if (st.t < st.nextMon || st.pendingRule) return;
      st.nextMon = st.t + MON;
      const mainOK = st.cableOK && st.s2OK;
      if (st.rule === 'main' && !mainOK) {
        const why = !st.cableOK ? 'cable s1–s2 is down' : 'switch s2 does not answer';
        row(st.t, '', 'main', 'PATH MONITOR: test pings fail, ' + why + ' → switching to backup', 'netbad');
        st.detectAt = st.t;
        tprint('[monitor] primary link DOWN -> rerouting to backup path via s3', 'olive');
        caption('The <b>path monitor</b> noticed the main path is dead (' + why + '). It is switching traffic to the backup path…', 'bad');
        st.pendingRule = { rule: 'backup', at: st.t + 0.35 };
      } else if (st.rule === 'backup' && mainOK) st.pendingRule = { rule: 'main', at: st.t + 0.35 };
    }

    function breakCable() {
      if (!st.cableOK) return;
      st.cableOK = false; st.failAt = st.t; paintLinks();
      if (st.story && running) tprint('\n>>> BREAKING the main cable s1-s2 now!\n', 'yellow');
      idleMonitor();
      packets.forEach((p) => { if (!p.dead && p.link && key(p.link.a, p.link.b) === 's1-s2') { p.drop = p.d; p.reason = 'cable s1–s2 broke while it was on it'; } });
      st.marks.push({ t: st.t, label: 'cable s1–s2 broken', col: '#ef6b5b' });
      row(st.t, '', 'main', 'CABLE BROKEN between s1 and s2. The main path is cut.', 'netbad');
      caption('The cable between <b>s1</b> and <b>s2</b> just <b style="color:#ef6b5b">broke</b>. Packets on it are lost.', 'bad');
    }
    function failS2() {
      if (!st.s2OK) return;
      st.s2OK = false; st.failAt = st.t; paintLinks();
      if (st.story && running) tprint('\n>>> SWITCH s2 FAILS now!\n', 'yellow');
      idleMonitor();
      packets.forEach((p) => { if (!p.dead && p.link && (p.link.a === 's2' || p.link.b === 's2')) { p.drop = p.d; p.reason = 'switch s2 failed'; } });
      st.marks.push({ t: st.t, label: 'switch s2 failed', col: '#ef6b5b' });
      row(st.t, '', 'main', 'SWITCH s2 FAILED. The main path has no switch in the middle any more.', 'netbad');
      caption('Switch <b>s2</b> (the main route) has <b style="color:#ef6b5b">failed</b>. This is why the backup route needs its own switch, s3.', 'bad');
    }
    function repair() {
      if (st.cableOK && st.s2OK) return;
      st.cableOK = true; st.s2OK = true; paintLinks();
      idleMonitor();
      st.marks.push({ t: st.t, label: 'repaired', col: '#f2d083' });
      row(st.t, '', 'main', 'Main path repaired (cable and switch s2 working).', 'net');
    }

    function finish() {
      st.done = true; running = false;
      const lost = cfg.N - st.received.size;
      const msg = st.plain
        ? 'Plain UDP finished: ' + st.received.size + '/' + cfg.N + ' delivered. ' + lost + ' packet' + (lost === 1 ? ' is' : 's are') + ' lost for good.'
        : 'Done: ' + st.received.size + '/' + cfg.N + ' delivered. ' + st.missing.size + ' missing found, ' + st.recovered.size + ' recovered, ' + st.viaBackup.size + ' packets used the backup path.';
      row(st.t, '', '', msg, st.plain && lost ? 'lost' : 'done');
      caption(st.plain ? 'Without our method, <b style="color:#ef6b5b">' + lost + ' packet' + (lost === 1 ? ' is' : 's are') + ' simply gone</b>.'
        : '<b style="color:#f2d083">All ' + cfg.N + ' packets arrived.</b> Lost ones were found and resent, and the backup path kept traffic moving when the main path failed.', st.plain && lost ? 'bad' : 'gold');
      const sec = (st.t * MS / 1000), sent = Object.values(st.attempts).reduce((a, b) => a + b, 0);
      if (st.story && st.failAt != null && st.detectAt != null)
        tprint('\n>>> Failure detected ' + Math.round((st.detectAt - st.failAt) * MS) + ' ms after the failure; traffic moved to the backup path s1 -> s3 -> s4', 'yellow');
      tprint('\n=========== SENDER REPORT  (h1, 10.1.1.10) ===========\n' +
        'Packets sent (unique)   : ' + cfg.N + '\nTotal transmissions     : ' + sent + '\nRetransmissions         : ' + st.resent +
        '\nRetransmission rate     : ' + (100 * st.resent / cfg.N).toFixed(1) + ' %\nTime taken              : ' + sec.toFixed(2) + ' s');
      tprint('\n========== RECEIVER REPORT  (h2, 10.2.2.20) ==========\n' +
        'Packets expected        : ' + cfg.N + '\nUnique packets received : ' + st.received.size + '\nGaps detected (missing) : ' + st.missing.size +
        '\nRecovered by retransmit : ' + st.recovered.size + '\nDuplicates received     : ' + st.dups + '\nStill missing           : ' + lost, lost ? 'red' : '');
      tprint(st.plain ? (lost ? '\n' + lost + ' packet' + (lost === 1 ? ' is' : 's are') + ' lost for good: plain UDP never resends.' : '\nNo packets lost this time: the ' + st.rule + ' path had no loss. Try it on the main path (link s1 s2 up).')
        : st.story ? '\n>>> Done: every packet was delivered, even with 10% loss AND a failed main path' : '\nDone: all ' + cfg.N + ' packets delivered.', st.plain && lost ? 'red' : 'yellow');
      foot(); drawWave();
    }

    // ------------------------------------------------------------------ terminal
    let typing = false, mode = 'mn';
    function tprint(text, cls) {
      String(text).split('\n').forEach((l) => { const d = el('div', 'ns-ln ' + (cls || '')); d.textContent = l || ' '; P.out.appendChild(d); });
      while (P.out.childNodes.length > 400) P.out.removeChild(P.out.firstChild);
      P.out.scrollTop = P.out.scrollHeight;
    }
    function promptFor(cmd) { return /^(sudo |python3 |clear|help)/.test(cmd) ? 'ubuntu@mn:~/code$' : 'mininet>'; }
    function idleMonitor() {
      if (running) return;
      setTimeout(function () {
        const mainOK = st.cableOK && st.s2OK;
        if (st.rule === 'main' && !mainOK) { st.rule = 'backup'; tprint('[monitor] primary link DOWN -> rerouting to backup path via s3', 'olive'); }
        else if (st.rule === 'backup' && mainOK) { st.rule = 'main'; tprint('[monitor] main path healthy again -> back on s1 -> s2 -> s4', 'gold'); }
        else return;
        setRoute(); paintLinks();
      }, 600);
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function runCmd(cmd, typed) {
      if (typing) return;
      typing = true;
      showView('con');
      const ps = promptFor(cmd);
      P.ps.textContent = ps;
      const line = el('div', 'ns-ln ns-prompt');
      P.out.appendChild(line);
      if (typed) line.innerHTML = '<b>' + ps + '</b> ' + esc(cmd);
      else for (let i = 0; i <= cmd.length; i++) { line.innerHTML = '<b>' + ps + '</b> ' + esc(cmd.slice(0, i)) + (i < cmd.length ? '▌' : ''); P.out.scrollTop = P.out.scrollHeight; await sleep(9); }
      try { await exec(cmd.trim().replace(/\s+/g, ' ')); } catch (err) { tprint(String(err), 'red'); }
      typing = false;
    }
    function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    function busy() { if (running && !st.done) { tprint('(a transfer is still running: wait for it, or press ❚❚ / ↺)', 'dim'); return true; } return false; }
    async function exec(c) {
      if (c === 'clear') { P.out.innerHTML = ''; return; }
      if (c === 'help') {
        tprint('ubuntu@mn:~/code$  sudo mn -c | sudo python3 live_demo.py [--fail switch] | python3 run_tests.py\n' +
          'mininet>           h1 python3 udp_sender.py --host 10.2.2.20 --count 12 [--no-recovery]\n' +
          '                   link s1 s2 down|up · switch s2 stop|start · sh ovs-ofctl dump-flows s1 · h1 ping -c 3 h2 · clear', 'dim');
        return;
      }
      if (c === 'sudo mn -c') {
        running = false; st = null; reset();
        tprint('*** Removing excess controllers/ofprotocols/ofdatapaths/pings/noxes\n*** Removing OVS datapaths\n*** Removing all links of the pattern s[0-9]+-eth[0-9]+\n*** Cleanup complete.', 'dim');
        return;
      }
      if (c.indexOf('sudo python3 live_demo.py') === 0) {
        if (busy()) return;
        const sw = /--fail switch/.test(c);
        cfg.plain = false; st = null; start(true); st.storyFail = sw ? 'switch' : 'cable';
        tprint('\n>>> Building the network: h1 - s1 - s2 - s4 - h2 (main path, 10% loss) and backup path s1 - s3 - s4\n', 'yellow');
        tprint('>>> Starting transfer: h1 (10.1.1.10, Network A) sends ' + cfg.N + ' numbered packets to h2 (10.2.2.20, Network B)\n', 'yellow');
        tprint('[h2 receiver] listening on UDP port 5000');
        return;
      }
      const sm = c.match(/^h1 python3 udp_sender\.py(.*)$/);
      if (sm) {
        if (busy()) return;
        cfg.plain = /--no-recovery/.test(c);
        start(false, true);
        tprint('[h2 receiver] listening on UDP port 5000');
        tprint("[h1 sender]   sending " + cfg.N + " packets to ('10.2.2.20', 5000), " + (cfg.plain ? 'plain UDP (no recovery)' : 'window=' + WINDOW + ', timeout=' + (TIMEOUT * MS / 1000).toFixed(3) + 's') +
          (st.rule === 'backup' ? '   [path: backup]' : ''));
        return;
      }
      if (c === 'link s1 s2 down') { breakCable(); return; }
      if (c === 'switch s2 stop') { failS2(); return; }
      if (c === 'link s1 s2 up' || c === 'switch s2 start') {
        if (c === 'link s1 s2 up') st.cableOK = true; else st.s2OK = true;
        if (st.cableOK && st.s2OK) { st.cableOK = false; repair(); } else { paintLinks(); idleMonitor(); }
        return;
      }
      if (c === 'sh ovs-ofctl dump-flows s1' || c === 'sudo ovs-ofctl dump-flows s1') {
        const out = st.rule === 'backup' ? 3 : 2, d = (st.t * MS / 1000 + 12.4).toFixed(3), n = Object.values(st.attempts).reduce((a, b) => a + b, 0);
        tprint(' cookie=0x0, duration=' + d + 's, table=0, n_packets=' + n + ', n_bytes=' + n * 74 + ', in_port="s1-eth1" actions=output:"s1-eth' + out + '"', st.rule === 'backup' ? 'olive' : 'gold');
        tprint(' cookie=0x0, duration=' + d + 's, table=0, n_packets=' + st.acked.size + ', n_bytes=' + st.acked.size * 60 + ', in_port="s1-eth2" actions=output:"s1-eth1"');
        tprint(' cookie=0x0, duration=' + d + 's, table=0, n_packets=0, n_bytes=0, in_port="s1-eth3" actions=output:"s1-eth1"');
        tprint('# packets from Server A (port 1) go out port ' + out + ' -> ' + (out === 2 ? 's2, the MAIN path' : 's3, the BACKUP path'), 'dim');
        return;
      }
      if (c === 'h1 ping -c 3 h2' || c === 'h1 ping -c 3 10.2.2.20') {
        tprint('PING 10.2.2.20 (10.2.2.20) 56(84) bytes of data.');
        let ok = 0;
        for (let i = 1; i <= 3; i++) {
          await sleep(420);
          const dead = st.rule === 'main' && !(st.cableOK && st.s2OK);
          const lost = !dead && st.rule === 'main' && Math.random() < cfg.loss * 1.9;
          if (dead) tprint('From 10.1.1.10 icmp_seq=' + i + ' Destination Host Unreachable', 'red');
          else if (!lost) { ok++; tprint('64 bytes from 10.2.2.20: icmp_seq=' + i + ' ttl=64 time=' + ((st.rule === 'backup' ? 40 : 20) + Math.random() * 1.6).toFixed(1) + ' ms' + (st.rule === 'backup' ? '   (via s3, backup)' : '')); }
        }
        tprint('\n--- 10.2.2.20 ping statistics ---\n3 packets transmitted, ' + ok + ' received, ' + Math.round(100 * (3 - ok) / 3) + '% packet loss', ok === 3 ? '' : 'red');
        return;
      }
      if (c === 'python3 run_tests.py') {
        const R = window.LOCAL_RESULTS || [];
        if (!R.length) { tprint('results/local_results.csv not found', 'red'); return; }
        const avg = (rows, k) => rows.reduce((a, r) => a + +r[k], 0) / rows.length;
        const pad = (v, n) => String(v).padStart(n);
        tprint('(our saved real run: code/results/local_results.csv, 200 packets, 3 trials each)\n', 'dim');
        tprint('Test 1 - Packet loss vs delivery', 'yellow');
        tprint('  Loss | Plain UDP delivered | Our method delivered | Resends | Time (s)');
        for (const L of [0, 5, 10, 20]) {
          await sleep(140);
          const pl = R.filter((r) => r.test === '1_loss' && +r.setting === L && r.mode === 'plain UDP'), o = R.filter((r) => r.test === '1_loss' && +r.setting === L && r.mode === 'our method');
          tprint(pad(L, 5) + '% | ' + pad((100 * avg(pl, 'received') / 200).toFixed(1) + '%', 19) + ' | ' + pad((100 * avg(o, 'received') / 200).toFixed(1) + '%', 20) + ' | ' + pad(avg(o, 'retransmissions').toFixed(1), 7) + ' | ' + pad(avg(o, 'time').toFixed(2), 8));
        }
        tprint('\nTest 5 - Timeout value (10% loss)', 'yellow');
        tprint(' Timeout | Delivered | Resends | Duplicates | Time (s)');
        for (const T of ['0.1', '0.2', '0.5']) {
          await sleep(140);
          const o = R.filter((r) => r.test === '5_timeout' && r.setting === T);
          tprint(pad(T, 7) + 's | ' + pad((100 * avg(o, 'received') / 200).toFixed(1) + '%', 9) + ' | ' + pad(avg(o, 'retransmissions').toFixed(1), 7) + ' | ' + pad(avg(o, 'duplicates').toFixed(1), 10) + ' | ' + pad(avg(o, 'time').toFixed(2), 8));
        }
        return;
      }
      tprint('bash: ' + c.split(' ')[0] + ': command not found   (type help)', 'red');
    }
    function showView(v) {
      P.con.hidden = v !== 'con'; P.tr.hidden = v !== 'tr';
      root.querySelectorAll('.ns-view button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
      if (v === 'tr') { st.unseen = 0; P.badge.textContent = ''; P.body.scrollTop = P.body.scrollHeight; }
    }

    // ------------------------------------------------------------------ main loop
    function step(dt) {
      st.t += dt;
      sendTick(); monitorTick();
      if (st.story && !st.storyBroke) {
        const p6 = packets.find((p) => p.kind === 'data' && p.seq === 6 && p.attempt === 1 && p.link && key(p.link.a, p.link.b) === 's1-s2' && !p.dead);
        if (p6 && p6.d > p6.link.len * 0.5) { st.storyBroke = true; if (st.storyFail === 'switch') failS2(); else breakCable(); }
      }
      for (const p of packets) {
        if (p.gone) continue;
        if (p.dead) { p.dead += dt; p.mesh.scale.setScalar(1 + p.dead * 1.6); p.mesh.material.opacity = Math.max(0, 1 - p.dead / 1.4); p.mesh.material.transparent = true;
          if (p.dead > 1.4) { p.gone = true; } continue; }
        p.d += p.link.speed * dt;
        if (p.drop !== null && p.d >= p.drop) { p.d = p.drop; kill(p); }
        else if (p.d >= p.link.len) {
          p.at = p.to;
          if ((p.kind === 'data' && p.at === 'B') || (p.kind === 'ack' && p.at === 'A')) {
            p.gone = true; if (p.kind === 'data') onData(p); else onAck(p); continue;
          }
          p.to = nextHop(p, p.at);
          enter(p);
          if (p.drop === 0) { p.d = 0; }
        }
        const q = pointAt(p.link, Math.min(p.d, p.link.len), p.at === p.link.a);
        p.mesh.position.set(q.x, p.kind === 'ack' ? 0.32 : 0.55, q.z);
        p.mesh.rotation.y += dt * 1.5;
        if (p.lab) p.lab.pos.copy(p.mesh.position).setY(1.05);
      }
      packets.filter((p) => p.gone).forEach(removePacket);
      packets = packets.filter((p) => !p.gone);
      const finished = st.plain ? st.next >= cfg.N && !st.queue.length && !packets.length
        : st.base >= cfg.N && !packets.some((p) => p.kind === 'data');
      if (finished && !st.done && st.next > 0) finish();
    }

    // ------------------------------------------------------------------ timeline (wave window)
    function drawWave() {
      const cv = P.wave, W = cv.clientWidth || 656, H = cv.clientHeight || 214, dpr = self.dpr || 2;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
      const L = 46, R = W - 14, T = 30, Bt = H - 22, lane = (Bt - T) / cfg.N;
      const tMax = Math.max(30, (st ? st.t : 0) + 3);
      const X = (t) => L + (t / tMax) * (R - L);
      x.font = '10px "JetBrains Mono", Menlo, monospace'; x.textBaseline = 'middle';
      for (let i = 0; i < cfg.N; i++) {
        const y = T + i * lane + lane / 2;
        x.fillStyle = i % 2 ? 'rgba(30,41,59,.45)' : 'rgba(30,41,59,.2)'; x.fillRect(L, T + i * lane, R - L, lane);
        x.fillStyle = st && st.received.has(i) ? (st.recovered.has(i) ? '#f2d083' : '#c9cfd8') : st && st.done ? '#ef6b5b' : '#5b6a7f';
        x.textAlign = 'right'; x.fillText('#' + i, L - 8, y);
      }
      x.strokeStyle = 'rgba(91,106,127,.5)'; x.lineWidth = 1;
      x.textAlign = 'center'; x.fillStyle = '#5b6a7f';
      const stepMs = tMax * MS > 400 ? 100 : 50;
      for (let ms = 0; ms <= tMax * MS; ms += stepMs) { const xx = X(ms / MS); x.beginPath(); x.moveTo(xx, Bt); x.lineTo(xx, Bt + 4); x.stroke(); x.fillText(ms + ' ms', xx, Bt + 11); }
      if (!st) return;
      st.marks.forEach((m, i) => {
        const xx = X(m.t); x.strokeStyle = m.col; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, Bt); x.stroke(); x.setLineDash([]);
        x.font = '600 10px "Chakra Petch", Arial'; const txt = m.label.toUpperCase(), tw = x.measureText(txt).width, ly = Bt - 9 - (i % 3) * 15;
        x.fillStyle = 'rgba(6,10,17,.92)'; x.fillRect(xx + 3, ly - 7, tw + 8, 14);
        x.fillStyle = m.col; x.textAlign = 'left'; x.fillText(txt, xx + 7, ly); x.font = '10px "JetBrains Mono", Menlo, monospace';
      });
      st.tl.forEach((a) => {
        const y = T + a.seq * lane + lane / 2, x0 = X(a.t0), x1 = X(a.t1 == null ? st.t : a.t1);
        const pk = packets.find((p) => p.kind === 'data' && p.seq === a.seq && p.attempt === a.attempt);
        const bk = (pk && pk.backup) || a.bk; if (pk && pk.backup) a.bk = true;
        x.fillStyle = bk ? '#8fb36a' : '#e0b452'; x.globalAlpha = a.res === 'lost' ? 0.55 : 1;
        x.fillRect(x0, y - 3, Math.max(2, x1 - x0), 6); x.globalAlpha = 1;
        if (a.res === 'lost') { x.strokeStyle = '#ef6b5b'; x.lineWidth = 2; x.beginPath(); x.moveTo(x1 - 4, y - 4); x.lineTo(x1 + 4, y + 4); x.moveTo(x1 + 4, y - 4); x.lineTo(x1 - 4, y + 4); x.stroke(); x.lineWidth = 1; }
        if (a.res === 'ok') { x.fillStyle = a.rec ? '#f2d083' : '#c9cfd8'; x.beginPath(); x.moveTo(x1, y - 5); x.lineTo(x1 + 5, y); x.lineTo(x1, y + 5); x.lineTo(x1 - 5, y); x.fill();
          if (a.rec) { x.strokeStyle = '#f2d083'; x.beginPath(); x.arc(x1, y, 8, 0, 7); x.stroke(); } }
      });
      x.strokeStyle = 'rgba(233,237,243,.6)'; x.beginPath(); x.moveTo(X(st.t), T - 2); x.lineTo(X(st.t), Bt); x.stroke();
    }

    // ------------------------------------------------------------------ controls
    const CMDS = [
      ['sudo python3 live_demo.py', 'live_demo.py', 'go', 'Full story: loss, detection, recovery, then the main cable breaks and traffic moves to the backup path'],
      ['sudo python3 live_demo.py --fail switch', 'live_demo.py --fail switch', 'go2', 'Same story, but switch s2 fails instead of the cable'],
      ['h1 python3 udp_sender.py --host 10.2.2.20 --count 12', 'udp_sender.py', '', 'Our method with random loss (keeps any broken link)'],
      ['h1 python3 udp_sender.py --host 10.2.2.20 --count 12 --no-recovery', 'udp_sender.py --no-recovery', '', 'Plain UDP: no ACKs, no resends'],
      ['link s1 s2 down', 'link s1 s2 down', 'bad', 'Break the main cable (Mininet CLI)'],
      ['link s1 s2 up', 'link s1 s2 up', 'good', 'Repair the main cable'],
      ['switch s2 stop', 'switch s2 stop', 'bad', 'Switch s2 fails'],
      ['switch s2 start', 'switch s2 start', 'good', 'Switch s2 comes back'],
      ['sh ovs-ofctl dump-flows s1', 'dump-flows s1', '', 'Show the rule in s1: output 2 = main, output 3 = backup'],
      ['h1 ping -c 3 h2', 'h1 ping h2', '', 'Ping Server B (Network B) from Server A (Network A)'],
      ['python3 run_tests.py', 'run_tests.py', '', 'Print our real saved results for Test 1 and Test 5'],
      ['sudo mn -c', 'sudo mn -c', '', 'Clean up and reset everything']
    ];
    CMDS.forEach((c) => { const b = el('button', 'ns-tab ' + c[2], c[1]); b.title = c[0] + '\n' + c[3]; b.onclick = () => runCmd(c[0]); P.tabs.appendChild(b); });
    const pz = el('button', 'ns-tab ctl', '❚❚'); pz.title = 'Pause / resume'; pz.onclick = () => { if (st && !st.done && st.next) running = !running; }; P.tabs.appendChild(pz);
    root.querySelector('.ns-in').addEventListener('submit', (e) => { e.preventDefault(); const v = P.input.value.trim(); P.input.value = ''; if (v) runCmd(v, true); });
    P.input.addEventListener('keydown', (e) => e.stopPropagation());
    root.querySelector('.ns-view').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); });
    root.querySelectorAll('.ns-seg').forEach((sg) => sg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      cfg[sg.dataset.k] = parseFloat(b.dataset.v); if (st) paintLinks();
    }));
    P.acks.onchange = function () {
      P.body.innerHTML = '';
      const rows = st.rows.slice(); st.rows = [];
      rows.forEach((r) => row(parseFloat(r.t) / MS, r.pkt, r.path, r.text, r.cls));
    };
    q('.ns-csv').onclick = function () {
      const lines = ['time_ms,packet,path,event'].concat(st.rows.map((r) => [r.t, r.pkt, r.path, '"' + r.text.replace(/"/g, '""') + '"'].join(',')));
      const a = el('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'packet_transcript.csv'; a.click();
    };
    function start(story, keepNet) {
      reset(keepNet);
      st.story = story;
      st.forceLoss = story ? { 2: 1 } : {};
      paintLinks();
      row(0, '', '', story ? 'Full story: 10% loss on cable s1–s2. Packet #2 will be lost, then the main path fails while #6 is on it.' : (st.plain ? 'Plain UDP' : 'Our method') + ', ' + Math.round(cfg.loss * 100) + '% random loss on cable s1–s2.', 'info');
      running = true;
    }

    // ------------------------------------------------------------------ deck interface
    this.dpr = 2;
    this.w = {
      resize(scale) {
        const r = P.v3, W = r.clientWidth, H = r.clientHeight;
        self.dpr = Math.min(2.5, (window.devicePixelRatio || 1) * (scale || 1));
        renderer.setPixelRatio(self.dpr); renderer.setSize(W, H, false);
        cam.aspect = W / H; cam.updateProjectionMatrix();
        drawWave();
      },
      frame(dt) {
        if (running && !st.done) { const n = cfg.speed > 1 ? 3 : 2; for (let i = 0; i < n; i++) step(dt * cfg.speed / n); foot(); }
        self.clock = (self.clock || 0) + dt;
        LINKS.forEach((l) => l.dots.forEach((d) => {
          const fwd = !(l.kind !== 'edge' && false);
          const f = ((self.clock * 0.28 + d.userData.off) % 1) * l.len, q = pointAt(l, f, fwd);
          d.position.set(q.x, 0.12, q.z); d.material.opacity = l.live ? 0.55 : 0;
        }));
        for (const id of ['A', 'B']) NODES[id].leds.forEach((m) => { if (m.userData.t > 0) { m.userData.t -= dt; if (m.userData.t <= 0) m.material.color.setHex(id === 'A' ? 0x24324a : 0x1d3a3a); } });
        controls.update();
        renderer.render(scene, cam);
        const W = P.v3.clientWidth, H = P.v3.clientHeight, v = new THREE.Vector3();
        labels.forEach((L) => { v.copy(L.pos).project(cam); L.d.style.left = ((v.x + 1) / 2 * W).toFixed(1) + 'px'; L.d.style.top = ((1 - v.y) / 2 * H + L.dy).toFixed(1) + 'px'; L.d.style.display = v.z < 1 ? '' : 'none'; });
        if (running) drawWave();
      }
    };
    this.key = function (e) {
      const k = e.key.toLowerCase();
      if (k === ' ') { if (!running && (!st.next || st.done)) runCmd('sudo python3 live_demo.py'); else running = !running; return true; }
      if (k === 'b') { runCmd('link s1 s2 down'); return true; }
      if (k === 'u') { runCmd('link s1 s2 up'); return true; }
      if (k === 'r') { runCmd('sudo mn -c'); return true; }
      return false;
    };
    reset();
    tprint('Mininet network for our project (simulation of the real run in the Ubuntu VM).\n' +
      'Server A = h1, Network A, 10.1.1.10      Server B = h2, Network B, 10.2.2.20\n' +
      'Click a command above to run it, or type one. Start with  live_demo.py', 'dim');
  }

  function pointAt(l, d, fromA) {
    if (!fromA) d = l.len - d;
    for (let i = 1; i < l.pts.length; i++) {
      if (d <= l.cum[i] || i === l.pts.length - 1) {
        const f = Math.max(0, Math.min(1, (d - l.cum[i - 1]) / (l.cum[i] - l.cum[i - 1] || 1)));
        return { x: l.pts[i - 1].x + (l.pts[i].x - l.pts[i - 1].x) * f, z: l.pts[i - 1].z + (l.pts[i].z - l.pts[i - 1].z) * f };
      }
    }
    return l.pts[l.pts.length - 1];
  }
  function blink(n, col) {
    const led = n.leds[(n.ledI = ((n.ledI || 0) + 1) % n.leds.length)];
    led.material.color.setHex(col); led.userData.t = 0.6;
  }
  function glowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  function chipTex(name, col) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#0e1522'; x.fillRect(8, 8, 240, 240);
    x.strokeStyle = col; x.globalAlpha = 0.55; x.lineWidth = 3; x.strokeRect(20, 20, 216, 216); x.globalAlpha = 1;
    x.fillStyle = col; x.font = '700 104px "Chakra Petch", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 118);
    x.fillStyle = '#7d8ba0'; x.font = '600 26px "JetBrains Mono", monospace'; x.fillText('OVS SWITCH', 128, 196);
    x.beginPath(); x.arc(42, 42, 7, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  function ord(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

  function boardTex() {
    const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), X = (v) => (v + 12) / 24 * W, Z = (v) => (v + 6) / 12 * H;
    x.fillStyle = '#0b1220'; x.fillRect(0, 0, W, H);
    // network zones
    const zone = (x0, x1, col, a) => { x.fillStyle = col.replace('A', a); x.strokeStyle = col.replace('A', '.45'); x.lineWidth = 3; x.setLineDash([14, 10]);
      x.beginPath(); x.roundRect ? x.roundRect(X(x0), Z(-5.4), X(x1) - X(x0), Z(5.4) - Z(-5.4), 28) : x.rect(X(x0), Z(-5.4), X(x1) - X(x0), Z(5.4) - Z(-5.4)); x.fill(); x.stroke(); x.setLineDash([]); };
    zone(-11.5, -3.6, 'rgba(107,155,216,A)', '.07');
    zone(3.6, 11.5, 'rgba(89,184,168,A)', '.07');
    let s = 11; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 140; i++) {
      x.strokeStyle = rnd() < 0.2 ? 'rgba(224,180,82,.13)' : 'rgba(120,145,185,.10)'; x.lineWidth = 2 + rnd() * 2;
      let px = Math.round(rnd() * 64) * 32, py = Math.round(rnd() * 32) * 32; x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 3; j++) { const d = Math.round((rnd() - 0.5) * 8) * 32; if (j % 2) { px += d; py += d * (rnd() < 0.5 ? 1 : -1); } else px += d; x.lineTo(px, py); }
      x.stroke(); x.fillStyle = x.strokeStyle; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(120,145,185,.05)'; x.lineWidth = 1;
    for (let i = 0; i < W; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
    for (let i = 0; i < H; i += 64) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
    x.fillStyle = 'rgba(180,195,220,.22)'; x.font = '600 30px "JetBrains Mono", monospace';
    x.fillText('PKT-LOSS-LAB  REV 2', X(-11.2), Z(-5.0)); x.textAlign = 'right'; x.fillText('MININET · OPEN vSWITCH', X(11.2), Z(-5.0));
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  function drawPcb(cv) {
    const x = cv.getContext('2d');
    let s = 3; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    x.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      x.strokeStyle = rnd() < 0.2 ? 'rgba(224,180,82,.08)' : 'rgba(107,155,216,.07)';
      let px = Math.round(rnd() * 64) * 20, py = Math.round(rnd() * 36) * 20; x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 4; j++) { if (j % 2) px += Math.round((rnd() - 0.5) * 12) * 20; else py += Math.round((rnd() - 0.5) * 8) * 20; x.lineTo(px, py); }
      x.stroke(); x.beginPath(); x.arc(px, py, 2.2, 0, 7); x.stroke();
    }
  }

  const prev = window.M3D.mount;
  window.M3D.mount = function (root, kind) { return kind === 3 ? new NetSim(root) : prev(root, kind); };
})();
