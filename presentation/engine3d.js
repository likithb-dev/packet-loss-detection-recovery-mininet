/* engine3d.js - shared Three.js world, effects, terminal and notes UI for the 3D slides */
(function () {
  'use strict';

  const COL = {
    blue: 0x1e9be6, cyan: 0x3df5ff, red: 0xff4d5e, green: 0x2ee59d, orange: 0xffa53d,
    yellow: 0xffe066, white: 0xf5f7fa, purple: 0xb36bff, grey: 0x3a4658, pink: 0xff5fd2
  };
  const hx = (n) => '#' + n.toString(16).padStart(6, '0');
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  let GLOW = null;
  function glowTex() {
    if (GLOW) return GLOW;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.22, 'rgba(255,255,255,0.65)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    GLOW = new THREE.CanvasTexture(c);
    return GLOW;
  }

  function glowSprite(color, size, opacity) {
    const m = new THREE.SpriteMaterial({
      map: glowTex(), color, transparent: true, opacity: opacity == null ? 1 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }

  // Text label drawn on a canvas, shown as a sprite that always faces the camera
  function makeLabel(text, o) {
    o = o || {};
    const size = o.size || 44;
    const h = o.height || 0.5;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false
    });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = o.renderOrder || 5;
    sp.userData.label = true;
    sp.userData.setText = function (t, color, border) {
      const lines = String(t).split('\n');
      const font = 'bold ' + size + 'px Arial, Helvetica, sans-serif';
      g.font = font;
      let w = 0;
      for (const l of lines) w = Math.max(w, g.measureText(l).width);
      const pad = size * 0.45;
      const lh = size * 1.22;
      c.width = Math.ceil(w + pad * 2);
      c.height = Math.ceil(lines.length * lh + pad);
      g.font = font;
      g.textBaseline = 'middle';
      g.textAlign = o.align === 'left' ? 'left' : 'center';
      if (o.bg !== null) {
        g.fillStyle = o.bg || 'rgba(6,12,22,0.82)';
        roundRect(g, 0, 0, c.width, c.height, size * 0.35);
        g.fill();
      }
      const b = border || o.border;
      if (b) {
        g.strokeStyle = b;
        g.lineWidth = Math.max(2, size * 0.07);
        roundRect(g, 2, 2, c.width - 4, c.height - 4, size * 0.32);
        g.stroke();
      }
      g.fillStyle = color || o.color || '#f5f7fa';
      lines.forEach(function (l, i) {
        g.fillText(l, o.align === 'left' ? pad : c.width / 2, pad / 2 + lh * (i + 0.5));
      });
      tex.needsUpdate = true;
      const sy = h * c.height / (size * 1.72);
      sp.scale.set(sy * c.width / c.height, sy, 1);
    };
    sp.userData.setText(text);
    return sp;
  }

  function disposeTree(obj) {
    obj.traverse(function (o) {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) {
          if (m.map && m.map !== GLOW) m.map.dispose();
          m.dispose();
        });
      }
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
  }

  function std(color, o) {
    o = o || {};
    return new THREE.MeshStandardMaterial(Object.assign({
      color, roughness: 0.45, metalness: 0.35, emissive: o.emissive || 0x000000, emissiveIntensity: 1
    }, o));
  }

  // ------------------------------------------------------------------ World
  class World {
    constructor(view, o) {
      this.view = view;
      this.fx = [];
      this.clickables = [];
      this.updaters = [];
      this.time = 0;
      this.shakeAmt = 0;
      this.scale = 1;
      this.onSelect = null;
      this.selected = null;

      const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
      r.setClearColor(0x04070d, 1);
      r.domElement.className = 'm-canvas';
      view.prepend(r.domElement);

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0x04070d, 0.014);
      this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
      this.camera.position.set(o.cam[0], o.cam[1], o.cam[2]);
      this.controls = new THREE.OrbitControls(this.camera, r.domElement);
      Object.assign(this.controls, {
        enableDamping: true, dampingFactor: 0.08, minDistance: 5, maxDistance: 75,
        maxPolarAngle: Math.PI * 0.495, autoRotateSpeed: 0.7
      });
      this.controls.target.set(o.target[0], o.target[1], o.target[2]);
      this.controls.update();
      this.home = { cam: this.camera.position.clone(), target: this.controls.target.clone() };

      this.scene.add(new THREE.HemisphereLight(0x8cc4ff, 0x080c14, 0.8));
      const d = new THREE.DirectionalLight(0xffffff, 0.75);
      d.position.set(8, 18, 12);
      this.scene.add(d);
      this.flashLight = new THREE.PointLight(COL.red, 0, 45, 2);
      this.flashLight.position.set(0, 6, 4);
      this.scene.add(this.flashLight);

      const g1 = new THREE.GridHelper(160, 80, COL.blue, 0x12304a);
      g1.material.transparent = true;
      g1.material.opacity = 0.3;
      g1.position.y = -1.35;
      this.scene.add(g1);
      const g2 = new THREE.GridHelper(160, 16, COL.cyan, COL.cyan);
      g2.material.transparent = true;
      g2.material.opacity = 0.07;
      g2.position.y = -1.33;
      this.scene.add(g2);
      this.grid2 = g2;

      const disc = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshBasicMaterial({
        map: glowTex(), color: 0x0e3a66, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = -1.34;
      this.scene.add(disc);

      const n = 1500;
      const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const rr = rand(70, 180);
        const th = rand(0, Math.PI * 2);
        const ph = Math.acos(rand(-0.15, 1));
        p[i * 3] = rr * Math.sin(ph) * Math.cos(th);
        p[i * 3 + 1] = rr * Math.cos(ph) - 10;
        p[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
        color: 0x9fc8ff, size: 1.1, map: glowTex(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.8
      }));
      this.scene.add(this.stars);

      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      const self = this;
      r.domElement.addEventListener('pointerdown', function (e) {
        self.down = [e.clientX, e.clientY];
        self.tween = null;
      });
      r.domElement.addEventListener('pointerup', function (e) {
        if (self.down && Math.hypot(e.clientX - self.down[0], e.clientY - self.down[1]) < 6) self.click(e);
        self.down = null;
      });
      r.domElement.addEventListener('pointermove', function (e) { self.lastMove = e; });
      r.domElement.addEventListener('pointerleave', function () { self.lastMove = null; self.setHover(null); });

      // selection marker that follows the selected object
      this.selRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.12, 48), new THREE.MeshBasicMaterial({
        color: COL.yellow, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      this.selRing.visible = false;
      this.scene.add(this.selRing);
    }

    register(obj, info) {
      obj.userData.info = info;
      this.clickables.push(obj);
      return obj;
    }

    unregister(obj) {
      const i = this.clickables.indexOf(obj);
      if (i >= 0) this.clickables.splice(i, 1);
      if (this.selected === obj) this.select(null);
    }

    pick(e) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.clickables, true);
      for (const h of hits) {
        let o = h.object;
        while (o && !o.userData.info) o = o.parent;
        if (o && o.parent) return o;
      }
      return null;
    }

    click(e) { this.select(this.pick(e)); }

    select(o) {
      this.selected = o;
      this.selRing.visible = !!o;
      if (o) {
        const p = new THREE.Vector3();
        o.getWorldPosition(p);
        this.ring(p, COL.yellow, 3.2, 0.7);
        this.burst(p, COL.yellow, 30, 4, 0.7, 0.35);
      }
      if (this.onSelect) this.onSelect(o);
    }

    setHover(o) {
      if (this.hovered === o) return;
      if (this.hovered && this.hovered.userData.baseScale) this.hovered.scale.copy(this.hovered.userData.baseScale);
      this.hovered = o;
      this.renderer.domElement.style.cursor = o ? 'pointer' : 'grab';
      if (o && !o.userData.noHoverScale) {
        if (!o.userData.baseScale) o.userData.baseScale = o.scale.clone();
        o.scale.copy(o.userData.baseScale).multiplyScalar(1.08);
      }
    }

    // ---------------- effects
    addFx(f) { this.fx.push(f); }

    burst(pos, color, n, speed, life, size) {
      n = n || 60; speed = speed || 6; life = life || 1.1; size = size || 0.45;
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(n * 3);
      const v = [];
      for (let i = 0; i < n; i++) {
        p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
        const dir = new THREE.Vector3(rand(-1, 1), rand(-0.6, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1) * speed);
        v.push(dir);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const mat = new THREE.PointsMaterial({
        color, size, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      const pts = new THREE.Points(geo, mat);
      this.scene.add(pts);
      let age = 0;
      const scene = this.scene;
      this.addFx(function (dt) {
        age += dt;
        const a = geo.attributes.position.array;
        for (let i = 0; i < n; i++) {
          v[i].y -= 4 * dt;
          v[i].multiplyScalar(1 - 1.2 * dt);
          a[i * 3] += v[i].x * dt; a[i * 3 + 1] += v[i].y * dt; a[i * 3 + 2] += v[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, 1 - age / life);
        if (age >= life) { scene.remove(pts); geo.dispose(); mat.dispose(); return false; }
        return true;
      });
    }

    ring(pos, color, maxScale, life, flat) {
      maxScale = maxScale || 4; life = life || 0.9;
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({
        color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      m.position.copy(pos);
      if (flat) m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      let age = 0;
      const self = this;
      this.addFx(function (dt) {
        age += dt;
        const k = age / life;
        if (!flat) m.quaternion.copy(self.camera.quaternion);
        m.scale.setScalar(0.2 + k * maxScale);
        m.material.opacity = Math.max(0, 1 - k);
        if (age >= life) { self.scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }
        return true;
      });
    }

    floatText(pos, text, color, life, height) {
      life = life || 1.6;
      const s = makeLabel(text, { height: height || 0.55, color: hx(color), border: hx(color), depthTest: false, renderOrder: 20 });
      s.position.copy(pos);
      this.scene.add(s);
      let age = 0;
      const self = this;
      this.addFx(function (dt) {
        age += dt;
        s.position.y += dt * 1.1;
        s.material.opacity = age < life * 0.6 ? 1 : Math.max(0, 1 - (age - life * 0.6) / (life * 0.4));
        if (age >= life) { self.scene.remove(s); disposeTree(s); return false; }
        return true;
      });
    }

    trail(pos, color, size) {
      const s = glowSprite(color, size || 0.7, 0.8);
      s.position.copy(pos);
      this.scene.add(s);
      let age = 0;
      const self = this;
      this.addFx(function (dt) {
        age += dt;
        s.material.opacity = Math.max(0, 0.8 - age * 2.2);
        s.scale.setScalar((size || 0.7) * (1 - age));
        if (age > 0.36) { self.scene.remove(s); s.material.dispose(); return false; }
        return true;
      });
    }

    beam(a, b, color, life) {
      life = life || 0.8;
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const geo = new THREE.CylinderGeometry(0.06, 0.06, len, 8, 1, true);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.scene.add(m);
      let age = 0;
      const self = this;
      this.addFx(function (dt) {
        age += dt;
        mat.opacity = Math.max(0, 1 - age / life) * (0.6 + 0.4 * Math.sin(age * 40));
        m.scale.x = m.scale.z = 1 + age * 3;
        if (age >= life) { self.scene.remove(m); geo.dispose(); mat.dispose(); return false; }
        return true;
      });
    }

    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

    lightFlash(color, intensity) {
      this.flashLight.color.setHex(color);
      this.flashLight.intensity = Math.max(this.flashLight.intensity, intensity || 3);
    }

    tweenTo(cam, target, dur) {
      this.tween = {
        t: 0, dur: dur || 1.4,
        c0: this.camera.position.clone(), t0: this.controls.target.clone(),
        c1: new THREE.Vector3(cam[0], cam[1], cam[2]), t1: new THREE.Vector3(target[0], target[1], target[2])
      };
    }

    resize(scale) {
      if (scale) this.scale = scale;
      const w = this.view.clientWidth;
      const h = this.view.clientHeight;
      if (!w || !h) return;
      this.renderer.setPixelRatio(Math.min(2.5, (window.devicePixelRatio || 1) * this.scale));
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    frame(dt) {
      this.time += dt;
      for (const u of this.updaters) u(dt);
      this.fx = this.fx.filter(function (f) { return f(dt); });
      this.stars.rotation.y += dt * 0.01;
      this.stars.material.opacity = 0.65 + 0.2 * Math.sin(this.time * 1.7);
      this.grid2.position.z = (this.time * 1.5) % 10;
      this.flashLight.intensity *= Math.pow(0.04, dt);

      if (this.tween) {
        const tw = this.tween;
        tw.t += dt / tw.dur;
        const k = ease(clamp(tw.t, 0, 1));
        this.camera.position.lerpVectors(tw.c0, tw.c1, k);
        this.controls.target.lerpVectors(tw.t0, tw.t1, k);
        if (tw.t >= 1) this.tween = null;
      }
      this.controls.update();

      if (this.lastMove && !this.down) {
        this.setHover(this.pick(this.lastMove));
        this.lastMove = null;
      }
      if (this.selected) {
        const p = new THREE.Vector3();
        this.selected.getWorldPosition(p);
        this.selRing.position.copy(p);
        this.selRing.quaternion.copy(this.camera.quaternion);
        const s = 1.6 + 0.15 * Math.sin(this.time * 6);
        this.selRing.scale.setScalar(this.selected.userData.ringSize ? this.selected.userData.ringSize * s / 1.6 : s);
      }

      const cam = this.camera.position.clone();
      if (this.shakeAmt > 0.001) {
        this.camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shakeAmt));
        this.shakeAmt *= Math.pow(0.02, dt);
      }
      this.renderer.render(this.scene, this.camera);
      this.camera.position.copy(cam);
    }

    // ---------------- builders
    host(pos, name, ip, color, role) {
      const g = new THREE.Group();
      g.position.copy(pos);
      const desk = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.7), std(0x1b2535));
      desk.position.y = -1.0;
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), std(0x2a3546));
      stand.position.y = -0.55;
      const mon = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.6, 0.16), std(0x0f1622, { metalness: 0.6 }));
      mon.position.y = 0.35;
      const c = document.createElement('canvas');
      c.width = 512; c.height = 320;
      const tex = new THREE.CanvasTexture(c);
      const scrMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.26, 1.38), scrMat);
      scr.position.set(0, 0.35, 0.085);
      const back = scr.clone();
      back.rotation.y = Math.PI;
      back.position.z = -0.085;
      const kb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.5), std(0x222c3b));
      kb.position.set(0, -0.88, 0.45);
      const glow = glowSprite(color, 5, 0.45);
      glow.position.y = 0.3;
      g.add(desk, stand, mon, scr, back, kb, glow);
      const label = makeLabel(name + '  ·  ' + role + '\n' + ip, { height: 0.58, border: hx(color) });
      label.position.y = 1.95;
      g.add(label);
      const self = this;
      const api = {
        group: g, glow, flashT: 0, flashColor: color, lines: ['> ready'],
        draw() {
          const x = c.getContext('2d');
          x.fillStyle = '#071019'; x.fillRect(0, 0, 512, 320);
          x.fillStyle = hx(color); x.fillRect(0, 0, 512, 54);
          x.fillStyle = '#04121e'; x.font = 'bold 34px monospace'; x.fillText(name.toUpperCase() + ' ' + role.toUpperCase(), 16, 38);
          x.font = '24px monospace'; x.fillStyle = '#8fe3ff';
          x.fillText(ip, 16, 92);
          x.fillStyle = '#cfe7ff';
          api.lines.slice(-6).forEach(function (l, i) { x.fillText(l.slice(0, 32), 16, 136 + i * 30); });
          if (Math.floor(self.time * 2) % 2) { x.fillStyle = '#cfe7ff'; x.fillRect(16, 290, 14, 22); }
          tex.needsUpdate = true;
        },
        say(line) { api.lines.push(line); api.draw(); },
        flash(col) { api.flashT = 1; api.flashColor = col; }
      };
      api.draw();
      let acc = 0;
      this.updaters.push(function (dt) {
        acc += dt;
        if (acc > 0.5) { acc = 0; api.draw(); }
        if (api.flashT > 0) {
          api.flashT = Math.max(0, api.flashT - dt * 1.6);
          const k = api.flashT;
          scrMat.color.setRGB(1 + k * 1.5, 1 + k * 1.5, 1 + k * 1.5);
          glow.material.color.setHex(api.flashColor);
          glow.scale.setScalar(5 + k * 5);
          glow.material.opacity = 0.45 + k * 0.5;
        } else {
          glow.material.color.setHex(color);
          glow.scale.setScalar(5 + 0.4 * Math.sin(self.time * 2));
        }
      });
      this.scene.add(g);
      return api;
    }

    switchBox(pos, name) {
      const g = new THREE.Group();
      g.position.copy(pos);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 1.7), std(0x172131, { metalness: 0.7, roughness: 0.3 }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: COL.blue }));
      g.add(body, edges);
      const leds = [];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.04), new THREE.MeshBasicMaterial({ color: COL.green }));
        m.position.set(-1.05 + i * 0.235, 0.18, 0.86);
        g.add(m);
        leds.push(m);
      }
      for (let i = 0; i < 4; i++) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.05), std(0x05080d));
        port.position.set(-0.75 + i * 0.5, -0.12, 0.86);
        g.add(port);
      }
      const fan = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: COL.cyan }));
      fan.rotation.x = Math.PI / 2;
      fan.position.y = 0.42;
      g.add(fan);
      const halo = glowSprite(COL.blue, 4.5, 0.35);
      g.add(halo);
      const label = makeLabel('Switch ' + name, { height: 0.55, border: hx(COL.blue) });
      label.position.y = 1.25;
      g.add(label);
      const self = this;
      const api = {
        group: g, alarm: false, label, halo,
        setAlarm(b) { api.alarm = b; edges.material.color.setHex(b ? COL.red : COL.blue); }
      };
      let acc = 0;
      this.updaters.push(function (dt) {
        fan.rotation.z += dt * (api.alarm ? 14 : 4);
        acc += dt;
        if (api.alarm) {
          const on = Math.floor(self.time * 8) % 2 === 0;
          leds.forEach(function (l) { l.material.color.setHex(on ? COL.red : 0x330008); });
          halo.material.color.setHex(COL.red);
          halo.material.opacity = on ? 0.9 : 0.25;
        } else if (acc > 0.09) {
          acc = 0;
          leds.forEach(function (l) {
            if (Math.random() < 0.35) l.material.color.setHex(Math.random() < 0.7 ? COL.green : (Math.random() < 0.5 ? COL.cyan : 0x0b2a1c));
          });
          halo.material.color.setHex(COL.blue);
          halo.material.opacity = 0.3 + 0.1 * Math.sin(self.time * 3);
        }
      });
      this.scene.add(g);
      return api;
    }

    link(a, b, o) {
      o = o || {};
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      mid.y += o.arc == null ? 0.5 : o.arc;
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
      const color = o.color || COL.blue;
      const mat = std(color, { emissive: color, emissiveIntensity: 0.55, transparent: true, opacity: 0.9, metalness: 0.2 });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, o.radius || 0.08, 10, false), mat);
      tube.userData.noHoverScale = true;
      this.scene.add(tube);
      const dots = [];
      const n = o.flow == null ? 6 : o.flow;
      for (let i = 0; i < n; i++) {
        const s = glowSprite(o.flowColor || color, 0.55, 0.9);
        s.userData.t = i / n;
        this.scene.add(s);
        dots.push(s);
      }
      const api = {
        curve, tube, mat, dots, speed: 0.25, on: true, color,
        setColor(c) {
          api.color = c;
          mat.color.setHex(c); mat.emissive.setHex(c);
          dots.forEach(function (d) { d.material.color.setHex(c); });
        },
        setVisible(v) { tube.visible = v; dots.forEach(function (d) { d.visible = v && api.on; }); },
        setFlow(on) { api.on = on; dots.forEach(function (d) { d.visible = on && tube.visible; }); }
      };
      const self = this;
      this.updaters.push(function (dt) {
        dots.forEach(function (d) {
          d.userData.t = (d.userData.t + dt * api.speed) % 1;
          d.position.copy(curve.getPointAt(d.userData.t));
          d.scale.setScalar(0.45 + 0.15 * Math.sin(self.time * 8 + d.userData.t * 20));
        });
      });
      return api;
    }
  }

  // ------------------------------------------------------------------ Terminal
  class Terminal {
    constructor(root, o) {
      this.root = root;
      this.busy = false;
      this.token = 0;
      root.classList.add('m-term');
      root.innerHTML =
        '<div class="mt-head"><span class="mt-dots"><i></i><i></i><i></i></span><span class="mt-title"></span>' +
        '<button class="mt-stop" title="Stop the running command (Ctrl+C)">Stop</button><button class="mt-clear">Clear</button></div>' +
        '<div class="mt-cmds"></div><div class="mt-out"></div>' +
        '<form class="mt-in"><span>$</span><input spellcheck="false" autocomplete="off" placeholder="type a command or click one above · help"></form>';
      root.querySelector('.mt-title').textContent = o.title;
      this.out = root.querySelector('.mt-out');
      const cmds = root.querySelector('.mt-cmds');
      const self = this;
      o.commands.forEach(function (c) {
        const b = el('button', 'mt-cmd', '<span class="mt-run">&#9654;</span>' + c.cmd.replace(/</g, '&lt;'));
        b.title = c.desc;
        b.addEventListener('click', function () { self.run(c.cmd); });
        cmds.appendChild(b);
      });
      this.runner = o.runner;
      root.querySelector('.mt-clear').addEventListener('click', function () { self.clear(); });
      root.querySelector('.mt-stop').addEventListener('click', function () { self.stop(); });
      const input = root.querySelector('input');
      const hist = [];
      let hi = 0;
      root.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        const v = input.value.trim();
        input.value = '';
        if (v) { hist.push(v); hi = hist.length; self.run(v, true); }
      });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'ArrowUp' && hi > 0) { hi--; input.value = hist[hi]; e.preventDefault(); }
        if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); }
        if (e.key === 'c' && e.ctrlKey) { self.stop(); e.preventDefault(); }
      });
      this.print(o.banner, 'dim');
    }

    print(text, cls) {
      const lines = String(text).split('\n');
      for (const l of lines) {
        const d = el('div', 'mt-line ' + (cls || ''));
        d.textContent = l === '' ? ' ' : l;
        this.out.appendChild(d);
      }
      while (this.out.childNodes.length > 500) this.out.removeChild(this.out.firstChild);
      this.out.scrollTop = this.out.scrollHeight;
    }

    clear() { this.out.innerHTML = ''; }

    stop() {
      if (!this.busy) return;
      this.token++;
      this.print('^C', 'red');
      this.busy = false;
      if (this.onStop) this.onStop();
    }

    async run(cmd, typed) {
      if (this.busy) { this.print('(a command is still running: wait for it, or press Stop)', 'dim'); return; }
      const line = el('div', 'mt-line mt-prompt');
      this.out.appendChild(line);
      if (typed) line.textContent = '$ ' + cmd;
      else {
        for (let i = 0; i <= cmd.length; i++) {
          line.textContent = '$ ' + cmd.slice(0, i) + (i < cmd.length ? '█' : '');
          this.out.scrollTop = this.out.scrollHeight;
          await sleep(10);
        }
      }
      this.busy = true;
      const tok = ++this.token;
      try {
        await this.runner(cmd.trim().replace(/\s+/g, ' '), this, function () { return tok !== this.token; }.bind(this));
      } catch (err) {
        this.print(String(err), 'red');
      }
      if (tok === this.token) this.busy = false;
    }
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function until(cond, cancelled) {
    while (!cond()) {
      if (cancelled && cancelled()) throw new Error('stopped');
      await sleep(80);
    }
  }

  // ------------------------------------------------------------------ Notes panel
  function buildNotes(root, tabs) {
    root.classList.add('m-notes');
    const head = el('div', 'mn-tabs');
    const body = el('div', 'mn-body');
    root.append(head, body);
    let current = null;
    const btns = {};
    function show(id, html) {
      current = id;
      Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', k === id); });
      body.innerHTML = html != null ? html : tabs.find(function (t) { return t.id === id; }).html;
      body.scrollTop = 0;
    }
    tabs.forEach(function (t) {
      const b = el('button', 'mn-tab', t.label);
      b.addEventListener('click', function () { show(t.id); });
      head.appendChild(b);
      btns[t.id] = b;
    });
    const sel = el('button', 'mn-tab mn-sel', 'Clicked');
    sel.addEventListener('click', function () { show('sel', api.selHtml); });
    head.appendChild(sel);
    btns.sel = sel;
    const api = {
      show,
      selHtml: '<p class="dim">Click any object in the 3D model (a computer, a switch, a cable, a packet) and its explanation appears here.</p>',
      showSelection(title, html) {
        api.selHtml = '<h4>' + title + '</h4>' + html;
        show('sel', api.selHtml);
        sel.classList.add('ping');
        setTimeout(function () { sel.classList.remove('ping'); }, 600);
      }
    };
    show(tabs[0].id);
    return api;
  }

  // ------------------------------------------------------------------ Small UI helpers for the control bar
  function ui(bar) {
    return {
      group(title) {
        const g = el('div', 'mb-group');
        if (title) g.appendChild(el('span', 'mb-gt', title));
        bar.appendChild(g);
        return g;
      },
      btn(parent, label, fn, cls, tip) {
        const b = el('button', 'mb-btn ' + (cls || ''), label);
        if (tip) b.title = tip;
        b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); b.blur(); });
        parent.appendChild(b);
        return b;
      },
      slider(parent, label, min, max, step, val, fmt, fn, tip) {
        const w = el('label', 'mb-sl');
        if (tip) w.title = tip;
        const t = el('span', 'mb-sl-t');
        const i = el('input');
        i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val;
        const upd = function () { t.textContent = label + ' ' + fmt(+i.value); };
        i.addEventListener('input', function () { upd(); fn(+i.value); });
        i.addEventListener('keydown', function (e) { e.stopPropagation(); });
        upd();
        w.append(t, i);
        parent.appendChild(w);
        return { input: i, set(v) { i.value = v; upd(); } };
      }
    };
  }

  // python-style padding helpers for the terminal output
  const padL = (s, n) => String(s).padStart(n);
  const padR = (s, n) => String(s).padEnd(n);

  window.E3D = { COL, hx, rand, clamp, ease, el, World, Terminal, buildNotes, ui, makeLabel, glowSprite, glowTex, disposeTree, std, sleep, until, padL, padR };
})();
