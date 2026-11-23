// Shared library assets, relative to ViewerOptions.libraryUrl. The house itself comes from ViewerOptions.houseUrl.
export interface Source { name: string; type: 'texture' | 'model' | 'json'; path: string; srgb?: boolean; equirect?: boolean }
export default function sources(houseUrl: string, lib: string): Source[] {
  return [
    { name: 'house', type: 'json', path: houseUrl },
    { name: 'oakDiff', type: 'texture', path: lib + 'tex/oak_veneer_01_diff.webp', srgb: true },
    { name: 'oakRough', type: 'texture', path: lib + 'tex/oak_veneer_01_rough.webp' },
    { name: 'oakNor', type: 'texture', path: lib + 'tex/oak_veneer_01_nor.webp' },
    { name: 'walnutDiff', type: 'texture', path: lib + 'tex/american_walnut_veneer_diff.webp', srgb: true },
    { name: 'walnutRough', type: 'texture', path: lib + 'tex/american_walnut_veneer_rough.webp' },
    { name: 'walnutNor', type: 'texture', path: lib + 'tex/american_walnut_veneer_nor.webp' },
    { name: 'rugDiff', type: 'texture', path: lib + 'tex/poly_wool_herringbone_diff.webp', srgb: true },
    { name: 'rugNor', type: 'texture', path: lib + 'tex/poly_wool_herringbone_nor.webp' },
    { name: 'linenNor', type: 'texture', path: lib + 'tex/rough_linen_nor.webp' },
    { name: 'plasterNor', type: 'texture', path: lib + 'tex/white_plaster_02_nor.webp' },
    { name: 'sky', type: 'texture', path: lib + 'hdri/suburban_garden_2k.jpg', srgb: true, equirect: true },
    { name: 'sofa', type: 'model', path: lib + 'models/m_sofa.b64.json' },
    { name: 'armchair', type: 'model', path: lib + 'models/m_armchair.b64.json' },
    { name: 'coffeeTable', type: 'model', path: lib + 'models/m_coffee_table.b64.json' },
    { name: 'nestingTable', type: 'model', path: lib + 'models/m_nesting_table.b64.json' },
    { name: 'roundTable', type: 'model', path: lib + 'models/m_round_table.b64.json' },
    { name: 'island', type: 'model', path: lib + 'models/m_island.b64.json' },
    { name: 'diningChair', type: 'model', path: lib + 'models/m_dining_chair.b64.json' },
    { name: 'oliveTree', type: 'model', path: lib + 'models/m_olive_tree.b64.json' },
    { name: 'bedDouble', type: 'model', path: lib + 'models/m_bed_double.b64.json' },
    { name: 'bedSingle', type: 'model', path: lib + 'models/m_bed_single.b64.json' },
    { name: 'nightstand', type: 'model', path: lib + 'models/m_nightstand.b64.json' },
    { name: 'toilet', type: 'model', path: lib + 'models/m_toilet.b64.json' },
    { name: 'bathtub', type: 'model', path: lib + 'models/m_bathtub.b64.json' },
    { name: 'vanity', type: 'model', path: lib + 'models/m_vanity.b64.json' },
    { name: 'desk', type: 'model', path: lib + 'models/m_desk.b64.json' },
    { name: 'deskChair', type: 'model', path: lib + 'models/m_desk_chair.b64.json' },
    { name: 'succulent', type: 'model', path: lib + 'models/potted_plant_04.b64.json' },
    { name: 'vase', type: 'model', path: lib + 'models/ceramic_vase_01.b64.json' },
  ]
}

/** Loaded only for a house that has surroundings (house.site): neighbouring houses, trees, cars, street lamps. */
export function siteSources(lib: string): Source[] {
  const m = (name: string, file: string): Source => ({ name, type: 'model', path: lib + 'models/' + file + '.b64.json' })
  return [m('nbHouseA', 'nb_house_a'), m('nbHouseB', 'nb_house_b'), m('nbHouseC', 'nb_house_c'), m('nbTreeOlive', 'nb_tree_olive'), m('nbTreeFicus', 'nb_tree_ficus'),
    m('nbTreeCypress', 'nb_tree_cypress'), m('nbCarSuv', 'nb_car_suv'), m('nbCarSedan', 'nb_car_sedan'), m('nbLamp', 'nb_lamp')]
}
