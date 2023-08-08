export const CORRECTIONS = new Map<string, string>([
  [`<i>affable</i>:`, `<b>affable</b>:`],
  [`beside (<i>prep.</i>):`, `<b>beside</b> (<i>prep.</i>):`],
  [
    `bibliopolist[**"li" unclear]: biblĭŏpōla: Plin.:`,
    `<b>bibliopolist</b>: biblĭŏpōla: Plin.:`,
  ],
  [
    `bigness: v. <f>BULK</f>, <f>SIZE</f>.`,
    `<b>bigness</b>: v. <f>BULK</f>, <f>SIZE</f>.`,
  ],
  [`<i>cricket</i>:`, `<b>cricket</b>:`],
  [
    `<i>crier</i>: praeco, ōnis, <i>m.</i> (the most gen.`,
    `<b>crier</b>: praeco, ōnis, <i>m.</i> (the most gen.`,
  ],
  [`<i>darkish</i>:`, `<b>darkish</b>:`],
  [
    `<i>defloration</i>: stuprum: v. <f>DEBAUCHERY</f>,`,
    `<b>defloration</b>: stuprum: v. <f>DEBAUCHERY</f>,`,
  ],
  [`<f>earnestness</f>:`, `<b>earnestness</b>:`],
  [
    `<i>foot-soldier</i>: pĕdes, ĭtis, c.: Caes.:`,
    `<b>foot-soldier</b>: pĕdes, ĭtis, c.: Caes.:`,
  ],
  [
    `<f>foreman</f>: i. e., <i>manager, overseer</i>:`,
    `<b>foreman</b>: i. e., <i>manager, overseer</i>:`,
  ],
  [
    `<i>instill</i>: instillo, 1 (with <i>acc.</i> and`,
    `<b>instill</b>: instillo, 1 (with <i>acc.</i> and`,
  ],
  [
    `<i>parallelism</i>: v. <f>PARALLEL</f> (<i>adj.</i>).`,
    `<b>parallelism</b>: v. <f>PARALLEL</f> (<i>adj.</i>).`,
  ],
  [`remittance: pecunia may be used`, `<b>remittance</b>: pecunia may be used`],
  [
    `<i>snaffle</i> (<i>v.</i>): v. <f>TO BIT</f>, <f>BRIDLE</f>.`,
    `<b>snaffle</b> (<i>v.</i>): v. <f>TO BIT</f>, <f>BRIDLE</f>.`,
  ],
  [
    `thrum (<i>subs.</i>): līcium: <i>to add t.s to`,
    `<b>thrum</b> (<i>subs.</i>): līcium: <i>to add t.s to`,
  ],
  [
    "<b>uncouple (<f>animals</f>), to</b>: disjungo,",
    "<b>uncouple (animals), to</b>: disjungo,",
  ],
]);

export const DASH_EDGE_CASES = new Map<string, string>([
  [`----, <b>to become</b>:`, `<b>illustrious</b>, <b>to become</b>:`],
  [`----, <b>to make</b>:`, `<b>illustrious</b>, <b>to make</b>:`],
  [
    `---- <b>between</b>: d[=i]j[=u]d[)i]co, 1: Cic.`,
    `<b>judge between</b>: d[=i]j[=u]d[)i]co, 1: Cic.`,
  ],
  [
    `---- <b>away</b>: v. <f>TO KEEP OFF</f>.`,
    `<b>keep away</b>: v. <f>TO KEEP OFF</f>.`,
  ],
  [`---- <b>back</b>:`, `<b>keep back</b>:`],
  [
    `---- <b>company</b>: congr[)e]go, 1 (with`,
    `<b>keep company</b>: congr[)e]go, 1 (with`,
  ],
  [
    `---- <b>down</b>: repr[)i]mo, compr[)i]mo: v.`,
    `<b>keep down</b>: repr[)i]mo, compr[)i]mo: v.`,
  ],
  [
    `---- <b>in</b>: v. <f>TO CONFINE</f>.`,
    `<b>keep in</b>: v. <f>TO CONFINE</f>.`,
  ],
  [`---- <b>off</b>:`, `<b>keep off</b>:`],
  [
    `---- <b>together</b>: cont[)i]neo, 2: Cic.:`,
    `<b>keep together</b>: cont[)i]neo, 2: Cic.:`,
  ],
  [`---- <b>up</b>:`, `<b>keep up</b>:`],
  [
    `<b>----wort</b>: *nūmŭlāria: Withering.`,
    `<b>---- wort</b>: *nūmŭlāria: Withering.`,
  ],
  ["Respecting the Latin conjunctions", "U. Respecting the Latin conjunctions"],
]);

export const IGNORE_EMPTY_LINE_AFTER = new Set<string>([
  "I. <i>Orderly disposition</i>:",
]);
