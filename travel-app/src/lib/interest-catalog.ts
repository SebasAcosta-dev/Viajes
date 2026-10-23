export const interestCategories = [
  {
    name: "Cultura e historia",
    options: [
      "Historia",
      "Monumentos",
      "Patrimonio cultural",
      "Tradiciones locales",
      "Arqueología",
      "Historia antigua",
      "Historia medieval",
      "Historia moderna",
      "Visitas guiadas",
      "Barrios históricos",
    ],
  },
  {
    name: "Religión y patrimonio religioso",
    options: [
      "Iglesias",
      "Catedrales",
      "Mezquitas",
      "Sinagogas",
      "Templos",
      "Monasterios",
      "Rutas religiosas",
      "Arquitectura religiosa",
      "Lugares de peregrinación",
    ],
  },
  {
    name: "Museos y arte",
    options: [
      "Museos de historia",
      "Museos de arte",
      "Museos arqueológicos",
      "Museos científicos",
      "Arte contemporáneo",
      "Pintura",
      "Escultura",
      "Fotografía",
      "Galerías de arte",
      "Exposiciones temporales",
      "Artesanía tradicional",
    ],
  },
  {
    name: "Deportes",
    options: [
      "Fútbol",
      "Baloncesto",
      "Tenis",
      "Fórmula 1",
      "Automovilismo",
      "Ciclismo",
      "Atletismo",
      "Estadios deportivos",
      "Museos deportivos",
      "Eventos deportivos",
      "Senderismo",
    ],
  },
  {
    name: "Naturaleza y actividades al aire libre",
    options: [
      "Parques y jardines",
      "Montaña",
      "Senderismo",
      "Playas",
      "Naturaleza",
      "Reservas naturales",
      "Lagos y ríos",
      "Miradores naturales",
      "Rutas al aire libre",
    ],
  },
  {
    name: "Entretenimiento",
    options: [
      "Parques temáticos",
      "Parques de atracciones",
      "Cines",
      "Teatros",
      "Conciertos",
      "Espectáculos",
      "Festivales",
      "Eventos culturales",
      "Vida nocturna",
    ],
  },
  {
    name: "Mercados y compras",
    options: [
      "Mercados tradicionales",
      "Mercados locales",
      "Mercadillos",
      "Tiendas",
      "Centros comerciales",
      "Zonas comerciales",
      "Artesanía local",
    ],
  },
  {
    name: "Aventura y actividades",
    options: [
      "Actividades de aventura",
      "Excursiones",
      "Rutas en bicicleta",
      "Actividades acuáticas",
      "Deportes de aventura",
      "Experiencias al aire libre",
    ],
  },
  {
    name: "Arquitectura y lugares emblemáticos",
    options: [
      "Arquitectura",
      "Edificios históricos",
      "Monumentos emblemáticos",
      "Plazas",
      "Barrios emblemáticos",
      "Lugares icónicos",
      "Patrimonio arquitectónico",
    ],
  },
  {
    name: "Vida local",
    options: [
      "Barrios locales",
      "Tradiciones locales",
      "Cultura popular",
      "Costumbres locales",
      "Espacios comunitarios",
      "Experiencias auténticas",
    ],
  },
  {
    name: "Ocio y entretenimiento",
    options: [
      "Actividades de ocio",
      "Juegos y experiencias recreativas",
      "Salas de juegos",
      "Actividades familiares",
      "Experiencias interactivas",
    ],
  },
  {
    name: "Ciencia y tecnología",
    options: [
      "Museos científicos",
      "Planetarios",
      "Observatorios",
      "Centros de ciencia",
      "Tecnología",
      "Innovación",
      "Espacio y astronomía",
    ],
  },
  {
    name: "Fotografía y miradores",
    options: [
      "Miradores urbanos",
      "Miradores panorámicos",
      "Lugares fotográficos",
      "Paisajes",
      "Arquitectura fotogénica",
      "Atardeceres",
    ],
  },
  {
    name: "Relax y bienestar",
    options: [
      "Spas",
      "Termas",
      "Balnearios",
      "Jardines tranquilos",
      "Espacios de relajación",
      "Centros de bienestar",
    ],
  },
  {
    name: "Familia",
    options: [
      "Actividades familiares",
      "Actividades infantiles",
      "Parques infantiles",
      "Zoológicos",
      "Acuarios",
      "Museos interactivos para niños",
    ],
  },
] as const;

export const allTravelInterests = interestCategories.flatMap((category) => category.options);

export function resolveTripInterests(
  selected: string[],
  profileInterests: string[],
  customInterests: string[],
): string[] {
  const interests = selected.length > 0 || customInterests.length > 0 ? selected : profileInterests;
  return [...new Set([...interests, ...customInterests.map((interest) => interest.trim()).filter(Boolean)])];
}
