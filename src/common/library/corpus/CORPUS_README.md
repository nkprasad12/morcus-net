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

If we have N tokens, and p% are true then:

- Size of full member list is N _ p _ log N bits
- Size of member mask is N bits

Thus, N < N _ p _ log N
or 1 / p < log N
or N > 2^-p

How big is run length encoding?

If we assume a sparshish index, we have K << N:

- For the number of runs, we have the worst case
  - The 1s never cluster, maximizing the number of runs.
  - This gives K runs of 1s (of length 1) and K + 1 runs of 0s (of variable length)
- In the worst case, we have to assume that we can have run lengths:
  - Of length K for 1s
  - Of length N-K for 0s
- So then we can have a format where:
  - we have a header that tells us K
    - We assume we already have N separately.
    - This is log N bits
  - We then have alternative sequences of `bit` and `runLength`
    - runLength is variable length encoded based on the bit.
    - Then we have:
      - Total number of runs: 2K + 1
      - encoding for 1s is K log K bits
      - encoding for 0s is K log N-K bits
    - Total: 1 + K (log K + log N-K + 2)
- How does this compare with N?

  - Consdider p = the frequency of K, and drop the 1
  - Then: N _ p (log N _ p + log (N - Np) + 2)
    - Note N - Np = N (1 - p)
  - Then: Np (log N + log p + log N + log (1 - p) + 2)
    - Or Np (2 log N + log p + log(1 - p) + 2)
    - Note that log p + log (1 - p) has a maximum value when p = 0.5 (of approx -0.602)
      - However, we are only handle sparse arrays here. We know p is smaller than that.
      - For this dataset, p will be chosen as as small as the case such that log p + log 1-p is
        approx -1.4
    - This means the total bits will at most Np (2 log N + 1.4)
      - Then, compared with the comparison of a bit mask of length N:
      - Np (2 log N + 1.4) < N
      - p < 1 / (2 log N + 1.4)

- Query language!
  - Things we want to support:
    - Search by:
      - Exact match
      - Lemma
      - Inflection category
      - Punctuation
        - Section / Line Break
        - Question Mark
        - Comma or Semicolon
        - Period or Exclamation
        - Quotes
    - Proximity
      - Configurable
    - Compositions
      - And
      - Or
      - Not
    - Filters
      - Work
      - Author
      - Time period
    - Configurations
      - Context size
      - Page size

Configurations can be settings in the UI and don't need to be part of the query syntax.

Exact match can be without anything - just the bare string.

Everything else must have @ as a prefix.

- @lemma:whatever
- @case:whatever
  - @gender
  - @tense
  - @mood
  - @person
  - @number
  - @voice
  - @degree
- @exact:whatever (for completeness)
- @punct

- @author
- @work

#and
#or
#not

Groupings (for convenience):

- [ ]
- { }
- ( )
