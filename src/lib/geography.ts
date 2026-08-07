/**
 * Repères géographiques des marchés desservis.
 *
 * Trois écrans centraient leur carte par une cascade de conditions testant
 * « Sénégal » puis « Kenya », tout le reste retombant sur des coordonnées du
 * Bénin. Une flotte ivoirienne ouvrait donc sa carte à un millier de kilomètres
 * à l'est d'Abidjan, et un transporteur burkinabè ou malien aurait eu la même
 * surprise. Le défaut n'était pas la valeur de repli, c'était qu'ajouter un
 * pays supposait de retrouver et modifier trois cascades identiques.
 *
 * Le point retenu par pays n'est pas le centroïde administratif mais le milieu
 * du corridor de fret : c'est ce qu'un régulateur veut voir à l'ouverture, avec
 * le port à une extrémité et la frontière à l'autre.
 */

export interface MapAnchor {
  lat: number;
  lng: number;
  /** Niveau de zoom couvrant le corridor principal du pays. */
  zoom: number;
}

/**
 * Repères par pays.
 *
 * Les clés sont écrites sans accents ni casse par `normalizeCountry`, si bien
 * que « Côte d'Ivoire », « Cote d'Ivoire » et « COTE D IVOIRE » tombent sur la
 * même entrée. Une organisation saisit son pays à la main : l'orthographe ne
 * doit pas décider de ce qu'elle voit.
 */
const ANCHORS: Record<string, MapAnchor> = {
  // Corridor Abidjan — Yamoussoukro — Bouaké — Ouangolodougou.
  "cote d'ivoire": { lat: 7.2, lng: -5.1, zoom: 7 },
  benin: { lat: 7.9124, lng: 2.1092, zoom: 7 },
  senegal: { lat: 14.6928, lng: -17.4467, zoom: 8 },
  kenya: { lat: -1.2921, lng: 36.8219, zoom: 7 },
  'burkina faso': { lat: 12.2383, lng: -1.5616, zoom: 7 },
  mali: { lat: 13.5, lng: -7.5, zoom: 6 },
  togo: { lat: 8.6195, lng: 0.8248, zoom: 7 },
  niger: { lat: 13.5137, lng: 2.1098, zoom: 7 },
  ghana: { lat: 7.9465, lng: -1.0232, zoom: 7 },
  nigeria: { lat: 9.082, lng: 8.6753, zoom: 6 },
  cameroun: { lat: 4.0511, lng: 9.7679, zoom: 7 },
};

/**
 * Repli : centre de l'Afrique de l'Ouest.
 *
 * Choisi pour être visiblement générique. Un repli déguisé en pays précis —
 * l'ancien, qui centrait sur le Bénin — laisse croire à une erreur de données
 * plutôt qu'à un pays non encore référencé.
 */
const DEFAULT_ANCHOR: MapAnchor = { lat: 9.5, lng: -2.0, zoom: 5 };

function normalizeCountry(country: string): string {
  return (
    country
      .normalize('NFD')
      // Retire les diacritiques décomposés par NFD : « Côte » devient « Cote ».
      .replace(/[̀-ͯ]/g, '')
      // Apostrophe typographique et droite se valent : « Côte d’Ivoire » saisi
      // depuis un traitement de texte ne doit pas manquer la correspondance.
      .replace(/[’']/g, "'")
      .trim()
      .toLowerCase()
  );
}

/** Point de centrage de la carte pour un pays donné. */
export function mapAnchorFor(country: string | undefined): MapAnchor {
  if (!country) return DEFAULT_ANCHOR;
  return ANCHORS[normalizeCountry(country)] ?? DEFAULT_ANCHOR;
}

/** `true` si le pays dispose d'un repère propre — utile pour le signaler à l'écran. */
export function hasMapAnchor(country: string | undefined): boolean {
  return Boolean(country && ANCHORS[normalizeCountry(country)]);
}
