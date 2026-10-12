"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  ACESFilmicToneMapping,
  Shape,
  type Group,
  type Texture,
} from "three";
import { forwardLanding } from "@/lib/arcade/prize-data";
import { makeBulbTexture, makeMarqueeTexture, makeWheelTexture, makeWoodTexture, type WheelSlice } from "./wheel-texture";

const WHEEL_Y = 0.22;
const WHEEL_R = 1.04;

type Props = {
  segments: WheelSlice[];
  marquee: string;
  spinning: boolean;
  spinKey: number;
  targetIndex: number;
  idle: boolean;
  leverKey: number;
  bloom: boolean;
  reducedMotion: boolean;
  mobile: boolean;
  onPeg: () => void;
  onLanded: () => void;
};

export default function CabinetScene(props: Props) {
  return (
    <>
      <color attach="background" args={["#120c18"]} />
      <CameraFit mobile={props.mobile} />
      <Lights />
      <Cabinet {...props} />
      {props.bloom && (
        <EffectComposer multisampling={0} enableNormalPass={false} resolutionScale={0.55}>
          <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.25} mipmapBlur intensity={0.85} radius={0.42} />
        </EffectComposer>
      )}
    </>
  );
}

function CameraFit({ mobile }: { mobile: boolean }) {
  const { camera, size, gl } = useThree();
  useLayoutEffect(() => {
    const cam = camera as { fov: number; position: { set: (x: number, y: number, z: number) => void }; lookAt: (x: number, y: number, z: number) => void; updateProjectionMatrix: () => void };
    const narrow = mobile || size.width < 760;
    cam.fov = narrow ? 38 : 32;
    cam.position.set(narrow ? 0 : 0.28, narrow ? 0.02 : 0.16, narrow ? 8.15 : 6.7);
    cam.lookAt(0, narrow ? 0.02 : 0.12, 0);
    cam.updateProjectionMatrix();
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
  }, [camera, gl, mobile, size]);
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.34} />
      <hemisphereLight args={["#b9a0d0", "#2a140e", 0.45]} />
      <directionalLight position={[2.4, 4.2, 5]} intensity={2.1} color="#fff3e2" />
      <pointLight position={[-2.5, 1.5, 2.1]} color="#ff3ec8" intensity={16} distance={9} decay={2} />
      <pointLight position={[2.5, 1.4, 2.1]} color="#39ffe4" intensity={13} distance={9} decay={2} />
      <spotLight position={[0, 3.4, 3.4]} angle={0.52} penumbra={0.55} intensity={10} color="#fff1cc" distance={12} />
    </>
  );
}

function Cabinet({ segments, marquee, spinning, spinKey, targetIndex, idle, leverKey, reducedMotion, onPeg, onLanded }: Props) {
  const wood = useMemo(() => makeWoodTexture(), []);
  const bulbs = useMemo(() => makeBulbTexture(), []);
  const marqueeTex = useMemo(() => makeMarqueeTexture(marquee), [marquee]);
  const kick = useRef(0);
  useEffect(() => () => {
    wood.dispose();
    bulbs.dispose();
  }, [wood, bulbs]);
  useEffect(() => () => marqueeTex.dispose(), [marqueeTex]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.55, 0]}>
        <planeGeometry args={[18, 12]} />
        <meshStandardMaterial color="#0c0912" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.52, 0.15]}>
        <circleGeometry args={[1.7, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>

      <RoundedBox args={[3.25, 4.85, 0.28]} radius={0.04} smoothness={2} position={[0, 0.15, -0.48]}>
        <meshStandardMaterial map={wood} color="#c9a07a" roughness={0.62} metalness={0.04} />
      </RoundedBox>
      <RoundedBox args={[0.38, 3.25, 0.72]} radius={0.04} smoothness={2} position={[-1.46, 0.28, 0.02]}>
        <meshStandardMaterial map={wood} color="#c9a07a" roughness={0.62} metalness={0.04} />
      </RoundedBox>
      <RoundedBox args={[0.38, 3.25, 0.72]} radius={0.04} smoothness={2} position={[1.46, 0.28, 0.02]}>
        <meshStandardMaterial map={wood} color="#c9a07a" roughness={0.62} metalness={0.04} />
      </RoundedBox>
      <RoundedBox args={[2.55, 0.32, 0.72]} radius={0.03} smoothness={2} position={[0, 1.78, 0.02]}>
        <meshStandardMaterial map={wood} color="#c9a07a" roughness={0.62} metalness={0.04} />
      </RoundedBox>
      <RoundedBox args={[2.55, 0.34, 0.72]} radius={0.03} smoothness={2} position={[0, -1.22, 0.02]}>
        <meshStandardMaterial map={wood} color="#c9a07a" roughness={0.62} metalness={0.04} />
      </RoundedBox>

      <RoundedBox args={[3.35, 0.86, 0.62]} radius={0.05} smoothness={2} position={[0, 2.32, 0]}>
        <meshStandardMaterial color="#1a120e" roughness={0.45} metalness={0.35} />
      </RoundedBox>
      <mesh position={[0, 2.32, 0.32]}>
        <planeGeometry args={[2.85, 0.58]} />
        <meshStandardMaterial map={marqueeTex} emissiveMap={marqueeTex} emissive="#ffffff" emissiveIntensity={1.35} roughness={0.4} toneMapped={false} />
      </mesh>

      <Neon x={-1.72} color="#ff2bd6" />
      <Neon x={1.72} color="#3dfff2" />

      <group position={[0, WHEEL_Y, 0.18]}>
        <mesh position={[0, 0, -0.05]}>
          <circleGeometry args={[1.3, 48]} />
          <meshStandardMaterial color="#14080e" roughness={0.85} />
        </mesh>
        <Wheel
          segments={segments}
          spinning={spinning}
          spinKey={spinKey}
          targetIndex={targetIndex}
          idle={idle}
          reducedMotion={reducedMotion}
          onPeg={() => {
            kick.current = 9;
            onPeg();
          }}
          onLanded={onLanded}
        />
        <mesh>
          <ringGeometry args={[WHEEL_R + 0.08, WHEEL_R + 0.2, 64]} />
          <meshStandardMaterial map={bulbs} emissiveMap={bulbs} emissive="#ffffff" emissiveIntensity={1.8} toneMapped={false} roughness={0.35} />
        </mesh>
        <BulbChase texture={bulbs} reducedMotion={reducedMotion} />
        <mesh position={[0, 0, 0.06]}>
          <circleGeometry args={[0.2, 28]} />
          <meshStandardMaterial color="#e6c56a" metalness={0.82} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <ringGeometry args={[0.07, 0.1, 24]} />
          <meshStandardMaterial color="#2a2114" metalness={0.6} roughness={0.35} />
        </mesh>
        <Pointer kick={kick} reducedMotion={reducedMotion} />
      </group>

      <mesh position={[0, WHEEL_Y, 0.52]}>
        <planeGeometry args={[2.5, 2.55]} />
        <meshStandardMaterial color="#d7f4ff" transparent opacity={0.07} roughness={0.05} metalness={0.1} depthWrite={false} />
      </mesh>

      <RoundedBox args={[3.15, 0.16, 0.9]} radius={0.03} smoothness={2} position={[0, -1.55, 0.28]}>
        <meshStandardMaterial color="#1a120e" roughness={0.45} metalness={0.35} />
      </RoundedBox>
      <mesh position={[0, -1.78, 0.55]} rotation={[-0.42, 0, 0]}>
        <boxGeometry args={[2.7, 0.62, 0.08]} />
        <meshStandardMaterial color="#22181c" metalness={0.55} roughness={0.38} />
      </mesh>
      <mesh position={[-0.85, -1.78, 0.62]}>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 20]} />
        <meshStandardMaterial color="#ff3355" emissive="#ff3355" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.55, -1.8, 0.6]}>
        <boxGeometry args={[0.28, 0.16, 0.05]} />
        <meshStandardMaterial color="#241c18" />
      </mesh>
      <Lever pull={leverKey} />

      <mesh position={[-0.7, -2.25, 0.15]}>
        <boxGeometry args={[0.16, 0.7, 0.16]} />
        <meshStandardMaterial map={wood} color="#c9a07a" roughness={0.62} />
      </mesh>
      <mesh position={[0.7, -2.25, 0.15]}>
        <boxGeometry args={[0.16, 0.7, 0.16]} />
        <meshStandardMaterial map={wood} color="#c9a07a" roughness={0.62} />
      </mesh>
    </group>
  );
}

function Neon({ x, color }: { x: number; color: string }) {
  return (
    <mesh position={[x, 0.35, 0.28]}>
      <cylinderGeometry args={[0.03, 0.03, 2.7, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.2} toneMapped={false} />
    </mesh>
  );
}

function BulbChase({ texture, reducedMotion }: { texture: Texture; reducedMotion: boolean }) {
  useFrame((_, dt) => {
    if (reducedMotion) return;
    texture.offset.x = (texture.offset.x + dt * 0.07) % 1;
  });
  return null;
}

function Wheel({
  segments,
  spinning,
  spinKey,
  targetIndex,
  idle,
  reducedMotion,
  onPeg,
  onLanded,
}: {
  segments: WheelSlice[];
  spinning: boolean;
  spinKey: number;
  targetIndex: number;
  idle: boolean;
  reducedMotion: boolean;
  onPeg: () => void;
  onLanded: () => void;
}) {
  const group = useRef<Group>(null);
  const rot = useRef(0);
  const spin = useRef<{ from: number; to: number; t0: number; dur: number; lastPeg: number } | null>(null);
  const pegRef = useRef(onPeg);
  const landRef = useRef(onLanded);
  pegRef.current = onPeg;
  landRef.current = onLanded;
  const seen = useRef(0);
  const landed = useRef(false);
  const texture = useMemo(() => makeWheelTexture(segments), [segments]);
  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    if (spinKey === 0 || spinKey === seen.current || segments.length < 1) return;
    seen.current = spinKey;
    landed.current = false;
    const extra = reducedMotion ? 1 : 4 + Math.floor(Math.random() * 2);
    const dest = forwardLanding(rot.current, targetIndex, segments.length, extra);
    const slice = (Math.PI * 2) / segments.length;
    spin.current = {
      from: rot.current,
      to: dest,
      t0: performance.now(),
      dur: reducedMotion ? 1500 : 5600,
      lastPeg: Math.floor((((Math.PI / 2 - rot.current) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / slice),
    };
  }, [reducedMotion, segments.length, spinKey, spinning, targetIndex]);

  useFrame((_, dt) => {
    const node = group.current;
    if (!node) return;
    const step = Math.min(dt, 0.05);
    const active = spin.current;
    if (active) {
      const u = Math.min(1, (performance.now() - active.t0) / active.dur);
      const k = 3.6;
      const eased = (1 - Math.exp(-k * u)) / (1 - Math.exp(-k));
      rot.current = active.from + (active.to - active.from) * eased;
      if (segments.length > 0) {
        const slice = (Math.PI * 2) / segments.length;
        const local = (((Math.PI / 2 - rot.current) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const peg = Math.floor(local / slice);
        if (peg !== active.lastPeg) {
          active.lastPeg = peg;
          pegRef.current();
        }
      }
      if (u >= 1) {
        rot.current = active.to;
        spin.current = null;
        if (!landed.current) {
          landed.current = true;
          landRef.current();
        }
      }
    } else if (idle && !reducedMotion) {
      rot.current += step * 0.16;
    }
    node.rotation.z = rot.current;
  });

  return (
    <group ref={group}>
      <mesh>
        <circleGeometry args={[WHEEL_R, 72]} />
        <meshStandardMaterial map={texture} roughness={0.48} metalness={0.06} emissive="#fff5e8" emissiveMap={texture} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <torusGeometry args={[WHEEL_R + 0.012, 0.038, 10, 64]} />
        <meshStandardMaterial color="#e8c56a" metalness={0.86} roughness={0.24} />
      </mesh>
    </group>
  );
}

function Pointer({ kick, reducedMotion }: { kick: { current: number }; reducedMotion: boolean }) {
  const flap = useRef<Group>(null);
  const vel = useRef(0);
  const shape = useMemo(() => {
    const next = new Shape();
    next.moveTo(0, 0);
    next.lineTo(0.11, -0.08);
    next.lineTo(0, -0.34);
    next.lineTo(-0.11, -0.08);
    next.closePath();
    return next;
  }, []);

  useFrame((_, dt) => {
    const node = flap.current;
    if (!node) return;
    const step = Math.min(dt, 0.05);
    if (kick.current) {
      vel.current -= reducedMotion ? 0 : kick.current;
      kick.current = 0;
    }
    const angle = node.rotation.z;
    vel.current += (-angle * 240 - vel.current * 14) * step;
    node.rotation.z = angle + vel.current * step;
  });

  return (
    <group position={[0, WHEEL_R - 0.02, 0.1]}>
      <mesh position={[0, 0.08, -0.02]}>
        <boxGeometry args={[0.28, 0.1, 0.08]} />
        <meshStandardMaterial color="#d5d7de" metalness={0.75} roughness={0.28} />
      </mesh>
      <group ref={flap}>
        <mesh>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color="#f6f3ec" metalness={0.62} roughness={0.28} />
        </mesh>
      </group>
    </group>
  );
}

function Lever({ pull }: { pull: number }) {
  const group = useRef<Group>(null);
  const pulling = useRef(false);
  const seen = useRef(pull);
  useEffect(() => {
    if (pull !== seen.current) {
      seen.current = pull;
      pulling.current = true;
    }
  }, [pull]);
  useFrame((_, dt) => {
    const node = group.current;
    if (!node) return;
    const target = pulling.current ? 0.85 : 0.15;
    node.rotation.x += (target - node.rotation.x) * Math.min(1, dt * 8);
    if (pulling.current && node.rotation.x > 0.78) pulling.current = false;
  });
  return (
    <group ref={group} position={[1.05, -1.62, 0.72]}>
      <mesh>
        <cylinderGeometry args={[0.035, 0.045, 0.48, 12]} />
        <meshStandardMaterial color="#eceff4" metalness={0.8} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color="#d10f2b" roughness={0.38} />
      </mesh>
    </group>
  );
}
