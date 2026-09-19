# Saffron QA

Saffron is the sixth sprite car. The base asset is `v_saffron.PNG`; the dragon is `vtm_saffron.PNG`. No persisted selection needs a compatibility alias.

## Measurements

Bounds are half-open source-pixel rectangles, measured from the connected opaque artwork (alpha > 128), excluding detached low-alpha noise. Hulls were traced in source pixels and converted to logical car units using the same uniform fit as `spriteFrame()`.

| Model | Sheet | Bounds (x, y, width, height) | Exhaust centres | Race sizing |
| --- | --- | --- | --- | --- |
| Base | 1024 × 1536 | 194, 45, 634, 1390 | 473,1359; 552,1359 | 1.25× shared box |
| Dragon | 1199 × 1312 | 8, 10, 1183, 1282 | 354,577; 843,577; 582,749; 620,749; 378,871; 820,871 | Two lane widths |

`racerModel()` switches sprite, hull and exhaust together. The dragon polygon follows wing concavities, limbs, fuselage and tail; its size is computed from `laneW`. The base polygon excludes empty corners and diffuser decoration. Assets are unchanged.

## Lifecycle and interactions

Every racer owns `saffronPhase`, `saffronT` and `saffronLift`. Phases are off, rise, air and drop. Both transitions reuse `WHITEOUT_TIME`, `MORPH_TIME`, `startWhiteout()` and `startMorph()`. The return reveals the ordinary car before a 0.26-second accelerating drop. Cleanup runs on race reset, wreck and finish.

Altitude never alters canonical lane, X, Y, metres, biome or race ordering. The airborne pass renders after road objects, with a grounding cue at the road position. `noContact()` rejects airborne road interactions; `refusesDebuffs()` deliberately does not reject flight. Mind Control can lock controls and force the canonical lane while the ultimate keeps ticking.

The falling-meteor interception sweep checks every driver type. A struck meteor produces destruction effects and is removed before detonation. Ground hazards are neither collected nor smashed. Touchdown uses the normal measured hull, checks every overlap, respects protection and credits the existing wreck lifecycle. A short contact guard prevents processing the same landing as a rear-end.

## Automated coverage

The existing ultimate suite covers all driver types, shared timing, road hazards, Mind Control, meteor interception, return/drop, finish cleanup and multi-target touchdown. Sprite checks cover two/six emitters at three sizes and tilts, phone/desktop/2–4-column sizing, draw order and render purity. Geometry is available before image loading.
