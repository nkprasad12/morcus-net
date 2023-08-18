export interface RawSense {
  bullet: string;
  text: string;
}

export interface ShSense extends RawSense {
  level: number;
}

export interface ShEntry {
  keys: string[];
  blurb: string;
  senses: ShSense[];
}
