Things to consider in indexing so far:

- We might want to take into account punctuation
  - Consider that a sequence maybe wouldn't count if it's separated by a peroid, comma, or quote boundary
  - Similarly, poetry broken across a line

For each word, we have:

- List of possible lemmata
  - For each lemma, List of possible inflections
- The actual word itself
- Data about if it has an enclitic or not

For non-word data, we should mark:

- Commas
- Quotes
- Colons
- Semicolons
- Periods

So how can we represent this?

- Everything in the corpus has a single numeral ID.
- The ID scheme goes as follows:
  - Each word gets an ID and added to the indices
  - Each piece of punctuation gets an ID and added to the indices
  - Each space has its ID reserved, but are not added to the indices
    - As a corollolary, any gap in the IDs can be assumed a space.

Note this has the property that we can find matches across section breaks.
Though it also has the property that we could find erroneous matches

- For example, from Work A to work B
- For example, in header text

For the cases where we absolutely don't want to find a match, we can insert
a large gap before and after (say, increment 100 to the ID when going from a header
to regular text and vice versa, or when going across works).

Then, we also need to maintain a mapping from:

- ID to work and section
  - This can be done via ranges, we don't need to map every single ID

When we're presentin the final results, we would also want a way to get from an ID
to its position in the section. This feels tricky.

- Maybe since we already track the start of each section, we can use this to figure out
  how far in to the section a particular token is.

What are our indices?

- We want to be able to search by exact word, so we should have a map of exact match -> ID
- We want to be able to search by lemma, so we should have a map of lemma -> ID (note that each token could have multiple here!)

What about inflection data?

- Straw man solution: create separate indices per possibility:
  - For nominals:
    - Case, Number, (Gender?)
  - For verbs:
    - Person, number, mood, tense, voice
