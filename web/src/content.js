// Colores de marca (tomados de los renders del Drop 01). Se reflejan en style.css.
export const colors = {
  negro: { label: "NEGRO", hex: "#0A0A0A" },
  hueso: { label: "HUESO", hex: "#ECE8E1" },
  beige: { label: "BEIGE", hex: "#D3C4AE" },
  bordo: { label: "BORDÓ", hex: "#6B1D22" },
  topo:  { label: "GRIS TOPO", hex: "#7A7064" }
};

export const content = {
  marquee: "DROP 01 EN DESARROLLO · 10 PRODUCTOS · PRIMERA TANDA LIMITADA · SUMATE A LA LISTA DE ESPERA · ",
  hero: {
    title: "Tu promesa.\nTu fuerza.",
    alt1: "Disciplina sin excusas.",
    alt2: "El peso de tu palabra.",
    cta: "UNIRSE"
  },
  manifest: "VOW no es ropa. Es el voto que hacés con vos mismo cuando nadie te ve. Es la disciplina cruda, la obsesión por el progreso y la negativa a ser uno más. Entrenamos para construir, no para figurar. Esta es tu promesa.",
  drop: {
    kicker: "DROP 01 // EN DESARROLLO",
    title: "Lo que viene",
    disclaimer: "Renders de desarrollo. El producto final puede variar.",
    lineupTitle: "Line-up de lanzamiento",
    status: {
      preview: "PREVIEW",
      dev: "EN DESARROLLO",
      featured: "DESTACADO"
    }
  },
  // Line-up del lanzamiento. Solo los que tienen `images` muestran diseño;
  // el resto NO tiene diseño definido todavía: no inventar visuales para ellos.
  products: [
    {
      id: "01", name: "Remera oversize", spec: "100% algodón 250 g · Hombro caído",
      colors: ["beige", "negro", "bordo"],
      images: { src: "/images/drop-01/01-remera-oversize", w: 1600, h: 1311 },
      alt: "Render de desarrollo de la remera oversize VOW en beige: frente con isotipo bordado en el pecho y espalda con el logo VOW y la leyenda MAT: 100% ALG. 250G // DROP 01."
    },
    {
      id: "02", name: "Hoodie oversize", spec: "Algodón 400 g · Corte boxy · Capucha sin cordones",
      colors: ["beige", "negro", "topo"],
      images: { src: "/images/drop-01/02-hoodie-oversize", w: 1600, h: 1311 },
      alt: "Render de desarrollo del hoodie oversize VOW en beige: frente con isotipo y bolsillo canguro, espalda con VOW, COTTON 400 GSM // DROP 01, HONOR THE VOW y BOUND BY DISCIPLINE."
    },
    {
      id: "03", name: "Camiseta deportiva", spec: "Dry-fit transpirable · Corte atlético",
      colors: ["negro", "bordo", "hueso"],
      images: { src: "/images/drop-01/03-camiseta-deportiva", w: 1600, h: 893 },
      alt: "Render de desarrollo de la camiseta deportiva VOW negra con cuello bordó: isotipo hueso en el frente y logo VOW grande en la espalda."
    },
    { id: "04", name: "Short oversize urbano", spec: "Malla liviana · Largo a la rodilla" },
    { id: "05", name: "Calza corta push-up", spec: "Nylon/spandex · Tiro alto" },
    { id: "06", name: "Calza larga push-up", spec: "Nylon/spandex · Tiro alto" },
    { id: "07", name: "Straps de levantamiento", spec: "Agarre acolchado" },
    { id: "08", name: "Muñequeras", spec: "Neopreno 7 mm · Anilla en D · Velcro heavy-duty", featured: true },
    { id: "09", name: "Medias", spec: "Caña crew · Logo tejido · Pack x3" },
    { id: "10", name: "Musculosa cut-off", spec: "Algodón peinado · Prelavada" }
  ],
  product: {
    name: "MUÑEQUERAS VOW",
    tags: ["NEOPRENO 7 MM", "ANILLA EN D", "VELCRO HEAVY-DUTY"],
    placeholder: "DISEÑO EN DESARROLLO"
  },
  form: {
    sending: "ENVIANDO...",
    submit: "ENVIAR",
    success: "SUMADO A LA LISTA DE ESPERA.",
    invalidEmail: "INGRESÁ UN EMAIL VÁLIDO.",
    rateLimited: "Probá de nuevo en un minuto",
    error: "NO PUDIMOS CONECTARNOS. REVISÁ TU CONEXIÓN Y PROBÁ DE NUEVO."
  }
};
