// Kurerade recept optimerade för viktnedgång och hälsa enligt aktuell forskning, plus regelmotor och forskningsstöd.
// Näringsvärden per portion (avrundade). grams = portionens vikt, fiber i gram. steps: {t: svensk text, img: engelsk bildbeskrivning}.

export const RESEARCH = [
  { key: 'protein', title: 'Protein mättar och skyddar musklerna', text: 'Ett högre proteinintag (1,6–2,2 g/kg kroppsvikt) ger mer mättnad, något högre energiförbrukning och bevarar muskelmassa vid viktnedgång. Metaanalyser av kontrollerade studier visar större fettförlust med proteinrik kost vid samma kaloriintag.', src: 'Wycherley TP m.fl., Am J Clin Nutr 2012; Leidy HJ m.fl., Am J Clin Nutr 2015' },
  { key: 'density', title: 'Låg energitäthet – mer mat, färre kalorier', text: 'Vi äter ungefär samma vikt mat per dag. Mat med mycket vatten och fiber (grönsaker, soppor, baljväxter, magra proteiner) ger mättnad på färre kalorier och minskar det totala intaget utan hunger.', src: 'Rolls BJ, Physiol Behav 2009; Holt SHA m.fl., Eur J Clin Nutr 1995 (mättnadsindex)' },
  { key: 'fiber', title: 'Fiber: 25–30 g per dag', text: 'Högt fiberintag från fullkorn, baljväxter, grönsaker och frukt kopplas till lägre kroppsvikt och lägre risk för hjärt-kärlsjukdom och typ 2-diabetes. Fiber sänker energitätheten och bromsar blodsockret.', src: 'Reynolds A m.fl., Lancet 2019' },
  { key: 'upf', title: 'Minimalt processat slår ultraprocessat', text: 'I en kontrollerad studie åt deltagarna ca 500 kcal mer per dag och gick upp i vikt när maten var ultraprocessad, jämfört med oprocessad mat med samma makronäring. Riktig mat lagad från grunden gör det lättare att äta lagom.', src: 'Hall KD m.fl., Cell Metabolism 2019' },
  { key: 'adherence', title: 'Den kost du orkar följa vinner', text: 'Nätverksmetaanalyser av populära dieter visar liknande viktnedgång efter 6 månader oavsett namn – skillnaden avgörs av hur länge man håller i. Därför prioriterar Tallrik enkel, god vardagsmat framför extrema upplägg.', src: 'Ge L m.fl., BMJ 2020' },
  { key: 'mediterranean', title: 'Medelhavs- och nordisk kost för hälsan', text: 'Kost rik på grönsaker, baljväxter, fisk, fullkorn, nötter och olivolja/rapsolja minskar risken för hjärt-kärlsjukdom. De nordiska näringsrekommendationerna 2023 och Livsmedelsverkets kostråd 2024 bygger på samma mönster.', src: 'Estruch R m.fl., NEJM 2018 (PREDIMED); Nordic Nutrition Recommendations 2023; Livsmedelsverket 2024' },
  { key: 'breakfast', title: 'Proteinrik frukost dämpar suget', text: 'Frukost med ägg eller annan proteinkälla gav mindre hunger och lägre intag senare på dagen än en lika stor kolhydratfrukost, och större viktnedgång i en 8-veckorsstudie.', src: 'Vander Wal JS m.fl., Int J Obes 2008' },
  { key: 'drinks', title: 'Drick inte dina kalorier', text: 'Flytande kalorier (läsk, juice, alkohol) mättar dåligt. Att byta till vatten, kaffe eller te är ett av de enklaste sätten att skapa ett kaloriunderskott utan att känna det.', src: 'Livsmedelsverket 2024; Nordic Nutrition Recommendations 2023' },
];

export const RECIPES = [
  // ---------- Frukost ----------
  { id: 'gr1', slot: 'breakfast', emoji: '🥣', title: 'Proteingröt med blåbär', d: 'Havregrynsgröt med kvarg rört i, toppad med blåbär och kanel', kcal: 380, protein: 24, carbs: 48, fat: 7, fiber: 7, grams: 420, min: 8, tags: ['veg', 'fiber', 'protein', 'quick', 'whole'],
    ing: ['0,5 dl havregryn (50 g)', '2 dl vatten eller mjölk', '100 g kvarg naturell', '1 dl blåbär (färska eller frysta)', '1 krm salt, kanel'],
    imgPrompt: 'bowl of creamy oatmeal porridge topped with blueberries and a sprinkle of cinnamon, overhead, natural daylight, minimal ceramic bowl',
    steps: [{ t: 'Koka upp havregryn med vatten eller mjölk och en nypa salt. Sjud 3–4 minuter under omrörning.', img: 'oats simmering in a small saucepan with a wooden spoon' }, { t: 'Ta av från värmen och rör ner kvargen så gröten blir krämig och proteinrik.', img: 'stirring white quark into oatmeal porridge in a pot' }, { t: 'Lägg upp i en skål, toppa med blåbär och kanel.', img: 'oatmeal in bowl topped with blueberries and cinnamon' }] },
  { id: 'gr2', slot: 'breakfast', emoji: '🍳', title: 'Äggröra med spenat och rågbröd', d: 'Tre ägg, färsk spenat och tomat på en skiva fullkornsrågbröd', kcal: 400, protein: 26, carbs: 22, fat: 23, fiber: 5, grams: 330, min: 10, tags: ['veg', 'protein', 'quick', 'whole'],
    ing: ['3 ägg', '50 g färsk spenat', '1 tomat', '1 skiva fullkornsrågbröd', '1 tsk smör eller rapsolja', 'salt, svartpeppar, gräslök'],
    imgPrompt: 'plate with soft scrambled eggs with spinach next to a slice of dark rye bread and sliced tomato, overhead, natural light',
    steps: [{ t: 'Vispa äggen lätt med salt och peppar.', img: 'whisking eggs in a bowl with a fork' }, { t: 'Hetta upp smöret i en panna på medelvärme och låt spenaten falla ihop i 30 sekunder.', img: 'fresh spinach wilting in a frying pan' }, { t: 'Häll i äggen och rör långsamt tills de precis stannat – krämiga, inte torra.', img: 'creamy scrambled eggs with spinach in a pan' }, { t: 'Servera på rågbrödet med skivad tomat och gräslök.', img: 'scrambled eggs on rye bread with tomato and chives' }] },
  { id: 'gr3', slot: 'breakfast', emoji: '🥛', title: 'Kvarg med müsli och äpple', d: 'Naturell kvarg, en näve müsli och tärnat äpple – klart på tre minuter', kcal: 350, protein: 30, carbs: 40, fat: 5, fiber: 6, grams: 400, min: 3, tags: ['veg', 'protein', 'quick'],
    ing: ['250 g kvarg naturell eller vanilj utan tillsatt socker', '30 g osötad müsli', '1 äpple', 'kanel'],
    imgPrompt: 'bowl of thick white quark topped with granola and diced apple, cinnamon, overhead, bright kitchen',
    steps: [{ t: 'Lägg kvargen i en skål.', img: 'thick quark in a bowl' }, { t: 'Tärna äpplet med skalet på för mer fiber.', img: 'dicing a red apple on a cutting board' }, { t: 'Toppa med müsli, äpple och kanel.', img: 'quark bowl topped with granola and apple' }] },
  { id: 'gr4', slot: 'breakfast', emoji: '🍓', title: 'Skyr-bowl med hallon och mandel', d: 'Skyr, hallon, hackad mandel och chiafrön', kcal: 330, protein: 30, carbs: 18, fat: 12, fiber: 9, grams: 340, min: 4, tags: ['veg', 'protein', 'fiber', 'quick', 'gf'],
    ing: ['250 g skyr naturell', '1 dl hallon', '15 g mandel', '1 msk chiafrön', 'ev. 1 tsk honung'],
    imgPrompt: 'skyr yogurt bowl with raspberries, chopped almonds and chia seeds, overhead, minimal',
    steps: [{ t: 'Rör ut chiafröna i skyren och låt stå 5 minuter om du vill ha den tjockare.', img: 'stirring chia seeds into white skyr yogurt' }, { t: 'Hacka mandeln grovt.', img: 'chopping almonds on a wooden board' }, { t: 'Toppa med hallon och mandel.', img: 'yogurt bowl topped with raspberries and almonds' }] },
  { id: 'gr5', slot: 'breakfast', emoji: '🍄', title: 'Omelett med champinjoner och feta', d: 'Fluffig omelett på tre ägg med stekta champinjoner och lite fetaost', kcal: 340, protein: 26, carbs: 4, fat: 24, fiber: 2, grams: 300, min: 10, tags: ['veg', 'protein', 'quick', 'lchf', 'gf'],
    ing: ['3 ägg', '100 g champinjoner', '30 g fetaost', '1 tsk rapsolja', 'salt, peppar, persilja'],
    imgPrompt: 'folded omelette with mushrooms and crumbled feta on a white plate, parsley, natural light',
    steps: [{ t: 'Skiva champinjonerna och stek dem i oljan tills de fått färg, 3–4 minuter.', img: 'sliced mushrooms browning in a frying pan' }, { t: 'Vispa äggen med salt och peppar, häll över svampen och sänk värmen.', img: 'pouring beaten eggs over mushrooms in a pan' }, { t: 'När omeletten nästan stannat: smula över fetan, vik ihop och servera.', img: 'folding an omelette with feta in a pan' }] },
  { id: 'gr6', slot: 'breakfast', emoji: '🥪', title: 'Fullkornsmacka med keso och ägg', d: 'Två skivor fullkornsbröd, keso, kokt ägg och gurka', kcal: 380, protein: 28, carbs: 36, fat: 12, fiber: 7, grams: 320, min: 10, tags: ['veg', 'protein', 'whole', 'quick'],
    ing: ['2 skivor fullkornsbröd', '100 g keso', '1 ägg', '5 skivor gurka', 'svartpeppar, gräslök'],
    imgPrompt: 'open sandwiches on dark wholegrain bread with cottage cheese, sliced boiled egg and cucumber, overhead',
    steps: [{ t: 'Koka ägget 8 minuter, kyl i kallt vatten och skala.', img: 'boiling an egg in a small pot' }, { t: 'Bred keso på brödet.', img: 'spreading cottage cheese on wholegrain bread' }, { t: 'Lägg på skivat ägg och gurka, peppra och strö över gräslök.', img: 'wholegrain sandwich topped with egg slices and cucumber' }] },
  { id: 'gr7', slot: 'breakfast', emoji: '🥤', title: 'Grön proteinsmoothie', d: 'Kvarg, banan, spenat och mango – mättande och snabb', kcal: 290, protein: 22, carbs: 45, fat: 2, fiber: 5, grams: 520, min: 4, tags: ['veg', 'protein', 'quick', 'gf'],
    ing: ['150 g kvarg', '1 banan', '1 näve spenat', '1 dl fryst mango', '2 dl vatten eller mjölk'],
    imgPrompt: 'tall glass of green smoothie next to spinach leaves and banana, bright kitchen',
    steps: [{ t: 'Lägg allt i en mixer.', img: 'blender filled with spinach banana mango and quark' }, { t: 'Mixa slätt, späd med vatten till önskad tjocklek.', img: 'pouring green smoothie into a glass' }] },
  { id: 'gr8', slot: 'breakfast', emoji: '🍎', title: 'Overnight oats med äpple och kanel', d: 'Förbered kvällen innan: havregryn, kvarg, mjölk, äpple och linfrö', kcal: 370, protein: 22, carbs: 45, fat: 9, fiber: 8, grams: 420, min: 5, tags: ['veg', 'fiber', 'protein', 'whole', 'quick'],
    ing: ['40 g havregryn', '1,5 dl mjölk', '100 g kvarg', '½ rivet äpple', '1 msk linfrö', 'kanel'],
    imgPrompt: 'glass jar of overnight oats layered with grated apple and cinnamon, morning light',
    steps: [{ t: 'Blanda havregryn, mjölk, kvarg, linfrö och kanel i en burk.', img: 'mixing oats milk and quark in a glass jar' }, { t: 'Riv ner äpplet, rör om och ställ i kylen över natten.', img: 'grating an apple into a jar of oats' }, { t: 'Ät kall eller värm 1 minut i mikron.', img: 'overnight oats jar ready to eat with a spoon' }] },

  // ---------- Lunch ----------
  { id: 'lu1', slot: 'lunch', emoji: '🥗', title: 'Kycklingsallad med linser och feta', d: 'Grillad kycklingfilé, gröna linser, tomat, gurka och feta med citrondressing', kcal: 480, protein: 45, carbs: 24, fat: 22, fiber: 8, grams: 450, min: 15, tags: ['protein', 'fiber', 'gf', 'veg-rich', 'legumes'],
    ing: ['120 g kycklingfilé', '1 dl kokta gröna linser (färdigkokta på burk går bra)', '2 nävar bladsallad', '1 tomat, ½ gurka', '30 g fetaost', '1 msk olivolja, saft från ½ citron', 'salt, peppar'],
    imgPrompt: 'salad bowl with sliced grilled chicken breast, green lentils, tomato, cucumber and crumbled feta, lemon wedge, overhead',
    steps: [{ t: 'Krydda kycklingen med salt och peppar. Stek eller grilla 5–6 minuter per sida tills genomstekt. Låt vila och skiva.', img: 'grilled chicken breast being sliced on a cutting board' }, { t: 'Skölj linserna. Skär tomat och gurka i bitar.', img: 'rinsing green lentils in a sieve' }, { t: 'Vispa ihop olivolja, citron, salt och peppar.', img: 'whisking lemon olive oil dressing in a small bowl' }, { t: 'Blanda sallad, linser och grönsaker, lägg på kycklingen, smula över fetan och ringla över dressingen.', img: 'assembling chicken lentil salad with feta in a bowl' }] },
  { id: 'lu2', slot: 'lunch', emoji: '🌯', title: 'Laxwrap med yoghurt och dill', d: 'Varmrökt lax, spenat, gurka och dillyoghurt i fullkornstortilla', kcal: 430, protein: 30, carbs: 34, fat: 18, fiber: 5, grams: 300, min: 8, tags: ['fish', 'omega3', 'quick', 'protein'],
    ing: ['1 fullkornstortilla', '100 g varmrökt lax', '2 msk turkisk yoghurt', '1 näve spenat', '¼ gurka i stavar', 'dill, citron, svartpeppar'],
    imgPrompt: 'wholegrain wrap cut in half filled with flaked hot-smoked salmon, spinach, cucumber and dill yogurt, overhead',
    steps: [{ t: 'Rör ihop yoghurt, hackad dill, lite citron och peppar.', img: 'mixing yogurt with chopped dill in a bowl' }, { t: 'Bred yoghurten på tortillan, lägg på spenat, gurka och laxen i bitar.', img: 'tortilla topped with spinach cucumber and smoked salmon' }, { t: 'Rulla ihop hårt, skär på mitten.', img: 'rolling a wrap tightly and cutting it in half' }] },
  { id: 'lu3', slot: 'lunch', emoji: '🍲', title: 'Röd linssoppa med spiskummin', d: 'Krämig soppa på röda linser, morot och tomat – mättar länge på få kalorier', kcal: 420, protein: 22, carbs: 62, fat: 8, fiber: 14, grams: 550, min: 25, tags: ['vegan', 'veg', 'fiber', 'cheap', 'legumes', 'veg-rich', 'low-density'],
    ing: ['1 dl röda linser', '1 gul lök, 1 vitlöksklyfta', '1 morot', '1 burk krossade tomater (400 g)', '5 dl grönsaksbuljong', '1 tsk spiskummin, ½ tsk paprikapulver', '1 tsk rapsolja', '1 skiva fullkornsbröd till servering'],
    imgPrompt: 'bowl of red lentil soup garnished with parsley next to a slice of wholegrain bread, overhead, rustic',
    steps: [{ t: 'Hacka lök, vitlök och morot. Fräs i oljan 3 minuter.', img: 'sauteing chopped onion carrot and garlic in a pot' }, { t: 'Tillsätt kryddorna och linserna, rör om 30 sekunder.', img: 'adding red lentils and cumin to a pot' }, { t: 'Häll i tomater och buljong. Koka 15 minuter tills linserna är mjuka.', img: 'red lentil soup simmering in a pot' }, { t: 'Mixa slät om du vill, smaka av med salt och citron. Servera med bröd.', img: 'blending soup smooth with an immersion blender' }] },
  { id: 'lu4', slot: 'lunch', emoji: '🐟', title: 'Tonfisksallad med vita bönor', d: 'Tonfisk i vatten, vita bönor, rödlök, tomat och rucola', kcal: 380, protein: 38, carbs: 22, fat: 14, fiber: 8, grams: 380, min: 8, tags: ['fish', 'protein', 'quick', 'cheap', 'legumes', 'gf'],
    ing: ['1 burk tonfisk i vatten (avrunnen)', '1 dl vita bönor', '¼ rödlök', '1 tomat', '2 nävar rucola', '1 msk olivolja, citron', 'salt, peppar'],
    imgPrompt: 'tuna and white bean salad with red onion, tomato and rocket on a plate, lemon, overhead',
    steps: [{ t: 'Skiva rödlöken tunt, skär tomaten i klyftor.', img: 'thinly slicing red onion' }, { t: 'Blanda tonfisk, bönor, lök, tomat och rucola.', img: 'mixing tuna white beans and rocket in a bowl' }, { t: 'Ringla över olivolja och citron, salta och peppra.', img: 'drizzling olive oil over a tuna bean salad' }] },
  { id: 'lu5', slot: 'lunch', emoji: '🍤', title: 'Räkor med quinoa och avokado', d: 'Räkor, kokt quinoa, avokado, gurka och koriander med lime', kcal: 430, protein: 32, carbs: 32, fat: 18, fiber: 8, grams: 400, min: 15, tags: ['fish', 'shellfish', 'protein', 'gf', 'whole'],
    ing: ['150 g skalade räkor', '1 dl kokt quinoa (0,4 dl okokt)', '½ avokado', '¼ gurka', 'koriander, 1 lime', 'salt, chiliflakes'],
    imgPrompt: 'bowl with quinoa, prawns, diced avocado, cucumber and coriander, lime wedge, overhead',
    steps: [{ t: 'Koka quinoan enligt förpackningen (ca 12 minuter) och låt svalna något.', img: 'cooked quinoa in a pot' }, { t: 'Tärna avokado och gurka, hacka koriandern.', img: 'dicing avocado on a cutting board' }, { t: 'Blanda allt med räkorna, pressa över lime och salta.', img: 'quinoa prawn bowl with lime being squeezed' }] },
  { id: 'lu6', slot: 'lunch', emoji: '🧆', title: 'Kikärtsbowl med hummus', d: 'Kikärtor, hummus, paprika, gurka och morot med halvt fullkornspitabröd', kcal: 450, protein: 20, carbs: 60, fat: 14, fiber: 15, grams: 430, min: 8, tags: ['vegan', 'veg', 'fiber', 'quick', 'legumes', 'veg-rich', 'cheap'],
    ing: ['1,5 dl kokta kikärtor', '2 msk hummus', '½ paprika, ¼ gurka, 1 morot', '½ fullkornspitabröd', 'citron, spiskummin, salt'],
    imgPrompt: 'colorful bowl with chickpeas, hummus, sliced bell pepper, cucumber and carrot sticks, pita bread on the side',
    steps: [{ t: 'Skölj kikärtorna och blanda med spiskummin och lite citron.', img: 'chickpeas seasoned with cumin in a bowl' }, { t: 'Skär grönsakerna i stavar och bitar.', img: 'cutting bell pepper cucumber and carrot into sticks' }, { t: 'Lägg upp allt i en skål med hummus i mitten. Servera med pitabrödet.', img: 'assembled chickpea hummus bowl with vegetables' }] },
  { id: 'lu7', slot: 'lunch', emoji: '🌯', title: 'Kalkonwrap med keso', d: 'Kalkonpålägg, keso, sallad och paprika i fullkornstortilla', kcal: 380, protein: 36, carbs: 34, fat: 10, fiber: 5, grams: 300, min: 5, tags: ['protein', 'quick'],
    ing: ['1 fullkornstortilla', '80 g kalkonpålägg', '80 g keso', 'sallad, ½ paprika', 'svartpeppar'],
    imgPrompt: 'wrap filled with turkey slices, cottage cheese, lettuce and red pepper, cut in half, overhead',
    steps: [{ t: 'Bred keson på tortillan.', img: 'spreading cottage cheese on a tortilla' }, { t: 'Lägg på kalkon, sallad och strimlad paprika, peppra.', img: 'tortilla layered with turkey lettuce and pepper strips' }, { t: 'Rulla ihop och skär på mitten.', img: 'rolled wrap cut in half on a board' }] },
  { id: 'lu8', slot: 'lunch', emoji: '🥚', title: 'Ägg- och bönsallad med yoghurtdressing', d: 'Kokta ägg, kidneybönor, majs, tomat och sallad med krämig yoghurtdressing', kcal: 400, protein: 26, carbs: 36, fat: 16, fiber: 11, grams: 420, min: 12, tags: ['veg', 'protein', 'fiber', 'cheap', 'legumes', 'gf', 'veg-rich'],
    ing: ['2 ägg', '1 dl kidneybönor', '0,5 dl majs', '1 tomat', '2 nävar sallad', '2 msk turkisk yoghurt, 1 tsk senap, citron'],
    imgPrompt: 'salad with halved boiled eggs, kidney beans, corn, tomato and lettuce with creamy dressing, overhead',
    steps: [{ t: 'Koka äggen 8 minuter, kyl och dela på mitten.', img: 'halved boiled eggs on a board' }, { t: 'Rör ihop yoghurt, senap, citron, salt och peppar.', img: 'mixing yogurt mustard dressing' }, { t: 'Blanda bönor, majs, tomat och sallad, lägg på äggen och dressingen.', img: 'egg and bean salad with dressing in a bowl' }] },
  { id: 'lu9', slot: 'lunch', emoji: '🍜', title: 'Kycklingsoppa med grönsaker', d: 'Lätt buljongsoppa med kycklingfilé, morot, purjolök och fullkornspasta', kcal: 400, protein: 40, carbs: 36, fat: 8, fiber: 6, grams: 600, min: 25, tags: ['protein', 'low-density', 'veg-rich'],
    ing: ['150 g kycklingfilé', '6 dl kycklingbuljong', '1 morot, ½ purjolök, 1 stjälk selleri', '50 g fullkornspasta', 'timjan, svartpeppar, persilja'],
    imgPrompt: 'bowl of clear chicken soup with carrot, leek and pasta, parsley, overhead',
    steps: [{ t: 'Skär grönsakerna i bitar och koka upp i buljongen.', img: 'carrot leek and celery in simmering broth' }, { t: 'Lägg i kycklingen i tärningar och pastan. Sjud 10–12 minuter.', img: 'adding diced chicken to a soup pot' }, { t: 'Smaka av med timjan och peppar, strö över persilja.', img: 'chicken vegetable soup garnished with parsley' }] },
  { id: 'lu10', slot: 'lunch', emoji: '🍝', title: 'Pasta med kycklingfärs och zucchini', d: 'Fullkornspasta med kycklingfärs, zucchini, krossade tomater och lite parmesan', kcal: 520, protein: 44, carbs: 52, fat: 14, fiber: 9, grams: 450, min: 20, tags: ['protein', 'whole', 'veg-rich'],
    ing: ['60 g fullkornspasta', '125 g kycklingfärs', '1 zucchini', '1 burk krossade tomater', '1 vitlöksklyfta, basilika', '15 g parmesan', '1 tsk olivolja'],
    imgPrompt: 'plate of wholegrain pasta with chicken mince and zucchini in tomato sauce, grated parmesan, basil, overhead',
    steps: [{ t: 'Koka pastan enligt förpackningen.', img: 'wholegrain pasta boiling in a pot' }, { t: 'Bryn kycklingfärsen i oljan, tillsätt vitlök och tärnad zucchini.', img: 'browning chicken mince with zucchini in a pan' }, { t: 'Häll i tomaterna och låt puttra 8 minuter. Salta, peppra.', img: 'tomato sauce with chicken mince simmering' }, { t: 'Vänd ner pastan, toppa med parmesan och basilika.', img: 'pasta tossed in sauce with parmesan and basil' }] },
  { id: 'lu11', slot: 'lunch', emoji: '🧀', title: 'Halloumi- och bönsallad med mango', d: 'Stekt halloumi, svarta bönor, sallad, tomat och mango med lime', kcal: 450, protein: 26, carbs: 34, fat: 24, fiber: 9, grams: 380, min: 12, tags: ['veg', 'protein', 'legumes', 'gf', 'veg-rich'],
    ing: ['80 g halloumi', '1 dl svarta bönor', '2 nävar sallad', '1 tomat', '½ mango', '1 lime, chiliflakes'],
    imgPrompt: 'salad with golden fried halloumi slices, black beans, mango cubes and tomato, lime, overhead',
    steps: [{ t: 'Skiva halloumin och stek i torr panna tills gyllene, 2 minuter per sida.', img: 'halloumi slices frying golden in a pan' }, { t: 'Tärna mango och tomat.', img: 'dicing mango on a cutting board' }, { t: 'Blanda sallad, bönor, mango och tomat. Lägg på halloumin, pressa över lime och strö chili.', img: 'halloumi salad with mango and black beans assembled' }] },
  { id: 'lu12', slot: 'lunch', emoji: '🍚', title: 'Tofu-bowl med edamame och ris', d: 'Stekt tofu, edamame, ris, morot och sesam med soja', kcal: 480, protein: 30, carbs: 50, fat: 16, fiber: 9, grams: 450, min: 15, tags: ['vegan', 'veg', 'protein', 'legumes'],
    ing: ['150 g fast tofu', '1 dl edamame (frysta)', '1 dl kokt ris', '1 morot', '1 msk soja, 1 tsk sesamolja, sesamfrön', 'ingefära'],
    imgPrompt: 'rice bowl with crispy tofu cubes, edamame, shredded carrot and sesame seeds, overhead',
    steps: [{ t: 'Pressa tofun torr, tärna och stek i het panna tills krispig, 6–8 minuter.', img: 'tofu cubes frying crispy in a pan' }, { t: 'Koka edamame 3 minuter, riv moroten.', img: 'edamame beans in a bowl' }, { t: 'Lägg upp ris, tofu, edamame och morot. Ringla över soja och sesamolja, strö sesam.', img: 'assembled tofu rice bowl with sesame seeds' }] },

  // ---------- Middag ----------
  { id: 'mi1', slot: 'dinner', emoji: '🐟', title: 'Ugnslax med rostade rotfrukter', d: 'Lax och rotfrukter på samma plåt med citronyoghurt', kcal: 520, protein: 38, carbs: 32, fat: 26, fiber: 8, grams: 520, min: 30, tags: ['fish', 'omega3', 'gf', 'veg-rich', 'whole'],
    ing: ['150 g laxfilé', '250 g rotfrukter (morot, palsternacka, rödbeta)', '1 tsk rapsolja', '1 dl turkisk yoghurt', 'citron, dill, salt, peppar'],
    imgPrompt: 'baked salmon fillet on a sheet pan with roasted carrots, parsnips and beetroot, lemon and dill, overhead',
    steps: [{ t: 'Sätt ugnen på 225 °C. Skär rotfrukterna i klyftor, vänd i oljan och salta. Rosta 15 minuter.', img: 'root vegetables cut into wedges on a baking sheet' }, { t: 'Lägg laxen på plåten, salta och peppra. Ugnsbaka 12–14 minuter till.', img: 'salmon fillet placed on a sheet pan with roasted vegetables' }, { t: 'Rör ihop yoghurt, citron och dill. Servera till.', img: 'yogurt sauce with dill and lemon in a small bowl' }] },
  { id: 'mi2', slot: 'dinner', emoji: '🍛', title: 'Kycklinggryta med lätt kokosmjölk', d: 'Kycklingfilé, paprika och broccoli i röd curry med ris', kcal: 520, protein: 45, carbs: 46, fat: 16, fiber: 7, grams: 520, min: 25, tags: ['protein', 'gf', 'veg-rich'],
    ing: ['150 g kycklingfilé', '1 dl kokosmjölk light', '1 msk röd currypasta', '½ paprika, 150 g broccoli', '1 dl kokt ris', 'lime, koriander'],
    imgPrompt: 'bowl of chicken curry with broccoli and red pepper in light coconut sauce over rice, coriander, overhead',
    steps: [{ t: 'Koka riset. Skär kycklingen i bitar och grönsakerna i bitar.', img: 'chopping chicken breast and broccoli' }, { t: 'Fräs currypastan 30 sekunder, tillsätt kycklingen och bryn 3 minuter.', img: 'chicken pieces frying with red curry paste' }, { t: 'Häll i kokosmjölken och grönsakerna, sjud 8 minuter.', img: 'chicken curry simmering with broccoli' }, { t: 'Servera på ris med lime och koriander.', img: 'chicken curry served over rice with lime' }] },
  { id: 'mi3', slot: 'dinner', emoji: '🥩', title: 'Köttfärsbiffar med lätt potatismos', d: 'Biffar på mager nötfärs, mos på mjölk, broccoli och lingon', kcal: 560, protein: 40, carbs: 48, fat: 22, fiber: 7, grams: 520, min: 30, tags: ['meat', 'protein', 'gf'],
    ing: ['150 g nötfärs max 10 % fett', '1 ägg, 1 msk havregryn, lök', '200 g potatis, 0,5 dl mjölk', '150 g broccoli', '1 msk rårörda lingon', 'salt, peppar'],
    imgPrompt: 'two beef patties with mashed potatoes, steamed broccoli and lingonberries on a plate, overhead',
    steps: [{ t: 'Koka potatisen mjuk, 15–20 minuter. Mosa med mjölk, salt och peppar.', img: 'mashing boiled potatoes with milk' }, { t: 'Blanda färsen med ägg, havregryn, finhackad lök, salt och peppar. Forma 2–3 biffar.', img: 'shaping minced beef patties by hand' }, { t: 'Stek biffarna 4 minuter per sida. Ångkoka broccolin 4 minuter.', img: 'beef patties frying in a pan' }, { t: 'Servera med mos, broccoli och lingon.', img: 'beef patties plated with mash broccoli and lingonberries' }] },
  { id: 'mi4', slot: 'dinner', emoji: '🍅', title: 'Torsk i ugn med tomat och vita bönor', d: 'Torskrygg bakad i krossade tomater med vita bönor och vitlök', kcal: 450, protein: 48, carbs: 34, fat: 12, fiber: 9, grams: 520, min: 25, tags: ['fish', 'protein', 'legumes', 'low-density', 'veg-rich'],
    ing: ['180 g torskfilé', '1 burk krossade tomater', '1 dl vita bönor', '1 vitlöksklyfta', '1 msk olivolja', 'oregano, 1 skiva bröd'],
    imgPrompt: 'baked cod fillet in tomato sauce with white beans in an oven dish, oregano, overhead',
    steps: [{ t: 'Sätt ugnen på 200 °C. Blanda tomater, bönor, pressad vitlök, oregano och olja i en ugnsform.', img: 'tomato sauce with white beans in an oven dish' }, { t: 'Lägg i torsken, salta och peppra.', img: 'cod fillet placed in tomato sauce' }, { t: 'Ugnsbaka 15–18 minuter tills fisken flagar sig. Servera med bröd.', img: 'baked cod in tomato sauce out of the oven' }] },
  { id: 'mi5', slot: 'dinner', emoji: '🌮', title: 'Fisktacos med kålsallad', d: 'Ugnsbakad torsk, krispig kålsallad och yoghurt-limesås i små tortillas', kcal: 480, protein: 38, carbs: 50, fat: 12, fiber: 7, grams: 420, min: 20, tags: ['fish', 'protein', 'veg-rich'],
    ing: ['150 g torsk', '3 små tortillas', '100 g vitkål, 1 morot', '2 msk turkisk yoghurt, 1 lime', 'paprikapulver, koriander'],
    imgPrompt: 'three fish tacos with baked cod, shredded cabbage slaw and lime yogurt sauce, coriander, overhead',
    steps: [{ t: 'Krydda torsken med paprikapulver och salt, ugnsbaka 12 minuter i 200 °C.', img: 'seasoned cod fillet on a baking tray' }, { t: 'Strimla kål och riv morot, blanda med lite lime och salt.', img: 'shredded cabbage and carrot slaw in a bowl' }, { t: 'Rör ihop yoghurt och lime. Värm tortillorna.', img: 'warming small tortillas in a pan' }, { t: 'Fyll tortillorna med fisk, slaw, sås och koriander.', img: 'assembling fish tacos with slaw and sauce' }] },
  { id: 'mi6', slot: 'dinner', emoji: '🥘', title: 'Vegetarisk chili med bönor och linser', d: 'Kidneybönor, linser, majs och tomat med ris', kcal: 500, protein: 24, carbs: 82, fat: 8, fiber: 18, grams: 550, min: 30, tags: ['vegan', 'veg', 'fiber', 'cheap', 'legumes', 'veg-rich', 'low-density'],
    ing: ['1,5 dl kidneybönor', '0,5 dl röda linser', '0,5 dl majs', '1 burk krossade tomater', '1 lök, 1 vitlöksklyfta, 1 paprika', '1 tsk chilipulver, 1 tsk spiskummin', '1 dl kokt ris'],
    imgPrompt: 'bowl of vegetarian bean chili with corn over rice, coriander, overhead, rustic',
    steps: [{ t: 'Fräs hackad lök, vitlök och paprika 3 minuter.', img: 'sauteing onion garlic and pepper in a pot' }, { t: 'Tillsätt kryddor, linser, tomater och 2 dl vatten. Sjud 15 minuter.', img: 'chili simmering with lentils and tomatoes' }, { t: 'Rör ner bönor och majs, värm igenom. Servera med ris.', img: 'vegetarian chili served over rice' }] },
  { id: 'mi7', slot: 'dinner', emoji: '🥢', title: 'Kycklingwok med broccoli och nudlar', d: 'Snabb wok med kycklingfilé, broccoli, paprika och fullkornsnudlar', kcal: 520, protein: 46, carbs: 52, fat: 12, fiber: 8, grams: 500, min: 15, tags: ['protein', 'quick', 'veg-rich', 'whole'],
    ing: ['150 g kycklingfilé', '150 g broccoli, ½ paprika', '60 g fullkornsnudlar', '1 msk soja, 1 tsk sesamolja', 'ingefära, vitlök, 1 tsk rapsolja'],
    imgPrompt: 'wok with stir-fried chicken strips, broccoli florets, red pepper and wholegrain noodles, overhead',
    steps: [{ t: 'Koka nudlarna enligt förpackningen.', img: 'noodles boiling in a pot' }, { t: 'Woka kycklingstrimlorna i het olja 3 minuter, ta upp.', img: 'chicken strips stir-frying in a wok' }, { t: 'Woka broccoli, paprika, ingefära och vitlök 3 minuter, lägg tillbaka kycklingen.', img: 'broccoli and peppers stir-frying in a wok' }, { t: 'Vänd ner nudlar, soja och sesamolja.', img: 'tossing noodles into the wok with soy sauce' }] },
  { id: 'mi8', slot: 'dinner', emoji: '🥩', title: 'Biff med sötpotatis och sallad', d: 'Putsad ryggbiff, ugnsbakad sötpotatis och bladsallad', kcal: 540, protein: 42, carbs: 42, fat: 22, fiber: 7, grams: 480, min: 25, tags: ['meat', 'protein', 'gf'],
    ing: ['150 g ryggbiff', '200 g sötpotatis', '2 nävar bladsallad, tomat', '1 tsk rapsolja, 1 tsk balsamvinäger', 'salt, peppar'],
    imgPrompt: 'sliced steak with roasted sweet potato wedges and green salad on a plate, overhead',
    steps: [{ t: 'Skär sötpotatisen i klyftor, vänd i olja och salt. Rosta 20 minuter i 225 °C.', img: 'sweet potato wedges on a baking tray' }, { t: 'Stek biffen i het panna 2–3 minuter per sida. Låt vila 5 minuter.', img: 'steak searing in a hot pan' }, { t: 'Skiva biffen och servera med sötpotatis och sallad med balsamvinäger.', img: 'sliced steak plated with sweet potato and salad' }] },
  { id: 'mi9', slot: 'dinner', emoji: '🍋', title: 'Räkpasta med citron och spenat', d: 'Fullkornspasta med räkor, vitlök, chili, citron och spenat', kcal: 480, protein: 34, carbs: 48, fat: 16, fiber: 8, grams: 400, min: 15, tags: ['fish', 'shellfish', 'quick', 'whole'],
    ing: ['60 g fullkornspasta', '150 g räkor', '1 vitlöksklyfta, chiliflakes', '2 nävar spenat', '1 msk olivolja, 1 citron', 'persilja'],
    imgPrompt: 'plate of wholegrain spaghetti with prawns, spinach, lemon zest and chili, overhead',
    steps: [{ t: 'Koka pastan. Spara 0,5 dl pastavatten.', img: 'spaghetti cooking in a pot' }, { t: 'Fräs vitlök och chili i oljan 1 minut, lägg i räkorna 2 minuter.', img: 'prawns frying with garlic and chili' }, { t: 'Vänd ner pasta, spenat, citronsaft, zest och lite pastavatten. Toppa med persilja.', img: 'tossing pasta with prawns and spinach in a pan' }] },
  { id: 'mi10', slot: 'dinner', emoji: '🥙', title: 'Kalkonfärsbiffar med bulgur och tzatziki', d: 'Saftiga kalkonbiffar, fullkornsbulgur och hemgjord tzatziki', kcal: 500, protein: 44, carbs: 40, fat: 16, fiber: 8, grams: 480, min: 25, tags: ['protein', 'whole'],
    ing: ['150 g kalkonfärs', '1 ägg, 1 msk ströbröd, persilja', '1 dl kokt bulgur', '1 dl turkisk yoghurt, ¼ gurka, 1 vitlöksklyfta', 'tomat, salt, peppar'],
    imgPrompt: 'turkey patties with bulgur and tzatziki, tomato wedges on a plate, overhead',
    steps: [{ t: 'Koka bulguren enligt förpackningen.', img: 'bulgur cooking in a pot' }, { t: 'Riv gurkan, krama ur vattnet, blanda med yoghurt, pressad vitlök och salt.', img: 'mixing grated cucumber into yogurt for tzatziki' }, { t: 'Blanda färsen med ägg, ströbröd, persilja, salt och peppar. Forma biffar och stek 4 minuter per sida.', img: 'turkey patties frying in a pan' }, { t: 'Servera med bulgur, tzatziki och tomat.', img: 'turkey patties plated with bulgur and tzatziki' }] },
  { id: 'mi11', slot: 'dinner', emoji: '🍳', title: 'Frittata med lax och spenat', d: 'Ugnsomelett med varmrökt lax, spenat och feta – bra som rester', kcal: 470, protein: 40, carbs: 6, fat: 32, fiber: 3, grams: 350, min: 25, tags: ['fish', 'protein', 'lchf', 'gf', 'omega3'],
    ing: ['3 ägg', '80 g varmrökt lax', '2 nävar spenat', '30 g fetaost', '0,5 dl mjölk', 'dill, peppar; sallad till'],
    imgPrompt: 'slice of salmon spinach frittata with feta on a plate with side salad, overhead',
    steps: [{ t: 'Sätt ugnen på 200 °C. Vispa ägg, mjölk, dill och peppar.', img: 'whisking eggs with milk and dill' }, { t: 'Lägg spenat, laxbitar och feta i en liten ugnsform, häll över äggen.', img: 'oven dish with spinach salmon and feta topped with egg mixture' }, { t: 'Grädda 18–20 minuter tills stannat. Servera med sallad.', img: 'golden baked frittata in an oven dish' }] },
  { id: 'mi12', slot: 'dinner', emoji: '🍆', title: 'Ugnsrostade grönsaker med kikärtor och tahini', d: 'Aubergine, zucchini och paprika rostade med kikärtor och tahinidressing', kcal: 450, protein: 18, carbs: 48, fat: 20, fiber: 14, grams: 520, min: 30, tags: ['vegan', 'veg', 'fiber', 'gf', 'legumes', 'veg-rich', 'low-density'],
    ing: ['½ aubergine, 1 zucchini, 1 paprika', '1,5 dl kikärtor', '1 msk olivolja', '1 msk tahini, 1 citron, 1 vitlöksklyfta', 'spiskummin, salt'],
    imgPrompt: 'sheet pan of roasted eggplant, zucchini, red pepper and chickpeas drizzled with tahini sauce, overhead',
    steps: [{ t: 'Sätt ugnen på 225 °C. Skär grönsakerna i bitar, vänd i olja, spiskummin och salt tillsammans med kikärtorna.', img: 'chopped vegetables and chickpeas tossed with oil on a baking sheet' }, { t: 'Rosta 25 minuter, vänd efter halva tiden.', img: 'roasted vegetables golden in the oven' }, { t: 'Rör ihop tahini, citronsaft, pressad vitlök och lite vatten till en dressing. Ringla över.', img: 'tahini lemon dressing being drizzled over roasted vegetables' }] },
  { id: 'mi13', slot: 'dinner', emoji: '🍗', title: 'Kycklingfilé med ugnsbakad blomkål och bönsallad', d: 'Saftig kycklingfilé, rostad blomkål och sallad på vita bönor och tomat', kcal: 460, protein: 50, carbs: 30, fat: 12, fiber: 11, grams: 520, min: 30, tags: ['protein', 'gf', 'legumes', 'veg-rich', 'low-density'],
    ing: ['150 g kycklingfilé', '200 g blomkål', '1 dl vita bönor, 1 tomat, persilja', '1 tsk olivolja + 1 tsk till bönorna', 'paprikapulver, citron, salt'],
    imgPrompt: 'plate with roasted chicken breast, roasted cauliflower florets and white bean tomato salad, overhead',
    steps: [{ t: 'Sätt ugnen på 225 °C. Dela blomkålen i buketter, vänd i olja och paprikapulver. Rosta 20 minuter.', img: 'cauliflower florets seasoned on a baking tray' }, { t: 'Krydda kycklingen och lägg på plåten efter 5 minuter, ugnsbaka 15 minuter.', img: 'chicken breast on a tray with roasting cauliflower' }, { t: 'Blanda bönor, tärnad tomat, persilja, olja och citron. Servera allt tillsammans.', img: 'white bean and tomato salad in a bowl' }] },
  { id: 'mi14', slot: 'dinner', emoji: '🥔', title: 'Pytt på kyckling och rotfrukter', d: 'Tärnad kyckling, rotfrukter och lök i pannan, toppad med ett stekt ägg', kcal: 520, protein: 46, carbs: 44, fat: 16, fiber: 7, grams: 520, min: 25, tags: ['protein', 'cheap', 'gf'],
    ing: ['150 g kycklingfilé', '250 g potatis/rotfrukter i små tärningar', '1 lök', '1 tsk rapsolja', '1 ägg', 'timjan, salt, peppar; rödbetor till'],
    imgPrompt: 'skillet hash with diced chicken, root vegetables and onion topped with a fried egg, overhead',
    steps: [{ t: 'Tärna rotfrukterna smått och stek i oljan på medelvärme 12 minuter tills mjuka.', img: 'diced root vegetables frying in a skillet' }, { t: 'Lägg i tärnad kyckling och lök, stek 6–8 minuter till. Krydda med timjan, salt och peppar.', img: 'adding diced chicken and onion to a skillet hash' }, { t: 'Stek ägget och lägg ovanpå. Servera med inlagda rödbetor.', img: 'chicken hash topped with a fried egg' }] },

  // ---------- Mellanmål ----------
  { id: 'me1', slot: 'snack', emoji: '🍎', title: 'Äpple med jordnötssmör', d: 'Äppelklyftor med en matsked jordnötssmör', kcal: 190, protein: 5, carbs: 24, fat: 9, fiber: 5, grams: 150, min: 2, tags: ['veg', 'vegan', 'quick', 'gf'], ing: ['1 äpple', '1 msk jordnötssmör utan tillsatt socker'], imgPrompt: 'apple slices with a small bowl of peanut butter, overhead', steps: [{ t: 'Skär äpplet i klyftor och doppa i jordnötssmöret.', img: 'apple slices next to peanut butter' }] },
  { id: 'me2', slot: 'snack', emoji: '🫐', title: 'Kvarg med bär', d: '150 g kvarg och en deciliter hallon eller blåbär', kcal: 130, protein: 18, carbs: 8, fat: 1, fiber: 3, grams: 210, min: 1, tags: ['veg', 'protein', 'quick', 'gf'], ing: ['150 g kvarg naturell', '1 dl bär'], imgPrompt: 'small bowl of quark topped with fresh berries, overhead', steps: [{ t: 'Lägg kvargen i en skål och toppa med bären.', img: 'quark with berries in a bowl' }] },
  { id: 'me3', slot: 'snack', emoji: '🥚', title: 'Två kokta ägg med knäckebröd', d: 'Ägg, flingsalt och ett fullkornsknäcke', kcal: 200, protein: 15, carbs: 10, fat: 11, fiber: 2, grams: 130, min: 10, tags: ['veg', 'protein'], ing: ['2 ägg', '1 fullkornsknäckebröd', 'flingsalt'], imgPrompt: 'two halved boiled eggs with flaky salt next to a rye crispbread', steps: [{ t: 'Koka äggen 8 minuter, kyl i kallt vatten.', img: 'eggs boiling in a pot' }, { t: 'Skala, dela och salta. Ät med knäckebrödet.', img: 'peeled halved eggs with crispbread' }] },
  { id: 'me4', slot: 'snack', emoji: '🥕', title: 'Morotsstavar med hummus', d: 'Krispigt, mättande och fiberrikt', kcal: 150, protein: 5, carbs: 16, fat: 7, fiber: 6, grams: 170, min: 3, tags: ['vegan', 'veg', 'quick', 'fiber', 'gf'], ing: ['2 morötter', '50 g hummus'], imgPrompt: 'carrot sticks arranged next to a bowl of hummus, overhead', steps: [{ t: 'Skär morötterna i stavar och doppa i hummusen.', img: 'carrot sticks and hummus' }] },
  { id: 'me5', slot: 'snack', emoji: '🍅', title: 'Keso med tomat och knäckebröd', d: 'Cottage cheese, tomat och svartpeppar på fullkornsknäcke', kcal: 210, protein: 16, carbs: 24, fat: 5, fiber: 3, grams: 230, min: 3, tags: ['veg', 'protein', 'quick'], ing: ['100 g keso', '1 tomat', '2 fullkornsknäckebröd', 'svartpeppar'], imgPrompt: 'crispbread topped with cottage cheese and tomato slices, black pepper, overhead', steps: [{ t: 'Bred keson på knäckebröden, lägg på skivad tomat och peppra.', img: 'crispbread with cottage cheese and tomato' }] },
  { id: 'me6', slot: 'snack', emoji: '🍌', title: 'Proteinshake med banan', d: 'Mjölk, banan och en skopa proteinpulver', kcal: 280, protein: 28, carbs: 36, fat: 3, fiber: 3, grams: 400, min: 2, tags: ['veg', 'protein', 'quick', 'upf'], ing: ['1 banan', '1 skopa proteinpulver (25 g)', '2,5 dl mjölk'], imgPrompt: 'banana protein shake in a glass with a banana beside it', steps: [{ t: 'Mixa allt i en shaker eller mixer.', img: 'banana and milk in a blender' }] },
  { id: 'me7', slot: 'snack', emoji: '🫛', title: 'Edamame med flingsalt', d: 'Kokta sojabönor i balja – protein och fiber i samma bit', kcal: 180, protein: 16, carbs: 12, fat: 8, fiber: 8, grams: 150, min: 5, tags: ['vegan', 'veg', 'protein', 'fiber', 'quick', 'gf', 'legumes'], ing: ['1,5 dl frysta edamame i balja', 'flingsalt'], imgPrompt: 'bowl of steamed edamame pods sprinkled with flaky salt', steps: [{ t: 'Koka bönorna 3–4 minuter i saltat vatten, låt rinna av.', img: 'edamame pods boiling in a pot' }, { t: 'Strö över flingsalt och ät direkt ur baljorna.', img: 'edamame pods in a bowl with salt' }] },
  { id: 'me8', slot: 'snack', emoji: '🍐', title: 'Skyr med kanel och päron', d: 'Skyr, tärnat päron och kanel', kcal: 200, protein: 22, carbs: 24, fat: 1, fiber: 4, grams: 300, min: 2, tags: ['veg', 'protein', 'quick', 'gf'], ing: ['200 g skyr', '1 päron', 'kanel'], imgPrompt: 'bowl of skyr with diced pear and cinnamon, overhead', steps: [{ t: 'Tärna päronet, blanda med skyren och strö över kanel.', img: 'skyr with diced pear and cinnamon' }] },
  { id: 'me9', slot: 'snack', emoji: '🍤', title: 'Räkor med gurka och citron', d: '100 g handskalade räkor med gurka och citron', kcal: 110, protein: 22, carbs: 2, fat: 1, fiber: 1, grams: 200, min: 3, tags: ['fish', 'shellfish', 'protein', 'quick', 'gf', 'lchf'], ing: ['100 g skalade räkor', '¼ gurka', 'citron, dill'], imgPrompt: 'peeled prawns with cucumber slices and a lemon wedge on a small plate', steps: [{ t: 'Skiva gurkan, lägg upp räkorna och pressa över citron. Strö över dill.', img: 'prawns and cucumber with lemon' }] },
  { id: 'me10', slot: 'snack', emoji: '🌰', title: 'Rostade kikärtor', d: 'Krispiga kikärtor med paprika och spiskummin – gör en sats för veckan', kcal: 150, protein: 7, carbs: 20, fat: 4, fiber: 6, grams: 45, min: 30, tags: ['vegan', 'veg', 'fiber', 'gf', 'legumes', 'cheap'], ing: ['1 burk kikärtor (för 5 portioner)', '1 msk rapsolja', '1 tsk paprikapulver, 1 tsk spiskummin, salt'], imgPrompt: 'bowl of crispy roasted chickpeas seasoned with paprika, overhead', steps: [{ t: 'Sätt ugnen på 200 °C. Skölj kikärtorna och torka dem noga med hushållspapper.', img: 'drying chickpeas on paper towel' }, { t: 'Vänd i olja och kryddor, sprid ut på plåt.', img: 'seasoned chickpeas spread on a baking sheet' }, { t: 'Rosta 25–30 minuter tills krispiga, skaka plåten efter halva tiden. Förvara i burk.', img: 'crispy roasted chickpeas in a jar' }] },
];

// ---- Viktnedgångsindex (0–100) utifrån forskningen: proteinandel, energitäthet, fiber, processgrad ----
export function weightLossIndex(r) {
  const kcal = Math.max(1, r.kcal || 1);
  const proteinShare = (r.protein || 0) * 4 / kcal;                // andel energi från protein
  const density = r.grams ? kcal / r.grams : 1.5;                 // kcal per gram
  const fiberPer100 = ((r.fiber || 0) / kcal) * 100;              // g fiber per 100 kcal
  let s = 0;
  s += Math.min(32, proteinShare / 0.35 * 32);                    // 35 %+ protein = full pott
  s += density <= 0.8 ? 26 : density >= 2.6 ? 0 : 26 * (1 - (density - 0.8) / 1.8);
  s += Math.min(22, fiberPer100 / 2.5 * 22);                      // 2,5 g fiber/100 kcal = full pott
  s += (r.tags || []).includes('veg-rich') ? 8 : 0;
  s += (r.tags || []).includes('whole') || (r.tags || []).includes('legumes') ? 6 : 0;
  s += (r.tags || []).includes('upf') ? -12 : 6;
  s += (r.tags || []).includes('sweet') ? -8 : 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}
export function indexReasons(r) {
  const out = [];
  const kcal = Math.max(1, r.kcal || 1), share = (r.protein || 0) * 4 / kcal, density = r.grams ? kcal / r.grams : 1.5;
  if (share >= 0.3) out.push(`${r.protein} g protein (${Math.round(share * 100)} % av energin) mättar och skyddar musklerna`);
  else if (share >= 0.2) out.push(`${r.protein} g protein`);
  if (density <= 1.0) out.push(`låg energitäthet (${density.toFixed(1).replace('.', ',')} kcal/g) – stor portion, få kalorier`);
  if ((r.fiber || 0) >= 8) out.push(`${r.fiber} g fiber (en tredjedel av dagsbehovet)`);
  else if ((r.fiber || 0) >= 5) out.push(`${r.fiber} g fiber`);
  if ((r.tags || []).includes('omega3')) out.push('omega-3 från fet fisk');
  if ((r.tags || []).includes('legumes')) out.push('baljväxter – fiber och protein på köpet');
  if ((r.tags || []).includes('quick')) out.push(`klart på ${r.min} min`);
  return out;
}

const DIET_EXCLUDE = {
  vegan: r => !r.tags.includes('vegan'),
  vegetarian: r => !(r.tags.includes('veg') || r.tags.includes('vegan')),
  pescetarian: r => !(r.tags.includes('fish') || r.tags.includes('veg') || r.tags.includes('vegan')),
  omnivore: () => false,
};
const txt = r => [r.title, r.d, ...(r.ing || [])].join(' | ');
const AVOID_RULES = {
  Gluten: r => /bröd|pasta|tortilla|wrap|nudlar|pannkak|pizza|müsli|havre|knäcke|burrito|macka|bulgur|ströbröd/i.test(r.title + r.d + r.ing.join(' ')) && !r.tags.includes('gf'),
  // Ordgränser som förstår åäö: "fil" ska inte träffa "kycklingfilé", "ost" inte "rostade", "nöt" inte "nötfärs", "mjölk" inte "kokosmjölk"
  Laktos: r => /(^|[^a-zåäöé])(mjölk|kvarg|yoghurt|yogurt|grädde|gräddfil|filmjölk|fil|halloumi|keso|cottage|mozzarella|feta|parmesan|skyr|proteinshake|crème fraiche|creme fraiche|glass)(?=$|[^a-zåäöé])|(^|[^a-zåäöé])[a-zåäö]*ost(en|ar)?(?=$|[^a-zåäöé])/i.test(txt(r)),
  Nötter: r => /(^|[^a-zåäöé])(nöt|nötter|mandel|mandlar|mandelmjöl|jordnöt[a-zåäö]*|cashew[a-zåäö]*|hasselnöt[a-zåäö]*|valnöt[a-zåäö]*|pekannöt[a-zåäö]*|pistage[a-zåäö]*|tahini)(?=$|[^a-zåäöé])|[a-zåäö]*nötter(?=$|[^a-zåäöé])/i.test(txt(r)),
  Ägg: r => /(^|[^a-zåäöé])(ägg|ägget|äggen|äggula|äggvita|omelett|frittata|majonnäs|pannkak[a-zåäö]*)(?=$|[^a-zåäöé])|[a-zåäö]*ägg(?=$|[^a-zåäöé])/i.test(txt(r)),
  Skaldjur: r => r.tags.includes('shellfish'),
  Soja: r => /soja|tofu|edamame/i.test(r.title + r.d + r.ing.join(' ')),
  Fläsk: r => r.tags.includes('pork'),
  Socker: r => /honung|choklad|sirap/i.test(r.title + r.d + r.ing.join(' ')),
};
export const violatesAvoid = (r, avoid = []) => avoid.some(a => AVOID_RULES[a]?.({ title: r.title || '', d: r.d || '', ing: r.ing || [], tags: r.tags || [] }));
export const filterRecipes = (diet = 'omnivore', avoid = []) => RECIPES.filter(r => !(DIET_EXCLUDE[diet] || (() => false))(r) && !avoid.some(a => AVOID_RULES[a]?.(r)));

// Fokus: lose (viktnedgång), health (hälsa), muscle (muskler), quick (snabbt)
export function suggestMeals({ remaining, slot, diet = 'omnivore', avoid = [], recentTitles = [], limit = 5, focus = 'lose' }) {
  const budget = Math.max(150, remaining.kcal || 0);
  const proteinGap = Math.max(0, remaining.protein || 0);
  const scored = filterRecipes(diet, avoid).map(r => {
    const idx = weightLossIndex(r);
    let s = 0;
    if (r.slot === slot) s += 40; else if (slot === 'snack' && r.kcal < 300) s += 20; else if ((r.slot === 'lunch' && slot === 'dinner') || (r.slot === 'dinner' && slot === 'lunch')) s += 24;
    const ideal = slot === 'snack' ? Math.min(budget, 250) : Math.min(budget, Math.max(350, budget * 0.85));
    const diff = Math.abs(r.kcal - ideal) / Math.max(ideal, 200);
    s += Math.max(0, 30 - diff * 45);
    if (r.kcal > budget + 80) s -= 35;
    if (focus === 'lose') s += idx * 0.5;
    if (focus === 'health') s += idx * 0.25 + (['omega3', 'veg-rich', 'whole', 'legumes', 'fiber'].filter(t => r.tags.includes(t)).length * 7) - (r.tags.includes('upf') ? 10 : 0);
    if (focus === 'muscle') s += Math.min(30, r.protein * 0.6) + (r.kcal >= 450 && slot !== 'snack' ? 6 : 0);
    if (focus === 'quick') s += r.min <= 10 ? 30 : r.min <= 15 ? 20 : r.min <= 20 ? 8 : -10;
    if (proteinGap > 30) s += Math.min(18, r.protein * 0.35);
    if (recentTitles.includes(r.title)) s -= 30;
    s += Math.random() * 5;
    return { r, s, idx };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => ({ ...x.r, index: x.idx, reasons: indexReasons(x.r), why: whyText(x.r, remaining, slot, proteinGap, focus) }));
}
function whyText(r, rem, slot, proteinGap, focus) {
  const reasons = [];
  if (r.kcal <= (rem.kcal || 0)) reasons.push(`ryms i dagens ${Math.round(rem.kcal)} kcal`);
  if (proteinGap > 30 && r.protein >= 25) reasons.push(`${r.protein} g protein täcker mycket av det som saknas`);
  if (focus === 'quick' && r.min <= 15) reasons.push(`klar på ${r.min} minuter`);
  if (focus === 'lose' && weightLossIndex(r) >= 75) reasons.push('högt viktnedgångsindex');
  if (r.tags.includes('fiber')) reasons.push('fiberrikt och mättande');
  return reasons.length ? reasons.slice(0, 2).join(' · ') : 'passar tiden på dygnet';
}
export const youtubeSearchUrl = title => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(title + ' recept');
