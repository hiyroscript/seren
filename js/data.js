"use strict";

/* SEREN - the game's definitions and tuning numbers. Cars, difficulties,
   temperaments, conditions, items, tracks and every constant the systems read.
   Loaded before runtime.js because the global state object is built from
   some of these. Nothing here has behaviour of its own. */

/* Mystery Bubble film and durability HUD share the same three hues. */
const BUBBLE_TINTS = { pink:"#FF8CE1", yellow:"#FFEB96", cyan:"#78EBFF" };
const SHIELD_COLORS = [BUBBLE_TINTS.pink, BUBBLE_TINTS.yellow, BUBBLE_TINTS.cyan];
const SHIELD_GRADIENTS = [
  [[0, "#FFD0F1"], [.5, SHIELD_COLORS[0]], [1, "#CF58AF"]],
  [[0, "#FFF7CD"], [.5, SHIELD_COLORS[1]], [1, "#D3B957"]],
  [[0, "#C8F7FF"], [.5, SHIELD_COLORS[2]], [1, "#3AB3CC"]]
];
const SHIELD_HIT_TIME = 1;
const SHIELD_BARS = SHIELD_COLORS.length;
const SHIELD_HALVES_PER_BAR = 2;
const SHIELD_MAX = SHIELD_BARS*SHIELD_HALVES_PER_BAR;

const CARS = {
  flann: {
    key:"flann", style:"sprite", sprite:"v_flann.PNG", accent:"#FF4A50",
    /* How large this car is on the road, as a multiple of the shared carW/carH
       every other car is drawn and collided at. Flann alone reads undersized
       against the lane it is sitting in, so it gets a little over a tenth back
       and nothing else changes: the scale is uniform, so the PNG's aspect ratio,
       its measured bounds and its exhaust anchors are all untouched, and the
       body ends up occupying about 71% of a lane instead of 64%.

       This is a race-only number. carDims() in runtime.js is the one place that
       reads it, and the menus size their own preview, so the garage and the
       select screen are exactly as they were. */
    raceScale:1.12,
    /* Normalized source pixels: visible body bounds (173,72)-(851,1409).
       Each anchor sits just inside one paired rear exhaust cluster. Keep
       the full PNG when drawing; bounds only control its scale and centre. */
    spriteBounds:[173/1024, 72/1536, 678/1024, 1337/1536],
    exhaust:[[355/1024, 1377/1536], [669/1024, 1377/1536]],
    /* Inset body in logical car units: excludes padding, tires and exhaust. */
    hitShape:[[-0.22,-0.42],[0.22,-0.42],[0.36,-0.30],[0.38,0.30],
              [0.26,0.42],[-0.26,0.42],[-0.38,0.30],[-0.36,-0.30]],
    flame:["#FF7A3A","#FFD9A0"]
  },
  /* ---- Neela ----------------------------------------------------
     The second sprite car, and the second ultimate that does more than run
     fast. Its geometry is measured off v_neela.PNG and vtm_neela.PNG and off
     nothing else - none of it is Flann's, which is a different car in a
     different shape.

     v_neela.PNG is 1024x1536 with the body inside (220,25)-(803,1422), so the
     visible artwork is 584 x 1398: a much narrower, longer car than Flann's
     679 x 1337. Sized into the shared car box that leaves the body covering
     barely half a lane while every other car covers about two thirds, which is
     what the race scale below is for and all it is for.

     The two exhaust anchors are the centres of the measured chrome outlets at
     (325,1334)-(378,1376) and (645,1336)-(698,1376). The hull traces the core
     body row by row - the nose taper, the waist between the wheels, the rear
     arches - and stops short of the diffuser blade under the tail. */
  neela: {
    key:"neela", style:"sprite", sprite:"v_neela.PNG", accent:"#4DA8FF",
    /* Measured: at 1:1 the body is 0.777 of the shared car box across, so it
       reads as half a lane against cars that fill two thirds of one. Eighteen
       per cent brings it to a shade under the box - still the narrowest car on
       the road, which is what the artwork is - without making it so long that
       the hull stops being a car's. Uniform, so the aspect ratio, the measured
       bounds, the anchors and the hull all scale together. */
    raceScale:1.18,
    /* Normalized source pixels: visible body bounds (220,25)-(803,1422).
       Keep the full PNG when drawing; bounds only control its scale and
       centre. */
    spriteBounds:[220/1024, 25/1536, 584/1024, 1398/1536],
    /* The measured centre of each rear outlet, inside the chrome. */
    exhaust:[[352/1024, 1355/1536], [671/1024, 1355/1536]],
    /* Blue energy out of the pipes rather than fire: same anchors, same
       transform, a different look. drawSpriteCar() reads this. */
    exhaustStyle:"energy",
    /* Inset body in logical car units, traced off the measured silhouette:
       nose taper, shoulders, the waist between the wheels, the rear arches.
       Excludes the transparent corners and the diffuser blade under the tail. */
    hitShape:[[0,-0.464],[0.200,-0.346],[0.314,-0.239],[0.266,-0.128],
              [0.269,0.011],[0.309,0.194],[0.378,0.305],[0.325,0.376],
              [0.261,0.444],[0,0.475],[-0.261,0.444],[-0.325,0.376],
              [-0.378,0.305],[-0.309,0.194],[-0.269,0.011],[-0.266,-0.128],
              [-0.314,-0.239],[-0.200,-0.346]],
    flame:["#2E9BFF","#EAFBFF"],
    /* ---- the alternate form ----
       What Neela races as while its ultimate is running, until the first racer
       it touches. Its own sprite, its own measured bounds, its own emitter and
       its own hull: racerModel() hands this to the renderer and to carHit()
       together, so the body being drawn and the body being collided are never
       two different shapes.

       vtm_neela.PNG is the same 1024x1536 sheet with the craft inside
       (228,22)-(795,1506) - 568 x 1485, most of that extra length being the
       energy blade under the tail. `scale` is measured, not chosen: at 1.09 of
       the racer's own box the craft's fuselage and fin span come out the same
       size as the car it replaced, so the transformation changes the shape on
       the road and not how much road it takes up. */
    altForm:{
      key:"neelaAlt", style:"sprite", sprite:"vtm_neela.PNG", accent:"#4DA8FF",
      scale:1.09,
      spriteBounds:[228/1024, 22/1536, 568/1024, 1485/1536],
      /* the measured centre of the main thruster mouth, (442,1265)-(582,1347) */
      exhaust:[[512/1024, 1306/1536]],
      exhaustStyle:"energy",
      /* and the root of the long trail, which is the same emitter */
      trailRoot:[512/1024, 1306/1536],
      /* Traced off the alternate silhouette: nose, fuselage, the swept mid
         fins out to their measured tips, the waist and the rear flare. It
         stops at the base of the tail fork - the rear fin blades and the
         energy spike below are trailing edges, not body. */
      hitShape:[[0,-0.481],[0.100,-0.397],[0.163,-0.286],[0.175,-0.138],
                [0.220,-0.039],[0.354,0.083],[0.200,0.091],[0.168,0.165],
                [0.130,0.243],[0.251,0.353],[0,0.364],[-0.251,0.353],
                [-0.130,0.243],[-0.168,0.165],[-0.200,0.091],[-0.354,0.083],
                [-0.220,-0.039],[-0.175,-0.138],[-0.163,-0.286],[-0.100,-0.397]],
      flame:["#2E9BFF","#EAFBFF"]
    }
  },
  /* ---- Lolanthe ---------------------------------------------------
     The third sprite car, and the third ultimate that does more than run
     fast. Its geometry is measured off v_lolanthe.PNG and off nothing else.

     v_lolanthe.PNG is 1024x1536 with the body inside (90,12)-(933,1477), so
     the visible artwork is 844 x 1466: a broad, heavy-shouldered car, wider
     against its own length than any other on the road. Sized into the shared
     car box it is the width that runs out first rather than the height - the
     body fills the box across and 93% of it down - so it already reads as a
     full car in its lane and carries no race scale at all. Flann's is 1.12
     and Neela's 1.18 because their artwork is narrow; this one's is not.

     The two exhaust anchors are the centres of the measured oval outlets in
     the rear valance, (422,1343)-(488,1366) and (535,1343)-(602,1366). The
     hull traces the crown of the front wing, the front fenders, the waist
     between the wheels and the rear arches, and stops short of the gold
     spikes trailing off the rear corners. */
  lolanthe: {
    key:"lolanthe", style:"sprite", sprite:"v_lolanthe.PNG", accent:"#B36BFF",
    /* Normalized source pixels: visible body bounds (90,12)-(933,1477).
       Keep the full PNG when drawing; bounds only control its scale and
       centre. */
    spriteBounds:[90/1024, 12/1536, 844/1024, 1466/1536],
    /* The measured centre of each rear outlet, inside the rim. */
    exhaust:[[455/1024, 1354/1536], [568/1024, 1354/1536]],
    /* Inset body in logical car units, traced off the measured silhouette.
       Excludes the transparent corners, the nose ornament above the crown and
       the gold spikes trailing off the rear corners. */
    hitShape:[[0,-0.406],[0.220,-0.379],[0.374,-0.320],[0.396,-0.264],
              [0.335,-0.169],[0.263,-0.108],[0.338,0.010],[0.358,0.086],
              [0.456,0.183],[0.493,0.275],[0.436,0.366],[0.209,0.389],
              [0,0.399],[-0.209,0.389],[-0.436,0.366],[-0.493,0.275],
              [-0.456,0.183],[-0.358,0.086],[-0.338,0.010],[-0.263,-0.108],
              [-0.335,-0.169],[-0.396,-0.264],[-0.374,-0.320],[-0.220,-0.379]],
    flame:["#B36BFF","#F2E2FF"]
  },
  /* ---- Verdant ----------------------------------------------------
     The fourth sprite car. v_verdant.PNG is 1024x1536 with the body inside
     (167,36)-(856,1508), so the visible artwork is 690 x 1473: long and
     narrow, closer to Neela's proportions than to Lolanthe's.

     Measured: at 1:1 the body is 0.871 of the shared car box across, against
     Flann's 1.056 and Lolanthe's 1.000 once their own scales are counted, so
     it reads a little thin in the lane it is sitting in. A tenth brings it to
     0.958 - still the second narrowest car on the road, which is what the
     artwork is. Uniform, so the aspect ratio, the measured bounds, the anchor
     and the hull all scale together.

     One exhaust anchor, because the artwork has one outlet: the side-exit
     pipe on the right, whose bore is measured at (723,1307)-(754,1321). The
     slatted box under the tail is a diffuser and has no bore, so nothing is
     drawn out of it. The hull traces the nose, the front fenders, the waist
     at the wheel gap and the rear arches, and stops at the root of the swept
     rear blades - they and the pipe are trailing edges, not body. */
  verdant: {
    key:"verdant", style:"sprite", sprite:"v_verdant.PNG", accent:"#6BC46B",
    raceScale:1.10,
    /* Normalized source pixels: visible body bounds (167,36)-(856,1508).
       Keep the full PNG when drawing; bounds only control its scale and
       centre. */
    spriteBounds:[167/1024, 36/1536, 690/1024, 1473/1536],
    /* The measured centre of the pipe's bore. */
    exhaust:[[738/1024, 1314/1536]],
    /* Inset body in logical car units, traced off the measured silhouette. */
    hitShape:[[0,-0.481],[0.063,-0.457],[0.139,-0.410],[0.280,-0.313],
              [0.361,-0.215],[0.345,-0.019],[0.304,0.013],[0.356,0.070],
              [0.431,0.222],[0.415,0.290],[0.318,0.324],[0.205,0.378],
              [0,0.397],[-0.205,0.378],[-0.318,0.324],[-0.415,0.290],
              [-0.431,0.222],[-0.356,0.070],[-0.304,0.013],[-0.345,-0.019],
              [-0.361,-0.215],[-0.280,-0.313],[-0.139,-0.410],[-0.063,-0.457]],
    flame:["#6BC46B","#E4FFD9"]
  },
  /* Source-pixel measurements exclude low-alpha fringe and detached pixels.
     Hulls follow the solid body; diffuser tips are decorative. */
  rhosyn: {
    key:"rhosyn", style:"sprite", sprite:"v_rhosyn.PNG", accent:"#FF4D93",
    raceScale:1.14,
    spriteBounds:[162/1024,73/1536,701/1024,1363/1536],
    exhaust:[[483/1024,1366/1536],[544/1024,1366/1536]],
    hitShape:[[-0.05527, -0.49633], [0.05254, -0.49633], [0.27634, -0.45304], [0.37323, -0.354], [0.39233, -0.23074], [0.30363, -0.12216], [0.31728, -0.02825], [0.44146, 0.2212], [0.44828, 0.34813], [0.3705, 0.45158], [0.06618, 0.46698], [-0.06346, 0.46698], [-0.37186, 0.45158], [-0.44965, 0.34813], [-0.44282, 0.2212], [-0.31864, -0.02825], [-0.305, -0.12216], [-0.3937, -0.23074], [-0.37459, -0.354], [-0.2777, -0.45304]],
    flame:["#FF2E9E","#FFD9F2"]
  },
  saffron: {
    key:"saffron", style:"sprite", sprite:"v_saffron.PNG", accent:"#FF941F",
    raceScale:1.25,
    spriteBounds:[194/1024,45/1536,634/1024,1390/1536],
    exhaust:[[473/1024,1359/1536],[552/1024,1359/1536]],
    hitShape:[[0.00134, -0.49568], [0.17262, -0.43381], [0.34256, -0.33957], [0.36531, -0.2554], [0.29974, -0.18993], [0.32115, -0.06619], [0.34658, 0.06043], [0.40679, 0.23741], [0.38538, 0.36331], [0.34524, 0.43022], [0.06155, 0.45396], [-0.05486, 0.45396], [-0.35327, 0.43022], [-0.39475, 0.36331], [-0.40679, 0.23741], [-0.34658, 0.06043], [-0.31847, -0.06619], [-0.29706, -0.18993], [-0.36263, -0.2554], [-0.34524, -0.33957], [-0.16994, -0.43381]],
    flame:["#FF8A24","#FFF0BA"],
    altForm:{
      key:"saffronAlt", style:"sprite", sprite:"vtm_saffron.PNG", accent:"#FF941F",
      laneSpan:2,
      spriteBounds:[8/1199,10/1312,1183/1199,1282/1312],
      exhaust:[[354/1199,577/1312],[843/1199,577/1312],
               [582/1199,749/1312],[620/1199,749/1312],
               [378/1199,871/1312],[820/1199,871/1312]],
      hitShape:[[-0.00296, -0.2795], [0.04691, -0.20587], [0.03931, -0.15316], [0.10609, -0.13589], [0.21175, -0.18542], [0.45943, -0.16679], [0.49408, -0.0259], [0.41462, -0.06408], [0.27346, -0.08589], [0.18047, -0.08499], [0.15173, -0.05726], [0.21851, -0.04908], [0.23964, -0.01136], [0.16188, -0.02363], [0.11369, -0.03908], [0.08242, -0.00954], [0.15173, 0.0768], [0.21175, 0.10135], [0.18047, 0.12816], [0.11623, 0.10907], [0.06128, 0.06817], [0.0317, 0.14634], [0.04607, 0.22178], [0.00127, 0.28268], [-0.04269, 0.22178], [-0.03085, 0.14634], [-0.06128, 0.06817], [-0.11623, 0.10907], [-0.18047, 0.12816], [-0.21175, 0.10135], [-0.15173, 0.0768], [-0.08242, -0.00954], [-0.11369, -0.03908], [-0.16188, -0.02363], [-0.23964, -0.01136], [-0.21851, -0.04908], [-0.15173, -0.05726], [-0.18047, -0.08499], [-0.27346, -0.08589], [-0.41462, -0.06408], [-0.49408, -0.0259], [-0.45943, -0.16679], [-0.21175, -0.18542], [-0.10609, -0.13589], [-0.03931, -0.15316], [-0.04691, -0.20587]],
      flame:["#FF8A24","#FFF0BA"]
    }
  },
  /* Independently measured solid-alpha bounds (alpha > 127), source pixels.
     Faint detached pixels are excluded. Hulls trace body and wheels, inset
     from antialiasing; the car mirrors and rear diffuser tips are decorative.
     Uniform fits: car 1.12 box widths; bike ~0.70 box widths, 1.25 box heights.
     Four car bores and two bike bores, measured individually inside their rims. */
  cole: {
    key:"cole", style:"sprite", sprite:"v_cole.PNG", accent:"#C5CBD3",
    raceScale:1.12,
    spriteBounds:[276/1254,14/1254,702/1254,1222/1254],
    exhaust:[[428/1254,1195/1254],[470/1254,1201/1254],
             [783/1254,1201/1254],[825/1254,1195/1254]],
    hitShape:[[-0.12393,-0.46181],[0.11823,-0.46181],[0.16952,-0.44497],[0.27066,-0.42658],[0.37607,-0.37527],[0.39886,-0.33468],[0.44302,-0.33315],[0.46439,-0.31783],[0.46439,-0.18764],[0.41595,-0.17538],[0.40313,-0.11718],[0.39886,0.11871],[0.42593,0.17155],[0.47436,0.18074],[0.48718,0.20295],[0.48718,0.31477],[0.46439,0.33698],[0.42735,0.33851],[0.40456,0.37757],[0.36182,0.4105],[0.32764,0.42352],[0.16382,0.4465],[-0.16097,0.4465],[-0.32764,0.42352],[-0.36325,0.4105],[-0.40456,0.37757],[-0.4302,0.33851],[-0.47436,0.33698],[-0.4886,0.31477],[-0.4886,0.20295],[-0.47293,0.18074],[-0.42735,0.17155],[-0.40598,0.11871],[-0.40883,-0.11718],[-0.41738,-0.17538],[-0.45584,-0.18764],[-0.46581,-0.31783],[-0.44444,-0.33315],[-0.40883,-0.33468],[-0.38889,-0.37527],[-0.28348,-0.42658],[-0.16952,-0.44497]],
    flame:["#FF7A3A","#FFD9A0"],
    altForm:{
      key:"coleBike", style:"sprite", sprite:"vtm_cole.PNG", accent:"#C5CBD3",
      scale:1.12,
      spriteBounds:[415/1247,4/1261,420/1247,1255/1261],
      exhaust:[[557/1247,1048/1261],[691/1247,1048/1261]],
      hitShape:[[-0.00296,-0.49363],[0.04002,-0.48645],[0.05335,-0.46892],[0.05335,-0.44582],[0.083,-0.43227],[0.10375,-0.38765],[0.14376,-0.36454],[0.1734,-0.32709],[0.19267,-0.26255],[0.20897,-0.20996],[0.2564,-0.19482],[0.28604,-0.1749],[0.29197,-0.16375],[0.22083,-0.1757],[0.22083,-0.12311],[0.25047,-0.08008],[0.24899,-0.04582],[0.22676,-0.01713],[0.22527,0.02908],[0.19267,0.05538],[0.18674,0.10398],[0.17044,0.12151],[0.19415,0.20598],[0.19415,0.249],[0.14969,0.29124],[0.13783,0.35817],[0.0993,0.37888],[0.08003,0.40996],[0.05928,0.43705],[0.05632,0.46574],[0.03853,0.48566],[-0.00148,0.49363],[-0.04002,0.48566],[-0.06076,0.46574],[-0.06225,0.43705],[-0.083,0.40996],[-0.10226,0.37888],[-0.1408,0.35817],[-0.15265,0.29124],[-0.19563,0.249],[-0.19712,0.20598],[-0.1734,0.12151],[-0.18971,0.10398],[-0.19563,0.05538],[-0.22824,0.02908],[-0.2312,-0.01713],[-0.25343,-0.04582],[-0.25492,-0.08008],[-0.22379,-0.12311],[-0.22379,-0.1757],[-0.29197,-0.16375],[-0.28604,-0.1749],[-0.25492,-0.19482],[-0.21045,-0.20996],[-0.19415,-0.26255],[-0.17488,-0.32709],[-0.14524,-0.36454],[-0.10671,-0.38765],[-0.08596,-0.43227],[-0.05632,-0.44582],[-0.05632,-0.46892],[-0.04298,-0.48645]],
      flame:["#FF7A3A","#FFD9A0"]
    }
  },
  /* Dhaval: alpha > 127 bounds (125,54)-(898,1483), 774 x 1430 on
     a 1024 x 1536 sheet. Width-limited fit fills one shared car box (height
     0.9933 boxes), so no road enlargement is needed. Full sheet is preserved.
     Hull follows the nose crown, fenders, waist, wheels and rear body; the
     side wing endplates and trailing diffuser teeth are decorative.
     The single circular tailpipe bore is centred at (512,1416). */
  dhaval: {
    key:"dhaval", style:"sprite", sprite:"v_dhaval.PNG", accent:"#F2F0FF",
    spriteBounds:[125/1024,54/1536,774/1024,1430/1536],
    exhaust:[[512/1024,1416/1536]],
    hitShape:[[-0.37984496,-0.47303493],[-0.28682171,-0.491095],[-0.28552972,-0.46261565],[-0.19896641,-0.47442416],[-0.18604651,-0.48137034],[-0.05167959,-0.491095],[0.0503876,-0.491095],[0.18475452,-0.48137034],[0.19767442,-0.47442416],[0.28423773,-0.46261565],[0.28552972,-0.491095],[0.37596899,-0.47303493],[0.40697674,-0.40774082],[0.43281654,-0.40635159],[0.45219638,-0.37509377],[0.41989664,-0.36953683],[0.42377261,-0.31396738],[0.42377261,-0.24797866],[0.39922481,-0.17573838],[0.38888889,-0.11322275],[0.3875969,-0.04515018],[0.39664083,0.03125781],[0.40180879,0.08960573],[0.42377261,0.14309133],[0.44186047,0.19657692],[0.46899225,0.20074463],[0.48966408,0.29243422],[0.47028424,0.30007502],[0.44056848,0.30215887],[0.43669251,0.33411131],[0.44444444,0.35772832],[0.44702842,0.41190853],[0.38501292,0.46886722],[0.27002584,0.47720263],[0.21834625,0.47720263],[0.07622739,0.4758134],[0.0,0.47442416],[-0.07622739,0.4758134],[-0.22093023,0.47720263],[-0.27131783,0.47720263],[-0.38501292,0.46886722],[-0.44702842,0.41190853],[-0.44444444,0.35772832],[-0.43540052,0.33411131],[-0.44056848,0.30215887],[-0.46899225,0.30007502],[-0.48966408,0.29243422],[-0.46899225,0.20074463],[-0.44315245,0.19657692],[-0.42377261,0.14309133],[-0.40180879,0.08960573],[-0.39664083,0.03125781],[-0.3875969,-0.04515018],[-0.38888889,-0.11322275],[-0.39922481,-0.17573838],[-0.42377261,-0.24797866],[-0.42377261,-0.31396738],[-0.41731266,-0.36953683],[-0.45090439,-0.37509377],[-0.43152455,-0.40635159],[-0.40697674,-0.40774082]],
    flame:["#AB55E8","#FFFFFF"]
  },
  aureolin: {
    key:"aureolin", style:"sprite", sprite:"v_aureolin.PNG", accent:"#F5CF32",
    sourceSize:[1024,1536], raceScale:1.10,
    spriteBounds:[149/1024,50/1536,726/1024,1398/1536],
    exhaust:[[512/1024,1410/1536]],
    hitShape:[[-0.194249,-0.48927],[-0.28206,-0.464235],[-0.351245,-0.428469],[-0.415107,-0.392704],[-0.440386,-0.321173],[-0.428412,-0.249642],[-0.396481,-0.192418],[-0.383176,-0.092275],[-0.388498,0.000715],[-0.409785,0.108011],[-0.428412,0.165236],[-0.463004,0.215308],[-0.476309,0.286838],[-0.463004,0.358369],[-0.42309,0.394134],[-0.389828,0.4299],[-0.294034,0.462089],[-0.129056,0.479971],[0.129056,0.479971],[0.292704,0.462089],[0.388498,0.4299],[0.42176,0.394134],[0.463004,0.358369],[0.474979,0.286838],[0.463004,0.215308],[0.428412,0.165236],[0.409785,0.108011],[0.388498,0.000715],[0.381845,-0.092275],[0.39515,-0.192418],[0.427082,-0.249642],[0.439056,-0.321173],[0.413777,-0.392704],[0.349914,-0.428469],[0.28073,-0.464235],[0.192918,-0.48927]],
    flame:["#F5CF32","#FFF4B5"],
    altForm:{
      key:"aureolinArmed", style:"sprite", sprite:"vtm_aureolin.PNG", accent:"#F5CF32",
      sourceSize:[1024,1536], scale:1.08,
      spriteBounds:[120/1024,35/1536,781/1024,1453/1536],
      exhaust:[[510/1024,1430/1536]],
      turretMuzzle:[509/1024,498/1536],
      rocketMuzzles:[[161/1024,963/1536],[858/1024,963/1536]],
      hitShape:[[-0.11841,-0.479353],[-0.297626,-0.448383],[-0.417956,-0.386442],[-0.447398,-0.317619],[-0.442278,-0.248796],[-0.423076,-0.193737],[-0.392354,-0.111149],[-0.46404,-0.08362],[-0.478121,-0.007915],[-0.488362,0.09532],[-0.485802,0.150379],[-0.4602,0.198555],[-0.478121,0.267378],[-0.46916,0.336201],[-0.440998,0.370613],[-0.388513,0.405024],[-0.318107,0.439436],[-0.122251,0.463524],[0.126091,0.463524],[0.319387,0.439436],[0.389794,0.405024],[0.438438,0.370613],[0.46916,0.336201],[0.476841,0.267378],[0.4602,0.198555],[0.485802,0.150379],[0.488362,0.09532],[0.478121,-0.007915],[0.46532,-0.08362],[0.394914,-0.111149],[0.423076,-0.193737],[0.442278,-0.248796],[0.446118,-0.317619],[0.417956,-0.386442],[0.300186,-0.448383],[0.12097,-0.479353]],
      flame:["#F5CF32","#FFF4B5"]
    }
  }
};
const CAR_HIT_RECT = [[-0.40,-0.42],[0.40,-0.42],[0.40,0.42],[-0.40,0.42]];
const CAR_IDS = ["flann","neela","lolanthe","verdant","rhosyn","saffron","cole","dhaval","aureolin"];

/* ---------------- opposition -------------------------------------
   There is deliberately no charge multiplier here any more. Every car on the
   road - yours and theirs - fills its meter off the same ULT_CHARGE clock, so
   a difficulty setting changes how well a bot drives and how well it picks its
   moment, never how much sooner it gets to press the button. `ult` is still
   read: it is judgement, not rate. */
/* A difficulty is not a multiplier on anything the car does. Every one of these
   numbers describes how well the driver thinks: how far up the road it looks,
   how long it takes to act on what it sees, how often it misses something
   entirely, how well it reads what an item or an ultimate is worth right now,
   and how well it picks its moment. The car itself is the same car at every
   setting - same pace, same charge clock, same rules.

   - lapse  how often it simply fails to see trouble in its own lane
   - react  how long it takes to do something about it, in seconds
   - tick   how often it reconsiders the race at all
   - look   how much further ahead than the road in front it reads hazards
   - read   how many seconds of the future it projects other cars into
   - skill  master competence: weights the quality of every judgement below
   - hunt   how deliberately it picks an offensive target rather than lashing out
   - guard  how well it protects the place it is holding
   - judge  how well it values an item or an ultimate against the situation
   - plan   how many think-ticks an intention survives before it is thrown away
   - noise  how much of its decision is left to chance
   - block/aggro/boost/ult/keep  the old lane and throttle appetites, kept */
const DIFFS = {
  easy:   { key:"diffEasy",   lapse:0.52, react:[0.70,1.40], tick:[0.50,0.95],
            block:0.02, aggro:0.08, boost:0.10, ult:0.05, keep:0.00, look:0,
            skill:0.14, hunt:0.10, guard:0.06, judge:0.10,
            plan:0, noise:0.50, read:0.00 },
  medium: { key:"diffMedium", lapse:0.26, react:[0.35,0.75], tick:[0.34,0.68],
            block:0.16, aggro:0.24, boost:0.34, ult:0.28, keep:0.10, look:110,
            skill:0.46, hunt:0.42, guard:0.36, judge:0.46,
            plan:1, noise:0.26, read:0.35 },
  hard:   { key:"diffHard",   lapse:0.10, react:[0.18,0.42], tick:[0.22,0.46],
            block:0.44, aggro:0.50, boost:0.70, ult:0.70, keep:0.24, look:250,
            skill:0.80, hunt:0.78, guard:0.72, judge:0.82,
            plan:2, noise:0.11, read:0.80 },
  brutal: { key:"diffBrutal", lapse:0.03, react:[0.07,0.22], tick:[0.14,0.30],
            block:0.74, aggro:0.72, boost:1.00, ult:1.00, keep:0.32, look:380,
            skill:1.00, hunt:1.00, guard:1.00, judge:1.00,
            plan:3, noise:0.035, read:1.30 }
};
const DIFF_IDS = ["easy","medium","hard","brutal"];

/* ---------------- temperament ------------------------------------
   Difficulty says how well a driver thinks. Temperament says what it thinks
   about first, and it is what stops five bots on the same setting from being
   the same bot five times. Each car has a leaning that suits it - Flann is a
   brawler, Verdant sits on its ultimate waiting for the moment - and every
   race jitters it, so the Flann you raced last time is not quite this one.

   Neela, Lolanthe and Verdant each keep the leaning the car in their slot
   always had. Their ultimates do something new, but what those drivers want
   out of a race has not changed, and taking somebody's lane off them or
   disappearing for fifteen seconds is not a new appetite for hurting people.

   - nerve     what it will risk: tight gaps, hazards, a lane somebody else wants
   - spite     how much it would rather hurt somebody than simply drive faster
   - patience  how long it will sit on an item or an ultimate for a better use
   - guard     how hard it defends the place it is holding */
const TEMPERS = {
  flann:      { nerve:0.74, spite:0.86, patience:0.22, guard:0.42 },
  neela:     { nerve:0.88, spite:0.46, patience:0.44, guard:0.30 },
  lolanthe:  { nerve:0.54, spite:0.64, patience:0.68, guard:0.52 },
  verdant:   { nerve:0.38, spite:0.32, patience:0.88, guard:0.74 },
  rhosyn:    { nerve:0.62, spite:0.58, patience:0.50, guard:0.58 },
  saffron:     { nerve:0.46, spite:0.30, patience:0.66, guard:0.80 },
  cole:        { nerve:0.72, spite:0.32, patience:0.48, guard:0.58 },
  aureolin:    { nerve:0.68, spite:0.78, patience:0.60, guard:0.45 },
  dhaval:      { nerve:0.62, spite:0.70, patience:0.62, guard:0.42 }
};
function makeTemper(car){
  const b = TEMPERS[car] || TEMPERS.flann;
  const j = function(v){ return clamp(v + rand(-0.17, 0.17), 0.04, 0.98); };
  return { nerve:j(b.nerve), spite:j(b.spite), patience:j(b.patience),
           guard:j(b.guard) };
}
/* ---------------- conditions -------------------------------------
   The one table every part of the game reads a Condition out of: the badges
   beside a rival car, the badges in the corner of your own HUD, and the
   reference page in the garage. Name, colour, whether it helps or hurts and
   which icon it wears all live here and nowhere else, so a Condition cannot
   mean one thing on the road and another in the garage.

   The key order is the priority order. activeConditions() walks this object,
   so a car wearing several badges stacks them the same way every frame.

   - key    the localisation key for its name
   - col    the badge's fill, and the only colour it is ever drawn in
   - type   "buff" or "debuff": the two pages the garage splits on
   - icon   which artwork in CONDITION_PATHS it wears
   - ink    the icon's colour on that fill, picked for contrast

   Debuffs are refused, and cleared, by temporary invulnerability. */
const CONDITIONS = {
  cleansed:     { key:"condCleansed", col:"#94F4DD", type:"buff",
                  icon:"cleanse", ink:"#073F35" },
  invulnerable: { key:"condInvulnerable", col:"#FFD86B", type:"buff",
                  icon:"shield",   ink:"#20180A" },
  boosted:      { key:"condBoosted",      col:"#FF9A4A", type:"buff",
                  icon:"chevrons", ink:"#241000" },
  slowed:       { key:"condSlowed",       col:"#8A9099", type:"debuff",
                  icon:"slow",     ink:"#0B0B0C" },
  obscured:     { key:"condObscured",     col:"#B07A4A", type:"debuff",
                  icon:"eye",      ink:"#1B0F05" },
  skidded:      { key:"condSkidded",      col:"#0B0B0C", type:"debuff",
                  icon:"skid",     ink:"#FFFFFF" },
  /* Lolanthe's. Royal violet because that is whose it is, and a musical note
     because that is what is being done to you: the badge and the three notes
     orbiting the car are the same idea at two sizes. The note is drawn out of
     COND_PATHS like every other icon - the PNG artwork is the world effect and
     is deliberately not in here. */
  mindControlled:{ key:"condMindControlled", col:"#8A4FE0", type:"debuff",
                  icon:"note",     ink:"#FFFFFF" }
};
/* The priority order, read straight off the table so the two cannot drift. */
const CONDITION_IDS = Object.keys(CONDITIONS);
/* The garage's two pages, generated from the table rather than listed again. */
function conditionsOfType(type){
  return CONDITION_IDS.filter(function(id){ return CONDITIONS[id].type === type; });
}
const ULT_CHARGE = 85;                    /* seconds from empty to ready */
const ULT_TIME = 15;                       /* seconds it lasts */
const ULT_SPEED = 2.0;                    /* what every ultimate is worth in pace */
/* ---- the shared white transition --------------------------------
   Two cars use it, so it belongs to neither: Neela flashes through it when it
   changes shape and when it trades places with somebody, and Rhosyn flashes
   through it on the way into Aero-Glow and on the way back out. The numbers
   are the ones Neela always had and the behaviour is unchanged.

   The whiteout is a transition flash and not a blindfold: long enough to hide
   the change, short enough that a car travelling at twice pace is never driven
   blind into anything. The vehicle flash outlasts it a little on purpose, so
   the car is already back in view while it is still burning off. */
const WHITEOUT_TIME = 0.42;               /* seconds of white over an involved view */
const MORPH_TIME = 0.6;                   /* seconds the white body flash burns off */
/* ---- Neela's ultimate -------------------------------------------
   The shared lifecycle above is untouched - same charge, same fifteen seconds,
   same double pace. These are the numbers for what Neela does inside it, and
   they live here rather than being spelled out wherever they happen to be
   needed.

   The guard is one frame's worth and nothing like a protection: it exists only
   so a pair of bodies that have just been swapped cannot be read as a second
   contact in the same step. */
const NEELA_SWAP_GUARD = 0.05;            /* seconds: one step, not a shield */
/* The alternate form's trail. Sampled by distance so it is smooth through a
   lane change at any pace, capped so it can never grow without bound, and long
   enough that at ultimate speed it runs off the top of the screen. */
const NEELA_TRAIL_LIFE = 1.8;             /* seconds a node takes to fade out */
const NEELA_TRAIL_GAP = 9;                /* px of travel between nodes */
const NEELA_TRAIL_MAX = 170;              /* nodes kept per racer, hard cap */
/* ---- Lolanthe's ultimate ----------------------------------------
   The shared lifecycle above is untouched - same charge, same fifteen
   seconds, same double pace. These are the numbers for what Lolanthe does
   inside it, and they live here rather than being spelled out wherever they
   happen to be needed.

   Mind Control is a three second debuff that is set, never added to: a racer
   held in the aura has its timer put back to three seconds every frame, so it
   stays controlled for as long as it is exposed and for three seconds after
   the last application, and never for six, nine or twelve.

   The aura's reach is in car lengths rather than pixels, because a car length
   is the one unit that means the same thing on a phone, on a desktop and in
   one column of a four-way split. Four of them is about the stretch of road a
   racer can close in a second at ordinary pace. */
const MIND_CONTROL_TIME = 3;              /* seconds without controls, from the last application */
const MIND_AURA_LENGTHS = 4;              /* how far the aura reaches, in car lengths */
/* The three notes' entrance and exit. Cosmetic, and short: a pop, not a
   second lifecycle. A timer that is merely being reset must not replay it. */
const MIND_POP = 0.26;                    /* seconds of scale/opacity pop, in and out */
const MIND_ORBIT = 0.42;                  /* turns a second the three notes make */
const MIND_NOTE_K = 0.30;                 /* one note's size, in car heights */
/* The ring they turn on. Two radii rather than one, and both in the racer's
   own dimensions, so the three notes sit around a Lolanthe, a Neela, a Flann,
   a Verdant, a Rhosyn and a Saffron alike instead of around whichever of them
   the number was tuned against. */
const MIND_ORBIT_X = 0.72;                /* orbit half width, in car widths */
const MIND_ORBIT_Y = 0.42;                /* orbit half height, in car heights */
/* Lolanthe's own note, the one above the car rather than around it. */
const QUEEN_POP = 0.3;                    /* seconds of scale/opacity pop, in and out */
const QUEEN_NOTE_K = 0.52;                /* its size, in car heights */
const QUEEN_LIFT = 0.74;                  /* how far above the car it floats, in car heights */
const QUEEN_BOB = 0.055;                  /* how far it rises and falls, in car heights */
const QUEEN_BOB_RATE = 1.6;               /* seconds for one rise and fall */
/* ---- Verdant's ultimate -----------------------------------------
   Again the shared lifecycle and nothing else: fifteen seconds, double pace.
   What changes is who can see it.

   The fade is cosmetic state only - it never touches the hitbox, the contact
   rules or the race - and it is a quarter of a second so the car does not
   snap out of existence. The owner's own view keeps half of it, so the person
   driving can still find their car; every other view loses it entirely.

   The reveal is the other half of the bargain: run into an invisible car and
   it shows itself for a fifth of a second. Long enough to read, far too short
   to aim at, and it buys the racer that hit it nothing - Verdant's immunity
   to Mind Control holds right through it. */
const VERDANT_FADE = 0.25;                /* seconds to fade into and out of hiding */
const VERDANT_OWN_ALPHA = 0.5;            /* what its own driver still sees */
const VERDANT_REVEAL = 0.18;              /* seconds of full visibility after a hit */
/* ---- Rhosyn's ultimate ------------------------------------------
   Again the shared lifecycle and nothing else: eighty-five seconds to charge,
   fifteen seconds long, double pace. What changes is which world the car's own
   driver is shown while those fifteen seconds run - and, because it has gone
   somewhere the race cannot follow, whether the shared road may touch it.

   These two numbers are the whole of the transition, and they are deliberately
   derived from the shared flash above rather than invented beside it.

   AERO_SHIFT is when the view changes hands. The whiteout is full white for
   its first half and fades over its second, so half of it is exactly the
   moment the screen is opaque - the renderer swaps worlds behind a white
   curtain and the driver never sees the seam. It is also how long the racer
   spends leaving and how long it spends coming back.

   AERO_FADE is the other half of the bargain, and it belongs to everybody
   else's view rather than to the owner's: how long the car takes to burn out
   of the shared road on the way out and to burn back into it on the way in. It
   is the body flash's own length on purpose, so what the rest of the field
   sees is one white flash that ends in an empty lane rather than a car
   blinking out mid-flash. */
const AERO_SHIFT = WHITEOUT_TIME/2;       /* seconds under full white, each way */
const AERO_FADE = MORPH_TIME;             /* seconds the body takes to leave the road */
/* The two pieces of world artwork the notes are drawn from. Named here beside
   everything else the game is defined by, and loaded exactly once - see
   FX_SPRITES in render.js. The small HUD badge is not one of these: it is a
   vector path in COND_PATHS like every other Condition icon. */
const QUEEN_NOTE_IMG = "queen_note.PNG";  /* floats above an ulting Lolanthe */
const MIND_NOTE_IMG = "pion_note.PNG";    /* three of them orbit a controlled racer */
/* gold, silver, bronze, then plain white for the rest of the field */
const PLACE_COLS = ["#FFD24A", "#D9DEE6", "#D08A4A", "#FFFFFF"];
/* ---------------- mystery bubbles ---------------- */
const RARITY = {
  common:    { col:"#E8E9EC", weight:60 },
  rare:      { col:"#4D8BFF", weight:25 },
  epic:      { col:"#B96BFF", weight:10 },
  legendary: { col:"#FFD24A", weight:5  }
};
const ITEMS = {
  can:    { key:"itemCan",    rarity:"common" },
  oil:    { key:"itemOil",    rarity:"rare" },
  seeker: { key:"itemSeeker", rarity:"legendary" }
};
const ITEM_IDS = ["can", "oil", "seeker"];
/* ---- the item rewards, temporarily switched off ----------------------
   Mystery Bubbles still spawn on the road, are still swept up and still pop,
   but the Can, the Oil and the Seeker they used to hand over are off while the
   mechanic is reconsidered. Nothing has been taken out to do it: the roll, the
   rarity table, the artwork, the strings, the bot valuation and every branch of
   useItem() are all still here and still correct. Put this back to true and the
   rewards return exactly as they were.

   It is deliberately not the same switch as rules.bubbles. That one says
   whether rows appear on the road at all and belongs to a custom race; this one
   says whether a collected bubble grants an item, and belongs to the
   game as it is being played right now. */
const MYSTERY_ITEMS_ENABLED = false;
/* Every id a Mystery Bubble can hand out, which is what the gate above covers.
   An item reaching a holder by any other route would still be refused, because
   there is no other route: rollItem() is the only thing that writes `item`. */
function mysteryItem(id){ return !!id && !!ITEMS[id]; }
const BUBBLE_GAP = [5400, 8600];          /* road distance between rows */
const CAN_TIME = 2.2, CAN_SPEED = 1.55;   /* the boost can */
/* The slick is live for fifteen seconds, then fades out harmlessly. Anything
   it catches takes it with it there and then, so what you can see on the road
   is always what can still catch you. */
const OIL_LIFE = 15, OIL_FADE = 0.9, SLIP_TIME = 4;
/* Four ways oil lands on tarmac, so no two drops read the same: a round pool,
   a long smear laid down at speed, a scattered splatter, and a thin ribbon.
   Each drop then gets its own seed on top, which jitters the outline, throws
   the sheen off-centre and scatters the droplets - so even two pools differ.
   jit is how ragged the edge is, spots is how many droplets get flung clear. */
const SLICK_KINDS = [
  { rx:[30, 39], ry:[23, 29], rot:0.14, jit:0.26, sheen:0.95, spots:[0, 2] },
  { rx:[19, 25], ry:[34, 45], rot:0.10, jit:0.20, sheen:0.70, spots:[2, 5] },
  { rx:[25, 32], ry:[21, 27], rot:0.30, jit:0.46, sheen:0.50, spots:[3, 6] },
  { rx:[15, 20], ry:[30, 41], rot:0.34, jit:0.16, sheen:1.00, spots:[1, 3] }
];
const MISSILE_SPEED = 2100;
/* the seeker is a big piece of hardware: longer than a car and wider across
   the fins, so it reads as a threat from the far end of the road */
const MISSILE_LEN  = 1.45;                /* nose to tail, in car heights */
const MISSILE_BODY = 0.55;                /* body half width, in car widths */
const MISSILE_FIN  = 0.92;                /* fin reach from centre, in car widths */
const BUBBLE_R = 21;
/* A row does not sit there forever. It flashes and goes on whichever comes
   first: the clock below, or the last stretch before it drops off the bottom.
   Both matter, because at racing speed a row crosses the screen in about two
   seconds and never gets near the clock - the run-off is what warns you that
   one is about to be lost at speed, and the clock is only what clears rows when
   the road is barely moving. Either way you get the same flash.

   So the clock is really a question about being stopped: how long should a row
   wait for a driver who cannot reach it yet? Longer than the longest thing that
   can hold you still - an ordering, a wreck and a respawn back to back - and
   thirty seconds clears all of them with time in hand. */
const BUBBLE_LIFE = 30, BUBBLE_BLINK = 1.6;
/* Swapping one item for another can be completely silent - roll a can while
   holding a can and the box is pixel-identical before and after - so a trade
   gets its own short flash on the box. Without it a second bubble looks like a
   bubble that did nothing. */
const ITEM_SWAP = 0.34;
/* the pickup is drawn and caught at this radius, scaled with everything else */
function bubbleR(){ return BUBBLE_R*SCENE; }

const PIP_FAR = 500;                      /* an off-screen racer only gets an arrow past this */
/* Two kinds of off-screen marker, and the split is PIP_FAR.

   Inside it the car is close enough to matter to you right now, so the marker
   goes to the edge of the screen it went off, sits in that car's lane, and
   prints the gap: where it is, which side it is coming from, how far. Past it
   the number is no use - a car 1200m up is not a car you are about to meet -
   so the marker collapses to a pair of chevrons and moves to the ladder, where
   its dot already says how far down the race it is.

   The edge badge only ever prints three digits and an m, because anything
   larger is a far marker by definition, so it can be sized exactly. */
const EDGE_W = 58, EDGE_ROW = 32;         /* badge width, and the drop to the next row */
const FAR_W = 34;                         /* two chevrons and nothing else */

/* Player colours, in the order players join. Everything that has to say which
   player something belongs to says it with one of these four. */
const PCOLS = ["#FF3B3B", "#3B8CFF", "#35D06B", "#FFCE2B"];
const PCOL_KEYS = ["pRed", "pBlue", "pGreen", "pYellow"];
const LOCAL_MAX = 4;
const DHAVAL_AURA_LENGTHS = 4;
const DHAVAL_OBSCURE_TIME = 3;
const CLEANSED_TIME = 3;
const DHAVAL_LIGHT_COLORS = ["#FFFFFF", "#AE4BE8", "#F32946", "#3FDC78"];
/* Each level retains the earlier circles and enlarges them, ensuring coverage
   grows monotonically for a fixed time/seed. Radius is relative to view area. */
const DHAVAL_LIGHT_LEVELS = [
  { count:4, radius:.175, opacity:.68 },
  { count:7, radius:.180, opacity:.76 },
  { count:11, radius:.190, opacity:.84 },
  { count:16, radius:.215, opacity:.91 },
  { count:23, radius:.242, opacity:.97 }
];
const FIELD_SIZE = 9;       /* nine cars on the road, however they are driven */

/* ---------------- tracks ----------------------------------------- */
const TRACK_SECONDS = 60;
const SPEED_SECONDS = 20;                 /* the road speeds up on this clock */
const BASE_SPEED = 420;                   /* 1.00x */
const MULT_STEP = 0.10, MAX_MULT = 3.00;  /* +0.10x every 20s, up to triple */
const MAX_TIER = Math.round((MAX_MULT - 1)/MULT_STEP);
const BLIND_TIME = 2.6;                   /* puddle: how long the view stays fouled */
const DEAD_TIME = 3, INVULNERABLE_TIME = 2;   /* destroy: wreck, then respawn untouchable */
const SLOW_TIME = 1.7;                    /* tumbleweed: how long it drags you down */
/* ---- meteor ----------------------------------------------------
   A rock falls on a clock of its own, and the ring under it is a spot on the
   road that scrolls with the road like everything else does.

   It used to be neither. The drop was measured in scrolled pixels against a
   mark that was a fixed row of player one's camera, which made two things
   wrong at once. The road is not the only thing that moves the scroll - a
   wreck stops it dead and an ultimate runs it at double pace - so the same
   rock hung in the sky through one and came down in half the time through the
   other. And a mark fixed to one camera is not a spot
   on the road at all - it never scrolled, so it could not be somewhere the
   field drives past.

   Both fall out of the same change: the ring is a road position, and how long
   the rock has left is seconds, independent of every racer’s speed. */
const METEOR_ALT = 300;                   /* how far up the rock comes in */
const METEOR_MIN_T = 0.9;                 /* never less warning than this */
const METEOR_MAX_T = 3.2;                 /* and never hanging longer than this */
const METEOR_ROCK_K = 0.66;               /* the last of the fall, with the rock in view */
/* Seconds of the fall during which the rock itself is drawn and can be hit. */
function rockLead(o){ return Math.max(0.2, (o.max || METEOR_MAX_T)*METEOR_ROCK_K); }
/* How high it still is. The fall, the roof test and the drawing all read this
   one number, so they cannot disagree about where the rock is. */
function rockAlt(o){ return METEOR_ALT*clamp(o.fall/rockLead(o), 0, 1); }
const TRACKS = {
  city:   { key:"trackCity",   ground:"#C9CCD3", shoulder:"#EDEEF1", road:"#16171B",
            mark:"rgba(237,238,241,0.86)", edge:"rgba(237,238,241,0.5)", accent:"#E21B22" },
  desert: { key:"trackDesert", ground:"#D6BC90", shoulder:"#BFA372", road:"#2B2722",
            mark:"rgba(233,214,158,0.82)", edge:"rgba(233,214,158,0.42)", accent:"#D9822B" },
  space:  { key:"trackSpace",  ground:"#07070D", shoulder:"#5CE1E6", road:"#0D0D15",
            mark:"rgba(255,255,255,0.92)", edge:"rgba(255,255,255,0.5)", accent:"#9B5CFF" }
};
const TRACK_IDS = ["city","desert","space"];
const RAINBOW = ["#FF3B4E","#FF8A2B","#FFD23B","#4FD46B","#3BC2FF","#5A6BFF","#B45CFF"];

const RIVAL_LAPSE = 0.14;                 /* how often it simply misses one */
const BUMP_SLOW = 1.3;
const ULT_ON_WRECK = -0.10;               /* what each event does to the meter */
const ULT_ON_TRAP  = -0.05;
const ULT_ON_KILL  =  0.10;
const ULT_ON_PERFECT_DODGE = 0.10;
const PERFECT_DODGE_WINDOW = 0.12;        /* seconds until a genuine collision */
const ULT_ON_BUBBLE = 0.05;

const BOOST_SPEED = 1.5;
const COLE_SWITCH_COOLDOWN = 2.0;
const COLE_BIKE_BASE_SPEED = 1.5;
const COLE_BIKE_BOOST_SPEED = 1.8;
const COLE_BIKE_ULT_SPEED = 2.3;
const BOOST_DRAIN_TIME = 5.5, BOOST_REFILL_TIME = 5.0;
const BOOST_DRAIN_RATE = 1 / BOOST_DRAIN_TIME;
const BOOST_REFILL_RATE = 1 / BOOST_REFILL_TIME;
/* ---- the rear-contact shunt -------------------------------------
   Running into the back of somebody shoves them along for a moment while the
   car that hit them labours. It is a push down the same tarmac and nothing
   more, which is why it is named for a shunt. Both cars lose the same time to
   the bump. */
const SHUNT_TIME = 0.8, SHUNT_BOOST = 1.35;

const FINAL_TRACKS = 3;                  /* armed once MAX_TIER is reached */
const FINISH_STRETCH = 900;               /* metres of the last track before the line */
/* Where each finisher comes to rest, measured past the flag in car lengths.
   The winner rolls furthest and every place behind it stops one step earlier,
   so the order the race finished in is the order the field is parked in and
   nothing has to be untangled afterwards.

   Places cycle across three lanes. Three steps clear the longest base/bike
   hull, with a margin. Finish cameras frame the whole nine-car parking area. */
const PARK_BASE = 0.70;
const PARK_STEP = 0.48;
const PARK_EASE = 3.9;                    /* how hard the roll-out closes on the mark */

/* Aureolin: physical rules shared by every driver and difficulty. Distances
   and speeds use the normal racer's logical length, fixed at launch. */
const AUREOLIN_SWITCH_COOLDOWN = 2;
const AUREOLIN_BULLET_RATE = 15;
const AUREOLIN_BULLET_DRAIN = 1/60;
const AUREOLIN_HEAT_REFILL = 1/3.5;
const AUREOLIN_SLOW_TIME = 1.5;
const AUREOLIN_SLOW_STEP = 0.10;
const AUREOLIN_BULLET_RANGE = 8;
const AUREOLIN_ULT_BULLET_RANGE_MULT = 2.00;
const AUREOLIN_BULLET_SPEED = 24;
const AUREOLIN_ROCKET_COOLDOWN = 2.0;
const AUREOLIN_ROCKET_LIFE = 5;
const AUREOLIN_ROCKET_SPEED = 16;
const AUREOLIN_ROCKET_TURN = 4.5;
const AUREOLIN_PROJECTILES = {
  bullet:{sprite:"vp_aureolinb.PNG", sourceSize:[1254,1254],
    bounds:[572,82,110,1092], length:.20,
    body:[[0,-.5],[.5,-.45],[.5,.45],[0,.5],[-.5,.45],[-.5,-.45]]},
  rocket:{sprite:"vp_aureolinr.PNG", sourceSize:[1254,1254],
    bounds:[486,102,282,997], length:.34,
    body:[[0,-.5],[.20,-.36],[.24,.17],[.48,.30],[.48,.45],[.20,.40],
          [.18,.49],[-.18,.49],[-.20,.40],[-.48,.45],[-.48,.30],[-.24,.17],[-.20,-.36]]}
};
