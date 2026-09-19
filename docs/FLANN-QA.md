# Flann QA

Flann’s active ultimate retains the shared 75-second charge, 15-second duration and 2× pace. Its sprite, race scale, exhaust and measured hull are unchanged.

`offensiveRam(by, victim)` only succeeds when the initiator is an ulting Flann and the victim is not another ulting Flann. Both `rearEnd(who, victim)` and `bumpTarget(victim, dir, by)` supply that initiator. Incoming contacts use ordinary shunt/barge rules. Existing Verdant priority runs first: an ulting Flann and ulting Verdant mutually wreck in either direction. Protection, Neela exchanges and two-Flann cancellation remain intact.

The fire renderer clips seven hot engine/body pockets to Flann’s hull and roots outer tongues inside the body. White/yellow cores, orange edges and additive glow follow the car’s rotation and size. Reduced motion holds the fire static. Ordinary boost, boost cans and other cars cannot ignite this layer. Rendering mutates no race state.

The ultimate validator covers outgoing and incoming rear-end/barge contacts for player, bot and local-human drivers and every pair of ulting cars. Sprite checks cover activation, expiry, tilt, sizes, reduced motion and rendering purity. Tumbleweed/meteor privileges and puddle vulnerability remain covered.
