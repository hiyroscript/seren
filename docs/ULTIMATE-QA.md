# Ultimate QA

Run `node tools/ultimate-check.mjs`, together with `check.mjs`, `menu-check.mjs`, `sprite-check.mjs` and `hitbox-check.mjs` in `tools/`.

All six cars retain the shared 85-second charge, 15-second duration and 2× pace. Player, bot and local human use the same lifecycle. Tests cover charging, activation, repeat presses, expiry, custom rules, debuffs, finish, wreck/reset and pause.

## Contact order

1. Finished, wrecked, invulnerable, absent Aero-Glow and airborne racers do not make road contact.
2. Flann and ulting Verdant mutually wreck regardless of initiator. Other Verdant rules retain priority.
3. Neela’s alternate-form exchange takes precedence over the ordinary ram.
4. Only Flann-initiated contact can apply the offensive ram; two ulting Flanns cancel it.
5. Other contacts use ordinary shunts and barges.

Saffron’s touchdown is a separate top-down measured-hull impact using the existing wreck lifecycle, not Flann’s ram. It checks all genuine overlaps and skips protected/absent/airborne racers.

## Car-specific acceptance

- Flann: directional collision, body fire only during ultimate, tumbleweed/meteor privilege, puddle vulnerability.
- Neela: shared model switch, white/morph transitions, exchange, canonical pose, trail and hazard rules.
- Lolanthe: canonical-distance aura, Mind Control condition/input lock and forced lane change. Airborne Saffron remains reachable; absent Rhosyn and ulting Verdant do not.
- Verdant: per-view visibility, directional defensive collisions and mutual Flann interaction.
- Rhosyn: canonical travel while isolated, Ponu-inspired black/pink world, owner-only distance/place/ladder removal, current-track restoration and post-return protection.
- Saffron: two/six anchored exhausts, two-lane dragon, rise/air/drop, per-view whiteout, road isolation, meteor interception, landing overlap and finish cleanup.

See [SAFFRON-QA.md](SAFFRON-QA.md), [RHOSYN-QA.md](RHOSYN-QA.md), [FLANN-QA.md](FLANN-QA.md), and the retained Neela/Lolanthe/Verdant QA reports for focused details. Automated checks use DOM/Canvas doubles; they do not certify hardware controller behaviour.
