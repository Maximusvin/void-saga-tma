import { Container, Graphics } from 'pixi.js';

// An authored, layered "void mage" built entirely from Pixi Graphics primitives
// (same idiom as the production AngelShowcaseScene). Each moving part lives in
// its own container with a deliberate pivot, so the animator can breathe the
// body, nod the head and swing the hair independently — the whole point of the
// "procedural layered" approach. Design space: feet at (0,0), character grows
// upward into negative Y, ~340 units tall.

export interface HeroRig {
  root: Container;
  /** Robe + shoulders + chest core. Breathes (scale about the feet). */
  body: Container;
  /** Head + face + fringe. Nods about the neck pivot. */
  head: Container;
  /** Hair mass behind the head. Sways about the scalp. */
  backHair: Container;
  /** Long side braid. Swings more, and lags, about the temple. */
  braid: Container;
  /** Eyes, pivoted on the eye-line so scale.y = blink. */
  eyes: Container;
  /** Chest core glow, pivoted on itself so scale = pulse. */
  core: Graphics;
  /** Full-body additive flash for the tap reaction. */
  flash: Graphics;
  designHeight: number;
}

const ROBE_DARK = 0x241a45;
const ROBE_MID = 0x3b2c6e;
const ROBE_TRIM = 0x8a6bff;
const HAIR_DARK = 0x5a3fa6;
const HAIR_LIGHT = 0xb9a2ff;
const SKIN = 0xe4d7ef;
const SKIN_SHADE = 0xc9b6e0;
const CYAN = 0x8ef8ff;

export function buildHeroRig(): HeroRig {
  const root = new Container();

  // ---- hair behind the head ----
  const backHair = new Container();
  const backHairShape = new Graphics()
    .ellipse(0, -250, 52, 68)
    .fill({ color: HAIR_DARK })
    .ellipse(28, -212, 20, 46)
    .fill({ color: HAIR_DARK });
  backHair.addChild(backHairShape);
  backHair.pivot.set(0, -294);
  backHair.position.set(0, -294);

  // ---- body / robe ----
  const body = new Container();
  const robe = new Graphics()
    .moveTo(-78, -6)
    .lineTo(-46, -196)
    .quadraticCurveTo(0, -226, 46, -196)
    .lineTo(78, -6)
    .quadraticCurveTo(0, -32, -78, -6)
    .fill({ color: ROBE_MID });
  const robeShade = new Graphics()
    .moveTo(10, -196)
    .lineTo(78, -6)
    .quadraticCurveTo(20, -30, 8, -12)
    .fill({ color: ROBE_DARK, alpha: 0.4 });
  const trim = new Graphics()
    .moveTo(0, -206)
    .lineTo(0, -14)
    .stroke({ color: ROBE_TRIM, width: 3, alpha: 0.55 });
  const collar = new Graphics()
    .moveTo(-42, -196)
    .quadraticCurveTo(0, -236, 42, -196)
    .quadraticCurveTo(0, -212, -42, -196)
    .fill({ color: ROBE_DARK });
  const pauldrons = new Graphics()
    .ellipse(-54, -190, 23, 17)
    .fill({ color: ROBE_DARK })
    .ellipse(54, -190, 23, 17)
    .fill({ color: ROBE_DARK });
  const core = new Graphics()
    .circle(0, 0, 21)
    .fill({ color: CYAN, alpha: 0.1 })
    .circle(0, 0, 12)
    .fill({ color: CYAN, alpha: 0.24 })
    .circle(0, 0, 5)
    .fill({ color: 0xffffff, alpha: 0.55 });
  core.blendMode = 'add';
  core.position.set(0, -150);
  body.addChild(robe, robeShade, trim, collar, pauldrons, core);

  // ---- head ----
  const head = new Container();
  const face = new Graphics()
    .ellipse(0, -250, 34, 41)
    .fill({ color: SKIN })
    .ellipse(12, -250, 22, 39)
    .fill({ color: SKIN_SHADE, alpha: 0.3 });
  const eyes = new Container();
  const eyeGlow = new Graphics()
    .circle(-12, 0, 8)
    .fill({ color: CYAN, alpha: 0.16 })
    .circle(12, 0, 8)
    .fill({ color: CYAN, alpha: 0.16 });
  eyeGlow.blendMode = 'add';
  const eyeDots = new Graphics()
    .ellipse(-12, 0, 4.6, 7)
    .fill({ color: CYAN })
    .ellipse(12, 0, 4.6, 7)
    .fill({ color: CYAN });
  eyes.addChild(eyeGlow, eyeDots);
  eyes.position.set(0, -251);
  const fringe = new Graphics()
    .moveTo(-36, -276)
    .lineTo(-30, -246)
    .lineTo(-18, -272)
    .lineTo(-6, -248)
    .lineTo(6, -274)
    .lineTo(18, -250)
    .lineTo(30, -272)
    .lineTo(36, -276)
    .quadraticCurveTo(0, -302, -36, -276)
    .fill({ color: HAIR_LIGHT });
  head.addChild(face, eyes, fringe);
  head.pivot.set(0, -218);
  head.position.set(0, -218);

  // ---- long side braid ----
  const braid = new Container();
  const braidStrand = new Graphics()
    .moveTo(-30, -262)
    .quadraticCurveTo(-48, -210, -42, -168)
    .quadraticCurveTo(-38, -138, -34, -116)
    .quadraticCurveTo(-25, -140, -26, -172)
    .quadraticCurveTo(-23, -216, -16, -260)
    .fill({ color: HAIR_LIGHT });
  const braidSegments = new Graphics()
    .ellipse(-39, -196, 8, 6)
    .fill({ color: HAIR_DARK, alpha: 0.5 })
    .ellipse(-36, -160, 8, 6)
    .fill({ color: HAIR_DARK, alpha: 0.5 })
    .ellipse(-31, -126, 7, 5)
    .fill({ color: HAIR_DARK, alpha: 0.5 });
  braid.addChild(braidStrand, braidSegments);
  braid.pivot.set(-28, -262);
  braid.position.set(-28, -262);

  // ---- tap flash ----
  const flash = new Graphics()
    .ellipse(0, -158, 98, 152)
    .fill({ color: 0xffffff, alpha: 1 });
  flash.blendMode = 'add';
  flash.alpha = 0;

  // paint order: back hair, body, braid, head, flash
  root.addChild(backHair, body, braid, head, flash);

  return { root, body, head, backHair, braid, eyes, core, flash, designHeight: 340 };
}
