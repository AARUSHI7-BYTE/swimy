const poolImages: Record<string, any> = {
  bmw: require("../assets/images/Bmwpool.png"),
  pacific: require("../assets/images/Pacificsportscomplexpool.png"),
};

const fallbackImage = require("../assets/images/pool.jpg");

export function getPoolImage(imageKey: string) {
  return poolImages[imageKey] ?? fallbackImage;
}
