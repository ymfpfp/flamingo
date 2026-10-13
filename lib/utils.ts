export const sortByAlphabetical = (a: string, b: string) => 
  a.localeCompare(b, undefined, {numeric: true});

