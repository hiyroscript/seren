'use strict';

/* ============================================================================
   2. LOCALIZATION — every player-facing string lives here
   ========================================================================== */
var I18N = {
  en: {
    langTitle: 'Choose your language',
    langNote: 'You can change this later in Settings.',
    start: 'START GAME', settings: 'SETTINGS', howTo: 'HOW TO PLAY', back: 'BACK',
    circleSettings: ['SETTINGS'], circleHowTo: ['HOW TO', 'PLAY'], circleMarble: ['MARBLE', 'COLOR'], circleCpu: ['CPU', 'INTELLIGENCE'],
    cpuTitle: 'CPU INTELLIGENCE',
    cpuEasy: 'EASY', cpuNormal: 'NORMAL', cpuHard: 'HARD', cpuBrutal: 'BRUTAL',
    dEasy: 'Slow to read the track. Picks poor columns, lets chances to shove go by, and races to survive.',
    dNormal: 'Balanced. Reads the obvious hazards, shoves when it helps, and still makes mistakes.',
    dHard: 'Quick and calculating. Holds strong columns, pressures rivals, and shoves on purpose.',
    dBrutal: 'Reads the whole track ahead, fights for every column, and will put you into a wall to pass you.',
    position: 'POS', finishPos: 'Finish',
    marbleTitle: 'MARBLE COLOR',
    cBlue: 'BLUE', cRed: 'RED', cGreen: 'GREEN', cYellow: 'YELLOW',
    cPink: 'PINK', cPurple: 'PURPLE',
    language: 'Language', volume: 'Sound effects', mute: 'Mute',
    effects: 'Visual effects', full: 'Full', reduced: 'Reduced',
    howToTitle: 'HOW TO PLAY',
    htLanes: 'Swipe left or right to change column.',
    htCrouch: 'Swipe down and hold to duck under a barrier.',
    htObstacles: 'Dodge the black shapes. A square blocks one column.',
    htHit: 'A hit removes you for two seconds, then you respawn.',
    htWalls: 'Barriers marked with chevrons can only be passed by crouching.',
    htMystery: 'Small ? squares disappear when the first racer touches them. They last 10 seconds and blink before expiring. They grant nothing yet.',
    htGoal: 'Speed climbs to {max}x, then the finish line is planted: cross it and you roll out into the place you took.',
    htLanesKb: 'A / D or the arrow keys change column.',
    htCrouchKb: 'Hold S, Down or Space to crouch under a barrier.',
    htKeys: 'Escape pauses the run at any time.',
    paused: 'PAUSED', resume: 'RESUME', restart: 'RESTART', home: 'HOME',
    complete: 'RUN COMPLETE', distance: 'Distance', collisions: 'Collisions', finalSpeed: 'Final speed',
    playAgain: 'PLAY AGAIN', returnHome: 'RETURN HOME',
    final: 'FINAL', toLine: 'LINE', go: 'GO', meters: 'm',
    rotate: 'Rotate your device', rotateNote: 'SEREN is played in portrait.',
    landscape: 'Widen your window', landscapeNote: 'SEREN needs a landscape window on desktop.'
  },
  fr: {
    langTitle: 'Choisissez votre langue',
    langNote: 'Vous pourrez la changer dans les Paramètres.',
    start: 'COMMENCER', settings: 'PARAMÈTRES', howTo: 'COMMENT JOUER', back: 'RETOUR',
    circleSettings: ['PARAMÈTRES'], circleHowTo: ['COMMENT', 'JOUER'], circleMarble: ['COULEUR', 'BILLE'], circleCpu: ['NIVEAU', 'DES BOTS'],
    cpuTitle: 'INTELLIGENCE DES BOTS',
    cpuEasy: 'FACILE', cpuNormal: 'NORMAL', cpuHard: 'DIFFICILE', cpuBrutal: 'BRUTAL',
    dEasy: 'Lent à lire la piste. Choisit mal ses colonnes, laisse passer les occasions et cherche surtout à survivre.',
    dNormal: 'Équilibré. Évite les dangers évidents, bouscule quand c\u2019est utile, et se trompe encore.',
    dHard: 'Rapide et calculateur. Tient les bonnes colonnes, met la pression et bouscule volontairement.',
    dBrutal: 'Lit toute la piste, se bat pour chaque colonne, et vous poussera dans un mur pour passer.',
    position: 'POS', finishPos: 'Arrivée',
    marbleTitle: 'COULEUR DE BILLE',
    cBlue: 'BLEU', cRed: 'ROUGE', cGreen: 'VERT', cYellow: 'JAUNE',
    cPink: 'ROSE', cPurple: 'VIOLET',
    language: 'Langue', volume: 'Effets sonores', mute: 'Muet',
    effects: 'Effets visuels', full: 'Complets', reduced: 'Réduits',
    howToTitle: 'COMMENT JOUER',
    htLanes: 'Glissez à gauche ou à droite pour changer de colonne.',
    htCrouch: 'Glissez vers le bas et maintenez pour rester baissé.',
    htObstacles: 'Évitez les formes noires. Un carré bloque une colonne.',
    htHit: 'Un choc vous retire deux secondes, puis vous réapparaissez.',
    htWalls: 'Les barrières marquées de chevrons se franchissent uniquement en se baissant.',
    htMystery: 'Les petits carrés ? disparaissent au contact du premier coureur. Ils durent 10 secondes et clignotent avant de disparaître. Ils ne donnent rien pour le moment.',
    htGoal: 'La vitesse monte jusqu\u2019à {max}x, puis la ligne d\u2019arrivée est posée : franchissez-la et vous roulez jusqu\u2019à la place que vous avez prise.',
    htLanesKb: 'A / D ou les flèches changent de colonne.',
    htCrouchKb: 'Maintenez S, Bas ou Espace pour vous baisser sous une barrière.',
    htKeys: 'Échap met la course en pause à tout moment.',
    paused: 'PAUSE', resume: 'REPRENDRE', restart: 'RECOMMENCER', home: 'ACCUEIL',
    complete: 'COURSE TERMINÉE', distance: 'Distance', collisions: 'Chocs', finalSpeed: 'Vitesse finale',
    playAgain: 'REJOUER', returnHome: 'ACCUEIL',
    final: 'FINAL', toLine: 'LIGNE', go: 'PARTEZ', meters: 'm',
    rotate: 'Tournez votre appareil', rotateNote: 'SEREN se joue en mode portrait.',
    landscape: 'Élargissez la fenêtre', landscapeNote: 'SEREN nécessite une fenêtre en mode paysage.'
  }
};
function t(key) {
  var pack = I18N[Settings.lang] || I18N.en;
  var v = pack[key] !== undefined ? pack[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
  /* the one number in the prose that is a balancing value rather than a
     translation: the tutorial quotes the ceiling, so it reads it from CFG */
  if (typeof v === 'string' && v.indexOf('{max}') >= 0) {
    v = v.replace('{max}', CFG.SPEED_MAX.toFixed(2));
  }
  return v;
}
function numFmt(n) {
  try { return Math.floor(n).toLocaleString(Settings.lang === 'fr' ? 'fr-FR' : 'en-US'); }
  catch (e) { return String(Math.floor(n)); }
}
