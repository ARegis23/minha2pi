export interface Nutrients {
  [key: string]: number;
}

export interface Food {
  name_pt: string;
  name_search: string;
  nutrientsPer100g: Nutrients;
}
