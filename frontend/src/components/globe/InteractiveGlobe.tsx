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

// ── HTML pill markers ──────────────────────────────────────────────────────────

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
const AUTO_ROTATE     = 0.004;
const DAMPING         = 0.9;
const RESUME_DELAY_MS = 4000;

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

  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, country: null });

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const isMobile = window.innerWidth < 768;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.style.width   = "100%";
    renderer.domElement.style.height  = "100%";
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Scene + camera ─────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.z = 290;
    cameraRef.current = camera;

    // Declare early so updateSize (below) can reference via closure
    let css2dRenderer: {
      setSize: (w: number, h: number) => void;
      render: (s: THREE.Scene, c: THREE.Camera) => void;
      domElement: HTMLElement;
    } | null = null;

    // ── Responsive size updater ────────────────────────────────────────────────
    const updateSize = () => {
      if (!el) return;
      const w = el.clientWidth  || 520;
      const h = el.clientHeight || 520;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (css2dRenderer) css2dRenderer.setSize(w, h);
    };

    // ── Lights ─────────────────────────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0xc7dcff, 0x061126, 1.35));
    const sun = new THREE.DirectionalLight(0xfff4df, 3.1);
    sun.position.set(-4, 3, 6);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5b8cff, 1.15);
    rim.position.set(5, -1, -4);
    scene.add(rim);

    // ── Globe group ────────────────────────────────────────────────────────────
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // ── Earth mesh ─────────────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96);
    const earthMat = new THREE.MeshPhongMaterial({
      color:             0xffffff,
      specular:          new THREE.Color(0x8fb8df),
      shininess:         24,
      normalScale:       new THREE.Vector2(0.65, 0.65),
      emissive:          new THREE.Color(0x010713),
      emissiveIntensity: 0.12,
    });
    globeGroup.add(new THREE.Mesh(earthGeo, earthMat));

    const textureLoader = new THREE.TextureLoader();
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const prepareColorTexture = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      return texture;
    };
    const earthTexture  = textureLoader.load(
      "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
      (tex) => {
        earthMat.map = prepareColorTexture(tex);
        earthMat.needsUpdate = true;
      },
      undefined,
      () => { /* texture failed — solid colour fallback */ },
    );
    void earthTexture;

    const earthNormal = textureLoader.load(
      "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
      (tex) => {
        tex.anisotropy = maxAnisotropy;
        earthMat.normalMap = tex;
        earthMat.needsUpdate = true;
      },
    );
    const earthSpecular = textureLoader.load(
      "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg",
      (tex) => {
        tex.anisotropy = maxAnisotropy;
        earthMat.specularMap = tex;
        earthMat.needsUpdate = true;
      },
    );
    const cloudMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const cloudTexture = textureLoader.load(
      "https://threejs.org/examples/textures/planets/earth_clouds_1024.png",
      (tex) => {
        cloudMaterial.map = prepareColorTexture(tex);
        cloudMaterial.alphaMap = tex;
        cloudMaterial.needsUpdate = true;
      },
    );
    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.006, 96, 96),
      cloudMaterial,
    );
    globeGroup.add(cloudMesh);

    // ── Atmosphere glow ────────────────────────────────────────────────────────
    globeGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 48, 48),
      new THREE.ShaderMaterial({
        vertexShader:   ATM_VERT,
        fragmentShader: ATM_FRAG,
        side:        THREE.BackSide,
        blending:    THREE.AdditiveBlending,
        transparent: true,
        depthWrite:  false,
      }),
    ));

    // ── Outer halo ─────────────────────────────────────────────────────────────
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS + 14, 48, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          glowColor:   { value: new THREE.Color(0x6ba5ff) },
          coefficient: { value: 0.2 },
          power:       { value: 6.2 },
        },
        vertexShader:   HALO_VERT,
        fragmentShader: HALO_FRAG,
        side:        THREE.FrontSide,
        blending:    THREE.AdditiveBlending,
        transparent: true,
        depthWrite:  false,
      }),
    ));

    // ── Grid lines ─────────────────────────────────────────────────────────────
    // ── Wireframe overlay ──────────────────────────────────────────────────────
    // ── Connection arcs ────────────────────────────────────────────────────────
    // ── Country dot + ring markers ─────────────────────────────────────────────
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

    // ── CSS2D HTML pill markers (desktop only — too cluttered on mobile) ────────
    if (!isMobile) {
      try {
        const { CSS2DRenderer, CSS2DObject } = require("three/examples/jsm/renderers/CSS2DRenderer.js") as {
          CSS2DRenderer: new () => {
            setSize: (w: number, h: number) => void;
            render: (s: THREE.Scene, c: THREE.Camera) => void;
            domElement: HTMLElement;
          };
          CSS2DObject: new (el: HTMLElement) => THREE.Object3D & { element: HTMLElement };
        };

        const labelRenderer = new CSS2DRenderer();
        labelRenderer.domElement.style.cssText =
          "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
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
            div.style.background  = "rgba(0,144,255,0.15)";
            div.style.borderColor = "rgba(0,144,255,0.6)";
            div.style.color       = "#93C5FD";
          });
          div.addEventListener("mouseleave", () => {
            div.style.background  = "rgba(1,9,19,0.88)";
            div.style.borderColor = "rgba(0,144,255,0.35)";
            div.style.color       = "#60A5FA";
          });

          const label = new CSS2DObject(div);
          label.position.copy(latLngToVec3(m.lat, m.lng, GLOBE_RADIUS + 6));
          globeGroup.add(label);
        });
      } catch {
        // CSS2DRenderer unavailable — dot markers remain as fallback
      }
    }

    // ── Apply initial size + start resize listener ─────────────────────────────
    // (css2dRenderer is now assigned above if desktop, so updateSize will resize it)
    updateSize();
    window.addEventListener("resize", updateSize);

    // ── Raycaster ──────────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse2D   = new THREE.Vector2();
    let   hoveredIdx = -1;

    function updateTooltip(idx: number) {
      if (idx < 0) { setTooltip({ visible: false, x: 0, y: 0, country: null }); return; }
      const { country, mesh } = dotData[idx];
      const v  = mesh.position.clone().project(camera);
      const w  = el!.clientWidth  || 520;
      const h  = el!.clientHeight || 520;
      const sx = ( v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      setTooltip({ visible: true, x: sx, y: sy, country });
    }

    // ── Mouse handlers ─────────────────────────────────────────────────────────

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
      isDragging.current   = true;
      prevMouse.current    = { x: e.clientX, y: e.clientY };
      velocity.current     = { x: 0, y: 0 };
      renderer.domElement.style.cursor = "grabbing";
    }

    function onMouseUp() {
      isDragging.current   = false;
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

    // ── Touch handlers ─────────────────────────────────────────────────────────

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      isDragging.current   = true;
      prevMouse.current    = { x: t.clientX, y: t.clientY };
      velocity.current     = { x: 0, y: 0 };
    }

    function onTouchMove(e: TouchEvent) {
      if (!isDragging.current || e.touches.length !== 1) return;
      e.preventDefault();
      const t  = e.touches[0];
      const dx = t.clientX - prevMouse.current.x;
      const dy = t.clientY - prevMouse.current.y;
      velocity.current = { x: dx * 0.007, y: dy * 0.004 };
      globeGroup.rotation.y += dx * 0.007;
      globeGroup.rotation.x  = Math.max(-Math.PI / 4,
        Math.min(Math.PI / 4, globeGroup.rotation.x + dy * 0.004));
      prevMouse.current = { x: t.clientX, y: t.clientY };
    }

    function onTouchEnd() {
      isDragging.current   = false;
      lastDragTime.current = Date.now();
    }

    renderer.domElement.addEventListener("mousemove",  onMouseMove);
    renderer.domElement.addEventListener("mousedown",  onMouseDown);
    renderer.domElement.addEventListener("mouseup",    onMouseUp);
    renderer.domElement.addEventListener("mouseleave", onMouseUp);
    renderer.domElement.addEventListener("click",      onClick);
    renderer.domElement.addEventListener("wheel",      onWheel,      { passive: false });
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove",  onTouchMove,  { passive: false });
    renderer.domElement.addEventListener("touchend",   onTouchEnd);
    renderer.domElement.style.cursor = "grab";

    // ── Animation loop ─────────────────────────────────────────────────────────
    let time = 0;

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      time += 0.016;

      const msSinceDrag = Date.now() - lastDragTime.current;
      const autoResumed = lastDragTime.current === 0 || msSinceDrag > RESUME_DELAY_MS;

      if (!isDragging.current) {
        if (targetRot.current) {
          globeGroup.rotation.y += (targetRot.current.y - globeGroup.rotation.y) * 0.05;
          globeGroup.rotation.x += (targetRot.current.x - globeGroup.rotation.x) * 0.05;
          if (
            Math.abs(globeGroup.rotation.y - targetRot.current.y) < 0.002 &&
            Math.abs(globeGroup.rotation.x - targetRot.current.x) < 0.002
          ) targetRot.current = null;
        } else if (Math.abs(velocity.current.x) > 0.0005 || Math.abs(velocity.current.y) > 0.0005) {
          globeGroup.rotation.y += velocity.current.x;
          globeGroup.rotation.x  = Math.max(-Math.PI / 4,
            Math.min(Math.PI / 4, globeGroup.rotation.x + velocity.current.y));
          velocity.current.x *= DAMPING;
          velocity.current.y *= DAMPING;
        } else if (autoResumed) {
          globeGroup.rotation.y += AUTO_ROTATE;
        }
      }

      cloudMesh.rotation.y += 0.00018;

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

      renderer.render(scene, camera);
      if (css2dRenderer) css2dRenderer.render(scene, camera);
    }

    animate();

    // ── Cleanup ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", updateSize);
      renderer.domElement.removeEventListener("mousemove",  onMouseMove);
      renderer.domElement.removeEventListener("mousedown",  onMouseDown);
      renderer.domElement.removeEventListener("mouseup",    onMouseUp);
      renderer.domElement.removeEventListener("mouseleave", onMouseUp);
      renderer.domElement.removeEventListener("click",      onClick);
      renderer.domElement.removeEventListener("wheel",      onWheel);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove",  onTouchMove);
      renderer.domElement.removeEventListener("touchend",   onTouchEnd);

      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      earthTexture.dispose();
      earthNormal.dispose();
      earthSpecular.dispose();
      cloudTexture.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      if (css2dRenderer && el.contains(css2dRenderer.domElement)) {
        el.removeChild(css2dRenderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canvasW = mountRef.current?.clientWidth ?? 520;
  const ttX = Math.min(tooltip.x, canvasW - 220);
  const ttY = Math.max(tooltip.y - 90, 8);

  return (
    <div className="relative w-full aspect-square max-w-[340px] sm:max-w-[480px] md:max-w-[600px] mx-auto touch-none">
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

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
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
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
