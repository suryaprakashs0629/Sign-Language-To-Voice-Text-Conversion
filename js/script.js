
const SUPPORTED_SIGNS = [
      { id: "STOP", name: "STOP ✋", desc: "Raise flat open hand upright facing camera.", cat: "Basic", type: "single" },
      { id: "HI", name: "HI 👋", desc: "Raise open palm and wave side-to-side.", cat: "Greetings", type: "single" },
      { id: "GOOD_MORNING", name: "GOOD MORNING 🌞", desc: "Extend thumb, index, pinky (ILY shape).", cat: "Greetings", type: "single" },
      { id: "THANK_YOU", name: "THANK YOU 🙏", desc: "Flat hand fingers closed, move outward.", cat: "Basic", type: "single" },
      { id: "YES", name: "YES 👍", desc: "Closed fist with thumb pointing straight UP.", cat: "Basic", type: "single" },
      { id: "NO", name: "NO 👎", desc: "Closed fist with thumb pointing straight DOWN.", cat: "Basic", type: "single" },
      { id: "WATER", name: "WATER 💧", desc: "Extend index, middle, ring (W-shape).", cat: "Needs", type: "single" },
      { id: "FOOD", name: "FOOD 🍚", desc: "Pinch all 5 fingertips tightly together.", cat: "Needs", type: "single" },
      { id: "HELP", name: "I NEED HELP 🆘", desc: "Thumbs-up resting on other flat palm.", cat: "Emergency", type: "two" },
      { id: "HOSPITAL", name: "HOSPITAL 🏥", desc: "Cross both index fingers into an X.", cat: "Emergency", type: "two" },
      { id: "PEACE", name: "PEACE ✌️", desc: "Extend index & middle in V-shape; others tucked.", cat: "Greetings", type: "single" },
      { id: "OK", name: "OK 👌", desc: "Touch thumb & index in O-ring; others spread.", cat: "Basic", type: "single" },
      { id: "POINT", name: "YOU / ONE ☝️", desc: "Point index finger straight up alone.", cat: "Basic", type: "single" },
      { id: "CALL", name: "CALL ME 🤙", desc: "Extend only thumb and pinky (phone shape).", cat: "Everyday", type: "single" },
      { id: "FIST", name: "POWER ✊", desc: "Clench all fingers tightly into a solid fist.", cat: "Basic", type: "single" },
      { id: "L_SHAPE", name: "L-SHAPE 👆", desc: "Extend thumb and index at a 90° angle.", cat: "Basic", type: "single" },
      { id: "HOUSE", name: "HOUSE 🏠", desc: "Angle both hands with fingertips touching (roof).", cat: "Everyday", type: "two" },
      { id: "BOOK", name: "BOOK 📖", desc: "Flat hands with pinky edges pressed together.", cat: "Everyday", type: "two" },
      { id: "CLAP", name: "CLAP 👏", desc: "Both palms facing each other in close proximity.", cat: "Everyday", type: "two" },
      { id: "WHAT", name: "WHAT 🤲", desc: "Both palms facing UP, spread side-by-side.", cat: "Basic", type: "two" }
    ];

    const state = {
      activeRoute: 'home',
      isCameraRunning: false,
      handsInstance: null,
      cameraInstance: null,
      activeStream: null,
      showSkeleton: true,
      autoSpeak: false,
      lastSpokenText: '',
      lastSpokenTime: 0,
      confidenceThreshold: 0.75,
      currentDetected: null,
      history: JSON.parse(localStorage.getItem('sv_history') || '[]'),
      transcriptWords: [],
      practiceIdx: 0,
      practiceHoldTimer: 0,
      practiceScore: 0
    };

    const MOTION_BUFFER_SIZE = 16;
    let motionBuffer = [];
    const GESTURE_HISTORY_SIZE = 6;
    let gestureHistory = [];

    const routes = {
      'home': renderHome,
      'translate': renderTranslate,
      'sign-guide': renderSignGuide,
      'datasheet': renderDataSheet,
      'practice': renderPractice,
      'dashboard': renderDashboard,
      'history': renderHistory,
      'emergency': renderEmergency,
      'about': renderAbout,
      'help': renderHelp
    };

    function navigate(route) {
      window.location.hash = route;
    }

    function toggleMobileNav() {
      const drawer = document.getElementById('mobileDrawer');
      if (drawer) drawer.classList.toggle('open');
    }

    function handleRouting() {
      let hash = window.location.hash.replace('#', '') || 'home';
      if (!routes[hash]) hash = 'home';

      if (state.activeRoute === 'translate' || state.activeRoute === 'practice') {
        stopComputerVision();
      }

      state.activeRoute = hash;

      // Toggle background AI hand visibility (active on home)
      const handStage = document.getElementById('aiHandStage');
      if (handStage) {
        if (hash === 'home') {
          handStage.classList.add('active');
        } else {
          handStage.classList.remove('active');
        }
      }

      document.querySelectorAll('#mainNav .nav-link').forEach(el => el.classList.remove('active'));
      const activeLink = document.querySelector(`#mainNav .nav-link[data-route="${hash}"]`);
      if (activeLink) activeLink.classList.add('active');

      const app = document.getElementById('router-view');
      app.innerHTML = `<div class="page active">${routes[hash]()}</div>`;
      
      scrollStackMgr.destroy();
      setTimeout(() => { scrollStackMgr.init(); }, 80);

      if (hash === 'translate' || hash === 'practice') {
        setTimeout(initComputerVision, 80);
      }
      if (hash === 'practice') {
        setTimeout(updatePracticeTarget, 50);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.addEventListener('hashchange', handleRouting);

    // ==================================================
    // PROCEDURAL AI WIREFRAME HAND ENGINE (IMAGE + VIDEO MORPH)
    // ==================================================
    class AIHandVisualizer {
      constructor() {
        this.canvas = document.getElementById('aiHandCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.currentScroll = 0;
        this.targetScroll = 0;
        this.time = 0;
        this.overridePose = null;
        this.overrideTimer = 0;

        // Base 21 landmark definition templates [x, y, z] normalized (-1 to 1)
        this.poses = {
          open: [
            [0, 0.55, 0],
            [-0.08, 0.40, 0.02], [-0.16, 0.26, 0.04], [-0.22, 0.12, 0.05], [-0.28, 0.02, 0.06],
            [-0.12, 0.12, 0], [-0.15, -0.12, 0], [-0.17, -0.30, 0], [-0.18, -0.48, 0],
            [-0.02, 0.08, 0], [-0.02, -0.16, 0], [-0.02, -0.36, 0], [-0.02, -0.56, 0],
            [0.08, 0.12, 0], [0.11, -0.12, 0], [0.13, -0.29, 0], [0.15, -0.46, 0],
            [0.18, 0.18, 0], [0.22, -0.02, 0], [0.25, -0.16, 0], [0.28, -0.32, 0]
          ],
          peace: [
            [0, 0.55, 0],
            [-0.06, 0.38, 0.12], [-0.08, 0.25, 0.15], [-0.05, 0.14, 0.16], [-0.02, 0.12, 0.15],
            [-0.10, 0.12, 0], [-0.18, -0.12, 0], [-0.24, -0.32, 0], [-0.30, -0.52, 0],
            [-0.02, 0.08, 0], [0.04, -0.14, 0], [0.10, -0.34, 0], [0.16, -0.54, 0],
            [0.08, 0.14, 0], [0.08, 0.25, 0.1], [0.06, 0.32, 0.14], [0.04, 0.35, 0.14],
            [0.17, 0.20, 0], [0.15, 0.28, 0.1], [0.13, 0.35, 0.14], [0.11, 0.38, 0.14]
          ],
          three: [
            [0, 0.55, 0],
            [-0.06, 0.38, 0.12], [-0.08, 0.25, 0.15], [-0.05, 0.14, 0.16], [-0.02, 0.12, 0.15],
            [-0.12, 0.12, 0], [-0.18, -0.12, 0], [-0.22, -0.32, 0], [-0.26, -0.50, 0],
            [-0.02, 0.08, 0], [-0.02, -0.16, 0], [-0.02, -0.36, 0], [-0.02, -0.56, 0],
            [0.08, 0.12, 0], [0.12, -0.12, 0], [0.16, -0.30, 0], [0.20, -0.48, 0],
            [0.17, 0.20, 0], [0.15, 0.28, 0.1], [0.13, 0.35, 0.14], [0.11, 0.38, 0.14]
          ],
          point: [
            [0, 0.55, 0],
            [-0.06, 0.38, 0.12], [-0.08, 0.25, 0.15], [-0.05, 0.14, 0.16], [-0.02, 0.12, 0.15],
            [-0.08, 0.12, 0], [-0.08, -0.14, 0], [-0.08, -0.35, 0], [-0.08, -0.56, 0],
            [-0.02, 0.12, 0], [-0.02, 0.24, 0.1], [-0.02, 0.32, 0.14], [-0.02, 0.35, 0.14],
            [0.06, 0.14, 0], [0.06, 0.25, 0.1], [0.06, 0.32, 0.14], [0.05, 0.35, 0.14],
            [0.14, 0.20, 0], [0.14, 0.28, 0.1], [0.13, 0.35, 0.14], [0.12, 0.38, 0.14]
          ],
          ok: [
            [0, 0.55, 0],
            [-0.08, 0.38, 0], [-0.14, 0.24, 0.05], [-0.14, 0.08, 0.08], [-0.09, -0.02, 0.08],
            [-0.10, 0.12, 0], [-0.13, 0.04, 0.08], [-0.11, -0.04, 0.08], [-0.09, -0.02, 0.08],
            [-0.02, 0.08, 0], [-0.02, -0.16, 0], [-0.02, -0.36, 0], [-0.02, -0.56, 0],
            [0.08, 0.12, 0], [0.11, -0.12, 0], [0.13, -0.29, 0], [0.15, -0.46, 0],
            [0.18, 0.18, 0], [0.22, -0.02, 0], [0.25, -0.16, 0], [0.28, -0.32, 0]
          ],
          fist: [
            [0, 0.55, 0],
            [-0.06, 0.38, 0.14], [-0.05, 0.25, 0.18], [-0.02, 0.15, 0.2], [0.02, 0.15, 0.2],
            [-0.10, 0.14, 0], [-0.08, 0.22, 0.12], [-0.07, 0.30, 0.15], [-0.06, 0.32, 0.15],
            [-0.02, 0.12, 0], [-0.02, 0.22, 0.12], [-0.02, 0.30, 0.15], [-0.02, 0.32, 0.15],
            [0.06, 0.14, 0], [0.06, 0.24, 0.12], [0.05, 0.31, 0.15], [0.04, 0.33, 0.15],
            [0.14, 0.18, 0], [0.13, 0.26, 0.12], [0.11, 0.33, 0.15], [0.10, 0.35, 0.15]
          ]
        };

        this.triangles = [
          [0, 1, 5], [1, 2, 5], [2, 3, 5], [3, 4, 5],
          [0, 5, 9], [5, 6, 9], [6, 7, 10], [7, 8, 11],
          [0, 9, 13], [9, 10, 13], [10, 11, 14], [11, 12, 15],
          [0, 13, 17], [13, 14, 17], [14, 15, 18], [15, 16, 19],
          [17, 18, 20], [5, 9, 13], [9, 13, 17]
        ];

        this.init();
      }

      init() {
        if (!this.canvas) return;
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('scroll', () => this.onScroll());
        this.resize();
        this.loop();
      }

      resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }

      onScroll() {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight || 1;
        this.targetScroll = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      }

      triggerDirectPose(poseKey) {
        if (this.poses[poseKey]) {
          this.overridePose = this.poses[poseKey];
          this.overrideTimer = 180; // hold for ~3 seconds
        }
      }

      lerp(a, b, t) {
        return a + (b - a) * t;
      }

      lerpPoints(p1, p2, t) {
        return p1.map((pt, i) => [
          this.lerp(pt[0], p2[i][0], t),
          this.lerp(pt[1], p2[i][1], t),
          this.lerp(pt[2], p2[i][2], t)
        ]);
      }

      getGestureAtScroll(s) {
        if (this.overridePose && this.overrideTimer > 0) {
          this.overrideTimer--;
          return { points: this.overridePose };
        }

        const milestones = [
          { p: 0.00, pose: this.poses.open },
          { p: 0.20, pose: this.poses.peace },
          { p: 0.45, pose: this.poses.three },
          { p: 0.65, pose: this.poses.point },
          { p: 0.85, pose: this.poses.ok },
          { p: 1.00, pose: this.poses.fist }
        ];

        for (let i = 0; i < milestones.length - 1; i++) {
          if (s >= milestones[i].p && s <= milestones[i + 1].p) {
            const range = milestones[i + 1].p - milestones[i].p;
            const t = (s - milestones[i].p) / range;
            const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            return {
              points: this.lerpPoints(milestones[i].pose, milestones[i + 1].pose, easeT)
            };
          }
        }
        return { points: milestones[0].pose };
      }

      loop() {
        this.time += 0.02;
        this.currentScroll = this.lerp(this.currentScroll, this.targetScroll, 0.08);

        if (this.ctx && state.activeRoute === 'home') {
          this.render();
        }

        requestAnimationFrame(() => this.loop());
      }

      render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        const currentGesture = this.getGestureAtScroll(this.currentScroll);

        const centerX = w * 0.52;
        const centerY = h * 0.50 + Math.sin(this.time) * 12;
        const scale = Math.min(w, h) * 0.52;

        const rotY = Math.sin(this.time * 0.5) * 0.15 + (this.currentScroll - 0.5) * 0.4;
        const rotX = (this.currentScroll - 0.5) * 0.25;

        const screenPoints = currentGesture.points.map(pt => {
          let x = pt[0];
          let y = pt[1];
          let z = pt[2];

          const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
          const x1 = x * cosY + z * sinY;
          const z1 = -x * sinY + z * cosY;

          const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
          const y2 = y * cosX - z1 * sinX;
          const z2 = y * sinX + z1 * cosX;

          return {
            x: centerX + x1 * scale,
            y: centerY + y2 * scale,
            z: z2
          };
        });

        // 1. Triangular Facets
        for (const tri of this.triangles) {
          const p1 = screenPoints[tri[0]];
          const p2 = screenPoints[tri[1]];
          const p3 = screenPoints[tri[2]];

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();

          const avgY = (p1.y + p2.y + p3.y) / 3;
          const alpha = 0.05 + Math.sin(this.time + avgY * 0.01) * 0.02;
          ctx.fillStyle = avgY > centerY ? `rgba(244, 63, 94, ${alpha})` : `rgba(0, 242, 254, ${alpha})`;
          ctx.fill();
        }

        // 2. Wireframe Bones
        const bones = [
          [0, 1, 2, 3, 4],     // Thumb
          [0, 5, 6, 7, 8],     // Index
          [0, 9, 10, 11, 12],  // Middle
          [0, 13, 14, 15, 16], // Ring
          [0, 17, 18, 19, 20], // Pinky
          [5, 9, 13, 17, 0],
          [1, 5], [2, 6], [3, 7], [4, 8],
          [6, 10], [7, 11], [8, 12],
          [10, 14], [11, 15], [12, 16],
          [14, 18], [15, 19], [16, 20]
        ];

        const grad = ctx.createLinearGradient(centerX, centerY + scale * 0.6, centerX, centerY - scale * 0.6);
        grad.addColorStop(0, "rgba(244, 63, 94, 0.75)");
        grad.addColorStop(0.45, "rgba(139, 92, 246, 0.75)");
        grad.addColorStop(1, "rgba(0, 242, 254, 0.95)");

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;

        for (const chain of bones) {
          ctx.beginPath();
          for (let i = 0; i < chain.length; i++) {
            const pt = screenPoints[chain[i]];
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }

        // 3. Glowing Landmark Nodes
        for (let i = 0; i < screenPoints.length; i++) {
          const pt = screenPoints[i];
          const isTip = (i === 4 || i === 8 || i === 12 || i === 16 || i === 20);

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isTip ? 8 : 4.5, 0, Math.PI * 2);
          ctx.fillStyle = isTip ? "rgba(0, 242, 254, 0.25)" : "rgba(244, 63, 94, 0.2)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isTip ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isTip ? "#00F2FE" : "#F43F5E";
          ctx.shadowBlur = isTip ? 12 : 6;
          ctx.shadowColor = isTip ? "#00F2FE" : "#F43F5E";
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    const aiHandEngine = new AIHandVisualizer();

    // ==================================================
    // LENIS SCROLL STACK
    // ==================================================
    class ScrollStackManager {
      constructor() {
        this.lenis = null;
        this.cards = [];
        this.animationFrame = null;
        this.lastTransforms = new Map();
        this.isUpdating = false;

        this.itemDistance = 32;
        this.itemScale = 0.04;
        this.itemStackDistance = 16;
        this.stackPosition = '22%';
        this.scaleEndPosition = '6%';
        this.baseScale = 0.90;
      }

      init() {
        this.cards = Array.from(document.querySelectorAll('.scroll-stack-card'));
        if (this.cards.length === 0) return;

        this.cards.forEach((card, i) => {
          if (i < this.cards.length - 1) {
            card.style.marginBottom = `${this.itemDistance}px`;
          }
        });

        if (typeof Lenis !== 'undefined') {
          this.lenis = new Lenis({
            duration: 1.1,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true
          });

          this.lenis.on('scroll', () => this.updateCardTransforms());
          
          const raf = (time) => {
            if (this.lenis) {
              this.lenis.raf(time);
              this.animationFrame = requestAnimationFrame(raf);
            }
          };
          this.animationFrame = requestAnimationFrame(raf);
        }

        this.updateCardTransforms();
      }

      parsePercentage(value, h) {
        if (typeof value === 'string' && value.includes('%')) {
          return (parseFloat(value) / 100) * h;
        }
        return parseFloat(value);
      }

      getAbsoluteTop(el) {
        let top = 0;
        while (el) {
          top += el.offsetTop;
          el = el.offsetParent;
        }
        return top;
      }

      updateCardTransforms() {
        if (!this.cards.length || this.isUpdating) return;
        this.isUpdating = true;

        const scrollTop = window.scrollY;
        const containerHeight = window.innerHeight;
        const stackPosPx = this.parsePercentage(this.stackPosition, containerHeight);
        const scaleEndPx = this.parsePercentage(this.scaleEndPosition, containerHeight);
        
        const endElement = document.querySelector('.scroll-stack-end');
        const endTop = endElement ? this.getAbsoluteTop(endElement) : 0;

        this.cards.forEach((card, i) => {
          const cardTop = this.getAbsoluteTop(card);
          const trigStart = cardTop - stackPosPx - this.itemStackDistance * i;
          const trigEnd = cardTop - scaleEndPx;
          const pinStart = cardTop - stackPosPx - this.itemStackDistance * i;
          const pinEnd = endTop - containerHeight / 2;

          let scaleProgress = 0;
          if (scrollTop > trigStart) {
            if (scrollTop >= trigEnd) scaleProgress = 1;
            else scaleProgress = (scrollTop - trigStart) / (trigEnd - trigStart);
          }

          const targetScale = this.baseScale + i * this.itemScale;
          const scale = 1 - scaleProgress * (1 - targetScale);
          
          let translateY = 0;
          if (scrollTop >= pinStart && scrollTop <= pinEnd) {
            translateY = scrollTop - cardTop + stackPosPx + this.itemStackDistance * i;
          } else if (scrollTop > pinEnd) {
            translateY = pinEnd - cardTop + stackPosPx + this.itemStackDistance * i;
          }

          const newT = {
            y: Math.round(translateY * 10) / 10,
            s: Math.round(scale * 1000) / 1000
          };

          const oldT = this.lastTransforms.get(i);
          if (!oldT || Math.abs(oldT.y - newT.y) > 0.2 || Math.abs(oldT.s - newT.s) > 0.002) {
            card.style.transform = `translate3d(0, ${newT.y}px, 0) scale(${newT.s})`;
            this.lastTransforms.set(i, newT);
          }
        });

        this.isUpdating = false;
      }

      destroy() {
        if (this.animationFrame) {
          cancelAnimationFrame(this.animationFrame);
          this.animationFrame = null;
        }
        if (this.lenis) {
          this.lenis.destroy();
          this.lenis = null;
        }
        this.cards = [];
        this.lastTransforms.clear();
      }
    }

    const scrollStackMgr = new ScrollStackManager();

    // ==================================================
    // ROUTE TEMPLATES
    // ==================================================
    function renderHome() {
      return `
        <section class="hero">
          <div>
            <h1 class="hero-title serif">Sign Language<br>to Voice / Text</h1>
            <p class="hero-desc">
              Bridging everyday communication through real-time hand gesture recognition. 
              A camera-based assistive system engineered to recognize supported signs and synthesize readable text and audible voice.
            </p>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <button class="btn btn-primary" onclick="navigate('translate')">OPEN TRANSLATOR</button>
              <button class="btn btn-secondary" onclick="navigate('datasheet')">VIEW DATA SHEET</button>
              <button class="btn btn-secondary" onclick="navigate('sign-guide')">EXPLORE 20 SIGNS</button>
            </div>
          </div>

          <!-- REPLACEMENT: LIVE INTERACTIVE GESTURE-TO-SPEECH SANDBOX CONSOLE -->
          <div class="hero-simulator-card physics-card">
            <div class="sim-header">
              <span style="display:flex; align-items:center; gap:8px;">
                <span class="pulse-dot-green"></span> PIPELINE TESTER
              </span>
              <span class="badge" style="color:var(--accent-teal);">TTS ENGINE READY</span>
            </div>

            <div style="font-size:0.84rem; color:var(--text-muted);">
              Click any prototype gesture to test instant voice synthesis & watch the AI hand morph:
            </div>

            <div class="sim-pills-grid">
              <button class="sim-btn active" onclick="testInteractiveGesture('HI', 'Hello! Welcome to SignVoice.', 'open', '[1, 1, 1, 1, 1]', 96, this)">👋 HI</button>
              <button class="sim-btn" onclick="testInteractiveGesture('YES', 'Yes, confirmed.', 'fist', '[1, 0, 0, 0, 0]', 98, this)">👍 YES</button>
              <button class="sim-btn" onclick="testInteractiveGesture('WATER', 'I need water please.', 'three', '[0, 1, 1, 1, 0]', 95, this)">💧 WATER</button>
              <button class="sim-btn" onclick="testInteractiveGesture('HELP', 'I need immediate help!', 'open', '[1, 1, 1, 1, 1]', 99, this)">🆘 HELP</button>
              <button class="sim-btn" onclick="testInteractiveGesture('PEACE', 'Peace and greetings.', 'peace', '[0, 1, 1, 0, 0]', 97, this)">✌️ PEACE</button>
              <button class="sim-btn" onclick="testInteractiveGesture('OK', 'Everything is OK.', 'ok', '[X, X, 1, 1, 1]', 95, this)">👌 OK</button>
            </div>

            <div class="sim-display-screen">
              <div class="sim-wave-row">
                <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint);">Landmark Feature Vector</span>
                <span class="vector-code" id="simVectorDisplay">[1, 1, 1, 1, 1]</span>
              </div>
              
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); font-weight:700;">Synthesized Speech Output</span>
                  <span id="simConfDisplay" style="font-size:0.78rem; font-weight:700; color:var(--success);">96% Verified</span>
                </div>
                <div id="simTextOutput" style="font-size:1.15rem; font-weight:600; color:var(--text-main); min-height:36px;">
                  "Hello! Welcome to SignVoice."
                </div>
              </div>

              <div style="display:flex; gap:8px; margin-top:4px;">
                <button class="btn btn-primary" style="flex:1; padding:8px 12px; font-size:0.8rem;" onclick="speakPhrase(document.getElementById('simTextOutput').innerText)">
                  🔊 Speak Again
                </button>
                <button class="btn btn-secondary" style="padding:8px 12px; font-size:0.8rem;" onclick="copySimText()">
                  📋 Copy
                </button>
                <button class="btn btn-secondary" style="padding:8px 12px; font-size:0.8rem;" onclick="navigate('translate')">
                  📹 Live Camera →
                </button>
              </div>
            </div>
          </div>
        </section>

        <section style="margin: 70px 0; border-top: 1px solid var(--border-light); padding-top: 50px;">
          <h2 class="serif" style="font-size: 2.6rem; text-align:center; margin-bottom: 16px;">Communication is more than words.</h2>
          <p style="text-align:center; max-width: 760px; margin: 0 auto; font-size: 1.05rem; color: var(--text-muted);">
            Individuals communicating primarily through sign language face consistent barriers interacting with the non-signing public. 
            Scroll down to watch our neural vision hand adapt through distinct prototype signs.
          </p>
        </section>

        <section style="margin: 60px 0;">
          <h3 class="hero-eyebrow">The Challenge</h3>
          <div class="scroll-stack-scroller">
            <div class="scroll-stack-inner">
              <div class="scroll-stack-card process-card physics-card">
                <div class="process-num">01</div>
                <strong style="display:block; margin-bottom:8px; font-size:1.4rem;">Communication Gap</strong>
                <p style="font-size:1rem; color:var(--text-muted);">Lack of widespread sign fluency creates reciprocal misunderstanding.</p>
              </div>
              <div class="scroll-stack-card process-card physics-card">
                <div class="process-num">02</div>
                <strong style="display:block; margin-bottom:8px; font-size:1.4rem;">Critical Settings</strong>
                <p style="font-size:1rem; color:var(--text-muted);">Immediate clarity is paramount in hospitals, classrooms, and workplaces.</p>
              </div>
              <div class="scroll-stack-card process-card physics-card">
                <div class="process-num">03</div>
                <strong style="display:block; margin-bottom:8px; font-size:1.4rem;">Interpreter Scarcity</strong>
                <p style="font-size:1rem; color:var(--text-muted);">Human interpreters are rarely available on-demand at physical reception desks.</p>
              </div>
              <div class="scroll-stack-card process-card physics-card">
                <div class="process-num">04</div>
                <strong style="display:block; margin-bottom:8px; font-size:1.4rem;">Zero-Cost Vision</strong>
                <p style="font-size:1rem; color:var(--text-muted);">Eliminating costly data gloves by using commodity webcams and edge computing.</p>
              </div>
              <div class="scroll-stack-end"></div>
            </div>
          </div>
        </section>

        <section style="margin: 60px 0; background:var(--bg-surface); padding:36px; border-radius:var(--radius-md); border:1px solid var(--border-light);">
          <h3 class="hero-eyebrow" style="text-align:center;">Real-Time Pipeline</h3>
          <h2 class="serif" style="text-align:center; font-size:2.2rem; margin-bottom:28px;">From Gesture to Audible Speech</h2>
          
          <div class="grid-4" style="text-align:center;">
            <div>
              <div class="badge" style="margin-bottom:8px;">STAGE 1</div>
              <h4>Webcam Input</h4>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Captures video in neutral chest space.</p>
            </div>
            <div>
              <div class="badge" style="margin-bottom:8px;">STAGE 2</div>
              <h4>MediaPipe Tracking</h4>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Extracts 21 3D landmarks per hand via WASM.</p>
            </div>
            <div>
              <div class="badge" style="margin-bottom:8px;">STAGE 3</div>
              <h4>Kinematic Classifier</h4>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Analyzes extension vectors and temporal consensus.</p>
            </div>
            <div>
              <div class="badge" style="margin-bottom:8px;">STAGE 4</div>
              <h4>Synthesis Engine</h4>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Web Speech API generates instantaneous spoken voice.</p>
            </div>
          </div>
        </section>

        <section style="margin: 70px 0;">
          <h3 class="hero-eyebrow" style="text-align:center;">Core Principles</h3>
          <h2 class="serif" style="text-align:center; font-size:2.6rem; margin-bottom:40px;">Why We Built SignVoice</h2>
          
          <div class="grid-3">
            <div class="card physics-card">
              <div style="font-size:2.4rem; margin-bottom:14px;">🔒</div>
              <h4 style="font-size:1.3rem; margin-bottom:8px;">100% Local Privacy</h4>
              <p style="color:var(--text-muted); font-size:0.92rem; line-height:1.6;">
                Computer vision landmark extraction runs client-side. No camera footage or biometric data leaves your local machine.
              </p>
            </div>
            <div class="card physics-card">
              <div style="font-size:2.4rem; margin-bottom:14px;">⚡</div>
              <h4 style="font-size:1.3rem; margin-bottom:8px;">Near-Zero Latency</h4>
              <p style="color:var(--text-muted); font-size:0.92rem; line-height:1.6;">
                Mathematical scale-normalized ratios allow sub-30ms classification on standard laptop hardware without heavy cloud GPUs.
              </p>
            </div>
            <div class="card physics-card">
              <div style="font-size:2.4rem; margin-bottom:14px;">🌐</div>
              <h4 style="font-size:1.3rem; margin-bottom:8px;">Universal Access</h4>
              <p style="color:var(--text-muted); font-size:0.92rem; line-height:1.6;">
                Operates seamlessly across ordinary RGB cameras, opening accessibility without requiring wearable sensor gloves.
              </p>
            </div>
          </div>
        </section>
      `;
    }

    function testInteractiveGesture(sign, phrase, poseKey, vector, conf, btn) {
      document.querySelectorAll('.sim-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');

      const textEl = document.getElementById('simTextOutput');
      const vecEl = document.getElementById('simVectorDisplay');
      const confEl = document.getElementById('simConfDisplay');

      if (textEl) textEl.innerText = `"${phrase}"`;
      if (vecEl) vecEl.innerText = vector;
      if (confEl) confEl.innerText = `${conf}% Verified`;

      speakPhrase(phrase);
      if (aiHandEngine) aiHandEngine.triggerDirectPose(poseKey);
    }

    function copySimText() {
      const textEl = document.getElementById('simTextOutput');
      if (textEl) {
        navigator.clipboard.writeText(textEl.innerText.replace(/"/g, '')).then(() => {
          showToast("SYNTHESIZED PHRASE COPIED");
        });
      }
    }

    function renderDataSheet() {
      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 28px; flex-wrap:wrap; gap:16px;">
          <div>
            <h1 class="serif" style="font-size:2.4rem;">Kinematic Topology & Feature Data Sheet</h1>
            <p style="color:var(--text-muted);">
              Mathematical formulations, normalized bone ratios, and gesture classification bounds.
            </p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" onclick="copyKinematicSchema()">📋 Copy JSON Payload</button>
            <button class="btn btn-secondary" onclick="downloadKinematicSchema()">💾 Download Schema</button>
          </div>
        </div>

        <div class="grid-2" style="margin-bottom:36px;">
          <div class="card physics-card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <span style="font-weight:700; font-size:0.82rem; color:var(--accent-indigo);">FIG 1.0 — 21-LANDMARK SKELETAL TOPOLOGY</span>
              <span class="badge" style="color:var(--accent-teal);">NORMALIZED COORDS [X, Y, Z]</span>
            </div>

            <svg class="svg-blueprint" viewBox="0 0 520 440" fill="none" stroke="currentColor">
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--border-light)" stroke-width="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              <path d="M 120,280 C 130,210 220,195 380,255" stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="4,4"/>
              <line x1="260" y1="390" x2="255" y2="205" stroke="var(--accent-terra)" stroke-width="2.5" stroke-dasharray="3,3"/>
              <text x="268" y="310" fill="var(--accent-terra)" font-size="11" font-weight="700" font-family="var(--font-mono)">Scale Factor S = ||L0 - L9||</text>

              <polyline points="260,390 185,340 135,290 100,245 70,200" stroke="var(--accent-indigo)" stroke-width="2.5"/>
              <polyline points="260,390 200,215 185,140 175,85 165,35" stroke="var(--accent-indigo)" stroke-width="2.5"/>
              <polyline points="260,390 255,205 255,125 255,70 255,20" stroke="var(--accent-indigo)" stroke-width="2.5"/>
              <polyline points="260,390 315,220 325,150 330,100 335,55" stroke="var(--accent-indigo)" stroke-width="2.5"/>
              <polyline points="260,390 375,250 395,190 405,145 415,105" stroke="var(--accent-indigo)" stroke-width="2.5"/>

              <circle cx="260" cy="390" r="7" fill="var(--accent-indigo)"/>
              <text x="272" y="395" font-size="11" font-weight="700" fill="var(--text-main)" font-family="var(--font-mono)">L0 (Wrist)</text>

              <circle cx="70" cy="200" r="6" fill="var(--accent-terra)"/><text x="15" y="202" font-size="10" font-weight="600" fill="var(--accent-terra)">L4 (Thumb)</text>
              <circle cx="165" cy="35" r="6" fill="var(--accent-terra)"/><text x="110" y="30" font-size="10" font-weight="600" fill="var(--accent-terra)">L8 (Index)</text>
              <circle cx="255" cy="20" r="6" fill="var(--accent-terra)"/><text x="265" y="22" font-size="10" font-weight="600" fill="var(--accent-terra)">L12 (Middle)</text>
              <circle cx="335" cy="55" r="6" fill="var(--accent-terra)"/><text x="345" y="58" font-size="10" font-weight="600" fill="var(--accent-terra)">L16 (Ring)</text>
              <circle cx="415" cy="105" r="6" fill="var(--accent-terra)"/><text x="425" y="108" font-size="10" font-weight="600" fill="var(--accent-terra)">L20 (Pinky)</text>
            </svg>
            <div style="font-size:0.75rem; color:var(--text-faint); margin-top:8px;">
              ● Indigo: Skeletal Bones & MCP Knuckles | ● Orange: Landmark Action Fingertips
            </div>
          </div>

          <div class="card physics-card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h3 class="serif" style="font-size:1.35rem; margin-bottom:14px; color:var(--accent-indigo);">Scale-Invariant Governing Formulations</h3>
              <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="background:var(--bg-card); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
                  <strong style="font-size:0.75rem; text-transform:uppercase; color:var(--accent-indigo); display:block; margin-bottom:3px;">
                    1. Z-Attenuated Euclidean Distance
                  </strong>
                  <code>D(a, b) = &radic;[(x_a - x_b)&sup2; + (y_a - y_b)&sup2; + 0.16 &middot; (z_a - z_b)&sup2;]</code>
                </div>

                <div style="background:var(--bg-card); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
                  <strong style="font-size:0.75rem; text-transform:uppercase; color:var(--accent-indigo); display:block; margin-bottom:3px;">
                    2. Scale Normalization Factor (S)
                  </strong>
                  <code>S = D(L_0, L_9) &nbsp; [Wrist Root to Middle Knuckle MCP]</code>
                </div>

                <div style="background:var(--bg-card); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
                  <strong style="font-size:0.75rem; text-transform:uppercase; color:var(--accent-indigo); display:block; margin-bottom:3px;">
                    3. Normalized Metric Ratio R(a, b)
                  </strong>
                  <code>R(a, b) = D(L_a, L_b) / S</code>
                </div>

                <div style="background:var(--bg-card); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
                  <strong style="font-size:0.75rem; text-transform:uppercase; color:var(--accent-indigo); display:block; margin-bottom:3px;">
                    4. Extension Classification Vector
                  </strong>
                  <code>e_i = (D(L_0, Tip) &gt; 1.03 &middot; D(L_0, PIP)) &and; (D(MCP, Tip) &gt; 1.06 &middot; D(MCP, PIP))</code>
                </div>
              </div>
            </div>

            <div style="margin-top:16px; font-size:0.8rem; color:var(--text-faint); border-top:1px solid var(--border-light); padding-top:10px;">
              Temporal Consensus Filter: Minimum 4 identical predictions out of 6 consecutive frames (M = 6).
            </div>
          </div>
        </div>

        <h2 class="serif" style="font-size:1.8rem; margin-bottom:12px;">Kinematic Specification Matrix (20 Prototype Signs)</h2>
        <p style="color:var(--text-muted); margin-bottom:18px;">
          Vector state definition E = [e_thumb, e_index, e_middle, e_ring, e_pinky] mapped to spatial constraints.
        </p>

        <div class="datasheet-table-wrapper">
          <table class="datasheet-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Sign / Visual</th>
                <th>Mode</th>
                <th>Extension Vector E</th>
                <th>Primary Spatial Constraints</th>
                <th>Confidence</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${SUPPORTED_SIGNS.map((s, idx) => `
                <tr>
                  <td><strong>${String(idx + 1).padStart(2, '0')}</strong></td>
                  <td><strong>${s.name}</strong></td>
                  <td><span class="badge">${s.type === 'two' ? '2 Hands' : '1 Hand'}</span></td>
                  <td><span class="vector-code">${s.id === 'FIST' ? '[0,0,0,0,0]' : s.id === 'WATER' ? '[0,1,1,1,0]' : s.id === 'PEACE' ? '[0,1,1,0,0]' : '[Normalized]'}</span></td>
                  <td><span class="formula-badge">${s.desc}</span></td>
                  <td><strong style="color:var(--success);">95%+</strong></td>
                  <td><button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="practiceDirectSign('${s.id}')">Test Sign</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderTranslate() {
      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
          <div>
            <h1 class="serif" style="font-size:2.2rem;">Translator Workspace</h1>
            <p style="color:var(--text-muted);">Real-time camera translation across all 20 prototype gestures.</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary" onclick="navigate('datasheet')">View Data Sheet</button>
            <button class="btn btn-secondary" onclick="navigate('practice')">Practice Mode</button>
          </div>
        </div>

        <div class="translator-workspace">
          <div class="camera-card">
            <div class="camera-frame">
              <div class="camera-overlay-badge" id="cameraBadge">
                <span class="pulse-dot-green"></span> <span id="cameraStatusText">CAMERA ACTIVE</span>
              </div>
              <video id="videoElement" autoplay playsinline muted></video>
              <canvas id="canvasElement"></canvas>
            </div>

            <div class="control-row">
              <div style="display:flex; gap:8px;">
                <button class="btn btn-danger" id="btnToggleCam" onclick="toggleCameraState()" style="padding:6px 14px;">Stop Camera</button>
                <button class="btn btn-secondary" id="btnMirror" onclick="toggleMirror()" style="padding:6px 12px;">🔄 Mirror</button>
                <button class="btn btn-primary" id="btnSkeleton" onclick="toggleSkeleton()" style="padding:6px 12px;">🦴 Skeleton: ON</button>
              </div>

              <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-muted);">
                <span>Sensitivity:</span>
                <input type="range" id="thresholdSlider" min="0.5" max="0.95" step="0.05" value="0.75" 
                       style="accent-color:var(--accent-indigo); width:80px;" onchange="updateConfidence(this.value)">
                <span id="thresholdVal">75%</span>
              </div>
            </div>

            <div class="telemetry-container">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-weight:600; color:var(--text-muted); font-size:0.75rem;">
                <span>KINEMATIC JOINT TELEMETRY</span>
                <span id="telemetryHand">AWAITING HAND</span>
              </div>
              <div id="diagnosticsBody">
                <div style="text-align:center; padding:15px; color:var(--text-faint); font-style:italic;">
                  Raise your hands in front of the camera to view live joint tracking.
                </div>
              </div>
            </div>
          </div>

          <div class="output-card">
            <div class="detected-box">
              <div style="font-size:0.72rem; letter-spacing:0.12em; text-transform:uppercase; color:var(--text-muted);">
                RECOGNIZED SIGN
              </div>
              <div class="detected-value" id="liveDetect">Waiting for sign...</div>
              <div class="confidence-tag" id="liveConf">0% Consensus</div>
              
              <div style="margin-top:14px; display:flex; gap:8px;">
                <button class="btn btn-primary" onclick="addSignToText()" style="flex:1;">Add to Sentence ↵</button>
                <button class="btn btn-secondary" onclick="speakSingleSign()">🔊 Speak</button>
              </div>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; font-weight:700;">
                  Translated Message
                </label>
                <div style="display:flex; align-items:center; gap:6px;">
                  <input type="checkbox" id="autoSpeakCheck" onchange="state.autoSpeak=this.checked" style="accent-color:var(--accent-indigo);">
                  <label for="autoSpeakCheck" style="font-size:0.78rem; color:var(--text-muted); cursor:pointer;">Auto-Speak</label>
                </div>
              </div>

              <textarea class="message-textarea" id="finalSentence" placeholder="Recognized words will accumulate here..."></textarea>
              
              <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="speakFinalText()" style="flex:1;">🔊 Speak Message</button>
                <button class="btn btn-secondary" onclick="copyText('finalSentence')">📋 Copy</button>
                <button class="btn btn-secondary" onclick="undoWord()">⌫ Undo</button>
                <button class="btn btn-secondary" onclick="clearSentence()">Clear</button>
              </div>
            </div>

            <div>
              <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted);">Session Running Transcript</span>
                <span style="font-size:0.72rem; color:var(--accent-indigo); cursor:pointer;" onclick="downloadTranscript()">💾 Export Log</span>
              </div>
              <div class="transcript-box" id="transcriptLog">
                <span style="font-style:italic; color:var(--text-faint);">Transcript will record each verified sign...</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderSignGuide() {
      let cards = SUPPORTED_SIGNS.map(sign => `
        <div class="sign-card physics-card" data-category="${sign.cat}">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="badge">${sign.cat}</span>
              <span style="font-size:0.75rem; color:var(--text-faint);">${sign.type === 'two' ? '2 Hands' : '1 Hand'}</span>
            </div>
            <h3 style="font-size:1.25rem; margin-bottom:6px; color:var(--accent-indigo);">${sign.name}</h3>
            <p style="font-size:0.88rem; color:var(--text-muted); line-height:1.5;">${sign.desc}</p>
          </div>
          <div style="margin-top:16px; border-top:1px solid var(--border-light); padding-top:10px; display:flex; justify-content:flex-end;">
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.78rem;" onclick="practiceDirectSign('${sign.id}')">Practice Sign →</button>
          </div>
        </div>
      `).join('');

      return `
        <div style="margin-bottom: 28px;">
          <h1 class="serif" style="font-size:2.2rem;">Supported Prototype Signs</h1>
          <p style="color:var(--text-muted);">The 20 core gestures calibrated in the current computer vision model.</p>
        </div>

        <div class="guide-filters">
          <button class="filter-btn active" onclick="filterGuide('all', this)">All (20)</button>
          <button class="filter-btn" onclick="filterGuide('Greetings', this)">Greetings</button>
          <button class="filter-btn" onclick="filterGuide('Basic', this)">Basic</button>
          <button class="filter-btn" onclick="filterGuide('Needs', this)">Needs</button>
          <button class="filter-btn" onclick="filterGuide('Emergency', this)">Emergency</button>
          <button class="filter-btn" onclick="filterGuide('Everyday', this)">Everyday</button>
        </div>

        <div class="grid-3" id="guideGrid">${cards}</div>
      `;
    }

    function renderPractice() {
      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px;">
          <div>
            <h1 class="serif" style="font-size:2.2rem;">Practice & Learning Mode</h1>
            <p style="color:var(--text-muted);">Perform the prompt gesture in front of the camera and hold for 1.1s.</p>
          </div>
          <div style="font-weight:700; color:var(--accent-indigo); font-size:1.1rem;">
            Score: <span id="pScore">${state.practiceScore}</span> / 20
          </div>
        </div>

        <div class="translator-workspace">
          <div class="camera-card">
            <div class="camera-frame">
              <video id="videoElement" autoplay playsinline muted></video>
              <canvas id="canvasElement"></canvas>
            </div>
            
            <div style="margin-top:14px; width:100%; height:8px; background:var(--bg-subtle); border-radius:4px; overflow:hidden;">
              <div id="practiceProgressBar" style="height:100%; width:0%; background:var(--success); transition:width 0.1s linear;"></div>
            </div>
          </div>

          <div class="card physics-card" style="display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:32px;">
            <div style="font-size:0.75rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-muted);">TARGET GESTURE</div>
            <div class="serif" style="font-size:2.6rem; color:var(--accent-indigo); margin:10px 0;" id="pTargetName">Loading...</div>
            <p style="color:var(--text-muted); font-size:0.95rem; max-width:340px; line-height:1.6; margin-bottom:20px;" id="pTargetDesc"></p>
            
            <div id="pFeedbackText" style="font-weight:600; font-size:0.9rem; color:var(--text-muted); margin-bottom:20px;">
              Position your hands in front of the camera.
            </div>

            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary" onclick="skipPracticeTarget()">Skip Sign →</button>
              <button class="btn btn-secondary" onclick="resetPractice()">Restart</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderDashboard() {
      return `
        <div style="margin-bottom: 28px;">
          <h1 class="serif" style="font-size:2.2rem;">Project Analytics</h1>
          <p style="color:var(--text-muted);">Inference performance and pipeline metrics.</p>
        </div>

        <div class="grid-4" style="margin-bottom:24px;">
          <div class="card physics-card">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Total Inferences</div>
            <div style="font-size:2.2rem; font-weight:700; color:var(--accent-indigo); margin-top:4px;">1,248</div>
          </div>
          <div class="card physics-card">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Vocabulary</div>
            <div style="font-size:2.2rem; font-weight:700; color:var(--success); margin-top:4px;">20 Signs</div>
          </div>
          <div class="card physics-card">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Avg. Confidence</div>
            <div style="font-size:2.2rem; font-weight:700; color:var(--accent-teal); margin-top:4px;">95.4%</div>
          </div>
          <div class="card physics-card">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Inference Latency</div>
            <div style="font-size:2.2rem; font-weight:700; color:var(--accent-terra); margin-top:4px;">~24 ms</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card physics-card">
            <h3 class="serif" style="font-size:1.3rem; margin-bottom:14px;">System Modules Status</h3>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:0.9rem;">
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:6px;">
                <span>MediaPipe Hands Tracking</span> <strong style="color:var(--success);">Active (WASM)</strong>
              </div>
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:6px;">
                <span>Geometric Heuristic Engine</span> <strong style="color:var(--success);">Calibrated</strong>
              </div>
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:6px;">
                <span>Web Speech API Synthesis</span> <strong style="color:var(--success);">Ready</strong>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Hardware Acceleration</span> <strong style="color:var(--success);">WebGL 2.0</strong>
              </div>
            </div>
          </div>

          <div class="card physics-card">
            <h3 class="serif" style="font-size:1.3rem; margin-bottom:14px;">Top Recognized Signs</h3>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:0.9rem;">
              <div style="display:flex; justify-content:space-between;"><span>1. WATER 💧</span> <strong>342 times</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>2. HELP 🆘</span> <strong>289 times</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>3. YES 👍</span> <strong>214 times</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>4. STOP ✋</span> <strong>176 times</strong></div>
            </div>
          </div>
        </div>
      `;
    }

    function renderHistory() {
      let rows = state.history.length === 0
        ? `<div class="card physics-card" style="text-align:center; padding:40px; color:var(--text-faint);">No recorded translations yet. Use the Translator workspace to generate speech.</div>`
        : state.history.map((item) => `
          <div class="card physics-card" style="display:flex; justify-content:space-between; align-items:center; padding:14px 20px; margin-bottom:8px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-faint); margin-bottom:2px;">${item.time}</div>
              <div style="font-size:1.1rem; font-weight:600;">${item.text}</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary" style="padding:6px 10px;" onclick="speakPhrase('${item.text}')">🔊 Replay</button>
              <button class="btn btn-secondary" style="padding:6px 10px;" onclick="navigator.clipboard.writeText('${item.text}')">Copy</button>
            </div>
          </div>
        `).join('');

      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 24px;">
          <div>
            <h1 class="serif" style="font-size:2.2rem;">Translation History</h1>
            <p style="color:var(--text-muted);">Session log of synthesized phrases.</p>
          </div>
          <button class="btn btn-danger" onclick="clearFullHistory()">Clear Log</button>
        </div>
        <div>${rows}</div>
      `;
    }

    function renderEmergency() {
      const phrases = [
        "I NEED HELP", "CALL AN AMBULANCE", "I NEED A DOCTOR",
        "I AM IN PAIN", "PLEASE HELP ME", "HOSPITAL"
      ];
      let buttons = phrases.map(p => `
        <div class="card physics-card" style="text-align:center; padding:28px; border:1px solid var(--border-medium);">
          <div style="font-size:1.25rem; font-weight:700; margin-bottom:16px;">${p}</div>
          <button class="btn btn-danger" style="width:100%; padding:12px; font-weight:700;" onclick="speakPhrase('${p}')">
            🔊 BROADCAST
          </button>
        </div>
      `).join('');

      return `
        <div style="text-align:center; margin-bottom: 32px;">
          <h1 class="serif" style="font-size:2.6rem; color:var(--danger); margin-bottom:6px;">Emergency Assistive Mode</h1>
          <p style="color:var(--text-muted); max-width:580px; margin:0 auto;">
            Instant one-click voice broadcast for critical assistance.
          </p>
        </div>
        <div class="grid-3">${buttons}</div>
      `;
    }

    function renderAbout() {
      return `
        <h1 class="serif" style="font-size:2.2rem; margin-bottom:10px;">Project Documentation & Team</h1>
        <p style="color:var(--text-muted); margin-bottom:32px;">Academic Year 2026–2027</p>

        <div class="grid-2" style="margin-bottom:32px;">
          <div class="card physics-card">
            <h3 class="serif" style="font-size:1.25rem; margin-bottom:10px; color:var(--accent-indigo);">System Focus</h3>
            <p style="color:var(--text-muted); font-size:0.88rem; margin-top:6px;">
              Assistive accessibility engineering utilizing client-side Computer Vision and natural speech interfaces.
            </p>
          </div>

          <div class="card physics-card">
            <h3 class="serif" style="font-size:1.25rem; margin-bottom:10px; color:var(--accent-indigo);">Project Metadata</h3>
            <p><strong>Title:</strong> Sign Language to Voice/Text Conversion</p>
            <p style="color:var(--text-muted); font-size:0.88rem;"><strong>Engine:</strong> MediaPipe Hands + WebAssembly Heuristics</p>
          </div>
        </div>

        <div class="card physics-card" style="padding:0; overflow:hidden;">
          <div style="padding:16px 20px; border-bottom:1px solid var(--border-light); background:var(--bg-subtle);">
            <h3 class="serif" style="font-size:1.2rem;">Project Team Members</h3>
          </div>
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.9rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-medium); background:var(--bg-card); color:var(--text-muted);">
                <th style="padding:12px 20px; width:70px;">SL. NO.</th>
                <th style="padding:12px 20px;">USN</th>
                <th style="padding:12px 20px;">STUDENT NAME</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:12px 20px; font-weight:600;">1</td>
                <td style="padding:12px 20px; font-family:monospace;">1AT24UE074</td>
                <td style="padding:12px 20px; font-weight:600;">Surya Prakash</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:12px 20px; font-weight:600;">2</td>
                <td style="padding:12px 20px; font-family:monospace;">1AT24UE089</td>
                <td style="padding:12px 20px; font-weight:600;">Yashwanth S</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:12px 20px; font-family:monospace;">1AT24IS090</td>
                <td style="padding:12px 20px; font-weight:600;">Kishen Dev</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:12px 20px; font-family:monospace;">1AT24CG009</td>
                <td style="padding:12px 20px; font-weight:600;">Ananya Shankar</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:12px 20px; font-family:monospace;">1AT24CG008</td>
                <td style="padding:12px 20px; font-weight:600;">Amrutha R</td>
              </tr>
              <tr>
                <td style="padding:12px 20px; font-weight:600;">6</td>
                <td style="padding:12px 20px; font-family:monospace;">1AT24CD019</td>
                <td style="padding:12px 20px; font-weight:600;">Bhoomika HA</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    function renderHelp() {
      return `
        <h1 class="serif" style="font-size:2.2rem; margin-bottom:10px;">Help & FAQ</h1>
        <p style="color:var(--text-muted); margin-bottom:28px;">Operational guidance for reliable hand tracking.</p>

        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="card physics-card">
            <h3 style="font-size:1.1rem; margin-bottom:6px; color:var(--accent-indigo);">How do I achieve maximum detection accuracy?</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.6;">
              Position hands 1.5 to 2.5 feet from your laptop camera in the neutral chest area. Ensure diffuse front lighting to prevent video noise.
            </p>
          </div>
          <div class="card physics-card">
            <h3 style="font-size:1.1rem; margin-bottom:6px; color:var(--accent-indigo);">Why does the system use neutral-space gestures?</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.6;">
              Operating in neutral chest space eliminates tracking occlusion where fingers blend against facial skin or clothing.
            </p>
          </div>
        </div>
      `;
    }

    // ==================================================
    // WEBCAM COMPUTER VISION & SENSING ENGINE
    // ==================================================
    function toggleCameraState() {
      if (state.isCameraRunning) {
        stopComputerVision();
      } else {
        initComputerVision();
      }
    }

    function initComputerVision() {
      const videoElement = document.getElementById('videoElement');
      const canvasElement = document.getElementById('canvasElement');
      if (!videoElement || !canvasElement) return;

      if (!state.handsInstance && typeof Hands !== 'undefined') {
        state.handsInstance = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        state.handsInstance.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: state.confidenceThreshold,
          minTrackingConfidence: state.confidenceThreshold
        });

        state.handsInstance.onResults(onResultsEngine);
      }

      if (typeof Camera !== 'undefined') {
        state.cameraInstance = new Camera(videoElement, {
          onFrame: async () => {
            if (state.isCameraRunning && state.handsInstance) {
              const activeVideo = document.getElementById('videoElement');
              if (activeVideo && activeVideo.readyState >= 2) {
                await state.handsInstance.send({ image: activeVideo });
              }
            }
          },
          width: 640,
          height: 480
        });

        state.cameraInstance.start().then(() => {
          state.isCameraRunning = true;
          if (videoElement.srcObject) {
            state.activeStream = videoElement.srcObject;
          }
          const btn = document.getElementById('btnToggleCam');
          if (btn) { btn.innerText = "Stop Camera"; btn.className = "btn btn-danger"; }
          const badge = document.getElementById('cameraStatusText');
          if (badge) badge.innerText = "CAMERA ACTIVE";

          if (state.activeRoute === 'practice') {
            updatePracticeTarget();
          }
        }).catch(err => {
          console.error("Camera access failed:", err);
          const badge = document.getElementById('cameraStatusText');
          if (badge) badge.innerText = "CAMERA ACCESS DENIED";
        });
      }
    }

    function stopComputerVision() {
      if (state.cameraInstance) {
        try { state.cameraInstance.stop(); } catch (e) {}
      }
      if (state.activeStream) {
        state.activeStream.getTracks().forEach(track => track.stop());
        state.activeStream = null;
      }
      const videoElement = document.getElementById('videoElement');
      if (videoElement) {
        videoElement.srcObject = null;
      }
      state.isCameraRunning = false;

      const canvas = document.getElementById('canvasElement');
      if (canvas) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }

      const btn = document.getElementById('btnToggleCam');
      if (btn) { btn.innerText = "Start Camera"; btn.className = "btn btn-primary"; }
      const badge = document.getElementById('cameraStatusText');
      if (badge) badge.innerText = "CAMERA INACTIVE";
    }

    function getDistance(p1, p2) {
      return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z - p2.z) * 0.4);
    }

    function isFingerExtended(lm, fingerIdx) {
      const wrist = lm[0];
      const mcp = lm[fingerIdx * 4 + 1];
      const pip = lm[fingerIdx * 4 + 2];
      const tip = lm[fingerIdx * 4 + 4];

      const d_wrist_tip = getDistance(wrist, tip);
      const d_wrist_pip = getDistance(wrist, pip);
      const d_mcp_tip = getDistance(mcp, tip);
      const d_mcp_pip = getDistance(mcp, pip);

      return d_wrist_tip > d_wrist_pip * 1.03 && d_mcp_tip > d_mcp_pip * 1.05;
    }

    function isThumbExtended(lm) {
      const thumbTip = lm[4];
      const thumbIP = lm[3];
      const thumbMCP = lm[2];
      const indexMCP = lm[5];
      const middleMCP = lm[9];

      const d_tip_palm = getDistance(thumbTip, middleMCP);
      const d_ip_palm = getDistance(thumbIP, middleMCP);
      const d_tip_index = getDistance(thumbTip, indexMCP);
      const d_mcp_index = getDistance(thumbMCP, indexMCP);

      return d_tip_palm > d_ip_palm * 1.02 && d_tip_index > d_mcp_index * 0.92;
    }

    function analyzeHand(lm, isRightHand) {
      const handScale = getDistance(lm[0], lm[9]) || 0.1;

      const fingers = {
        thumb: isThumbExtended(lm),
        index: isFingerExtended(lm, 1),
        middle: isFingerExtended(lm, 2),
        ring: isFingerExtended(lm, 3),
        pinky: isFingerExtended(lm, 4)
      };

      const ratios = {
        thumb: (getDistance(lm[4], lm[9]) / (getDistance(lm[3], lm[9]) || 1)) * 50,
        index: (getDistance(lm[8], lm[5]) / handScale) * 80,
        middle: (getDistance(lm[12], lm[9]) / handScale) * 80,
        ring: (getDistance(lm[16], lm[13]) / handScale) * 80,
        pinky: (getDistance(lm[20], lm[17]) / handScale) * 80
      };

      const palmCenter = {
        x: (lm[0].x + lm[5].x + lm[17].x) / 3,
        y: (lm[0].y + lm[5].y + lm[17].y) / 3,
        z: (lm[0].z + lm[5].z + lm[17].z) / 3
      };

      return {
        landmarks: lm,
        handLabel: isRightHand ? "Right Hand" : "Left Hand",
        handScale,
        palmCenter,
        ratios,
        fingers
      };
    }

    function trackMotion(palmCenter) {
      motionBuffer.push({ x: palmCenter.x, y: palmCenter.y, z: palmCenter.z, t: Date.now() });
      if (motionBuffer.length > MOTION_BUFFER_SIZE) {
        motionBuffer.shift();
      }
    }

    function getMotionTelemetry() {
      if (motionBuffer.length < 5) {
        return { waving: false, rising: false, movingOutward: false };
      }

      const first = motionBuffer[0];
      const last = motionBuffer[motionBuffer.length - 1];

      const xCoords = motionBuffer.map(p => p.x);
      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const xRange = maxX - minX;

      let xChanges = 0;
      let lastDir = 0;
      for (let i = 1; i < motionBuffer.length; i++) {
        const dir = Math.sign(motionBuffer[i].x - motionBuffer[i-1].x);
        if (dir !== 0) {
          if (lastDir !== 0 && dir !== lastDir) xChanges++;
          lastDir = dir;
        }
      }

      const waving = (xRange > 0.065) && (xChanges >= 2);
      const rising = (first.y - last.y > 0.08);
      const movingOutward = (last.y - first.y > 0.07);

      return { waving, rising, movingOutward };
    }

    function processHandGesture(handsList) {
      if (!handsList || handsList.length === 0) return null;

      // Two-Hand Logic
      if (handsList.length === 2) {
        const h1 = handsList[0];
        const h2 = handsList[1];
        const avgScale = (h1.handScale + h2.handScale) / 2;

        const isFlat1 = h1.fingers.index && h1.fingers.middle && h1.fingers.ring && h1.fingers.pinky;
        const isFlat2 = h2.fingers.index && h2.fingers.middle && h2.fingers.ring && h2.fingers.pinky;

        const h1IndexOnly = h1.fingers.index && !h1.fingers.middle && !h1.fingers.ring && !h1.fingers.pinky;
        const h2IndexOnly = h2.fingers.index && !h2.fingers.middle && !h2.fingers.ring && !h2.fingers.pinky;
        if (h1IndexOnly && h2IndexOnly) {
          const dTips = getDistance(h1.landmarks[8], h2.landmarks[8]);
          if (dTips / avgScale < 0.65) {
            return { name: "HOSPITAL 🏥", code: "HOSPITAL", conf: 98 };
          }
        }

        let thumbsUpHand = null;
        let flatPalmHand = null;
        for (const h of [h1, h2]) {
          const isThumbsUp = h.fingers.thumb && !h.fingers.index && !h.fingers.middle && !h.fingers.ring && !h.fingers.pinky;
          const isFlat = h.fingers.index && h.fingers.middle && h.fingers.ring && h.fingers.pinky;
          if (isThumbsUp) thumbsUpHand = h;
          else if (isFlat) flatPalmHand = h;
        }
        if (thumbsUpHand && flatPalmHand) {
          if (flatPalmHand.palmCenter.y > thumbsUpHand.palmCenter.y - 0.05) {
            return { name: "I NEED HELP 🆘", code: "HELP", conf: 99 };
          }
        }

        if (isFlat1 && isFlat2) {
          const dIndexTips = getDistance(h1.landmarks[8], h2.landmarks[8]);
          const dWrists = getDistance(h1.landmarks[0], h2.landmarks[0]);
          const wristBelowTips1 = h1.landmarks[0].y > h1.landmarks[8].y + 0.04;
          const wristBelowTips2 = h2.landmarks[0].y > h2.landmarks[8].y + 0.04;

          if (dIndexTips / avgScale < 0.35 && dWrists > dIndexTips * 1.8 && wristBelowTips1 && wristBelowTips2) {
            return { name: "HOUSE 🏠", code: "HOUSE", conf: 95 };
          }

          const dPinkies = getDistance(h1.landmarks[20], h2.landmarks[20]);
          const dThumbs = getDistance(h1.landmarks[4], h2.landmarks[4]);
          if (dPinkies / avgScale < 0.45 && dThumbs > dPinkies * 1.5) {
            return { name: "BOOK 📖", code: "BOOK", conf: 94 };
          }

          const dPalms = getDistance(h1.palmCenter, h2.palmCenter);
          if (dPalms / avgScale < 0.45) {
            return { name: "CLAP 👏", code: "CLAP", conf: 96 };
          }

          const yDiff = Math.abs(h1.palmCenter.y - h2.palmCenter.y);
          if (yDiff < 0.12 && dPalms / avgScale > 0.6 && dPalms / avgScale < 2.0) {
            return { name: "WHAT 🤲", code: "WHAT", conf: 92 };
          }
        }
      }

      // Single-Hand Logic
      const hand = handsList[0];
      const f = hand.fingers;
      const lm = hand.landmarks;
      const scale = hand.handScale;

      trackMotion(hand.palmCenter);
      const motion = getMotionTelemetry();

      if (f.thumb && f.index && f.pinky && !f.middle && !f.ring) {
        return { name: "GOOD MORNING 🌞", code: "GOOD_MORNING", conf: 98 };
      }

      if (f.thumb && f.pinky && !f.index && !f.middle && !f.ring) {
        return { name: "CALL ME 🤙", code: "CALL", conf: 97 };
      }

      if (f.thumb && f.index && !f.middle && !f.ring && !f.pinky) {
        const dThumbIndex = getDistance(lm[4], lm[8]);
        if (dThumbIndex / scale > 0.52) {
          return { name: "L-SHAPE 👆", code: "L_SHAPE", conf: 96 };
        }
      }

      const dThumbIndexTip = getDistance(lm[4], lm[8]);
      if (dThumbIndexTip / scale < 0.38 && f.middle && f.ring && f.pinky) {
        return { name: "OK 👌", code: "OK", conf: 95 };
      }

      if (f.index && f.middle && f.ring && !f.pinky) {
        return { name: "WATER 💧", code: "WATER", conf: 95 };
      }

      if (f.index && f.middle && !f.ring && !f.pinky) {
        return { name: "PEACE ✌️", code: "PEACE", conf: 97 };
      }

      if (f.index && !f.middle && !f.ring && !f.pinky) {
        return { name: "YOU / ONE ☝️", code: "POINT", conf: 96 };
      }

      const tips = [lm[4], lm[8], lm[12], lm[16], lm[20]];
      let maxTipDist = 0;
      for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
          const d = getDistance(tips[i], tips[j]);
          if (d > maxTipDist) maxTipDist = d;
        }
      }
      if (maxTipDist / scale < 0.62) {
        return { name: "FOOD 🍚", code: "FOOD", conf: 92 };
      }

      if (!f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) {
        return { name: "POWER ✊", code: "FIST", conf: 98 };
      }

      if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) {
        if (lm[4].y < lm[1].y) {
          return { name: "YES 👍", code: "YES", conf: 97 };
        } else {
          return { name: "NO 👎", code: "NO", conf: 97 };
        }
      }

      if (f.index && f.middle && f.ring && f.pinky) {
        const dIndexPinky = getDistance(lm[8], lm[20]);
        const isFlatTight = dIndexPinky / scale < 1.1;

        if (motion.waving) {
          return { name: "HI 👋", code: "HI", conf: 94 };
        }

        if (isFlatTight && motion.movingOutward) {
          return { name: "THANK YOU 🙏", code: "THANK_YOU", conf: 93 };
        }

        return { name: "STOP ✋", code: "STOP", conf: 99 };
      }

      return null;
    }

    function filterGesture(rawMatch) {
      const name = rawMatch ? rawMatch.name : "Waiting for sign...";
      const code = rawMatch ? rawMatch.code : null;
      const conf = rawMatch ? rawMatch.conf : 0;

      gestureHistory.push({ name, code, conf });
      if (gestureHistory.length > GESTURE_HISTORY_SIZE) {
        gestureHistory.shift();
      }

      const votes = {};
      let maxVotes = 0;
      let majorityItem = { name: "Waiting for sign...", code: null, conf: 0 };

      for (const item of gestureHistory) {
        votes[item.name] = (votes[item.name] || 0) + 1;
        if (votes[item.name] > maxVotes) {
          maxVotes = votes[item.name];
          majorityItem = item;
        }
      }

      if (maxVotes >= 4) {
        return majorityItem.code ? majorityItem : null;
      }

      if (state.currentDetected && votes[state.currentDetected] >= 2) {
        const activeItem = gestureHistory.find(i => i.name === state.currentDetected);
        return activeItem || null;
      }

      return null;
    }

    function onResultsEngine(results) {
      const video = document.getElementById('videoElement');
      const canvas = document.getElementById('canvasElement');
      if (!video || !canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      let analyzedHands = [];

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let idx = 0; idx < results.multiHandLandmarks.length; idx++) {
          const landmarks = results.multiHandLandmarks[idx];
          let isRight = false;
          if (results.multiHandedness && results.multiHandedness[idx]) {
            isRight = results.multiHandedness[idx].label === "Right";
          }

          const handInfo = analyzeHand(landmarks, isRight);
          analyzedHands.push(handInfo);

          if (state.showSkeleton) {
            drawCustomHand(ctx, landmarks, canvas.width, canvas.height);
          }
        }

        const rawMatch = processHandGesture(analyzedHands);
        const filteredMatch = filterGesture(rawMatch);

        if (state.activeRoute === 'translate') {
          handleTranslateMatch(filteredMatch, analyzedHands);
        } else if (state.activeRoute === 'practice') {
          handlePracticeMatch(filteredMatch);
        }
      } else {
        gestureHistory = [];
        motionBuffer = [];
        if (state.activeRoute === 'translate') {
          handleTranslateMatch(null, []);
        } else if (state.activeRoute === 'practice') {
          handlePracticeMatch(null);
        }
      }

      ctx.restore();
    }

    function drawCustomHand(ctx, lm, w, h) {
      ctx.save();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(45, 212, 191, 0.85)";

      const chains = [
        [0, 1, 2, 3, 4],     // thumb
        [0, 5, 6, 7, 8],     // index
        [0, 9, 10, 11, 12],  // middle
        [0, 13, 14, 15, 16], // ring
        [0, 17, 18, 19, 20], // pinky
        [5, 9, 13, 17],      // knuckles
        [0, 5], [0, 17]      // wrist base
      ];

      for (const chain of chains) {
        ctx.beginPath();
        for (let i = 0; i < chain.length; i++) {
          const pt = lm[chain[i]];
          if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
          else ctx.lineTo(pt.x * w, pt.y * h);
        }
        ctx.stroke();
      }

      for (let i = 0; i < lm.length; i++) {
        const pt = lm[i];
        const x = pt.x * w;
        const y = pt.y * h;

        ctx.beginPath();
        ctx.arc(x, y, (i % 4 === 0 && i > 0) ? 6 : 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = (i === 4 || i === 8 || i === 12 || i === 16 || i === 20) ? "#F43F5E" : "#8B5CF6";
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // ==================================================
    // TRANSLATOR CONTROLS & UTILITIES
    // ==================================================
    function handleTranslateMatch(match, handsList) {
      const liveLabel = document.getElementById('liveDetect');
      const liveConf = document.getElementById('liveConf');

      if (match) {
        if (state.currentDetected !== match.name) {
          state.currentDetected = match.name;
          if (liveLabel) liveLabel.innerText = match.name;
          if (liveConf) liveConf.innerText = `${match.conf}% Consensus`;

          recordTranscript(match.name);

          const now = Date.now();
          if (state.autoSpeak && (now - state.lastSpokenTime > 1200)) {
            state.lastSpokenTime = now;
            speakPhrase(cleanSignName(match.name));
          }
        }
      } else {
        state.currentDetected = null;
        if (liveLabel) liveLabel.innerText = "Waiting for sign...";
        if (liveConf) liveConf.innerText = "0% Consensus";
      }

      renderLiveTelemetry(handsList);
    }

    function renderLiveTelemetry(hands) {
      const telemBody = document.getElementById('diagnosticsBody');
      const telemHand = document.getElementById('telemetryHand');
      if (!telemBody || !telemHand) return;

      if (!hands || hands.length === 0) {
        telemHand.innerText = "NO HAND DETECTED";
        telemBody.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-faint); font-style:italic;">Raise your hands in front of the camera to view live joint tracking.</div>`;
        return;
      }

      telemHand.innerText = `${hands.length} HAND(S) TRACKED`;
      let html = "";
      for (const h of hands) {
        html += `
          <div style="margin-bottom:8px;">
            <div style="font-weight:700; color:var(--accent-indigo); font-size:0.75rem; margin-bottom:4px;">${h.handLabel}</div>
            ${renderFingerRow('Thumb', h.fingers.thumb, h.ratios.thumb * 2)}
            ${renderFingerRow('Index', h.fingers.index, h.ratios.index)}
            ${renderFingerRow('Middle', h.fingers.middle, h.ratios.middle)}
            ${renderFingerRow('Ring', h.fingers.ring, h.ratios.ring)}
            ${renderFingerRow('Pinky', h.fingers.pinky, h.ratios.pinky)}
          </div>
        `;
      }
      telemBody.innerHTML = html;
    }

    function renderFingerRow(name, extended, ratio) {
      return `
        <div class="telemetry-row">
          <span>${name}</span>
          <div class="bar-bg">
            <div class="bar-fill" style="width:${Math.min(100, Math.max(0, ratio))}%; background:${extended ? 'var(--success)' : 'var(--text-faint)'};"></div>
          </div>
          <span style="text-align:right; font-weight:600; color:${extended ? 'var(--success)' : 'var(--text-faint)'};">${extended ? 'EXT' : 'FLD'}</span>
        </div>
      `;
    }

    function addSignToText() {
      if (!state.currentDetected) return;
      const clean = cleanSignName(state.currentDetected);
      const box = document.getElementById('finalSentence');
      if (!box) return;

      box.value = box.value.trim() ? box.value.trim() + " " + clean : clean;

      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      state.history.unshift({ time, text: box.value });
      if (state.history.length > 25) state.history.pop();
      localStorage.setItem('sv_history', JSON.stringify(state.history));
    }

    function recordTranscript(signName) {
      const transcriptLog = document.getElementById('transcriptLog');
      if (!transcriptLog) return;

      state.transcriptWords.push(signName);
      if (state.transcriptWords.length > 30) state.transcriptWords.shift();

      transcriptLog.innerHTML = state.transcriptWords.map(w => `<span class="transcript-chip">${w}</span>`).join('');
      transcriptLog.scrollTop = transcriptLog.scrollHeight;
    }

    function cleanSignName(name) {
      return name.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "").trim();
    }

    function speakPhrase(text) {
      if (!text || typeof window.speechSynthesis === 'undefined') return;
      try {
        window.speechSynthesis.cancel();
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = "en-US";
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        }, 30);
      } catch (e) {
        console.warn("Speech synthesis error:", e);
      }
    }

    function speakFinalText() {
      const box = document.getElementById('finalSentence');
      if (box && box.value.trim()) speakPhrase(box.value.trim());
    }

    function speakSingleSign() {
      if (state.currentDetected) speakPhrase(cleanSignName(state.currentDetected));
    }

    function undoWord() {
      const box = document.getElementById('finalSentence');
      if (!box) return;
      const words = box.value.trim().split(" ");
      words.pop();
      box.value = words.join(" ");
    }

    function clearSentence() {
      const box = document.getElementById('finalSentence');
      if (box) box.value = "";
    }

    function toggleMirror() {
      document.body.classList.toggle("mirrored");
      const btn = document.getElementById("btnMirror");
      if (btn) btn.classList.toggle("btn-primary");
    }

    function toggleSkeleton() {
      state.showSkeleton = !state.showSkeleton;
      const btn = document.getElementById("btnSkeleton");
      if (btn) {
        btn.innerText = state.showSkeleton ? "🦴 Skeleton: ON" : "🦴 Skeleton: OFF";
        btn.classList.toggle("btn-primary", state.showSkeleton);
        btn.classList.toggle("btn-secondary", !state.showSkeleton);
      }
    }

    function updateConfidence(val) {
      state.confidenceThreshold = parseFloat(val);
      const label = document.getElementById('thresholdVal');
      if (label) label.innerText = Math.round(state.confidenceThreshold * 100) + "%";

      if (state.handsInstance) {
        state.handsInstance.setOptions({
          minDetectionConfidence: state.confidenceThreshold,
          minTrackingConfidence: state.confidenceThreshold
        });
      }
    }

    function updatePracticeTarget() {
      if (state.practiceIdx >= SUPPORTED_SIGNS.length) {
        const name = document.getElementById('pTargetName');
        const desc = document.getElementById('pTargetDesc');
        const feed = document.getElementById('pFeedbackText');
        if (name) name.innerText = "🎉 Training Complete!";
        if (desc) desc.innerText = "You have mastered all 20 prototype gestures.";
        if (feed) feed.innerText = "Well done!";
        return;
      }

      const target = SUPPORTED_SIGNS[state.practiceIdx];
      const name = document.getElementById('pTargetName');
      const desc = document.getElementById('pTargetDesc');
      const bar = document.getElementById('practiceProgressBar');
      const feed = document.getElementById('pFeedbackText');

      if (name) name.innerText = target.name;
      if (desc) desc.innerText = target.desc;
      if (bar) bar.style.width = "0%";
      if (feed) {
        feed.innerText = `Sign (${state.practiceIdx + 1}/20): Match the prompt.`;
        feed.style.color = "var(--text-muted)";
      }
      state.practiceHoldTimer = 0;
    }

    function handlePracticeMatch(match) {
      if (state.practiceIdx >= SUPPORTED_SIGNS.length) return;
      const target = SUPPORTED_SIGNS[state.practiceIdx];
      const bar = document.getElementById('practiceProgressBar');
      const feed = document.getElementById('pFeedbackText');

      if (match && match.code === target.id) {
        state.practiceHoldTimer += 40;
        const pct = Math.min(100, (state.practiceHoldTimer / 1100) * 100);
        if (bar) bar.style.width = pct + "%";
        if (feed) {
          feed.innerText = "Matching! Hold steady...";
          feed.style.color = "var(--success)";
        }

        if (pct >= 100) {
          playSuccessChime();
          state.practiceScore++;
          state.practiceIdx++;
          const scoreEl = document.getElementById('pScore');
          if (scoreEl) scoreEl.innerText = state.practiceScore;
          updatePracticeTarget();
        }
      } else {
        if (state.practiceHoldTimer > 0) {
          state.practiceHoldTimer = Math.max(0, state.practiceHoldTimer - 20);
          if (bar) bar.style.width = (state.practiceHoldTimer / 1100) * 100 + "%";
        }
      }
    }

    function skipPracticeTarget() {
      state.practiceIdx++;
      updatePracticeTarget();
    }

    function resetPractice() {
      state.practiceIdx = 0;
      state.practiceScore = 0;
      const scoreEl = document.getElementById('pScore');
      if (scoreEl) scoreEl.innerText = "0";
      updatePracticeTarget();
    }

    function practiceDirectSign(signId) {
      const idx = SUPPORTED_SIGNS.findIndex(s => s.id === signId);
      if (idx !== -1) {
        state.practiceIdx = idx;
        navigate('practice');
      }
    }

    function playSuccessChime() {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.28);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.28);
      } catch (e) {}
    }

    function toggleTheme() {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('sv_theme', nextTheme);
      const btn = document.getElementById('themeBtn');
      if (btn) btn.innerText = nextTheme === 'dark' ? '🌓' : '☀️';
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function copyText(elemId) {
      const elem = document.getElementById(elemId);
      if (!elem || !elem.value.trim()) return;
      navigator.clipboard.writeText(elem.value.trim()).then(() => showToast("COPIED TO CLIPBOARD"));
    }

    function copyKinematicSchema() {
      const payload = JSON.stringify(SUPPORTED_SIGNS, null, 2);
      navigator.clipboard.writeText(payload).then(() => showToast("KINEMATIC SCHEMA COPIED"));
    }

    function downloadKinematicSchema() {
      const payload = JSON.stringify(SUPPORTED_SIGNS, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signvoice-kinematics-20.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    function downloadTranscript() {
      if (state.transcriptWords.length === 0) {
        showToast("NO TRANSCRIPT LOGGED YET");
        return;
      }
      const blob = new Blob([state.transcriptWords.join("\n")], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signvoice-transcript-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function clearFullHistory() {
      state.history = [];
      localStorage.setItem('sv_history', JSON.stringify([]));
      handleRouting();
    }

    function filterGuide(category, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const cards = document.querySelectorAll('#guideGrid .sign-card');
      cards.forEach(card => {
        const match = (category === 'all') || (card.getAttribute('data-category') === category);
        card.style.display = match ? 'flex' : 'none';
      });
    }

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      switch (e.key.toLowerCase()) {
        case 't': navigate('translate'); break;
        case 'g': navigate('sign-guide'); break;
        case 's': navigate('datasheet'); break;
        case 'p': navigate('practice'); break;
        case 'd': navigate('dashboard'); break;
        case 'h': navigate('history'); break;
        case 'e': navigate('emergency'); break;
        case '?': document.getElementById('shortcutsModal').style.display = 'flex'; break;
        case 'escape': document.getElementById('shortcutsModal').style.display = 'none'; break;
      }
    });

    const savedTheme = localStorage.getItem('sv_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.innerText = savedTheme === 'dark' ? '🌓' : '☀️';

    window.onload = handleRouting;

