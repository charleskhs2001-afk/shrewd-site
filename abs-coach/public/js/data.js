// Everything the plan is built from: foods, meals, snacks, exercises.
// Food values are per 100 g (UK label averages, rounded). They are estimates, not lab values.

// contains: tags used for diet rules and allergies.
//   meat, pork, fish, dairy, egg, honey, gluten, nuts
// swaps: what to use instead if a tag rules the food out (tried in order).
// unit: count-based foods are shown as "2 slices" rather than grams.
// free: vegetables and flavourings. They are counted but never scaled down.
export const FOODS = {
  chicken:        { name: 'chicken breast (raw)', kcal: 106, p: 24, c: 0, f: 1.1, contains: ['meat'] },
  turkey_mince:   { name: 'turkey breast mince (raw)', kcal: 105, p: 23.5, c: 0, f: 1.5, contains: ['meat'] },
  beef_mince:     { name: 'lean 5% beef mince (raw)', kcal: 125, p: 21, c: 0, f: 5, contains: ['meat'] },
  salmon:         { name: 'salmon fillet (raw)', kcal: 200, p: 21, c: 0, f: 13, contains: ['fish'] },
  white_fish:     { name: 'cod or haddock fillet (raw)', kcal: 80, p: 18, c: 0, f: 0.7, contains: ['fish'] },
  prawns:         { name: 'king prawns (cooked)', kcal: 70, p: 15.5, c: 0, f: 0.9, contains: ['fish'] },
  tuna:           { name: 'tuna in spring water (drained)', kcal: 110, p: 25, c: 0, f: 1, contains: ['fish'] },
  eggs:           { name: 'large eggs', kcal: 143, p: 12.6, c: 0.7, f: 9.5, contains: ['egg'], unit: { g: 55, one: 'large egg', many: 'large eggs' } },
  egg_whites:     { name: 'liquid egg whites', kcal: 48, p: 10.5, c: 0.7, f: 0.2, contains: ['egg'] },
  greek_yogurt:   { name: '0% fat Greek yogurt', kcal: 57, p: 10, c: 3.8, f: 0.3, contains: ['dairy'], swaps: ['soya_yogurt'] },
  soya_yogurt:    { name: 'plain soya yogurt', kcal: 50, p: 4, c: 2.2, f: 2.3, contains: [] },
  cottage_cheese: { name: 'low-fat cottage cheese', kcal: 75, p: 12, c: 3.5, f: 1.5, contains: ['dairy'] },
  milk:           { name: 'semi-skimmed milk', kcal: 47, p: 3.5, c: 4.8, f: 1.7, contains: ['dairy'], swaps: ['soya_milk'], ml: true },
  soya_milk:      { name: 'unsweetened soya milk', kcal: 39, p: 3.3, c: 0.5, f: 2.2, contains: [], ml: true },
  light_cheese:   { name: 'reduced-fat cheddar', kcal: 314, p: 27, c: 0.1, f: 22, contains: ['dairy'] },
  feta:           { name: 'feta', kcal: 264, p: 14, c: 1.5, f: 21, contains: ['dairy'] },
  whey:           { name: 'whey protein powder', kcal: 380, p: 78, c: 6, f: 6, contains: ['dairy'], swaps: ['vegan_protein'] },
  vegan_protein:  { name: 'pea or soya protein powder', kcal: 380, p: 72, c: 7, f: 7, contains: [] },
  tofu:           { name: 'firm tofu', kcal: 120, p: 13, c: 1.5, f: 7, contains: [] },
  edamame:        { name: 'edamame beans (frozen)', kcal: 121, p: 12, c: 4, f: 5, contains: [] },
  chickpeas:      { name: 'chickpeas (tinned, drained)', kcal: 120, p: 7.2, c: 15, f: 2.6, contains: [] },
  black_beans:    { name: 'black beans (tinned, drained)', kcal: 110, p: 7.5, c: 14, f: 0.6, contains: [] },
  red_lentils:    { name: 'red lentils (dry)', kcal: 330, p: 24, c: 50, f: 1.5, contains: [] },
  oats:           { name: 'porridge oats', kcal: 372, p: 11, c: 60, f: 8, contains: ['gluten'], swaps: ['gf_oats'] },
  gf_oats:        { name: 'gluten-free oats', kcal: 372, p: 11, c: 60, f: 8, contains: [] },
  rice:           { name: 'cooked rice', kcal: 140, p: 2.9, c: 30, f: 0.8, contains: [] },
  pasta:          { name: 'pasta (dry weight)', kcal: 355, p: 12, c: 71, f: 1.5, contains: ['gluten'], swaps: ['gf_pasta'] },
  gf_pasta:       { name: 'gluten-free pasta (dry weight)', kcal: 355, p: 7, c: 77, f: 1.5, contains: [] },
  potatoes:       { name: 'potatoes (raw)', kcal: 77, p: 2, c: 17, f: 0.1, contains: [] },
  sweet_potato:   { name: 'sweet potato (raw)', kcal: 86, p: 1.6, c: 20, f: 0.1, contains: [] },
  bread:          { name: 'wholemeal bread', kcal: 230, p: 10, c: 40, f: 2.5, contains: ['gluten'], swaps: ['gf_bread'], unit: { g: 40, one: 'slice wholemeal bread', many: 'slices wholemeal bread' } },
  gf_bread:       { name: 'gluten-free bread', kcal: 240, p: 4, c: 44, f: 5, contains: [], unit: { g: 35, one: 'slice gluten-free bread', many: 'slices gluten-free bread' } },
  wrap:           { name: 'wholemeal tortilla wrap', kcal: 290, p: 9, c: 47, f: 6, contains: ['gluten'], swaps: ['gf_wrap'], unit: { g: 62, one: 'wholemeal wrap', many: 'wholemeal wraps' } },
  gf_wrap:        { name: 'gluten-free wrap', kcal: 300, p: 4, c: 55, f: 6, contains: [], unit: { g: 50, one: 'gluten-free wrap', many: 'gluten-free wraps' } },
  bun:            { name: 'wholemeal burger bun', kcal: 245, p: 10, c: 41, f: 4, contains: ['gluten'], swaps: ['gf_bun'], unit: { g: 60, one: 'wholemeal bun', many: 'wholemeal buns' } },
  gf_bun:         { name: 'gluten-free bun', kcal: 255, p: 4, c: 46, f: 5, contains: [], unit: { g: 70, one: 'gluten-free bun', many: 'gluten-free buns' } },
  banana:         { name: 'banana', kcal: 90, p: 1.1, c: 20, f: 0.3, contains: [], unit: { g: 120, one: 'banana', many: 'bananas', half: true } },
  berries:        { name: 'frozen mixed berries', kcal: 45, p: 1, c: 8, f: 0.3, contains: [] },
  broccoli:       { name: 'broccoli', kcal: 34, p: 2.8, c: 4, f: 0.4, contains: [], free: true },
  green_beans:    { name: 'green beans', kcal: 31, p: 1.8, c: 4, f: 0.2, contains: [], free: true },
  peas:           { name: 'garden peas', kcal: 80, p: 5.4, c: 10, f: 1.5, contains: [], free: true },
  spinach:        { name: 'spinach', kcal: 23, p: 2.9, c: 1.1, f: 0.4, contains: [], free: true },
  salad:          { name: 'salad leaves', kcal: 18, p: 1.4, c: 2, f: 0.3, contains: [], free: true },
  cucumber_tomato:{ name: 'cucumber & tomatoes', kcal: 16, p: 0.8, c: 3, f: 0.2, contains: [], free: true },
  peppers_onion:  { name: 'sliced peppers & onion', kcal: 32, p: 1, c: 6, f: 0.2, contains: [], free: true },
  stirfry_veg:    { name: 'stir-fry vegetables', kcal: 35, p: 2, c: 5, f: 0.3, contains: [], free: true },
  mushrooms:      { name: 'mushrooms', kcal: 22, p: 3, c: 0.5, f: 0.3, contains: [], free: true },
  chopped_tomatoes:{ name: 'chopped tomatoes (tin)', kcal: 24, p: 1.2, c: 3.8, f: 0.2, contains: [], free: true },
  onion:          { name: 'onion', kcal: 40, p: 1.1, c: 8, f: 0.1, contains: [], free: true },
  salsa:          { name: 'tomato salsa', kcal: 40, p: 1.3, c: 7, f: 0.3, contains: [], free: true },
  soy_sauce:      { name: 'soy sauce', kcal: 60, p: 8, c: 6, f: 0, contains: ['gluten'], swaps: ['tamari'], free: true, ml: true },
  tamari:         { name: 'tamari (gluten-free soy sauce)', kcal: 70, p: 10, c: 7, f: 0, contains: [], free: true, ml: true },
  olive_oil:      { name: 'olive oil', kcal: 884, p: 0, c: 0, f: 100, contains: [], ml: true },
  peanut_butter:  { name: 'peanut butter', kcal: 620, p: 25, c: 12, f: 50, contains: ['nuts'], swaps: ['seed_butter'] },
  seed_butter:    { name: 'sunflower seed butter', kcal: 610, p: 20, c: 20, f: 51, contains: [] },
  avocado:        { name: 'avocado', kcal: 190, p: 1.9, c: 1.9, f: 19.5, contains: [] },
  honey:          { name: 'honey', kcal: 330, p: 0.4, c: 82, f: 0, contains: ['honey'], swaps: ['maple'] },
  maple:          { name: 'maple syrup', kcal: 260, p: 0, c: 67, f: 0, contains: [] },
  curry_paste:    { name: 'curry paste', kcal: 200, p: 3, c: 12, f: 15, contains: [] },
};

// Main protein for a meal. Each option is a mix of foods and the share of the meal's
// protein each one supplies. label goes in meal names, noun in the method.
export const PROTEINS = {
  chicken:       { label: 'Chicken', noun: 'chicken', foods: [['chicken', 1]] },
  turkey:        { label: 'Turkey', noun: 'turkey', foods: [['turkey_mince', 1]] },
  beef:          { label: 'Beef', noun: 'beef', foods: [['beef_mince', 1]] },
  salmon:        { label: 'Salmon', noun: 'salmon', foods: [['salmon', 1]] },
  white_fish:    { label: 'Fish', noun: 'fish', foods: [['white_fish', 1]] },
  prawns:        { label: 'Prawn', noun: 'prawns', foods: [['prawns', 1]] },
  tuna:          { label: 'Tuna', noun: 'tuna', foods: [['tuna', 1]] },
  tofu:          { label: 'Tofu', noun: 'tofu', foods: [['tofu', 1]] },
  tofu_edamame:  { label: 'Tofu & edamame', noun: 'tofu and edamame', foods: [['tofu', 0.6], ['edamame', 0.4]] },
  lentil_tofu:   { label: 'Lentil', noun: 'lentils and tofu', foods: [['red_lentils', 0.5], ['tofu', 0.5]] },
  chickpea_tofu: { label: 'Chickpea & tofu', noun: 'chickpeas and tofu', foods: [['chickpeas', 0.35], ['tofu', 0.65]] },
  bean_tofu:     { label: 'Bean & tofu', noun: 'beans and tofu', foods: [['black_beans', 0.35], ['tofu', 0.65]] },
  eggs:          { label: 'Egg', noun: 'eggs', foods: [['eggs', 0.6], ['egg_whites', 0.4]] },
  tofu_scramble: { label: 'Tofu', noun: 'tofu', foods: [['tofu', 1]] },
  yogurt:        { label: 'Greek yogurt', noun: 'yogurt', foods: [['greek_yogurt', 0.75], ['whey', 0.25]] },
  yogurt_vegan:  { label: 'Soya yogurt', noun: 'yogurt', foods: [['soya_yogurt', 0.25], ['vegan_protein', 0.75]] },
  shake:         { label: 'Protein', noun: 'protein powder', foods: [['whey', 1]] },
  cottage:       { label: 'Cottage cheese', noun: 'cottage cheese', foods: [['cottage_cheese', 1]] },
};

// Meals. {P} = protein label ("Chicken"), {p} = protein noun ("chicken").
// items: [foodId, grams, flag]. flag 'opt' = left out if your diet rules it out.
export const MEALS = [
  // Breakfasts
  { id: 'porridge', slots: ['breakfast'], name: 'Protein porridge with berries', protein: ['shake'],
    items: [['oats', 50], ['milk', 200], ['berries', 80]],
    how: 'Cook the oats in the milk (microwave 2–3 min, stirring halfway). Let it cool for a minute, stir in the protein powder, top with the berries.' },
  { id: 'yogurt_bowl', slots: ['breakfast'], name: '{P} bowl with oats & berries', protein: ['yogurt', 'yogurt_vegan'],
    items: [['oats', 30], ['berries', 100], ['honey', 10, 'opt'], ['peanut_butter', 10, 'opt']],
    how: 'Stir the protein powder into the yogurt until smooth, then top with the oats, berries, honey and nut butter. Make it the night before if mornings are rushed.' },
  { id: 'eggs_toast', slots: ['breakfast'], name: 'Scrambled {p} on toast', protein: ['eggs', 'tofu_scramble'],
    items: [['bread', 80], ['spinach', 60], ['cucumber_tomato', 80], ['olive_oil', 5]],
    how: 'Scramble the eggs (or crumbled tofu with a pinch of turmeric) in the oil, wilt in the spinach, serve on the toast with tomatoes on the side.' },
  { id: 'breakfast_wrap', slots: ['breakfast'], name: 'Breakfast wrap', protein: ['eggs', 'tofu_scramble'],
    items: [['wrap', 62], ['light_cheese', 20, 'opt'], ['salsa', 40], ['spinach', 40]],
    how: 'Scramble the filling, pile it into the wrap with the cheese, spinach and salsa, roll it up and toast in a dry pan for a minute each side.' },
  { id: 'smoothie', slots: ['breakfast'], name: 'Protein smoothie', protein: ['shake'],
    items: [['banana', 120], ['oats', 30], ['milk', 250], ['berries', 80], ['peanut_butter', 10, 'opt']],
    how: 'Blend everything with a few ice cubes until smooth. Good on training mornings.' },

  // Lunches and dinners
  { id: 'stirfry', slots: ['lunch', 'dinner'], name: '{P} stir-fry with rice', protein: ['chicken', 'prawns', 'tofu_edamame'],
    items: [['rice', 180], ['stirfry_veg', 250], ['soy_sauce', 15], ['olive_oil', 7]],
    how: 'Fry the {p} in the oil until cooked through, add the veg for 3–4 minutes, splash in the soy sauce (plus garlic or chilli if you like) and serve on the rice.' },
  { id: 'burrito_bowl', slots: ['lunch', 'dinner'], name: '{P} burrito bowl', protein: ['beef', 'chicken', 'bean_tofu'],
    items: [['rice', 150], ['black_beans', 60], ['peppers_onion', 150], ['salsa', 60], ['salad', 40], ['avocado', 40]],
    how: 'Brown the {p} with taco or fajita spice, fry the peppers and onion, then build the bowl: rice, beans, {p}, veg, salsa and sliced avocado.' },
  { id: 'fajitas', slots: ['lunch', 'dinner'], name: '{P} fajita wraps', protein: ['chicken', 'prawns', 'tofu'],
    items: [['wrap', 124], ['peppers_onion', 200], ['salsa', 50], ['greek_yogurt', 50, 'opt'], ['olive_oil', 5]],
    how: 'Slice the {p} and peppers, fry with fajita seasoning in the oil and fill the wraps. Yogurt does the job of sour cream for a fraction of the calories.' },
  { id: 'traybake', slots: ['lunch', 'dinner'], name: '{P} & sweet potato traybake', protein: ['salmon', 'chicken', 'tofu'],
    items: [['sweet_potato', 250], ['broccoli', 150], ['peppers_onion', 100], ['olive_oil', 7]],
    how: 'Cube the sweet potato, toss with the oil and paprika and roast at 200°C for 15 min. Add the {p} and veg and roast for 15–18 min more.' },
  { id: 'bolognese', slots: ['lunch', 'dinner'], name: '{P} bolognese with spaghetti', protein: ['beef', 'turkey', 'lentil_tofu'],
    items: [['pasta', 75], ['chopped_tomatoes', 200], ['onion', 60], ['mushrooms', 80], ['light_cheese', 10, 'opt']],
    how: 'Brown the {p} with the onion and mushrooms, add the tomatoes and dried herbs and simmer for 15 min. Serve on the spaghetti with a little grated cheese. Batch-cook it: it freezes well.' },
  { id: 'curry', slots: ['lunch', 'dinner'], name: '{P} curry with rice', protein: ['chicken', 'prawns', 'chickpea_tofu'],
    items: [['rice', 150], ['curry_paste', 25], ['chopped_tomatoes', 200], ['onion', 60], ['spinach', 80], ['greek_yogurt', 40, 'opt']],
    how: 'Soften the onion, add the curry paste and {p}, then the tomatoes. Simmer for 15 min, stir in the spinach and a spoon of yogurt and serve with the rice.' },
  { id: 'potato_salad', slots: ['lunch'], name: '{P} salad with new potatoes', protein: ['chicken', 'tuna', 'chickpea_tofu'],
    items: [['potatoes', 220], ['salad', 80], ['cucumber_tomato', 150], ['feta', 25, 'opt'], ['olive_oil', 8]],
    how: 'Boil the potatoes (do three days’ worth at once) and let them cool. Toss with the leaves, cucumber, tomatoes, {p}, feta and the oil with lemon or balsamic.' },
  { id: 'jacket', slots: ['lunch', 'dinner'], name: 'Jacket potato with {p}', protein: ['tuna', 'cottage', 'chicken'],
    items: [['potatoes', 300], ['salad', 60], ['cucumber_tomato', 100], ['greek_yogurt', 30, 'opt'], ['light_cheese', 15, 'opt']],
    how: 'Microwave the potato for 8–10 min (or bake it). Mix the {p} with the yogurt, pile it in, top with the cheese and have the salad on the side.' },
  { id: 'sticky_soy', slots: ['dinner'], name: 'Sticky soy {p} with rice & greens', protein: ['salmon', 'chicken', 'tofu'],
    items: [['rice', 150], ['broccoli', 150], ['green_beans', 80], ['soy_sauce', 15], ['honey', 10]],
    how: 'Mix the soy sauce and honey, brush it over the {p} and roast or pan-fry. Serve with the rice and steamed greens.' },
  { id: 'burger', slots: ['dinner'], name: '{P} burger & potato wedges', protein: ['beef', 'turkey', 'chicken'],
    items: [['bun', 60], ['potatoes', 200], ['olive_oil', 5], ['salad', 50], ['cucumber_tomato', 80]],
    how: 'Season the meat, shape a patty and grill or pan-fry it. Cut the potatoes into wedges, toss in the oil and bake at 200°C for about 30 min.' },
  { id: 'pasta_salad', slots: ['lunch'], name: '{P} pasta salad', protein: ['tuna', 'chicken', 'chickpea_tofu'],
    items: [['pasta', 70], ['cucumber_tomato', 150], ['peppers_onion', 60], ['greek_yogurt', 40, 'opt'], ['olive_oil', 5]],
    how: 'Cook the pasta and cool it, then mix with the {p}, veg, yogurt and a squeeze of lemon. Keeps for two days in the fridge.' },
  { id: 'dahl', slots: ['lunch', 'dinner'], name: 'Red lentil & tofu dahl with rice', protein: ['lentil_tofu'],
    items: [['rice', 120], ['chopped_tomatoes', 150], ['onion', 60], ['spinach', 80], ['curry_paste', 20]],
    how: 'Fry the onion with the curry paste, add the lentils, tomatoes and 400 ml water and simmer for 20 min until thick. Stir in cubed tofu and the spinach, serve with rice.' },
  { id: 'fish_chips', slots: ['dinner'], name: 'Oven fish, chips & peas', protein: ['white_fish'],
    items: [['potatoes', 250], ['olive_oil', 7], ['peas', 100]],
    how: 'Cut the potatoes into chips, toss in the oil and bake at 210°C for 30–35 min. Season the fish and bake it for the last 12–15 min. Serve with peas and lemon.' },
  { id: 'omelette', slots: ['lunch'], name: 'Loaded omelette with toast', protein: ['eggs'],
    items: [['bread', 40], ['mushrooms', 60], ['peppers_onion', 60], ['spinach', 40], ['light_cheese', 15, 'opt'], ['olive_oil', 5]],
    how: 'Fry the veg in the oil, pour over the beaten eggs and whites, sprinkle on the cheese and fold when set. Toast on the side.' },
];

// Snacks with fixed portions. treat: true marks the "fun" ones.
export const SNACKS = [
  { id: 'yog_berries', name: 'Greek yogurt (170 g, 0%) + berries', kcal: 135, p: 18, contains: ['dairy'] },
  { id: 'skyr', name: 'Skyr or high-protein yogurt pot', kcal: 95, p: 16, contains: ['dairy'] },
  { id: 'whey_shake', name: 'Protein shake (30 g whey, water)', kcal: 115, p: 23, contains: ['dairy'] },
  { id: 'vegan_shake', name: 'Vegan protein shake (30 g, water)', kcal: 115, p: 21, contains: [] },
  { id: 'eggs2', name: '2 boiled eggs', kcal: 150, p: 13, contains: ['egg'] },
  { id: 'cottage_rc', name: 'Cottage cheese (150 g) on 2 rice cakes', kcal: 175, p: 19, contains: ['dairy'] },
  { id: 'jerky', name: 'Beef jerky (25 g bag)', kcal: 80, p: 12, contains: ['meat'] },
  { id: 'tuna_cuc', name: 'Small tin of tuna + cucumber sticks', kcal: 95, p: 21, contains: ['fish'] },
  { id: 'edamame', name: 'Edamame (150 g, steamed & salted)', kcal: 180, p: 18, contains: [] },
  { id: 'mini_cheese', name: '2 light mini cheeses', kcal: 85, p: 12, contains: ['dairy'] },
  { id: 'protein_bar', name: 'Protein bar (~60 g)', kcal: 200, p: 20, contains: ['dairy'] },
  { id: 'hummus_veg', name: 'Hummus (50 g) + carrot & pepper sticks', kcal: 140, p: 4, contains: [] },
  { id: 'apple_pb', name: 'Apple + 15 g peanut butter', kcal: 170, p: 4, contains: ['nuts'] },
  { id: 'banana', name: 'Banana', kcal: 105, p: 1, contains: [] },
  { id: 'rice_cakes_pb', name: '2 rice cakes + 10 g peanut butter', kcal: 120, p: 4, contains: ['nuts'] },
  { id: 'almonds', name: 'Almonds (20 g, about 15)', kcal: 125, p: 4.5, contains: ['nuts'] },
  { id: 'roast_chickpeas', name: 'Roasted chickpeas (30 g)', kcal: 120, p: 6, contains: [] },
  { id: 'grapes', name: 'Frozen grapes (100 g)', kcal: 70, p: 0.5, contains: [] },
  { id: 'popcorn', name: 'Lightly salted popcorn (20 g bag)', kcal: 100, p: 2, contains: [], treat: true },
  { id: 'crisps', name: 'Bag of crisps (25 g)', kcal: 130, p: 1.5, contains: [], treat: true },
  { id: 'dark_choc', name: 'Dark chocolate, 2 squares (20 g)', kcal: 120, p: 2, contains: [], treat: true },
  { id: 'fun_size', name: 'Fun-size chocolate bar', kcal: 95, p: 1, contains: ['dairy'], treat: true },
  { id: 'hot_choc', name: 'Low-calorie hot chocolate', kcal: 40, p: 1.5, contains: ['dairy'], treat: true },
  { id: 'jelly', name: 'Sugar-free jelly pot', kcal: 10, p: 0, contains: [] },
];

// Equipment people can tick when training at home.
export const EQUIPMENT = [
  { id: 'dumbbells', name: 'Dumbbells' },
  { id: 'kettlebell', name: 'Kettlebell' },
  { id: 'bands', name: 'Resistance bands' },
  { id: 'pullup_bar', name: 'Pull-up bar' },
  { id: 'bench', name: 'Weight bench' },
  { id: 'ab_wheel', name: 'Ab wheel' },
  { id: 'skipping_rope', name: 'Skipping rope' },
  { id: 'chair', name: 'Sturdy chair or step' },
];

// Exercises. needs: every item must be available ("gym" means a gym membership).
// Bodyweight moves need nothing.
export const EXERCISES = {
  // squat
  bb_squat:        { name: 'Barbell back squat (or leg press)', needs: ['gym'], reps: '8–10', cue: 'Brace your stomach like you are about to be punched, sit down between your heels, drive up.' },
  goblet_db:       { name: 'Dumbbell goblet squat', needs: ['dumbbells'], reps: '10–15', cue: 'Hold one dumbbell at your chest, elbows inside knees at the bottom, chest up.' },
  goblet_kb:       { name: 'Kettlebell goblet squat', needs: ['kettlebell'], reps: '10–15', cue: 'Hold the bell by the horns at your chest, sit deep, stand tall.' },
  band_squat:      { name: 'Banded squat', needs: ['bands'], reps: '12–20', cue: 'Stand on the band, handles at your shoulders, squat to just below parallel.' },
  tempo_squat:     { name: 'Tempo bodyweight squat (3 s down)', needs: [], reps: '15–25', cue: 'Count three on the way down, pause at the bottom, stand up fast.', harder: 'Jump squat or hold a full backpack', easier: 'Squat to a chair' },
  // hinge
  bb_rdl:          { name: 'Romanian deadlift', needs: ['gym'], reps: '8–10', cue: 'Soft knees, push your hips back until you feel your hamstrings, flat back the whole time.' },
  db_rdl:          { name: 'Dumbbell Romanian deadlift', needs: ['dumbbells'], reps: '10–12', cue: 'Weights slide down your thighs as your hips go back; squeeze your glutes to stand.' },
  kb_swing:        { name: 'Kettlebell swing', needs: ['kettlebell'], reps: '15–20', cue: 'It is a hip snap, not a squat or an arm raise. Bell floats to chest height.' },
  sl_hip_thrust:   { name: 'Single-leg hip thrust (back on sofa or chair)', needs: ['chair'], reps: '10–15 each', cue: 'Upper back on the edge, drive through one heel, pause at the top.' },
  glute_bridge:    { name: 'Single-leg glute bridge', needs: [], reps: '10–15 each', cue: 'Lie on your back, one foot planted, lift your hips until your body is straight.', easier: 'Both feet down' },
  // lunge
  db_bulgarian:    { name: 'Dumbbell Bulgarian split squat', needs: ['dumbbells', 'bench'], reps: '8–12 each', cue: 'Back foot on the bench, drop your back knee straight down, front heel stays planted.' },
  bulgarian:       { name: 'Bulgarian split squat (back foot on chair)', needs: ['chair'], reps: '8–15 each', cue: 'Long stance, drop straight down, hold a backpack to make it harder.', easier: 'Split squat with both feet on the floor' },
  db_lunge:        { name: 'Dumbbell reverse lunge', needs: ['dumbbells'], reps: '8–12 each', cue: 'Step back, both knees to 90°, push through the front heel.' },
  reverse_lunge:   { name: 'Reverse lunge', needs: [], reps: '12–15 each', cue: 'Step back, lower the back knee to just above the floor, stand tall.' },
  // horizontal push
  bb_bench:        { name: 'Bench press (barbell or dumbbell)', needs: ['gym'], reps: '8–10', cue: 'Shoulder blades pinched, feet planted, lower to mid-chest.' },
  db_bench:        { name: 'Dumbbell bench press', needs: ['dumbbells', 'bench'], reps: '8–12', cue: 'Lower the weights to chest level with elbows at about 45°.' },
  db_floor_press:  { name: 'Dumbbell floor press', needs: ['dumbbells'], reps: '10–12', cue: 'Lie on the floor, lower until your upper arms touch down, press up.' },
  pushup:          { name: 'Push-up', needs: [], reps: '8–20', cue: 'Body in one straight line, chest to a fist-height above the floor.', harder: 'Feet raised on a chair', easier: 'Hands on a table or kitchen counter' },
  // vertical push
  db_press:        { name: 'Seated dumbbell shoulder press', needs: ['dumbbells'], reps: '8–12', cue: 'Brace your stomach, press up and slightly back, do not arch.' },
  kb_press:        { name: 'Kettlebell overhead press', needs: ['kettlebell'], reps: '8–12 each', cue: 'Squeeze glutes and stomach, press until your bicep is by your ear.' },
  band_press:      { name: 'Band overhead press', needs: ['bands'], reps: '12–15', cue: 'Stand on the band, press straight up, ribs down.' },
  pike_pushup:     { name: 'Pike push-up', needs: [], reps: '6–12', cue: 'Hips high in an upside-down V, lower the top of your head towards the floor.', easier: 'Hands on a chair' },
  // vertical pull
  lat_pulldown:    { name: 'Lat pulldown (or assisted pull-up)', needs: ['gym'], reps: '8–12', cue: 'Pull your elbows down to your ribs, chest up to the bar.' },
  pullup:          { name: 'Pull-up', needs: ['pullup_bar'], reps: '3–10', cue: 'Start from a dead hang, chest to the bar.', easier: 'Jump up, lower yourself slowly over 4 s (negatives)' },
  band_pulldown:   { name: 'Band lat pulldown (band over a door)', needs: ['bands'], reps: '12–15', cue: 'Kneel, pull your elbows down to your sides, squeeze.' },
  // horizontal pull
  cable_row:       { name: 'Seated cable row', needs: ['gym'], reps: '10–12', cue: 'Sit tall, pull to your belly button, squeeze your shoulder blades.' },
  db_row:          { name: 'One-arm dumbbell row', needs: ['dumbbells'], reps: '10–12 each', cue: 'Hand and knee on a chair or bench, pull the weight to your hip.' },
  kb_row:          { name: 'Kettlebell row', needs: ['kettlebell'], reps: '10–12 each', cue: 'Hinge forward, flat back, row the bell to your hip.' },
  band_row:        { name: 'Band row (band round a post or door)', needs: ['bands'], reps: '12–20', cue: 'Pull handles to your ribs, pause for a second.' },
  backpack_row:    { name: 'Backpack row (fill a rucksack with books)', needs: [], reps: '12–20', cue: 'Hinge forward with a flat back and row the bag to your stomach.' },
  // arms
  db_curl:         { name: 'Dumbbell curl', needs: ['dumbbells'], reps: '10–15', cue: 'Elbows pinned to your sides, no swinging.' },
  band_curl:       { name: 'Band curl', needs: ['bands'], reps: '15–20', cue: 'Stand on the band, curl slowly and squeeze at the top.' },
  chinup:          { name: 'Chin-up (palms facing you)', needs: ['pullup_bar'], reps: '3–10', cue: 'Palms towards you, chest to the bar.' },
  backpack_curl:   { name: 'Backpack curl', needs: [], reps: '12–20', cue: 'Hold the bag by its top handle with both hands and curl.' },
  cable_pushdown:  { name: 'Cable triceps pushdown', needs: ['gym'], reps: '10–15', cue: 'Elbows by your sides, straighten your arms fully.' },
  db_overhead_ext: { name: 'Dumbbell overhead triceps extension', needs: ['dumbbells'], reps: '10–15', cue: 'Hold one dumbbell overhead, lower behind your head, elbows pointing up.' },
  band_pushdown:   { name: 'Band triceps pushdown', needs: ['bands'], reps: '15–20', cue: 'Anchor the band high, push down to straight arms.' },
  chair_dip:       { name: 'Chair dip', needs: ['chair'], reps: '8–15', cue: 'Hands on the chair edge, lower until elbows reach 90°.' },
  diamond_pushup:  { name: 'Close-grip push-up', needs: [], reps: '6–15', cue: 'Hands under your chest, elbows brush your sides.', easier: 'On your knees' },
  calf_raise:      { name: 'Single-leg calf raise (on a step)', needs: [], reps: '12–20 each', cue: 'Full stretch at the bottom, pause at the top.' },
  hip_thrust:      { name: 'Barbell hip thrust (or glute machine)', needs: ['gym'], reps: '8–12', cue: 'Upper back on a bench, chin tucked, push your hips to the ceiling.' },
  db_hip_thrust:   { name: 'Dumbbell hip thrust', needs: ['dumbbells', 'bench'], reps: '10–15', cue: 'Dumbbell on your hips, back on the bench, pause at the top.' },
  // core: rectus (the "six pack" itself)
  cable_crunch:    { name: 'Kneeling cable crunch', needs: ['gym'], reps: '10–15', cue: 'Round your spine down towards your knees; your hips stay still.', core: true },
  weighted_crunch: { name: 'Weighted crunch (hold a dumbbell)', needs: ['dumbbells'], reps: '10–15', cue: 'Weight on your chest, curl your ribs towards your hips, lower slowly.', core: true },
  kb_crunch:       { name: 'Weighted crunch (hold the kettlebell)', needs: ['kettlebell'], reps: '10–15', cue: 'Weight on your chest, curl your ribs towards your hips, lower slowly.', core: true },
  crunch:          { name: 'Slow crunch (2 s up, 2 s down)', needs: [], reps: '15–25', cue: 'Curl your ribs to your hips; it is a small movement, not a sit-up.', core: true },
  // core: lower abs
  hanging_raise:   { name: 'Hanging knee or leg raise', needs: ['pullup_bar'], reps: '8–15', cue: 'Curl your pelvis up, do not just swing your legs.', easier: 'Knees bent', harder: 'Straight legs to the bar', core: true },
  reverse_crunch:  { name: 'Reverse crunch', needs: [], reps: '10–20', cue: 'Knees bent, roll your hips off the floor towards your chest, lower slowly.', core: true },
  // core: anti-extension
  ab_wheel:        { name: 'Ab wheel rollout', needs: ['ab_wheel'], reps: '6–12', cue: 'Start on your knees, keep your back flat, roll out only as far as you can control.', core: true },
  plank:           { name: 'Hard plank (squeeze everything)', needs: [], reps: '20–40 s', cue: 'Elbows under shoulders, squeeze glutes and stomach as hard as you can.', core: true },
  dead_bug:        { name: 'Dead bug', needs: [], reps: '8–12 each side', cue: 'Lower back pressed into the floor the whole time, move slowly.', core: true },
  // core: obliques and anti-rotation
  pallof_cable:    { name: 'Cable Pallof press', needs: ['gym'], reps: '10 each side', cue: 'Stand side-on to the cable, press out, do not let it twist you.', core: true },
  pallof_band:     { name: 'Band Pallof press', needs: ['bands'], reps: '10 each side', cue: 'Band anchored at chest height, press out and resist the twist.', core: true },
  side_plank:      { name: 'Side plank', needs: [], reps: '20–40 s each side', cue: 'Body in one straight line, hips high.', easier: 'Knees bent', core: true },
  woodchop_cable:  { name: 'Cable woodchop', needs: ['gym'], reps: '10 each side', cue: 'Rotate through your upper back, arms stay long.', core: true },
  woodchop_band:   { name: 'Band woodchop', needs: ['bands'], reps: '12 each side', cue: 'Pull diagonally across your body, control the return.', core: true },
  bicycle:         { name: 'Slow bicycle crunch', needs: [], reps: '10–15 each side', cue: 'Elbow to opposite knee, pause on each side.', core: true },
  suitcase_db:     { name: 'Suitcase carry (one dumbbell)', needs: ['dumbbells'], reps: '30 s each side', cue: 'Walk tall with the weight in one hand; do not lean.', core: true },
  suitcase_kb:     { name: 'Suitcase carry (kettlebell)', needs: ['kettlebell'], reps: '30 s each side', cue: 'Walk tall with the bell in one hand; do not lean.', core: true },
  hollow_hold:     { name: 'Hollow body hold', needs: [], reps: '15–30 s', cue: 'Lower back glued to the floor, arms and legs hovering.', easier: 'Knees bent', core: true },
  // conditioning
  bike_intervals:  { name: 'Bike or rower intervals', needs: ['gym'], reps: '30 s hard / 60 s easy', cue: 'Hard means you could not say a full sentence.', cardio: true },
  rope_intervals:  { name: 'Skipping intervals', needs: ['skipping_rope'], reps: '40 s on / 20 s off', cue: 'Light on your toes, wrists do the work.', cardio: true },
  kb_intervals:    { name: 'Kettlebell swing intervals', needs: ['kettlebell'], reps: '20 swings every minute', cue: 'Rest for the remainder of each minute.', cardio: true },
  bw_intervals:    { name: 'Mountain climbers & squat jumps', needs: [], reps: '30 s on / 30 s off', cue: 'Alternate the two moves each round.', cardio: true },
};

// Which exercises can fill each slot, best first.
export const PATTERNS = {
  squat:     ['bb_squat', 'goblet_db', 'goblet_kb', 'band_squat', 'tempo_squat'],
  hinge:     ['bb_rdl', 'db_rdl', 'kb_swing', 'sl_hip_thrust', 'glute_bridge'],
  lunge:     ['db_bulgarian', 'bulgarian', 'db_lunge', 'reverse_lunge'],
  push_h:    ['bb_bench', 'db_bench', 'pushup', 'db_floor_press'],
  push_v:    ['db_press', 'kb_press', 'band_press', 'pike_pushup'],
  pull_v:    ['lat_pulldown', 'pullup', 'band_pulldown'],
  pull_h:    ['cable_row', 'db_row', 'kb_row', 'band_row', 'backpack_row'],
  biceps:    ['db_curl', 'chinup', 'band_curl', 'backpack_curl'],
  triceps:   ['cable_pushdown', 'db_overhead_ext', 'band_pushdown', 'chair_dip', 'diamond_pushup'],
  glute:     ['hip_thrust', 'db_hip_thrust', 'sl_hip_thrust', 'glute_bridge'],
  calves:    ['calf_raise'],
  core_flex:     ['cable_crunch', 'weighted_crunch', 'kb_crunch', 'crunch'],
  core_lower:    ['hanging_raise', 'reverse_crunch'],
  core_antiext:  ['ab_wheel', 'plank', 'dead_bug'],
  core_oblique:  ['pallof_cable', 'pallof_band', 'side_plank'],
  core_rotation: ['woodchop_cable', 'woodchop_band', 'bicycle'],
  core_carry:    ['suitcase_db', 'suitcase_kb', 'hollow_hold'],
  conditioning:  ['bike_intervals', 'rope_intervals', 'kb_intervals', 'bw_intervals'],
};

// Fallback pattern when nothing fits (e.g. no way to do a vertical pull at home).
export const PATTERN_FALLBACK = { pull_v: 'pull_h', core_lower: 'core_flex', core_carry: 'core_antiext' };

export const SESSIONS = {
  full_a:  { name: 'Full body A', main: ['squat', 'push_h', 'pull_h', 'hinge', 'push_v', 'lunge'], core: ['core_flex', 'core_antiext', 'core_oblique'] },
  full_b:  { name: 'Full body B', main: ['hinge', 'push_v', 'pull_v', 'lunge', 'push_h', 'pull_h'], core: ['core_lower', 'core_rotation', 'core_antiext'] },
  full_c:  { name: 'Full body C', main: ['lunge', 'push_h', 'pull_h', 'squat', 'push_v', 'glute'], core: ['core_flex', 'core_oblique', 'core_lower'] },
  upper_a: { name: 'Upper body A', main: ['push_h', 'pull_h', 'push_v', 'pull_v', 'triceps', 'biceps'], core: ['core_flex', 'core_oblique', 'core_antiext'] },
  upper_b: { name: 'Upper body B', main: ['push_v', 'pull_v', 'push_h', 'pull_h', 'biceps', 'triceps'], core: ['core_lower', 'core_rotation', 'core_antiext'] },
  lower_a: { name: 'Legs & abs A', main: ['squat', 'hinge', 'lunge', 'glute', 'calves'], core: ['core_flex', 'core_antiext', 'core_oblique'] },
  lower_b: { name: 'Legs & abs B', main: ['hinge', 'lunge', 'squat', 'glute', 'calves'], core: ['core_lower', 'core_rotation', 'core_carry'] },
  core_cardio: { name: 'Abs & conditioning', main: ['conditioning'], core: ['core_flex', 'core_lower', 'core_antiext', 'core_oblique', 'core_rotation'], cardio: true },
};

export const SPLITS = {
  2: { sessions: ['full_a', 'full_b'], days: [1, 4] },
  3: { sessions: ['full_a', 'full_b', 'full_c'], days: [1, 3, 5] },
  4: { sessions: ['upper_a', 'lower_a', 'upper_b', 'lower_b'], days: [1, 2, 4, 5] },
  5: { sessions: ['upper_a', 'lower_a', 'core_cardio', 'upper_b', 'lower_b'], days: [1, 2, 3, 5, 6] },
  6: { sessions: ['upper_a', 'lower_a', 'core_cardio', 'upper_b', 'lower_b', 'core_cardio'], days: [1, 2, 3, 4, 5, 6] },
};

// The ab "stages" used for self-assessment, photo analysis, goals and the timeline.
// bf: typical body fat range [men, women] in %.
export const STAGES = [
  { n: 0, name: 'No outline yet', short: 'No outline', desc: 'Stomach looks smooth or soft, even when you tense.', bf: { male: [22, 32], female: [30, 40] } },
  { n: 1, name: 'First hints', short: 'Hints', desc: 'A faint centre line or upper outline, only when tensed.', bf: { male: [18, 22], female: [26, 30] } },
  { n: 2, name: 'Upper abs showing', short: 'Upper two', desc: 'Top two abs show when you tense; faint when relaxed.', bf: { male: [15, 18], female: [23, 26] } },
  { n: 3, name: 'Visible abs', short: 'Four-pack', desc: 'Four abs clear when tensed, upper outline when relaxed.', bf: { male: [12, 15], female: [20, 23] } },
  { n: 4, name: 'Six-pack', short: 'Six-pack', desc: 'Six clear when tensed, four or more when relaxed.', bf: { male: [10, 12], female: [17, 20] } },
  { n: 5, name: 'Shredded', short: 'Shredded', desc: 'Sharp six-pack relaxed, obliques and V-lines visible.', bf: { male: [7, 10], female: [14, 17] } },
];

// Shopping list aisles. Foods not listed here go under "Other".
export const AISLES = [
  ['Meat & fish', ['chicken', 'turkey_mince', 'beef_mince', 'salmon', 'white_fish', 'prawns', 'tuna']],
  ['Dairy, eggs & tofu', ['eggs', 'egg_whites', 'greek_yogurt', 'soya_yogurt', 'cottage_cheese', 'milk', 'soya_milk', 'light_cheese', 'feta', 'tofu']],
  ['Fruit & veg', ['banana', 'berries', 'avocado', 'potatoes', 'sweet_potato', 'broccoli', 'green_beans', 'peas', 'edamame', 'spinach', 'salad', 'cucumber_tomato', 'peppers_onion', 'stirfry_veg', 'mushrooms', 'onion']],
  ['Bread, rice & pasta', ['oats', 'gf_oats', 'rice', 'pasta', 'gf_pasta', 'bread', 'gf_bread', 'wrap', 'gf_wrap', 'bun', 'gf_bun']],
  ['Tins, jars & cupboard', ['chickpeas', 'black_beans', 'red_lentils', 'chopped_tomatoes', 'salsa', 'curry_paste', 'soy_sauce', 'tamari', 'olive_oil', 'peanut_butter', 'seed_butter', 'honey', 'maple', 'whey', 'vegan_protein']],
];
