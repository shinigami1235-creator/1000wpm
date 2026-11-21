// Word bank for every typing mode. The common English bands come from
// js/wordbank-common.js (generated from wordfreq); everything else is written here.
// Load wordbank-common.js first. js/words.js and window.WORDS stay as they were.
//
//   WordBank.pick({ count, difficulty, theme, minLen, maxLen, avoidFirstLetters, distinctFirst, seed, rng, exclude, withMeta })
//       -> words (or { text, theme, len, rare, reach, score } with withMeta)
//   WordBank.stream(opts)     -> { next(n), set(opts) }   an endless supply with no repeats until the pool runs out
//   WordBank.meta(text)       -> { len, rare, reach, shift, score }   score is 1 (easy) to 10 (hard)
//   WordBank.list(theme)      -> every entry of a theme
//   WordBank.counts()         -> entries per theme
//   WordBank.THEMES           -> theme names
//
// difficulty: a number (1 to 10, entries within 1 of it) or [lo, hi].
// theme: a name below, or an array of names. With an array each pick first draws a theme,
// so a small pack shows up as often as a big one. 'mix' is common words plus every word pack.
// seed (string or number) or rng (a function returning 0..1) makes the pick repeatable, which
// the world boss needs so every raider sees the same attack words. Unseeded picks avoid the
// last 400 entries they handed out.
window.WordBank = (() => {
  const W = s => s.trim().split(/\s+/);
  const L = s => s.trim().split('\n').map(x => x.trim()).filter(Boolean);

  // ---------- themed word packs ----------
  const PACKS = {
    cyber: W(`algorithm array assembler backend backup bandwidth binary bitmask bitrate bitwise boolean boot bootloader
      botnet branch browser buffer bug bytecode cache captcha certificate chatbot checksum chip cipher circuit client clone
      cloud cluster codebase codec commit compile compiler compute console container cookie cron crypto cursor cyber
      cyberspace daemon dashboard database datacenter dataset datagram debug debugger decoder decrypt default deploy desktop
      device digital directory domain download downlink driver emulator encoder encrypt encryption endpoint ethernet failover
      fiber filename firewall firmware folder fork format framework frontend function gateway gigabit gigabyte glitch
      handshake hardware hash hashing header heap hexadecimal hologram hotfix hyperlink index inbox input install integer
      interface internet kernel keychain keypair keystroke lag laptop latency library linker localhost logfile login loopback
      mainframe malware matrix megabyte memory merge metadata microchip microcode modem module monitor motherboard mutex
      nanobot network neural node offline online opcode output overclock overflow packet parser password patch payload
      pipeline pixel plugin pointer polygon portal process processor protocol proxy query queue raster reboot rebase
      recursion refactor registry render repository resolver router runtime salt sandbox scanner script semaphore server
      session shader socket software spyware stack startup storage stream string subnet syntax tensor terminal texture
      thread token toolbar trojan update upload uplink uptime username variable vector vertex virtual virus voltage voxel
      webcam website widget wireframe workflow`),
    keyboards: W(`keyboard keycap keycaps switch switches spacebar backspace enter shift  tab escape control function
      numpad arrow layout qwerty dvorak colemak ortholinear split ergonomic tenkeyless compact hotswap gasket plate
      stabilizer lube lubed linear tactile clicky thock clack ping spring stem housing actuation travel keystroke
      rollover polling latency firmware macro layer encoder knob rotary wrist palm  cable coiled connector dongle
      receiver battery profile sculpted doubleshot legend legends backlight underglow typist typing accuracy speed rhythm
      cadence burst sprint warmup drill practice pinky ring index thumb finger knuckle posture stamina streak combo flow
      focus record personal best caret cursor glyph character letter symbol bracket brace colon semicolon comma period
      apostrophe hyphen underscore tilde caret slash backslash pipe asterisk ampersand percent dollar hash quote
      lowercase uppercase capital spacing kerning  timer countdown result graph chart average median peak
      consistency raw adjusted mistake typo correction ghost pace racer race lane finish trophy medal podium rank
      challenge daily weekly session lesson module beginner learner intermediate advanced expert master mentor
      leaderboard sponsor review unboxing modding soldering desoldering  foam dampening tape mod lubing
      artisan resin acrylic aluminum brass polycarbonate steel walnut oak bamboo wooden mount tray 
       flex bounce sound acoustics muted silent heavy light springs films stem wobble rattle tick ticking
      chatter debounce scancode keymap remap shortcut hotkey chord toggle   leader`),
    gaming: W(`quest loot respawn checkpoint level boss raid dungeon guild party healer tank mage rogue cleric paladin bard
      druid monk spawn lobby matchmaking ranked casual leaderboard achievement trophy badge skin emote avatar sprite
      arcade console controller joystick gamepad trigger button cooldown buff nerf patch meta speedrun glitch lag ping
      server mod modding sandbox inventory crafting recipe potion mana stamina health shield armor helmet relic artifact
      chest portal teleport warp minimap waypoint objective mission campaign chapter cutscene dialogue sidequest grind
      farm experience skill talent perk ability upgrade unlock tier rank season tournament bracket esports streamer clip
      highlight replay spectator coop multiplayer  platformer puzzle strategy racing simulator roguelike
      stealth survival adventure score  lives pause save load victory defeat combo multiplier  pickup
      coin gem crystal key map compass hint secret easter egg cheat code developer tester bugfix update hotfix launcher
       voxel sandbox  biome spawner mob minion summon pet mount stable saddle forge anvil blueprint
      upgrade enchant rune scroll tome wand staff bow quiver arrow  dodge parry block counter dash sprint jump
      crouch climb glide swim dive fly hover bounce slide stomp crate barrel lever switch door gate bridge tower castle
      village tavern merchant shop vendor trade auction gold silver bronze copper iron mythril crafter miner builder
      explorer scout archer knight hero villain sidekick companion rival nemesis finale credits sequel prequel remaster
      demo beta alpha launch release`),
    nature: W(`forest river mountain valley meadow canyon desert glacier ocean lake pond stream creek waterfall island beach
      shore coast cliff cave volcano tundra prairie savanna jungle rainforest swamp marsh wetland delta lagoon reef dune
      hill ridge peak summit slope plateau gorge ravine boulder pebble stone rock sand soil clay moss fern grass
      reed bamboo oak maple pine cedar birch willow cypress redwood spruce elm ash palm cactus orchid lily rose tulip
      daisy lotus poppy violet lavender sunflower clover ivy vine thorn bark root branch twig leaf petal blossom bloom
      seed sprout acorn cone berry mushroom lichen pollen nectar honey hive bee wasp beetle butterfly moth dragonfly
      firefly cricket grasshopper ant spider snail worm frog toad newt turtle lizard snake gecko crow raven owl hawk
      eagle falcon heron crane swan duck goose sparrow robin finch wren parrot pelican penguin puffin gull seal otter
      beaver badger fox wolf bear deer elk moose bison rabbit hare squirrel chipmunk hedgehog mole bat whale dolphin
      shark octopus squid jellyfish crab lobster shrimp salmon trout coral plankton breeze gust storm thunder lightning
      rain drizzle mist fog frost snow sleet hail rainbow sunrise sunset dusk dawn twilight moonlight shade shadow
      season spring summer autumn winter harvest wildflower trail path grove orchard field pasture horizon`),
    food: W(`apple banana orange lemon lime grape cherry peach pear plum mango papaya pineapple coconut melon watermelon
      strawberry blueberry raspberry blackberry kiwi fig date apricot avocado tomato potato carrot onion garlic ginger
      pepper chili cucumber lettuce spinach kale cabbage broccoli cauliflower celery radish beet pumpkin squash zucchini
      eggplant corn pea bean lentil chickpea rice wheat oat barley quinoa noodle pasta spaghetti macaroni ramen dumpling
      bread toast bagel muffin croissant biscuit cracker pretzel pancake waffle crepe omelet egg cheese butter cream
      yogurt milk tofu soup stew curry salad sandwich burger taco burrito pizza sushi omelette casserole risotto
      paella lasagna gravy sauce salsa pesto hummus mustard ketchup mayo vinegar honey syrup jam jelly sugar salt
      cinnamon nutmeg vanilla cocoa chocolate caramel toffee fudge candy cookie brownie cupcake cake pie tart pudding
      custard sorbet gelato  popsicle smoothie juice lemonade tea coffee latte espresso cocoa broth
      breakfast lunch dinner supper brunch snack dessert appetizer picnic feast recipe kitchen oven stove skillet
      saucepan wok grill kettle blender whisk spatula ladle fork spoon plate bowl mug cup tray apron chef baker
      cook roast bake boil simmer steam fry saute toast grill chop slice dice mince stir knead whip peel grate season
      sprinkle crispy crunchy juicy tender savory sweet sour bitter spicy tangy salty smoky fresh ripe frozen`),
    space: W(`galaxy nebula comet asteroid meteor meteorite orbit planet moon star sun solar lunar stellar cosmic cosmos
      universe void vacuum gravity eclipse equinox solstice constellation zodiac pulsar quasar supernova nova 
      wormhole horizon singularity spacetime  parsec telescope observatory satellite rocket shuttle capsule
      module station spacesuit helmet visor astronaut cosmonaut pilot commander mission launch liftoff countdown booster
      thruster engine fuel oxygen airlock hatch dock docking orbiter lander rover probe payload antenna radar signal
      transmission frequency beacon mercury venus earth mars jupiter saturn uranus neptune pluto ceres titan europa
      callisto ganymede phobos deimos crater ridge regolith dust plasma radiation flare corona aurora magnetosphere
      atmosphere ionosphere stratosphere mesosphere exosphere ozone meteorology spectrum infrared ultraviolet redshift
      blueshift wavelength photon neutron proton quark boson   starlight starfield stardust
      starship spaceship mothership freighter cruiser shipyard hangar colony outpost terraform habitat biodome
      hydroponics greenhouse  weightless float drift spin tumble orbitals apogee perigee trajectory velocity
      thrust inertia momentum escape reentry splashdown  parachute countdown ignition  payload
      cargo crew captain navigator engineer scientist geologist biologist medic botanist astronomy astrophysics
      cosmology celestial interstellar intergalactic heliosphere kuiper oort   
        protostar starburst`),
    city: W(`city street avenue boulevard alley lane road highway freeway bridge tunnel intersection crosswalk sidewalk
      curb corner block downtown uptown suburb district neighborhood plaza square park fountain statue monument
      skyline skyscraper tower building apartment condo loft rooftop balcony lobby elevator escalator stairway
      basement garage parking meter subway metro station platform train tram bus taxi cab bike scooter commuter
      traffic signal stoplight streetlight billboard neon sign storefront shop market bakery cafe diner bistro
      restaurant bookstore library museum gallery theater cinema stadium arena gym pharmacy hospital clinic school
      campus office cubicle bank post courier delivery package laundromat salon barber tailor florist grocery
      supermarket mall boutique kiosk vendor stall  queue crowd rush hour noise siren horn honk bustle
      pedestrian tourist resident neighbor landlord tenant rent lease mortgage commute schedule timetable ticket
      fare pass turnstile map route detour shortcut construction crane scaffold concrete asphalt brick steel glass
      graffiti mural poster flyer newspaper headline broadcast radio podcast playlist headphones coffee latte bagel
      pretzel hotdog umbrella raincoat puddle gutter drain manhole hydrant mailbox bench planter rooftop garden
      greenhouse rooftop nightlife concert festival parade marathon carnival fair holiday weekend brunch errand
      chores laundry recycling compost trash dumpster alleyway backstreet waterfront harbor pier dock ferry marina
      boardwalk riverside lakeside hillside citywide downtown midtown`),
    music: W(`melody harmony rhythm tempo beat bar measure note chord scale key pitch tone octave interval major minor
      sharp flat natural treble bass clef staff rest whole half quarter eighth sixteenth triplet syncopation groove
      riff lick solo duet trio quartet band orchestra choir ensemble conductor composer songwriter producer engineer
      singer vocalist tenor alto soprano baritone falsetto vibrato harmonize chorus verse bridge intro outro hook
      refrain lyric anthem ballad lullaby sonata symphony concerto overture opera musical jazz blues rock funk soul
      disco reggae folk country gospel techno house trance dubstep ambient  synthwave chiptune piano keyboard
      organ synth synthesizer guitar ukulele banjo mandolin harp violin viola cello bass drum snare kick cymbal 
      tambourine xylophone marimba vibraphone flute piccolo clarinet oboe bassoon saxophone trumpet trombone tuba horn
      harmonica accordion bagpipe metronome tuner amplifier speaker microphone mixer fader equalizer reverb delay
      echo distortion overdrive compressor sampler sequencer loop track album single playlist vinyl cassette record
      studio stage concert gig tour encore soundcheck rehearsal practice jam session cover remix mashup acoustic
      electric unplugged crescendo diminuendo staccato legato fortissimo pianissimo allegro andante adagio largo
      presto rubato cadence motif theme variation improvise compose arrange transpose strum pluck bow tap hum whistle
      clap stomp sing`),
    science: W(`atom molecule electron proton neutron nucleus isotope ion element compound mixture solution reaction catalyst
      enzyme protein cell membrane tissue organ organism species genus evolution mutation gene genome chromosome
      bacteria virus fungus algae microbe microscope telescope laboratory experiment hypothesis theory variable control
      data sample observation measurement calibration accuracy precision error uncertainty graph equation formula
      constant ratio proportion density mass weight volume pressure temperature energy force motion velocity
      acceleration momentum friction gravity magnetism electricity current voltage resistance circuit conductor
      insulator semiconductor wave frequency amplitude wavelength spectrum photon laser optics lens prism mirror
      reflection refraction diffraction quantum particle relativity thermodynamics entropy kinetic potential thermal
      nuclear fusion fission radiation carbon oxygen hydrogen nitrogen helium sodium calcium iron copper silver gold
      zinc silicon lithium neon argon mercury titanium uranium plutonium crystal mineral fossil sediment erosion
      tectonic magma lava seismic geology biology chemistry physics ecology astronomy botany zoology anatomy
      physiology neuroscience genetics robotics engineering mathematics statistics calculus algebra geometry
      vector matrix integral derivative logarithm exponent fraction decimal prime factor theorem proof axiom model
      simulation prototype invention discovery research journal peer review citation abstract method results
      conclusion beaker flask pipette burette funnel centrifuge spectrometer thermometer barometer voltmeter
      oscilloscope petri dish specimen slide stain culture incubator sterile`),
    mythic: W(`dragon phoenix griffin unicorn pegasus centaur minotaur hydra kraken basilisk chimera sphinx wyvern wyrm
      serpent leviathan behemoth golem troll ogre goblin gremlin imp sprite pixie fairy elf dwarf giant titan
      cyclops siren mermaid nymph dryad satyr faun banshee wraith specter phantom spirit ghost shade revenant
      warlock wizard sorcerer sorceress witch mage enchanter alchemist oracle seer prophet sage druid shaman monk
      paladin knight squire ranger bard rogue thief herald king queen prince princess emperor empress throne crown
      scepter castle citadel fortress keep tower dungeon labyrinth maze crypt tomb ruins temple shrine altar portal
      realm kingdom empire dominion frontier wilderness enchanted forest grove glade mountain pass valley swamp
      quest prophecy legend myth saga epic fable tale lore riddle curse blessing spell charm hex rune glyph sigil
      talisman amulet relic artifact grimoire tome scroll potion elixir philter wand staff orb crystal gem jewel
      chalice grail sword blade shield banner sigil cloak hood boots gauntlet helm armor mail plate leather silk
      velvet gold silver mithril obsidian moonstone sunstone starfall moonlit stormborn firebrand frostfire
       everlight dawnbringer nightfall wildwood thornwall ironhold stormwatch skyreach dragonfly
       greystone  whitecliff redmoor dragonfire wyrmling hatchling familiar companion steed
      mount griffon owlbear direwolf shapeshifter werewolf vampire lich necromancer illusion conjure
      summon enchant banish ward bind awaken`),
    verbs: W(`walk talk run jump climb crawl swim dive fly float sink drift carry lift push pull drag throw catch drop
      hold grab grip squeeze press tap touch rub scratch fold bend stretch twist turn spin roll slide slip trip fall
      rise stand sit kneel lean rest sleep wake dream yawn blink stare glance look watch see notice spot search find
      seek hide cover reveal show point wave nod shake shrug smile laugh giggle grin frown sigh cry weep shout yell
      whisper mumble mutter speak say tell ask answer reply explain describe teach learn study read write type draw
      paint sketch color erase copy paste print scan send receive open close lock unlock knock enter leave arrive
      depart return stay wait hurry rush stroll wander travel explore visit meet greet invite join gather share give
      take borrow lend buy sell pay spend save earn win lose find keep store pack unpack fill empty pour spill mix
      stir cook bake boil fry chop slice cut peel wash rinse dry wipe clean sweep mop dust polish fix repair build
      make create design plan start begin finish end stop pause continue repeat try test check measure count add
      subtract divide multiply sort choose decide think remember forget imagine wonder guess know believe hope wish
      want need like love enjoy prefer agree argue discuss listen hear sing hum whistle dance play practice train
      exercise stretch breathe relax rest celebrate cheer clap thank welcome help support guide lead follow`),
  };

  // ---------- long words and hard spelling ----------
  const HARD = W(`accommodate accommodation acknowledgment acquaintance acquire aggressive amateur apparent argument
    atheist beginning believe bellwether biscuit broccoli bureaucracy business calendar camouflage
    cemetery changeable chauffeur colleague colonel commitment committee conscience conscientious conscious
    consensus definitely desperate dilemma disappear disappoint discipline dumbbell embarrass environment
    exaggerate exhilarate existence fahrenheit fiery fluorescent foreign forty fourth gauge glamorous government
    grammar grateful guarantee height hierarchy humorous hygiene hypocrisy idiosyncrasy ignorance immediate
    independent indispensable inoculate intelligence jewelry judgment knowledge leisure liaison library license
    lieutenant lightning maintenance maneuver medieval memento millennium miniature mischievous misspell necessary
    neighbor noticeable occasion occasionally occurred occurrence pastime perseverance personnel playwright
    possession precede privilege pronunciation publicly questionnaire receipt receive recommend reference referred
    relevant religious repetition restaurant rhyme rhythm ridiculous sacrilegious schedule scissors secretary
    seize separate sergeant silhouette sincerely sovereign supersede surprise tendency threshold tomorrow
    tongue truly twelfth tyranny vacuum vehicle vicious weird whether wholly withhold acquiesce anonymous
    archaeology bourgeois cantaloupe catastrophe chrysanthemum connoisseur dachshund entrepreneur
    euphemism fuchsia gnarled handkerchief kaleidoscope labyrinth mayonnaise mnemonic
    onomatopoeia ophthalmologist parallel pharaoh phenomenon playwright psychology pterodactyl questionnaire
    quinoa rendezvous renaissance reservoir resuscitate sapphire scythe silhouette subtle surveillance synonym
    tchotchke unnecessary vacillate xylophone yacht zucchini abbreviate accessible accidentally address
    aficionado algorithm anemone antediluvian apostrophe appropriate auxiliary banana bouillon
    boulevard buoyant caribbean? carriage census changeable characteristic chief clique collectible column
    concede connoisseur consensus correspondence counterfeit curiosity deceive dependent descendant desiccate
    diphthong discernible eighth eligible embarrassment emphasize equipment especially excellence
    exhaust facsimile familiar fascinate feasible fulfill gnome grievous guardian haphazard
    heir hindrance humorous hypothesis illegible incidentally inadvertent indict infinitesimal innocuous
    irresistible itinerary jeopardy khaki lacquer laboratory larynx liquefy manageable marshmallow meteorite
    minuscule mosquito naive nuisance obsession occurrence omission paradigm parliament? pavilion perceive
    perpendicular persistent pneumonia possess potatoes precede preferred privilege proceed propeller
    psychiatrist pursue quarantine queue rehearsal remembrance reminiscence rhinoceros sacrifice scenery
    sheriff sieve sophomore souvenir stationary stationery subpoena succeed sufficient supposedly surgeon
    technique temperature thorough tortoise tranquility unanimous unwieldy villain wednesday?`).filter(w => !w.endsWith('?'));

  // ---------- phrases, drills and sentences ----------
  const PHRASES = L(`
    open the window
    close the door
    turn on the light
    keep your hands low
    eyes on the screen
    one more round
    back to the start
    rain on the roof
    a cup of tea
    light the stove
    feed the cat
    water the plants
    call me later
    see you soon
    on the way
    just in time
    right on cue
    take a breath
    sit up straight
    slow and steady
    fast and clean
    clean hands
    quiet room
    warm socks
    cold coffee
    fresh bread
    bright morning
    late night
    early bus
    empty street
    full moon
    blue sky
    green light
    red alert
    low battery
    new message
    lost signal
    full charge
    press any key
    hold the shift key
    tap the spacebar
    home row first
    rest your wrists
    count to ten
    try it again
    trust the rhythm
    keep the streak
    beat your best
    race the ghost
    type it out
    every key counts
    one word at a time
    the next level
    the final boss
    save the game
    load the map
    open the chest
    find the key
    cross the bridge
    climb the tower
    follow the river
    over the hill
    under the bridge
    across the field
    through the forest
    by the sea
    near the station
    at the corner
    down the street
    up the stairs
    in the lobby
    on the rooftop
    pack your bag
    check the map
    catch the train
    miss the bus
    grab a snack
    order a pizza
    split the bill
    pay at the counter
    wash the dishes
    fold the laundry
    sweep the floor
    make the bed
    set an alarm
    brush your teeth
    tie your shoes
    walk the dog
    plant a seed
    pick a card
    roll the dice
    flip a coin
    spin the wheel
    draw a line
    fill the cup
    stir the pot
    taste the soup
    bake a cake
    share the cake
    pass the salt
    hum a tune
    play it loud
    turn it down
    drop the beat
    find the chord
    tune the strings
    learn the song
    sing the chorus
    clap along
    watch the stars
    reach for the moon
    launch the rocket
    count down from five
    the dark side
    across the galaxy
    beyond the stars
    deep in space
    lost in orbit
    back to earth
    run the code
    fix the bug
    push the commit
    merge the branch
    clear the cache
    reboot the server
    check the logs
    patch the kernel
    scan the network
    open a socket
    close the port
    lock the vault
    root access granted
    access denied
    system online
    signal found
    upload complete
    download failed
    out of memory
    stack overflow
    syntax error
    null pointer
    end of file
    ready player one
    game over
    press start
    insert coin
    level up
    new high score
    extra life
    boss room
    side quest
    loot drop
    critical hit
    combo breaker
    perfect run
    first try
    almost there
    so close
    not today
    one more time
    good game
    well played
    nice save
    great job
    keep going
    stay sharp
    stay calm
    deep breath
    long story
    short answer
    big idea
    small steps
    fresh start
    clean slate
    first light
    last call
    open road
    city lights
    street food
    night market
    rush hour traffic
    the last train
    a window seat
    the corner shop
    a paper map
    an old radio
    a quiet library
    the morning paper
    a rainy day
    a sunny afternoon
    the first snow
    autumn leaves
    spring rain
    summer heat
    winter coat
    ocean breeze
    mountain air
    river stones
    forest trail
    desert wind
    garden path`);

  const PUNCT = L(`
    it's done.
    wait, what?
    yes, of course.
    no, not yet.
    ready? go!
    don't stop.
    can't miss.
    you're up.
    they're here.
    we'll see.
    it's 9:45 now.
    meet at 7:30.
    lunch at noon.
    o'clock
    rock 'n' roll
    well-known
    re-run the test.
    e-mail me later.
    up-to-date
    self-made
    long-term plan
    "hello," she said.
    "ready?" he asked.
    "go!" they shouted.
    (not now)
    [draft]
    {done: true}
    <tag>
    a/b test
    either/or
    and/or
    yes; no; maybe.
    first: plan; then: type.
    one, two, three.
    red, green, blue.
    left; right; left.
    ...and then?
    wait... what?
    stop!
    really?!
    hey -- listen.
    x = 1;
    y = x + 2;
    if (a > b) return;
    for (i = 0; i < 9; i++)
    let ok = true;
    const max = 100;
    print("hello")
    list[0]
    map["key"]
    a && b
    a || b
    !done
    a == b
    a != b
    a <= b
    x += 1;
    path/to/file
    ~/home
    #hashtag
    @handle
    50% off
    $4.99
    #39ff88
    rgb(57, 255, 136)
    user_name
    file_name.txt
    snake_case
    kebab-case
    camelCase
    PascalCase
    CAPS LOCK
    Tab, then Enter.
    Ctrl+C, Ctrl+V.
    Shift+Tab
    Q.E.D.
    e.g. this one
    i.e. that one
    etc.
    p.s. thanks
    A+ work
    B- grade
    C# major
    #1 fan
    no. 42
    item #7
    5 * 5 = 25
    (2 + 3) * 4
    10 / 2 = 5
    7 - 3 = 4
    2^8 = 256`);

  const NUMBERS = L(`
    1 2 3 4 5
    6 7 8 9 0
    10 20 30 40
    100 200 300
    1024 bytes
    2048 pixels
    4096 colors
    60 fps
    144 hz
    240 hz
    8000 hz polling
    0.2 ms
    1.5 mm travel
    45 g springs
    62 g bottom out
    3.5 mm jack
    65% layout
    75% board
    96 keys
    104 keys
    87 keys
    61 keys
    v1.0
    v2.4.1
    10:15
    23:59
    00:00
    12/31
    1/1
    3/4
    7 days
    24 hours
    365 days
    52 weeks
    12 months
    1,000
    10,000
    100,000
    1,000,000
    3.14159
    2.718
    1.618
    0.5
    99.9%
    100%
    204 wpm
    150 wpm
    98% accuracy
    1st place
    2nd place
    3rd place
    4th lap
    5th try
    10th round
    level 99
    room 404
    gate 12
    bus 21
    line 7
    page 88
    track 3
    seat 14b
    floor 32
    apt 5c
    zone 9
    sector 7g
    port 8080
    port 443
    127.0.0.1
    10.0.0.1
    255 255 255
    0 0 0
    1 1 2 3 5 8 13
    2 4 8 16 32 64
    3 6 9 12 15
    11 22 33 44 55
    13 17 19 23 29
    90 180 270 360
    1920 1080
    2560 1440
    3840 2160`);

  // Written for this site. No lyrics, no quotes from books or films.
  const QUOTES = L(`
    Speed comes after the hands learn where every key lives.
    Type slowly until the mistakes stop, then let the speed come on its own.
    A clean word is worth more than two fast ones with a typo.
    The keyboard does not care how you feel, so keep your wrists loose and keep going.
    Every record started as a slow and careful first try.
    Look at the screen, not your fingers, and trust the home row.
    The spacebar is the key you press most, so give it a thumb you trust.
    Ten minutes a day beats three hours once a week.
    Read one word ahead so your fingers never wait for your eyes.
    A typo you fix right away costs one key, and a typo you ignore costs the whole word.
    Warm up with short words before you race long ones.
    The best typists are calm when the timer runs out.
    Rhythm wins races because a steady pace never stalls.
    Practice the words you get wrong, not the ones you already know.
    A good keyboard feels like it is pressing back just enough.
    The quiet switch and the loud switch type the same words.
    Your pinky finger is weaker, so give it the easy keys and the time to learn.
    Sit back, drop your shoulders and let the keys come to you.
    Accuracy builds the road and speed drives on it.
    The streak breaks the moment you rush the last word.
    Count your mistakes, then count them again next week.
    No one types fast on the first day.
    Your best run is the one you finish without looking down.
    The cursor blinks the same way for everyone.
    Short bursts of focus beat long hours of guessing.
    A missed key is a lesson, so type that word again until it is easy.
    Practice with music if it helps you keep a steady beat.
    Hold your breath and you will slow down, so breathe on every line.
    A clean desk and a clear screen make a calm mind.
    The fastest hands still start every word with one key.
    Rain tapped on the window as she finished the last line.
    The train left the station at exactly six in the morning.
    He packed a map, two apples and a spare battery for the trip.
    The city lights came on one block at a time.
    A cat slept on the warm hood of the parked car.
    The bakery on the corner opens before the sun comes up.
    We walked along the river until the path ran out.
    The old radio still picks up the late night station.
    She wrote the grocery list on the back of a ticket.
    The bus was late, so they shared an umbrella at the stop.
    The kettle clicked off just as the phone rang.
    A paper boat floated down the gutter after the storm.
    The library was so quiet you could hear pages turn.
    Snow covered the bikes that were left out overnight.
    The market sold fresh bread, ripe pears and warm noodles.
    Fog rolled in from the bay and hid the bridge.
    They counted the stars until the clouds moved in.
    The lift stopped on every floor on the way down.
    A street musician played the same song all afternoon.
    The kids built a tower of boxes and knocked it down.
    The server rebooted at midnight and every light turned green.
    A single missing semicolon kept the build from running.
    The patch fixed one bug and found three more.
    Back up your files before you try anything clever.
    The password was long, random and written nowhere.
    Every program starts with a blank file and a blinking cursor.
    The test passed on the third try after a long night.
    Clear the cache, reload the page and try again.
    The robot learned to sort the socks by colour.
    The rocket cleared the tower and climbed into the clouds.
    The probe sent back one blurry photo of a frozen moon.
    Astronauts sleep strapped to the wall so they don't float away.
    The comet comes back once every seventy six years.
    From orbit the whole city looks like a circuit board.
    The crew ate dinner while the earth turned under them.
    A dragon slept on a pile of coins in the old tower.
    The knight lost the map but found the river.
    The wizard forgot the spell and tried a joke instead.
    A small fox crossed the meadow without a sound.
    The waves pulled the sand back out to sea.
    The forest smelled of pine and wet stones after the rain.
    An owl watched the road from the top of the fence.
    The garden grew more mint than tomatoes this year.
    Bees hummed over the clover all afternoon.
    The mountain trail was steep, but the view was clear.
    Pour the water slowly so the coffee has time to bloom.
    Chop the onions first and keep the garlic for last.
    The soup tastes better the day after you make it.
    A pinch of salt makes the chocolate taste sweeter.
    Fresh noodles take two minutes and dry ones take ten.
    The drummer counted four and the whole band came in.
    Tune the low string first and the rest follow.
    The chorus came back louder after the quiet bridge.
    She hummed the melody until she could play it.
    The crowd clapped along until the song ended.
    Save often, because the boss always hits harder than you think.
    The last checkpoint was right before the hardest jump.
    He beat the level on the hundredth try and stood up to cheer.
    The map showed a door that nobody had opened.
    Pick up the coins, dodge the spikes and reach the flag.
    Two players on one keyboard is chaos, and it is great.
    The timer hit zero just as the last word went in.
    The world boss had a million points of health and a bad temper.
    Every word you type is one more hit on the boss.
    The quick brown fox has typed that sentence enough, so give it a rest.`);

  // ---------- common bands from the generated file ----------
  const C = window.WORDBANK_COMMON;
  // The site's players are mostly teenagers, so words that read as rude or crude on a stream
  // or in a duel are dropped from every list, whatever their everyday meaning.
  const TEEN_OFF = new Set(('anal anus butt butts bra bras penis vagina abortion idiot idiots stupid dumb ugly ' +
    'suck sucks sucked sucking sucker nude naked sexy sex sexual porn boobs breast breasts nipple drunk').split(' '));
  const teenOk = w => !String(w).toLowerCase().split(/[^a-z]+/).some(x => TEEN_OFF.has(x));
  const BANDS = C ? C.bands.map(b => b.split(' ').filter(teenOk)) : [];
  const LONG = C ? C.long.split(' ').filter(teenOk) : [];
  if (!C && window.WORDS) { BANDS.push(window.WORDS.common.filter(teenOk)); LONG.push(...window.WORDS.long.filter(teenOk)); }

  // ---------- difficulty ----------
  // QWERTY: finger 0-7 from left pinky to right pinky, row 0 top letters, 1 home, 2 bottom
  const KEYS = {};
  ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'].forEach((row, r) => [...row].forEach((ch, i) => { KEYS[ch] = { r, f: [0, 1, 2, 3, 3, 4, 4, 5, 6, 7][i] }; }));
  const RARE = { q: 2, z: 2, x: 2, j: 2, k: 1, v: 1, b: 0.5, w: 0.5, y: 0.5, p: 0.3, f: 0.2, g: 0.2 };
  const SHIFTED = /[A-Z~!@#$%^&*()_+{}|:"<>?]/;
  const cache = new Map();
  function meta(text) {
    let m = cache.get(text);
    if (m) return m;
    let rare = 0, same = 0, jump = 0, shift = 0, sym = 0, digit = 0, hand = 0, run = 0, prevHand = -1;
    const s = text.toLowerCase();
    for (let i = 0; i < text.length; i++) {
      const ch = s[i], raw = text[i];
      if (RARE[ch]) rare += RARE[ch];
      if (SHIFTED.test(raw)) shift++;
      if (/[0-9]/.test(ch)) digit++;
      else if (!/[a-z ]/.test(ch)) sym++;
      const k = KEYS[ch], p = KEYS[s[i - 1]];
      if (k) {
        const h = k.f < 4 ? 0 : 1;
        run = h === prevHand ? run + 1 : 1; prevHand = h;
        if (run >= 4) hand += 0.25;               // long one-hand runs (like "sweaters") tire the hand
        if (p && ch !== s[i - 1] && p.f === k.f) same++;        // same finger, different key
        if (p && Math.abs(p.r - k.r) === 2 && (p.f < 4) === (k.f < 4)) jump++;   // top to bottom row on one hand
      } else prevHand = -1;
    }
    const words = text.split(' ').length;
    const len = text.length;
    const raw = words > 1
      ? 1.2 + Math.min(4, len / 12) + (rare + same * 0.7 + jump * 0.5) / words * 1.2 + shift * 0.35 + sym * 0.45 + digit * 0.25
      : 0.4 + Math.max(0, len - 2) * 0.55 + rare * 0.75 + same * 0.85 + jump * 0.55 + hand + shift * 0.6 + sym * 0.7 + digit * 0.45;
    m = { len, rare: +rare.toFixed(1), reach: same + jump, shift, score: Math.max(1, Math.min(10, Math.round(raw))) };
    cache.set(text, m);
    return m;
  }

  // ---------- pools ----------
  const POOLS = {};
  const seen = new Set();
  function addPool(name, list, kind = 'word') {
    const out = [];
    const mine = new Set();
    for (const w of list) {
      if (!w || mine.has(w)) continue;
      mine.add(w);
      out.push(w);
    }
    POOLS[name] = { kind, list: out };
    out.forEach(w => seen.add(w));
  }
  BANDS.forEach((b, i) => addPool('band' + (i + 1), b));
  addPool('long', LONG);
  addPool('hard', HARD);
  for (const k in PACKS) addPool(k, PACKS[k]);
  addPool('phrases', PHRASES, 'phrase');
  addPool('punctuation', PUNCT, 'drill');
  addPool('numbers', NUMBERS, 'drill');
  addPool('quotes', QUOTES, 'sentence');
  POOLS.common = { kind: 'word', list: [...new Set(BANDS.flat())] };

  const PACK_NAMES = Object.keys(PACKS);
  const GROUPS = {
    mix: ['common', 'common', 'common', 'common', 'common', 'common', ...PACK_NAMES],
    any: ['common', 'common', 'common', 'common', ...PACK_NAMES, 'long', 'hard'],
    drills: ['punctuation', 'numbers'],
  };
  const THEMES = [...Object.keys(POOLS), ...Object.keys(GROUPS)];

  // ---------- random ----------
  function hash(str) {
    let h = 2166136261;
    str = String(str);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(seed) {
    let a = hash(seed);
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // candidates for one theme and length window, cached
  const cand = new Map();
  function candidates(theme, minLen, maxLen) {
    const key = theme + '|' + minLen + '|' + maxLen;
    let c = cand.get(key);
    if (!c) {
      const p = POOLS[theme];
      c = p ? p.list.filter(w => w.length >= minLen && w.length <= maxLen).map(w => ({ text: w, theme, ...meta(w) })) : [];
      cand.set(key, c);
    }
    return c;
  }
  function themesOf(theme) {
    const list = [].concat(theme || 'mix').flatMap(t => GROUPS[t] || [t]);
    return list.filter(t => POOLS[t]);
  }
  function range(d) {
    if (d === undefined || d === null) return [1, 10];
    if (Array.isArray(d)) return [d[0], d[1]];
    return [d - 1, d + 1];
  }

  const recent = [], recentSet = new Set();
  function remember(w) {
    recent.push(w); recentSet.add(w);
    if (recent.length > 400) recentSet.delete(recent.shift());
  }

  function pick(o = {}) {
    const count = o.count === undefined ? 10 : o.count;
    const r = o.rng || (o.seed !== undefined ? mulberry(o.seed) : Math.random);
    const seeded = r !== Math.random;
    const themes = themesOf(o.theme);
    if (!themes.length) return [];
    const minLen = o.minLen || 1, maxLen = o.maxLen || 999;
    const avoid = new Set([...(o.avoidFirstLetters || [])].map(c => c.toLowerCase()));
    const exclude = o.exclude ? new Set(o.exclude) : null;
    const out = [], used = new Set();
    let [lo, hi] = range(o.difficulty);
    for (let i = 0; i < count; i++) {
      let got = null;
      // widen the difficulty window, then drop the letter rule, before giving up on a slot
      for (let pass = 0; pass < 6 && !got; pass++) {
        const wlo = lo - (pass >= 1 ? pass : 0), whi = hi + (pass >= 1 ? pass : 0);
        const letters = pass < 5;
        for (let tries = 0; tries < 30 && !got; tries++) {
          const th = themes[Math.floor(r() * themes.length)];
          const list = candidates(th, minLen, maxLen);
          if (!list.length) continue;
          const e = list[Math.floor(r() * list.length)];
          if (e.score < wlo || e.score > whi) continue;
          if (used.has(e.text) || (exclude && exclude.has(e.text))) continue;
          const first = e.text[0].toLowerCase();
          if (letters && (avoid.has(first) || (o.distinctFirst && out.some(x => (x.text || x)[0].toLowerCase() === first)))) continue;
          if (!seeded && recentSet.has(e.text) && tries < 24) continue;
          got = e;
        }
      }
      if (!got) break;
      used.add(got.text);
      if (!seeded) remember(got.text);
      out.push(o.withMeta ? got : got.text);
    }
    return out;
  }

  // an endless supply for a word stack
  function stream(opts = {}) {
    let o = { ...opts };
    return {
      next(n = 1) { return pick({ ...o, count: n }); },
      set(next) { o = { ...o, ...next }; },
      opts: () => ({ ...o }),
    };
  }

  function list(theme) { return themesOf(theme).flatMap(t => POOLS[t].list); }
  function counts() {
    const c = {};
    for (const k in POOLS) c[k] = POOLS[k].list.length;
    c.commonTotal = POOLS.common.list.length;
    c.unique = seen.size;
    return c;
  }

  // TEEN_OFF and teenOk are also used by the chat filter (js/net/chat-rules.js)
  return { pick, stream, meta, list, counts, THEMES, PACKS: PACK_NAMES, hash, rng: mulberry, TEEN_OFF, teenOk };
})();
