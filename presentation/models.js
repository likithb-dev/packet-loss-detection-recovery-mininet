/* models.js - the two interactive 3D slides */
(function () {
  'use strict';
  const E = window.E3D;
  const { COL, hx, rand, el, World, Terminal, buildNotes, ui, makeLabel, glowSprite, disposeTree, std, sleep, until, padL, padR } = E;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const BOX = new THREE.BoxGeometry(0.5, 0.5, 0.5); BOX.userData.shared = true;
  const BOXE = new THREE.EdgesGeometry(BOX); BOXE.userData.shared = true;
  const SPH = new THREE.SphereGeometry(0.22, 16, 12); SPH.userData.shared = true;

  // ------------------------------------------------------------ shared scaffold
  function scaffold(root, title) {
    root.innerHTML =
      '<div class="m-view">' +
      '  <div class="m-bar"></div>' +
      '  <div class="m-hud"></div>' +
      '  <div class="m-info hidden"><button class="m-x">&times;</button><b></b><div class="m-info-b"></div></div>' +
      '  <div class="m-banner"></div><div class="m-flash"></div>' +
      '  <div class="m-tour hidden"><div class="m-tour-n"></div><div class="m-tour-t"></div>' +
      '    <div class="m-tour-b"><button data-a="prev">&#8249; Back</button><button data-a="next">Next &#8250;</button><button data-a="end">End tour</button></div></div>' +
      '  <div class="m-hint">Drag to rotate &middot; scroll to zoom &middot; right-drag to move &middot; click any object</div>' +
      '  <div class="m-legend"></div>' +
      '</div>' +
      '<div class="m-side"><div class="m-termwrap"></div><div class="m-noteswrap"></div></div>';
    const q = (s) => root.querySelector(s);
    const parts = {
      view: q('.m-view'), bar: q('.m-bar'), hud: q('.m-hud'), info: q('.m-info'), banner: q('.m-banner'),
      flash: q('.m-flash'), tour: q('.m-tour'), legend: q('.m-legend'), term: q('.m-termwrap'), notes: q('.m-noteswrap')
    };
    q('.m-x').addEventListener('click', function () { parts.info.classList.add('hidden'); });
    return parts;
  }

  function common(self, P) {
    self.banner = function (text, color, sub) {
      P.banner.innerHTML = '<div>' + text + '</div>' + (sub ? '<small>' + sub + '</small>' : '');
      P.banner.style.color = hx(color);
      P.banner.style.textShadow = '0 0 18px ' + hx(color) + ', 0 0 40px ' + hx(color);
      P.banner.classList.remove('show');
      void P.banner.offsetWidth;
      P.banner.classList.add('show');
    };
    self.flash = function (color, strength) {
      P.flash.style.background = 'radial-gradient(ellipse at center, transparent 30%, ' + hx(color) + ' 140%)';
      P.flash.style.setProperty('--fo', strength || 0.85);
      P.flash.classList.remove('go');
      void P.flash.offsetWidth;
      P.flash.classList.add('go');
    };
    self.hud = function (items) {
      P.hud.innerHTML = items.map(function (it) {
        return '<div class="hc" id="' + it[0] + '" title="' + (it[3] || '') + '"><span>' + it[1] + '</span><b style="color:' + (it[2] || '#f5f7fa') + '">0</b></div>';
      }).join('');
    };
    self.set = function (id, v, color) {
      const b = P.hud.querySelector('#' + id + ' b');
      if (!b) return;
      if (b.textContent !== String(v)) {
        b.textContent = v;
        b.parentNode.classList.remove('bump');
        void b.parentNode.offsetWidth;
        b.parentNode.classList.add('bump');
      }
      if (color) b.style.color = color;
    };
    self.showInfo = function (o) {
      if (!o) { P.info.classList.add('hidden'); return; }
      const inf = typeof o.userData.info === 'function' ? o.userData.info() : o.userData.info;
      P.info.querySelector('b').textContent = inf.title;
      P.info.querySelector('.m-info-b').innerHTML = inf.html;
      P.info.classList.remove('hidden');
      self.notes.showSelection(inf.title, inf.html + (inf.more || ''));
    };
    // guided tour
    self.tourIdx = -1;
    self.startTour = function () { self.tourIdx = 0; self.showTour(); };
    self.showTour = function () {
      const st = self.tour[self.tourIdx];
      P.tour.classList.remove('hidden');
      P.tour.querySelector('.m-tour-n').textContent = 'Guided tour · step ' + (self.tourIdx + 1) + ' of ' + self.tour.length;
      P.tour.querySelector('.m-tour-t').innerHTML = st.text;
      self.w.tweenTo(st.cam, st.target, 1.5);
      if (st.select) self.w.select(st.select());
      if (st.action) st.action();
    };
    P.tour.addEventListener('click', function (e) {
      const a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (!a) return;
      if (a === 'end') { P.tour.classList.add('hidden'); self.tourIdx = -1; self.w.tweenTo(self.w.home.cam.toArray(), self.w.home.target.toArray(), 1.4); return; }
      self.tourIdx = Math.max(0, Math.min(self.tour.length - 1, self.tourIdx + (a === 'next' ? 1 : -1)));
      self.showTour();
    });
    self.w.onSelect = function (o) { self.showInfo(o); };
  }

  function legend(P, items) {
    P.legend.innerHTML = items.map(function (i) {
      return '<span><i style="background:' + hx(i[0]) + ';box-shadow:0 0 8px ' + hx(i[0]) + '"></i>' + i[1] + '</span>';
    }).join('');
  }

  function bridge(a, b) { return new THREE.LineCurve3(a.clone(), b.clone()); }

  function makePacket(w, seq, color, isAck) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(isAck ? SPH : BOX, std(color, { emissive: color, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 }));
    g.add(m);
    if (!isAck) g.add(new THREE.LineSegments(BOXE, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
    g.add(glowSprite(color, isAck ? 1.3 : 1.9, 0.9));
    const lab = makeLabel(isAck ? 'ACK ' + seq : '#' + seq, { height: isAck ? 0.42 : 0.55, color: hx(color), border: hx(color), size: 40 });
    lab.position.y = isAck ? 0.6 : 0.85;
    g.add(lab);
    g.userData.ringSize = 0.9;
    g.userData.noHoverScale = true;
    w.scene.add(g);
    return g;
  }

  function removeObj(w, g) {
    w.unregister(g);
    w.scene.remove(g);
    disposeTree(g);
  }

  // =====================================================================================
  // MODEL 1 - Detection and recovery (sequence numbers, ACKs, timeout, retransmission)
  // =====================================================================================
  function Model1(root) {
    const self = this;
    const P = scaffold(root);
    const w = (this.w = new World(P.view, { cam: [0, 7.6, 25.5], target: [0, 1.7, 0] }));
    common(this, P);

    const cfg = (this.cfg = { N: 20, W: 5, loss: 0.12, ackLoss: 0, timeout: 0.2, mode: 'ours', speed: 1 });
    const TRAVEL = 2.8;   // seconds (slow motion) for a packet to cross h1 -> h2
    const SEND_GAP = 0.55;

    // ---------- scene
    const h1 = w.host(V(-12.5, 0, 0), 'Server A', '192.168.252.2', COL.blue, 'sender');
    const h2 = w.host(V(12.5, 0, 0), 'Server B', '192.168.252.1', COL.green, 'receiver');
    const s1 = w.switchBox(V(-4.3, 0, 0), 's1');
    const s2 = w.switchBox(V(4.3, 0, 0), 's2');
    const y = 0.25;
    const L1 = w.link(V(-11.2, y, 0), V(-5.6, y, 0), { arc: 0.6 });
    const L2 = w.link(V(-3.0, y, 0), V(3.0, y, 0), { arc: 0.9, color: COL.red, flowColor: 0xff8a95 });
    const L3 = w.link(V(5.6, y, 0), V(11.2, y, 0), { arc: 0.6 });
    const path = new THREE.CurvePath();
    path.add(bridge(V(-12.5, y, 0), V(-11.2, y, 0)));
    path.add(L1.curve);
    path.add(bridge(V(-5.6, y, 0), V(-3.0, y, 0)));
    path.add(L2.curve);
    path.add(bridge(V(3.0, y, 0), V(5.6, y, 0)));
    path.add(L3.curve);
    path.add(bridge(V(11.2, y, 0), V(12.5, y, 0)));
    const cum = path.getCurveLengths();
    const total = path.getLength();
    const tLoss = (cum[2] + (cum[3] - cum[2]) / 2) / total;
    const laneData = V(0, 0.55, -0.55);
    const laneAck = V(0, 0.2, 0.6);

    // loss zone (noise storm on the s1-s2 link)
    const zone = new THREE.Group();
    zone.position.copy(L2.curve.getPointAt(0.5));
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.1 + i * 0.3, 0.035, 8, 48), new THREE.MeshBasicMaterial({
        color: COL.red, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      r.rotation.y = Math.PI / 2;
      r.position.x = (i - 1) * 0.9;
      zone.add(r);
      rings.push(r);
    }
    const cloudN = 140;
    const cp = new Float32Array(cloudN * 3);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    const cloud = new THREE.Points(cg, new THREE.PointsMaterial({
      color: 0xff6b7a, size: 0.28, map: E.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    zone.add(cloud);
    const zoneGlow = glowSprite(COL.red, 5, 0.35);
    zone.add(zoneGlow);
    const zoneLabel = makeLabel('LOSS ZONE', { height: 0.55, color: '#ff8a95', border: '#ff4d5e' });
    zoneLabel.position.y = 2.1;
    zone.add(zoneLabel);
    w.scene.add(zone);
    const cloudSeed = [];
    for (let i = 0; i < cloudN; i++) cloudSeed.push([rand(-2.2, 2.2), rand(0, Math.PI * 2), rand(0.3, 1.3), rand(0.5, 2)]);
    w.updaters.push(function (dt) {
      rings.forEach(function (r, i) { r.rotation.x += dt * (1 + i * 0.6); r.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(w.time * 3 + i)); });
      const k = 0.4 + cfg.loss * 4;
      for (let i = 0; i < cloudN; i++) {
        const s = cloudSeed[i];
        const a = s[1] + w.time * s[3];
        cp[i * 3] = s[0] + Math.sin(w.time * 5 + i) * 0.08;
        cp[i * 3 + 1] = Math.cos(a) * s[2] * k;
        cp[i * 3 + 2] = Math.sin(a) * s[2] * k;
      }
      cg.attributes.position.needsUpdate = true;
      cloud.material.opacity = Math.min(1, 0.15 + cfg.loss * 4);
      zoneGlow.material.opacity = 0.2 + cfg.loss * 1.5 + 0.1 * Math.sin(w.time * 6);
    });

    // rows of slots: sender (packets + window) and receiver (checklist)
    const NMAX = 32;
    function makeRow(cx, title, color) {
      const g = new THREE.Group();
      const slots = [];
      for (let i = 0; i < NMAX; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), new THREE.MeshBasicMaterial({ color: COL.grey }));
        const lab = makeLabel(String(i), { height: 0.3, bg: null, color: '#c3ccd8', size: 36 });
        g.add(m, lab);
        slots.push({ m, lab, state: 'idle', pulse: 0 });
      }
      const t = makeLabel(title, { height: 0.55, border: hx(color) });
      g.add(t);
      g.position.set(cx, 4.7, 0);
      w.scene.add(g);
      return { g, slots, title: t, cx };
    }
    const sRow = makeRow(-8.6, 'Server A · packets to send', COL.blue);
    const rRow = makeRow(8.6, 'Server B · checklist of numbers received', COL.green);
    let sp = 0.45;
    function layoutRows() {
      sp = Math.min(0.55, 9.2 / cfg.N);
      [sRow, rRow].forEach(function (row) {
        row.slots.forEach(function (s, i) {
          const vis = i < cfg.N;
          s.m.visible = s.lab.visible = vis;
          const x = -((cfg.N - 1) * sp) / 2 + i * sp;
          s.m.position.set(x, 0, 0);
          s.m.scale.set(sp * 0.8, sp * 0.8, 1);
          s.lab.position.set(x, -sp * 0.85, 0);
          s.lab.visible = vis && sp >= 0.3;
        });
        row.title.position.set(0, 1.15, 0);
      });
    }
    // sliding window frame
    const frame = new THREE.Group();
    const fbox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: COL.yellow, transparent: true, opacity: 0.1, depthWrite: false }));
    const fedge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: COL.yellow }));
    frame.add(fbox, fedge);
    sRow.g.add(frame);
    const frameLabel = makeLabel('window', { height: 0.3, color: '#ffe066', border: '#ffe066', size: 36 });
    sRow.g.add(frameLabel);
    let frameX = 0;
    function slotX(i) { return -((cfg.N - 1) * sp) / 2 + i * sp; }

    const SLOTCOL = { idle: COL.grey, flight: COL.blue, retx: COL.orange, acked: COL.green, got: COL.green, missing: COL.red, recovered: COL.yellow, lost: COL.red };
    function setSlot(row, i, state) {
      const s = row.slots[i];
      if (!s) return;
      s.state = state;
      s.pulse = 1;
      s.m.material.color.setHex(SLOTCOL[state]);
    }
    w.updaters.push(function (dt) {
      [sRow, rRow].forEach(function (row) {
        row.slots.forEach(function (s) {
          if (s.pulse > 0) s.pulse = Math.max(0, s.pulse - dt * 2.5);
          let k = 1 + s.pulse * 0.6;
          if (s.state === 'missing') {
            k += 0.25 * Math.abs(Math.sin(w.time * 7));
            s.m.material.color.setHex(Math.floor(w.time * 6) % 2 ? COL.red : 0x66101a);
          }
          s.m.scale.set(sp * 0.8 * k, sp * 0.8 * k, 1);
        });
      });
      const target = slotX(st.base) + ((cfg.W - 1) * sp) / 2;
      frameX += (target - frameX) * Math.min(1, dt * 6);
      frame.position.set(frameX, 0, 0);
      frame.scale.set(cfg.W * sp + 0.06, sp * 1.7, 0.75);
      frame.visible = frameLabel.visible = cfg.mode === 'ours' && !st.done;
      frameLabel.position.set(frameX, sp * 1.55, 0);
      fbox.material.opacity = 0.08 + 0.06 * Math.sin(w.time * 4);
    });

    // ---------- clickable info
    w.register(h1.group, function () {
      return {
        title: 'Server A, the sender (192.168.252.2)',
        html: '<p>This computer runs <code>udp_sender.py</code>. It gives every packet a number (0, 1, 2, ...) and sends it to Server B.</p>' +
          '<p>It keeps a copy of every packet until Server B says "got it" (an <b>ACK</b>). If no ACK comes back in time, it sends that packet again.</p>' +
          '<p class="dim">Right now: ' + st.transmissions + ' packets sent in total, ' + st.retx + ' of them were resends.</p>'
      };
    });
    w.register(h2.group, function () {
      return {
        title: 'Server B, the receiver (192.168.252.1)',
        html: '<p>This computer runs <code>udp_receiver.py</code>. It checks the number on every packet.</p>' +
          '<p>If it gets #4 and then #6, it knows #5 is missing and prints <b class="red">LOSS DETECTED</b>. When #5 finally arrives it prints <b class="green">RECOVERED</b>.</p>' +
          '<p>For every packet it gets, it sends back a small green ACK.</p>' +
          '<p class="dim">Right now: ' + st.received.size + ' of ' + cfg.N + ' received, ' + st.missingEver.size + ' gaps found.</p>'
      };
    });
    [s1, s2].forEach(function (s, i) {
      w.register(s.group, {
        title: 'Switch s' + (i + 1),
        html: '<p>A switch is a box that passes packets from one cable to the next, like a traffic junction.</p><p>In our Mininet network the switches are <b>Open vSwitch</b> (software switches).</p>'
      });
    });
    w.register(zone, function () {
      return {
        title: 'Loss zone on the s1 to s2 cable',
        html: '<p>This cable loses <b>' + Math.round(cfg.loss * 100) + '%</b> of packets on purpose, to copy a bad real network (in Mininet we do this with <code>TCLink loss=10</code>).</p>' +
          '<p>When a packet is lost here it explodes in red and never reaches Server B. Use the <b>Loss</b> slider to change it.</p>'
      };
    });
    w.register(L1.tube, { title: 'Cable Server A to s1', html: '<p>A normal cable. Blue packets go right (data), green balls come back left (ACKs).</p>' });
    w.register(L3.tube, { title: 'Cable s2 to Server B', html: '<p>A normal cable from switch s2 to the receiver Server B.</p>' });
    w.register(L2.tube, function () { return zone.userData.info(); });
    w.register(sRow.g, function () {
      return {
        title: 'Sender row and the yellow window',
        html: '<p>Each box is one packet number. <b class="blue">Blue</b> = on its way, <b class="orange">orange</b> = sent again, <b class="green">green</b> = Server B confirmed it.</p>' +
          '<p>The <b class="yellow">yellow frame</b> is the <b>window</b>: Server A may have at most ' + cfg.W + ' packets waiting for an ACK. When the oldest one is confirmed, the window slides right.</p>'
      };
    });
    w.register(rRow.g, {
      title: 'Receiver checklist',
      html: '<p>Server B ticks off every number it gets (<b class="green">green</b>).</p><p>A <b class="red">flashing red</b> box is a number Server B knows is missing, because a bigger number already arrived. <b class="yellow">Yellow</b> means it arrived later after being sent again.</p>'
    });

    // ---------- simulation state
    let st;
    function freshState() {
      return {
        simT: 0, running: false, done: false, base: 0, next: 0, lastSend: -99, acked: new Set(), sentTime: {},
        transmissions: 0, retx: 0, lostData: 0, lostAck: 0, received: new Set(), highest: -1, missingEver: new Set(),
        recovered: 0, duplicates: 0, pk: [], ak: [], forceDrop: 0, forceAckDrop: 0, finishedAt: 0, plainDone: false
      };
    }
    st = freshState();
    this.st = function () { return st; };

    const TIMEOUT_SIM = function () { return (cfg.timeout / 0.2) * 7.5; };
    const log = function (t, cls) { if (self.term) self.term.print(t, cls); };

    function sendPacket(seq, isRetx) {
      st.transmissions++;
      st.sentTime[seq] = st.simT;
      let lost = false;
      if (st.forceDrop > 0) { st.forceDrop--; lost = true; } else if (Math.random() < cfg.loss) lost = true;
      const color = isRetx ? COL.orange : COL.blue;
      const g = makePacket(w, seq, color, false);
      const p = { g, seq, t: 0, lost, retx: isRetx, trailT: 0, sentAt: st.simT };
      w.register(g, function () {
        return {
          title: 'Data packet #' + seq + (p.retx ? ' (sent again)' : ''),
          html: '<p>Inside: <code>' + seq + '|time|hello</code>, which is the packet number, the time it was sent, and the data.</p>' +
            (p.retx ? '<p>This is a <b class="orange">resend</b>: the first copy got no ACK in time.</p>' : '<p>This is the first time Server A sends it.</p>') +
            (p.lost ? '<p class="red">This one is going to be lost in the loss zone.</p>' : '<p>It will reach Server B.</p>')
        };
      });
      st.pk.push(p);
      setSlot(sRow, seq, isRetx ? 'retx' : 'flight');
      h1.flash(color);
      h1.say((isRetx ? 'resend #' : 'send #') + seq);
      const pos = path.getPointAt(0).add(laneData);
      w.ring(pos, color, 2, 0.5);
      if (isRetx) {
        st.retx++;
        log('[Server A · sender] timeout for packet ' + seq + ', retransmitting', 'orange');
        w.floatText(V(-12.5, 3.2, 0), 'TIMEOUT · RESEND #' + seq, COL.orange, 1.4, 0.45);
      }
    }

    function sendAck(seq) {
      let lost = false;
      if (st.forceAckDrop > 0) { st.forceAckDrop--; lost = true; } else if (Math.random() < cfg.ackLoss) lost = true;
      const g = makePacket(w, seq, COL.green, true);
      const a = { g, seq, t: 0, lost, trailT: 0 };
      w.register(g, {
        title: 'ACK for packet #' + seq,
        html: '<p>A small reply from Server B that says <b>"I got packet ' + seq + '"</b>. Inside: <code>ACK|' + seq + '</code>.</p>' +
          '<p>When Server A gets it, packet ' + seq + ' is done and does not need to be sent again.</p>' + (lost ? '<p class="red">This ACK will be lost, so Server A will resend #' + seq + ' and Server B will get a duplicate.</p>' : '')
      });
      st.ak.push(a);
    }

    function explode(pos, color, text) {
      w.burst(pos, color, 90, 8, 1.2, 0.5);
      w.burst(pos, 0xffffff, 30, 4, 0.6, 0.3);
      w.ring(pos, color, 4.5, 0.8);
      w.floatText(pos.clone().add(V(0, 1, 0)), text, color, 1.6);
      w.shake(0.22);
      w.lightFlash(color, 4);
      self.flash(color, 0.55);
    }

    function deliver(p) {
      const seq = p.seq;
      const pos = path.getPointAt(1).add(laneData);
      h2.say('got #' + seq);
      if (st.received.has(seq)) {
        st.duplicates++;
        w.floatText(pos.clone().add(V(0, 1.4, 0)), 'DUPLICATE #' + seq, COL.purple, 1.3, 0.45);
        w.burst(pos, COL.purple, 30, 4, 0.7, 0.35);
      } else {
        if (seq > st.highest + 1) {
          const gap = [];
          for (let s = st.highest + 1; s < seq; s++) if (!st.received.has(s)) gap.push(s);
          if (gap.length) {
            log('[Server B · receiver] LOSS DETECTED: expected ' + (st.highest + 1) + ', got ' + seq + ', missing [' + gap.join(', ') + ']', 'red');
            gap.forEach(function (s) { st.missingEver.add(s); setSlot(rRow, s, 'missing'); });
            self.banner('LOSS DETECTED', COL.red, 'expected #' + (st.highest + 1) + ', got #' + seq + ' &rarr; missing ' + gap.map(function (s) { return '#' + s; }).join(' '));
            h2.flash(COL.red);
            w.ring(V(12.5, 1, 0), COL.red, 6, 1);
            w.lightFlash(COL.red, 3);
          }
        }
        if (st.missingEver.has(seq)) {
          st.recovered++;
          log('[Server B · receiver] RECOVERED: packet ' + seq + ' arrived after retransmission', 'green');
          self.banner('RECOVERED #' + seq, COL.green, 'it arrived after being sent again');
          self.flash(COL.green, 0.5);
          w.burst(pos, COL.green, 120, 9, 1.3, 0.55);
          w.burst(pos, COL.yellow, 60, 6, 1.0, 0.4);
          w.ring(pos, COL.green, 5, 1);
          w.lightFlash(COL.green, 4);
          setSlot(rRow, seq, 'recovered');
        } else {
          setSlot(rRow, seq, 'got');
          w.burst(pos, COL.cyan, 25, 3, 0.6, 0.3);
        }
        h2.flash(COL.green);
        st.received.add(seq);
        st.highest = Math.max(st.highest, seq);
      }
      if (cfg.mode === 'ours') sendAck(seq);
    }

    function ackArrive(a) {
      st.acked.add(a.seq);
      setSlot(sRow, a.seq, 'acked');
      while (st.acked.has(st.base)) st.base++;
      h1.flash(COL.green);
      w.burst(path.getPointAt(0).add(laneAck), COL.green, 20, 3, 0.5, 0.3);
    }

    function finish() {
      st.done = true;
      st.running = false;
      self.runBtn.textContent = 'Start';
      const N = cfg.N;
      const time = st.simT / 10;
      const missing = N - st.received.size;
      const tail = [];
      for (let s = 0; s < N; s++) if (!st.received.has(s)) { st.missingEver.add(s); tail.push(s); setSlot(rRow, s, 'lost'); }
      if (missing === 0) {
        self.banner('ALL ' + N + ' DELIVERED', COL.green, st.retx + ' resends, 0 missing');
        for (let i = 0; i < 4; i++) setTimeout(function () { w.burst(V(rand(-12, 12), rand(2, 6), rand(-2, 2)), [COL.green, COL.cyan, COL.yellow, COL.pink][i], 140, 10, 1.6, 0.5); }, i * 180);
        self.flash(COL.green, 0.6);
      } else {
        self.banner(missing + ' PACKETS LOST FOREVER', COL.red, 'plain UDP never sends them again');
        self.flash(COL.red, 0.8);
        w.shake(0.4);
      }
      log('');
      log('=========== SENDER REPORT ===========', 'blue');
      log('Packets sent (unique)   : ' + N);
      log('Total transmissions     : ' + st.transmissions);
      log('Retransmissions         : ' + st.retx);
      log('Retransmission rate     : ' + (100 * st.retx / N).toFixed(1) + ' %');
      log('Time taken              : ' + time.toFixed(2) + ' s');
      log('Throughput              : ' + (N / Math.max(0.01, time)).toFixed(1) + ' packets/s');
      log('RESULT {"transmissions": ' + st.transmissions + ', "retransmissions": ' + st.retx + ', "time": ' + time.toFixed(3) + '}', 'dim');
      log('');
      const recovered = Array.from(st.missingEver).filter(function (s) { return st.received.has(s); }).length;
      log('========== RECEIVER REPORT ==========', 'green');
      log('Packets expected        : ' + N);
      log('Unique packets received : ' + st.received.size);
      log('Gaps detected (missing) : ' + st.missingEver.size);
      log('Recovered by retransmit : ' + recovered);
      log('Duplicates received     : ' + st.duplicates);
      log('Still missing           : ' + missing, missing ? 'red' : 'green');
      log('Time taken              : ' + (time * 0.98).toFixed(2) + ' s');
      log('(times are simulated: the animation runs in slow motion)', 'dim');
    }

    this.reset = function () {
      st.pk.forEach(function (p) { removeObj(w, p.g); });
      st.ak.forEach(function (a) { removeObj(w, a.g); });
      st = freshState();
      layoutRows();
      [sRow, rRow].forEach(function (row) { row.slots.forEach(function (s, i) { setSlot(row, i, 'idle'); s.pulse = 0; }); });
      frameX = slotX(0) + ((cfg.W - 1) * sp) / 2;
      zoneLabel.userData.setText('LOSS ZONE · ' + Math.round(cfg.loss * 100) + '% dropped here');
      if (self.runBtn) self.runBtn.textContent = 'Start';
      h1.lines = ['> ready']; h2.lines = ['> listening :5000'];
    };
    this.start = function () {
      if (st.done) self.reset();
      st.running = true;
      self.runBtn.textContent = 'Pause';
    };
    this.toggle = function () {
      if (st.running) { st.running = false; self.runBtn.textContent = 'Resume'; } else self.start();
    };

    // ---------- per-frame simulation
    w.updaters.push(function (dt) {
      const sdt = st.running ? dt * cfg.speed : 0;
      st.simT += sdt;
      if (st.running) {
        const N = cfg.N;
        if (cfg.mode === 'ours') {
          if (st.next < st.base + cfg.W && st.next < N && st.simT - st.lastSend >= SEND_GAP) {
            sendPacket(st.next++, false);
            st.lastSend = st.simT;
          }
          const TO = TIMEOUT_SIM();
          for (let s = st.base; s < st.next; s++) {
            if (!st.acked.has(s) && st.simT - st.sentTime[s] > TO) { sendPacket(s, true); break; }
          }
          if (st.base >= N && !st.done) finish();
        } else {
          if (st.next < N && st.simT - st.lastSend >= SEND_GAP) { sendPacket(st.next++, false); st.lastSend = st.simT; }
          if (st.next >= N && st.pk.length === 0 && !st.done) finish();
        }
      }
      // data packets
      st.pk = st.pk.filter(function (p) {
        p.t += sdt / TRAVEL;
        const pos = path.getPointAt(Math.min(1, p.t)).add(laneData);
        p.g.position.copy(pos);
        p.g.children[0].rotation.x += dt * 3; p.g.children[0].rotation.y += dt * 2;
        if (p.g.children[1]) p.g.children[1].rotation.copy(p.g.children[0].rotation);
        p.trailT += dt;
        if (p.trailT > 0.05 && sdt > 0) { p.trailT = 0; w.trail(pos, p.retx ? COL.orange : COL.blue, 0.8); }
        if (p.lost && p.t >= tLoss) {
          st.lostData++;
          explode(pos, COL.red, 'LOST #' + p.seq);
          removeObj(w, p.g);
          return false;
        }
        if (p.t >= 1) { deliver(p); removeObj(w, p.g); return false; }
        return true;
      });
      // ACKs travel back
      st.ak = st.ak.filter(function (a) {
        a.t += sdt / TRAVEL;
        const pos = path.getPointAt(Math.max(0, 1 - a.t)).add(laneAck);
        a.g.position.copy(pos);
        a.trailT += dt;
        if (a.trailT > 0.06 && sdt > 0) { a.trailT = 0; w.trail(pos, COL.green, 0.55); }
        if (a.lost && a.t >= 1 - tLoss) {
          st.lostAck++;
          explode(pos, COL.pink, 'ACK ' + a.seq + ' LOST');
          removeObj(w, a.g);
          return false;
        }
        if (a.t >= 1) { ackArrive(a); removeObj(w, a.g); return false; }
        return true;
      });
      // HUD (cheap enough every frame, set() only touches the DOM on change)
      self.set('h-sent', st.transmissions);
      self.set('h-retx', st.retx);
      self.set('h-lost', st.lostData + st.lostAck);
      self.set('h-gap', st.missingEver.size);
      self.set('h-rec', st.recovered);
      self.set('h-dup', st.duplicates);
      self.set('h-del', st.received.size + '/' + cfg.N, st.received.size === cfg.N ? '#2ee59d' : '#f5f7fa');
      self.set('h-time', (st.simT / 10).toFixed(2) + ' s');
    });

    // ---------- HUD, legend, controls
    this.hud([
      ['h-sent', 'Sent', '#1e9be6', 'Every packet Server A put on the cable, including resends'],
      ['h-lost', 'Lost on the way', '#ff4d5e', 'Packets and ACKs that exploded in the loss zone'],
      ['h-gap', 'Gaps found', '#ff4d5e', 'Missing numbers Server B noticed'],
      ['h-retx', 'Resent', '#ffa53d', 'Packets Server A sent again after a timeout'],
      ['h-rec', 'Recovered', '#2ee59d', 'Missing packets that arrived after a resend'],
      ['h-dup', 'Duplicates', '#b36bff', 'Copies Server B already had (ACK lost or timeout too short)'],
      ['h-del', 'Delivered', '#f5f7fa', 'Different packet numbers Server B has'],
      ['h-time', 'Time*', '#c3ccd8', 'Simulated time; the animation is slowed down']
    ]);
    legend(P, [[COL.blue, 'data packet'], [COL.orange, 'resent packet'], [COL.green, 'ACK'], [COL.red, 'lost'], [COL.yellow, 'window / recovered'], [COL.purple, 'duplicate']]);

    const U = ui(P.bar);
    const g1 = U.group('Run');
    this.runBtn = U.btn(g1, 'Start', function () { self.toggle(); }, 'mb-go', 'Start or pause (Space)');
    U.btn(g1, 'Reset', function () { self.reset(); }, '', 'Start again from packet 0 (R)');
    const modeOurs = U.btn(g1, 'Our method', function () { setMode('ours'); }, 'on', 'Sequence numbers + ACKs + resending');
    const modePlain = U.btn(g1, 'Plain UDP', function () { setMode('plain'); }, '', 'No ACKs, no resending: lost packets stay lost');
    function setMode(m) {
      cfg.mode = m;
      modeOurs.classList.toggle('on', m === 'ours');
      modePlain.classList.toggle('on', m === 'plain');
      self.reset();
      self.banner(m === 'ours' ? 'OUR METHOD' : 'PLAIN UDP', m === 'ours' ? COL.blue : COL.red, m === 'ours' ? 'numbers + ACKs + resending' : 'no checking at all');
    }
    this.setMode = setMode;
    const g2 = U.group('Break things');
    U.btn(g2, 'Drop next packet', function () { st.forceDrop++; self.banner('NEXT PACKET WILL BE LOST', COL.red); }, 'mb-red', 'The next data packet sent will be lost (D)');
    U.btn(g2, 'Drop 3 in a row', function () { st.forceDrop += 3; self.banner('BURST LOSS x3', COL.red); }, 'mb-red', 'A burst: the next 3 packets are lost');
    U.btn(g2, 'Lose next ACK', function () { st.forceAckDrop++; self.banner('NEXT ACK WILL BE LOST', COL.pink); }, 'mb-pink', 'Shows why duplicates happen (A)');
    const g3 = U.group('Settings');
    this.lossSl = U.slider(g3, 'Loss', 0, 40, 1, cfg.loss * 100, function (v) { return v + '%'; }, function (v) {
      cfg.loss = v / 100;
      zoneLabel.userData.setText('LOSS ZONE · ' + v + '% dropped here');
      L2.setColor(v > 0 ? COL.red : COL.blue);
    }, 'How many packets the s1-s2 cable loses');
    const TOS = [0.1, 0.2, 0.5];
    this.toSl = U.slider(g3, 'Timeout', 0, 2, 1, 1, function (v) { return TOS[v] + 's'; }, function (v) { cfg.timeout = TOS[v]; }, 'How long Server A waits for an ACK before resending (Test 5)');
    U.slider(g3, 'Window', 1, 10, 1, cfg.W, function (v) { return v; }, function (v) { cfg.W = v; }, 'How many packets can wait for an ACK at once');
    this.nSl = U.slider(g3, 'Packets', 8, 32, 1, cfg.N, function (v) { return v; }, function (v) { cfg.N = v; self.reset(); }, 'How many packets to send (resets)');
    U.slider(g3, 'Speed', 0.25, 4, 0.25, 1, function (v) { return v + 'x'; }, function (v) { cfg.speed = v; }, 'Animation speed');
    const g4 = U.group('Camera');
    U.btn(g4, 'Tour', function () { self.startTour(); }, 'mb-go', 'Step-by-step guided explanation (T)');
    U.btn(g4, 'Overview', function () { w.tweenTo(w.home.cam.toArray(), w.home.target.toArray()); });
    U.btn(g4, 'Sender', function () { w.tweenTo([-9, 6, 11], [-9, 3, 0]); });
    U.btn(g4, 'Loss zone', function () { w.tweenTo([2, 4, 8], [0, 1, 0]); });
    U.btn(g4, 'Receiver', function () { w.tweenTo([9, 6, 11], [9, 3, 0]); });
    U.btn(g4, 'Spin', function (b) { w.controls.autoRotate = !w.controls.autoRotate; b.classList.toggle('on', w.controls.autoRotate); });
    U.btn(g4, 'Expand', function (b) { self.expand(b); }, '', 'Make the 3D view fill the slide (E)');

    // ---------- guided tour
    this.tour = [
      { text: '<b>This is our network.</b> Server A on the left sends, Server B on the right receives. Packets travel left to right through two switches, s1 and s2.', cam: [0, 7.6, 25.5], target: [0, 1.7, 0], action: function () { if (!st.running) self.start(); } },
      { text: '<b>Every packet gets a number</b>: 0, 1, 2, 3 ... The yellow frame is the <b>window</b>: Server A can have only ' + cfg.W + ' packets waiting for a reply at a time.', cam: [-9, 6.5, 11], target: [-9, 3.5, 0], select: function () { return sRow.g; } },
      { text: '<b>The red cable loses packets on purpose.</b> Watch packets explode here. This copies a bad real network (congestion, noise).', cam: [2, 4.5, 9], target: [0, 1, 0], select: function () { return zone; }, action: function () { st.forceDrop++; } },
      { text: '<b>Server B checks the numbers.</b> If it gets #4 then #6, #5 is missing: <span class="red">LOSS DETECTED</span>. The missing box flashes red.', cam: [9, 6.5, 11], target: [9, 3.5, 0], select: function () { return rRow.g; } },
      { text: '<b>For every packet, Server B sends back a green ACK</b> ("got it"). If Server A gets no ACK in time, it <span class="orange">resends</span> the packet in orange.', cam: [-3, 5, 13], target: [-3, 0.8, 0], select: function () { return h1.group; } },
      { text: '<b>The result:</b> every packet arrives in the end. The bottom bar counts what was lost, found, resent and recovered. Try <b>Plain UDP</b> to compare.', cam: [0, 7.6, 25.5], target: [0, 1.7, 0] }
    ];

    // ---------- terminal
    const CSV = window.LOCAL_RESULTS || [];
    this.term = new Terminal(P.term, {
      title: 'Server A → Server B (two machines)',
      banner: 'Sender and receiver run on two separate machines.\nserverB$ = commands on Server B (receiver), serverA$ = commands on Server A (sender).\nClick a command to run it. It runs a browser simulation of our programs with the same output format.\nOur real scripts are in the code/ folder.',
      commands: [
        { cmd: 'serverB$ python3 udp_receiver.py', desc: 'Start the receiver on Server B (listens on UDP port 5000)' },
        { cmd: 'serverA$ python3 udp_sender.py --host 192.168.252.1 --count 20 --loss 0.1', desc: 'Our method: send 20 numbered packets, 10% loss' },
        { cmd: 'serverA$ python3 udp_sender.py --host 192.168.252.1 --count 20 --loss 0.1 --no-recovery', desc: 'Plain UDP: no ACKs, no resending' },
        { cmd: 'serverA$ python3 udp_sender.py --host 192.168.252.1 --count 20 --loss 0.1 --timeout 0.1', desc: 'Timeout too short: resends before the ACK can arrive (duplicates)' },
        { cmd: 'serverB$ python3 udp_receiver.py --ack-loss 0.2', desc: 'Receiver that loses 20% of its ACKs' },
        { cmd: 'python3 run_tests.py', desc: 'Show Test 1 and Test 5 results (our saved real run)' },
        { cmd: 'help', desc: 'List commands' }
      ],
      runner: async function (c, t, cancelled) {
        c = c.replace(/^server[AB]\$ /i, '');
        const arg = function (name, def) { const m = c.match(new RegExp('--' + name + '[ =]([0-9.]+)')); return m ? parseFloat(m[1]) : def; };
        if (c === 'help') {
          t.print('Commands:\n  python3 udp_receiver.py [--ack-loss 0.2]\n  python3 udp_sender.py [--count N] [--loss 0.1] [--timeout 0.2] [--window 5] [--no-recovery]\n  python3 run_tests.py\n  clear', 'dim');
          return;
        }
        if (c === 'clear') { t.clear(); return; }
        if (c.indexOf('python3 udp_receiver.py') === 0) {
          cfg.ackLoss = arg('ack-loss', 0);
          self.receiverOn = true;
          t.print('[Server B · receiver] listening on UDP port 5000');
          if (cfg.ackLoss) t.print('(ACK loss set to ' + Math.round(cfg.ackLoss * 100) + '%: watch for pink ACK explosions and duplicates)', 'dim');
          h2.say('> udp_receiver.py');
          return;
        }
        if (c.indexOf('python3 udp_sender.py') === 0) {
          const N = Math.round(Math.max(8, Math.min(32, arg('count', 20))));
          if (arg('count', 20) > 32) t.print('(showing 32 packets so they fit on screen)', 'dim');
          cfg.N = N; self.nSl.set(N);
          cfg.loss = arg('loss', 0); self.lossSl.set(Math.round(cfg.loss * 100)); self.lossSl.input.dispatchEvent(new Event('input'));
          const to = arg('timeout', 0.2); cfg.timeout = to <= 0.1 ? 0.1 : to >= 0.5 ? 0.5 : 0.2; self.toSl.set([0.1, 0.2, 0.5].indexOf(cfg.timeout));
          cfg.W = Math.round(arg('window', cfg.W));
          setMode(c.indexOf('--no-recovery') >= 0 ? 'plain' : 'ours');
          if (!self.receiverOn) { t.print('(receiver was not running: starting it first)', 'dim'); t.print('[Server B · receiver] listening on UDP port 5000'); self.receiverOn = true; }
          t.print("[Server A · sender] sending " + N + " packets to ('192.168.252.1', 5000), " + (cfg.mode === 'plain' ? 'plain UDP (no recovery)' : 'window=' + cfg.W + ', timeout=' + cfg.timeout + 's'));
          h1.say('> udp_sender.py');
          self.start();
          await until(function () { return st.done; }, cancelled);
          return;
        }
        if (c === 'python3 run_tests.py') {
          if (!CSV.length) { t.print('results/local_results.csv not found', 'red'); return; }
          t.print('(printing our saved real results from code/results/local_results.csv)', 'dim');
          t.print('='.repeat(70));
          t.print('TEST 1: Different loss amounts (200 packets, 3 trials each)');
          t.print('='.repeat(70));
          for (const r of CSV.filter(function (r) { return r.test === '1_loss'; })) {
            if (cancelled()) return;
            t.print('  loss ' + padL(r.setting, 2) + '% | ' + padR(r.mode, 10) + ' | trial ' + r.trial + ' | delivered ' + r.received + '/' + r.expected +
              ' | missing ' + padL(r.missing, 2) + ' | resends ' + padL(r.retransmissions, 3) + ' | ' + (+r.time).toFixed(2) + ' s', r.mode === 'plain UDP' && +r.missing ? 'red' : '');
            await sleep(60);
          }
          t.print('');
          t.print('='.repeat(70));
          t.print('TEST 5: Different wait times before resending (10% loss, 3 trials each)');
          t.print('='.repeat(70));
          for (const r of CSV.filter(function (r) { return r.test === '5_timeout'; })) {
            if (cancelled()) return;
            t.print('  timeout ' + r.setting + 's | trial ' + r.trial + ' | delivered ' + r.received + '/' + r.expected + ' | resends ' + padL(r.retransmissions, 3) + ' | duplicates ' + padL(r.duplicates, 2) + ' | ' + (+r.time).toFixed(2) + ' s');
            await sleep(60);
          }
          const avg = function (rows, k) { return rows.reduce(function (a, r) { return a + +r[k]; }, 0) / rows.length; };
          t.print('\n\nFINAL RESULTS (average of 3 trials)\n');
          t.print('Test 1 - Packet loss vs delivery', 'blue');
          t.print(padL('Loss', 6) + ' | ' + padL('Plain UDP delivered', 20) + ' | ' + padL('Our method delivered', 21) + ' | ' + padL('Resends', 8) + ' | ' + padL('Time (s)', 8));
          [0, 5, 10, 20].forEach(function (L) {
            const p = CSV.filter(function (r) { return r.test === '1_loss' && +r.setting === L && r.mode === 'plain UDP'; });
            const o = CSV.filter(function (r) { return r.test === '1_loss' && +r.setting === L && r.mode === 'our method'; });
            t.print(padL(L, 5) + '% | ' + padL((100 * avg(p, 'received') / 200).toFixed(1), 19) + '% | ' + padL((100 * avg(o, 'received') / 200).toFixed(1), 20) + '% | ' +
              padL(avg(o, 'retransmissions').toFixed(1), 8) + ' | ' + padL(avg(o, 'time').toFixed(2), 8));
          });
          t.print('\nTest 5 - Timeout value (10% loss)', 'blue');
          t.print(padL('Timeout', 8) + ' | ' + padL('Delivered', 9) + ' | ' + padL('Resends', 8) + ' | ' + padL('Duplicates', 10) + ' | ' + padL('Time (s)', 8));
          ['0.1', '0.2', '0.5'].forEach(function (T) {
            const o = CSV.filter(function (r) { return r.test === '5_timeout' && r.setting === T; });
            t.print(padL(T, 7) + 's | ' + padL((100 * avg(o, 'received') / 200).toFixed(1), 8) + '% | ' + padL(avg(o, 'retransmissions').toFixed(1), 8) + ' | ' +
              padL(avg(o, 'duplicates').toFixed(1), 10) + ' | ' + padL(avg(o, 'time').toFixed(2), 8));
          });
          t.print('\nRaw results saved to results/local_results.csv');
          return;
        }
        t.print('command not found: ' + c.split(' ')[0] + '   (type help)', 'red');
      }
    });
    this.term.onStop = function () { st.running = false; self.runBtn.textContent = 'Resume'; };

    // ---------- notes
    this.notes = buildNotes(P.notes, [
      {
        id: 'say', label: 'Explain it', html:
          '<h4>What to say, step by step</h4><ol>' +
          '<li><b>Click Start.</b> "On the left is Server A, the sender. On the right is Server B, the receiver. In the middle are two switches."</li>' +
          '<li>"Every blue box is a packet. Each one has a number on it: 0, 1, 2 and so on."</li>' +
          '<li><b>Point at the red cable.</b> "This cable loses some packets on purpose, like a bad network. Watch, that one exploded."</li>' +
          '<li><b>Point at Server B when it says LOSS DETECTED.</b> "Server B got number 6 but never got 5, so it knows 5 is missing. Like page numbers in a book."</li>' +
          '<li>"For every packet Server B gets, it sends back a green ball called an ACK. It means: got it."</li>' +
          '<li>"Server A never got an ACK for packet 5, so after a short wait it sends it again. That is the orange box."</li>' +
          '<li><b>When RECOVERED appears:</b> "Packet 5 arrived the second time. Nothing is lost."</li>' +
          '<li><b>Click Plain UDP, then Start.</b> "Without our method, lost packets are simply gone. Look at the red boxes at the end."</li></ol>' +
          '<p class="dim">Tip: press <b>Tour</b> and the model explains itself step by step. Use <b>Drop next packet</b> to make a loss happen exactly when you want.</p>'
      },
      {
        id: 'see', label: 'What you see', html:
          '<ul class="lg">' +
          '<li><i style="background:#1e9be6"></i><b>Blue box</b>: a data packet with its number</li>' +
          '<li><i style="background:#ffa53d"></i><b>Orange box</b>: the same packet sent again (resend)</li>' +
          '<li><i style="background:#2ee59d"></i><b>Green ball</b>: an ACK, Server B saying "I got it"</li>' +
          '<li><i style="background:#ff4d5e"></i><b>Red explosion</b>: a packet lost on the red cable</li>' +
          '<li><i style="background:#ff5fd2"></i><b>Pink explosion</b>: an ACK lost on the way back</li>' +
          '<li><i style="background:#ffe066"></i><b>Yellow frame</b>: the window, how many packets can wait for an ACK</li>' +
          '<li><i style="background:#b36bff"></i><b>Purple text</b>: a duplicate, Server B already had it</li></ul>' +
          '<p>Top-left row: Server A&#39;s packets. Top-right row: Server B&#39;s checklist. Bottom bar: live counters.</p>'
      },
      {
        id: 'words', label: 'Words', html:
          '<dl><dt>Packet</dt><dd>A small piece of the data. Big data is cut into many packets.</dd>' +
          '<dt>Sequence number</dt><dd>The number written on each packet: 0, 1, 2 ... A gap means one is missing.</dd>' +
          '<dt>UDP</dt><dd>A fast way to send packets that never checks if they arrived.</dd>' +
          '<dt>ACK</dt><dd>Acknowledgement. A tiny reply: "I got packet 7".</dd>' +
          '<dt>Timeout</dt><dd>How long the sender waits for an ACK (0.2 s in our program) before sending again.</dd>' +
          '<dt>Retransmission</dt><dd>Sending the same packet again.</dd>' +
          '<dt>Window</dt><dd>How many packets can be "in the air" waiting for an ACK at the same time (8 in our program, 5 here so it is easy to see).</dd>' +
          '<dt>Duplicate</dt><dd>A packet that arrives twice. Happens when an ACK is lost, so the sender thinks the packet was lost.</dd></dl>'
      },
      {
        id: 'qa', label: 'Questions', html:
          '<dl><dt>How does the receiver know a packet is missing?</dt><dd>From the numbers. If it gets 14 and then 17, then 15 and 16 are missing.</dd>' +
          '<dt>How does the sender know?</dt><dd>It does not get an ACK for that packet within the timeout, so it sends it again.</dd>' +
          '<dt>Why are there duplicates?</dt><dd>If an ACK is lost, or the timeout is too short, the sender resends a packet that had already arrived. The receiver just ACKs it again and ignores the copy.</dd>' +
          '<dt>What does it cost?</dt><dd>Extra sending and time. In our real test with 10% loss, 200 packets needed about 48 resends and took 4.7 s, but 100% arrived. Plain UDP delivered only 87.7%.</dd>' +
          '<dt>Why not just use TCP?</dt><dd>TCP already does this by itself, so there would be nothing to build. We add it to UDP to show how it works.</dd>' +
          '<dt>Is this the real program?</dt><dd>It is an animation of the same steps our Python code does (same numbers, ACKs, window and timeout). The real programs are udp_sender.py and udp_receiver.py.</dd></dl>'
      }
    ]);

    this.expand = function (b) {
      const s = root.closest('.slide');
      s.classList.toggle('expanded');
      if (b) b.classList.toggle('on', s.classList.contains('expanded'));
      setTimeout(function () { w.resize(); }, 30);
    };
    this.key = function (e) {
      const k = e.key.toLowerCase();
      if (k === ' ') { self.toggle(); return true; }
      if (k === 'r') { self.reset(); return true; }
      if (k === 'd') { st.forceDrop++; self.banner('NEXT PACKET WILL BE LOST', COL.red); return true; }
      if (k === 'a') { st.forceAckDrop++; self.banner('NEXT ACK WILL BE LOST', COL.pink); return true; }
      if (k === 't') { self.startTour(); return true; }
      if (k === 'e') { self.expand(P.bar.querySelector('.mb-btn:last-child')); return true; }
      return false;
    };

    layoutRows();
    this.reset();
  }

  // =====================================================================================
  // MODEL 2 - Mininet network: path monitor, link failure, rerouting through s3
  // =====================================================================================
  function Model2(root) {
    const self = this;
    const P = scaffold(root);
    const w = (this.w = new World(P.view, { cam: [0, 23, 20], target: [0, -1.5, -3.2] }));
    common(this, P);
    const cfg = (this.cfg = { loss: 0.1, threshold: 50, speed: 1 });
    const SPEED = 9;       // world units per second (slow motion)
    const GAP = 0.5;

    const h1 = w.host(V(-14, 0, 0), 'h1', '10.0.0.1', COL.blue, 'sender');
    const h2 = w.host(V(14, 0, 0), 'h2', '10.0.0.2', COL.green, 'receiver');
    const s1 = w.switchBox(V(-6.5, 0, 0), 's1');
    const s2 = w.switchBox(V(6.5, 0, 0), 's2');
    const s3 = w.switchBox(V(0, 0, -8), 's3');
    const y = 0.25;
    const Lh1 = w.link(V(-12.7, y, 0), V(-7.8, y, 0), { arc: 0.5 });
    const Lmain = w.link(V(-5.2, y, 0), V(5.2, y, 0), { arc: 1.0, color: COL.red, flowColor: 0xff8a95, radius: 0.1 });
    const Lb1 = w.link(V(-6.0, y, -0.85), V(-1.0, y, -7.4), { arc: 0.6, color: 0x3a6fb0, flow: 4 });
    const Lb2 = w.link(V(1.0, y, -7.4), V(6.0, y, -0.85), { arc: 0.6, color: 0x3a6fb0, flow: 4 });
    const Lh2 = w.link(V(7.8, y, 0), V(12.7, y, 0), { arc: 0.5 });
    Lb1.speed = Lb2.speed = 0.12;
    const mainLabel = makeLabel('main path · 5 ms · 10% loss', { height: 0.55, color: '#ff8a95', border: '#ff4d5e' });
    mainLabel.position.set(0, 2.3, 0.6);
    w.scene.add(mainLabel);
    const backLabel = makeLabel('backup path via s3 · 10 ms per link', { height: 0.55, color: '#8fd0ff', border: '#1e9be6' });
    backLabel.position.set(0, 1.9, -10.2);
    w.scene.add(backLabel);

    function mk(list) { const p = new THREE.CurvePath(); list.forEach(function (c) { p.add(c); }); return p; }
    const primary = mk([bridge(V(-14, y, 0), V(-12.7, y, 0)), Lh1.curve, bridge(V(-7.8, y, 0), V(-5.2, y, 0)), Lmain.curve, bridge(V(5.2, y, 0), V(7.8, y, 0)), Lh2.curve, bridge(V(12.7, y, 0), V(14, y, 0))]);
    const backup = mk([bridge(V(-14, y, 0), V(-12.7, y, 0)), Lh1.curve, bridge(V(-7.8, y, 0), V(-6.0, y, -0.85)), Lb1.curve, bridge(V(-1.0, y, -7.4), V(1.0, y, -7.4)), Lb2.curve,
      bridge(V(6.0, y, -0.85), V(7.8, y, 0)), Lh2.curve, bridge(V(12.7, y, 0), V(14, y, 0))]);
    const pc = primary.getCurveLengths();
    const tBreak = (pc[2] + (pc[3] - pc[2]) / 2) / primary.getLength();
    const lane = V(0, 0.55, 0.35);

    // path monitor ("eye" floating above the main link)
    const mon = new THREE.Group();
    mon.position.set(-11, 3.0, -7);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), std(0x111a28, { emissive: COL.purple, emissiveIntensity: 0.6 }));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: COL.cyan }));
    pupil.position.z = 0.42;
    const mr1 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 8, 48), new THREE.MeshBasicMaterial({ color: COL.purple }));
    const mr2 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 8, 48), new THREE.MeshBasicMaterial({ color: COL.cyan }));
    const monGlow = glowSprite(COL.purple, 4, 0.6);
    const monLabel = makeLabel('path monitor (Python)\nprobe loss: 0%', { height: 0.5, border: '#b36bff' });
    monLabel.position.y = 1.7;
    mon.add(eye, pupil, mr1, mr2, monGlow, monLabel);
    w.scene.add(mon);

    // flow table panels above s1 and s2
    const flow1 = makeLabel('', { height: 0.46, align: 'left', border: '#1e9be6', size: 36 });
    const flow2 = makeLabel('', { height: 0.46, align: 'left', border: '#1e9be6', size: 36 });
    flow1.position.set(-6.5, 3.0, 0); flow2.position.set(6.5, 3.0, 0);
    flow1.userData.noHoverScale = flow2.userData.noHoverScale = true;
    w.scene.add(flow1, flow2);
    function drawFlows(flash) {
      const b = st.route === 'backup';
      const col = flash ? '#ffe066' : '#f5f7fa';
      flow1.userData.setText('s1 flow table\nin_port=1 → output:' + (b ? '3  (to s3)' : '2  (to s2)'), col, flash ? '#ffe066' : '#1e9be6');
      flow2.userData.setText('s2 flow table\nin_port=1 → output:' + (b ? '3  (to s3)' : '2  (to s1)'), col, flash ? '#ffe066' : '#1e9be6');
    }

    // broken link pieces
    function halfTube(a, b) {
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(Lmain.curve.getPointAt(a + (b - a) * i / 12));
      const end = a < 0.5 ? pts[pts.length - 1] : pts[0];
      end.y -= 0.9;
      return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.1, 8, false), std(0x661018, { emissive: COL.red, emissiveIntensity: 0.4 }));
    }
    const brokeA = halfTube(0, 0.42), brokeB = halfTube(0.58, 1);
    brokeA.visible = brokeB.visible = false;
    w.scene.add(brokeA, brokeB);
    const downLabel = makeLabel('LINK DOWN', { height: 0.6, color: '#ff4d5e', border: '#ff4d5e' });
    downLabel.position.set(0, 1.2, 1.2);
    downLabel.visible = false;
    w.scene.add(downLabel);

    // clickable info
    w.register(h1.group, { title: 'h1, the sender (10.0.0.1)', html: '<p>Sends a stream of numbered UDP packets to h2. Lost packets are sent again (orange), exactly like on the previous slide.</p>' });
    w.register(h2.group, { title: 'h2, the receiver (10.0.0.2)', html: '<p>Receives the packets. The goal: keep getting packets even if the main cable breaks.</p>' });
    w.register(s1.group, function () { return { title: 'Switch s1 (Open vSwitch)', html: '<p>s1 decides which cable a packet from h1 goes out on, using its <b>flow table</b> (the panel above it).</p><p>Now: <code>in_port=1 actions=output:' + (st.route === 'backup' ? '3</code>, which sends packets to s3 (backup).' : '2</code>, which sends packets to s2 (main path).') + '</p>' }; });
    w.register(s2.group, { title: 'Switch s2 (Open vSwitch)', html: '<p>s2 sits next to h2. It gets packets either directly from s1 (main path) or from s3 (backup path) and passes them to h2.</p>' });
    w.register(s3.group, { title: 'Switch s3, the backup', html: '<p>s3 is only used when the main path is broken or too lossy. The backup path is longer (10 ms per link instead of 5 ms) but it works.</p>' });
    w.register(Lmain.tube, function () { return { title: 'Main path s1 to s2', html: '<p>The direct cable. It has <b>' + Math.round(cfg.loss * 100) + '%</b> loss added on purpose and 5 ms delay. Click <b>Break link</b> to cut it.</p>' }; });
    w.register(Lb1.tube, { title: 'Backup cable s1 to s3', html: '<p>Part of the backup path h1 &rarr; s1 &rarr; s3 &rarr; s2 &rarr; h2.</p>' });
    w.register(Lb2.tube, { title: 'Backup cable s3 to s2', html: '<p>Part of the backup path h1 &rarr; s1 &rarr; s3 &rarr; s2 &rarr; h2.</p>' });
    w.register(mon, function () {
      return {
        title: 'Path monitor (our Python program)', html:
          '<p>This is the <code>PathMonitor</code> class in <code>mininet_reroute.py</code>. It keeps checking the main cable in two ways:</p>' +
          '<ol><li>Is the cable <b>up</b>? (reads the link state)</li><li>Sends 20 quick <b>pings</b>. If more than ' + cfg.threshold + '% are lost, the path is too bad.</li></ol>' +
          '<p>If either check fails, it changes the flow tables in s1 and s2 so traffic goes through s3. That is <b>rerouting</b>.</p>'
      };
    });
    w.register(flow1, { title: 's1 flow table', html: '<p>The rule that tells s1 where to send packets that come in from h1 (port 1). Port 2 goes to s2, port 3 goes to s3. Our monitor changes this with <code>ovs-ofctl add-flow</code>.</p>' });
    w.register(flow2, { title: 's2 flow table', html: '<p>The same kind of rule in s2, for traffic going back from h2.</p>' });

    // ---------- simulation
    let st;
    function fresh() {
      return {
        simT: 0, streaming: false, seq: 0, lastSend: -99, route: 'primary', linkUp: true, pk: [], retxQ: [], probes: [],
        sent: 0, delivered: 0, lost: 0, resent: 0, viaBackup: 0, failAt: null, detectAt: null, detectedAt: null, lastDeliver: null,
        lastBeforeFail: null, recoveryGap: null, lostLog: [], recLog: [], nextProbe: 1, probeLoss: 0, target: null, phaseDelivered: 0, phaseSent: 0, phaseResent: 0, phaseLost: 0
      };
    }
    st = fresh();
    const log = function (t, c) { self.term.print(t, c); };

    function send(seq, isRetx) {
      const route = st.route;
      const p = {
        seq, route, path: route === 'primary' ? primary : backup, t: 0, retx: isRetx, checked: false,
        lost: route === 'primary' && Math.random() < cfg.loss, trailT: 0
      };
      p.len = p.path.getLength();
      p.g = makePacket(w, seq, isRetx ? COL.orange : (route === 'primary' ? COL.blue : COL.cyan), false);
      w.register(p.g, function () {
        return { title: 'Packet #' + seq, html: '<p>Going on the <b>' + (p.route === 'primary' ? 'main path (s1 &rarr; s2)' : 'backup path (s1 &rarr; s3 &rarr; s2)') + '</b>.</p>' + (p.retx ? '<p class="orange">This is a resend of a lost packet.</p>' : '') };
      });
      st.pk.push(p);
      st.sent++; st.phaseSent++;
      if (isRetx) { st.resent++; st.phaseResent++; }
      if (route === 'backup') st.viaBackup++;
      h1.flash(isRetx ? COL.orange : COL.blue);
    }

    function lose(p, pos, why) {
      st.lost++; st.phaseLost++;
      st.lostLog.push(p.seq);
      st.retxQ.push({ seq: p.seq, at: st.simT + 3 });
      if (why === 'broken') {
        w.burst(pos, COL.yellow, 80, 7, 1.0, 0.4);
        w.burst(pos, COL.orange, 60, 5, 1.2, 0.45);
        w.floatText(pos.clone().add(V(0, 1, 0)), 'CABLE CUT #' + p.seq, COL.orange, 1.3, 0.45);
      } else {
        w.burst(pos, COL.red, 80, 7, 1.1, 0.45);
        w.floatText(pos.clone().add(V(0, 1, 0)), 'LOST #' + p.seq, COL.red, 1.3, 0.45);
      }
      w.ring(pos, COL.red, 3.5, 0.7);
      w.shake(0.15);
    }

    function reroute(reason) {
      if (st.route === 'backup') return;
      st.route = 'backup';
      st.detectedAt = st.simT;
      log('[monitor] ' + reason + ' -> rerouting to backup path via s3', 'yellow');
      const mp = mon.position;
      [s1, s2, s3].forEach(function (s) { w.beam(mp, s.group.position.clone().add(V(0, 0.5, 0)), COL.purple, 1.2); });
      drawFlows(true);
      setTimeout(function () { drawFlows(false); }, 1600);
      [Lb1, Lb2].forEach(function (l) { l.setColor(COL.cyan); l.speed = 0.45; });
      Lmain.mat.opacity = 0.35;
      self.banner('REROUTED VIA s3', COL.cyan, reason);
      self.flash(COL.cyan, 0.6);
      w.burst(s3.group.position.clone().add(V(0, 1, 0)), COL.cyan, 150, 9, 1.4, 0.5);
      w.ring(s3.group.position.clone().add(V(0, 0.2, 0)), COL.cyan, 7, 1.2, true);
      w.lightFlash(COL.cyan, 4);
    }

    this.usePrimary = function () {
      if (!st.linkUp) { self.banner('MAIN LINK IS STILL DOWN', COL.red, 'restore it first'); return false; }
      st.route = 'primary';
      st.failAt = st.detectAt = null;
      drawFlows(true);
      setTimeout(function () { drawFlows(false); }, 1200);
      [Lb1, Lb2].forEach(function (l) { l.setColor(0x3a6fb0); l.speed = 0.12; });
      Lmain.mat.opacity = 0.9;
      self.banner('BACK ON MAIN PATH', COL.blue);
      return true;
    };

    this.breakLink = function () {
      if (!st.linkUp) return;
      st.linkUp = false;
      st.failAt = st.simT;
      st.lastBeforeFail = st.lastDeliver != null ? st.lastDeliver : st.simT;
      st.detectAt = st.simT + rand(1.4, 2.6);
      st.recoveryGap = null;
      st.detectedAt = null;
      Lmain.setVisible(false);
      brokeA.visible = brokeB.visible = downLabel.visible = true;
      s1.setAlarm(true); s2.setAlarm(true);
      const c = Lmain.curve.getPointAt(0.5);
      w.burst(c, COL.yellow, 200, 12, 1.6, 0.5);
      w.burst(c, COL.red, 150, 9, 1.4, 0.5);
      w.ring(c, COL.red, 8, 1.2);
      w.shake(0.6);
      w.lightFlash(COL.red, 6);
      self.flash(COL.red, 0.9);
      self.banner('LINK s1–s2 DOWN', COL.red, 'the main cable is cut');
      if (!self.term.busy) log('mininet> link s1 s2 down', 'dim');
    };

    this.restoreLink = function () {
      if (st.linkUp) return;
      st.linkUp = true;
      Lmain.setVisible(true);
      brokeA.visible = brokeB.visible = downLabel.visible = false;
      s1.setAlarm(false); s2.setAlarm(false);
      const c = Lmain.curve.getPointAt(0.5);
      w.burst(c, COL.white, 120, 8, 1.2, 0.4);
      w.ring(c, COL.blue, 5, 1);
      self.banner('LINK s1–s2 UP AGAIN', COL.blue, st.route === 'backup' ? 'traffic stays on the backup until we switch it back' : '');
    };

    this.reset = function () {
      st.pk.forEach(function (p) { removeObj(w, p.g); });
      st.probes.forEach(function (p) { w.scene.remove(p.s); p.s.material.dispose(); });
      const wasUp = st.linkUp;
      st = fresh();
      if (!wasUp) { st.linkUp = false; self.restoreLink(); }
      [Lb1, Lb2].forEach(function (l) { l.setColor(0x3a6fb0); l.speed = 0.12; });
      Lmain.mat.opacity = 0.9;
      s1.setAlarm(false); s2.setAlarm(false);
      drawFlows(false);
      self.streamBtn.textContent = 'Start traffic';
    };
    this.toggleStream = function () {
      st.streaming = !st.streaming;
      self.streamBtn.textContent = st.streaming ? 'Pause traffic' : 'Start traffic';
    };

    w.updaters.push(function (dt) {
      const sdt = dt * cfg.speed;
      st.simT += sdt;
      // send new packets and resends
      if (st.streaming && (st.target == null || st.phaseSent - st.phaseResent < st.target) && st.simT - st.lastSend >= GAP) {
        send(st.seq++, false);
        st.lastSend = st.simT;
      }
      st.retxQ = st.retxQ.filter(function (r) { if (st.simT >= r.at) { send(r.seq, true); return false; } return true; });
      // move packets
      st.pk = st.pk.filter(function (p) {
        p.t += (sdt * SPEED) / p.len;
        const pos = p.path.getPointAt(Math.min(1, p.t)).add(lane);
        p.g.position.copy(pos);
        p.g.children[0].rotation.x += dt * 3; p.g.children[0].rotation.y += dt * 2;
        p.g.children[1].rotation.copy(p.g.children[0].rotation);
        p.trailT += dt;
        if (p.trailT > 0.05) { p.trailT = 0; w.trail(pos, p.retx ? COL.orange : (p.route === 'primary' ? COL.blue : COL.cyan), 0.75); }
        if (p.route === 'primary' && !p.checked && p.t >= tBreak) {
          p.checked = true;
          if (!st.linkUp) { lose(p, pos, 'broken'); removeObj(w, p.g); return false; }
          if (p.lost) { lose(p, pos, 'loss'); removeObj(w, p.g); return false; }
        }
        if (p.t >= 1) {
          st.delivered++; st.phaseDelivered++;
          if (p.retx) st.recLog.push(p.seq);
          st.lastDeliver = st.simT;
          if (st.failAt != null && st.recoveryGap == null && st.route === 'backup' && st.lastBeforeFail != null) st.recoveryGap = st.simT - st.lastBeforeFail;
          h2.flash(COL.green);
          w.burst(pos, COL.green, 20, 3, 0.5, 0.3);
          removeObj(w, p.g);
          return false;
        }
        return true;
      });
      // failure detection by the monitor (link state)
      if (!st.linkUp && st.route === 'primary' && st.detectAt != null && st.simT >= st.detectAt) reroute('primary link DOWN');
      // probe pings on the main path
      if (st.route === 'primary' && st.simT >= st.nextProbe) {
        st.nextProbe = st.simT + 1.6;
        let lostN = 0;
        for (let i = 0; i < 20; i++) if (!st.linkUp || Math.random() < cfg.loss) lostN++;
        const pl = Math.round((lostN / 20) * 100);
        for (let i = 0; i < 4; i++) {
          const s = glowSprite(0xffffff, 0.5, 1);
          w.scene.add(s);
          st.probes.push({ s, t: -i * 0.04, dead: !st.linkUp || i < Math.round(pl / 25) });
        }
        st.probeLoss = pl;
        monLabel.userData.setText('path monitor (Python)\nprobe loss: ' + pl + '%  (limit ' + cfg.threshold + '%)', pl > cfg.threshold ? '#ff4d5e' : '#f5f7fa');
        mr1.material.color.setHex(pl > cfg.threshold ? COL.red : COL.purple);
        if (st.linkUp && pl > cfg.threshold) reroute('loss above threshold');
      }
      st.probes = st.probes.filter(function (p) {
        p.t += sdt / 1.2;
        if (p.t < 0) { p.s.visible = false; return true; }
        p.s.visible = true;
        const u = p.t < 0.5 ? p.t * 2 : 2 - p.t * 2;
        const pos = Lmain.curve.getPointAt(Math.max(0, Math.min(1, u))).add(V(0, 0.9, 0));
        p.s.position.copy(pos);
        if (p.dead && p.t > 0.25) { w.burst(pos, 0xffffff, 10, 2, 0.4, 0.2); w.scene.remove(p.s); p.s.material.dispose(); return false; }
        if (p.t >= 1) { w.scene.remove(p.s); p.s.material.dispose(); return false; }
        return true;
      });
      // monitor animation
      mr1.rotation.x += dt * 1.5; mr1.rotation.y += dt;
      mr2.rotation.y -= dt * 1.2; mr2.rotation.z += dt * 0.7;
      pupil.position.x = Math.sin(w.time * 1.3) * 0.15;
      mon.position.y = 3.0 + Math.sin(w.time * 1.5) * 0.2;
      monGlow.material.color.setHex(st.linkUp ? COL.purple : COL.red);
      monGlow.scale.setScalar(4 + Math.sin(w.time * (st.linkUp ? 3 : 12)) * 0.8);
      if (!st.linkUp) {
        downLabel.material.opacity = Math.floor(w.time * 4) % 2 ? 1 : 0.35;
        if (Math.random() < dt * 14) {
          const e = Math.random() < 0.5 ? brokeA : brokeB;
          const tip = Lmain.curve.getPointAt(e === brokeA ? 0.42 : 0.58);
          tip.y -= 0.9;
          w.burst(tip, Math.random() < 0.5 ? COL.yellow : COL.orange, 14, 4, 0.5, 0.25);
        }
        w.lightFlash(COL.red, 1.5 + Math.sin(w.time * 12));
      }
      // HUD
      self.set('h-path', st.route === 'primary' ? 'MAIN' : 'BACKUP', st.route === 'primary' ? '#1e9be6' : '#3df5ff');
      self.set('h-link', st.linkUp ? 'UP' : 'DOWN', st.linkUp ? '#2ee59d' : '#ff4d5e');
      self.set('h-probe', st.route === 'primary' ? st.probeLoss + '%' : 'stopped');
      self.set('h-sent', st.sent);
      self.set('h-del', st.delivered);
      self.set('h-lost', st.lost);
      self.set('h-retx', st.resent);
      self.set('h-det', st.detectedAt != null && st.failAt != null ? Math.round((st.detectedAt - st.failAt) * 100) + ' ms*' : '-');
      self.set('h-rec', st.recoveryGap != null ? Math.round(st.recoveryGap * 100) + ' ms*' : '-');
    });

    this.hud([
      ['h-path', 'Path in use', '#1e9be6', 'Which path the switches are using'],
      ['h-link', 'Main link', '#2ee59d', 'Is the s1-s2 cable working?'],
      ['h-probe', 'Probe loss', '#b36bff', 'How many of the 20 test pings were lost'],
      ['h-sent', 'Sent', '#f5f7fa'], ['h-del', 'Delivered', '#2ee59d'], ['h-lost', 'Lost', '#ff4d5e'], ['h-retx', 'Resent', '#ffa53d'],
      ['h-det', 'Detection', '#ffe066', 'Time from the cut to the monitor noticing (simulated)'],
      ['h-rec', 'Recovery gap', '#3df5ff', 'Longest time with no packet arriving (simulated)']
    ]);
    legend(P, [[COL.blue, 'packet on main path'], [COL.cyan, 'packet on backup path'], [COL.orange, 'resent'], [0xffffff, 'test ping'], [COL.purple, 'path monitor'], [COL.red, 'lost / link down']]);

    const U = ui(P.bar);
    const g1 = U.group('Traffic');
    this.streamBtn = U.btn(g1, 'Start traffic', function () { self.toggleStream(); }, 'mb-go', 'Start or pause the packet stream (Space)');
    U.btn(g1, 'Reset', function () { self.reset(); }, '', 'Reset everything (R)');
    const g2 = U.group('Break things');
    U.btn(g2, 'Break link s1–s2', function () { self.breakLink(); }, 'mb-red', 'Cut the main cable (B)');
    U.btn(g2, 'Restore link', function () { self.restoreLink(); }, '', 'Fix the main cable (U)');
    U.btn(g2, 'Use main path again', function () { self.usePrimary(); }, '', 'Switch the flow rules back to the main path');
    const g3 = U.group('Settings');
    this.lossSl = U.slider(g3, 'Main loss', 0, 90, 1, 10, function (v) { return v + '%'; }, function (v) {
      cfg.loss = v / 100;
      mainLabel.userData.setText('main path · 5 ms · ' + v + '% loss');
    }, 'Loss on the main cable. Above the monitor limit it reroutes.');
    U.slider(g3, 'Monitor limit', 10, 90, 5, cfg.threshold, function (v) { return v + '%'; }, function (v) { cfg.threshold = v; }, 'Probe loss that counts as a failure (50% in our code)');
    U.slider(g3, 'Speed', 0.25, 4, 0.25, 1, function (v) { return v + 'x'; }, function (v) { cfg.speed = v; });
    const g4 = U.group('Camera');
    U.btn(g4, 'Tour', function () { self.startTour(); }, 'mb-go', 'Guided explanation (T)');
    U.btn(g4, 'Overview', function () { w.tweenTo(w.home.cam.toArray(), w.home.target.toArray()); });
    U.btn(g4, 'Main path', function () { w.tweenTo([0, 5, 10], [0, 1, 0]); });
    U.btn(g4, 'Backup', function () { w.tweenTo([0, 8, 4], [0, 0, -6]); });
    U.btn(g4, 'Monitor', function () { w.tweenTo([-4, 8, 4], [-10, 3.5, -6.5]); });
    U.btn(g4, 'Spin', function (b) { w.controls.autoRotate = !w.controls.autoRotate; b.classList.toggle('on', w.controls.autoRotate); });
    U.btn(g4, 'Expand', function (b) { self.expand(b); }, '', 'Make the 3D view fill the slide (E)');

    this.tour = [
      { text: '<b>This is our Mininet network.</b> h1 sends to h2. Normally packets take the <span class="red">main path</span> h1 &rarr; s1 &rarr; s2 &rarr; h2.', cam: [0, 23, 20], target: [0, -1.5, -3.2], action: function () { if (!st.streaming) self.toggleStream(); } },
      { text: '<b>The main cable has 10% loss on purpose.</b> Lost packets explode, and h1 sends them again in orange, just like on the last slide.', cam: [0, 5, 10], target: [0, 1, 0], select: function () { return Lmain.tube; } },
      { text: '<b>There is a backup path through s3.</b> It is longer (10 ms per link) so it is only used when needed.', cam: [0, 8, 4], target: [0, 0, -6], select: function () { return s3.group; } },
      { text: '<b>The purple eye is our path monitor</b> (Python). It keeps checking: is the cable up, and how many of 20 test pings are lost?', cam: [-4, 8, 4], target: [-10, 3.5, -6.5], select: function () { return mon; } },
      { text: '<b>Now we cut the main cable.</b> Packets on it are lost. Within a moment the monitor notices that the link is down...', cam: [0, 6, 12], target: [0, 1, 0], action: function () { if (!st.streaming) self.toggleStream(); self.breakLink(); } },
      { text: '<b>...and changes the flow tables</b> in s1 and s2 (yellow panels) so packets go through s3. Traffic keeps flowing: that is <span class="cyan">rerouting</span>.', cam: [0, 23, 20], target: [0, -1.5, -3.2], select: function () { return flow1; } }
    ];

    // ---------- terminal
    this.term = new Terminal(P.term, {
      title: 'Terminal · Mininet (Ubuntu VM)',
      banner: 'Demo terminal. Click a command to run it.\nIt replays our Mininet scripts as a browser simulation (same output format).\nTimes marked * are simulated.',
      commands: [
        { cmd: 'sudo python3 mininet_reroute.py --loss 10', desc: 'Main path test, link failure + rerouting, backup path test' },
        { cmd: 'sudo python3 live_demo.py', desc: 'The full live demo: loss, then a broken link, then rerouting' },
        { cmd: 'h1 ping -c 3 10.0.0.2', desc: 'Ping h2 from h1 on the current path' },
        { cmd: 'link s1 s2 down', desc: 'Mininet CLI: cut the main cable' },
        { cmd: 'link s1 s2 up', desc: 'Mininet CLI: fix the main cable' },
        { cmd: 'sudo ovs-ofctl dump-flows s1', desc: 'Show the forwarding rules inside s1' },
        { cmd: 'sudo mn -c', desc: 'Clean up Mininet' }
      ],
      runner: async function (c, t, cancelled) {
        const pingLines = async function (n) {
          t.print('PING 10.0.0.2 (10.0.0.2) 56(84) bytes of data.');
          let ok = 0;
          for (let i = 1; i <= n; i++) {
            await sleep(450);
            if (cancelled()) return;
            const down = !st.linkUp && st.route === 'primary';
            const lossy = st.route === 'primary' && Math.random() < cfg.loss * 1.9;
            if (down || lossy) { if (down) t.print('From 10.0.0.1 icmp_seq=' + i + ' Destination Host Unreachable', 'red'); continue; }
            ok++;
            const ms = st.route === 'primary' ? rand(10.1, 11.4) : rand(40.2, 41.9);
            t.print('64 bytes from 10.0.0.2: icmp_seq=' + i + ' ttl=64 time=' + ms.toFixed(1) + ' ms');
            const s = glowSprite(0xffffff, 0.6, 1);
            w.scene.add(s);
            const path = st.route === 'primary' ? primary : backup;
            let u = 0;
            w.addFx(function (dt) { u += dt * 0.7; s.position.copy(path.getPointAt(Math.max(0, Math.min(1, u < 0.5 ? u * 2 : 2 - u * 2)))).add(V(0, 1.1, 0)); if (u >= 1) { w.scene.remove(s); s.material.dispose(); return false; } return true; });
          }
          t.print('\n--- 10.0.0.2 ping statistics ---');
          t.print(n + ' packets transmitted, ' + ok + ' received, ' + Math.round(100 * (n - ok) / n) + '% packet loss', ok === n ? 'green' : 'red');
        };
        const report = function (label) {
          const N = st.phaseDelivered;
          const tt = (st.simT - st.phaseStart) / 10;
          t.print('=========== SENDER REPORT ===========', 'blue');
          t.print('Packets sent (unique)   : ' + N);
          t.print('Total transmissions     : ' + (N + st.phaseResent));
          t.print('Retransmissions         : ' + st.phaseResent);
          t.print('Retransmission rate     : ' + (100 * st.phaseResent / Math.max(1, N)).toFixed(1) + ' %');
          t.print('Time taken              : ' + tt.toFixed(2) + ' s*');
          t.print('Throughput              : ' + (N / Math.max(0.01, tt)).toFixed(1) + ' packets/s*');
          t.print('');
          t.print('========== RECEIVER REPORT ==========', 'green');
          t.print('Packets expected        : ' + N);
          t.print('Unique packets received : ' + N);
          t.print('Gaps detected (missing) : ' + st.phaseLost);
          t.print('Recovered by retransmit : ' + st.phaseLost);
          t.print('Still missing           : 0', 'green');
        };
        const phase = async function (count) {
          st.phaseDelivered = st.phaseSent = st.phaseResent = st.phaseLost = 0;
          st.phaseStart = st.simT;
          st.target = count;
          if (!st.streaming) self.toggleStream();
          await until(function () { return st.phaseDelivered >= count && st.retxQ.length === 0 && st.pk.length === 0; }, cancelled);
          st.target = null;
          self.toggleStream();
        };
        if (c === 'help') { t.print('Commands: the buttons above, plus clear', 'dim'); return; }
        if (c === 'clear') { t.clear(); return; }
        if (c.indexOf('sudo python3 mininet_reroute.py') === 0) {
          const m = c.match(/--loss[ =]([0-9.]+)/);
          const L = m ? +m[1] : 10;
          self.reset();
          self.lossSl.set(L); self.lossSl.input.dispatchEvent(new Event('input'));
          await pingLines(3);
          t.print('\n--- UDP transfer test: primary_lossy ---', 'yellow');
          t.print('(sending 20 packets so it fits on screen; the real script sends 200)', 'dim');
          await phase(20);
          report('primary');
          t.print('\n--- Link failure + rerouting test ---', 'yellow');
          st.phaseDelivered = 0;
          self.toggleStream();
          await sleep(2500);
          if (cancelled()) return;
          t.print('[test] breaking primary link s1-s2');
          self.breakLink();
          await until(function () { return st.recoveryGap != null; }, cancelled);
          await sleep(1500);
          self.toggleStream();
          t.print('Detection time          : ' + Math.round((st.detectedAt - st.failAt) * 100) + ' ms*');
          t.print('Recovery time (ping gap): ' + Math.round(st.recoveryGap * 100) + ' ms*');
          t.print('Ping replies received   : ' + st.phaseDelivered);
          await until(function () { return st.pk.length === 0 && st.retxQ.length === 0; }, cancelled);
          t.print('\n--- UDP transfer test: backup_path ---', 'yellow');
          self.lossSl.set(0); self.lossSl.input.dispatchEvent(new Event('input'));
          await phase(15);
          report('backup');
          return;
        }
        if (c === 'sudo python3 live_demo.py') {
          self.reset();
          self.lossSl.set(10); self.lossSl.input.dispatchEvent(new Event('input'));
          t.print('\n>>> Building the network: h1 - s1 - s2 - h2 (main path, 10% loss) and backup path through s3\n', 'yellow');
          await sleep(900);
          t.print('>>> Starting transfer: h1 sends 40 numbered packets to h2 over the lossy main path\n', 'yellow');
          t.print('[h2 receiver] [receiver] listening on UDP port 5000');
          st.phaseDelivered = st.phaseSent = st.phaseResent = st.phaseLost = 0;
          st.phaseStart = st.simT;
          st.target = 40;
          self.toggleStream();
          let shownL = 0, shownR = 0;
          const ticker = setInterval(function () {
            while (shownL < st.lostLog.length) { const s = st.lostLog[shownL++]; t.print('[h2 receiver] [receiver] LOSS DETECTED: expected ' + s + ', got ' + (s + 1) + ', missing [' + s + ']', 'red'); }
            while (shownR < st.recLog.length) { const s = st.recLog[shownR++]; t.print('[h2 receiver] [receiver] RECOVERED: packet ' + s + ' arrived after retransmission', 'green'); }
          }, 300);
          try {
            await until(function () { return st.phaseSent >= 16; }, cancelled);
            t.print('\n>>> BREAKING the main link s1-s2 now!\n', 'red');
            self.breakLink();
            await until(function () { return st.detectedAt != null; }, cancelled);
            await until(function () { return st.phaseDelivered >= 40 && st.retxQ.length === 0 && st.pk.length === 0; }, cancelled);
          } finally { clearInterval(ticker); }
          st.target = null;
          self.toggleStream();
          t.print('\n>>> Failure detected ' + Math.round((st.detectedAt - st.failAt) * 100) + ' ms* after the link broke; traffic moved to s3\n', 'yellow');
          st.phaseDelivered = 40;
          report('demo');
          t.print('\n>>> Done: every packet was delivered, even with 10% loss AND a broken link\n', 'green');
          self.banner('EVERY PACKET DELIVERED', COL.green, '10% loss + a broken cable');
          for (let i = 0; i < 4; i++) setTimeout(function () { w.burst(V(rand(-12, 12), rand(2, 6), rand(-6, 2)), [COL.green, COL.cyan, COL.yellow, COL.pink][i], 140, 10, 1.6, 0.5); }, i * 180);
          return;
        }
        if (c === 'h1 ping -c 3 10.0.0.2' || c === 'h1 ping -c 3 h2') { await pingLines(3); return; }
        if (c === 'link s1 s2 down') { self.breakLink(); t.print('(cable s1-s2 is now down)', 'dim'); return; }
        if (c === 'link s1 s2 up') { self.restoreLink(); t.print('(cable s1-s2 is up)', 'dim'); return; }
        if (c.indexOf('sudo ovs-ofctl dump-flows') === 0) {
          const sw = c.split(' ').pop();
          const b = st.route === 'backup';
          const d = (st.simT / 10).toFixed(3);
          const n = st.sent;
          const rules = sw === 's3' ? [['1', '2'], ['2', '1']] : [['1', b ? '3' : '2'], ['2', '1'], ['3', '1']];
          rules.forEach(function (r, i) {
            t.print(' cookie=0x0, duration=' + d + 's, table=0, n_packets=' + (i === 0 ? n : Math.round(n * 0.9)) + ', n_bytes=' + (i === 0 ? n : Math.round(n * 0.9)) * 60 + ', in_port=' + r[0] + ' actions=output:' + r[1], i === 0 && b && sw !== 's3' ? 'yellow' : '');
          });
          return;
        }
        if (c === 'sudo mn -c') {
          for (const l of ['*** Removing excess controllers/ofprotocols/ofdatapaths/pings/noxes', '*** Removing OVS datapaths', '*** Removing all links of the pattern foo-ethX', '*** Killing stale mininet node processes', '*** Cleanup complete.']) { t.print(l); await sleep(180); }
          self.reset();
          return;
        }
        t.print('command not found: ' + c.split(' ')[0] + '   (type help)', 'red');
      }
    });
    this.term.onStop = function () { st.target = null; if (st.streaming) self.toggleStream(); };

    this.notes = buildNotes(P.notes, [
      {
        id: 'say', label: 'Explain it', html:
          '<h4>What to say, step by step</h4><ol>' +
          '<li><b>Click Start traffic.</b> "This is the network we built in Mininet. h1 sends packets to h2 through switches s1 and s2. That is the main path."</li>' +
          '<li>"The main cable loses 10% of packets on purpose. Lost packets are sent again, in orange, like on the last slide."</li>' +
          '<li><b>Point at s3 at the back.</b> "This is a backup path through switch s3. It is longer, so we only use it when we must."</li>' +
          '<li><b>Point at the purple eye.</b> "This is our path monitor, a Python program. It keeps checking if the main cable is up, and sends test pings to measure loss."</li>' +
          '<li><b>Click Break link s1&ndash;s2.</b> "Now I cut the main cable. Packets on it are lost."</li>' +
          '<li><b>When REROUTED appears:</b> "The monitor noticed the cable is down and changed the rules in the switches. Look at the yellow panels: output 2 became output 3. Now packets go through s3."</li>' +
          '<li>"Traffic keeps flowing. The bottom bar shows how fast it noticed (Detection) and how long nothing arrived (Recovery gap)."</li>' +
          '<li><b>Optional:</b> Reset, then drag <b>Main loss</b> above 50%. "The cable is not cut, but it is so bad that the monitor reroutes anyway."</li></ol>' +
          '<p class="dim">Or click <b>sudo python3 live_demo.py</b> in the terminal and the whole story plays by itself.</p>'
      },
      {
        id: 'see', label: 'What you see', html:
          '<ul class="lg">' +
          '<li><i style="background:#1e9be6"></i><b>Blue box</b>: packet on the main path</li>' +
          '<li><i style="background:#3df5ff"></i><b>Cyan box</b>: packet on the backup path through s3</li>' +
          '<li><i style="background:#ffa53d"></i><b>Orange box</b>: a resend of a lost packet</li>' +
          '<li><i style="background:#ffffff"></i><b>White dots</b>: the monitor&#39;s test pings</li>' +
          '<li><i style="background:#b36bff"></i><b>Purple eye</b>: our path monitor program</li>' +
          '<li><i style="background:#ff4d5e"></i><b>Red flashing</b>: the cable is cut, switches in alarm</li>' +
          '<li><i style="background:#ffe066"></i><b>Yellow panels</b>: the switch rules (flow tables) being changed</li></ul>'
      },
      {
        id: 'words', label: 'Words', html:
          '<dl><dt>Mininet</dt><dd>Software that builds a fake network (computers, switches, cables) inside one Linux computer.</dd>' +
          '<dt>Switch</dt><dd>A box that forwards packets from one cable to another.</dd>' +
          '<dt>Open vSwitch</dt><dd>The software switch Mininet uses. We can change its rules.</dd>' +
          '<dt>Flow table / rule</dt><dd>"Packets coming in on port 1 go out on port 2." Changing 2 to 3 sends them to s3 instead.</dd>' +
          '<dt>Path monitor</dt><dd>Our Python program that watches the main cable.</dd>' +
          '<dt>Ping</dt><dd>A tiny test message. If the reply comes back, the path works.</dd>' +
          '<dt>Rerouting</dt><dd>Moving traffic to a different path.</dd>' +
          '<dt>Detection time</dt><dd>How long after the cut the monitor noticed.</dd>' +
          '<dt>Recovery gap</dt><dd>The longest time no packet arrived at h2.</dd></dl>'
      },
      {
        id: 'qa', label: 'Questions', html:
          '<dl><dt>How does the monitor know the cable broke?</dt><dd>It reads the link state of the s1 port. If the link is down, or more than 50% of 20 test pings are lost, it treats the main path as failed.</dd>' +
          '<dt>How is traffic moved?</dt><dd>With <code>ovs-ofctl add-flow</code> it changes the rule in s1 and s2 from output port 2 (to the other switch) to output port 3 (to s3). That is OpenFlow.</dd>' +
          '<dt>Why not always use the backup?</dt><dd>It is longer: 10 ms per link instead of 5 ms, so it is slower.</dd>' +
          '<dt>Are packets lost during the switch?</dt><dd>A few, the ones on the cable when it broke. They are sent again by our recovery from the first model, so in the end nothing is missing.</dd>' +
          '<dt>Are these exact times real?</dt><dd>No. The animation is slowed down so you can see it. Our real measurements come from running mininet_reroute.py in the Ubuntu VM.</dd></dl>'
      }
    ]);

    this.expand = function (b) {
      const s = root.closest('.slide');
      s.classList.toggle('expanded');
      if (b) b.classList.toggle('on', s.classList.contains('expanded'));
      setTimeout(function () { w.resize(); }, 30);
    };
    this.key = function (e) {
      const k = e.key.toLowerCase();
      if (k === ' ') { self.toggleStream(); return true; }
      if (k === 'r') { self.reset(); return true; }
      if (k === 'b') { self.breakLink(); return true; }
      if (k === 'u') { self.restoreLink(); return true; }
      if (k === 't') { self.startTour(); return true; }
      if (k === 'e') { self.expand(P.bar.querySelector('.mb-btn:last-child')); return true; }
      return false;
    };
    drawFlows(false);
  }

  window.M3D = {
    mount(root, kind) { return kind === 2 ? new Model2(root) : new Model1(root); }
  };
})();
