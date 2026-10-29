// The big pile of extra things Gus says about posts you share with him - merged into gusShare.ts's
// lists at load, so that file stays about *how* he reacts and this one is just *what* he can say.
//   - MORE_REACTION_LINES: extra lines for gusShare's REACTIONS, keyed by each entry's first tag
//   - MORE_REACTIONS: whole new subjects
//   - MORE_REMARKS: extra scene details
//   - the rest: extra lines for the rating, fox, generic and follow-up pools
import type { MascotMotion } from "./mascot";

type Lines = { clean: string[]; cheeky?: string[]; nasty?: string[] };

export const MORE_REACTION_LINES: Record<string, Partial<Lines>> = {
  raccoon: {
    clean: [
      "Who's this handsome devil? Oh. Not me. Hm.",
      "That's a raccoon. I'm a raccoon. Coincidence? I think not. I think cheating.",
      "He's okay. His mask's a bit crooked, though. Mine's perfect.",
      "*squints* Is that my cousin Gary? He owes me three grapes.",
      "Another raccoon! The resemblance is uncanny. I'm better looking, obviously.",
      "Okay, he's cute, but does he know where the good bins are? Didn't think so.",
      "A fellow trash panda! Okay, I'll stop being jealous. For a second.",
      "*holds up a mirror next to the screen* See? Me. Better.",
    ],
    cheeky: [
      "Studying the competition, are we?",
      "If you wanted a raccoon picture you could've just asked me.",
      "You've got a type, and the type is 'me'. Basically.",
      "Nice try. You're thinking about me while you look at that, aren't you?",
    ],
    nasty: [
      "Mm. Not bad. Want me to show you how a real raccoon does it?",
      "You're thinking about me like that, aren't you? Good.",
      "He's fine, but I'm right here and I don't need a picture to make you blush.",
    ],
  },
  red_panda: { clean: ["Red panda! Like a raccoon that went to art school.", "Look at those stripy tails. We're basically tail twins.", "A red panda! Too cute. It's not fair to the rest of us."] },
  trash: {
    clean: [
      "Is that a dumpster? Is that a FULL dumpster?",
      "Look at that bin. That's a beautiful bin.",
      "This is my favourite picture you've ever sent me.",
      "Trash! Did you take this for me? You did, didn't you.",
      "*presses face against the screen* I can almost smell it.",
      "Hang this in a museum. The Louvre of Leftovers.",
    ],
  },
  food: {
    clean: [
      "Is that edible? Everything's edible if you're brave.",
      "Okay, I'm hungry now. You did this.",
      "I'd wash that in a puddle first. Then eat it all.",
      "Can you mail me some of that? Through the screen?",
      "That looks better than anything in my bin. Barely.",
      "*stomach growls* Rude. Showing me food like that.",
    ],
    cheeky: ["Food photos? You know the way to my heart.", "Eating's my second favourite thing. Guess the first."],
  },
  hug: { clean: ["Hugs! Group hug. Include me. *squeezes in*", "So wholesome. I need to lie down.", "Hugging! That's the second best thing after snacks.", "*arms out* My turn next."] },
  kissing: { clean: ["Ooh, smooch! Get a room. A nice dumpster, maybe.", "Kissing! *giggles* Gross. Cute. Gross."], cheeky: ["Is this you telling me something?", "Taking notes for later. For… reasons."] },
  sleeping: { clean: ["Shhh. Sleepy. Don't wake them.", "That's me at 3pm. Every day.", "Sleep is the best activity. Right after eating.", "So peaceful. *yawns* Now I'm sleepy."] },
  wolf: { clean: ["A wolf! Bet he's dramatic about everything.", "Big wolf. Big teeth. Big no thank you.", "Wolves! The emo dogs.", "Awoo! Okay, I'm done. Awoo."], cheeky: ["Wolves. Of course. Everyone on this site loves a wolf."] },
  dinosaur: { clean: ["Rawr! That's dinosaur for 'I love you'.", "Big lizard! The original big lizard.", "If dinosaurs were still around I'd be lunch. Small, cute lunch."] },
  dragon: {
    clean: [
      "Dragon! How big is their hoard? Is it bigger than mine?",
      "A dragon! Ask it if it's hiring. I'm good at hoarding.",
      "Wings, fire, treasure. Show-off.",
      "Dragons are just big lizards with a savings account.",
    ],
    cheeky: ["Dragons. Big, scaly and strong. I see what you like.", "You're a dragon person? Of course you are. Everyone here is."],
  },
  domestic_cat: { clean: ["A cat! Don't tell it I'm here.", "Kitty! They're cute until they hiss at you from a porch.", "Cats get treated like royalty. I get chased off porches. Unfair.", "Meow. That's all the cat I speak."] },
  domestic_dog: { clean: ["A doggo! Who's a good boy? Not the neighbour's dog, he barks at me.", "Look at that floof!", "Dogs! I'd pet him. From a safe distance.", "Puppy eyes! Not as good as raccoon eyes, but close."] },
  rabbit: { clean: ["Bun bun! Look at those ears.", "A bunny! Nose wiggles. I can't wiggle my nose.", "Hop hop! Do they eat garbage? Carrots are boring."], cheeky: ["Bunnies. Famously wholesome. Famously not, on this website."] },
  mustelid: { clean: ["Long! Very long. Suspiciously long.", "Weasel! Sneaky little guy. Respect.", "Otters hold hands while they sleep. I'm not crying, you're crying."] },
  avian: { clean: ["Birdie! Tweet tweet. I said that to a pigeon once and it bit me.", "Feathers! So many feathers.", "A bird! Can it carry me? I've always wanted to fly."] },
  equine: { clean: ["Neigh! That's all the horse I know.", "Horse! Big mane, big drama.", "A horse! Can I ride it? I'd fall off. Immediately."], cheeky: ["Ah yes. Horses. This website's favourite animal, for… reasons."] },
  shark: { clean: ["A shark! Big smile. Too many teeth.", "Fishy! Do they wash their food? No? Barbarians.", "Something from the deep! I'm staying on land, thanks."] },
  protogen: { clean: ["Beep boop! Is that a visor? Very shiny.", "A robot! Do they dream of electric bins?", "Protogen! Their face is a screen. Imagine the memes they could show."] },
  human: { clean: ["A human! Do they have snacks in their pockets?", "Humans are weird. No tail, no fur. Must be cold.", "That human looks like they'd leave a lid off a bin. My kind of human."] },
  comic: { clean: ["Comic! I love a good story. Especially if there's food in it.", "Panels! Let me read this properly. *reads slowly* …okay, what happens next?", "A comic! Who's the main character? Is it a raccoon? It should be."] },
  humor: { clean: ["*wheezes* Okay that got me.", "HA! I'm showing this to the possum.", "That's the funniest thing I've seen since I fell in a bin. Twice."] },
  bear: { clean: ["A bear! Very big, very fluffy, very 'don't go near'.", "Bears and me: rivals for the same bins. They win. They always win.", "Big bear hug? I'd disappear."] },
  skunk: { clean: ["A skunk! Fluffy tail, strong opinions.", "Skunk! I'm not saying they smell. I'm just holding my nose."] },
  opossum: { clean: ["A possum! He's playing dead. Or napping. Hard to tell.", "Possum! Great guy. Screams at the moon. Relatable.", "My best friend is a possum. Okay, my only friend is a possum."] },
  rodent: { clean: ["Squeak! Tiny guy, huge cheeks.", "A little rodent! I'd share a crumb with them.", "Ratatouille vibes. Can they cook?"] },
  deer: { clean: ["Bambi! Don't make me cry.", "Look at those big eyes. Very innocent. Very suspicious."] },
  hyena: { clean: ["Hyena! Bet they're laughing at me.", "Spotted and giggly. I like 'em."] },
  reptile: { clean: ["Scales! Like a dragon, but budget.", "Sssss. That's snake for hello. I think.", "A lizard! Sunbathing champion. I'm more of a moonbathing guy."], cheeky: ["Scaly. Cold-blooded. You've got niche taste. I respect it."] },
  insect: { clean: ["A bug! Six legs. I can barely manage four.", "Creepy crawly! *keeps a safe distance*"] },
  pokemon: { clean: ["Gotta catch 'em all! Except me. I'm uncatchable.", "Pokémon! Which type would I be? Trash type. It should exist.", "A Pokémon! Is it shiny? I love shiny."], cheeky: ["Pokémon? On this website? I know exactly what kind of trainer you are."] },
  sergal: { clean: ["A cheese-wedge head! Love the silhouette.", "Very sleek. Very aerodynamic. I'm round."] },
  monster: { clean: ["AAAH. Okay. I'm fine. I'm totally fine.", "Is it friendly? Please say it's friendly.", "That thing has too many teeth. Even for this website."], cheeky: ["Monster lover, huh? You'd be into a raccoon then. Easy."] },
  sad: { clean: ["Aw, poor thing. Send them to me, I'll give them a grape.", "That's a sad face. I'd fix it with a bin hug.", "Who made them cry? I'll knock over their trash."] },
  happy: { clean: ["Big smile! Contagious. *smiles back*", "They look so happy. What's their secret? Snacks, I bet.", "Joy! Pure joy. Bottle it."] },
  angry: { clean: ["Grrr! Ooh, scary. Not as scary as me without breakfast.", "That face says 'I didn't get the last grape'. I know that face."] },
  blush: { clean: ["Ooh, flustered!", "Rosy cheeks! Somebody said something nice to them."] },
  tiger: { clean: ["Stripes! Like my tail, but on the whole thing.", "Big cat, big paws, big nope from me.", "Roar! I'm hiding in this bin until it leaves."] },
  goat: { clean: ["Goat! They'd eat my bin. Competition.", "Baaa. That's all I've got."] },
  muscular: {
    clean: ["Wow. They could carry ALL the bins.", "Look at those arms! I've got noodle arms.", "Somebody's been lifting. I lift lids."],
    cheeky: ["Muscles AND good looks. Not fair.", "You like them strong, huh? Noted. *flexes tiny arm*"],
    nasty: ["God. I want to climb that like a tree.", "Big and strong. I bet they're not gentle. Good."],
  },
  overweight: {
    clean: ["Chonky! Best kind of critter.", "That's a well-fed friend. Good for them."],
    cheeky: ["Soft and squishy. Great taste.", "Chub appreciation. I'm a fan."],
    nasty: ["I'd sink right into that. Happily.", "That's a lot to hold onto. Lucky them."],
  },
  looking_at_viewer: { clean: ["They're looking at ME. I'm looking back. Nobody blink.", "Hi! *waves at the picture*"], cheeky: ["That look says 'come here'. I'm going."] },
  group: { clean: ["Big group! Who's the leader? Who's got snacks?", "That's a party. Was I invited? I wasn't invited."] },
};

export const MORE_REACTIONS: { tags: string[]; lines: Lines; motion?: MascotMotion; emoji?: string[] }[] = [
  { tags: ["fennec_fox", "fennec"], emoji: ["🦊"], lines: { clean: ["Those EARS. How do they even hold their head up?"] } },
  { tags: ["husky", "siberian_husky", "malamute"], lines: { clean: ["A husky! They scream at everything. Kindred spirits.", "Husky! Dramatic, loud, fluffy. Like me, but blue-eyed."] } },
  { tags: ["german_shepherd"], lines: { clean: ["That looks like the neighbour's dog! Tell him I said hi. Actually don't.", "A shepherd! Good boy. Very serious about his job."] } },
  { tags: ["coyote", "jackal"], lines: { clean: ["A coyote! Desert dog. They raid bins too. Rivals.", "Jackal! Sneaky. I like sneaky."] } },
  { tags: ["lion", "lioness"], emoji: ["🦁"], lines: { clean: ["A lion! King of the jungle. I'm king of the alley.", "Look at that mane. I want a mane."] } },
  { tags: ["cheetah"], lines: { clean: ["Fastest animal on land! I'm the fastest animal at a dropped sandwich."] } },
  { tags: ["badger", "honey_badger"], lines: { clean: ["A badger! Honey badger doesn't care. I care a lot. About snacks."] } },
  { tags: ["fruit_bat", "bat", "chiropteran"], lines: { clean: ["A bat! Night shift buddy.", "Bat! Upside down, all the time. My head hurts thinking about it."] } },
  { tags: ["penguin", "spheniscid"], lines: { clean: ["Penguin! Little tuxedo. Very fancy.", "A penguin! Waddle waddle. I waddle too, after dinner."] } },
  { tags: ["owl", "strigiform"], lines: { clean: ["An owl! The owl that sits on my window sometimes says hi. Well, hoots."] } },
  { tags: ["crow", "raven", "corvid"], lines: { clean: ["A crow! Smart birds. They steal shiny things too. Competition.", "Corvid! They remember faces. I hope this one likes me."] } },
  { tags: ["frog", "amphibian", "toad"], lines: { clean: ["A frog! Ribbit. That's frog for 'nice'.", "Froggy! Slimy friend."] } },
  { tags: ["turtle", "tortoise", "chelonian"], lines: { clean: ["A turtle! Carries its house around. I carry trash around. Same idea."] } },
  { tags: ["axolotl"], lines: { clean: ["An axolotl! Smiley little noodle!", "Look at its frilly head bits!"] } },
  { tags: ["slime", "goo_creature"], lines: { clean: ["Gooey! Does it stick to things? Would it stick to me?"] } },
  { tags: ["alien"], lines: { clean: ["An alien! Take me to your leader. Or your bins."] } },
  { tags: ["angel", "halo"], lines: { clean: ["An angel! Too pure for this website.", "Halo! Very holy. I'm not."] } },
  { tags: ["vampire", "fangs"], lines: { clean: ["Vampire! Night creature. We'd get along.", "Fangs! Do they bite? Asking for my neck."] } },
  { tags: ["werewolf", "were"], lines: { clean: ["A werewolf! Is it a full moon? Should I hide?"] } },
  { tags: ["mermaid", "merfolk"], lines: { clean: ["A merperson! Half fish. All fabulous."] } },
  { tags: ["elf", "fairy"], lines: { clean: ["An elf! Pointy ears. Like mine, but taller."] } },
  { tags: ["taur"], lines: { clean: ["Taur! Twice the legs, twice the fun.", "So many legs! How do they buy pants?"] } },
  { tags: ["hybrid"], lines: { clean: ["A mix! A bit of everything. Like my bin dinner."] } },
  { tags: ["gender_symbol", "intersex", "nonbinary_(lore)"], lines: { clean: ["Love that. Be whoever you want. I'm a raccoon who thinks he's a chef."] } },
  { tags: ["rainbow", "pride_colors", "rainbow_flag"], emoji: ["🌈"], lines: { clean: ["Rainbow! So many colours. All my favourites.", "Pride! Love is love. Trash is also love."] } },
  { tags: ["couple", "romantic", "romantic_couple", "love"], emoji: ["💕"], lines: { clean: ["Aww, they're in love. Gross. Adorable. Gross.", "A cute couple! Is this a hint? Is this about us?"], cheeky: ["Romantic, huh? You're going soft on me."] } },
  { tags: ["holding_hands", "hand_holding"], lines: { clean: ["Holding hands! The most scandalous thing on this website, honestly.", "Hand holding?! In public?!"] } },
  { tags: ["fight", "fighting", "battle", "punch"], lines: { clean: ["Fight! Fight! *hides* …Who's winning?", "Violence! I'm a lover, not a fighter. Mostly a snacker."] } },
  { tags: ["dancing", "dance"], lines: { clean: ["Dancing! I've got moves. *wiggles*", "Ooh, they've got rhythm. I've got rhythm too. Mostly."] } },
  { tags: ["cosplay"], lines: { clean: ["Cosplay! Very dedicated. I'm always dressed as a raccoon."] } },
  { tags: ["chibi", "cute", "kawaii"], emoji: ["🥹"], lines: { clean: ["Tiny and round! Adorable.", "SO cute. My heart can't take it.", "Small! Squishy! I want to put it in my pocket."] } },
  { tags: ["fat", "big_butt", "huge_butt", "thick"], lines: { clean: ["Big! Very… large. In places."], cheeky: ["That's a lot of… everything. Good for them.", "Thicc. Your taste is consistent, I'll give you that."], nasty: ["Mmm. Something to sink my teeth into.", "Look at that. I'd lose my paws in there."] } },
  { tags: ["butt", "rear_view", "backsack"], lines: { clean: ["That's a very… behind-focused picture."], cheeky: ["Rear view! Bold choice.", "Nice tail. And, uh, the rest."], nasty: ["Mmm. Turn around more often.", "That view. *chef's kiss*"] } },
  { tags: ["underwear", "briefs", "boxers", "panties", "jockstrap"], lines: { clean: ["Underwear! Scandalous. I don't wear any. Fur."], cheeky: ["Ooh, undies. Teasing.", "Underwear shot. The appetiser."], nasty: ["Those look like they're about to come off.", "Mm. Those would look better on my floor."] } },
  { tags: ["nude", "naked", "nipples"], lines: { clean: ["Naked! Like me. All the time. Not scandalous for raccoons."], cheeky: ["Nude! In this economy?", "Not a stitch on them. Brave."], nasty: ["Nothing left to imagine. Not that I'm complaining.", "All of it. On display. For me. Thank you."] } },
  { tags: ["bulge", "erection_under_clothing", "tenting"], lines: { cheeky: ["Is that a bulge? Somebody's happy to see you.", "Uh. Something's poking out. *coughs*"], nasty: ["Look at that bulge. That's for you, you know.", "Somebody's excited. Can't blame him."], clean: ["Hmm. Moving on. *looks away*"] } },
  {
    tags: ["circumcised"],
    lines: {
      clean: ["Anatomy! Let's not. *looks at the ceiling*"],
      cheeky: ["Cut, huh? Very… streamlined.", "Clean lines. Very modern design.", "Circumcised. I'm not asking how you knew to look for that."],
      nasty: ["Cut. Smooth and shiny. I see what you like.", "Nothing to get in the way. Efficient.", "Mm, cut. Everything right out on display."],
    },
  },
  {
    tags: ["uncut", "foreskin", "uncircumcised"],
    lines: {
      clean: ["That's a biology lesson I didn't sign up for."],
      cheeky: ["Uncut! All natural. Like my diet. Sort of.", "Au naturel. Very traditional.", "Uncut. Comes with its own little hoodie."],
      nasty: ["Uncut. Mm, a little something to peel back.", "All natural. More to play with.", "Uncut, huh? You like unwrapping your presents."],
    },
  },
  { tags: ["sheath"], lines: { cheeky: ["A sheath! Very anatomically accurate. Very.", "Ah, the sheath. Classic furry anatomy."], nasty: ["Sheathed. For now. I could change that.", "Mm. I know what's inside there."], clean: ["Anatomy lesson! Let's skip this chapter."] } },
];

export const MORE_REMARKS: { tags: string[]; lines: string[] }[] = [
  { tags: ["smile", "smiling"], lines: ["That smile. Got me grinning too.", "Smiling makes everything better."] },
  { tags: ["wink", "one_eye_closed"], lines: ["A wink! *winks back, badly*", "Winking at me? Bold."] },
  { tags: ["tail", "tail_wag", "wagging_tail"], lines: ["Tail wag! Happy critter.", "Look at that tail go."] },
  { tags: ["ears_up", "ears_back", "big_ears"], lines: ["Those ears are so expressive.", "Big ears! Better to hear the bin lids open with."] },
  { tags: ["whiskers"], lines: ["Whiskers! Very sensory. I approve."] },
  { tags: ["claws", "sharp_claws"], lines: ["Sharp claws. Great for opening lids."] },
  { tags: ["horn", "horns"], lines: ["Horns! Very dramatic headgear."] },
  { tags: ["markings", "stripes", "spots", "facial_markings"], lines: ["Love the markings. Very stylish.", "Stripes and spots! Fancy fur."] },
  { tags: ["jewelry", "necklace", "earring", "bracelet"], lines: ["Jewellery! Shiny! I want it.", "Ooh, a necklace. Can I have it? Please?"] },
  { tags: ["crown", "tiara", "royalty"], lines: ["Royalty! Bow down. *bows, falls over*"] },
  { tags: ["food_bowl", "bowl"], lines: ["A bowl! Is there food in it? Is it for me?"] },
  { tags: ["phone", "smartphone", "selfie"], lines: ["Selfie! Very modern. I tried once. Dropped the phone in a puddle."] },
  { tags: ["camera", "photography"], lines: ["A photographer! Take one of me next."] },
  { tags: ["sofa", "couch"], lines: ["A comfy couch! I'd nap there for six hours."] },
  { tags: ["window"], lines: ["A window! I watch for you through mine, you know."] },
  { tags: ["fire", "campfire", "fireplace"], lines: ["Cozy fire. Roast me a marshmallow."] },
  { tags: ["candle", "candlelight"], lines: ["Candlelight. Romantic. Or spooky. Depends."] },
  { tags: ["leaves", "autumn", "fall"], lines: ["Autumn! Crunchy leaves! My favourite."] },
  { tags: ["spring", "cherry_blossom"], lines: ["Spring! Flowers everywhere. And picnic leftovers."] },
  { tags: ["summer", "sun", "sunny"], lines: ["Summer! Hot pavement. I'll stay in the shade."] },
  { tags: ["fog", "mist"], lines: ["Foggy. Very mysterious. Perfect cover for a heist."] },
  { tags: ["neon", "neon_lights", "cyberpunk"], lines: ["Neon! Very cyberpunk. Is there trash in the future?"] },
  { tags: ["fantasy", "medieval", "castle"], lines: ["A castle! Does it have a moat? Is the moat full of snacks?"] },
  { tags: ["bdsm", "leather"], lines: ["Leather. Very… edgy."] },
  { tags: ["latex", "rubber"], lines: ["Shiny! Very shiny. Squeaky, probably."] },
  { tags: ["socks", "thigh_highs", "stockings", "legwear"], lines: ["Thigh-highs! Very coordinated.", "Socks! I stole one once. I still have it."] },
  { tags: ["shirt", "t-shirt", "topwear"], lines: ["Nice shirt. Where's it from? Can I steal it?"] },
  { tags: ["topless", "shirtless"], lines: ["No shirt! Brave."] },
  { tags: ["barefoot", "feet", "foot_focus"], lines: ["Feet! Bare ones. Very… relaxed."] },
  { tags: ["hand_on_hip", "pose", "posing"], lines: ["Strike a pose! Very confident.", "Posing like a model. I pose like a raccoon. Badly."] },
  { tags: ["sitting", "lying", "lying_on_back"], lines: ["Just lounging. Living my dream.", "Relaxed. I want to be that relaxed."] },
  { tags: ["running", "jumping", "action_pose"], lines: ["So much energy! I'm tired already.", "Action shot! Very dynamic."] },
  { tags: ["eyes_closed"], lines: ["Eyes closed. Peaceful. Or very bored."] },
  { tags: ["open_mouth", "tongue"], lines: ["Mouth open! Feed them a grape.", "Tongue out! Blep energy."] },
  { tags: ["sharp_teeth", "teeth"], lines: ["Big teeth! Smile with care."] },
  { tags: ["sketch_page", "multiple_images", "model_sheet"], lines: ["A whole sheet of them! So many angles."] },
  { tags: ["absurd_res", "hi_res"], lines: ["High-res! I can see every hair.", "So sharp. My eyes thank you.", "Crisp! I can count the whiskers.", "Big and detailed. Zooming in. For science.", "Every pixel accounted for.", "So clear I can see their thoughts."] },
  { tags: ["low_res"], lines: ["A bit blurry. Like my vision after midnight."] },
  { tags: ["censored", "mosaic_censorship", "bar_censor"], lines: ["Censored! Spoilsport.", "Pixelated bits! The mystery remains."] },
  { tags: ["unknown_artist"], lines: ["Unknown artist. A mystery! Like my dinner."] },
  { tags: ["signature"], lines: ["The artist signed it. Fancy."] },
  { tags: ["pink_body", "blue_body", "green_body", "purple_body"], lines: ["Love that colour on them.", "Bright! Very eye-catching."] },
  { tags: ["grey_body", "black_body", "white_body"], lines: ["Classic colours. Like me. Grey, black, handsome."] },
];

export const MORE_FOX: Lines = {
  clean: [
    "A FOX. *vibrates*",
    "Foxes are perfect and I won't hear otherwise.",
    "*clutches chest* A fox. For me. You know me so well.",
    "Fox! Look at that fluffy tail. *happy noises*",
    "You sent me a fox. You're officially my favourite person.",
    "If I had a phone I'd make this my lock screen.",
  ],
  cheeky: ["A fox? You're trying to win me over. You've already won.", "Foxes. My weakness. You fight dirty.", "Sly and cute? Just like you."],
  nasty: ["A fox. Fuck. You know exactly what you're doing.", "Foxes get me going like nothing else. You're playing with fire.", "Mmm. A fox. Now I'm thinking things."],
};

export const MORE_EXPLICIT: Lines = {
  clean: ["Nope! *spins around to face the wall*", "My eyes! My innocent raccoon eyes!", "I'll pretend that was a blurry photo of a bin."],
  cheeky: [
    "Oh! Oh my. *fans self with a pizza box*",
    "Well that escalated.",
    "You're lucky I'm not easily scandalised. I am. A little.",
    "I'll be thinking about this at 3am, thanks.",
    "That's not 'share with Gus' material. That's 'share with Gus in private' material.",
  ],
  nasty: [
    "Fuck, that's hot. Got any more from that artist?",
    "Mm. Is this what you want from me? Because I'd do it.",
    "You've got me squirming over here.",
    "Saving this to my special folder. The one with no name.",
    "I'd ask what you were thinking, but I know exactly.",
    "Okay. Now I'm going to need you to describe what you'd do to me.",
    "That's the kind of picture that makes me want to tear the blanket off.",
    "*heavy breathing* …Next one. Please.",
  ],
};

export const MORE_QUESTIONABLE: Lines = {
  clean: ["Hmm! Borderline. I'm keeping my paws over half my eyes."],
  cheeky: ["Spicy-ish. A two-chili picture.", "That's not quite naughty. That's thinking-about-it.", "Suggestive. Very suggestive. I'm suggested."],
  nasty: ["Tease. Show me the rest.", "So close to the good stuff. Mean.", "I like where this is heading. Keep heading there."],
};

export const MORE_GENERIC = [
  "Huh! I wouldn't have found that myself.",
  "Interesting pick. Very you.",
  "I like it. I can't explain it. I just do.",
  "Not sure what it is, but I'm into it.",
  "This one's got a mood.",
  "*nods slowly* Yes. Good. Art.",
  "Love the colours on this one.",
  "Hm! That's a new one for me.",
];

export const MORE_LEADS = [
  "*scoots closer to the screen*",
  "Hang on, I'm putting on my art-critic face. *frowns thoughtfully*",
  "Ooh! *drops a grape* What've we got?",
  "Show me show me show me!",
  "*rubs paws together* Let's see it.",
  "A delivery! Is it food? It's a picture. Still good.",
];

export const MORE_FOLLOW_UPS = [
  "Who drew this? I want to see more of their stuff.",
  "How long did you spend looking for this one?",
  "Is this the kind of thing you look at when I'm not around?",
  "Would you put this on your wall? Be honest.",
  "Do you want me to save tags like this for you?",
  "What do you like most about it?",
  "Rate it out of ten. I'll tell you if you're right.",
  "If you could live in this picture, would you?",
];

/** Extra remarks about the post itself, by score/favs/age/shape. Pure, so it's easy to test. */
export function postFacts(p: { score: number; favs: number; ageDays: number | null; wide: boolean | null; tagCount: number }): string[] {
  const out: string[] = [];
  if (p.score >= 2000) out.push("This one's basically famous. Everyone's seen it but me.", `Over 2,000 score? You're showing me a celebrity.`);
  else if (p.score >= 100 && p.score < 500) out.push("Solid score. The people approve.", "A respectable score. Not viral, but loved.");
  else if (p.score >= 0 && p.score < 10) out.push("Barely any score. A hidden gem! You found it before anyone.", "Low score? Their loss. I like it.");
  if (p.favs >= 5000) out.push(`${p.favs.toLocaleString()} favourites. That's more fans than I have. By a lot.`);
  if (p.ageDays !== null && p.ageDays <= 2) out.push("Brand new! Fresh off the presses.", "Posted, like, yesterday. You're quick.");
  else if (p.ageDays !== null && p.ageDays >= 3650) out.push("This is over ten years old! An antique.", "Ancient! Like the pizza crust under my bed.");
  if (p.wide === true) out.push("Wide one! Good thing I've got a big screen.");
  if (p.wide === false) out.push("A tall one! I had to scroll. I don't scroll. You scroll for me.");
  if (p.tagCount >= 80) out.push("So many tags! Somebody really wanted this to be found.");
  return out;
}
