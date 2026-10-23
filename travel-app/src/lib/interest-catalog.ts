export const interestCategories = [
  {
    name: "Cultura e historia",
    options: ["Historia", "Monumentos", "Patrimonio histórico", "Tradiciones locales", "Arqueología", "Historia antigua", "Historia medieval", "Historia moderna", "Visitas guiadas", "Barrios históricos"],
  },
  {
    name: "Religión y patrimonio religioso",
    options: ["Iglesias", "Catedrales", "Mezquitas", "Sinagogas", "Templos", "Monasterios", "Rutas religiosas", "Arquitectura religiosa", "Lugares de peregrinación"],
  },
  {
    name: "Museos y arte",
    options: ["Museos de historia", "Museos de arte", "Museos arqueológicos", "Museos científicos", "Arte contemporáneo", "Pintura", "Escultura", "Fotografía", "Galerías de arte", "Exposiciones temporales", "Artesanía tradicional"],
  },
  {
    name: "Deportes",
    options: ["Fútbol", "Baloncesto", "Tenis", "Fórmula 1", "Automovilismo", "Ciclismo", "Atletismo", "Estadios deportivos", "Museos deportivos", "Eventos deportivos", "Senderismo", "Deportes acuáticos"],
  },
  {
    name: "Naturaleza",
    options: ["Montañas", "Playas", "Lagos", "Cascadas", "Bosques", "Parques naturales", "Jardines botánicos", "Observación de aves", "Observación de animales", "Paisajes", "Cuevas", "Desiertos"],
  },
  {
    name: "Gastronomía",
    options: ["Gastronomía local", "Mercados de comida", "Comida callejera", "Restaurantes tradicionales", "Degustaciones", "Productos regionales", "Cafeterías históricas", "Pastelería local", "Experiencias culinarias", "Talleres de cocina"],
  },
  {
    name: "Mercados y compras",
    options: ["Mercados tradicionales", "Zocos", "Artesanía", "Antigüedades", "Productos locales", "Mercados de segunda mano", "Tiendas tradicionales", "Moda", "Diseño local", "Mercados de flores"],
  },
  {
    name: "Aventura y actividades",
    options: ["Escalada", "Kayak", "Surf", "Rutas en bicicleta", "Excursiones", "Espeleología", "Deportes al aire libre", "Actividades acuáticas", "Rutas panorámicas"],
  },
  {
    name: "Arquitectura",
    options: ["Arquitectura histórica", "Arquitectura moderna", "Arquitectura contemporánea", "Palacios", "Castillos", "Fortificaciones", "Puentes históricos", "Edificios emblemáticos", "Arquitectura industrial", "Diseño urbano"],
  },
  {
    name: "Vida local",
    options: ["Barrios tradicionales", "Pueblos", "Festividades locales", "Talleres artesanales", "Mercados vecinales", "Costumbres locales", "Experiencias culturales", "Rutas a pie", "Centros históricos"],
  },
  {
    name: "Ocio y entretenimiento",
    options: ["Conciertos", "Teatros", "Ópera", "Espectáculos", "Festivales", "Parques temáticos", "Cine", "Música en directo", "Vida nocturna", "Eventos culturales"],
  },
  {
    name: "Ciencia y tecnología",
    options: ["Planetarios", "Observatorios", "Centros científicos", "Museos tecnológicos", "Exposiciones científicas", "Astronomía", "Innovación", "Ingeniería", "Centros de investigación visitables"],
  },
  {
    name: "Fotografía y miradores",
    options: ["Miradores", "Paisajes", "Fotografía urbana", "Amaneceres", "Atardeceres", "Fotografía arquitectónica", "Lugares fotogénicos", "Panorámicas", "Rutas fotográficas"],
  },
  {
    name: "Relax y bienestar",
    options: ["Jardines", "Hammams", "Balnearios", "Spas", "Baños termales", "Playas tranquilas", "Parques urbanos", "Espacios de descanso"],
  },
  {
    name: "Familia",
    options: ["Actividades infantiles", "Acuarios", "Zoológicos", "Parques", "Museos interactivos", "Experiencias educativas", "Actividades familiares"],
  },
  {
    name: "Transporte histórico",
    options: ["Trenes históricos", "Tranvías históricos", "Museos del transporte", "Ferrocarriles panorámicos", "Vehículos históricos"],
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
