/** Tags a query actually searches *for* - lowercased, `~` (or) prefix stripped. Excluded tags
 *  (`-tag`, or anything inside a `-( ... )` group) and metatags (`foo:bar`) are dropped. */
export function queryTerms(query: string): string[] {
  const out: string[] = [];
  const groups: boolean[] = []; // open groups: is each one (or an enclosing one) excluded?
  for (const token of query.trim().toLowerCase().split(/\s+/)) {
    const excluded = token.startsWith("-") || (groups[groups.length - 1] ?? false);
    const term = token.replace(/^[-~]+/, "");
    if (term === "(") groups.push(excluded);
    else if (term === ")") groups.pop();
    else if (term && !excluded && !term.includes(":")) out.push(term);
  }
  return out;
}
