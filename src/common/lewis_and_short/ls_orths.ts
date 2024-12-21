import { XmlNode } from "@/common/xml/xml_node";
import { assert, assertEqual, checkPresent } from "@/common/assert";
import { BREVES, MACRONS } from "@/common/character_utils";
import { arrayMap } from "@/common/data_structures/collect_map";

// const LOWER_CONSONANTS = "bcdfghjklmnpqrstvxz";
// const UPPER_CONSONANTS = "BCDFGHJKLMNPQRSTVXZ";
// const CONSONANTS = LOWER_CONSONANTS + UPPER_CONSONANTS;
const OTHER_ACCENTED = "áïìëèöüúùÿ";
const ALPHA_ACC = MACRONS + BREVES + OTHER_ACCENTED;
const LOWER_CASE = "abcdefghijklmnopqrstuvwxyz";
const UPPER_CASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHA_REG = LOWER_CASE + UPPER_CASE;
const BASE_CHARS = new Set(ALPHA_ACC + ALPHA_REG + " '");
const SPLITS = [", ", " (", "; "];

const ENDINGS_MAP = new Map<string[], string[]>([
  [
    ["-tius", "-tĭus"],
    ["cius", "cĭus"],
  ],
  [
    ["-os", "-ŏs"],
    // Heptăpўlos has "-os" listed as a variant for whatever reason
    ["us", "os"],
  ],
  [["-us"], ["os"]],
  [["-us"], ["is"]],
  [["-on"], ["um"]],
  [["-phus"], ["ptus"]],
  [["-cles"], ["clus"]],
  [["-vos"], ["vus"]],
  [["-nos"], ["nos"]],
  [["-cunque"], ["cumque"]],
  [["-cles"], ["clus"]],
  [["-tisco"], ["tesco"]],
  [["-vus"], ["vis"]],
  [["-porto"], ["pello"]],
  [["-tītĭus"], ["tīcĭus"]],
  [["-tĕra"], ["ter"]],
  [["-tes"], ["ta"]],
  [["-nĭus"], ["nēus"]],
  [["-es"], ["a"]],
  [["-a"], ["ē"]],
  [["-ē"], ["a"]],
  [["-clus"], ["cles"]],
  [["-gĕus"], ["gĕōs"]],
  [["-gўnē"], ["gўnus"]],
  [["-ia"], ["a"]],
  [["-vorto"], ["verto"]],
  [["-um"], ["us"]],
  [["-īa"], ["ēa"]],
  [["-us"], ["um"]],
  [["-īus"], ["ēus"]],
  [["-es"], ["is"]],
  [["-xis"], ["xĭa"]],
  [["-ĭlus"], ["ĕlus"]],
  [["-as"], ["es"]],
  [["-is"], ["es"]],
  [["-nascit"], ["nescit"]],
  [["-nesco"], ["nālis"]],
  [["-nĭtas"], ["nālis"]],
  [["-no"], ["nālis"]],
  [["-num"], ["nālis"]],
  [["-ilis"], ["alis"]],
  [["-īum"], ["ēum"]],
  [["-māni"], ["mānae"]],
  [["-mānes"], ["mānae"]],
  [["-quis"], ["quus"]],
  [["-lus"], ["las"]],
  [["-ienses"], ["enses"]],
  [["-iōnes"], ["enses"]],
  [["-la"], ["lē"]],
  [["-pho"], ["phōn"]],
  [["-phŏra"], ["phŏrŏs"]],
  [["-nĕae"], ["nae"]],
  [["-peia"], ["pēa"]],
  [["-channa"], ["chāna"]],
  [["-a"], ["us"]],
  [["-us"], ["ŏs"]],
  [["-ĭon"], ["ēum"]],
  [["-quīn"], ["qui"]],
  [["-pītes"], ["pītis"]],
  [["-mon"], ["mum"]],
  [["-spargo"], ["spergo"]],
  [["-on"], ["ŏs"]],
  [["-um"], ["on"]],
  [["-lacrŭmo"], ["lā^crĭmo"]],
  [["-ĭus"], ["ĕus"]],
  [["-ossiaeus"], ["ossēus"]],
  [["-lus"], ["lum"]],
  [["-pĕciscor"], ["păciscor"]],
  [["-ālĭter"], ["ālis"]],
  [["-sārĭo"], ["sarrĭo"]],
  [["-crus"], ["cer"]],
  [["-ĭlĭum"], ["illum"]],
  [["-vorro"], ["verro"]],
  [["-vortor"], ["vertor"]],
  [["-rus"], ["ros"]],
  [["-dron"], ["drum"]],
  [["-drus"], ["drum"]],
  [["-gum"], ["gon"]],
  [["-tus"], ["tŏs"]],
  [["-ĭon"], ["ĭum"]],
  [["-ēus"], ["īus"]],
  [["-da"], ["don"]],
  [["-cē"], ["ca"]],
  [["-ubius"], ["ŭvĭus"]],
  [["-versum"], ["vorsum"]],
  [["-ĭens"], ["ĭes"]],
  [["-fercio"], ["farcĭo"]],
  [["-tĭōsis"], ["tĭăsis"]],
  [["-monĭcus"], ["mŏnius"]],
  [["-īum"], ["īon"]],
  [["-ēa"], ["ĭa"]],
  [["-_ia"], ["ēa"]],
  [["-drus"], ["der"]],
  [["-nos"], ["nus"]],
  [["-dorso"], ["dorsŭo"]],
  [["-ĭnus"], ["ĭnum"]],
  [["-tră"], ["trā"]],
  [["-acius"], ["ācĕus"]],
  [["-ismum"], ["isma"]],
  [["-īnus"], ["ĭnus"]],
  [["-toĭcus"], ["tўĭcus"]],
  [["-bĭoe"], ["bĭi"]],
  [["-clĭus"], ["clēus"]],
  [["-ĭa"], ["ĕa"]],
  [["-ēa"], ["īa"]],
  [["-tēs"], ["ta"]],
  [["-mēa"], ["mīa"]],
  [["-ĭānus"], ["ĭădes"]],
  [["-ĭas"], ["ĭădes"]],
  [["-pĭum"], ["pīum"]],
  [["-ōrus"], ["or"]],
  [["-visco"], ["vesco"]],
  [["-cĭae"], ["tĭae"]],
  [["-go"], ["guo"]],
  [["-nīzo"], ["nisso"]],
  [["-tĭum"], ["tĭa"]],
  [["-tos"], ["tus"]],
  [["-ŏn"], ["um"]],
  [["-găno"], ["gănon"]],
  [["-găbo"], ["gănon"]],
  [["-găvo"], ["gănon"]],
  [["-ĭum"], ["ĭon"]],
  [["-dĕris"], ["dăris"]],
  [["-manni"], ["măni"]],
  [["-boccus"], ["bocchus"]],
  [["-cĭus"], ["cĕus"]],
  [["-ўis"], ["ys"]],
  [["-ĕa"], ["ĭa"]],
  [["-gĭens"], ["gĭes"]],
  [["-tĭens"], ["tĭes"]],
  [["-nunquam"], ["numquam"]],
  [["-ītĭus"], ["īcĭus"]],
  [["-tiens"], ["tĭes"]],
  [["-iens"], ["ĭes"]],
  [["-pos"], ["pus"]],
  [["-ērĭa"], ["ārĭa"]],
  [["-ōrĭa"], ["ārĭa"]],
  [["-cīdālis"], ["cīda"]],
  [["-dŏlisco"], ["dŏlesco"]],
  [["-lŭbet"], ["lĭbet"]],
  [["-um"], ["os"]],
  [["-to"], ["tē"]],
  [["-mum"], ["mon"]],
  [["-on"], ["os"]],
  [["-unguo"], ["ungo"]],
  [["-volgo"], ["vulgo"]],
  [["-vitrobŏlum"], ["vitrobŏlus"]],
  [["-ca"], ["cē"]],
  [["-mon"], ["mo"]],
  [["-ta"], ["tes"]],
  [["-moscis"], ["boscis"]],
  [["-muscis"], ["boscis"]],
  [["-cĭus"], ["tĭus"]],
  [["-ēum"], ["īum"]],
  [["-cunquē"], ["cumquē"]],
  [["-claudo"], ["clūdo"]],
  [["-vorsus"], ["versus"]],
  [["-sūchus"], ["sūchum"]],
  [["-īpho"], ["īfo"]],
  [["-ūros"], ["ūrus"]],
  [["-pto"], ["ptĭto"]],
  [["-on"], ["o"]],
  [["-īos"], ["īus"]],
  [["-ŏlo"], ["ŏlĕo"]],
  [["-ē"], ["ae"]],
  [["-ĕï"], ["eus"]],
  [["-ĕos"], ["eus"]],
  [["-tĭē"], ["cĭē"]],
  [["-a"], ["es"]],
  [["-trus"], ["trŏs"]],
  [["-pertītus"], ["partītus"]],
  [["-quomque"], ["cunque"]],
  [["-ĭens"], ["ies"]],
  [["-ēum"], ["īum"]],
]);
const STARTS_MAP = new Map<string[], string[]>([
  [["ădŏl-"], ["ădŭl"]],
  [["adc-"], ["acc"]],
  [["adf-"], ["aff"]],
  [["adl-"], ["all"]],
  [["ann-"], ["ān"]],
  [["adp-"], ["app"]],
  [["admixt-"], ["admist"]],
  [["admist-"], ["admixt"]],
  [["adn-"], ["agn"]],
  [["adn-"], ["ann"]],
  [["app-"], ["adp"]],
  [["advor-"], ["adver"]],
  [["esc-"], ["aesc"]],
  [["fēn-"], ["faen"]],
  [["foen-"], ["faen"]],
  [["frund-"], ["frond"]],
  [["Vulc-"], ["Volc"]],
  [["abjĭc-"], ["ăbĭc"]],
  [["hab-"], ["ab"]],
  [["adōl-"], ["ădūl"]],
  [["aedīlīt-"], ["aedīlīc"]],
  [["ăhēn-"], ["aēn"]],
  [["ăēn-"], ["ăēn"]],
  [["ăhēn-"], ["ăēn"]],
  [["Aequĭmēl-"], ["Aequĭmael"]],
  [["aequipĕr-"], ["aequĭpăr"]],
  [["aequiper-"], ["aequĭpăr"]],
  [["aequīper-"], ["aequĭpăr"]],
  [["aequĭpĕr-"], ["aequĭpăr"]],
  [["er-"], ["aer"]],
  [["aestŭ-"], ["aestĭ"]],
  [["adgn-"], ["agnosco"]],
  [["all-"], ["āl"]],
  [["hall-"], ["āl"]],
  [["Am-"], ["Amp"]],
  [["ămĭth-"], ["ămȳth"]],
  [["amfr-"], ["anfr"]],
  [["antĭp-"], ["antĕp"]],
  [["Apĭ-"], ["Appĭ"]],
  [["āpŭl-"], ["Appŭl"]],
  [["āpūl-"], ["Appūl"]],
  [["ăquill-"], ["ăquil"]],
  [["ăquil-"], ["ăquil"]],
  [["ălăb-"], ["ărăb"]],
  [["Arr-"], ["ā^r"]],
  [["adr-"], ["arr"]],
  [["arr-"], ["arr"]],
  [["arct-"], ["art"]],
  // [["ads-"], ["as"]],
  [["as-"], ["as"]],
  [["adsc-"], ["asc"]],
  [["asc-"], ["asc"]],
  [["asph-"], ["asp"]],
  [["adsp-"], ["asp"]],
  [["asp-"], ["asp"]],
  [["ads-"], ["ass"]],
  [["ass-"], ["ass"]],
  [["adst-"], ["ast"]],
  [["ăsum-"], ["ăsym"]],
  [["adt-"], ["att"]],
  [["att-"], ["adt"]],
  [["autōr-"], ["auctōr"]],
  [["authōr-"], ["auctōr"]],
  [["aut-"], ["auct"]],
  [["balist-"], ["ballist"]],
  [["Bumb-"], ["Bomb"]],
  [["cērĭ-"], ["caerĭ"]],
  [["kăl-"], ["căl"]],
  [["căpĕd-"], ["căpĭd"]],
  [["Karth-"], ["Carth"]],
  [["cassāb-"], ["cāsāb"]],
  [["caulāt-"], ["căvillāt"]],
  [["caen-"], ["cēn"]],
  [["coen-"], ["cēn"]],
  [["Cŏātr-"], ["Chŏātr"]],
  [["Cŏastr-"], ["Chŏātr"]],
  [["clŭp-"], ["clĭp"]],
  [["clўp-"], ["clĭp"]],
  [["cort-"], ["cŏhort"]],
  [["coll-"], ["cōl"]],
  [["conl-"], ["coll"]],
  [["conm-"], ["comm"]],
  [["conp-"], ["comp"]],
  [["conr-"], ["corr"]],
  [["cō^tīd-"], ["cottīd"]],
  [["quŏtīd-"], ["cottīd"]],
  [["crĕpic-"], ["crĕpĭt"]],
  [["cūl-"], ["cull"]],
  [["cōl-"], ["cull"]],
  [["cȳ^press-"], ["cū^press"]],
  [["defĕt-"], ["dēfăt"]],
  [["denec-"], ["dēnĭc"]],
  [["dīver-"], ["dēver"]],
  [["dīvert-"], ["dēvert"]],
  [["dēvort-"], ["dēvert"]],
  [["disr-"], ["dīr"]],
  [["dīj-"], ["disj"]],
  [["dors-"], ["doss"]],
  [["Dors-"], ["Doss"]],
  [["exf-"], ["eff"]],
  [["ecf-"], ["eff"]],
  // This only appears once, in `effreno`.
  // They have `ef-freno` and `ecfr-`.
  [["ecfr-"], ["effr"]],
  [["exlec-"], ["ēlĕc"]],
  [["exmov-"], ["ēmŏv"]],
  [["ĕnhar-"], ["ĕnar"]],
  [["epistol-"], ["ĕpistŭl"]],
  [["heri-"], ["ĕrĭ"]],
  [["exhulc-"], ["exulc"]],
  [["Fēs-"], ["Faes"]],
  [["Fācūt-"], ["Fāgūt"]],
  [["faet-"], ["fēt"]],
  [["foet-"], ["fēt"]],
  [["fontān-"], ["fontĭn"]],
  [["Gălēs-"], ["Gălaes"]],
  [["Gĕnŏs-"], ["Gĕnŭs"]],
  [["Cerm-"], ["Germ"]],
  [["glisso-"], ["glīso"]],
  [["glysso-"], ["glīso"]],
  [["glōm-"], ["glŏm"]],
  [["Cnĭd-"], ["Gnĭd"]],
  [["Gnoss-"], ["Gnōs"]],
  [["Cnoss-"], ["Gnōs"]],
  [["cōb-"], ["gōb"]],
  [["Cug-"], ["Gug"]],
  [["Gub-"], ["Gug"]],
  [["Adr-"], ["Hādr"]],
  [["ord-"], ["hord"]],
  [["fos-"], ["hos"]],
  [["idem-"], ["ĭden"]],
  [["illaev-"], ["illēv"]],
  [["inl-"], ["ill"]],
  [["inm-"], ["imm"]],
  [["inp-"], ["imp"]],
  [["impătĭb-"], ["impĕtĭb"]],
  [["infĭc-"], ["infăc"]],
  [["insăp-"], ["insĭp"]],
  [["jŭb-"], ["jūb"]],
  [["Cal-"], ["Kăl"]],
  [["lŭc-"], ["lō^c"]],
  [["Maltī-"], ["Malthī"]],
  [["mamm-"], ["măm"]],
  [["mănĭpr-"], ["mănŭpr"]],
  [["Mezzent-"], ["Mezent"]],
  [["Mesdent-"], ["Mezent"]],
  [["Messent-"], ["Mezent"]],
  [["Mēdient-"], ["Mezent"]],
  [["Mēdent-"], ["Mezent"]],
  [["moen-"], ["mūn"]],
  [["nav-"], ["nau"]],
  [["neclĕg-"], ["neglĕg"]],
  [["neglĭg-"], ["neglĕg"]],
  [["nĕgōc-"], ["nĕgōt"]],
  [["neofit-"], ["nĕŏphўt"]],
  [["nūmāt-"], ["nummāt"]],
  [["obrī-"], ["obrȳ"]],
  [["obscaen-"], ["obscēn"]],
  [["obscoen-"], ["obscēn"]],
  [["ops-"], ["obs"]],
  [["opst-"], ["obst"]],
  [["obc-"], ["occ"]],
  [["obqu-"], ["ocqu"]],
  [["oquin-"], ["ocquin"]],
  [["obf-"], ["off"]],
  [["poen-"], ["paen"]],
  [["Pāl-"], ["Păl"]],
  [["Pall-"], ["Păl"]],
  [["pinn-"], ["penn"]],
  [["făsēl-"], ["phăsēl"]],
  [["făcēl-"], ["phăsēl"]],
  [["phăsell-"], ["phăsēl"]],
  [["făs-"], ["phăs"]],
  [["phrĕnīt-"], ["phrĕnēt"]],
  [["pinno-"], ["pīnŏ"]],
  [["praesēp-"], ["praesaep"]],
  [["rōd-"], ["raud"]],
  [["rūd-"], ["raud"]],
  [["Rhēg-"], ["Rēg"]],
  [["rellig-"], ["rĕlĭg"]],
  [["rellĭqu-"], ["rē^lĭqu"]],
  [["rell-"], ["rĕl"]],
  [["sătўrŏgr-"], ["sătĭrŏgr"]],
  [["sirp-"], ["scirp"]],
  [["surp-"], ["scirp"]],
  [["sēmerm-"], ["sēmĭerm"]],
  [["serpull-"], ["serpill"]],
  [["sexc-"], ["sesc"]],
  [["sylv-"], ["silv"]],
  [["zmăr-"], ["smăr"]],
  [["Zmin-"], ["Smin"]],
  [["zmyr-"], ["smyr"]],
  [["sollenn-"], ["sollemn"]],
  [["solenn-"], ["sollemn"]],
  [["solemn-"], ["sollemn"]],
  [["Sott-"], ["Sot"]],
  [["spĭcŭl-"], ["spĕcŭl"]],
  [["stercŭl-"], ["sterquĭl"]],
  [["stercĭl-"], ["sterquĭl"]],
  [["stilĭcĭd-"], ["stillĭcĭd"]],
  [["subc-"], ["succ"]],
  [["subf-"], ["suff"]],
  [["suffraen-"], ["suffrēn"]],
  [["sŭper dēl-"], ["sŭperdēl"]],
  [["suspit-"], ["suspīc"]],
  [["Terr-"], ["Tarr"]],
  [["tresd-"], ["trĕd"]],
  [["hū-"], ["ū"]],
  [["vaen-"], ["vēn"]],
  [["vītĕc-"], ["vītĭc"]],
  [["vī^trār-"], ["vī^trĕār"]],
]);

export function extractFromOrth(orth: XmlNode): string {
  assertEqual(orth.name, "orth");
  if (typeof orth.children[0] === "string") {
    return XmlNode.getSoleText(orth);
  }
  const reg = XmlNode.assertIsNode(orth.children[0], "reg");
  const corr = XmlNode.assertIsNode(reg.children[1], "corr");
  return XmlNode.getSoleText(corr);
}

/**
 * Returns the raw orths for this node.
 *
 * Searches only direct children - does not search recursively.
 */
export function rawOrths(root: XmlNode, isRoot: boolean = true): string[] {
  const orths: string[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      continue;
    }
    if (child.name === "etym" && isRoot) {
      orths.push(...rawOrths(child, false));
    }
    if (child.name === "orth") {
      orths.push(extractFromOrth(child));
    }
  }
  return orths;
}

/**
 * Returns the derived orths for a root node.
 *
 * Orths under the root id are ignored, as these are handled separately.
 *
 * @argument root the root node to search from.
 *
 * @returns the results sorted by the node id in which they are contained, e.g.
 * ```
 * [ [firstId, orth1], [firstId, orth2], [secondId, orth3] ]
 * ```
 */
export function derivedOrths(root: XmlNode): [string, string[]][] {
  const id = checkPresent(root.getAttr("id"));
  const derived = derivedRawOrthsHelper(root, id, id);
  const bySense = arrayMap<string, string>();
  derived.forEach(([id, orth]) => bySense.add(id, orth));
  return Array.from(bySense.map.entries()).map(([id, orths]) => [
    id,
    Array.from(
      new Set(
        regularizeOrths(cleanOrths(orths))
          .filter(isRegularOrth)
          .map(removeStackedVowelMarkers)
      )
    ),
  ]);
}

function derivedRawOrthsHelper(
  root: XmlNode,
  rootId: string,
  lastId: string
): [string, string][] {
  const orths: [string, string][] = [];
  const id = root.getAttr("id") ?? lastId;
  for (const child of root.children) {
    if (typeof child === "string") {
      continue;
    }
    // If we have a non-orth, continue the recursive search.
    if (child.name !== "orth") {
      orths.push(...derivedRawOrthsHelper(child, rootId, id));
      continue;
    }
    // Don't add orths that are under the root id, as these are handled separately.
    if (id !== rootId) {
      orths.push([checkPresent(id), extractFromOrth(child)]);
    }
  }
  return orths;
}

function nonAlphabetics(text: string): [string, number][] {
  const result: [string, number][] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!BASE_CHARS.has(c)) {
      result.push([c, i]);
    }
  }
  return result;
}

export function isRegularOrth(orth: string): boolean {
  const nonAlphas = nonAlphabetics(orth);
  for (const [c, i] of nonAlphas) {
    if (c === "^") {
      continue;
    }
    if (c === "_") {
      continue;
    }
    if (c === "-" && i > 0 && i < orth.length - 1) {
      continue;
    }
    if (["!", "?"].includes(c) && i === orth.length - 1) {
      continue;
    }
    return false;
  }
  return true;
}

function splitOrth(orth: string): string[] {
  let results: string[] = [orth];
  for (const splitter of SPLITS) {
    results = results.flatMap((token) => token.split(splitter));
  }
  return results;
}

function removeHapaxMark(orth: string): string {
  if (orth.startsWith("† ")) {
    return orth.substring(2);
  }
  return orth;
}

function replaceWeirds(orth: string): string {
  // TODO: We have at least one instance `hălĭÆĕtos` where Ae occurs
  // in the middle of a word. We should probably normalize this.
  return (
    orth
      .replaceAll("œ", "ae")
      .replaceAll("Æ", "Ae")
      .replaceAll("o︤︥y", "oy")
      .replaceAll("u͡s", "us")
      .replaceAll(" -", "-")
      // This causes problems with Autocomplete for reasons I don't understand.
      .replaceAll("ў", "y")
      .replaceAll("af-f", "aff")
  );
}

function removeInternalDashes(orth: string): string {
  let result = "";
  for (let i = 0; i < orth.length; i++) {
    if (orth[i] === "-" && i !== 0 && i !== orth.length - 1) {
      continue;
    }
    result += orth[i];
  }
  return result;
}

function removeTrailingPunctuation(orth: string): string {
  if (orth.endsWith("?") || orth.endsWith("!")) {
    return orth.substring(0, orth.length - 1);
  }
  return orth;
}

export function removeStackedVowelMarkers(orth: string): string {
  let result = "";
  for (const c of orth) {
    if (c === "^" || c === "_") {
      continue;
    }
    result += c;
  }
  return result;
}

export function cleanOrths(orths: string[]): string[] {
  return orths
    .flatMap(splitOrth)
    .map(removeHapaxMark)
    .map(replaceWeirds)
    .map(removeTrailingPunctuation)
    .map(removeInternalDashes);
}

export interface OrthResult {
  orth: string;
  isRegular: boolean;
}

function any(input: boolean[]) {
  for (const item of input) {
    if (item) {
      return true;
    }
  }
  return false;
}

function lastOrthWithEndings(
  orths: string[],
  endings: string[]
): string | undefined {
  const result = orths.filter((orth) =>
    any(endings.map((ending) => orth.endsWith(ending) && !orth.startsWith("-")))
  );
  if (result.length === 0) {
    return undefined;
  }
  return result[result.length - 1];
}

function lastOrthWithStarts(
  orths: string[],
  starts: string[]
): string | undefined {
  const result = orths.filter((orth) =>
    any(starts.map((start) => orth.startsWith(start)))
  );
  if (result.length === 0) {
    return undefined;
  }
  return result[result.length - 1];
}

export function attachAltEnd(prevOrths: string[], altEnd: string): string {
  assert(altEnd.startsWith("-"));
  const possibleResults: [string, number][] = [];
  for (const [key, endingsList] of ENDINGS_MAP.entries()) {
    if (!key.includes(altEnd)) {
      continue;
    }
    const base = lastOrthWithEndings(prevOrths, endingsList);
    if (base === undefined) {
      continue;
    }
    const baseIndex = prevOrths.indexOf(base);
    const variant =
      base.substring(0, base.length - endingsList[0].length) +
      altEnd.substring(1);
    possibleResults.push([variant, baseIndex]);
  }
  if (possibleResults.length === 0) {
    return altEnd;
  }
  if (possibleResults.length === 1) {
    return possibleResults[0][0];
  }
  possibleResults.sort((a, b) => b[1] - a[1]);
  if (possibleResults.length !== 1) {
    console.debug(
      `orths: ${JSON.stringify(
        prevOrths
      )}; end: ${altEnd}; possibleResults: ${JSON.stringify([
        ...possibleResults.values(),
      ])}`
    );
  }
  return possibleResults[0][0];
}

export function attachAltStart(prevOrths: string[], altStart: string): string {
  assert(altStart.endsWith("-"));
  const possibleResults: string[] = [];
  for (const [key, startsList] of STARTS_MAP.entries()) {
    if (!key.includes(altStart)) {
      continue;
    }
    const base = lastOrthWithStarts(prevOrths, startsList);
    if (base === undefined) {
      continue;
    }
    possibleResults.push(
      altStart.substring(0, altStart.length - 1) +
        base.substring(startsList[0].length)
    );
  }
  if (possibleResults.length === 0) {
    return altStart;
  }
  assert(
    possibleResults.length === 1,
    `orths: ${prevOrths}; end: ${altStart}; possibleResults: ${possibleResults}`
  );
  return possibleResults[0];
}

export function regularizeOrths(inputOrths: string[]): string[] {
  if (inputOrths.length === 0) {
    return [];
  }
  const orths = inputOrths.map((orth) => orth);
  const regulars = orths.map(isRegularOrth);
  const allNonAlphas = orths.map(nonAlphabetics);
  for (let i = 1; i < orths.length; i++) {
    if (regulars[i]) {
      continue;
    }
    if (!regulars[0]) {
      continue;
    }

    const nonAlphas = allNonAlphas[i];
    let updated = orths[i];
    if (nonAlphas[0][0] === "-" && nonAlphas[0][1] === 0) {
      updated = attachAltEnd(orths.slice(0, i), updated);
    }
    const last = nonAlphas.length - 1;
    if (
      nonAlphas[last][0] === "-" &&
      nonAlphas[last][1] === orths[i].length - 1
    ) {
      updated = attachAltStart(orths.slice(0, i), updated);
    }
    orths[i] = updated;
  }
  return orths;
}

export function getOrths(root: XmlNode): string[] {
  const orths = regularizeOrths(cleanOrths(rawOrths(root)));
  return [...new Set(orths)];
}

export function displayTextForOrth(orth: string) {
  return orth.replaceAll("^", "\u0306").replaceAll("_", "\u0304");
}
