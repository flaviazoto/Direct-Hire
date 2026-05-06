"use client";
// frontend/src/components/globe/InteractiveGlobe.tsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── Country data (existing tooltip markers) ────────────────────────────────────

const COUNTRIES = [
  { code: "DE", name: "Germany",        lat: 51.16, lng: 10.45,   jobs: "94K",  cats: "Engineering, Finance, Ops"    },
  { code: "IT", name: "Italy",          lat: 41.87, lng: 12.56,   jobs: "71K",  cats: "Design, Hospitality, Tech"    },
  { code: "AE", name: "UAE",            lat: 23.42, lng: 53.85,   jobs: "58K",  cats: "Construction, Finance, IT"    },
  { code: "US", name: "United States",  lat: 37.09, lng: -95.71,  jobs: "210K", cats: "Tech, Healthcare, Finance"    },
  { code: "GB", name: "United Kingdom", lat: 55.37, lng: -3.43,   jobs: "112K", cats: "Finance, Legal, Tech"         },
  { code: "AL", name: "Albania",        lat: 41.15, lng: 20.16,   jobs: "12K",  cats: "IT, Tourism, Trade"           },
  { code: "CA", name: "Canada",         lat: 56.13, lng: -106.34, jobs: "87K",  cats: "Tech, Healthcare, Mining"     },
  { code: "AU", name: "Australia",      lat: -25.27, lng: 133.77, jobs: "63K",  cats: "Engineering, Mining, IT"      },
  { code: "SG", name: "Singapore",      lat: 1.35,  lng: 103.82,  jobs: "44K",  cats: "Finance, Tech, Logistics"     },
  { code: "JP", name: "Japan",          lat: 36.20, lng: 138.25,  jobs: "52K",  cats: "Manufacturing, IT, Research"  },
] as const;

type Country = typeof COUNTRIES[number];

// ── Connection arc pairs ───────────────────────────────────────────────────────

const ARCS = [
  { from: { lat: 51.5,  lng:  -0.1 }, to: { lat: 24.0,  lng:  54.0 } }, // London → Dubai
  { from: { lat: 24.0,  lng:  54.0 }, to: { lat:  1.3,  lng: 103.8 } }, // Dubai → Singapore
  { from: { lat: 51.5,  lng:  -0.1 }, to: { lat: 37.1,  lng: -95.7 } }, // London → US
  { from: { lat: 37.1,  lng: -95.7 }, to: { lat: 56.1,  lng: -106.3} }, // US → Canada
  { from: { lat: 51.2,  lng:  10.4 }, to: { lat: 41.9,  lng:  12.5 } }, // Germany → Italy
];

// ── HTML pill markers (CSS2DRenderer) ─────────────────────────────────────────

const HTML_MARKERS = [
  { code: "GB", lat: 51.5,  lng: -0.1,   label: "GB · 145K" },
  { code: "AE", lat: 24.0,  lng: 54.0,   label: "AE · 55K"  },
  { code: "DE", lat: 51.2,  lng: 10.4,   label: "DE · 90K"  },
  { code: "CA", lat: 56.1,  lng: -106.3, label: "CA · 80K"  },
  { code: "AU", lat: -25.3, lng: 133.8,  label: "AU · 65K"  },
  { code: "SG", lat: 1.3,   lng: 103.8,  label: "SG · 42K"  },
  { code: "AL", lat: 41.1,  lng: 20.1,   label: "AL · 70K"  },
  { code: "US", lat: 37.1,  lng: -95.7,  label: "US · 210K" },
];

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  country: Country | null;
}

const GLOBE_RADIUS    = 100;
const CANVAS_SIZE     = 520;
const AUTO_ROTATE     = 0.004;   // rad/frame ≈ "speed 0.4"
const DAMPING         = 0.9;     // velocity multiplier ≈ dampingFactor 0.1
const RESUME_DELAY_MS = 4000;    // ms before auto-rotate resumes after drag

// ── lat/lng → 3D vector ────────────────────────────────────────────────────────

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

// ── Shaders ────────────────────────────────────────────────────────────────────

// Atmosphere glow (spec: scale 1.08, BackSide, AdditiveBlending)
const ATM_VERT = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATM_FRAG = `
  varying vec3 vNormal;
  void main() {
    float i = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(0.05, 0.35, 1.0, 1.0) * i;
  }
`;

// Outer halo (limb brightening)
const HALO_VERT = ATM_VERT;

const HALO_FRAG = `
  uniform vec3  glowColor;
  uniform float coefficient;
  uniform float power;
  varying vec3  vNormal;
  void main() {
    float intensity = pow(max(0.0, coefficient - dot(vNormal, vec3(0.0, 0.0, 1.0))), power);
    gl_FragColor = vec4(glowColor, intensity * 0.45);
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function InteractiveGlobe() {
  const mountRef      = useRef<HTMLDivElement>(null);
  const frameRef      = useRef<number>(0);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const isDragging    = useRef(false);
  const prevMouse     = useRef({ x: 0, y: 0 });
  const velocity      = useRef({ x: 0, y: 0 });
  const targetRot     = useRef<{ y: number; x: number } | null>(null);
  const lastDragTime  = useRef<number>(0);
  const dotRefs       = useRef<{ mesh: THREE.Mesh; localPos: THREE.Vector3; country: Country }[]>([]);
  const ringRefs      = useRef<{ mesh: THREE.Mesh; offset: number }[]>([]);
  const arcLinesRef   = useRef<THREE.Line[]>([]);

  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, country: null });

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(CANVAS_SIZE, CANVAS_SIZE);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Scene + camera ─────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.z = 290;
    cameraRef.current = camera;

    // ── Lights ─────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x3b6fcc, 0.9));
    const sun = new THREE.DirectionalLight(0x7aafff, 1.5);
    sun.position.set(4, 2, 5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x062050, 0.6);
    rim.position.set(-4, -1, -3);
    scene.add(rim);



    // ── Globe group ────────────────────────────────────────────────────────────
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // ── Earth mesh ─────────────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color:             0x1a3a6b,
      specular:          new THREE.Color(0x1a3a6e),
      shininess:         20,
      emissive:          new THREE.Color(0x060e22),
      emissiveIntensity: 0.45,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earth);

    // Earth texture (non-blocking — plain colour globe if it fails)
    const textureLoader = new THREE.TextureLoader();
    const earthTexture  = textureLoader.load(
      "https://unpkg.com/three-globe/example/img/earth-night.jpg",
      (tex) => { earthMat.map = tex; earthMat.needsUpdate = true; },
      undefined,
      () => { /* texture failed — solid colour fallback is fine */ },
    );
    void earthTexture; // referenced above

    // ── Atmosphere glow (scale 1.08, BackSide, AdditiveBlending) ──────────────
    const atmMat = new THREE.ShaderMaterial({
      vertexShader:   ATM_VERT,
      fragmentShader: ATM_FRAG,
      side:        THREE.BackSide,
      blending:    THREE.AdditiveBlending,
      transparent: true,
      depthWrite:  false,
    });
    globeGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 48, 48),
      atmMat,
    ));

    // ── Outer halo (limb brightening) ──────────────────────────────────────────
    const haloMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor:   { value: new THREE.Color(0x0d3b8c) },
        coefficient: { value: 0.28 },
        power:       { value: 5.5 },
      },
      vertexShader:   HALO_VERT,
      fragmentShader: HALO_FRAG,
      side:        THREE.FrontSide,
      blending:    THREE.AdditiveBlending,
      transparent: true,
      depthWrite:  false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS + 14, 48, 48), haloMat));

    // ── Grid lines ─────────────────────────────────────────────────────────────
    const gridMat    = new THREE.LineBasicMaterial({ color: 0x1e54b7, transparent: true, opacity: 0.18 });
    const equatorMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.30 });

    function addLine(pts: THREE.Vector3[], mat: THREE.LineBasicMaterial) {
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    [-60, -30, 0, 30, 60].forEach(lat => {
      const pts: THREE.Vector3[] = [];
      for (let lon = 0; lon <= 360; lon += 3) pts.push(latLngToVec3(lat, lon, GLOBE_RADIUS + 0.3));
      addLine(pts, lat === 0 ? equatorMat : gridMat);
    });

    for (let lon = 0; lon < 360; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(latLngToVec3(lat, lon, GLOBE_RADIUS + 0.3));
      addLine(pts, gridMat);
    }

    // ── Wireframe dot-grid overlay ─────────────────────────────────────────────
    const wireGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.001, 36, 18);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x0090FF, wireframe: true, transparent: true, opacity: 0.04 });
    globeGroup.add(new THREE.Mesh(wireGeo, wireMat));

    // ── Connection arcs ────────────────────────────────────────────────────────
    const arcLines: THREE.Line[] = [];
    ARCS.forEach(arc => {
      const start = latLngToVec3(arc.from.lat, arc.from.lng, GLOBE_RADIUS);
      const end   = latLngToVec3(arc.to.lat,   arc.to.lng,   GLOBE_RADIUS);
      const mid   = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * 1.4);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(60);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0x0090FF, transparent: true, opacity: 0.35 });
      const line = new THREE.Line(geo, mat);
      globeGroup.add(line);
      arcLines.push(line);
    });
    arcLinesRef.current = arcLines;

    // ── Three.js country dot + ring markers ────────────────────────────────────
    const dotData:  typeof dotRefs.current  = [];
    const ringData: typeof ringRefs.current = [];

    COUNTRIES.forEach((country, i) => {
      const localPos = latLngToVec3(country.lat, country.lng, GLOBE_RADIUS + 1.8);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x06b6d4 }),
      );
      dot.userData = { country, index: i };
      scene.add(dot);
      dotData.push({ mesh: dot, localPos, country });

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2, 3.8, 20),
        new THREE.MeshBasicMaterial({
          color: 0x06b6d4, transparent: true, opacity: 0.0,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      scene.add(ring);
      ringData.push({ mesh: ring, offset: i * (2.5 / COUNTRIES.length) });
    });

    dotRefs.current  = dotData;
    ringRefs.current = ringData;

    // ── CSS2D HTML pill markers ────────────────────────────────────────────────
    let css2dRenderer: { setSize: (w: number, h: number) => void; render: (s: THREE.Scene, c: THREE.Camera) => void; domElement: HTMLElement } | null = null;
    const css2dObjects: { obj: THREE.Object3D & { element: HTMLElement }; localPos: THREE.Vector3 }[] = [];

    try {
      // Dynamic require so a missing package doesn't crash the globe
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CSS2DRenderer, CSS2DObject } = require("three/examples/jsm/renderers/CSS2DRenderer.js") as {
        CSS2DRenderer: new () => { setSize: (w: number, h: number) => void; render: (s: THREE.Scene, c: THREE.Camera) => void; domElement: HTMLElement };
        CSS2DObject:   new (el: HTMLElement) => THREE.Object3D & { element: HTMLElement };
      };

      const labelRenderer = new CSS2DRenderer();
      labelRenderer.setSize(CANVAS_SIZE, CANVAS_SIZE);
      labelRenderer.domElement.style.position = "absolute";
      labelRenderer.domElement.style.top      = "0";
      labelRenderer.domElement.style.left     = "0";
      labelRenderer.domElement.style.pointerEvents = "none";
      el.appendChild(labelRenderer.domElement);
      css2dRenderer = labelRenderer;

      HTML_MARKERS.forEach(m => {
        const div = document.createElement("div");
        div.textContent = m.label;
        div.style.cssText = `
          background: rgba(1,9,19,0.88);
          border: 1px solid rgba(0,144,255,0.35);
          border-radius: 20px;
          padding: 4px 11px;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 600;
          color: #60A5FA;
          white-space: nowrap;
          cursor: pointer;
          letter-spacing: 0.04em;
          box-shadow: 0 2px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,144,255,0.1);
          transition: all 0.2s;
          pointer-events: auto;
          backdrop-filter: blur(8px);
          user-select: none;
        `;
        div.addEventListener("mouseenter", () => {
          div.style.background    = "rgba(0,144,255,0.15)";
          div.style.borderColor   = "rgba(0,144,255,0.6)";
          div.style.color         = "#93C5FD";
        });
        div.addEventListener("mouseleave", () => {
          div.style.background    = "rgba(1,9,19,0.88)";
          div.style.borderColor   = "rgba(0,144,255,0.35)";
          div.style.color         = "#60A5FA";
        });

        const label = new CSS2DObject(div);
        label.position.copy(latLngToVec3(m.lat, m.lng, GLOBE_RADIUS + 6));
        globeGroup.add(label);
        css2dObjects.push({ obj: label, localPos: latLngToVec3(m.lat, m.lng, GLOBE_RADIUS + 6) });
      });
    } catch {
      // CSS2DRenderer unavailable — dot markers remain visible as fallback
    }

    // ── Raycaster ──────────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse2D   = new THREE.Vector2();
    let   hoveredIdx = -1;

    function updateTooltip(idx: number) {
      if (idx < 0) { setTooltip({ visible: false, x: 0, y: 0, country: null }); return; }
      const { country, mesh } = dotData[idx];
      const v  = mesh.position.clone().project(camera);
      const sx = ( v.x * 0.5 + 0.5) * CANVAS_SIZE;
      const sy = (-v.y * 0.5 + 0.5) * CANVAS_SIZE;
      setTooltip({ visible: true, x: sx, y: sy, country });
    }

    // ── Event handlers ─────────────────────────────────────────────────────────

    function onMouseMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse2D.set(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );

      if (isDragging.current) {
        const dx = e.clientX - prevMouse.current.x;
        const dy = e.clientY - prevMouse.current.y;
        velocity.current = { x: dx * 0.007, y: dy * 0.004 };
        globeGroup.rotation.y += dx * 0.007;
        globeGroup.rotation.x  = Math.max(-Math.PI / 4,
          Math.min(Math.PI / 4, globeGroup.rotation.x + dy * 0.004));
        prevMouse.current = { x: e.clientX, y: e.clientY };
        return;
      }

      raycaster.setFromCamera(mouse2D, camera);
      const targets = dotData.map(d => d.mesh);
      const hits    = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const newIdx = targets.indexOf(hits[0].object as THREE.Mesh);
        if (newIdx !== hoveredIdx) {
          hoveredIdx = newIdx;
          updateTooltip(hoveredIdx);
          dotData.forEach((d, i) => {
            (d.mesh.material as THREE.MeshBasicMaterial).color.set(i === hoveredIdx ? 0xffffff : 0x06b6d4);
          });
        }
        renderer.domElement.style.cursor = "pointer";
      } else if (hoveredIdx !== -1) {
        hoveredIdx = -1;
        updateTooltip(-1);
        dotData.forEach(d => (d.mesh.material as THREE.MeshBasicMaterial).color.set(0x06b6d4));
        renderer.domElement.style.cursor = "grab";
      }
    }

    function onMouseDown(e: MouseEvent) {
      isDragging.current    = true;
      prevMouse.current     = { x: e.clientX, y: e.clientY };
      velocity.current      = { x: 0, y: 0 };
      renderer.domElement.style.cursor = "grabbing";
    }

    function onMouseUp() {
      isDragging.current = false;
      lastDragTime.current = Date.now();
      renderer.domElement.style.cursor = "grab";
    }

    function onClick() {
      if (hoveredIdx < 0) return;
      const c = dotData[hoveredIdx].country;
      const tY = -(c.lng) * Math.PI / 180;
      const tX = -(c.lat) * Math.PI / 180 * 0.55;
      targetRot.current = {
        y: tY,
        x: Math.max(-Math.PI / 4, Math.min(Math.PI / 4, tX)),
      };
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      camera.position.z = Math.max(200, Math.min(400, camera.position.z + e.deltaY * 0.18));
    }

    renderer.domElement.addEventListener("mousemove",  onMouseMove);
    renderer.domElement.addEventListener("mousedown",  onMouseDown);
    renderer.domElement.addEventListener("mouseup",    onMouseUp);
    renderer.domElement.addEventListener("mouseleave", onMouseUp);
    renderer.domElement.addEventListener("click",      onClick);
    renderer.domElement.addEventListener("wheel",      onWheel, { passive: false });
    renderer.domElement.style.cursor = "grab";

    // ── Animation loop ─────────────────────────────────────────────────────────
    let time = 0;

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      time += 0.016;

      const msSinceDrag  = Date.now() - lastDragTime.current;
      const autoResumed  = lastDragTime.current === 0 || msSinceDrag > RESUME_DELAY_MS;

      if (!isDragging.current) {
        if (targetRot.current) {
          globeGroup.rotation.y += (targetRot.current.y - globeGroup.rotation.y) * 0.05;
          globeGroup.rotation.x += (targetRot.current.x - globeGroup.rotation.x) * 0.05;
          if (
            Math.abs(globeGroup.rotation.y - targetRot.current.y) < 0.002 &&
            Math.abs(globeGroup.rotation.x - targetRot.current.x) < 0.002
          ) targetRot.current = null;
        } else if (Math.abs(velocity.current.x) > 0.0005 || Math.abs(velocity.current.y) > 0.0005) {
          // Decelerate with damping
          globeGroup.rotation.y += velocity.current.x;
          globeGroup.rotation.x  = Math.max(-Math.PI / 4,
            Math.min(Math.PI / 4, globeGroup.rotation.x + velocity.current.y));
          velocity.current.x *= DAMPING;
          velocity.current.y *= DAMPING;
        } else if (autoResumed) {
          // Auto-rotate resumes 4s after last drag
          globeGroup.rotation.y += AUTO_ROTATE;
        }
      }

      // Update dot + ring world positions
      const camDir = camera.position.clone().normalize();

      dotData.forEach(({ mesh, localPos }, i) => {
        const worldPos = localPos.clone().applyEuler(globeGroup.rotation);
        mesh.position.copy(worldPos);

        const facing = worldPos.clone().normalize().dot(camDir) > 0.05;
        mesh.visible = facing;

        const { mesh: ring, offset } = ringData[i];
        ring.position.copy(worldPos);
        ring.quaternion.copy(camera.quaternion);
        ring.visible = facing;

        const t       = ((time + offset) % 2.5) / 2.5;
        const scale   = 1 + t * 3.5;
        const opacity = Math.max(0, 1 - t) * 0.75;
        ring.scale.set(scale, scale, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = opacity;
      });

      // Animate arc opacity
      arcLinesRef.current.forEach((line, i) => {
        (line.material as THREE.LineBasicMaterial).opacity =
          0.15 + 0.3 * Math.abs(Math.sin(Date.now() * 0.001 + i * 1.2));
      });

      renderer.render(scene, camera);
      if (css2dRenderer) css2dRenderer.render(scene, camera);
    }

    animate();

    // ── Cleanup ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameRef.current);
      renderer.domElement.removeEventListener("mousemove",  onMouseMove);
      renderer.domElement.removeEventListener("mousedown",  onMouseDown);
      renderer.domElement.removeEventListener("mouseup",    onMouseUp);
      renderer.domElement.removeEventListener("mouseleave", onMouseUp);
      renderer.domElement.removeEventListener("click",      onClick);
      renderer.domElement.removeEventListener("wheel",      onWheel);

      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      if (css2dRenderer && el.contains(css2dRenderer.domElement)) {
        el.removeChild(css2dRenderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ttX = Math.min(tooltip.x, CANVAS_SIZE - 220);
  const ttY = Math.max(tooltip.y - 90, 8);

  return (
    <div style={{ position: "relative", width: CANVAS_SIZE, height: CANVAS_SIZE, flexShrink: 0 }}>
      <div ref={mountRef} style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} />

      {/* Drag hint */}
      <div style={{
        position: "absolute", bottom: 14, left: 14,
        background: "rgba(5,8,15,0.82)",
        border: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
        backdropFilter: "blur(12px)",
        borderRadius: 8, padding: "5px 12px",
        fontSize: 11, fontWeight: 500,
        color: "rgba(248,250,252,0.45)",
        display: "flex", alignItems: "center", gap: 5,
        pointerEvents: "none",
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        Drag to explore
      </div>

      {/* Live badge */}
      <div style={{
        position: "absolute", top: 14, right: 14,
        background: "rgba(5,8,15,0.82)",
        border: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
        backdropFilter: "blur(12px)",
        borderRadius: 8, padding: "5px 12px",
        display: "flex", alignItems: "center", gap: 6,
        pointerEvents: "none",
      }}>
        <div className="dh-pulse-dot" style={{ width: 7, height: 7 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dh-blue-4, #60a5fa)", letterSpacing: "0.04em" }}>
          700K+ live jobs
        </span>
      </div>

      {/* Hover tooltip */}
      {tooltip.visible && tooltip.country && (
        <div style={{
          position: "absolute", left: ttX, top: ttY,
          minWidth: 200,
          background: "rgba(11,17,32,0.96)",
          border: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
          borderRadius: "var(--dh-radius, 12px)",
          padding: "16px 20px",
          backdropFilter: "blur(20px)",
          pointerEvents: "none",
          zIndex: 20,
          boxShadow: "var(--dh-shadow-card, 0 8px 24px rgba(0,0,0,0.4))",
        }}>
          <div style={{ fontSize: 10, color: "rgba(96,165,250,0.65)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4, fontFamily: "var(--font-body)" }}>
            {tooltip.country.code}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--dh-white, #f8fafc)", marginBottom: 4, fontFamily: "var(--font-display)" }}>
            {tooltip.country.name}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--dh-cyan, #06b6d4)", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 6, fontFamily: "var(--font-display)" }}>
            {tooltip.country.jobs}
          </div>
          <div style={{ fontSize: 11.5, color: "rgba(248,250,252,0.45)", fontFamily: "var(--font-body)", marginBottom: 12, lineHeight: 1.5 }}>
            {tooltip.country.cats}
          </div>
          <div style={{ fontSize: 12, color: "var(--dh-blue-4, #60a5fa)", fontWeight: 600, fontFamily: "var(--font-body)" }}>
            Explore Jobs →
          </div>
        </div>
      )}
    </div>
  );
}
