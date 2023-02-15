export class Section {
  constructor(readonly passage: string, readonly num: number) {}

  toString(): string {
    return `${this.num}: ${this.passage}`;
  }
}

export class Chapter {
  constructor(readonly sections: Section[], readonly num: number) {}

  toString(): string {
    const results = [];
    results.push(`Chapter ${this.num}`);
    for (const section of this.sections) {
      results.push(`  ${section}`);
    }
    return results.join("\n");
  }
}

export class Book {
  constructor(readonly chapters: Chapter[], readonly num: number) {}

  toString(): string {
    const results = [];
    results.push("======");
    results.push(`Book ${this.num}`);
    results.push("======");
    for (const chapter of this.chapters) {
      results.push(`${chapter}\n`);
    }
    return results.join("\n");
  }
}

export class FullText {
  constructor(readonly books: Book[]) {}

  toString(): string {
    return this.books.map((book) => book.toString()).join("\n\n");
  }
}
