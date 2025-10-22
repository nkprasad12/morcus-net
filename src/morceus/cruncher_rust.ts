/**
 * A analyzer implemented in Rust.
 * This is a wrapper around the Rust implementation that allows it to be used in JavaScript.
 *
 * Build the Rust bindings with:
 * `npm run setup-node-bindgen`.
 *
 * The rust code is located in `src/corpus-rust/`.
 */
export class CruncherRust {
  private readonly cruncher: any;

  constructor(indexPath: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rust_binding = require(`${process.cwd()}/build/corpus-rust-bindings`);
      this.cruncher = new rust_binding.Cruncher(indexPath);
    } catch (error) {
      throw "Missing Rust morceus bindings. Run `npm run setup-node-bindgen`.";
    }
  }

  crunchWord(word: string): string {
    return this.cruncher.crunch(word);
  }
}
