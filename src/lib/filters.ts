export interface FilterState {
  search: string;
  genres: string[];
  eras: string[];
  moods: string[];
  origins: string[];
  favoriteOnly: boolean;
}

export const emptyFilters: FilterState = {
  search: "",
  genres: [],
  eras: [],
  moods: [],
  origins: [],
  favoriteOnly: false,
};

export function hasActiveFilters(f: FilterState): boolean {
  return (
    f.search.trim() !== "" ||
    f.genres.length > 0 ||
    f.eras.length > 0 ||
    f.moods.length > 0 ||
    f.origins.length > 0 ||
    f.favoriteOnly
  );
}
