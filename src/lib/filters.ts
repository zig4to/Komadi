export interface FilterState {
  search: string;
  genres: string[];
  eras: string[];
  difficulty: string;
  status: string;
  favoriteOnly: boolean;
}

export const emptyFilters: FilterState = {
  search: "",
  genres: [],
  eras: [],
  difficulty: "",
  status: "",
  favoriteOnly: false,
};

export function hasActiveFilters(f: FilterState): boolean {
  return (
    f.search.trim() !== "" ||
    f.genres.length > 0 ||
    f.eras.length > 0 ||
    f.difficulty !== "" ||
    f.status !== "" ||
    f.favoriteOnly
  );
}
