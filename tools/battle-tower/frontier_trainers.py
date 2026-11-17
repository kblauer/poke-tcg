"""Writes packages/campaign/src/battle-tower-trainers.ts: the Battle Tower's trainers, Emerald's Battle Frontier trainers
(the user's: pret/pokeemerald's src/data/battle_frontier/battle_frontier_trainers.h), each with their name, class and
three lines (before the battle, on winning it and on losing it), and their overworld sprite in each of the run maps'
sprite sets where one of their class exists (the user's: only trainers we have sprites for), so a floor of a
generation meets only those with a sprite in its set:

- Emerald's ('rse', the Gen 3 floors): the sprite Emerald draws the class as (battle_tower.c's gTowerMale/FemaleTrainerGfxIds),
  where public/overworld/rse/ has it;
- FireRed's ('frlg', the Gen 1 floors), HeartGold/SoulSilver's ('hgss', the Gen 2 floors), Diamond's ('dp', the Gen 4
  floors) and Black's ('bw', the Gen 5 floors): their own sprite of the same class (public/overworld/,
  public/overworld/hgss/, public/overworld/dp/ and public/overworld/bw/), none for a class they don't have.

Their lines are Easy Chat phrases of 6 words, written out as Emerald writes them (ConvertEasyChatWordsToString with 3
columns and 2 rows: each row's words joined by spaces, a line break between the rows), its moves and Pokémon by name.

Usage: python frontier_trainers.py <pokeemerald checkout> (needs src/data/battle_frontier, src/data/easy_chat,
src/data/text, include/constants and src/battle_tower.c)."""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(REPO, 'packages', 'campaign', 'src', 'battle-tower-trainers.ts')
SPRITES = os.path.join(REPO, 'apps', 'web', 'public', 'overworld')

# Each facility class's name, as the trainer cards say (Emerald's, in its own case).
CLASS_NAMES = {
    'RUIN_MANIAC': 'Ruin Maniac', 'TUBER_M': 'Tuber', 'TUBER_F': 'Tuber', 'COOLTRAINER_M': 'Cooltrainer', 'COOLTRAINER_F': 'Cooltrainer',
    'RICH_BOY': 'Rich Boy', 'POKEMANIAC': 'PokéManiac', 'SWIMMER_M': 'Swimmer', 'SWIMMER_F': 'Swimmer', 'BLACK_BELT': 'Black Belt',
    'GUITARIST': 'Guitarist', 'KINDLER': 'Kindler', 'CAMPER': 'Camper', 'BUG_MANIAC': 'Bug Maniac', 'PSYCHIC_M': 'Psychic', 'PSYCHIC_F': 'Psychic',
    'GENTLEMAN': 'Gentleman', 'SCHOOL_KID_M': 'School Kid', 'SCHOOL_KID_F': 'School Kid', 'POKEFAN_M': 'Pokéfan', 'POKEFAN_F': 'Pokéfan',
    'EXPERT_M': 'Expert', 'EXPERT_F': 'Expert', 'YOUNGSTER': 'Youngster', 'FISHERMAN': 'Fisherman', 'CYCLING_TRIATHLETE_M': 'Triathlete',
    'CYCLING_TRIATHLETE_F': 'Triathlete', 'RUNNING_TRIATHLETE_M': 'Triathlete', 'RUNNING_TRIATHLETE_F': 'Triathlete', 'SWIMMING_TRIATHLETE_M': 'Triathlete',
    'SWIMMING_TRIATHLETE_F': 'Triathlete', 'DRAGON_TAMER': 'Dragon Tamer', 'BIRD_KEEPER': 'Bird Keeper', 'NINJA_BOY': 'Ninja Boy', 'SAILOR': 'Sailor',
    'COLLECTOR': 'Collector', 'PKMN_BREEDER_M': 'Pokémon Breeder', 'PKMN_BREEDER_F': 'Pokémon Breeder', 'PKMN_RANGER_M': 'Pokémon Ranger',
    'PKMN_RANGER_F': 'Pokémon Ranger', 'BUG_CATCHER': 'Bug Catcher', 'HIKER': 'Hiker', 'AROMA_LADY': 'Aroma Lady', 'HEX_MANIAC': 'Hex Maniac',
    'LADY': 'Lady', 'BEAUTY': 'Beauty', 'BATTLE_GIRL': 'Battle Girl', 'PARASOL_LADY': 'Parasol Lady', 'PICNICKER': 'Picnicker', 'LASS': 'Lass',
}
# Emerald's object graphics, by the names of our Emerald sprites (public/overworld/rse/).
RSE_FILES = {'MANIAC': 'maniac', 'CYCLING_TRIATHLETE_M': 'cyclist_m', 'CYCLING_TRIATHLETE_F': 'cyclist_f', 'RUNNING_TRIATHLETE_M': 'runner_m',
             'RUNNING_TRIATHLETE_F': 'runner_f'}
# FireRed's own sprite of each class it has (public/overworld/).
FRLG = {
    'YOUNGSTER': 'youngster', 'LASS': 'lass', 'HIKER': 'hiker', 'GENTLEMAN': 'gentleman', 'FISHERMAN': 'fisher', 'SAILOR': 'sailor',
    'COOLTRAINER_M': 'cooltrainer_m', 'COOLTRAINER_F': 'cooltrainer_f', 'BLACK_BELT': 'black_belt', 'BEAUTY': 'beauty', 'RICH_BOY': 'rich_boy',
    'PICNICKER': 'picnicker', 'CAMPER': 'camper', 'BUG_CATCHER': 'bug_catcher', 'POKEMANIAC': 'poke_maniac', 'SWIMMER_M': 'swimmer_m_land',
    'SWIMMER_F': 'swimmer_f_land',
}
# HeartGold/SoulSilver's own sprite of each class it has (public/overworld/hgss/).
HGSS = {
    'YOUNGSTER': 'youngster', 'LASS': 'lass', 'HIKER': 'hiker', 'GENTLEMAN': 'gentleman', 'FISHERMAN': 'fisher', 'SAILOR': 'sailor',
    'COOLTRAINER_M': 'cooltrainer_m', 'COOLTRAINER_F': 'cooltrainer_f', 'BLACK_BELT': 'black_belt', 'BEAUTY': 'beauty', 'RICH_BOY': 'rich_boy',
    'PICNICKER': 'picnicker', 'CAMPER': 'camper', 'BUG_CATCHER': 'bug_catcher', 'BIRD_KEEPER': 'bird_keeper', 'PSYCHIC_M': 'psychic',
    'SWIMMER_M': 'swimmer_m', 'SWIMMER_F': 'swimmer_f',
}
# Diamond's own sprite of each class it has (public/overworld/dp/: the Gen 4 floors), as its map events draw the class's
# trainers (Cooltrainers its Ace Trainers, Running Triathletes its Joggers); none for the swimmers (Diamond's are in the
# water), Kindlers, Bug and Hex Maniacs, PokéManiacs, Experts or Emerald's male Bird Keepers (Diamond's are women).
DP = {
    'YOUNGSTER': 'boy2', 'LASS': 'girl1', 'HIKER': 'mount', 'GENTLEMAN': 'gentleman', 'FISHERMAN': 'fishing', 'SAILOR': 'seaman',
    'COOLTRAINER_M': 'man3', 'COOLTRAINER_F': 'woman3', 'BLACK_BELT': 'fighter', 'BEAUTY': 'woman2', 'RICH_BOY': 'gorggeousm',
    'LADY': 'gorggeousw', 'PICNICKER': 'picnicgirl', 'CAMPER': 'campboy', 'BUG_CATCHER': 'boy3', 'PSYCHIC_M': 'mystery', 'PSYCHIC_F': 'mystery',
    'TUBER_M': 'beachboy', 'TUBER_F': 'beachgirl', 'RUIN_MANIAC': 'explore', 'AROMA_LADY': 'woman1', 'BATTLE_GIRL': 'girl2',
    'PARASOL_LADY': 'ambrella', 'POKEFAN_M': 'middleman1', 'POKEFAN_F': 'middlewoman1', 'PKMN_BREEDER_M': 'man1', 'PKMN_BREEDER_F': 'woman1',
    'PKMN_RANGER_M': 'man3', 'PKMN_RANGER_F': 'woman3', 'SCHOOL_KID_M': 'boy1', 'SCHOOL_KID_F': 'girl3', 'COLLECTOR': 'bigman',
    'DRAGON_TAMER': 'man3', 'GUITARIST': 'man2', 'NINJA_BOY': 'babyboy1', 'CYCLING_TRIATHLETE_M': 'cyclem', 'CYCLING_TRIATHLETE_F': 'cyclew',
    'RUNNING_TRIATHLETE_M': 'sportsman',
}
# Black's own sprite of each class it has (public/overworld/bw/: the Gen 5 floors), as its trainers of the class are drawn
# (tools/routes/bw/bw_sprites.py: Cooltrainers its Ace Trainers, Cycling Triathletes its Cyclists); none for the swimmers
# (Black's are in the water) or the classes Black hasn't.
BW = {
    'YOUNGSTER': 'youngster', 'LASS': 'lass', 'HIKER': 'hiker', 'GENTLEMAN': 'gentleman', 'FISHERMAN': 'fisherman',
    'COOLTRAINER_M': 'ace_trainer', 'COOLTRAINER_F': 'ace_trainer_f', 'BLACK_BELT': 'black_belt', 'BATTLE_GIRL': 'battle_girl',
    'RICH_BOY': 'rich_boy', 'LADY': 'lady', 'PARASOL_LADY': 'parasol_lady', 'POKEFAN_M': 'pokefan', 'POKEFAN_F': 'pokefan_f',
    'PKMN_BREEDER_M': 'pokemon_breeder', 'PKMN_BREEDER_F': 'pokemon_breeder_f', 'PKMN_RANGER_M': 'pokemon_ranger',
    'PKMN_RANGER_F': 'pokemon_ranger_f', 'SCHOOL_KID_M': 'school_kid', 'SCHOOL_KID_F': 'school_kid_f',
    'CYCLING_TRIATHLETE_M': 'cyclist', 'CYCLING_TRIATHLETE_F': 'cyclist_f',
}
FEMALE = {'TUBER_F', 'COOLTRAINER_F', 'SWIMMER_F', 'PSYCHIC_F', 'SCHOOL_KID_F', 'POKEFAN_F', 'EXPERT_F', 'CYCLING_TRIATHLETE_F', 'RUNNING_TRIATHLETE_F',
          'SWIMMING_TRIATHLETE_F', 'PKMN_BREEDER_F', 'PKMN_RANGER_F', 'AROMA_LADY', 'HEX_MANIAC', 'LADY', 'BEAUTY', 'BATTLE_GIRL', 'PARASOL_LADY',
          'PICNICKER', 'LASS'}


def game_text(s):
    """A string of the game's text (_("…")) as plain text."""
    return s.replace('{PKMN}', 'PKMN').replace('\\n', ' ')


def main():
    em = sys.argv[1]
    read = lambda p: open(os.path.join(em, p), encoding='utf-8').read()
    # The Easy Chat words: each group's texts by their constant (EC_WORD_…: [EC_INDEX(EC_WORD_X)] = { .text = gEasyChatWord_Y }).
    words = {}
    groups = os.path.join(em, 'src', 'data', 'easy_chat')
    for f in os.listdir(groups):
        s = open(os.path.join(groups, f), encoding='utf-8').read()
        texts = dict(re.findall(r'const u8 (gEasyChatWord_\w+)\[\] = _\("((?:[^"\\]|\\.)*)"\);', s))
        for word, var in re.findall(r'\[EC_INDEX\((EC_WORD_\w+)\)\]\s*=\s*\{\s*\.text = (gEasyChatWord_\w+)', s):
            words[word] = game_text(texts[var])
    moves = {k: game_text(v) for k, v in re.findall(r'\[MOVE_(\w+)\] = _\("((?:[^"\\]|\\.)*)"\)', read('src/data/text/move_names.h'))}
    species = {k: game_text(v) for k, v in re.findall(r'\[SPECIES_(\w+)\] = _\("((?:[^"\\]|\\.)*)"\)', read('src/data/text/species_names.h'))}

    def word(w):
        w = w.strip()
        if w == 'EC_EMPTY_WORD':
            return None
        m = re.fullmatch(r'EC_MOVE2?\((\w+)\)', w)
        if m:
            return moves[m.group(1)]
        m = re.fullmatch(r'EC_POKEMON(?:2|_NATIONAL)?\((\w+)\)', w)
        if m:
            return species[m.group(1)]
        return words[w]

    def phrase(ws):
        """6 words as Emerald writes them: 3 a row, each row's words joined by spaces, a line break between."""
        rows = []
        for r in (ws[:3], ws[3:]):
            rows.append(' '.join(t for t in map(word, r) if t))
        return '\n'.join(rows).strip()

    # Emerald's sprite for each class (battle_tower.c).
    bt = read('src/battle_tower.c')
    arr = lambda name: [x.strip() for x in bt[bt.index('{', bt.index(name)) + 1:bt.index('};', bt.index(name))].split(',') if x.strip()]
    rse = {}
    for classes, gfx in ((arr('gTowerMaleFacilityClasses['), arr('gTowerMaleTrainerGfxIds[')), (arr('gTowerFemaleFacilityClasses['), arr('gTowerFemaleTrainerGfxIds['))):
        for c, g in zip(classes, gfx):
            g = g.replace('OBJ_EVENT_GFX_', '')
            rse[c.replace('FACILITY_CLASS_', '')] = RSE_FILES.get(g, g.lower())

    src = read('src/data/battle_frontier/battle_frontier_trainers.h')
    out, missing = [], set()
    for block in re.findall(r'\[FRONTIER_TRAINER_\w+\] = \{(.*?)\n    \}', src, re.S):
        cls = re.search(r'FACILITY_CLASS_(\w+)', block).group(1)
        name = re.search(r'\.trainerName = _\("([^"]*)"\)', block).group(1)
        speech = {k: re.search(r'\.' + k + r' = \{([^}]*)\}', block).group(1).split(',') for k in ('speechBefore', 'speechWin', 'speechLose')}
        sprites = {}
        for kind, table, folder in (('frlg', FRLG, ''), ('hgss', HGSS, 'hgss/'), ('rse', rse, 'rse/'), ('dp', DP, 'dp/'), ('bw', BW, 'bw/')):
            file = table.get(cls)
            if file and os.path.exists(os.path.join(SPRITES, folder + file + '.png')):
                sprites[kind] = folder + file
            elif file:
                missing.add(f'{kind}: {folder}{file} ({cls})')
        if not sprites:
            continue
        out.append({'name': name.capitalize(), 'class': CLASS_NAMES[cls], 'female': cls in FEMALE, 'before': phrase(speech['speechBefore']),
                    'win': phrase(speech['speechWin']), 'lose': phrase(speech['speechLose']), 'sprites': sprites})

    q = lambda s: "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"
    lines = [HEAD]
    for t in out:
        sp = ', '.join(f'{k}: {q(v)}' for k, v in t['sprites'].items())
        lines.append(f"  {{ name: {q(t['name'])}, trainerClass: {q(t['class'])}, female: {str(t['female']).lower()}, before: {q(t['before'])}, win: {q(t['win'])}, lose: {q(t['lose'])}, sprites: {{ {sp} }} }},")
    lines.append('];\n')
    open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
    counts = {k: sum(1 for t in out if k in t['sprites']) for k in ('frlg', 'hgss', 'rse', 'dp', 'bw')}
    print('wrote', len(out), 'trainers to', OUT, counts)
    for m in sorted(missing):
        print('no sprite file:', m)


HEAD = """// The Battle Tower's trainers: Emerald's Battle Frontier trainers (pret/pokeemerald), each with their lines (before the
// battle, on winning it, on losing it: Easy Chat phrases, as Emerald writes them) and their overworld sprite in each run
// maps' sprite set where their class has one (only those with a sprite are kept). Written by
// tools/battle-tower/frontier_trainers.py.

/** A Battle Tower trainer: their name and class, their lines, and their sprite in each set that has their class. */
export interface TowerTrainer {
  name: string;
  trainerClass: string;
  female: boolean;
  /** What they say as the battle starts, on winning it (the player lost) and on losing it (the player won). */
  before: string;
  win: string;
  lose: string;
  /** Their overworld sprite (public/overworld/) in FireRed's set (the Gen 1 floors), HGSS's (Gen 2), Emerald's (Gen 3), Diamond's (Gen 4) and Black's (Gen 5). */
  sprites: Partial<Record<'frlg' | 'hgss' | 'rse' | 'dp' | 'bw', string>>;
}

export const TOWER_TRAINERS: TowerTrainer[] = ["""


if __name__ == '__main__':
    main()
