const base = {
  drop_numero: 1,
  estado: "concepto",
  destacado: false,
  imagen: null,
};

export const drop01 = [
  {
    ...base,
    numero: 1,
    slug: "remera-oversize",
    nombre: "Remera oversize",
    categoria: "ropa",
    colores: ["beige", "negro", "bordó"],
    descripcion:
      "Corte boxy y hombro caído. Logo V al frente y VOW grande en la espalda con HONOR THE VOW / BOUND BY DISCIPLINE.",
  },
  {
    ...base,
    numero: 2,
    slug: "hoodie-oversize",
    nombre: "Hoodie oversize",
    categoria: "ropa",
    colores: ["beige", "negro", "gris topo"],
    descripcion:
      "Corte boxy, capucha sin cordones y bolsillo canguro. Logo V al frente y VOW grande en la espalda con HONOR THE VOW / BOUND BY DISCIPLINE.",
  },
  {
    ...base,
    numero: 3,
    slug: "remera-muscle-fit",
    nombre: "Remera muscle fit deportiva",
    categoria: "ropa",
    colores: ["negro"],
    descripcion:
      "Corte entallado, cuello redondo con tapacostura y costuras en contraste bordó. Logo V con VOW estampado en beige.",
  },
  {
    ...base,
    numero: 4,
    slug: "short-oversize-urbano",
    nombre: "Short oversize urbano",
    categoria: "ropa",
    colores: ["negro", "bordó", "hueso"],
    descripcion: "Corte holgado, liso, con cordón hueso y vivos bordó en el ruedo. VOW y logo V en beige.",
  },
  {
    ...base,
    numero: 5,
    slug: "calza-corta-push-up",
    nombre: "Calza corta push-up",
    categoria: "ropa",
    colores: ["negro"],
    descripcion: "Cintura alta y costuras push-up en contraste bordó. VOW en la cintura y en el ruedo.",
  },
  {
    ...base,
    numero: 6,
    slug: "calza-larga-push-up",
    nombre: "Calza larga push-up",
    categoria: "ropa",
    colores: ["negro"],
    descripcion:
      "Cintura alta reforzada y costuras planas en contraste bordó. VOW en la cintura y logo V con VOW en el tobillo.",
  },
  {
    ...base,
    numero: 7,
    slug: "straps-levantamiento",
    nombre: "Straps de levantamiento",
    categoria: "accesorio",
    colores: ["bordó", "beige"],
    descripcion: "Straps con almohadilla y etiqueta VOW, con tramo de color y VOW impreso. En versiones bordó y beige.",
  },
];
