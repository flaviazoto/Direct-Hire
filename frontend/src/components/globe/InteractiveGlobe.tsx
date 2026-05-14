"use client";
// frontend/src/components/globe/InteractiveGlobe.tsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── Country data ───────────────────────────────────────────────────────────────

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

const ARCS_ALL = [
  { from: { lat: 51.5,  lng:  -0.1 }, to: { lat: 24.0,  lng:  54.0 } },
  { from: { lat: 24.0,  lng:  54.0 }, to: { lat:  1.3,  lng: 103.8 } },
  { from: { lat: 51.5,  lng:  -0.1 }, to: { lat: 37.1,  lng: -95.7 } },
  { from: { lat: 37.1,  lng: -95.7 }, to: { lat: 56.1,  lng: -106.3} },
  { from: { lat: 51.2,  lng:  10.4 }, to: { lat: 41.9,  lng:  12.5 } },
];

const HTML_MARKERS = [
  { code: "GB", lat: 51.5,  lng: -0.1,   label: "GB · 145K" },
  { code: "US", lat: 37.1,  lng: -95.7,  label: "US · 210K" },
  { code: "AE", lat: 24.0,  lng: 54.0,   label: "AE · 55K"  },
  { code: "DE", lat: 51.2,  lng: 10.4,   label: "DE · 90K"  },
  { code: "SG", lat: 1.3,   lng: 103.8,  label: "SG · 42K"  },
];

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  country: Country | null;
}

const GLOBE_RADIUS    = 100;
const AUTO_ROTATE     = 0.0015; // Slower, more elegant rotation
const DAMPING         = 0.92;   // Smoother inertia
const RESUME_DELAY_MS = 3000;

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

// ── Cinematic Shaders (Apple-style Fresnel) ────────────────────────────────────

const ATM_VERT = `
  varying vec3 vNormal;
  varying vec3 vPositionNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATM_FRAG = `
  varying vec3 vNormal;
  varying vec3 vPositionNormal;
  void main() {
    float intensity = pow(0.55 - dot(vNormal, vPositionNormal), 3.0);
    gl_FragColor = vec4(0.2, 0.6, 1.0, 1.0) * intensity * 1.5;
  }
`;

const HALO_FRAG = `
  varying vec3 vNormal;
  varying vec3 vPositionNormal;
  void main() {
    float intensity = pow(0.6 - dot(vNormal, vPositionNormal), 2.5);
    gl_FragColor = vec4(0.1, 0.4, 0.9, 1.0) * intensity * 0.8;
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

    const isMobile = window.innerWidth < 768;
    const ARCS     = isMobile ? ARCS_ALL.slice(0, 3) : ARCS_ALL;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width   = "100%";
    renderer.domElement.style.height  = "100%";
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Scene + camera ─────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000); // Tighter FOV for cinematic look
    camera.position.z = 320;
    cameraRef.current = camera;

    let css2dRenderer: any = null;

    const updateSize = () => {
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (css2dRenderer) css2dRenderer.setSize(w, h);
    };

    // ── Dramatic Lighting (Key, Fill, Rim) ─────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.05)); // Very low ambient
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(5, 3, 5);
    scene.add(keyLight);
    
    const fillLight = new THREE.DirectionalLight(0x3b6fcc, 0.8);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 2.0);
    rimLight.position.set(-2, 4, -5);
    scene.add(rimLight);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // ── High-Fidelity Earth Mesh ───────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color:             0x0a1526,
      emissive:          0x020813,
      emissiveIntensity: 0.8,
      specular:          new THREE.Color(0x111111),
      shininess:         25,
    });
    globeGroup.add(new THREE.Mesh(earthGeo, earthMat));

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      "https://unpkg.com/three-globe/example/img/earth-night.jpg",
      (tex) => { 
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        earthMat.map = tex; 
        earthMat.needsUpdate = true; 
      }
    );

    // ── Atmosphere & Outer Halo (True Fresnel) ─────────────────────────────────
    globeGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.015, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader:   ATM_VERT,
        fragmentShader: ATM_FRAG,
        side:        THREE.BackSide,
        blending:    THREE.AdditiveBlending,
        transparent: true,
        depthWrite:  false,
      }),
    ));

    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.12, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader:   ATM_VERT,
        fragmentShader: HALO_FRAG,
        side:        THREE.FrontSide,
        blending:    THREE.AdditiveBlending,
        transparent: true,
        depthWrite:  false,
      }),
    ));

    // ── Minimalist Grid (Reduced opacity) ──────────────────────────────────────
    const gridMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.03 });
    const equatorMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.08 });

    function addLine(pts: THREE.Vector3[], mat: THREE.LineBasicMaterial) {
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    [-60, -30, 0, 30, 60].forEach(lat => {
      const pts: THREE.Vector3[] = [];
      for (let lon = 0; lon <= 360; lon += 5) pts.push(latLngToVec3(lat, lon, GLOBE_RADIUS + 0.1));
      addLine(pts, lat === 0 ? equatorMat : gridMat);
    });

    for (let lon = 0; lon < 360; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) pts.push(latLngToVec3(lat, lon, GLOBE_RADIUS + 0.1));
      addLine(pts, gridMat);
    }

    // ── Clean Connection Arcs ──────────────────────────────────────────────────
    const arcLines: THREE.Line[] = [];
    ARCS.forEach(arc => {
      const start = latLngToVec3(arc.from.lat, arc.from.lng, GLOBE_RADIUS);
      const end   = latLngToVec3(arc.to.lat,   arc.to.lng,   GLOBE_RADIUS);
      const mid   = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * 1.35);
      const geo   = new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(50));
      const mat   = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
      const line  = new THREE.Line(geo, mat);
      globeGroup.add(line);
      arcLines.push(line);
    });
    arcLinesRef.current = arcLines;

    // ── Country Dots & Pulse Rings ─────────────────────────────────────────────
    const dotData:  typeof dotRefs.current  = [];
    const ringData: typeof ringRefs.current = [];

    COUNTRIES.forEach((country, i) => {
      const localPos = latLngToVec3(country.lat, country.lng, GLOBE_RADIUS + 0.5);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      dot.userData = { country, index: i };
      scene.add(dot);
      dotData.push({ mesh: dot, localPos, country });

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.5, 2.5, 32),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8, transparent: true, opacity: 0.0,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      scene.add(ring);
      ringData.push({ mesh: ring, offset: i * (2.0 / COUNTRIES.length) });
    });

    dotRefs.current  = dotData;
    ringRefs.current = ringData;

    // ── CSS2D HTML Apple-style Pills ───────────────────────────────────────────
    if (!isMobile) {
      try {
        const { CSS2DRenderer, CSS2DObject } = require("three/examples/jsm/renderers/CSS2DRenderer.js");
        const labelRenderer = new CSS2DRenderer();
        labelRenderer.domElement.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
        el.appendChild(labelRenderer.domElement);
        css2dRenderer = labelRenderer;

        HTML_MARKERS.forEach(m => {
          const div = document.createElement("div");
          div.textContent = m.label;
          div.style.cssText = `
            background: rgba(15, 23, 42, 0.4);
            border: 0.5px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            padding: 5px 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 11px;
            font-weight: 500;
            color: #f8fafc;
            white-space: nowrap;
            cursor: pointer;
            letter-spacing: 0.02em;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            pointer-events: auto;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            user-select: none;
          `;
          div.addEventListener("mouseenter", () => {
            div.style.background  = "rgba(255, 255, 255, 0.1)";
            div.style.transform = "scale(1.05)";
          });
          div.addEventListener("mouseleave", () => {
            div.style.background  = "rgba(15, 23, 42, 0.4)";
            div.style.transform = "scale(1)";
          });

          const label = new CSS2DObject(div);
          label.position.copy(latLngToVec3(m.lat, m.lng, GLOBE_RADIUS + 4));
          globeGroup.add(label);
        });
      } catch {}
    }

    updateSize();
    window.addEventListener("resize", updateSize);

    // ── Interaction Logic ──────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse2D   = new THREE.Vector2();
    let   hoveredIdx = -1;

    function updateTooltip(idx: number) {
      if (idx < 0) { setTooltip({ visible: false, x: 0, y: 0, country: null }); return; }
      const { country, mesh } = dotData[idx];
      const v  = mesh.position.clone().project(camera);
      const w  = el!.clientWidth;
      const h  = el!.clientHeight;
      const sx = ( v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      setTooltip({ visible: true, x: sx, y: sy, country });
    }

    function onMouseMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse2D.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);

      if (isDragging.current) {
        const dx = e.clientX - prevMouse.current.x;
        const dy = e.clientY - prevMouse.current.y;
        velocity.current = { x: dx * 0.005, y: dy * 0.005 };
        globeGroup.rotation.y += dx * 0.005;
        globeGroup.rotation.x  = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, globeGroup.rotation.x + dy * 0.005));
        prevMouse.current = { x: e.clientX, y: e.clientY };
        return;
      }

      raycaster.setFromCamera(mouse2D, camera);
      const hits = raycaster.intersectObjects(dotData.map(d => d.mesh), false);
      if (hits.length > 0) {
        const newIdx = dotData.findIndex(d => d.mesh === hits[0].object);
        if (newIdx !== hoveredIdx) {
          hoveredIdx = newIdx;
          updateTooltip(hoveredIdx);
          dotData.forEach((d, i) => {
            (d.mesh.material as THREE.MeshBasicMaterial).color.set(i === hoveredIdx ? 0x38bdf8 : 0xffffff);
            d.mesh.scale.setScalar(i === hoveredIdx ? 1.5 : 1.0);
          });
        }
        renderer.domElement.style.cursor = "pointer";
      } else if (hoveredIdx !== -1) {
        hoveredIdx = -1;
        updateTooltip(-1);
        dotData.forEach(d => {
          (d.mesh.material as THREE.MeshBasicMaterial).color.set(0xffffff);
          d.mesh.scale.setScalar(1.0);
        });
        renderer.domElement.style.cursor = "grab";
      }
    }

    function onMouseDown(e: MouseEvent) {
      isDragging.current = true;
      prevMouse.current  = { x: e.clientX, y: e.clientY };
      velocity.current   = { x: 0, y: 0 };
      renderer.domElement.style.cursor = "grabbing";
    }

    function onMouseUp() {
      isDragging.current   = false;
      lastDragTime.current = Date.now();
      renderer.domElement.style.cursor = hoveredIdx !== -1 ? "pointer" : "grab";
    }

    // ── Animation Loop ─────────────────────────────────────────────────────────
    let time = 0;

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      time += 0.012;

      const msSinceDrag = Date.now() - lastDragTime.current;
      const autoResumed = lastDragTime.current === 0 || msSinceDrag > RESUME_DELAY_MS;

      if (!isDragging.current) {
        if (Math.abs(velocity.current.x) > 0.0001 || Math.abs(velocity.current.y) > 0.0001) {
          globeGroup.rotation.y += velocity.current.x;
          globeGroup.rotation.x  = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, globeGroup.rotation.x + velocity.current.y));
          velocity.current.x *= DAMPING;
          velocity.current.y *= DAMPING;
        } else if (autoResumed) {
          globeGroup.rotation.y += AUTO_ROTATE;
        }
      }

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

        const t = ((time + offset) % 2.0) / 2.0;
        const scale = 1 + t * 2.5;
        const opacity = Math.max(0, 1 - t) * 0.8;
        ring.scale.set(scale, scale, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = opacity;
      });

      renderer.render(scene, camera);
      if (css2dRenderer) css2dRenderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", updateSize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  const canvasW = mountRef.current?.clientWidth ?? 520;
  const ttX = Math.min(tooltip.x, canvasW - 240);
  const ttY = Math.max(tooltip.y - 120, 16);

  return (
    <div className="relative w-full aspect-square max-w-[340px] sm:max-w-[480px] md:max-w-[600px] mx-auto touch-none select-none">
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Apple-style Glass Tooltip */}
      {tooltip.visible && tooltip.country && (
        <div style={{
          position: "absolute", left: ttX, top: ttY,
          minWidth: 220,
          background: "rgba(15, 23, 42, 0.5)",
          border: "0.5px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "16px",
          padding: "16px 20px",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          pointerEvents: "none",
          zIndex: 20,
          boxShadow: "0 10px 40px -10px rgba(0,0,0,0.5)",
          color: "#fff",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          transition: "opacity 0.2s ease, transform 0.2s ease",
          animation: "fadeIn 0.2s ease-out forwards"
        }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
            {tooltip.country.code}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.02em" }}>
            {tooltip.country.name}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#38bdf8", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8 }}>
            {tooltip.country.jobs}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 12, lineHeight: 1.4 }}>
            {tooltip.country.cats}
          </div>
          <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>
            Explore opportunities &rarr;
          </div>
        </div>
      )}
    </div>
  );
}