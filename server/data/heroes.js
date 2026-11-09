// Fantasy Chess — hero catalog, difficulties, shop packs.
// Names, abilities, flavor text, rarities and power values are transcribed
// exactly from the original game's catalog (via its getState action).
// `fx` flags are the machine-readable form of each ability, used by the
// engine (server/engine.js). See the flag glossary at the bottom of this file.
//
// Portraits: fresh Crunchyroll-style anime portraits were generated for
// all 72 heroes (2026-11-09) and live in public/portraits/<hero-id>.webp.
// Each hero carries a `portrait` URL field; the frontend prefers it over
// the illustrated monogram fallback (rarity gradient + role icon + initial).

const HEROES = [
  // ---- Soldiers (base: pawn) ----
  { id: "bram-footman", portrait: "/portraits/bram-footman.webp", name: "Bram the Footman", role: "soldier", rarity: "common", power: 10,
    ability: "Steady Step — Bram's soldiers may also step one square diagonally forward into an empty square, slipping around the enemy line.",
    flavor: "He has held the same shield-wall since he was fifteen.",
    fx: { diagStep: true } },
  { id: "sera-shieldbearer", portrait: "/portraits/sera-shieldbearer.webp", name: "Sera the Shieldbearer", role: "soldier", rarity: "rare", power: 14,
    ability: "Shield Wall — Sera's soldiers may capture straight ahead as well as diagonally, driving the shield wall forward.",
    flavor: "Her shield has stopped arrows, spears and one very surprised goat.",
    fx: { capStraight: true } },
  { id: "kael-pikeman", portrait: "/portraits/kael-pikeman.webp", name: "Kael the Pikeman", role: "soldier", rarity: "epic", power: 18,
    ability: "Long Reach — Kael's soldiers may capture an enemy two squares diagonally forward, striking with the pike over the square between.",
    flavor: "He drills at dawn, every dawn, even on feast days.",
    fx: { cap2Diag: true } },
  { id: "aurora-dawnblade", portrait: "/portraits/aurora-dawnblade.webp", name: "Aurora, Dawnblade Captain", role: "soldier", rarity: "legendary", power: 24,
    ability: "First Light — Aurora's soldiers may march two squares forward from any rank, not just their first move, and may step diagonally forward into an empty square.",
    flavor: "Armies rise earlier when Aurora is on the march.",
    fx: { march2: true, diagStep: true } },
  { id: "fenn-shepherd", portrait: "/portraits/fenn-shepherd.webp", name: "Fenn the Shepherd", role: "soldier", rarity: "common", power: 9,
    ability: "Falling Back — Fenn's soldiers may also step one square straight backward into an empty square, yielding ground to fight another day.",
    flavor: "He counts his flock twice. He counts his soldiers three times.",
    fx: { stepBack: true } },
  { id: "odric-torchbearer", portrait: "/portraits/odric-torchbearer.webp", name: "Odric the Torchbearer", role: "soldier", rarity: "common", power: 11,
    ability: "Torchlight Step — Odric's soldiers may also step one square diagonally forward into an empty square, feeling their way forward by torchlight.",
    flavor: "His torch has never gone out. Neither has he.",
    fx: { diagStep: true } },
  { id: "petra-sapper", portrait: "/portraits/petra-sapper.webp", name: "Petra the Sapper", role: "soldier", rarity: "rare", power: 15,
    ability: "Undermine — Petra's soldiers may capture straight ahead, and may step diagonally forward into an empty square to slip beneath the walls.",
    flavor: "Every wall she has ever met is now a door.",
    fx: { capStraight: true, diagStep: true } },
  { id: "jory-lancer", portrait: "/portraits/jory-lancer.webp", name: "Jory the Lancer", role: "soldier", rarity: "rare", power: 13,
    ability: "Relentless March — Jory's soldiers may march two squares forward from any rank, not just their first move.",
    flavor: "His lance is longer than most spears. His patience is not.",
    fx: { march2: true } },
  { id: "selene-duelist", portrait: "/portraits/selene-duelist.webp", name: "Selene the Duelist", role: "soldier", rarity: "epic", power: 19,
    ability: "Twin Blades — Selene's soldiers may capture straight ahead, and may capture an enemy two squares diagonally forward, leaping the square between.",
    flavor: "She has dueled at every court in the realm. She has lost at none.",
    fx: { capStraight: true, cap2Diag: true } },
  { id: "cato-veteran", portrait: "/portraits/cato-veteran.webp", name: "Cato the Veteran", role: "soldier", rarity: "epic", power: 17,
    ability: "Old Campaigner — Cato's soldiers may march two squares forward from any rank, and may capture straight ahead, the way the old legions did.",
    flavor: "Forty campaigns. The scars keep count so he doesn't have to.",
    fx: { march2: true, capStraight: true } },
  { id: "isolde-stormblade", portrait: "/portraits/isolde-stormblade.webp", name: "Isolde the Stormblade", role: "soldier", rarity: "legendary", power: 23,
    ability: "Storm Advance — Isolde's soldiers may march two squares forward from any rank, and may capture an enemy two squares diagonally forward, leaping the square between.",
    flavor: "Where her blade points, the thunder follows.",
    fx: { march2: true, cap2Diag: true } },
  { id: "theron-sunmarshal", portrait: "/portraits/theron-sunmarshal.webp", name: "Theron, Marshal of the Sun", role: "soldier", rarity: "legendary", power: 26,
    ability: "Solar Phalanx — Theron's soldiers may march two squares forward from any rank, step diagonally forward into an empty square, and capture straight ahead.",
    flavor: "His phalanx has never broken. The sun insists on watching.",
    fx: { march2: true, diagStep: true, capStraight: true } },

  // ---- Archers (base: rook) ----
  { id: "pip-bowman", portrait: "/portraits/pip-bowman.webp", name: "Pip the Bowman", role: "archer", rarity: "common", power: 30,
    ability: "Split Shot — Pip's archers may also step one square diagonally, loosing at an angle when the lane is blocked.",
    flavor: "He can split an apple at forty paces. Usually.",
    fx: { diagStep: true } },
  { id: "liana-longshot", portrait: "/portraits/liana-longshot.webp", name: "Liana Longshot", role: "archer", rarity: "rare", power: 36,
    ability: "Eagle Eye — Liana's archers may shoot along ranks and files past one friendly piece, seeing clear over her own line. She cannot land on that piece, and an enemy still blocks her.",
    flavor: "She counts heartbeats between string and target.",
    fx: { passFriendly: true } },
  { id: "sylas-hawkeye", portrait: "/portraits/sylas-hawkeye.webp", name: "Sylas Hawkeye", role: "archer", rarity: "epic", power: 44,
    ability: "Deadeye — Sylas's archers may leap over exactly one piece — friend or foe — along ranks and files, moving or capturing beyond it.",
    flavor: "No one has ever seen Sylas miss twice.",
    fx: { leapOne: true } },
  { id: "elowen-stararcher", portrait: "/portraits/elowen-stararcher.webp", name: "Elowen, Star Archer", role: "archer", rarity: "legendary", power: 55,
    ability: "Starfall Volley — Elowen's archers also loose arrows diagonally, up to three squares, on top of their usual ranks and files.",
    flavor: "She learned archery from the constellations.",
    fx: { diagSlide: 3 } },
  { id: "bessa-crossbow", portrait: "/portraits/bessa-crossbow.webp", name: "Bessa the Crossbowwoman", role: "archer", rarity: "common", power: 28,
    ability: "New Perch — Bessa's archers may also leap two squares up, down, left or right, hauling the heavy crossbow to fresh ground.",
    flavor: "She can reload in the dark, in the rain, mid-sentence.",
    fx: { leap2Ortho: true } },
  { id: "talbot-yeoman", portrait: "/portraits/talbot-yeoman.webp", name: "Talbot the Yeoman", role: "archer", rarity: "common", power: 32,
    ability: "Angled Loose — Talbot's archers may also loose one square diagonally, shooting from the hedgerows at an angle.",
    flavor: "He has won the village archery fair six years running.",
    fx: { diagStep: true } },
  { id: "yasmin-windrider", portrait: "/portraits/yasmin-windrider.webp", name: "Yasmin the Windrider", role: "archer", rarity: "rare", power: 38,
    ability: "Tailwind — Yasmin's archers also loose arrows diagonally, up to two squares, riding the desert wind.",
    flavor: "She shoots where the wind is going, not where it is.",
    fx: { diagSlide: 2 } },
  { id: "corin-fletcher", portrait: "/portraits/corin-fletcher.webp", name: "Corin the Fletcher", role: "archer", rarity: "rare", power: 35,
    ability: "Covering Fire — Corin's archers may shoot along ranks and files past one friendly piece, and may also loose one square diagonally.",
    flavor: "Every arrow he sells, he has already apologized to.",
    fx: { passFriendly: true, diagStep: true } },
  { id: "nadia-nightbow", portrait: "/portraits/nadia-nightbow.webp", name: "Nadia the Nightbow", role: "archer", rarity: "epic", power: 42,
    ability: "Night Volley — Nadia's archers may leap over exactly one piece — friend or foe — along ranks and files, and may also loose one square diagonally.",
    flavor: "By the time you hear the string, it is a story about someone else.",
    fx: { leapOne: true, diagStep: true } },
  { id: "rufus-siegebow", portrait: "/portraits/rufus-siegebow.webp", name: "Rufus the Siegebow", role: "archer", rarity: "epic", power: 46,
    ability: "Siege Angles — Rufus's archers also loose diagonally up to two squares, and may shoot along ranks and files past one friendly piece.",
    flavor: "His bow has a name. The name is Argument.",
    fx: { diagSlide: 2, passFriendly: true } },
  { id: "andromeda-comet", portrait: "/portraits/andromeda-comet.webp", name: "Andromeda, the Comet Archer", role: "archer", rarity: "legendary", power: 53,
    ability: "Comet Trail — Andromeda's archers also loose diagonally up to four squares, and may shoot along ranks and files past one friendly piece.",
    flavor: "She returns to the realm once a generation, arrows first.",
    fx: { diagSlide: 4, passFriendly: true } },
  { id: "caspian-skywarden", portrait: "/portraits/caspian-skywarden.webp", name: "Caspian, Warden of Skies", role: "archer", rarity: "legendary", power: 58,
    ability: "Skyfall — Caspian's archers may leap over exactly one piece — friend or foe — along ranks and files, and also loose diagonally up to three squares.",
    flavor: "Nothing crosses his sky uninvited. Nothing.",
    fx: { leapOne: true, diagSlide: 3 } },

  // ---- Wizards (base: bishop) ----
  { id: "eldon-hedge", portrait: "/portraits/eldon-hedge.webp", name: "Eldon the Hedge Wizard", role: "wizard", rarity: "common", power: 30,
    ability: "Spark Cantrip — Eldon's wizards may also step one square up, down, left or right, a small hop off their diagonals.",
    flavor: "His beard smells faintly of rain and pipe smoke.",
    fx: { orthoStep: true } },
  { id: "mira-frostweaver", portrait: "/portraits/mira-frostweaver.webp", name: "Mira Frostweaver", role: "wizard", rarity: "rare", power: 36,
    ability: "Frost Glide — Mira's wizards may also glide up to two squares up, down, left or right, frost trailing off their diagonals.",
    flavor: "She signs her letters with a snowflake that never melts.",
    fx: { orthoGlide: 2 } },
  { id: "orin-stormcaller", portrait: "/portraits/orin-stormcaller.webp", name: "Orin Stormcaller", role: "wizard", rarity: "epic", power: 44,
    ability: "Arc Lightning — Orin's wizards may also leap in an L like a knight, lightning striking where no diagonal reaches.",
    flavor: "Villagers blame Orin for the weather. Sometimes they're right.",
    fx: { knightLeap: true } },
  { id: "xandor-archmage", portrait: "/portraits/xandor-archmage.webp", name: "Xandor the Archmage", role: "wizard", rarity: "legendary", power: 55,
    ability: "Grand Teleport — Xandor's wizards may teleport to any empty square of the same color as the one they stand on, anywhere on the board. Teleporting never captures.",
    flavor: "Three towers, two centuries, one very patient wizard.",
    fx: { teleport: true } },
  { id: "wren-apprentice", portrait: "/portraits/wren-apprentice.webp", name: "Wren the Apprentice", role: "wizard", rarity: "common", power: 28,
    ability: "Timid Shuffle — Wren's wizards may also step one square up, down, left or right, edging nervously off their diagonals.",
    flavor: "Her hat is too big, her wand is borrowed, her courage is not.",
    fx: { orthoStep: true } },
  { id: "hodge-potionmonger", portrait: "/portraits/hodge-potionmonger.webp", name: "Hodge the Potionmonger", role: "wizard", rarity: "common", power: 32,
    ability: "Sample Sip — Hodge's wizards may also glide one square up, down, left or right — just a taste off their diagonals.",
    flavor: "Every potion is half price. Every potion is also half strength.",
    fx: { orthoGlide: 1 } },
  { id: "isel-tidecaller", portrait: "/portraits/isel-tidecaller.webp", name: "Isel the Tidecaller", role: "wizard", rarity: "rare", power: 38,
    ability: "Tidal Reach — Isel's wizards may also glide up to three squares up, down, left or right, the tide carrying them off their diagonals.",
    flavor: "The sea answers her. Eventually, and all at once.",
    fx: { orthoGlide: 3 } },
  { id: "vanya-glassmage", portrait: "/portraits/vanya-glassmage.webp", name: "Vanya the Glassmage", role: "wizard", rarity: "rare", power: 35,
    ability: "Through the Looking-Glass — Vanya's wizards may glide along their diagonals past one friendly piece, stepping through her own line like glass. An enemy still blocks her.",
    flavor: "She trusts mirrors more than people. Mirrors never lie twice.",
    fx: { passFriendly: true } },
  { id: "theobald-riftwalker", portrait: "/portraits/theobald-riftwalker.webp", name: "Theobald the Riftwalker", role: "wizard", rarity: "epic", power: 46,
    ability: "Rift Step — Theobald's wizards may also leap in an L like a knight, tearing through the rift, and glide one square up, down, left or right.",
    flavor: "He left through a door that wasn't there. He does that a lot.",
    fx: { knightLeap: true, orthoGlide: 1 } },
  { id: "sabine-voidseer", portrait: "/portraits/sabine-voidseer.webp", name: "Sabine the Voidseer", role: "wizard", rarity: "epic", power: 42,
    ability: "Void Gaze — Sabine's wizards may glide along their diagonals past exactly one piece — friend or foe — seeing through it into the dark beyond.",
    flavor: "She blindfolded herself so the void would feel at home.",
    fx: { passOne: true } },
  { id: "meridia-starkeeper", portrait: "/portraits/meridia-starkeeper.webp", name: "Meridia, Keeper of Stars", role: "wizard", rarity: "legendary", power: 58,
    ability: "Astral Door — Meridia's wizards may teleport to any empty square of the same color as the one they stand on, and may glide one square up, down, left or right. Teleporting never captures.",
    flavor: "Every star in her crown is a promise she intends to keep.",
    fx: { teleport: true, orthoGlide: 1 } },
  { id: "oberon-wildmage", portrait: "/portraits/oberon-wildmage.webp", name: "Oberon the Wildmage", role: "wizard", rarity: "legendary", power: 53,
    ability: "Wild Magic — Oberon's wizards may also leap in an L like a knight, and glide up to two squares up, down, left or right, the wildwood shifting beneath them.",
    flavor: "The forest does not obey Oberon. It agrees with him. Often.",
    fx: { knightLeap: true, orthoGlide: 2 } },

  // ---- Knights (base: knight) ----
  { id: "tomas-squire", portrait: "/portraits/tomas-squire.webp", name: "Tomas the Squire Knight", role: "knight", rarity: "common", power: 30,
    ability: "Bold Leap — Tomas's knights may also leap two squares straight up, down, left or right, jumping whatever stands between.",
    flavor: "Knighted last spring. Still polishes his sword every night.",
    fx: { leap2Ortho: true } },
  { id: "brienne-oathbound", portrait: "/portraits/brienne-oathbound.webp", name: "Brienne the Oathbound", role: "knight", rarity: "rare", power: 36,
    ability: "Sworn Blade — Brienne's knights may also step one square diagonally, blade in hand, on top of their usual L-shaped leaps.",
    flavor: "She has broken exactly one oath: the one to stop collecting them.",
    fx: { diagStep: true } },
  { id: "gareth-griffin", portrait: "/portraits/gareth-griffin.webp", name: "Gareth, Griffin Rider", role: "knight", rarity: "epic", power: 44,
    ability: "Sky Pounce — Gareth's knights may also leap three squares one way and one to the side — a griffin's longer pounce — jumping everything between.",
    flavor: "His griffin, Biscuit, fears nothing but thunder.",
    fx: { leap31: true } },
  { id: "seraphina-valkyrie", portrait: "/portraits/seraphina-valkyrie.webp", name: "Seraphina the Valkyrie", role: "knight", rarity: "legendary", power: 55,
    ability: "Choosers' Flight — Seraphina's knights may also leap two squares diagonally, wings carrying them clean over the square between.",
    flavor: "Fallen heroes swear they saw wings.",
    fx: { leap2Diag: true } },
  { id: "perrin-stablehand", portrait: "/portraits/perrin-stablehand.webp", name: "Perrin the Stablehand", role: "knight", rarity: "common", power: 28,
    ability: "Close Guard — Perrin's knights may also step one square up, down, left or right, staying close where a guard belongs.",
    flavor: "He knew every horse in the stable by name before he knew the sword.",
    fx: { orthoStep: true } },
  { id: "roderick-banneret", portrait: "/portraits/roderick-banneret.webp", name: "Roderick the Banneret", role: "knight", rarity: "common", power: 32,
    ability: "Long Stride — Roderick's knights may also leap two squares straight up, down, left or right, planting the banner on new ground.",
    flavor: "Where his banner stands, the line holds. It is a very good banner.",
    fx: { leap2Ortho: true } },
  { id: "elisabet-thorn", portrait: "/portraits/elisabet-thorn.webp", name: "Elisabet of the Thorn", role: "knight", rarity: "rare", power: 38,
    ability: "Lance Charge — Elisabet's knights may also leap three squares straight up, down, left or right, charging clean over everything between.",
    flavor: "Every rose has its thorn. Hers is six feet of ash wood.",
    fx: { leap3Ortho: true } },
  { id: "oswald-ironmane", portrait: "/portraits/oswald-ironmane.webp", name: "Oswald Ironmane", role: "knight", rarity: "rare", power: 35,
    ability: "Iron Discipline — Oswald's knights may also step one square diagonally, and leap two squares straight up, down, left or right.",
    flavor: "His shield wall has a waiting list.",
    fx: { diagStep: true, leap2Ortho: true } },
  { id: "vivienne-sunsword", portrait: "/portraits/vivienne-sunsword.webp", name: "Vivienne the Sunsword", role: "knight", rarity: "epic", power: 46,
    ability: "Sunleap — Vivienne's knights may also leap three squares one way and two to the side — a soaring arc of sunlight no wall can stop.",
    flavor: "She duels at noon, when her sword is brightest and her shadow smallest.",
    fx: { leap32: true } },
  { id: "kestrel-windlance", portrait: "/portraits/kestrel-windlance.webp", name: "Kestrel the Windlance", role: "knight", rarity: "epic", power: 42,
    ability: "Crosswind — Kestrel's knights may also leap two squares diagonally, and two squares straight up, down, left or right, riding the crosswinds.",
    flavor: "His falcon scouts. His lance delivers the report.",
    fx: { leap2Diag: true, leap2Ortho: true } },
  { id: "auelia-dawncharger", portrait: "/portraits/auelia-dawncharger.webp", name: "Auelia the Dawncharger", role: "knight", rarity: "legendary", power: 58,
    ability: "Dawn Charge — Auelia's knights may also leap three squares diagonally, and three squares one way with one to the side — a griffin's longer pounce — as the dawn breaks.",
    flavor: "Armies that see her coming have already lost the morning.",
    fx: { leap3Diag: true, leap31: true } },
  { id: "galahad-starlance", portrait: "/portraits/galahad-starlance.webp", name: "Galahad the Starlance", role: "knight", rarity: "legendary", power: 53,
    ability: "Starfall Charge — Galahad's knights may also leap three squares one way and two to the side, and two squares diagonally, falling like a star wherever the line is thinnest.",
    flavor: "He has never once charged in the wrong direction. The stars check with him first.",
    fx: { leap32: true, leap2Diag: true } },

  // ---- Witches (base: queen) ----
  { id: "mabel-herb", portrait: "/portraits/mabel-herb.webp", name: "Mabel the Herb Witch", role: "witch", rarity: "common", power: 90,
    ability: "Hex Garden — Mabel's witches may also leap two squares in any direction, hopping clean over friend and foe alike.",
    flavor: "Her curses are mild. Her teas are not.",
    fx: { leap2Any: true } },
  { id: "morwen-hexweaver", portrait: "/portraits/morwen-hexweaver.webp", name: "Morwen Hexweaver", role: "witch", rarity: "rare", power: 100,
    ability: "Woven Doom — Morwen's witches may weave their slides past one friendly piece along any rank, file or diagonal. An enemy still blocks her.",
    flavor: "She knits her spells. Unraveling one takes a lifetime.",
    fx: { passFriendly: true } },
  { id: "lilith-nightshade", portrait: "/portraits/lilith-nightshade.webp", name: "Lilith Nightshade", role: "witch", rarity: "epic", power: 115,
    ability: "Nightshade Bloom — Lilith's witches may also leap in an L like a knight, blooming suddenly where no line reaches.",
    flavor: "Poisoner, healer, duelist — depending on the hour.",
    fx: { knightLeap: true } },
  { id: "morgana-thornqueen", portrait: "/portraits/morgana-thornqueen.webp", name: "Morgana, Queen of Thorns", role: "witch", rarity: "legendary", power: 135,
    ability: "Crown of Thorns — Morgana's witches may also leap in an L like a knight, and their slides may leap over exactly one piece — friend or foe — to move or capture beyond it.",
    flavor: "Kings have surrendered at the mere rumor of her arrival.",
    fx: { knightLeap: true, passOne: true } },
  { id: "tansy-candlewitch", portrait: "/portraits/tansy-candlewitch.webp", name: "Tansy the Candlewitch", role: "witch", rarity: "common", power: 88,
    ability: "Candle Hop — Tansy's witches may also leap two squares up, down, left or right, hopping by candlelight over friend and foe alike.",
    flavor: "Her hat holds nine candles and one secret.",
    fx: { leap2Ortho: true } },
  { id: "briony-moss", portrait: "/portraits/briony-moss.webp", name: "Briony of the Moss", role: "witch", rarity: "common", power: 92,
    ability: "Toad Hop — Briony's witches may also leap two squares diagonally, landing soft as moss on the far side.",
    flavor: "The frog on her hat is her advisor. He is excellent.",
    fx: { leap2Diag: true } },
  { id: "sabrina-moonweaver", portrait: "/portraits/sabrina-moonweaver.webp", name: "Sabrina the Moonweaver", role: "witch", rarity: "rare", power: 104,
    ability: "Moonweave — Sabrina's witches may weave their slides past one friendly piece along any rank, file or diagonal, and may also leap two squares in any direction.",
    flavor: "She knits moonbeams into nets. Nothing moonlit escapes.",
    fx: { passFriendly: true, leap2Any: true } },
  { id: "odile-swanhag", portrait: "/portraits/odile-swanhag.webp", name: "Odile the Swanhag", role: "witch", rarity: "rare", power: 98,
    ability: "Swan's Passage — Odile's witches may glide along any rank, file or diagonal past exactly one piece — friend or foe — alighting beyond it.",
    flavor: "Grace is just menace that learned to dance.",
    fx: { passOne: true } },
  { id: "vespera-duskqueen", portrait: "/portraits/vespera-duskqueen.webp", name: "Vespera the Duskqueen", role: "witch", rarity: "epic", power: 118,
    ability: "Dusk Court — Vespera's witches may also leap in an L like a knight, and weave their slides past one friendly piece along any rank, file or diagonal.",
    flavor: "She holds court for one hour a day: the hour nobody can see.",
    fx: { knightLeap: true, passFriendly: true } },
  { id: "titanis-stormhag", portrait: "/portraits/titanis-stormhag.webp", name: "Titanis the Stormhag", role: "witch", rarity: "epic", power: 112,
    ability: "Stormstride — Titanis's witches may also leap three squares one way and one to the side, striding over the whole battlefield on the storm's shoulders.",
    flavor: "Her hair has been struck by lightning so often it stopped asking permission.",
    fx: { leap31: true } },
  { id: "morrigan-crowqueen", portrait: "/portraits/morrigan-crowqueen.webp", name: "Morrigan the Crowqueen", role: "witch", rarity: "legendary", power: 140,
    ability: "Carrion Crown — Morrigan's witches may also leap in an L like a knight or three-and-one like a griffin, and their slides may leap over exactly one piece — friend or foe — to move or capture beyond it.",
    flavor: "The crows arrive before she does, to save the good seats.",
    fx: { knightLeap: true, leap31: true, passOne: true } },
  { id: "evadne-starhag", portrait: "/portraits/evadne-starhag.webp", name: "Evadne the Starhag", role: "witch", rarity: "legendary", power: 132,
    ability: "Star Door — Evadne's witches may also teleport to any empty square of the same color as the one they stand on, anywhere beneath her stars. Teleporting never captures.",
    flavor: "She does not cross battlefields. Battlefields rearrange themselves around her.",
    fx: { teleport: true } },

  // ---- Warlords (base: king) ----
  { id: "roland-captain", portrait: "/portraits/roland-captain.webp", name: "Captain Roland", role: "warlord", rarity: "common", power: 100,
    ability: "Rally — Roland's warlord may move up to two squares in any direction instead of one, leading from the front. The path must be clear, as with any march.",
    flavor: "He has never lost a soldier he could still reach.",
    fx: { range: 2 } },
  { id: "dain-ironlord", portrait: "/portraits/dain-ironlord.webp", name: "Dain the Iron Lord", role: "warlord", rarity: "rare", power: 110,
    ability: "Iron Stance — Dain's warlord may move up to two squares in any direction, and may castle through an attacked square — though never out of check, and never into it.",
    flavor: "His armor bears the dents of forty campaigns.",
    fx: { range: 2, castleThrough: true } },
  { id: "valeria-warmarshal", portrait: "/portraits/valeria-warmarshal.webp", name: "Valeria the Warmarshal", role: "warlord", rarity: "epic", power: 125,
    ability: "Grand Strategy — Valeria's warlord may move up to two squares in any direction, and may castle even after the warlord or the archer has moved earlier in the battle.",
    flavor: "She studies battle maps the way poets study verse.",
    fx: { range: 2, castleAfterMove: true } },
  { id: "kaizhar-dragonlord", portrait: "/portraits/kaizhar-dragonlord.webp", name: "Kaizhar the Dragonlord", role: "warlord", rarity: "legendary", power: 150,
    ability: "Dragon's Presence — Kaizhar's warlord may move up to three squares in any direction, may castle even after moving earlier, and may castle through an attacked square — though never out of check, and never into it.",
    flavor: "The dragon on his banner is not a metaphor.",
    fx: { range: 3, castleAfterMove: true, castleThrough: true } },
  { id: "aldous-steward", portrait: "/portraits/aldous-steward.webp", name: "Aldous the Steward", role: "warlord", rarity: "common", power: 98,
    ability: "Keeper's Stride — Aldous's warlord may move up to two squares in any direction instead of one — a steward always hurries — and the path must be clear.",
    flavor: "He holds the keys to every door in the castle, including the way out.",
    fx: { range: 2 } },
  { id: "beatrix-commander", portrait: "/portraits/beatrix-commander.webp", name: "Beatrix the Commander", role: "warlord", rarity: "common", power: 104,
    ability: "Field Command — Beatrix's warlord may move up to two squares in any direction instead of one, leading where the fighting is thickest. The path must be clear.",
    flavor: "She gives orders the way other people breathe: constantly, and to live.",
    fx: { range: 2 } },
  { id: "konrad-bulwark", portrait: "/portraits/konrad-bulwark.webp", name: "Konrad the Bulwark", role: "warlord", rarity: "rare", power: 114,
    ability: "Long Stride — Konrad's warlord may move up to three squares in any direction instead of one, the whole bulwark advancing at once. The path must be clear.",
    flavor: "Siege engines have bounced off him. Politely, but firmly.",
    fx: { range: 3 } },
  { id: "regan-ironcrown", portrait: "/portraits/regan-ironcrown.webp", name: "Regan of the Iron Crown", role: "warlord", rarity: "rare", power: 108,
    ability: "Iron Decree — Regan's warlord may move up to two squares in any direction, and may castle through an attacked square — though never out of check, and never into it.",
    flavor: "The crown is iron because gold, Regan says, is for people who need to be liked.",
    fx: { range: 2, castleThrough: true } },
  { id: "dmitri-frostlord", portrait: "/portraits/dmitri-frostlord.webp", name: "Dmitri the Frostlord", role: "warlord", rarity: "epic", power: 128,
    ability: "Frozen Court — Dmitri's warlord may move up to three squares in any direction, and may castle through an attacked square — though never out of check, and never into it. The path must be clear.",
    flavor: "Winter attends his court. It is the only court winter attends.",
    fx: { range: 3, castleThrough: true } },
  { id: "amara-sunempress", portrait: "/portraits/amara-sunempress.webp", name: "Amara, Empress of the Sun", role: "warlord", rarity: "epic", power: 122,
    ability: "Imperial Progress — Amara's warlord may move up to three squares in any direction, and may castle even after the warlord or the archer has moved earlier in the battle. The path must be clear.",
    flavor: "Her progress through the realm takes all summer. The realm does not mind.",
    fx: { range: 3, castleAfterMove: true } },
  { id: "nyx-umbralqueen", portrait: "/portraits/nyx-umbralqueen.webp", name: "Nyx, the Umbral Queen", role: "warlord", rarity: "legendary", power: 155,
    ability: "Umbral Majesty — Nyx's warlord may move up to three squares in any direction, may castle even after moving earlier, and may castle through an attacked square — though never out of check, and never into it.",
    flavor: "She rules the hour between midnight and dread.",
    fx: { range: 3, castleAfterMove: true, castleThrough: true } },
  { id: "solenne-dawnempress", portrait: "/portraits/solenne-dawnempress.webp", name: "Solenne, Empress of Dawn", role: "warlord", rarity: "legendary", power: 146,
    ability: "Dawn Ascendant — Solenne's warlord may move up to three squares in any direction, may castle even after moving earlier, and may castle through an attacked square — though never out of check, and never into it.",
    flavor: "Every sunrise is her court rising. Every courtier is a ray of light.",
    fx: { range: 3, castleAfterMove: true, castleThrough: true } },
];

const ROLES = ["soldier", "archer", "wizard", "knight", "witch", "warlord"];
const RARITIES = ["common", "rare", "epic", "legendary"];

const RARITY_POINTS = { common: 0, rare: 1, epic: 2, legendary: 3 };

const STARTERS = {
  soldier: "bram-footman",
  archer: "pip-bowman",
  wizard: "eldon-hedge",
  knight: "tomas-squire",
  witch: "mabel-herb",
  warlord: "roland-captain",
};

// Difficulties, transcribed exactly from the original game.
const DIFFICULTIES = [
  { id: "squire", name: "Squire's Trial", opponent: "Pell the Drillmaster", opponentTitle: "Training-ground captain",
    blurb: "A forgiving first opponent who thinks a few moves ahead — and sometimes not at all.",
    cost: 20, winGold: 75, drawGold: 10,
    enemyBand: { soldier: "bram-footman", archer: "pip-bowman", wizard: "eldon-hedge", knight: "tomas-squire", witch: "mabel-herb", warlord: "roland-captain" },
    rewardNote: "Common card, with a real chance of a Rare" },
  { id: "knight", name: "Knight's Campaign", opponent: "Brienne the Oathbound", opponentTitle: "Sworn commander of the border forts",
    blurb: "A disciplined rival commanding a Rare warband. Punishes sloppy openings.",
    cost: 50, winGold: 100, drawGold: 25,
    enemyBand: { soldier: "sera-shieldbearer", archer: "liana-longshot", wizard: "mira-frostweaver", knight: "brienne-oathbound", witch: "morwen-hexweaver", warlord: "dain-ironlord" },
    rewardNote: "Rare cards likely, Epic possible" },
  { id: "warlord", name: "Warlord's Gambit", opponent: "Valeria the Warmarshal", opponentTitle: "Marshal of the eastern armies",
    blurb: "An Epic warband led by a relentless tactician. Every mistake costs material.",
    cost: 100, winGold: 200, drawGold: 50,
    enemyBand: { soldier: "kael-pikeman", archer: "sylas-hawkeye", wizard: "orin-stormcaller", knight: "gareth-griffin", witch: "lilith-nightshade", warlord: "valeria-warmarshal" },
    rewardNote: "Epic cards likely, Legendary possible" },
  { id: "dragon", name: "Dragonlord's Throne", opponent: "Kaizhar the Dragonlord", opponentTitle: "The final seat of power",
    blurb: "A Legendary warband and the deepest-thinking mind in the realm. For masters only.",
    cost: 200, winGold: 400, drawGold: 100,
    enemyBand: { soldier: "aurora-dawnblade", archer: "elowen-stararcher", wizard: "xandor-archmage", knight: "seraphina-valkyrie", witch: "morgana-thornqueen", warlord: "kaizhar-dragonlord" },
    rewardNote: "Epic or Legendary card, guaranteed powerful" },
  { id: "celestial", name: "Celestial Throne", opponent: "Nyx, the Umbral Queen", opponentTitle: "Sovereign of the hour between midnight and dread",
    blurb: "Beyond the Dragonlord waits the Umbral Queen and her star-crowned Legendary warband — teleporting witches, starlance knights, and a warlord who strides through shadow. The ultimate test.",
    cost: 350, winGold: 700, drawGold: 175,
    enemyBand: { soldier: "theron-sunmarshal", archer: "caspian-skywarden", wizard: "meridia-starkeeper", knight: "galahad-starlance", witch: "evadne-starhag", warlord: "nyx-umbralqueen" },
    rewardNote: "Legendary card likely, Epic guaranteed at worst" },
];

// Gold shop packs (rebalanced 2026-11-09: gold divided by 3 from the
// original 150/500/1,000/2,500; prices unchanged).
const PACKS = [
  { id: "pouch", name: "Pouch of Gold", gold: 50, priceCents: 99, priceLabel: "$0.99", badge: null,
    tagline: "A quick top-up — 2 Squire's Trials, or 1 Knight's Campaign." },
  { id: "satchel", name: "Satchel of Gold", gold: 165, priceCents: 299, priceLabel: "$2.99", badge: null,
    tagline: "A solid stash to get started — covers 3 Knight's Campaigns, with gold left over." },
  { id: "chest", name: "Chest of Gold", gold: 335, priceCents: 499, priceLabel: "$4.99", badge: null,
    tagline: "A run at the Dragonlord's Throne plus a Warlord's Gambit — a full high-stakes campaign." },
  { id: "vault", name: "Dragon Vault", gold: 835, priceCents: 999, priceLabel: "$9.99", badge: "Best value",
    tagline: "Two shots at the Celestial Throne, with gold to spare — the full campaign fund, and the most gold per dollar." },
];

// Battle-reward card roll weights per difficulty. RECONSTRUCTION: the
// original only published the reward notes above ("Common card, with a real
// chance of a Rare", etc.); these weights reproduce those notes.
const REWARD_WEIGHTS = {
  squire:    { common: 0.68, rare: 0.24, epic: 0.06, legendary: 0.02 },
  knight:    { common: 0.38, rare: 0.40, epic: 0.17, legendary: 0.05 },
  warlord:   { common: 0.15, rare: 0.35, epic: 0.35, legendary: 0.15 },
  dragon:    { common: 0.00, rare: 0.20, epic: 0.45, legendary: 0.35 },
  celestial: { common: 0.00, rare: 0.00, epic: 0.40, legendary: 0.60 },
};

// Training Grounds lessons (Coach Pell). Lessons 1–3 open from the start;
// 4–6 unlock by equipped-team score (rarity points + 1 per Lv 3+ hero).
// RECONSTRUCTION: the original published the lesson topics and the unlock
// rule shape; the exact score thresholds below reproduce the intended feel.
const LESSONS = [
  { id: 1, title: "How Each Hero Moves", minScore: 0,
    text: "Every hero fights like a chess piece with a twist. Soldiers march like pawns, archers shoot like rooks, wizards glide like bishops, knights leap like knights, witches sweep like queens, and your warlord commands like a king. Learn each hero's stride before you spend a single coin." },
  { id: 2, title: "Captures & Trades", minScore: 0,
    text: "A capture is only good if the trade favors you. Count the power of what you take against what you lose — and remember, a hero's ability can turn a bad trade into a brilliant one." },
  { id: 3, title: "Check & Checkmate", minScore: 0,
    text: "Check means your warlord is under attack. You must answer it: move the warlord, capture the attacker, or block the line. Checkmate is check with no answer — and that ends the battle." },
  { id: 4, title: "Castling & the Warlord's Gifts", minScore: 2,
    text: "Castling tucks your warlord behind the archer and brings the archer into play. Some warlords castle through attacked squares or even after moving — know your warlord's gift before you need it." },
  { id: 5, title: "Promotion & En Passant", minScore: 4,
    text: "March a soldier to the far rank and it promotes — choose a witch, archer, wizard or knight. And if an enemy soldier marches two squares past yours, you may capture it as if it had only marched one: en passant." },
  { id: 6, title: "Forks, Pins & Mate in One", minScore: 6,
    text: "The advanced arts: fork two pieces with one move, pin a piece to its warlord so it cannot move, skewer a line to win the piece behind. Finish with a mate-in-one drill — one move, one crown." },
];

const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));
const DIFF_BY_ID = new Map(DIFFICULTIES.map((d) => [d.id, d]));
const PACK_BY_ID = new Map(PACKS.map((p) => [p.id, p]));

function heroById(id) { return HERO_BY_ID.get(id) || null; }
function difficultyById(id) { return DIFF_BY_ID.get(id) || null; }
function packById(id) { return PACK_BY_ID.get(id) || null; }

// Roll a reward hero id for a win at the given difficulty.
function rollReward(difficultyId, rand = Math.random) {
  const weights = REWARD_WEIGHTS[difficultyId] || REWARD_WEIGHTS.squire;
  const roll = rand();
  let acc = 0;
  let picked = "common";
  for (const r of RARITIES) {
    acc += weights[r] || 0;
    if (roll < acc) { picked = r; break; }
  }
  const pool = HEROES.filter((h) => h.rarity === picked);
  return pool[Math.floor(rand() * pool.length)].id;
}

module.exports = {
  HEROES, ROLES, RARITIES, RARITY_POINTS, STARTERS, DIFFICULTIES, PACKS,
  REWARD_WEIGHTS, LESSONS, heroById, difficultyById, packById, rollReward,
};

/* Ability-flag glossary (fx) — interpreted by server/engine.js.
   soldier: diagStep (step 1 diagonally forward into empty), capStraight
     (capture straight ahead), cap2Diag (capture 2 diagonally forward),
     march2 (2-square march from any rank), stepBack (step 1 straight back).
   archer: diagStep, diagSlide N (diagonal slides up to N), passFriendly
     (slides pass one friendly piece; cannot land on it; enemy still blocks),
     leapOne (slides leap over exactly one piece, friend or foe),
     leap2Ortho (leap 2 squares orthogonally, jumping over).
   wizard: orthoStep (step 1 orthogonally), orthoGlide N (glide up to N
     orthogonally), knightLeap (L-leap), passFriendly (diagonals pass one
     friendly), passOne (diagonals pass exactly one piece), teleport
     (teleport to any empty same-colour square; never captures).
   knight: leap2Ortho, leap3Ortho, diagStep, orthoStep, leap31 (3-and-1),
     leap32 (3-and-2), leap2Diag, leap3Diag — all jumps ignore intervening.
   witch: leap2Any (leap 2 in any direction), leap2Ortho, leap2Diag,
     passFriendly (slides pass one friendly), passOne (slides leap over
     exactly one piece), knightLeap, leap31, teleport.
   warlord: range N (move up to N squares any direction, path must be
     clear), castleThrough (castle through an attacked square; never out
     of check, never into it), castleAfterMove (castle even after the
     warlord or archer has moved).
*/
